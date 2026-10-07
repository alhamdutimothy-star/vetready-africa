# Phased development roadmap

## 0. Approval and domain validation

Founder reviews this proposal and confirms PRODUCT.md assumptions, budget and pilot partners. Veterinary reviewers approve rubrics, gate policies, assessor eligibility and content. Nigerian counsel reviews professional/privacy obligations. Overall direction and Phase 1 implementation were approved with four pathways; detailed professional standards remain pending.

## 1. Foundation and identity

Pinned toolchain/manifests/lockfiles, CI, PostgreSQL migrations, OIDC, scoped roles, candidate/organization onboarding, private documents and audits.
Acceptance: fresh build and migrations succeed; onboarding works; cross-organization and role access tests pass; no secrets in Git.

## 2. Catalog and diagnostic

Immutable reviewed competency/pathway/content versions, baseline assessments and rule-based development plans.
Acceptance: publication freezes versions; diagnostic cannot verify competency; server scoring and idempotent submissions work; answer keys never leak.

## 3. Learning and human assessment

Small four-track catalog, case reports, observed tasks, authorized assessor assignments, moderation, appeals, expiry and revocation.
Acceptance: representative case and observed task in each of the four pilot tracks; conflicts/self-review blocked; critical errors override aggregates; interrupted progress/uploads resume; decision history retained.

## 4. Competency profile and Passport

Current competency projection, approved readiness policies, explained role score, consent-limited sharing, optional human-approved credentials.
Acceptance: deterministic SCORING_MODEL.md cases pass; no attendance-to-certification shortcut; expiry/revocation blocks readiness; share access/revocation and minimal credential verification tested. Credential issue awaits approved standards.

## 5. Recruitment proof

Verified employer vacancies, structured search, explained eligibility/fit, applications, shortlist, invitations and manual placement recording.
Acceptance: complete consented candidate-to-employer scenario; hard requirements enforced; missing evidence visible; contact permission enforced; organization isolation tested.

## 6. Pilot hardening and launch

Limited cohort, assessor calibration, moderated placement feedback, basic analytics, legal sign-off, security review and restore drill.
Acceptance: candidate→assessment→passport→job→placement E2E; bandwidth/load measurements; export/deletion verified; backup restore and incident exercise pass; limitations communicated.

## Later

Populate other approved pathways, mentorship scheduling, offline learning, payments, workforce analytics and governed AI according to measured demand. No multi-country expansion without local review.

## Tests and delivery

Vitest pure domain tests: scores, eligibility, critical errors, missing data, versioning and expiry. Real PostgreSQL integration tests: constraints, FK ownership, transactional finalization, concurrency, authorization and audits. API tests: owner, unrelated candidate, unrelated employer organization, expired assessor and unauthorized staff. Playwright mobile/desktop: onboarding, diagnostic, case submission, sign-off, passport consent and recruiting. Security tests: stale shares, answer-key leakage, malicious uploads, exports, administrator actions and privilege escalation.

CI includes type checks, relevant suites, migration validation, build and dependency/secret scanning. Confirm real tests ran; syntax checks alone do not establish readiness. Implemented tests and results are recorded in the Phase 1 and Phase 2 validation documents; browser-device and operational checks remain future milestones.

Use small feature branches, meaningful commits, reviewed PRs, SQL migrations, ADR updates and semantic pilot tags beginning 0.1.0 when implemented. Staging uses synthetic data. Deployment authorization is separate from architecture approval. Schedule follows confirmed team/budget/content capacity; no invented delivery dates.

## Phase 1 outcome and next milestone

Implemented foundation: monorepo, managed authentication adapter, database RBAC, private basic profiles, pending organizations, configurable draft pathways/competencies, evidence records, audit logging and migrations/tests. Live Auth0 tenant setup and production operational controls remain outstanding. Full candidate qualification/registration/experience editing and private file handling are not yet complete.

Next milestone: validate the taxonomy, authors/reviewers and baseline assessment design; implement versioned diagnostic delivery, gap analysis and development plans without issuing competency credentials. Continue provider integration and private document infrastructure in parallel. No professional thresholds are introduced until validated.

## Phase 2 outcome and proposed Phase 3

Assessment, hierarchy, evidence-gap and development-plan foundations are implemented across the four tracks. Demo practice and human review work locally; approved production content and real observed performance capture remain unavailable. See [completion report](docs/PHASE2_COMPLETION.md).

Phase 3 requires new authorization: validate four small blueprints/rubrics and assessor eligibility; configure Auth0; build private scanned storage and supervised evidence capture; map gaps to a small governed learning catalog; run an end-to-end pilot. Scores/readiness rules still require separate methodology approval.
