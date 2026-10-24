import { beforeAll, afterAll, it, expect } from 'vitest';
import { Pool } from 'pg';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createApp } from '../../apps/api/dist/app';
import { testIssuer } from '../helpers/issuer';

let pool: Pool,
  app: INestApplication,
  issuer: Awaited<ReturnType<typeof testIssuer>>,
  url: string;
let owner: string,
  other: string,
  admin: string,
  candidate: string,
  otherCandidate: string;
let ownerToken: string,
  otherToken: string,
  adminToken: string,
  assessorToken: string,
  employerToken: string;
let pathways: { id: string; name: string }[];
let oldSnapshot: Record<string, unknown>, newSnapshot: Record<string, unknown>;
const files = () =>
  readdirSync('db/migrations')
    .filter((file) => file.endsWith('.sql'))
    .sort();
const checksum = (name: string) =>
  createHash('sha256')
    .update(readFileSync(`db/migrations/${name}`))
    .digest('hex');
const script = (name: string) =>
  execFileSync(process.execPath, ['--import', 'tsx', name], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
const api = () => request(app.getHttpServer());
const get = (path: string, token = ownerToken) =>
  api()
    .get('/api/v1' + path)
    .auth(token, { type: 'bearer' });
const post = (path: string, token = ownerToken) =>
  api()
    .post('/api/v1' + path)
    .auth(token, { type: 'bearer' });
const progress = (e: string, l: string, body: object, token = ownerToken) =>
  api()
    .put(
      `/api/v1/candidates/me/training/enrollments/${e}/lessons/${l}/progress`,
    )
    .auth(token, { type: 'bearer' })
    .send(body);
async function id(sql: string, values: unknown[] = []) {
  const row = (await pool.query<{ id: string }>(sql, values)).rows[0];
  if (!row) throw new Error('Missing fixture');
  return row.id;
}
let priorTableNames: string[] | undefined;
async function snapshot() {
  const result: Record<string, unknown> = {};
  const tables = (
    await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' AND tablename NOT LIKE 'training_%' ORDER BY tablename",
    )
  ).rows.map((r) => r.tablename);
  priorTableNames ??= tables;
  for (const tablename of priorTableNames) {
    if (!/^[a-z_]+$/.test(tablename)) throw new Error('Unexpected table');
    const exclude =
      tablename === 'permissions'
        ? "WHERE code NOT IN ('training:manage','training:assign')"
        : tablename === 'role_permissions'
          ? "WHERE permission_code NOT IN ('training:manage','training:assign')"
          : '';
    // Compare every pre-existing field; 014 adds only these two version columns.
    const projection =
      tablename === 'evidence_submission_versions'
        ? "(to_jsonb(t)-ARRAY['practical','draft_revision'])"
        : 'to_jsonb(t)';
    result[tablename] = (
      await pool.query(
        `SELECT coalesce(jsonb_agg(${projection} ORDER BY ${projection}::text),'[]'::jsonb) AS rows FROM ${tablename} t ${exclude}`,
      )
    ).rows[0].rows;
  }
  return result;
}
beforeAll(async () => {
  const configured = process.env.TEST_DATABASE_URL;
  if (!configured) throw new Error('TEST_DATABASE_URL required');
  const parsed = new URL(configured);
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    !parsed.pathname.endsWith('_test')
  )
    throw new Error('Dedicated local _test database required');
  url = configured;
  pool = new Pool({ connectionString: url });
  issuer = await testIssuer();
  await pool.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');
  await pool.query(
    'CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const name of files().filter((name) => name < '010')) {
    await pool.query(readFileSync(`db/migrations/${name}`, 'utf8'));
    await pool.query(
      'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
      [name, checksum(name)],
    );
  }
  script('scripts/seed.ts');
  const user = (subject: string) =>
    id('INSERT INTO users(issuer,subject) VALUES($1,$2) RETURNING id', [
      issuer.issuer,
      subject,
    ]);
  owner = await user('training-owner');
  other = await user('training-other');
  admin = await user('training-admin');
  for (const [userId, role] of [
    [owner, 'CANDIDATE'],
    [other, 'CANDIDATE'],
    [admin, 'ADMIN'],
  ])
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,$2,'PLATFORM','Synthetic training regression fixture')",
      [userId, role],
    );
  const profile = (userId: string) =>
    id(
      "INSERT INTO candidate_profiles(user_id,full_name,country_code,state,willing_to_relocate,driving_ability) VALUES($1,'Demo Candidate','NG','Kano',true,true) RETURNING id",
      [userId],
    );
  candidate = await profile(owner);
  otherCandidate = await profile(other);
  // Populate prior-schema browser, assessment and external evidence history before 010.
  await pool.query(
    "INSERT INTO browser_sessions(user_id,handle_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [owner, createHash('sha256').update(randomUUID()).digest('hex')],
  );
  const b = (
    await pool.query(
      'SELECT b.*,i.evidence_type FROM assessment_blueprint b JOIN assessment_item_versions i ON i.id=b.item_version_id LIMIT 1',
    )
  ).rows[0];
  const attempt = await id(
    'INSERT INTO assessment_attempts(candidate_id,assessment_version_id) VALUES($1,$2) RETURNING id',
    [candidate, b.assessment_version_id],
  );
  await pool.query('INSERT INTO attempt_items VALUES($1,$2,$3,1)', [
    attempt,
    b.assessment_version_id,
    b.item_version_id,
  ]);
  await pool.query(
    "INSERT INTO candidate_responses(attempt_id,item_version_id,response,objective_outcome) VALUES($1,$2,'{}','REQUIRES_REVIEW')",
    [attempt, b.item_version_id],
  );
  await pool.query(
    "UPDATE assessment_attempts SET status='SUBMITTED',submitted_at=now() WHERE id=$1",
    [attempt],
  );
  await pool.query(
    "INSERT INTO competency_evidence(candidate_id,child_version_id,attempt_id,item_version_id,facet,demo,observation) VALUES($1,$2,$3,$4,$5,true,'REQUIRES_REVIEW')",
    [
      candidate,
      b.child_version_id,
      attempt,
      b.item_version_id,
      b.evidence_type,
    ],
  );
  const submission = await id(
    'INSERT INTO evidence_submissions(candidate_id,created_by) VALUES($1,$2) RETURNING id',
    [candidate, owner],
  );
  const version = await id(
    "INSERT INTO evidence_submission_versions(submission_id,candidate_id,version,pathway_version_id,kind,summary,context,demo,change_actor_id,change_reason,change_request_id) VALUES($1,$2,1,$3,'CANDIDATE_REPORT','DEMO prior-schema evidence fixture','{\"task\":\"Synthetic task\"}',true,$4,'Synthetic prior-schema fixture',$5) RETURNING id",
    [submission, candidate, b.pathway_version_id, owner, randomUUID()],
  );
  await pool.query(
    "INSERT INTO evidence_submission_competencies VALUES($1,$2,$3,'PRACTICALLY_VERIFIED')",
    [version, candidate, b.child_version_id],
  );
  await pool.query(
    "SELECT transition_evidence_submission($1,$2,'DRAFT','SUBMITTED','Synthetic prior-schema submission',$3)",
    [version, owner, randomUUID()],
  );
  await pool.query(
    "INSERT INTO competency_evidence(candidate_id,child_version_id,source_kind,submission_version_id,facet,demo,observation,context) VALUES($1,$2,'EXTERNAL_SUBMISSION',$3,'PRACTICALLY_VERIFIED',true,'REQUIRES_REVIEW','{\"task\":\"Synthetic task\"}')",
    [candidate, b.child_version_id, version],
  );
  await pool.query(
    'INSERT INTO assessor_profiles(user_id,proposed_by) VALUES($1,$1)',
    [other],
  );
  oldSnapshot = await snapshot();
  script('scripts/migrate.ts');
  newSnapshot = await snapshot();
  app = await createApp({
    DATABASE_URL: url,
    OIDC_ISSUER: issuer.issuer,
    OIDC_JWKS_URI: issuer.issuer + '/jwks',
    OIDC_AUDIENCE: 'vetready-api',
    NODE_ENV: 'test',
    PORT: 4000,
  });
  ownerToken = await issuer.token('training-owner');
  otherToken = await issuer.token('training-other');
  adminToken = await issuer.token('training-admin');
  assessorToken = await issuer.token('training-assessor');
  employerToken = await issuer.token('training-employer');
  const assessor = (await get('/me', assessorToken)).body.id;
  const employer = (await get('/me', employerToken)).body.id;
  await pool.query(
    "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,'ASSESSOR','PLATFORM','Synthetic assessor fixture')",
    [assessor],
  );
  const org = await id(
    "INSERT INTO organizations(display_name,sector,country_code,created_by) VALUES('Demo Organisation','Demo','NG',$1) RETURNING id",
    [employer],
  );
  await pool.query('INSERT INTO organization_memberships VALUES($1,$2,now())', [
    org,
    employer,
  ]);
  await pool.query(
    "INSERT INTO user_role_assignments(user_id,role_code,role_scope,organization_id,reason) VALUES($1,'EMPLOYER','ORGANIZATION',$2,'Synthetic employer fixture')",
    [employer, org],
  );
  pathways = (
    await pool.query<{ id: string; name: string }>(
      'SELECT v.id,p.name FROM pathway_versions v JOIN pathways p ON p.id=v.pathway_id ORDER BY p.code',
    )
  ).rows;
}, 120000);
afterAll(async () => {
  await app?.close();
  await pool?.end();
  await issuer?.close();
});
function content(path = pathways[0]!.id) {
  return {
    title: 'DEMO — structured learning',
    description: 'Non-authoritative software demonstration',
    objectives: ['Navigate and record learning progress'],
    pathwayVersionIds: [path],
    modules: [
      {
        code: 'OBSERVATION',
        title: 'DEMO structured observation',
        lessons: [
          {
            code: 'INTRO',
            title: 'DEMO introduction',
            body: 'DEMO CONTENT — NOT YET APPROVED FOR PRODUCTION TRAINING. This is navigation practice, not veterinary advice.',
          },
          {
            code: 'RECORDS',
            title: 'DEMO records exercise',
            body: 'DEMO: Save a bookmark and resume this text. No clinical recommendation or competence award is provided.',
          },
        ],
      },
    ],
  };
}
async function course(options: { release?: boolean; path?: string } = {}) {
  const created = (
    await post('/admin/training/courses', adminToken)
      .send({
        code: 'DEMO_' + randomUUID().replaceAll('-', '').toUpperCase(),
        content: content(options.path),
      })
      .expect(201)
  ).body as { courseId: string; courseVersionId: string; version: number };
  if (options.release !== false)
    await post(
      `/admin/training/versions/${created.courseVersionId}/release-demo`,
      adminToken,
    ).expect(201);
  const detail = (
    await get(
      `/admin/training/versions/${created.courseVersionId}`,
      adminToken,
    ).expect(200)
  ).body as {
    pathwayVersionIds: string[];
    modules: {
      id: string;
      module_id: string;
      lessons: { id: string; lesson_id: string; body: string }[];
    }[];
  };
  return {
    ...created,
    detail,
    lesson: detail.modules[0]!.lessons[0]!.id,
    lesson2: detail.modules[0]!.lessons[1]!.id,
  };
}
async function enroll(version: string, token = ownerToken) {
  return (
    await post(`/training/versions/${version}/enrollments`, token).expect(201)
  ).body.id as string;
}
const command = (
  state = 'IN_PROGRESS',
  expectedRevision = 0,
  resumePosition = 0,
) => ({ commandId: randomUUID(), expectedRevision, state, resumePosition });

it('upgrades populated 009 without altering prior users, sessions, assessments, external evidence or audit history', () => {
  expect(newSnapshot).toEqual(oldSnapshot);
});
it('adds only explicit administrative capabilities and preserves their idempotent seed/rerun behavior', async () => {
  const grants = (
    await pool.query(
      "SELECT role_code,permission_code FROM role_permissions WHERE permission_code LIKE 'training:%' ORDER BY role_code,permission_code",
    )
  ).rows;
  expect(grants).toEqual(
    ['ADMIN', 'SUPER_ADMIN'].flatMap((role_code) =>
      ['training:assign', 'training:manage'].map((permission_code) => ({
        role_code,
        permission_code,
      })),
    ),
  );
  const before = (
    await pool.query('SELECT * FROM schema_migrations ORDER BY name')
  ).rows;
  script('scripts/migrate.ts');
  script('scripts/migrate.ts');
  script('scripts/seed.ts');
  expect(
    (await pool.query('SELECT * FROM schema_migrations ORDER BY name')).rows,
  ).toEqual(before);
  expect(
    before.map(({ name, checksum: value }) => ({ name, checksum: value })),
  ).toEqual(files().map((name) => ({ name, checksum: checksum(name) })));
  expect(
    (
      await pool.query(
        "SELECT role_code,permission_code FROM role_permissions WHERE permission_code LIKE 'training:%' ORDER BY role_code,permission_code",
      )
    ).rows,
  ).toEqual(grants);
});
it('protects all management/assignment operations while keeping existing JWT and scope enforcement', async () => {
  await api().get('/api/v1/training/courses').expect(401);
  await get(
    '/training/courses',
    await issuer.token('training-owner', { scope: 'unrelated' }),
  ).expect(401);
  for (const token of [ownerToken, otherToken, assessorToken, employerToken]) {
    await post('/admin/training/courses', token)
      .send({ code: 'FORBIDDEN', content: content() })
      .expect(403);
    await post('/admin/training/assignments', token)
      .send({ candidateId: candidate, courseVersionId: randomUUID() })
      .expect(403);
  }
  await get('/admin/training/courses', adminToken).expect(200);
});
it('keeps drafts private and requires explicit demo release before enrollment', async () => {
  const c = await course({ release: false });
  await get(`/training/versions/${c.courseVersionId}`).expect(404);
  await post(`/training/versions/${c.courseVersionId}/enrollments`).expect(422);
  expect(
    (await get('/training/courses')).body.some(
      (v: { id: string }) => v.id === c.courseVersionId,
    ),
  ).toBe(false);
  await post(
    `/admin/training/versions/${c.courseVersionId}/release-demo`,
    adminToken,
  ).expect(201);
  const released = (
    await get(`/training/versions/${c.courseVersionId}`).expect(200)
  ).body;
  expect(released).toMatchObject({
    status: 'DRAFT',
    demo: true,
    competenceVerified: false,
  });
  expect(released.notice).toContain('REQUIRES DOMAIN EXPERT VALIDATION');
  await post(
    `/admin/training/versions/${c.courseVersionId}/release-demo`,
    adminToken,
  ).expect(201);
  await enroll(c.courseVersionId);
});
it('supports all four pathways without creating competency definitions', async () => {
  const count = (await pool.query('SELECT count(*) FROM child_competencies'))
    .rows[0].count;
  for (const pathway of pathways) {
    const c = await course({ path: pathway.id });
    expect(c.detail.modules).toHaveLength(1);
    expect(c.detail.pathwayVersionIds).toEqual([pathway.id]);
    await enroll(c.courseVersionId);
  }
  expect(pathways).toHaveLength(4);
  expect(
    (await pool.query('SELECT count(*) FROM child_competencies')).rows[0].count,
  ).toBe(count);
});
it('creates idempotent self-enrollments and explicit audited assignments', async () => {
  const c = await course();
  const e = await enroll(c.courseVersionId);
  expect(await enroll(c.courseVersionId)).toBe(e);
  const assigned = (
    await post('/admin/training/assignments', adminToken)
      .send({ candidateId: otherCandidate, courseVersionId: c.courseVersionId })
      .expect(201)
  ).body;
  expect(assigned).toMatchObject({
    candidate_id: otherCandidate,
    kind: 'ASSIGNED',
    assigned_by: admin,
  });
  expect(
    (
      await post('/admin/training/assignments', adminToken)
        .send({
          candidateId: otherCandidate,
          courseVersionId: c.courseVersionId,
        })
        .expect(201)
    ).body.id,
  ).toBe(assigned.id);
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM audit_events WHERE action='training.enrolled' AND resource_id=$1",
        [e],
      )
    ).rows[0].count,
  ).toBe('1');
  await expect(
    pool.query(
      "INSERT INTO training_enrollments(candidate_id,course_version_id,kind,assigned_by,request_id) VALUES($1,$2,'ASSIGNED',$3,$4)",
      [otherCandidate, c.courseVersionId, owner, randomUUID()],
    ),
  ).rejects.toThrow('Enrollment authority required');
  await expect(
    pool.query(
      "INSERT INTO training_enrollments(candidate_id,course_version_id,kind,assigned_by,request_id) VALUES($1,$2,'SELF',$3,$4)",
      [otherCandidate, c.courseVersionId, owner, randomUUID()],
    ),
  ).rejects.toThrow('Enrollment authority required');
});
it('rejects cross-candidate reads/writes and client authority overrides', async () => {
  const c = await course();
  const e = await enroll(c.courseVersionId);
  await get(`/candidates/me/training/enrollments/${e}`, otherToken).expect(404);
  await progress(e, c.lesson, command(), otherToken).expect(404);
  await progress(e, c.lesson, {
    ...command(),
    candidateId: otherCandidate,
  }).expect(422);
  await progress(e, c.lesson, {
    ...command(),
    state: 'PRACTICALLY_VERIFIED',
  }).expect(422);
  await expect(
    pool.query(
      "SELECT update_training_progress($1,$2,$3,$4,0,'IN_PROGRESS',0,$5)",
      [e, other, c.lesson, randomUUID(), randomUUID()],
    ),
  ).rejects.toThrow('owner');
});
it('resumes exact-version learning with idempotent commands, revision conflicts and absorbing completion', async () => {
  const c = await course();
  const e = await enroll(c.courseVersionId);
  const first = command('IN_PROGRESS', 0, 12);
  const saved = (await progress(e, c.lesson, first).expect(200)).body;
  expect(saved).toMatchObject({
    revision: 1,
    resumePosition: 12,
    competenceVerified: false,
  });
  expect((await progress(e, c.lesson, first).expect(200)).body).toEqual(saved);
  await progress(e, c.lesson, { ...first, resumePosition: 15 }).expect(409);
  await progress(e, c.lesson, command('IN_PROGRESS', 0, 3)).expect(409);
  await progress(e, c.lesson, command('IN_PROGRESS', 1, 20000)).expect(422);
  const completed = (
    await progress(e, c.lesson, command('COMPLETED', 1, 20)).expect(200)
  ).body;
  await progress(e, c.lesson, command('IN_PROGRESS', 2, 0)).expect(409);
  const replayComplete = (
    await progress(e, c.lesson, command('COMPLETED', 2, 2)).expect(200)
  ).body;
  expect(replayComplete.completedAt).toBe(completed.completedAt);
  expect((await progress(e, c.lesson, first).expect(200)).body).toEqual(saved);
  const detail = (
    await get(`/candidates/me/training/enrollments/${e}`).expect(200)
  ).body;
  expect(detail.progress).toMatchObject({
    state: 'IN_PROGRESS',
    totalLessons: 2,
    completedLessons: 1,
    competenceVerified: false,
  });
  expect(detail.course.modules[0].lessons[0]).toMatchObject({
    id: c.lesson,
    revision: 3,
    resumePosition: 2,
    state: 'COMPLETED',
  });
  await progress(e, c.lesson2, command('COMPLETED')).expect(200);
  expect(
    (await get(`/candidates/me/training/enrollments/${e}`)).body.progress,
  ).toMatchObject({
    state: 'COMPLETED',
    completedLessons: 2,
    competenceVerified: false,
  });
});
it('serializes duplicated/concurrent commands and prevents conflicting revisions', async () => {
  const c = await course();
  const e = await enroll(c.courseVersionId);
  const same = command();
  const repeated = await Promise.all([
    progress(e, c.lesson, same),
    progress(e, c.lesson, same),
  ]);
  expect(repeated.map((r) => r.status)).toEqual([200, 200]);
  expect(repeated[0]!.body).toEqual(repeated[1]!.body);
  const competing = await Promise.all([
    progress(e, c.lesson, command('IN_PROGRESS', 1, 1)),
    progress(e, c.lesson, command('IN_PROGRESS', 1, 2)),
  ]);
  expect(competing.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    (
      await pool.query(
        'SELECT count(*) FROM training_lesson_progress WHERE enrollment_id=$1',
        [e],
      )
    ).rows[0].count,
  ).toBe('1');
});
it('pins historical completion to old snapshots and never grants credit in a new version', async () => {
  const c = await course();
  const e = await enroll(c.courseVersionId);
  await progress(e, c.lesson, command('COMPLETED')).expect(200);
  const changed = content();
  changed.modules[0]!.lessons[0]!.body =
    'DEMO changed learning text — no inherited completion.';
  const next = (
    await post(`/admin/training/courses/${c.courseId}/versions`, adminToken)
      .send(changed)
      .expect(201)
  ).body;
  expect(next.version).toBe(2);
  await post(
    `/admin/training/versions/${next.courseVersionId}/release-demo`,
    adminToken,
  ).expect(201);
  const nextDetail = (await get(`/training/versions/${next.courseVersionId}`))
    .body;
  expect(nextDetail.modules[0].module_id).toBe(c.detail.modules[0]!.module_id);
  expect(nextDetail.modules[0].lessons[0].lesson_id).toBe(
    c.detail.modules[0]!.lessons[0]!.lesson_id,
  );
  expect(nextDetail.modules[0].lessons[0].id).not.toBe(c.lesson);
  const nextEnrollment = await enroll(next.courseVersionId);
  expect(
    (await get(`/candidates/me/training/enrollments/${nextEnrollment}`)).body
      .progress.state,
  ).toBe('NOT_STARTED');
  await progress(nextEnrollment, c.lesson, command()).expect(422);
  expect(
    (await get(`/candidates/me/training/enrollments/${e}`)).body.course
      .modules[0].lessons[0].state,
  ).toBe('COMPLETED');
});
it('enforces immutable released hierarchies, consistent parents and disabled production approval', async () => {
  const c = await course();
  for (const sql of [
    "UPDATE training_course_versions SET title='Tampered title' WHERE id=$1",
    'DELETE FROM training_course_versions WHERE id=$1',
    "UPDATE training_course_versions SET status='APPROVED' WHERE id=$1",
  ])
    await expect(pool.query(sql, [c.courseVersionId])).rejects.toThrow();
  await expect(
    pool.query(
      "UPDATE training_lesson_versions SET body='Tampered text' WHERE id=$1",
      [c.lesson],
    ),
  ).rejects.toThrow('immutable');
  await expect(
    pool.query(
      'DELETE FROM training_module_versions WHERE course_version_id=$1',
      [c.courseVersionId],
    ),
  ).rejects.toThrow('immutable');
  const d = await course({ release: false });
  await expect(
    pool.query(
      'UPDATE training_lesson_versions SET module_version_id=$1 WHERE id=$2',
      [c.detail.modules[0]!.id, d.lesson],
    ),
  ).rejects.toThrow();
  await post('/admin/training/courses', adminToken)
    .send({
      code: 'FAKE_APPROVAL',
      content: { ...content(), status: 'APPROVED' },
    })
    .expect(422);
});
it('retains completed history after retirement and blocks new learning/enrollments', async () => {
  const c = await course();
  const e = await enroll(c.courseVersionId);
  const completedCommand = command('COMPLETED');
  const original = (await progress(e, c.lesson, completedCommand).expect(200))
    .body;
  await post(
    `/admin/training/versions/${c.courseVersionId}/retire`,
    adminToken,
  ).expect(201);
  await post(
    `/admin/training/versions/${c.courseVersionId}/retire`,
    adminToken,
  ).expect(201);
  expect(
    (await progress(e, c.lesson, completedCommand).expect(200)).body,
  ).toEqual(original);
  await get(`/training/versions/${c.courseVersionId}`).expect(404);
  await post(
    `/training/versions/${c.courseVersionId}/enrollments`,
    otherToken,
  ).expect(422);
  await progress(e, c.lesson2, command()).expect(422);
  const historic = (
    await get(`/candidates/me/training/enrollments/${e}`).expect(200)
  ).body;
  expect(historic.course.status).toBe('RETIRED');
  expect(historic.progress.completedLessons).toBe(1);
});
it('maps existing child/group definitions and Phase 2 assessment versions without fabricating attempts', async () => {
  const b = (await pool.query('SELECT * FROM assessment_blueprint LIMIT 1'))
    .rows[0];
  const input = content(b.pathway_version_id);
  const extended = {
    ...input,
    competencyMappings: [
      {
        pathwayVersionId: b.pathway_version_id,
        childVersionId: b.child_version_id,
      },
      {
        pathwayVersionId: b.pathway_version_id,
        groupVersionId: b.group_version_id,
      },
    ],
    assessmentVersionIds: [b.assessment_version_id],
  };
  const attempts = (
    await pool.query('SELECT count(*) FROM assessment_attempts')
  ).rows[0].count;
  const created = (
    await post('/admin/training/courses', adminToken)
      .send({ code: 'DEMO_MAPPING', content: extended })
      .expect(201)
  ).body;
  await post(
    `/admin/training/versions/${created.courseVersionId}/release-demo`,
    adminToken,
  ).expect(201);
  const detail = (await get(`/training/versions/${created.courseVersionId}`))
    .body;
  expect(detail.competencyMappings).toHaveLength(2);
  expect(detail.assessments[0].assessment_version_id).toBe(
    b.assessment_version_id,
  );
  expect(
    (await pool.query('SELECT count(*) FROM assessment_attempts')).rows[0]
      .count,
  ).toBe(attempts);
  const otherPath = pathways.find((p) => p.id !== b.pathway_version_id)!.id;
  await post('/admin/training/courses', adminToken)
    .send({
      code: 'INVALID_ASSESSMENT_PATH',
      content: { ...extended, pathwayVersionIds: [otherPath] },
    })
    .expect(422);
  await expect(
    pool.query(
      "UPDATE child_competency_versions SET statement='Changed meaning' WHERE id=$1",
      [b.child_version_id],
    ),
  ).rejects.toThrow();
});
it('learning completion changes no competence, evidence, assessment, verification or readiness data', async () => {
  const before = await snapshot();
  const c = await course();
  const e = await enroll(c.courseVersionId);
  for (const lesson of [c.lesson, c.lesson2])
    await progress(e, lesson, command('COMPLETED')).expect(200);
  // Filter only training-specific audit events; every other pre-existing table is unchanged.
  const after = await snapshot();
  const auditsBefore = before.audit_events as { action: string }[];
  const auditsAfter = (after.audit_events as { action: string }[]).filter(
    (row) => !row.action.startsWith('training.'),
  );
  before.audit_events = auditsBefore.filter(
    (row) => !row.action.startsWith('training.'),
  );
  after.audit_events = auditsAfter;
  expect(after).toEqual(before);
});
it('rolls back progress and idempotency receipt when canonical audit fails', async () => {
  const c = await course();
  const e = await enroll(c.courseVersionId);
  await pool.query(
    "CREATE FUNCTION synthetic_training_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic training audit failure'; END $$",
  );
  await pool.query(
    "CREATE TRIGGER synthetic_training_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.action='training.progress.transitioned') EXECUTE FUNCTION synthetic_training_audit_failure()",
  );
  try {
    await progress(e, c.lesson, command()).expect(500);
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM training_lesson_progress WHERE enrollment_id=$1',
          [e],
        )
      ).rows[0].count,
    ).toBe('0');
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM training_progress_commands WHERE enrollment_id=$1',
          [e],
        )
      ).rows[0].count,
    ).toBe('0');
  } finally {
    await pool.query(
      'DROP TRIGGER synthetic_training_audit_failure ON audit_events;DROP FUNCTION synthetic_training_audit_failure()',
    );
  }
});
it('keeps canonical evidence verification blocked and audits release/progress without lesson text', async () => {
  const e = (
    await pool.query(
      "SELECT id FROM competency_evidence WHERE source_kind='EXTERNAL_SUBMISSION' LIMIT 1",
    )
  ).rows[0].id;
  await expect(
    pool.query("UPDATE competency_evidence SET status='VERIFIED' WHERE id=$1", [
      e,
    ]),
  ).rejects.toThrow();
  const rows = (
    await pool.query(
      "SELECT metadata FROM audit_events WHERE action LIKE 'training.%'",
    )
  ).rows;
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((row) => !('body' in row.metadata))).toBe(true);
});
it('rejects incompatible competency references atomically without leaving orphan courses or audits', async () => {
  const foreign = (
    await pool.query(
      'SELECT r.child_version_id,r.pathway_version_id FROM pathway_child_requirements r WHERE NOT EXISTS(SELECT 1 FROM pathway_child_requirements mine WHERE mine.pathway_version_id=$1 AND mine.child_version_id=r.child_version_id) LIMIT 1',
      [pathways[0]!.id],
    )
  ).rows[0];
  const code = 'DEMO_WRONG_COMPETENCY';
  const before = (
    await pool.query(
      "SELECT count(*) FROM audit_events WHERE action='training.version.created'",
    )
  ).rows[0].count;
  await post('/admin/training/courses', adminToken)
    .send({
      code,
      content: {
        ...content(),
        competencyMappings: [
          {
            pathwayVersionId: pathways[0]!.id,
            childVersionId: foreign.child_version_id,
          },
        ],
      },
    })
    .expect(422);
  expect(
    (
      await pool.query('SELECT count(*) FROM training_courses WHERE code=$1', [
        code,
      ])
    ).rows[0].count,
  ).toBe('0');
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM audit_events WHERE action='training.version.created'",
      )
    ).rows[0].count,
  ).toBe(before);
});
it('requires a complete release graph and refuses unreleased assessment references', async () => {
  const c = await course({ release: false });
  const module = await id(
    "INSERT INTO training_modules(course_id,code) VALUES($1,'EMPTY_MODULE') RETURNING id",
    [c.courseId],
  );
  await pool.query(
    "INSERT INTO training_module_versions(module_id,course_id,course_version_id,position,title) VALUES($1,$2,$3,2,'Empty demo module')",
    [module, c.courseId, c.courseVersionId],
  );
  await post(
    `/admin/training/versions/${c.courseVersionId}/release-demo`,
    adminToken,
  ).expect(422);
  const assessment = await id(
    "INSERT INTO assessments(code) VALUES('DEMO_UNRELEASED_REFERENCE') RETURNING id",
  );
  const version = await id(
    "INSERT INTO assessment_versions(assessment_id,version,pathway_version_id,title) VALUES($1,1,$2,'Demo unreviewed assessment') RETURNING id",
    [assessment, pathways[0]!.id],
  );
  const created = (
    await post('/admin/training/courses', adminToken)
      .send({
        code: 'DEMO_UNRELEASED_ASSESSMENT',
        content: { ...content(), assessmentVersionIds: [version] },
      })
      .expect(201)
  ).body;
  await post(
    `/admin/training/versions/${created.courseVersionId}/release-demo`,
    adminToken,
  ).expect(422);
});
it('rejects forged command results and never permits learning receipts to claim verification', async () => {
  const c = await course();
  const e = await enroll(c.courseVersionId);
  await progress(e, c.lesson, command()).expect(200);
  await expect(
    pool.query(
      "INSERT INTO training_progress_commands(enrollment_id,command_id,candidate_id,course_version_id,lesson_version_id,expected_revision,requested_state,resume_position,result) SELECT enrollment_id,$2,candidate_id,course_version_id,lesson_version_id,revision-1,state,resume_position,jsonb_build_object('lessonVersionId',lesson_version_id,'state',state,'resumePosition',resume_position,'revision',revision,'completedAt',completed_at,'competenceVerified',true) FROM training_lesson_progress WHERE enrollment_id=$1",
      [e, randomUUID()],
    ),
  ).rejects.toThrow('actual learning state');
  await expect(
    pool.query('DELETE FROM training_lesson_progress WHERE enrollment_id=$1', [
      e,
    ]),
  ).rejects.toThrow();
});
it('protects referenced non-assessment competency meaning and remains seed-compatible', async () => {
  const row = (
    await pool.query(
      'SELECT r.child_version_id FROM pathway_child_requirements r WHERE r.pathway_version_id=$1 AND NOT EXISTS(SELECT 1 FROM assessment_blueprint b WHERE b.child_version_id=r.child_version_id) LIMIT 1',
      [pathways[0]!.id],
    )
  ).rows[0];
  const created = (
    await post('/admin/training/courses', adminToken)
      .send({
        code: 'DEMO_REFERENCE_FREEZE',
        content: {
          ...content(),
          competencyMappings: [
            {
              pathwayVersionId: pathways[0]!.id,
              childVersionId: row.child_version_id,
            },
          ],
        },
      })
      .expect(201)
  ).body;
  await post(
    `/admin/training/versions/${created.courseVersionId}/release-demo`,
    adminToken,
  ).expect(201);
  await expect(
    pool.query(
      "UPDATE child_competency_versions SET statement='Reinterpreted content' WHERE id=$1",
      [row.child_version_id],
    ),
  ).rejects.toThrow('Training referenced competency immutable');
  script('scripts/seed.ts');
});
it('uses Unicode code-point resume positions with immutable text', async () => {
  const input = content();
  input.modules[0]!.lessons[0]!.body = 'DEMO 🐄';
  const created = (
    await post('/admin/training/courses', adminToken)
      .send({ code: 'DEMO_UNICODE_RESUME', content: input })
      .expect(201)
  ).body;
  await post(
    `/admin/training/versions/${created.courseVersionId}/release-demo`,
    adminToken,
  ).expect(201);
  const details = (await get(`/training/versions/${created.courseVersionId}`))
    .body;
  const lesson = details.modules[0].lessons[0].id;
  const e = await enroll(created.courseVersionId);
  await progress(
    e,
    lesson,
    command(
      'IN_PROGRESS',
      0,
      Array.from(input.modules[0]!.lessons[0]!.body).length,
    ),
  ).expect(200);
  await progress(
    e,
    lesson,
    command('IN_PROGRESS', 1, input.modules[0]!.lessons[0]!.body.length),
  ).expect(422);
});
