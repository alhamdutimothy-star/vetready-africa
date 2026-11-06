import { z } from 'zod';
import { pilotDashboardSchema } from './dairy-pilot';
import { competencyProfileResponseSchema } from './competency-profile';
import { attemptsSchema } from './assessment';

/** Navigation only: no professional eligibility, scoring or evidence promotion. */
export function dairyJourney(
  dairy: z.infer<typeof pilotDashboardSchema>,
  profile: z.infer<typeof competencyProfileResponseSchema> | null,
  attempts: z.infer<typeof attemptsSchema>,
) {
  if (dairy.profileRequired) {
    return {
      available: false as const,
      next: {
        href: '/dashboard',
        label: 'Save your private candidate profile',
      },
    };
  }
  if (!profile) throw new Error('Current competency profile required');
  const competencies = profile.competencies.filter((c) =>
    c.pathwayVersionIds.includes(dairy.pathway.version_id),
  );
  const ids = new Set(competencies.map((c) => c.id));
  const verification = (profile.governedVerification ?? []).filter(
    (v) =>
      v.pathwayVersionId === dairy.pathway.version_id &&
      ids.has(v.childVersionId),
  );
  const effective = verification.filter((v) => v.verified);
  const effectiveEvidenceIds = new Set(effective.map((v) => v.evidenceId));
  const currentCompetencies = competencies.map((c) => ({
    ...c,
    facets: c.facets.map((f) => ({
      ...f,
      currentStatus: effective.some(
        (v) => v.childVersionId === c.id && v.facet === f.facet,
      )
        ? 'EFFECTIVELY_VERIFIED'
        : f.state,
    })),
  }));
  const evidence = profile.sources
    .filter(
      (s) =>
        s.kind !== 'LEARNING' &&
        s.pathwayVersionIds.includes(dairy.pathway.version_id),
    )
    .map((s) => ({
      ...s,
      currentStatus: effectiveEvidenceIds.has(s.id)
        ? 'EFFECTIVELY_VERIFIED'
        : s.disposition,
    }));
  const pendingEvidence = evidence.filter(
    (s) =>
      !effectiveEvidenceIds.has(s.id) &&
      (s.reviewPending || s.disposition === 'PENDING_REVIEW'),
  );
  const history = attempts.filter((a) => a.pathway === dairy.pathway.name);
  const gaps = competencies.filter((c) =>
    c.gaps.some(
      (g) =>
        g.pathwayVersionId === dairy.pathway.version_id && g.reasons.length > 0,
    ),
  );
  const next = !dairy.selected
    ? { href: '/dairy', label: 'Record your dairy pathway interest' }
    : !history.length
      ? {
          href: '/development?pathway=' + dairy.pathway.id,
          label: 'Explore the dairy baseline assessment',
        }
      : history.some((a) => a.status === 'IN_PROGRESS')
        ? {
            href: '/development?pathway=' + dairy.pathway.id,
            label: 'Resume your saved dairy assessment',
          }
        : {
            href: '/development/next-steps',
            label: 'Review your gaps and choose governed learning',
          };
  return {
    available: true as const,
    competencies: currentCompetencies,
    verification,
    evidence,
    pendingEvidence,
    effectiveCount: new Set(effective.map((v) => v.childVersionId)).size,
    gaps,
    history,
    next,
  };
}
