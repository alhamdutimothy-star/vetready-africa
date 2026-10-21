import { z } from 'zod';
export const uuidSchema = z.uuid();
export const pathwaySchema = z.array(
  z.object({ id: z.uuid(), version_id: z.uuid(), name: z.string() }),
);
export const catalogSchema = z.array(
  z.object({
    id: z.uuid(),
    title: z.string(),
    pathway: z.string(),
    pathway_id: z.uuid(),
    demo: z.boolean(),
    notice: z.string(),
  }),
);
export const attemptsSchema = z.array(
  z.object({
    id: z.uuid(),
    title: z.string(),
    status: z.string(),
    demo: z.boolean(),
    pathway: z.string(),
  }),
);
export const evidenceSchema = z.array(
  z.object({
    id: z.uuid(),
    code: z.string(),
    facet: z.string(),
    demo: z.boolean(),
    status: z.string(),
    observation: z.string(),
  }),
);
export const gapSchema = z.object({
  pathwayVersionId: z.uuid(),
  notice: z.string(),
  engineVersion: z.string(),
  gaps: z.array(
    z.object({
      childVersionId: z.uuid(),
      code: z.string(),
      statement: z.string(),
      state: z.string(),
      policyStatus: z.string(),
      missingFacets: z.array(z.string()),
      verifiedEvidenceIds: z.array(z.uuid()),
      diagnosticEvidenceIds: z.array(z.uuid()),
    }),
  ),
  activities: z.array(
    z.object({
      childVersionId: z.uuid(),
      code: z.string(),
      gap: z.string(),
      activity: z.string(),
      validationStatus: z.string(),
    }),
  ),
});
export const attemptSchema = z.object({
  pilot: z.boolean().optional(),
  caseBlueprint: z
    .object({
      assessment_version_id: z.uuid().optional(),
      scenario: z.string(),
      validation_notice: z.string(),
      steps: z.array(
        z.object({
          itemVersionId: z.uuid(),
          title: z.string(),
          rubricDimensions: z
            .array(
              z.object({ rubricCriterionId: z.uuid(), dimension: z.string() }),
            )
            .optional(),
        }),
      ),
    })
    .nullable()
    .optional(),
  id: z.uuid(),
  title: z.string(),
  status: z.string(),
  demo: z.boolean(),
  notice: z.string(),
  items: z.array(
    z.object({
      id: z.uuid(),
      type: z.string(),
      retired: z.boolean(),
      prompt: z.string(),
      child_code: z.string(),
      group_code: z.string(),
      domain_code: z.string(),
      evidence_type: z.string(),
      presentation: z.object({
        options: z
          .array(z.object({ id: z.string(), text: z.string() }))
          .optional(),
        units: z.string().optional(),
      }),
      response: z
        .object({
          text: z.string().optional(),
          value: z.number().optional(),
          selected: z.array(z.string()).optional(),
        })
        .nullable(),
      rubric: z.array(z.object({ id: z.uuid(), description: z.string() })),
    }),
  ),
  reviews: z.array(z.object({ id: z.uuid(), feedback: z.string() })),
  evidence: z.array(
    z.object({
      id: z.uuid(),
      facet: z.string(),
      status: z.string(),
      demo: z.boolean(),
      observation: z.string(),
    }),
  ),
});
