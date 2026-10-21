# ADR 0006 — Dairy-first cases extend existing assessment versions

Status: proposed implementation for owner review.

Commercial Dairy Practice is the first operational curriculum, while all existing pathway definitions and shared competencies remain reusable.

Use existing assessment versions as the aggregate version for a case, ordered items, rubric criteria, attempts, reviews, moderation and competency evidence. Add only case scenario/provenance, ordered reasoning stages and criterion dimension tags. A template is proposed professional content, not an authoritative software rule. The author binds existing competency and criterion version IDs explicitly.

Alternatives rejected: a separate case-attempt/score/evidence engine would duplicate provenance and RBAC; a JSON-only stage array would lose relational identity and cross-item rubric constraints; automatic release/verification from training would violate competency integrity.

The existing authoring repository accepts an optional transaction client so the case composition and all its audit writes commit atomically. Non-case callers retain their existing transaction behavior. Ordered cases use stage positions; legacy non-randomized assessments preserve their existing UUID order.

DEMO delivery remains separate from professional approval. Production case approval is disabled at the database boundary. Expert review/approval, effective dates, practical verification and readiness rules remain a later governed milestone. This limits the increment to an inspectable, reproducible demonstration vertical; it does not claim a production professional verification workflow.

The owner-only manifest projects existing evidence without creating a new ledger or public Skills Passport. It provides provenance and independent facets, never training-derived readiness, practical awards or rankings.

Migration 011 is additive; old data must compare exactly across a populated 010 upgrade, including learning progress and sessions. Older upgrade tests retain every prior-table assertion while avoiding comparisons between old and newly introduced empty table names.
