import { EVIDENCE_FACETS } from './assessment';
/** Descriptive evidence facets are independent: none implies another. No readiness rule is active. */
export const READINESS_STATES = [
  'NOT_ASSESSED',
  'FOUNDATION',
  'DEVELOPING',
  'KNOWLEDGE_VERIFIED',
  'CASE_VERIFIED',
  'PRACTICALLY_VERIFIED',
  'JOB_READY',
  'FIELD_READY',
  'ADVANCED',
] as const;
export interface ClaimProvenance {
  facet: string;
  status: string;
  demo: boolean;
  observation: string;
  validUntil: string | null;
}
export function evidenceDisposition(
  evidence: ClaimProvenance,
  now: Date,
):
  | 'DEMO_ONLY'
  | 'UNVERIFIED'
  | 'REJECTED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'VERIFIED_EVIDENCE' {
  if (evidence.demo) return 'DEMO_ONLY';
  if (!EVIDENCE_FACETS.some((f) => f === evidence.facet)) return 'UNVERIFIED';
  if (evidence.status === 'REJECTED' || evidence.status === 'REVOKED')
    return evidence.status;
  if (
    evidence.status !== 'VERIFIED' ||
    !['CORRECT', 'DEMONSTRATED'].includes(evidence.observation)
  )
    return 'UNVERIFIED';
  if (evidence.validUntil !== null) {
    const expiry = Date.parse(evidence.validUntil);
    if (!Number.isFinite(expiry) || expiry <= now.getTime()) return 'EXPIRED';
  }
  return 'VERIFIED_EVIDENCE';
}
