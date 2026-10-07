# ADR 0001 — Evidence-first modular monolith

Status: approved overall direction; Phase 1 refinements recorded in ADR 0002.

Decision: Next.js frontend, NestJS modular API, PostgreSQL, managed OIDC, private S3-compatible storage and pure versioned scoring rules. Start with four pathways; human verification and credential decisions are mandatory.

Rationale: relational integrity, explicit domain boundaries and one development language suit a small team and trust-sensitive workflows. Avoid distributed transactions and premature service infrastructure.

Alternatives: Next.js-only is simpler initially but weaker for explicit complex workflow boundaries. Django is strong for administration and preferable with a Python-oriented team, at the cost of a second frontend/backend language. Supabase accelerates infrastructure but still requires thoroughly tested server workflow authorization and RLS. Microservices and document-first databases add complexity without a pilot benefit.

Consequences: operate two Node services and reviewed migrations; managed identity reduces credential handling but requires vendor/cross-border review. Auth0 is recommended for the pilot. The runtime is installed; live tenant setup remains pending.
