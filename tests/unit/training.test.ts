import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  learningSummary,
  learningTransition,
  trainingAvailable,
} from '../../packages/domain/src';
import {
  trainingCreateSchema,
  learningProgressSchema,
} from '../../packages/contracts/src';
const snapshot = () => ({
  code: 'DEMO_TRAINING',
  content: {
    title: 'Demo training',
    pathwayVersionIds: [randomUUID()],
    modules: [
      {
        code: 'MODULE_A',
        title: 'Demo module',
        lessons: [
          {
            code: 'LESSON_A',
            title: 'Demo lesson',
            body: 'DEMO: this text tests navigation, not clinical advice.',
          },
        ],
      },
    ],
  },
});
it('derives not-started, in-progress and completion without competence', () => {
  expect(learningSummary([])).toMatchObject({
    state: 'NOT_STARTED',
    competenceVerified: false,
  });
  expect(
    learningSummary([{ state: 'NOT_STARTED', completedAt: null }]).state,
  ).toBe('NOT_STARTED');
  expect(
    learningSummary([
      { state: 'COMPLETED', completedAt: '2026-01-01T00:00:00Z' },
      { state: 'NOT_STARTED', completedAt: null },
    ]).state,
  ).toBe('IN_PROGRESS');
  expect(
    learningSummary([
      { state: 'COMPLETED', completedAt: '2026-01-02T00:00:00Z' },
      { state: 'COMPLETED', completedAt: '2026-01-01T00:00:00Z' },
    ]),
  ).toMatchObject({
    state: 'COMPLETED',
    completedAt: '2026-01-02T00:00:00Z',
    competenceVerified: false,
  });
});
it('completion is absorbing while in-progress and completed participation remain distinct', () => {
  expect(learningTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
  expect(learningTransition('COMPLETED', 'COMPLETED')).toBe(true);
  expect(learningTransition('NOT_STARTED', 'IN_PROGRESS')).toBe(true);
  expect(learningTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
});
it('requires explicit demo release and blocks draft/retired/production availability', () => {
  expect(
    trainingAvailable({ status: 'DRAFT', demo: true, demoReleasedAt: 'now' }),
  ).toBe(true);
  for (const version of [
    { status: 'DRAFT', demo: true, demoReleasedAt: null },
    { status: 'RETIRED', demo: true, demoReleasedAt: 'now' },
    { status: 'APPROVED', demo: false, demoReleasedAt: 'now' },
  ])
    expect(trainingAvailable(version)).toBe(false);
});
it('validates bounded plain-text hierarchy and rejects invented authority or media', () => {
  const value = snapshot();
  expect(trainingCreateSchema.safeParse(value).success).toBe(true);
  for (const extra of [
    { demo: false },
    { status: 'APPROVED' },
    { authorId: randomUUID() },
    { passMark: 80 },
    { awardCompetence: true },
    { uploadUrl: 'https://example.test' },
  ])
    expect(
      trainingCreateSchema.safeParse({
        ...value,
        content: { ...value.content, ...extra },
      }).success,
    ).toBe(false);
  expect(
    trainingCreateSchema.safeParse({
      ...value,
      content: { ...value.content, modules: [] },
    }).success,
  ).toBe(false);
});
it('rejects duplicate identities and ambiguous competency mappings', () => {
  const value = snapshot();
  expect(
    trainingCreateSchema.safeParse({
      ...value,
      content: {
        ...value.content,
        modules: [...value.content.modules, ...value.content.modules],
      },
    }).success,
  ).toBe(false);
  expect(
    trainingCreateSchema.safeParse({
      ...value,
      content: {
        ...value.content,
        competencyMappings: [
          {
            pathwayVersionId: randomUUID(),
            childVersionId: randomUUID(),
            groupVersionId: randomUUID(),
          },
        ],
      },
    }).success,
  ).toBe(false);
});
it('accepts only bounded version-aware owner commands, never verification states', () => {
  const command = {
    commandId: randomUUID(),
    expectedRevision: 0,
    state: 'IN_PROGRESS',
    resumePosition: 0,
  };
  expect(learningProgressSchema.safeParse(command).success).toBe(true);
  for (const extra of [
    { candidateId: randomUUID() },
    { state: 'FIELD_READY' },
    { expectedRevision: -1 },
    { resumePosition: 0.5 },
    { competenceVerified: true },
  ])
    expect(
      learningProgressSchema.safeParse({ ...command, ...extra }).success,
    ).toBe(false);
});
