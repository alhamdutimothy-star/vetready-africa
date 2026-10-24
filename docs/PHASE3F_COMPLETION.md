# Phase 3F — Practical Competency Verification reconstruction

Baseline: `33ef819dd7c23631eb5d10d6d98cbb81779086f5`.
Branch: `feat/phase-3-training-verification`.

This is a controlled reconstruction from the verified Phase 3E baseline, not a
recovered copy of the unavailable cloud patch. Historical test counts and dependency
claims are not treated as validation evidence for this implementation.

## Scope and design

The implementation extends the Phase 3A evidence source/version/receipt model and
the Phase 3C owner evidence manifest, with entry points from the Phase 3D dairy
candidate and staff workspaces. It shares candidate identity, proposed competency
definitions, pathway requirements, permissions and the canonical audit log with
Phases 3C–3E. The existing learning/case engines are preserved. See
[ADR 0009](adr/0009-practical-evidence-review.md) for design decisions.

Migration `014_practical_verification.sql` is forward-only. It adds practical source
discrimination, partial-draft constraints, revision checking, save-command receipts,
declarations, assignments and decisions. Existing legacy submissions remain on
their original guarded workflow. No prior migration or stored professional rule
is rewritten.

Candidates can create private text evidence, partially save/resume it, select
version-bound competency/facet mappings, declare and submit a complete saved
snapshot, withdraw eligible versions and create traceable successor drafts.
Summary, task, mappings and declaration freeze at submission. A fresh declaration
is required for each successor. Canonical receipts remain UNVERIFIED demo sources.

Administrators with assessment:assign can assign active independent platform
reviewers, inspect evidence through explicitly audited reads and revoke submitted
versions. Reviewers need assessment:review and the current exact-version assignment.
Reassignment removes old reviewer access. Candidates cannot inspect others' data;
reviewers cannot inspect arbitrary private evidence. No public or employer access
is added. Final review outcomes are immutable; a correction appends a decision
referencing its exact predecessor. Assessor rationale is visible to the owner as
feedback; assignment reasons are staff-only.

Version supersession and revocation retain the original content, canonical receipt,
declarations, decisions and events. Administrative revocation is a source-lifecycle
event, not destructive editing of the canonical receipt. The private evidence
detail preserves source history; a revoked predecessor retains REVOKED when a successor
draft is created. A new declaration and assignment are required for that successor.
The owner manifest exposes the external source version/status and latest
demonstration review. Candidate gap
explanations trace to evidence/source IDs and existing proposed facets, including
missing evidence, insufficient facet verification, drafts, pending reviews,
revision requests, rejection, withdrawal, supersession, revocation, recorded expiry
and requirements awaiting expert configuration.

All seven requested capabilities are implemented as software demonstration
workflows. Production practical competence awards remain blocked because approved
professional assessor/rubric/policy requirements are absent. Demonstrated-in-demo
is explicitly distinct from VERIFIED. Readiness remains null and readiness rules
remain inactive.

## APIs and UI

The generated OpenAPI document describes typed request bodies. The private API
includes candidate options/list/create/detail/save/submit/withdraw/revision and
pathway-gap routes; current-assessor queue/detail/decision routes; and explicit
administrator queue/detail/assignment/revocation routes. API.md lists paths.

Candidate `/practical` and `/practical/:id` provide draft forms, declarations,
feedback, lifecycle/version history and traceable gap explanations. Staff use
`/practical/review` and `/practical/admin`, with private detail pages. Existing dairy
candidate/staff workspaces link to these pages. Forms use escaped text, bounded
fields and generic safe errors. No new browser authentication or configuration
is introduced. Controlled draft fields retain text after failed saves, show saved
revisions, detect concurrent changes and disable declaration/submission while
unsaved changes remain. The design uses no media dependencies.

## Auditability and consistency

Database guards independently enforce active owner/assignment/capability/lifecycle
constraints, prevent destructive edits/deletion of decisions/declarations/assignment
history and generate canonical audit records. Stable submission/version row locks
serialize saves, successors and finalization. Save command replay compares a
payload hash; stale revisions and reused commands with different payloads conflict.
All writes are transactional with audit and canonical receipts. Audit metadata
omits candidate summaries, task text, declarations and assessor rationales.

## Validation

Fresh complete validation on 24 October 2026 used the existing dedicated local
PostgreSQL test database and synthetic identity server. The complete rebuilt suite
passed **308/308 tests across 27 files, with no failures or skipped tests**. This
includes all prior regressions and 42 new tests: 12 domain/contract unit tests,
5 server-action tests, 24 PostgreSQL/API integration tests and 1 built-web HTTP
end-to-end test added to the existing dairy end-to-end suite. No historical test
count was targeted.

| Check                                        | Fresh result                                                       |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Complete `npm test`                          | PASS: 308 tests / 27 files; 0 failures, 0 skips                    |
| Contracts/domain/API foundation builds       | PASS                                                               |
| Next.js production build                     | PASS, Next.js 16.4.1                                               |
| Strict TypeScript                            | PASS: npm run typecheck (contracts/domain/API/web/tooling/tests)   |
| `npm run lint`                               | PASS                                                               |
| `npm run format:check -- --end-of-line auto` | PASS, whole repository                                             |
| Fresh/populated migration checks             | PASS, 001–014 checksums and reruns, populated 013→014 preservation |
| `npm audit --json`                           | PASS: 0 vulnerabilities at every severity                          |
| `git diff --check`                           | PASS                                                               |

The default Prettier check flags CRLF line endings in untouched Windows baseline
files. The complete check above uses Prettier's `auto` line-ending option without
changing formatter configuration or reformatting protected/unrelated sources.

The fresh audit initially identified vulnerable Next.js, Zod and body-parser
packages in the baseline. Compatible security updates installed Next.js 16.4.1,
Zod 4.6.7, body-parser 2.4.0 and its qs 6.16.1 dependency. Only the web dependency
manifest and shared lockfile changed; authentication/configuration source did not.

New coverage includes strict input contracts, empty drafts, duplicate mappings,
exact-facet gap logic, declarations, save replay, concurrent saves/successors,
ownership, review privacy, reassignment, immutable/superseding decisions,
withdrawal/redeclaration, revocation, audit privacy/rollback, populated 013 upgrade,
checksums/reruns and built-web private-page/feedback behavior. Server-action tests
cover failed saves, stale revisions, validation and confirmed acknowledgements.

## Limitations and expert review

- All new reviews are demonstrations. No professional eligibility, approved
  practical rubric, supervision standard, pass mark, score/weight, validity period,
  mandatory readiness gate or certification criterion is invented or activated.
- Existing competency content remains PROPOSED/DRAFT; no content is promoted.
- No uploads, external evidence authentication, offline synchronization, public
  passport, employer verification, matching, deployment or certificate is added.
- Lists show at most the latest 100 versions with an explicit truncation flag;
  direct owner history remains accessible. Gap calculations use all owner sources.
- The text form and API support multiple exact competency/facet targets. Distinct
  contexts should use separate evidence submissions. Administrative assignment
  uses an existing user ID.
- Veterinary experts must validate competency applicability, source authenticity,
  supervision evidence, assessor eligibility/scope, criteria, rubric/policy,
  sufficiency, conflict handling and any future validity/reassessment rules.
- User-observed Windows/Android interaction and live Auth0 verification are not
  implied by automated checks. The protected authentication implementation is
  preserved rather than reconfigured or newly clinically validated.

Changes remain unstaged and uncommitted. No commit, push, merge, tag, deployment,
history reset or private-configuration edit is authorized or performed.

## Preservation and transfer verification

The branch and exact baseline HEAD remain unchanged. All 10 tracked authentication,
session, OIDC, CSRF and Next configuration paths checked against the protected
`working-authentication-2026-10-20` tag remain unchanged. The protected tag and
authentication preservation commits remain ancestors. Migrations 001–013 match
their baseline Git blobs and were not edited. Only migration 014 is added; no
production database migration was run.

There are **37 changed/new repository files**, listed below. The live Git index
remains empty. The export tool refuses protected/private paths and plausible
literal credentials, exports tracked changes plus every non-ignored new file, and
never stages files or writes Git history. It dry-checks and applies the patch to
isolated copies of the changed baseline sources, then compares all resulting files
with the working tree, normalizing CRLF to LF for Git text equivalence. A separate
manifest records the patch SHA-256 and each actual working-file SHA-256. The patch
is not applied to the live repository. Final artifact locations are supplied with
the completion message.

## Complete file inventory

- API.md
- apps/api/src/app.ts
- apps/api/src/cases/repository.ts
- apps/api/src/practical/controller.ts
- apps/api/src/practical/repository.ts
- apps/web/app/dairy/page.tsx
- apps/web/app/dairy/review/page.tsx
- apps/web/app/practical/[id]/page.tsx
- apps/web/app/practical/actions.ts
- apps/web/app/practical/admin/[id]/page.tsx
- apps/web/app/practical/admin/page.tsx
- apps/web/app/practical/detail.tsx
- apps/web/app/practical/draft.tsx
- apps/web/app/practical/page.tsx
- apps/web/app/practical/queue.tsx
- apps/web/app/practical/review/[id]/page.tsx
- apps/web/app/practical/review/page.tsx
- apps/web/lib/practical.ts
- apps/web/package.json
- db/migrations/014_practical_verification.sql
- docs/adr/0009-practical-evidence-review.md
- docs/openapi.json
- docs/PHASE3F_COMPLETION.md
- package-lock.json
- packages/contracts/src/index.ts
- packages/contracts/src/practical.ts
- packages/domain/src/index.ts
- packages/domain/src/practical.ts
- scripts/export-phase3f.mjs
- tests/e2e/dairy-pilot.test.ts
- tests/integration/cases.test.ts
- tests/integration/dairy-learning.test.ts
- tests/integration/dairy-pilot.test.ts
- tests/integration/practical.test.ts
- tests/integration/training.test.ts
- tests/unit/practical-actions.test.ts
- tests/unit/practical.test.ts
