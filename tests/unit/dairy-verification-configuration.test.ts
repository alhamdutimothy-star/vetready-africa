import { describe, expect, it } from 'vitest';
import {
  dairyEmployerVerificationClaimSchema,
  dairyFeedingBaseline,
  dairyReproductiveBaseline,
  dairyVerificationGateIds,
  domainExpertStandardRequired as required,
  type DairyVerificationConfiguration,
} from '@vetready/contracts';
import { validateDairyVerificationConfiguration as validate } from '@vetready/domain';

type Scope = DairyVerificationConfiguration['gates'][number]['scopes'][number];
function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error('Missing synthetic fixture item');
  return item;
}
const ref = (id: string, version = 1) => ({ id, version });
const decision = <T>(value: T) => ({
  decisionRef: 'synthetic-reference',
  value,
});
const makeScope = (id: string, components: string[]): Scope => ({
  ...ref(id),
  kind: 'DEFAULT',
  parent: null,
  components,
  mapping: required,
  clinicalBoundaries: required,
  proceduralPermissions: required,
  limitations: ['Synthetic fixture'],
  claimText: required,
  rubric: {
    ...ref(`rubric-${id}`),
    scope: ref(id),
    policy: ref('policy'),
    criteria: required,
  },
});
const draft = (): DairyVerificationConfiguration => ({
  ...ref('pilot'),
  predecessor: null,
  architectureVersion: '1.0',
  frameworkVersion: '1.0',
  provenance: 'Synthetic fixture',
  status: 'DRAFT',
  policies: [
    {
      ...ref('policy'),
      directObservationRoutes: required,
      coverage: {
        observationCount: required,
        contextsAndDiversity: required,
        timingAndCombination: required,
        assistanceLimits: required,
      },
      evidenceProvenance: required,
      evidenceSufficiency: required,
      decisionCriteria: required,
      evidenceCurrency: required,
      assessorEligibility: required,
      exactAuthorisationScope: required,
      calibration: required,
      independence: required,
      moderation: required,
      safetyCriteria: required,
      safetyInterventionAndReview: required,
      reassessment: required,
      restoration: required,
      localProfessionalRequirements: required,
      disclosure: required,
    },
  ],
  calibrationVersions: [],
  gates: dairyVerificationGateIds.map((id) => ({
    id,
    requiredForDefaultFieldReady: true,
    defaultScope: ref(id),
    scopes: [
      makeScope(
        id,
        id === 'R07'
          ? [dairyReproductiveBaseline]
          : id === 'R11'
            ? [...dairyFeedingBaseline]
            : ['SYNTHETIC_COMPONENT'],
      ),
    ],
  })),
});
const criterion = (componentId: string, id = componentId) => ({
  ...ref(id),
  componentId,
  dimension: 'D03' as const,
  applicability: 'MANDATORY' as const,
  safetyCritical: required as typeof required,
  standard: required as typeof required,
  evidenceRequirement: required as typeof required,
  evidenceBasis: 'DIRECT_PRACTICAL' as const,
});
const claim = {
  competency: 'R11',
  level: 'PRACTICALLY_VERIFIED',
  scope: 'Synthetic display scope',
  decisionAt: '2026-01-01T00:00:00Z',
  currentStatus: 'EFFECTIVE',
  limitations: ['Synthetic limitation'],
};

describe('inert dairy verification configuration', () => {
  it('reports exact unresolved paths without a publication or readiness outcome', () => {
    const config = draft();
    const result = validate(config);
    expect(result).toMatchObject({
      status: 'DRAFT_WITH_UNRESOLVED_STANDARDS',
      errors: [],
    });
    expect(Object.keys(result).sort()).toEqual([
      'errors',
      'status',
      'unresolved',
    ]);
    expect(result.unresolved).toEqual(
      expect.arrayContaining([
        { path: 'policies.0.coverage.observationCount', message: required },
        { path: 'policies.0.assessorEligibility', message: required },
        { path: 'gates.6.scopes.0.proceduralPermissions', message: required },
        { path: 'gates.10.scopes.0.rubric.criteria', message: required },
      ]),
    );
    expect(config).toEqual(draft());
  });

  it('can describe a structurally complete synthetic draft without certifying its references', () => {
    const config = draft();
    const synthetic = decision('Synthetic policy reference');
    const versionRef = {
      id: '11111111-1111-4111-8111-111111111111',
      version: 1,
    };
    const policy = at(config.policies, 0);
    for (const key of Object.keys(policy) as (keyof typeof policy)[]) {
      if (policy[key] === required) Object.assign(policy, { [key]: synthetic });
    }
    policy.directObservationRoutes = decision(['IN_PERSON']);
    policy.calibration = decision(ref('calibration'));
    policy.coverage = {
      observationCount: decision(1),
      contextsAndDiversity: synthetic,
      timingAndCombination: synthetic,
      assistanceLimits: synthetic,
    };
    config.calibrationVersions.push({
      ...ref('calibration'),
      referenceExamples: synthetic,
      periodicReview: synthetic,
    });
    for (const gate of config.gates) {
      const scope = at(gate.scopes, 0);
      scope.mapping = decision({ pathway: versionRef, children: [versionRef] });
      scope.clinicalBoundaries = synthetic;
      scope.proceduralPermissions = synthetic;
      scope.claimText = synthetic;
      scope.rubric.criteria = decision(
        scope.components.map((id) => ({
          ...criterion(id),
          safetyCritical: decision(false),
          standard: synthetic,
          evidenceRequirement: synthetic,
        })),
      );
    }
    expect(validate(config)).toEqual({
      status: 'STRUCTURALLY_COMPLETE_DRAFT',
      errors: [],
      unresolved: [],
    });
  });

  it.each([
    ['missing', (d: DairyVerificationConfiguration) => d.gates.pop()],
    [
      'duplicate',
      (d: DairyVerificationConfiguration) => d.gates.push(at(d.gates, 0)),
    ],
    [
      'unknown',
      (d: DairyVerificationConfiguration) =>
        Object.assign(at(d.gates, 0), { id: 'R12' }),
    ],
    [
      'optional',
      (d: DairyVerificationConfiguration) =>
        Object.assign(at(d.gates, 0), { requiredForDefaultFieldReady: false }),
    ],
  ])('rejects a %s default gate', (_, mutate) => {
    const config = draft();
    mutate(config);
    expect(validate(config).status).toBe('INVALID');
  });

  it('rejects missing, blank and placeholder professional decision references', () => {
    for (const assessorEligibility of [
      undefined,
      decision(''),
      { decisionRef: required, value: 'synthetic' },
    ]) {
      const config = draft();
      Object.assign(at(config.policies, 0), { assessorEligibility });
      expect(validate(config).status).toBe('INVALID');
    }
  });

  it('rejects a publication status or activation flag', () => {
    expect(validate({ ...draft(), status: 'APPROVED' }).status).toBe('INVALID');
    expect(validate({ ...draft(), activate: true }).status).toBe('INVALID');
  });

  it('accepts a separate narrower scope but refuses it as the default gate', () => {
    const config = draft();
    const gate = at(config.gates, 10);
    const narrow = makeScope('feed-only', ['FEED_ACCESS']);
    narrow.kind = 'NARROW';
    narrow.parent = gate.defaultScope;
    gate.scopes.push(narrow);
    expect(validate(config).errors).toEqual([]);
    gate.defaultScope = ref(narrow.id);
    expect(validate(config).errors.map(({ path }) => path)).toContain(
      'gates.10.defaultScope',
    );
  });

  it('rejects narrow scopes that widen their parent or refer to a different gate or version', () => {
    for (const [component, parent] of [
      ['RATION_FORMULATION', ref('R11')],
      ['FEED_ACCESS', ref('R01')],
      ['FEED_ACCESS', ref('R11', 2)],
    ] as const) {
      const config = draft();
      at(config.gates, 10).scopes.push({
        ...makeScope('narrow', [component]),
        kind: 'NARROW',
        parent,
      });
      expect(validate(config).status).toBe('INVALID');
    }
  });

  it('rejects removed R11 components and expanded R07 scope', () => {
    const config = draft();
    at(at(config.gates, 10).scopes, 0).components.splice(6, 1);
    at(at(config.gates, 6).scopes, 0).components.push('ADVANCED_PROCEDURE');
    expect(validate(config).errors.map(({ path }) => path)).toEqual([
      'gates.6.defaultScope',
      'gates.10.defaultScope',
    ]);
  });

  it('rejects broken exact references and invalid predecessor lineage', () => {
    const config = draft();
    config.predecessor = ref('pilot', 2);
    at(at(config.gates, 0).scopes, 0).rubric.scope = ref('R01', 2);
    at(at(config.gates, 1).scopes, 0).rubric.policy = ref('policy', 2);
    at(config.policies, 0).calibration = decision(ref('calibration', 2));
    config.calibrationVersions.push({
      ...ref('calibration'),
      referenceExamples: required,
      periodicReview: required,
    });
    expect(validate(config).errors.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        'predecessor',
        'policies.0.calibration',
        'gates.0.scopes.0.rubric.scope',
        'gates.1.scopes.0.rubric.policy',
      ]),
    );
  });

  it('rejects duplicate criterion identities even if their versions differ', () => {
    const config = draft();
    const item = criterion('SYNTHETIC_COMPONENT');
    at(at(config.gates, 0).scopes, 0).rubric.criteria = decision([
      item,
      { ...item, version: 2 },
    ]);
    expect(validate(config).status).toBe('INVALID');
  });

  it.each([
    'KNOWLEDGE_ASSESSED',
    'CASE_ASSESSED',
    'TRAINING',
    'SELF_DECLARED',
    'DOCUMENT_REVIEW',
    'ASSESSOR_CONFIDENCE',
    'SIMULATION',
  ])(
    'rejects %s as a direct practical route or criterion basis',
    (substitute) => {
      const config = draft();
      Object.assign(at(config.policies, 0), {
        directObservationRoutes: decision([substitute]),
      });
      expect(validate(config).status).toBe('INVALID');
      at(config.policies, 0).directObservationRoutes = required;
      Object.assign(at(at(config.gates, 0).scopes, 0).rubric, {
        criteria: decision([
          { ...criterion('SYNTHETIC_COMPONENT'), evidenceBasis: substitute },
        ]),
      });
      expect(validate(config).status).toBe('INVALID');
    },
  );

  it('requires mandatory direct evidence for every component', () => {
    const config = draft();
    at(at(config.gates, 10).scopes, 0).rubric.criteria = decision(
      dairyFeedingBaseline.map((id) => ({
        ...criterion(id),
        evidenceBasis:
          id === 'RUMINATION' ? 'SUPPORTING_ONLY' : 'DIRECT_PRACTICAL',
      })),
    );
    expect(validate(config).errors).toContainEqual(
      expect.objectContaining({
        message:
          'Component RUMINATION requires a mandatory direct practical criterion',
      }),
    );
  });

  it('rejects downgrading safety criteria and reports unresolved moderation and safety decisions', () => {
    const config = draft();
    const item = criterion('SYNTHETIC_COMPONENT');
    at(at(config.gates, 0).scopes, 0).rubric.criteria = decision([
      item,
      {
        ...item,
        id: 'unsafe',
        applicability: 'SUPPORTING',
        safetyCritical: decision(true),
      },
    ]);
    const result = validate(config);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('safety-critical'),
      }),
    );
    expect(result.unresolved.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        'policies.0.moderation',
        'policies.0.safetyCriteria',
        'policies.0.restoration',
      ]),
    );
  });
});

describe('future employer-safe claim shape', () => {
  it.each(['KNOWLEDGE_ASSESSED', 'CASE_ASSESSED', 'PRACTICALLY_VERIFIED'])(
    'accepts the explicit %s level',
    (level) => {
      expect(
        dairyEmployerVerificationClaimSchema.parse({ ...claim, level }).level,
      ).toBe(level);
    },
  );

  it.each([
    'clinicalNotes',
    'evidence',
    'candidateId',
    'assessorId',
    'reviewReason',
    'farmId',
    'fieldReady',
  ])('rejects the additional field %s', (field) => {
    expect(
      dairyEmployerVerificationClaimSchema.safeParse({
        ...claim,
        [field]: 'synthetic',
      }).success,
    ).toBe(false);
  });
});
