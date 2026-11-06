# Phase 3K — Commercial Dairy Practice candidate journey

## Scope and baseline

Phase 3J remains recoverable at commit `82b6fb18a788ef84c29ff11c43eca6eb8958325f`, tag `phase-3j-governed-verification`. Phase 3K has not been committed, tagged, pushed, merged or deployed. It is ready for independent acceptance review, not an independently accepted checkpoint.

## Implemented journey

`/dashboard` links to `/dairy/journey`, a private, server-rendered overview of the existing Commercial Dairy Practice workflow. Main navigation and the dairy workspace provide a return link. The overview connects profile/pathway selection, baseline assessment, diagnostic gaps, governed learning, dairy cases, private practical accounts, independent verification, current competency profile and private Skills Passport.

The page reads the existing owner-scoped dairy dashboard, assessment-attempt list and competency-profile APIs using the unchanged server-only session transport. It introduces no write endpoint, persistent read model, schema migration or new dependency. Existing forms retain their draft/revision, declaration, audit and retry behavior. Server-rendered text and existing responsive styles avoid a new client-side state system; connection failures show unavailable information and a retry link instead of inferred progress.

The summary filters competencies and governed verification to the current dairy pathway version. Assessment history is scoped by the existing attempt API's pathway name and can include earlier dairy versions; it is history, not a current professional eligibility determination. Facet rows explicitly describe the existing competency-wide read model, while only the current dairy authority-chain projection contributes to the effective governed-verification count. The page does not render evidence narratives, raw source objects, private assessor notes, bearer tokens or session handles.

## Professional and access boundaries

Self-declaration, document verification, knowledge assessment, case assessment and practical verification remain distinct facets. Learning completion, demo cases and unverified accounts cannot create effective professional verification. Historical VERIFIED decisions whose current projection is ineffective are shown as not currently effective. The dashboard makes no review decisions and provides no new authority to candidates. Existing independent-review, revocation, expiry, recusal and audit-history protections remain authoritative.

Readiness remains explicitly unavailable because expert-approved professional thresholds are unconfigured. No veterinary standards, weights, pass marks, assessor qualifications, Job Ready/Field Ready determination, certification or licensing rules were invented. Existing approved governance records are still required for real effective professional verification. Employer features and the other pathways were not expanded.

## Exact file inventory

| File                                    | Change                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/web/app/dairy/journey/page.tsx`   | Private dairy overview, status visibility, workflow links and unavailable-data handling.                |
| `apps/web/lib/dairy-journey.ts`         | Pure pathway-scoped navigation and read-model summary; no professional determination.                   |
| `apps/web/app/dashboard/page.tsx`       | Candidate entry link to the journey.                                                                    |
| `apps/web/app/dairy/page.tsx`           | Return link from existing dairy activities.                                                             |
| `apps/web/app/layout.tsx`               | Main-navigation return link.                                                                            |
| `tests/unit/dairy-journey.test.ts`      | Twelve summary/governance-boundary/navigation and pending/effective reconciliation cases.               |
| `tests/unit/dairy-journey-page.test.ts` | Five connection, malformed-data and authorization rendering cases.                                      |
| `tests/integration/dairy-pilot.test.ts` | One owner-scoped real-API composition/privacy regression; old assertions retained.                      |
| `tests/e2e/dairy-pilot.test.ts`         | Two built journey/privacy cases; existing positive governed-verification case also checks the overview. |
| `docs/PHASE3K_PLAN.md`                  | Capability map, integration plan and governance boundaries.                                             |
| `docs/PHASE3K_COMPLETION.md`            | Implementation, validation and review handoff.                                                          |

No migrations, API implementation, authentication/session/OIDC implementation, rate-limit settings, scoring engine, package declarations or lockfile changed. Existing read-only UI composition requires no new architectural subsystem or governance policy.

## Validation

The complete post-remediation standard pipeline passed with frozen implementation/test files and normal settings: **605/605 tests across 40 files**, comprising **270 unit, 315 integration and 20 end-to-end tests**. There were **0 failed, 0 skipped, 0 TODO, 0 setup/hook failures and 0 unexecuted tests**. Test runtime was 588.35 seconds. Phase 3K now adds **20 tests: 17 unit, one integration and two end-to-end**, including four new focused reconciliation regressions. The focused post-remediation unit run passed **17/17** before the single fresh complete pipeline.

Groups in the same complete run: foundation **17/17**, authentication/session/OIDC diagnostics **59/59**, verification/authority-chain **85/85**, dairy integration **24/24**, recruitment integration **28/28**, built dairy journey **16/16**, and sign-in end-to-end **4/4**. The new cases cover missing profile, unavailable/malformed data, explicit readiness absence, training/claims not conferring verification, pathway isolation, anonymous access, another candidate's isolation and exclusion of private material. Existing authority-chain and real production rate-limiter regressions remain passing.

The dependency high-severity gate, ESLint, formatting, strict TypeScript across all projects, foundation builds and fresh production build passed. Audit found **0 high, 0 critical and 10 existing moderate tooling findings**; dependencies and the gate were not changed. Fresh database setup, populated upgrade regressions and rerun integrity passed through **18 ordered migrations with zero checksum mismatches**. No upgrade database remained. All **303 captured files** matched their frozen hashes after the run; this completion record was reconciled afterward as documentation only.

Final Git whitespace validation passed. Credential/private-file scanning of **299 repository files** found no credential patterns or private/generated/temporary paths; private configuration was unchanged. The owned validation containers and temporary build backup were removed; reports, including failed targeted evidence, were preserved outside the repository. Final state: branch `feat/phase-3-training-verification`, unchanged Phase 3J HEAD/tag, ahead/behind **0/0**, **0 staged, 5 modified tracked and 6 untracked files**. The final documentation formatting check passed; no acceptance or Git-history operation was performed afterward.

Historical targeted evidence is retained separately: the focused unit run passed **13/13** after correcting a test cleanup hook that accidentally returned the mock function. A subsequent targeted build/run passed **37 tests** but hit the existing 30-second dairy setup limit, leaving **16 unexecuted**. That attempt was not represented as passing. No timeout, hook, concurrency or application behavior was changed to accommodate it. The original implementation's later complete run passed **601/601**, but independent review subsequently reproduced the pending/effective contradiction below. That independent acceptance run was stopped for remediation rather than represented as complete. Current validation is the single fresh **605/605** post-remediation run, not a combination of separate successful suites.

## Targeted pending/effective status remediation

The immutable profile receipt can remain SUBMITTED with `reviewPending: true` after its separate governed verification decision is effective. The original journey counted that legacy flag directly, displaying the same evidence as both awaiting review and effectively verified.

The summary now derives a set of evidence IDs from the current pathway-scoped governed projection where `verified` is true. Those evidence IDs are excluded from pending counts. Evidence rows and the corresponding competency/facet presentation derive their current effective label from that same projection; historical receipt state is labelled separately. Derived objects are copies: source receipt fields, facet history and database records are not rewritten. Matching uses evidence ID, so another pending item for the same competency remains pending. A historical VERIFIED outcome or another pathway's authority does not suppress pending evidence.

The exact schema-validated reproduction now returns **effectiveCount: 1, pendingEvidenceCount: 0, sameEvidenceCountedBoth: false**, while the source disposition remains PENDING_REVIEW and its lifecycle remains SUBMITTED. Four unit regressions cover undecided submitted evidence, effective verification with immutable input preservation, multiple disjoint evidence records, and ineffective/historical or other-pathway decisions. The existing built positive-verification case additionally confirms the real receipt still has `reviewPending: true` and lifecycle SUBMITTED while the candidate overview excludes it from pending review and shows EFFECTIVELY_VERIFIED.

Only `apps/web/lib/dairy-journey.ts`, `apps/web/app/dairy/journey/page.tsx`, `tests/unit/dairy-journey.test.ts`, `tests/e2e/dairy-pilot.test.ts` and this completion record changed during this remediation. No migration, authentication, RBAC, authority-chain implementation, scoring or test-limit change was required. Existing authority and immutable-history regressions passed unchanged.

## Remaining review and domain decisions

Independent acceptance review is required before any checkpoint. Review should assess the coherent navigation, wording and status distinctions as well as the tests. Physical Android-device and throttled-network visual usability testing has not been performed; mobile behavior relies on existing responsive styling, server-rendered content and reused forms. The new overview handles connection failures, but does not add offline mutation queues or a native application.

Domain-expert approval of professional requirements and governance remains outstanding exactly as before this phase. Unconfigured requirements are visible; there is no fabricated readiness decision. Existing detailed workspaces remain the source for explanations, submission revisions and candidate-safe reviewer feedback.
