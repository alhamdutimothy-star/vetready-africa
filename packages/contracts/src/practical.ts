import { z } from 'zod';

export const practicalPayloadSchema = z
  .object({
    summary: z.string().trim().max(4000),
    context: z.object({ task: z.string().trim().max(160) }).strict(),
    targets: z
      .array(
        z
          .object({
            childVersionId: z.uuid(),
            requestedFacet: z.enum([
              'PRACTICALLY_VERIFIED',
              'WORKPLACE_VERIFIED',
              'SIMULATION_VERIFIED',
            ]),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.targets.map((t) => `${t.childVersionId}:${t.requestedFacet}`))
        .size === v.targets.length,
    'Duplicate target',
  );
export const practicalCreateSchema = z
  .object({
    pathwayVersionId: z.uuid(),
    kind: z.enum([
      'CANDIDATE_REPORT',
      'SUPERVISED_TASK',
      'WORKPLACE_RECORD',
      'SIMULATION_RECORD',
    ]),
  })
  .strict();
export const practicalSaveSchema = z
  .object({
    commandId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    payload: practicalPayloadSchema,
  })
  .strict();
export const practicalSubmitSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    declaration: z.literal(true),
  })
  .strict();
export const practicalReasonSchema = z
  .object({ reason: z.string().trim().min(10).max(500) })
  .strict();
export const practicalAssignSchema = practicalReasonSchema
  .extend({ assessorId: z.uuid() })
  .strict();
export const practicalDecisionSchema = z
  .object({
    outcome: z.enum(['DEMONSTRATED_IN_DEMO', 'NEEDS_REVISION', 'REJECTED']),
    rationale: z.string().trim().min(10).max(2000),
    conflictDeclaredClear: z.literal(true),
    supersedesDecisionId: z.uuid().optional(),
  })
  .strict();
export type PracticalCreateInput = z.infer<typeof practicalCreateSchema>;
export type PracticalSaveInput = z.infer<typeof practicalSaveSchema>;
export type PracticalDecisionInput = z.infer<typeof practicalDecisionSchema>;
