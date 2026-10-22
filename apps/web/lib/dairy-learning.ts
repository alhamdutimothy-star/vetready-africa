import { z } from 'zod';
import { dairyUnitSchema } from '@vetready/contracts';
export const curriculumCatalogSchema = z.array(
  z.object({
    id: z.uuid(),
    title: z.string(),
    version: z.number(),
    status: z.string(),
    notice: z.string(),
    domains: z.array(
      z.object({
        code: z.string(),
        title: z.string(),
        topics: z.array(z.string()),
        childVersionIds: z.array(z.uuid()),
      }),
    ),
  }),
);
export const curriculumDetailSchema = z.object({
  course: z.object({
    id: z.uuid(),
    version: z.number(),
    title: z.string(),
    notice: z.string(),
    status: z.string(),
    author_id: z.uuid(),
    reviewer_id: z.uuid().nullable(),
    reviewed_at: z.string().nullable(),
    assessments: z.array(
      z.object({
        lesson_version_id: z.uuid().nullable(),
        assessment_version_id: z.uuid(),
        status: z.string(),
      }),
    ),
    competencyMappings: z.array(
      z.object({
        lesson_version_id: z.uuid().nullable(),
        child_version_id: z.uuid().nullable(),
      }),
    ),
    modules: z.array(
      z.object({
        id: z.uuid(),
        title: z.string(),
        lessons: z.array(
          z.object({
            id: z.uuid(),
            title: z.string(),
            body: z.string(),
            state: z.string().optional(),
            revision: z.number().optional(),
            resumePosition: z.number().optional(),
          }),
        ),
      }),
    ),
  }),
  curriculum: z.object({
    domains: curriculumCatalogSchema.element.shape.domains,
    author_id: z.uuid(),
    created_at: z.string(),
  }),
  competencies: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      statement: z.string(),
      validation_status: z.string(),
    }),
  ),
  units: z.array(
    z.object({
      lesson_version_id: z.uuid(),
      domain_code: z.string(),
      content: dairyUnitSchema,
      prerequisites: z.array(
        z.object({
          childVersionId: z.uuid(),
          facet: z.string(),
          status: z.string(),
          guidanceOnly: z.boolean(),
        }),
      ),
    }),
  ),
  activities: z.array(
    z.object({
      lesson_version_id: z.uuid(),
      revision: z.number(),
      response: z.string(),
      created_at: z.string(),
    }),
  ),
  competenceVerified: z.literal(false),
  readiness: z.null(),
});
export type LearningSaveState = {
  ok: boolean;
  revision: number;
  commandId: string;
  message: string;
};
