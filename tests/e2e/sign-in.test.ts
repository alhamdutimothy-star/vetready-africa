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
  identity = await testIssuer();
  app = await createApp({
    DATABASE_URL: db.url,
    OIDC_ISSUER: identity.issuer,
    OIDC_JWKS_URI: `${identity.issuer}/jwks`,
    OIDC_AUDIENCE: 'vetready-api',
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
        OIDC_AUDIENCE: 'vetready-api',
        OIDC_CLIENT_ID: 'vetready-web',
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
  const csrf = await fetch(`${origin}/auth/logout`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: session, origin: 'https://attacker.example' },
  });
  expect(csrf.status).toBe(403);
  const logout = await fetch(`${origin}/auth/logout`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: session, origin },
  });
  expect(logout.status).toBe(303);
  expect(
    logout.headers
      .getSetCookie()
      .some((c) => c.startsWith('vetready_session=;')),
  ).toBe(true);
  const replay = await fetch(callback, {
    redirect: 'manual',
    headers: { cookie },
  });
  expect(replay.status).toBe(401);
});
