import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  matchingInputSchema,
  jobContentSchema,
  applyPilotSchema,
  type MatchingInput,
} from '../../packages/contracts/src';
import {
  evaluatePilotMatch,
  pilotMatchingFacts,
  employerPilotProjection,
} from '../../packages/domain/src/recruitment';
import {
  aggregateCompetencyProfile,
  profileCanonicalJson,
} from '../../packages/domain/src/competency-profile';
import { profileFixture, profileSource } from '../helpers/profile-facts';
function input(): MatchingInput {
  return {
    engineVersion: 'pilot-match-1',
    policyVersion: 'pilot-policy-1',
    jobVersionId: randomUUID(),
    pathwayVersionId: randomUUID(),
    requirements: [
      { id: randomUUID(), kind: 'PATHWAY_INTEREST', mandatory: true },
    ],
    facts: {
      pathwayInterest: true,
      state: 'Kano',
      willingToRelocate: false,
      facets: [],
    },
  };
}
it('evaluates only declared technical gates with no score, readiness or certification', () => {
  const r = evaluatePilotMatch(input());
  expect(r.eligibility).toBe('ELIGIBLE');
  expect(r.scope).toBe('DECLARED_TECHNICAL_CONDITIONS_ONLY');
  expect(r.fit).toMatchObject({
    status: 'UNCONFIGURED',
    score: null,
    weights: null,
  });
  expect(r.professionalReadiness).toBe('UNAVAILABLE');
  expect(r.certification).toBeNull();
});
it('does not hide a mandatory mismatch behind preferred matches', () => {
  const i = input();
  i.facts.pathwayInterest = false;
  i.requirements.push({
    id: randomUUID(),
    kind: 'LOCATION_DECLARATION',
    mandatory: false,
    state: 'Kano',
    acceptRelocation: false,
  });
  const r = evaluatePilotMatch(i);
  expect(r.eligibility).toBe('NOT_ELIGIBLE');
  expect(r.fit.score).toBeNull();
});
it('requires evidence configuration rather than vacuous eligibility for empty mandatory requirements', () => {
  const i = input();
  i.requirements = [];
  expect(evaluatePilotMatch(i).eligibility).toBe('UNCONFIGURED');
});
it('keeps missing location unknown', () => {
  const i = input();
  i.requirements = [
    {
      id: randomUUID(),
      kind: 'LOCATION_DECLARATION',
      mandatory: true,
      state: 'Kano',
      acceptRelocation: true,
    },
  ];
  i.facts.state = '';
  expect(evaluatePilotMatch(i).eligibility).toBe('UNKNOWN');
});
it.each([false, true])(
  'uses relocation only when the opportunity explicitly accepts it (%s)',
  (accept) => {
    const i = input();
    i.facts.willingToRelocate = true;
    i.requirements = [
      {
        id: randomUUID(),
        kind: 'LOCATION_DECLARATION',
        mandatory: true,
        state: 'Lagos',
        acceptRelocation: accept,
      },
    ];
    expect(evaluatePilotMatch(i).eligibility).toBe(
      accept ? 'ELIGIBLE' : 'NOT_ELIGIBLE',
    );
  },
);
it.each([
  'SELF_DECLARED',
  'DOCUMENT_VERIFIED',
  'KNOWLEDGE_ASSESSED',
  'CASE_ASSESSED',
  'PRACTICALLY_VERIFIED',
] as const)(
  'never activates a professional %s gate even with a verified fact',
  (facet) => {
    const i = input(),
      child = randomUUID();
    i.requirements = [
      {
        id: randomUUID(),
        kind: 'COMPETENCY_FACET',
        mandatory: true,
        childVersionId: child,
        facet,
      },
    ];
    i.facts.facets = [
      { childVersionId: child, facet, state: 'VERIFIED', sources: [] },
    ];
    const r = evaluatePilotMatch(i);
    expect(r.eligibility).toBe('UNCONFIGURED');
    expect(r.gates[0]!.reason).toBe('REQUIRES DOMAIN EXPERT VALIDATION');
    expect(r.fit.score).toBeNull();
  },
);
it('preserves deterministic explanations across requirement ordering', () => {
  const i = input();
  i.requirements.push({
    id: randomUUID(),
    kind: 'LOCATION_DECLARATION',
    mandatory: false,
    state: 'Kano',
    acceptRelocation: false,
  });
  expect(profileCanonicalJson(evaluatePilotMatch(i))).toBe(
    profileCanonicalJson(
      evaluatePilotMatch({ ...i, requirements: [...i.requirements].reverse() }),
    ),
  );
});
it('does not depend on host locale when ordering immutable receipt fields', () => {
  const i = input();
  i.requirements.push({
    id: randomUUID(),
    kind: 'PATHWAY_INTEREST',
    mandatory: false,
  });
  const spy = vi
    .spyOn(String.prototype, 'localeCompare')
    .mockImplementation(() => {
      throw Error('Locale-dependent ordering');
    });
  try {
    expect(evaluatePilotMatch(i).gates.map((g) => g.requirementId)).toEqual(
      i.requirements.map((r) => r.id).sort(),
    );
  } finally {
    spy.mockRestore();
  }
});
it('rejects weights, demographic signals and spoofed consent', () => {
  const i = input();
  expect(
    matchingInputSchema.safeParse({ ...i, weights: { knowledge: 1 } }).success,
  ).toBe(false);
  expect(
    matchingInputSchema.safeParse({ ...i, facts: { ...i.facts, gender: 'x' } })
      .success,
  ).toBe(false);
  expect(
    applyPilotSchema.safeParse({
      commandId: randomUUID(),
      snapshotId: randomUUID(),
      jobVersionId: randomUUID(),
      consent: false,
      consentVersion: 'pilot-share-1',
    }).success,
  ).toBe(false);
});
it('rejects arbitrary requirements and duplicate requirement identifiers', () => {
  const i = input();
  const content = {
    title: 'Pilot opportunity',
    description: 'Synthetic software protocol only',
    pathwayVersionId: i.pathwayVersionId,
    requirements: i.requirements,
  };
  expect(
    jobContentSchema.safeParse({
      ...content,
      requirements: [...i.requirements, ...i.requirements],
    }).success,
  ).toBe(false);
  expect(
    jobContentSchema.safeParse({
      ...content,
      requirements: [
        { id: randomUUID(), kind: 'AGE', mandatory: true, value: 25 },
      ],
    }).success,
  ).toBe(false);
});
it('never promotes training, legacy group claims, demo or revoked practical evidence', () => {
  const f = profileFixture();
  const s = profileSource(f);
  s.targets = [
    { childVersionId: f.competencies[0]!.id, facet: 'PRACTICALLY_VERIFIED' },
  ];
  s.demo = true;
  s.lifecycle = 'REVOKED';
  f.sources = [s];
  const content = {
    title: 'Pilot opportunity',
    description: 'Synthetic software protocol only',
    pathwayVersionId: f.pathways[0]!.id,
    requirements: [
      {
        id: randomUUID(),
        kind: 'COMPETENCY_FACET' as const,
        mandatory: true,
        childVersionId: f.competencies[0]!.id,
        facet: 'PRACTICALLY_VERIFIED' as const,
      },
    ],
  };
  const facts = pilotMatchingFacts(aggregateCompetencyProfile(f), content, {
    state: 'Kano',
    willingToRelocate: true,
    pathwayInterest: true,
  });
  expect(facts.facets[0]!.state).toBe('INACTIVE');
  expect(facts.facets[0]!.sources).toEqual([]);
  expect(facts.state).toBe('');
});
it('uses an employer allowlist, hides internal identifiers and preserves exact category', () => {
  const i = input(),
    child = randomUUID();
  i.facts.facets = [
    {
      childVersionId: child,
      facet: 'KNOWLEDGE_ASSESSED',
      state: 'VERIFIED',
      sources: [
        {
          ref: 'PRIVATE_SOURCE_ID',
          kind: 'ASSESSMENT',
          sourceVersionId: randomUUID(),
          sourceVersion: 1,
          pathwayVersionIds: [i.pathwayVersionId],
          recordedAt: '2026-01-01T00:00:00.000Z',
          validUntil: null,
        },
      ],
    },
  ];
  Object.assign(i.facts, {
    reviewerRef: 'PRIVATE_REVIEWER_ID',
    summary: 'PRIVATE_NOTE',
  });
  const p = employerPilotProjection(
    'application-alias',
    i,
    evaluatePilotMatch({
      ...i,
      facts: {
        pathwayInterest: true,
        state: 'Kano',
        willingToRelocate: false,
        facets: i.facts.facets,
      },
    }),
  );
  const text = JSON.stringify(p);
  expect(text).not.toContain('PRIVATE_');
  expect(text).not.toContain('sourceVersionId');
  expect(text).not.toContain('willingToRelocate');
  expect(text).toContain('KNOWLEDGE_ASSESSED');
  expect(p.fit.score).toBeNull();
});
it.each(['CLAIMED', 'ASSESSED'])(
  'preserves %s as distinct from verified evidence without disclosing private history',
  (state) => {
    const i = input();
    i.facts.facets = [
      {
        childVersionId: randomUUID(),
        facet: 'KNOWLEDGE_ASSESSED',
        state,
        sources: [],
      },
    ];
    const p = employerPilotProjection('scoped-alias', i, evaluatePilotMatch(i));
    expect(p.competencies[0]!.state).toBe(state);
    expect(p.professionalReadiness).toBe('UNAVAILABLE');
  },
);
