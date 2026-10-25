import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/api/dist/app';
import { testIssuer } from '../helpers/issuer';
import { profileInputSchema } from '../../packages/contracts/src';
import {
  aggregateCompetencyProfile,
  profileCanonicalJson,
} from '../../packages/domain/src/competency-profile';
import {
  competencyProfileResponseSchema,
  skillsPassportResponseSchema,
} from '../../apps/web/lib/competency-profile';
let pool: Pool,
  app: INestApplication,
  issuer: Awaited<ReturnType<typeof testIssuer>>;
let owner: string,
  other: string,
  admin: string,
  reviewer: string,
  blocked: string,
  ownerId: string,
  adminId: string,
  reviewerId: string,
  blockedId: string;
let child: string,
  pathway: string,
  sharedPaths: string[],
  group: string,
  evidence: string,
  practical: string,
  enrollment: string,
  assessmentVersion: string;
const base = '/candidates/me/competency-profile';
const call = (method: 'get' | 'post' | 'put', path: string, token = owner) => {
  const api = request(app.getHttpServer());
  return api[method]('/api/v1' + path).auth(token, { type: 'bearer' });
};
const profile = async () =>
  competencyProfileResponseSchema.parse(
    (await call('get', base).expect(200)).body,
  );
async function snapshotTables(tables: string[]) {
  const result: Record<string, unknown> = {};
  for (const table of tables) {
    if (!/^[a-z_]+$/.test(table)) throw Error('Unsafe table');
    result[table] = (
      await pool.query(
        `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM ${table} t`,
      )
    ).rows[0].rows;
  }
  return result;
}
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw Error('Dedicated local test database required');
  const parsed = new URL(url);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    !parsed.pathname.endsWith('_test')
  )
    throw Error('Dedicated local _test database required');
  pool = new Pool({ connectionString: url });
  await pool.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');
  await pool.query(
    'CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const f of readdirSync('db/migrations')
    .filter((f) => f.endsWith('.sql') && f < '015')
    .sort()) {
    const bytes = readFileSync('db/migrations/' + f);
    await pool.query(bytes.toString());
    await pool.query(
      'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
      [f, createHash('sha256').update(bytes).digest('hex')],
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
  [owner, other, admin, reviewer, blocked] = (await Promise.all(
    [
      'profile-owner',
      'profile-other',
      'profile-admin',
      'profile-reviewer',
      'profile-blocked',
    ].map((x) => issuer.token(x)),
  )) as [string, string, string, string, string];
  ownerId = (await call('get', '/me')).body.id;
  await call('get', '/me', other);
  adminId = (await call('get', '/me', admin)).body.id;
  reviewerId = (await call('get', '/me', reviewer)).body.id;
  blockedId = (await call('get', '/me', blocked)).body.id;
  for (const [id, role] of [
    [adminId, 'ADMIN'],
    [reviewerId, 'ASSESSOR'],
  ])
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,$2,'PLATFORM','Synthetic profile protocol fixture')",
      [id, role],
    );
  await pool.query(
    "UPDATE user_role_assignments SET expires_at=now()-interval '1 second' WHERE user_id=$1",
    [blockedId],
  );
  for (const token of [owner, other])
    await call('put', '/candidates/me', token)
      .send({
        fullName: 'Synthetic Profile Candidate',
        countryCode: 'NG',
        state: 'Kano',
        willingToRelocate: false,
        drivingAbility: false,
      })
      .expect(200);
  const shared = (
    await pool.query(
      'SELECT competency_version_id AS id,array_agg(DISTINCT pathway_version_id ORDER BY pathway_version_id) AS paths FROM pathway_competencies GROUP BY competency_version_id HAVING count(DISTINCT pathway_version_id)>1 LIMIT 1',
    )
  ).rows[0];
  group = shared.id;
  sharedPaths = shared.paths;
  pathway = sharedPaths[0]!;
  const root = (
    await pool.query(
      "INSERT INTO child_competencies(code) VALUES('TEST_PROFILE_PROTOCOL') RETURNING id",
    )
  ).rows[0].id;
  child = (
    await pool.query(
      "INSERT INTO child_competency_versions(child_id,version,statement,proposed_method,context_kind,standards_to_validate,author_id) VALUES($1,1,'Synthetic arithmetic protocol fixture; no veterinary standard','KNOWLEDGE','TEST_ONLY','No professional standard',$2) RETURNING id",
      [root, adminId],
    )
  ).rows[0].id;
  const criterion = (
    await pool.query(
      "INSERT INTO child_criteria(child_version_id,position,statement) VALUES($1,1,'Synthetic arithmetic explanation') RETURNING id",
      [child],
    )
  ).rows[0].id;
  await pool.query('INSERT INTO child_group_mappings VALUES($1,$2)', [
    child,
    group,
  ]);
  const version = (
    await call('post', '/admin/assessments', admin)
      .send({
        code: 'TEST_PROFILE_ASSESSMENT',
        pathwayVersionId: pathway,
        title: 'Synthetic profile protocol',
        randomize: false,
      })
      .expect(201)
  ).body;
  assessmentVersion = version.id;
  const item = (
    await call('post', `/admin/assessments/${version.id}/items`, admin)
      .send({
        code: 'TEST_PROFILE_NUM',
        version: 1,
        type: 'NUMERICAL',
        prompt: 'Synthetic software fixture: 20 + 22. No veterinary benchmark.',
        method: 'KNOWLEDGE',
        difficulty: 'INTRODUCTORY',
        evidenceType: 'KNOWLEDGE_ASSESSED',
        answerKey: { value: 42 },
        groupVersionId: group,
        childVersionId: child,
        criterionIds: [criterion],
      })
      .expect(201)
  ).body;
  // Isolated protocol fixtures exercise existing approval guards, never production standards.
  const references = JSON.stringify([
    { title: 'ISOLATED SOFTWARE FIXTURE — NOT A PROFESSIONAL STANDARD' },
  ]);
  await pool.query(
    "UPDATE child_competency_versions SET validation_status='APPROVED',reviewer_id=$2,reviewed_at=now(),source_references=$3 WHERE id=$1",
    [child, reviewerId, references],
  );
  await pool.query(
    "UPDATE assessment_item_versions SET demo=false,validation_status='APPROVED',reviewer_id=$2,reviewed_at=now(),source_references=$3 WHERE id=$1",
    [item.id, reviewerId, references],
  );
  await pool.query(
    "UPDATE assessment_versions SET demo=false,status='APPROVED',reviewer_id=$2,reviewed_at=now(),source_references=$3 WHERE id=$1",
    [version.id, reviewerId, references],
  );
  for (const path of sharedPaths.slice(0, 2))
    await pool.query(
      'INSERT INTO pathway_child_requirements(pathway_version_id,child_version_id,proposed_facets) VALUES($1,$2,$3)',
      [path, child, ['KNOWLEDGE_ASSESSED', 'PRACTICALLY_VERIFIED']],
    );
  const attempt = (
    await call('post', `/assessments/${version.id}/attempts`).expect(201)
  ).body.id;
  await call('put', `/candidates/me/attempts/${attempt}/responses/${item.id}`)
    .send({ value: 42 })
    .expect(200);
  await call('post', `/candidates/me/attempts/${attempt}/submit`).expect(201);
  await call('post', `/admin/assessment-attempts/${attempt}/assign`, admin)
    .send({ assessorId: reviewerId })
    .expect(201);
  const detail = (await call('get', `/assessor/attempts/${attempt}`, reviewer))
    .body;
  evidence = detail.evidence[0].id;
  const review = (
    await call('post', `/assessor/attempts/${attempt}/reviews`, reviewer)
      .send({
        feedback: 'PRIVATE_ASSESSOR_FEEDBACK_SENTINEL',
        observations: [
          {
            rubricCriterionId: detail.items[0].rubric[0].id,
            observation: 'DEMONSTRATED',
            comment: 'PRIVATE_RUBRIC_COMMENT_SENTINEL',
          },
        ],
      })
      .expect(201)
  ).body;
  await call(
    'post',
    `/admin/assessment-reviews/${review.id}/moderations`,
    admin,
  )
    .send({ outcome: 'CONFIRMED', reason: 'PRIVATE_MODERATION_SENTINEL' })
    .expect(201);
  await call('post', `/assessor/evidence/${evidence}/reviews`, reviewer)
    .send({
      outcome: 'VERIFIED',
      reason: 'Synthetic arithmetic protocol verification',
    })
    .expect(201);
  await call('post', '/evidence')
    .send({
      competencyVersionId: group,
      source: 'DOCUMENT',
      summary: 'PRIVATE_DOCUMENT_SUMMARY_SENTINEL',
    })
    .expect(201);
  const training = (
    await call('post', '/admin/training/courses', admin)
      .send({
        code: 'TEST_PROFILE_LEARNING',
        content: {
          title: 'Synthetic learning fixture',
          pathwayVersionIds: [pathway],
          competencyMappings: [
            { pathwayVersionId: pathway, childVersionId: child },
          ],
          modules: [
            {
              code: 'TEST_MODULE',
              title: 'Synthetic module',
              lessons: [
                {
                  code: 'TEST_LESSON',
                  title: 'Synthetic lesson',
                  body: 'PRIVATE_LESSON_BODY_SENTINEL',
                },
              ],
            },
          ],
        },
      })
      .expect(201)
  ).body;
  await call(
    'post',
    `/admin/training/versions/${training.courseVersionId}/release-demo`,
    admin,
  ).expect(201);
  enrollment = (
    await call(
      'post',
      `/training/versions/${training.courseVersionId}/enrollments`,
    ).expect(201)
  ).body.id;
  const course = (
    await call('get', `/training/versions/${training.courseVersionId}`)
  ).body;
  await call(
    'put',
    `/candidates/me/training/enrollments/${enrollment}/lessons/${course.modules[0].lessons[0].id}/progress`,
  )
    .send({
      commandId: randomUUID(),
      expectedRevision: 0,
      state: 'COMPLETED',
      resumePosition: 0,
    })
    .expect(200);
  practical = (
    await call('post', '/candidates/me/practical')
      .send({ pathwayVersionId: pathway, kind: 'SUPERVISED_TASK' })
      .expect(201)
  ).body.id;
  await call('put', `/candidates/me/practical/${practical}`)
    .send({
      commandId: randomUUID(),
      expectedRevision: 0,
      payload: {
        summary: 'PRIVATE_PRACTICAL_NARRATIVE_SENTINEL',
        context: { task: 'PRIVATE_FARM_CONTEXT_SENTINEL' },
        targets: [
          { childVersionId: child, requestedFacet: 'PRACTICALLY_VERIFIED' },
        ],
      },
    })
    .expect(200);
  await call('post', `/candidates/me/practical/${practical}/submit`)
    .send({ expectedRevision: 1, declaration: true })
    .expect(201);
  await call('post', `/admin/practical/${practical}/assignments`, admin)
    .send({ assessorId: reviewerId, reason: 'PRIVATE_ASSIGNMENT_SENTINEL' })
    .expect(201);
  await call('post', `/assessor/practical/${practical}/decisions`, reviewer)
    .send({
      outcome: 'DEMONSTRATED_IN_DEMO',
      rationale: 'PRIVATE_PRACTICAL_ASSESSOR_NOTE_SENTINEL',
      conflictDeclaredClear: true,
    })
    .expect(201);
  const tables = (
    await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename",
    )
  ).rows.map((t) => t.tablename);
  const before = await snapshotTables(tables);
  run('scripts/migrate.ts');
  expect(await snapshotTables(tables)).toEqual(before);
  run('scripts/migrate.ts');
  expect(await snapshotTables(tables)).toEqual(before);
}, 180000);
afterAll(async () => {
  await app?.close();
  await issuer?.close();
  await pool?.end();
});
it('preserves populated 014 data, sessions, evidence, training, private reviews and all migration checksums', async () => {
  const rows = (
    await pool.query(
      'SELECT name,checksum FROM schema_migrations ORDER BY name',
    )
  ).rows;
  expect(rows).toHaveLength(15);
  for (const row of rows)
    expect(row.checksum).toBe(
      createHash('sha256')
        .update(readFileSync('db/migrations/' + row.name))
        .digest('hex'),
    );
});
it('requires authentication and current candidate capability at every profile/passport/snapshot route', async () => {
  for (const path of [
    base,
    '/candidates/me/skills-passport',
    `${base}/competencies/${child}`,
    `${base}/pathways/${pathway}/gaps`,
    `${base}/snapshots/${randomUUID()}`,
  ]) {
    await request(app.getHttpServer())
      .get('/api/v1' + path)
      .expect(401);
    await call('get', path, blocked).expect(403);
  }
  await call('post', base + '/snapshots', blocked)
    .send({ commandId: randomUUID() })
    .expect(403);
});
it('aggregates recorded verified knowledge with provenance while practical demo and learning remain separate', async () => {
  const p = await profile();
  const c = p.competencies.find((c) => c.id === child)!;
  expect(c.highestVerifiedFacet).toBe('KNOWLEDGE_ASSESSED');
  expect(c.facets.find((f) => f.facet === 'PRACTICALLY_VERIFIED')!.state).toBe(
    'DEMO_ONLY',
  );
  expect(c.learningSourceKeys).toContain('learning:' + enrollment);
  expect(p.sources.find((s) => s.id === evidence)).toMatchObject({
    sourceVersionId: assessmentVersion,
    verificationSupported: true,
    disposition: 'VERIFIED',
  });
  expect(c.gaps.every((g) => g.determination === null)).toBe(true);
});
it('keeps group documents unconfigured without distributing their claim to child competencies', async () => {
  const p = await profile();
  const legacy = p.sources.find((s) => s.kind === 'LEGACY_GROUP')!;
  expect(legacy.groupFacet).toBe('DOCUMENT_VERIFIED');
  expect(legacy.targets).toEqual([]);
  expect(legacy.disposition).toBe('PENDING_REVIEW');
  expect(
    p.competencies
      .find((c) => c.id === child)!
      .facets.find((f) => f.facet === 'DOCUMENT_VERIFIED')!.state,
  ).toBe('NO_EVIDENCE');
});
it('reuses the same exact child/source across shared pathways and explicitly withholds context readiness', async () => {
  const p = await profile();
  expect(p.sources.filter((s) => s.id === evidence)).toHaveLength(1);
  const c = p.competencies.find((c) => c.id === child)!;
  expect(c.pathwayVersionIds).toEqual([...sharedPaths].sort());
  expect(
    c.gaps.find((g) => g.pathwayVersionId === sharedPaths[1])!.reasons,
  ).toContain('PATHWAY_CONTEXT_NOT_EVALUATED');
  const response = (
    await call('get', `${base}/pathways/${sharedPaths[1]}/gaps`).expect(200)
  ).body;
  expect(response.readiness.determination).toBeNull();
});
it('returns an explicit unavailable state for unconfigured requirements, never pass/fail or inferred readiness', async () => {
  const p = await profile();
  expect(p.readiness).toMatchObject({
    status: 'UNAVAILABLE',
    determination: null,
    certification: null,
    licensing: null,
  });
  expect(p.configurationStatus).toBe('UNCONFIGURED');
  for (const c of p.competencies)
    for (const g of c.gaps) {
      expect(g.determination).toBeNull();
      expect(g.configurationStatus).toBe('UNCONFIGURED');
      expect(g.reasons).toContain('EXPERT_REQUIREMENTS_NOT_CONFIGURED');
    }
});
it('does not expose another candidate evidence or grant assessors whole-profile access', async () => {
  const p = competencyProfileResponseSchema.parse(
    (await call('get', base, other)).body,
  );
  expect(p.sources).toEqual([]);
  expect(JSON.stringify(p)).not.toContain(evidence);
  await call('get', base, reviewer).expect(404);
  await call('get', `${base}/competencies/${randomUUID()}`).expect(404);
  await call('get', `${base}/pathways/${randomUUID()}/gaps`).expect(404);
});
it('allows only sanitized passport metadata, with no private content, reviewer identifiers or moderation data', async () => {
  const response = await call('get', '/candidates/me/skills-passport').expect(
    200,
  );
  skillsPassportResponseSchema.parse(response.body);
  const text = JSON.stringify(response.body);
  expect(text).not.toContain('PRIVATE_');
  expect(text).not.toContain(reviewerId);
  for (const key of [
    'reviewerRef',
    'decisionId',
    'verificationSupported',
    'observation',
    'rationale',
    'moderation',
    'summary',
    'accessToken',
    'sessionHandle',
  ])
    expect(text).not.toContain('"' + key + '"');
  expect(response.body.sharingEnabled).toBe(false);
  expect(response.headers['cache-control']).toContain('no-store');
});
it('derives current views without mutating evidence, decisions or their audit history', async () => {
  const tables = [
    'competency_evidence',
    'practical_review_decisions',
    'evidence_submission_versions',
    'training_lesson_progress',
    'audit_events',
  ];
  const before = await snapshotTables(tables);
  await profile();
  await call('get', '/candidates/me/skills-passport').expect(200);
  expect(await snapshotTables(tables)).toEqual(before);
});
it('rejects supplied input facts, candidate identities and invented configuration on snapshot commands', async () => {
  for (const extra of [
    { candidateId: randomUUID() },
    { input: { sources: [] } },
    { jobReady: true },
  ])
    await call('post', base + '/snapshots')
      .send({ commandId: randomUUID(), ...extra })
      .expect(422);
});
it('saves immutable, provenance-linked snapshots and verifies historical replay exactly', async () => {
  const s = (
    await call('post', base + '/snapshots')
      .send({ commandId: randomUUID() })
      .expect(201)
  ).body;
  const input = profileInputSchema.parse(s.input);
  expect(aggregateCompetencyProfile(input)).toEqual(s.result);
  expect(s.inputDigest).toBe(
    createHash('sha256').update(profileCanonicalJson(input)).digest('hex'),
  );
  expect(s.resultDigest).toBe(
    createHash('sha256').update(profileCanonicalJson(s.result)).digest('hex'),
  );
  await expect(
    pool.query(
      'UPDATE competency_profile_snapshots SET result=$2 WHERE id=$1',
      [s.id, '{}'],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query('DELETE FROM competency_profile_snapshots WHERE id=$1', [s.id]),
  ).rejects.toThrow();
  await call('get', `${base}/snapshots/${s.id}`, other).expect(404);
  await call('get', `${base}/snapshots/${s.id}`, reviewer).expect(404);
});
it('serializes duplicate snapshot commands with one immutable receipt and one canonical audit write', async () => {
  const commandId = randomUUID();
  const results = await Promise.all(
    [1, 2].map(() => call('post', base + '/snapshots').send({ commandId })),
  );
  expect(results.map((r) => r.status)).toEqual([201, 201]);
  expect(results[0]!.body.id).toBe(results[1]!.body.id);
  expect(results.some((r) => r.body.replay === true)).toBe(true);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_events WHERE resource_id=$1 AND action='competency.profile.snapshot.created'",
        [results[0]!.body.id],
      )
    ).rows[0].n,
  ).toBe(1);
});
it('rejects direct snapshot inserts with another actor, private fields, altered digests or professional awards', async () => {
  const saved = (
    await call('post', base + '/snapshots')
      .send({ commandId: randomUUID() })
      .expect(201)
  ).body;
  const row = (
    await pool.query('SELECT * FROM competency_profile_snapshots WHERE id=$1', [
      saved.id,
    ])
  ).rows[0];
  for (const change of [
    {
      actor: reviewerId,
      input: row.input_facts,
      result: row.result,
      inputDigest: row.input_digest,
    },
    {
      actor: ownerId,
      input: { ...row.input_facts, summary: 'PRIVATE_DISALLOWED_FIELD' },
      result: row.result,
      inputDigest: row.input_digest,
    },
    {
      actor: ownerId,
      input: row.input_facts,
      result: row.result,
      inputDigest: '0'.repeat(64),
    },
    {
      actor: ownerId,
      input: row.input_facts,
      result: {
        ...row.result,
        readiness: { ...row.result.readiness, determination: 'JOB_READY' },
      },
      inputDigest: row.input_digest,
    },
  ])
    await expect(
      pool.query(
        'INSERT INTO competency_profile_snapshots(candidate_id,actor_id,command_id,request_id,engine_version,evaluated_at,input_facts,result,input_digest,result_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          row.candidate_id,
          change.actor,
          randomUUID(),
          randomUUID(),
          row.engine_version,
          row.evaluated_at,
          JSON.stringify(change.input),
          JSON.stringify(change.result),
          change.inputDigest,
          row.result_digest,
        ],
      ),
    ).rejects.toThrow();
});
it('rolls back a snapshot if canonical audit recording fails', async () => {
  const commandId = randomUUID();
  await pool.query(
    "CREATE FUNCTION profile_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='competency.profile.snapshot.created' THEN RAISE EXCEPTION 'Synthetic audit unavailable'; END IF; RETURN NEW; END $$;CREATE TRIGGER profile_test_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION profile_test_audit_failure()",
  );
  try {
    await call('post', base + '/snapshots')
      .send({ commandId })
      .expect(500);
  } finally {
    await pool.query(
      'DROP TRIGGER profile_test_audit_failure ON audit_events;DROP FUNCTION profile_test_audit_failure()',
    );
  }
  expect(
    (
      await pool.query(
        'SELECT id FROM competency_profile_snapshots WHERE command_id=$1',
        [commandId],
      )
    ).rowCount,
  ).toBe(0);
});
it('keeps current source revocation fresh while a prior snapshot stays reproducible and explicitly historical', async () => {
  const before = (
    await call('post', base + '/snapshots')
      .send({ commandId: randomUUID() })
      .expect(201)
  ).body;
  await call('post', `/assessor/evidence/${evidence}/reviews`, reviewer)
    .send({
      outcome: 'REVOKED',
      reason: 'Synthetic profile protocol revocation',
    })
    .expect(201);
  const p = await profile();
  expect(
    p.competencies.find((c) => c.id === child)!.highestVerifiedFacet,
  ).toBeNull();
  expect(p.sources.find((s) => s.id === evidence)!.reasons).toContain(
    'REVOKED_EVIDENCE',
  );
  const old = (await call('get', `${base}/snapshots/${before.id}`).expect(200))
    .body;
  expect(old.historical).toBe(true);
  expect(old.result).toEqual(before.result);
  expect(old.notice).toContain('not a current passport');
});
it('preserves practical decision history and excludes a superseded receipt in current aggregation', async () => {
  const prior = (await call('get', `/candidates/me/practical/${practical}`))
    .body;
  await call('post', `/candidates/me/practical/${practical}/revisions`)
    .send({ reason: 'Synthetic replacement evidence test' })
    .expect(201);
  const p = await profile();
  const old = p.sources.find((s) => s.sourceVersionId === practical)!;
  expect(old.effective).toBe(false);
  expect(old.reasons).toContain('SUPERSEDED_EVIDENCE');
  expect(
    (await call('get', `/candidates/me/practical/${practical}`)).body.decisions,
  ).toEqual(prior.decisions);
});
it('returns consistent complete facts when a source write races a snapshot', async () => {
  const commandId = randomUUID();
  const [snap] = await Promise.all([
    call('post', base + '/snapshots').send({ commandId }),
    call('post', '/evidence').send({
      competencyVersionId: group,
      source: 'SELF_DECLARED',
      summary: 'PRIVATE_CONCURRENT_CLAIM_SENTINEL',
    }),
  ]);
  expect(snap.status).toBe(201);
  expect(
    aggregateCompetencyProfile(profileInputSchema.parse(snap.body.input)),
  ).toEqual(snap.body.result);
  expect(JSON.stringify(snap.body.input)).not.toContain('PRIVATE_');
});
it('does not truncate aggregation after the existing manifest UI cap', async () => {
  const candidate = (
    await pool.query('SELECT id FROM candidate_profiles WHERE user_id=$1', [
      ownerId,
    ])
  ).rows[0].id;
  await pool.query(
    "INSERT INTO evidence_records(candidate_id,competency_version_id,source,summary,created_by) SELECT $1,$2,'SELF_DECLARED','Synthetic history beyond manifest UI cap',$3 FROM generate_series(1,505)",
    [candidate, group, ownerId],
  );
  const p = await profile();
  expect(
    p.sources.filter((s) => s.kind === 'LEGACY_GROUP').length,
  ).toBeGreaterThan(500);
});
