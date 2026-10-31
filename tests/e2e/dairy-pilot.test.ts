import { z } from 'zod';
import { employerExplanationSchema } from '../../apps/web/lib/recruitment';
import { competencyProfileResponseSchema } from '../../apps/web/lib/competency-profile';
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
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('No local port');
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  origin = `http://127.0.0.1:${port}`;
  const syntheticSessionKey = randomBytes(32).toString('hex');
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
