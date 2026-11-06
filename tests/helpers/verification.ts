import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
/** Only the three explicitly added catalog rows; never exclude existing grants/users. */
export function verificationLegacyCatalogPredicate(table: string) {
  if (table === 'permissions') return "code<>'verification:govern'";
  if (table === 'roles') return "code<>'VERIFICATION_GOVERNOR'";
  if (table === 'role_permissions')
    return "NOT(role_code='VERIFICATION_GOVERNOR' AND permission_code='verification:govern')";
  return 'TRUE';
}
/** Disposable-database protocol fixtures only. Not professional standards or production seeds. */
export async function syntheticVerificationGovernance(
  pool: Pool,
  input: {
    governor: string;
    author: string;
    assessor: string;
    child?: string;
    path?: string;
    demo?: boolean;
    moderation?: boolean;
  },
) {
  const path =
    input.path ??
    (
      await pool.query(
        "SELECT pv.id FROM pathway_versions pv JOIN pathways p ON p.id=pv.pathway_id WHERE p.code='DAIRY' ORDER BY pv.version DESC LIMIT 1",
      )
    ).rows[0].id;
  let child = input.child;
  if (!child) {
    const root = (
      await pool.query(
        'INSERT INTO child_competencies(code) VALUES($1) RETURNING id',
        ['SOFTWARE_FIXTURE_' + randomUUID()],
      )
    ).rows[0].id;
    child = (
      await pool.query(
        `INSERT INTO child_competency_versions(child_id,version,statement,proposed_method,context_kind,standards_to_validate,author_id) VALUES($1,1,'Synthetic software protocol fixture only','PRACTICAL','SYNTHETIC','REQUIRES DOMAIN EXPERT VALIDATION',$2) RETURNING id`,
        [root, input.author],
      )
    ).rows[0].id;
    const group = (
      await pool.query(
        'SELECT competency_version_id FROM pathway_competencies WHERE pathway_version_id=$1 ORDER BY competency_version_id LIMIT 1',
        [path],
      )
    ).rows[0].competency_version_id;
    await pool.query(
      'INSERT INTO child_group_mappings(child_version_id,group_version_id) VALUES($1,$2)',
      [child, group],
    );
  }
  await pool.query(
    "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,'VERIFICATION_GOVERNOR','PLATFORM','ISOLATED SYNTHETIC SOFTWARE TEST') ON CONFLICT DO NOTHING",
    [input.governor],
  );
  if (!input.demo)
    await pool.query(
      `UPDATE child_competency_versions SET validation_status='APPROVED',author_id=$2,reviewer_id=$3,reviewed_at=now(),source_references='[{"title":"SYNTHETIC SOFTWARE FIXTURE ONLY — NOT PROFESSIONAL APPROVAL"}]' WHERE id=$1 AND validation_status<>'APPROVED'`,
      [child, input.author, input.governor],
    );
  const criteria = [
    {
      id: randomUUID(),
      version: 1,
      criterion: 'Synthetic protocol observation, not veterinary criteria',
      evidenceRequirement: 'Synthetic candidate-owned account only',
    },
  ];
  const version = Number(
    (
      await pool.query(
        "SELECT coalesce(max(version),0)+1 AS n FROM verification_rubric_versions WHERE child_version_id=$1 AND pathway_version_id=$2 AND method='PRACTICAL'",
        [child, path],
      )
    ).rows[0].n,
  );
  const rubric = (
    await pool.query(
      `INSERT INTO verification_rubric_versions(pathway_version_id,child_version_id,version,method,facet,criteria,status,demo,policy_reference,approval_reference,moderation_required,allowed_processes,authored_by,actor_id,request_id) VALUES($1,$2,$3,'PRACTICAL','PRACTICALLY_VERIFIED',$4,$5,$6,'SYNTHETIC SOFTWARE POLICY ONLY','SYNTHETIC SOFTWARE APPROVAL ONLY',$7,ARRAY['IN_PERSON'],$8,$9,$10) RETURNING id`,
      [
        path,
        child,
        version,
        JSON.stringify(criteria),
        input.demo ? 'PROPOSED' : 'APPROVED',
        input.demo ?? false,
        input.moderation ?? false,
        input.author,
        input.governor,
        randomUUID(),
      ],
    )
  ).rows[0].id;
  const authorization = await authorizeSyntheticAssessor(
    pool,
    input.governor,
    input.assessor,
    rubric,
  );
  return { rubric, child: child!, path, criteria, authorization };
}
export async function authorizeSyntheticAssessor(
  pool: Pool,
  governor: string,
  assessor: string,
  rubric: string,
) {
  return (
    await pool.query(
      `INSERT INTO verification_assessor_authorizations(assessor_id,rubric_version_id,approval_reference,valid_until,actor_id,request_id) VALUES($1,$2,'SYNTHETIC ELIGIBILITY ONLY',now()+interval '1 day',$3,$4) RETURNING id`,
      [assessor, rubric, governor, randomUUID()],
    )
  ).rows[0].id as string;
}
