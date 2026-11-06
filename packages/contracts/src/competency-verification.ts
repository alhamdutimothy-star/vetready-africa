import { z } from 'zod';
import { profileFacetSchema } from './competency-profile';

export const verificationOutcomeSchema = z.enum([
  'VERIFIED',
  'PARTIALLY_DEMONSTRATED',
  'MORE_EVIDENCE_REQUIRED',
  'NOT_DEMONSTRATED',
  'INVALIDATED',
]);
export const verificationCriterionSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    criterion: z.string().trim().min(1).max(1000),
    evidenceRequirement: z.string().trim().min(1).max(1000),
  })
  .strict();
export const verificationCriteriaSchema = z
  .array(verificationCriterionSchema)
  .min(1)
  .max(100)
  .refine(
    (criteria) =>
      new Set(criteria.map((c) => c.id.toLowerCase())).size === criteria.length,
    'Duplicate criterion identity',
  );
export const verificationFindingSchema = z
  .object({
    criterionId: z.uuid(),
    criterionVersion: z.number().int().positive(),
    observation: z.string().trim().min(10).max(2000),
    outcome: z.enum(['DEMONSTRATED', 'PARTIAL', 'MISSING', 'NOT_DEMONSTRATED']),
    rationale: z.string().trim().min(10).max(2000),
    evidenceIds: z.array(z.uuid()).min(1).max(20),
  })
  .strict();
export const verificationSubmissionSchema = z
  .object({
    commandId: z.uuid(),
    rubricVersionId: z.uuid(),
    summary: z.string().trim().min(10).max(4000),
    activity: z.string().trim().min(1).max(160),
    performedAt: z.iso.datetime(),
    locationType: z.string().trim().min(1).max(100),
    process: z.enum([
      'IN_PERSON',
      'REMOTE_OBSERVATION',
      'DOCUMENT_REVIEW',
      'SIMULATION',
    ]),
    declaration: z.literal(true),
    previousCaseId: z.uuid().optional(),
  })
  .strict();
const command = {
  commandId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
};
export const verificationAssignmentSchema = z
  .object({
    ...command,
    assessorId: z.uuid(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export const verificationEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...command, kind: z.literal('START_REVIEW') }).strict(),
  z
    .object({
      ...command,
      kind: z.literal('RECUSE'),
      category: z.string().trim().min(1).max(100),
      reason: z.string().trim().min(10).max(500),
    })
    .strict(),
  z
    .object({
      ...command,
      kind: z.literal('DECISION'),
      outcome: verificationOutcomeSchema,
      reviewKind: z.enum(['PRIMARY', 'MODERATION']),
      findings: z.array(verificationFindingSchema).max(100),
      rationale: z.string().trim().min(10).max(2000),
      candidateExplanation: z.string().trim().min(10).max(2000),
      conflictDeclaredClear: z.literal(true),
      supersedesDecisionId: z.uuid().optional(),
    })
    .strict(),
  z
    .object({
      ...command,
      kind: z.literal('APPEAL'),
      reason: z.string().trim().min(10).max(2000),
    })
    .strict(),
  z
    .object({
      ...command,
      kind: z.literal('WITHDRAW'),
      reason: z.string().trim().min(10).max(500),
    })
    .strict(),
]);
export type VerificationSubmission = z.infer<
  typeof verificationSubmissionSchema
>;
export type VerificationEvent = z.infer<typeof verificationEventSchema>;
export type VerificationAssignment = z.infer<
  typeof verificationAssignmentSchema
>;
export const verificationProjectionSchema = z.object({
  caseId: z.uuid(),
  childVersionId: z.uuid(),
  pathwayVersionId: z.uuid(),
  evidenceId: z.uuid(),
  rubricVersionId: z.uuid(),
  policyReference: z.string(),
  facet: z.string(),
  process: z.string(),
  performedAt: z.string(),
  outcome: verificationOutcomeSchema.nullable(),
  verified: z.boolean(),
  decisionId: z.uuid().nullable(),
  reviewedAt: z.string().nullable(),
  candidateExplanation: z.string().nullable(),
  evidenceLevelBefore: profileFacetSchema,
  evidenceLevelAfter: profileFacetSchema,
  readiness: z.literal('UNCONFIGURED'),
});
