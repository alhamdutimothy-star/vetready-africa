import { transitionFreshCowTemplate as originalTemplate } from '../../apps/api/src/cases/transition-fresh-cow.content';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../apps/api/dist/app';
import { testIssuer } from '../helpers/issuer';
import {
  pilotAttemptSchema,
  staffPilotSchema,
} from '../../apps/web/lib/dairy-pilot';
let app: INestApplication,
  pool: Pool,
  url: string,
  issuer: Awaited<ReturnType<typeof testIssuer>>;
let candidate: string,
  other: string,
  admin: string,
  assessor: string,
  unassigned: string;
let candidateUser: string,
  adminUser: string,
  assessorUser: string,
  caseId: string,
  attemptId: string;
let before: Record<string, unknown>, after: Record<string, unknown>;
let reviewRevision = 0;
const api = () => request(app.getHttpServer());
const get = (p: string, t = candidate) =>
  api()
    .get('/api/v1' + p)
    .auth(t, { type: 'bearer' });
const post = (p: string, t = candidate) =>
  api()
    .post('/api/v1' + p)
    .auth(t, { type: 'bearer' });
const put = (p: string, t = candidate) =>
  api()
    .put('/api/v1' + p)
    .auth(t, { type: 'bearer' });
const detail = async () =>
  (await get(`/candidates/me/dairy-pilot/attempts/${attemptId}`).expect(200))
    .body;
const script = (s: string) =>
  execFileSync(process.execPath, ['--import', 'tsx', s], {
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
beforeAll(async () => {
  const configured = process.env.TEST_DATABASE_URL;
  if (!configured) throw new Error('Dedicated local test DB required');
  const u = new URL(configured);
  if (
    !['localhost', '127.0.0.1'].includes(u.hostname) ||
    !u.pathname.endsWith('_test')
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
    .filter((n) => n.endsWith('.sql') && n < '012')
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
  candidate = await issuer.token('pilot-candidate');
  other = await issuer.token('pilot-other');
  admin = await issuer.token('pilot-admin');
  assessor = await issuer.token('pilot-assessor');
  unassigned = await issuer.token('pilot-unassigned');
  candidateUser = (await get('/me')).body.id;
  await get('/me', other);
  adminUser = (await get('/me', admin)).body.id;
  assessorUser = (await get('/me', assessor)).body.id;
  const unassignedUser = (await get('/me', unassigned)).body.id;
  for (const [id, role] of [
    [adminUser, 'ADMIN'],
    [assessorUser, 'ASSESSOR'],
    [unassignedUser, 'ASSESSOR'],
  ])
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,$2,'PLATFORM','Synthetic dairy pilot fixture')",
      [id, role],
    );
  await put('/candidates/me')
    .send({
      fullName: 'Synthetic Dairy Candidate',
      countryCode: 'NG',
      state: 'Kano',
      willingToRelocate: true,
      drivingAbility: false,
    })
    .expect(200);
  // Populate prior 011 data before applying 012: sessions, finalized legacy case feedback and learning progress.
  await pool.query(
    "INSERT INTO browser_sessions(user_id,handle_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [candidateUser, createHash('sha256').update(randomUUID()).digest('hex')],
  );
  const paths = (await get('/pathways')).body;
  const dairy = paths.find(
    (p: { name: string }) => p.name === 'Commercial Dairy Practice',
  );
  const old = (await get('/assessments')).body.find(
    (p: { pathway_version_id: string }) =>
      p.pathway_version_id === dairy.version_id,
  );
  const a = (await post(`/assessments/${old.id}/attempts`).expect(201)).body.id;
  const d = (await get(`/candidates/me/attempts/${a}`).expect(200)).body;
  await put(`/candidates/me/attempts/${a}/responses/${d.items[0].id}`)
    .send({
      text: 'Prior-schema synthetic herd investigation, evidence requests and monitoring.',
    })
    .expect(200);
  await post(`/candidates/me/attempts/${a}/submit`).expect(201);
  await post(`/admin/assessment-attempts/${a}/assign`, admin)
    .send({ assessorId: assessorUser })
    .expect(201);
  const rd = (await get(`/assessor/attempts/${a}`, assessor)).body;
  await post(`/assessor/attempts/${a}/reviews`, assessor)
    .send({
      feedback: 'Prior-schema synthetic development feedback.',
      observations: rd.items.flatMap((i: { rubric: { id: string }[] }) =>
        i.rubric.map((c) => ({
          rubricCriterionId: c.id,
          observation: 'UNASSESSABLE',
          comment: 'Prior-schema demonstration evidence only.',
        })),
      ),
    })
    .expect(201);
  const course = (
    await post('/admin/training/courses', admin)
      .send({
        code: 'DEMO_PRIOR_PILOT',
        content: {
          title: 'Prior-schema dairy learning',
          pathwayVersionIds: [dairy.version_id],
          modules: [
            {
              code: 'INTRO',
              title: 'Demo introduction',
              lessons: [
                {
                  code: 'TEXT',
                  title: 'Demo text lesson',
                  body: 'DEMO: save a bookmark; no professional standard.',
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
    admin,
  ).expect(201);
  const enrollment = (
    await post(
      `/training/versions/${course.courseVersionId}/enrollments`,
    ).expect(201)
  ).body.id;
  const cd = (
    await get(`/admin/training/versions/${course.courseVersionId}`, admin)
  ).body;
  await put(
    `/candidates/me/training/enrollments/${enrollment}/lessons/${cd.modules[0].lessons[0].id}/progress`,
  )
    .send({
      commandId: randomUUID(),
      expectedRevision: 0,
      state: 'IN_PROGRESS',
      resumePosition: 4,
    })
    .expect(200);
  const tables = (
    await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename",
    )
  ).rows.map((r) => r.tablename);
  before = await snapshot(tables);
  script('scripts/migrate.ts');
  after = await snapshot(tables);
}, 120000);
afterAll(async () => {
  await app?.close();
  await pool?.end();
  await issuer?.close();
});
it('upgrades populated 011 without modifying any prior user, browser session, assessment, review, evidence, learning or audit row', () => {
  expect(after).toEqual(before);
});
it('keeps the pilot dairy-only and professional requirements inactive', async () => {
  expect((await get('/pathways')).body).toHaveLength(4);
  expect(
    (await pool.query('SELECT count(*) FROM child_competencies')).rows[0].count,
  ).toBe('69');
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM pathway_child_requirements WHERE mandatory IS NOT NULL OR validation_status<>'PROPOSED'",
      )
    ).rows[0].count,
  ).toBe('0');
  const d = (await get('/candidates/me/dairy-pilot').expect(200)).body;
  expect(d.pilot).toBeNull();
  expect(d.readiness).toBeNull();
  expect(d.learning.enrollments).toBe(1);
});
it('requires current authentication, scope and platform authoring capability for setup', async () => {
  await get('/admin/dairy-pilot', admin).expect(404);
  await api().post('/api/v1/admin/dairy-pilot').expect(401);
  await post('/admin/dairy-pilot').expect(403);
  await post('/admin/dairy-pilot', assessor).expect(403);
  await post(
    '/admin/dairy-pilot',
    await issuer.token('pilot-admin', { scope: 'openid' }),
  ).expect(401);
});
it('prepares one draft using the original case template and explicit existing version mappings, idempotently', async () => {
  const dairy = (await get('/pathways')).body.find(
    (p: { name: string }) => p.name === 'Commercial Dairy Practice',
  );
  const hierarchy = (await get(`/pathways/${dairy.id}/hierarchy`)).body as {
    child_code: string;
    child_version_id: string;
    group_version_id: string;
    criteria: { id: string }[];
  }[];
  const existing = (
    await post('/admin/case-blueprints', admin)
      .send({
        code: 'DEMO_EXISTING_TRANSITION',
        pathwayVersionId: dairy.version_id,
        title: originalTemplate.title,
        scenario: originalTemplate.scenario,
        templateReference: originalTemplate.templateReference,
        sourceReferences: [],
        steps: originalTemplate.steps.map((s) => {
          const h = hierarchy.find(
            (h) => h.child_code === s.suggestedChildCode,
          )!;
          return {
            code: s.code,
            type: s.type,
            title: s.title,
            prompt: s.prompt,
            childVersionId: h.child_version_id,
            groupVersionId: h.group_version_id,
            criteria: h.criteria.map((cr) => ({
              criterionId: cr.id,
              dimensions: [...s.dimensions],
            })),
          };
        }),
      })
      .expect(201)
  ).body;

  const p = (await post('/admin/dairy-pilot', admin).expect(201)).body;
  caseId = p.id;
  expect(caseId).toBe(existing.id);
  expect(p.status).toBe('DRAFT');
  expect((await post('/admin/dairy-pilot', admin).expect(201)).body.id).toBe(
    caseId,
  );
  expect(
    (await pool.query('SELECT count(*) FROM dairy_pilot_versions')).rows[0]
      .count,
  ).toBe('1');
  const d = (await get(`/case-blueprints/${caseId}`, admin)).body;
  expect(d.steps).toHaveLength(10);
  expect(d.template_reference).toBe('TRANSITION_FRESH_COW_DEMO_V1');
  expect(d.professional_status).toBe('DRAFT');
  await pool.query(
    "UPDATE dairy_pilot_guidance SET assessor_guidance='ASSESSOR_ONLY_TEST_GUIDANCE — requires professional validation' WHERE assessment_version_id=$1",
    [caseId],
  );
  await post('/dairy-pilot/attempts').expect(409);
});
it('preserves a released Phase 3C case by creating its next draft version rather than changing consumed content', async () => {
  // Dedicated test fixture: remove only the unpublished adapter, then deliver the Phase 3C case.
  const previous = caseId;
  await pool.query(
    'DELETE FROM dairy_pilot_guidance WHERE assessment_version_id=$1',
    [previous],
  );
  await pool.query(
    'DELETE FROM dairy_pilot_stages WHERE assessment_version_id=$1',
    [previous],
  );
  await pool.query(
    'DELETE FROM dairy_pilot_versions WHERE assessment_version_id=$1',
    [previous],
  );
  await post(`/admin/assessments/${previous}/release-demo`, admin).expect(201);
  const original = (await get(`/case-blueprints/${previous}`, admin)).body;
  const next = (await post('/admin/dairy-pilot', admin).expect(201)).body;
  expect(next.id).not.toBe(previous);
  expect(next.version).toBe(original.version + 1);
  expect(next.status).toBe('DRAFT');
  const identities = (
    await pool.query(
      'SELECT DISTINCT assessment_id FROM assessment_versions WHERE id=ANY($1::uuid[])',
      [[previous, next.id]],
    )
  ).rows;
  expect(identities).toHaveLength(1);
  expect((await get(`/case-blueprints/${previous}`, admin)).body).toEqual(
    original,
  );
  caseId = next.id;
  await pool.query(
    "UPDATE dairy_pilot_guidance SET assessor_guidance='ASSESSOR_ONLY_TEST_GUIDANCE — requires professional validation' WHERE assessment_version_id=$1",
    [caseId],
  );
});
it('releases the controlled demo explicitly and rejects starting before a candidate profile exists', async () => {
  await post(`/admin/assessments/${caseId}/release-demo`, admin).expect(201);
  await post('/dairy-pilot/attempts', other).expect(409);
  const p = (await post('/dairy-pilot/attempts').expect(201)).body;
  attemptId = p.id;
  expect((await post('/dairy-pilot/attempts').expect(201)).body).toEqual({
    id: attemptId,
    resumed: true,
  });
});
it('does not expose protected rubrics, guidance, draft feedback or model answers through any candidate case route', async () => {
  await get('/admin/dairy-pilot').expect(403);
  expect(
    JSON.stringify(
      (await get('/admin/dairy-pilot', admin)).body.privateGuidance,
    ),
  ).toContain('ASSESSOR_ONLY_TEST_GUIDANCE');
  const d = await detail();
  expect(pilotAttemptSchema.safeParse(d).success).toBe(true);
  expect(
    d.items.every((i: { rubric: unknown[] }) => i.rubric.length === 0),
  ).toBe(true);
  for (const route of [
    `/candidates/me/dairy-pilot/attempts/${attemptId}`,
    `/candidates/me/attempts/${attemptId}`,
    `/case-blueprints/${caseId}`,
  ]) {
    const body = (await get(route).expect(200)).body;
    const serialized = JSON.stringify(body);
    for (const field of [
      'ASSESSOR_ONLY_TEST_GUIDANCE',
      'assessor_guidance',
      'privateGuidance',
      'reviewDraft',
      'rubricDimensions',
    ])
      expect(serialized).not.toContain(field);
  }
  expect(d.suppliedEvidence).toHaveLength(4);
  expect(d.configuration).toHaveLength(10);
});
it('enforces ownership and hides in-progress submissions from staff', async () => {
  await get(`/candidates/me/dairy-pilot/attempts/${attemptId}`, other).expect(
    404,
  );
  await get(`/staff/dairy-pilot/attempts/${attemptId}`, admin).expect(404);
  await get(`/staff/dairy-pilot/attempts/${attemptId}`, assessor).expect(404);
  await get('/staff/dairy-pilot').expect(403);
});
it('separates supplied facts from observations, rejects wrong categories and blocks the old text-response bypass', async () => {
  const d = await detail(),
    i = d.items[0];
  await put(
    `/candidates/me/dairy-pilot/attempts/${attemptId}/responses/${i.id}`,
  )
    .send({
      expectedRevision: 0,
      reasoning: { facts: 'Pretend supplied facts' },
    })
    .expect(422);
  await put(
    `/candidates/me/dairy-pilot/attempts/${attemptId}/responses/${i.id}`,
  )
    .send({ expectedRevision: 0, reasoning: { monitoring: 'Wrong stage' } })
    .expect(422);
  await put(`/candidates/me/attempts/${attemptId}/responses/${i.id}`)
    .send({ text: 'Unstructured bypass' })
    .expect(422);
  await expect(
    pool.query(
      'INSERT INTO candidate_responses(attempt_id,item_version_id,response) VALUES($1,$2,\'{"text":"bypass"}\')',
      [attemptId, i.id],
    ),
  ).rejects.toThrow('Structured pilot reasoning required');
});
it('saves, resumes and safely replays structured answers while rejecting stale or cross-owner edits', async () => {
  const d = await detail(),
    i = d.items[0];
  const path = `/candidates/me/dairy-pilot/attempts/${attemptId}/responses/${i.id}`;
  const body = {
    expectedRevision: 0,
    reasoning: {
      observations: 'Reported milk decline; clinical findings not confirmed.',
      interpretation: 'Herd pattern needs investigation.',
      priorities:
        'Request original records and identify urgent welfare concerns.',
    },
  };
  const saved = (await put(path).send(body).expect(200)).body;
  expect(saved.revision).toBe(1);
  expect((await put(path).send(body).expect(200)).body.replayed).toBe(true);
  await put(path)
    .send({ ...body, reasoning: { observations: 'Changed stale text' } })
    .expect(409);
  await put(path, other).send(body).expect(404);
  const resumed = await detail();
  expect(resumed.items[0].response.reasoning).toEqual(body.reasoning);
  expect(
    resumed.configuration.find(
      (s: { item_version_id: string }) => s.item_version_id === i.id,
    ).revision,
  ).toBe(1);
});
it('requires all stages, records case evidence at submission, freezes answers and never practically verifies', async () => {
  await post(`/candidates/me/dairy-pilot/attempts/${attemptId}/submit`).expect(
    409,
  );
  const d = await detail();
  for (const i of d.items.slice(1)) {
    const s = d.configuration.find(
      (s: { item_version_id: string }) => s.item_version_id === i.id,
    );
    await put(
      `/candidates/me/dairy-pilot/attempts/${attemptId}/responses/${i.id}`,
    )
      .send({
        expectedRevision: 0,
        reasoning: {
          [s.response_categories[0]]:
            'DEMO: distinguish facts and uncertainty, seek evidence, escalate safely and monitor.',
        },
      })
      .expect(200);
  }
  await post(`/candidates/me/dairy-pilot/attempts/${attemptId}/submit`).expect(
    201,
  );
  await post(`/candidates/me/dairy-pilot/attempts/${attemptId}/submit`).expect(
    201,
  );
  const submitted = await detail();
  expect(submitted.status).toBe('SUBMITTED');
  expect(submitted.evidence).toHaveLength(10);
  expect(
    submitted.evidence.every(
      (e: { facet: string; status: string; demo: boolean }) =>
        e.facet === 'CASE_ASSESSED' && e.status === 'UNVERIFIED' && e.demo,
    ),
  ).toBe(true);
  await put(
    `/candidates/me/dairy-pilot/attempts/${attemptId}/responses/${d.items[0].id}`,
  )
    .send({
      expectedRevision: 1,
      reasoning: { observations: 'Changed after submission' },
    })
    .expect(409);
  await expect(
    pool.query(
      'UPDATE candidate_responses SET response=response||\'{"extra":true}\' WHERE attempt_id=$1',
      [attemptId],
    ),
  ).rejects.toThrow();
});
it('database rejects a shape-valid mutation of a frozen pilot response', async () => {
  const d = await detail();
  await expect(
    pool.query(
      'UPDATE candidate_responses SET response=\'{"reasoning":{"observations":"Changed after submission"}}\' WHERE attempt_id=$1 AND item_version_id=$2',
      [attemptId, d.items[0].id],
    ),
  ).rejects.toThrow('Submitted response immutable');
});
it('allows owner inspection, enforces assignment and gives only the assigned assessor protected review material', async () => {
  await get(`/staff/dairy-pilot/attempts/${attemptId}`, unassigned).expect(404);
  const owner = (
    await get(`/staff/dairy-pilot/attempts/${attemptId}`, admin).expect(200)
  ).body;
  expect(owner.canReview).toBe(false);
  await post(`/admin/assessment-attempts/${attemptId}/assign`, admin)
    .send({ assessorId: candidateUser })
    .expect(403);
  await post(`/admin/assessment-attempts/${attemptId}/assign`, admin)
    .send({ assessorId: assessorUser })
    .expect(201);
  const d = (
    await get(`/staff/dairy-pilot/attempts/${attemptId}`, assessor).expect(200)
  ).body;
  expect(staffPilotSchema.safeParse(d).success).toBe(true);
  expect(d.canReview).toBe(true);
  expect(JSON.stringify(d.privateGuidance)).toContain(
    'ASSESSOR_ONLY_TEST_GUIDANCE',
  );
  expect(d.items[0].rubric.length).toBeGreaterThan(0);
  await put(
    `/assessor/dairy-pilot/attempts/${attemptId}/review-draft`,
    unassigned,
  )
    .send({
      expectedRevision: 0,
      decision: 'DEVELOPMENT_FEEDBACK',
      feedback: '',
      observations: [],
    })
    .expect(404);
});
it('saves incomplete review drafts privately and resumes the same rubric/version with audit provenance', async () => {
  const d = (await get(`/staff/dairy-pilot/attempts/${attemptId}`, assessor))
    .body;
  const partial = {
    expectedRevision: 0,
    decision: 'MORE_EVIDENCE_REQUIRED',
    feedback: 'Draft only; still reviewing.',
    observations: [
      {
        rubricCriterionId: d.items[0].rubric[0].id,
        observation: null,
        comment: '',
      },
    ],
  };
  const saved = (
    await put(
      `/assessor/dairy-pilot/attempts/${attemptId}/review-draft`,
      assessor,
    )
      .send(partial)
      .expect(200)
  ).body;
  reviewRevision = saved.revision;
  expect(
    (
      await put(
        `/assessor/dairy-pilot/attempts/${attemptId}/review-draft`,
        assessor,
      )
        .send(partial)
        .expect(200)
    ).body.replayed,
  ).toBe(true);
  const resumed = (
    await get(`/staff/dairy-pilot/attempts/${attemptId}`, assessor)
  ).body;
  expect(resumed.reviewDraft.feedback).toBe(partial.feedback);
  expect(resumed.reviewDraft.revision).toBe(reviewRevision);
  const candidateView = await detail();
  expect(candidateView.feedback).toEqual([]);
  expect(JSON.stringify(candidateView)).not.toContain(
    'Draft only; still reviewing.',
  );
  await post(`/assessor/dairy-pilot/attempts/${attemptId}/finalize`, assessor)
    .send({ expectedRevision: reviewRevision })
    .expect(422);
});
it('rejects foreign criteria, stale review writes and direct legacy finalization bypass', async () => {
  const path = `/assessor/dairy-pilot/attempts/${attemptId}/review-draft`;
  await put(path, assessor)
    .send({
      expectedRevision: reviewRevision,
      decision: 'DEVELOPMENT_FEEDBACK',
      feedback: 'Foreign rubric attempt',
      observations: [
        {
          rubricCriterionId: randomUUID(),
          observation: 'DEMONSTRATED',
          comment: 'Bad mapping',
        },
      ],
    })
    .expect(422);
  await put(path, assessor)
    .send({
      expectedRevision: 0,
      decision: 'DEVELOPMENT_FEEDBACK',
      feedback: 'Stale review overwrite',
      observations: [],
    })
    .expect(409);
  await post(`/assessor/attempts/${attemptId}/reviews`, assessor)
    .send({
      feedback: 'Legacy finalization must be blocked',
      observations: [
        {
          rubricCriterionId: randomUUID(),
          observation: 'DEMONSTRATED',
          comment: 'Bypass test',
        },
      ],
    })
    .expect(409);
});
it('finalizes exact saved qualitative judgments through the existing review engine and preserves immutable history', async () => {
  const d = (await get(`/staff/dairy-pilot/attempts/${attemptId}`, assessor))
    .body;
  const body = {
    expectedRevision: reviewRevision,
    decision: 'DEVELOPMENT_FEEDBACK',
    feedback:
      'Structured development feedback; this is demo reasoning, not practical verification.',
    observations: d.items.flatMap((i: { rubric: { id: string }[] }) =>
      i.rubric.map((c) => ({
        rubricCriterionId: c.id,
        observation: 'NEEDS_DEVELOPMENT',
        comment: 'Explain supporting evidence and distinguish assumptions.',
      })),
    ),
  };
  const draft = (
    await put(
      `/assessor/dairy-pilot/attempts/${attemptId}/review-draft`,
      assessor,
    )
      .send(body)
      .expect(200)
  ).body;
  reviewRevision = draft.revision;
  const result = (
    await post(`/assessor/dairy-pilot/attempts/${attemptId}/finalize`, assessor)
      .send({ expectedRevision: reviewRevision })
      .expect(201)
  ).body;
  expect(result.verification).toBe('UNVERIFIED');
  expect(
    (
      await post(
        `/assessor/dairy-pilot/attempts/${attemptId}/finalize`,
        assessor,
      )
        .send({ expectedRevision: reviewRevision })
        .expect(201)
    ).body.id,
  ).toBe(result.id);
  const candidateView = await detail();
  expect(candidateView.status).toBe('REVIEWED');
  expect(candidateView.feedback[0].feedback).toBe(body.feedback);
  expect(candidateView.feedback[0].assessor_id).toBe(assessorUser);
  expect(candidateView.feedback[0].observations.length).toBe(
    body.observations.length,
  );
  expect(
    candidateView.feedback[0].observations.every(
      (o: { dimensions: string[] }) => o.dimensions.length > 0,
    ),
  ).toBe(true);
  expect(JSON.stringify(candidateView)).not.toContain(
    'ASSESSOR_ONLY_TEST_GUIDANCE',
  );
  expect(
    candidateView.evidence.every(
      (e: { status: string }) => e.status === 'UNVERIFIED',
    ),
  ).toBe(true);
  await expect(
    pool.query(
      "UPDATE dairy_pilot_review_drafts SET feedback='Changed' WHERE attempt_id=$1",
      [attemptId],
    ),
  ).rejects.toThrow('Append-only');
  await expect(
    pool.query(
      'DELETE FROM dairy_pilot_review_finalizations WHERE attempt_id=$1',
      [attemptId],
    ),
  ).rejects.toThrow('Append-only');
});
it('can recover a lost finalization response by replaying the identical saved review', async () => {
  const d = (await get(`/staff/dairy-pilot/attempts/${attemptId}`, assessor))
    .body;
  const draft = d.reviewDraft;
  const r = (
    await put(
      `/assessor/dairy-pilot/attempts/${attemptId}/review-draft`,
      assessor,
    )
      .send({
        expectedRevision: reviewRevision - 1,
        decision: draft.decision,
        feedback: draft.feedback,
        observations: draft.observations,
      })
      .expect(200)
  ).body;
  expect(r.replayed).toBe(true);
});
it('keeps feedback/evidence distinct from practical verification and professional readiness', async () => {
  const d = (await get('/candidates/me/dairy-pilot').expect(200)).body;
  expect(d.readiness).toBeNull();
  expect(d.competencies.length).toBeGreaterThan(0);
  expect(
    d.competencies.every(
      (c: { validation_status: string }) => c.validation_status === 'PROPOSED',
    ),
  ).toBe(true);
  expect(d.practicalVerification).toBe('PENDING_SEPARATE_SUPERVISED_PROCESS');
  expect(d.attempts[0].status).toBe('REVIEWED');
  expect(d.attempts[0].saved).toBe(10);
  const evidence = (await detail()).evidence[0];
  await post(`/assessor/evidence/${evidence.id}/reviews`, assessor)
    .send({
      outcome: 'VERIFIED',
      reason: 'Must not verify demonstration case evidence.',
    })
    .expect(409);
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM competency_evidence WHERE status='VERIFIED'",
      )
    ).rows[0].count,
  ).toBe('0');
});
it('freezes pilot configuration and private guidance on release, while preserving response concurrency clocks', async () => {
  for (const sql of [
    "UPDATE dairy_pilot_guidance SET assessor_guidance='Changed guidance' WHERE assessment_version_id=$1",
    'DELETE FROM dairy_pilot_stages WHERE assessment_version_id=$1',
    "UPDATE dairy_pilot_versions SET supplied_evidence='[]' WHERE assessment_version_id=$1",
  ])
    await expect(pool.query(sql, [caseId])).rejects.toThrow('immutable');
  await expect(
    pool.query(
      'UPDATE dairy_pilot_response_revisions SET revision=99 WHERE attempt_id=$1',
      [attemptId],
    ),
  ).rejects.toThrow('generated');
});
it('keeps migration/seed reruns checksummed and preserves all finalized feedback and audit records', async () => {
  const counts = (
    await pool.query(
      'SELECT (SELECT count(*) FROM dairy_pilot_review_drafts) AS drafts,(SELECT count(*) FROM dairy_pilot_review_finalizations) AS finals',
    )
  ).rows;
  const migrations = (
    await pool.query('SELECT * FROM schema_migrations ORDER BY name')
  ).rows;
  script('scripts/migrate.ts');
  script('scripts/seed.ts');
  expect(
    (await pool.query('SELECT * FROM schema_migrations ORDER BY name')).rows,
  ).toEqual(migrations);
  expect(migrations).toHaveLength(12);
  expect(
    (
      await pool.query(
        'SELECT (SELECT count(*) FROM dairy_pilot_review_drafts) AS drafts,(SELECT count(*) FROM dairy_pilot_review_finalizations) AS finals',
      )
    ).rows,
  ).toEqual(counts);
  for (const action of [
    'dairy.pilot.prepared',
    'dairy.review.draft.saved',
    'dairy.review.finalized',
  ])
    expect(
      Number(
        (
          await pool.query(
            'SELECT count(*) FROM audit_events WHERE action=$1',
            [action],
          )
        ).rows[0].count,
      ),
    ).toBeGreaterThan(0);
});

it('rejects concurrent stale response edits without losing the winning answer', async () => {
  const second = (await post('/dairy-pilot/attempts').expect(201)).body.id;
  const d = (await get(`/candidates/me/dairy-pilot/attempts/${second}`)).body;
  const item = d.items[0].id;
  const path = `/candidates/me/dairy-pilot/attempts/${second}/responses/${item}`;
  const replies = await Promise.all(
    ['First distinct observation', 'Second distinct observation'].map((text) =>
      put(path).send({
        expectedRevision: 0,
        reasoning: { observations: text },
      }),
    ),
  );
  expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
  const stored = (await get(`/candidates/me/dairy-pilot/attempts/${second}`))
    .body.items[0].response.reasoning.observations;
  expect([
    'First distinct observation',
    'Second distinct observation',
  ]).toContain(stored);
});
it('requires a fresh review revision after returned moderation while preserving the earlier feedback', async () => {
  const previous = (await detail()).feedback[0];
  await post(`/admin/assessment-reviews/${previous.id}/moderations`, admin)
    .send({
      outcome: 'RETURNED',
      reason: 'Synthetic moderation requests reconsideration.',
    })
    .expect(201);
  const d = (await get(`/staff/dairy-pilot/attempts/${attemptId}`, assessor))
    .body;
  const draft = d.reviewDraft;
  const saved = (
    await put(
      `/assessor/dairy-pilot/attempts/${attemptId}/review-draft`,
      assessor,
    )
      .send({
        expectedRevision: draft.revision,
        decision: draft.decision,
        feedback: draft.feedback,
        observations: draft.observations,
      })
      .expect(200)
  ).body;
  expect(saved.revision).toBe(draft.revision + 1);
  await pool.query(
    "CREATE FUNCTION fail_dairy_final_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='dairy.review.finalized' THEN RAISE EXCEPTION 'Synthetic final audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_dairy_final_audit_test BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_dairy_final_audit_test()",
  );
  try {
    await post(`/assessor/dairy-pilot/attempts/${attemptId}/finalize`, assessor)
      .send({ expectedRevision: saved.revision })
      .expect(500);
    expect((await detail()).status).toBe('SUBMITTED');
    expect((await detail()).feedback).toHaveLength(1);
  } finally {
    await pool.query(
      'DROP TRIGGER fail_dairy_final_audit_test ON audit_events;DROP FUNCTION fail_dairy_final_audit_test()',
    );
  }
  await post(`/assessor/dairy-pilot/attempts/${attemptId}/finalize`, assessor)
    .send({ expectedRevision: saved.revision })
    .expect(201);
  const final = await detail();
  expect(final.feedback).toHaveLength(2);
  expect(
    final.feedback.find((f: { id: string }) => f.id === previous.id).moderation,
  ).toBe('RETURNED');
});
