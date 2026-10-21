/** Training participation is not an assessment outcome or competence claim. */
export const TRAINING_NOTICE =
  'DEMO CONTENT — NOT YET APPROVED FOR PRODUCTION TRAINING. PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION. Completion is not competence verification.';
export type LearningState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export function learningSummary(
  items: readonly { state: LearningState; completedAt: string | null }[],
) {
  const completedLessons = items.filter(
    (item) => item.state === 'COMPLETED',
  ).length;
  const state: LearningState =
    items.length > 0 && completedLessons === items.length
      ? 'COMPLETED'
      : items.some((item) => item.state !== 'NOT_STARTED')
        ? 'IN_PROGRESS'
        : 'NOT_STARTED';
  return {
    state,
    totalLessons: items.length,
    completedLessons,
    completedAt:
      state === 'COMPLETED'
        ? (items
            .map((item) => item.completedAt)
            .filter((date): date is string => date !== null)
            .sort()
            .at(-1) ?? null)
        : null,
    competenceVerified: false as const,
  };
}
export function learningTransition(
  current: LearningState,
  next: Exclude<LearningState, 'NOT_STARTED'>,
): boolean {
  return current !== 'COMPLETED' || next === 'COMPLETED';
}
/** New versions never inherit completion implicitly. Retired versions retain read-only history. */
export function trainingAvailable(version: {
  status: string;
  demo: boolean;
  demoReleasedAt: string | null;
}): boolean {
  return (
    version.demo &&
    version.status === 'DRAFT' &&
    version.demoReleasedAt !== null
  );
}
