# API proposal

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
