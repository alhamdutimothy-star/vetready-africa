export const DOMAIN_VALIDATION_NOTICE = 'REQUIRES DOMAIN EXPERT VALIDATION';
export type Permission =
  | 'candidate:own'
  | 'employer:own'
  | 'catalog:read'
  | 'evidence:own'
  | 'admin:summary'
  | 'roles:grant'
  | 'assessment:author'
  | 'assessment:assign'
  | 'assessment:review'
  | 'assessment:moderate';
export interface RoleGrant {
  permission: string;
  organizationId: string | null;
}
export function hasPermission(
  grants: readonly RoleGrant[],
  permission: Permission,
  organizationId?: string,
): boolean {
  return grants.some(
    (g) =>
      g.permission === permission &&
      (organizationId
        ? g.organizationId === organizationId
        : g.organizationId === null),
  );
}
export type EvidenceSource =
  | 'SELF_DECLARED'
  | 'DOCUMENT'
  | 'KNOWLEDGE'
  | 'CASE'
  | 'PRACTICAL'
  | 'EMPLOYMENT'
  | 'INTERNSHIP'
  | 'MENTOR'
  | 'EMPLOYER_FEEDBACK';
// Submission metadata never verifies competence. Future assessment decisions must supply approved policies.
export function initialEvidenceStatus(_source: EvidenceSource): 'SUBMITTED' {
  void _source;
  return 'SUBMITTED';
}
export type Eligibility = 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW';
export function mandatoryEligibility(
  results: readonly ('PASS' | 'FAIL' | 'UNKNOWN')[],
): Eligibility {
  if (results.includes('FAIL')) return 'INELIGIBLE';
  if (results.includes('UNKNOWN')) return 'NEEDS_REVIEW';
  return 'ELIGIBLE';
}

export type {
  User,
  Candidate,
  Employer,
  CareerPathway,
  Competency,
  CompetencyVersion,
  Evidence,
  PathwayCompetency,
} from './models';

export * from './assessment';
export * from './evidence';
export * from './verification';
