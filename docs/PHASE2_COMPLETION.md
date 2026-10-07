# Phase 2 — assessment, evidence gaps and development plans

Status: implemented for local pilot development; professional content and production release remain subject to validation. Phase 3 has not begun. Google Drive review is deferred by the founder and is not a blocker; no Drive files or scientific standards are claimed as reviewed.

## 1. Implementation

All four active tracks are supported: Commercial Dairy Practice, Veterinary Pharmaceutical Technical Sales, Poultry Farm Management, and Premix & Feed Additives Technical Sales. The existing 47 organizing groups are preserved. The review package's 69 unique child competencies, learning-outcome criteria, context and proposed assessment routes are now configurable versioned database records, with shared child identities reused across groups and pathways.

Every professional definition remains **PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION**. No final professional pass marks, competency weights, readiness percentages, mandatory practical gates, certification, public ranking or AI assessment were introduced.

## 2. Database changes

Additive migrations 003–007 add domains and pathway/group mappings; child versions, criteria and reusable group mappings; proposed pathway/role child requirements; assessment and item identities/versions; blueprints; rubrics; attempts and stored randomized item order; responses; criterion observations and human reviews; assessment-derived child evidence with context; evidence review history; independent moderation; appeals; development plans/items; and append-only question retirement.

Foreign keys enforce the candidate, attempt, item, pathway/group/child and criterion relationships. Delivery freezes question content, blueprint, rubric and referenced child definitions. Submitted responses cannot change. Plans preserve a repeatable-read requirement/evidence snapshot with an engine version. Updates to applied migrations are rejected by the existing checksum ledger. Seeds preserve existing reviewed data and assessment results.

Material normalization choices: existing `competencies` are organizing groups rather than repurposed child rows; blueprint joins provide domain/group/pathway metadata instead of repeating it in questions; rubrics are criterion collections per immutable item version; `context` is scoped JSON attached to assessment-derived evidence rather than a separate context table; current competency state and gaps are derived projections instead of competing mutable truth tables. Saved plans retain historical gaps. Old group-level self-declarations/documents are deliberately not interpreted as child competency proof.

## 3. API modules and endpoints

The Nest assessment controller delegates validation/authorization to the application service, SQL/transactions to its repository, and grading/gap/activity logic to pure domain functions. Full endpoint and input schemas are in [API.md](../API.md) and [OpenAPI](openapi.json).

Catalog: assessments and pathway hierarchy. Candidate: start/resume attempts, view/save responses, submit, view evidence, calculate pathway/role gaps, save/read plans, mark development activities complete, raise/read appeals. Staff: create assessment versions and mapped item versions/rubrics, release demos, retire assessments/items, assign active assessors, review assigned responses, record evidence decisions, moderate reviews, resolve appeals.

## 4. Candidate-facing experience

`/development` presents target pathway exploration, baseline demo catalog, attempt progress, evidence status, verified strengths, proposed gaps and saved individual plans. `/assessments/[id]` presents mapped tasks and rubric criteria, saves individual responses, resumes saved progress, submits and shows assessor feedback/appeal forms. The private profile dashboard links to these screens. Server fetches use the existing encrypted-session OIDC integration and no-store caching.

Forms are responsive and do not require video or large media. Progress survives connection interruption after a successful save; unsaved text does not yet survive closing a tab or a fully offline session. The baseline catalog currently contains four practice cases, not a professionally validated diagnostic examination.

## 5. Administrator/assessor functions

`/assessment-workspace` is capability-gated. Authors create demo drafts, map written/case tasks to children and use their learning outcomes as rubrics, release and retire versions. Objective task authoring is available through the API. Operators assign a submitted attempt to an active assessor by internal user ID. Assessors see only their assigned, non-self attempts and record each criterion once with comments. Independent staff can moderate and resolve appeals; reassessment preserves earlier review records.

The workspace is an operational foundation. Searchable assessor selection, subject/method-specific qualification and conflict registries, richer moderation navigation and content editing are future work. Staff identity is established by OIDC and database roles; possession of an assessor role is not proof of professional qualification.

## 6. Assessment architecture

Supported item types: single MCQ, multiple response, numerical, data interpretation, clinical scenario, farm scenario, case, short/extended written response, report, technical sales, file/image architecture and practical placeholder. File/image task metadata is modeled; private upload/delivery is not enabled. Asset references are rejected until secure storage/scanning/authorization exists.

Each item has a version, type, method, difficulty, intended evidence facet, validation status and mapped pathway/group/child/criteria. Answer keys remain server-side. Objective grading yields raw CORRECT/INCORRECT; other tasks require human rubric review. No aggregate case mark or exam percentage determines competence. Criterion observations are DEMONSTRATED, NEEDS_DEVELOPMENT or UNASSESSABLE, with comments; these are proposed observations, not approved certification anchors.

Four cases cover dairy investigation, layer performance, investigation before additive recommendation, and antimicrobial stewardship/ethical reasoning. They are marked **DEMO CONTENT — NOT YET APPROVED FOR PRODUCTION ASSESSMENT** and contain no authoritative dose or nutritional target.

## 7. Evidence and competency-gap logic

Evidence facets are distinct: SELF_DECLARED, DOCUMENT_VERIFIED, KNOWLEDGE_ASSESSED, CASE_ASSESSED, SIMULATION_VERIFIED, PRACTICALLY_VERIFIED and WORKPLACE_VERIFIED. Intended facet and actual review status are separate. Submission, objective correctness, human rubric feedback and activity completion never auto-verify competence.

The engine compares version-bound required facets with non-demo, unexpired VERIFIED evidence for the same child version with a demonstrated/correct observation. It reports UNVERIFIED, PARTIALLY_DEMONSTRATED or DEMONSTRATED, plus missing facets, supporting evidence IDs, diagnostic evidence IDs and policy validation status. Rejected/revoked/demo evidence cannot close gaps. Missing approved mandatory evidence is distinct from an unvalidated proposed requirement: all seeded mandatory values remain null. Knowledge and simulation cannot satisfy practical requirements.

Current live evidence creation is assessment-derived. Group-level self-declarations/documents remain separate; child-level external document, observed simulation, practical and workplace intake needs the secure evidence milestone. Online placeholders cannot produce verified simulation/practical/workplace claims. Approved non-demo knowledge/case evidence requires assigned human review and independent moderation of the latest review; the production content-approval endpoint is intentionally unavailable in this phase.

## 8. Individual development-plan logic

Each missing facet creates a corresponding learning, case/data task, observed simulation, supervised field assessment or workplace observation recommendation linked to its child version. Recommendations are generic evidence-route activities, not yet named course enrollments or a clinical prescription. A plan stores evidence IDs, requirements, gap states, activities, evaluation time, pathway/optional role target and engine version. New evaluations create new plans. Completing an activity does not update competency evidence.

Role requirements augment pathway requirements without duplicating child evidence; only roles belonging to the selected pathway version are accepted. No role-specific professional requirements are seeded. Presentation ordering is deterministic, not a validated professional prioritization algorithm.

## 9. Validation

See the validation record below for final results. Unit tests exercise objective grading, exact evidence facets, missing/expired/rejected/revoked/demo evidence and traceable activities. Real PostgreSQL/API tests exercise all four tracks, hierarchy, authoring/mapping, attempt ownership/resume/completeness/idempotence, review/moderation/appeal controls, raw outcomes, frozen versions, retirement, provenance, plans, role targets, audit events and migration/seed repetition. Isolated synthetic approval fixtures test verification/revocation protocols; they are never seeded as professional content.

Web protocol smoke checks use the production Next build with an isolated synthetic OIDC issuer and development-only loopback transport. They cover authenticated dashboard, development and assessment rendering, answer-key/token non-disclosure and staff denial. They are not a Playwright device/browser test or live Auth0 acceptance test.

## 10. Security considerations

Existing OIDC issuer/audience/signature/scope checks and scoped database RBAC remain active. New candidate reads/writes enforce ownership; assessor access additionally requires current permission and assignment and excludes self-assessment. Moderators/appeal reviewers cannot be the candidate or original assessor. Requests use strict schemas, bounded text/options, parameterized SQL, rate limits, private caching and transactional write audits without response text in logs.

Production prerequisites include real provider configuration, staff MFA, qualified assessor authorization, validated content governance, least-privilege database credentials, backup restore drills, retention/export/deletion workflows, privacy review and independent security testing. No candidate contacts, evidence or assessment results are exposed to employers by this phase.

## 11. Outstanding technical debt

Private scanned document/image storage; child-level external evidence and real supervised capture; authored provenance/review UI and production approval; specialty-specific assessor eligibility/conflicts; named learning-module mappings; browser/mobile/interruption accessibility testing; offline unsaved drafts; cursor pagination instead of bounded list limits; operational monitoring and recovery; multi-instance/session lifecycle hardening; richer staff queues and appeal notifications. Historical evidence remains immutable while current validity is a projection; full content-retirement impact review and automated expiry/revocation workflows remain pending.

## 12. Assumptions

The accepted review CSV is the working proposed catalog, not formal professional approval. Domain versions remain immutable after delivery, and evidence is not automatically transferred to a new version. Four synthetic cases suffice to test the engine, not assess the whole pilot professionally. No role-specific policy is implicitly approved. Auth0 remains the recommended provider, but no tenant/credentials exist yet; synthetic test identity does not block local work. Drive review is deferred. All staging/test data must remain synthetic.

## 13. Professional validation still required

Learning-outcome definitions and method/context applicability; observer calibration; rubric anchors; assessor qualification/authorization and conflict rules; required evidence combinations; validity/reassessment policies; moderation/appeal procedures; safety and professional scope; medicine labels/withdrawal/stewardship/pharmacovigilance; breed/system-specific production and nutrition references; data/KPI definitions and financial assumptions. Use current authorized VCN/NAFDAC requirements, applicable WOAH guidance, approved product documentation and relevant breeder/nutrition references during review. Those references are validation destinations, not claims that source texts were reviewed here. Nigerian privacy/legal review, including NDPA/NDPC obligations, is still required before live candidate data.

## 14. Recommended Phase 3

Validate and approve a small blueprint and rubric in each track; calibrate qualified assessors; configure Auth0; implement private scanned evidence storage and supervised simulation/practical/workplace capture; link gaps to a small governed training catalog; run a synthetic end-to-end pilot and recovery/privacy checks. Introduce readiness rules or scores only through a separately approved scoring methodology. Do not start Phase 3 without authorization.

## Final validation record

Validated in the current cloud checkout on 7 October 2026:

| Check                                                                         | Result                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Automated tests (`npm test`)                                                  | **78 passed**, 5 files, no failures/skips                       |
| ESLint (`npm run lint`)                                                       | Passed                                                          |
| Strict TypeScript (`npm run typecheck`)                                       | Passed, including scripts/tests                                 |
| Prettier (`npm run format:check`)                                             | Passed                                                          |
| PostgreSQL migrations/seeds (`npm run env:up`, integration repetition checks) | Passed; 7 total migrations; existing development data preserved |
| Production build (included in `npm test`)                                     | Passed: contracts/domain/API and Next.js routes                 |
| Dependency/security audit (`npm audit --audit-level=high`)                    | Passed; **0 vulnerabilities**                                   |
| OpenAPI regeneration (`npm run api:docs`)                                     | Passed                                                          |
| Git whitespace/ignored secret configuration checks                            | Passed; local database and web environment files ignored        |

Development reference-data check: 4 pathways, 47 groups, 69 children, 4 demo assessments; 0 reviewed/approved child definitions, 0 mandatory professional gates and 0 populated pass thresholds. Synthetic approval fixtures exist only inside the isolated test database workflow.

Cloud startup instructions were saved to the environment draft using the onboarding skill. This confirms persistence, not publication or fresh-task restoration. Review and save the draft in environment settings, then publish if you want the updated reusable environment activated. Existing installation instructions were preserved. Live Auth0 integration is untested because tenant configuration is absent; no secrets are requested in chat.
