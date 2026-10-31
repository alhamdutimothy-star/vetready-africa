# Phase 3H — bounded technical recruitment pilot

This is an authenticated technical pilot, not production recruitment. One existing organisation can be independently admitted and one stable opportunity can be created. New requirement versions retain the same opportunity identity. There is no public candidate search, ranking, hiring/rejection action, placement workflow, contact exchange or document access.

## Professional boundary

CLAIMED ≠ ASSESSED ≠ VERIFIED. Training, legacy group claims, knowledge, cases and practical evidence remain separate. The pilot uses the unchanged Phase 3G engine and a shared server-only fact reader. Existing owner-only routes remain owner-only. No employer can invoke snapshot creation as a candidate.

Only declared pathway interest and explicit state/relocation conditions are evaluated as technical gates. They are declarations, not professional qualifications. Every competency requirement returns UNCONFIGURED / REQUIRES DOMAIN EXPERT VALIDATION, even if a related facet has an existing supported verification record. Mandatory professional gates block eligibility and shortlist. Preferred professional requirements remain visibly unconfigured and never contribute a numerical score.

Technical outcomes are ELIGIBLE, NOT_ELIGIBLE, UNKNOWN or UNCONFIGURED, scoped explicitly to DECLARED_TECHNICAL_CONDITIONS_ONLY. No mandatory requirements yields UNCONFIGURED. A preferred match cannot hide a mandatory mismatch. No outcome changes application status or automatically hires/rejects a candidate. Weighted fit and professional policy are always UNCONFIGURED; scores/weights, certification and licensing remain null; professional readiness remains UNAVAILABLE.

## Identity and access

Organisations, memberships, users and roles are reused. Admission requires an active platform ADMIN/SUPER_ADMIN role and its existing assessment:assign administrative capability. This is an explicitly bounded pilot-governance boundary, not a new assessor or veterinary authority. An administrator belonging to the organisation cannot verify it. No role or permission catalogue data is changed by migration 016.

Employer operations require an active user, existing exact organisation membership, current unexpired organisation-scoped employer:own capability, active pilot membership access, and both verified organisation/pilot status. Suspensions/offboarding are append-only events plus current state, checked in the database on each request. No JWT role claims are accepted. Existing authentication/session/OIDC implementation and private configuration are unchanged.

Consent revocation and membership-access changes also advance the pilot organisation's access revision. Requests waiting on its lock must retry their repeatable-read transaction with fresh authorization, preventing an earlier transaction snapshot from retaining an outdated grant after the access cutoff.

Employer application access additionally requires an active candidate/candidate capability, active application and current GIVEN consent. Organisation rows and application rows are locked in a consistent order around sensitive actions, reads and revocations. Full transactions retry bounded serialization/duplicate-command races. Actor/command IDs bind scope and request digest; changed payload reuse is a conflict. Replay is checked only after current authorization and never returns a cached candidate projection.

## Requirements, consent and provenance

Each saved job version is immutable, including its requirements. Editing appends a version and returns the opportunity to DRAFT. Publishing/closing is explicit. Requirement identifiers are unique within a version; typed requirements allow no weights, scripts, demographic signals or arbitrary scoring expressions. Professional targets retain foreign keys to exact child versions. Job-referenced definitions and pathway mappings cannot be mutated; use a new definition/version instead. These guards apply only to newly referenced pilot content.

Candidates see the named recipient, job terms and consent scope. An explicit application uses a candidate-owned immutable Phase 3G snapshot and saves an immutable selected-facts share. New applications require current matching-relevant facts. The application, consent, projection and audit event are atomic; a deferred database constraint rejects partial inserts or unaudited state changes. No public discovery is enabled. Application commands cannot supply another candidate identity or normalized facts.

The share contains only matching-required interest/location declarations and selected competency facet metadata. Free text, names, driving declarations, contact information, assessment answers, documents, reviewer identities, private notes, moderation and audit records are not matching inputs. Employer projection objects are explicitly constructed and strictly validated again by the web layer. Internal evidence identifiers and full snapshot inputs never appear in employer responses; per-application aliases and scoped provenance references are used instead.

Consent revocation immediately blocks subsequent employer list/detail/calculation/action access. Application withdrawal is separate and also revokes access. Immutable consent/evaluation/audit history is retained; it is not a continuing access grant. A previously viewed or copied disclosure cannot be recalled. Refresh requires withdrawal and a new explicit application/snapshot; the pilot has no implicit re-sharing mechanism.

## Matching and historical receipts

Evaluations bind immutable job requirements, policy/engine versions, candidate-selected snapshot/share, calculation time, exact normalized inputs, explanations and SHA-256 digests. Retrieval reruns the retained deterministic engine and verifies input/result digests and exact stored result. New employer reads/actions recompute the authorized matching facts from current authoritative sources. Relevant declaration, verification, moderation, revocation, supersession or validity changes block stale results. Unshared facts do not leak or invalidate evaluations merely because they changed.

Closed/revised job terms also block old evaluations. Historical receipts remain unchanged and restricted. Current validity is established at the transaction's evaluation time; no system can guarantee that evidence will not change after a response has been delivered. A shortlist action rechecks current facts and its exact evaluation before writing an append-only human action. Optimistic revisions prevent lost updates. REMOVE only clears a shortlist flag; it does not reject the application.

## Migration 016

Migration 016 is additive and forward-only. It introduces only pilot organisation access/events, policy metadata, one job and immutable versions/targets/events, applications, consent events, shares, evaluations, application events and command receipts, plus scoped guards/indexes. It does not modify migrations 001–015 or any pre-existing table contents during migration. Existing functions and professional guards are preserved. Runtime independent verification may update the existing organisation verification-status projection atomically with its new immutable event.

No dependency or secret is introduced. Migration 015's immutable owner receipts and professional-determination restrictions remain unchanged. New evaluation guards independently prohibit numerical scores/weights and professional awards. Audit failures roll back associated writes.

## Screens and limitations

`/opportunities`: named employer/job terms, explicit application/share and owner revocation/withdrawal controls.

`/employer-pilot`: exact authorised organisation, immutable job versions, consented application aliases, technical explanations and manual shortlist controls.

`/pilot-governance`: independent organisation admission/suspension and member offboarding/restoration. It cannot approve professional policy or weights.

Server rendering, bounded lists and text-first forms avoid media requirements. Errors are generic and private data is no-store. Command retries preserve idempotency, but employer form drafts are not an offline autosave system. The first 50 applications are shown with an explicit truncation notice; no broad discovery or production-scale pagination/operations is claimed. A later production design needs granular recruitment capabilities, per-tenant distributed quotas, retention/legal review, accessibility/mobile testing, load/restore testing and a separately authorized professional policy/verification workflow.
