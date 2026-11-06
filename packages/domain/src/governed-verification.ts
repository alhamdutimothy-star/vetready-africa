import type { VerificationEvent } from '@vetready/contracts';

/** Review authority is independent of platform role names and learning activity. */
export function governedVerificationBlockers(input: {
  demo: boolean;
  rubricApproved: boolean;
  scopeAuthorized: boolean;
  assigned: boolean;
  independent: boolean;
  conflictClear: boolean;
  structuredFindingsComplete: boolean;
  moderationRequired: boolean;
  independentModeration: boolean;
}) {
  const reasons: string[] = [];
  if (input.demo) reasons.push('DEMONSTRATION_ONLY');
  if (!input.rubricApproved) reasons.push('APPROVED_RUBRIC_REQUIRED');
  if (!input.scopeAuthorized) reasons.push('APPROVED_ASSESSOR_SCOPE_REQUIRED');
  if (!input.assigned) reasons.push('ASSIGNMENT_REQUIRED');
  if (!input.independent) reasons.push('SELF_REVIEW');
  if (!input.conflictClear) reasons.push('CONFLICT_CLEARANCE_REQUIRED');
  if (!input.structuredFindingsComplete)
    reasons.push('STRUCTURED_FINDINGS_REQUIRED');
  if (input.moderationRequired && !input.independentModeration)
    reasons.push('INDEPENDENT_MODERATION_REQUIRED');
  return reasons;
}
export function verificationEventAllowed(
  kind: VerificationEvent['kind'],
  input: {
    owner: boolean;
    assigned: boolean;
    recused: boolean;
    hasDecision: boolean;
    withdrawn: boolean;
  },
) {
  if (input.withdrawn) return false;
  if (kind === 'APPEAL') return input.owner && input.hasDecision;
  if (kind === 'WITHDRAW') return input.owner && !input.hasDecision;
  return input.assigned && !input.owner && !input.recused;
}
/** No accumulation, facet hierarchy, scoring or readiness determination. */
export function verificationEvidenceLevel(
  verified: boolean,
  exactFacet: string,
) {
  return {
    evidenceLevelBefore: 'SELF_DECLARED' as const,
    evidenceLevelAfter: verified ? exactFacet : 'SELF_DECLARED',
    readiness: 'UNCONFIGURED' as const,
  };
}
