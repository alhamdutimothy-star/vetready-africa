import { z } from 'zod';
import { profileFacetSchema } from './competency-profile';
export const PILOT_NOTICE =
  'Technical pilot only. Not a hiring recommendation, professional approval, certification, Job Ready or Field Ready decision.';
export const PILOT_CONSENT_VERSION = 'pilot-share-1' as const;
export const recruitmentCommandSchema = z
  .object({ commandId: z.uuid() })
  .strict();
const requirementBase = { id: z.uuid(), mandatory: z.boolean() };
export const jobRequirementSchema = z.discriminatedUnion('kind', [
  z
    .object({ ...requirementBase, kind: z.literal('PATHWAY_INTEREST') })
    .strict(),
  z
    .object({
      ...requirementBase,
      kind: z.literal('LOCATION_DECLARATION'),
      state: z.string().trim().min(2).max(100),
      acceptRelocation: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...requirementBase,
      kind: z.literal('COMPETENCY_FACET'),
      childVersionId: z.uuid(),
      facet: profileFacetSchema,
    })
    .strict(),
]);
export const jobContentSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(10).max(2000),
    pathwayVersionId: z.uuid(),
    requirements: z.array(jobRequirementSchema).min(1).max(20),
  })
  .strict()
  .refine(
    (v) => v.requirements.some((r) => r.mandatory),
    'At least one mandatory requirement required',
  )
  .refine(
    (v) =>
      new Set(v.requirements.map((r) => r.id)).size === v.requirements.length,
    'Duplicate requirement identifiers',
  );
export const createPilotJobSchema = recruitmentCommandSchema
  .extend({ content: jobContentSchema })
  .strict();
export const revisePilotJobSchema = createPilotJobSchema
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();
export const jobTransitionSchema = recruitmentCommandSchema
  .extend({
    expectedVersion: z.number().int().positive(),
    action: z.enum(['PUBLISH', 'CLOSE']),
  })
  .strict();
export const employerDecisionSchema = recruitmentCommandSchema
  .extend({
    status: z.enum(['VERIFIED', 'SUSPENDED']),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export const memberDecisionSchema = recruitmentCommandSchema
  .extend({
    status: z.enum(['ACTIVE', 'REVOKED']),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export const applyPilotSchema = recruitmentCommandSchema
  .extend({
    jobVersionId: z.uuid(),
    snapshotId: z.uuid(),
    consent: z.literal(true),
    consentVersion: z.literal(PILOT_CONSENT_VERSION),
  })
  .strict();
export const shortlistCommandSchema = recruitmentCommandSchema
  .extend({
    evaluationId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    action: z.enum(['REVIEW', 'SHORTLIST', 'REMOVE']),
  })
  .strict();
export const matchingFacetFactSchema = z
  .object({
    childVersionId: z.uuid(),
    facet: profileFacetSchema,
    state: z.string(),
    sources: z.array(
      z
        .object({
          ref: z.string(),
          kind: z.string(),
          sourceVersionId: z.uuid().nullable(),
          sourceVersion: z.number().int().nullable(),
          pathwayVersionIds: z.array(z.uuid()),
          recordedAt: z.string(),
          validUntil: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export const matchingFactsSchema = z
  .object({
    pathwayInterest: z.boolean(),
    state: z.string(),
    willingToRelocate: z.boolean(),
    facets: z.array(matchingFacetFactSchema),
  })
  .strict();
export const matchingInputSchema = z
  .object({
    engineVersion: z.literal('pilot-match-1'),
    policyVersion: z.literal('pilot-policy-1'),
    jobVersionId: z.uuid(),
    pathwayVersionId: z.uuid(),
    requirements: z.array(jobRequirementSchema),
    facts: matchingFactsSchema,
  })
  .strict();
export type JobContent = z.infer<typeof jobContentSchema>;
export type JobRequirement = z.infer<typeof jobRequirementSchema>;
export type MatchingFacts = z.infer<typeof matchingFactsSchema>;
export type MatchingInput = z.infer<typeof matchingInputSchema>;
