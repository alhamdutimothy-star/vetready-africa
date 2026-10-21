# Phase 3B exit report — governed training and learning progress

**IMPLEMENTED and validated; uncommitted for owner review. STOP before Phase 3C.**

## Starting checkpoint

Repository: `vetready-africa`. Branch: `feat/phase-3-training-verification`. Accepted starting and current HEAD: `df6c0ca3bc67e1a1627286473e59115353cf3464`. The starting tree was clean and synchronized with origin. The Windows-verified authentication tag remains an ancestor; other local branches and all tags are unchanged.

## A. Exact files created (11)

- [TRAINING_MODEL.md](../TRAINING_MODEL.md)
- [apps/api/src/training/controller.ts](../apps/api/src/training/controller.ts)
- [apps/api/src/training/repository.ts](../apps/api/src/training/repository.ts)
- [apps/api/src/training/service.ts](../apps/api/src/training/service.ts)
- [db/migrations/010_governed_training.sql](../db/migrations/010_governed_training.sql)
- [docs/PHASE3B_COMPLETION.md](../docs/PHASE3B_COMPLETION.md)
- [docs/adr/0005-governed-training-and-progress.md](../docs/adr/0005-governed-training-and-progress.md)
- [packages/contracts/src/training.ts](../packages/contracts/src/training.ts)
- [packages/domain/src/training.ts](../packages/domain/src/training.ts)
- [tests/integration/training.test.ts](../tests/integration/training.test.ts)
- [tests/unit/training.test.ts](../tests/unit/training.test.ts)

## B. Exact files modified (16)

- [API.md](../API.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [CHANGELOG.md](../CHANGELOG.md)
- [COMPETENCY_MODEL.md](../COMPETENCY_MODEL.md)
- [DATABASE.md](../DATABASE.md)
- [README.md](../README.md)
- [ROADMAP.md](../ROADMAP.md)
- [SCORING_MODEL.md](../SCORING_MODEL.md)
- [SECURITY.md](../SECURITY.md)
- [apps/api/src/app.ts](../apps/api/src/app.ts)
- [docs/PHASE3_ARCHITECTURE.md](../docs/PHASE3_ARCHITECTURE.md)
- [docs/openapi.json](../docs/openapi.json)
- [packages/contracts/src/index.ts](../packages/contracts/src/index.ts)
- [packages/domain/src/index.ts](../packages/domain/src/index.ts)
- [scripts/seed.ts](../scripts/seed.ts)
- [tests/integration/evidence-foundation.test.ts](../tests/integration/evidence-foundation.test.ts)

No dependency/lockfile, private configuration, environment file, authentication/session source or migration 001–009 was modified. The application composition root only imports/registers the training controller/service/repository; its existing guards, middleware, sessions and exception filter are unchanged.

## C. Migration summary

Forward-only `010_governed_training.sql` introduces twelve training tables: stable course/module/lesson identities; their course-aggregate/module/lesson snapshots; pathway, competency and assessment references; enrollments; lesson progress; immutable command receipts. It adds integrity/audit functions, ownership/version/source checks and narrowly scoped permissions. PostgreSQL 17 is already pinned by development setup and CI; nullable mapping uniqueness uses native `NULLS NOT DISTINCT`.

Only `training:manage` and `training:assign` are added, granted to platform ADMIN/SUPER_ADMIN. Existing permission rows, role grants and all other application data are preserved. Fresh migrations run before roles are seeded, so the seed script adds these same four permission mappings conditionally after migration 010 exists. It does not create demo courses, grant assessor qualification or change older-schema upgrade fixtures.

The populated 009→010 test includes existing users/profiles/grants, pathways/definitions, browser sessions, assessment attempts/responses/evidence, external submission/evidence history, assessor proposals and audit records. Old rows compare exactly before/after, excluding only the two explicitly authorized new permission codes and their four new mappings. The repository migration runner is repeatable and checksum-verified; the SQL file is forward-only, not a standalone rerunnable schema-reset script.

**Only dedicated local `_test` database schemas were reset/migrated for tests. The development/production database was not migrated or reset.**

## D–F. Domain, hierarchy and versioning

The model is Course → Module → Lesson, with stable UUIDs/codes separated from snapshot UUIDs. Each course revision is a complete, ordered aggregate. Child snapshots inherit that course revision's version number, lifecycle, author/reference provenance and fixed demo notice; modules/lessons are not independently published into incompatible hierarchies.

Creating a next version reuses matching stable module/lesson codes but creates fresh snapshot UUIDs. Enrollment pins the exact course revision. Released metadata, hierarchy, body, objectives, mappings and referenced competency meaning cannot be silently rewritten. Use a new version for changed content; previous completion is never automatically transferred.

Target governance remains DRAFT → EXPERT_REVIEWED → APPROVED → RETIRED. Professional review/production approval/non-demo creation are disabled in 3B. Explicit `release-demo` leaves status DRAFT, adds a demo-release timestamp and freezes the complete snapshot. Retirement is terminal and preserves owner history. This conservative release distinction is documented in [ADR 0005](adr/0005-governed-training-and-progress.md).

## G. Progress/resume model

Enrollment is unique per candidate/course version and records SELF or ASSIGNED, actor, request and server timestamp. Active enrollment retries preserve the original row/provenance. Administrative assignment requires its explicit capability; ownership is derived from the authenticated principal for self-enrollment.

Lesson rows are canonical learning state: missing = NOT_STARTED; otherwise IN_PROGRESS or COMPLETED. Persist exact course/module/lesson versions, resume position, revision and timestamps. Completion is absorbing and keeps its original completion time even if the bookmark later changes. Derive module/course completion/counts/timestamps from lesson rows; there is no independently editable completion counter or readiness store.

Resume offsets count Unicode code points in immutable plain text. Command UUIDs and expected revisions provide retry safety and reject stale/conflicting updates with 409. Enrollment row locks serialize concurrent writes. An identical retry returns the original immutable receipt, including after retirement; it does not mutate current state. Clients must compare revisions or GET current enrollment before replacing newer local state with an old response. New writes/new enrollments into retired content are blocked; owner history remains readable.

Completion is a self-reported participation marker. It proves neither reading nor mastery. Every progress result explicitly has `competenceVerified:false`; receipts must match actual persisted learning state and cannot carry a fabricated verification result.

## H. Competency mapping

Many-to-many course/module/lesson links reference exact existing group OR child versions, scoped to declared pathway versions. Composite FKs and guards enforce hierarchy and applicability; no taxonomy is duplicated. All four initial pathways use the same shared primitives. These links answer what learning supports, not what a candidate has proven. The 47 groups and 69 child definitions are not repopulated with new professional values.

## I. Phase 2 assessment integration

References point to exact existing assessment versions in applicable pathways. Demo release accepts released DEMO or already APPROVED Phase 2 assessments; training cannot approve them. Retired assessment status is visible on the historical reference. Questions, responses, grading, attempts, rubric observations and moderation remain in Phase 2. No training action creates an attempt or pass. Existing assessment APIs must be used separately.

## J. Phase 3A evidence interaction

The canonical evidence ledger/source constraints and verification safeguards remain authoritative. Training never inserts assessment results, external submissions, competency evidence, assessor decisions, readiness classifications or claims. The integration suite snapshots non-training data around full course completion and proves it unchanged (apart from intentional training audit events). External evidence verification remains blocked. No storage adapter/upload capability is added.

## K. Authorization/security

Existing Auth0/OIDC, PKCE/state/nonce, issuer/audience, `vetready:access`, browser sessions, cookies/logout and permission-check behavior are unchanged. Only two database-backed administrative capabilities and composition-root registrations are added. Administrative content authority does not qualify a professional assessor. Candidate progress is owner-scoped at API/service/repository boundaries and protected by database guards/composite FKs. Other candidates cannot read or change an enrollment; foreign enrollment IDs return 404.

Existing private `Cache-Control: no-store` and server request limits remain. No new secret, credential, CORS/session setting, upload URL, media provider or public cache is required. Audit metadata excludes lesson bodies/reports. Unknown internal/audit failures retain safe 500 responses; known input/lifecycle errors use generic 4xx responses without leaking SQL details.

The shared database service account remains trusted infrastructure, not per-user RLS. Future clients must not supply actors/owners/demo/approval flags, and future offline storage requires a separate private-data policy. This phase's tests use synthetic signed tokens and PostgreSQL; no new live Auth0 browser-flow claim is made.

## L. Database invariants

- Unique stable codes, course revision numbers and ordered child identities.
- Composite parent FKs prevent cross-course or mismatched module/lesson versions.
- Complete declared pathways/hierarchy and valid source references required for demo release.
- Released snapshots and referenced competency definitions/structure are immutable.
- Source links point to existing exact definitions/assessments, with scoped pathway integrity and no duplication.
- Enrollment authority/active owners are enforced; no reassignment or duplicate candidate/version enrollment.
- Progress belongs to the enrollment owner and exact lesson version, with bounded resume positions and sequential revisions.
- Completion cannot be erased or redated; retired content rejects new progress writes.
- Commands cannot conflict/rewrite previous receipts or fabricate their stored result.
- Important content/enrollment/progress transitions append to canonical audit_events in the same transaction. Audit failure rolls back state and receipt.
- No training-to-verification/award write path exists.

## M. Tests added and retained

**27 new tests:** six domain/contract unit cases and twenty-one PostgreSQL/API integration cases. They cover all four pathways, hierarchy/version integrity, explicit demo release, management/assignment authorization, cross-user access/mutation, missing JWT/scope, idempotency, duplicate/concurrent updates, stale revisions, Unicode resume, absorbing completion, old-command replay, new-version credit isolation, retirement/history, immutable references, invalid mappings, populated 009 upgrade, repeatable migrations/seeds, forged receipt rejection, audit rollback and the absence of competence/evidence side effects.

All **157 pre-existing tests remain**. The Phase 3A upgrade snapshot assertion was adapted only to exclude the two explicitly added capability codes from its post-upgrade permission comparison; every old row is still compared. The new suite separately requires exactly the four intended ADMIN/SUPER_ADMIN mappings, preventing accidental broader grants. No tests were removed, skipped or disabled.

## N. Complete validation

| Check                                                         | Final result                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run lint`                                                | PASS                                                         |
| `npm run format:check`                                        | PASS                                                         |
| `npm run typecheck`                                           | PASS — strict API/domain/contracts/web/tooling               |
| Full `npm test`                                               | **184 passed / 15 files**, zero failed/skipped               |
| Targeted training subset (before final full-suite rerun)      | **27 passed / 2 files**; subset of 184, not additional tests |
| Foundation builds                                             | PASS — contracts/domain/API                                  |
| Production Next.js build                                      | PASS                                                         |
| Populated 009→010 upgrade and migration/integrity/rerun cases | PASS                                                         |
| Existing authentication/session regression                    | PASS within the full suite                                   |
| Phase 2 assessment regression                                 | PASS within the full suite                                   |
| Phase 3A evidence regression                                  | PASS within the full suite                                   |
| `npm run api:docs`                                            | PASS — OpenAPI regenerated for the training routes           |
| `npm audit --json`                                            | PASS — **0 vulnerabilities** at every severity               |
| `git diff --check`                                            | PASS                                                         |
| Migrations 001–009 baseline SHA-256 comparison                | PASS — all nine unchanged                                    |

A final formatting/lint check also covers this report. Temporary fixture diagnostics were removed. No unresolved test or build failure remains. A bounded 120-second setup allowance is scoped to the new multi-schema populated-upgrade fixture; ordinary test assertions remain subject to the existing limits.

## O. Git diff/status

The tree contains **16 modified and 11 new files (27 total)**, including this report. Nothing is staged or committed. HEAD and the tracked origin branch remain `df6c0ca`; all work is uncommitted for review.

Ordinary tracked-file `git diff --stat` (new files are listed separately above):

```text
 API.md                                        |  24 +
 ARCHITECTURE.md                               |   4 +
 CHANGELOG.md                                  |   7 +
 COMPETENCY_MODEL.md                           |   4 +
 DATABASE.md                                   |   6 +-
 README.md                                     |   6 +-
 ROADMAP.md                                    |   8 +-
 SCORING_MODEL.md                              |   4 +
 SECURITY.md                                   |   4 +
 apps/api/src/app.ts                           |   6 +
 docs/PHASE3_ARCHITECTURE.md                   |  22 +-
 docs/openapi.json                             | 929 ++++++++++++++++++++++++++
 packages/contracts/src/index.ts               |   1 +
 packages/domain/src/index.ts                  |   5 +-
 scripts/seed.ts                               |  13 +
 tests/integration/evidence-foundation.test.ts |  12 +
 16 files changed, 1041 insertions(+), 14 deletions(-)
```

```text
## feat/phase-3-training-verification...origin/feat/phase-3-training-verification
 M API.md
 M ARCHITECTURE.md
 M CHANGELOG.md
 M COMPETENCY_MODEL.md
 M DATABASE.md
 M README.md
 M ROADMAP.md
 M SCORING_MODEL.md
 M SECURITY.md
 M apps/api/src/app.ts
 M docs/PHASE3_ARCHITECTURE.md
 M docs/openapi.json
 M packages/contracts/src/index.ts
 M packages/domain/src/index.ts
 M scripts/seed.ts
 M tests/integration/evidence-foundation.test.ts
?? TRAINING_MODEL.md
?? apps/api/src/training/
?? db/migrations/010_governed_training.sql
?? docs/PHASE3B_COMPLETION.md
?? docs/adr/0005-governed-training-and-progress.md
?? packages/contracts/src/training.ts
?? packages/domain/src/training.ts
?? tests/integration/training.test.ts
?? tests/unit/training.test.ts
```

## P. Outstanding risks and assumptions

- This is an API/domain/data foundation, not a finished candidate training UI or production curriculum. Tests supply clearly labeled neutral demo content; no production training seed is installed.
- Aggregate course publication is intentionally conservative. Independently published/reusable modules and content equivalence require later policy/schema review.
- Lists are capped; large catalogs need cursor pagination and incremental lesson delivery. Enrollment-wide locking should be measured before a larger rollout.
- Offline/PWA caching, sync queue UX, notifications, cross-device reconciliation and command retention remain deferred. An old idempotency response must not overwrite newer client state.
- Existing owners retain retired snapshots for read-only history. Real-content safety withdrawal, redaction/deletion and progress/audit retention require explicit privacy/professional review.
- No development/production migration, deployment or live browser training test was performed. No new UI exists to exercise; the workflow is verified through authenticated HTTP/API and PostgreSQL tests.
- New permission grants are migration/seed changes only, not a migration of domain roles into Auth0.

## Q–S. Professional validation, secrets and explicit safeguards

**PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION:** real learning objectives, professional references, competency applicability/equivalence, production reviewer eligibility, professional assessment/criterion standards, safety retirement policy and any later competence/progression requirements.

**No secret values or private environment contents were printed, changed, rotated or included in the change set.** A bounded static scan of changed files found no private-key/token/secret-assignment pattern flags; this does not claim a historical repository credential audit. No new secrets are required.

**No professional pass marks, weights, readiness percentages, practical gates, qualification thresholds, treatment protocols, nutrient values or professional expiry standards were invented or activated.** Technical size/revision/position limits are software constraints. Negative tests submit prohibited fields to prove rejection, not to establish professional values.

**Training completion never automatically produces knowledge/case/practical verification, JOB READY/FIELD READY/ADVANCED, official awards, certificates or public Passport claims.** No production approval, upload infrastructure, public ranking/sharing, employer matching, placement, payment, AI decision or native app was activated.

## T. Recommended Phase 3C (not started)

After owner review, implement one small synthetic Poultry Farm Management layer-production investigation linked to this training foundation and the existing Phase 2 case/rubric engine. A minimal candidate interface may show learning/resume status and hand off to the existing assessment workflow. Preserve diagnostic observations/provenance; keep all case content DEMO and professionally unvalidated until reviewed. Do not add a second case engine, real uploads, official claims or readiness rules.

**STOP: no commit, push, merge, deployment or Phase 3C work. Owner approval is required for the next milestone.**
