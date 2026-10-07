# ADR 0002 — Phase 1 persistence and identity boundary

Status: implemented under founder's Phase 1 authorization; production provider configuration outstanding.

Use reviewed SQL migrations and parameterized node-postgres transactional repositories for the foundation. This replaces the initially suggested Prisma routine layer without changing PostgreSQL, domain boundaries or public API. It avoids competing ORM/schema sources while modeling composite ownership constraints and immutable records. An ORM can later be introduced with a reviewed adapter; no database reset is required.

Use managed-provider OIDC with authorization-code PKCE and server-only tokens. The founder clarified there is no existing provider; recommend Auth0 and supply a setup guide. No local authentication bypass, fixed administrator identity or fake production credentials. A synthetic issuer exists only in automated tests. Bootstrap of the first administrator is operator-only and audited.

All four pathway competency catalogs are draft. Shared competency identity is global, candidate projection is unique per candidate/competency, pathway/role overlays are relational, and professional thresholds remain NULL. These changes occur only in a new local development database; no production migrations or destructive existing-data transformations have been authorized or performed.
