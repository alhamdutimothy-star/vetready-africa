import { z } from 'zod';
export const itemTypes = [
  'SINGLE_MCQ',
  'MULTIPLE_RESPONSE',
  'NUMERICAL',
  'DATA_INTERPRETATION',
  'CLINICAL_SCENARIO',
  'FARM_SCENARIO',
  'CASE',
  'SHORT_TEXT',
  'EXTENDED_TEXT',
  'REPORT',
  'TECHNICAL_SALES',
  'FILE_IMAGE',
  'PRACTICAL_PLACEHOLDER',
] as const;
export const methods = [
  'KNOWLEDGE',
  'CASE',
  'SIMULATION',
  'PRACTICAL',
  'WORKPLACE',
] as const;
export const facets = [
  'KNOWLEDGE_ASSESSED',
  'CASE_ASSESSED',
  'SIMULATION_VERIFIED',
  'PRACTICALLY_VERIFIED',
  'WORKPLACE_VERIFIED',
] as const;
export const responseSchema = z
  .object({
    selected: z.array(z.string().max(80)).max(30).optional(),
    value: z.number().finite().optional(),
    text: z.string().max(20000).optional(),
    assetId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (v) => Object.keys(v).length === 1,
    'Provide exactly one response field',
  );
const option = z
  .object({ id: z.string().min(1).max(80), text: z.string().min(1).max(1000) })
  .strict();
export const assessmentCreateSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/),
    pathwayVersionId: z.uuid(),
    title: z.string().min(3).max(200),
    randomize: z.boolean().default(true),
  })
  .strict();
export const itemCreateSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/),
    version: z.number().int().positive(),
    type: z.enum(itemTypes),
    prompt: z.string().min(10).max(12000),
    presentation: z
      .object({
        options: z.array(option).max(30).optional(),
        assetId: z.uuid().optional(),
        assetDescription: z.string().max(1000).optional(),
        units: z.string().max(60).optional(),
      })
      .strict()
      .default({}),
    answerKey: z
      .object({
        selected: z.array(z.string().max(80)).max(30).optional(),
        value: z.number().finite().optional(),
        tolerance: z.number().nonnegative().max(1000000).optional(),
      })
      .strict()
      .nullable()
      .default(null),
    method: z.enum(methods),
    difficulty: z.enum(['INTRODUCTORY', 'INTERMEDIATE', 'ADVANCED']),
    evidenceType: z.enum(facets),
    groupVersionId: z.uuid(),
    childVersionId: z.uuid(),
    criterionIds: z.array(z.uuid()).min(1).max(40),
  })
  .strict()
  .superRefine((v, ctx) => {
    const expected = facets[methods.indexOf(v.method)];
    if (expected !== v.evidenceType)
      ctx.addIssue({
        code: 'custom',
        message: 'Method must match evidence facet',
      });
    const objective = ['SINGLE_MCQ', 'MULTIPLE_RESPONSE', 'NUMERICAL'].includes(
      v.type,
    );
    if (objective && v.method !== 'KNOWLEDGE')
      ctx.addIssue({
        code: 'custom',
        message: 'Objective tasks can generate knowledge evidence only',
      });
    if (v.type === 'PRACTICAL_PLACEHOLDER' && v.method !== 'PRACTICAL')
      ctx.addIssue({
        code: 'custom',
        message: 'Practical placeholder requires practical method',
      });
    if (v.type === 'SINGLE_MCQ' || v.type === 'MULTIPLE_RESPONSE') {
      const ids = v.presentation.options?.map((o) => o.id) ?? [];
      if (
        ids.length < 2 ||
        new Set(ids).size !== ids.length ||
        !v.answerKey?.selected?.length ||
        v.answerKey.selected.some((id) => !ids.includes(id)) ||
        (v.type === 'SINGLE_MCQ' && v.answerKey.selected.length !== 1)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Valid options and answer key required',
        });
    } else if (v.type === 'NUMERICAL') {
      if (typeof v.answerKey?.value !== 'number' || v.answerKey.selected)
        ctx.addIssue({ code: 'custom', message: 'Numerical key required' });
    } else if (v.answerKey !== null)
      ctx.addIssue({
        code: 'custom',
        message: 'Written and observed tasks require human rubric review',
      });
    if (new Set(v.criterionIds).size !== v.criterionIds.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate criteria' });
  });
export const reviewSchema = z
  .object({
    feedback: z.string().min(10).max(6000),
    observations: z
      .array(
        z
          .object({
            rubricCriterionId: z.uuid(),
            observation: z.enum([
              'DEMONSTRATED',
              'NEEDS_DEVELOPMENT',
              'UNASSESSABLE',
            ]),
            comment: z.string().min(3).max(2000),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
export const evidenceReviewSchema = z
  .object({
    outcome: z.enum(['VERIFIED', 'REJECTED', 'REVOKED']),
    reason: z.string().min(10).max(3000),
  })
  .strict();
export const moderationSchema = z
  .object({
    outcome: z.enum(['CONFIRMED', 'RETURNED']),
    reason: z.string().min(10).max(3000),
  })
  .strict();
