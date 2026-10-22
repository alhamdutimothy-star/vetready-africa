import { z } from 'zod';
import { trainingCreateSchema } from './training';
const text = z.string().trim().min(1).max(2000);
const code = z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/);
export const dairySourceSchema = z
  .object({
    title: text,
    organization: text,
    publication: text,
    year: z.number().int().min(1800).max(2200).nullable(),
    identifier: z.string().max(500),
    url: z.url({ protocol: /^https?$/ }).optional(),
    evidenceType: text,
    geographicRelevance: text,
    reviewerId: z.uuid().nullable(),
    reviewDate: z.iso.date().nullable(),
    notes: text,
    superseded: z.boolean(),
  })
  .strict();
export const dairyUnitSchema = z
  .object({
    lessonCode: code,
    domainCode: code,
    objectives: z
      .array(
        z
          .object({
            stage: z.enum([
              'KNOW',
              'INTERPRET',
              'INVESTIGATE',
              'DECIDE',
              'COMMUNICATE',
              'DEMONSTRATE',
            ]),
            statement: text,
          })
          .strict(),
      )
      .min(1)
      .max(12),
    prerequisites: z
      .array(
        z
          .object({
            childVersionId: z.uuid(),
            facet: z.enum([
              'KNOWLEDGE_ASSESSED',
              'CASE_ASSESSED',
              'PRACTICALLY_VERIFIED',
            ]),
          })
          .strict(),
      )
      .max(20),
    sections: z
      .object({
        introduction: text,
        coreConcepts: text,
        farmRelevance: text,
        africanContext: text,
        clinicalRelevance: text,
        herdRelevance: text,
        commercialRelevance: text,
        commonMistakes: text,
        redFlags: text,
        decisionPoints: text,
      })
      .strict(),
    sources: z.array(dairySourceSchema).max(20),
    practicalRequirements: z.array(text).min(1).max(12),
    activity: z
      .object({
        kind: z.enum(['KNOWLEDGE_REFLECTION', 'DATA_INTERPRETATION']),
        prompt: text,
      })
      .strict(),
  })
  .strict();
export const dairyCurriculumSchema = z
  .object({
    courseId: z.uuid().optional(),
    training: trainingCreateSchema,
    domains: z
      .array(
        z
          .object({
            code,
            title: z.string().min(2).max(160),
            topics: z.array(z.string().min(1).max(160)).min(1).max(40),
            childVersionIds: z.array(z.uuid()).min(1).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    units: z.array(dairyUnitSchema).min(1).max(20),
  })
  .strict()
  .superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    const unique = (xs: string[]) => new Set(xs).size === xs.length;
    const lessons = v.training.content.modules.flatMap((m) =>
      m.lessons.map((l) => l.code),
    );
    if (
      !unique(lessons) ||
      !unique(v.units.map((u) => u.lessonCode)) ||
      !unique(v.domains.map((d) => d.code))
    )
      fail('Unique lesson and domain codes required');
    if (
      lessons.length !== v.units.length ||
      v.units.some(
        (u) =>
          !lessons.includes(u.lessonCode) ||
          !v.domains.some((d) => d.code === u.domainCode),
      )
    )
      fail('Every lesson requires exactly one governed unit and domain');
  });
export const dairyActivitySchema = z
  .object({
    commandId: z.uuid(),
    expectedRevision: z.number().int().min(0).max(2147483646),
    response: z.string().trim().min(1).max(4000),
  })
  .strict();
export type DairyCurriculumInput = z.infer<typeof dairyCurriculumSchema>;
export type DairyUnit = z.infer<typeof dairyUnitSchema>;
export type DairyActivityInput = z.infer<typeof dairyActivitySchema>;
