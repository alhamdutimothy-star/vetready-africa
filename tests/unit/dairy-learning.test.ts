import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  dairyActivitySchema,
  dairySourceSchema,
  dairyCurriculumSchema,
} from '@vetready/contracts';
import { dairyDomains } from '../../apps/api/src/dairy-learning/domains';
it('represents 17 proposed domain outlines without duplicating assessable children', () => {
  expect(dairyDomains).toHaveLength(17);
  expect(new Set(dairyDomains.map((d) => d.code)).size).toBe(17);
  expect(
    dairyDomains.every((d) => d.childCodes.length && d.topics.length),
  ).toBe(true);
  expect(dairyDomains[3]!.childCodes).toContain('DAIRY_TRANSITION_AUDIT');
});
it('activity input rejects award fields, excessive text and invalid revisions', () => {
  const b = {
    commandId: randomUUID(),
    expectedRevision: 0,
    response: 'A reasoned reflection',
  };
  expect(dairyActivitySchema.parse(b)).toEqual(b);
  expect(
    dairyActivitySchema.safeParse({ ...b, competenceVerified: true }).success,
  ).toBe(false);
  expect(
    dairyActivitySchema.safeParse({ ...b, response: 'x'.repeat(4001) }).success,
  ).toBe(false);
  expect(
    dairyActivitySchema.safeParse({ ...b, expectedRevision: -1 }).success,
  ).toBe(false);
});
it('source model preserves unknown publication metadata and rejects unsafe URLs', () => {
  const s = {
    title: 'Reference lead',
    organization: 'Publisher',
    publication: 'Not reviewed',
    year: null,
    identifier: 'PENDING',
    evidenceType: 'Reference discovery lead',
    geographicRelevance: 'Requires local validation',
    reviewerId: null,
    reviewDate: null,
    notes: 'Not claim support',
    superseded: false,
  };
  expect(dairySourceSchema.parse(s).year).toBeNull();
  expect(
    dairySourceSchema.safeParse({ ...s, url: 'javascript:alert(1)' }).success,
  ).toBe(false);
});
it('curriculum requires metadata for every lesson and rejects duplicate domain identities', () => {
  const id = randomUUID();
  const b = {
    training: {
      code: 'DEMO_TEST',
      content: {
        title: 'Synthetic learning',
        pathwayVersionIds: [id],
        modules: [
          {
            code: 'TEST',
            title: 'Test module',
            lessons: [
              {
                code: 'TEST',
                title: 'Test lesson',
                body: 'Original draft content',
              },
            ],
          },
        ],
      },
    },
    domains: [
      {
        code: 'TEST',
        title: 'Domain',
        topics: ['Topic'],
        childVersionIds: [id],
      },
    ],
    units: [],
  };
  expect(dairyCurriculumSchema.safeParse(b).success).toBe(false);
});
