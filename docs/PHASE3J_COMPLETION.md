# Phase 3J — Governance-gated competency verification

Current status: the supporting-authority-chain correction is implemented and its regressions pass, but complete validation remains blocked by the separately recorded full-suite failures. The authoritative remediation record is at the end of this document. Earlier implementation validation is historical; checkpoint determination belongs to the subsequent independent re-audit.

## Scope and protected starting state

Protected branch `feat/phase-3-training-verification`; HEAD `3f3972d981a85d640285d0a4efd2d9a65ee91990`; annotated tag `phase-3i-audited-checkpoint` resolves to HEAD. Starting tree clean, tracking ahead/behind 0/0. The user explicitly selected a governance-gated workflow with synthetic positive-path tests. No professional policy, assessor qualification or veterinary criterion is invented or seeded.

## Implemented

- Canonical owner-derived evidence submissions, explicit activity/date/general-location/process/declaration and immutable exact-rubric case receipts.
- Separate, immutable rubric/policy references, exact assessor authorizations and governance revocations; separately provisioned governance capability with no users automatically granted it.
- Initial assignment/reassignment, review start, conflict declaration/recusal, structured criterion-version findings, all requested decision outcomes, linked corrections/invalidation, new-evidence reassessment and immutable appeal initiation.
- Optional independently assigned moderation, enforced only when explicitly required by the rubric. Self-review and self-moderation are rejected.
- Strict private API endpoints, text-first server-rendered candidate/assessor/assignment forms, sanitised current competency-profile/Passport verification overlay and historical decision chronology.
- Row locks, expected revisions, unique commands and canonical digests; direct PostgreSQL invariants and atomic audit triggers. Readiness, certification, licensing and professional weighted matching remain unconfigured.

See [ADR 0011](adr/0011-governance-gated-verification.md) for the model, lifecycle, projection and trust boundaries.

## Demonstration versus professional verification

Existing Phase 3F demo submissions and outcomes are unchanged and cannot be promoted. No production rubric or assessor authorization exists in reference seeds. The positive VERIFIED path is exercised only with explicitly synthetic software governance in disposable databases. These fixtures are not veterinary standards or real assessor qualification.

The original canonical receipt stays UNVERIFIED. An authorised decision establishes the separate current verification overlay. `governedVerification` explicitly reports the exact verified facet, evidence/policy/rubric/process references and decision time; it does not reinterpret immutable engine-1 facets, old profile snapshots or Phase 3I plan digests. Professional requirements remain UNCONFIGURED, even when an individual evidence item has a legitimate verified outcome. Knowledge, case, practical, workplace and simulation facets do not accumulate into one another.

## Historical implementation validation — before independent adversarial audit

Final clean full-suite command: `node node_modules/vitest/vitest.mjs run --testTimeout=120000 --hookTimeout=600000 --reporter=default --reporter=json` (reports outside the repository). Exit **0**, **521/521 passed across 38 files**, **248 unit / 258 integration / 15 end-to-end**, **0 failures, 0 skipped/pending, 0 TODO**, duration **914.87 seconds**. All **59 dedicated authentication/session/OIDC/diagnostic tests passed**, included above. The 59 additional Phase 3J checks comprise 20 domain/contract unit checks, seven actual server-action/page-render checks, 31 API/database integration checks and one additional dairy end-to-end check.

Final `npm run lint` passed. Strict `tsc --noEmit --incremental false` passed individually for contracts, domain, API, web and tooling. Fresh `npm run build` passed: foundation (contracts/domain/API) plus production Next.js build. Final OpenAPI generation passed; ten new private paths/11 operations, no existing path contract changed.

Fresh migration path and populated-017 upgrade passed. The latter preserves populated users, candidate profile, sessions, profile snapshots, development plans, canonical evidence/submissions and audit history. Migration/seed reruns passed. Final independent ledger read: **18 files / 18 entries**, correct order, **zero checksum mismatches**, zero remaining upgrade fixture databases. The final test database had zero verification-rubric rows after regression fixtures were reset; no approvals or authority are seeded. All migrations 001–017 remain byte-for-byte unchanged.

Fresh `npm audit --audit-level=high --json` exited **0**: **0 high, 0 critical, 10 moderate**. The existing moderate tooling chain stems from minimatch globparts-amplification denial of service (GHSA-g3hv-75wg-m249), propagated through ESLint/typescript-eslint packages. Dependencies, lockfile and CI gate are unchanged. No dependency remediation or production-advisory absence beyond this actual audit result is claimed.

## Unconfigured / requires domain expert validation

Professional rubrics, criteria, evidence sufficiency, approved remote/in-person processes, assessor qualification/eligibility, approval authority operating procedures, moderation policy and professional evidence validity require domain-expert approval. No live approvals or authority grants are seeded. An administrator role alone is insufficient. Readiness thresholds, Job Ready/Field Ready, certification, licensing, ranking and professional matching remain inactive.

## Deferred and production blockers

- Secure private object storage, quarantine/scanning and uploads: absent; metadata/text only. Do not submit confidential farm/client/commercial information.
- No approval-authoring/provisioning UI or professional governance operating process. The separate governor capability and real-world reference validation require controlled provisioning before real use.
- Appeal initiation/history exists; appeal resolution workflow and legal/regulatory procedures are deferred.
- Exact same-case independent second review exists; full moderation routing, adjudication policy and assessor calibration are deferred.
- No offline submission, background retry or unsaved-draft persistence is claimed. After an uncertain review save, reload/check history before sending another action. Queue listings are bounded to 100 without pagination; candidate projection is not a public discovery service.
- No automatic readiness or employer-facing verified profile; no professional domain content for additional pathways.
- Historical profile engine 1 remains immutable and displays its original facets; the new live verification overlay is distinct. Updating historical engines/development receipts is not part of this phase.
- Dedicated least-privilege database roles, approval provisioning controls, retention/erasure/legal review, live-provider/MFA validation, device/accessibility/load testing, backups/restore, monitoring and deployment remain outstanding.

## Checkpoint status

The initial validation was followed by an independent adversarial audit identifying three defects. Scoped remediation and its current validation record follow below. All changes remain unstaged and uncommitted. No staging, commit, tag, push, merge or deployment is authorized by this report.

## Complete changed-file inventory

44 files: 28 modified tracked and 16 untracked/new, all unstaged.

| File                                                     | Reason                                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/training.test.ts`                     | Preserves all old data while accounting for exactly the new governance catalogue rows; existing training checks retained.              |
| `tests/integration/evidence-foundation.test.ts`          | Preserves populated legacy evidence/users/grants while accounting for exactly the new governance catalogue rows.                       |
| `API.md`                                                 | Strict routes, command/revision semantics, private projections and approval boundary.                                                  |
| `ARCHITECTURE.md`                                        | Current Phase 3J layer and ADR references.                                                                                             |
| `CHANGELOG.md`                                           | Unreleased Phase 3J delivery summary.                                                                                                  |
| `COMPETENCY_MODEL.md`                                    | Separate current verification overlay; historical engine preserved.                                                                    |
| `DATABASE.md`                                            | Forward migration and canonical evidence/ledger relationship.                                                                          |
| `EVIDENCE_MODEL.md`                                      | Immutable source receipt versus subsequent governed decisions.                                                                         |
| `README.md`                                              | Current Phase 3J scope and gated production status.                                                                                    |
| `ROADMAP.md`                                             | Current phase and outstanding governance/production gates.                                                                             |
| `SCORING_MODEL.md`                                       | Explicit absence of professional scores/weights/thresholds.                                                                            |
| `SECURITY.md`                                            | Scoped access, recusal, separate governance authority and storage limitations.                                                         |
| `VERIFICATION_MODEL.md`                                  | Current workflow versus historical demonstration foundation.                                                                           |
| `apps/api/src/app.ts`                                    | Registers verification controller/repository; existing guards retained.                                                                |
| `apps/api/src/competency-profile/repository.ts`          | Adds sanitised current verification to owner profile and Passport only.                                                                |
| `apps/api/src/verification/controller.ts`                | Strict candidate, assigned assessor and assignment-operator endpoints.                                                                 |
| `apps/api/src/verification/projection.ts`                | Effective outcome projection with exact authorization/revocation/moderation checks.                                                    |
| `apps/api/src/verification/repository.ts`                | Canonical submissions, scoped access and serialized idempotent event transactions.                                                     |
| `apps/web/app/competencies/profile-view.tsx`             | Displays private governed evidence separately from historical facets/readiness.                                                        |
| `apps/web/app/verifications/[role]/[id]/page.tsx`        | Owner result/appeal, assignment and structured assessor/conflict forms.                                                                |
| `apps/web/app/verifications/actions.ts`                  | Authenticated server actions with strict payloads and explicit save acknowledgement.                                                   |
| `apps/web/app/verifications/page.tsx`                    | Candidate submission and current evidence-lineage navigation.                                                                          |
| `apps/web/app/verifications/queue/[role]/page.tsx`       | Minimal private assigned-review/assignment queues.                                                                                     |
| `apps/web/lib/competency-profile.ts`                     | Validates optional governed verification projection.                                                                                   |
| `db/migrations/018_governed_competency_verification.sql` | Additive immutable governance/case/event structures, guards and audit triggers.                                                        |
| `docs/PHASE3J_COMPLETION.md`                             | Scope, executed validation, limitations and checkpoint audit.                                                                          |
| `docs/adr/0011-governance-gated-verification.md`         | Architecture decision, state transitions, security and governance trust model.                                                         |
| `docs/openapi.json`                                      | Generated 11 new operations; old paths unchanged.                                                                                      |
| `packages/contracts/src/competency-verification.ts`      | Strict submission, event, criterion and sanitised projection contracts.                                                                |
| `packages/contracts/src/index.ts`                        | Exports new contracts.                                                                                                                 |
| `packages/domain/src/governed-verification.ts`           | Explicit safety prerequisites, transition rules and nonaccumulating maturity semantics.                                                |
| `packages/domain/src/index.ts`                           | Exports new domain helpers only.                                                                                                       |
| `tests/e2e/dairy-pilot.test.ts`                          | Continues real built-web dairy learning journey through synthetic governed verification and private Passport.                          |
| `tests/helpers/verification.ts`                          | Synthetic governance fixtures and exact three-row catalogue additions for legacy preservation comparisons; no production seed changes. |
| `tests/integration/cases.test.ts`                        | Migration count 18 and exact additive governance catalogue accounting; pre-existing data and behavioural assertions retained.          |
| `tests/integration/competency-profile.test.ts`           | Migration count 18 and exact additive governance catalogue accounting; pre-existing data and behavioural assertions retained.          |
| `tests/integration/dairy-learning.test.ts`               | Migration count 18 and exact additive governance catalogue accounting; pre-existing data and behavioural assertions retained.          |
| `tests/integration/dairy-pilot.test.ts`                  | Migration count 18 and exact additive governance catalogue accounting; pre-existing data and behavioural assertions retained.          |
| `tests/integration/development.test.ts`                  | Migration count 18 and exact additive governance catalogue accounting; pre-existing data and behavioural assertions retained.          |
| `tests/integration/governed-verification.test.ts`        | API/SQL security, lifecycle, concurrency, audit, governance and populated-upgrade coverage.                                            |
| `tests/integration/practical.test.ts`                    | Migration count 18 and exact additive governance catalogue accounting; pre-existing data and behavioural assertions retained.          |
| `tests/integration/recruitment.test.ts`                  | Migration count 18 and exact additive governance catalogue accounting; pre-existing data and behavioural assertions retained.          |
| `tests/unit/governed-verification.test.ts`               | Prerequisites, transitions, schemas and separate evidence-maturity checks.                                                             |
| `tests/unit/verification-actions.test.ts`                | Actual server-action ownership, submission/retry and failure behavior.                                                                 |

## Initial validation corrections

The first targeted run exposed a transient Supertest server lifecycle problem; the dedicated test app now listens on an explicit loopback ephemeral port. The populated-upgrade fixture initially reused a pathway UUID from a different database; it now resolves that database’s own pathway. Older upgrade snapshots required accounting for exactly the three new governance catalogue rows while continuing to preserve existing user grants and data. A dairy positive-path fixture initially attempted to approve a delivered demo definition, correctly rejected by historical immutability guards; the fixture now creates an isolated synthetic software definition before its mapped course is released. No historical guard or migration was weakened. Final UI review also separated recorded VERIFIED outcomes from current effective verification when moderation/authority blocks a claim. The final clean validation record above supersedes those initial attempts. Final review also tightened private assessor access after authority revocation and captured immutable before/after maturity for corrections.

## Historical implementation audit — superseded by independent adversarial audit

### A. Git state

Branch feat/phase-3-training-verification; HEAD 3f3972d981a85d640285d0a4efd2d9a65ee91990; tag phase-3i-audited-checkpoint unchanged and resolving to HEAD; tracking ahead/behind 0/0. 28 modified tracked files, 16 untracked files, 0 staged (44 total). No checkpoint history was rewritten.

### B. Architecture

Canonical submissions, source receipts, competency definitions, training/enrolment/progress and audit_events are reused. New governance/case/decision records form an additive review overlay, not a competing evidence or readiness ledger. Historical engine-1 snapshots and Phase 3I plan receipts are preserved.

### C. Professional safety

No veterinary criterion, licensing standard, threshold, pass mark, scoring weight or assessor qualification is invented. No approved rubric, eligibility authorization or governor user assignment is seeded. VERIFIED requires explicit approved governance and never grants overall readiness. Phase 3F demonstration review cannot confer professional verification.

### D. Authentication

Protected authentication/session/OIDC/Next configuration matches working-authentication-2026-10-20. Private configuration byte hashes are unchanged. All 59 dedicated regression checks passed. The new database governance authority is not implicitly assigned to administrators and does not change authentication.

### E. Privacy

Owner identity derives from the authenticated principal. Cross-candidate, unrelated assessor, employer and anonymous access are tested. Assignment/reassignment, permanent recusal, current professional authorization and rubric revocation govern private assessor access. Owner/admin projections exclude private findings and narratives. Employers gain no new access or sharing grant.

### F. Migrations

001–017 are byte-identical to the protected starting state; only additive 018 is new. Fresh and populated upgrade paths, ordering, immutable history, checksum verification, reruns and seed repeatability passed. Legacy snapshot tests account for exactly the three explicitly added governance catalogue rows and still compare every prior data row/user grant. Separate setup assertions prove the new capability belongs only to the unassigned governor role before synthetic fixtures provision it.

### G. Testing

521/521 passed across 38 files: 248 unit, 258 integration, 15 end-to-end. The 59 dedicated authentication/diagnostic checks are included. Zero failures/skips/pending/TODO. Direct SQL cases, command/revision concurrency, audit rollback, recusal/reassignment, exact rubric/evidence, authority revocation, independent moderation and reassessment history passed. Built-web/API end-to-end uses the existing Vitest/HTTP approach; no new browser-automation or field-device validation is claimed.

### H. Build quality and dependencies

ESLint, all five strict no-emit TypeScript projects, foundation and production builds passed on the final source. The dependency audit high gate passed with zero high/critical and ten existing moderate tooling findings. Dependencies/lockfile/CI are unchanged. Whitespace and changed-file credential/private-path scans passed. OpenAPI is the sole intentionally generated documentation artifact in the inventory.

### I. Inventory

All 44 changed/new files are explained in the complete inventory above. No private environment, credential, generated build output or temporary resource is included.

### J. Remaining limitations

Production blockers, unconfigured professional policies, domain-expert requirements and deferred appeal/moderation operations remain as listed above. The live projection is a distinct governed overlay; historical profile facets and receipts are not retroactively reinterpreted. No checkpoint recommendation is made by this remediation.

## Cleanup and preservation

The named vetready-phase3j-validation PostgreSQL container and tmpfs databases were stopped/removed after final ledger verification. Its separate upgrade database was dropped in test cleanup. The audit-created vetready-3j-2WaWFq directory and all six JSON/log files were removed after results were recorded. Normal development database/configuration and existing build outputs were preserved. No stage, commit, tag, push, merge or deployment occurred.

The initial implementation recommendation was superseded by the independent adversarial audit. Checkpoint approval is reserved for the subsequent independent re-audit.

## Scoped remediation of the first three independent audit findings — historical validation record

Scope is limited to the three independently reproduced defects. The starting tree contained 44 changed files (28 modified tracked, 16 untracked, none staged); branch/HEAD/tag/tracking relationships above were captured again before editing. Raw hashes for all 297 tracked/untracked/private files and the Git index were captured. No authentication, dependency, employer/consent, reference seed or historical migration change is authorised or included.

### Root causes and corrections

1. **Recusal and current verification:** the projection checked approvals/validity but did not check conflict events supporting the selected decision. It now checks the exact PRIMARY/MODERATION support chain. A recused supporting reviewer or moderator withholds effective verification without rewriting the decision. A new independently authorised PRIMARY starts a new support chain; configured moderation remains required. A former deciding reviewer may record their own conflict through the existing event endpoint without regaining private read/review/decision access. Row locks/revisions and permanent per-case recusal remain enforced.
2. **Malformed governance:** the SQL guard previously coerced JSON values to text and integers instead of enforcing the shared schema. The corrected guard enforces exact fields/types, UUID format and uniqueness, positive safe-integer versions, array bounds, canonical trimming and the installed Zod Unicode code-point text bounds. Repository reads/submission paths validate canonical criteria; effective projections and SQL decisions also fail closed if legacy malformed records are encountered. No professional content or thresholds are added.
3. **Withdrawn reassessment:** only decided predecessors were accepted and a blanket superseded-case rule also blocked appeals. A withdrawn, undecided reassessment with a predecessor may now receive one linked successor under the same ownership/competency/pathway/method checks. The existing unique predecessor constraint and locks prevent branches/duplicate active successors. Owner appeals against historical decided cases are separate from the prohibition on further superseded review decisions.

### Regression coverage

Primary verification followed by recusal, moderated verification followed by primary-reviewer or moderator recusal, primary/moderation races, immutable decision preservation, independent restoration and former-reviewer private-read denial. Direct SQL rejects malformed criteria types/structures/bounds/unknown keys; valid normalization/Unicode/integer/UUID boundaries persist canonically. An explicitly isolated legacy-corruption fixture tests fail-closed repository/API/projection handling, with the fixture restored afterward. Actual page rendering handles governance rejection without a positive claim. Reassessment withdrawal accepts one linked successor and retains historical appeal eligibility; concurrent successors conflict. Built-web dairy regressions exercise recusal and withdrawn-reassessment/appeal behavior.

### Current validation

Final clean acceptance: **585/585 passed across 38 test files**: **253 unit, 314 integration, 18 end-to-end**. There were **585 total tests, 585 passed, 0 failed, 0 skipped, 0 TODO, 0 setup/hook failures and 0 unexecuted tests**. All 38 test files passed in the same complete standard run, without retries or repairs; acceptance is not assembled from separate successful runs. Test runtime was 615.70 seconds.

Validated groups within that acceptance run: **Foundation 17/17; authentication/session/OIDC 59/59; verification/authority-chain 85/85; dairy integration 23/23; recruitment integration 28/28; built dairy journey 14/14**. Earlier focused runs and interrupted attempts remain historical evidence rather than the basis for acceptance.

The dependency severity gate, ESLint, formatting check, strict TypeScript checks across contracts, domain, API, web and tooling, foundation build and fresh production build passed. Git whitespace validation and credential/private-file checks also passed, with no leakage findings. The final source/test hashes were frozen before the full run. The dependency high gate passed: npm audit exit 0, zero high/critical, ten existing moderate findings in the minimatch/ESLint/typescript-eslint tooling chain. No dependency, lockfile or CI gate changed.

Fresh migration and populated 017-to-018 upgrade regressions passed, including reruns, seed repeatability and prior-data preservation. Final disposable-database ledger: **18 files / 18 ordered entries, zero checksum mismatches**; no upgrade database remained. No governance rubric was left provisioned; professional-status and weighted-fit policies remained UNCONFIGURED. Migrations 001–017 retain their remediation-start byte hashes. Authentication and private configuration are unchanged; learning completion does not confer verification/readiness, employer consent boundaries remain intact, and finalized decisions are preserved.

The remediation-only PostgreSQL container `vetready-phase3j-remediation` was stopped and removed after ledger verification. Its tmpfs databases and the owned temporary report/log/npm-cache directory were removed. Normal development configuration/database and existing build outputs were preserved. Final hash, Git whitespace and credential/private-file checks accompany the handoff; no staging or repository-history operation is authorised or performed.

### Exact remediation file inventory

Only these 11 files differ from the captured remediation-start snapshot; the other 33 recovered Phase 3J files are preserved. No new file was added.

| File                                                     | Remediation change                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db/migrations/018_governed_competency_verification.sql` | Canonical criterion guard, conflict-aware supporting review chain, withdrawn-reassessment successor and historical appeal/recusal exceptions.             |
| `packages/contracts/src/competency-verification.ts`      | Reusable canonical criterion-array bounds and unique identity validation.                                                                                 |
| `apps/api/src/verification/repository.ts`                | Fail-closed criterion reads/submission; metadata-only own-conflict declaration by former deciding reviewer, without private access.                       |
| `apps/api/src/verification/projection.ts`                | Withholds claims supported by recused reviewers/moderators or malformed criteria.                                                                         |
| `tests/integration/governed-verification.test.ts`        | Reproductions, direct SQL criteria parity/bounds, legacy malformed data, recusal/races/restoration and recoverable single-successor lineage/appeal tests. |
| `tests/unit/governed-verification.test.ts`               | Canonical type/field/Unicode/UUID identity regressions.                                                                                                   |
| `tests/unit/verification-actions.test.ts`                | Actual page fails closed when API rejects malformed governance.                                                                                           |
| `tests/e2e/dairy-pilot.test.ts`                          | Built private Passport recusal and reassessment withdrawal/recovery/appeal regressions.                                                                   |
| `API.md`                                                 | Documents scoped behavior corrections; endpoint/body contracts unchanged.                                                                                 |
| `docs/adr/0011-governance-gated-verification.md`         | Corrected review-support validity, canonical criteria and recoverable lineage semantics.                                                                  |
| `docs/PHASE3J_COMPLETION.md`                             | Superseded implementation-only recommendation, remediation causes/corrections/evidence and limitations.                                                   |

## Supporting-authority-chain remediation — authoritative current record

The subsequent adversarial re-audit confirmed the three earlier fixes but reproduced a HIGH defect: a moderated claim remained effective after revocation of its supporting PRIMARY authorization. The 573-test validation above did not cover that sequence and does not establish checkpoint safety.

Before this narrowly scoped correction, the tree contained 44 changed files (28 modified tracked, 16 untracked, zero staged), on `feat/phase-3-training-verification` at `3f3972d981a85d640285d0a4efd2d9a65ee91990`, tracking ahead/behind 0/0. File and index hashes were captured before editing.

The root cause was latest-decision-only authorization validation; the existing recursive supporting-chain function checked recusal only. Migration 018 requires correction because the database moderation guard must independently reject an invalid supporting chain, including direct persistence. New `verification18_authority_valid` checks each contributing decision's exact recorded authorization, actor/rubric binding, current expiry/revocation and existing active review capability. Live projection, VERIFIED moderation creation and recorded prior effective maturity use the same check. Recusal checks remain separate and intact. A new grant does not revive an old revoked authorization; a valid independent PRIMARY may start a new chain while retaining configured moderation requirements.

Only migration 018, the verification projection, the governed-verification integration tests, the dairy built-web tests, ADR 0011 and this completion record are changed by this correction. No professional policy, authentication implementation, dependency, employer boundary, reference seed or migration 001–017 change is included. No historical decision is rewritten.

Added regression coverage exercises real PostgreSQL/API paths for supporting PRIMARY and MODERATION revocation, exact-primary expiry despite another live grant, rejection before moderation through API and direct SQL, genuine revocation/moderation concurrency, multi-level supporting chains and independently authorised restoration. Built-web coverage checks actual candidate profile/Passport/owner rendering and immutable historical decisions after supporting-primary revocation.

### Executed validation and remaining blockers

Focused governed-verification integration: **84/84 passed**, including all eight new authority-chain regressions and fresh/populated migration checks. Complete built dairy journey: **14/14 passed** within the full run, including the new real profile/Passport/owner-page authority-revocation regression. Nine new tests were added in total. No mock replaces PostgreSQL enforcement, API authorization, decision creation or built-web rendering in these regressions.

The complete suite executed **582 tests across 38 files: 570 passed, 12 failed, zero skipped/pending/TODO** (36 files passed, two failed). Unit: **253/253**; integration: **299/311**; end-to-end: **18/18**. All **59 authentication/session/OIDC/diagnostic checks passed**. This is not a clean full-suite validation and must not be represented as 582/582 passed.

Eleven failures occurred in the unchanged dairy-pilot integration suite: the first was host `connect ENOBUFS 127.0.0.1:65533`, followed by ten cascading failures because submission/review state was not established. An unchanged isolated rerun in another disposable database passed **22/22**. The remaining full-run failure was `tests/integration/recruitment.test.ts:938`: a no-op `child_group_mappings` insertion was rejected by the existing `Referenced child structure immutable` guard. The initial suspicion about its UUID-order selection assertion was not the actual failure location. No unrelated test, business logic or historical guard was changed to obtain a passing result.

An earlier parallel dairy end-to-end attempt passed 13/14, including the new regression, but an existing learning-page assertion received the sign-in fallback. The subsequent sequential full run passed all 14 dairy end-to-end tests without a code change. Both attempts are retained in this record; no authentication timeout or assertion was weakened.

ESLint, all five strict no-emit TypeScript projects, foundation build and production build passed. npm audit at the unchanged high-severity gate exited 0: zero high/critical and ten existing moderate tooling findings. Migration ledger: **18/18 ordered entries, zero checksum mismatches**; fresh application, populated 017-to-018 upgrade, migration reruns and seed repeatability passed. Migrations 001–017 and protected authentication/configuration/dependency files remain unchanged. The disposable Docker startup initially returned an API-version error; a process-local compatible API version allowed creation without daemon reconfiguration or development-service changes.

The authority-chain defect is corrected, but the full-suite failures above remain validation blockers outside this narrowly authorised correction. No checkpoint-safety recommendation is made; final approval belongs to the next independent re-audit.

The owned `vetready-authority-fix` container and all its tmpfs databases were removed. The owned temporary report/log/npm-cache directory was removed. Normal development configuration/database and standard ignored build outputs were preserved. Final comparison of 297 captured files found exactly the six intended remediation files changed, no added files, no changes to the four frozen tested source/test hashes and no change to the Git index. The other 38 recovered Phase 3J files, migrations 001–017 and private configuration retain their starting byte hashes. Final Git inventory remains 28 modified tracked, 16 untracked and zero staged; branch, HEAD, upstream, checkpoint tag and ahead/behind 0/0 remain unchanged. Whitespace and changed-file credential/private-path scans passed. Nothing was staged, committed, tagged, pushed, merged or deployed.

## Validation-failure continuation — current investigation

The authority-chain correction above is preserved. This continuation captured a new starting snapshot before editing: 297 file hashes, Git index and the existing 44-file inventory (28 modified tracked, 16 untracked, zero staged), same protected branch/HEAD/upstream and ahead/behind 0/0.

### Dairy failure cause and resource lifecycle

The first failing test was `requires all stages, records case evidence at submission, freezes answers and never practically verifies`. Its Supertest HTTP client failed in `connect` with `ENOBUFS` to loopback port 65533 before completing submission. Windows System/Tcpip event **4231 at 2026-11-05 21:01:09 +01:00** confirms that allocation failed because the global TCP ephemeral-port space was exhausted. The ten subsequent tests assumed the successful submission/review state and consequently failed; this was not evidence that database immutability or production authorization had been bypassed.

The affected integration app was not explicitly listening. Supertest repeatedly acquired and closed an ephemeral listener for individual requests, adding avoidable listener/client socket churn under host-wide port pressure. An isolated 100-request transport probe measured **100 listeners/100 connections** with automatic lifecycle versus **one listener/one connection** with an explicitly owned listener and pooled HTTP agent; both probes closed their servers. Lifecycle review found explicit application, fixture pool and issuer teardown, synchronous child-process completion and unchanged sequential file execution; no persistent application/database connection leak was established. The confirmed historical failure is host-wide ephemeral-port exhaustion, with test-harness churn a directly measured contributor; the event does not identify every other process using the global port space.

Dairy and recruitment integration suites now explicitly own one loopback listener and one keep-alive HTTP agent, destroy the agent and close the application in teardown. A dairy regression verifies stable listener identity, pooled sequential connections, unconstrained concurrent requests and closed listener teardown. No OS limits, production timeouts, global test timeouts, retries or concurrency settings were changed.

### Recruitment failure cause and fixture correction

This is a test-fixture defect (category C), not a change introduced by migration 018. The prior fixture selected a child by random UUID order without excluding definitions already frozen by delivered assessments. Migration 004's existing BEFORE INSERT guard rejects structural insertion attempts for such children before PostgreSQL resolves `ON CONFLICT DO NOTHING`. A duplicate insertion is therefore not a permitted operation under that pre-existing stricter lifecycle.

The fixture now deterministically selects an existing mapped, unapproved/nonretired child without delivered-assessment references, so the existing positive no-op assertions genuinely test job-only freezing. The original positive and negative provenance assertions are retained. An added negative regression proves that a delivered-child duplicate mapping is rejected both in the pre-016 database and after upgrading through 018. No historical guard or migration is modified, and no professional criteria are invented.

### Additional normal-mode validation findings

The initial targeted run passed **135/135** using normal repository settings. The first standard `npm test` attempt completed **581/584**, with three verification-test timeouts. Independent sampling recorded a 94-second gap; Windows Kernel-Power/Power-Troubleshooter events confirmed sleep at **21:47:37** and resume around **21:49:04**. The real-expiry test spanned the interruption and exceeded its existing 60-second timeout. No authorization lifetime, timeout or power setting was changed. Reports from this interrupted attempt were retained.

An unchanged repeat passed the expiry/revocation cases but reproduced a separate populated-upgrade test timeout at **20.17 seconds** without a sleep gap. Its test body performed all legacy database creation, 17 migrations, seeding, API setup and population before executing the actual upgrade and assertions, charging fixture work to the normal 20-second test budget. This is a test-harness lifecycle defect, not evidence that migration 018 changes legacy data. The failed repeat was stopped rather than represented as a complete pass.

Legacy preparation now runs in a scoped normal `beforeAll` fixture hook; its API and database pool close in `finally`. The actual migration runner, the populated-plan assertion, exact snapshots of all eight historical tables and the 18-entry ledger assertion remain in the test unchanged. A scoped `afterAll` drops only its owned upgrade database, including on failure. No timeout setting, assertion or migration changed. The authority-chain regression bodies and production correction remain intact.

The subsequent full normal-mode attempt passed all executed cases (**570 passed**) but failed the dairy end-to-end suite's single 30-second setup hook, leaving **14 unexecuted/skipped**. This was not counted as a clean run. Its hook combined database/API preparation, web-child startup and account/session provisioning. These now run in three ordered fixture hooks under the unchanged default limits, so each owned component is prepared in its proper lifecycle phase; test assertions, token lifetimes, authentication flow and teardown remain unchanged. This also prevents later startup phases from running after an earlier phase has failed.

A following targeted attempt executed all **14 end-to-end cases successfully** but exceeded verification's original combined 30-second initialization hook, leaving its 84 cases unexecuted. Verification initialization is likewise separated into database/API, identities/roles/profiles, and governance/privacy fixture phases; all assertions and default limits remain. The validation command was also corrected to remove `TSX_DISABLE_CACHE=1`, an isolation flag retained from the earlier read-only workflow rather than a repository setting. Final commands use normal transform caching, with cache files isolated by process-local temporary-directory settings. No persistent environment or private configuration is changed.

Normal-cached full execution then exposed HTTP **429** responses in six verification scenarios: unrelated cases shared the same API instance and consumed its real existing **120 requests per minute** budget. That failed attempt was stopped and retained. Verification scenarios now each own a real application instance and pooled HTTP client, closed after each case, so independent business tests do not share request-budget state. No production limiter, guard, tracker, limit or window is overridden. A new real-HTTP regression explicitly proves that one instance accepts its first 120 owner-detail requests and rejects request 121 with 429 and a positive Retry-After header. Production throttling is therefore tested rather than disabled. This adds one test, bringing the complete inventory to 585 cases, all executed and passed in the final acceptance run.

Only the dairy, recruitment and governed-verification integration test files, the dairy end-to-end test fixture and this completion record were changed in this continuation. Following the separately approved mechanical formatting correction, the single final acceptance pipeline completed successfully at **585/585**. Fresh-install, populated-upgrade and rerun migration validation passed: **18 ordered migrations with zero checksum mismatches**. All **297 captured files** remained unchanged during acceptance, including private configuration. The acceptance-only PostgreSQL container and temporary build backup were removed; acceptance reports were preserved outside the repository. No files were staged, committed, tagged, pushed, merged or deployed.
