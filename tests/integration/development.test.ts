import { verificationLegacyCatalogPredicate } from '../helpers/verification';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../../apps/web/lib/session', () => ({ api: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw Error('NEXT_REDIRECT');
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
import { api as webApi } from '../../apps/web/lib/session';
import { redirect } from 'next/navigation';
import {
  createWorkflow,
  startWorkflowLearning,
} from '../../apps/web/app/development/next-steps/actions';
import { saveReading } from '../../apps/web/app/learning/actions';
import { startAssessment } from '../../apps/web/app/development/actions';
import PlanPage from '../../apps/web/app/development/next-steps/[id]/page';
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
  issuer: Awaited<ReturnType<typeof testIssuer>>,
  url: string;
let owner: string,
  other: string,
  admin: string,
  plan: string,
  path: string,
  course: string,
  draft: string,
  child: string,
  candidate: string,
  assessment: string;
const base = '/candidates/me/development-workflows';
const call = (method: 'get' | 'post' | 'put', p: string, token = owner) => {
  const api = request(app.getHttpServer());
  return api[method]('/api/v1' + p).auth(token, { type: 'bearer' });
};
const create = (commandId = randomUUID(), token = owner) =>
  call('post', base, token).send({ commandId, pathwayVersionId: path });
beforeAll(async () => {
  const configured = process.env.TEST_DATABASE_URL;
  if (!configured) throw Error('Dedicated test database required');
  const parsed = new URL(configured);
  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    !parsed.pathname.endsWith('_test')
  )
    throw Error('Dedicated loopback _test database required');
  url = configured;
  pool = new Pool({ connectionString: url });
  await pool.query(
    'DROP SCHEMA public CASCADE;CREATE SCHEMA public;CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const name of readdirSync('db/migrations')
    .filter((n) => n.endsWith('.sql') && n < '017')
    .sort()) {
    const bytes = readFileSync('db/migrations/' + name);
    await pool.query(bytes.toString());
    await pool.query(
      'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
      [name, createHash('sha256').update(bytes).digest('hex')],
    );
  }
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  issuer = await testIssuer();
  app = await createApp({
    DATABASE_URL: url,
    OIDC_ISSUER: issuer.issuer,
    OIDC_JWKS_URI: issuer.issuer + '/jwks',
    OIDC_AUDIENCE: 'vetready-api',
    NODE_ENV: 'test',
    PORT: 4000,
  });
  await app.init();
  owner = await issuer.token('workflow-owner');
  other = await issuer.token('workflow-other');
  admin = await issuer.token('workflow-admin');
  await call('get', '/me', owner).expect(200);
  await call('get', '/me', other).expect(200);
  const aid = (await call('get', '/me', admin)).body.id;
  await pool.query(
    "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,'ADMIN','PLATFORM','Synthetic development regression')",
    [aid],
  );
  for (const token of [owner, other])
    await call('put', '/candidates/me', token)
      .send({
        fullName: 'Synthetic workflow candidate',
        countryCode: 'NG',
        state: 'Kano',
        drivingAbility: false,
        willingToRelocate: false,
      })
      .expect(200);
  path = (
    await pool.query(
      "SELECT v.id FROM pathway_versions v JOIN pathways p ON p.id=v.pathway_id WHERE p.code='DAIRY' ORDER BY v.version DESC LIMIT 1",
    )
  ).rows[0].id;
  child = (
    await pool.query(
      'SELECT child_version_id FROM pathway_child_requirements WHERE pathway_version_id=$1 ORDER BY child_version_id LIMIT 1',
      [path],
    )
  ).rows[0].child_version_id;
  candidate = (
    await pool.query(
      'SELECT id FROM candidate_profiles ORDER BY created_at LIMIT 1',
    )
  ).rows[0].id;
  assessment = (await call('post', '/admin/dairy-pilot', admin).expect(201))
    .body.id;
  await call(
    'post',
    `/admin/assessments/${assessment}/release-demo`,
    admin,
  ).expect(201);
  await call('post', `/assessments/${assessment}/attempts`).expect(201);
  for (const released of [false, true]) {
    const c = (
      await call('post', '/admin/training/courses', admin)
        .send({
          code: 'WORKFLOW_' + randomUUID().replaceAll('-', '').toUpperCase(),
          content: {
            title: 'Synthetic mapped demo learning',
            pathwayVersionIds: [path],
            competencyMappings: [
              { pathwayVersionId: path, childVersionId: child },
            ],
            assessmentVersionIds: [assessment],
            modules: [
              {
                code: 'PRACTICE',
                title: 'Demo navigation',
                lessons: [
                  {
                    code: 'READING',
                    title: 'Demo reading',
                    body: 'Synthetic demo reading only; no veterinary advice.',
                  },
                ],
              },
            ],
          },
        })
        .expect(201)
    ).body.courseVersionId;
    if (released) {
      course = c;
      await call(
        'post',
        `/admin/training/versions/${c}/release-demo`,
        admin,
      ).expect(201);
    } else draft = c;
  }
  const names = (
    await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename",
    )
  ).rows.map((r: { tablename: string }) => r.tablename);
  const tables = async () => {
    const result: Record<string, unknown> = {};
    for (const name of names) {
      if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw Error('Invalid table');
      result[name] = (
        await pool.query(
          `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM ${name} t WHERE ${verificationLegacyCatalogPredicate(name)}`,
        )
      ).rows[0].rows;
    }
    return result;
  };
  const before = await tables();
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  expect(await tables()).toEqual(before);
}, 600000);
afterAll(async () => {
  await app?.close();
  await issuer?.close();
  await pool?.end();
});
it('creates a private plan from an immutable current profile receipt, including unknown/unconfigured gaps', async () => {
  const r = await create().expect(201);
  plan = r.body.id;
  const d = (await call('get', base + '/' + plan).expect(200)).body;
  expect(d).toMatchObject({
    policyStatus: 'UNCONFIGURED',
    professionalDetermination: null,
  });
  expect(d.items.length).toBeGreaterThan(0);
  expect(
    d.items.every(
      (i: { policyStatus: string; evidenceState: string }) =>
        i.policyStatus === 'UNCONFIGURED' && i.evidenceState === 'UNKNOWN',
    ),
  ).toBe(true);
});
it('recommends only explicitly mapped released versions, leaving unmapped gaps visible', async () => {
  const d = (await call('get', base + '/' + plan)).body;
  expect(
    d.items
      .find((i: { childVersionId: string }) => i.childVersionId === child)
      .recommendations.map(
        (r: { courseVersionId: string }) => r.courseVersionId,
      ),
  ).toEqual([course]);
  expect(
    d.items.some(
      (i: { recommendations: unknown[] }) => !i.recommendations.length,
    ),
  ).toBe(true);
  expect(JSON.stringify(d)).not.toContain(draft);
});

const malformedEvidenceStates = [
  ['missing', undefined],
  ['json-null', null],
  ['sql-null', null],
  ['unapproved', 'VERIFIED'],
  ['empty', ''],
  ['number', 1],
  ['boolean', true],
  ['array', []],
  ['object', {}],
] as const;
it.each(malformedEvidenceStates)(
  'database rejects %s evidenceState independently of HTTP validation',
  async (kind, value) => {
    const expression =
      kind === 'missing'
        ? "(p.items->0)-'evidenceState'"
        : kind === 'sql-null'
          ? "(p.items->0)||jsonb_build_object('evidenceState',NULL::text)"
          : "jsonb_set(p.items->0,'{evidenceState}',$2::jsonb,true)";
    const values =
      kind === 'missing' || kind === 'sql-null'
        ? [plan]
        : [plan, JSON.stringify(value)];
    await expect(
      pool.query(
        `INSERT INTO development_workflow_plans(candidate_id,pathway_version_id,snapshot_id,actor_id,command_id,request_id,items) SELECT candidate_id,pathway_version_id,snapshot_id,actor_id,gen_random_uuid(),gen_random_uuid(),jsonb_build_array(${expression}) FROM development_workflow_plans p WHERE id=$1`,
        values,
      ),
    ).rejects.toThrow('Development professional decisions unavailable');
  },
);
it.each(['UNKNOWN', 'PRESENT'])(
  'database still accepts valid %s evidenceState without configuring professional policy',
  async (state) => {
    const r = await pool.query(
      "INSERT INTO development_workflow_plans(candidate_id,pathway_version_id,snapshot_id,actor_id,command_id,request_id,items) SELECT candidate_id,pathway_version_id,snapshot_id,actor_id,gen_random_uuid(),gen_random_uuid(),jsonb_build_array(jsonb_set(p.items->0,'{evidenceState}',$2::jsonb,true)) FROM development_workflow_plans p WHERE id=$1 RETURNING items,policy_status",
      [plan, JSON.stringify(state)],
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].items[0].evidenceState).toBe(state);
    expect(r.rows[0].policy_status).toBe('UNCONFIGURED');
  },
);
it('denies anonymous reads, cross-owner plan access and cross-owner enrollment', async () => {
  await request(app.getHttpServer())
    .get('/api/v1' + base + '/' + plan)
    .expect(401);
  await call('get', base + '/' + plan, other).expect(404);
  await call('post', `${base}/${plan}/courses/${course}/start`, other).expect(
    404,
  );
  expect((await call('get', base, other)).body).toEqual([]);
});
it('rejects owner and policy mass assignment', async () => {
  await call('post', base)
    .send({
      commandId: randomUUID(),
      pathwayVersionId: path,
      candidateId: candidate,
      policyStatus: 'APPROVED',
    })
    .expect(422);
});
it('replays the same command without duplicate plans and rejects changed command meaning', async () => {
  const command = randomUUID();
  const a = await create(command).expect(201),
    b = await create(command).expect(201);
  expect(a.body.id).toBe(b.body.id);
  await call('post', base)
    .send({ commandId: command, pathwayVersionId: randomUUID() })
    .expect(409);
});
it('requires explicit enrollment and prevents substituting an unmapped/draft course', async () => {
  expect((await pool.query('SELECT * FROM training_enrollments')).rows).toEqual(
    [],
  );
  await call('post', `${base}/${plan}/courses/${draft}/start`).expect(404);
  await call('post', `${base}/${plan}/courses/${randomUUID()}/start`).expect(
    404,
  );
});
it('reuses canonical enrollment idempotently and audits plan-to-learning provenance once', async () => {
  const a = await call(
    'post',
    `${base}/${plan}/courses/${course}/start`,
  ).expect(201);
  const b = await call(
    'post',
    `${base}/${plan}/courses/${course}/start`,
  ).expect(201);
  expect(a.body.id).toBe(b.body.id);
  expect(
    (
      await pool.query(
        'SELECT * FROM development_workflow_starts WHERE plan_id=$1',
        [plan],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await pool.query(
        "SELECT * FROM audit_events WHERE resource_id=$1 AND action='development.workflow.learning.started'",
        [plan],
      )
    ).rows,
  ).toHaveLength(1);
});
it('tracks real completion, exposes exact mapped follow-up and preserves assessments/evidence', async () => {
  const before = (
    await pool.query(
      'SELECT row_to_json(a) AS row FROM assessment_attempts a ORDER BY id',
    )
  ).rows;
  const evidence = (
    await pool.query(
      'SELECT row_to_json(e) AS row FROM competency_evidence e ORDER BY id',
    )
  ).rows;
  const d = (await call('get', base + '/' + plan)).body,
    c = d.courses[0];
  const e = (
    await call('get', '/candidates/me/training/enrollments/' + c.enrollmentId)
  ).body;
  for (const m of e.course.modules)
    for (const l of m.lessons)
      await call(
        'put',
        `/candidates/me/training/enrollments/${c.enrollmentId}/lessons/${l.id}/progress`,
      )
        .send({
          commandId: randomUUID(),
          expectedRevision: 0,
          state: 'COMPLETED',
          resumePosition: 0,
        })
        .expect(200);
  const after = (await call('get', base + '/' + plan)).body;
  expect(after.courses[0].progress).toMatchObject({
    state: 'LEARNING_COMPLETED',
    gapResolved: false,
  });
  expect(
    after.courses[0].courseLevelFollowUps.some(
      (a: { id: string }) => a.id === assessment,
    ),
  ).toBe(true);
  expect(after.itemsDigest).toBe(d.itemsDigest);
  expect(after.items).toEqual(d.items);
  expect(
    after.currentItems.every(
      (i: { policyStatus: string }) => i.policyStatus === 'UNCONFIGURED',
    ),
  ).toBe(true);
  expect(
    (
      await pool.query(
        'SELECT row_to_json(a) AS row FROM assessment_attempts a ORDER BY id',
      )
    ).rows,
  ).toEqual(before);
  expect(
    (
      await pool.query(
        'SELECT row_to_json(e) AS row FROM competency_evidence e ORDER BY id',
      )
    ).rows,
  ).toEqual(evidence);
  await call('post', `/assessments/${assessment}/attempts`).expect(201);
});
it('keeps plan history immutable and rejects forged owner or professional decisions at SQL boundary', async () => {
  await expect(
    pool.query(
      "UPDATE development_workflow_plans SET policy_status='APPROVED' WHERE id=$1",
      [plan],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query('DELETE FROM development_workflow_plans WHERE id=$1', [plan]),
  ).rejects.toThrow();
  await expect(
    pool.query(
      'INSERT INTO development_workflow_plans(candidate_id,pathway_version_id,snapshot_id,actor_id,command_id,request_id,items) SELECT p.candidate_id,p.pathway_version_id,p.snapshot_id,(SELECT user_id FROM candidate_profiles WHERE id<>p.candidate_id LIMIT 1),gen_random_uuid(),p.request_id,p.items FROM development_workflow_plans p WHERE p.id=$1',
      [plan],
    ),
  ).rejects.toThrow('Development active snapshot owner required');
});
it('preserves populated 001–016 records on upgrade/rerun and validates 017 checksum', async () => {
  const run = () =>
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  const p = (
    await pool.query('SELECT * FROM development_workflow_plans ORDER BY id')
  ).rows;
  run();
  run();
  expect(
    (await pool.query('SELECT * FROM development_workflow_plans ORDER BY id'))
      .rows,
  ).toEqual(p);
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  expect(
    (await pool.query('SELECT * FROM development_workflow_plans ORDER BY id'))
      .rows,
  ).toEqual(p);
  const rows = (
    await pool.query(
      'SELECT name,checksum FROM schema_migrations ORDER BY name',
    )
  ).rows;
  expect(rows).toHaveLength(18);
  for (const r of rows)
    expect(r.checksum).toBe(
      createHash('sha256')
        .update(readFileSync('db/migrations/' + r.name))
        .digest('hex'),
    );
  expect(
    readdirSync('db/migrations').filter((n) => n.endsWith('.sql')),
  ).toHaveLength(18);
});
it('makes plan creation atomic with canonical auditing', async () => {
  await pool.query(
    "CREATE FUNCTION workflow_test_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='development.workflow.created' THEN RAISE EXCEPTION 'Synthetic audit unavailable'; END IF;RETURN NEW;END $$;CREATE TRIGGER workflow_test_audit_fail BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION workflow_test_audit_fail()",
  );
  const count = (
    await pool.query('SELECT count(*) FROM development_workflow_plans')
  ).rows[0];
  try {
    await create().expect(500);
    expect(
      (await pool.query('SELECT count(*) FROM development_workflow_plans'))
        .rows[0],
    ).toEqual(count);
  } finally {
    await pool.query(
      'DROP TRIGGER workflow_test_audit_fail ON audit_events;DROP FUNCTION workflow_test_audit_fail()',
    );
  }
});
it('retirement blocks new enrollment while preserving learning and plan history', async () => {
  await call('post', `/admin/training/versions/${course}/retire`, admin).expect(
    201,
  );
  await call('post', `${base}/${plan}/courses/${course}/start`).expect(404);
  const d = (await call('get', base + '/' + plan).expect(200)).body;
  expect(d.courses[0]).toMatchObject({
    available: false,
    progress: { state: 'LEARNING_COMPLETED', gapResolved: false },
  });
});
it('exposes no reassessment when no explicit governed assessment link exists', async () => {
  const v = (
    await call('post', '/admin/training/courses', admin)
      .send({
        code: 'NOFOLLOW_' + randomUUID().replaceAll('-', '').toUpperCase(),
        content: {
          title: 'Synthetic no follow-up demo',
          pathwayVersionIds: [path],
          competencyMappings: [
            { pathwayVersionId: path, childVersionId: child },
          ],
          modules: [
            {
              code: 'READ',
              title: 'Demo reading',
              lessons: [
                {
                  code: 'READ',
                  title: 'Reading',
                  body: 'Synthetic navigation only.',
                },
              ],
            },
          ],
        },
      })
      .expect(201)
  ).body.courseVersionId;
  await call(
    'post',
    `/admin/training/versions/${v}/release-demo`,
    admin,
  ).expect(201);
  const p = (await create().expect(201)).body.id;
  const d = (await call('get', base + '/' + p)).body;
  expect(
    d.courses.find((c: { id: string }) => c.id === v).courseLevelFollowUps,
  ).toEqual([]);
});
it('cannot select an older standalone profile receipt by reusing its command identifier', async () => {
  const commandId = randomUUID();
  const old = (
    await call('post', '/candidates/me/competency-profile/snapshots')
      .send({ commandId })
      .expect(201)
  ).body;
  const p = (await create(commandId).expect(201)).body.id;
  const d = (await call('get', base + '/' + p).expect(200)).body;
  expect(d.snapshotId).not.toBe(old.id);
});
it('rolls back canonical enrollment and plan-start provenance together if audit fails', async () => {
  const p = (await create().expect(201)).body.id;
  const d = (await call('get', base + '/' + p)).body;
  const c = d.courses.find(
    (c: { available: boolean; enrollmentId: string | null }) =>
      c.available && !c.enrollmentId,
  );
  expect(c).toBeTruthy();
  const before = (await pool.query('SELECT count(*) FROM training_enrollments'))
    .rows[0];
  await pool.query(
    "CREATE FUNCTION workflow_test_start_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='development.workflow.learning.started' THEN RAISE EXCEPTION 'Synthetic audit unavailable'; END IF;RETURN NEW;END $$;CREATE TRIGGER workflow_test_start_fail BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION workflow_test_start_fail()",
  );
  try {
    await call('post', `${base}/${p}/courses/${c.id}/start`).expect(500);
    expect(
      (await pool.query('SELECT count(*) FROM training_enrollments')).rows[0],
    ).toEqual(before);
    expect(
      (
        await pool.query(
          'SELECT * FROM development_workflow_starts WHERE plan_id=$1',
          [p],
        )
      ).rows,
    ).toEqual([]);
  } finally {
    await pool.query(
      'DROP TRIGGER workflow_test_start_fail ON audit_events;DROP FUNCTION workflow_test_start_fail()',
    );
  }
});

let scopedCourse: string,
  scopedPlan: string,
  childB: string,
  assessmentA: string,
  assessmentB: string,
  courseAssessment: string;
async function scopedAssessment(title: string, children: string[]) {
  const version = (
    await call('post', '/admin/assessments', admin)
      .send({
        code: 'SCOPE_' + randomUUID().replaceAll('-', '').toUpperCase(),
        pathwayVersionId: path,
        title,
        randomize: false,
      })
      .expect(201)
  ).body.id;
  for (const target of children) {
    const reference = (
      await pool.query(
        'SELECT m.group_version_id,c.id FROM child_group_mappings m JOIN pathway_domain_groups g ON g.group_version_id=m.group_version_id JOIN child_criteria c ON c.child_version_id=m.child_version_id WHERE g.pathway_version_id=$1 AND m.child_version_id=$2 ORDER BY c.id LIMIT 1',
        [path, target],
      )
    ).rows[0];
    await call('post', `/admin/assessments/${version}/items`, admin)
      .send({
        code: 'SCOPE_ITEM_' + randomUUID().replaceAll('-', '').toUpperCase(),
        version: 1,
        type: 'SHORT_TEXT',
        prompt:
          'Synthetic navigation assessment only; no professional standards or clinical advice.',
        method: 'KNOWLEDGE',
        difficulty: 'INTRODUCTORY',
        evidenceType: 'KNOWLEDGE_ASSESSED',
        groupVersionId: reference.group_version_id,
        childVersionId: target,
        criterionIds: [reference.id],
      })
      .expect(201);
  }
  await call(
    'post',
    `/admin/assessments/${version}/release-demo`,
    admin,
  ).expect(201);
  return version;
}
it('returns only assessment A for competency A and assessment B for B while separating the one course-level follow-up', async () => {
  childB = (
    await pool.query(
      'SELECT child_version_id FROM pathway_child_requirements WHERE pathway_version_id=$1 AND child_version_id<>$2 ORDER BY child_version_id LIMIT 1',
      [path, child],
    )
  ).rows[0].child_version_id;
  assessmentA = await scopedAssessment('SCOPED_A_ONLY', [child]);
  assessmentB = await scopedAssessment('SCOPED_B_ONLY', [childB]);
  courseAssessment = await scopedAssessment('COURSE_LEVEL_ONLY', [
    child,
    childB,
  ]);
  scopedCourse = (
    await call('post', '/admin/training/courses', admin)
      .send({
        code: 'SCOPED_COURSE_' + randomUUID().replaceAll('-', '').toUpperCase(),
        content: {
          title: 'Synthetic two-module course',
          pathwayVersionIds: [path],
          assessmentVersionIds: [courseAssessment],
          modules: [
            {
              code: 'MODULE_A',
              title: 'Synthetic module A',
              competencyMappings: [
                { pathwayVersionId: path, childVersionId: child },
              ],
              assessmentVersionIds: [assessmentA],
              lessons: [
                {
                  code: 'LESSON_A',
                  title: 'Synthetic reading A',
                  body: 'Demo reading A. No professional instruction.',
                },
              ],
            },
            {
              code: 'MODULE_B',
              title: 'Synthetic module B',
              competencyMappings: [
                { pathwayVersionId: path, childVersionId: childB },
              ],
              assessmentVersionIds: [assessmentB],
              lessons: [
                {
                  code: 'LESSON_B',
                  title: 'Synthetic reading B',
                  body: 'Demo reading B. No professional instruction.',
                },
              ],
            },
          ],
        },
      })
      .expect(201)
  ).body.courseVersionId;
  await call(
    'post',
    `/admin/training/versions/${scopedCourse}/release-demo`,
    admin,
  ).expect(201);
  scopedPlan = (await create().expect(201)).body.id;
  const d = (await call('get', base + '/' + scopedPlan).expect(200)).body;
  expect(
    d.competencyFollowUps
      .find(
        (f: { childVersionId: string; courseVersionId: string }) =>
          f.childVersionId === child && f.courseVersionId === scopedCourse,
      )
      .followUps.map((a: { id: string }) => a.id),
  ).toEqual([assessmentA]);
  expect(
    d.competencyFollowUps
      .find(
        (f: { childVersionId: string; courseVersionId: string }) =>
          f.childVersionId === childB && f.courseVersionId === scopedCourse,
      )
      .followUps.map((a: { id: string }) => a.id),
  ).toEqual([assessmentB]);
  expect(
    d.courses
      .find((c: { id: string }) => c.id === scopedCourse)
      .courseLevelFollowUps.map((a: { id: string }) => a.id),
  ).toEqual([courseAssessment]);
  expect(
    d.competencyFollowUps.every((f: { followUps: { id: string }[] }) =>
      f.followUps.every((a) => a.id !== courseAssessment),
    ),
  ).toBe(true);
  expect(d).toMatchObject({
    policyStatus: 'UNCONFIGURED',
    professionalDetermination: null,
  });
  expect(
    d.items.find((i: { childVersionId: string }) => i.childVersionId === child),
  ).toMatchObject({ evidenceState: 'UNKNOWN', policyStatus: 'UNCONFIGURED' });
});
it('executes the actual plan/enrollment/reading/follow-up actions against the API and renders scoped guidance without an existing enrollment', async () => {
  const mock = vi.mocked(webApi);
  mock.mockImplementation(async (p, init) => {
    const method =
      init?.method === 'POST' ? 'post' : init?.method === 'PUT' ? 'put' : 'get';
    let req = call(method, p);
    if (init?.body) req = req.send(JSON.parse(String(init.body)));
    const r = await req;
    return Response.json(r.body, { status: r.status });
  });
  const form = (values: Record<string, string | number>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(values)) f.set(k, String(v));
    return f;
  };
  try {
    expect(
      (
        await pool.query(
          'SELECT 1 FROM training_enrollments WHERE course_version_id=$1',
          [scopedCourse],
        )
      ).rowCount,
    ).toBe(0);
    vi.mocked(redirect).mockClear();
    await expect(
      createWorkflow(form({ commandId: randomUUID(), pathwayVersionId: path })),
    ).rejects.toThrow('NEXT_REDIRECT');
    const target = String(vi.mocked(redirect).mock.calls.at(-1)![0]),
      id = target.split('/').at(-1)!;
    expect(target).toMatch(/^\/development\/next-steps\/[0-9a-f-]+$/);
    const before = renderToStaticMarkup(
      await PlanPage({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(before).toContain('Confirm enrollment');
    await expect(
      startWorkflowLearning(form({ plan: id, course: scopedCourse })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenLastCalledWith(
      `/development/next-steps/${id}?status=started`,
    );
    const e = (
      await pool.query(
        'SELECT id FROM training_enrollments WHERE course_version_id=$1',
        [scopedCourse],
      )
    ).rows[0].id;
    const enrolled = (
      await call('get', '/candidates/me/training/enrollments/' + e)
    ).body;
    for (const m of enrolled.course.modules)
      for (const l of m.lessons) {
        await expect(
          saveReading(
            form({
              enrollment: e,
              lesson: l.id,
              commandId: randomUUID(),
              revision: l.revision,
              position: 0,
              state: 'COMPLETED',
            }),
          ),
        ).rejects.toThrow('NEXT_REDIRECT');
        expect(redirect).toHaveBeenLastCalledWith(
          `/learning/${e}?status=saved`,
        );
      }
    const html = renderToStaticMarkup(
      await PlanPage({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve({}),
      }),
    );
    const sections = [
      ...html.matchAll(/<section[^>]*>([\s\S]*?)<\/section>/g),
    ].map((m) => m[1]!);
    const details = (await call('get', base + '/' + id)).body;
    const itemA = details.items.find(
        (i: { childVersionId: string }) => i.childVersionId === child,
      ),
      itemB = details.items.find(
        (i: { childVersionId: string }) => i.childVersionId === childB,
      );
    const a = sections.find((s) =>
        s.includes(itemA.code.replaceAll('_', ' ')),
      )!,
      b = sections.find((s) => s.includes(itemB.code.replaceAll('_', ' ')))!;
    expect(a).toContain('SCOPED_A_ONLY');
    expect(a).not.toContain('SCOPED_B_ONLY');
    expect(b).toContain('SCOPED_B_ONLY');
    expect(b).not.toContain('SCOPED_A_ONLY');
    expect(a).not.toContain('COURSE_LEVEL_ONLY');
    expect(b).not.toContain('COURSE_LEVEL_ONLY');
    expect(html.split('COURSE_LEVEL_ONLY')).toHaveLength(2);
    expect(html).toContain('Course-level follow-up');
    expect(
      details.courses.find((c: { id: string }) => c.id === scopedCourse)
        .progress,
    ).toMatchObject({ state: 'LEARNING_COMPLETED', gapResolved: false });
    expect(details.professionalDetermination).toBeNull();
    expect(details.policyStatus).toBe('UNCONFIGURED');
    await expect(
      startAssessment(form({ assessmentId: assessmentA })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/assessments\/[0-9a-f-]+$/),
    );
  } finally {
    mock.mockReset();
  }
});
