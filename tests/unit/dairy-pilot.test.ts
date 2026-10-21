import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  pilotResponseSchema,
  pilotReviewDraftSchema,
  pilotFinalizeSchema,
} from '@vetready/contracts';
import {
  stageCategories,
  suppliedEvidence,
} from '../../apps/api/src/dairy-pilot/content';
import { transitionFreshCowTemplate } from '../../apps/api/src/cases/transition-fresh-cow.content';
it('reuses the existing ten case stages with explicit reasoning categories and separate supplied evidence', () => {
  expect(Object.keys(stageCategories)).toEqual(
    transitionFreshCowTemplate.steps.map((s) => s.code),
  );
  expect(
    suppliedEvidence.every(
      (e) => e.source === 'CASE_SUPPLIED' && e.limitation.length > 0,
    ),
  ).toBe(true);
});
it('rejects facts, model answers and numerical awards in candidate reasoning', () => {
  for (const key of [
    'facts',
    'modelAnswer',
    'score',
    'passMark',
    'practicallyVerified',
  ])
    expect(
      pilotResponseSchema.safeParse({
        expectedRevision: 0,
        reasoning: { [key]: 'Pretended authority' },
      }).success,
    ).toBe(false);
  expect(
    pilotResponseSchema.safeParse({
      expectedRevision: 0,
      reasoning: {
        observations: 'Reported finding',
        interpretation: 'Unconfirmed hypothesis',
        assumptions: 'Data are incomplete',
      },
    }).success,
  ).toBe(true);
});
it('requires a nonblank response and explicit technical concurrency version', () => {
  expect(
    pilotResponseSchema.safeParse({ reasoning: { observations: 'Finding' } })
      .success,
  ).toBe(false);
  expect(
    pilotResponseSchema.safeParse({
      expectedRevision: 0,
      reasoning: { observations: '   ' },
    }).success,
  ).toBe(false);
  expect(
    pilotResponseSchema.safeParse({
      expectedRevision: -1,
      reasoning: { observations: 'Finding' },
    }).success,
  ).toBe(false);
});
it('supports incomplete private review snapshots without inventing a pass mark', () => {
  expect(
    pilotReviewDraftSchema.safeParse({
      expectedRevision: 0,
      decision: 'MORE_EVIDENCE_REQUIRED',
      feedback: '',
      observations: [
        { rubricCriterionId: randomUUID(), observation: null, comment: '' },
      ],
    }).success,
  ).toBe(true);
  for (const decision of ['PASS', 'FIELD_READY', 'CERTIFIED'])
    expect(
      pilotReviewDraftSchema.safeParse({
        expectedRevision: 0,
        decision,
        feedback: 'Example feedback',
        observations: [],
      }).success,
    ).toBe(false);
});
it('rejects duplicate criteria, unknown judgments and excessive review transfer payloads', () => {
  const o = {
    rubricCriterionId: randomUUID(),
    observation: 'DEMONSTRATED',
    comment: 'Test observation',
  };
  const base = {
    expectedRevision: 0,
    decision: 'DEVELOPMENT_FEEDBACK',
    feedback: 'Review feedback',
    observations: [o],
  };
  expect(
    pilotReviewDraftSchema.safeParse({ ...base, observations: [o, o] }).success,
  ).toBe(false);
  expect(
    pilotReviewDraftSchema.safeParse({
      ...base,
      observations: [{ ...o, observation: 'JOB_READY' }],
    }).success,
  ).toBe(false);
  expect(
    pilotReviewDraftSchema.safeParse({
      ...base,
      feedback: 'x'.repeat(6000),
      observations: Array.from({ length: 3 }, () => ({
        ...o,
        rubricCriterionId: randomUUID(),
        comment: 'x'.repeat(2000),
      })),
    }).success,
  ).toBe(false);
});
it('finalizes only an explicit saved review revision and rejects award flags', () => {
  expect(pilotFinalizeSchema.safeParse({ expectedRevision: 1 }).success).toBe(
    true,
  );
  expect(pilotFinalizeSchema.safeParse({ expectedRevision: 0 }).success).toBe(
    false,
  );
  expect(
    pilotFinalizeSchema.safeParse({ expectedRevision: 1, verified: true })
      .success,
  ).toBe(false);
});
