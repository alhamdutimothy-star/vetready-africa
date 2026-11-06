import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Agent } from 'node:http';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { verificationCriteriaSchema } from '@vetready/contracts';
import { createApp } from '../../apps/api/dist/app';
import { prepareTestDatabase } from '../helpers/database';
import { testIssuer } from '../helpers/issuer';
import {
  syntheticVerificationGovernance,
  authorizeSyntheticAssessor,
} from '../helpers/verification';
let pool: Pool,
  app: INestApplication,
  issuer: Awaited<ReturnType<typeof testIssuer>>,
  url: string;
const tokens: Record<string, string> = {},
  ids: Record<string, string> = {};
let g: Awaited<ReturnType<typeof syntheticVerificationGovernance>>;
let transport: Agent;
let appIsOpen = false;
const base = '/candidates/me/verifications';
const call = (method: 'get' | 'post', path: string, who = 'owner') => {
  const server = request(app.getHttpServer());
  return server[method]('/api/v1' + path)
    .agent(transport)
    .auth(tokens[who]!, {
      type: 'bearer',
    });
};
const submission = (rubric = g.rubric) => ({
  commandId: randomUUID(),
  rubricVersionId: rubric,
  summary: 'PRIVATE_CANDIDATE_ACCOUNT synthetic software fixture',
  activity: 'Synthetic protocol activity',
  performedAt: '2026-01-01T00:00:00.000Z',
  locationType: 'Synthetic facility',
  process: 'IN_PERSON',
  declaration: true,
});
async function submitted(rubric = g.rubric) {
  return (await call('post', base).send(submission(rubric)).expect(201)).body
    .id as string;
}
async function detail(id: string, who = 'owner') {
  return (
    await call(
      'get',
      `${who === 'owner' ? base : who === 'admin' ? '/admin/verifications' : '/assessor/verifications'}/${id}`,
      who,
    ).expect(200)
  ).body;
}
async function assign(id: string, who = 'assessor') {
  const d = await detail(id);
  return (
    await call('post', `/admin/verifications/${id}/assignments`, 'admin')
      .send({
        commandId: randomUUID(),
        expectedRevision: d.revision,
        assessorId: ids[who],
        reason: 'Synthetic scoped assignment',
      })
      .expect(201)
  ).body;
}
async function start(id: string, who = 'assessor') {
  const d = await detail(id);
  return (
    await call('post', `/assessor/verifications/${id}/events`, who)
      .send({
        kind: 'START_REVIEW',
        commandId: randomUUID(),
        expectedRevision: d.revision,
      })
      .expect(201)
  ).body;
}
async function ready(rubric = g.rubric) {
  const id = await submitted(rubric);
  await assign(id);
  await start(id);
  return id;
}
async function decision(
  id: string,
  who = 'assessor',
  outcome = 'VERIFIED',
  extra: Record<string, unknown> = {},
) {
  const d = await detail(id, who),
    prior = d.history
      .filter((e: { kind: string }) => e.kind === 'DECISION')
      .at(-1);
  return {
    commandId: randomUUID(),
    expectedRevision: d.revision,
    kind: 'DECISION',
    reviewKind: 'PRIMARY',
    outcome,
    conflictDeclaredClear: true,
    rationale: 'PRIVATE_REVIEW_SENTINEL synthetic rationale',
    candidateExplanation: 'Candidate-safe software fixture explanation',
    findings: d.criteria.map((c: { id: string; version: number }) => ({
      criterionId: c.id,
      criterionVersion: c.version,
      observation: 'Synthetic observed account only',
      outcome: 'DEMONSTRATED',
      rationale: 'Synthetic protocol rationale',
      evidenceIds: [d.evidence.id],
    })),
    ...(prior ? { supersedesDecisionId: prior.id } : {}),
    ...extra,
  };
}
async function recuse(id: string, who = 'assessor') {
  const d = await detail(id);
  return call('post', `/assessor/verifications/${id}/events`, who).send({
    kind: 'RECUSE',
    commandId: randomUUID(),
    expectedRevision: d.revision,
    category: 'GENERAL_DECLARED_CONFLICT',
    reason: 'Synthetic conflict discovered after review',
  });
}
async function assertIneffective(id: string) {
  expect((await detail(id)).result).toMatchObject({
    verified: false,
    evidenceLevelAfter: 'SELF_DECLARED',
    readiness: 'UNCONFIGURED',
  });
  for (const endpoint of [
    '/candidates/me/competency-profile',
    '/candidates/me/skills-passport',
  ]) {
    const p = (await call('get', endpoint).expect(200)).body;
    expect(
      p.governedVerification.find((v: { caseId: string }) => v.caseId === id)
        .verified,
    ).toBe(false);
    expect(p.readiness.determination).toBeNull();
  }
}
async function startOwnedApi() {
  transport = new Agent({ keepAlive: true });
  app = await createApp({
    DATABASE_URL: url,
    OIDC_ISSUER: issuer.issuer,
    OIDC_JWKS_URI: issuer.issuer + '/jwks',
    OIDC_AUDIENCE: 'vetready-api',
    NODE_ENV: 'test',
    PORT: 4000,
  });
  appIsOpen = true;
  await app.listen(0, '127.0.0.1');
}
async function closeOwnedApi() {
  if (appIsOpen) {
    transport.destroy();
    await app.close();
    expect(app.getHttpServer().listening).toBe(false);
    appIsOpen = false;
  }
}
beforeAll(async () => {
  const db = await prepareTestDatabase();
  pool = db.pool;
  url = db.url;
  issuer = await testIssuer();
  await startOwnedApi();
});
beforeAll(async () => {
  for (const who of [
    'owner',
    'other',
    'admin',
    'assessor',
    'unrelated',
    'governor',
    'author',
    'moderator',
    'employer',
  ]) {
    tokens[who] = await issuer.token('verification-' + who);
    ids[who] = (await call('get', '/me', who).expect(200)).body.id;
  }
  for (const [who, role] of [
    ['admin', 'ADMIN'],
    ['assessor', 'ASSESSOR'],
    ['unrelated', 'ASSESSOR'],
    ['moderator', 'ASSESSOR'],
    ['moderator', 'ADMIN'],
  ])
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,$2,'PLATFORM','Synthetic software fixture')",
      [ids[who!], role],
    );
  for (const who of ['owner', 'other'])
    await request(app.getHttpServer())
      .put('/api/v1/candidates/me')
      .agent(transport)
      .auth(tokens[who]!, { type: 'bearer' })
      .send({
        fullName: 'Synthetic verification candidate',
        countryCode: 'NG',
        state: 'Kano',
        willingToRelocate: false,
        drivingAbility: false,
      })
      .expect(200);
});
beforeAll(async () => {
  expect(
    (
      await pool.query(
        "SELECT role_code,permission_code FROM role_permissions WHERE permission_code='verification:govern' ORDER BY role_code",
      )
    ).rows,
  ).toEqual([
    {
      role_code: 'VERIFICATION_GOVERNOR',
      permission_code: 'verification:govern',
    },
  ]);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM user_role_assignments WHERE role_code='VERIFICATION_GOVERNOR'",
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await pool.query(
        'SELECT count(*)::int AS n FROM verification_rubric_versions',
      )
    ).rows[0].n,
  ).toBe(0);
  g = await syntheticVerificationGovernance(pool, {
    governor: ids.governor!,
    author: ids.author!,
    assessor: ids.assessor!,
  });
  const org = (
    await pool.query(
      "INSERT INTO organizations(display_name,sector,country_code,created_by) VALUES('Synthetic employer','SYNTHETIC','NG',$1) RETURNING id",
      [ids.admin],
    )
  ).rows[0].id;
  await pool.query(
    'INSERT INTO organization_memberships(organization_id,user_id) VALUES($1,$2)',
    [org, ids.employer],
  );
  await pool.query(
    "INSERT INTO user_role_assignments(user_id,role_code,role_scope,organization_id,reason) VALUES($1,'EMPLOYER','ORGANIZATION',$2,'Synthetic privacy boundary')",
    [ids.employer, org],
  );
});
// Independent business scenarios must not consume one another's real HTTP quota.
beforeEach(async () => {
  await closeOwnedApi();
  await startOwnedApi();
});
afterEach(closeOwnedApi);
it('enforces the unchanged production request limit on one real API instance', async () => {
  const id = await submitted();
  const first = await call('get', `${base}/${id}`).expect(200);
  const limit = Number(first.headers['x-ratelimit-limit']);
  expect(limit).toBe(120);
  for (let n = 1; n < limit; n++)
    await call('get', `${base}/${id}`).expect(200);
  const blocked = await call('get', `${base}/${id}`).expect(429);
  expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
});
it('withholds a primary verification after recusal and restores only a new independent outcome', async () => {
  const id = await ready();
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id))
    .expect(201);
  const original = (
    await pool.query(
      "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='DECISION' ORDER BY revision",
      [id],
    )
  ).rows;
  expect((await recuse(id)).status).toBe(201);
  await assertIneffective(id);
  await call('get', `/assessor/verifications/${id}`, 'assessor').expect(404);
  expect(
    (
      await pool.query(
        "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='DECISION' ORDER BY revision",
        [id],
      )
    ).rows,
  ).toEqual(original);
  await authorizeSyntheticAssessor(
    pool,
    ids.governor!,
    ids.moderator!,
    g.rubric,
  );
  await assign(id, 'moderator');
  await start(id, 'moderator');
  await call('post', `/assessor/verifications/${id}/events`, 'moderator')
    .send(await decision(id, 'moderator'))
    .expect(201);
  expect((await detail(id)).result.verified).toBe(true);
});
it.each(['assessor', 'moderator'])(
  'withholds moderated verification when supporting %s recuses without granting former private access',
  async (who) => {
    const m = await syntheticVerificationGovernance(pool, {
      governor: ids.governor!,
      author: ids.author!,
      assessor: ids.assessor!,
      moderation: true,
    });
    const id = await ready(m.rubric);
    await call('post', `/assessor/verifications/${id}/events`, 'assessor')
      .send(await decision(id))
      .expect(201);
    await authorizeSyntheticAssessor(
      pool,
      ids.governor!,
      ids.moderator!,
      m.rubric,
    );
    await assign(id, 'moderator');
    await start(id, 'moderator');
    await call('post', `/assessor/verifications/${id}/events`, 'moderator')
      .send(
        await decision(id, 'moderator', 'VERIFIED', {
          reviewKind: 'MODERATION',
        }),
      )
      .expect(201);
    const before = (
      await pool.query(
        "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='DECISION' ORDER BY revision",
        [id],
      )
    ).rows;
    if (who === 'assessor')
      await call('get', `/assessor/verifications/${id}`, 'assessor').expect(
        404,
      );
    expect((await recuse(id, who)).status).toBe(201);
    await assertIneffective(id);
    await call('get', `/assessor/verifications/${id}`, who).expect(404);
    expect(
      (
        await pool.query(
          "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='DECISION' ORDER BY revision",
          [id],
        )
      ).rows,
    ).toEqual(before);
  },
);
it.each(['PRIMARY', 'MODERATION'])(
  'serializes %s verification against recusal and never leaves an effective conflicted outcome',
  async (mode) => {
    let id: string,
      who = 'assessor';
    if (mode === 'PRIMARY') id = await ready();
    else {
      const m = await syntheticVerificationGovernance(pool, {
        governor: ids.governor!,
        author: ids.author!,
        assessor: ids.assessor!,
        moderation: true,
      });
      id = await ready(m.rubric);
      await call('post', `/assessor/verifications/${id}/events`, 'assessor')
        .send(await decision(id))
        .expect(201);
      await authorizeSyntheticAssessor(
        pool,
        ids.governor!,
        ids.moderator!,
        m.rubric,
      );
      await assign(id, 'moderator');
      await start(id, 'moderator');
      who = 'moderator';
    }
    const b = await decision(id, who, 'VERIFIED', { reviewKind: mode }),
      coi = {
        kind: 'RECUSE',
        commandId: randomUUID(),
        expectedRevision: b.expectedRevision,
        category: 'GENERAL',
        reason: 'Synthetic concurrent conflict declaration',
      };
    const results = await Promise.all([
      call('post', `/assessor/verifications/${id}/events`, who).send(b),
      call('post', `/assessor/verifications/${id}/events`, 'assessor').send(
        coi,
      ),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(
      results
        .filter((r) => r.status !== 201)
        .every((r) => [404, 409].includes(r.status)),
    ).toBe(true);
    if (results[1]!.status === 409)
      expect((await recuse(id, 'assessor')).status).toBe(201);
    await assertIneffective(id);
  },
);
it('continues a withdrawn reassessment lineage and retains appeal eligibility for its historical decision', async () => {
  const id = await ready();
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id, 'assessor', 'MORE_EVIDENCE_REQUIRED'))
    .expect(201);
  const old = (
    await pool.query(
      "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='DECISION'",
      [id],
    )
  ).rows;
  const second = (
    await call('post', base)
      .send({ ...submission(), previousCaseId: id })
      .expect(201)
  ).body.id;
  await call('post', `${base}/${second}/events`)
    .send({
      kind: 'WITHDRAW',
      commandId: randomUUID(),
      expectedRevision: 0,
      reason: 'Synthetic withdrawal of pending reassessment',
    })
    .expect(201);
  await call('post', `${base}/${id}/events`)
    .send({
      kind: 'APPEAL',
      commandId: randomUUID(),
      expectedRevision: (await detail(id)).revision,
      reason: 'Synthetic appeal of historical decision',
    })
    .expect(201);
  const third = (
    await call('post', base)
      .send({ ...submission(), previousCaseId: second })
      .expect(201)
  ).body.id;
  await call('post', base, 'other')
    .send({ ...submission(), previousCaseId: second })
    .expect(409);
  await assign(third);
  await start(third);
  await call('post', `/assessor/verifications/${third}/events`, 'assessor')
    .send(await decision(third))
    .expect(201);
  const visible = (await call('get', base).expect(200)).body;
  expect(
    visible.some(
      (v: { caseId: string }) => v.caseId === id || v.caseId === second,
    ),
  ).toBe(false);
  expect(
    visible.find((v: { caseId: string }) => v.caseId === third).verified,
  ).toBe(true);
  expect(
    (
      await pool.query(
        "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='DECISION'",
        [id],
      )
    ).rows,
  ).toEqual(old);
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id, 'assessor', 'VERIFIED'))
    .expect(409);
});
it('permits only one concurrent successor of a withdrawn pending reassessment', async () => {
  const id = await ready();
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id, 'assessor', 'MORE_EVIDENCE_REQUIRED'))
    .expect(201);
  const second = (
    await call('post', base)
      .send({ ...submission(), previousCaseId: id })
      .expect(201)
  ).body.id;
  await call('post', `${base}/${second}/events`)
    .send({
      kind: 'WITHDRAW',
      commandId: randomUUID(),
      expectedRevision: 0,
      reason: 'Synthetic withdrawal before concurrent successors',
    })
    .expect(201);
  const outcomes = await Promise.all([
    call('post', base).send({ ...submission(), previousCaseId: second }),
    call('post', base).send({ ...submission(), previousCaseId: second }),
  ]);
  expect(outcomes.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(
    (
      await pool.query(
        'SELECT count(*)::int AS n FROM verification_cases WHERE previous_case_id=$1',
        [second],
      )
    ).rows[0].n,
  ).toBe(1);
});
afterAll(async () => {
  await closeOwnedApi();
  await pool?.end();
  await issuer?.close();
});
it('does not expose review internals or raw evidence to an employer membership', async () => {
  const id = await submitted();
  await assign(id);
  await call('get', `/assessor/verifications/${id}`, 'employer').expect(403);
  await call('get', `/admin/verifications/${id}`, 'employer').expect(403);
  await call('get', `${base}/${id}`, 'employer').expect(404);
  await call('post', `/assessor/verifications/${id}/events`, 'employer')
    .send({
      kind: 'START_REVIEW',
      commandId: randomUUID(),
      expectedRevision: 1,
    })
    .expect(403);
});
it.each([
  'missingConflict',
  'emptyFindings',
  'foreignEvidence',
  'missingAuthorization',
])(
  'enforces %s directly in PostgreSQL independently of HTTP validation',
  async (variant) => {
    const id = await ready(),
      b = await decision(id);
    const payload: Record<string, unknown> = {
      ...b,
      authorizationId: g.authorization,
    };
    if (variant === 'missingConflict') delete payload.conflictDeclaredClear;
    if (variant === 'emptyFindings') payload.findings = [];
    if (variant === 'foreignEvidence')
      payload.findings = [{ ...b.findings[0], evidenceIds: [randomUUID()] }];
    if (variant === 'missingAuthorization') payload.authorizationId = null;
    await expect(
      pool.query(
        `INSERT INTO verification_case_events(case_id,revision,kind,outcome,payload,actor_id,command_id,input_digest,request_id) VALUES($1,3,'DECISION','VERIFIED',$2,$3,$4,$5,$6)`,
        [
          id,
          JSON.stringify(payload),
          ids.assessor,
          randomUUID(),
          '0'.repeat(64),
          randomUUID(),
        ],
      ),
    ).rejects.toThrow();
    expect((await detail(id)).revision).toBe(2);
  },
);
it('submits owned canonical evidence and an immutable context-bound case', async () => {
  const id = await submitted(),
    d = await detail(id);
  expect(d.result).toMatchObject({
    verified: false,
    evidenceLevelAfter: 'SELF_DECLARED',
    outcome: null,
    readiness: 'UNCONFIGURED',
  });
  const e = (
    await pool.query(
      'SELECT e.* FROM competency_evidence e JOIN verification_cases v ON v.evidence_id=e.id WHERE v.id=$1',
      [id],
    )
  ).rows[0];
  expect(e).toMatchObject({
    status: 'UNVERIFIED',
    source_kind: 'EXTERNAL_SUBMISSION',
    demo: false,
  });
});
it('replays identical submissions and conflicts when command meaning changes', async () => {
  const b = submission();
  const a = await call('post', base).send(b).expect(201);
  expect((await call('post', base).send(b).expect(201)).body.id).toBe(
    a.body.id,
  );
  await call('post', base)
    .send({ ...b, summary: 'Changed command meaning' })
    .expect(409);
});
it('rejects spoofed ownership and invalid rubric references', async () => {
  await call('post', base)
    .send({ ...submission(), candidateId: ids.other })
    .expect(422);
  await call('post', base).send(submission(randomUUID())).expect(422);
});
it('denies anonymous and cross-candidate access', async () => {
  const id = await submitted();
  await request(app.getHttpServer())
    .get('/api/v1' + base)
    .expect(401);
  await call('get', `${base}/${id}`, 'other').expect(404);
  await call('post', `${base}/${id}/events`, 'other')
    .send({
      kind: 'WITHDRAW',
      commandId: randomUUID(),
      expectedRevision: 0,
      reason: 'Cross-owner attempt fixture',
    })
    .expect(404);
});
it('scopes assessor access to the latest independent assignment', async () => {
  const id = await submitted();
  await call('get', `/assessor/verifications/${id}`, 'unrelated').expect(404);
  await call('get', `/assessor/verifications/${id}`, 'owner').expect(403);
  await assign(id);
  expect((await detail(id, 'assessor')).evidence.summary).toContain(
    'PRIVATE_CANDIDATE_ACCOUNT',
  );
  await call('get', `/assessor/verifications/${id}`, 'unrelated').expect(404);
});
it('does not qualify administrators as professional assessors', async () => {
  const id = await submitted();
  await call('post', `/admin/verifications/${id}/assignments`, 'admin')
    .send({
      commandId: randomUUID(),
      expectedRevision: 0,
      assessorId: ids.admin,
      reason: 'Administrator is not an eligible assessor',
    })
    .expect(409);
  await call('post', `/admin/verifications/${id}/assignments`, 'owner')
    .send({
      commandId: randomUUID(),
      expectedRevision: 0,
      assessorId: ids.owner,
      reason: 'Candidate privilege escalation',
    })
    .expect(403);
});
it('rejects capability-only assessors without exact professional authorization', async () => {
  const id = await submitted();
  await call('post', `/admin/verifications/${id}/assignments`, 'admin')
    .send({
      commandId: randomUUID(),
      expectedRevision: 0,
      assessorId: ids.unrelated,
      reason: 'Unapproved scope software fixture',
    })
    .expect(409);
});
it('records conflicts, blocks the recused assessor and preserves reassignment history', async () => {
  const id = await ready();
  const d = await detail(id);
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send({
      kind: 'RECUSE',
      commandId: randomUUID(),
      expectedRevision: d.revision,
      category: 'GENERAL_DECLARED_CONFLICT',
      reason: 'Synthetic declared relationship',
    })
    .expect(201);
  await call('get', `/assessor/verifications/${id}`, 'assessor').expect(404);
  await call('post', `/admin/verifications/${id}/assignments`, 'admin')
    .send({
      commandId: randomUUID(),
      expectedRevision: d.revision + 1,
      assessorId: ids.assessor,
      reason: 'Cannot clear a conflict by reassignment',
    })
    .expect(409);
  await authorizeSyntheticAssessor(
    pool,
    ids.governor!,
    ids.unrelated!,
    g.rubric,
  );
  await assign(id, 'unrelated');
  expect(
    (await detail(id, 'unrelated')).history.filter(
      (e: { kind: string }) => e.kind === 'ASSIGN',
    ),
  ).toHaveLength(2);
});
it('rejects a decision before review start and stale review forms', async () => {
  const id = await submitted();
  await assign(id);
  const b = await decision(id);
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(b)
    .expect(409);
  await start(id);
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(b)
    .expect(409);
});
it('verifies exact evidence without mutating its original receipt or awarding readiness', async () => {
  const id = await ready(),
    before = (
      await pool.query(
        'SELECT e.* FROM competency_evidence e JOIN verification_cases c ON c.evidence_id=e.id WHERE c.id=$1',
        [id],
      )
    ).rows;
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id))
    .expect(201);
  const d = await detail(id);
  expect(d.result).toMatchObject({
    verified: true,
    evidenceLevelBefore: 'SELF_DECLARED',
    evidenceLevelAfter: 'PRACTICALLY_VERIFIED',
    readiness: 'UNCONFIGURED',
  });
  expect(
    (
      await pool.query(
        'SELECT e.* FROM competency_evidence e JOIN verification_cases c ON c.evidence_id=e.id WHERE c.id=$1',
        [id],
      )
    ).rows,
  ).toEqual(before);
  for (const endpoint of [
    '/candidates/me/competency-profile',
    '/candidates/me/skills-passport',
  ]) {
    const p = (await call('get', endpoint).expect(200)).body;
    expect(
      p.governedVerification.find((x: { caseId: string }) => x.caseId === id)
        .verified,
    ).toBe(true);
    expect(p.readiness.determination).toBeNull();
    expect(JSON.stringify(p)).not.toContain('PRIVATE_REVIEW_SENTINEL');
    expect(JSON.stringify(p)).not.toContain('PRIVATE_CANDIDATE_ACCOUNT');
  }
  expect(JSON.stringify(d)).not.toContain('PRIVATE_REVIEW_SENTINEL');
  expect(JSON.stringify(await detail(id, 'admin'))).not.toContain(
    'PRIVATE_CANDIDATE_ACCOUNT',
  );
});
it.each([
  'criterionVersion',
  'evidenceIds',
  'missingCriterion',
  'conflictClearance',
])('rejects invalid structured %s', async (kind) => {
  const id = await ready(),
    b = await decision(id);
  if (kind === 'criterionVersion') b.findings[0].criterionVersion = 99;
  if (kind === 'evidenceIds') b.findings[0].evidenceIds = [randomUUID()];
  if (kind === 'missingCriterion') b.findings = [];
  if (kind === 'conflictClearance') b.conflictDeclaredClear = false;
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(b)
    .expect(kind === 'conflictClearance' ? 422 : 409);
});
it('replays decisions and rejects concurrent incompatible decisions', async () => {
  const id = await ready(),
    b = await decision(id);
  const identical = await Promise.all([
    call('post', `/assessor/verifications/${id}/events`, 'assessor').send(b),
    call('post', `/assessor/verifications/${id}/events`, 'assessor').send(b),
  ]);
  expect(identical.map((r) => r.status)).toEqual([201, 201]);
  expect(identical[0]!.body.id).toBe(identical[1]!.body.id);
  const next = await decision(id);
  const results = await Promise.all([
    call('post', `/assessor/verifications/${id}/events`, 'assessor').send(next),
    call('post', `/assessor/verifications/${id}/events`, 'assessor').send({
      ...next,
      commandId: randomUUID(),
      outcome: 'NOT_DEMONSTRATED',
    }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
});
it('invalidates via linked successor without erasing the original decision', async () => {
  const id = await ready();
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id))
    .expect(201);
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id, 'assessor', 'INVALIDATED', { findings: [] }))
    .expect(201);
  const d = await detail(id);
  expect(d.result.verified).toBe(false);
  expect(
    d.history.filter((e: { kind: string }) => e.kind === 'DECISION').at(-1),
  ).toMatchObject({
    evidenceLevelBefore: 'PRACTICALLY_VERIFIED',
    evidenceLevelAfter: 'SELF_DECLARED',
  });
  expect(
    d.history.filter((e: { kind: string }) => e.kind === 'DECISION'),
  ).toHaveLength(2);
});
it('supports immutable appeal initiation and reassessment lineage', async () => {
  const id = await ready();
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id, 'assessor', 'MORE_EVIDENCE_REQUIRED'))
    .expect(201);
  const d = await detail(id);
  await call('post', `${base}/${id}/events`)
    .send({
      kind: 'APPEAL',
      commandId: randomUUID(),
      expectedRevision: d.revision,
      reason: 'Candidate requests a further review',
    })
    .expect(201);
  const next = await call('post', base)
    .send({ ...submission(), previousCaseId: id })
    .expect(201);
  expect((await detail(next.body.id)).result.verified).toBe(false);
  expect(
    (await detail(id)).history.filter(
      (e: { kind: string }) => e.kind === 'DECISION',
    ),
  ).toHaveLength(1);
  await call('post', base, 'other')
    .send({ ...submission(), previousCaseId: id })
    .expect(409);
});
it('retains demonstration boundaries despite reviewed structured findings', async () => {
  const demo = await syntheticVerificationGovernance(pool, {
    governor: ids.governor!,
    author: ids.author!,
    assessor: ids.assessor!,
    demo: true,
  });
  const id = await ready(demo.rubric);
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id))
    .expect(409);
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id, 'assessor', 'PARTIALLY_DEMONSTRATED'))
    .expect(201);
  expect((await detail(id)).result.verified).toBe(false);
});
it('honours externally configured second review and assessor separation', async () => {
  const m = await syntheticVerificationGovernance(pool, {
    governor: ids.governor!,
    author: ids.author!,
    assessor: ids.assessor!,
    moderation: true,
  });
  const id = await ready(m.rubric);
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id))
    .expect(201);
  expect((await detail(id)).result.verified).toBe(false);
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(
      await decision(id, 'assessor', 'VERIFIED', { reviewKind: 'MODERATION' }),
    )
    .expect(409);
  await authorizeSyntheticAssessor(
    pool,
    ids.governor!,
    ids.moderator!,
    m.rubric,
  );
  await assign(id, 'moderator');
  await start(id, 'moderator');
  await call('post', `/assessor/verifications/${id}/events`, 'moderator')
    .send(
      await decision(id, 'moderator', 'VERIFIED', { reviewKind: 'MODERATION' }),
    )
    .expect(201);
  expect((await detail(id)).result.verified).toBe(true);
});
it('withdraws pending evidence and denies further review', async () => {
  const id = await submitted();
  await call('post', `${base}/${id}/events`)
    .send({
      kind: 'WITHDRAW',
      commandId: randomUUID(),
      expectedRevision: 0,
      reason: 'Candidate withdrew pending account',
    })
    .expect(201);
  await call('post', `/admin/verifications/${id}/assignments`, 'admin')
    .send({
      commandId: randomUUID(),
      expectedRevision: 1,
      assessorId: ids.assessor,
      reason: 'Attempt after candidate withdrawal',
    })
    .expect(409);
  expect((await detail(id)).result.verified).toBe(false);
});
it('rolls back review events if the canonical audit write fails', async () => {
  const id = await ready(),
    b = await decision(id);
  await pool.query(
    `CREATE FUNCTION fail_verification_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='verification.verification_case_events.recorded' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF;RETURN NEW; END $$;CREATE TRIGGER fail_verification_audit_test BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_verification_audit_test()`,
  );
  try {
    await call('post', `/assessor/verifications/${id}/events`, 'assessor')
      .send(b)
      .expect(500);
    expect((await detail(id)).revision).toBe(2);
  } finally {
    await pool.query(
      'DROP TRIGGER fail_verification_audit_test ON audit_events;DROP FUNCTION fail_verification_audit_test()',
    );
  }
});
it('keeps case and event records append-only at the database boundary', async () => {
  const id = await ready();
  await expect(
    pool.query("UPDATE verification_cases SET activity='changed' WHERE id=$1", [
      id,
    ]),
  ).rejects.toThrow();
  await expect(
    pool.query('DELETE FROM verification_case_events WHERE case_id=$1', [id]),
  ).rejects.toThrow();
});
it('rejects a disallowed remote process instead of treating it as in-person verification', async () => {
  await call('post', base)
    .send({ ...submission(), process: 'REMOTE_OBSERVATION' })
    .expect(409);
});
it('removes effective verification after its exact authorization is revoked', async () => {
  const isolated = await syntheticVerificationGovernance(pool, {
    governor: ids.governor!,
    author: ids.author!,
    assessor: ids.assessor!,
  });
  const id = await ready(isolated.rubric);
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id))
    .expect(201);
  await pool.query(
    'INSERT INTO verification_governance_revocations(authorization_id,reason,actor_id,request_id) VALUES($1,$2,$3,$4)',
    [
      isolated.authorization,
      'Synthetic authority revoked',
      ids.governor,
      randomUUID(),
    ],
  );
  await call('get', `/assessor/verifications/${id}`, 'assessor').expect(404);
  const queue = await call('get', '/assessor/verifications', 'assessor').expect(
    200,
  );
  expect(queue.body.some((v: { id: string }) => v.id === id)).toBe(false);
  expect((await detail(id)).result.verified).toBe(false);
});
async function moderatedAuthorityFixture() {
  const governance = await syntheticVerificationGovernance(pool, {
    governor: ids.governor!,
    author: ids.author!,
    assessor: ids.assessor!,
    moderation: true,
  });
  const id = await ready(governance.rubric);
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id))
    .expect(201);
  const moderatorAuthorization = await authorizeSyntheticAssessor(
    pool,
    ids.governor!,
    ids.moderator!,
    governance.rubric,
  );
  await assign(id, 'moderator');
  await start(id, 'moderator');
  return { ...governance, id, moderatorAuthorization };
}
async function moderateAuthorityFixture(
  f: Awaited<ReturnType<typeof moderatedAuthorityFixture>>,
) {
  await call('post', `/assessor/verifications/${f.id}/events`, 'moderator')
    .send(
      await decision(f.id, 'moderator', 'VERIFIED', {
        reviewKind: 'MODERATION',
      }),
    )
    .expect(201);
  expect((await detail(f.id)).result.verified).toBe(true);
}
async function revokeAuthority(authorization: string) {
  await pool.query(
    'INSERT INTO verification_governance_revocations(authorization_id,reason,actor_id,request_id) VALUES($1,$2,$3,$4)',
    [
      authorization,
      'Synthetic supporting authority revoked',
      ids.governor,
      randomUUID(),
    ],
  );
}
async function authorityDecisions(id: string) {
  return (
    await pool.query(
      "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='DECISION' ORDER BY revision",
      [id],
    )
  ).rows;
}
it.each(['PRIMARY', 'MODERATION'])(
  'withholds moderated claims after exact supporting %s authorization revocation without rewriting history',
  async (kind) => {
    const f = await moderatedAuthorityFixture();
    await moderateAuthorityFixture(f);
    const before = await authorityDecisions(f.id);
    await revokeAuthority(
      kind === 'PRIMARY' ? f.authorization : f.moderatorAuthorization,
    );
    await assertIneffective(f.id);
    expect(await authorityDecisions(f.id)).toEqual(before);
    const who = kind === 'PRIMARY' ? 'assessor' : 'moderator';
    await call('get', `/assessor/verifications/${f.id}`, who).expect(404);
  },
);
it('withholds a moderated claim when its exact primary authorization expires despite another live grant', async () => {
  const f = await syntheticVerificationGovernance(pool, {
    governor: ids.governor!,
    author: ids.author!,
    assessor: ids.assessor!,
    moderation: true,
  });
  const id = await ready(f.rubric);
  const expiring = (
    await pool.query(
      `INSERT INTO verification_assessor_authorizations(assessor_id,rubric_version_id,approval_reference,valid_until,actor_id,request_id)
     VALUES($1,$2,'SYNTHETIC EXPIRY FIXTURE',now()+interval '30 seconds',$3,$4) RETURNING id,valid_until`,
      [ids.assessor, f.rubric, ids.governor, randomUUID()],
    )
  ).rows[0];
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id))
    .expect(201);
  expect((await authorityDecisions(id))[0].payload.authorizationId).toBe(
    expiring.id,
  );
  const moderatorAuthorization = await authorizeSyntheticAssessor(
    pool,
    ids.governor!,
    ids.moderator!,
    f.rubric,
  );
  await assign(id, 'moderator');
  await start(id, 'moderator');
  await moderateAuthorityFixture({ ...f, id, moderatorAuthorization });
  const before = await authorityDecisions(id);
  await pool.query(
    'SELECT pg_sleep(greatest(0,extract(epoch FROM ($1::timestamptz-now())))+0.05)',
    [expiring.valid_until],
  );
  expect(
    (
      await pool.query('SELECT verification18_authorized($1,$2) AS allowed', [
        ids.assessor,
        f.rubric,
      ])
    ).rows[0].allowed,
  ).toBe(true);
  await assertIneffective(id);
  expect(await authorityDecisions(id)).toEqual(before);
}, 60000);
it('rejects moderation over revoked primary authority through both API and direct persistence', async () => {
  const f = await moderatedAuthorityFixture();
  const b = await decision(f.id, 'moderator', 'VERIFIED', {
    reviewKind: 'MODERATION',
  });
  const before = await authorityDecisions(f.id);
  await revokeAuthority(f.authorization);
  await call('post', `/assessor/verifications/${f.id}/events`, 'moderator')
    .send(b)
    .expect(409);
  await expect(
    pool.query(
      `INSERT INTO verification_case_events(case_id,revision,kind,outcome,supersedes_decision_id,payload,actor_id,command_id,input_digest,request_id)
     VALUES($1,$2,'DECISION','VERIFIED',$3,$4,$5,$6,$7,$8)`,
      [
        f.id,
        b.expectedRevision + 1,
        b.supersedesDecisionId,
        JSON.stringify({ ...b, authorizationId: f.moderatorAuthorization }),
        ids.moderator,
        randomUUID(),
        '0'.repeat(64),
        randomUUID(),
      ],
    ),
  ).rejects.toThrow('Verification valid supporting authority required');
  await assertIneffective(f.id);
  expect(await authorityDecisions(f.id)).toEqual(before);
});
it('fails closed after concurrent primary authorization revocation and moderation', async () => {
  const f = await moderatedAuthorityFixture();
  const b = await decision(f.id, 'moderator', 'VERIFIED', {
    reviewKind: 'MODERATION',
  });
  const [result] = await Promise.all([
    call('post', `/assessor/verifications/${f.id}/events`, 'moderator').send(b),
    revokeAuthority(f.authorization),
  ]);
  expect([201, 409]).toContain(result.status);
  await assertIneffective(f.id);
  expect((await authorityDecisions(f.id))[0].payload.authorizationId).toBe(
    f.authorization,
  );
});
it.each(['PRIMARY', 'MODERATION'])(
  'checks %s authorization throughout a multi-level support chain',
  async (kind) => {
    const f = await moderatedAuthorityFixture();
    await moderateAuthorityFixture(f);
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,'ADMIN','PLATFORM','Synthetic independent moderation fixture') ON CONFLICT DO NOTHING",
      [ids.unrelated],
    );
    await authorizeSyntheticAssessor(
      pool,
      ids.governor!,
      ids.unrelated!,
      f.rubric,
    );
    await assign(f.id, 'unrelated');
    await start(f.id, 'unrelated');
    await call('post', `/assessor/verifications/${f.id}/events`, 'unrelated')
      .send(
        await decision(f.id, 'unrelated', 'VERIFIED', {
          reviewKind: 'MODERATION',
        }),
      )
      .expect(201);
    expect((await detail(f.id)).result.verified).toBe(true);
    const before = await authorityDecisions(f.id);
    await revokeAuthority(
      kind === 'PRIMARY' ? f.authorization : f.moderatorAuthorization,
    );
    await assertIneffective(f.id);
    expect(await authorityDecisions(f.id)).toEqual(before);
  },
);
it('restores only a valid independent new review chain rather than reviving revoked decisions with another grant', async () => {
  const f = await moderatedAuthorityFixture();
  await moderateAuthorityFixture(f);
  const before = await authorityDecisions(f.id);
  await revokeAuthority(f.authorization);
  await authorizeSyntheticAssessor(
    pool,
    ids.governor!,
    ids.assessor!,
    f.rubric,
  );
  await assertIneffective(f.id);
  await authorizeSyntheticAssessor(
    pool,
    ids.governor!,
    ids.unrelated!,
    f.rubric,
  );
  await assign(f.id, 'unrelated');
  await start(f.id, 'unrelated');
  await call('post', `/assessor/verifications/${f.id}/events`, 'unrelated')
    .send(await decision(f.id, 'unrelated'))
    .expect(201);
  await assertIneffective(f.id);
  await assign(f.id, 'moderator');
  await start(f.id, 'moderator');
  await moderateAuthorityFixture(f);
  expect((await authorityDecisions(f.id)).slice(0, before.length)).toEqual(
    before,
  );
});
it('validates migration ledger ordering, checksums, reruns and seed repeatability', async () => {
  const before = (
    await pool.query('SELECT * FROM schema_migrations ORDER BY name')
  ).rows;
  expect(before).toHaveLength(18);
  for (const row of before)
    expect(row.checksum).toBe(
      createHash('sha256')
        .update(readFileSync('db/migrations/' + row.name))
        .digest('hex'),
    );
  for (const file of ['scripts/migrate.ts', 'scripts/seed.ts'])
    execFileSync(process.execPath, ['--import', 'tsx', file], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  expect(
    (await pool.query('SELECT * FROM schema_migrations ORDER BY name')).rows,
  ).toEqual(before);
  expect(
    readdirSync('db/migrations').filter((x) => x.endsWith('.sql')),
  ).toHaveLength(18);
});
describe('populated 017 upgrade', () => {
  const name = 'vetready_phase3j_upgrade_test';
  let created = false;
  let upgradeUrl: string;
  let before: Record<string, unknown>;
  const tables = [
    'users',
    'candidate_profiles',
    'browser_sessions',
    'competency_profile_snapshots',
    'development_workflow_plans',
    'competency_evidence',
    'evidence_submission_versions',
    'audit_events',
  ];
  const snapshot = async (upgrade: Pool) => {
    const result: Record<string, unknown> = {};
    for (const table of tables)
      result[table] = (
        await upgrade.query(
          `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM ${table} t`,
        )
      ).rows[0].rows;
    return result;
  };
  // Legacy preparation belongs to the fixture lifecycle, not the timed upgrade operation.
  beforeAll(async () => {
    await pool.query(`CREATE DATABASE ${name}`);
    created = true;
    const parsed = new URL(url);
    parsed.pathname = '/' + name;
    upgradeUrl = parsed.toString();
    const upgrade = new Pool({ connectionString: upgradeUrl });
    let legacy: INestApplication | undefined;
    try {
      await upgrade.query(
        'CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
      );
      for (const file of readdirSync('db/migrations')
        .filter((f) => f.endsWith('.sql') && f < '018')
        .sort()) {
        const bytes = readFileSync('db/migrations/' + file);
        await upgrade.query(bytes.toString());
        await upgrade.query(
          'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
          [file, createHash('sha256').update(bytes).digest('hex')],
        );
      }
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
        env: { ...process.env, DATABASE_URL: upgradeUrl },
        stdio: 'pipe',
      });
      legacy = await createApp({
        DATABASE_URL: upgradeUrl,
        OIDC_ISSUER: issuer.issuer,
        OIDC_JWKS_URI: issuer.issuer + '/jwks',
        OIDC_AUDIENCE: 'vetready-api',
        NODE_ENV: 'test',
        PORT: 4000,
      });
      await legacy.listen(0, '127.0.0.1');
      const server = request(legacy.getHttpServer());
      await server
        .put('/api/v1/candidates/me')
        .auth(tokens.owner!, { type: 'bearer' })
        .send({
          fullName: 'Synthetic upgrade candidate',
          countryCode: 'NG',
          state: 'Kano',
          willingToRelocate: false,
          drivingAbility: false,
        })
        .expect(200);
      await server
        .post('/api/v1/sessions')
        .auth(tokens.owner!, { type: 'bearer' })
        .expect(201);
      await server
        .post('/api/v1/candidates/me/development-workflows')
        .auth(tokens.owner!, { type: 'bearer' })
        .send({
          commandId: randomUUID(),
          pathwayVersionId: (
            await upgrade.query(
              "SELECT pv.id FROM pathway_versions pv JOIN pathways p ON p.id=pv.pathway_id WHERE p.code='DAIRY' ORDER BY pv.version DESC LIMIT 1",
            )
          ).rows[0].id,
        })
        .expect(201);
      before = await snapshot(upgrade);
    } finally {
      try {
        await legacy?.close();
      } finally {
        await upgrade.end();
      }
    }
  });
  afterAll(async () => {
    if (created) await pool.query(`DROP DATABASE ${name}`);
  });
  it('upgrades populated 001–017 without changing plans, snapshots, sessions or canonical history', async () => {
    const upgrade = new Pool({ connectionString: upgradeUrl });
    try {
      expect((before.development_workflow_plans as unknown[]).length).toBe(1);
      execFileSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/migrate.ts'],
        {
          env: { ...process.env, DATABASE_URL: upgradeUrl },
          stdio: 'pipe',
        },
      );
      expect(await snapshot(upgrade)).toEqual(before);
      expect(
        (await upgrade.query('SELECT * FROM schema_migrations ORDER BY name'))
          .rowCount,
      ).toBe(18);
    } finally {
      await upgrade.end();
    }
  });
});

async function insertCriteriaFixture(value: unknown) {
  const r = (
    await pool.query('SELECT * FROM verification_rubric_versions WHERE id=$1', [
      g.rubric,
    ])
  ).rows[0];
  const n = (
    await pool.query(
      "SELECT max(version)+1 AS n FROM verification_rubric_versions WHERE pathway_version_id=$1 AND child_version_id=$2 AND method='PRACTICAL'",
      [g.path, g.child],
    )
  ).rows[0].n;
  return pool.query(
    `INSERT INTO verification_rubric_versions(pathway_version_id,child_version_id,version,method,facet,criteria,status,demo,policy_reference,approval_reference,moderation_required,allowed_processes,authored_by,actor_id,request_id) VALUES($1,$2,$3,'PRACTICAL','PRACTICALLY_VERIFIED',$4,'APPROVED',false,$5,$6,false,ARRAY['IN_PERSON'],$7,$8,$9) RETURNING id,criteria`,
    [
      g.path,
      g.child,
      n,
      value === undefined ? null : JSON.stringify(value),
      r.policy_reference,
      r.approval_reference,
      ids.author,
      ids.governor,
      randomUUID(),
    ],
  );
}
const invalidCriteriaCases: Array<
  [string, (c: Record<string, unknown>) => unknown]
> = [
  ['SQL null', () => undefined],
  ['JSON null', () => null],
  ['object array container', () => ({})],
  ['empty array', () => []],
  [
    'too many criteria',
    (c) => Array.from({ length: 101 }, () => ({ ...c, id: randomUUID() })),
  ],
  ['null criterion', () => [null]],
  ['array criterion', () => [[]]],
  [
    'missing id',
    (c) => [
      {
        version: c.version,
        criterion: c.criterion,
        evidenceRequirement: c.evidenceRequirement,
      },
    ],
  ],
  ['non UUID', (c) => [{ ...c, id: 'not-a-uuid' }]],
  [
    'unsupported UUID version',
    (c) => [{ ...c, id: 'aaaaaaaa-aaaa-0aaa-8aaa-aaaaaaaaaaaa' }],
  ],
  ['string version', (c) => [{ ...c, version: '1' }]],
  ['null version', (c) => [{ ...c, version: null }]],
  [
    'missing version',
    (c) => [
      {
        id: c.id,
        criterion: c.criterion,
        evidenceRequirement: c.evidenceRequirement,
      },
    ],
  ],
  ['zero version', (c) => [{ ...c, version: 0 }]],
  ['negative version', (c) => [{ ...c, version: -1 }]],
  ['fractional version', (c) => [{ ...c, version: 1.5 }]],
  ['unsafe version', (c) => [{ ...c, version: 9007199254740992 }]],
  ['numeric criterion', (c) => [{ ...c, criterion: 42 }]],
  ['object criterion', (c) => [{ ...c, criterion: { unexpected: true } }]],
  ['null criterion text', (c) => [{ ...c, criterion: null }]],
  [
    'missing criterion text',
    (c) => [
      {
        id: c.id,
        version: c.version,
        evidenceRequirement: c.evidenceRequirement,
      },
    ],
  ],
  ['blank criterion', (c) => [{ ...c, criterion: '' }]],
  ['trim-only criterion', (c) => [{ ...c, criterion: '\t\n\u00a0\ufeff' }]],
  ['long criterion', (c) => [{ ...c, criterion: 'x'.repeat(1001) }]],
  [
    'Unicode code-point criterion bound',
    (c) => [{ ...c, criterion: '😀'.repeat(1001) }],
  ],
  ['numeric requirement', (c) => [{ ...c, evidenceRequirement: 42 }]],
  [
    'object requirement',
    (c) => [{ ...c, evidenceRequirement: { unexpected: true } }],
  ],
  [
    'missing requirement',
    (c) => [{ id: c.id, version: c.version, criterion: c.criterion }],
  ],
  ['blank requirement', (c) => [{ ...c, evidenceRequirement: ' ' }]],
  [
    'long requirement',
    (c) => [{ ...c, evidenceRequirement: 'x'.repeat(1001) }],
  ],
  ['unsupported field', (c) => [{ ...c, unsupported: true }]],
  [
    'duplicate UUID casing',
    (c) => [
      { ...c, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { ...c, id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' },
    ],
  ],
];
it.each(invalidCriteriaCases)(
  'rejects malformed approved governance: %s at the direct SQL boundary',
  async (_label, make) => {
    const value = make(g.criteria[0]!);
    expect(verificationCriteriaSchema.safeParse(value).success).toBe(false);
    await expect(insertCriteriaFixture(value)).rejects.toThrow();
  },
);
it.each([
  'Unicode code-point bound',
  'trim normalization',
  'safe integer',
  'nil UUID',
  'max UUID',
])(
  'persists canonical valid criteria at %s without inventing professional content',
  async (variant) => {
    const c = { ...g.criteria[0]! };
    if (variant === 'Unicode code-point bound') c.criterion = '😀'.repeat(1000);
    if (variant === 'trim normalization') {
      c.criterion = '\u00a0\t Synthetic protocol criterion \ufeff\n';
      c.evidenceRequirement = '  Synthetic evidence only\t';
    }
    if (variant === 'safe integer') c.version = Number.MAX_SAFE_INTEGER;
    if (variant === 'nil UUID') c.id = '00000000-0000-0000-0000-000000000000';
    if (variant === 'max UUID') c.id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const expected = verificationCriteriaSchema.parse([c]);
    const persisted = (await insertCriteriaFixture([c])).rows[0];
    expect(persisted.criteria).toEqual(expected);
  },
);
it('fails closed for repository/API projections when legacy malformed governance is encountered', async () => {
  const isolated = await syntheticVerificationGovernance(pool, {
    governor: ids.governor!,
    author: ids.author!,
    assessor: ids.assessor!,
  });
  const id = await ready(isolated.rubric);
  await call('post', `/assessor/verifications/${id}/events`, 'assessor')
    .send(await decision(id))
    .expect(201);
  const original = (
    await pool.query(
      'SELECT criteria FROM verification_rubric_versions WHERE id=$1',
      [isolated.rubric],
    )
  ).rows[0].criteria;
  // Simulate a pre-remediation malformed row only in this disposable fixture.
  const corrupt = async (value: unknown) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        'ALTER TABLE verification_rubric_versions DISABLE TRIGGER USER',
      );
      await c.query(
        'UPDATE verification_rubric_versions SET criteria=$2 WHERE id=$1',
        [isolated.rubric, JSON.stringify(value)],
      );
      await c.query(
        'ALTER TABLE verification_rubric_versions ENABLE TRIGGER USER',
      );
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  };
  try {
    await corrupt([{ ...original[0], version: '1' }]);
    expect(
      (await call('get', base).expect(200)).body.find(
        (v: { caseId: string }) => v.caseId === id,
      ).verified,
    ).toBe(false);
    for (const route of [`${base}/${id}`, `/assessor/verifications/${id}`])
      await call(
        'get',
        route,
        route.startsWith('/assessor') ? 'assessor' : 'owner',
      ).expect(409);
    await call('post', base).send(submission(isolated.rubric)).expect(409);
    const prior = (
      await pool.query(
        "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='DECISION' ORDER BY revision DESC LIMIT 1",
        [id],
      )
    ).rows[0];
    await expect(
      pool.query(
        `INSERT INTO verification_case_events(case_id,revision,kind,outcome,supersedes_decision_id,payload,actor_id,command_id,input_digest,request_id) VALUES($1,4,'DECISION','VERIFIED',$2,$3,$4,$5,$6,$7)`,
        [
          id,
          prior.id,
          JSON.stringify(prior.payload),
          ids.assessor,
          randomUUID(),
          '0'.repeat(64),
          randomUUID(),
        ],
      ),
    ).rejects.toThrow();
  } finally {
    await corrupt(original);
  }
});
