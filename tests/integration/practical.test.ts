import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/api/dist/app';
import { testIssuer } from '../helpers/issuer';
let pool: Pool,
  app: INestApplication,
  issuer: Awaited<ReturnType<typeof testIssuer>>;
let owner: string,
  other: string,
  admin: string,
  reviewer: string,
  unassigned: string,
  ownerId: string,
  adminId: string,
  reviewerId: string,
  unassignedId: string,
  pathway: string,
  child: string,
  foreignChild: string;
const call = (method: 'get' | 'post' | 'put', path: string, token = owner) => {
  const server = request(app.getHttpServer());
  return server[method]('/api/v1' + path).auth(token, { type: 'bearer' });
};
const base = '/candidates/me/practical';
const reason = { reason: 'Synthetic controlled lifecycle test' };
const payload = (summary = 'Synthetic practical activity account') => ({
  summary,
  context: { task: 'Synthetic supervised activity' },
  targets: [{ childVersionId: child, requestedFacet: 'PRACTICALLY_VERIFIED' }],
});
async function draft() {
  return (
    await call('post', base)
      .send({ pathwayVersionId: pathway, kind: 'SUPERVISED_TASK' })
      .expect(201)
  ).body.id as string;
}
async function saved() {
  const id = await draft();
  await call('put', `${base}/${id}`)
    .send({ commandId: randomUUID(), expectedRevision: 0, payload: payload() })
    .expect(200);
  return id;
}
async function submitted() {
  const id = await saved();
  await call('post', `${base}/${id}/submit`)
    .send({ expectedRevision: 1, declaration: true })
    .expect(201);
  return id;
}
async function assigned() {
  const id = await submitted();
  await call('post', `/admin/practical/${id}/assignments`, admin)
    .send({ ...reason, assessorId: reviewerId })
    .expect(201);
  return id;
}
const decision = {
  outcome: 'DEMONSTRATED_IN_DEMO',
  rationale: 'Synthetic private assessor observation',
  conflictDeclaredClear: true,
};
async function snapshot(tables: string[]) {
  const rows: Record<string, unknown> = {};
  for (const t of tables) {
    if (!/^[a-z_]+$/.test(t)) throw Error('Unsafe table');
    const projection =
      t === 'evidence_submission_versions'
        ? "to_jsonb(t)-ARRAY['practical','draft_revision']"
        : 'to_jsonb(t)';
    rows[t] = (
      await pool.query(
        `SELECT coalesce(jsonb_agg(${projection} ORDER BY (${projection})::text),'[]') AS rows FROM ${t} t`,
      )
    ).rows[0].rows;
  }
  return rows;
}
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw Error('Dedicated local test database required');
  const parsed = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    !parsed.pathname.endsWith('_test')
  )
    throw Error('Dedicated local _test DB required');
  pool = new Pool({ connectionString: url });
  await pool.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');
  await pool.query(
    'CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const name of readdirSync('db/migrations')
    .filter((n) => n.endsWith('.sql') && n < '014')
    .sort()) {
    const bytes = readFileSync('db/migrations/' + name);
    await pool.query(bytes.toString());
    await pool.query(
      'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
      [name, createHash('sha256').update(bytes).digest('hex')],
    );
  }
  const run = (file: string) =>
    execFileSync(process.execPath, ['--import', 'tsx', file], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  run('scripts/seed.ts');
  issuer = await testIssuer();
  app = await createApp({
    DATABASE_URL: url,
    OIDC_ISSUER: issuer.issuer,
    OIDC_JWKS_URI: issuer.issuer + '/jwks',
    OIDC_AUDIENCE: 'vetready-api',
    NODE_ENV: 'test',
    PORT: 4000,
  });
  [owner, other, admin, reviewer, unassigned] = (await Promise.all(
    [
      'practical-owner',
      'practical-other',
      'practical-admin',
      'practical-reviewer',
      'practical-unassigned',
    ].map((s) => issuer.token(s)),
  )) as [string, string, string, string, string];
  const ids: string[] = [];
  for (const t of [owner, other, admin, reviewer, unassigned])
    ids.push((await call('get', '/me', t).expect(200)).body.id);
  [ownerId, , adminId, reviewerId, unassignedId] = ids as [
    string,
    string,
    string,
    string,
    string,
  ];
  for (const [id, role] of [
    [adminId, 'ADMIN'],
    [reviewerId, 'ASSESSOR'],
    [unassignedId, 'ASSESSOR'],
  ])
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,$2,'PLATFORM','Synthetic practical fixture')",
      [id, role],
    );
  for (const t of [owner, other])
    await call('put', '/candidates/me', t)
      .send({
        fullName: 'Synthetic Practical Candidate',
        countryCode: 'NG',
        state: 'Kano',
        willingToRelocate: false,
        drivingAbility: false,
      })
      .expect(200);
  const mapping = (
    await pool.query(
      'SELECT pc.pathway_version_id,m.child_version_id FROM pathway_competencies pc JOIN child_group_mappings m ON m.group_version_id=pc.competency_version_id LIMIT 1',
    )
  ).rows[0];
  pathway = mapping.pathway_version_id;
  child = mapping.child_version_id;
  foreignChild = (
    await pool.query(
      'SELECT id FROM child_competency_versions WHERE id NOT IN (SELECT m.child_version_id FROM child_group_mappings m JOIN pathway_competencies pc ON pc.competency_version_id=m.group_version_id WHERE pc.pathway_version_id=$1) LIMIT 1',
      [pathway],
    )
  ).rows[0].id;
  // Populate the old source tables as well as identity/taxonomy before upgrading.
  const candidate = (
    await pool.query('SELECT id FROM candidate_profiles WHERE user_id=$1', [
      ownerId,
    ])
  ).rows[0].id;
  const s = (
    await pool.query(
      'INSERT INTO evidence_submissions(candidate_id,created_by) VALUES($1,$2) RETURNING id',
      [candidate, ownerId],
    )
  ).rows[0].id;
  await pool.query(
    `INSERT INTO evidence_submission_versions(submission_id,candidate_id,version,pathway_version_id,kind,summary,context,demo,change_actor_id,change_reason,change_request_id) VALUES($1,$2,1,$3,'SUPERVISED_TASK','Synthetic legacy evidence','{"task":"Legacy task"}',true,$4,'Legacy test fixture',$5)`,
    [s, candidate, pathway, ownerId, randomUUID()],
  );
  // 009 bounded trimmed legacy text; 014 must retain even padded legal records.
  await pool.query(
    "UPDATE evidence_submission_versions SET summary=repeat(' ',5000)||summary,context=jsonb_build_object('task',repeat(' ',200)||'Legacy task') WHERE submission_id=$1",
    [s],
  );
  const tables = (
    await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename",
    )
  ).rows.map((t) => t.tablename);
  const before = await snapshot(tables);
  run('scripts/migrate.ts');
  expect(await snapshot(tables)).toEqual(before);
  run('scripts/migrate.ts');
  expect(await snapshot(tables)).toEqual(before);
}, 90000);
afterAll(async () => {
  await app?.close();
  await issuer?.close();
  await pool?.end();
});
it('preserves populated 013 records and validates all migration checksums and reruns', async () => {
  const rows = (
    await pool.query(
      'SELECT name,checksum FROM schema_migrations ORDER BY name',
    )
  ).rows;
  expect(rows).toHaveLength(15);
  for (const r of rows)
    expect(r.checksum).toBe(
      createHash('sha256')
        .update(readFileSync('db/migrations/' + r.name))
        .digest('hex'),
    );
});
it('rejects anonymous and candidate staff operations', async () => {
  await request(app.getHttpServer())
    .get('/api/v1' + base)
    .expect(401);
  await call('get', '/admin/practical').expect(403);
  await call('get', '/assessor/practical').expect(403);
});
it('allows empty draft saves and preserves owner privacy', async () => {
  const id = await draft();
  await call('put', `${base}/${id}`)
    .send({
      commandId: randomUUID(),
      expectedRevision: 0,
      payload: { summary: '', context: { task: '' }, targets: [] },
    })
    .expect(200);
  await call('get', `${base}/${id}`, other).expect(404);
  expect((await call('get', base, other)).body.versions).toEqual([]);
  await call('get', `/assessor/practical/${id}`, unassigned).expect(404);
});
it('handles exact save retries and rejects command payload reuse', async () => {
  const id = await draft(),
    body = { commandId: randomUUID(), expectedRevision: 0, payload: payload() };
  await call('put', `${base}/${id}`).send(body).expect(200);
  expect(
    (await call('put', `${base}/${id}`).send(body).expect(200)).body,
  ).toMatchObject({ revision: 1, replay: true });
  await call('put', `${base}/${id}`)
    .send({ ...body, payload: payload('Changed synthetic account') })
    .expect(409);
});
it('serializes concurrent partial saves and rejects stale revisions', async () => {
  const id = await draft();
  const result = await Promise.all(
    [1, 2].map(() =>
      call('put', `${base}/${id}`).send({
        commandId: randomUUID(),
        expectedRevision: 0,
        payload: payload(),
      }),
    ),
  );
  expect(result.map((r) => r.status).sort()).toEqual([200, 409]);
});
it('rejects another owner save, forged ownership and cross-pathway mappings atomically', async () => {
  const id = await draft();
  await call('put', `${base}/${id}`, other)
    .send({ commandId: randomUUID(), expectedRevision: 0, payload: payload() })
    .expect(404);
  await call('put', `${base}/${id}`)
    .send({
      commandId: randomUUID(),
      expectedRevision: 0,
      payload: {
        ...payload(),
        targets: [
          {
            childVersionId: foreignChild,
            requestedFacet: 'PRACTICALLY_VERIFIED',
          },
        ],
      },
    })
    .expect(422);
  expect((await call('get', `${base}/${id}`)).body.version.draft_revision).toBe(
    0,
  );
  await call('post', base)
    .send({
      pathwayVersionId: pathway,
      kind: 'SUPERVISED_TASK',
      candidateId: randomUUID(),
    })
    .expect(422);
});
it('requires complete evidence, explicit declaration and current revision', async () => {
  const id = await draft();
  await call('post', `${base}/${id}/submit`)
    .send({ expectedRevision: 0, declaration: true })
    .expect(422);
  expect(
    (
      await pool.query(
        'SELECT * FROM practical_declarations WHERE version_id=$1',
        [id],
      )
    ).rowCount,
  ).toBe(0);
  await call('post', `${base}/${id}/submit`)
    .send({ expectedRevision: 0, declaration: false })
    .expect(422);
  const complete = await saved();
  await call('post', `${base}/${complete}/submit`)
    .send({ expectedRevision: 0, declaration: true })
    .expect(409);
});
it('freezes submitted content, mappings and declaration; creates only unverified demo receipts', async () => {
  const id = await submitted();
  const d = (await call('get', `${base}/${id}`)).body;
  expect(d.declaration.revision).toBe(1);
  expect(d.competenceVerified).toBe(false);
  await call('put', `${base}/${id}`)
    .send({ commandId: randomUUID(), expectedRevision: 1, payload: payload() })
    .expect(409);
  await expect(
    pool.query(
      'UPDATE evidence_submission_versions SET summary=$2 WHERE id=$1',
      [id, 'Tampered submitted content'],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query(
      'DELETE FROM evidence_submission_competencies WHERE submission_version_id=$1',
      [id],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query('DELETE FROM practical_declarations WHERE version_id=$1', [id]),
  ).rejects.toThrow();
  expect(
    (
      await pool.query(
        'SELECT status,demo FROM competency_evidence WHERE submission_version_id=$1',
        [id],
      )
    ).rows,
  ).toEqual([{ status: 'UNVERIFIED', demo: true }]);
});
it('requires active independent reviewer and explicit assignment capability', async () => {
  const id = await submitted();
  await call('post', `/admin/practical/${id}/assignments`)
    .send({ ...reason, assessorId: reviewerId })
    .expect(403);
  await call('post', `/admin/practical/${id}/assignments`, admin)
    .send({ ...reason, assessorId: ownerId })
    .expect(422);
  await call('get', `/assessor/practical/${id}`, reviewer).expect(404);
});
it('permits only currently assigned private reviews and removes access on reassignment', async () => {
  const id = await assigned();
  await call('get', `/assessor/practical/${id}`, reviewer).expect(200);
  await call('get', `/assessor/practical/${id}`, unassigned).expect(404);
  await call('post', `/admin/practical/${id}/assignments`, admin)
    .send({ ...reason, assessorId: unassignedId })
    .expect(201);
  await call('get', `/assessor/practical/${id}`, reviewer).expect(404);
  await call('post', `/assessor/practical/${id}/decisions`, reviewer)
    .send(decision)
    .expect(404);
});
it('finalizes immutable decisions and supports explicit append-only corrections', async () => {
  const id = await assigned();
  const d = (
    await call('post', `/assessor/practical/${id}/decisions`, reviewer)
      .send(decision)
      .expect(201)
  ).body;
  await expect(
    pool.query(
      'UPDATE practical_review_decisions SET rationale=$2 WHERE id=$1',
      [d.id, 'Destructive modification attempt'],
    ),
  ).rejects.toThrow();
  await call('post', `/assessor/practical/${id}/decisions`, reviewer)
    .send(decision)
    .expect(409);
  await call('post', `/assessor/practical/${id}/decisions`, reviewer)
    .send({
      ...decision,
      outcome: 'NEEDS_REVISION',
      supersedesDecisionId: d.id,
    })
    .expect(201);
  const detail = (await call('get', `${base}/${id}`)).body;
  expect(detail.decisions).toHaveLength(2);
  expect(detail.version.status).toBe('NEEDS_REVISION');
  expect(detail.decisions[0].rationale).toBe(decision.rationale);
  expect(detail.assignments).toBeUndefined();
});
it('keeps same-outcome corrected decisions immutable without rewriting lifecycle', async () => {
  const id = await assigned();
  const d = (
    await call('post', `/assessor/practical/${id}/decisions`, reviewer)
      .send(decision)
      .expect(201)
  ).body;
  await call('post', `/assessor/practical/${id}/decisions`, reviewer)
    .send({
      ...decision,
      supersedesDecisionId: d.id,
      rationale: 'Corrected synthetic narrative',
    })
    .expect(201);
  expect((await call('get', `${base}/${id}`)).body.decisions).toHaveLength(2);
});
it('supersedes submitted evidence with a traceable new draft and preserves decisions', async () => {
  const id = await assigned();
  await call('post', `/assessor/practical/${id}/decisions`, reviewer)
    .send(decision)
    .expect(201);
  const next = (
    await call('post', `${base}/${id}/revisions`).send(reason).expect(201)
  ).body;
  const old = (await call('get', `${base}/${id}`)).body;
  expect(old.version.status).toBe('SUPERSEDED');
  expect(old.decisions).toHaveLength(1);
  const d = (await call('get', `${base}/${next.id}`)).body;
  expect(d.version.previous_version_id).toBe(id);
  expect(d.declaration).toBeNull();
  expect(d.targets).toHaveLength(1);
  await call('post', `${base}/${id}/revisions`).send(reason).expect(409);
  await call('post', `/assessor/practical/${id}/decisions`, reviewer)
    .send({ ...decision, supersedesDecisionId: old.decisions[0].id })
    .expect(409);
});
it('serializes concurrent successor creation', async () => {
  const id = await submitted();
  const results = await Promise.all(
    [1, 2].map(() => call('post', `${base}/${id}/revisions`).send(reason)),
  );
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
});
it('supports withdrawal and redeclaration on a successor', async () => {
  const id = await saved();
  await call('post', `${base}/${id}/withdraw`).send(reason).expect(201);
  const n = (
    await call('post', `${base}/${id}/revisions`).send(reason).expect(201)
  ).body;
  const r = await call('post', `${base}/${n.id}/submit`)
    .send({ expectedRevision: 0, declaration: true })
    .expect(201);
  expect(r.body.status).toBe('RESUBMITTED');
});
it('revokes without destroying receipts or decisions and blocks later review writes', async () => {
  const id = await assigned();
  const d = (
    await call('post', `/assessor/practical/${id}/decisions`, reviewer)
      .send(decision)
      .expect(201)
  ).body;
  await call('post', `/admin/practical/${id}/revoke`, reviewer)
    .send(reason)
    .expect(403);
  await call('post', `/admin/practical/${id}/revoke`, admin)
    .send(reason)
    .expect(201);
  expect((await call('get', `${base}/${id}`)).body.decisions[0].id).toBe(d.id);
  await call('post', `/assessor/practical/${id}/decisions`, reviewer)
    .send({ ...decision, supersedesDecisionId: d.id })
    .expect(409);
  expect(
    (
      await pool.query(
        'SELECT status FROM competency_evidence WHERE submission_version_id=$1',
        [id],
      )
    ).rows[0].status,
  ).toBe('UNVERIFIED');
});
it('audits admin access, assignments and declarations without narrative payloads', async () => {
  const id = await assigned();
  await call('get', `/admin/practical/${id}`, admin).expect(200);
  const rows = (
    await pool.query(
      'SELECT action,metadata FROM audit_events WHERE resource_id=$1',
      [id],
    )
  ).rows;
  expect(rows.some((r) => r.action === 'practical.admin.read')).toBe(true);
  expect(
    rows.some((r) => r.action === 'practical.practical_declarations.recorded'),
  ).toBe(true);
  expect(JSON.stringify(rows)).not.toContain(
    'Synthetic practical activity account',
  );
  expect(JSON.stringify(rows)).not.toContain(decision.rationale);
});
it('returns traceable owner-only gaps while keeping readiness inactive', async () => {
  const id = await submitted();
  const r = await call('get', `${base}/gaps/${pathway}`).expect(200);
  expect(r.body.readinessRulesActive).toBe(false);
  expect(r.body.readiness).toBeNull();
  expect(
    r.body.gaps.some((g: { submissionVersionIds: string[] }) =>
      g.submissionVersionIds.includes(id),
    ),
  ).toBe(true);
  expect(
    JSON.stringify((await call('get', `${base}/gaps/${pathway}`, other)).body),
  ).not.toContain(id);
});
it('rejects direct forged status transitions, reviewer decisions and professional verification', async () => {
  const id = await submitted();
  await expect(
    pool.query(
      "UPDATE evidence_submission_versions SET status='VERIFIED',change_actor_id=$2 WHERE id=$1",
      [id, adminId],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query(
      "UPDATE competency_evidence SET status='VERIFIED' WHERE submission_version_id=$1",
      [id],
    ),
  ).rejects.toThrow();
  await call('post', `/assessor/practical/${id}/decisions`, reviewer)
    .send(decision)
    .expect(404);
});
it('rolls back state and declaration on canonical audit failure', async () => {
  const id = await saved();
  await pool.query(
    "CREATE FUNCTION practical_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='practical.practical_declarations.recorded' THEN RAISE EXCEPTION 'Synthetic audit unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER practical_test_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION practical_test_failure()",
  );
  try {
    await call('post', `${base}/${id}/submit`)
      .send({ expectedRevision: 1, declaration: true })
      .expect(500);
  } finally {
    await pool.query(
      'DROP TRIGGER practical_test_failure ON audit_events;DROP FUNCTION practical_test_failure()',
    );
  }
  expect((await call('get', `${base}/${id}`)).body.version.status).toBe(
    'DRAFT',
  );
  expect(
    (
      await pool.query(
        'SELECT * FROM practical_declarations WHERE version_id=$1',
        [id],
      )
    ).rowCount,
  ).toBe(0);
});
it('rejects expired reviewer grants at both HTTP and database boundaries', async () => {
  const id = await assigned();
  await pool.query(
    "UPDATE user_role_assignments SET expires_at=now()-interval '1 second' WHERE user_id=$1 AND role_code='ASSESSOR'",
    [reviewerId],
  );
  try {
    await call('get', `/assessor/practical/${id}`, reviewer).expect(403);
    await call('post', `/admin/practical/${id}/assignments`, admin)
      .send({ ...reason, assessorId: reviewerId })
      .expect(422);
    expect(
      (
        await pool.query(
          "SELECT practical_capable($1,'assessment:review') AS allowed",
          [reviewerId],
        )
      ).rows[0].allowed,
    ).toBe(false);
  } finally {
    await pool.query(
      "UPDATE user_role_assignments SET expires_at=NULL WHERE user_id=$1 AND role_code='ASSESSOR'",
      [reviewerId],
    );
  }
});
it('serializes competing final decisions without replacing either accepted history', async () => {
  const id = await assigned();
  const results = await Promise.all(
    [1, 2].map(() =>
      call('post', `/assessor/practical/${id}/decisions`, reviewer).send(
        decision,
      ),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect((await call('get', `${base}/${id}`)).body.decisions).toHaveLength(1);
});
it('rejects a declaration forged by another candidate at the database boundary', async () => {
  const id = await saved();
  await expect(
    pool.query(
      `INSERT INTO practical_declarations(version_id,actor_id,revision,declaration,request_id) SELECT $1,$2,1,'I confirm this account describes my own activity accurately, identifies my involvement and limitations, and contains no confidential third-party information. I understand submission is not verification or certification.',$3`,
      [id, reviewerId, randomUUID()],
    ),
  ).rejects.toThrow();
  expect(
    (
      await pool.query(
        'SELECT * FROM practical_declarations WHERE version_id=$1',
        [id],
      )
    ).rowCount,
  ).toBe(0);
});
it('permits a traceable replacement draft without reinstating a revoked predecessor', async () => {
  const id = await submitted();
  await call('post', `/admin/practical/${id}/revoke`, admin)
    .send(reason)
    .expect(201);
  const n = (
    await call('post', `${base}/${id}/revisions`).send(reason).expect(201)
  ).body;
  const old = (await call('get', `${base}/${id}`)).body;
  const next = (await call('get', `${base}/${n.id}`)).body;
  expect(old.version.status).toBe('REVOKED');
  expect(next.version.status).toBe('DRAFT');
  expect(next.version.previous_version_id).toBe(id);
  expect(next.declaration).toBeNull();
  expect(next.decisions).toEqual([]);
});
