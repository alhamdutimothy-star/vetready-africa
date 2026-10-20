/** Technical safeguards only. Professional eligibility rules remain unapproved. */
export interface ProposedAssessorScope {
  pathwayVersionId: string;
  childVersionId: string;
  method: 'KNOWLEDGE' | 'CASE' | 'SIMULATION' | 'PRACTICAL' | 'WORKPLACE';
  contextKind: string;
  status: 'PROPOSED' | 'APPROVED' | 'RETIRED';
}
export function scopeMatches(
  scope: ProposedAssessorScope,
  target: Omit<ProposedAssessorScope, 'status'>,
): boolean {
  return (
    scope.pathwayVersionId === target.pathwayVersionId &&
    scope.childVersionId === target.childVersionId &&
    scope.method === target.method &&
    scope.contextKind === target.contextKind
  );
}
export interface VerificationContext {
  assessorUserId: string;
  candidateUserId: string;
  hasPlatformCapability: boolean;
  assigned: boolean;
  eligibilityActive: boolean;
  conflictDeclaredClear: boolean;
  approvedScopeMatches: boolean;
  rubricVersionId: string | null;
  policyVersionId: string | null;
}
/** Deliberately cannot authorize an external competence decision during Phase 3A. */
export function practicalVerificationBlockers(
  context: VerificationContext,
): string[] {
  const blockers = ['REVIEW_WORKFLOW_NOT_ENABLED'];
  if (context.assessorUserId === context.candidateUserId)
    blockers.push('SELF_REVIEW');
  if (!context.hasPlatformCapability) blockers.push('CAPABILITY_REQUIRED');
  if (!context.assigned) blockers.push('ASSIGNMENT_REQUIRED');
  if (!context.eligibilityActive) blockers.push('ELIGIBILITY_REQUIRED');
  if (!context.conflictDeclaredClear)
    blockers.push('CONFLICT_CLEARANCE_REQUIRED');
  if (!context.approvedScopeMatches) blockers.push('APPROVED_SCOPE_REQUIRED');
  if (!context.rubricVersionId) blockers.push('RUBRIC_VERSION_REQUIRED');
  if (!context.policyVersionId) blockers.push('POLICY_VERSION_REQUIRED');
  return blockers;
}
