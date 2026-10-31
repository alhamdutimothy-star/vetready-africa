import type {
  MatchingInput,
  MatchingFacts,
  JobContent,
} from '@vetready/contracts';
import { matchingInputSchema, PILOT_NOTICE } from '@vetready/contracts';
import type { CompetencyProfile } from './competency-profile';
export const DOMAIN_REQUIRED = 'REQUIRES DOMAIN EXPERT VALIDATION' as const;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Independent categories, not ordered levels. Professional gates are never activated here. */
export function evaluatePilotMatch(raw: MatchingInput) {
  const input = matchingInputSchema.parse(raw);
  const gates = [...input.requirements]
    .sort((a, b) => compare(a.id, b.id))
    .map((r) => {
      let outcome: 'MET' | 'NOT_MET' | 'UNKNOWN' | 'UNCONFIGURED';
      let reason: string;
      let sources: string[] = [];
      if (r.kind === 'COMPETENCY_FACET') {
        const fact = input.facts.facets.find(
          (f) => f.childVersionId === r.childVersionId && f.facet === r.facet,
        );
        sources = fact?.sources.map((s) => s.ref) ?? [];
        outcome = 'UNCONFIGURED';
        reason = DOMAIN_REQUIRED;
      } else if (r.kind === 'PATHWAY_INTEREST') {
        outcome = input.facts.pathwayInterest ? 'MET' : 'NOT_MET';
        reason = input.facts.pathwayInterest
          ? 'DECLARED_INTEREST_RECORDED'
          : 'DECLARED_INTEREST_NOT_RECORDED';
      } else {
        outcome = !input.facts.state
          ? 'UNKNOWN'
          : input.facts.state.trim().toLowerCase() ===
                r.state.trim().toLowerCase() ||
              (r.acceptRelocation && input.facts.willingToRelocate)
            ? 'MET'
            : 'NOT_MET';
        reason =
          outcome === 'UNKNOWN'
            ? 'DECLARATION_UNAVAILABLE'
            : outcome === 'MET'
              ? 'LOCATION_DECLARATION_MATCH'
              : 'LOCATION_DECLARATION_DIFFERS';
      }
      return {
        requirementId: r.id,
        kind: r.kind,
        mandatory: r.mandatory,
        outcome,
        reason,
        sourceRefs: sources.sort(),
      };
    });
  const mandatory = gates.filter((g) => g.mandatory);
  const eligibility =
    mandatory.length === 0 ||
    mandatory.some((g) => g.outcome === 'UNCONFIGURED')
      ? 'UNCONFIGURED'
      : mandatory.some((g) => g.outcome === 'UNKNOWN')
        ? 'UNKNOWN'
        : mandatory.some((g) => g.outcome === 'NOT_MET')
          ? 'NOT_ELIGIBLE'
          : 'ELIGIBLE';
  return {
    engineVersion: input.engineVersion,
    policyVersion: input.policyVersion,
    jobVersionId: input.jobVersionId,
    scope: 'DECLARED_TECHNICAL_CONDITIONS_ONLY' as const,
    notice: PILOT_NOTICE,
    eligibility,
    gates,
    fit: {
      status: 'UNCONFIGURED' as const,
      score: null,
      weights: null,
      reason: DOMAIN_REQUIRED,
    },
    professionalReadiness: 'UNAVAILABLE' as const,
    certification: null,
    licensing: null,
  };
}
/** Explicit input allowlist; source aliases have meaning only within this application. */
export function pilotMatchingFacts(
  profile: CompetencyProfile,
  content: JobContent,
  candidate: {
    state: string;
    willingToRelocate: boolean;
    pathwayInterest: boolean;
  },
): MatchingFacts {
  const facets = content.requirements
    .filter((r) => r.kind === 'COMPETENCY_FACET')
    .map((r) => {
      const c = profile.competencies.find((c) => c.id === r.childVersionId),
        f = c?.facets.find((f) => f.facet === r.facet);
      const keys = f?.effectiveSourceKeys ?? [];
      return {
        childVersionId: r.childVersionId,
        facet: r.facet,
        state: f?.state ?? 'NO_EVIDENCE',
        sources: profile.sources
          .filter((s) => keys.includes(s.key) && s.disposition === 'VERIFIED')
          .map((s) => ({
            ref: s.key,
            kind: s.kind,
            sourceVersionId: s.sourceVersionId,
            sourceVersion: s.sourceVersion,
            pathwayVersionIds: [...s.pathwayVersionIds].sort(),
            recordedAt: s.recordedAt,
            validUntil: s.validUntil,
          }))
          .sort((a, b) => compare(a.ref, b.ref)),
      };
    })
    .sort((a, b) =>
      compare(
        a.childVersionId + ':' + a.facet,
        b.childVersionId + ':' + b.facet,
      ),
    );
  const location = content.requirements.some(
    (r) => r.kind === 'LOCATION_DECLARATION',
  );
  return {
    pathwayInterest:
      content.requirements.some((r) => r.kind === 'PATHWAY_INTEREST') &&
      candidate.pathwayInterest,
    state: location ? candidate.state : '',
    willingToRelocate: location && candidate.willingToRelocate,
    facets,
  };
}
export function employerPilotProjection(
  alias: string,
  input: MatchingInput,
  result: ReturnType<typeof evaluatePilotMatch>,
) {
  return {
    candidateAlias: alias,
    notice: PILOT_NOTICE,
    jobVersionId: input.jobVersionId,
    eligibility: result.eligibility,
    scope: result.scope,
    requirements: result.gates.map((g) => ({
      requirementId: g.requirementId,
      kind: g.kind,
      mandatory: g.mandatory,
      outcome: g.outcome,
      reason: g.reason,
    })),
    competencies: input.facts.facets.map((f) => ({
      childVersionId: f.childVersionId,
      facet: f.facet,
      state: ['VERIFIED', 'ASSESSED', 'CLAIMED'].includes(f.state)
        ? f.state
        : 'NOT_ESTABLISHED',
      pathwayContext: 'NOT_PROFESSIONALLY_VALIDATED',
      provenance: f.sources.map((s, i) => ({
        reference: alias + ':' + f.childVersionId + ':' + f.facet + ':' + i,
        kind: s.kind,
        sourceVersion: s.sourceVersion,
        recordedAt: s.recordedAt,
      })),
    })),
    fit: { status: 'UNCONFIGURED', score: null },
    professionalReadiness: 'UNAVAILABLE',
    certification: null,
    licensing: null,
  };
}
