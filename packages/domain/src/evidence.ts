import type { EvidenceFacet } from './assessment';

export const SUBMISSION_STATES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_REVISION',
  'RESUBMITTED',
  'VERIFIED',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];
export const EXTERNAL_EVIDENCE_KINDS = [
  'CANDIDATE_REPORT',
  'SUPERVISED_TASK',
  'WORKPLACE_RECORD',
  'SIMULATION_RECORD',
] as const;
export type ExternalEvidenceKind = (typeof EXTERNAL_EVIDENCE_KINDS)[number];

/** Source identity is separate from the claim/evidence verification status. */
export type CanonicalEvidenceSource =
  | { kind: 'ASSESSMENT'; attemptId: string; itemVersionId: string }
  | { kind: 'EXTERNAL_SUBMISSION'; submissionVersionId: string };
export interface SubmissionTarget {
  childVersionId: string;
  requestedFacet: EvidenceFacet;
}
export interface SubmissionVersion {
  id: string;
  submissionId: string;
  candidateId: string;
  version: number;
  previousVersionId: string | null;
  state: SubmissionState;
  kind: ExternalEvidenceKind;
  pathwayVersionId: string;
  targets: readonly SubmissionTarget[];
  demo: boolean;
}

export type SubmissionTransitionResult =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        'NOT_OWNER' | 'INVALID_TRANSITION' | 'REVIEW_WORKFLOW_NOT_ENABLED';
    };
/** Only owner submission/withdrawal is enabled in 3A. Review decisions are future work. */
export function submissionTransition(input: {
  from: SubmissionState;
  to: SubmissionState;
  version: number;
  actorId: string;
  ownerUserId: string;
}): SubmissionTransitionResult {
  if (input.actorId !== input.ownerUserId)
    return { allowed: false, reason: 'NOT_OWNER' };
  if (
    ['UNDER_REVIEW', 'NEEDS_REVISION', 'VERIFIED', 'REJECTED'].includes(
      input.to,
    )
  )
    return { allowed: false, reason: 'REVIEW_WORKFLOW_NOT_ENABLED' };
  if (!Number.isInteger(input.version) || input.version < 1)
    return { allowed: false, reason: 'INVALID_TRANSITION' };
  const submitState = input.version === 1 ? 'SUBMITTED' : 'RESUBMITTED';
  if (
    (input.from === 'DRAFT' &&
      (input.to === submitState || input.to === 'WITHDRAWN')) ||
    (['SUBMITTED', 'RESUBMITTED'].includes(input.from) &&
      input.to === 'WITHDRAWN')
  )
    return { allowed: true };
  return { allowed: false, reason: 'INVALID_TRANSITION' };
}

/** A submitted payload is never edited; a withdrawn submission can get a new draft revision. */
export function canCreateSubmissionRevision(state: SubmissionState): boolean {
  return state === 'WITHDRAWN';
}
