import { z } from 'zod';
export const developmentCommandSchema = z
  .object({
    commandId: z.uuid(),
    pathwayVersionId: z.uuid(),
  })
  .strict();
export const developmentMappingSchema = z
  .object({
    mappingId: z.uuid(),
    courseVersionId: z.uuid(),
    pathwayVersionId: z.uuid(),
    childVersionId: z.uuid().nullable(),
    groupVersionId: z.uuid().nullable(),
    title: z.string(),
  })
  .strict();
export const developmentItemSchema = z
  .object({
    childVersionId: z.uuid(),
    code: z.string(),
    statement: z.string(),
    order: z.number().int().positive(),
    policyStatus: z.literal('UNCONFIGURED'),
    evidenceState: z.enum(['UNKNOWN', 'PRESENT']),
    sourceKeys: z.array(z.string()),
    reasons: z.array(z.string()),
    proposedFacets: z.array(z.string()),
    unverifiedFacets: z.array(z.string()),
    requirement: z.literal('NOT_CONFIGURED'),
    recommendations: z.array(developmentMappingSchema),
  })
  .strict();
export const developmentItemsSchema = z.array(developmentItemSchema);
export type DevelopmentMapping = z.infer<typeof developmentMappingSchema>;
export type DevelopmentItem = z.infer<typeof developmentItemSchema>;
export interface DevelopmentMappingScope {
  mappingId: string;
  moduleVersionId: string | null;
  lessonVersionId: string | null;
}
export interface DevelopmentAssessmentLink {
  assessmentLinkId: string;
  id: string;
  title: string;
  demo: boolean;
  moduleVersionId: string | null;
  lessonVersionId: string | null;
}
const followUpFields = {
  id: z.uuid(),
  title: z.string(),
  demo: z.boolean(),
  assessmentLinkIds: z.array(z.uuid()).min(1),
};
export const competencyFollowUpSchema = z.object({
  ...followUpFields,
  scope: z.literal('COMPETENCY_MAPPING'),
  mappingIds: z.array(z.uuid()).min(1),
});
export const courseFollowUpSchema = z.object({
  ...followUpFields,
  scope: z.literal('COURSE'),
  mappingIds: z.array(z.uuid()).max(0),
});
export const competencyFollowUpsSchema = z.object({
  childVersionId: z.uuid(),
  courseVersionId: z.uuid(),
  followUps: z.array(competencyFollowUpSchema),
});
export const developmentDetailSchema = z.object({
  id: z.uuid(),
  createdAt: z.string(),
  pathwayVersionId: z.uuid(),
  snapshotId: z.uuid(),
  itemsDigest: z.string(),
  policyStatus: z.literal('UNCONFIGURED'),
  professionalDetermination: z.null(),
  notice: z.string(),
  currentStatus: z.enum(['AVAILABLE', 'PATHWAY_UNAVAILABLE']),
  items: developmentItemsSchema,
  currentItems: developmentItemsSchema,
  competencyFollowUps: z.array(competencyFollowUpsSchema),
  courses: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      available: z.boolean(),
      demo: z.literal(true),
      enrollmentId: z.uuid().nullable(),
      href: z.string().nullable(),
      progress: z.object({
        state: z.enum(['LEARNING_COMPLETED', 'IN_PROGRESS', 'NOT_STARTED']),
        totalLessons: z.number(),
        completedLessons: z.number(),
        gapResolved: z.literal(false),
        followUp: z.literal('SEPARATE_ASSESSMENT_OR_VERIFICATION_REQUIRED'),
      }),
      courseLevelFollowUps: z.array(courseFollowUpSchema),
    }),
  ),
});
