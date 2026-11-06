# Phase 3K — Commercial Dairy Practice candidate journey

Baseline: Phase 3J commit `82b6fb18a788ef84c29ff11c43eca6eb8958325f`, tag `phase-3j-governed-verification`.

## Existing capability map

Profile and pathway interest: `/dashboard`; baseline assessment and diagnostic gaps: `/development`; governed gap-linked learning: `/development/next-steps`; dairy case and learning: `/dairy` and `/dairy/learning`; private practical accounts: `/practical`; independent governed review: `/verifications`; current evidence and historical receipts: `/competencies`; private Passport: `/skills-passport`.

Reuse these routes, owner-scoped APIs, schema validation, authentication/session transport, forms, revision controls and authority-chain projection unchanged. No migration or new professional policy is needed.

## Integration gaps and implementation

Add `/dairy/journey` as a server-rendered, no-store candidate overview. Read the existing dairy dashboard, assessment attempt list and competency profile; filter to the dairy pathway/version. Derive navigation and counts without persisting another read model. Link existing profile and dairy entry points to it and provide a shared main-navigation return link. Show assessment/case history, learning progress, proposed gaps, evidence facets, effective governed verification, candidate-safe review outcomes, explicit unavailable readiness and a next navigation action. Missing or invalid data must show unavailable rather than successful completion or zero verified evidence.

The overview must not fetch private assessor narratives, render source observations or tokens, combine case/knowledge/learning outcomes into practical verification, or infer readiness. Existing detailed forms retain saved drafts, revisions and retry behavior; the overview makes no writes and adds no client-side JavaScript dependency. Use existing responsive styles and text-first hierarchy.

## Governance decisions

No professional definitions, assessor qualifications, thresholds, weights, certification or licensing policy are supplied by this phase. Existing approved governance alone controls effective verification. Requirement and readiness configuration remains visibly UNCONFIGURED. Do not label demo assessment outcomes as professional verification. No expansion to other pathways, employer features or deployment.

## Validation

Add pure-summary unit regressions and built candidate-journey coverage using the existing real API/database/web fixture. Cover missing profile, unavailable data, owner-only access, separate evidence facets, ineffective/revoked claims, absence of readiness and private material, existing workflow links and case/learning progress. Run lint, formatting, strict types, builds, all tests, migration integrity, dependency gate and leakage/whitespace checks. Preserve the Phase 3J baseline; do not commit/tag/push before independent review.
