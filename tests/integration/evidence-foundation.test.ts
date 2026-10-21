import { afterAll, beforeAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { competencyGaps } from '../../packages/domain/src';

let pool: Pool;
let url: string;
let owner: string, other: string, candidate: string, otherCandidate: string;
let pathway: string, child: string, otherPathway: string, otherChild: string;
let assessmentEvidence: string;
let beforeUpgrade: Record<string, unknown>,
  afterUpgrade: Record<string, unknown>;
const files = () =>
  readdirSync('db/migrations')
    .filter((file) => file.endsWith('.sql'))
    .sort();
const checksum = (name: string) =>
  createHash('sha256')
    .update(readFileSync(`db/migrations/${name}`))
    .digest('hex');
const run = (script: string) =>
  execFileSync(process.execPath, ['--import', 'tsx', script], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
async function id(sql: string, params: unknown[] = []) {
  const row = (await pool.query<{ id: string }>(sql, params)).rows[0];
  if (!row) throw new Error('Missing test fixture');
  return row.id;
}
async function snapshot(tables: string[]) {
  const result: Record<string, unknown> = {};
  for (const table of tables) {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table identifier');
    const projection =
      table === 'competency_evidence'
        ? "to_jsonb(t)-ARRAY['source_kind','submission_version_id']"
        : 'to_jsonb(t)';
    result[table] = (
      await pool.query(
        `SELECT coalesce(jsonb_agg(${projection} ORDER BY (${projection})::text),'[]'::jsonb) AS rows FROM ${table} t`,
      )
    ).rows[0].rows;
  }
  return result;
}
beforeAll(async () => {
  const configured = process.env.TEST_DATABASE_URL;
  if (!configured) throw new Error('TEST_DATABASE_URL required');
  const parsed = new URL(configured);
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    !parsed.pathname.endsWith('_test')
  )
    throw new Error('Dedicated local _test database required');
  url = configured;
  pool = new Pool({ connectionString: url });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await pool.query(
    'CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  // Build a populated 008 database, rather than testing only a fresh 009 install.
  for (const name of files().filter((name) => name < '009')) {
    await pool.query(readFileSync(`db/migrations/${name}`, 'utf8'));
    await pool.query(
      'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
      [name, checksum(name)],
    );
  }
  run('scripts/seed.ts');
  owner = await id(
    "INSERT INTO users(issuer,subject) VALUES('https://synthetic.invalid/','phase3-owner') RETURNING id",
  );
  other = await id(
    "INSERT INTO users(issuer,subject) VALUES('https://synthetic.invalid/','phase3-other') RETURNING id",
  );
  for (const user of [owner, other])
    await pool.query(
      "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,'CANDIDATE','PLATFORM','Synthetic regression fixture')",
      [user],
    );
  const profile = (user: string) =>
    id(
      "INSERT INTO candidate_profiles(user_id,full_name,country_code,state,willing_to_relocate,driving_ability) VALUES($1,'Synthetic Candidate','NG','Kano',true,true) RETURNING id",
      [user],
    );
  candidate = await profile(owner);
  otherCandidate = await profile(other);
  const blueprint = (
    await pool.query(
      'SELECT b.*,i.evidence_type FROM assessment_blueprint b JOIN assessment_item_versions i ON i.id=b.item_version_id LIMIT 1',
    )
  ).rows[0];
  const attempt = await id(
    'INSERT INTO assessment_attempts(candidate_id,assessment_version_id) VALUES($1,$2) RETURNING id',
    [candidate, blueprint.assessment_version_id],
  );
  await pool.query(
    'INSERT INTO attempt_items(attempt_id,assessment_version_id,item_version_id,position) VALUES($1,$2,$3,1)',
    [attempt, blueprint.assessment_version_id, blueprint.item_version_id],
  );
  await pool.query(
    "INSERT INTO candidate_responses(attempt_id,item_version_id,response,objective_outcome) VALUES($1,$2,'{}','REQUIRES_REVIEW')",
    [attempt, blueprint.item_version_id],
  );
  await pool.query(
    "UPDATE assessment_attempts SET status='SUBMITTED',submitted_at=now() WHERE id=$1",
    [attempt],
  );
  assessmentEvidence = await id(
    "INSERT INTO competency_evidence(candidate_id,child_version_id,attempt_id,item_version_id,facet,demo,observation) VALUES($1,$2,$3,$4,$5,true,'REQUIRES_REVIEW') RETURNING id",
    [
      candidate,
      blueprint.child_version_id,
      attempt,
      blueprint.item_version_id,
      blueprint.evidence_type,
    ],
  );
  await pool.query(
    "INSERT INTO browser_sessions(user_id,handle_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [owner, createHash('sha256').update(randomUUID()).digest('hex')],
  );
  await pool.query(
    "INSERT INTO audit_events(actor_id,action,resource_type,resource_id) VALUES($1,'synthetic.before.upgrade','candidate_profile',$2)",
    [owner, candidate],
  );
  const tables = (
    await pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename",
    )
  ).rows.map((row) => row.tablename);
  beforeUpgrade = await snapshot(tables);
  run('scripts/migrate.ts');
  afterUpgrade = await snapshot(tables);
  // Forward migrations may add these explicitly authorized capabilities. All
  // pre-existing rows must still match the populated 008 snapshot exactly.
  afterUpgrade.permissions = (
    afterUpgrade.permissions as { code: string }[]
  ).filter((row) => !['training:manage', 'training:assign'].includes(row.code));
  afterUpgrade.role_permissions = (
    afterUpgrade.role_permissions as { permission_code: string }[]
  ).filter(
    (row) =>
      !['training:manage', 'training:assign'].includes(row.permission_code),
  );

  const target = (
    await pool.query(
      "SELECT r.pathway_version_id,r.child_version_id FROM pathway_child_requirements r JOIN pathway_versions v ON v.id=r.pathway_version_id JOIN pathways p ON p.id=v.pathway_id JOIN child_competency_versions cv ON cv.id=r.child_version_id JOIN child_competencies c ON c.id=cv.child_id WHERE p.code='POULTRY_MANAGEMENT' AND c.code='POULTRY_INVESTIGATE'",
    )
  ).rows[0];
  if (!target) throw new Error('Poultry investigation demo target required');
  pathway = target.pathway_version_id;
  child = target.child_version_id;
  const exclusive = (
    await pool.query(
      'SELECT r.pathway_version_id,r.child_version_id FROM pathway_child_requirements r WHERE r.pathway_version_id<>$1 AND NOT EXISTS(SELECT 1 FROM pathway_child_requirements own WHERE own.pathway_version_id=$1 AND own.child_version_id=r.child_version_id) LIMIT 1',
      [pathway],
    )
  ).rows[0];
  otherPathway = exclusive.pathway_version_id;
  otherChild = exclusive.child_version_id;
});
afterAll(async () => {
  await pool?.end();
});

async function draft(withMapping = true) {
  const submission = await id(
    'INSERT INTO evidence_submissions(candidate_id,created_by) VALUES($1,$2) RETURNING id',
    [candidate, owner],
  );
  const version = await id(
    "INSERT INTO evidence_submission_versions(submission_id,candidate_id,version,pathway_version_id,kind,summary,context,demo,change_actor_id,change_reason,change_request_id) VALUES($1,$2,1,$3,'CANDIDATE_REPORT','DEMO CONTENT — NOT YET APPROVED FOR PRODUCTION ASSESSMENT','{\"task\":\"Synthetic investigation of a decline in layer production\"}',true,$4,'Synthetic draft creation',$5) RETURNING id",
    [submission, candidate, pathway, owner, randomUUID()],
  );
  if (withMapping)
    await pool.query(
      "INSERT INTO evidence_submission_competencies VALUES($1,$2,$3,'PRACTICALLY_VERIFIED')",
      [version, candidate, child],
    );
  return { submission, version };
}
const transition = (version: string, from: string, to: string, actor = owner) =>
  pool.query('SELECT transition_evidence_submission($1,$2,$3,$4,$5,$6)', [
    version,
    actor,
    from,
    to,
    'Synthetic lifecycle transition',
    randomUUID(),
  ]);
async function receipt(
  version: string,
  overrides: Record<string, unknown> = {},
) {
  const source = (
    await pool.query(
      'SELECT context,demo FROM evidence_submission_versions WHERE id=$1',
      [version],
    )
  ).rows[0];
  const value = {
    candidate,
    child,
    version,
    facet: 'PRACTICALLY_VERIFIED',
    demo: source.demo,
    context: source.context,
    status: 'UNVERIFIED',
    observation: 'REQUIRES_REVIEW',
    ...overrides,
  };
  return id(
    "INSERT INTO competency_evidence(candidate_id,child_version_id,source_kind,submission_version_id,facet,demo,context,status,observation) VALUES($1,$2,'EXTERNAL_SUBMISSION',$3,$4,$5,$6,$7,$8) RETURNING id",
    [
      value.candidate,
      value.child,
      value.version,
      value.facet,
      value.demo,
      value.context,
      value.status,
      value.observation,
    ],
  );
}
it('upgrades populated 008 without changing existing users, sessions, attempts, evidence, grants or audit history', async () => {
  expect(afterUpgrade).toEqual(beforeUpgrade);
  expect(
    (
      await pool.query(
        'SELECT source_kind,submission_version_id FROM competency_evidence WHERE id=$1',
        [assessmentEvidence],
      )
    ).rows[0],
  ).toEqual({ source_kind: 'ASSESSMENT', submission_version_id: null });
});
it('migration reruns are no-ops and all installed checksums match the manifest', async () => {
  const before = (
    await pool.query('SELECT * FROM schema_migrations ORDER BY name')
  ).rows;
  run('scripts/migrate.ts');
  run('scripts/migrate.ts');
  expect(
    (await pool.query('SELECT * FROM schema_migrations ORDER BY name')).rows,
  ).toEqual(before);
  expect(
    before.map(({ name, checksum: value }) => ({ name, checksum: value })),
  ).toEqual(files().map((name) => ({ name, checksum: checksum(name) })));
});
it('requires an active candidate owner for identity and draft versions', async () => {
  await expect(
    pool.query(
      'INSERT INTO evidence_submissions(candidate_id,created_by) VALUES($1,$2)',
      [candidate, other],
    ),
  ).rejects.toThrow('owner');
  const { version } = await draft();
  await expect(
    pool.query(
      'UPDATE evidence_submission_versions SET change_actor_id=$1 WHERE id=$2',
      [other, version],
    ),
  ).rejects.toThrow('owner');
  await expect(
    transition(version, 'DRAFT', 'SUBMITTED', other),
  ).rejects.toThrow('owner');
});
it('rejects unmapped submission and cross-pathway or cross-candidate mapping', async () => {
  const { version } = await draft(false);
  await expect(transition(version, 'DRAFT', 'SUBMITTED')).rejects.toThrow(
    'Mapped child',
  );
  await expect(
    pool.query(
      "INSERT INTO evidence_submission_competencies VALUES($1,$2,$3,'PRACTICALLY_VERIFIED')",
      [version, otherCandidate, child],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query(
      "INSERT INTO evidence_submission_competencies VALUES($1,$2,$3,'PRACTICALLY_VERIFIED')",
      [version, candidate, otherChild],
    ),
  ).rejects.toThrow('pathway');
});
it('allows draft edits but freezes submitted payloads, targets and referenced definitions', async () => {
  const { version } = await draft();
  await pool.query(
    "UPDATE evidence_submission_versions SET summary='Synthetic edited draft summary' WHERE id=$1",
    [version],
  );
  await transition(version, 'DRAFT', 'SUBMITTED');
  for (const sql of [
    "UPDATE evidence_submission_versions SET summary='Attempted post-submit overwrite' WHERE id=$1",
    'DELETE FROM evidence_submission_versions WHERE id=$1',
    'DELETE FROM evidence_submission_competencies WHERE submission_version_id=$1',
  ])
    await expect(pool.query(sql, [version])).rejects.toThrow();
  await expect(
    pool.query(
      "UPDATE child_competency_versions SET statement='Overwritten definition' WHERE id=$1",
      [child],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query(
      'UPDATE evidence_submission_versions SET pathway_version_id=$1 WHERE id=$2',
      [otherPathway, version],
    ),
  ).rejects.toThrow();
});
it('requires valid transitions, expected state and a new version for revised content', async () => {
  const { submission, version } = await draft();
  for (const state of ['VERIFIED', 'REJECTED', 'UNDER_REVIEW', 'RESUBMITTED'])
    await expect(transition(version, 'DRAFT', state)).rejects.toThrow();
  await transition(version, 'DRAFT', 'SUBMITTED');
  await expect(transition(version, 'DRAFT', 'SUBMITTED')).rejects.toThrow(
    'state conflict',
  );
  await transition(version, 'SUBMITTED', 'WITHDRAWN');
  const revision = await id(
    "INSERT INTO evidence_submission_versions(submission_id,candidate_id,version,previous_version_id,pathway_version_id,kind,summary,context,demo,change_actor_id,change_reason,change_request_id) SELECT submission_id,candidate_id,2,id,pathway_version_id,kind,'Synthetic revised report',context,demo,$2,'Synthetic revised version',$3 FROM evidence_submission_versions WHERE id=$1 RETURNING id",
    [version, owner, randomUUID()],
  );
  await pool.query(
    "INSERT INTO evidence_submission_competencies VALUES($1,$2,$3,'PRACTICALLY_VERIFIED')",
    [revision, candidate, child],
  );
  await transition(revision, 'DRAFT', 'RESUBMITTED');
  expect(
    (
      await pool.query(
        'SELECT status FROM evidence_submission_versions WHERE submission_id=$1 ORDER BY version',
        [submission],
      )
    ).rows.map((row) => row.status),
  ).toEqual(['WITHDRAWN', 'RESUBMITTED']);
  await expect(transition(version, 'WITHDRAWN', 'DRAFT')).rejects.toThrow();
});
it('requires an actual submitted source, exact demo/context and same candidate/child/facet', async () => {
  const { version } = await draft();
  await expect(receipt(version)).rejects.toThrow('Submitted source');
  await transition(version, 'DRAFT', 'SUBMITTED');
  for (const bad of [
    { candidate: otherCandidate },
    { child: otherChild },
    { facet: 'WORKPLACE_VERIFIED' },
    { demo: false },
    { context: {} },
  ])
    await expect(receipt(version, bad)).rejects.toThrow();
  await receipt(version);
  await expect(receipt(version)).rejects.toThrow('unique');
});
it('enforces source XOR and preserves existing assessment provenance checks', async () => {
  const { version } = await draft();
  await transition(version, 'DRAFT', 'SUBMITTED');
  const existing = (
    await pool.query('SELECT * FROM competency_evidence WHERE id=$1', [
      assessmentEvidence,
    ])
  ).rows[0];
  for (const [source, attempt, item, submission] of [
    [
      'EXTERNAL_SUBMISSION',
      existing.attempt_id,
      existing.item_version_id,
      version,
    ],
    ['ASSESSMENT', null, null, null],
    ['EXTERNAL_SUBMISSION', null, null, null],
    ['ASSESSMENT', existing.attempt_id, existing.item_version_id, version],
  ])
    await expect(
      pool.query(
        "INSERT INTO competency_evidence(candidate_id,child_version_id,facet,demo,observation,source_kind,attempt_id,item_version_id,submission_version_id,context) SELECT $1,$2,'PRACTICALLY_VERIFIED',true,'REQUIRES_REVIEW',$3,$4,$5,$6,context FROM evidence_submission_versions WHERE id=$7",
        [candidate, child, source, attempt, item, submission, version],
      ),
    ).rejects.toThrow();
  await expect(
    pool.query(
      "UPDATE competency_evidence SET facet='PRACTICALLY_VERIFIED' WHERE id=$1",
      [assessmentEvidence],
    ),
  ).rejects.toThrow('provenance');
});
it('external receipt is unverified, immutable and cannot become an official competence decision', async () => {
  const { version } = await draft();
  await transition(version, 'DRAFT', 'SUBMITTED');
  await expect(
    receipt(version, { status: 'VERIFIED', observation: 'DEMONSTRATED' }),
  ).rejects.toThrow('not enabled');
  const evidence = await receipt(version);
  await expect(
    pool.query(
      "INSERT INTO competency_evidence_reviews(evidence_id,reviewer_id,outcome,reason) VALUES($1,$2,'VERIFIED','Attempted premature external decision')",
      [evidence, owner],
    ),
  ).rejects.toThrow('External review workflow not enabled');
  for (const change of [
    "status='VERIFIED'",
    "observation='DEMONSTRATED'",
    "valid_until=now()+interval '1 day'",
    "source_kind='ASSESSMENT'",
    "status='REVOKED'",
  ])
    await expect(
      pool.query(`UPDATE competency_evidence SET ${change} WHERE id=$1`, [
        evidence,
      ]),
    ).rejects.toThrow();
  await expect(
    pool.query('DELETE FROM competency_evidence WHERE id=$1', [evidence]),
  ).rejects.toThrow();
  const [gap] = competencyGaps(
    [
      {
        childVersionId: child,
        code: 'DEMO',
        statement: 'Synthetic task',
        facets: ['PRACTICALLY_VERIFIED'],
        mandatory: null,
        validationStatus: 'PROPOSED',
      },
    ],
    [
      {
        id: evidence,
        childVersionId: child,
        facet: 'PRACTICALLY_VERIFIED',
        status: 'UNVERIFIED',
        observation: 'REQUIRES_REVIEW',
        demo: true,
        validUntil: null,
      },
    ],
    new Date(),
  );
  expect(gap?.state).toBe('UNVERIFIED');
  expect(gap?.verifiedEvidenceIds).toEqual([]);
});
it('transitions and receipts use the canonical audit log and roll back atomically', async () => {
  const { version } = await draft();
  const count = async () =>
    (
      await pool.query(
        'SELECT (SELECT count(*) FROM audit_events) AS audits,(SELECT count(*) FROM evidence_status_events) AS events',
      )
    ).rows[0];
  const before = await count();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT transition_evidence_submission($1,$2,$3,$4,$5,$6)',
      [
        version,
        owner,
        'DRAFT',
        'SUBMITTED',
        'Synthetic transaction test',
        randomUUID(),
      ],
    );
    await expect(
      client.query(
        "UPDATE evidence_submission_versions SET summary='Illegal post-submit change' WHERE id=$1",
        [version],
      ),
    ).rejects.toThrow();
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
  expect(await count()).toEqual(before);
  expect(
    (
      await pool.query(
        'SELECT status FROM evidence_submission_versions WHERE id=$1',
        [version],
      )
    ).rows[0].status,
  ).toBe('DRAFT');
  await transition(version, 'DRAFT', 'SUBMITTED');
  await receipt(version);
  expect(
    (
      await pool.query(
        'SELECT action FROM audit_events WHERE resource_id=$1 ORDER BY created_at,id',
        [version],
      )
    ).rows.map((row) => row.action),
  ).toContain('evidence.version.transitioned');
  const events = (
    await pool.query(
      'SELECT * FROM evidence_status_events WHERE submission_version_id=$1',
      [version],
    )
  ).rows;
  expect(events).toHaveLength(2);
  await expect(
    pool.query(
      "UPDATE evidence_status_events SET to_status='VERIFIED' WHERE id=$1",
      [events[0].id],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query(
      "INSERT INTO evidence_status_events(submission_version_id,actor_id,to_status,reason,request_id) VALUES($1,$2,'VERIFIED','Forged status event',$3)",
      [version, owner, randomUUID()],
    ),
  ).rejects.toThrow('governed');
});
it('assessor scope proposals enforce exact pathway membership without granting authority', async () => {
  const assessor = await id(
    'INSERT INTO assessor_profiles(user_id,proposed_by) VALUES($1,$1) RETURNING id',
    [other],
  );
  await expect(
    pool.query(
      'INSERT INTO assessor_profiles(user_id,proposed_by) VALUES($1,$2)',
      [owner, other],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query(
      "INSERT INTO assessor_scope_grants(assessor_profile_id,pathway_version_id,child_version_id,method,context_kind,proposed_by) VALUES($1,$2,$3,'PRACTICAL','SYNTHETIC_TASK',$4)",
      [assessor, pathway, otherChild, other],
    ),
  ).rejects.toThrow('pathway');
  const grant = await id(
    "INSERT INTO assessor_scope_grants(assessor_profile_id,pathway_version_id,child_version_id,method,context_kind,proposed_by) VALUES($1,$2,$3,'PRACTICAL','SYNTHETIC_TASK',$4) RETURNING id",
    [assessor, pathway, child, other],
  );
  await expect(
    pool.query(
      "UPDATE assessor_scope_grants SET status='APPROVED' WHERE id=$1",
      [grant],
    ),
  ).rejects.toThrow();
  await expect(
    pool.query(
      "INSERT INTO assessor_profiles(user_id,proposed_by,status) VALUES($1,$1,'ACTIVE')",
      [owner],
    ),
  ).rejects.toThrow();
  const { version } = await draft();
  await transition(version, 'DRAFT', 'SUBMITTED');
  await expect(
    transition(version, 'SUBMITTED', 'VERIFIED', other),
  ).rejects.toThrow();
});

it('serializes concurrent submission requests without duplicate transition provenance', async () => {
  const { version } = await draft();
  const results = await Promise.allSettled([
    transition(version, 'DRAFT', 'SUBMITTED'),
    transition(version, 'DRAFT', 'SUBMITTED'),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
    1,
  );
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM evidence_status_events WHERE submission_version_id=$1 AND to_status='SUBMITTED'",
        [version],
      )
    ).rows[0].count,
  ).toBe('1');
});
it('rolls back both state and transition provenance if canonical audit insertion fails', async () => {
  const { version } = await draft();
  const eventsBefore = (
    await pool.query('SELECT count(*) FROM evidence_status_events')
  ).rows[0].count;
  await pool.query(
    "CREATE FUNCTION synthetic_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit sink failure'; END $$",
  );
  await pool.query(
    "CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.action='evidence.version.transitioned') EXECUTE FUNCTION synthetic_audit_failure()",
  );
  try {
    await expect(transition(version, 'DRAFT', 'SUBMITTED')).rejects.toThrow(
      'Synthetic audit sink failure',
    );
    expect(
      (
        await pool.query(
          'SELECT status FROM evidence_submission_versions WHERE id=$1',
          [version],
        )
      ).rows[0].status,
    ).toBe('DRAFT');
    expect(
      (await pool.query('SELECT count(*) FROM evidence_status_events')).rows[0]
        .count,
    ).toBe(eventsBefore);
  } finally {
    await pool.query(
      'DROP TRIGGER synthetic_audit_failure ON audit_events; DROP FUNCTION synthetic_audit_failure()',
    );
  }
});
it('XOR constraint rejects otherwise valid source pairs with both provenance paths present', async () => {
  const { version } = await draft();
  await transition(version, 'DRAFT', 'SUBMITTED');
  const existing = (
    await pool.query('SELECT * FROM competency_evidence WHERE id=$1', [
      assessmentEvidence,
    ])
  ).rows[0];
  await expect(
    pool.query(
      'INSERT INTO competency_evidence(candidate_id,child_version_id,attempt_id,item_version_id,facet,demo,observation,submission_version_id) SELECT candidate_id,child_version_id,attempt_id,item_version_id,facet,demo,observation,$2 FROM competency_evidence WHERE id=$1',
      [assessmentEvidence, version],
    ),
  ).rejects.toMatchObject({ code: '23514', constraint: 'evidence_source_xor' });
  await expect(
    pool.query(
      "INSERT INTO competency_evidence(candidate_id,child_version_id,attempt_id,item_version_id,facet,demo,context,observation,source_kind,submission_version_id) SELECT candidate_id,$2,$3,$4,'PRACTICALLY_VERIFIED',demo,context,'REQUIRES_REVIEW','EXTERNAL_SUBMISSION',id FROM evidence_submission_versions WHERE id=$1",
      [version, child, existing.attempt_id, existing.item_version_id],
    ),
  ).rejects.toMatchObject({ code: '23514', constraint: 'evidence_source_xor' });
});
it('remains compatible with reference seed reruns after external submission', async () => {
  const { version } = await draft();
  await transition(version, 'DRAFT', 'SUBMITTED');
  const before = (
    await pool.query('SELECT count(*) FROM evidence_submission_versions')
  ).rows[0].count;
  run('scripts/seed.ts');
  expect(
    (await pool.query('SELECT count(*) FROM evidence_submission_versions'))
      .rows[0].count,
  ).toBe(before);
  expect(
    (await pool.query('SELECT count(*) FROM child_competencies')).rows[0].count,
  ).toBe('69');
});
it('freezes non-assessment child meaning while allowing no-op seed reruns', async () => {
  const unassessed = (
    await pool.query(
      'SELECT r.child_version_id FROM pathway_child_requirements r WHERE r.pathway_version_id=$1 AND NOT EXISTS(SELECT 1 FROM assessment_blueprint b WHERE b.child_version_id=r.child_version_id) LIMIT 1',
      [pathway],
    )
  ).rows[0].child_version_id;
  const { version } = await draft(false);
  await pool.query(
    "INSERT INTO evidence_submission_competencies VALUES($1,$2,$3,'PRACTICALLY_VERIFIED')",
    [version, candidate, unassessed],
  );
  await transition(version, 'DRAFT', 'SUBMITTED');
  await expect(
    pool.query(
      "INSERT INTO child_criteria(child_version_id,position,statement) VALUES($1,999,'Changed meaning after submission')",
      [unassessed],
    ),
  ).rejects.toThrow('Submitted child structure immutable');
  await expect(
    pool.query(
      "UPDATE child_competency_versions SET statement='Changed meaning after submission' WHERE id=$1",
      [unassessed],
    ),
  ).rejects.toThrow('Submitted child definition immutable');
  run('scripts/seed.ts');
});
