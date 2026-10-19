import { beforeAll, afterAll, it, expect, vi } from 'vitest';
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

it('provisions a brand-new external identity once without a candidate profile, including concurrent first requests', async () => {
  const fresh = await identity.token('new-auth0-first-login');
  expect(
    (
      await pool.query(
        "SELECT 1 FROM users WHERE subject='new-auth0-first-login'",
      )
    ).rowCount,
  ).toBe(0);
  const responses = await Promise.all(
    Array.from({ length: 3 }, () =>
      api().post('/api/v1/sessions').auth(fresh, { type: 'bearer' }),
    ),
  );
  expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
  const user = (
    await pool.query(
      "SELECT id FROM users WHERE issuer=$1 AND subject='new-auth0-first-login'",
      [identity.issuer],
    )
  ).rows[0];
  expect(
    (
      await pool.query('SELECT 1 FROM candidate_profiles WHERE user_id=$1', [
        user.id,
      ])
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await pool.query(
        "SELECT 1 FROM user_role_assignments WHERE user_id=$1 AND role_code='CANDIDATE'",
        [user.id],
      )
    ).rowCount,
  ).toBe(1);
  expect(
    (
      await pool.query(
        "SELECT 1 FROM audit_events WHERE actor_id=$1 AND action='identity.provisioned'",
        [user.id],
      )
    ).rowCount,
  ).toBe(1);
  expect(
    (
      await pool.query('SELECT 1 FROM browser_sessions WHERE user_id=$1', [
        user.id,
      ])
    ).rowCount,
  ).toBe(3);
  await api()
    .get('/api/v1/me')
    .auth(fresh, { type: 'bearer' })
    .set('X-VetReady-Session', responses[0]!.body.handle)
    .expect(200);
  await api()
    .get('/api/v1/admin/summary')
    .auth(fresh, { type: 'bearer' })
    .expect(403);
});
it('identifies missing session migration at the insert without exposing SQL or identity data', async () => {
  const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
  await pool.query(
    'ALTER TABLE browser_sessions RENAME TO session_diagnostic_fixture',
  );
  try {
    const response = await api()
      .post('/api/v1/sessions')
      .auth(await identity.token('missing-table-fixture'), { type: 'bearer' });
    expect(response.status).toBe(500);
    const event = JSON.parse(logging.mock.calls[0]![0]);
    expect(event).toMatchObject({
      event: 'auth.session.registration.failed',
      stage: 'session-insert',
      code: '42P01',
    });
    expect(JSON.stringify(logging.mock.calls)).not.toContain(
      'missing-table-fixture',
    );
    expect(JSON.stringify(response.body)).not.toContain('browser_sessions');
  } finally {
    await pool.query(
      'ALTER TABLE session_diagnostic_fixture RENAME TO browser_sessions',
    );
    logging.mockRestore();
  }
  await api()
    .post('/api/v1/sessions')
    .auth(await identity.token('missing-table-fixture'), { type: 'bearer' })
    .expect(201);
});
it('rolls back session insertion if its audit fails, with an exact sanitized stage', async () => {
  const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
  const known = await identity.token('audit-failure-fixture');
  await api().get('/api/v1/me').auth(known, { type: 'bearer' }).expect(200);
  await pool.query(
    'ALTER TABLE audit_events RENAME TO audit_diagnostic_fixture',
  );
  try {
    await api()
      .post('/api/v1/sessions')
      .auth(known, { type: 'bearer' })
      .expect(500);
    expect(JSON.parse(logging.mock.calls[0]![0])).toMatchObject({
      stage: 'session-audit',
      code: '42P01',
    });
    expect(
      (
        await pool.query(
          "SELECT 1 FROM browser_sessions bs JOIN users u ON u.id=bs.user_id WHERE u.subject='audit-failure-fixture'",
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await pool.query(
      'ALTER TABLE audit_diagnostic_fixture RENAME TO audit_events',
    );
    logging.mockRestore();
  }
});
