import { z } from 'zod';
const code = z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/);
const title = z.string().trim().min(2).max(160);
const description = z.string().trim().max(2000).default('');
const objectives = z
  .array(z.string().trim().min(2).max(300))
  .max(12)
  .default([]);
const mapping = z
  .object({
    pathwayVersionId: z.uuid(),
    childVersionId: z.uuid().optional(),
    groupVersionId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.childVersionId) !== Boolean(value.groupVersionId),
    'Map exactly one existing child or group version',
  );
const links = {
  competencyMappings: z.array(mapping).max(40).default([]),
  assessmentVersionIds: z.array(z.uuid()).max(10).default([]),
};
const lesson = z
  .object({
    code,
    title,
    description,
    objectives,
    body: z.string().trim().min(1).max(5000),
    ...links,
  })
  .strict();
const moduleSchema = z
  .object({
    code,
    title,
    description,
    objectives,
    lessons: z.array(lesson).min(1).max(20),
    ...links,
  })
  .strict();
export const trainingVersionSchema = z
  .object({
    title,
    description,
    objectives,
    pathwayVersionIds: z.array(z.uuid()).min(1).max(20),
    sourceReferences: z
      .array(
        z
          .object({ title, url: z.url({ protocol: /^https?$/ }).optional() })
          .strict(),
      )
      .max(20)
      .default([]),
    modules: z.array(moduleSchema).min(1).max(20),
    ...links,
  })
  .strict()
  .superRefine((value, ctx) => {
    const unique = (items: readonly string[], path: string) => {
      if (new Set(items).size !== items.length)
        ctx.addIssue({
          code: 'custom',
          path: [path],
          message: 'Duplicate identity/reference',
        });
    };
    unique(value.pathwayVersionIds, 'pathwayVersionIds');
    unique(
      value.modules.map((m) => m.code),
      'modules',
    );
    for (const m of value.modules)
      unique(
        m.lessons.map((l) => l.code),
        'modules',
      );
    if (
      value.modules.reduce(
        (total, m) =>
          total + m.lessons.reduce((sum, l) => sum + l.body.length, 0),
        0,
      ) > 20000
    )
      ctx.addIssue({
        code: 'custom',
        path: ['modules'],
        message: 'Demo text snapshot exceeds technical size bound',
      });
  });
export const trainingCreateSchema = z
  .object({ code, content: trainingVersionSchema })
  .strict();
export const learningProgressSchema = z
  .object({
    commandId: z.uuid(),
    expectedRevision: z.number().int().min(0).max(2147483646),
    state: z.enum(['IN_PROGRESS', 'COMPLETED']),
    resumePosition: z.number().int().min(0).max(20000),
  })
  .strict();
export const trainingAssignmentSchema = z
  .object({ candidateId: z.uuid(), courseVersionId: z.uuid() })
  .strict();
export type TrainingVersionInput = z.infer<typeof trainingVersionSchema>;
export type TrainingCreateInput = z.infer<typeof trainingCreateSchema>;
export type LearningProgressInput = z.infer<typeof learningProgressSchema>;
