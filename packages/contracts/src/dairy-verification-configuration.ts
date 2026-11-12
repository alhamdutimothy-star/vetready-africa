import { z } from 'zod';

export const domainExpertStandardRequired = 'DOMAIN-EXPERT STANDARD REQUIRED';
export const dairyVerificationGateIds = [
  'R01',
  'R02',
  'R03',
  'R04',
  'R05',
  'R06',
  'R07',
  'R08',
  'R09',
  'R10',
  'R11',
] as const;
export const dairyVerificationDimensionIds = [
  'D01',
  'D02',
  'D03',
  'D04',
  'D05',
  'D06',
  'D07',
  'D08',
  'D09',
  'D10',
  'D11',
] as const;
export const dairyReproductiveBaseline =
  'FIRST_LINE_REPRODUCTIVE_CLINICAL_ASSESSMENT';
export const dairyFeedingBaseline = [
  'FEED_ACCESS',
  'WATER_ACCESS',
  'FEEDING_CONDITIONS',
  'BCS',
  'RUMEN_FILL',
  'MANURE',
  'RUMINATION',
  'CONTEXTUAL_INTERPRETATION',
  'SPECIALIST_REFERRAL',
] as const;

const label = z
  .string()
  .trim()
  .min(1)
  .refine((s) => s !== domainExpertStandardRequired);
const key = z.string().regex(/^[A-Za-z0-9_-]+$/);
const version = z.number().int().positive();
const ref = z.object({ id: key, version }).strict();
const competencyRef = z.object({ id: z.uuid(), version }).strict();
const gateId = z.enum(dairyVerificationGateIds);
const unresolved = z.literal(domainExpertStandardRequired);
const decision = <T extends z.ZodType>(value: T) =>
  z.union([unresolved, z.object({ decisionRef: label, value }).strict()]);

const observationRoute = z.enum(['IN_PERSON', 'REMOTE_OBSERVATION']);
const coverage = z
  .object({
    observationCount: decision(z.number().int().positive()),
    contextsAndDiversity: decision(label),
    timingAndCombination: decision(label),
    assistanceLimits: decision(label),
  })
  .strict();

const policy = z
  .object({
    ...ref.shape,
    directObservationRoutes: decision(z.array(observationRoute).min(1)),
    coverage,
    evidenceProvenance: decision(label),
    evidenceSufficiency: decision(label),
    decisionCriteria: decision(label),
    evidenceCurrency: decision(label),
    assessorEligibility: decision(label),
    exactAuthorisationScope: decision(label),
    calibration: decision(ref),
    independence: decision(label),
    moderation: decision(label),
    safetyCriteria: decision(label),
    safetyInterventionAndReview: decision(label),
    reassessment: decision(label),
    restoration: decision(label),
    localProfessionalRequirements: decision(label),
    disclosure: decision(label),
  })
  .strict();

const criterion = z
  .object({
    ...ref.shape,
    componentId: key,
    dimension: z.enum(dairyVerificationDimensionIds),
    applicability: z.enum(['MANDATORY', 'SUPPORTING', 'INAPPLICABLE']),
    safetyCritical: decision(z.boolean()),
    standard: decision(label),
    evidenceRequirement: decision(label),
    evidenceBasis: z.enum([
      'DIRECT_PRACTICAL',
      'SUPPORTING_ONLY',
      'INAPPLICABLE',
    ]),
  })
  .strict();

const scope = z
  .object({
    ...ref.shape,
    kind: z.enum(['DEFAULT', 'NARROW']),
    parent: ref.nullable(),
    components: z.array(key).min(1),
    mapping: decision(
      z
        .object({
          pathway: competencyRef,
          children: z.array(competencyRef).min(1),
        })
        .strict(),
    ),
    clinicalBoundaries: decision(label),
    proceduralPermissions: decision(label),
    limitations: z.array(label).min(1),
    claimText: decision(label),
    rubric: z
      .object({
        ...ref.shape,
        scope: ref,
        policy: ref,
        criteria: decision(z.array(criterion).min(1)),
      })
      .strict(),
  })
  .strict();

export const dairyVerificationConfigurationSchema = z
  .object({
    ...ref.shape,
    predecessor: ref.nullable(),
    architectureVersion: z.literal('1.0'),
    frameworkVersion: z.literal('1.0'),
    provenance: label,
    status: z.literal('DRAFT'),
    policies: z.array(policy).min(1),
    calibrationVersions: z.array(
      z
        .object({
          ...ref.shape,
          referenceExamples: decision(label),
          periodicReview: decision(label),
        })
        .strict(),
    ),
    gates: z.array(
      z
        .object({
          id: gateId,
          requiredForDefaultFieldReady: z.literal(true),
          defaultScope: ref,
          scopes: z.array(scope).min(1),
        })
        .strict(),
    ),
  })
  .strict();

export type DairyVerificationConfiguration = z.infer<
  typeof dairyVerificationConfigurationSchema
>;

// Shape for a future explicitly authorised disclosure. This does not grant access
// or establish that supplied display text has been reviewed for private content.
export const dairyEmployerVerificationClaimSchema = z
  .object({
    competency: gateId,
    level: z.enum([
      'KNOWLEDGE_ASSESSED',
      'CASE_ASSESSED',
      'PRACTICALLY_VERIFIED',
    ]),
    scope: label,
    decisionAt: z.iso.datetime(),
    currentStatus: z.enum(['EFFECTIVE', 'NOT_EFFECTIVE']),
    limitations: z.array(label),
    reassessmentDueAt: z.iso.datetime().optional(),
  })
  .strict();
