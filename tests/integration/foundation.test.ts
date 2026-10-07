import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { SignJWT, generateKeyPair } from 'jose';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'pg';
import { createApp } from '../../apps/api/dist/app';
import { testIssuer } from '../helpers/issuer';
import { prepareTestDatabase } from '../helpers/database';
let app: INestApplication,
  pool: Pool,
  url: string,
  identity: Awaited<ReturnType<typeof testIssuer>>,
  tokenA: string,
  tokenB: string,
  userA: string,
  userB: string;
beforeAll(async () => {
  const db = await prepareTestDatabase();
  pool = db.pool;
  url = db.url;
  identity = await testIssuer();
  app = await createApp({
    DATABASE_URL: url,
    OIDC_ISSUER: identity.issuer,
    OIDC_JWKS_URI: `${identity.issuer}/jwks`,
    OIDC_AUDIENCE: 'vetready-api',
    NODE_ENV: 'test',
    PORT: 4000,
  });
  tokenA = await identity.token();
  tokenB = await identity.token('candidate-b');
  userA = (
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .auth(tokenA, { type: 'bearer' })
      .expect(200)
  ).body.id as string;
  userB = (
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .auth(tokenB, { type: 'bearer' })
      .expect(200)
  ).body.id as string;
});
afterAll(async () => {
  await app?.close();
  await pool?.end();
  await identity?.close();
});
const auth = () => request(app.getHttpServer());
const profile = {
  fullName: 'Synthetic Candidate',
  state: 'Kano',
  willingToRelocate: true,
  drivingAbility: true,
};
describe('real JWT authentication and authorization', () => {
  it('health checks actual database without exposing details', async () => {
    await auth().get('/api/v1/ready').expect(200);
    await auth().get('/api/v1/me').expect(401);
  });
  it('rejects wrong audience, issuer, expired token, and missing scope', async () => {
    for (const claims of [
      { aud: 'other-api' },
      { iss: 'https://other-issuer.example' },
      { exp: 1 },
      { scope: 'openid' },
    ]) {
      const signed = await new SignJWT({
        scope: 'vetready:access',
        sub: 'attacker',
        iss: identity.issuer,
        aud: 'vetready-api',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
        ...claims,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .sign(identity.privateKey);
      await auth()
        .get('/api/v1/me')
        .auth(signed, { type: 'bearer' })
        .expect(401);
    }
  });
  it('rejects untrusted signatures and malformed tokens', async () => {
    const key = await generateKeyPair('RS256');
    const forged = await new SignJWT({ scope: 'vetready:access' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(identity.issuer)
      .setAudience('vetready-api')
      .setSubject('attacker')
      .setIssuedAt()
      .setExpirationTime('1m')
      .sign(key.privateKey);
    await auth().get('/api/v1/me').auth(forged, { type: 'bearer' }).expect(401);
    await auth()
      .get('/api/v1/me')
      .auth('not-a-jwt', { type: 'bearer' })
      .expect(401);
  });
  it('ignores claimed administrator roles and denies privilege escalation', async () => {
    const token = await identity.token('claimed-admin', {
      roles: ['SUPER_ADMIN'],
    });
    await auth()
      .get('/api/v1/admin/summary')
      .auth(token, { type: 'bearer' })
      .expect(403);
    await auth()
      .post('/api/v1/admin/role-assignments')
      .auth(tokenA, { type: 'bearer' })
      .send({
        userId: userA,
        roleCode: 'SUPER_ADMIN',
        reason: 'Attempting unauthorized elevation',
      })
      .expect(403);
  });
  it('provisions one user under concurrent first access', async () => {
    const token = await identity.token('concurrent');
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        auth().get('/api/v1/me').auth(token, { type: 'bearer' }),
      ),
    );
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(results.every((r) => r.status === 200)).toBe(true);
  });
  it('blocks suspended users and expired grants', async () => {
    await pool.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [
      userB,
    ]);
    await auth().get('/api/v1/me').auth(tokenB, { type: 'bearer' }).expect(403);
    await pool.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [userB]);
    await pool.query(
      "UPDATE user_role_assignments SET expires_at=now()-interval '1 minute' WHERE user_id=$1",
      [userB],
    );
    await auth()
      .get('/api/v1/candidates/me')
      .auth(tokenB, { type: 'bearer' })
      .expect(403);
    await pool.query(
      'UPDATE user_role_assignments SET expires_at=NULL WHERE user_id=$1',
      [userB],
    );
  });
});
describe('profiles, employer boundaries and evidence', () => {
  it('validates and saves an owner-only private profile with audit', async () => {
    await auth()
      .put('/api/v1/candidates/me')
      .auth(tokenA, { type: 'bearer' })
      .send({ ...profile, discoverable: true })
      .expect(422);
    await auth()
      .put('/api/v1/candidates/me')
      .auth(tokenA, { type: 'bearer' })
      .send(profile)
      .expect(200);
    const a = await auth()
      .get('/api/v1/candidates/me')
      .auth(tokenA, { type: 'bearer' })
      .expect(200);
    expect(a.body.discoverable).toBe(false);
    await auth()
      .get('/api/v1/candidates/me')
      .auth(tokenB, { type: 'bearer' })
      .expect(404);
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM audit_events WHERE action='candidate.saved' AND actor_id=$1",
          [userA],
        )
      ).rows[0].count,
    ).toBe('1');
  });
  it('grants employer permissions only for its own pending organization', async () => {
    const response = await auth()
      .post('/api/v1/organizations')
      .auth(tokenA, { type: 'bearer' })
      .send({ displayName: 'Synthetic Farm', sector: 'Dairy' })
      .expect(201);
    const id = response.body.id;
    expect(response.body.verificationStatus).toBe('PENDING');
    await auth()
      .get(`/api/v1/organizations/${id}`)
      .auth(tokenA, { type: 'bearer' })
      .expect(200);
    await auth()
      .get(`/api/v1/organizations/${id}`)
      .auth(tokenB, { type: 'bearer' })
      .expect(404);
    await auth()
      .get('/api/v1/organizations/not-uuid')
      .auth(tokenA, { type: 'bearer' })
      .expect(422);
  });
  it('creates unverified evidence and blocks other candidates and status injection', async () => {
    const cv = (
      await pool.query(
        "SELECT cv.id FROM competency_versions cv JOIN competencies c ON c.id=cv.competency_id WHERE c.code='CORE_DATA'",
      )
    ).rows[0].id;
    const data = {
      competencyVersionId: cv,
      source: 'PRACTICAL',
      summary:
        'Synthetic task claimed by candidate, not independently verified',
    };
    await auth()
      .post('/api/v1/evidence')
      .auth(tokenA, { type: 'bearer' })
      .send({ ...data, reviewStatus: 'VERIFIED' })
      .expect(422);
    const record = await auth()
      .post('/api/v1/evidence')
      .auth(tokenA, { type: 'bearer' })
      .send(data)
      .expect(201);
    expect(record.body.competenceVerified).toBe(false);
    expect(record.body.reviewStatus).toBe('SUBMITTED');
    await auth()
      .get(`/api/v1/evidence/${record.body.id}`)
      .auth(tokenB, { type: 'bearer' })
      .expect(404);
    const list = await auth()
      .get('/api/v1/evidence')
      .auth(tokenB, { type: 'bearer' })
      .expect(200);
    expect(list.body).toEqual([]);
    expect(
      (await pool.query('SELECT count(*) FROM candidate_competencies')).rows[0]
        .count,
    ).toBe('0');
  });
  it('records two pathway interests without duplicating competencies', async () => {
    const paths = (
      await auth()
        .get('/api/v1/pathways')
        .auth(tokenA, { type: 'bearer' })
        .expect(200)
    ).body as { id: string }[];
    expect(paths).toHaveLength(4);
    for (const p of paths.slice(0, 2))
      await auth()
        .post(`/api/v1/candidates/me/pathways/${p.id}`)
        .auth(tokenA, { type: 'bearer' })
        .expect(201);
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM competencies WHERE code='CORE_DATA'",
        )
      ).rows[0].count,
    ).toBe('1');
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM pathway_competencies pc JOIN competency_versions cv ON cv.id=pc.competency_version_id JOIN competencies c ON c.id=cv.competency_id WHERE c.code='CORE_DATA'",
        )
      ).rows[0].count,
    ).toBe('4');
  });
  it('allows scoped administrator summary and audits a super-admin grant', async () => {
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,'SUPER_ADMIN','PLATFORM','Synthetic test bootstrap only')",
      [userA],
    );
    await auth()
      .get('/api/v1/admin/summary')
      .auth(tokenA, { type: 'bearer' })
      .expect(200);
    await auth()
      .post('/api/v1/admin/role-assignments')
      .auth(tokenA, { type: 'bearer' })
      .send({
        userId: userB,
        roleCode: 'ADMIN',
        reason: 'Synthetic reviewed test assignment',
      })
      .expect(201);
    await auth()
      .get('/api/v1/admin/summary')
      .auth(tokenB, { type: 'bearer' })
      .expect(200);
    await auth()
      .post('/api/v1/admin/role-assignments')
      .auth(tokenB, { type: 'bearer' })
      .send({
        userId: userB,
        roleCode: 'SUPER_ADMIN',
        reason: 'Unauthorized elevation from admin',
      })
      .expect(403);
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM audit_events WHERE action='role.granted'",
        )
      ).rows[0].count,
    ).toBe('1');
  });
});
describe('database integrity and reusable reference data', () => {
  it('migrations and seeds are repeatable and thresholds remain unset', async () => {
    const env = { ...process.env, DATABASE_URL: url };
    for (const script of ['migrate', 'seed', 'seed'])
      execFileSync(
        process.execPath,
        ['--import', 'tsx', `scripts/${script}.ts`],
        { env, stdio: 'pipe' },
      );
    expect(
      (await pool.query('SELECT count(*) FROM pathways')).rows[0].count,
    ).toBe('4');
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM competency_versions WHERE passing_threshold IS NOT NULL',
        )
      ).rows[0].count,
    ).toBe('0');
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM competency_versions WHERE approval_status<>'DRAFT'",
        )
      ).rows[0].count,
    ).toBe('0');
  });
  it('database rejects organizational role in platform scope', async () => {
    await expect(
      pool.query(
        "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,'EMPLOYER','PLATFORM','Invalid scope fixture')",
        [userA],
      ),
    ).rejects.toThrow();
  });
  it('protects audit history from rewriting', async () => {
    await expect(
      pool.query(
        "UPDATE audit_events SET action='tampered' WHERE actor_id=$1",
        [userA],
      ),
    ).rejects.toThrow('Append-only');
  });
  it('rejects candidate mismatched evidence and competency links', async () => {
    await auth()
      .put('/api/v1/candidates/me')
      .auth(tokenB, { type: 'bearer' })
      .send({ ...profile, fullName: 'Other Candidate' })
      .expect(200);
    const candidates = (
      await pool.query('SELECT id,user_id FROM candidate_profiles')
    ).rows;
    const a = candidates.find((c) => c.user_id === userA).id;
    const b = candidates.find((c) => c.user_id === userB).id;
    const e = (
      await pool.query(
        'SELECT id,competency_version_id FROM evidence_records WHERE candidate_id=$1',
        [a],
      )
    ).rows[0];
    await expect(
      pool.query(
        "INSERT INTO evidence_records(candidate_id,competency_version_id,source,summary,created_by) VALUES($1,$2,'SELF_DECLARED','Wrong owner synthetic fixture',$3)",
        [a, e.competency_version_id, userB],
      ),
    ).rejects.toThrow('submitter');
    const c = (
      await pool.query("SELECT id FROM competencies WHERE code='CORE_ETHICS'")
    ).rows[0].id;
    await pool.query(
      'INSERT INTO candidate_competencies(candidate_id,competency_id) VALUES($1,$2)',
      [b, c],
    );
    await expect(
      pool.query('INSERT INTO competency_evidence_links VALUES($1,$2,$3)', [
        b,
        c,
        e.id,
      ]),
    ).rejects.toThrow();
    await pool.query(
      'INSERT INTO candidate_competencies(candidate_id,competency_id) VALUES($1,$2)',
      [a, c],
    );
    await expect(
      pool.query('INSERT INTO competency_evidence_links VALUES($1,$2,$3)', [
        a,
        c,
        e.id,
      ]),
    ).rejects.toThrow('same candidate and competency');
  });
  it('freezes approved definition and pathway mappings', async () => {
    const path = (
      await pool.query(
        "INSERT INTO pathways(code,name,description) VALUES($1,'Test governed version','Synthetic only') RETURNING id",
        [`TEST_${randomUUID()}`],
      )
    ).rows[0].id;
    const version = (
      await pool.query(
        "INSERT INTO pathway_versions(pathway_id,version,approval_status,reviewer_id,reviewed_at) VALUES($1,1,'APPROVED',$2,now()) RETURNING id",
        [path, userA],
      )
    ).rows[0].id;
    await expect(
      pool.query('UPDATE pathway_versions SET version=2 WHERE id=$1', [
        version,
      ]),
    ).rejects.toThrow('immutable');
    const c = (await pool.query('SELECT id FROM competency_versions LIMIT 1'))
      .rows[0].id;
    await expect(
      pool.query(
        "INSERT INTO pathway_competencies VALUES($1,$2,'CORE',NULL,NULL,NULL)",
        [version, c],
      ),
    ).rejects.toThrow('immutable');
  });
  it('repeat seed preserves an approved pilot pathway', async () => {
    const pv = (
      await pool.query(
        "SELECT pv.id FROM pathway_versions pv JOIN pathways p ON p.id=pv.pathway_id WHERE p.code='DAIRY'",
      )
    ).rows[0].id;
    await pool.query(
      "UPDATE pathway_versions SET approval_status='APPROVED',reviewer_id=$2,reviewed_at=now() WHERE id=$1",
      [pv, userA],
    );
    const before = (
      await pool.query(
        'SELECT count(*) FROM pathway_competencies WHERE pathway_version_id=$1',
        [pv],
      )
    ).rows[0].count;
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM pathway_competencies WHERE pathway_version_id=$1',
          [pv],
        )
      ).rows[0].count,
    ).toBe(before);
    expect(
      (
        await pool.query(
          'SELECT approval_status FROM pathway_versions WHERE id=$1',
          [pv],
        )
      ).rows[0].approval_status,
    ).toBe('APPROVED');
  });
});
