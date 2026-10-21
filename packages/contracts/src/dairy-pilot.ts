import { z } from 'zod';
export const reasoningCategories = [
  'observations',
  'interpretation',
  'assumptions',
  'informationRequests',
  'priorities',
  'actions',
  'monitoring',
  'safety',
] as const;
export const reasoningSchema = z
  .object({
    observations: z.string().max(2000).optional(),
    interpretation: z.string().max(2000).optional(),
    assumptions: z.string().max(2000).optional(),
    informationRequests: z.string().max(2000).optional(),
    priorities: z.string().max(2000).optional(),
    actions: z.string().max(2000).optional(),
    monitoring: z.string().max(2000).optional(),
    safety: z.string().max(2000).optional(),
  })
  .strict()
  .refine(
    (v) => Object.values(v).some((s) => s?.trim()),
    'Enter reasoning before saving',
  );
export const pilotResponseSchema = z
  .object({
    expectedRevision: z.number().int().min(0).max(2147483646),
    reasoning: reasoningSchema,
  })
  .strict();
export const pilotReviewDraftSchema = z
  .object({
    expectedRevision: z.number().int().min(0).max(2147483646),
    decision: z.enum(['DEVELOPMENT_FEEDBACK', 'MORE_EVIDENCE_REQUIRED']),
    feedback: z.string().max(6000),
    observations: z
      .array(
        z
          .object({
            rubricCriterionId: z.uuid(),
            observation: z
              .enum(['DEMONSTRATED', 'NEEDS_DEVELOPMENT', 'UNASSESSABLE'])
              .nullable(),
            comment: z.string().max(2000),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      new Set(v.observations.map((o) => o.rubricCriterionId)).size !==
      v.observations.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate criterion' });
    if (
      v.feedback.length +
        v.observations.reduce((n, o) => n + o.comment.length, 0) >
      10000
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Review text exceeds technical payload bound',
      });
  });
export const pilotFinalizeSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
export type PilotResponseInput = z.infer<typeof pilotResponseSchema>;
export type PilotReviewDraftInput = z.infer<typeof pilotReviewDraftSchema>;
