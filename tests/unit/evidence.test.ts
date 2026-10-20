import { describe, expect, it } from 'vitest';
import {
  SUBMISSION_STATES,
  submissionTransition,
  canCreateSubmissionRevision,
  practicalVerificationBlockers,
  scopeMatches,
  competencyGaps,
} from '../../packages/domain/src';
import {
  submissionDraftSchema,
  submissionTransitionSchema,
} from '../../packages/contracts/src';
import { randomUUID } from 'node:crypto';

const owner = 'owner';
describe('Phase 3A lifecycle', () => {
  it('allows only owner submit/resubmit/withdraw and fails every other state pair closed', () => {
    for (const version of [1, 2])
      for (const from of SUBMISSION_STATES)
        for (const to of SUBMISSION_STATES) {
          const expected =
            (from === 'DRAFT' &&
              (to === 'WITHDRAWN' ||
                to === (version === 1 ? 'SUBMITTED' : 'RESUBMITTED'))) ||
            (['SUBMITTED', 'RESUBMITTED'].includes(from) && to === 'WITHDRAWN');
          expect(
            submissionTransition({
              from,
              to,
              version,
              actorId: owner,
              ownerUserId: owner,
            }).allowed,
          ).toBe(expected);
          expect(
            submissionTransition({
              from,
              to,
              version,
              actorId: 'other',
              ownerUserId: owner,
            }).allowed,
          ).toBe(false);
        }
  });
  it('requires a withdrawn snapshot before creating a revision', () => {
    for (const state of SUBMISSION_STATES)
      expect(canCreateSubmissionRevision(state)).toBe(state === 'WITHDRAWN');
    expect(
      submissionTransition({
        from: 'DRAFT',
        to: 'SUBMITTED',
        version: 0,
        actorId: owner,
        ownerUserId: owner,
      }).allowed,
    ).toBe(false);
  });
});
describe('assessor scaffolding', () => {
  const scope = {
    pathwayVersionId: 'p',
    childVersionId: 'c',
    method: 'PRACTICAL' as const,
    contextKind: 'TASK',
    status: 'PROPOSED' as const,
  };
  it('requires exact pathway, child, method and context matches', () => {
    expect(scopeMatches(scope, scope)).toBe(true);
    for (const target of [
      { ...scope, pathwayVersionId: 'other' },
      { ...scope, childVersionId: 'other' },
      { ...scope, method: 'CASE' as const },
      { ...scope, contextKind: 'other' },
    ])
      expect(scopeMatches(scope, target)).toBe(false);
  });
  it('cannot award authority from role, scope proposal or self-review', () => {
    const blockers = practicalVerificationBlockers({
      assessorUserId: owner,
      candidateUserId: owner,
      hasPlatformCapability: false,
      assigned: false,
      eligibilityActive: false,
      conflictDeclaredClear: false,
      approvedScopeMatches: false,
      rubricVersionId: null,
      policyVersionId: null,
    });
    expect(blockers).toContain('SELF_REVIEW');
    expect(blockers).toHaveLength(9);
    expect(
      practicalVerificationBlockers({
        assessorUserId: 'assessor',
        candidateUserId: owner,
        hasPlatformCapability: true,
        assigned: true,
        eligibilityActive: true,
        conflictDeclaredClear: true,
        approvedScopeMatches: true,
        rubricVersionId: 'rubric',
        policyVersionId: 'policy',
      }),
    ).toEqual(['REVIEW_WORKFLOW_NOT_ENABLED']);
  });
});
describe('private foundation contracts', () => {
  const draft = () => ({
    pathwayVersionId: randomUUID(),
    kind: 'CANDIDATE_REPORT',
    summary: 'Synthetic investigation report',
    context: { task: 'Synthetic layer production investigation' },
    targets: [
      { childVersionId: randomUUID(), requestedFacet: 'PRACTICALLY_VERIFIED' },
    ],
  });
  it('accepts a proposed target without treating its facet name as verification', () => {
    expect(submissionDraftSchema.safeParse(draft()).success).toBe(true);
  });
  it('rejects client authority, upload URLs, duplicate targets, empty mapping and unbounded context', () => {
    const value = draft();
    for (const bad of [
      { ...value, candidateId: randomUUID() },
      { ...value, status: 'VERIFIED' },
      { ...value, demo: false },
      { ...value, publicUrl: 'https://example.test' },
      { ...value, targets: [] },
      { ...value, targets: [value.targets[0], value.targets[0]] },
      { ...value, context: { task: 'x', approved: true } },
    ])
      expect(submissionDraftSchema.safeParse(bad).success).toBe(false);
    expect(
      submissionTransitionSchema.safeParse({
        expectedState: 'SUBMITTED',
        to: 'VERIFIED',
        reason: 'Pretend approval',
      }).success,
    ).toBe(false);
  });
  it('does not close a gap with a self-declared practical target or with no evidence', () => {
    const requirement = {
      childVersionId: 'c',
      code: 'c',
      statement: 'Proposed task',
      facets: ['PRACTICALLY_VERIFIED' as const],
      validationStatus: 'PROPOSED' as const,
      mandatory: null,
    };
    const receipt = {
      id: 'e',
      childVersionId: 'c',
      facet: 'PRACTICALLY_VERIFIED' as const,
      status: 'UNVERIFIED',
      demo: false,
      observation: 'REQUIRES_REVIEW',
      validUntil: null,
    };
    const without = competencyGaps([requirement], [], new Date());
    const withReceipt = competencyGaps([requirement], [receipt], new Date());
    expect(withReceipt[0]?.missingFacets).toEqual(without[0]?.missingFacets);
    expect(withReceipt[0]?.state).not.toBe('DEMONSTRATED');
  });
});
