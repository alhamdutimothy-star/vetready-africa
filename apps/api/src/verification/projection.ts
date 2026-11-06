import type { PoolClient } from 'pg';
import { verificationProjectionSchema } from '@vetready/contracts';
/** Separate versioned verification overlay; engine-1 snapshots and source receipts stay intact. */
export async function readGovernedVerification(
  c: PoolClient,
  candidate: string,
) {
  const rows = (
    await c.query(
      `SELECT v.id AS "caseId", r.child_version_id AS "childVersionId",
    r.pathway_version_id AS "pathwayVersionId",v.evidence_id AS "evidenceId",r.id AS "rubricVersionId",
    r.policy_reference AS "policyReference",r.facet,v.process,
    to_char(v.performed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "performedAt",
    d.outcome,d.id AS "decisionId",coalesce(d.payload->>'evidenceLevelBefore','SELF_DECLARED') AS "evidenceLevelBefore",CASE WHEN d.id IS NULL THEN NULL ELSE to_char(d.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS "reviewedAt",
    d.payload->>'candidateExplanation' AS "candidateExplanation",
    coalesce(d.outcome='VERIFIED' AND NOT r.demo AND r.status='APPROVED'
      AND verification18_valid_criteria(r.criteria) AND verification18_unconflicted(d.id)
      AND verification18_authority_valid(d.id)
      AND (NOT r.moderation_required OR d.payload->>'reviewKind'='MODERATION')
      AND EXISTS(SELECT 1 FROM verification_assessor_authorizations a WHERE a.id::text=d.payload->>'authorizationId' AND a.assessor_id=d.actor_id AND a.rubric_version_id=r.id AND a.valid_until>now() AND NOT EXISTS(SELECT 1 FROM verification_governance_revocations x WHERE x.authorization_id=a.id))
      AND NOT EXISTS(SELECT 1 FROM verification_governance_revocations x WHERE x.rubric_version_id=r.id)
      AND EXISTS(SELECT 1 FROM child_competency_versions cv WHERE cv.id=r.child_version_id AND cv.validation_status='APPROVED')
      AND EXISTS(SELECT 1 FROM users u WHERE u.id=d.actor_id AND u.status='ACTIVE')
      AND NOT EXISTS(SELECT 1 FROM verification_case_events x WHERE x.case_id=v.id AND x.kind='WITHDRAW')
      AND e.status='UNVERIFIED' AND NOT e.demo AND sv.status IN ('SUBMITTED','RESUBMITTED'),false) AS verified
    FROM verification_cases v JOIN verification_rubric_versions r ON r.id=v.rubric_version_id
    JOIN competency_evidence e ON e.id=v.evidence_id JOIN evidence_submission_versions sv ON sv.id=e.submission_version_id
    LEFT JOIN LATERAL (SELECT * FROM verification_case_events WHERE case_id=v.id AND kind='DECISION' ORDER BY revision DESC LIMIT 1) d ON true
    WHERE v.candidate_id=$1 AND NOT EXISTS(SELECT 1 FROM verification_cases successor WHERE successor.previous_case_id=v.id)
    ORDER BY v.created_at,v.id`,
      [candidate],
    )
  ).rows;
  return rows.map((row) =>
    verificationProjectionSchema.parse({
      ...row,
      evidenceLevelAfter: row.verified ? row.facet : 'SELF_DECLARED',
      readiness: 'UNCONFIGURED',
    }),
  );
}
