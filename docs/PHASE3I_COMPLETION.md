# Phase 3I — Competency Gap to Governed Learning and Candidate Next Steps

## Protected starting checkpoint

Branch/tracking: `feat/phase-3-training-verification` / `origin/feat/phase-3-training-verification`; HEAD/tag: `abdfe9d555028fd45c384cff9bf99904be787aa6` / `phase-3h1-audit-remediation`. Starting tree clean, ahead/behind 0/0. Phase 3I remains uncommitted for independent review.

## Implemented model and provenance

Forward migration `017_development_workflow.sql` adds immutable `development_workflow_plans` and `development_workflow_starts`. Plans store owner, exact pathway version, existing immutable competency-profile snapshot ID, command/request/actor IDs, engine version, creation time, UNCONFIGURED professional policy, ordered development items and a canonical SHA-256 digest. An item contains the exact child definition, proposed/unverified facets, original source keys/reasons, UNKNOWN/PRESENT evidence state, unconfigured requirement and explicit training mapping receipts. Order is lexical code order for navigation, never professional priority or ranking. Duplicate owner commands replay; changed pathway meaning conflicts.

The existing profile repository captures and verifies the source receipt; the plan uses its canonical current-evidence engine rather than the legacy gap helper. Profile receipt creation is independently audited: an unsuccessful plan request can leave an owned profile receipt, but never a partial plan or enrollment. Plan creation and plan/enrollment linking have database ownership/governance guards, immutable records and atomic audit triggers. Old development plans and assessments remain unchanged; the new receipt format avoids rewriting their historical engine or snapshot shape.

## Explicit gap-to-learning mechanism

Recommendations use existing `training_competency_links` for exact pathway/child versions, or an explicit group version joined through the child's existing group mapping. No text, title, keyword, AI or inferred equivalence is used. Only currently demo-released, non-retired course versions are selected. These are governed **DEMO/DRAFT** activities, not professionally approved learning or standards. Course/module/lesson mapping IDs are retained through the canonical training link. No matching map means no recommended activity; the competency need and unknown/unconfigured state remain visible.

Candidates explicitly confirm enrollment. The canonical `training_enrollments` table and its existing governance/audit triggers remain authoritative; existing enrollment is reused. Immutable plan-start receipts bind plan, owner, exact course and enrollment. No duplicate LMS, evidence/award engine, role catalog or employer authority is added.

## Candidate and dairy workflow

The development dashboard links to `/development/next-steps`. Candidates select an exact existing pathway version and save a plan; retry commands are retained after uncertain plan-save responses. Private plan pages show original needs, current evidence/gap visibility, proposed facets, mapped demo learning or explicit absence, completed/remaining lesson counts and next actions. Network failures do not claim successful saves. Text-first server-rendered forms use existing authenticated server-side API calls.

Dairy enrollments route to existing dairy curriculum delivery; other existing training snapshots use `/learning/:enrollmentId`, a generic owner-only reading/progress view. No new dairy standards or equivalent pathway 2–4 content are seeded. Existing course and profile foundations remain pathway-agnostic.

## Completion and follow-up

Progress is read live from canonical training lesson records, not owner assertions on plan items. Learning completion reports `LEARNING_COMPLETED` and always `gapResolved=false`. Original plan items/digests and historical assessment/evidence are never rewritten. Current profile facts are separately recomputed; unconfigured professional requirements remain unconfigured.

After learning, `competencyFollowUps` preserves each child/course/mapping association. Module follow-ups require the same explicit module; lesson follow-ups require the same explicit lesson. A broader course-only competency mapping does not establish scoped applicability. Explicit course-level assessment links are returned separately in `courses[].courseLevelFollowUps` and rendered once outside individual competencies. Missing or ambiguous scoped mapping remains unavailable; professional policy stays UNCONFIGURED. It uses existing assessment-start, attempt/resume and review mechanisms. No automatic attempt submission, review, evidence promotion or gap resolution occurs. Where no current governed assessment link exists, the page states that further verification is required. Retired content cannot receive new starts; history and existing progress remain readable. An unavailable pathway retains the historical plan without offering new learning.

## Security and professional boundaries

All new API routes require existing authentication and `candidate:own`; repositories derive the owner and check active users, and database writes recheck current capability. Cross-owner reads/starts are concealed. Client ownership/professional overrides are rejected. Returned plan projections contain no reviewer narrative, private document, token or employer-sharing grant. Employer access and consent implementations are unchanged.

Professional policies remain **UNCONFIGURED**. Learning completed ≠ knowledge verified ≠ case verified ≠ practically verified ≠ professionally qualified. No qualification, Job Ready/Field Ready award, certification, licensing, public discovery/ranking, professional weighted matching, automated rejection/hiring, private-document storage, payments or deployment is introduced. All 69 child definitions and professional content retain existing proposed/demo governance.

## Initial implementation validation — 4 November 2026 (before audit remediation)

- Relevant-first unit checks: **56/56 passed**, including 12 new workflow-domain checks plus existing domain/eligibility and recruitment checks.
- Focused workflow integration and dairy end-to-end run: **25/25 passed** (15 workflow integration checks and 10 dairy end-to-end scenarios), 202.59 seconds.
- Final complete regression command: `node node_modules/vitest/vitest.mjs run --testTimeout=120000 --hookTimeout=600000 --reporter=default --reporter=json` with JSON/log output outside the repository; exit **0**, **435/435 tests passed across 34 files**, **0 failures, 0 skipped/pending, 0 TODO**, 456.12 seconds. Breakdown: **207 unit / 214 integration / 14 end-to-end**. All 407 baseline tests were retained; 28 checks were added (12 domain, 15 integration, one dairy end-to-end). Only six existing ledger-count expectations advanced from 16 to 17; assertions were not removed or bypassed.
- All **59 dedicated authentication/session/OIDC/diagnostic tests passed**, included above. Existing assessment, training, evidence, practical, competency-profile and employer-pilot regressions passed. Phase 3F practical integration: 24; Phase 3G profile integration: 18; Phase 3H recruitment integration: 27. No fresh live Auth0 exercise is claimed.
- `npm run lint`: exit **0**. `npm run typecheck`: exit **0**, including strict contracts/domain/API/web/tooling/test checks. Final `npm run build`: exit **0**, fresh foundation and Next.js 16.4.1 production builds including the new routes. No dependency installation or framework change occurred.
- `node --import tsx scripts/openapi.ts` generated the intentional tracked API artifact; Prettier restored its established JSON formatting. Semantic comparison found **zero existing paths changed**, and exactly three new paths/four operations.
- Final disposable database ledger: **17 entries / 17 files**, ordering matches, **0 checksum mismatches**. The focused/full integration tests populated 001–016, applied 017, compared every existing table, exercised repeated migration runs and seed repeatability, and preserved historical plan/evidence/assessment records. Original migrations 001–016 are unchanged. No development/production database was reset, migrated or seeded.
- Final policy query: `professional_status=UNCONFIGURED`, `weighted_fit=UNCONFIGURED`; all **69 child competency versions remain PROPOSED** in the final seeded test database.
- `npm audit --package-lock-only --audit-level=high --json`: exit **0**, **0 critical/high, 10 moderate, 0 low/info**. Dependencies and lockfile are unchanged. The previous checkpoint recorded 11 moderate findings; the new registry-reported count is not a dependency-remediation claim. Moderate tooling debt remains documented.
- Git whitespace and credential/path scans passed; the final inventory excludes secrets, environment files, caches, logs, temporary resources and normal ignored build output. OpenAPI is the intentional documentation artifact.

Initial validation issues were resolved before the final runs: a fixture table-name validator omitted digits in existing `pilot16_*` names; new end-to-end JSON reads needed schema validation/nonempty-array handling; and a new test helper needed an unambiguous property-access line break for lint. No failed attempt is represented as a passing run. Formatting was limited to new code, the edited dairy end-to-end file and the generated API artifact.

### Added coverage

| Requirement | Coverage |
| --- | --- |
| A — plan creation | Current profile receipt → immutable owner plan; fresh server receipt IDs prevent selecting an older standalone snapshot |
| B — explicit mapping | Exact child/group/pathway relationships, governed release, no title inference |
| C — no mapping | Unmapped needs retained with no fabricated recommendation |
| D/E — unconfigured/unknown | Explicit UNCONFIGURED policy and UNKNOWN evidence; no affirmative professional decision |
| F — isolation | Anonymous and cross-owner reads/starts denied; request/SQL ownership overrides rejected |
| G — completion | Canonical progress completion with gapResolved=false; no evidence upgrade |
| H — follow-up | Exact governed assessment links, existing start/resume, explicit absence when no link exists |
| I — history | Original plan digest/items and populated assessment/evidence preserved |
| J — provenance | Immutable receipts, request/actor references, idempotency, and plan/enrollment audit-failure rollback |
| K — dairy journey | Built private web: gaps → plan → existing dairy learning → progress → separate case follow-up; no anonymous data or tokens |
| L — regression | Complete Phase 1–3I suite, authentication and professional/privacy boundaries |

## Remaining limitations, technical debt and production blockers

- This is learning/navigation development support, not professional gap resolution. No approved professional threshold or mandatory learning requirement is configured.
- Existing released demo content is the only deliverable content; no production approval workflow or new pathway 2–4 content is supplied.
- Plans retain immutable mapping choices. Newly released learning requires a new explicit plan; historical recommendations are not silently replaced.
- The plan list is bounded to the latest 50 receipts. This pilot has no full historical-list pagination or offline drafts, notifications, advisor scheduling or durable background orchestration.
- Recommendations enroll at course level and report whole-course progress, even when the explicit mapping is module/lesson scoped. Mapping scope is retained through its immutable link ID.
- Direct case-only recommendations outside existing course/assessment links are not added; no link is fabricated.
- Retained engine implementations and the legacy development-plan workflow require maintenance; no historical receipt is migrated or silently reinterpreted.
- Production private storage, privacy/legal review (including retention of immutable history), least-privilege database roles, backups/restores, monitoring, live-provider, accessibility and load testing remain outstanding.
- Existing moderate development-tooling dependency debt remains outside this scope; dependencies and the audit gate are unchanged.

## Initial implementation change inventory (before targeted remediation)

33 changed/new files, all unstaged:

- `API.md`
- `ARCHITECTURE.md`
- `CHANGELOG.md`
- `README.md`
- `ROADMAP.md`
- `apps/api/src/app.ts`
- `apps/api/src/development/controller.ts`
- `apps/api/src/development/repository.ts`
- `apps/web/app/development/next-steps/[id]/page.tsx`
- `apps/web/app/development/next-steps/actions.ts`
- `apps/web/app/development/next-steps/page.tsx`
- `apps/web/app/development/page.tsx`
- `apps/web/app/learning/[id]/page.tsx`
- `apps/web/app/learning/actions.ts`
- `db/migrations/017_development_workflow.sql`
- `docs/PHASE3H1_AUDIT_REMEDIATION.md`
- `docs/PHASE3H_COMPLETION.md`
- `docs/PHASE3I_COMPLETION.md`
- `docs/PHASE3_ARCHITECTURE.md`
- `docs/openapi.json`
- `packages/contracts/src/development.ts`
- `packages/contracts/src/index.ts`
- `packages/domain/src/development.ts`
- `packages/domain/src/index.ts`
- `tests/e2e/dairy-pilot.test.ts`
- `tests/integration/cases.test.ts`
- `tests/integration/competency-profile.test.ts`
- `tests/integration/dairy-learning.test.ts`
- `tests/integration/dairy-pilot.test.ts`
- `tests/integration/development.test.ts`
- `tests/integration/practical.test.ts`
- `tests/integration/recruitment.test.ts`
- `tests/unit/development.test.ts`

Starting HEAD, branch and protected tag are unchanged; no staging, commit, tag, push, merge or deployment occurred. Authentication/session/OIDC/Next configuration, dependencies/lockfile, CI, seed definitions and migrations 001–016 are unchanged.

The initial checkpoint recommendation was superseded by the independent audit. The targeted remediation record below is authoritative for the corrected implementation and its re-audit status. No professional policy activation, production rollout or additional pathway content is authorized.

## Temporary resource cleanup

The dedicated Phase 3I PostgreSQL container and tmpfs database were stopped/removed after final ledger verification. Phase 3I temporary logs, JSON reports and npm cache were removed after recording their results above. Normal development configuration/database, existing validation resources and normal ignored build output were not removed.

## Targeted independent-audit remediation — 5 November 2026

Only the two audit findings and their requested regression coverage are addressed. Authentication, employer access, professional policy and unrelated historical documentation remain unchanged.

### MEDIUM: competency-specific follow-up scope

Root cause: assessment mapping IDs were aggregated across all plan items sharing a course, and the resulting course list was rendered under each competency. Correction: an explicit-scope classifier now binds follow-ups to an individual child/course/mapping reference. It never uses titles, keywords, similarity or shared course membership. Module associations require matching module IDs; lesson-specific associations require exact lesson IDs. Course-only or ambiguous competency scope cannot imply a narrower assessment relationship.

Genuinely course-level links (no module/lesson scope) are classified as COURSE and displayed once in a separate course section. If the same assessment has both course-wide and scoped links, its explicit course-wide association is displayed once rather than repeated under competencies. Original plan items/digests are not rewritten. Completion remains learning-only, gapResolved=false, professional determination null and professional policy UNCONFIGURED.

### LOW: database evidence-state invariant

Root cause: SQL NULL from missing/JSON-null evidenceState did not make the NOT IN condition true. Migration 017 now explicitly rejects a null extraction before checking membership. Accepted labels remain exactly UNKNOWN/PRESENT; no evidence state or professional rule was added. Migration 017 remains uncommitted and was corrected in place as authorized; 001–016 are not modified.

### Added regression coverage and current validation

- Disjoint competency A/module A/assessment A and B/module B/assessment B in the same course; neither scoped assessment may appear under the other competency.
- One genuinely course-level follow-up displayed once, mixed scope, exact-lesson scope, missing/ambiguous mappings and unchanged UNKNOWN/UNCONFIGURED states.
- Direct SQL rejects missing, JSON null, SQL-null-equivalent extraction, unapproved/empty strings, numbers, booleans, arrays and objects; direct SQL still accepts valid UNKNOWN/PRESENT.
- Actual create-plan, enrollment, reading-completion and follow-up server actions are exercised against the API, starting without an enrollment; the actual plan component is rendered and checked for correct scoped guidance. This is a server-action/API/SSR integration boundary, not a new browser-automation project.
- Narrow unit run: **26/26 passed** (19 development-domain checks and seven new server-action checks). Focused integration: **28/28 passed**, including 11 direct-database state tests and the new scoped API/action/rendering checks.
- The full suite retained the 435 accepted implementation checks and added **27 regression checks**: seven scoped-domain, seven server-action, nine invalid SQL-state, two valid SQL-state, and two scoped API/actual-action integration checks.
- `tsconfig.tooling.json` now enables `jsx: react-jsx` so the actual plan component imported by the integration test is type-checked. Strictness, exclusions and authentication configuration were not weakened. The first tooling check identified the absent JSX setting; the corrected final check passed.
- Final strict checks: `tsc -p <project> --noEmit --incremental false` passed for contracts, domain, API, web and tooling; the tooling check was repeated successfully after the final dairy assertion update. `npm run lint` passed again after final source changes.
- Fresh `npm run build`: exit **0**, foundation plus production Next.js build. Full command `node node_modules/vitest/vitest.mjs run --testTimeout=120000 --hookTimeout=600000 --reporter=default --reporter=json` (JSON/log output outside the repository): exit **0**, **462/462 passed across 35 files**, **0 failures, 0 skips/pending, 0 TODO**, 583.49 seconds. Breakdown: **221 unit / 227 integration / 14 end-to-end**. All **59 dedicated authentication/session/OIDC/diagnostic tests passed**, included above.
- Final disposable ledger: **17/17 files/entries**, correct ordering, **0 checksum mismatches**. Populated 001–016 upgrade preservation, migration reruns, seed repeatability and immutable history checks passed in the focused and full runs. SHA-256 comparison against the remediation-start files confirmed all **16 historical migrations byte-for-byte unchanged**; only uncommitted 017 was corrected.
- Final policy query: professional_status=UNCONFIGURED and weighted_fit=UNCONFIGURED; all **69 child definitions remain PROPOSED** in the final seeded test database. Authentication/protected configuration matches the known-good baseline, and employer/consent implementations, dependencies, lockfile, seeds and CI are unchanged. No fresh live-provider or dependency-audit run is claimed for this targeted remediation.
- Changed-file credential/path and Git whitespace scans passed. No environment files, credentials, normal build output or temporary resources are included.

Remediation status: **READY FOR INDEPENDENT RE-AUDIT**. No stage, commit, tag, push, merge or deployment. Production qualification, certification, licensing, ranking, automated rejection and employer-access expansion remain blocked.

### Files attributable to this targeted remediation

- `API.md` — documents separate scoped and course-level response fields.
- `apps/api/src/development/repository.ts` — reads exact mapping scopes and classifies each item separately.
- `apps/web/app/development/next-steps/[id]/page.tsx` — renders only applicable competency follow-ups and one distinct course-level section.
- `db/migrations/017_development_workflow.sql` — explicitly rejects null/missing evidenceState.
- `docs/PHASE3I_COMPLETION.md` — corrected behavior, audit response and actual validation.
- `packages/contracts/src/development.ts` — typed scoped/course-level associations and provenance references.
- `packages/domain/src/development.ts` — explicit-scope classification without inference.
- `tests/e2e/dairy-pilot.test.ts` — asserts the starter case retains its actual lesson-specific mapping.
- `tests/integration/development.test.ts` — direct SQL cases and real action/API/SSR regression with a new enrollment.
- `tests/unit/development-actions.test.ts` — new actual server-action payload, retry and failure checks.
- `tests/unit/development.test.ts` — disjoint scopes, course-wide separation, ambiguity and unchanged policy/state checks.
- `tsconfig.tooling.json` — JSX support for checking the actual TSX page in the integration test.

### Current complete Phase 3I review inventory

35 changed/new files, all unstaged. This includes the preserved implementation plus the targeted remediation; only the 12 files above differ from the remediation-start snapshot.

- `API.md`
- `ARCHITECTURE.md`
- `CHANGELOG.md`
- `README.md`
- `ROADMAP.md`
- `apps/api/src/app.ts`
- `apps/api/src/development/controller.ts`
- `apps/api/src/development/repository.ts`
- `apps/web/app/development/next-steps/[id]/page.tsx`
- `apps/web/app/development/next-steps/actions.ts`
- `apps/web/app/development/next-steps/page.tsx`
- `apps/web/app/development/page.tsx`
- `apps/web/app/learning/[id]/page.tsx`
- `apps/web/app/learning/actions.ts`
- `db/migrations/017_development_workflow.sql`
- `docs/PHASE3H1_AUDIT_REMEDIATION.md`
- `docs/PHASE3H_COMPLETION.md`
- `docs/PHASE3I_COMPLETION.md`
- `docs/PHASE3_ARCHITECTURE.md`
- `docs/openapi.json`
- `packages/contracts/src/development.ts`
- `packages/contracts/src/index.ts`
- `packages/domain/src/development.ts`
- `packages/domain/src/index.ts`
- `tests/e2e/dairy-pilot.test.ts`
- `tests/integration/cases.test.ts`
- `tests/integration/competency-profile.test.ts`
- `tests/integration/dairy-learning.test.ts`
- `tests/integration/dairy-pilot.test.ts`
- `tests/integration/development.test.ts`
- `tests/integration/practical.test.ts`
- `tests/integration/recruitment.test.ts`
- `tests/unit/development-actions.test.ts`
- `tests/unit/development.test.ts`
- `tsconfig.tooling.json`

Remaining limitations: the new workflow is tested at the actual server-action/API/SSR boundary, not through a new full browser-automation suite. The previously documented production/privacy/storage/domain-governance blockers and moderate tooling dependency debt remain outside this remediation. No professional policy was activated.

Remediation cleanup: the dedicated test container/tmpfs database and remediation-owned temporary logs/JSON reports were removed after results were recorded. Normal development configuration/database, pre-existing resources and normal ignored build output were preserved. Final source scans found no credential-pattern matches or private/generated/temporary paths in the change set. HEAD and the protected tag remain `abdfe9d555028fd45c384cff9bf99904be787aa6`; branch remains `feat/phase-3-training-verification`, ahead/behind 0/0. Nothing is staged: 21 modified tracked files and 14 untracked files (35 total Phase 3I files).
