import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  aggregateCompetencyProfile,
  skillsPassport,
  profileCanonicalJson,
  normalizeProfileInput,
} from '../../packages/domain/src/competency-profile';
import { profileInputSchema } from '../../packages/contracts/src';
import { skillsPassportResponseSchema } from '../../apps/web/lib/competency-profile';
import { profileFixture, profileSource } from '../helpers/profile-facts';
it('leaves unconfigured requirements unavailable, never pass/fail or certification', () => {
  const p = aggregateCompetencyProfile(profileFixture());
  expect(p.readiness).toMatchObject({
    status: 'UNAVAILABLE',
    determination: null,
    certification: null,
    licensing: null,
  });
  expect(p.configurationStatus).toBe('UNCONFIGURED');
  expect(
    p.competencies[0]!.gaps.every(
      (g) =>
        g.determination === null &&
        g.reasons.includes('EXPERT_REQUIREMENTS_NOT_CONFIGURED'),
    ),
  ).toBe(true);
  expect(
    p.competencies[0]!.facets.every((f) => f.state === 'NO_EVIDENCE'),
  ).toBe(true);
});
it('does not activate readiness even if an individual requirement is approved', () => {
  const f = profileFixture();
  f.requirements[0]!.validationStatus = 'APPROVED';
  f.requirements[0]!.mandatory = true;
  f.sources = [profileSource(f)];
  const p = aggregateCompetencyProfile(f);
  expect(p.competencies[0]!.gaps[0]!.configurationStatus).toBe('UNCONFIGURED');
  expect(p.readiness.determination).toBeNull();
});
it('keeps old verified knowledge ahead of a newer unverified record of the same facet', () => {
  const f = profileFixture();
  const old = profileSource(f),
    recent = profileSource(f, {
      status: 'UNVERIFIED',
      verificationSupported: false,
      decisionOutcome: null,
      recordedAt: '2026-10-24T00:00:00.000Z',
      decisionAt: null,
    });
  f.sources = [recent, old];
  const p = aggregateCompetencyProfile(f),
    facet = p.competencies[0]!.facets.find(
      (x) => x.facet === 'KNOWLEDGE_ASSESSED',
    )!;
  expect(facet.selectedSourceKey).toBe(old.key);
  expect(facet.state).toBe('VERIFIED');
  expect(facet.sourceKeys).toHaveLength(2);
});
it('does not let a newer self-declaration overwrite verified evidence or imply practical verification', () => {
  const f = profileFixture();
  f.sources = [
    profileSource(f),
    profileSource(f, {
      kind: 'EXTERNAL_SUBMISSION',
      targets: [
        { childVersionId: f.competencies[0]!.id, facet: 'SELF_DECLARED' },
      ],
      status: 'UNVERIFIED',
      verificationSupported: false,
      decisionOutcome: null,
      decisionAt: null,
      recordedAt: '2026-10-25T10:00:00.000Z',
    }),
  ];
  const p = aggregateCompetencyProfile(f),
    c = p.competencies[0]!;
  expect(c.highestVerifiedFacet).toBe('KNOWLEDGE_ASSESSED');
  expect(c.facets.find((x) => x.facet === 'SELF_DECLARED')!.state).toBe(
    'CLAIMED',
  );
  expect(c.facets.find((x) => x.facet === 'PRACTICALLY_VERIFIED')!.state).toBe(
    'NO_EVIDENCE',
  );
});
it.each(['REVOKED', 'SUPERSEDED', 'WITHDRAWN', 'REJECTED', 'NEEDS_REVISION'])(
  'excludes %s sources without losing their provenance',
  (lifecycle) => {
    const f = profileFixture(),
      s = profileSource(f, { lifecycle });
    f.sources = [s];
    const p = aggregateCompetencyProfile(f);
    expect(p.sources[0]!.effective).toBe(false);
    expect(p.competencies[0]!.highestVerifiedFacet).toBeNull();
    expect(p.sources[0]!.sourceVersionId).toBe(s.sourceVersionId);
    expect(p.competencies[0]!.facets[2]!.effectiveSourceKeys).toEqual([]);
  },
);
it('does not revive a revoked predecessor while its replacement awaits review', () => {
  const f = profileFixture(),
    lineage = randomUUID();
  f.sources = [
    profileSource(f, { lifecycle: 'REVOKED', lineageId: lineage }),
    profileSource(f, {
      kind: 'EXTERNAL_SUBMISSION',
      lifecycle: 'UNDER_REVIEW',
      sourceVersion: 2,
      lineageId: lineage,
      status: 'UNVERIFIED',
      reviewPending: true,
      verificationSupported: false,
      decisionOutcome: null,
    }),
  ];
  const p = aggregateCompetencyProfile(f);
  expect(p.competencies[0]!.highestVerifiedFacet).toBeNull();
  expect(p.competencies[0]!.gaps[0]!.reasons).toContain('VERIFICATION_PENDING');
  expect(p.competencies[0]!.gaps[0]!.reasons).toContain('REVOKED_EVIDENCE');
});
it('honors rejection in the latest decision independently of a stale status string', () => {
  const f = profileFixture();
  f.sources = [profileSource(f, { decisionOutcome: 'REJECTED' })];
  expect(aggregateCompetencyProfile(f).sources[0]!.disposition).toBe(
    'INACTIVE',
  );
});
it.each(['2026-10-24T00:00:00.000Z', '2026-10-25T12:00:00.000Z', 'invalid'])(
  'fails closed for expired or invalid validity %s',
  (validUntil) => {
    const f = profileFixture();
    f.sources = [profileSource(f, { validUntil })];
    expect(aggregateCompetencyProfile(f).sources[0]!.effective).toBe(false);
  },
);
it('does not invent an expiry duration for otherwise current evidence', () => {
  const f = profileFixture();
  f.sources = [profileSource(f, { validUntil: null })];
  expect(aggregateCompetencyProfile(f).sources[0]!.disposition).toBe(
    'VERIFIED',
  );
});
it('demonstration practical decisions never become verified competence', () => {
  const f = profileFixture();
  f.sources = [
    profileSource(f, {
      kind: 'EXTERNAL_SUBMISSION',
      targets: [
        {
          childVersionId: f.competencies[0]!.id,
          facet: 'PRACTICALLY_VERIFIED',
        },
      ],
      status: 'UNVERIFIED',
      demo: true,
      decisionOutcome: 'DEMONSTRATED_IN_DEMO',
      verificationSupported: false,
      lifecycle: 'REVIEWED',
    }),
  ];
  const p = aggregateCompetencyProfile(f);
  expect(p.sources[0]!.disposition).toBe('DEMO_ONLY');
  expect(p.competencies[0]!.highestVerifiedFacet).toBeNull();
});
it('keeps revocation visible even when the source is also a demo', () => {
  const f = profileFixture();
  f.sources = [profileSource(f, { demo: true, lifecycle: 'REVOKED' })];
  const s = aggregateCompetencyProfile(f).sources[0]!;
  expect(s.disposition).toBe('INACTIVE');
  expect(s.reasons).toEqual([
    'DEMONSTRATION_ONLY',
    'REVOKED_EVIDENCE',
    'VERIFICATION_NOT_ESTABLISHED',
  ]);
});
it('training completion never becomes self-declared, assessed or verified child competence', () => {
  const f = profileFixture();
  f.sources = [
    profileSource(f, {
      kind: 'LEARNING',
      targets: [{ childVersionId: f.competencies[0]!.id, facet: 'LEARNING' }],
      status: 'COMPLETED',
      verificationSupported: false,
      decisionOutcome: null,
      completedLessons: 3,
      totalLessons: 3,
    }),
  ];
  const c = aggregateCompetencyProfile(f).competencies[0]!;
  expect(c.learningSourceKeys).toHaveLength(1);
  expect(c.facets.every((x) => x.state === 'NO_EVIDENCE')).toBe(true);
  expect(c.highestVerifiedFacet).toBeNull();
});
it('does not fan out legacy group documents into verified child competencies', () => {
  const f = profileFixture();
  f.sources = [
    profileSource(f, {
      kind: 'LEGACY_GROUP',
      targets: [],
      groupVersionIds: [f.groups[0]!.id],
      groupFacet: 'DOCUMENT_VERIFIED',
      status: 'VERIFIED',
      verificationSupported: false,
    }),
  ];
  const p = aggregateCompetencyProfile(f);
  expect(p.groupEvidence[0]!.sourceKeys).toHaveLength(1);
  expect(p.competencies[0]!.groupSupportingSourceKeys).toHaveLength(1);
  expect(p.competencies[0]!.highestVerifiedFacet).toBeNull();
  expect(p.sources[0]!.disposition).toBe('CLAIMED');
});
it('reuses one shared source across mapped pathways without duplicating evidence or awarding pathway readiness', () => {
  const f = profileFixture();
  f.sources = [profileSource(f)];
  const p = aggregateCompetencyProfile(f);
  expect(p.sources).toHaveLength(1);
  expect(p.competencies[0]!.gaps).toHaveLength(2);
  expect(p.competencies[0]!.pathwayVersionIds).toHaveLength(2);
  expect(
    p.competencies[0]!.gaps.find(
      (g) => g.pathwayVersionId === f.pathways[1]!.id,
    )!.reasons,
  ).toContain('PATHWAY_CONTEXT_NOT_EVALUATED');
  expect(p.readiness.determination).toBeNull();
});
it('keeps different definition versions separate', () => {
  const f = profileFixture();
  f.sources = [profileSource(f)];
  f.competencies.push({ ...f.competencies[0]!, id: randomUUID(), version: 2 });
  const p = aggregateCompetencyProfile(f);
  expect(
    p.competencies.filter((c) => c.highestVerifiedFacet !== null),
  ).toHaveLength(1);
});
it('produces identical facts, source choices and digests regardless of input ordering', () => {
  const f = profileFixture();
  f.sources = [profileSource(f), profileSource(f)];
  const shuffled = {
    ...f,
    pathways: [...f.pathways].reverse(),
    sources: [...f.sources].reverse(),
    competencies: f.competencies.map((c) => ({
      ...c,
      pathwayVersionIds: [...c.pathwayVersionIds].reverse(),
    })),
  };
  expect(aggregateCompetencyProfile(f)).toEqual(
    aggregateCompetencyProfile(shuffled),
  );
  expect(profileCanonicalJson(normalizeProfileInput(f))).toBe(
    profileCanonicalJson(normalizeProfileInput(shuffled)),
  );
});
it('retains provenance while the passport excludes reviewer identities, decisions and internal flags', () => {
  const f = profileFixture(),
    s = profileSource(f);
  f.sources = [s];
  const p = skillsPassport(aggregateCompetencyProfile(f));
  skillsPassportResponseSchema.parse(p);
  const text = JSON.stringify(p);
  expect(text).not.toContain(s.reviewerRef!);
  expect(text).not.toContain(s.decisionId!);
  expect(text).not.toContain('verificationSupported');
  expect(text).toContain(s.sourceVersionId!);
  expect(p.sharingEnabled).toBe(false);
});
it('rejects private narrative additions to normalized input instead of silently retaining them', () => {
  const f = profileFixture();
  const source = { ...profileSource(f), rationale: 'PRIVATE_NOTE_SENTINEL' };
  expect(
    profileInputSchema.safeParse({ ...f, sources: [source] }).success,
  ).toBe(false);
});
it('allowlists nested passport fields even if future internal models acquire private properties', () => {
  const f = profileFixture();
  f.sources = [profileSource(f)];
  const p = aggregateCompetencyProfile(f);
  for (const value of [
    p.readiness,
    p.pathways[0]!,
    p.groups[0]!,
    p.competencies[0]!,
    p.competencies[0]!.facets[0]!,
    p.competencies[0]!.gaps[0]!,
    p.sources[0]!,
    p.sources[0]!.targets[0]!,
    p.groupEvidence[0]!,
  ])
    Object.assign(value, { privateNote: 'PRIVATE_NESTED_SENTINEL' });
  const passport = skillsPassport(p);
  skillsPassportResponseSchema.parse(passport);
  expect(JSON.stringify(passport)).not.toContain('PRIVATE_NESTED_SENTINEL');
});
it('rejects unsupported engine versions rather than silently recomputing historical receipts', () => {
  const f = profileFixture();
  expect(() =>
    aggregateCompetencyProfile({
      ...f,
      engineVersion: 'unsupported',
    } as unknown as typeof f),
  ).toThrow();
});
