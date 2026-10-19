import { beforeAll, afterAll, it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import { createApp } from '../../apps/api/dist/app';
import { testIssuer } from '../helpers/issuer';
import { prepareTestDatabase } from '../helpers/database';
let web: ChildProcess,
  app: INestApplication,
  pool: Pool,
  identity: Awaited<ReturnType<typeof testIssuer>>,
  origin: string;
async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Port unavailable');
  const number = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return number;
}
beforeAll(async () => {
  const db = await prepareTestDatabase();
  pool = db.pool;
  identity = await testIssuer({
    audience: 'https://api.vetready.africa',
    clientId: 'vetready-web',
    clientSecret: 'synthetic-confidential-fixture',
  });
  app = await createApp({
    DATABASE_URL: db.url,
    OIDC_ISSUER: identity.issuer,
    OIDC_JWKS_URI: `${identity.issuer}/jwks`,
    OIDC_AUDIENCE: 'https://api.vetready.africa',
    NODE_ENV: 'test',
    PORT: 4000,
  });
  await app.listen(0, '127.0.0.1');
  const apiOrigin = await app.getUrl();
  const webPort = await port();
  origin = `http://127.0.0.1:${webPort}`;
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'start',
      'apps/web',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(webPort),
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        OIDC_ISSUER: identity.issuer,
        OIDC_AUDIENCE: 'https://api.vetready.africa',
        OIDC_CLIENT_ID: 'vetready-web',
        OIDC_CLIENT_SECRET: 'synthetic-confidential-fixture',
        SESSION_SECRET: randomBytes(32).toString('hex'),
        APP_ORIGIN: origin,
        API_INTERNAL_URL: apiOrigin,
      },
      stdio: 'pipe',
    },
  );
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(origin);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* wait for startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Web server failed to start');
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
it('renders the mobile foundation without exposing tokens', async () => {
  const response = await fetch(origin);
  const html = await response.text();
  expect(html).toContain('Build skills you can demonstrate');
  expect(html).toContain('width=device-width');
  expect(html).not.toContain('access_token');
  expect(response.headers.get('referrer-policy')).toBe('same-origin');
});
it('rejects callback without a valid state cookie', async () => {
  const response = await fetch(
    `${origin}/auth/callback?code=forged&state=forged`,
    { redirect: 'manual' },
  );
  expect(response.status).toBe(401);
});
it('executes PKCE authorization, session and server-rendered authenticated dashboard', async () => {
  const login = await fetch(`${origin}/auth/login`, { redirect: 'manual' });
  expect(login.status).toBe(307);
  const flowCookie = login.headers
    .getSetCookie()
    .find((c) => c.startsWith('vetready_flow='));
  expect(flowCookie).toContain('HttpOnly');
  const cookie = flowCookie!.split(';')[0]!;
  const authorization = login.headers.get('location')!;
  const authUrl = new URL(authorization);
  expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authUrl.searchParams.get('audience')).toBe(
    'https://api.vetready.africa',
  );
  expect(authUrl.searchParams.get('scope')?.split(' ')).toContain(
    'vetready:access',
  );
  const authorize = await fetch(authorization, { redirect: 'manual' });
  const callback = authorize.headers.get('location')!;
  const forged = new URL(callback);
  forged.searchParams.set('state', 'wrong');
  const denied = await fetch(forged, {
    redirect: 'manual',
    headers: { cookie },
  });
  expect(denied.status).toBe(401);
  const result = await fetch(callback, {
    redirect: 'manual',
    headers: { cookie },
  });
  expect(result.status).toBe(307);
  const sessionCookie = result.headers
    .getSetCookie()
    .find((c) => c.startsWith('vetready_session='));
  expect(sessionCookie).toContain('HttpOnly');
  expect(sessionCookie).toContain('SameSite=lax');
  const session = sessionCookie!.split(';')[0]!;
  const dashboard = await fetch(`${origin}/dashboard`, {
    headers: { cookie: session },
  });
  expect(dashboard.status).toBe(200);
  const html = await dashboard.text();
  expect(html).toContain('Your professional foundation');
  expect(html).toContain('Poultry Farm Management');
  expect(html).toContain('Premix &amp; Feed Additives Technical Sales');
  expect(html).toContain('REQUIRES DOMAIN EXPERT VALIDATION');
  expect(html).not.toContain('accessToken');
  expect(dashboard.headers.get('cache-control')).toContain('no-store');
  const accessToken = await identity.token('browser-candidate');
  const apiOrigin = await app.getUrl();
  const apiHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const savedProfile = await fetch(`${apiOrigin}/api/v1/candidates/me`, {
    method: 'PUT',
    headers: apiHeaders,
    body: JSON.stringify({
      fullName: 'Browser Test Candidate',
      countryCode: 'NG',
      state: 'Kano',
      willingToRelocate: true,
      drivingAbility: true,
      professionalSummary: 'Synthetic browser test',
    }),
  });
  expect(savedProfile.status).toBe(200);
  const development = await fetch(`${origin}/development`, {
    headers: { cookie: session },
  });
  expect(development.status).toBe(200);
  const developmentHtml = await development.text();
  expect(developmentHtml).toContain('My development');
  expect(developmentHtml).toContain('DEMO CONTENT');
  expect(developmentHtml).toContain('No assessment evidence recorded');
  expect(developmentHtml).not.toContain('accessToken');
  const catalogs = await fetch(`${apiOrigin}/api/v1/assessments`, {
    headers: apiHeaders,
  });
  const assessments = (await catalogs.json()) as {
    id: string;
    pathway_id: string;
  }[];
  const started = await fetch(
    `${apiOrigin}/api/v1/assessments/${assessments[0]!.id}/attempts`,
    { method: 'POST', headers: apiHeaders },
  );
  const attempt = (await started.json()) as { id: string };
  const assessmentPage = await fetch(`${origin}/assessments/${attempt.id}`, {
    headers: { cookie: session },
  });
  expect(assessmentPage.status).toBe(200);
  const assessmentHtml = await assessmentPage.text();
  expect(assessmentHtml).toContain('Assessment criteria');
  expect(assessmentHtml).toContain('Save response');
  expect(assessmentHtml).not.toContain('answer_key');
  const gapPage = await fetch(
    `${origin}/development?pathway=${assessments[0]!.pathway_id}`,
    { headers: { cookie: session } },
  );
  expect(gapPage.status).toBe(200);
  expect(await gapPage.text()).toContain('Development gaps');
  const staffPage = await fetch(`${origin}/assessment-workspace`, {
    headers: { cookie: session },
  });
  expect(staffPage.status).toBe(200);
  expect(await staffPage.text()).toContain('requires an assigned staff role');
  // Missing, opaque and foreign origins must never revoke a session.
  for (const rejectedOrigin of [
    undefined,
    'null',
    'https://attacker.example',
  ]) {
    const csrf = await fetch(`${origin}/auth/logout`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        cookie: session,
        ...(rejectedOrigin === undefined ? {} : { origin: rejectedOrigin }),
      },
    });
    expect(csrf.status).toBe(403);
    expect(csrf.headers.getSetCookie()).toHaveLength(0);
    const stillAuthenticated = await fetch(`${origin}/dashboard`, {
      headers: { cookie: session },
    });
    expect(await stillAuthenticated.text()).toContain(
      'Your professional foundation',
    );
  }
  const getLogout = await fetch(`${origin}/auth/logout`, {
    redirect: 'manual',
    headers: { cookie: session },
  });
  expect(getLogout.status).toBe(405);
  const logout = await fetch(`${origin}/auth/logout`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: session, origin },
  });
  expect(logout.status).toBe(303);
  expect(logout.headers.get('location')).toBe(`${origin}/`);
  expect(logout.headers.get('cache-control')).toBe('no-store');
  for (const name of ['vetready_session', 'vetready_flow']) {
    const cleared = logout.headers
      .getSetCookie()
      .find((c) => c.startsWith(name + '=;'));
    expect(cleared).toContain('Path=/');
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970');
  }
  expect(
    logout.headers
      .getSetCookie()
      .some((c) => c.startsWith('vetready_session=;')),
  ).toBe(true);
  for (const headers of [{ cookie: session }, {}]) {
    const afterLogout = await fetch(`${origin}/dashboard`, {
      redirect: 'manual',
      headers,
    });
    expect(afterLogout.status).toBe(307);
    expect(new URL(afterLogout.headers.get('location')!, origin).pathname).toBe(
      '/auth/login',
    );
    expect(await afterLogout.text()).not.toContain('Browser Test Candidate');
  }
  const retired = (
    await pool.query(
      'SELECT count(*) FROM browser_sessions WHERE revoked_at IS NOT NULL',
    )
  ).rows[0].count;
  expect(retired).toBe('1');
  const replay = await fetch(callback, {
    redirect: 'manual',
    headers: { cookie },
  });
  expect(replay.status).toBe(401);
  const requestsBefore = identity.discoveryRequests();
  identity.setDiscoveryAvailable(false);
  try {
    const states = new Set<string>();
    for (let attempt = 0; attempt < 3; attempt++) {
      const repeated = await fetch(`${origin}/auth/login`, {
        redirect: 'manual',
      });
      expect(repeated.status).toBe(307);
      expect(repeated.headers.get('cache-control')).toBe('no-store');
      states.add(
        new URL(repeated.headers.get('location')!).searchParams.get('state')!,
      );
      expect(
        repeated.headers
          .getSetCookie()
          .some((c) => c.startsWith('vetready_flow=')),
      ).toBe(true);
    }
    expect(states.size).toBe(3);
    const secondLogin = await fetch(`${origin}/auth/login`, {
      redirect: 'manual',
    });
    expect(secondLogin.status).toBe(307);
    const secondFlow = secondLogin.headers
      .getSetCookie()
      .find((c) => c.startsWith('vetready_flow='))!
      .split(';')[0]!;
    const secondAuthorize = await fetch(secondLogin.headers.get('location')!, {
      redirect: 'manual',
    });
    const secondCallback = await fetch(
      secondAuthorize.headers.get('location')!,
      {
        redirect: 'manual',
        headers: { cookie: secondFlow },
      },
    );
    expect(secondCallback.status).toBe(307);
    const secondSession = secondCallback.headers
      .getSetCookie()
      .find((c) => c.startsWith('vetready_session='))!
      .split(';')[0]!;
    const secondDashboard = await fetch(`${origin}/dashboard`, {
      headers: { cookie: secondSession },
    });
    expect(await secondDashboard.text()).toContain(
      'Your professional foundation',
    );
    const secondLogout = await fetch(`${origin}/auth/logout`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: secondSession, origin },
    });
    expect(secondLogout.status).toBe(303);
    const secondRevoked = await fetch(`${origin}/dashboard`, {
      redirect: 'manual',
      headers: { cookie: secondSession },
    });
    expect(secondRevoked.status).toBe(307);
    expect(identity.discoveryRequests()).toBe(requestsBefore);
  } finally {
    identity.setDiscoveryAvailable(true);
  }
});

it('requires authentication for frontend data and rejects tampered browser sessions', async () => {
  const response = await fetch(`${origin}/development`);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('Sign in');
  expect(html).not.toContain('Browser Test Candidate');
  const tampered = await fetch(`${origin}/dashboard`, {
    redirect: 'manual',
    headers: { cookie: 'vetready_session=malformed' },
  });
  expect(tampered.status).toBe(307);
  expect(new URL(tampered.headers.get('location')!, origin).pathname).toBe(
    '/auth/login',
  );
  expect(await tampered.text()).not.toContain('Your professional foundation');
});
