import type {
  ProfileInput,
  ProfileSource,
  ProfileFacet,
} from '@vetready/contracts';
import { PROFILE_ENGINE_VERSION } from '@vetready/contracts';
import { READINESS_STATES } from './cases';
export { PROFILE_ENGINE_VERSION };
export const PROFILE_NOTICE =
  'CLAIMED ≠ ASSESSED ≠ VERIFIED. Readiness determination unavailable pending approved configuration. No certification or licensing decision is made.';
export const PROFILE_FACETS: readonly ProfileFacet[] = [
  'SELF_DECLARED',
  'DOCUMENT_VERIFIED',
  'KNOWLEDGE_ASSESSED',
  'CASE_ASSESSED',
  'PRACTICALLY_VERIFIED',
  'SIMULATION_VERIFIED',
  'WORKPLACE_VERIFIED',
];
/** Stable JSON for digests, deterministic tests and immutable engine-1 receipts. */
export function profileCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value))
    return '[' + value.map(profileCanonicalJson).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => compare(a, b))
      .map(([k, v]) => JSON.stringify(k) + ':' + profileCanonicalJson(v))
      .join(',') +
    '}'
  );
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const unique = (v: readonly string[]) => [...new Set(v)].sort(compare);
export function normalizeProfileInput(input: ProfileInput): ProfileInput {
  return {
    ...input,
    pathways: [...input.pathways].sort((a, b) => compare(a.id, b.id)),
    groups: input.groups
      .map((g) => ({ ...g, pathwayVersionIds: unique(g.pathwayVersionIds) }))
      .sort((a, b) => compare(a.id, b.id)),
    competencies: input.competencies
      .map((c) => ({
        ...c,
        groupVersionIds: unique(c.groupVersionIds),
        pathwayVersionIds: unique(c.pathwayVersionIds),
      }))
      .sort((a, b) => compare(a.id, b.id)),
    requirements: input.requirements
      .map((r) => ({ ...r, facets: unique(r.facets) as ProfileFacet[] }))
      .sort((a, b) =>
        compare(
          a.pathwayVersionId + ':' + a.childVersionId,
          b.pathwayVersionId + ':' + b.childVersionId,
        ),
      ),
    sources: input.sources
      .map((s) => ({
        ...s,
        targets: [...s.targets].sort((a, b) =>
          compare(
            a.childVersionId + ':' + a.facet,
            b.childVersionId + ':' + b.facet,
          ),
        ),
        groupVersionIds: unique(s.groupVersionIds),
        pathwayVersionIds: unique(s.pathwayVersionIds),
      }))
      .sort((a, b) => compare(a.key, b.key)),
  };
}
export type ProfileDisposition =
  | 'VERIFIED'
  | 'ASSESSED'
  | 'CLAIMED'
  | 'PENDING_REVIEW'
  | 'DEMO_ONLY'
  | 'INACTIVE'
  | 'LEARNING_ONLY';
export function profileSourceDisposition(s: ProfileSource, asOf: string) {
  const reasons: string[] = [];
  for (const state of [
    'REVOKED',
    'SUPERSEDED',
    'WITHDRAWN',
    'REJECTED',
    'NEEDS_REVISION',
  ])
    if (
      s.lifecycle === state ||
      s.status === state ||
      s.decisionOutcome === state
    )
      reasons.push(
        state === 'NEEDS_REVISION' ? 'REVISION_REQUESTED' : state + '_EVIDENCE',
      );
  if (s.validUntil !== null) {
    const t = Date.parse(s.validUntil);
    if (!Number.isFinite(t)) reasons.push('INVALID_VALIDITY_RECORD');
    else if (t <= Date.parse(asOf)) reasons.push('EXPIRED_EVIDENCE');
  }
  if (s.demo) reasons.push('DEMONSTRATION_ONLY');
  if (s.reviewPending) reasons.push('VERIFICATION_PENDING');
  if (s.lifecycle === 'DRAFT') reasons.push('DRAFT_NOT_SUBMITTED');
  if (s.kind === 'LEGACY_GROUP')
    reasons.push(
      'GROUP_CLAIM_NOT_CHILD_VERIFICATION',
      'LEGACY_VERIFICATION_UNCONFIGURED',
    );
  if (s.kind === 'LEARNING') reasons.push('LEARNING_IS_NOT_COMPETENCE');
  const inactive = reasons.some(
    (r) =>
      ['_EVIDENCE', 'INVALID_VALIDITY_RECORD', 'REVISION_REQUESTED'].some((x) =>
        r.endsWith(x),
      ) && r !== 'GROUP_CLAIM_NOT_CHILD_VERIFICATION',
  );
  let disposition: ProfileDisposition;
  if (inactive || s.lifecycle === 'DRAFT') disposition = 'INACTIVE';
  else if (s.kind === 'LEARNING') disposition = 'LEARNING_ONLY';
  else if (s.demo) disposition = 'DEMO_ONLY';
  else if (
    s.status === 'VERIFIED' &&
    s.verificationSupported &&
    s.kind !== 'LEGACY_GROUP' &&
    ['CORRECT', 'DEMONSTRATED'].includes(s.observation ?? '')
  )
    disposition = 'VERIFIED';
  else if (s.kind === 'ASSESSMENT') disposition = 'ASSESSED';
  else if (s.reviewPending) disposition = 'PENDING_REVIEW';
  else disposition = 'CLAIMED';
  if (s.status === 'VERIFIED' && disposition !== 'VERIFIED')
    reasons.push('VERIFICATION_NOT_ESTABLISHED');
  if (disposition === 'ASSESSED')
    reasons.push('ASSESSMENT_IS_NOT_VERIFICATION');
  return {
    disposition,
    reasons: unique(reasons),
    effective: !['INACTIVE', 'DEMO_ONLY'].includes(disposition),
  };
}
/** Version 1 is preserved for historical replay. Facets never confer one another. */
export function aggregateCompetencyProfile(raw: ProfileInput) {
  if (
    raw.engineVersion !== PROFILE_ENGINE_VERSION ||
    !Number.isFinite(Date.parse(raw.evaluatedAt))
  )
    throw Error('Unsupported profile engine or evaluation time');
  const input = normalizeProfileInput(raw);
  const sources = input.sources.map((s) => ({
    ...s,
    ...profileSourceDisposition(s, input.evaluatedAt),
  }));
  const priority: Record<ProfileDisposition, number> = {
    VERIFIED: 0,
    ASSESSED: 1,
    CLAIMED: 2,
    PENDING_REVIEW: 3,
    LEARNING_ONLY: 4,
    DEMO_ONLY: 5,
    INACTIVE: 6,
  };
  const ordered = (ss: typeof sources) =>
    [...ss].sort(
      (a, b) =>
        priority[a.disposition] - priority[b.disposition] ||
        compare(b.decisionAt ?? b.recordedAt, a.decisionAt ?? a.recordedAt) ||
        compare(a.key, b.key),
    );
  const competencies = input.competencies.map((c) => {
    const related = sources.filter((s) =>
      s.targets.some((t) => t.childVersionId === c.id),
    );
    const facets = PROFILE_FACETS.map((facet) => {
      const matches = ordered(
        related.filter((s) =>
          s.targets.some((t) => t.childVersionId === c.id && t.facet === facet),
        ),
      );
      const effective = matches.filter(
        (s) => s.effective && s.kind !== 'LEARNING',
      );
      // A requested practical/document facet remains pending/claimed until actually verified.
      const state =
        effective[0]?.disposition ?? matches[0]?.disposition ?? 'NO_EVIDENCE';
      return {
        facet,
        state,
        sourceKeys: matches.map((s) => s.key),
        effectiveSourceKeys: effective.map((s) => s.key),
        selectedSourceKey: effective[0]?.key ?? null,
      };
    });
    const required = input.requirements.filter(
      (r) => r.childVersionId === c.id,
    );
    const gaps = c.pathwayVersionIds.map((pathwayVersionId) => {
      const r = required.find((x) => x.pathwayVersionId === pathwayVersionId);
      const reasons = ['EXPERT_REQUIREMENTS_NOT_CONFIGURED'];
      if (!r?.facets.length) reasons.push('REQUIREMENT_NOT_CONFIGURED');
      if (!related.length) reasons.push('MISSING_EVIDENCE');
      else if (!related.some((s) => s.effective && s.kind !== 'LEARNING'))
        reasons.push('NO_CURRENT_EFFECTIVE_EVIDENCE');
      if (related.some((s) => s.reviewPending))
        reasons.push('VERIFICATION_PENDING');
      if (
        related.some(
          (s) =>
            s.pathwayVersionIds.length > 0 &&
            !s.pathwayVersionIds.includes(pathwayVersionId),
        )
      )
        reasons.push('PATHWAY_CONTEXT_NOT_EVALUATED');
      const unmetFacets = (r?.facets ?? []).filter(
        (f) =>
          !facets
            .find((x) => x.facet === f)
            ?.effectiveSourceKeys.some(
              (k) =>
                sources.find((s) => s.key === k)?.disposition === 'VERIFIED',
            ),
      );
      if (unmetFacets.length) reasons.push('REQUIRED_FACET_NOT_VERIFIED');
      reasons.push(...related.flatMap((s) => s.reasons));
      return {
        pathwayVersionId,
        configurationStatus: 'UNCONFIGURED' as const,
        requirementValidationStatus: r?.validationStatus ?? null,
        proposedFacets: r?.facets ?? [],
        unverifiedFacets: unmetFacets,
        reasons: unique(reasons),
        sourceKeys: related.map((s) => s.key),
        determination: null,
      };
    });
    const verified = facets.filter((f) => f.state === 'VERIFIED');
    // Requested five-band presentation order only; this never implies professional equivalence.
    const five = PROFILE_FACETS.slice(0, 5);
    const highestVerifiedFacet =
      [...five].reverse().find((f) => verified.some((v) => v.facet === f)) ??
      null;
    return {
      ...c,
      facets,
      highestVerifiedFacet,
      learningSourceKeys: related
        .filter((s) => s.kind === 'LEARNING')
        .map((s) => s.key),
      groupSupportingSourceKeys: sources
        .filter((s) =>
          s.groupVersionIds.some((g) => c.groupVersionIds.includes(g)),
        )
        .map((s) => s.key),
      gaps,
    };
  });
  return {
    engineVersion: PROFILE_ENGINE_VERSION,
    evaluatedAt: input.evaluatedAt,
    notice: PROFILE_NOTICE,
    configurationStatus: 'UNCONFIGURED' as const,
    readiness: {
      status: 'UNAVAILABLE' as const,
      determination: null,
      reason: 'REQUIRES_DOMAIN_EXPERT_VALIDATION' as const,
      certification: null,
      licensing: null,
      reservedStates: [...READINESS_STATES],
    },
    pathways: input.pathways,
    groups: input.groups,
    competencies,
    sources,
    groupEvidence: input.groups.map((g) => ({
      groupVersionId: g.id,
      sourceKeys: sources
        .filter((s) => s.groupVersionIds.includes(g.id))
        .map((s) => s.key),
    })),
    sharingEnabled: false as const,
  };
}
export type CompetencyProfile = ReturnType<typeof aggregateCompetencyProfile>;
/** Explicit allowlist. No private narrative, reviewer identity or internal review records. */
export function skillsPassport(profile: CompetencyProfile) {
  return {
    engineVersion: profile.engineVersion,
    evaluatedAt: profile.evaluatedAt,
    notice: profile.notice,
    configurationStatus: profile.configurationStatus,
    readiness: {
      status: profile.readiness.status,
      determination: null,
      reason: profile.readiness.reason,
      certification: null,
      licensing: null,
      reservedStates: [...profile.readiness.reservedStates],
    },
    sharingEnabled: false as const,
    pathways: profile.pathways.map((p) => ({
      id: p.id,
      pathwayId: p.pathwayId,
      code: p.code,
      name: p.name,
      version: p.version,
      status: p.status,
    })),
    groups: profile.groups.map((g) => ({
      id: g.id,
      code: g.code,
      name: g.name,
      pathwayVersionIds: [...g.pathwayVersionIds],
    })),
    competencies: profile.competencies.map((c) => ({
      id: c.id,
      code: c.code,
      statement: c.statement,
      version: c.version,
      validationStatus: c.validationStatus,
      groupVersionIds: [...c.groupVersionIds],
      pathwayVersionIds: [...c.pathwayVersionIds],
      highestVerifiedFacet: c.highestVerifiedFacet,
      learningSourceKeys: [...c.learningSourceKeys],
      groupSupportingSourceKeys: [...c.groupSupportingSourceKeys],
      facets: c.facets.map((f) => ({
        facet: f.facet,
        state: f.state,
        sourceKeys: [...f.sourceKeys],
        effectiveSourceKeys: [...f.effectiveSourceKeys],
        selectedSourceKey: f.selectedSourceKey,
      })),
      gaps: c.gaps.map((g) => ({
        pathwayVersionId: g.pathwayVersionId,
        configurationStatus: g.configurationStatus,
        requirementValidationStatus: g.requirementValidationStatus,
        proposedFacets: [...g.proposedFacets],
        unverifiedFacets: [...g.unverifiedFacets],
        reasons: [...g.reasons],
        sourceKeys: [...g.sourceKeys],
        determination: null,
      })),
    })),
    groupEvidence: profile.groupEvidence.map((g) => ({
      groupVersionId: g.groupVersionId,
      sourceKeys: [...g.sourceKeys],
    })),
    sources: profile.sources.map((s) => ({
      key: s.key,
      id: s.id,
      kind: s.kind,
      targets: s.targets.map((t) => ({
        childVersionId: t.childVersionId,
        facet: t.facet,
      })),
      groupVersionIds: s.groupVersionIds,
      pathwayVersionIds: s.pathwayVersionIds,
      groupFacet: s.groupFacet,
      status: s.status,
      lifecycle: s.lifecycle,
      demo: s.demo,
      sourceVersionId: s.sourceVersionId,
      sourceVersion: s.sourceVersion,
      recordedAt: s.recordedAt,
      decisionAt: s.decisionAt,
      validUntil: s.validUntil,
      disposition: s.disposition,
      effective: s.effective,
      reasons: s.reasons,
      reviewerRecorded: s.reviewerRef !== null,
      completedLessons: s.completedLessons,
      totalLessons: s.totalLessons,
    })),
  };
}
