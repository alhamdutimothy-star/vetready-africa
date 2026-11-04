import type {
  DevelopmentItem,
  DevelopmentMapping,
  DevelopmentMappingScope,
  DevelopmentAssessmentLink,
} from '@vetready/contracts';
import type { CompetencyProfile } from './competency-profile';
/** Engine 1: development navigation only. Order is lexical, never professional priority. */
export function developmentWorkflow(
  profile: CompetencyProfile,
  pathway: string,
  mappings: readonly DevelopmentMapping[],
): DevelopmentItem[] {
  if (!profile.pathways.some((p) => p.id === pathway && p.status !== 'RETIRED'))
    throw Error('Current pathway version required');
  return profile.competencies
    .filter((c) => c.pathwayVersionIds.includes(pathway))
    .sort((a, b) =>
      a.code < b.code ? -1 : a.code > b.code ? 1 : a.id < b.id ? -1 : 1,
    )
    .map((c, n) => {
      const gap = c.gaps.find((g) => g.pathwayVersionId === pathway)!;
      const recommendations = mappings
        .filter(
          (m) =>
            m.pathwayVersionId === pathway &&
            (m.childVersionId === c.id ||
              (m.groupVersionId !== null &&
                c.groupVersionIds.includes(m.groupVersionId))),
        )
        .sort((a, b) =>
          a.mappingId < b.mappingId ? -1 : a.mappingId > b.mappingId ? 1 : 0,
        );
      return {
        childVersionId: c.id,
        code: c.code,
        statement: c.statement,
        order: n + 1,
        policyStatus: 'UNCONFIGURED',
        requirement: 'NOT_CONFIGURED',
        evidenceState: c.facets.some((f) => f.effectiveSourceKeys.length)
          ? 'PRESENT'
          : 'UNKNOWN',
        sourceKeys: gap.sourceKeys,
        reasons: gap.reasons,
        proposedFacets: gap.proposedFacets,
        unverifiedFacets: gap.unverifiedFacets,
        recommendations,
      };
    });
}
export function developmentProgress(
  total: number,
  completed: number,
  started: boolean,
) {
  return {
    state:
      total > 0 && completed === total
        ? 'LEARNING_COMPLETED'
        : started
          ? 'IN_PROGRESS'
          : 'NOT_STARTED',
    totalLessons: total,
    completedLessons: completed,
    gapResolved: false as const,
    followUp: 'SEPARATE_ASSESSMENT_OR_VERIFICATION_REQUIRED' as const,
  };
}

/** Applicability comes from explicit scope references, never shared course membership. */
export function developmentFollowUps(
  items: readonly DevelopmentItem[],
  courseVersionId: string,
  mappings: readonly DevelopmentMappingScope[],
  links: readonly DevelopmentAssessmentLink[],
) {
  const unique = (ids: string[]) => [...new Set(ids)].sort();
  const courseLinks = links.filter(
    (l) => l.moduleVersionId === null && l.lessonVersionId === null,
  );
  const courseIds = new Set(courseLinks.map((l) => l.id));
  const courseLevelFollowUps = [...courseIds].sort().map((id) => {
    const matches = courseLinks.filter((l) => l.id === id),
      first = matches[0]!;
    return {
      id,
      title: first.title,
      demo: first.demo,
      scope: 'COURSE' as const,
      assessmentLinkIds: unique(matches.map((l) => l.assessmentLinkId)),
      mappingIds: [] as string[],
    };
  });
  const competencyFollowUps = items
    .filter((i) =>
      i.recommendations.some((r) => r.courseVersionId === courseVersionId),
    )
    .map((item) => {
      const allowed = new Set(
        item.recommendations
          .filter((r) => r.courseVersionId === courseVersionId)
          .map((r) => r.mappingId),
      );
      const scoped = mappings.filter(
        (m) => allowed.has(m.mappingId) && m.moduleVersionId !== null,
      );
      const matches = links
        .filter((l) => !courseIds.has(l.id) && l.moduleVersionId !== null)
        .flatMap((link) => {
          const applicable = scoped.filter(
            (m) =>
              m.moduleVersionId === link.moduleVersionId &&
              (link.lessonVersionId === null ||
                (m.lessonVersionId !== null &&
                  m.lessonVersionId === link.lessonVersionId)),
          );
          return applicable.length
            ? [{ link, mappingIds: applicable.map((m) => m.mappingId) }]
            : [];
        });
      const followUps = unique(matches.map((m) => m.link.id)).map((id) => {
        const rows = matches.filter((m) => m.link.id === id),
          first = rows[0]!.link;
        return {
          id,
          title: first.title,
          demo: first.demo,
          scope: 'COMPETENCY_MAPPING' as const,
          assessmentLinkIds: unique(rows.map((r) => r.link.assessmentLinkId)),
          mappingIds: unique(rows.flatMap((r) => r.mappingIds)),
        };
      });
      return {
        childVersionId: item.childVersionId,
        courseVersionId,
        followUps,
      };
    });
  return { courseLevelFollowUps, competencyFollowUps };
}
