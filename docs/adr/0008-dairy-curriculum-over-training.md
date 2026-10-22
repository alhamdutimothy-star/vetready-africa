# ADR 0008 — Dairy curriculum over governed training snapshots

Status: accepted for Phase 3E engineering; professional definitions remain proposed.

The starting checkpoint is f7c26c2 on feat/phase-3-training-verification. Phase 3B already owns immutable consumed course/module/lesson versions and enrollment/progress. Phase 3C owns case blueprints and version-bound rubrics. Phase 3D owns the functional dairy investigation and private assessor workflow. These remain the systems of record.

A learning unit is a one-to-one metadata overlay on an existing lesson version. A curriculum overlays an existing course version. Seventeen thematic dairy domain outlines reference existing child competency versions through validated course competency mappings. They organize teaching; they neither duplicate the canonical competency domain/group/child hierarchy nor create new professional claims. Shared competencies remain shared.

Migration 013 adds three tables only: dairy_curricula, dairy_learning_units, dairy_learning_activities. Domain scopes, source references, contextual sections, objectives and prerequisite guidance are bounded validated JSON snapshots. Cross-object course/lesson identities use composite foreign keys; domain/prerequisite child references are checked against existing training mappings by triggers while locking the parent version. Existing training reference guards freeze the referenced definitions. Metadata is append-only from creation. Editing requires a new governed course version with new unit snapshots.

The training repository accepts an optional transaction client for atomic composition. Course creation, mappings and metadata commit or roll back together. Existing training APIs retain their previous transaction behavior. No authentication or role grants change.

A learning activity is an unscored, version-bound reflection or dataset interpretation. Append-only responses have optimistic revisions and enrollment-scoped idempotency commands. Ownership, active released content and revision sequencing are enforced both in application logic and database triggers. Audit metadata omits response text. Activities do not write assessment attempts, evidence, verification, readiness, passports or awards. Reading completion still uses Phase 3B's existing command engine.

Prerequisites are proposed evidence guidance, not unvalidated professional admission gates. Missing, expired, rejected and demo evidence cannot satisfy the displayed verified-evidence indicator. A reading-based next-unit suggestion is explicitly distinct from a readiness or development-plan scoring rule. Existing Phase 2 gap/planning engines are not replaced.

Professional approval remains inactive: Phase 3B deliberately prevents EXPERT_REVIEWED/APPROVED training activation. This phase preserves that safeguard. Unreleased DRAFT content is owner-only; explicit demo release retains DRAFT and warnings; retirement hides public discovery/new work while retaining enrolled historical access. Sources are reference leads pending document/claim-level verification, not claims of literature review. The source model can preserve reviewer/date/edition/geographic notes and supersession without asserting authority.

The starter contains three original-text DRAFT units. It links the transition unit to the existing explicitly released Phase 3D case version. No additional clinical case or rubric engine is introduced. Calf and records units have unscored activities but no falsely claimed case assessment. Existing rubric dimensions, assessor judgments, moderation and separate evidence verification remain authoritative. Practical capture remains the Phase 3A architecture; this phase does not activate its verification gates.

Production editorial approval, validated clinical references, additional case families, practical verification policy, certification, readiness and hiring are deferred. This is a governed functional software demonstration, not a clinically validated curriculum.
