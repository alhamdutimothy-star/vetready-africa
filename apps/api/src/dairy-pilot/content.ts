import type { reasoningCategories } from '@vetready/contracts';
/** PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION. This is response structure, not a scoring key. */
export const stageCategories: Record<
  string,
  readonly (typeof reasoningCategories)[number][]
> = {
  PROBLEM_RECOGNITION: [
    'observations',
    'interpretation',
    'priorities',
    'safety',
  ],
  INFORMATION_GATHERING: ['informationRequests', 'assumptions'],
  DIFFERENTIAL_ASSESSMENT: ['interpretation', 'priorities', 'safety'],
  EVIDENCE_INTERPRETATION: [
    'interpretation',
    'assumptions',
    'informationRequests',
  ],
  INVESTIGATION_PLAN: ['informationRequests', 'priorities', 'safety'],
  INTERVENTION: ['actions', 'priorities', 'safety', 'assumptions'],
  HERD_PREVENTION: ['actions', 'assumptions', 'safety'],
  MONITORING: ['monitoring', 'assumptions'],
  OUTCOME_EVALUATION: ['interpretation', 'monitoring', 'assumptions'],
  COMMUNICATION: [
    'observations',
    'interpretation',
    'actions',
    'monitoring',
    'safety',
  ],
};
export const suppliedEvidence = [
  {
    source: 'CASE_SUPPLIED',
    statement:
      'Fictional reporting week A: 70 lactating cows, 1,400 litres/day total milk.',
    limitation:
      'Record quality and comparability require investigation; this is not a production target.',
  },
  {
    source: 'CASE_SUPPLIED',
    statement:
      'Fictional reporting week B: 72 lactating cows, 1,150 litres/day total milk.',
    limitation:
      'Population changed; stage of lactation, parity and measurement methods are not supplied.',
  },
  {
    source: 'CASE_SUPPLIED',
    statement: 'Staff report more fresh-cow illness and reduced feed intake.',
    limitation:
      'No consistent case definitions, disease denominator or measured DMI are supplied.',
  },
  {
    source: 'CASE_SUPPLIED',
    statement: 'Water interruptions and hot conditions are reported.',
    limitation: 'Timing, measurements and causation are unconfirmed.',
  },
] as const;
export const assessorGuidance =
  'DRAFT — REQUIRES DOMAIN EXPERT VALIDATION. Judge only the submitted reasoning against this version-bound criterion and its mapped dimensions. Distinguish stated facts, assumptions and requested evidence. Record uncertainty and development needs; do not infer clinical diagnoses, practical ability, readiness or certification from this written demonstration.';
