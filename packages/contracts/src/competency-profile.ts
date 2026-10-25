import { z } from 'zod';

export const PROFILE_ENGINE_VERSION = 'competency-profile-1' as const;
export const profileFacetSchema = z.enum([
  'SELF_DECLARED',
  'DOCUMENT_VERIFIED',
  'KNOWLEDGE_ASSESSED',
  'CASE_ASSESSED',
  'SIMULATION_VERIFIED',
  'PRACTICALLY_VERIFIED',
  'WORKPLACE_VERIFIED',
]);
export const profilePathwaySchema = z
  .object({
    id: z.uuid(),
    pathwayId: z.uuid(),
    code: z.string(),
    name: z.string(),
    version: z.number().int().positive(),
    status: z.string(),
  })
  .strict();
export const profileGroupSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    pathwayVersionIds: z.array(z.uuid()),
  })
  .strict();
export const profileCompetencySchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    statement: z.string(),
    version: z.number().int().positive(),
    validationStatus: z.string(),
    groupVersionIds: z.array(z.uuid()),
    pathwayVersionIds: z.array(z.uuid()),
  })
  .strict();
export const profileRequirementSchema = z
  .object({
    pathwayVersionId: z.uuid(),
    childVersionId: z.uuid(),
    facets: z.array(profileFacetSchema),
    validationStatus: z.enum(['PROPOSED', 'APPROVED']),
    mandatory: z.boolean().nullable(),
  })
  .strict();
/** Only machine-readable provenance: no narratives, documents or moderation material. */
export const profileSourceSchema = z
  .object({
    key: z.string().min(1).max(180),
    id: z.uuid(),
    kind: z.enum([
      'ASSESSMENT',
      'EXTERNAL_SUBMISSION',
      'PRACTICAL_DRAFT',
      'LEGACY_GROUP',
      'LEARNING',
    ]),
    targets: z.array(
      z
        .object({
          childVersionId: z.uuid(),
          facet: z.union([profileFacetSchema, z.literal('LEARNING')]),
        })
        .strict(),
    ),
    groupVersionIds: z.array(z.uuid()),
    pathwayVersionIds: z.array(z.uuid()),
    groupFacet: profileFacetSchema.nullable(),
    status: z.string().max(40),
    lifecycle: z.string().max(40).nullable(),
    demo: z.boolean(),
    observation: z.string().max(40).nullable(),
    sourceVersionId: z.uuid().nullable(),
    sourceVersion: z.number().int().positive().nullable(),
    lineageId: z.uuid().nullable(),
    decisionId: z.uuid().nullable(),
    decisionOutcome: z.string().max(40).nullable(),
    decisionAt: z.iso.datetime().nullable(),
    reviewerRef: z.uuid().nullable(),
    recordedAt: z.iso.datetime(),
    validUntil: z.string().max(80).nullable(),
    verificationSupported: z.boolean(),
    reviewPending: z.boolean(),
    completedLessons: z.number().int().nonnegative().nullable(),
    totalLessons: z.number().int().nonnegative().nullable(),
  })
  .strict();
export const profileInputSchema = z
  .object({
    engineVersion: z.literal(PROFILE_ENGINE_VERSION),
    evaluatedAt: z.iso.datetime(),
    pathways: z.array(profilePathwaySchema),
    groups: z.array(profileGroupSchema),
    competencies: z.array(profileCompetencySchema),
    requirements: z.array(profileRequirementSchema),
    sources: z.array(profileSourceSchema),
  })
  .strict();
export type ProfileInput = z.infer<typeof profileInputSchema>;
export type ProfileSource = z.infer<typeof profileSourceSchema>;
export type ProfileFacet = z.infer<typeof profileFacetSchema>;
export const profileSnapshotCommandSchema = z
  .object({ commandId: z.uuid() })
  .strict();
