import { z } from 'zod';
import {
  developmentDetailSchema,
  verificationProjectionSchema,
} from '@vetready/contracts';
import { employerExplanationSchema } from '../../apps/web/lib/recruitment';
import { competencyProfileResponseSchema } from '../../apps/web/lib/competency-profile';
import { dairyJourney } from '../../apps/web/lib/dairy-journey';
import { pilotDashboardSchema } from '../../apps/web/lib/dairy-pilot';
import { attemptsSchema } from '../../apps/web/lib/assessment';
import {
  pilotAttemptSchema,
  staffPilotSchema,
} from '../../apps/web/lib/dairy-pilot';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import { createApp } from '../../apps/api/dist/app';
import { encryptCookie } from '../../apps/web/lib/oidc';
import { prepareTestDatabase } from '../helpers/database';
import {
  syntheticVerificationGovernance,
  authorizeSyntheticAssessor,
} from '../helpers/verification';
import { testIssuer } from '../helpers/issuer';
let web: ChildProcess,
  app: INestApplication,
  pool: Pool,
  identity: Awaited<ReturnType<typeof testIssuer>>;
let origin: string,
  apiOrigin: string,
  candidate: string,
  admin: string,
  assessor: string,
  candidateCookie: string,
  adminCookie: string,
  assessorCookie: string,
  syntheticSessionKey: string,
  caseId: string,
  attemptId: string;
async function http(
  path: string,
  token: string,
  method = 'GET',
  body?: unknown,
) {
  return fetch(`${apiOrigin}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
beforeAll(async () => {
  const db = await prepareTestDatabase();
  pool = db.pool;
  identity = await testIssuer();
  app = await createApp({
    DATABASE_URL: db.url,
    OIDC_ISSUER: identity.issuer,
    OIDC_JWKS_URI: identity.issuer + '/jwks',
    OIDC_AUDIENCE: 'vetready-api',
    NODE_ENV: 'test',
    PORT: 4000,
  });
  await app.listen(0, '127.0.0.1');
  apiOrigin = await app.getUrl();
});
beforeAll(async () => {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('No local port');
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  origin = `http://127.0.0.1:${port}`;
  syntheticSessionKey = randomBytes(32).toString('hex');
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'start',
      'apps/web',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        APP_ORIGIN: origin,
        API_INTERNAL_URL: apiOrigin,
        OIDC_ISSUER: identity.issuer,
        OIDC_AUDIENCE: 'vetready-api',
        OIDC_CLIENT_ID: 'synthetic-dairy-web',
        OIDC_CLIENT_SECRET: randomBytes(32).toString('hex'),
        SESSION_SECRET: syntheticSessionKey,
      },
      stdio: 'pipe',
    },
  );
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Poll until the isolated web test process is listening. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Web test server unavailable');
});
beforeAll(async () => {
  candidate = await identity.token('dairy-web-candidate');
  admin = await identity.token('dairy-web-admin');
  assessor = await identity.token('dairy-web-assessor');
  const adminId = z
      .object({ id: z.uuid() })
      .parse(await (await http('/me', admin)).json()).id,
    assessorId = z
      .object({ id: z.uuid() })
      .parse(await (await http('/me', assessor)).json()).id;
  for (const [id, role] of [
    [adminId, 'ADMIN'],
    [assessorId, 'ASSESSOR'],
  ])
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,$2,'PLATFORM','Synthetic dairy SSR fixture')",
      [id, role],
    );
  expect(
    (
      await http('/candidates/me', candidate, 'PUT', {
        fullName: 'Synthetic Web Candidate',
        countryCode: 'NG',
        state: 'Kano',
        willingToRelocate: true,
        drivingAbility: false,
      })
    ).status,
  ).toBe(200);
  const cookie = async (token: string) => {
    const r = await http('/sessions', token, 'POST');
    expect(r.status).toBe(201);
    const s = z.object({ handle: z.string() }).parse(await r.json());
    return `vetready_session=${await encryptCookie({ accessToken: token, sessionHandle: s.handle }, syntheticSessionKey, 'session', 300)}`;
  };
  candidateCookie = await cookie(candidate);
  adminCookie = await cookie(admin);
  assessorCookie = await cookie(assessor);
});
afterAll(async () => {
  if (web && web.exitCode === null) {
    web.kill('SIGTERM');
    await once(web, 'exit');
  }
  await app?.close();
  await pool?.end();
  await identity?.close();
});
it('renders the initial owner preparation page before any pilot configuration exists, then prepares and releases the demo', async () => {
  const page = await fetch(origin + '/dairy/review', {
    headers: { cookie: adminCookie },
  });
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('Prepare dairy demo draft');
  const configured = await http('/admin/dairy-pilot', admin, 'POST');
  expect(configured.status).toBe(201);
  caseId = z.object({ id: z.uuid() }).parse(await configured.json()).id;
  await pool.query(
    "UPDATE dairy_pilot_guidance SET assessor_guidance='PRIVATE_DAIRY_SSR_SENTINEL — proposed guidance' WHERE assessment_version_id=$1",
    [caseId],
  );
  expect(
    (await http(`/admin/assessments/${caseId}/release-demo`, admin, 'POST'))
      .status,
  ).toBe(201);
  attemptId = z
    .object({ id: z.uuid() })
    .parse(
      await (await http('/dairy-pilot/attempts', candidate, 'POST')).json(),
    ).id;
});
it('renders the signed-in dairy dashboard and candidate reasoning form without protected material or bearer tokens', async () => {
  const dashboard = await fetch(origin + '/dairy', {
    headers: { cookie: candidateCookie },
  });
  expect(dashboard.status).toBe(200);
  const home = await dashboard.text();
  expect(home).toContain('Commercial Dairy Practice');
  expect(home).toContain('Practical verification');
  const response = await fetch(`${origin}/dairy/cases/${attemptId}`, {
    headers: { cookie: candidateCookie },
  });
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('Available evidence');
  expect(html).toContain('My observations');
  expect(html).toContain('Assumptions and limitations');
  expect(html).toContain('Save this stage');
  expect(html).not.toContain('PRIVATE_DAIRY_SSR_SENTINEL');
  expect(html).not.toContain(candidate);
  expect(html).not.toContain('accessToken');
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it('denies candidate staff inspection and saves a complete server-side case for authorized review', async () => {
  const forbidden = await fetch(origin + '/dairy/review', {
    headers: { cookie: candidateCookie },
  });
  expect(await forbidden.text()).toContain('Assigned staff access is required');
  const d = pilotAttemptSchema.parse(
    await (
      await http(`/candidates/me/dairy-pilot/attempts/${attemptId}`, candidate)
    ).json(),
  );
  for (const i of d.items) {
    const config = d.configuration.find(
      (c: { item_version_id: string }) => c.item_version_id === i.id,
    );
    const category = config?.response_categories[0];
    if (!category) throw new Error('Missing governed stage configuration');
    expect(
      (
        await http(
          `/candidates/me/dairy-pilot/attempts/${attemptId}/responses/${i.id}`,
          candidate,
          'PUT',
          {
            expectedRevision: 0,
            reasoning: {
              [category]:
                'Synthetic candidate investigation reasoning; no diagnosis established.',
            },
          },
        )
      ).status,
    ).toBe(200);
  }
  expect(
    (
      await http(
        `/candidates/me/dairy-pilot/attempts/${attemptId}/submit`,
        candidate,
        'POST',
      )
    ).status,
  ).toBe(201);
  const assessorId = z
    .object({ id: z.uuid() })
    .parse(await (await http('/me', assessor)).json()).id;
  expect(
    (
      await http(
        `/admin/assessment-attempts/${attemptId}/assign`,
        admin,
        'POST',
        { assessorId },
      )
    ).status,
  ).toBe(201);
});
it('renders private assigned-assessor judgments and draft controls only in the authorized staff page', async () => {
  const response = await fetch(`${origin}/dairy/review?attempt=${attemptId}`, {
    headers: { cookie: assessorCookie },
  });
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('PRIVATE_DAIRY_SSR_SENTINEL');
  expect(html).toContain('Save private review draft');
  expect(html).toContain('Finalize candidate feedback');
  expect(html).toContain('Synthetic candidate investigation reasoning');
  expect(html).not.toContain(assessor);
  expect(html).not.toContain('accessToken');
});
it('shows finalized structured feedback to the candidate while hiding assessor guidance and preserving unverified evidence', async () => {
  const d = staffPilotSchema.parse(
    await (
      await http(`/staff/dairy-pilot/attempts/${attemptId}`, assessor)
    ).json(),
  );
  const draft = await http(
    `/assessor/dairy-pilot/attempts/${attemptId}/review-draft`,
    assessor,
    'PUT',
    {
      expectedRevision: 0,
      decision: 'MORE_EVIDENCE_REQUIRED',
      feedback: 'Synthetic finalized development feedback for the candidate.',
      observations: d.items.flatMap((i: { rubric: { id: string }[] }) =>
        i.rubric.map((c) => ({
          rubricCriterionId: c.id,
          observation: 'NEEDS_DEVELOPMENT',
          comment: 'Explain the evidence and uncertainty more clearly.',
        })),
      ),
    },
  );
  expect(draft.status).toBe(200);
  expect(
    (
      await http(
        `/assessor/dairy-pilot/attempts/${attemptId}/finalize`,
        assessor,
        'POST',
        {
          expectedRevision: z
            .object({ revision: z.number() })
            .parse(await draft.json()).revision,
        },
      )
    ).status,
  ).toBe(201);
  const response = await fetch(`${origin}/dairy/cases/${attemptId}`, {
    headers: { cookie: candidateCookie },
  });
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(html).toContain('Synthetic finalized development feedback');
  expect(html).toContain('UNVERIFIED');
  expect(html).not.toContain('PRIVATE_DAIRY_SSR_SENTINEL');
  expect(html).not.toContain('name="observations"');
  const expired = await fetch(`${origin}/dairy/cases/${attemptId}`);
  expect(await expired.text()).not.toContain(
    'Synthetic finalized development feedback',
  );
});
it('renders governed dairy learning, source caveats and resumable unscored activities without assessor material or tokens', async () => {
  const prepared = await http('/admin/dairy-learning/starter', admin, 'POST');
  expect(prepared.status).toBe(201);
  const { courseVersionId } = z
    .object({ courseVersionId: z.uuid() })
    .parse(await prepared.json());
  const hidden = await fetch(origin + '/dairy/learning', {
    headers: { cookie: candidateCookie },
  });
  expect(await hidden.text()).not.toContain(
    'Investigating transition and fresh-cow concerns',
  );
  expect(
    (
      await http(
        `/admin/training/versions/${courseVersionId}/release-demo`,
        admin,
        'POST',
      )
    ).status,
  ).toBe(201);
  const enrolled = await http(
    `/training/versions/${courseVersionId}/enrollments`,
    candidate,
    'POST',
  );
  expect(enrolled.status).toBe(201);
  const { id } = z.object({ id: z.uuid() }).parse(await enrolled.json());
  const page = await fetch(`${origin}/dairy/learning/${id}`, {
    headers: { cookie: candidateCookie },
  });
  expect(page.status).toBe(200);
  const html = await page.text();
  expect(html).toContain('Learning objectives');
  expect(html).toContain('Unscored learning activity');
  expect(html).toContain('Saving does not award');
  expect(html).toContain('REQUIRES DOMAIN EXPERT VALIDATION');
  expect(html).toContain('Start / resume linked dairy case');
  expect(html).not.toContain('PRIVATE_DAIRY_SSR_SENTINEL');
  expect(html).not.toContain(candidate);
  expect(html).not.toContain('accessToken');
  const anonymous = await fetch(`${origin}/dairy/learning/${id}`);
  expect(await anonymous.text()).not.toContain('Candidate reasoning preserved');
  expect(
    await (
      await fetch(origin + '/dairy/learning/manage', {
        headers: { cookie: candidateCookie },
      })
    ).text(),
  ).toContain('Authorized owner access');
});

it('renders private practical drafts, declarations and proposed gaps without exposing tokens or evidence anonymously', async () => {
  const options = z
    .array(z.object({ pathwayVersionId: z.uuid(), childVersionId: z.uuid() }))
    .parse(
      await (await http('/candidates/me/practical/options', candidate)).json(),
    );
  const first = options[0];
  if (!first) throw new Error('Practical mapping fixture required');
  const created = await http('/candidates/me/practical', candidate, 'POST', {
    pathwayVersionId: first.pathwayVersionId,
    kind: 'SUPERVISED_TASK',
  });
  expect(created.status).toBe(201);
  const id = z.object({ id: z.uuid() }).parse(await created.json()).id;
  const saved = await http(`/candidates/me/practical/${id}`, candidate, 'PUT', {
    commandId: randomUUID(),
    expectedRevision: 0,
    payload: {
      summary: 'PRIVATE_PRACTICAL_SSR_ACTIVITY',
      context: { task: 'Synthetic activity account' },
      targets: [
        {
          childVersionId: first.childVersionId,
          requestedFacet: 'PRACTICALLY_VERIFIED',
        },
      ],
    },
  });
  expect(saved.status).toBe(200);
  const page = await fetch(`${origin}/practical/${id}`, {
    headers: { cookie: candidateCookie },
  });
  const html = await page.text();
  expect(page.status).toBe(200);
  expect(html).toContain('PRIVATE_PRACTICAL_SSR_ACTIVITY');
  expect(html).toContain('Save partial draft');
  expect(html).toContain('Declare and submit');
  expect(html).toContain('Explainable evidence gaps');
  expect(html).not.toContain(candidate);
  expect(html).not.toContain('accessToken');
  expect(page.headers.get('cache-control')).toContain('no-store');
  expect(await (await fetch(`${origin}/practical/${id}`)).text()).not.toContain(
    'PRIVATE_PRACTICAL_SSR_ACTIVITY',
  );
  const staff = await fetch(`${origin}/practical/review/${id}`, {
    headers: { cookie: assessorCookie },
  });
  expect(await staff.text()).not.toContain('PRIVATE_PRACTICAL_SSR_ACTIVITY');
  const submitted = await http(
    `/candidates/me/practical/${id}/submit`,
    candidate,
    'POST',
    { expectedRevision: 1, declaration: true },
  );
  expect(submitted.status).toBe(201);
  const assessorId = z
    .object({ id: z.uuid() })
    .parse(await (await http('/me', assessor)).json()).id;
  expect(
    (
      await http(`/admin/practical/${id}/assignments`, admin, 'POST', {
        assessorId,
        reason: 'Synthetic private practical assignment',
      })
    ).status,
  ).toBe(201);
  const reviewHtml = await (
    await fetch(`${origin}/practical/review/${id}`, {
      headers: { cookie: assessorCookie },
    })
  ).text();
  expect(reviewHtml).toContain('PRIVATE_PRACTICAL_SSR_ACTIVITY');
  expect(reviewHtml).toContain('Finalize immutable decision');
  const ownerHtml = await (
    await fetch(`${origin}/practical/${id}`, {
      headers: { cookie: candidateCookie },
    })
  ).text();
  expect(ownerHtml).not.toContain('Finalize immutable decision');
  expect(ownerHtml).toContain('Candidate declaration');
  expect(
    (
      await http(`/assessor/practical/${id}/decisions`, assessor, 'POST', {
        outcome: 'NEEDS_REVISION',
        rationale: 'Synthetic practical development feedback',
        conflictDeclaredClear: true,
      })
    ).status,
  ).toBe(201);
  const reviewedHtml = await (
    await fetch(`${origin}/practical/${id}`, {
      headers: { cookie: candidateCookie },
    })
  ).text();
  expect(reviewedHtml).toContain('Synthetic practical development feedback');
  expect(reviewedHtml).toContain('Create successor draft');
  expect(reviewedHtml).toContain('No verified competence');
});

it('renders private competency and passport views without practical narratives, review notes or tokens', async () => {
  for (const path of ['/competencies', '/skills-passport']) {
    const response = await fetch(origin + path, {
      headers: { cookie: candidateCookie },
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('Readiness: unavailable');
    expect(html).toContain('Professional');
    expect(html).toContain('unconfigured');
    expect(html).not.toContain('PRIVATE_PRACTICAL_SSR_ACTIVITY');
    expect(html).not.toContain('Synthetic practical development feedback');
    expect(html).not.toContain(candidate);
    expect(html).not.toContain('accessToken');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await (await fetch(origin + path)).text()).toContain('Sign in');
  }
  const p = competencyProfileResponseSchema.parse(
    await (await http('/candidates/me/competency-profile', candidate)).json(),
  );
  const child = p.competencies[0]!;
  const detail = await (
    await fetch(`${origin}/competencies/${child.id}`, {
      headers: { cookie: candidateCookie },
    })
  ).text();
  expect(detail).toContain(child.code);
  expect(detail).not.toContain('PRIVATE_PRACTICAL_SSR_ACTIVITY');
  const saved = await http(
    '/candidates/me/competency-profile/snapshots',
    candidate,
    'POST',
    { commandId: randomUUID() },
  );
  expect(saved.status).toBe(201);
  const receipt = z.object({ id: z.uuid() }).parse(await saved.json());
  const path = `${origin}/competencies/snapshots/${receipt.id}`;
  const historical = await (
    await fetch(path, { headers: { cookie: candidateCookie } })
  ).text();
  expect(historical).toContain('Historical');
  expect(historical).toContain('Input SHA-256');
  expect(historical).not.toContain('PRIVATE_PRACTICAL_SSR_ACTIVITY');
  expect(
    await (await fetch(path, { headers: { cookie: assessorCookie } })).text(),
  ).not.toContain('Input SHA-256');
});

it('runs a consented candidate-to-employer technical shortlist and immediately blocks revoked access', async () => {
  const org = z.object({ id: z.uuid() }).parse(
    await (
      await http('/organizations', assessor, 'POST', {
        displayName: 'Synthetic SSR Pilot Employer',
        sector: 'Technical protocol testing',
        countryCode: 'NG',
      })
    ).json(),
  ).id;
  expect(
    (
      await http(
        `/pilot/admin/organizations/${org}/verification`,
        admin,
        'POST',
        {
          commandId: randomUUID(),
          status: 'VERIFIED',
          reason: 'Independent synthetic employer protocol review',
        },
      )
    ).status,
  ).toBe(201);
  const p = (
    await pool.query(
      'SELECT id,pathway_id FROM pathway_versions ORDER BY id LIMIT 1',
    )
  ).rows[0];
  expect(
    (await http(`/candidates/me/pathways/${p.pathway_id}`, candidate, 'POST'))
      .status,
  ).toBe(201);
  const created = await http(
    `/pilot/organizations/${org}/opportunities`,
    assessor,
    'POST',
    {
      commandId: randomUUID(),
      content: {
        title: 'Controlled SSR technical opportunity',
        description:
          'Technical testing only; no professional standards or hiring decisions.',
        pathwayVersionId: p.id,
        requirements: [
          { id: randomUUID(), kind: 'PATHWAY_INTEREST', mandatory: true },
        ],
      },
    },
  );
  expect(created.status).toBe(201);
  const job = z
    .object({ id: z.uuid(), versionId: z.uuid() })
    .parse(await created.json());
  expect(
    (
      await http(
        `/pilot/organizations/${org}/opportunities/${job.id}/transitions`,
        assessor,
        'POST',
        { commandId: randomUUID(), expectedVersion: 1, action: 'PUBLISH' },
      )
    ).status,
  ).toBe(201);
  const candidatePage = await fetch(origin + '/opportunities', {
      headers: { cookie: candidateCookie },
    }),
    html = await candidatePage.text();
  expect(candidatePage.status).toBe(200);
  expect(html).toContain('Controlled SSR technical opportunity');
  expect(html).toContain('pilot-share-1');
  expect(html).toContain('No public candidate search');
  expect(html).not.toContain('PRIVATE_PRACTICAL_SSR_ACTIVITY');
  expect(html).not.toContain(candidate);
  expect(candidatePage.headers.get('cache-control')).toContain('no-store');
  expect(await (await fetch(origin + '/opportunities')).text()).toContain(
    'Sign in',
  );
  const snapshot = z
    .object({ id: z.uuid() })
    .parse(
      await (
        await http(
          '/candidates/me/competency-profile/snapshots',
          candidate,
          'POST',
          { commandId: randomUUID() },
        )
      ).json(),
    ).id;
  const applied = await http(
    `/pilot/opportunities/${job.id}/applications`,
    candidate,
    'POST',
    {
      commandId: randomUUID(),
      jobVersionId: job.versionId,
      snapshotId: snapshot,
      consent: true,
      consentVersion: 'pilot-share-1',
    },
  );
  expect(applied.status).toBe(201);
  const a = z.object({ id: z.uuid() }).parse(await applied.json()).id;
  const list = await fetch(`${origin}/employer-pilot?org=${org}`, {
    headers: { cookie: assessorCookie },
  });
  const listHtml = await list.text();
  expect(list.status).toBe(200);
  expect(listHtml).toContain('Candidate alias');
  expect(listHtml).not.toContain('Synthetic Web Candidate');
  expect(listHtml).not.toContain('PRIVATE_PRACTICAL_SSR_ACTIVITY');
  expect(listHtml).not.toContain('Synthetic practical development feedback');
  expect(listHtml).not.toContain(candidate);
  const calculated = await http(
    `/pilot/organizations/${org}/applications/${a}/evaluations`,
    assessor,
    'POST',
    { commandId: randomUUID() },
  );
  expect(calculated.status).toBe(201);
  const evaluation = z
    .object({ id: z.uuid() })
    .parse(await calculated.json()).id;
  const explanation = employerExplanationSchema.parse(
    await (
      await http(
        `/pilot/organizations/${org}/applications/${a}/evaluations/${evaluation}`,
        assessor,
      )
    ).json(),
  );
  expect(explanation.projection.eligibility).toBe('ELIGIBLE');
  expect(explanation.projection.fit.score).toBeNull();
  const url = `${origin}/employer-pilot?org=${org}&application=${a}&evaluation=${evaluation}`;
  const detail = await (
    await fetch(url, { headers: { cookie: assessorCookie } })
  ).text();
  expect(detail).toContain('Explainable technical evaluation');
  expect(detail).toContain('Record human shortlist');
  expect(detail).not.toContain('PRIVATE_PRACTICAL_SSR_ACTIVITY');
  expect(detail).not.toContain('Synthetic Web Candidate');
  expect(
    (
      await http(
        `/pilot/organizations/${org}/applications/${a}/shortlist`,
        assessor,
        'POST',
        {
          commandId: randomUUID(),
          evaluationId: evaluation,
          expectedRevision: 0,
          action: 'SHORTLIST',
        },
      )
    ).status,
  ).toBe(201);
  expect(
    await (
      await fetch(`${origin}/employer-pilot?org=${org}`, {
        headers: { cookie: assessorCookie },
      })
    ).text(),
  ).toContain('SHORTLIST');
  expect(
    (
      await http(
        `/pilot/candidates/me/applications/${a}/revoke-access`,
        candidate,
        'POST',
        { commandId: randomUUID() },
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await http(
        `/pilot/organizations/${org}/applications/${a}/evaluations/${evaluation}`,
        assessor,
      )
    ).status,
  ).toBe(404);
  const revoked = await (
    await fetch(url, { headers: { cookie: assessorCookie } })
  ).text();
  expect(revoked).not.toContain(explanation.projection.candidateAlias);
  expect(revoked).not.toContain('Explainable technical evaluation');
  expect(revoked).toContain('unavailable or stale');
  const own = await (
    await fetch(origin + '/opportunities', {
      headers: { cookie: candidateCookie },
    })
  ).text();
  expect(own).toContain('revoked');
  expect(own).toContain('Withdraw application');
});

it('connects private dairy gaps to explicitly mapped demo learning and separate case follow-up without qualification', async () => {
  const path = (
    await pool.query(
      "SELECT v.id FROM pathway_versions v JOIN pathways p ON p.id=v.pathway_id WHERE p.code='DAIRY' ORDER BY v.version DESC LIMIT 1",
    )
  ).rows[0].id;
  const created = await http(
    '/candidates/me/development-workflows',
    candidate,
    'POST',
    { commandId: randomUUID(), pathwayVersionId: path },
  );
  expect(created.status).toBe(201);
  const plan = z.object({ id: z.uuid() }).parse(await created.json()).id;
  const endpoint = `/candidates/me/development-workflows/${plan}`;
  const first = developmentDetailSchema.parse(
    await (await http(endpoint, candidate)).json(),
  );
  expect(
    first.items.some(
      (i: { recommendations: unknown[] }) => i.recommendations.length,
    ),
  ).toBe(true);
  const navigation = await (
    await fetch(origin + '/development/next-steps', {
      headers: { cookie: candidateCookie },
    })
  ).text();
  expect(navigation).toContain('My next steps');
  const url = origin + `/development/next-steps/${plan}`;
  const initial = await (
    await fetch(url, { headers: { cookie: candidateCookie } })
  ).text();
  expect(initial).toContain('My development plan');
  expect(initial).toContain('Open or resume learning');
  expect(initial).toContain('professional requirements are unconfigured');
  expect(initial).not.toContain(candidate);
  expect(initial).not.toContain('PRIVATE_DAIRY_SSR_SENTINEL');
  const c = first.courses[0]!;
  const start = await http(
    `${endpoint}/courses/${c.id}/start`,
    candidate,
    'POST',
  );
  expect(start.status).toBe(201);
  const enrollment = z.object({ id: z.uuid() }).parse(await start.json()).id;
  const learning = z
    .object({
      course: z.object({
        modules: z.array(
          z.object({
            lessons: z.array(z.object({ id: z.uuid(), revision: z.number() })),
          }),
        ),
      }),
    })
    .parse(
      await (
        await http(
          '/candidates/me/training/enrollments/' + enrollment,
          candidate,
        )
      ).json(),
    );
  for (const m of learning.course.modules)
    for (const l of m.lessons) {
      const result = await http(
        `/candidates/me/training/enrollments/${enrollment}/lessons/${l.id}/progress`,
        candidate,
        'PUT',
        {
          commandId: randomUUID(),
          expectedRevision: l.revision,
          state: 'COMPLETED',
          resumePosition: 0,
        },
      );
      expect(result.status).toBe(200);
    }
  const updated = await (
    await fetch(url, { headers: { cookie: candidateCookie } })
  ).text();
  expect(updated).toContain(
    'competency gap has not been automatically resolved',
  );
  expect(updated).toContain('demo case follow-up');
  const final = developmentDetailSchema.parse(
    await (await http(endpoint, candidate)).json(),
  );
  expect(final.itemsDigest).toBe(first.itemsDigest);
  expect(final.professionalDetermination).toBeNull();
  expect(final.policyStatus).toBe('UNCONFIGURED');
  expect(final.courses[0]!.courseLevelFollowUps).toEqual([]);
  const follow = final.competencyFollowUps
    .filter((f) => f.courseVersionId === final.courses[0]!.id)
    .flatMap((f) => f.followUps)[0]!;
  expect(follow.scope).toBe('COMPETENCY_MAPPING');
  expect(follow.mappingIds.length).toBeGreaterThan(0);
  expect(
    (await http(`/assessments/${follow.id}/attempts`, candidate, 'POST'))
      .status,
  ).toBe(201);
  const anonymous = await (await fetch(url)).text();
  expect(anonymous).not.toContain('My development plan');
});
it('continues the completed dairy development journey through governed verification and the private Passport', async () => {
  const plans = z
    .array(z.object({ id: z.uuid() }))
    .parse(
      await (
        await http('/candidates/me/development-workflows', candidate)
      ).json(),
    );
  const plan = developmentDetailSchema.parse(
    await (
      await http(
        `/candidates/me/development-workflows/${plans[0]!.id}`,
        candidate,
      )
    ).json(),
  );
  expect(
    plan.courses.some((c) => c.progress.state === 'LEARNING_COMPLETED'),
  ).toBe(true);
  expect(plan.courses.every((c) => c.progress.gapResolved === false)).toBe(
    true,
  );
  const before = competencyProfileResponseSchema.parse(
    await (await http('/candidates/me/competency-profile', candidate)).json(),
  );
  expect(before.governedVerification ?? []).toEqual([]);
  const user = async (token: string) =>
    z.object({ id: z.uuid() }).parse(await (await http('/me', token)).json())
      .id;
  const governor = await identity.token('synthetic-verification-governor');
  const g = await syntheticVerificationGovernance(pool, {
    governor: await user(governor),
    author: await user(admin),
    assessor: await user(assessor),
    path: plan.pathwayVersionId,
  });
  // Delivered demo definitions cannot be approved in place. Add only a clearly
  // synthetic software competency before releasing its explicitly mapped course.
  const courseResponse = await http('/admin/training/courses', admin, 'POST', {
    code: 'SYNTHETIC_3J_' + randomUUID().replaceAll('-', '').toUpperCase(),
    content: {
      title: 'Synthetic verification protocol practice',
      pathwayVersionIds: [g.path],
      competencyMappings: [
        { pathwayVersionId: g.path, childVersionId: g.child },
      ],
      modules: [
        {
          code: 'PROTOCOL',
          title: 'Software fixture',
          lessons: [
            {
              code: 'READING',
              title: 'Synthetic practice',
              body: 'Software protocol fixture only. No veterinary standard.',
            },
          ],
        },
      ],
    },
  });
  expect(courseResponse.status).toBe(201);
  const course = z
    .object({ courseVersionId: z.uuid() })
    .parse(await courseResponse.json()).courseVersionId;
  expect(
    (
      await http(
        `/admin/training/versions/${course}/release-demo`,
        admin,
        'POST',
      )
    ).status,
  ).toBe(201);
  const receipt = await http(
    '/candidates/me/development-workflows',
    candidate,
    'POST',
    { commandId: randomUUID(), pathwayVersionId: g.path },
  );
  expect(receipt.status).toBe(201);
  const nextPlan = z.object({ id: z.uuid() }).parse(await receipt.json()).id;
  const needs = developmentDetailSchema.parse(
    await (
      await http(`/candidates/me/development-workflows/${nextPlan}`, candidate)
    ).json(),
  );
  expect(
    needs.items
      .find((i) => i.childVersionId === g.child)
      ?.recommendations.some((r) => r.courseVersionId === course),
  ).toBe(true);
  const enrolled = await http(
    `/candidates/me/development-workflows/${nextPlan}/courses/${course}/start`,
    candidate,
    'POST',
  );
  expect(enrolled.status).toBe(201);
  const enrollment = z.object({ id: z.uuid() }).parse(await enrolled.json()).id;
  const learning = z
    .object({
      course: z.object({
        modules: z.array(
          z.object({
            lessons: z.array(z.object({ id: z.uuid(), revision: z.number() })),
          }),
        ),
      }),
    })
    .parse(
      await (
        await http(
          `/candidates/me/training/enrollments/${enrollment}`,
          candidate,
        )
      ).json(),
    );
  for (const m of learning.course.modules)
    for (const l of m.lessons)
      expect(
        (
          await http(
            `/candidates/me/training/enrollments/${enrollment}/lessons/${l.id}/progress`,
            candidate,
            'PUT',
            {
              commandId: randomUUID(),
              expectedRevision: l.revision,
              state: 'COMPLETED',
              resumePosition: 0,
            },
          )
        ).status,
      ).toBe(200);
  const completed = developmentDetailSchema.parse(
    await (
      await http(`/candidates/me/development-workflows/${nextPlan}`, candidate)
    ).json(),
  );
  expect(
    completed.courses.find((c) => c.id === course)?.progress,
  ).toMatchObject({ state: 'LEARNING_COMPLETED', gapResolved: false });
  const unresolved = competencyProfileResponseSchema.parse(
    await (await http('/candidates/me/competency-profile', candidate)).json(),
  );
  expect(unresolved.governedVerification ?? []).toEqual([]);
  expect(
    unresolved.competencies
      .find((c) => c.id === g.child)
      ?.facets.find((f) => f.facet === 'PRACTICALLY_VERIFIED')?.state,
  ).not.toBe('VERIFIED');
  const created = await http(
    '/candidates/me/verifications',
    candidate,
    'POST',
    {
      commandId: randomUUID(),
      rubricVersionId: g.rubric,
      summary: 'PRIVATE_3J_ACCOUNT synthetic owned supervised evidence',
      activity: 'Synthetic software protocol activity only',
      performedAt: '2026-01-01T00:00:00.000Z',
      locationType: 'Synthetic facility',
      process: 'IN_PERSON',
      declaration: true,
    },
  );
  expect(created.status).toBe(201);
  const id = z.object({ id: z.uuid() }).parse(await created.json()).id;
  expect(
    (
      await http(`/admin/verifications/${id}/assignments`, admin, 'POST', {
        commandId: randomUUID(),
        expectedRevision: 0,
        assessorId: await user(assessor),
        reason: 'Synthetic governed assignment',
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await http(`/assessor/verifications/${id}/events`, assessor, 'POST', {
        kind: 'START_REVIEW',
        commandId: randomUUID(),
        expectedRevision: 1,
      })
    ).status,
  ).toBe(201);
  const review = z
    .object({ evidence: z.object({ id: z.uuid() }) })
    .parse(
      await (await http(`/assessor/verifications/${id}`, assessor)).json(),
    );
  expect(
    (
      await http(`/assessor/verifications/${id}/events`, assessor, 'POST', {
        kind: 'DECISION',
        reviewKind: 'PRIMARY',
        commandId: randomUUID(),
        expectedRevision: 2,
        outcome: 'VERIFIED',
        conflictDeclaredClear: true,
        rationale: 'PRIVATE_3J_REVIEW synthetic structured observation',
        candidateExplanation:
          'Synthetic software verification decision recorded',
        findings: g.criteria.map((c) => ({
          criterionId: c.id,
          criterionVersion: c.version,
          observation: 'Synthetic supervised software fixture observed',
          outcome: 'DEMONSTRATED',
          rationale: 'Synthetic software protocol only',
          evidenceIds: [review.evidence.id],
        })),
      })
    ).status,
  ).toBe(201);
  const final = competencyProfileResponseSchema.parse(
    await (await http('/candidates/me/competency-profile', candidate)).json(),
  );
  expect(
    final.governedVerification!.find((v) => v.caseId === id),
  ).toMatchObject({
    verified: true,
    evidenceLevelAfter: 'PRACTICALLY_VERIFIED',
    readiness: 'UNCONFIGURED',
  });
  expect(final.readiness.determination).toBeNull();
  const journey = await (
    await fetch(origin + '/dairy/journey', {
      headers: { cookie: candidateCookie },
    })
  ).text();
  expect(journey).toContain('Currently effective governed verification');
  expect(journey).toContain('EFFECTIVELY_VERIFIED');
  const dairyState = pilotDashboardSchema.parse(
    await (await http('/candidates/me/dairy-pilot', candidate)).json(),
  );
  const reconciled = dairyJourney(dairyState, final, []);
  const effectiveEvidence = final.governedVerification!.find(
    (v) => v.caseId === id,
  )!.evidenceId;
  expect(
    final.sources.find((s) => s.id === effectiveEvidence)?.reviewPending,
  ).toBe(true);
  expect(final.sources.find((s) => s.id === effectiveEvidence)?.lifecycle).toBe(
    'SUBMITTED',
  );
  expect(
    reconciled.available &&
      reconciled.pendingEvidence.some((s) => s.id === effectiveEvidence),
  ).toBe(false);
  expect(journey).toContain('Readiness: unavailable');
  expect(journey).not.toContain('PRIVATE_3J_REVIEW');
  for (const route of ['/skills-passport', `/verifications/owner/${id}`]) {
    const html = await (
      await fetch(origin + route, { headers: { cookie: candidateCookie } })
    ).text();
    expect(html).toContain(
      route === '/skills-passport'
        ? 'Verified evidence'
        : 'Synthetic software verification decision recorded',
    );
    expect(html).not.toContain('PRIVATE_3J_ACCOUNT');
    expect(html).not.toContain('PRIVATE_3J_REVIEW');
    expect(html).not.toContain(candidate);
  }
  expect(
    await (await fetch(origin + `/verifications/owner/${id}`)).text(),
  ).not.toContain('Synthetic software verification decision recorded');
});

it('removes effective verification from the built profile/Passport after reviewer recusal without rewriting its decision', async () => {
  const rows = z
    .array(verificationProjectionSchema)
    .parse(
      await (await http('/candidates/me/verifications', candidate)).json(),
    );
  const id = rows.find((v) => v.verified)!.caseId;
  const history = z
    .object({ revision: z.number() })
    .parse(
      await (
        await http('/candidates/me/verifications/' + id, candidate)
      ).json(),
    );
  const before = (
    await pool.query(
      "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='DECISION' ORDER BY revision",
      [id],
    )
  ).rows;
  expect(
    (
      await http(
        '/assessor/verifications/' + id + '/events',
        assessor,
        'POST',
        {
          kind: 'RECUSE',
          commandId: randomUUID(),
          expectedRevision: history.revision,
          category: 'GENERAL_DECLARED_CONFLICT',
          reason: 'Synthetic conflict discovered after review',
        },
      )
    ).status,
  ).toBe(201);
  const profile = competencyProfileResponseSchema.parse(
    await (await http('/candidates/me/competency-profile', candidate)).json(),
  );
  expect(
    profile.governedVerification!.find((v) => v.caseId === id),
  ).toMatchObject({
    verified: false,
    evidenceLevelAfter: 'SELF_DECLARED',
    readiness: 'UNCONFIGURED',
  });
  for (const route of ['/skills-passport', '/verifications/owner/' + id]) {
    const html = await (
      await fetch(origin + route, { headers: { cookie: candidateCookie } })
    ).text();
    expect(html).toContain('Verification is not currently effective');
    expect(html).not.toContain('PRIVATE_3J_REVIEW');
    expect(html).not.toContain('PRIVATE_3J_ACCOUNT');
  }
  expect((await http('/assessor/verifications/' + id, assessor)).status).toBe(
    404,
  );
  expect(
    (
      await pool.query(
        "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='DECISION' ORDER BY revision",
        [id],
      )
    ).rows,
  ).toEqual(before);
});
it('removes a moderated professional claim from built candidate views after supporting primary authority revocation', async () => {
  const user = async (token: string) =>
    z.object({ id: z.uuid() }).parse(await (await http('/me', token)).json())
      .id;
  const governor = await identity.token('synthetic-chain-governor');
  const moderator = await identity.token('synthetic-chain-moderator');
  const governorId = await user(governor),
    moderatorId = await user(moderator);
  for (const role of ['ASSESSOR', 'ADMIN'])
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,$2,'PLATFORM','Synthetic moderation protocol fixture')",
      [moderatorId, role],
    );
  const g = await syntheticVerificationGovernance(pool, {
    governor: governorId,
    author: await user(admin),
    assessor: await user(assessor),
    moderation: true,
  });
  await authorizeSyntheticAssessor(pool, governorId, moderatorId, g.rubric);
  const submitted = await http(
    '/candidates/me/verifications',
    candidate,
    'POST',
    {
      commandId: randomUUID(),
      rubricVersionId: g.rubric,
      summary: 'PRIVATE_AUTHORITY_CHAIN_ACCOUNT synthetic software fixture',
      activity: 'Synthetic authority chain protocol',
      performedAt: '2026-01-01T00:00:00.000Z',
      locationType: 'Synthetic audit facility',
      process: 'IN_PERSON',
      declaration: true,
    },
  );
  expect(submitted.status).toBe(201);
  const id = z.object({ id: z.uuid() }).parse(await submitted.json()).id;
  const owner = async () =>
    z
      .object({
        revision: z.number(),
        history: z.array(z.object({ id: z.uuid(), kind: z.string() })),
      })
      .parse(
        await (
          await http('/candidates/me/verifications/' + id, candidate)
        ).json(),
      );
  for (const [token, assessorId, reviewKind] of [
    [assessor, await user(assessor), 'PRIMARY'],
    [moderator, moderatorId, 'MODERATION'],
  ]) {
    expect(
      (
        await http(`/admin/verifications/${id}/assignments`, admin, 'POST', {
          commandId: randomUUID(),
          expectedRevision: (await owner()).revision,
          assessorId,
          reason: 'Synthetic independent supporting review',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await http(`/assessor/verifications/${id}/events`, token!, 'POST', {
          commandId: randomUUID(),
          expectedRevision: (await owner()).revision,
          kind: 'START_REVIEW',
        })
      ).status,
    ).toBe(201);
    const review = z
      .object({ evidence: z.object({ id: z.uuid() }) })
      .parse(
        await (await http(`/assessor/verifications/${id}`, token!)).json(),
      );
    const d = await owner(),
      prior = d.history.filter((e) => e.kind === 'DECISION').at(-1);
    expect(
      (
        await http(`/assessor/verifications/${id}/events`, token!, 'POST', {
          commandId: randomUUID(),
          expectedRevision: d.revision,
          kind: 'DECISION',
          reviewKind,
          outcome: 'VERIFIED',
          conflictDeclaredClear: true,
          rationale: 'PRIVATE_AUTHORITY_CHAIN_REVIEW synthetic rationale',
          candidateExplanation: 'Synthetic software chain decision',
          ...(prior ? { supersedesDecisionId: prior.id } : {}),
          findings: g.criteria.map((c) => ({
            criterionId: c.id,
            criterionVersion: c.version,
            observation: 'Synthetic software observation only',
            outcome: 'DEMONSTRATED',
            rationale: 'Synthetic software rationale only',
            evidenceIds: [review.evidence.id],
          })),
        })
      ).status,
    ).toBe(201);
  }
  const before = (
    await pool.query(
      "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='DECISION' ORDER BY revision",
      [id],
    )
  ).rows;
  const current = competencyProfileResponseSchema.parse(
    await (await http('/candidates/me/competency-profile', candidate)).json(),
  );
  expect(
    current.governedVerification!.find((v) => v.caseId === id)?.verified,
  ).toBe(true);
  expect(
    await (
      await fetch(origin + '/skills-passport', {
        headers: { cookie: candidateCookie },
      })
    ).text(),
  ).toContain('Verified evidence');
  await pool.query(
    'INSERT INTO verification_governance_revocations(authorization_id,reason,actor_id,request_id) VALUES($1,$2,$3,$4)',
    [
      g.authorization,
      'Synthetic supporting authority withdrawn',
      governorId,
      randomUUID(),
    ],
  );
  for (const endpoint of [
    '/candidates/me/competency-profile',
    '/candidates/me/skills-passport',
  ]) {
    const response = await (await http(endpoint, candidate)).json();
    const projected = z
      .object({ governedVerification: z.array(verificationProjectionSchema) })
      .parse(response);
    expect(
      projected.governedVerification.find((v) => v.caseId === id),
    ).toMatchObject({
      verified: false,
      evidenceLevelAfter: 'SELF_DECLARED',
      readiness: 'UNCONFIGURED',
    });
  }
  for (const route of [
    '/competencies',
    '/skills-passport',
    '/verifications/owner/' + id,
  ]) {
    const html = await (
      await fetch(origin + route, { headers: { cookie: candidateCookie } })
    ).text();
    expect(html).toContain('Verification is not currently effective');
    expect(html).not.toContain('Verified evidence');
    expect(html).not.toContain('PRIVATE_AUTHORITY_CHAIN_ACCOUNT');
    expect(html).not.toContain('PRIVATE_AUTHORITY_CHAIN_REVIEW');
  }
  expect(
    (
      await pool.query(
        "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='DECISION' ORDER BY revision",
        [id],
      )
    ).rows,
  ).toEqual(before);
}, 60000);
it('continues a withdrawn reassessment and appeals the immutable historical decision through the built private journey', async () => {
  const rows = z
    .array(verificationProjectionSchema)
    .parse(
      await (await http('/candidates/me/verifications', candidate)).json(),
    );
  const original = rows[0]!;
  const body = (previousCaseId: string) => ({
    commandId: randomUUID(),
    rubricVersionId: original.rubricVersionId,
    summary: 'Synthetic follow-on owned reassessment account',
    activity: 'Synthetic protocol reassessment',
    performedAt: '2026-01-01T00:00:00.000Z',
    locationType: 'Synthetic facility',
    process: 'IN_PERSON',
    declaration: true,
    previousCaseId,
  });
  const secondResponse = await http(
    '/candidates/me/verifications',
    candidate,
    'POST',
    body(original.caseId),
  );
  expect(secondResponse.status).toBe(201);
  const second = z
    .object({ id: z.uuid() })
    .parse(await secondResponse.json()).id;
  expect(
    (
      await http(
        '/candidates/me/verifications/' + second + '/events',
        candidate,
        'POST',
        {
          kind: 'WITHDRAW',
          commandId: randomUUID(),
          expectedRevision: 0,
          reason: 'Synthetic withdrawal of pending reassessment',
        },
      )
    ).status,
  ).toBe(201);
  const thirdResponse = await http(
    '/candidates/me/verifications',
    candidate,
    'POST',
    body(second),
  );
  expect(thirdResponse.status).toBe(201);
  const third = z.object({ id: z.uuid() }).parse(await thirdResponse.json()).id;
  const old = z
    .object({ revision: z.number() })
    .parse(
      await (
        await http('/candidates/me/verifications/' + original.caseId, candidate)
      ).json(),
    );
  expect(
    (
      await http(
        '/candidates/me/verifications/' + original.caseId + '/events',
        candidate,
        'POST',
        {
          kind: 'APPEAL',
          commandId: randomUUID(),
          expectedRevision: old.revision,
          reason: 'Synthetic challenge of the historical decision',
        },
      )
    ).status,
  ).toBe(201);
  const html = await (
    await fetch(origin + '/verifications/owner/' + original.caseId, {
      headers: { cookie: candidateCookie },
    })
  ).text();
  expect(html).toContain('APPEAL');
  expect(html).toContain(
    'Recorded history below does not itself establish current',
  );
  const visible = z
    .array(verificationProjectionSchema)
    .parse(
      await (await http('/candidates/me/verifications', candidate)).json(),
    );
  expect(
    visible.some((v) => v.caseId === original.caseId || v.caseId === second),
  ).toBe(false);
  expect(visible.find((v) => v.caseId === third)?.verified).toBe(false);
});

it('connects the private dairy journey to existing assessment, learning, evidence, verification and Passport without inventing readiness', async () => {
  const d = pilotDashboardSchema.parse(
    await (await http('/candidates/me/dairy-pilot', candidate)).json(),
  );
  const p = competencyProfileResponseSchema.parse(
    await (await http('/candidates/me/competency-profile', candidate)).json(),
  );
  const a = attemptsSchema.parse(
    await (await http('/candidates/me/attempts', candidate)).json(),
  );
  const summary = dairyJourney(d, p, a);
  expect(summary.available).toBe(true);
  const response = await fetch(origin + '/dairy/journey', {
    headers: { cookie: candidateCookie },
  });
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(html).toContain('My Commercial Dairy Practice journey');
  expect(html).toContain('Readiness: unavailable');
  expect(html).toContain(
    'professional thresholds require domain-expert validation',
  );
  expect(html).toContain('Completion is learning progress only');
  expect(html).toContain(
    'Learning, assessment and candidate claims do not establish practical competence',
  );
  for (const route of [
    '/development?pathway=',
    '/development/next-steps',
    '/dairy/learning',
    '/practical',
    '/verifications',
    '/competencies?pathway=',
    '/skills-passport?pathway=',
  ])
    expect(html).toContain(route);
  for (const secret of [
    candidate,
    assessor,
    'PRIVATE_PRACTICAL_SSR_ACTIVITY',
    'PRIVATE_REVIEW_SENTINEL',
    'PRIVATE_DAIRY_SSR_SENTINEL',
    'accessToken',
  ])
    expect(html).not.toContain(secret);
  expect(summary.available && summary.effectiveCount).toBe(
    p.governedVerification
      ?.filter((v) => v.verified && v.pathwayVersionId === d.pathway.version_id)
      .map((v) => v.childVersionId)
      .filter((id, i, all) => all.indexOf(id) === i).length ?? 0,
  );
});
it('does not expose the dairy owner journey anonymously or to a different candidate without a profile', async () => {
  const anonymous = await (await fetch(origin + '/dairy/journey')).text();
  expect(anonymous).toContain('Sign in to continue');
  expect(anonymous).not.toContain('dairy enrollments;');
  const token = await identity.token('phase3k-unrelated-candidate');
  const session = await http('/sessions', token, 'POST');
  expect(session.status).toBe(201);
  const { handle } = z
    .object({ handle: z.string() })
    .parse(await session.json());
  const cookie = `vetready_session=${await encryptCookie({ accessToken: token, sessionHandle: handle }, syntheticSessionKey, 'session', 300)}`;
  const html = await (
    await fetch(origin + '/dairy/journey', { headers: { cookie } })
  ).text();
  expect(html).toContain('Save your private candidate profile');
  expect(html).not.toContain('dairy enrollments;');
  expect(html).not.toContain('PRIVATE_PRACTICAL_SSR_ACTIVITY');
  expect(html).not.toContain(token);
});
