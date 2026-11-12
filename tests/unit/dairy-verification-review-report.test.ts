import { describe, expect, it } from 'vitest';
import {
  dairyFeedingBaseline,
  dairyReproductiveBaseline,
  dairyVerificationGateIds,
  domainExpertStandardRequired as required,
  type DairyVerificationConfiguration,
} from '@vetready/contracts';
import {
  reviewDairyVerificationDraft as review,
  runDairyVerificationReview as run,
} from '../../scripts/review-dairy-verification-configuration';
type Scope = DairyVerificationConfiguration['gates'][number]['scopes'][number];
const ref = (id: string, version = 1) => ({ id, version });
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

describe('offline dairy draft review', () => {
  it('distinguishes malformed JSON and invalid drafts without echoing input', () => {
    expect(review('private malformed text')).toMatchObject({
      status: 'MALFORMED_JSON',
    });
    const report = review(
      JSON.stringify({ unexpectedPrivateKey: 'private value' }),
    );
    expect(report.status).toBe('INVALID');
    expect(JSON.stringify(report)).not.toMatch(
      /unexpectedPrivateKey|private value/,
    );
  });

  it('reports unresolved paths and preserves exact scope, rubric and policy versions', () => {
    const input = draft();
    const gate = input.gates.find(({ id }) => id === 'R01');
    if (!gate) throw new Error('Missing synthetic gate');
    gate.scopes.push({
      ...makeScope('narrow', ['SYNTHETIC_COMPONENT']),
      kind: 'NARROW',
      parent: ref('R01'),
    });
    const source = JSON.stringify(input);
    const report = review(source);
    expect(report).toEqual(review(source));
    expect(report).toMatchObject({
      status: 'DRAFT_WITH_UNRESOLVED_STANDARDS',
      configuration: { id: 'pilot', version: 1 },
      unresolved: expect.arrayContaining([
        { path: 'policies.0.assessorEligibility', message: required },
      ]),
      gates: expect.arrayContaining([
        expect.objectContaining({
          id: 'R01',
          defaultScope: ref('R01'),
          scopes: expect.arrayContaining([
            expect.objectContaining({
              id: 'narrow',
              kind: 'NARROW',
              parent: ref('R01'),
              rubric: {
                ...ref('rubric-narrow'),
                scope: ref('narrow'),
                policy: ref('policy'),
                criteria: required,
              },
            }),
          ]),
        }),
      ]),
    });
  });

  it('preserves versioned mapping references without disclosing decision text', () => {
    const input = draft();
    const scope = input.gates[0]?.scopes[0];
    if (!scope) throw new Error('Missing synthetic scope');
    const version = ref('11111111-1111-4111-8111-111111111111', 2);
    scope.mapping = {
      decisionRef: 'private reference text',
      value: { pathway: version, children: [version] },
    };
    const report = review(JSON.stringify(input));
    expect(report).toMatchObject({
      referenceStatus: 'REQUIRES VERIFICATION',
      externalReferences: [
        {
          path: 'gates.0.scopes.0.mapping.decisionRef',
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      ],
      gates: expect.arrayContaining([
        expect.objectContaining({
          scopes: expect.arrayContaining([
            expect.objectContaining({ mapping: scope.mapping.value }),
          ]),
        }),
      ]),
    });
    expect(JSON.stringify(report)).not.toMatch(
      /private reference text|Synthetic fixture/,
    );
  });

  it('rejects missing, extra and non-local arguments and does not echo unreadable paths', () => {
    for (const args of [
      [],
      ['-'],
      ['https://example.invalid/draft.json'],
      ['//server/share/draft.json'],
      ['one', 'two'],
    ]) {
      expect(run(args)).toMatchObject({
        exitCode: 2,
        report: { status: 'LOCAL_FILE_REQUIRED' },
      });
    }
    expect(run(['missing-synthetic-draft.json'])).toMatchObject({
      exitCode: 2,
      report: { status: 'UNREADABLE_LOCAL_FILE' },
    });
    expect(run(['package.json'])).toMatchObject({
      exitCode: 1,
      report: { status: 'INVALID' },
    });
  });
});
