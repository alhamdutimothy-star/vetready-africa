# Phase 3H implementation and validation report

## Current checkpoint and historical-report scope

Phase 3H was subsequently committed as `a14c2cd552406bca28e5317b0d9bd75b1244b3d1` and tagged `phase-3h-employer-matching-pilot`. The narrative and Git inventory below preserve the historical pre-commit report. References to uncommitted changes, Phase 3G HEAD and commit authorization describe that earlier state, not current Git status. See [Phase 3H.1 remediation](PHASE3H1_AUDIT_REMEDIATION.md) for that checkpoint and [Phase 3I completion](PHASE3I_COMPLETION.md) for the current uncommitted implementation and validation.

## Implementation summary (historical)

Implemented the authorized bounded technical pilot: one existing employer organisation, one opportunity with immutable requirement versions, declared technical eligibility, explainable immutable match receipts, candidate-controlled consent and a separate employer-safe projection, human shortlist events and atomic audit/provenance records. See [architecture and boundaries](PHASE3H_ARCHITECTURE.md).

Protected starting point: branch `feat/phase-3-training-verification`, commit `321948fc5db343707d5d75f7f32be665f1f60319`, tag `phase-3g-competency-profile`. Changes remain uncommitted. No commit, push, tag, merge, reset, rebase or deployment is part of this task.

## Changed-file inventory

31 changed/new files: 15 modified tracked files and 16 new files. The recovered 29-file Phase 3H implementation is preserved; the authorized security remediation adds changes to `apps/api/package.json` and `package-lock.json` and reconciles this existing report. The other 28 recovered files remain byte-for-byte unchanged. The complete inventory is the exact Git-status block below. The Phase 3G repository change extracts its existing fact-reader body into one shared server-only module; an AST/body comparison confirmed no change to that reader's logic. Existing migration-count assertions were advanced from 15 to 16; existing regression tests were retained.

## Migration and domain model

Additive migration `016_recruitment_technical_pilot.sql` adds pilot organisation/membership events, immutable policy metadata, job/version/requirement-target/event records, applications, immutable consent/shares/evaluations/application events/command receipts and scoped constraints/indexes. It uses existing organisations and memberships rather than creating duplicate employer identities. Job-target foreign keys and guards preserve referenced child definitions/context. Deferred constraints require atomic consent/projection/audit writes. Existing data is not rewritten by the migration; old migrations and the Phase 3G snapshot guards remain unchanged.

All professional gates and weighted fit remain UNCONFIGURED. The only evaluable gate kinds are declared pathway interest and explicit location/relocation conditions. A mandatory competency gate produces REQUIRES DOMAIN EXPERT VALIDATION and blocks technical eligibility/shortlist. Preferred matches cannot conceal mandatory mismatches. No automatic hiring/rejection, score, public discovery, placement or professional award exists.

## API and authorization

New endpoints live under `/api/v1/pilot`. All require existing bearer authentication; every operation performs current database authorization. Independent platform administration controls employer admission/suspension and membership access. Employer operations require exact organisation membership, current unexpired employer capability and active verified pilot status. Candidate actions require current ownership/capability. No authentication/session/OIDC internals or private configuration were changed.

Candidate applications are job-version and owner-snapshot bound. Consent is explicit. Employer reads/calculations/actions require a current active candidate grant and recheck current authoritative matching facts. Revoked/withdrawn/suspended/offboarded access receives concealed unavailable responses; cached command receipts never bypass authorization. Stale facts/job terms block actions. Optimistic revision checks and bounded full-transaction retries protect concurrency.

## Privacy, consent, matching and explanations

Employer output is an explicit nested allowlist with application aliases, selected competency categories, technical gate reasons and scoped provenance. Full owner snapshots, reviewer identities, narratives, private evidence/documents, moderation, audit records, authentication data, names and contacts are excluded. Free text and demographic data never enter the matching input. Declared location is used only when explicitly required/shared.

Every evaluation retains immutable versions, normalized inputs, results, calculation time and digests. Retrieval recomputes engine 1 and verifies exact historical results, while separate live checks prevent stale evidence from driving actions. Consent revocation blocks future access but preserves restricted history; withdrawal is a separate owner action. New sharing after changed facts requires a fresh explicit application. Already viewed copies cannot be technically recalled.

## Validation results

**Post-remediation rerun: 406/406 tests passed across 32 files, zero failures, skipped, pending or todo tests**, exit 0, full-suite duration 853.66 seconds. The totals are 194 unit, 199 integration and 13 end-to-end tests. This includes all 353 pre-existing tests and 53 Phase 3H tests: 19 domain unit tests, 6 server-action tests, 27 integration tests and one authenticated built-web end-to-end flow.

`npm run lint`, `npm run typecheck` and `npm run build` all passed with exit 0 after remediation. Strict checking covered contracts/domain/API, the web application and tooling/tests. The production build passed for contracts/domain/API and all Next.js routes; Next.js remains 16.4.1. A clean `npm ci --ignore-scripts --no-audit --no-fund` also succeeded in the isolated validation copy. Dependency security was checked separately with the unchanged high-severity audit gate.

The complete suite used `node node_modules/vitest/vitest.mjs run --testTimeout=120000 --hookTimeout=600000`, with default/JSON reporters and output outside the repository. No assertions or test files were removed or suppressed. Runtime source and dependency files in the isolated copy matched the working tree byte-for-byte before validation. Tests used synthetic OIDC servers and a disposable loopback PostgreSQL container with the repository's pinned PostgreSQL 17 image and a dedicated `_test` database. The configured persistent container's port was unavailable. No application/production migration was run; the disposable container was stopped and removed after validation.

The final database ledger contained exactly 16 migrations in filename order with zero checksum mismatches. Populated-015 preservation, migration reruns, seed no-op compatibility and consent/audit constraints passed. All 15 prior migration files remain unchanged from HEAD. The final policy row retained `professional_status=UNCONFIGURED` and `weighted_fit=UNCONFIGURED`.

Coverage includes unconfigured professional gates, exact evidence distinctions, mandatory/preferred precedence, deterministic locale-independent explanations, owner/organisation IDOR, explicit consent, revocation/read races, expired roles and replay denial, member offboarding, employer suspension, immutable versions/digests, source revocation/freshness, optimistic shortlist concurrency, duplicate-command serialization, canonical audit rollback, populated-015 migration preservation, all 001–016 checksums, seed no-op compatibility, deferred SQL consent/audit constraints, employer DTO/HTML privacy and the candidate→employer→shortlist→access-revocation flow. Existing Phase 3F/3G and authentication/session regressions passed.

All 59 tests across seven dedicated authentication/session/OIDC files passed, including PKCE, state/nonce, issuer/audience/scope, callback diagnostics, session revocation and tampered-session rejection. The ten protected authentication/session/OIDC/Next files still match `working-authentication-2026-10-20`. Phase 3F's 24 integration tests and Phase 3G's 18 integration tests passed, along with their domain/action regressions and private built-web views. Live identity-provider verification was not performed.

The additional repository-wide `npm run format:check` returned exit 1 for 157 existing CRLF checkout warnings. Read-only checks with CRLF normalized in memory removed all 157 failures. Supported recovered Phase 3H files pass formatting checks; the modified API manifest passes with canonical LF line endings, the lockfile is intentionally ignored by the formatter configuration, and SQL has no configured parser. No broad formatting or line-ending rewrite was applied. These checkout warnings are distinct from the passing ESLint, strict TypeScript and build checks.

## Security findings

The accepted recovery audit reported 13 affected package entries: two high and 11 moderate, with zero critical/low findings. The high entries were the `@nestjs/platform-express@12.1.2` / `multer@2.4.0` chain affected by [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), a high-severity asynchronous upload-filter denial of service. No upload interceptor or asynchronous Multer filter was found in application source, but the vulnerable installed dependency was remediated regardless.

The only direct dependency change is the API's exact `@nestjs/platform-express` pin from 12.1.2 to **12.3.0**, the earliest published compatible adapter release declaring patched Multer 2.5.0. Its official Nest common/core peer ranges are both `^12.0.0`; the existing common/core versions remain 12.1.2. No direct dependency crosses a major version.

The adapter requires Express 5.3.0 instead of 5.2.1 and Multer 2.5.0 instead of 2.4.0. Express's required subtree changes `content-disposition` from 1.1.0 to 2.0.1 and hoists/deduplicates the already present `content-type` 2.1.0 in place of the root 1.0.5 copy. The adapter is hoisted to the root dependency directory. Existing compatible `encodeurl` 2.0.0 and `on-finished` 2.4.1 were retained to avoid unnecessary patch updates. All unrelated lock entries and dependency declarations are unchanged. The resulting lockfile passed a clean install. No audit fix, override, downgrade, framework-major migration or CI-gate change was used.

**Post-remediation `npm audit --audit-level=high --json`: exit 0; zero high, zero critical, 11 moderate, zero low/info findings.** The high-severity CI blocker is resolved. The audit is not completely clean: the remaining 11 entries propagate one development-tooling [minimatch glob-amplification advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) through ESLint/typescript-eslint. Installed minimatch is 10.2.6; the advisory identifies 11.0.1 as patched. No production application use was found. A separately scoped compatible tooling remediation remains appropriate; no tooling downgrade or forced override was applied. The CI `npm audit --audit-level=high` gate remains unchanged.

## Domain-expert items and known limitations

All veterinary/animal-production/nutrition/pharmaceutical/regulatory/recruitment professional criteria, equivalences, mandatory competencies, assessor authority, validity periods, experience requirements, professional thresholds and weights require domain-expert validation. The pilot has no interface to activate them. Authentication proves account access, not professional identity or licensing.

This is one organisation/one stable opportunity, not a production recruitment platform. No placement, invitations, contact/document exchange, employer talent search or numerical ranking was implemented. Professional practical verification remains disabled under existing guards. Manual real-device/accessibility, live identity-provider, production load/restore and privacy/legal/retention reviews are not claimed. Bounded lists report truncation; form drafts are not an offline application. Historical engine implementations must be preserved. Database-operator privileges are outside application authorization boundaries. The moderate development-tooling advisory remains documented; the high-severity Multer advisory has been remediated.

## Preservation and final Git status

Checks confirmed HEAD and the peeled `phase-3g-competency-profile` tag remain at `321948fc5db343707d5d75f7f32be665f1f60319`. All 15 prior SQL migrations are unchanged from HEAD, and ten protected authentication/session/OIDC/CSRF/Next configuration paths match `working-authentication-2026-10-20`. There are no staged changes or merge conflicts. Relative to the remediation-start SHA-256 snapshot, only `apps/api/package.json`, `package-lock.json` and this report changed. All other recovered files, authentication implementation and CI configuration are preserved. Targeted credential-pattern/path scans found no secrets, private configuration, temporary files or unintended generated artifacts in the change set. The tracked OpenAPI specification remains the intentional Phase 3H API artifact. Professional thresholds, Job Ready/Field Ready, certification/licensing and unapproved weighted ranking remain inactive.

Exact implementation status (all changes unstaged; `??` means new/untracked):

```text
 M API.md
 M apps/api/package.json
 M apps/api/src/app.ts
 M apps/api/src/competency-profile/repository.ts
 M apps/web/app/dashboard/page.tsx
 M docs/openapi.json
 M package-lock.json
 M packages/contracts/src/index.ts
 M packages/domain/src/index.ts
 M tests/e2e/dairy-pilot.test.ts
 M tests/integration/cases.test.ts
 M tests/integration/competency-profile.test.ts
 M tests/integration/dairy-learning.test.ts
 M tests/integration/dairy-pilot.test.ts
 M tests/integration/practical.test.ts
?? apps/api/src/competency-profile/facts.ts
?? apps/api/src/recruitment/controller.ts
?? apps/api/src/recruitment/repository.ts
?? apps/web/app/employer-pilot/page.tsx
?? apps/web/app/opportunities/actions.ts
?? apps/web/app/opportunities/page.tsx
?? apps/web/app/pilot-governance/page.tsx
?? apps/web/lib/recruitment.ts
?? db/migrations/016_recruitment_technical_pilot.sql
?? docs/PHASE3H_ARCHITECTURE.md
?? docs/PHASE3H_COMPLETION.md
?? packages/contracts/src/recruitment.ts
?? packages/domain/src/recruitment.ts
?? tests/integration/recruitment.test.ts
?? tests/unit/recruitment-actions.test.ts
?? tests/unit/recruitment.test.ts
```

## Recommended next step

The bounded Phase 3H implementation and narrow dependency-security remediation are ready for commit review. Track the remaining moderate tooling advisory separately and arrange controlled pilot/privacy/domain review. Staging, committing, tagging, pushing, merging and deployment still require authorization and were not performed. No professionally validated recruitment or production-readiness claim is made.
