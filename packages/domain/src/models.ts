// Domain identity is independent of presentation and database query shapes.
export type Id = string;
export type ApprovalStatus =
  'DRAFT' | 'EXPERT_REVIEWED' | 'APPROVED' | 'RETIRED';
export interface User {
  id: Id;
  issuer: string;
  subject: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
}
export interface Candidate {
  id: Id;
  userId: Id;
  fullName: string;
  countryCode: string;
  state: string;
  willingToRelocate: boolean;
  drivingAbility: boolean;
  discoverable: boolean;
}
export interface Employer {
  id: Id;
  displayName: string;
  sector: string;
  countryCode: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
}
export interface CareerPathway {
  id: Id;
  code: string;
  name: string;
  description: string;
}
export interface Competency {
  id: Id;
  code: string;
  category: string;
}
export interface CompetencyVersion {
  id: Id;
  competencyId: Id;
  version: number;
  name: string;
  approvalStatus: ApprovalStatus;
  passingThreshold: number | null;
  validationNotice: string;
}
export interface Evidence {
  id: Id;
  candidateId: Id;
  competencyVersionId: Id;
  source: import('./index').EvidenceSource;
  reviewStatus: 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'REVOKED';
  createdBy: Id;
}
export interface PathwayCompetency {
  pathwayVersionId: Id;
  competencyVersionId: Id;
  layer: 'CORE' | 'PATHWAY';
  requiredLevel: number | null;
  weight: number | null;
  mandatory: boolean | null;
}
