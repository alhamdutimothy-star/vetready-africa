export const PRACTICAL_NOTICE =
  'DRAFT — demonstration review only; professional requirements await domain expert configuration. No verified competence, readiness or certification is awarded.';
export const CANDIDATE_DECLARATION =
  'I confirm this account describes my own activity accurately, identifies my involvement and limitations, and contains no confidential third-party information. I understand submission is not verification or certification.';
export interface PracticalGapSource {
  id: string;
  submissionVersionId: string | null;
  childVersionId: string;
  facet: string;
  status: string;
  demo: boolean;
  state: string | null;
  decision: string | null;
  validUntil: string | null;
}
/** Exact facet matching only: no invented hierarchy, threshold, score or readiness award. */
export function practicalGaps(
  targets: readonly { childVersionId: string; facet: string }[],
  sources: readonly PracticalGapSource[],
  now: number = Date.now(),
) {
  return targets.map((target) => {
    const related = sources.filter(
      (s) => s.childVersionId === target.childVersionId,
    );
    const matching = related.filter((s) => s.facet === target.facet);
    const inactive = (s: PracticalGapSource) =>
      ['REVOKED', 'SUPERSEDED', 'WITHDRAWN'].includes(s.state ?? '') ||
      ['REVOKED', 'REJECTED', 'EXPIRED'].includes(s.status) ||
      (s.validUntil !== null && Date.parse(s.validUntil) <= now);
    const reasons: string[] = ['EXPERT_REQUIREMENTS_NOT_CONFIGURED'];
    if (target.facet === 'NOT_CONFIGURED')
      return {
        ...target,
        reasons,
        evidenceIds: related.map((s) => s.id),
        submissionVersionIds: [
          ...new Set(
            related.flatMap((s) =>
              s.submissionVersionId ? [s.submissionVersionId] : [],
            ),
          ),
        ],
        activeVerifiedEvidence: [],
        readiness: null,
        requirementsConfigured: false as const,
      };
    if (related.length === 0) reasons.push('MISSING_EVIDENCE');
    if (matching.length === 0 && related.length)
      reasons.push('INSUFFICIENT_VERIFICATION_LEVEL');
    if (
      matching.some((s) =>
        ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'].includes(s.state ?? ''),
      )
    )
      reasons.push('PENDING_REVIEW');
    if (matching.some((s) => s.state === 'DRAFT'))
      reasons.push('DRAFT_NOT_SUBMITTED');
    if (matching.some((s) => s.state === 'SUPERSEDED'))
      reasons.push('SUPERSEDED_EVIDENCE');
    if (matching.some((s) => s.state === 'REVOKED' || s.status === 'REVOKED'))
      reasons.push('REVOKED_EVIDENCE');
    if (matching.some((s) => s.state === 'WITHDRAWN'))
      reasons.push('WITHDRAWN_EVIDENCE');
    if (matching.some((s) => s.decision === 'NEEDS_REVISION'))
      reasons.push('REVISION_REQUESTED');
    if (
      matching.some((s) => s.decision === 'REJECTED' || s.status === 'REJECTED')
    )
      reasons.push('REJECTED_EVIDENCE');
    if (
      matching.some(
        (s) =>
          (s.validUntil !== null && Date.parse(s.validUntil) <= now) ||
          s.status === 'EXPIRED',
      )
    )
      reasons.push('EXPIRED_EVIDENCE');
    const activeVerifiedEvidence = matching
      .filter((s) => !inactive(s) && !s.demo && s.status === 'VERIFIED')
      .map((s) => s.id);
    if (matching.length && !activeVerifiedEvidence.length)
      reasons.push('INSUFFICIENT_VERIFICATION_LEVEL');
    return {
      ...target,
      reasons: [...new Set(reasons)],
      evidenceIds: related.map((s) => s.id),
      submissionVersionIds: [
        ...new Set(
          related.flatMap((s) =>
            s.submissionVersionId ? [s.submissionVersionId] : [],
          ),
        ),
      ],
      activeVerifiedEvidence,
      readiness: null,
      requirementsConfigured: false as const,
    };
  });
}
