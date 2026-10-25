import { randomUUID } from 'node:crypto';
import {
  PROFILE_ENGINE_VERSION,
  type ProfileInput,
  type ProfileSource,
} from '../../packages/contracts/src';
export function profileFixture(): ProfileInput {
  const group = randomUUID(),
    child = randomUUID(),
    p = randomUUID(),
    second = randomUUID();
  return {
    engineVersion: PROFILE_ENGINE_VERSION,
    evaluatedAt: '2026-10-25T12:00:00.000Z',
    pathways: [
      {
        id: p,
        pathwayId: randomUUID(),
        code: 'SYNTHETIC_A',
        name: 'Synthetic pathway A',
        version: 1,
        status: 'DRAFT',
      },
      {
        id: second,
        pathwayId: randomUUID(),
        code: 'SYNTHETIC_B',
        name: 'Synthetic pathway B',
        version: 1,
        status: 'DRAFT',
      },
    ],
    groups: [
      {
        id: group,
        code: 'SYNTHETIC_GROUP',
        name: 'Synthetic shared group',
        pathwayVersionIds: [p, second],
      },
    ],
    competencies: [
      {
        id: child,
        code: 'SYNTHETIC_CHILD',
        statement: 'Synthetic test definition; not a veterinary standard',
        version: 1,
        validationStatus: 'PROPOSED',
        groupVersionIds: [group],
        pathwayVersionIds: [p, second],
      },
    ],
    requirements: [
      {
        pathwayVersionId: p,
        childVersionId: child,
        facets: ['KNOWLEDGE_ASSESSED', 'PRACTICALLY_VERIFIED'],
        mandatory: null,
        validationStatus: 'PROPOSED',
      },
    ],
    sources: [],
  };
}
export function profileSource(
  input: ProfileInput,
  overrides: Partial<ProfileSource> = {},
): ProfileSource {
  const id = randomUUID();
  return {
    key: 'evidence:' + id,
    id,
    kind: 'ASSESSMENT',
    targets: [
      {
        childVersionId: input.competencies[0]!.id,
        facet: 'KNOWLEDGE_ASSESSED',
      },
    ],
    groupVersionIds: [],
    pathwayVersionIds: [input.pathways[0]!.id],
    groupFacet: null,
    status: 'VERIFIED',
    lifecycle: null,
    demo: false,
    observation: 'CORRECT',
    sourceVersionId: randomUUID(),
    sourceVersion: 1,
    lineageId: null,
    decisionId: randomUUID(),
    decisionOutcome: 'VERIFIED',
    decisionAt: '2026-10-20T10:00:00.000Z',
    reviewerRef: randomUUID(),
    recordedAt: '2026-10-19T10:00:00.000Z',
    validUntil: null,
    verificationSupported: true,
    reviewPending: false,
    completedLessons: null,
    totalLessons: null,
    ...overrides,
  };
}
