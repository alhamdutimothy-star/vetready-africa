export const GAP_ENGINE_VERSION = 'gap-evidence-1';
export const EVIDENCE_FACETS = [
  'SELF_DECLARED',
  'DOCUMENT_VERIFIED',
  'KNOWLEDGE_ASSESSED',
  'CASE_ASSESSED',
  'SIMULATION_VERIFIED',
  'PRACTICALLY_VERIFIED',
  'WORKPLACE_VERIFIED',
] as const;
export type EvidenceFacet = (typeof EVIDENCE_FACETS)[number];
export interface ObjectiveItem {
  type: string;
  answerKey: { selected?: string[]; value?: number; tolerance?: number } | null;
}
export type ResponseValue = {
  selected?: string[];
  value?: number;
  text?: string;
  assetId?: string;
};
// Objective correctness is diagnostic information, never a practical verification decision.
export function gradeObjective(
  item: ObjectiveItem,
  response: ResponseValue,
): 'CORRECT' | 'INCORRECT' | 'REQUIRES_REVIEW' {
  if (!item.answerKey) return 'REQUIRES_REVIEW';
  if (item.type === 'SINGLE_MCQ' || item.type === 'MULTIPLE_RESPONSE') {
    const key = item.answerKey.selected;
    if (!key?.length || !response.selected) return 'REQUIRES_REVIEW';
    const chosen = [...new Set(response.selected)].sort();
    return JSON.stringify(chosen) === JSON.stringify([...key].sort())
      ? 'CORRECT'
      : 'INCORRECT';
  }
  if (
    item.type === 'NUMERICAL' &&
    typeof item.answerKey.value === 'number' &&
    typeof response.value === 'number'
  )
    return Math.abs(response.value - item.answerKey.value) <=
      (item.answerKey.tolerance ?? 0)
      ? 'CORRECT'
      : 'INCORRECT';
  return 'REQUIRES_REVIEW';
}
export interface GapRequirement {
  childVersionId: string;
  code: string;
  statement: string;
  facets: EvidenceFacet[];
  validationStatus: 'PROPOSED' | 'APPROVED';
  mandatory: boolean | null;
}
export interface GapEvidence {
  id: string;
  childVersionId: string;
  facet: EvidenceFacet;
  status: string;
  demo: boolean;
  observation: string;
  validUntil: string | null;
}
export interface CompetencyGap {
  childVersionId: string;
  code: string;
  statement: string;
  state: 'UNVERIFIED' | 'PARTIALLY_DEMONSTRATED' | 'DEMONSTRATED';
  policyStatus: 'PROPOSED' | 'APPROVED';
  missingFacets: EvidenceFacet[];
  missingMandatoryEvidence: boolean | null;
  verifiedEvidenceIds: string[];
  diagnosticEvidenceIds: string[];
}
export function competencyGaps(
  requirements: readonly GapRequirement[],
  evidence: readonly GapEvidence[],
  now: Date,
): CompetencyGap[] {
  return requirements.map((r) => {
    const relevant = evidence.filter(
      (e) =>
        e.childVersionId === r.childVersionId &&
        !e.demo &&
        (!e.validUntil || new Date(e.validUntil) > now) &&
        !['REVOKED', 'REJECTED'].includes(e.status),
    );
    const verified = relevant.filter(
      (e) =>
        e.status === 'VERIFIED' &&
        ['DEMONSTRATED', 'CORRECT'].includes(e.observation),
    );
    const missing = r.facets.filter(
      (f) => !verified.some((e) => e.facet === f),
    );
    return {
      childVersionId: r.childVersionId,
      code: r.code,
      statement: r.statement,
      state:
        !missing.length && r.facets.length > 0
          ? 'DEMONSTRATED'
          : verified.length
            ? 'PARTIALLY_DEMONSTRATED'
            : 'UNVERIFIED',
      policyStatus: r.validationStatus,
      missingFacets: missing,
      missingMandatoryEvidence:
        r.validationStatus === 'APPROVED' && r.mandatory !== null
          ? r.mandatory && missing.length > 0
          : null,
      verifiedEvidenceIds: verified.map((e) => e.id),
      diagnosticEvidenceIds: relevant
        .filter((e) => e.status === 'UNVERIFIED')
        .map((e) => e.id),
    };
  });
}
export function developmentActivities(gaps: readonly CompetencyGap[]) {
  return gaps.flatMap((g) =>
    g.missingFacets.map((f) => ({
      childVersionId: g.childVersionId,
      code: g.code,
      gap: f,
      validationStatus: g.policyStatus,
      activity: (
        {
          SELF_DECLARED: 'Record experience and supporting context',
          DOCUMENT_VERIFIED:
            'Submit relevant documents for authorized verification',
          KNOWLEDGE_ASSESSED:
            'Review learning material and complete a mapped knowledge task',
          CASE_ASSESSED:
            'Complete a mapped case or data interpretation task with assessor feedback',
          SIMULATION_VERIFIED: 'Complete an observed role simulation',
          PRACTICALLY_VERIFIED:
            'Arrange a supervised assessment in the relevant field context after rubric validation',
          WORKPLACE_VERIFIED:
            'Arrange an authorized workplace observation and corroborated task record',
        } satisfies Record<EvidenceFacet, string>
      )[f],
    })),
  );
}
