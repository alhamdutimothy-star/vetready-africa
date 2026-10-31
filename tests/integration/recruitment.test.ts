import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/api/dist/app';
import { testIssuer } from '../helpers/issuer';
import { evaluatePilotMatch } from '../../packages/domain/src/recruitment';
import { profileCanonicalJson } from '../../packages/domain/src/competency-profile';
import { matchingInputSchema } from '../../packages/contracts/src';
let pool: Pool,
  app: INestApplication,
  issuer: Awaited<ReturnType<typeof testIssuer>>;
let candidate: string,
  other: string,
  employer: string,
  outsider: string,
  admin: string,
  assessor: string;
let candidateId: string,
  employerId: string,
  adminId: string,
  org: string,
  otherOrg: string,
  job: string,
  version: string,
  application: string,
  evaluation: string,
  snapshot: string,
  pathway: string,
  pathwayRoot: string,
  child: string;
const api = (
  method: 'get' | 'post' | 'put',
  path: string,
  token = candidate,
) => {
  const client = request(app.getHttpServer());
  return client[method]('/api/v1' + path).auth(token, { type: 'bearer' });
};
const command = () => ({ commandId: randomUUID() });
let evaluationCommand: { commandId: string };
const employerPath = (path: string) => `/pilot/organizations/${org}${path}`;
const employerApp = (path: string, id = application) =>
  employerPath(`/applications/${id}${path}`);
const content = () => ({
  title: 'Controlled technical pilot',
  description:
    'Software pilot only; no professional readiness or hiring decision.',
  pathwayVersionId: pathway,
  requirements: [
    { id: randomUUID(), kind: 'PATHWAY_INTEREST', mandatory: true },
    {
      id: randomUUID(),
      kind: 'COMPETENCY_FACET',
      mandatory: false,
      childVersionId: child,
      facet: 'PRACTICALLY_VERIFIED',
    },
  ],
});
async function ownerSnapshot(token = candidate) {
  return (
    await api('post', '/candidates/me/competency-profile/snapshots', token)
      .send(command())
      .expect(201)
  ).body.id as string;
}
function apply(snapshotId = snapshot, token = candidate) {
  return api('post', `/pilot/opportunities/${job}/applications`, token).send({
    ...command(),
    jobVersionId: version,
    snapshotId,
    consent: true,
    consentVersion: 'pilot-share-1',
  });
}
async function tables(names: string[]) {
  const out: Record<string, unknown> = {};
  for (const n of names) {
    if (!/^[a-z_]+$/.test(n)) throw Error('Unsafe table');
    out[n] = (
      await pool.query(
        `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS data FROM ${n} t`,
      )
    ).rows[0].data;
  }
  return out;
}
beforeAll(async () => {
  console.info('Phase 3H fixture: preparing isolated pre-016 database');
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw Error('Dedicated test database required');
  const u = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(u.hostname) ||
    !u.pathname.endsWith('_test')
  )
    throw Error('Dedicated local _test database required');
  pool = new Pool({ connectionString: url });
  await pool.query(
    'DROP SCHEMA public CASCADE;CREATE SCHEMA public;CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const name of readdirSync('db/migrations')
    .filter((n) => n.endsWith('.sql') && n < '016')
    .sort()) {
    const b = readFileSync('db/migrations/' + name);
    await pool.query(b.toString());
    await pool.query(
      'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
      [name, createHash('sha256').update(b).digest('hex')],
    );
  }
  const script = (name: string) =>
    execFileSync(process.execPath, ['--import', 'tsx', name], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  script('scripts/seed.ts');
  console.info('Phase 3H fixture: pre-016 seed complete');
  issuer = await testIssuer();
  app = await createApp({
    DATABASE_URL: url,
    OIDC_ISSUER: issuer.issuer,
    OIDC_JWKS_URI: issuer.issuer + '/jwks',
    OIDC_AUDIENCE: 'vetready-api',
    NODE_ENV: 'test',
    PORT: 4000,
  });
  [candidate, other, employer, outsider, admin, assessor] = (await Promise.all(
    [
      'pilot-candidate',
      'pilot-other',
      'pilot-employer',
      'pilot-outsider',
      'pilot-admin',
      'pilot-assessor',
    ].map((s) => issuer.token(s)),
  )) as [string, string, string, string, string, string];
  for (const token of [candidate, other, employer, outsider, admin, assessor])
    await api('get', '/me', token).expect(200);
  candidateId = (await api('get', '/me')).body.id;
  employerId = (await api('get', '/me', employer)).body.id;
  adminId = (await api('get', '/me', admin)).body.id;
  const assessorId = (await api('get', '/me', assessor)).body.id;
  for (const [id, role] of [
    [adminId, 'ADMIN'],
    [assessorId, 'ASSESSOR'],
  ])
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,$2,'PLATFORM','Synthetic technical recruitment fixture')",
      [id, role],
    );
  for (const token of [candidate, other])
    await api('put', '/candidates/me', token)
      .send({
        fullName: 'PRIVATE_CANDIDATE_NAME',
        state: 'Kano',
        countryCode: 'NG',
        willingToRelocate: false,
        drivingAbility: false,
        professionalSummary: 'PRIVATE_PROFESSIONAL_SUMMARY',
      })
      .expect(200);
  org = (
    await api('post', '/organizations', employer)
      .send({
        displayName: 'Synthetic Pilot Employer',
        sector: 'Software protocol fixture',
        countryCode: 'NG',
      })
      .expect(201)
  ).body.id;
  otherOrg = (
    await api('post', '/organizations', outsider)
      .send({
        displayName: 'Other Synthetic Employer',
        sector: 'Software protocol fixture',
        countryCode: 'NG',
      })
      .expect(201)
  ).body.id;
  const target = (
    await pool.query(
      'SELECT m.child_version_id AS child,pc.pathway_version_id AS path,pv.pathway_id AS root FROM child_group_mappings m JOIN pathway_competencies pc ON pc.competency_version_id=m.group_version_id JOIN pathway_versions pv ON pv.id=pc.pathway_version_id ORDER BY m.child_version_id LIMIT 1',
    )
  ).rows[0];
  child = target.child;
  pathway = target.path;
  pathwayRoot = target.root;
  await api('post', `/candidates/me/pathways/${pathwayRoot}`).expect(201);
  snapshot = await ownerSnapshot();
  console.info(
    'Phase 3H fixture: identities, organisation and owner snapshot ready',
  );
  const names = (
      await pool.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename",
      )
    ).rows.map((r) => r.tablename),
    before = await tables(names);
  script('scripts/migrate.ts');
  expect(await tables(names)).toEqual(before);
  script('scripts/migrate.ts');
  expect(await tables(names)).toEqual(before);
  console.info('Phase 3H fixture: additive upgrade and rerun verified');
}, 600000);
afterAll(async () => {
  await app?.close();
  await issuer?.close();
  await pool?.end();
});
it('adds 016 without rewriting populated 001–015 data and validates every checksum', async () => {
  const rows = (
    await pool.query(
      'SELECT name,checksum FROM schema_migrations ORDER BY name',
    )
  ).rows;
  expect(rows).toHaveLength(16);
  for (const r of rows)
    expect(r.checksum).toBe(
      createHash('sha256')
        .update(readFileSync('db/migrations/' + r.name))
        .digest('hex'),
    );
  expect(
    (await pool.query('SELECT * FROM pilot16_policies')).rows[0],
  ).toMatchObject({
    professional_status: 'UNCONFIGURED',
    weighted_fit: 'UNCONFIGURED',
  });
});
it('requires authentication and denies pending employers and candidate governance', async () => {
  await request(app.getHttpServer())
    .get('/api/v1/pilot/opportunities')
    .expect(401);
  await api('post', `/pilot/admin/organizations/${org}/verification`)
    .send({
      ...command(),
      status: 'VERIFIED',
      reason: 'Synthetic employer verification',
    })
    .expect(403);
  await api('get', employerPath('/opportunities'), employer).expect(404);
});
it('requires independent platform governance and limits the pilot to one organisation', async () => {
  await api('post', `/pilot/admin/organizations/${org}/verification`, admin)
    .send({
      ...command(),
      status: 'VERIFIED',
      reason: 'Synthetic employer identity protocol review',
    })
    .expect(201);
  await api(
    'post',
    `/pilot/admin/organizations/${otherOrg}/verification`,
    admin,
  )
    .send({
      ...command(),
      status: 'VERIFIED',
      reason: 'Second employer outside bounded pilot',
    })
    .expect(409);
  await api('post', `/pilot/admin/organizations/${org}/verification`, assessor)
    .send({
      ...command(),
      status: 'VERIFIED',
      reason: 'Unprivileged assessor cannot govern',
    })
    .expect(403);
});
it('creates one immutable requirement version with idempotent command replay', async () => {
  const b = { ...command(), content: content() };
  const a = await api('post', employerPath('/opportunities'), employer)
    .send(b)
    .expect(201);
  const replay = await api('post', employerPath('/opportunities'), employer)
    .send(b)
    .expect(201);
  expect(replay.body.id).toBe(a.body.id);
  expect(replay.body.replay).toBe(true);
  job = a.body.id;
  version = a.body.versionId;
  await api('post', employerPath('/opportunities'), employer)
    .send({ ...b, content: { ...b.content, title: 'Changed command payload' } })
    .expect(409);
  await api('post', employerPath('/opportunities'), employer)
    .send({ ...command(), content: content() })
    .expect(409);
  await expect(
    pool.query("UPDATE pilot16_job_versions SET content='{}' WHERE id=$1", [
      version,
    ]),
  ).rejects.toThrow();
});
it('does not disclose drafts and prevents cross-organisation changes', async () => {
  expect(
    (await api('get', '/pilot/opportunities').expect(200)).body.jobs,
  ).toEqual([]);
  await api('get', `/pilot/opportunities/${job}`).expect(404);
  await api(
    'post',
    `/pilot/organizations/${otherOrg}/opportunities/${job}/transitions`,
    outsider,
  )
    .send({ ...command(), expectedVersion: 1, action: 'PUBLISH' })
    .expect(404);
  await api('get', employerPath('/opportunities'), outsider).expect(404);
});
it('publishes a technical-only opportunity without activating professional requirements', async () => {
  await api('post', employerPath(`/opportunities/${job}/transitions`), employer)
    .send({ ...command(), expectedVersion: 1, action: 'PUBLISH' })
    .expect(201);
  const r = await api('get', `/pilot/opportunities/${job}`).expect(200);
  expect(r.body.policy).toMatchObject({
    professionalStatus: 'UNCONFIGURED',
    weightedFit: 'UNCONFIGURED',
  });
  expect(r.headers['cache-control']).toContain('no-store');
});
it('requires explicit strict consent and an owner snapshot; no candidate impersonation', async () => {
  const otherSnapshot = await ownerSnapshot(other);
  for (const extra of [
    { consent: false },
    { candidateId: candidateId },
    { weights: { a: 1 } },
    { consentVersion: 'other' },
  ])
    await api('post', `/pilot/opportunities/${job}/applications`)
      .send({
        ...command(),
        jobVersionId: version,
        snapshotId: snapshot,
        consent: true,
        consentVersion: 'pilot-share-1',
        ...extra,
      })
      .expect(422);
  await apply(otherSnapshot).expect(404);
  expect(
    (
      await api(
        'get',
        employerPath(`/opportunities/${job}/applications`),
        employer,
      )
    ).body.applications,
  ).toEqual([]);
});
it('creates immutable consent/projection provenance and serializes duplicate applications', async () => {
  const b = {
    ...command(),
    jobVersionId: version,
    snapshotId: snapshot,
    consent: true,
    consentVersion: 'pilot-share-1',
  };
  const results = await Promise.all(
    [1, 2].map(() =>
      api('post', `/pilot/opportunities/${job}/applications`).send(b),
    ),
  );
  expect(results.map((r) => r.status)).toEqual([201, 201]);
  application = results[0]!.body.id;
  expect(results[1]!.body.id).toBe(application);
  expect(
    (
      await pool.query(
        'SELECT id FROM pilot16_consent_events WHERE application_id=$1',
        [application],
      )
    ).rowCount,
  ).toBe(1);
  expect(
    (
      await pool.query(
        'SELECT id FROM pilot16_application_events WHERE application_id=$1',
        [application],
      )
    ).rowCount,
  ).toBe(1);
  await expect(
    pool.query("UPDATE pilot16_shares SET facts='{}' WHERE application_id=$1", [
      application,
    ]),
  ).rejects.toThrow();
});
it('protects candidate applications against IDOR and employer enumeration', async () => {
  expect(
    (await api('get', '/pilot/candidates/me/applications', other)).body
      .applications,
  ).toEqual([]);
  await api(
    'post',
    `/pilot/candidates/me/applications/${application}/withdraw`,
    other,
  )
    .send(command())
    .expect(404);
  await api('post', employerApp('/evaluations'), outsider)
    .send(command())
    .expect(404);
  await api(
    'get',
    employerPath(`/opportunities/${job}/applications`),
    outsider,
  ).expect(404);
});
it('calculates reproducible technical gates and returns an explicit employer allowlist', async () => {
  evaluationCommand = command();
  evaluation = (
    await api('post', employerApp('/evaluations'), employer)
      .send(evaluationCommand)
      .expect(201)
  ).body.id;
  const r = await api(
    'get',
    employerApp(`/evaluations/${evaluation}`),
    employer,
  ).expect(200);
  expect(r.body.projection.eligibility).toBe('ELIGIBLE');
  expect(r.body.projection.fit).toMatchObject({
    status: 'UNCONFIGURED',
    score: null,
  });
  expect(r.body.projection.competencies[0].state).toBe('NOT_ESTABLISHED');
  const text = JSON.stringify(r.body);
  for (const forbidden of [
    'PRIVATE_',
    'reviewerRef',
    'moderation',
    'sourceVersionId',
    'snapshotId',
    'input',
    'accessToken',
    'professionalSummary',
  ])
    expect(text).not.toContain(forbidden);
  expect(text).not.toContain(candidateId);
  const e = (
    await pool.query('SELECT * FROM pilot16_evaluations WHERE id=$1', [
      evaluation,
    ])
  ).rows[0];
  expect(evaluatePilotMatch(matchingInputSchema.parse(e.input))).toEqual(
    e.result,
  );
  expect(
    createHash('sha256').update(profileCanonicalJson(e.input)).digest('hex'),
  ).toBe(e.input_digest);
  await expect(
    pool.query('DELETE FROM pilot16_evaluations WHERE id=$1', [evaluation]),
  ).rejects.toThrow();
});
it('serializes evaluation commands without duplicate canonical audit records', async () => {
  const b = command();
  const responses = await Promise.all(
    [1, 2].map(() =>
      api('post', employerApp('/evaluations'), employer).send(b),
    ),
  );
  expect(responses.map((r) => r.status)).toEqual([201, 201]);
  expect(responses[0]!.body.id).toBe(responses[1]!.body.id);
  expect(
    (
      await pool.query(
        "SELECT id FROM audit_events WHERE action='recruitment.pilot16_evaluations.insert' AND resource_id=$1",
        [responses[0]!.body.id],
      )
    ).rowCount,
  ).toBe(1);
});
it('uses optimistic shortlist revisions with no hiring or rejection transitions', async () => {
  const responses = await Promise.all(
    ['SHORTLIST', 'REVIEW'].map((action) =>
      api('post', employerApp('/shortlist'), employer).send({
        ...command(),
        evaluationId: evaluation,
        expectedRevision: 0,
        action,
      }),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  await api('post', employerApp('/shortlist'), employer)
    .send({
      ...command(),
      evaluationId: evaluation,
      expectedRevision: 1,
      action: 'HIRED',
    })
    .expect(422);
  expect(
    (
      await pool.query('SELECT status FROM pilot16_applications WHERE id=$1', [
        application,
      ])
    ).rows[0].status,
  ).toBe('ACTIVE');
});
it('blocks stale role grants and replays, then restores only explicitly current authority', async () => {
  await pool.query(
    "UPDATE user_role_assignments SET expires_at=now()-interval '1 second' WHERE user_id=$1 AND organization_id=$2",
    [employerId, org],
  );
  await api(
    'get',
    employerPath(`/opportunities/${job}/applications`),
    employer,
  ).expect(404);
  await api('get', employerApp(`/evaluations/${evaluation}`), employer).expect(
    404,
  );
  await api('post', employerApp('/evaluations'), employer)
    .send(evaluationCommand)
    .expect(404);
  await pool.query(
    'UPDATE user_role_assignments SET expires_at=NULL WHERE user_id=$1 AND organization_id=$2',
    [employerId, org],
  );
});
it('offboards membership without modifying authentication or granting another organisation', async () => {
  const route = `/pilot/admin/organizations/${org}/members/${employerId}/access`;
  await api('post', route, admin)
    .send({
      ...command(),
      status: 'REVOKED',
      reason: 'Synthetic member offboarding test',
    })
    .expect(201);
  await api('post', employerApp('/evaluations'), employer)
    .send(command())
    .expect(404);
  await api('post', route, admin)
    .send({
      ...command(),
      status: 'ACTIVE',
      reason: 'Synthetic membership restoration',
    })
    .expect(201);
});
it('suspends employer access immediately and preserves history', async () => {
  const route = `/pilot/admin/organizations/${org}/verification`;
  await api('post', route, admin)
    .send({
      ...command(),
      status: 'SUSPENDED',
      reason: 'Synthetic employer suspension test',
    })
    .expect(201);
  await api('get', employerApp(`/evaluations/${evaluation}`), employer).expect(
    404,
  );
  await api('get', `/pilot/opportunities/${job}`).expect(404);
  await api('post', route, admin)
    .send({
      ...command(),
      status: 'VERIFIED',
      reason: 'Synthetic employer restoration test',
    })
    .expect(201);
});
it('rolls back evaluation and idempotency receipt on audit failure', async () => {
  const b = command(),
    before = (
      await pool.query('SELECT count(*)::int AS n FROM pilot16_evaluations')
    ).rows[0].n;
  await pool.query(
    "CREATE FUNCTION pilot_test_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='recruitment.pilot16_evaluations.insert' THEN RAISE EXCEPTION 'Synthetic audit unavailable'; END IF;RETURN NEW;END $$;CREATE TRIGGER pilot_test_audit_fail BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION pilot_test_audit_fail()",
  );
  try {
    await api('post', employerApp('/evaluations'), employer)
      .send(b)
      .expect(500);
  } finally {
    await pool.query(
      'DROP TRIGGER pilot_test_audit_fail ON audit_events;DROP FUNCTION pilot_test_audit_fail()',
    );
  }
  expect(
    (await pool.query('SELECT count(*)::int AS n FROM pilot16_evaluations'))
      .rows[0].n,
  ).toBe(before);
  expect(
    (
      await pool.query('SELECT 1 FROM pilot16_commands WHERE command_id=$1', [
        b.commandId,
      ])
    ).rowCount,
  ).toBe(0);
});
it('rejects direct database attempts to activate weighted or professional results', async () => {
  const e = (
    await pool.query('SELECT * FROM pilot16_evaluations WHERE id=$1', [
      evaluation,
    ])
  ).rows[0];
  await expect(
    pool.query(
      'INSERT INTO pilot16_evaluations(application_id,actor_id,policy_id,input,result,input_digest,result_digest,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        application,
        employerId,
        e.policy_id,
        JSON.stringify(e.input),
        JSON.stringify({
          ...e.result,
          fit: { status: 'ACTIVE', score: 100, weights: { a: 1 } },
        }),
        e.input_digest,
        e.result_digest,
        randomUUID(),
      ],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query("UPDATE pilot16_policies SET weighted_fit='ACTIVE'"),
  ).rejects.toThrow();
});
it('revokes future employer access without deleting immutable consent or evaluation history', async () => {
  const commandBody = command();
  const before = (
    await pool.query(
      'SELECT count(*)::int AS n FROM pilot16_evaluations WHERE application_id=$1',
      [application],
    )
  ).rows[0].n;
  await api(
    'post',
    `/pilot/candidates/me/applications/${application}/revoke-access`,
  )
    .send(commandBody)
    .expect(201);
  await api(
    'post',
    `/pilot/candidates/me/applications/${application}/revoke-access`,
  )
    .send(commandBody)
    .expect(201);
  await api('get', employerApp(`/evaluations/${evaluation}`), employer).expect(
    404,
  );
  await api('post', employerApp('/evaluations'), employer)
    .send(command())
    .expect(404);
  expect(
    (
      await api(
        'get',
        employerPath(`/opportunities/${job}/applications`),
        employer,
      )
    ).body.applications,
  ).toEqual([]);
  expect(
    (
      await pool.query(
        'SELECT count(*)::int AS n FROM pilot16_evaluations WHERE application_id=$1',
        [application],
      )
    ).rows[0].n,
  ).toBe(before);
  expect(
    (await api('get', '/pilot/candidates/me/applications')).body
      .applications[0],
  ).toMatchObject({ status: 'ACTIVE', consent: 'REVOKED' });
});
it('keeps withdrawal distinct and allows a fresh explicitly consented application', async () => {
  await api('post', `/pilot/candidates/me/applications/${application}/withdraw`)
    .send(command())
    .expect(201);
  application = (await apply(await ownerSnapshot()).expect(201)).body.id;
  evaluation = (
    await api('post', employerApp('/evaluations'), employer)
      .send(command())
      .expect(201)
  ).body.id;
});
it('does not read or disclose changed declarations outside the job matching allowlist', async () => {
  await api('put', '/candidates/me')
    .send({
      fullName: 'PRIVATE_CANDIDATE_NAME',
      state: 'Lagos',
      countryCode: 'NG',
      willingToRelocate: true,
      drivingAbility: false,
      professionalSummary: 'PRIVATE_CHANGED_SUMMARY',
    })
    .expect(200);
  const r = await api(
    'get',
    employerApp(`/evaluations/${evaluation}`),
    employer,
  );
  expect(r.status).toBe(200);
  expect(JSON.stringify(r.body)).not.toContain('Lagos');
  await api('post', `/candidates/me/pathways/${pathwayRoot}`, other).expect(
    201,
  );
});
it('locks new job requirements to a new version and leaves old receipts immutable', async () => {
  const before = (
    await pool.query(
      'SELECT result,input_digest FROM pilot16_evaluations WHERE id=$1',
      [evaluation],
    )
  ).rows[0];
  const next = content();
  next.requirements[1]!.mandatory = true;
  const r = await api(
    'post',
    employerPath(`/opportunities/${job}/versions`),
    employer,
  )
    .send({ ...command(), expectedVersion: 1, content: next })
    .expect(201);
  expect(r.body.version).toBe(2);
  await api('get', employerApp(`/evaluations/${evaluation}`), employer).expect(
    409,
  );
  expect(
    (
      await pool.query(
        'SELECT result,input_digest FROM pilot16_evaluations WHERE id=$1',
        [evaluation],
      )
    ).rows[0],
  ).toEqual(before);
  await api('post', employerPath(`/opportunities/${job}/transitions`), employer)
    .send({ ...command(), expectedVersion: 1, action: 'PUBLISH' })
    .expect(409);
});
it('does not claim practical verification or permit a professional mandatory shortlist', async () => {
  const draft = (
    await api('post', '/candidates/me/practical', other)
      .send({ pathwayVersionId: pathway, kind: 'SUPERVISED_TASK' })
      .expect(201)
  ).body.id;
  await api('put', `/candidates/me/practical/${draft}`, other)
    .send({
      ...command(),
      expectedRevision: 0,
      payload: {
        summary: 'PRIVATE_PRACTICAL_PILOT_NARRATIVE',
        context: { task: 'PRIVATE_PRACTICAL_LOCATION' },
        targets: [
          { childVersionId: child, requestedFacet: 'PRACTICALLY_VERIFIED' },
        ],
      },
    })
    .expect(200);
  await api('post', `/candidates/me/practical/${draft}/submit`, other)
    .send({ expectedRevision: 1, declaration: true })
    .expect(201);
  await api('post', employerPath(`/opportunities/${job}/transitions`), employer)
    .send({ ...command(), expectedVersion: 2, action: 'PUBLISH' })
    .expect(201);
  version = (await api('get', `/pilot/opportunities/${job}`, other)).body
    .versionId;
  const a = (await apply(await ownerSnapshot(other), other).expect(201)).body
    .id;
  const e = (
    await api('post', employerApp('/evaluations', a), employer)
      .send(command())
      .expect(201)
  ).body.id;
  const r = (
    await api('get', employerApp(`/evaluations/${e}`, a), employer).expect(200)
  ).body;
  expect(r.projection.eligibility).toBe('UNCONFIGURED');
  expect(r.projection.competencies[0]).toMatchObject({
    facet: 'PRACTICALLY_VERIFIED',
    state: 'NOT_ESTABLISHED',
  });
  expect(JSON.stringify(r)).not.toContain('PRIVATE_');
  await api('post', employerApp('/shortlist', a), employer)
    .send({
      ...command(),
      evaluationId: e,
      expectedRevision: 0,
      action: 'SHORTLIST',
    })
    .expect(409);
  await api('post', employerApp('/shortlist', a), employer)
    .send({
      ...command(),
      evaluationId: e,
      expectedRevision: 0,
      action: 'REVIEW',
    })
    .expect(201);
  await api('post', `/admin/practical/${draft}/revoke`, admin)
    .send({ reason: 'Synthetic evidence revocation protocol' })
    .expect(201);
  await api('get', employerApp(`/evaluations/${e}`, a), employer).expect(409);
  expect(
    (
      await pool.query('SELECT result FROM pilot16_evaluations WHERE id=$1', [
        e,
      ])
    ).rows[0].result.eligibility,
  ).toBe('UNCONFIGURED');
  await api('post', `/pilot/candidates/me/applications/${a}/withdraw`, other)
    .send(command())
    .expect(201);
});
it('serializes consent withdrawal against employer reads and rejects subsequent access', async () => {
  const a = (await apply(await ownerSnapshot(other), other).expect(201)).body
    .id;
  const e = (
    await api('post', employerApp('/evaluations', a), employer)
      .send(command())
      .expect(201)
  ).body.id;
  const [read, revoke] = await Promise.all([
    api('get', employerApp(`/evaluations/${e}`, a), employer),
    api(
      'post',
      `/pilot/candidates/me/applications/${a}/revoke-access`,
      other,
    ).send(command()),
  ]);
  expect([200, 404]).toContain(read.status);
  expect(revoke.status).toBe(201);
  await api('get', employerApp(`/evaluations/${e}`, a), employer).expect(404);
  await api('post', employerApp('/shortlist', a), employer)
    .send({
      ...command(),
      evaluationId: e,
      expectedRevision: 0,
      action: 'REVIEW',
    })
    .expect(404);
});
it('requires independent governance even for a platform admin who joins the employer', async () => {
  await pool.query(
    'INSERT INTO organization_memberships(organization_id,user_id) VALUES($1,$2)',
    [org, adminId],
  );
  try {
    await api('post', `/pilot/admin/organizations/${org}/verification`, admin)
      .send({
        ...command(),
        status: 'VERIFIED',
        reason: 'Cannot independently review own employer',
      })
      .expect(403);
  } finally {
    await pool.query(
      'DELETE FROM organization_memberships WHERE organization_id=$1 AND user_id=$2',
      [org, adminId],
    );
  }
});
it('makes location declarations stale when an explicitly shared location changes', async () => {
  const c = content();
  c.requirements = [
    { id: randomUUID(), kind: 'PATHWAY_INTEREST', mandatory: true },
  ];
  const b = {
    ...command(),
    expectedVersion: 2,
    content: {
      ...c,
      requirements: [
        ...c.requirements,
        {
          id: randomUUID(),
          kind: 'LOCATION_DECLARATION',
          mandatory: true,
          state: 'Kano',
          acceptRelocation: false,
        },
      ],
    },
  };
  const revised = (
    await api('post', employerPath(`/opportunities/${job}/versions`), employer)
      .send(b)
      .expect(201)
  ).body;
  version = revised.versionId;
  await api('post', employerPath(`/opportunities/${job}/transitions`), employer)
    .send({ ...command(), expectedVersion: 3, action: 'PUBLISH' })
    .expect(201);
  await api('post', `/pilot/candidates/me/applications/${application}/withdraw`)
    .send(command())
    .expect(201);
  const a = (await apply(await ownerSnapshot()).expect(201)).body.id;
  const e = (
    await api('post', employerApp('/evaluations', a), employer)
      .send(command())
      .expect(201)
  ).body.id;
  expect(
    (
      await api('get', employerApp(`/evaluations/${e}`, a), employer).expect(
        200,
      )
    ).body.projection.eligibility,
  ).toBe('NOT_ELIGIBLE');
  await api('put', '/candidates/me')
    .send({
      fullName: 'PRIVATE_CANDIDATE_NAME',
      state: 'Kano',
      countryCode: 'NG',
      willingToRelocate: false,
      drivingAbility: false,
    })
    .expect(200);
  await api('get', employerApp(`/evaluations/${e}`, a), employer).expect(409);
  await api('post', employerApp('/shortlist', a), employer)
    .send({
      ...command(),
      evaluationId: e,
      expectedRevision: 0,
      action: 'SHORTLIST',
    })
    .expect(409);
});
it('retains foreign-key provenance and freezes job-referenced child definitions and mappings', async () => {
  const target = (
    await pool.query(
      'SELECT * FROM pilot16_requirement_targets ORDER BY job_version_id LIMIT 1',
    )
  ).rows[0];
  expect(target.child_version_id).toBe(child);
  const mapping = (
    await pool.query(
      'SELECT child_version_id,group_version_id FROM child_group_mappings WHERE child_version_id=$1 LIMIT 1',
      [child],
    )
  ).rows[0];
  await pool.query(
    'INSERT INTO child_group_mappings(child_version_id,group_version_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
    [child, mapping.group_version_id],
  );
  const criterion = (
    await pool.query(
      'SELECT position,statement FROM child_criteria WHERE child_version_id=$1 ORDER BY position LIMIT 1',
      [child],
    )
  ).rows[0];
  await pool.query(
    'INSERT INTO child_criteria(child_version_id,position,statement) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
    [child, criterion.position, criterion.statement],
  );
  await expect(
    pool.query(
      "UPDATE child_competency_versions SET statement='Altered referenced definition' WHERE id=$1",
      [child],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query('DELETE FROM child_group_mappings WHERE child_version_id=$1', [
      child,
    ]),
  ).rejects.toThrow();
  await expect(
    pool.query(
      'DELETE FROM pilot16_requirement_targets WHERE job_version_id=$1',
      [target.job_version_id],
    ),
  ).rejects.toThrow();
});
it('requires atomic owner consent, projection and audit records for direct application inserts', async () => {
  const candidateRow = (
    await pool.query('SELECT id FROM candidate_profiles WHERE user_id=$1', [
      candidateId,
    ])
  ).rows[0].id;
  const prior = (
    await pool.query(
      "SELECT id FROM pilot16_applications WHERE candidate_id=$1 AND status='ACTIVE'",
      [candidateRow],
    )
  ).rows[0];
  await api('post', `/pilot/candidates/me/applications/${prior.id}/withdraw`)
    .send(command())
    .expect(201);
  const newSnapshot = await ownerSnapshot();
  await expect(
    pool.query(
      'INSERT INTO pilot16_applications(candidate_id,job_id,job_version_id,snapshot_id,actor_id,request_id) VALUES($1,$2,$3,$4,$5,$6)',
      [candidateRow, job, version, newSnapshot, candidateId, randomUUID()],
    ),
  ).rejects.toThrow('Atomic application audit event required');
  const current = (await apply(newSnapshot).expect(201)).body.id;
  const appRecord = (
    await pool.query(
      'SELECT a.id,a.revision FROM pilot16_applications a WHERE id=$1',
      [current],
    )
  ).rows[0];
  // A current employer cannot bypass the append-only action/audit protocol with SQL.
  await expect(
    pool.query(
      "UPDATE pilot16_applications SET stage='SHORTLIST',revision=revision+1,actor_id=$2,request_id=$3 WHERE id=$1",
      [appRecord.id, employerId, randomUUID()],
    ),
  ).rejects.toThrow('Atomic application audit event required');
  expect(
    (
      await pool.query(
        'SELECT revision FROM pilot16_applications WHERE id=$1',
        [appRecord.id],
      )
    ).rows[0].revision,
  ).toBe(appRecord.revision);
});
