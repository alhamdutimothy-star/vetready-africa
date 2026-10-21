import { z } from 'zod';

export const caseDimensions = [
  'CLINICAL_KNOWLEDGE',
  'CLINICAL_REASONING',
  'HERD_HEALTH_REASONING',
  'DATA_INTERPRETATION',
  'NUTRITIONAL_REASONING',
  'RISK_IDENTIFICATION',
  'INVESTIGATION_QUALITY',
  'INTERVENTION_PLANNING',
  'PREVENTIVE_THINKING',
  'ECONOMIC_AWARENESS',
  'COMMUNICATION',
  'DOCUMENTATION',
  'PROFESSIONAL_JUDGMENT',
] as const;
export const caseBlueprintSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{2,59}$/),
    pathwayVersionId: z.uuid(),
    title: z.string().trim().min(3).max(200),
    scenario: z.string().trim().min(50).max(12000),
    templateReference: z.string().trim().min(1).max(120),
    sourceReferences: z
      .array(
        z
          .object({
            title: z.string().trim().min(3).max(200),
            url: z
              .url()
              .refine(
                (v) => new URL(v).protocol === 'https:',
                'HTTPS reference required',
              )
              .optional(),
            status: z.literal('UNREVIEWED'),
          })
          .strict(),
      )
      .max(30),
    steps: z
      .array(
        z
          .object({
            code: z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/),
            type: z.enum(['CASE', 'REPORT']).default('CASE'),
            title: z.string().trim().min(3).max(160),
            prompt: z.string().trim().min(10).max(12000),
            groupVersionId: z.uuid(),
            childVersionId: z.uuid(),
            criteria: z
              .array(
                z
                  .object({
                    criterionId: z.uuid(),
                    dimensions: z.array(z.enum(caseDimensions)).min(1).max(13),
                  })
                  .strict(),
              )
              .min(1)
              .max(40),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.steps.map((s) => s.code)).size !== v.steps.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate stage code' });
    for (const step of v.steps) {
      if (`${v.code}_${step.code}`.length > 79)
        ctx.addIssue({
          code: 'custom',
          message: 'Combined case/stage code exceeds item identifier limit',
        });
      if (
        new Set(step.criteria.map((c) => c.criterionId)).size !==
        step.criteria.length
      )
        ctx.addIssue({ code: 'custom', message: 'Duplicate criterion' });
      for (const c of step.criteria)
        if (new Set(c.dimensions).size !== c.dimensions.length)
          ctx.addIssue({ code: 'custom', message: 'Duplicate dimension' });
    }
  });
export type CaseBlueprintInput = z.infer<typeof caseBlueprintSchema>;
