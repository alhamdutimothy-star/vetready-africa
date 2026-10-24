# 0009 — Practical evidence review over versioned external submissions

Status: implemented software demonstration; professional policy remains unconfigured.

Phase 3A already owns external source identities, version-bound competency mappings,
canonical evidence receipts, transition provenance and audit events. Phase 3F extends
these identities rather than introducing a competing competency or certification ledger.
Migrations 001–013 and authentication/session/OIDC implementations remain unchanged.

Migration 014 adds an explicit `practical` discriminator, optimistic draft revision,
append-only save commands, candidate declarations, private review assignments and
immutable decisions. Existing Phase 3A records retain their previous workflow and
values. Partial drafts may omit summary, task and targets; declaration/submission
requires a complete saved snapshot. The exact declaration wording is versioned in
the migration and shared domain constant. Submitting creates existing canonical
EXTERNAL_SUBMISSION receipts, always UNVERIFIED and demo.

Stable submission locks precede version locks. Save commands carry a bounded payload
digest and return their original acknowledgement on exact replay; changed payloads
under the same command ID conflict. Concurrent stale saves, duplicate successors
and competing decisions fail instead of overwriting history. Transactions include
canonical audit writes and roll back on audit failure. Narratives, declarations and
review rationales are not copied into general audit metadata.

The existing assessment:assign capability authorizes assignment, revocation and
audited administrator reads. assessment:review permits only currently assigned,
independent active users to view/decide private reviews. Reassignment removes the
previous reviewer's access. Candidate ownership is always derived from the session,
never a body-supplied identity. There is no employer/public sharing endpoint.

Final demonstration decisions are DEMONSTRATED_IN_DEMO, NEEDS_REVISION or REJECTED.
They cannot be edited or deleted. An explicit successor references the latest
decision, preserving its predecessor. Identity sequences provide deterministic
assignment/decision ordering even within one database transaction. Evidence
correction creates a new version and supersedes its predecessor atomically; a
withdrawn version can also receive a successor. Every successor needs a fresh
declaration and assignment. Revocation preserves receipts, decisions and history.
A revoked predecessor can receive a successor draft while retaining its REVOKED
state; creating that draft never reinstates the predecessor or its claims.
The immutable canonical receipt is qualified by its source-version lifecycle in
the owner manifest and gap projection; revocation does not erase or rewrite it.

Professional assessor eligibility/scope, rubric/policy approval, supervision
standards, evidence sufficiency and validity rules remain unconfigured. Existing
production verification blockers stay in place. This implementation deliberately
supports demonstration review without claiming professional verification. It
cannot mark practical evidence VERIFIED, award readiness or create certification.

Gap explanations use existing version-bound pathway_child_requirements proposed
facets. A child without configured proposed facets reports NOT_CONFIGURED; the
software does not invent a practical gate for it. Exact facet matching avoids an
invented equivalence between case reasoning and practical/workplace observation.
Results link canonical evidence/source IDs and distinguish missing, draft,
pending, insufficient, rejected, revision-requested, withdrawn, superseded,
revoked and expired evidence. Expert configuration remains an explicit blocker,
including when another facet has active canonical evidence. No readiness score,
percentage, pass mark, weight, expiry duration or certification rule is generated.

The interface uses small text forms and server-rendered private history. Candidate
draft inputs remain controlled after failed saves, provide explicit acknowledgement
and warn on unsaved browser departure. Submission is disabled while draft changes
are unsaved. No media uploads, localStorage, offline background synchronization or
third-party tracking is introduced. Browser-crash recovery is limited to confirmed
server saves; mobile interaction still requires user-observed verification.
