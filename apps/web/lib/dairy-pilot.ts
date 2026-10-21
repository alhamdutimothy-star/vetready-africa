import { z } from 'zod';
import { attemptSchema } from './assessment';
import { reasoningSchema, reasoningCategories } from '@vetready/contracts';
export const categoryLabels: Record<string, string> = {
  observations: 'My observations',
  interpretation: 'My interpretation / hypotheses',
  assumptions: 'Assumptions and limitations',
  informationRequests: 'Additional information / evidence needed',
  priorities: 'Priorities and rationale',
  actions: 'Conditional recommendations / actions',
  monitoring: 'Monitoring / reassessment indicators',
  safety: 'Risks, safety and escalation',
};
export const pilotDashboardSchema = z.object({
  pathway: z.object({ id: z.uuid(), version_id: z.uuid(), name: z.string() }),
  profileRequired: z.boolean(),
  selected: z.boolean(),
  notice: z.string(),
  pilot: z
    .object({
      id: z.uuid(),
      title: z.string(),
      version: z.number(),
      status: z.string(),
      notice: z.string(),
    })
    .nullable(),
  attempts: z.array(
    z.object({
      id: z.uuid(),
      status: z.string(),
      saved: z.number(),
      total: z.number(),
    }),
  ),
  learning: z.object({
    enrollments: z.number(),
    completed_lessons: z.number(),
  }),
  evidence: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      facet: z.string(),
      status: z.string(),
      demo: z.boolean(),
      observation: z.string(),
    }),
  ),
  competencies: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      statement: z.string(),
      validation_status: z.string(),
    }),
  ),
  practicalVerification: z.string(),
  readiness: z.null(),
});
const observation = z.object({
  rubricCriterionId: z.uuid(),
  observation: z
    .enum(['DEMONSTRATED', 'NEEDS_DEVELOPMENT', 'UNASSESSABLE'])
    .nullable(),
  comment: z.string(),
});
const feedback = z.object({
  id: z.uuid(),
  assessor_id: z.uuid(),
  created_at: z.string(),
  feedback: z.string(),
  decision: z.string(),
  moderation: z.enum(['RETURNED', 'CONFIRMED']).nullable(),
  observations: z.array(
    z.object({
      childCode: z.string(),
      dimensions: z.array(z.string()),
      observation: z.string(),
      comment: z.string(),
    }),
  ),
});
export const pilotAttemptSchema = attemptSchema.extend({
  items: z.array(
    z.object({
      id: z.uuid(),
      prompt: z.string(),
      child_code: z.string(),
      evidence_type: z.string(),
      response: z.object({ reasoning: reasoningSchema }).nullable(),
      rubric: z.array(z.object({ id: z.uuid(), description: z.string() })),
    }),
  ),
  suppliedEvidence: z.array(
    z.object({
      source: z.literal('CASE_SUPPLIED'),
      statement: z.string(),
      limitation: z.string(),
    }),
  ),
  configuration: z.array(
    z.object({
      item_version_id: z.uuid(),
      response_categories: z.array(z.enum(reasoningCategories)),
      revision: z.number(),
      competency: z.string(),
    }),
  ),
  feedback: z.array(feedback),
});
export const staffPilotSchema = pilotAttemptSchema.extend({
  canReview: z.boolean(),
  reviewDraft: z
    .object({
      id: z.uuid(),
      revision: z.number(),
      decision: z.enum(['DEVELOPMENT_FEEDBACK', 'MORE_EVIDENCE_REQUIRED']),
      feedback: z.string(),
      observations: z.array(observation),
    })
    .nullable(),
  privateGuidance: z.array(
    z.object({ rubric_criterion_id: z.uuid(), assessor_guidance: z.string() }),
  ),
});
export type PilotAttempt = z.infer<typeof pilotAttemptSchema>;
export type StaffPilot = z.infer<typeof staffPilotSchema>;
export interface PilotActionState {
  ok: boolean;
  message: string;
  revision: number;
  finalized?: boolean;
}
