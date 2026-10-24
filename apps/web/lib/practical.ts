import { z } from 'zod';
export const practicalOptionsSchema = z.array(
  z.object({
    pathwayVersionId: z.uuid(),
    pathwayName: z.string(),
    pathwayVersion: z.number(),
    childVersionId: z.uuid(),
    code: z.string(),
    statement: z.string(),
  }),
);
export const practicalListSchema = z.object({
  versions: z.array(
    z.object({
      id: z.uuid(),
      version: z.number(),
      status: z.string(),
      summary: z.string().optional(),
    }),
  ),
  truncated: z.boolean(),
  notice: z.string(),
});
export const practicalDetailSchema = z.object({
  version: z.object({
    id: z.uuid(),
    version: z.number(),
    status: z.string(),
    summary: z.string(),
    context: z.object({ task: z.string() }),
    draft_revision: z.number(),
    pathway_version_id: z.uuid(),
  }),
  targets: z.array(
    z.object({ childVersionId: z.uuid(), requestedFacet: z.string() }),
  ),
  declaration: z
    .object({ declaration: z.string(), created_at: z.string() })
    .nullable(),
  decisions: z.array(
    z.object({
      id: z.uuid(),
      outcome: z.string(),
      rationale: z.string(),
      supersedes_decision_id: z.uuid().nullable(),
      created_at: z.string(),
    }),
  ),
  events: z.array(
    z.object({
      from_status: z.string().nullable(),
      to_status: z.string(),
      reason: z.string(),
      created_at: z.string(),
    }),
  ),
  history: z.array(
    z.object({ id: z.uuid(), version: z.number(), status: z.string() }),
  ),
  notice: z.string(),
  competenceVerified: z.literal(false),
  readiness: z.null(),
});
export const practicalGapsSchema = z.object({
  gaps: z.array(
    z.object({
      childVersionId: z.uuid(),
      facet: z.string(),
      reasons: z.array(z.string()),
      evidenceIds: z.array(z.uuid()),
      submissionVersionIds: z.array(z.uuid()),
    }),
  ),
  readinessRulesActive: z.literal(false),
  readiness: z.null(),
});
export type PracticalSaveState = {
  ok: boolean;
  revision: number;
  commandId: string;
  message: string;
};
