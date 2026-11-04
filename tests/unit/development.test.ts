import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  aggregateCompetencyProfile,
  developmentWorkflow,
  developmentProgress,
  developmentFollowUps,
} from '@vetready/domain';
import {
  developmentCommandSchema,
  type DevelopmentMapping,
} from '@vetready/contracts';
import { profileFixture } from '../helpers/profile-facts';
function fixture() {
  const input = profileFixture();
  const p = aggregateCompetencyProfile(input);
  const path = p.pathways[0]!.id;
  const child = p.competencies[0]!;
  const m: DevelopmentMapping = {
    mappingId: randomUUID(),
    courseVersionId: randomUUID(),
    pathwayVersionId: path,
    childVersionId: child.id,
    groupVersionId: null,
    title: 'Synthetic governed demo',
  };
  return { p, path, child, m };
}
it('creates ordered development needs from authoritative profile facts without configuring requirements', () => {
  const { p, path } = fixture();
  const i = developmentWorkflow(p, path, [])[0]!;
  expect(i).toMatchObject({
    order: 1,
    policyStatus: 'UNCONFIGURED',
    requirement: 'NOT_CONFIGURED',
    evidenceState: 'UNKNOWN',
    recommendations: [],
  });
});

function scopedFixture() {
  const { p, path, m } = fixture();
  const a = developmentWorkflow(p, path, [m])[0]!;
  const otherMapping = randomUUID(),
    course = m.courseVersionId,
    moduleA = randomUUID(),
    moduleB = randomUUID();
  const b = {
    ...a,
    childVersionId: randomUUID(),
    code: 'SYNTHETIC_B',
    order: 2,
    recommendations: [
      {
        ...m,
        mappingId: otherMapping,
        childVersionId: null,
        groupVersionId: randomUUID(),
      },
    ],
  };
  const scopes = [
    { mappingId: m.mappingId, moduleVersionId: moduleA, lessonVersionId: null },
    {
      mappingId: otherMapping,
      moduleVersionId: moduleB,
      lessonVersionId: null,
    },
  ];
  const links = [
    {
      assessmentLinkId: randomUUID(),
      id: randomUUID(),
      title: 'Assessment A',
      demo: true,
      moduleVersionId: moduleA,
      lessonVersionId: null,
    },
    {
      assessmentLinkId: randomUUID(),
      id: randomUUID(),
      title: 'Assessment B',
      demo: true,
      moduleVersionId: moduleB,
      lessonVersionId: null,
    },
  ];
  return { items: [a, b], course, scopes, links };
}
it('preserves A/module A/assessment A and B/module B/assessment B within one shared course', () => {
  const f = scopedFixture(),
    r = developmentFollowUps(f.items, f.course, f.scopes, f.links);
  expect(r.competencyFollowUps[0]!.followUps.map((a) => a.id)).toEqual([
    f.links[0]!.id,
  ]);
  expect(r.competencyFollowUps[1]!.followUps.map((a) => a.id)).toEqual([
    f.links[1]!.id,
  ]);
  expect(r.courseLevelFollowUps).toEqual([]);
});
it('keeps a genuinely course-level assessment once and outside competency-specific lists', () => {
  const f = scopedFixture(),
    link = { ...f.links[0]!, moduleVersionId: null, lessonVersionId: null };
  const r = developmentFollowUps(f.items, f.course, f.scopes, [link]);
  expect(r.courseLevelFollowUps).toHaveLength(1);
  expect(r.courseLevelFollowUps[0]).toMatchObject({
    id: link.id,
    scope: 'COURSE',
    mappingIds: [],
  });
  expect(r.competencyFollowUps.every((i) => i.followUps.length === 0)).toBe(
    true,
  );
});
it('separates mixed course-wide and competency-specific follow-ups', () => {
  const f = scopedFixture(),
    link = {
      ...f.links[0]!,
      id: randomUUID(),
      assessmentLinkId: randomUUID(),
      moduleVersionId: null,
      lessonVersionId: null,
    };
  const r = developmentFollowUps(f.items, f.course, f.scopes, [
    ...f.links,
    link,
  ]);
  expect(r.courseLevelFollowUps.map((a) => a.id)).toEqual([link.id]);
  expect(r.competencyFollowUps[0]!.followUps.map((a) => a.id)).toEqual([
    f.links[0]!.id,
  ]);
});
it('does not infer a module-specific assessment from only shared course membership', () => {
  const f = scopedFixture();
  const scopes = f.scopes.map((m) => ({ ...m, moduleVersionId: null }));
  expect(
    developmentFollowUps(
      f.items,
      f.course,
      scopes,
      f.links,
    ).competencyFollowUps.every((i) => !i.followUps.length),
  ).toBe(true);
});
it('requires an exact lesson reference for lesson-specific follow-up and rejects ambiguous module-only mapping', () => {
  const f = scopedFixture(),
    lesson = randomUUID(),
    link = { ...f.links[0]!, lessonVersionId: lesson };
  expect(
    developmentFollowUps(f.items, f.course, f.scopes, [link])
      .competencyFollowUps[0]!.followUps,
  ).toEqual([]);
  const scopes = [{ ...f.scopes[0]!, lessonVersionId: lesson }, f.scopes[1]!];
  expect(
    developmentFollowUps(f.items, f.course, scopes, [
      link,
    ]).competencyFollowUps[0]!.followUps.map((a) => a.id),
  ).toEqual([link.id]);
  scopes[0] = { ...scopes[0]!, lessonVersionId: randomUUID() };
  expect(
    developmentFollowUps(f.items, f.course, scopes, [link])
      .competencyFollowUps[0]!.followUps,
  ).toEqual([]);
});
it('does not duplicate an assessment with an explicit course-wide association beneath competencies', () => {
  const f = scopedFixture(),
    link = {
      ...f.links[0]!,
      assessmentLinkId: randomUUID(),
      moduleVersionId: null,
      lessonVersionId: null,
    };
  const r = developmentFollowUps(f.items, f.course, f.scopes, [
    f.links[0]!,
    link,
    link,
  ]);
  expect(r.courseLevelFollowUps).toHaveLength(1);
  expect(r.competencyFollowUps.every((i) => !i.followUps.length)).toBe(true);
});
it('keeps unavailable follow-ups empty and retains UNKNOWN/UNCONFIGURED without mutating receipts', () => {
  const f = scopedFixture(),
    before = JSON.stringify(f.items);
  const r = developmentFollowUps(f.items, f.course, [], f.links);
  expect(r.competencyFollowUps.every((i) => !i.followUps.length)).toBe(true);
  expect(r.courseLevelFollowUps).toEqual([]);
  expect(
    f.items.every(
      (i) => i.evidenceState === 'UNKNOWN' && i.policyStatus === 'UNCONFIGURED',
    ),
  ).toBe(true);
  expect(JSON.stringify(f.items)).toBe(before);
});
it('uses explicit exact child mappings', () => {
  const { p, path, m } = fixture();
  expect(developmentWorkflow(p, path, [m])[0]!.recommendations).toEqual([m]);
});
it('permits an explicit shared-group relationship in the same pathway context', () => {
  const { p, path, child, m } = fixture();
  const group = {
    ...m,
    childVersionId: null,
    groupVersionId: child.groupVersionIds[0]!,
  };
  expect(developmentWorkflow(p, path, [group])[0]!.recommendations).toEqual([
    group,
  ]);
});
it('does not infer mappings from identical titles', () => {
  const { p, path, m } = fixture();
  expect(
    developmentWorkflow(p, path, [
      {
        ...m,
        childVersionId: randomUUID(),
        title: p.competencies[0]!.statement,
      },
    ])[0]!.recommendations,
  ).toEqual([]);
});
it('does not borrow mappings from another pathway', () => {
  const { p, path, m } = fixture();
  expect(
    developmentWorkflow(p, path, [{ ...m, pathwayVersionId: randomUUID() }])[0]!
      .recommendations,
  ).toEqual([]);
});
it('retains an explicit unknown/unconfigured state when requirements are absent', () => {
  const input = profileFixture();
  input.requirements = [];
  const p = aggregateCompetencyProfile(input);
  expect(developmentWorkflow(p, p.pathways[0]!.id, [])[0]).toMatchObject({
    policyStatus: 'UNCONFIGURED',
    evidenceState: 'UNKNOWN',
    proposedFacets: [],
  });
});
it('rejects an unrelated pathway instead of fabricating a plan', () => {
  const { p } = fixture();
  expect(() => developmentWorkflow(p, randomUUID(), [])).toThrow(
    'Current pathway',
  );
});
it('preserves historical profile inputs', () => {
  const { p, path, m } = fixture();
  const before = JSON.stringify(p);
  developmentWorkflow(p, path, [m]);
  expect(JSON.stringify(p)).toBe(before);
});
it.each([
  [0, 0, false, 'NOT_STARTED'],
  [2, 1, true, 'IN_PROGRESS'],
  [2, 2, true, 'LEARNING_COMPLETED'],
] as const)(
  'keeps progress %s/%s separate from gap resolution',
  (total, completed, started, state) => {
    expect(developmentProgress(total, completed, started)).toMatchObject({
      state,
      gapResolved: false,
      followUp: 'SEPARATE_ASSESSMENT_OR_VERIFICATION_REQUIRED',
    });
  },
);
it('rejects impersonation and professional-policy overrides in plan commands', () => {
  expect(
    developmentCommandSchema.safeParse({
      commandId: randomUUID(),
      pathwayVersionId: randomUUID(),
      candidateId: randomUUID(),
      policyStatus: 'APPROVED',
    }).success,
  ).toBe(false);
});
