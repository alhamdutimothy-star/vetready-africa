import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  governedVerificationBlockers,
  verificationEventAllowed,
  verificationEvidenceLevel,
} from '@vetready/domain';
import {
  verificationSubmissionSchema,
  verificationEventSchema,
  verificationCriteriaSchema,
} from '@vetready/contracts';
it.each(['string version', 'numeric criterion', 'unsupported field'])(
  'rejects noncanonical criteria: %s',
  (kind) => {
    const c: Record<string, unknown> = {
      id: randomUUID(),
      version: 1,
      criterion: 'Synthetic criterion',
      evidenceRequirement: 'Synthetic evidence',
    };
    if (kind === 'string version') c.version = '1';
    if (kind === 'numeric criterion') c.criterion = 42;
    if (kind === 'unsupported field') c.extra = true;
    expect(verificationCriteriaSchema.safeParse([c]).success).toBe(false);
  },
);
it('matches criterion normalization, Unicode code-point bounds and unique UUID identity without professional rules', () => {
  const c = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    version: 1,
    criterion: '\u00a0\t Synthetic criterion \ufeff',
    evidenceRequirement: 'Synthetic evidence',
  };
  expect(verificationCriteriaSchema.parse([c])[0]!.criterion).toBe(
    'Synthetic criterion',
  );
  expect(
    verificationCriteriaSchema.safeParse([
      { ...c, criterion: '😀'.repeat(1000) },
    ]).success,
  ).toBe(true);
  expect(
    verificationCriteriaSchema.safeParse([
      { ...c, criterion: '😀'.repeat(1001) },
    ]).success,
  ).toBe(false);
  expect(
    verificationCriteriaSchema.safeParse([c, { ...c, id: c.id.toUpperCase() }])
      .success,
  ).toBe(false);
});
const good = {
  demo: false,
  rubricApproved: true,
  scopeAuthorized: true,
  assigned: true,
  independent: true,
  conflictClear: true,
  structuredFindingsComplete: true,
  moderationRequired: false,
  independentModeration: false,
};
it('authorizes only the complete technical prerequisites without assigning readiness', () => {
  expect(governedVerificationBlockers(good)).toEqual([]);
  expect(verificationEvidenceLevel(true, 'PRACTICALLY_VERIFIED')).toMatchObject(
    { evidenceLevelAfter: 'PRACTICALLY_VERIFIED', readiness: 'UNCONFIGURED' },
  );
});
it.each([
  'rubricApproved',
  'scopeAuthorized',
  'assigned',
  'independent',
  'conflictClear',
  'structuredFindingsComplete',
] as const)('blocks missing %s', (key) =>
  expect(
    governedVerificationBlockers({ ...good, [key]: false }).length,
  ).toBeGreaterThan(0),
);
it('never promotes demonstration evidence', () =>
  expect(governedVerificationBlockers({ ...good, demo: true })).toContain(
    'DEMONSTRATION_ONLY',
  ));
it('honours configured moderation without inventing a moderation requirement', () => {
  expect(
    governedVerificationBlockers({ ...good, moderationRequired: true }),
  ).toContain('INDEPENDENT_MODERATION_REQUIRED');
  expect(
    governedVerificationBlockers({
      ...good,
      moderationRequired: true,
      independentModeration: true,
    }),
  ).toEqual([]);
});
it.each(['KNOWLEDGE_ASSESSED', 'CASE_ASSESSED', 'SIMULATION_VERIFIED'])(
  'never accumulates %s into practical evidence',
  (facet) =>
    expect(verificationEvidenceLevel(true, facet).evidenceLevelAfter).toBe(
      facet,
    ),
);
it('keeps unverified evidence self declared', () =>
  expect(
    verificationEvidenceLevel(false, 'PRACTICALLY_VERIFIED').evidenceLevelAfter,
  ).toBe('SELF_DECLARED'));
it.each(['START_REVIEW', 'DECISION', 'RECUSE'] as const)(
  'rejects owner and unassigned %s actions',
  (kind) => {
    expect(
      verificationEventAllowed(kind, {
        owner: true,
        assigned: true,
        recused: false,
        hasDecision: false,
        withdrawn: false,
      }),
    ).toBe(false);
    expect(
      verificationEventAllowed(kind, {
        owner: false,
        assigned: false,
        recused: false,
        hasDecision: false,
        withdrawn: false,
      }),
    ).toBe(false);
  },
);
it('blocks recused and withdrawn reviews', () => {
  expect(
    verificationEventAllowed('DECISION', {
      owner: false,
      assigned: true,
      recused: true,
      hasDecision: false,
      withdrawn: false,
    }),
  ).toBe(false);
  expect(
    verificationEventAllowed('START_REVIEW', {
      owner: false,
      assigned: true,
      recused: false,
      hasDecision: false,
      withdrawn: true,
    }),
  ).toBe(false);
});
it('requires a decision before appeal and preserves history on reassessment', () => {
  expect(
    verificationEventAllowed('APPEAL', {
      owner: true,
      assigned: false,
      recused: false,
      hasDecision: false,
      withdrawn: false,
    }),
  ).toBe(false);
  expect(
    verificationEventAllowed('APPEAL', {
      owner: true,
      assigned: false,
      recused: false,
      hasDecision: true,
      withdrawn: false,
    }),
  ).toBe(true);
  expect(
    verificationEventAllowed('WITHDRAW', {
      owner: true,
      assigned: false,
      recused: false,
      hasDecision: true,
      withdrawn: false,
    }),
  ).toBe(false);
});
it('rejects client authority and malformed submission references', () => {
  const b = {
    commandId: randomUUID(),
    rubricVersionId: randomUUID(),
    summary: 'Synthetic own activity',
    activity: 'Software fixture',
    performedAt: '2026-01-01T00:00:00.000Z',
    locationType: 'Synthetic facility',
    process: 'IN_PERSON',
    declaration: true,
  };
  expect(verificationSubmissionSchema.safeParse(b).success).toBe(true);
  expect(
    verificationSubmissionSchema.safeParse({ ...b, candidateId: randomUUID() })
      .success,
  ).toBe(false);
  expect(
    verificationSubmissionSchema.safeParse({ ...b, rubricVersionId: 'invalid' })
      .success,
  ).toBe(false);
});
it('requires versioned structured criteria and explicit conflict clearance', () => {
  const b = {
    commandId: randomUUID(),
    expectedRevision: 0,
    kind: 'DECISION',
    reviewKind: 'PRIMARY',
    outcome: 'VERIFIED',
    findings: [],
    rationale: 'Synthetic review rationale',
    candidateExplanation: 'Synthetic candidate explanation',
    conflictDeclaredClear: true,
  };
  expect(verificationEventSchema.safeParse(b).success).toBe(true);
  expect(
    verificationEventSchema.safeParse({ ...b, assessorId: randomUUID() })
      .success,
  ).toBe(false);
  expect(
    verificationEventSchema.safeParse({ ...b, conflictDeclaredClear: false })
      .success,
  ).toBe(false);
});
