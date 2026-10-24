import { describe, it, expect } from 'vitest';
import {
  practicalCreateSchema,
  practicalSaveSchema,
  practicalSubmitSchema,
  practicalDecisionSchema,
} from '../../packages/contracts/src';
import {
  practicalGaps,
  type PracticalGapSource,
} from '../../packages/domain/src';
import { randomUUID } from 'node:crypto';
const target = { childVersionId: randomUUID(), facet: 'PRACTICALLY_VERIFIED' };
const source = (v: Partial<PracticalGapSource> = {}): PracticalGapSource => ({
  id: randomUUID(),
  submissionVersionId: randomUUID(),
  childVersionId: target.childVersionId,
  facet: target.facet,
  status: 'UNVERIFIED',
  demo: true,
  state: 'SUBMITTED',
  decision: null,
  validUntil: null,
  ...v,
});
const reasons = (s: PracticalGapSource[]) =>
  practicalGaps([target], s, Date.parse('2026-10-23T00:00:00Z'))[0]!.reasons;
describe('practical contracts', () => {
  it('accepts an empty partial draft with bounded fields', () =>
    expect(
      practicalSaveSchema.safeParse({
        commandId: randomUUID(),
        expectedRevision: 0,
        payload: { summary: '', context: { task: '' }, targets: [] },
      }).success,
    ).toBe(true));
  it('rejects duplicate targets, extra authority fields and oversized text', () => {
    const t = {
      childVersionId: target.childVersionId,
      requestedFacet: target.facet,
    };
    for (const payload of [
      { summary: '', context: { task: '' }, targets: [t, t] },
      { summary: 'x'.repeat(4001), context: { task: '' }, targets: [] },
    ])
      expect(
        practicalSaveSchema.safeParse({
          commandId: randomUUID(),
          expectedRevision: 0,
          payload,
        }).success,
      ).toBe(false);
    expect(
      practicalCreateSchema.safeParse({
        pathwayVersionId: randomUUID(),
        kind: 'SUPERVISED_TASK',
        demo: false,
      }).success,
    ).toBe(false);
  });
  it('requires affirmative declaration and independent-review acknowledgement', () => {
    expect(
      practicalSubmitSchema.safeParse({
        expectedRevision: 0,
        declaration: false,
      }).success,
    ).toBe(false);
    expect(
      practicalDecisionSchema.safeParse({
        outcome: 'VERIFIED',
        rationale: 'Synthetic review reason',
        conflictDeclaredClear: true,
      }).success,
    ).toBe(false);
    expect(
      practicalDecisionSchema.safeParse({
        outcome: 'REJECTED',
        rationale: 'Synthetic review reason',
        conflictDeclaredClear: false,
      }).success,
    ).toBe(false);
  });
});
describe('explainable proposed-facet gaps', () => {
  it('distinguishes missing evidence and absent professional configuration', () =>
    expect(reasons([])).toEqual([
      'EXPERT_REQUIREMENTS_NOT_CONFIGURED',
      'MISSING_EVIDENCE',
    ]));
  it('does not invent a practical requirement when no facet was proposed', () =>
    expect(
      practicalGaps([{ ...target, facet: 'NOT_CONFIGURED' }], [])[0]!.reasons,
    ).toEqual(['EXPERT_REQUIREMENTS_NOT_CONFIGURED']));
  it('keeps written case and practical facets independent', () =>
    expect(
      reasons([
        source({ facet: 'CASE_ASSESSED', status: 'VERIFIED', demo: false }),
      ]),
    ).toContain('INSUFFICIENT_VERIFICATION_LEVEL'));
  it('identifies pending review and drafts', () => {
    expect(reasons([source()])).toContain('PENDING_REVIEW');
    expect(reasons([source({ state: 'DRAFT' })])).toContain(
      'DRAFT_NOT_SUBMITTED',
    );
  });
  it.each([
    ['SUPERSEDED', 'SUPERSEDED_EVIDENCE'],
    ['REVOKED', 'REVOKED_EVIDENCE'],
    ['WITHDRAWN', 'WITHDRAWN_EVIDENCE'],
  ])('explains %s while preserving traceable identifiers', (state, reason) => {
    const s = source({ state });
    const gap = practicalGaps([target], [s])[0]!;
    expect(gap.reasons).toContain(reason);
    expect(gap.evidenceIds).toEqual([s.id]);
    expect(gap.submissionVersionIds).toEqual([s.submissionVersionId]);
    expect(gap.activeVerifiedEvidence).toEqual([]);
  });
  it('explains rejected, revision-requested and expired sources', () => {
    expect(reasons([source({ decision: 'REJECTED' })])).toContain(
      'REJECTED_EVIDENCE',
    );
    expect(reasons([source({ decision: 'NEEDS_REVISION' })])).toContain(
      'REVISION_REQUESTED',
    );
    expect(reasons([source({ validUntil: '2026-01-01T00:00:00Z' })])).toContain(
      'EXPIRED_EVIDENCE',
    );
  });
  it('never promotes a demonstration review to verified competence or readiness', () => {
    const g = practicalGaps(
      [target],
      [source({ state: 'REVIEWED', decision: 'DEMONSTRATED_IN_DEMO' })],
    )[0]!;
    expect(g.activeVerifiedEvidence).toEqual([]);
    expect(g.requirementsConfigured).toBe(false);
    expect(g.readiness).toBeNull();
  });
});
