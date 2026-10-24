import { beforeAll, afterAll, it, expect } from 'vitest';
import { Pool } from 'pg';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/api/dist/app';
import { testIssuer } from '../helpers/issuer';
import { dairyStarter } from '../../apps/api/src/dairy-learning/starter';
import { dairyCurriculumSchema } from '@vetready/contracts';
import { curriculumDetailSchema } from '../../apps/web/lib/dairy-learning';
let pool: Pool,
  app: INestApplication,
  issuer: Awaited<ReturnType<typeof testIssuer>>,
  owner: string,
  other: string,
  admin: string,
  assessor: string,
  adminId: string,
  ownerId: string,
  version: string,
  enrollment: string,
  lesson: string,
  pilot: string;
let original: ReturnType<typeof dairyCurriculumSchema.parse>;
let beforeUpgrade: unknown;
let priorTables: { tablename: string }[] | undefined;
const get = (p: string, t = owner) =>
  request(app.getHttpServer())
    .get('/api/v1' + p)
    .auth(t, { type: 'bearer' });
const post = (p: string, t = owner) =>
  request(app.getHttpServer())
    .post('/api/v1' + p)
    .auth(t, { type: 'bearer' });
const put = (p: string, t = owner) =>
  request(app.getHttpServer())
    .put('/api/v1' + p)
    .auth(t, { type: 'bearer' });
const detail = async () =>
  curriculumDetailSchema.parse(
    (await get('/candidates/me/dairy-learning/' + enrollment).expect(200)).body,
  );
const snapshot = async () => {
  const tables = (
    await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN('schema_migrations','dairy_curricula','dairy_learning_units','dairy_learning_activities') ORDER BY tablename",
    )
  ).rows;
  priorTables ??= tables;
  const data: Record<string, unknown> = {};
  for (const t of priorTables) {
    if (!/^[a-z_]+$/.test(t.tablename)) throw Error('Unsafe table');
    // Compare every pre-existing field; 014 adds only these two version columns.
    const projection =
      t.tablename === 'evidence_submission_versions'
        ? "(to_jsonb(t)-ARRAY['practical','draft_revision'])"
        : 'to_jsonb(t)';
    data[t.tablename] = (
      await pool.query(
        `SELECT coalesce(jsonb_agg(${projection} ORDER BY ${projection}::text),'[]') AS rows FROM ${t.tablename} t`,
      )
    ).rows[0].rows;
  }
  return data;
};
beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw Error('Local test database required');
  const u = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(u.hostname) ||
    !u.pathname.endsWith('_test')
  )
    throw Error('Dedicated local _test DB required');
  pool = new Pool({ connectionString: url });
  issuer = await testIssuer();
  await pool.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');
  await pool.query(
    'CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const f of readdirSync('db/migrations')
    .filter((f) => f.endsWith('.sql') && f < '013')
    .sort()) {
    const bytes = readFileSync('db/migrations/' + f);
    await pool.query(bytes.toString());
    await pool.query(
      'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
      [f, createHash('sha256').update(bytes).digest('hex')],
    );
  }
  const script = (s: string) =>
    execFileSync(process.execPath, ['--import', 'tsx', s], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  script('scripts/seed.ts');
  app = await createApp({
    DATABASE_URL: url,
    OIDC_ISSUER: issuer.issuer,
    OIDC_JWKS_URI: issuer.issuer + '/jwks',
    OIDC_AUDIENCE: 'vetready-api',
    NODE_ENV: 'test',
    PORT: 4000,
  });
  owner = await issuer.token('learning-owner');
  other = await issuer.token('learning-other');
  admin = await issuer.token('learning-admin');
  assessor = await issuer.token('learning-assessor');
  ownerId = (await get('/me')).body.id;
  await get('/me', other);
  adminId = (await get('/me', admin)).body.id;
  const aid = (await get('/me', assessor)).body.id;
  for (const [id, role] of [
    [adminId, 'ADMIN'],
    [aid, 'ASSESSOR'],
  ])
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,$2,'PLATFORM','Synthetic curriculum fixture')",
      [id, role],
    );
  await put('/candidates/me')
    .send({
      fullName: 'Synthetic Learning Candidate',
      countryCode: 'NG',
      state: 'Kano',
      willingToRelocate: false,
      drivingAbility: false,
    })
    .expect(200);
  pilot = (await post('/admin/dairy-pilot', admin).expect(201)).body.id;
  await post(`/admin/assessments/${pilot}/release-demo`, admin).expect(201);
  const legacy = (await post('/dairy-pilot/attempts').expect(201)).body.id;
  const legacyDetail = (
    await get(`/candidates/me/dairy-pilot/attempts/${legacy}`).expect(200)
  ).body;
  const item = legacyDetail.items[0];
  await put(
    `/candidates/me/dairy-pilot/attempts/${legacy}/responses/${item.id}`,
  )
    .send({
      expectedRevision: 0,
      reasoning: {
        observations: 'Synthetic prior-schema observation and uncertainty.',
      },
    })
    .expect(200);
  const oldCourse = (
    await post('/admin/training/courses', admin)
      .send({
        code: 'DEMO_BEFORE_013',
        content: {
          title: 'Prior populated learning',
          pathwayVersionIds: [
            legacyDetail.pathway_version_id ??
              (
                await pool.query(
                  'SELECT pathway_version_id FROM assessment_versions WHERE id=$1',
                  [pilot],
                )
              ).rows[0].pathway_version_id,
          ],
          modules: [
            {
              code: 'PRIOR',
              title: 'Prior module',
              lessons: [
                {
                  code: 'PRIOR',
                  title: 'Prior lesson',
                  body: 'Prior populated learning content.',
                },
              ],
            },
          ],
        },
      })
      .expect(201)
  ).body.courseVersionId;
  await post(
    `/admin/training/versions/${oldCourse}/release-demo`,
    admin,
  ).expect(201);
  const oldEnrollment = (
    await post(`/training/versions/${oldCourse}/enrollments`).expect(201)
  ).body.id;
  const oldLesson = (
    await get('/candidates/me/training/enrollments/' + oldEnrollment)
  ).body.course.modules[0].lessons[0].id;
  await put(
    `/candidates/me/training/enrollments/${oldEnrollment}/lessons/${oldLesson}/progress`,
  )
    .send({
      commandId: randomUUID(),
      expectedRevision: 0,
      state: 'IN_PROGRESS',
      resumePosition: 4,
    })
    .expect(200);
  beforeUpgrade = await snapshot();
  script('scripts/migrate.ts');
  expect(await snapshot()).toEqual(beforeUpgrade);
  script('scripts/migrate.ts');
  expect(await snapshot()).toEqual(beforeUpgrade);
  original = await dairyStarter({ pool });
}, 90000);
afterAll(async () => {
  await app?.close();
  await issuer?.close();
  await pool?.end();
});
it('upgrades populated 012 without rewriting sessions, cases, learning or audit data; migration rerun is safe', async () => {
  const rows = (
    await pool.query(
      'SELECT name,checksum FROM schema_migrations ORDER BY name',
    )
  ).rows;
  expect(rows).toHaveLength(14);
  for (const r of rows)
    expect(r.checksum).toBe(
      createHash('sha256')
        .update(readFileSync('db/migrations/' + r.name))
        .digest('hex'),
    );
});
it('rejects anonymous, candidate and assessor curriculum management', async () => {
  await request(app.getHttpServer()).get('/api/v1/dairy-learning').expect(401);
  await post('/admin/dairy-learning/starter').expect(403);
  await post('/admin/dairy-learning/starter', assessor).expect(403);
});
it('creates 17 DRAFT mapped domains and three version-bound units; draft hidden from candidates', async () => {
  const r = await post('/admin/dairy-learning', admin)
    .send(original)
    .expect(201);
  version = r.body.courseVersionId;
  expect((await get('/dairy-learning')).body).toEqual([]);
  await get('/dairy-learning/' + version).expect(404);
  const d = curriculumDetailSchema.parse(
    (await get('/admin/dairy-learning/' + version, admin).expect(200)).body,
  );
  expect(d.curriculum.domains).toHaveLength(17);
  expect(d.units).toHaveLength(3);
  expect(d.course.status).toBe('DRAFT');
  expect(
    d.units.every((u) => u.content.sources.every((s) => s.reviewerId === null)),
  ).toBe(true);
});
it('rejects mismatched domains and prerequisites atomically', async () => {
  const b = structuredClone(original);
  b.training.code = 'DEMO_INVALID_DOMAIN';
  b.domains[0]!.childVersionIds = [randomUUID()];
  await post('/admin/dairy-learning', admin).send(b).expect(422);
  expect(
    (
      await pool.query(
        "SELECT 1 FROM training_courses WHERE code='DEMO_INVALID_DOMAIN'",
      )
    ).rowCount,
  ).toBe(0);
  const c = structuredClone(original);
  c.training.code = 'DEMO_INVALID_PREREQ';
  c.units[0]!.prerequisites[0]!.childVersionId = randomUUID();
  await post('/admin/dairy-learning', admin).send(c).expect(422);
});
it('explicit demo release preserves DRAFT and no production approval endpoint or status', async () => {
  await post(`/admin/training/versions/${version}/release-demo`, admin).expect(
    201,
  );
  const d = (await get('/dairy-learning/' + version).expect(200)).body;
  expect(d.course.status).toBe('DRAFT');
  expect(d.competenceVerified).toBe(false);
  await expect(
    pool.query(
      "UPDATE training_course_versions SET status='APPROVED',change_actor_id=$2 WHERE id=$1",
      [version, adminId],
    ),
  ).rejects.toThrow();
});
it('owns enrollments and exposes prerequisites as UNVERIFIED, not failed', async () => {
  enrollment = (
    await post(`/training/versions/${version}/enrollments`).expect(201)
  ).body.id;
  const d = await detail();
  lesson = d.course.modules[0]!.lessons[0]!.id;
  expect(d.units[0]!.prerequisites[0]!.status).toBe('UNVERIFIED');
  expect(d.units[0]!.prerequisites[0]!.guidanceOnly).toBe(true);
  await get('/candidates/me/dairy-learning/' + enrollment, other).expect(404);
  expect((await get('/candidates/me/dairy-learning', other)).body).toEqual([]);
});
it('saves/resumes unscored activity with immutable revisions and idempotent command replay', async () => {
  const b = {
    commandId: randomUUID(),
    expectedRevision: 0,
    response:
      'Check missing dates and cow-group membership before inferring cause.',
  };
  await put(
    `/candidates/me/dairy-learning/${enrollment}/units/${lesson}/activity`,
  )
    .send(b)
    .expect(200);
  await put(
    `/candidates/me/dairy-learning/${enrollment}/units/${lesson}/activity`,
  )
    .send(b)
    .expect(200);
  let d = await detail();
  expect(d.activities[0]!.revision).toBe(1);
  expect(d.activities[0]!.response).toBe(b.response);
  await put(
    `/candidates/me/dairy-learning/${enrollment}/units/${lesson}/activity`,
  )
    .send({ ...b, response: 'Changed command payload' })
    .expect(409);
  await put(
    `/candidates/me/dairy-learning/${enrollment}/units/${lesson}/activity`,
  )
    .send({ ...b, commandId: randomUUID() })
    .expect(409);
  await put(
    `/candidates/me/dairy-learning/${enrollment}/units/${lesson}/activity`,
  )
    .send({
      ...b,
      commandId: randomUUID(),
      expectedRevision: 1,
      response: 'Updated evidence request and uncertainty.',
    })
    .expect(200);
  d = await detail();
  expect(d.activities[0]!.revision).toBe(2);
  expect(
    (
      await pool.query(
        'SELECT * FROM dairy_learning_activities WHERE enrollment_id=$1',
        [enrollment],
      )
    ).rows,
  ).toHaveLength(2);
});
it('rejects foreign ownership, foreign units and malformed activity', async () => {
  const b = {
    commandId: randomUUID(),
    expectedRevision: 0,
    response: 'Synthetic response',
  };
  await put(
    `/candidates/me/dairy-learning/${enrollment}/units/${lesson}/activity`,
    other,
  )
    .send(b)
    .expect(404);
  await put(
    `/candidates/me/dairy-learning/${enrollment}/units/${randomUUID()}/activity`,
  )
    .send(b)
    .expect(404);
  await put(
    `/candidates/me/dairy-learning/${enrollment}/units/${lesson}/activity`,
  )
    .send({ ...b, response: '', verified: true })
    .expect(422);
});
it('records learning completion independently of competency evidence and preserves audit metadata without response text', async () => {
  const before = (await pool.query('SELECT * FROM competency_evidence')).rows;
  await put(
    `/candidates/me/training/enrollments/${enrollment}/lessons/${lesson}/progress`,
  )
    .send({
      commandId: randomUUID(),
      expectedRevision: 0,
      state: 'COMPLETED',
      resumePosition: 5,
    })
    .expect(200);
  const d = await detail();
  expect(d.course.modules[0]!.lessons[0]!.state).toBe('COMPLETED');
  expect(d.course.modules[0]!.lessons[0]!.resumePosition).toBe(5);
  expect((await pool.query('SELECT * FROM competency_evidence')).rows).toEqual(
    before,
  );
  expect(d.readiness).toBeNull();
  const events = (
    await pool.query(
      "SELECT metadata FROM audit_events WHERE action='dairy.learning.activity.saved'",
    )
  ).rows;
  expect(events).toHaveLength(2);
  expect(JSON.stringify(events)).not.toContain('Updated evidence request');
});
it('reuses existing case version, structured reasoning, save/resume and protected submission; case assessment is separate', async () => {
  const d = await detail();
  expect(d.course.assessments[0]!.assessment_version_id).toBe(pilot);
  const a = (await post(`/assessments/${pilot}/attempts`).expect(201)).body.id;
  const r = (await get(`/candidates/me/dairy-pilot/attempts/${a}`).expect(200))
    .body;
  expect(r.items.length).toBeGreaterThan(0);
  expect(r.pilot).toBe(true);
  await post(`/candidates/me/dairy-pilot/attempts/${a}/submit`).expect(409);
  for (const stage of r.configuration as {
    item_version_id: string;
    revision: number;
    response_categories: string[];
  }[]) {
    await put(
      `/candidates/me/dairy-pilot/attempts/${a}/responses/${stage.item_version_id}`,
    )
      .send({
        expectedRevision: stage.revision,
        reasoning: {
          [stage.response_categories[0]!]:
            'Learning-linked synthetic reasoning: evidence, uncertainty and supervised follow-up.',
        },
      })
      .expect(200);
  }
  await post(`/candidates/me/dairy-pilot/attempts/${a}/submit`).expect(201);
  const assessorId = (await get('/me', assessor)).body.id;
  await post(`/admin/assessment-attempts/${a}/assign`, admin)
    .send({ assessorId })
    .expect(201);
  const staff = (
    await get(`/staff/dairy-pilot/attempts/${a}`, assessor).expect(200)
  ).body;
  const draft = (
    await put(`/assessor/dairy-pilot/attempts/${a}/review-draft`, assessor)
      .send({
        expectedRevision: 0,
        decision: 'MORE_EVIDENCE_REQUIRED',
        feedback:
          'Synthetic learning-linked assessment feedback; practical evidence is still required.',
        observations: staff.items.flatMap((i: { rubric: { id: string }[] }) =>
          i.rubric.map((cr) => ({
            rubricCriterionId: cr.id,
            observation: 'NEEDS_DEVELOPMENT',
            comment:
              'Specify supporting evidence and limits of interpretation.',
          })),
        ),
      })
      .expect(200)
  ).body;
  await post(`/assessor/dairy-pilot/attempts/${a}/finalize`, assessor)
    .send({ expectedRevision: draft.revision })
    .expect(201);
  const evidence = (
    await pool.query(
      'SELECT facet,status,demo,context FROM competency_evidence WHERE attempt_id=$1',
      [a],
    )
  ).rows;
  expect(evidence.length).toBeGreaterThan(0);
  expect(
    evidence.every(
      (e) => e.demo && e.status === 'UNVERIFIED' && e.facet === 'CASE_ASSESSED',
    ),
  ).toBe(true);
  const feedback = (await get(`/candidates/me/dairy-pilot/attempts/${a}`)).body
    .feedback;
  expect(feedback[0].feedback).toContain('learning-linked');
});
it('new content versions leave prior learning, activities and exact assessment references intact', async () => {
  const before = await detail();
  const b = structuredClone(original);
  b.courseId = (
    await pool.query(
      'SELECT course_id FROM training_course_versions WHERE id=$1',
      [version],
    )
  ).rows[0].course_id;
  b.units[0]!.sections.introduction =
    'New proposed introduction, never a historical rewrite.';
  b.training.content.modules[0]!.lessons[0]!.body =
    'New proposed learning body.';
  const v = (await post('/admin/dairy-learning', admin).send(b).expect(201))
    .body;
  expect(v.version).toBe(2);
  expect(await detail()).toEqual(before);
  await expect(
    pool.query(
      "UPDATE dairy_learning_units SET content='{}'::jsonb WHERE lesson_version_id=$1",
      [lesson],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query('DELETE FROM dairy_learning_activities WHERE enrollment_id=$1', [
      enrollment,
    ]),
  ).rejects.toThrow();
});
it('retired content remains historically accessible to its enrolled owner but cannot receive new activity or enrollments', async () => {
  await post(`/admin/training/versions/${version}/retire`, admin).expect(201);
  await get('/dairy-learning/' + version).expect(404);
  const d = await detail();
  expect(d.course.status).toBe('RETIRED');
  expect(d.activities[0]!.revision).toBe(2);
  expect(
    (await get('/candidates/me/dairy-learning')).body.some(
      (e: { id: string }) => e.id === enrollment,
    ),
  ).toBe(true);
  await put(
    `/candidates/me/dairy-learning/${enrollment}/units/${lesson}/activity`,
  )
    .send({
      commandId: randomUUID(),
      expectedRevision: 2,
      response: 'Late response',
    })
    .expect(404);
});
it('database rejects cross-owner activity writes and adding unit metadata to released content', async () => {
  await expect(
    pool.query(
      'INSERT INTO dairy_learning_activities(enrollment_id,lesson_version_id,actor_id,command_id,revision,response,request_id) VALUES($1,$2,$3,$4,3,$5,$6)',
      [
        enrollment,
        lesson,
        adminId,
        randomUUID(),
        'Unauthorized database write',
        randomUUID(),
      ],
    ),
  ).rejects.toThrow();
  expect(ownerId).toBeTruthy();
  await expect(
    pool.query(
      'INSERT INTO dairy_curricula(course_version_id,domains,author_id,request_id) VALUES($1,$2,$3,$4)',
      [version, JSON.stringify(original.domains), adminId, randomUUID()],
    ),
  ).rejects.toThrow();
});
