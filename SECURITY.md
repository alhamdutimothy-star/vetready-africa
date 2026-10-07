# Security, privacy and Nigerian operating review

## Permission model

Authorization combines capability, resource ownership, organization membership, assessor assignment and candidate consent. Deny by default. A role name alone is never enough.

| Role                | Allowed                                                                                     | Important limits                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Candidate           | Own profile, training, attempts, passport, shares, applications, export and appeals         | Cannot verify own evidence or view answer keys/other candidates                                                  |
| Employer member     | Own verified organization's vacancies, recruiting records; permissioned candidate summaries | No unrestricted database, private contacts, raw evidence or other organizations' notes                           |
| Trainer / mentor    | Assigned content drafting and learner feedback                                              | Cannot publish standards or independently certify their own learners                                             |
| Assessor            | Assigned attempts within approved current competency/method authorization                   | No self/conflicted assessment; no broad candidate search or role grants                                          |
| Administrator       | Delegated operations, employer review, content/assessment queues, moderation                | Split publication, verification and support capabilities; no default super-admin or unrestricted document access |
| Super administrator | Privileged configuration and role grants under MFA                                          | Cannot bypass professional assessor qualifications; exceptional data access requires recorded reason and audit   |

Users can have multiple assignments. New roles are permission bundles without schema redesign. Credential approval and high-stakes moderation are separate permissions, with separation of duties.

## Controls

Managed OIDC password authentication/recovery; provider must offer modern password hashing and breach protection. MFA mandatory for staff/assessors, recommended for employers. Verified email, session rotation/revocation, Secure/HttpOnly/SameSite cookies, PKCE, CSRF checks and restricted redirect URIs. Rate-limit login, reset, search, export, submission, upload and verification endpoints. Validate inputs and file limits; parameterize SQL; sanitize authored HTML; CSP, HTTPS, restrictive CORS and secure headers.

Private encrypted object storage with short-lived scoped upload/download grants. Quarantine new files, verify size/type and malware-scan before use. Content-type checks cannot rely solely on a filename. Signed URLs expire quickly but may remain usable until expiry after revocation; proxy highly sensitive downloads when immediate revocation is required. Redact employer payloads server-side and use no-store caching. QR/passport links are revocable and expiring; public credential status contains minimal facts and prevents enumeration.

Use separate development/staging/production databases, least-privilege credentials, secret management, encryption in transit/at rest, dependency scanning, reviewed migrations and restricted backup access. Never use real candidate CVs in tests. Record security events with alerting and an incident response owner. Test cross-organization access and bulk scraping controls, not just login.

Consent controls: separate enrollment agreement, optional employer discovery, named employer passport access and contact release. No blanket consent for every purpose. Restrict third-party referee data and farm evidence; collect only necessary details. Access logs and minimal data exports should be intelligible to candidates. Revocation blocks new accesses immediately at authorization time; notify recipients of deletion obligations where relevant. Existing lawful recruitment records may have different retention rules.

Set a documented retention schedule per record category; legal holds are exceptional, documented and reviewed. Deletion must cover storage, identity provider and processors, with backup expiry and restoration re-deletion procedures. Explain any legally retained minimized records. Maintain processing records, privacy notices, processor agreements and data-subject request workflows.

Backups: managed encrypted database backups/PITR where supported, object versioning with bounded retention, isolated recovery credentials, quarterly restore exercises. Provisional RPO 24h/RTO 8h; founder and operations approval required. A backup without a restore test is insufficient.

## Nigeria-specific professional/legal validation

This is a planning checklist, not a legal opinion or confirmation of current regulatory detail. No live authoritative-source verification was available for this draft; qualified Nigerian counsel and veterinary reviewers must check the current texts and applicability before launch.

- **Nigeria Data Protection Act 2023 and NDPC requirements:** establish controller/processor roles, lawful bases per processing purpose, notices, rights, appropriate security, vendor contracts, international transfers and incident handling. Determine whether registration as a controller/processor of major importance, a DPO, compliance filings and a DPIA are required. Verify current NDPC guidance and any surviving applicable instruments; do not treat consent as the universal lawful basis.
- **Data breach procedure:** counsel must confirm notification triggers, recipients and timelines; design prompt detection and escalation rather than hard-code an unverified legal deadline.
- **Veterinary Council of Nigeria and applicable veterinary legislation:** validate protected professional titles, registration status, permitted practice, student supervision, CPD/accreditation claims and whether any certificates imply regulated authorization. Platform readiness is not a license.
- **NAFDAC and relevant medicines authorities:** validate product dossiers, lawful veterinary medicine promotion, adverse-event reporting routes, antimicrobial stewardship and technical-sales content. Pharmacovigilance simulations do not replace formal reporting obligations.
- **Farm/animal welfare and biosecurity:** approved supervision, site access, occupational safety, infection control and safe animal handling; define incident responsibility and appropriate insurance/liability arrangements.
- **Recruitment and consumer protection:** obtain advice on private employment/recruitment agency obligations, advertising claims, terms, complaints, paid services and applicable employment/labour rules. Verify employers and prohibit deceptive job postings and undisclosed candidate charges.
- **IP/confidentiality:** license training materials, product data and assessment cases; farm owners retain confidentiality rights. Candidate submissions require a narrow purpose license, not unlimited commercial reuse.
- **Fairness:** avoid protected/demographic factors, school prestige and opaque automated employment decisions; accommodate disability where feasible; provide human review and correction. Collect demographic monitoring data only with a justified separate basis and restricted access.

Official validation sources to consult: `ndpc.gov.ng`, `vcn.gov.ng`, `nafdac.gov.ng`, current Nigerian legislation and regulator publications, plus qualified Nigerian counsel. These are reference destinations, not verified legal assertions.

## Threats and acceptance tests

Test object-ID tampering, organization crossover, consent revocation, answer-key leakage, score manipulation, forged uploads, signed-link sharing, replayed submissions, malicious course HTML, excessive searches, stale caches, privilege escalation and exports. Audit denied attempts without sensitive payloads. Staff emergency access must be time-limited and reviewed.

## Current implementation versus launch controls

Implemented: cryptographic access-token verification, PKCE/state/nonce browser flow, encrypted cookies, server-side database RBAC, organization ownership, private-profile defaults, owner-only evidence, Zod validation, rate limiting, Helmet API headers, structured redacted request logs and append-only write audit events.

Pending before production: Auth0 tenant/live verification and MFA policy, dedicated runtime database role, private object storage/scanning, provider logout/revocation behavior, formal data retention/export/deletion, detailed assessor/moderation/appeal execution, additional privileged-operation protections, CSP hardening and operational backups/restore. No production-ready or regulatory compliance claim is made. The local database credential is randomly generated in ignored private files; no production identity credential is fabricated.
