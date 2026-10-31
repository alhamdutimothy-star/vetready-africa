import { z } from 'zod';
import { jobContentSchema } from '@vetready/contracts';
export const pilotJobSchema = z
  .object({
    id: z.uuid(),
    organizationId: z.uuid(),
    organizationName: z.string(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']),
    version: z.number().int(),
    versionId: z.uuid(),
    content: jobContentSchema,
    notice: z.string(),
    policy: z
      .object({
        version: z.literal('pilot-policy-1'),
        professionalStatus: z.literal('UNCONFIGURED'),
        weightedFit: z.literal('UNCONFIGURED'),
      })
      .strict(),
  })
  .strict();
export const pilotJobsSchema = z
  .object({ notice: z.string(), jobs: z.array(pilotJobSchema) })
  .strict();
export const pilotOrganizationsSchema = z
  .object({
    notice: z.string(),
    organizations: z.array(
      z.object({ id: z.uuid(), name: z.string() }).strict(),
    ),
  })
  .strict();
export const pilotOptionsSchema = z
  .object({
    pathways: z.array(
      z
        .object({
          id: z.uuid(),
          name: z.string(),
          version: z.number(),
          status: z.string(),
        })
        .strict(),
    ),
    competencies: z.array(
      z
        .object({
          id: z.uuid(),
          code: z.string(),
          statement: z.string(),
          status: z.string(),
          pathways: z.array(z.uuid()),
        })
        .strict(),
    ),
  })
  .strict();
export const pilotApplicationsSchema = z
  .object({
    notice: z.string(),
    truncated: z.boolean(),
    applications: z.array(
      z
        .object({
          id: z.uuid(),
          jobId: z.uuid(),
          jobVersionId: z.uuid(),
          status: z.string(),
          stage: z.string(),
          revision: z.number(),
          title: z.string(),
          consent: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export const employerApplicationsSchema = z
  .object({
    notice: z.string(),
    truncated: z.boolean(),
    applications: z.array(
      z
        .object({
          id: z.uuid(),
          candidateAlias: z.uuid(),
          stage: z.string(),
          revision: z.number(),
        })
        .strict(),
    ),
  })
  .strict();
export const employerExplanationSchema = z
  .object({
    id: z.uuid(),
    evaluatedAt: z.string(),
    projection: z
      .object({
        candidateAlias: z.string(),
        notice: z.string(),
        jobVersionId: z.uuid(),
        eligibility: z.enum([
          'ELIGIBLE',
          'NOT_ELIGIBLE',
          'UNKNOWN',
          'UNCONFIGURED',
        ]),
        scope: z.literal('DECLARED_TECHNICAL_CONDITIONS_ONLY'),
        requirements: z.array(
          z
            .object({
              requirementId: z.uuid(),
              kind: z.string(),
              mandatory: z.boolean(),
              outcome: z.string(),
              reason: z.string(),
            })
            .strict(),
        ),
        competencies: z.array(
          z
            .object({
              childVersionId: z.uuid(),
              facet: z.string(),
              state: z.enum([
                'VERIFIED',
                'ASSESSED',
                'CLAIMED',
                'NOT_ESTABLISHED',
              ]),
              pathwayContext: z.literal('NOT_PROFESSIONALLY_VALIDATED'),
              provenance: z.array(
                z
                  .object({
                    reference: z.string(),
                    kind: z.string(),
                    sourceVersion: z.number().nullable(),
                    recordedAt: z.string(),
                  })
                  .strict(),
              ),
            })
            .strict(),
        ),
        fit: z
          .object({ status: z.literal('UNCONFIGURED'), score: z.null() })
          .strict(),
        professionalReadiness: z.literal('UNAVAILABLE'),
        certification: z.null(),
        licensing: z.null(),
      })
      .strict(),
  })
  .strict();
export const pilotGovernanceSchema = z
  .object({
    notice: z.string(),
    organizations: z.array(
      z.object({ id: z.uuid(), name: z.string(), status: z.string() }).strict(),
    ),
    members: z.array(
      z
        .object({
          organizationId: z.uuid(),
          userId: z.uuid(),
          status: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
