# ADR 0007 — Functional dairy workflow reuses assessment/evidence and adds private review drafts

Status: implementation proposed for owner review; uncommitted.

Reuse the Phase 3C Transition & Fresh Cow template, stages and dimension mappings. Adopt an existing matching draft; if already delivered, create its next version under the same assessment identity. Never retrofit new input formats onto consumed answers. Dairy-only preparation is explicit and idempotent, followed by the existing separate DEMO release.

Structured reasoning remains canonical `candidate_responses` JSON. A generated pilot-only revision clock prevents stale overwrites without rewriting old rows or duplicating answers. Supplied facts and response categories are immutable governed case-version metadata.

Append-only private review draft revisions support interrupted work. Finalization reuses canonical assessor reviews/observations and evidence processing; a bound finalization record and deferred constraint require exact draft provenance. The alternative of a second review/evidence engine was rejected. Replays recover acknowledged or lost responses; returned moderation requires a fresh review revision.

Explicit candidate/staff projections protect rubric/guidance material at the API boundary, including older access paths. Candidate text stays in memory on a failed save; no persistent browser storage of clinical material or major offline architecture is introduced. Existing JWT/session/CSRF and role grants remain unchanged.

Migration 012 is additive, scoped to pilot versions, and preserves all old table rows. Technical text/revision bounds are not professional scoring thresholds. All new professional guidance remains DRAFT; finalized feedback is not competence, practical verification or readiness.
