import { describe, it, expect } from 'vitest';
import {
  gradeObjective,
  competencyGaps,
  developmentActivities,
  type GapRequirement,
  type GapEvidence,
} from '@vetready/domain';
import { responseSchema, itemCreateSchema } from '@vetready/contracts';
const requirement: GapRequirement = {
  childVersionId: 'child-1',
  code: 'BCS',
  statement: 'Observed body condition assessment',
  facets: ['KNOWLEDGE_ASSESSED', 'PRACTICALLY_VERIFIED'],
  validationStatus: 'PROPOSED',
  mandatory: null,
};
const evidence: GapEvidence = {
  id: 'e-1',
  childVersionId: 'child-1',
  facet: 'KNOWLEDGE_ASSESSED',
  status: 'VERIFIED',
  demo: false,
  observation: 'CORRECT',
  validUntil: null,
};
const now = new Date('2026-10-07T00:00:00Z');
describe('assessment objective outcomes', () => {
  it.each([
    {
      type: 'SINGLE_MCQ',
      answerKey: { selected: ['a'] },
      response: { selected: ['a'] },
      expected: 'CORRECT',
    },
    {
      type: 'SINGLE_MCQ',
      answerKey: { selected: ['a'] },
      response: { selected: ['b'] },
      expected: 'INCORRECT',
    },
    {
      type: 'MULTIPLE_RESPONSE',
      answerKey: { selected: ['a', 'c'] },
      response: { selected: ['c', 'a'] },
      expected: 'CORRECT',
    },
    {
      type: 'MULTIPLE_RESPONSE',
      answerKey: { selected: ['a', 'c'] },
      response: { selected: ['a'] },
      expected: 'INCORRECT',
    },
    {
      type: 'NUMERICAL',
      answerKey: { value: 24, tolerance: 0.1 },
      response: { value: 24.05 },
      expected: 'CORRECT',
    },
    {
      type: 'NUMERICAL',
      answerKey: { value: 24, tolerance: 0.1 },
      response: { value: 25 },
      expected: 'INCORRECT',
    },
    {
      type: 'CASE',
      answerKey: null,
      response: { text: 'reasoning' },
      expected: 'REQUIRES_REVIEW',
    },
  ])('grades $type as $expected', ({ type, answerKey, response, expected }) =>
    expect(gradeObjective({ type, answerKey }, response)).toBe(expected),
  );
  it('refuses multiple response fields and verification mass assignment', () => {
    expect(responseSchema.safeParse({ text: 'a', value: 1 }).success).toBe(
      false,
    );
    expect(
      responseSchema.safeParse({ text: 'a', verified: true }).success,
    ).toBe(false);
    expect(responseSchema.safeParse({ value: Infinity }).success).toBe(false);
  });
  it('objective items cannot masquerade as practical evidence', () => {
    expect(
      itemCreateSchema.safeParse({
        code: 'TEST_MCQ',
        version: 1,
        type: 'SINGLE_MCQ',
        prompt: 'Select one test option',
        presentation: {
          options: [
            { id: 'a', text: 'A' },
            { id: 'b', text: 'B' },
          ],
        },
        answerKey: { selected: ['a'] },
        method: 'PRACTICAL',
        difficulty: 'INTRODUCTORY',
        evidenceType: 'PRACTICALLY_VERIFIED',
        groupVersionId: '00000000-0000-4000-8000-000000000001',
        childVersionId: '00000000-0000-4000-8000-000000000002',
        criterionIds: ['00000000-0000-4000-8000-000000000003'],
      }).success,
    ).toBe(false);
  });
});
describe('traceable evidence gaps', () => {
  it('no evidence means unverified, not failed', () => {
    const g = competencyGaps([requirement], [], now)[0]!;
    expect(g.state).toBe('UNVERIFIED');
    expect(g.missingMandatoryEvidence).toBeNull();
    expect(g.missingFacets).toEqual(requirement.facets);
  });
  it('knowledge never closes a practical gap', () => {
    const g = competencyGaps([requirement], [evidence], now)[0]!;
    expect(g.state).toBe('PARTIALLY_DEMONSTRATED');
    expect(g.missingFacets).toEqual(['PRACTICALLY_VERIFIED']);
  });
  it.each(['REJECTED', 'REVOKED', 'UNVERIFIED'])(
    '%s evidence is not a verified strength',
    (status) =>
      expect(
        competencyGaps([requirement], [{ ...evidence, status }], now)[0]!.state,
      ).toBe('UNVERIFIED'),
  );
  it('demo evidence cannot close live gaps', () =>
    expect(
      competencyGaps([requirement], [{ ...evidence, demo: true }], now)[0]!
        .verifiedEvidenceIds,
    ).toEqual([]));
  it('expired evidence is excluded', () =>
    expect(
      competencyGaps(
        [requirement],
        [{ ...evidence, validUntil: '2026-10-06T00:00:00Z' }],
        now,
      )[0]!.state,
    ).toBe('UNVERIFIED'));
  it('simulation is distinct from supervised practical evidence', () =>
    expect(
      competencyGaps(
        [requirement],
        [{ ...evidence, facet: 'SIMULATION_VERIFIED' }],
        now,
      )[0]!.missingFacets,
    ).toContain('PRACTICALLY_VERIFIED'));
  it('development activities point to specific gaps without scores', () => {
    const gaps = competencyGaps([requirement], [evidence], now);
    expect(developmentActivities(gaps)).toEqual([
      {
        childVersionId: 'child-1',
        code: 'BCS',
        gap: 'PRACTICALLY_VERIFIED',
        validationStatus: 'PROPOSED',
        activity:
          'Arrange a supervised assessment in the relevant field context after rubric validation',
      },
    ]);
  });
  it('approved mandatory gaps remain explicit', () =>
    expect(
      competencyGaps(
        [{ ...requirement, validationStatus: 'APPROVED', mandatory: true }],
        [evidence],
        now,
      )[0]!.missingMandatoryEvidence,
    ).toBe(true));
  it('knowledge-only approved evidence can demonstrate its own facet', () =>
    expect(
      competencyGaps(
        [
          {
            ...requirement,
            facets: ['KNOWLEDGE_ASSESSED'],
            validationStatus: 'APPROVED',
            mandatory: true,
          },
        ],
        [evidence],
        now,
      )[0]!.state,
    ).toBe('DEMONSTRATED'));
});
