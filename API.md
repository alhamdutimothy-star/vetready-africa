# API specification

The Phase 2 routes below are implemented. The later table records the long-term API proposal and must not be interpreted as implemented functionality. [OpenAPI](docs/openapi.json) is regenerated from the current Nest controllers.

## Implemented Phase 2 routes

All routes use `/api/v1`, bearer access tokens, database permissions, strict input schemas and private response caching. Invalid input is 422, missing owner/assignment resources 404, denied capability 403 and invalid lifecycle transition 409. No answer keys are returned in candidate or assessor attempt views.

| Capability                     | Routes                                                                                                                          | Behavior                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Catalog                        | `GET /assessments`, `GET /pathways/:id/hierarchy`                                                                               | Deliverable assessment catalog and complete mapped hierarchy with validation notices                              |
| Candidate owner                | `POST /assessments/:id/attempts`, `GET /candidates/me/attempts`, `GET /candidates/me/attempts/:id`                              | Start/resume and private attempt details                                                                          |
| Candidate owner                | `PUT /candidates/me/attempts/:id/responses/:item`, `POST /candidates/me/attempts/:id/submit`                                    | Save typed response; complete/idempotent submission creates unverified evidence                                   |
| Candidate owner                | `GET /candidates/me/competency-evidence`                                                                                        | Assessment-derived child evidence, intended facet and actual review status                                        |
| Candidate owner                | `GET /candidates/me/pathways/:id/gaps`, `POST /candidates/me/pathways/:id/development-plans`                                    | Explainable evidence gaps or saved evaluation snapshot; optional `roleId` query requires matching pathway version |
| Candidate owner                | `GET /candidates/me/development-plans`, `POST /candidates/me/development-plan-items/:id/complete`                               | Private plans/items; completion does not verify competence                                                        |
| Candidate owner                | `POST /candidates/me/attempts/:id/appeals`, `GET /candidates/me/assessment-appeals`                                             | Reasoned appeal and own appeal history                                                                            |
| assessment:author              | `GET/POST /admin/assessments`, `POST /admin/assessments/:id/items`                                                              | Draft version authoring, mapped task versions and criterion rubrics                                               |
| assessment:author              | `POST /admin/assessments/:id/release-demo`, `POST /admin/assessments/:id/retire`, `POST /admin/assessment-items/:id/retire`     | Demo-only release; immutable content retirement                                                                   |
| assessment:assign              | `GET /admin/assessment-attempts`, `POST /admin/assessment-attempts/:id/assign`                                                  | Submitted queues and assignment to an active non-self assessor                                                    |
| assessment:review + assignment | `GET /assessor/attempts`, `GET /assessor/attempts/:id`, `POST /assessor/attempts/:id/reviews`                                   | Scoped responses and complete criterion observations/comments                                                     |
| assessment:review + assignment | `POST /assessor/evidence/:id/reviews`                                                                                           | Reasoned verification/rejection/revocation; demo/unvalidated/online practical verification blocked                |
| assessment:moderate            | `POST /admin/assessment-reviews/:id/moderations`, `GET /admin/assessment-appeals`, `POST /admin/assessment-appeals/:id/resolve` | Independent latest-review moderation and appeal resolution                                                        |

Response inputs contain exactly one of `selected`, `value`, `text` or a reserved private `assetId`; asset delivery is currently rejected. MCQ selection must reference the delivered options, numeric values must be finite, and written responses are bounded. Tasks submitted via the author API require pathway-compatible group/child IDs and criterion IDs belonging to that child. `SINGLE_MCQ`/`MULTIPLE_RESPONSE`/`NUMERICAL` may generate only knowledge evidence. Written/observed tasks cannot carry trusted automated answer keys. Objective raw correctness does not imply a pass or final readiness score.

Evidence transitions: UNVERIFIED→VERIFIED/REJECTED, VERIFIED→REVOKED. Rejected/revoked evidence requires a new evidence record for correction; prior review history is retained. Verification of approved non-demo knowledge/case evidence requires human review and independent moderation. Production content approval and real observed simulation/practical/workplace capture are intentionally unavailable. See [completion boundaries](docs/PHASE2_COMPLETION.md).

## Long-term API proposal

REST `/api/v1`; OpenAPI generated and reviewed during implementation. JSON schemas and DTO validation, cursor pagination, structured error codes, request IDs, ISO timestamps, UUID identifiers. Server computes scores; callers cannot submit a trusted final score or verification state.

| Resource     | Representative routes                                                                                    | Authorization                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Session      | `GET /me`, `POST /session/logout`                                                                        | Own server-validated identity                                                                               |
| Candidate    | `GET/PATCH /candidates/me`, qualifications/experience subresources                                       | Candidate owner; staff scoped review                                                                        |
| Catalog      | `GET /pathways`, `/competencies`, `/courses`                                                             | Published content only for candidates                                                                       |
| Learning     | `POST /enrollments`, `PUT /progress/:lessonId`                                                           | Own eligible enrollment; revision checks                                                                    |
| Attempts     | `POST /assessments/:id/attempts`, `PUT /attempts/:id/responses/:questionId`, `POST /attempts/:id/submit` | Own eligible attempt; frozen version; idempotent submission                                                 |
| Assessor     | `GET /assessor/assignments`, `POST /attempts/:id/decisions`                                              | Assigned, authorized, unconflicted assessor                                                                 |
| Verification | `POST /decisions/:id/verify`, `/revoke`                                                                  | Authorized reviewer; reason required                                                                        |
| Passport     | `GET /candidates/me/passport`, `POST /passport-shares`, `DELETE /passport-shares/:id`                    | Owner grants; recipient receives permitted projection                                                       |
| Documents    | `POST /documents/upload-grants`, `POST /documents/:id/complete`, `POST /documents/:id/download-grants`   | Purpose/owner/scope checks; scanned files only                                                              |
| Employers    | `POST /organizations`, `GET/PATCH /organizations/:id`                                                    | Membership and capability scope                                                                             |
| Recruitment  | Vacancy CRUD, `GET /vacancies/:id/matches`, `GET /talent`, shortlist/application/invitation routes       | Verified employer + explicit discoverability/share; applications owned by candidate or vacancy organization |
| Credentials  | `GET /credentials/verify/:token`, privileged issue/revoke routes                                         | Public minimal status; issue requires qualified human approval                                              |
| Appeals      | `POST /appeals`, `GET /appeals/:id`, reviewer decision route                                             | Subject or independent assigned reviewer                                                                    |
| Operations   | `/admin/review-queues`, `/admin/analytics`                                                               | Granular staff permissions; aggregate privacy thresholds                                                    |
| Privacy      | `POST /privacy/export-requests`, `/privacy/deletion-requests`                                            | Authenticated owner, sensitive action reauthentication                                                      |

Creation uses 201; reads 200; missing authentication 401; denied access 403 or deliberately concealed 404; invalid input 422; stale revision/transition 409; rate limits 429. Apply consistent anti-enumeration policy. Use idempotency keys for final submission, application creation and credential issue, bound to identity and request-body digest.

Match response includes eligibility, score or interval, coverage, policy/vacancy version, component contributions, strengths, gaps and missing requirements. Passport response never includes hidden fields simply because frontend components do not display them.

Uploads use a grant → quarantine → scan → accepted/rejected lifecycle. Progress and answer autosave report revision and acknowledged time. Future external integrations use separate scoped service identities; not candidate session tokens.

## Implemented Phase 1 endpoints

Health/readiness, `/me`, candidate GET/PUT, pathway interests, pathway/competency catalogs, organization registration/owner read, evidence submission/owner reads, administrator summary and privileged role assignment are implemented. Remaining route groups above are design proposals. Evidence source is a candidate declaration; source `PRACTICAL` is not a verified practical assessment.

`npm run api:docs` regenerates [OpenAPI](docs/openapi.json). Development API serves documentation at `/api/docs`; production documentation middleware is disabled. Error payloads omit tokens, database details and configuration values. Private responses use no-store. Catalog/evidence reads are bounded for the small pilot; cursor pagination will be introduced before larger recruitment datasets.

## Auth0 checkpoint

Browser-session endpoints: POST /api/v1/sessions and DELETE /api/v1/sessions/current require a valid access JWT and vetready:access. Revocation also requires the matching X-VetReady-Session handle. These endpoints grant no domain roles.
