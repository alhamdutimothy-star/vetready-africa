import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import { execFileSync } from 'node:child_process';
import { createApp } from '../../apps/api/dist/app';
import { testIssuer } from '../helpers/issuer';
import { prepareTestDatabase } from '../helpers/database';
let app: INestApplication,
  pool: Pool,
  url: string,
  issuer: Awaited<ReturnType<typeof testIssuer>>;
let candidateToken: string,
  otherToken: string,
  adminToken: string,
  assessorToken: string;
let candidateUser: string, adminUser: string, assessorUser: string;
const attempts: string[] = [];
let assessmentId: string;
const itemIds: string[] = [];
let reviewId: string;
const api = () => request(app.getHttpServer());
const get = (path: string, token = candidateToken) =>
  api()
    .get('/api/v1' + path)
    .auth(token, { type: 'bearer' });
const post = (path: string, token = candidateToken) =>
  api()
    .post('/api/v1' + path)
    .auth(token, { type: 'bearer' });
beforeAll(async () => {
  const db = await prepareTestDatabase();
  pool = db.pool;
  url = db.url;
  issuer = await testIssuer();
  app = await createApp({
    DATABASE_URL: url,
    OIDC_ISSUER: issuer.issuer,
    OIDC_JWKS_URI: issuer.issuer + '/jwks',
    OIDC_AUDIENCE: 'vetready-api',
    NODE_ENV: 'test',
    PORT: 4000,
  });
  candidateToken = await issuer.token('phase2-candidate');
  otherToken = await issuer.token('phase2-other');
  adminToken = await issuer.token('phase2-admin');
  assessorToken = await issuer.token('phase2-assessor');
  candidateUser = (await get('/me')).body.id;
  adminUser = (await get('/me', adminToken)).body.id;
  assessorUser = (await get('/me', assessorToken)).body.id;
  await get('/me', otherToken);
  for (const [user, role] of [
    [adminUser, 'ADMIN'],
    [assessorUser, 'ASSESSOR'],
  ] as const)
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,$2,'PLATFORM','Isolated software test role fixture')",
      [user, role],
    );
  await api()
    .put('/api/v1/candidates/me')
    .auth(candidateToken, { type: 'bearer' })
    .send({
      fullName: 'Phase Two Candidate',
      countryCode: 'NG',
      state: 'Kano',
      willingToRelocate: true,
      drivingAbility: true,
      professionalSummary: 'Test profile',
    })
    .expect(200);
});
afterAll(async () => {
  await app?.close();
  await pool?.end();
  await issuer?.close();
});
it('seeds 69 versioned children, 47 reusable groups, four demo cases and unset thresholds', async () => {
  expect(
    (await pool.query('SELECT count(*) FROM child_competencies')).rows[0].count,
  ).toBe('69');
  expect(
    (await pool.query('SELECT count(*) FROM competencies')).rows[0].count,
  ).toBe('47');
  const catalog = (await get('/assessments').expect(200)).body;
  expect(catalog).toHaveLength(4);
  expect(
    catalog.every(
      (a: { demo: boolean; notice: string }) =>
        a.demo && a.notice.startsWith('DEMO CONTENT'),
    ),
  ).toBe(true);
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM pathway_child_requirements WHERE mandatory IS NOT NULL OR validation_status<>'PROPOSED'",
      )
    ).rows[0].count,
  ).toBe('0');
  const pathways = (await get('/pathways')).body;
  for (const p of pathways) {
    const h = (await get(`/pathways/${p.id}/hierarchy`).expect(200)).body;
    expect(h.length).toBeGreaterThan(12);
    expect(
      h.every(
        (r: { criteria: unknown[]; validation_status: string }) =>
          r.criteria.length > 0 && r.validation_status === 'PROPOSED',
      ),
    ).toBe(true);
  }
  const shared = (
    await pool.query(
      "SELECT count(DISTINCT child_version_id) FROM child_group_mappings m JOIN child_competency_versions v ON v.id=m.child_version_id JOIN child_competencies c ON c.id=v.child_id WHERE c.code='NUTRITION_FOUNDATIONS'",
    )
  ).rows[0].count;
  expect(shared).toBe('1');
});
it('creates and resumes one attempt for each pathway with no answer-key leakage', async () => {
  const catalog = (await get('/assessments')).body;
  for (const a of catalog) {
    const started = (await post(`/assessments/${a.id}/attempts`).expect(201))
      .body;
    attempts.push(started.id);
    expect(
      (await post(`/assessments/${a.id}/attempts`).expect(201)).body,
    ).toEqual({ id: started.id, resumed: true });
    const d = (await get(`/candidates/me/attempts/${started.id}`).expect(200))
      .body;
    expect(JSON.stringify(d)).not.toContain('answer_key');
    expect(d.items[0].child_code).toBeTruthy();
    expect(d.items[0].rubric.length).toBeGreaterThan(0);
  }
});
it('enforces attempt ownership and assignment boundaries', async () => {
  await get(`/candidates/me/attempts/${attempts[0]}`, otherToken).expect(404);
  await post(
    `/candidates/me/attempts/${attempts[0]}/submit`,
    otherToken,
  ).expect(404);
  await post('/admin/assessments').send({}).expect(403);
  await get(`/assessor/attempts/${attempts[0]}`, assessorToken).expect(404);
});
it('requires complete responses; submission creates only unverified demo evidence and preserves answers', async () => {
  for (const id of attempts) {
    await post(`/candidates/me/attempts/${id}/submit`).expect(409);
    const d = (await get(`/candidates/me/attempts/${id}`)).body;
    await api()
      .put(`/api/v1/candidates/me/attempts/${id}/responses/${d.items[0].id}`)
      .auth(candidateToken, { type: 'bearer' })
      .send({
        text: 'Request original records, investigate alternatives, explain limitations, refer safely and monitor outcome.',
      })
      .expect(200);
    await post(`/candidates/me/attempts/${id}/submit`).expect(201);
    await post(`/candidates/me/attempts/${id}/submit`).expect(201);
    await api()
      .put(`/api/v1/candidates/me/attempts/${id}/responses/${d.items[0].id}`)
      .auth(candidateToken, { type: 'bearer' })
      .send({ text: 'Changed' })
      .expect(409);
  }
  const e = (await get('/candidates/me/competency-evidence')).body;
  expect(e).toHaveLength(4);
  expect(
    e.every(
      (x: { demo: boolean; status: string; facet: string }) =>
        x.demo && x.status === 'UNVERIFIED' && x.facet === 'CASE_ASSESSED',
    ),
  ).toBe(true);
});
it('assigns a real assessor; rejects missing and wrong rubric observations', async () => {
  await post(`/admin/assessment-attempts/${attempts[0]}/assign`, adminToken)
    .send({ assessorId: candidateUser })
    .expect(403);
  await post(`/admin/assessment-attempts/${attempts[0]}/assign`, adminToken)
    .send({ assessorId: assessorUser })
    .expect(201);
  const d = (
    await get(`/assessor/attempts/${attempts[0]}`, assessorToken).expect(200)
  ).body;
  await post(`/assessor/attempts/${attempts[0]}/reviews`, assessorToken)
    .send({
      feedback: 'Test assessor feedback',
      observations: [
        {
          rubricCriterionId: d.items[0].rubric[0].id,
          observation: 'DEMONSTRATED',
          comment: 'Test criterion feedback',
        },
      ],
    })
    .expect(422);
  const review = (
    await post(`/assessor/attempts/${attempts[0]}/reviews`, assessorToken)
      .send({
        feedback: 'Structured observations in a demonstration only',
        observations: d.items.flatMap((i: { rubric: { id: string }[] }) =>
          i.rubric.map((c) => ({
            rubricCriterionId: c.id,
            observation: 'DEMONSTRATED',
            comment: 'Software test observed response',
          })),
        ),
      })
      .expect(201)
  ).body;
  reviewId = review.id;
  expect(
    (await get(`/candidates/me/attempts/${attempts[0]}`)).body.status,
  ).toBe('REVIEWED');
  expect(
    (await get('/candidates/me/competency-evidence')).body.every(
      (e: { status: string }) => e.status === 'UNVERIFIED',
    ),
  ).toBe(true);
});
it('demo evidence cannot be verified and evidence transitions are audited', async () => {
  const e = (await get(`/assessor/attempts/${attempts[0]}`, assessorToken)).body
    .evidence[0];
  await post(`/assessor/evidence/${e.id}/reviews`, assessorToken)
    .send({ outcome: 'VERIFIED', reason: 'Attempt to verify demo evidence' })
    .expect(409);
  await post(`/assessor/evidence/${e.id}/reviews`, assessorToken)
    .send({
      outcome: 'REJECTED',
      reason: 'Insufficient software demonstration evidence',
    })
    .expect(201);
  await post(`/assessor/evidence/${e.id}/reviews`, assessorToken)
    .send({ outcome: 'VERIFIED', reason: 'Cannot bypass transition safeguard' })
    .expect(409);
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM audit_events WHERE action='competency.evidence.reviewed'",
      )
    ).rows[0].count,
  ).toBe('1');
});
it('moderation requires independent staff and appeal resolutions preserve history', async () => {
  await pool.query(
    "INSERT INTO role_permissions VALUES('ASSESSOR','assessment:moderate') ON CONFLICT DO NOTHING",
  );
  await post(`/admin/assessment-reviews/${reviewId}/moderations`, assessorToken)
    .send({
      outcome: 'CONFIRMED',
      reason: 'Self moderation should be rejected',
    })
    .expect(403);
  await post(`/admin/assessment-reviews/${reviewId}/moderations`, adminToken)
    .send({
      outcome: 'CONFIRMED',
      reason: 'Independent software review recorded',
    })
    .expect(201);
  const appeal = (
    await post(`/candidates/me/attempts/${attempts[0]}/appeals`)
      .send({ reason: 'Please reconsider this demonstration feedback' })
      .expect(201)
  ).body;
  await post(`/admin/assessment-appeals/${appeal.id}/resolve`, assessorToken)
    .send({ resolution: 'Original assessor cannot resolve appeal' })
    .expect(403);
  await post(`/admin/assessment-appeals/${appeal.id}/resolve`, adminToken)
    .send({
      resolution: 'Independent review: demonstration remains unverified',
    })
    .expect(201);
  expect(
    (await get('/candidates/me/assessment-appeals')).body[0].resolution,
  ).toContain('unverified');
});
it('generates traceable gaps and immutable development-plan snapshots for all four pathways', async () => {
  const paths = (await get('/pathways')).body;
  for (const p of paths) {
    const gap = (await get(`/candidates/me/pathways/${p.id}/gaps`).expect(200))
      .body;
    expect(
      gap.gaps.every(
        (g: { state: string; missingMandatoryEvidence: unknown }) =>
          g.state === 'UNVERIFIED' && g.missingMandatoryEvidence === null,
      ),
    ).toBe(true);
    expect(gap.activities.length).toBeGreaterThan(12);
    const plan = (
      await post(`/candidates/me/pathways/${p.id}/development-plans`).expect(
        201,
      )
    ).body;
    expect(plan.id).toBeTruthy();
    expect(plan.engineVersion).toBe('gap-evidence-1');
    expect(plan).not.toHaveProperty('score');
  }
  const plans = (await get('/candidates/me/development-plans')).body;
  expect(plans).toHaveLength(4);
  const activity = plans[0].items[0];
  await post(
    `/candidates/me/development-plan-items/${activity.id}/complete`,
  ).expect(201);
  await post(
    `/candidates/me/development-plan-items/${activity.id}/complete`,
    otherToken,
  ).expect(404);
  expect(
    (await get('/candidates/me/development-plans', otherToken)).body,
  ).toEqual([]);
  await expect(
    pool.query("UPDATE development_plans SET engine_version='changed'"),
  ).rejects.toThrow('Append-only');
});
it('creates mapped objective demo items with deterministic raw correctness and no practical verification', async () => {
  const paths = (await get('/pathways')).body;
  const path = paths[0];
  const h = (await get(`/pathways/${path.id}/hierarchy`)).body.find(
    (r: { child_code: string }) => r.child_code === 'NUTRITION_FOUNDATIONS',
  );
  const assessment = (
    await post('/admin/assessments', adminToken)
      .send({
        code: 'TEST_OBJECTIVE',
        pathwayVersionId: path.version_id,
        title: 'Synthetic objective calculation and options',
        randomize: true,
      })
      .expect(201)
  ).body;
  assessmentId = assessment.id;
  const base = {
    version: 1,
    prompt: 'Synthetic software test task, not a veterinary standard.',
    method: 'KNOWLEDGE',
    difficulty: 'INTRODUCTORY',
    evidenceType: 'KNOWLEDGE_ASSESSED',
    groupVersionId: h.group_version_id,
    childVersionId: h.child_version_id,
    criterionIds: h.criteria.map((c: { id: string }) => c.id),
  };
  await post(`/admin/assessments/${assessmentId}/items`, adminToken)
    .send({
      ...base,
      code: 'TEST_BAD_MAPPING',
      type: 'NUMERICAL',
      answerKey: { value: 1 },
      childVersionId: paths[1].id,
    })
    .expect(422);
  for (const [n, item] of [
    {
      type: 'SINGLE_MCQ',
      presentation: {
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
      },
      answerKey: { selected: ['a'] },
    },
    {
      type: 'MULTIPLE_RESPONSE',
      presentation: {
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
        ],
      },
      answerKey: { selected: ['a', 'c'] },
    },
    {
      type: 'NUMERICAL',
      presentation: { units: 'synthetic units' },
      answerKey: { value: 42, tolerance: 0 },
    },
  ].entries()) {
    const result = (
      await post(`/admin/assessments/${assessmentId}/items`, adminToken)
        .send({ ...base, ...item, code: 'TEST_OBJECTIVE_' + n })
        .expect(201)
    ).body;
    itemIds.push(result.id);
  }
  await post(
    `/admin/assessments/${assessmentId}/release-demo`,
    adminToken,
  ).expect(201);
  const attempt = (
    await post(`/assessments/${assessmentId}/attempts`).expect(201)
  ).body;
  for (const [n, value] of [
    { selected: ['a'] },
    { selected: ['c', 'a'] },
    { value: 42 },
  ].entries())
    await api()
      .put(
        `/api/v1/candidates/me/attempts/${attempt.id}/responses/${itemIds[n]}`,
      )
      .auth(candidateToken, { type: 'bearer' })
      .send(value)
      .expect(200);
  await post(`/candidates/me/attempts/${attempt.id}/submit`).expect(201);
  const details = (await get(`/candidates/me/attempts/${attempt.id}`)).body;
  expect(
    details.items.every(
      (i: { objective_outcome: string }) => i.objective_outcome === 'CORRECT',
    ),
  ).toBe(true);
  expect(
    details.evidence.every(
      (e: { status: string; facet: string }) =>
        e.status === 'UNVERIFIED' && e.facet === 'KNOWLEDGE_ASSESSED',
    ),
  ).toBe(true);
  expect(details.items.map((i: { position: number }) => i.position)).toEqual([
    1, 2, 3,
  ]);
});
it('freezes delivered content and creates new assessment versions without changing historical attempts', async () => {
  await expect(
    pool.query(
      "UPDATE assessment_item_versions SET prompt='Modified original' WHERE id=$1",
      [itemIds[0]],
    ),
  ).rejects.toThrow('immutable');
  await expect(
    pool.query('DELETE FROM rubric_criteria WHERE item_version_id=$1', [
      itemIds[0],
    ]),
  ).rejects.toThrow('immutable');
  await expect(
    pool.query(
      "UPDATE candidate_responses SET response='{}' WHERE item_version_id=$1",
      [itemIds[0]],
    ),
  ).rejects.toThrow('immutable');
  const old = (
    await pool.query('SELECT * FROM assessment_versions WHERE id=$1', [
      assessmentId,
    ])
  ).rows[0];
  const next = (
    await post('/admin/assessments', adminToken)
      .send({
        code: 'TEST_OBJECTIVE',
        pathwayVersionId: old.pathway_version_id,
        title: 'New draft version',
        randomize: false,
      })
      .expect(201)
  ).body;
  expect(next.version).toBe(2);
  await post(`/admin/assessments/${assessmentId}/retire`, adminToken).expect(
    201,
  );
  await post(`/assessments/${assessmentId}/attempts`).expect(404);
  expect(
    (
      await pool.query(
        'SELECT count(*) FROM assessment_attempts WHERE assessment_version_id=$1',
        [assessmentId],
      )
    ).rows[0].count,
  ).toBe('1');
});
it('database rejects evidence source inflation and seed/migration reruns preserve results', async () => {
  const e = (await pool.query('SELECT * FROM competency_evidence LIMIT 1'))
    .rows[0];
  await expect(
    pool.query(
      "UPDATE competency_evidence SET facet='PRACTICALLY_VERIFIED' WHERE id=$1",
      [e.id],
    ),
  ).rejects.toThrow('provenance');
  await expect(
    pool.query("UPDATE competency_evidence SET status='VERIFIED' WHERE id=$1", [
      e.id,
    ]),
  ).rejects.toThrow();
  const count = (await pool.query('SELECT count(*) FROM assessment_attempts'))
    .rows[0].count;
  for (const script of ['scripts/migrate.ts', 'scripts/seed.ts'])
    execFileSync(process.execPath, ['--import', 'tsx', script], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  expect(
    (await pool.query('SELECT count(*) FROM assessment_attempts')).rows[0]
      .count,
  ).toBe(count);
  const manifest = readdirSync('db/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({
      name,
      checksum: createHash('sha256')
        .update(readFileSync(`db/migrations/${name}`))
        .digest('hex'),
    }));
  expect(
    (
      await pool.query(
        'SELECT name,checksum FROM schema_migrations ORDER BY name',
      )
    ).rows,
  ).toEqual(manifest);
});
it('role-specific requirements reuse child evidence and cannot reference another pathway', async () => {
  const p = (await get('/pathways')).body[0];
  const q = (await get('/pathways')).body[1];
  const h = (await get(`/pathways/${p.id}/hierarchy`)).body[0];
  const role = (
    await pool.query<{ id: string }>(
      "INSERT INTO role_profiles(pathway_version_id,code,name) VALUES($1,'TEST_ROLE','Software test role target') RETURNING id",
      [p.version_id],
    )
  ).rows[0]!;
  await pool.query(
    'INSERT INTO role_child_requirements(role_profile_id,child_version_id,proposed_facets) VALUES($1,$2,$3)',
    [role.id, h.child_version_id, ['SIMULATION_VERIFIED']],
  );
  const gap = (
    await get(`/candidates/me/pathways/${p.id}/gaps?roleId=${role.id}`).expect(
      200,
    )
  ).body;
  expect(gap.roleProfileId).toBe(role.id);
  expect(
    gap.gaps.find(
      (g: { childVersionId: string }) =>
        g.childVersionId === h.child_version_id,
    ).missingFacets,
  ).toContain('SIMULATION_VERIFIED');
  await get(`/candidates/me/pathways/${q.id}/gaps?roleId=${role.id}`).expect(
    422,
  );
  const plan = (
    await post(
      `/candidates/me/pathways/${p.id}/development-plans?roleId=${role.id}`,
    ).expect(201)
  ).body;
  expect(
    (
      await pool.query(
        'SELECT role_profile_id FROM development_plans WHERE id=$1',
        [plan.id],
      )
    ).rows[0].role_profile_id,
  ).toBe(role.id);
});
it('verified knowledge is traceable, moderated and revocable while practical remains unverified', async () => {
  // Isolated synthetic approval fixtures test protocol behavior, NOT veterinary content or thresholds.
  const p = (await get('/pathways')).body[0];
  const h = (await get(`/pathways/${p.id}/hierarchy`)).body[0];
  const child = (
    await pool.query<{ id: string }>(
      "INSERT INTO child_competencies(code) VALUES('TEST_SYNTHETIC_KNOWLEDGE') RETURNING id",
    )
  ).rows[0]!;
  const v = (
    await pool.query<{ id: string }>(
      "INSERT INTO child_competency_versions(child_id,version,statement,proposed_method,context_kind,standards_to_validate,author_id) VALUES($1,1,'Synthetic arithmetic protocol fixture','K','TEST_ONLY','No professional standard; software fixture only',$2) RETURNING id",
      [child.id, adminUser],
    )
  ).rows[0]!;
  const criterion = (
    await pool.query<{ id: string }>(
      "INSERT INTO child_criteria(child_version_id,position,statement) VALUES($1,1,'Explain synthetic arithmetic') RETURNING id",
      [v.id],
    )
  ).rows[0]!;
  await pool.query('INSERT INTO child_group_mappings VALUES($1,$2)', [
    v.id,
    h.group_version_id,
  ]);
  const a = (
    await post('/admin/assessments', adminToken)
      .send({
        code: 'TEST_VERIFICATION',
        pathwayVersionId: p.version_id,
        title: 'Synthetic verification protocol test',
        randomize: false,
      })
      .expect(201)
  ).body;
  const item = (
    await post(`/admin/assessments/${a.id}/items`, adminToken)
      .send({
        code: 'TEST_VERIFICATION_NUM',
        version: 1,
        type: 'NUMERICAL',
        prompt: 'Software fixture: calculate 20 + 22. No veterinary benchmark.',
        method: 'KNOWLEDGE',
        difficulty: 'INTRODUCTORY',
        evidenceType: 'KNOWLEDGE_ASSESSED',
        answerKey: { value: 42 },
        groupVersionId: h.group_version_id,
        childVersionId: v.id,
        criterionIds: [criterion.id],
      })
      .expect(201)
  ).body;
  const source = JSON.stringify([
    { title: 'ISOLATED SOFTWARE FIXTURE — NOT A PROFESSIONAL STANDARD' },
  ]);
  await pool.query(
    "UPDATE child_competency_versions SET validation_status='APPROVED',reviewer_id=$2,reviewed_at=now(),source_references=$3 WHERE id=$1",
    [v.id, assessorUser, source],
  );
  await pool.query(
    "UPDATE assessment_item_versions SET demo=false,validation_status='APPROVED',reviewer_id=$2,reviewed_at=now(),source_references=$3 WHERE id=$1",
    [item.id, assessorUser, source],
  );
  await pool.query(
    "UPDATE assessment_versions SET demo=false,status='APPROVED',reviewer_id=$2,reviewed_at=now(),source_references=$3 WHERE id=$1",
    [a.id, assessorUser, source],
  );
  await pool.query(
    'INSERT INTO pathway_child_requirements(pathway_version_id,child_version_id,proposed_facets) VALUES($1,$2,$3)',
    [p.version_id, v.id, ['KNOWLEDGE_ASSESSED', 'PRACTICALLY_VERIFIED']],
  );
  const attempt = (await post(`/assessments/${a.id}/attempts`).expect(201))
    .body;
  await api()
    .put(`/api/v1/candidates/me/attempts/${attempt.id}/responses/${item.id}`)
    .auth(candidateToken, { type: 'bearer' })
    .send({ value: 42 })
    .expect(200);
  await post(`/candidates/me/attempts/${attempt.id}/submit`).expect(201);
  await post(`/admin/assessment-attempts/${attempt.id}/assign`, adminToken)
    .send({ assessorId: assessorUser })
    .expect(201);
  const detail = (await get(`/assessor/attempts/${attempt.id}`, assessorToken))
    .body;
  const review = (
    await post(`/assessor/attempts/${attempt.id}/reviews`, assessorToken)
      .send({
        feedback: 'Synthetic arithmetic response reviewed',
        observations: [
          {
            rubricCriterionId: detail.items[0].rubric[0].id,
            observation: 'DEMONSTRATED',
            comment: 'Synthetic calculation explained',
          },
        ],
      })
      .expect(201)
  ).body;
  const evidenceId = detail.evidence[0].id;
  await post(`/assessor/evidence/${evidenceId}/reviews`, assessorToken)
    .send({
      outcome: 'VERIFIED',
      reason: 'Synthetic protocol verification before moderation',
    })
    .expect(409);
  await post(`/admin/assessment-reviews/${review.id}/moderations`, adminToken)
    .send({
      outcome: 'CONFIRMED',
      reason: 'Independent synthetic protocol moderation',
    })
    .expect(201);
  await post(`/assessor/evidence/${evidenceId}/reviews`, assessorToken)
    .send({
      outcome: 'VERIFIED',
      reason: 'Synthetic knowledge protocol verified after moderation',
    })
    .expect(201);
  const gaps = (await get(`/candidates/me/pathways/${p.id}/gaps`)).body;
  expect(
    gaps.gaps.find(
      (g: { childVersionId: string }) => g.childVersionId === v.id,
    ),
  ).toMatchObject({
    state: 'PARTIALLY_DEMONSTRATED',
    missingFacets: ['PRACTICALLY_VERIFIED'],
    verifiedEvidenceIds: [evidenceId],
  });
  await post(`/assessor/evidence/${evidenceId}/reviews`, assessorToken)
    .send({ outcome: 'REVOKED', reason: 'Synthetic protocol revocation test' })
    .expect(201);
  expect(
    (await get(`/candidates/me/pathways/${p.id}/gaps`)).body.gaps.find(
      (g: { childVersionId: string }) => g.childVersionId === v.id,
    ).state,
  ).toBe('UNVERIFIED');
});

it('retiring a question preserves historical versions and blocks new use', async () => {
  const demo = (await get('/assessments')).body[0];
  const original = (await get(`/candidates/me/attempts/${attempts[0]}`)).body;
  await post(
    `/admin/assessment-items/${original.items[0].id}/retire`,
    adminToken,
  )
    .send({ reason: 'Synthetic retirement of this demonstration item' })
    .expect(201);
  const assessment = (
    await pool.query(
      'SELECT assessment_version_id FROM assessment_attempts WHERE id=$1',
      [attempts[0]],
    )
  ).rows[0];
  await post(
    `/assessments/${assessment.assessment_version_id}/attempts`,
  ).expect(409);
  expect(
    (await get(`/candidates/me/attempts/${attempts[0]}`)).body.items[0].retired,
  ).toBe(true);
  expect(demo.id).toBeTruthy();
});
