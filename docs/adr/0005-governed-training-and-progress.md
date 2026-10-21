# ADR 0005 — Governed training snapshots and learning progress

Status: Accepted for Phase 3B foundation; professional rules remain unapproved.

## Decision and invariants (defined before migration 010)

Use one course-version aggregate containing ordered module-version and lesson-version rows. Stable course/module/lesson identities are separate from snapshot UUIDs. Module and lesson revisions inherit their course revision number and lifecycle; they are not independently published. Composite FKs enforce course/module/lesson identity and parent version consistency. This is smaller and safer than independently publishing incompatible hierarchy versions.

Every course version has author, objectives, references, pathway applicability and validation notice. Keep DRAFT → EXPERT_REVIEWED → APPROVED → RETIRED as the target lifecycle; production approval/expert-review transitions are disabled in 3B. Explicit demo release retains DRAFT status and freezes the entire snapshot. Retirement is terminal and preserves history. No non-demo course can be created in 3B.

Reusable competency links reference exact existing group/child versions, scoped to declared pathway versions. Assessment links reference exact existing Phase 2 versions; demo release permits already released DEMO or already APPROVED assessments in the mapped pathways, without approving or copying them. No question, attempt, evidence or score is duplicated. Published source definitions referenced by training cannot be silently reinterpreted; version rather than rewrite referenced definitions. A retired assessment can make a historical reference unavailable without creating a pass or new attempt.

Enrollment pins a course version and candidate. Self-enrollment requires that owner; administrative assignment requires an explicit platform capability. New versions do not inherit previous completion. Retired courses forbid new enrollment and progress writes, while owners can inspect their historical enrollment and completed records. Completion remains attributable to its exact snapshot.

Lesson progress is the only learning state persisted; missing rows mean NOT_STARTED. Derive module/course state and completion time from lesson rows. Completion is absorbing; bookmarks may change without erasing completion. No progress write touches assessments, evidence, assessor decisions, readiness or claims.

Commands are owner-scoped, idempotent by enrollment/command UUID, and reject payload reuse. Expected revisions reject stale edits; enrollment row locking serializes concurrent commands. A replay returns the original command result; clients must refresh or compare revisions before replacing newer local state. Resume offsets count Unicode code points in immutable plain text. Offline/PWA caching and sync queues are deferred; no private response is publicly cached.

Audit important content, enrollment and progress-state transitions into existing audit_events within the same transaction. Do not copy text bodies into audit metadata. Use database constraints/triggers for integrity and service checks for authenticated authorization; the shared DB account is trusted infrastructure, not per-user RLS.

## Scope and consequences

Add two explicit capabilities (training:manage, training:assign) for ADMIN/SUPER_ADMIN only, without changing existing permissions or authentication logic. Admin content authority is not professional assessor qualification. Training is text-only, demo-only and available through API foundations, with no new UI, upload provider or video infrastructure. The course aggregate release is intentionally conservative; independently reusable lessons, production content approval, equivalence/credit transfer and safety withdrawal policy need separate review.

**TRAINING COMPLETION ≠ COMPETENCE VERIFICATION.** No threshold, weight, official award, certificate, readiness rule or public Passport is introduced.
