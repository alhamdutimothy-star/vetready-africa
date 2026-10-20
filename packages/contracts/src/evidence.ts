import { z } from 'zod';

/** Foundation contracts only: no public controller or real upload acceptance in 3A. */
export const submissionDraftSchema = z
  .object({
    pathwayVersionId: z.uuid(),
    kind: z.enum([
      'CANDIDATE_REPORT',
      'SUPERVISED_TASK',
      'WORKPLACE_RECORD',
      'SIMULATION_RECORD',
    ]),
    summary: z.string().trim().min(10).max(4000),
    context: z
      .object({
        task: z.string().trim().min(1).max(160),
        species: z.string().trim().min(1).max(80).optional(),
        productionSystem: z.string().trim().min(1).max(120).optional(),
      })
      .strict(),
    targets: z
      .array(
        z
          .object({
            childVersionId: z.uuid(),
            requestedFacet: z.enum([
              'SELF_DECLARED',
              'DOCUMENT_VERIFIED',
              'KNOWLEDGE_ASSESSED',
              'CASE_ASSESSED',
              'SIMULATION_VERIFIED',
              'PRACTICALLY_VERIFIED',
              'WORKPLACE_VERIFIED',
            ]),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (draft) =>
      new Set(
        draft.targets.map(
          (target) => `${target.childVersionId}:${target.requestedFacet}`,
        ),
      ).size === draft.targets.length,
    { message: 'Duplicate competency target' },
  );
export const submissionTransitionSchema = z
  .object({
    expectedState: z.enum(['DRAFT', 'SUBMITTED', 'RESUBMITTED']),
    to: z.enum(['SUBMITTED', 'RESUBMITTED', 'WITHDRAWN']),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export type SubmissionDraftInput = z.infer<typeof submissionDraftSchema>;
export type SubmissionTransitionInput = z.infer<
  typeof submissionTransitionSchema
>;
