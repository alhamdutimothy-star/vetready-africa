import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { caseBlueprintSchema, caseDimensions } from '@vetready/contracts';
import { evidenceDisposition, READINESS_STATES } from '@vetready/domain';
import { transitionFreshCowTemplate as template } from '../../apps/api/src/cases/transition-fresh-cow.content';
const input = () => ({
  code: 'DEMO_CASE',
  pathwayVersionId: randomUUID(),
  title: template.title,
  scenario: template.scenario,
  templateReference: template.templateReference,
  sourceReferences: [],
  steps: [
    {
      code: 'RECOGNIZE',
      title: 'Problem recognition',
      prompt: 'Identify reported and confirmed problems.',
      groupVersionId: randomUUID(),
      childVersionId: randomUUID(),
      criteria: [
        { criterionId: randomUUID(), dimensions: ['CLINICAL_REASONING'] },
      ],
    },
  ],
});
it('keeps all ten reasoning stages, thirteen dimensions and the professional proposal explicit', () => {
  expect(template.steps).toHaveLength(10);
  expect(new Set(template.steps.flatMap((s) => [...s.dimensions]))).toEqual(
    new Set(caseDimensions),
  );
  expect(template.validationNotice).toBe(
    'PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION',
  );
  expect(template.demo).toBe(true);
  expect(template.status).toBe('DRAFT');
  expect(template.reviewer).toBeNull();
  expect(template.sourceReferences).toEqual([]);
});
it('accepts version-bound mappings without adding score or verification fields', () => {
  expect(caseBlueprintSchema.safeParse(input()).success).toBe(true);
  for (const property of [
    'passMark',
    'weight',
    'readinessPercentage',
    'approved',
    'practicallyVerified',
  ])
    expect(
      caseBlueprintSchema.safeParse({ ...input(), [property]: true }).success,
    ).toBe(false);
});
it('rejects duplicate stages, duplicate rubric targets and unknown dimensions', () => {
  const i = input();
  expect(
    caseBlueprintSchema.safeParse({ ...i, steps: [i.steps[0], i.steps[0]] })
      .success,
  ).toBe(false);
  const s = i.steps[0]!;
  expect(
    caseBlueprintSchema.safeParse({
      ...i,
      steps: [{ ...s, criteria: [s.criteria[0], s.criteria[0]] }],
    }).success,
  ).toBe(false);
  expect(
    caseBlueprintSchema.safeParse({
      ...i,
      steps: [
        { ...s, criteria: [{ ...s.criteria[0], dimensions: ['UNKNOWN'] }] },
      ],
    }).success,
  ).toBe(false);
  expect(
    caseBlueprintSchema.safeParse({
      ...i,
      steps: [
        {
          ...s,
          criteria: [
            {
              ...s.criteria[0],
              dimensions: ['CLINICAL_REASONING', 'CLINICAL_REASONING'],
            },
          ],
        },
      ],
    }).success,
  ).toBe(false);
});
it('rejects unsupported authority assertions, insecure references and oversized item identities', () => {
  const i = input();
  expect(
    caseBlueprintSchema.safeParse({
      ...i,
      sourceReferences: [
        {
          title: 'Unreviewed source',
          url: 'http://example.org',
          status: 'UNREVIEWED',
        },
      ],
    }).success,
  ).toBe(false);
  expect(
    caseBlueprintSchema.safeParse({
      ...i,
      sourceReferences: [{ title: 'Claimed approval', status: 'APPROVED' }],
    }).success,
  ).toBe(false);
  expect(
    caseBlueprintSchema.safeParse({
      ...i,
      code: 'A'.repeat(60),
      steps: [{ ...i.steps[0], code: 'B'.repeat(40) }],
    }).success,
  ).toBe(false);
});
describe('private evidence disposition is not readiness or a new verification decision', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const base = {
    facet: 'CASE_ASSESSED',
    status: 'VERIFIED',
    demo: false,
    observation: 'DEMONSTRATED',
    validUntil: null,
  };
  it('does not elevate demo or unverified case evidence', () => {
    expect(evidenceDisposition({ ...base, demo: true }, now)).toBe('DEMO_ONLY');
    expect(evidenceDisposition({ ...base, status: 'UNVERIFIED' }, now)).toBe(
      'UNVERIFIED',
    );
    expect(
      evidenceDisposition({ ...base, observation: 'UNASSESSABLE' }, now),
    ).toBe('UNVERIFIED');
    expect(evidenceDisposition({ ...base, facet: 'UNKNOWN' }, now)).toBe(
      'UNVERIFIED',
    );
    expect(base.facet).toBe('CASE_ASSESSED');
  });
  it('preserves revocation/rejection and honors only explicitly recorded expiry', () => {
    expect(evidenceDisposition({ ...base, status: 'REVOKED' }, now)).toBe(
      'REVOKED',
    );
    expect(evidenceDisposition({ ...base, status: 'REJECTED' }, now)).toBe(
      'REJECTED',
    );
    expect(
      evidenceDisposition({ ...base, validUntil: now.toISOString() }, now),
    ).toBe('EXPIRED');
    expect(evidenceDisposition({ ...base, validUntil: 'invalid' }, now)).toBe(
      'EXPIRED',
    );
    expect(evidenceDisposition(base, now)).toBe('VERIFIED_EVIDENCE');
  });
  it('retains the nine readiness names without calculating or activating a rule', () => {
    expect(READINESS_STATES).toHaveLength(9);
    expect(READINESS_STATES).toContain('JOB_READY');
    expect(READINESS_STATES).toContain('FIELD_READY');
  });
});
