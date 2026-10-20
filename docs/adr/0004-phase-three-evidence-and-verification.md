# ADR 0004 — Extend canonical evidence with governed submission provenance

Status: Accepted for Phase 3A foundation only (2026-10-20).

## Context

Phase 2 already owns assessment attempts, responses, rubric observations, child evidence, gaps and audit. External practical submissions need revision provenance without duplicating these authorities. The verified authentication tag `working-authentication-2026-10-20` is a protected dependency, not part of this change.

## Decision

Extend `competency_evidence` with a typed source discriminator and a composite-FK-backed external submission version source. Keep existing assessment constraints and verification branches. Use stable submission identity, consecutive immutable submitted versions and normalized targets. Capture state provenance and canonical audit events atomically with triggers. Enable only owner draft/submit/withdraw/revise transitions in this foundation; reserve human-review states for later work.

Assessor profile/scope proposals are immutable and cannot grant professional authority. Domain primitives require independently governed eligibility, assignment, scope, conflict clearance and versioned rubric/policy for future review; the workflow remains disabled. Expose no new HTTP route. Storage is an interface with no implementation or upload endpoint.

Migration 009 is forward-only, preserves populated 008 records and checksums, and uses source-specific constraints. Old assessment services still default to `ASSESSMENT`; external receipts remain unverified and cannot enter their review joins. Keep the existing gap engine and group-level legacy API unchanged.

## Consequences and trade-offs

Triggers provide ownership/source/state integrity and atomic audits even if a future service has a defect. They do not replace service authorization or isolate users sharing a database login. Lifecycle/reference triggers increase concurrency/locking complexity; future services must handle state conflicts and retry whole transactions only for genuine database serialization/deadlock errors. No generic retry of professional decisions is authorized.

The phase boundary is enforced in the database, not just documentation. A later migration must explicitly enable scoped professional review and governance; no feature flag can award external competence today. That conservatism intentionally delays useful review operations until rubrics and professional policies are approved.

No content, weighting, readiness, expiry, certification, storage vendor or credential-signing decision is made by this ADR.
