import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import { createApp } from '../../apps/api/dist/app';
import { prepareTestDatabase } from '../helpers/database';
import { testIssuer } from '../helpers/issuer';
let app: INestApplication,
  pool: Pool,
  identity: Awaited<ReturnType<typeof testIssuer>>,
  token: string,
  other: string;
const audience = 'https://api.vetready.africa';
const api = () => request(app.getHttpServer());
beforeAll(async () => {
  const db = await prepareTestDatabase();
  pool = db.pool;
  identity = await testIssuer({ audience });
  app = await createApp({
    DATABASE_URL: db.url,
    OIDC_ISSUER: identity.issuer,
    OIDC_JWKS_URI: identity.issuer + '/jwks',
    OIDC_AUDIENCE: audience,
    NODE_ENV: 'test',
    PORT: 4000,
  });
  token = await identity.token('session-owner');
  other = await identity.token('session-other');
});
afterAll(async () => {
  await app?.close();
  await pool?.end();
  await identity?.close();
});
it('requires authentication and exact access scope for session creation', async () => {
  await api().post('/api/v1/sessions').expect(401);
  await api()
    .post('/api/v1/sessions')
    .auth('malformed', { type: 'bearer' })
    .expect(401);
  await api()
    .post('/api/v1/sessions')
    .auth(await identity.token('no-scope', { scope: 'openid profile' }), {
      type: 'bearer',
    })
    .expect(401);
});
it.each([
  { iss: 'https://wrong-issuer.example/' },
  { aud: 'wrong-audience' },
  { exp: 1 },
])('rejects invalid JWT claims %j', async (claims) => {
  const t = await new SignJWT({
    iss: identity.issuer,
    aud: audience,
    sub: 'invalid',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60,
    scope: 'vetready:access',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .sign(identity.privateKey);
  await api().get('/api/v1/me').auth(t, { type: 'bearer' }).expect(401);
});
it('revokes copied browser sessions while preserving independent bearer authorization and RBAC', async () => {
  const created = (
    await api()
      .post('/api/v1/sessions')
      .auth(token, { type: 'bearer' })
      .expect(201)
  ).body;
  expect(created.handle).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const row = (await pool.query('SELECT * FROM browser_sessions')).rows[0];
  expect(row.handle_hash).not.toBe(created.handle);
  expect(row).not.toHaveProperty('access_token');
  await api()
    .get('/api/v1/me')
    .auth(token, { type: 'bearer' })
    .set('X-VetReady-Session', created.handle)
    .expect(200);
  await api()
    .get('/api/v1/me')
    .auth(other, { type: 'bearer' })
    .set('X-VetReady-Session', created.handle)
    .expect(401);
  await api()
    .delete('/api/v1/sessions/current')
    .auth(other, { type: 'bearer' })
    .set('X-VetReady-Session', created.handle)
    .expect(401);
  await api()
    .get('/api/v1/admin/summary')
    .auth(token, { type: 'bearer' })
    .set('X-VetReady-Session', created.handle)
    .expect(403);
  await api()
    .delete('/api/v1/sessions/current')
    .auth(token, { type: 'bearer' })
    .set('X-VetReady-Session', created.handle)
    .expect(200);
  await api()
    .delete('/api/v1/sessions/current')
    .auth(token, { type: 'bearer' })
    .set('X-VetReady-Session', created.handle)
    .expect(200);
  await api()
    .get('/api/v1/me')
    .auth(token, { type: 'bearer' })
    .set('X-VetReady-Session', created.handle)
    .expect(401);
  await api().get('/api/v1/me').auth(token, { type: 'bearer' }).expect(200);
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM audit_events WHERE action='session.revoked'",
      )
    ).rows[0].count,
  ).toBe('1');
});
it('rejects unknown, malformed and expired session handles', async () => {
  await api()
    .get('/api/v1/me')
    .auth(token, { type: 'bearer' })
    .set('X-VetReady-Session', randomBytes(32).toString('base64url'))
    .expect(401);
  await api()
    .get('/api/v1/me')
    .auth(token, { type: 'bearer' })
    .set('X-VetReady-Session', 'invalid')
    .expect(401);
  const created = (
    await api().post('/api/v1/sessions').auth(token, { type: 'bearer' })
  ).body;
  await pool.query(
    "UPDATE browser_sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 minute' WHERE revoked_at IS NULL",
  );
  await api()
    .get('/api/v1/me')
    .auth(token, { type: 'bearer' })
    .set('X-VetReady-Session', created.handle)
    .expect(401);
});

it('suspended users can terminate their own session without gaining domain access', async () => {
  const created = (
    await api()
      .post('/api/v1/sessions')
      .auth(token, { type: 'bearer' })
      .expect(201)
  ).body;
  await pool.query(
    "UPDATE users SET status='SUSPENDED' WHERE subject='session-owner'",
  );
  await api()
    .get('/api/v1/me')
    .auth(token, { type: 'bearer' })
    .set('X-VetReady-Session', created.handle)
    .expect(403);
  await api()
    .delete('/api/v1/sessions/current')
    .auth(token, { type: 'bearer' })
    .set('X-VetReady-Session', created.handle)
    .expect(200);
  await pool.query(
    "UPDATE users SET status='ACTIVE' WHERE subject='session-owner'",
  );
});
