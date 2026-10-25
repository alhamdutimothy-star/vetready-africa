import { z } from 'zod';
import {
  profilePathwaySchema,
  profileGroupSchema,
  profileCompetencySchema,
  profileFacetSchema,
  profileSourceSchema,
} from '@vetready/contracts';
const disposition = z.enum([
  'VERIFIED',
  'ASSESSED',
  'CLAIMED',
  'PENDING_REVIEW',
  'DEMO_ONLY',
  'INACTIVE',
  'LEARNING_ONLY',
]);
const facet = z
  .object({
    facet: profileFacetSchema,
    state: z.union([disposition, z.literal('NO_EVIDENCE')]),
    sourceKeys: z.array(z.string()),
    effectiveSourceKeys: z.array(z.string()),
    selectedSourceKey: z.string().nullable(),
  })
  .strict();
const gap = z
  .object({
    pathwayVersionId: z.uuid(),
    configurationStatus: z.literal('UNCONFIGURED'),
    requirementValidationStatus: z.string().nullable(),
    proposedFacets: z.array(profileFacetSchema),
    unverifiedFacets: z.array(profileFacetSchema),
    reasons: z.array(z.string()),
    sourceKeys: z.array(z.string()),
    determination: z.null(),
  })
  .strict();
const competency = profileCompetencySchema
  .extend({
    facets: z.array(facet),
    highestVerifiedFacet: profileFacetSchema.nullable(),
    learningSourceKeys: z.array(z.string()),
    groupSupportingSourceKeys: z.array(z.string()),
    gaps: z.array(gap),
  })
  .strict();
const readiness = z
  .object({
    status: z.literal('UNAVAILABLE'),
    determination: z.null(),
    reason: z.literal('REQUIRES_DOMAIN_EXPERT_VALIDATION'),
    certification: z.null(),
    licensing: z.null(),
    reservedStates: z.array(z.string()),
  })
  .strict();
const root = z
  .object({
    engineVersion: z.literal('competency-profile-1'),
    evaluatedAt: z.iso.datetime(),
    notice: z.string(),
    configurationStatus: z.literal('UNCONFIGURED'),
    readiness,
    sharingEnabled: z.literal(false),
    pathways: z.array(profilePathwaySchema),
    groups: z.array(profileGroupSchema),
    competencies: z.array(competency),
    groupEvidence: z.array(
      z
        .object({ groupVersionId: z.uuid(), sourceKeys: z.array(z.string()) })
        .strict(),
    ),
  })
  .strict();
export const competencyProfileResponseSchema = root
  .extend({
    sources: z.array(
      profileSourceSchema
        .extend({
          disposition,
          reasons: z.array(z.string()),
          effective: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
export const skillsPassportResponseSchema = root
  .extend({
    sources: z.array(
      profileSourceSchema
        .omit({
          observation: true,
          lineageId: true,
          decisionId: true,
          decisionOutcome: true,
          reviewerRef: true,
          verificationSupported: true,
          reviewPending: true,
        })
        .extend({
          disposition,
          reasons: z.array(z.string()),
          effective: z.boolean(),
          reviewerRecorded: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
export const PROFILE_LABELS: Record<string, string> = {
  SELF_DECLARED: 'Self-declared',
  DOCUMENT_VERIFIED: 'Document verified',
  KNOWLEDGE_ASSESSED: 'Knowledge assessed',
  CASE_ASSESSED: 'Case assessed',
  PRACTICALLY_VERIFIED: 'Practically verified',
  SIMULATION_VERIFIED: 'Simulation evidence',
  WORKPLACE_VERIFIED: 'Workplace evidence',
  NO_EVIDENCE: 'Not recorded',
  VERIFIED: 'Verified evidence',
  ASSESSED: 'Assessment recorded — unverified',
  CLAIMED: 'Candidate claim — unverified',
  PENDING_REVIEW: 'Verification pending',
  DEMO_ONLY: 'Demonstration only',
  INACTIVE: 'Inactive evidence',
  LEARNING_ONLY: 'Learning activity only',
  EXPERT_REQUIREMENTS_NOT_CONFIGURED:
    'Professional requirements need expert configuration',
  REQUIREMENT_NOT_CONFIGURED: 'Requirement not configured',
  MISSING_EVIDENCE: 'No child-level evidence recorded',
  NO_CURRENT_EFFECTIVE_EVIDENCE: 'No current effective child-level evidence',
  VERIFICATION_PENDING: 'Verification pending',
  REQUIRED_FACET_NOT_VERIFIED: 'Proposed evidence facet has not been verified',
  DEMONSTRATION_ONLY: 'Demonstration evidence cannot establish verification',
  DRAFT_NOT_SUBMITTED: 'Draft not submitted',
  GROUP_CLAIM_NOT_CHILD_VERIFICATION:
    'Group-level claim does not establish this child competency',
  LEGACY_VERIFICATION_UNCONFIGURED:
    'Legacy verification provenance is unconfigured',
  LEARNING_IS_NOT_COMPETENCE: 'Learning completion does not verify competence',
  ASSESSMENT_IS_NOT_VERIFICATION:
    'Assessment activity is distinct from verification',
  VERIFICATION_NOT_ESTABLISHED:
    'Recorded verification could not be established',
  REVOKED_EVIDENCE: 'Evidence revoked',
  SUPERSEDED_EVIDENCE: 'Evidence superseded',
  WITHDRAWN_EVIDENCE: 'Evidence withdrawn',
  REJECTED_EVIDENCE: 'Evidence rejected',
  REVISION_REQUESTED: 'Revision requested',
  EXPIRED_EVIDENCE: 'Recorded validity has expired',
  INVALID_VALIDITY_RECORD: 'Validity record cannot be evaluated',
  PATHWAY_CONTEXT_NOT_EVALUATED:
    'Evidence was recorded in another pathway; context applicability is unconfigured',
};
export const profileLabel = (value: string) =>
  PROFILE_LABELS[value] ?? value.replaceAll('_', ' ').toLowerCase();
