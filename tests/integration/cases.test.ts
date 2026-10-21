import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/api/dist/app';
import { testIssuer } from '../helpers/issuer';
import { attemptSchema } from '../../apps/web/lib/assessment';
import { transitionFreshCowTemplate as template } from '../../apps/api/src/cases/transition-fresh-cow.content';
let app: INestApplication,
  pool: Pool,
  url: string,
  issuer: Awaited<ReturnType<typeof testIssuer>>;
let ownerToken: string,
  otherToken: string,
  adminToken: string,
  assessorToken: string;
let owner: string,
  admin: string,
  assessor: string,
  pathway: string,
  pathwayId: string,
  caseId: string,
  attempt: string;
let priorSnapshot: Record<string, unknown>,
  afterSnapshot: Record<string, unknown>;
interface Hierarchy {
  child_code: string;
  child_version_id: string;
  group_version_id: string;
  criteria: { id: string }[];
}
let hierarchy: Hierarchy[];
const api = () => request(app.getHttpServer());
const get = (p: string, t = ownerToken) =>
  api()
    .get('/api/v1' + p)
    .auth(t, { type: 'bearer' });
const post = (p: string, t = ownerToken) =>
  api()
    .post('/api/v1' + p)
    .auth(t, { type: 'bearer' });
const script = (file: string) =>
  execFileSync(process.execPath, ['--import', 'tsx', file], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
async function snapshot(tables: string[]) {
  const result: Record<string, unknown> = {};
  for (const table of tables) {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Unexpected table');
    result[table] = (
      await pool.query(
        `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM ${table} t`,
      )
    ).rows[0].rows;
  }
  return result;
}
function blueprint(code = 'DEMO_TRANSITION') {
  return {
    code,
    pathwayVersionId: pathway,
    title: template.title,
    scenario: template.scenario,
    templateReference: template.templateReference,
    sourceReferences: [],
    steps: template.steps.map((s) => {
      const h = hierarchy.find((h) => h.child_code === s.suggestedChildCode)!;
      return {
        code: s.code,
        type: s.type,
        title: s.title,
        prompt: s.prompt,
        childVersionId: h.child_version_id,
        groupVersionId: h.group_version_id,
        criteria: h.criteria.map((c, index) => ({
          criterionId: c.id,
          dimensions:
            index === 0
              ? [...s.dimensions]
              : [s.dimensions[index % s.dimensions.length]],
        })),
      };
    }),
  };
}
beforeAll(async () => {
  const configured = process.env.TEST_DATABASE_URL;
  if (!configured) throw new Error('Dedicated test DB required');
  const parsed = new URL(configured);
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    !parsed.pathname.endsWith('_test')
  )
    throw new Error('Dedicated local _test DB required');
  url = configured;
  pool = new Pool({ connectionString: url });
  issuer = await testIssuer();
  await pool.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');
  await pool.query(
    'CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const file of readdirSync('db/migrations')
    .filter((n) => n.endsWith('.sql') && n < '011')
    .sort()) {
    const sql = readFileSync('db/migrations/' + file);
    await pool.query(sql.toString());
    await pool.query(
      'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
      [file, createHash('sha256').update(sql).digest('hex')],
    );
  }
  script('scripts/seed.ts');
  app = await createApp({
    DATABASE_URL: url,
    OIDC_ISSUER: issuer.issuer,
    OIDC_JWKS_URI: issuer.issuer + '/jwks',
    OIDC_AUDIENCE: 'vetready-api',
    NODE_ENV: 'test',
    PORT: 4000,
  });
  ownerToken = await issuer.token('case-owner');
  otherToken = await issuer.token('case-other');
  adminToken = await issuer.token('case-admin');
  assessorToken = await issuer.token('case-assessor');
  owner = (await get('/me')).body.id;
  admin = (await get('/me', adminToken)).body.id;
  assessor = (await get('/me', assessorToken)).body.id;
  await get('/me', otherToken);
  for (const [id, role] of [
    [admin, 'ADMIN'],
    [assessor, 'ASSESSOR'],
  ])
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,$2,'PLATFORM','Synthetic case test role fixture')",
      [id, role],
    );
  await api()
    .put('/api/v1/candidates/me')
    .auth(ownerToken, { type: 'bearer' })
    .send({
      fullName: 'Demo Case Candidate',
      countryCode: 'NG',
      state: 'Kano',
      willingToRelocate: true,
      drivingAbility: true,
    })
    .expect(200);
  const p = (
    await pool.query(
      "SELECT v.id,p.id AS pathway_id FROM pathway_versions v JOIN pathways p ON p.id=v.pathway_id WHERE p.code='DAIRY' AND v.version=1",
    )
  ).rows[0];
  pathway = p.id;
  pathwayId = p.pathway_id;
  // Populate 010 with real prior structures: session, assessment response/evidence and resumable learning.
  await pool.query(
    "INSERT INTO browser_sessions(user_id,handle_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [owner, createHash('sha256').update(randomUUID()).digest('hex')],
  );
  const demo = (await get('/assessments')).body.find(
    (a: { pathway_version_id: string }) => a.pathway_version_id === pathway,
  );
  const oldAttempt = (
    await pool.query<{ id: string }>(
      'INSERT INTO assessment_attempts(candidate_id,assessment_version_id) SELECT id,$2 FROM candidate_profiles WHERE user_id=$1 RETURNING id',
      [owner, demo.id],
    )
  ).rows[0]!.id;
  await pool.query(
    'INSERT INTO attempt_items SELECT $1,assessment_version_id,item_version_id,1 FROM assessment_blueprint WHERE assessment_version_id=$2',
    [oldAttempt, demo.id],
  );
  const oldItem = (
    await pool.query(
      'SELECT item_version_id FROM attempt_items WHERE attempt_id=$1',
      [oldAttempt],
    )
  ).rows[0].item_version_id;
  await api()
    .put(`/api/v1/candidates/me/attempts/${oldAttempt}/responses/${oldItem}`)
    .auth(ownerToken, { type: 'bearer' })
    .send({ text: 'Synthetic prior-schema response for upgrade preservation.' })
    .expect(200);
  await post(`/candidates/me/attempts/${oldAttempt}/submit`).expect(201);
  const course = (
    await post('/admin/training/courses', adminToken)
      .send({
        code: 'DEMO_PRIOR_CASE',
        content: {
          title: 'Prior schema demo learning',
          pathwayVersionIds: [pathway],
          modules: [
            {
              code: 'MOD',
              title: 'Prior demo module',
              lessons: [
                {
                  code: 'INTRO',
                  title: 'Prior demo lesson',
                  body: 'DEMO ONLY: bookmark this text.',
                },
              ],
            },
          ],
        },
      })
      .expect(201)
  ).body;
  await post(
    `/admin/training/versions/${course.courseVersionId}/release-demo`,
    adminToken,
  ).expect(201);
  const enrollment = (
    await post(
      `/training/versions/${course.courseVersionId}/enrollments`,
    ).expect(201)
  ).body.id;
  const detail = (
    await get(`/admin/training/versions/${course.courseVersionId}`, adminToken)
  ).body;
  await api()
    .put(
      `/api/v1/candidates/me/training/enrollments/${enrollment}/lessons/${detail.modules[0].lessons[0].id}/progress`,
    )
    .auth(ownerToken, { type: 'bearer' })
    .send({
      commandId: randomUUID(),
      expectedRevision: 0,
      state: 'IN_PROGRESS',
      resumePosition: 5,
    })
    .expect(200);
  const candidate = (
    await pool.query('SELECT id FROM candidate_profiles WHERE user_id=$1', [
      owner,
    ])
  ).rows[0].id;
  const child = (
    await pool.query(
      'SELECT child_version_id FROM assessment_blueprint WHERE assessment_version_id=$1',
      [demo.id],
    )
  ).rows[0].child_version_id;
  const submission = (
    await pool.query(
      'INSERT INTO evidence_submissions(candidate_id,created_by) VALUES($1,$2) RETURNING id',
      [candidate, owner],
    )
  ).rows[0].id;
  const source = (
    await pool.query(
      "INSERT INTO evidence_submission_versions(submission_id,candidate_id,version,pathway_version_id,kind,summary,context,demo,change_actor_id,change_reason,change_request_id) VALUES($1,$2,1,$3,'SUPERVISED_TASK','DEMO submitted practical source; not verified','{\"task\":\"Synthetic fresh-cow observation\"}',true,$4,'Synthetic prior-schema practical fixture',$5) RETURNING id",
      [submission, candidate, pathway, owner, randomUUID()],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO evidence_submission_competencies VALUES($1,$2,$3,'PRACTICALLY_VERIFIED')",
    [source, candidate, child],
  );
  await pool.query(
    "SELECT transition_evidence_submission($1,$2,'DRAFT','SUBMITTED','Synthetic prior-schema practical submission',$3)",
    [source, owner, randomUUID()],
  );
  await pool.query(
    "INSERT INTO competency_evidence(candidate_id,child_version_id,source_kind,submission_version_id,facet,demo,observation,context) VALUES($1,$2,'EXTERNAL_SUBMISSION',$3,'PRACTICALLY_VERIFIED',true,'REQUIRES_REVIEW','{\"task\":\"Synthetic fresh-cow observation\"}')",
    [candidate, child, source],
  );
  const tables = (
    await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename",
    )
  ).rows.map((r) => r.tablename);
  priorSnapshot = await snapshot(tables);
  script('scripts/migrate.ts');
  afterSnapshot = await snapshot(tables);
  hierarchy = (await get(`/pathways/${pathwayId}/hierarchy`)).body;
}, 120000);
afterAll(async () => {
  await app?.close();
  await pool?.end();
  await issuer?.close();
});
it('upgrades populated 010 without changing any pre-existing session, assessment, evidence, learning or audit row', () => {
  expect(afterSnapshot).toEqual(priorSnapshot);
});
it('retains all four pathways, the shared taxonomy and inactive professional requirements', async () => {
  expect((await get('/pathways')).body).toHaveLength(4);
  expect(
    (await pool.query('SELECT count(*) FROM child_competencies')).rows[0].count,
  ).toBe('69');
  expect(
    (await pool.query('SELECT count(*) FROM competencies')).rows[0].count,
  ).toBe('47');
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM pathway_child_requirements WHERE mandatory IS NOT NULL OR validation_status<>'PROPOSED'",
      )
    ).rows[0].count,
  ).toBe('0');
});
it('protects draft content authoring with existing authentication, scope and platform RBAC', async () => {
  await api().post('/api/v1/admin/case-blueprints').send({}).expect(401);
  await post('/admin/case-blueprints').send(blueprint()).expect(403);
  await post('/admin/case-blueprints', assessorToken)
    .send(blueprint())
    .expect(403);
  await post(
    '/admin/case-blueprints',
    await issuer.token('case-admin', { scope: 'openid' }),
  )
    .send(blueprint())
    .expect(401);
  await get('/admin/case-blueprint-templates/transition-fresh-cow').expect(403);
  const t = (
    await get(
      '/admin/case-blueprint-templates/transition-fresh-cow',
      adminToken,
    ).expect(200)
  ).body;
  expect(t.steps).toHaveLength(10);
  expect(t.demo).toBe(true);
  expect(t.status).toBe('DRAFT');
});
it('creates the controlled mapped dairy case atomically without releasing it or producing evidence', async () => {
  const result = (
    await post('/admin/case-blueprints', adminToken)
      .send(blueprint())
      .expect(201)
  ).body;
  caseId = result.id;
  expect(result).toMatchObject({ status: 'DRAFT', demo: true, version: 1 });
  await get(`/case-blueprints/${caseId}`).expect(404);
  const draft = (
    await get(`/case-blueprints/${caseId}`, adminToken).expect(200)
  ).body;
  expect(draft.author_id).toBe(admin);
  expect(draft.reviewer_id).toBeNull();
  expect(draft.professional_status).toBe('DRAFT');
  expect(draft.effective_at).toBeNull();
  expect(draft.steps).toHaveLength(10);
  expect(draft.steps.map((s: { position: number }) => s.position)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  expect(
    draft.steps.flatMap((s: { rubric: { dimensions: string[] }[] }) =>
      s.rubric.flatMap((r) => r.dimensions),
    ),
  ).toContain('ECONOMIC_AWARENESS');
  expect(
    (await get('/assessments')).body.some(
      (a: { id: string }) => a.id === caseId,
    ),
  ).toBe(false);
});
it('rejects invalid competency mappings and rolls back the entire new case version including audit', async () => {
  const body = blueprint('DEMO_INVALID_CASE');
  body.steps[9]!.childVersionId = randomUUID();
  await post('/admin/case-blueprints', adminToken).send(body).expect(422);
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM assessments WHERE code='DEMO_INVALID_CASE'",
      )
    ).rows[0].count,
  ).toBe('0');
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM assessment_items WHERE code LIKE 'DEMO_INVALID_CASE%'",
      )
    ).rows[0].count,
  ).toBe('0');
});
it('releases only a complete ordered demonstration; serves the scenario and rubric without answer keys', async () => {
  await post(`/admin/assessments/${caseId}/release-demo`, adminToken).expect(
    201,
  );
  const detail = (await get(`/case-blueprints/${caseId}`).expect(200)).body;
  expect(detail.status).toBe('DEMO');
  expect(detail.source_references).toEqual([]);
  expect(JSON.stringify(detail)).not.toContain('answer_key');
  const a = (await post(`/assessments/${caseId}/attempts`).expect(201)).body;
  attempt = a.id;
  expect((await post(`/assessments/${caseId}/attempts`)).body).toEqual({
    id: attempt,
    resumed: true,
  });
  const d = (await get(`/candidates/me/attempts/${attempt}`)).body;
  expect(d.caseBlueprint.scenario).toBe(template.scenario);
  expect(attemptSchema.parse(d).caseBlueprint?.scenario).toBe(
    template.scenario,
  );
  expect(d.items.map((i: { id: string }) => i.id)).toEqual(
    detail.steps.map((s: { itemVersionId: string }) => s.itemVersionId),
  );
  expect(d.caseBlueprint.steps.map((s: { code: string }) => s.code)).toEqual(
    template.steps.map((s) => s.code),
  );
});
it('freezes delivered stage order, provenance and rubric dimension mappings at the database boundary', async () => {
  for (const sql of [
    "UPDATE case_blueprints SET scenario=scenario||' changed' WHERE assessment_version_id=$1",
    'UPDATE case_reasoning_steps SET position=position+10 WHERE assessment_version_id=$1',
    'DELETE FROM case_rubric_dimensions WHERE assessment_version_id=$1',
    "UPDATE case_blueprints SET professional_status='APPROVED' WHERE assessment_version_id=$1",
    'UPDATE assessment_versions SET randomize=true WHERE id=$1',
  ])
    await expect(pool.query(sql, [caseId])).rejects.toThrow();
  await expect(
    pool.query(
      "UPDATE assessment_versions SET demo=false,status='APPROVED' WHERE id=$1",
      [caseId],
    ),
  ).rejects.toThrow();
});
it('requires a complete case and rejects cross-owner access or mutation', async () => {
  await get(`/candidates/me/attempts/${attempt}`, otherToken).expect(404);
  await post(`/candidates/me/attempts/${attempt}/submit`, otherToken).expect(
    404,
  );
  await post(`/candidates/me/attempts/${attempt}/submit`).expect(409);
  const d = (await get(`/candidates/me/attempts/${attempt}`)).body;
  for (const i of d.items)
    await api()
      .put(`/api/v1/candidates/me/attempts/${attempt}/responses/${i.id}`)
      .auth(ownerToken, { type: 'bearer' })
      .send({
        text: 'DEMO: distinguish reported from measured findings, request evidence, test competing hypotheses, escalate safely, document uncertainty and monitor outcomes.',
      })
      .expect(200);
  await post(`/candidates/me/attempts/${attempt}/submit`).expect(201);
  const submitted = (await get(`/candidates/me/attempts/${attempt}`)).body;
  expect(submitted.evidence).toHaveLength(10);
  expect(
    submitted.evidence.every(
      (e: { status: string; facet: string; demo: boolean }) =>
        e.status === 'UNVERIFIED' && e.facet === 'CASE_ASSESSED' && e.demo,
    ),
  ).toBe(true);
});
it('retains human criterion observations and blocks demo verification even after independent moderation', async () => {
  await post(`/admin/assessment-attempts/${attempt}/assign`, adminToken)
    .send({ assessorId: assessor })
    .expect(201);
  const d = (await get(`/assessor/attempts/${attempt}`, assessorToken)).body;
  const review = (
    await post(`/assessor/attempts/${attempt}/reviews`, assessorToken)
      .send({
        feedback:
          'DEMO human review; no professional award or practical decision.',
        observations: d.items.flatMap((i: { rubric: { id: string }[] }) =>
          i.rubric.map((c) => ({
            rubricCriterionId: c.id,
            observation: 'DEMONSTRATED',
            comment: 'Synthetic demonstration observation only.',
          })),
        ),
      })
      .expect(201)
  ).body;
  await post(`/admin/assessment-reviews/${review.id}/moderations`, adminToken)
    .send({
      outcome: 'CONFIRMED',
      reason: 'Independent software demonstration moderation.',
    })
    .expect(201);
  for (const e of d.evidence)
    await post(`/assessor/evidence/${e.id}/reviews`, assessorToken)
      .send({
        outcome: 'VERIFIED',
        reason: 'Must remain blocked for demonstration content.',
      })
      .expect(409);
  const evidence = (await get(`/candidates/me/attempts/${attempt}`)).body
    .evidence;
  expect(
    evidence.every(
      (e: { status: string; facet: string }) =>
        e.status === 'UNVERIFIED' && e.facet === 'CASE_ASSESSED',
    ),
  ).toBe(true);
});
it('prepares an owner-only provenance manifest without claiming readiness, practical ability or public passport', async () => {
  const m = (await get('/candidates/me/evidence-manifest').expect(200)).body;
  expect(m.professionalReadiness).toBeNull();
  expect(m.readinessRulesActive).toBe(false);
  const claims = m.claims.filter(
    (c: { attempt_id: string }) => c.attempt_id === attempt,
  );
  expect(claims).toHaveLength(10);
  expect(
    claims.every(
      (c: {
        disposition: string;
        assessment_version_id: string;
        assessor_reviews: { assessorId: string }[];
        rubric_criterion_ids: string[];
      }) =>
        c.disposition === 'DEMO_ONLY' &&
        c.assessment_version_id === caseId &&
        c.assessor_reviews[0]?.assessorId === assessor &&
        c.rubric_criterion_ids.length > 0,
    ),
  ).toBe(true);
  await get('/candidates/me/evidence-manifest', adminToken).expect(409);
  await get('/candidates/me/evidence-manifest', otherToken).expect(409);
  await api()
    .put('/api/v1/candidates/me')
    .auth(otherToken, { type: 'bearer' })
    .send({
      fullName: 'Other Demo Candidate',
      countryCode: 'NG',
      state: 'Kaduna',
      willingToRelocate: false,
      drivingAbility: false,
    })
    .expect(200);
  expect(
    (await get('/candidates/me/evidence-manifest', otherToken).expect(200)).body
      .claims,
  ).toEqual([]);
  const gaps = (await get(`/candidates/me/pathways/${pathwayId}/gaps`)).body;
  expect(
    gaps.gaps.every((g: { state: string }) => g.state === 'UNVERIFIED'),
  ).toBe(true);
  expect(m).not.toHaveProperty('score');
  expect(m).not.toHaveProperty('certificate');
});
it('links governed training to the case without producing evidence or completing an assessment', async () => {
  const before = (await pool.query('SELECT count(*) FROM competency_evidence'))
    .rows[0].count;
  const course = (
    await post('/admin/training/courses', adminToken)
      .send({
        code: 'DEMO_CASE_LINK',
        content: {
          title: 'DEMO case preparation',
          pathwayVersionIds: [pathway],
          assessmentVersionIds: [caseId],
          modules: [
            {
              code: 'PREP',
              title: 'DEMO case preparation',
              lessons: [
                {
                  code: 'INTRO',
                  title: 'DEMO investigation introduction',
                  body: 'DEMO: review the case structure. Completion is not competence.',
                },
              ],
            },
          ],
        },
      })
      .expect(201)
  ).body;
  await post(
    `/admin/training/versions/${course.courseVersionId}/release-demo`,
    adminToken,
  ).expect(201);
  const enrollment = (
    await post(
      `/training/versions/${course.courseVersionId}/enrollments`,
    ).expect(201)
  ).body.id;
  const detail = (
    await get(`/admin/training/versions/${course.courseVersionId}`, adminToken)
  ).body;
  const progress = (
    await api()
      .put(
        `/api/v1/candidates/me/training/enrollments/${enrollment}/lessons/${detail.modules[0].lessons[0].id}/progress`,
      )
      .auth(ownerToken, { type: 'bearer' })
      .send({
        commandId: randomUUID(),
        expectedRevision: 0,
        state: 'COMPLETED',
        resumePosition: 0,
      })
      .expect(200)
  ).body;
  expect(progress.competenceVerified).toBe(false);
  expect(
    (await pool.query('SELECT count(*) FROM competency_evidence')).rows[0]
      .count,
  ).toBe(before);
});
it('creates a new draft case version without changing historical responses, items, mappings or rubric', async () => {
  const original = (await get(`/candidates/me/attempts/${attempt}`)).body;
  const next = (
    await post('/admin/case-blueprints', adminToken)
      .send(blueprint())
      .expect(201)
  ).body;
  expect(next.version).toBe(2);
  expect(next.id).not.toBe(caseId);
  expect((await get(`/candidates/me/attempts/${attempt}`)).body).toEqual(
    original,
  );
  await post(`/admin/assessments/${caseId}/retire`, adminToken).expect(201);
  await post(`/assessments/${caseId}/attempts`).expect(404);
  expect(
    (await get(`/candidates/me/attempts/${attempt}`)).body.caseBlueprint,
  ).toEqual(original.caseBlueprint);
});
it('fails closed on incomplete stage coverage and on unrelated rubric or item references', async () => {
  const id = (
    await post('/admin/case-blueprints', adminToken)
      .send(blueprint('DEMO_INCOMPLETE'))
      .expect(201)
  ).body.id;
  await pool.query(
    'DELETE FROM case_rubric_dimensions WHERE assessment_version_id=$1',
    [id],
  );
  // The release guard must reject a structurally incomplete draft even when called outside HTTP.
  await expect(
    pool.query("UPDATE assessment_versions SET status='DEMO' WHERE id=$1", [
      id,
    ]),
  ).rejects.toThrow('Complete ordered case rubric required');
  const steps = (
    await pool.query(
      'SELECT * FROM case_reasoning_steps WHERE assessment_version_id=$1 ORDER BY position',
      [id],
    )
  ).rows;
  const otherRubric = (
    await pool.query(
      'SELECT id FROM rubric_criteria WHERE item_version_id=$1',
      [steps[1].item_version_id],
    )
  ).rows[0].id;
  await expect(
    pool.query(
      "INSERT INTO case_rubric_dimensions VALUES($1,$2,$3,'COMMUNICATION')",
      [id, steps[0].item_version_id, otherRubric],
    ),
  ).rejects.toThrow();
});
it('audits case construction atomically and keeps migrations repeatable with stable checksums', async () => {
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM audit_events WHERE action='case.blueprint.created' AND resource_id=$1",
        [caseId],
      )
    ).rows[0].count,
  ).toBe('1');
  const before = (
    await pool.query('SELECT * FROM schema_migrations ORDER BY name')
  ).rows;
  script('scripts/migrate.ts');
  script('scripts/seed.ts');
  expect(
    (await pool.query('SELECT * FROM schema_migrations ORDER BY name')).rows,
  ).toEqual(before);
  expect(before).toHaveLength(11);
});

it('rolls back all case content and audit records if the canonical audit write fails', async () => {
  await pool.query(
    "CREATE FUNCTION fail_case_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='case.blueprint.created' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_case_audit_test BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_case_audit_test()",
  );
  try {
    await post('/admin/case-blueprints', adminToken)
      .send(blueprint('DEMO_AUDIT_ROLLBACK'))
      .expect(500);
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM assessments WHERE code='DEMO_AUDIT_ROLLBACK'",
        )
      ).rows[0].count,
    ).toBe('0');
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM assessment_items WHERE code LIKE 'DEMO_AUDIT_ROLLBACK%'",
        )
      ).rows[0].count,
    ).toBe('0');
  } finally {
    await pool.query(
      'DROP TRIGGER fail_case_audit_test ON audit_events;DROP FUNCTION fail_case_audit_test()',
    );
  }
});
it('serializes concurrent revisions without duplicating stage versions or crossing case snapshots', async () => {
  const responses = await Promise.all([
    post('/admin/case-blueprints', adminToken).send(
      blueprint('DEMO_CONCURRENT'),
    ),
    post('/admin/case-blueprints', adminToken).send(
      blueprint('DEMO_CONCURRENT'),
    ),
  ]);
  expect(responses.map((r) => r.status)).toEqual([201, 201]);
  expect(responses.map((r) => r.body.version).sort()).toEqual([1, 2]);
  for (const r of responses) {
    const d = (await get(`/case-blueprints/${r.body.id}`, adminToken)).body;
    expect(d.steps).toHaveLength(10);
  }
});

it('keeps a submitted supervised source explicitly unverified and traceable to its pathway', async () => {
  const m = (await get('/candidates/me/evidence-manifest').expect(200)).body;
  const receipt = m.claims.find(
    (c: { source_kind: string }) => c.source_kind === 'EXTERNAL_SUBMISSION',
  );
  expect(receipt).toMatchObject({
    facet: 'PRACTICALLY_VERIFIED',
    status: 'UNVERIFIED',
    disposition: 'DEMO_ONLY',
    pathway_version_id: pathway,
    assessment_version_id: null,
  });
  expect(receipt.submission_version_id).toBeTruthy();
  expect(receipt.assessor_reviews).toEqual([]);
  expect(receipt.verification_history).toEqual([]);
  await expect(
    pool.query("UPDATE competency_evidence SET status='VERIFIED' WHERE id=$1", [
      receipt.id,
    ]),
  ).rejects.toThrow();
});
