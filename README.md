# VetReady Africa

Evidence-based veterinary talent development and recruitment for Nigeria, designed for future African expansion.

## Phase 1 implemented

Next.js mobile web shell and private onboarding; NestJS API; strict TypeScript workspaces; managed-provider OIDC/PKCE integration; database-backed platform/organization RBAC; users, candidates, pending employers, configurable pathways, reusable competencies and evidence-submission models; SQL migrations, draft seeds, audit events and automated tests.

Initial reference pathways: Commercial Dairy Practice; Veterinary Pharmaceutical Technical Sales; Poultry Farm Management; Premix & Feed Additives Technical Sales. All professional definitions are **REQUIRES DOMAIN EXPERT VALIDATION**. No threshold, weight, mandatory professional gate or readiness credential has been assigned. Evidence submissions cannot confer verified competence.

Not implemented: assessment delivery/marking, human verification workflow, scoring policies, real Skills Passports, search/matching, vacancy workflows, document upload/storage, payments or AI. The dashboard's readiness remains NOT ASSESSED.

## Local development

Requirements: Node 24.19.x, npm 11, Docker daemon. From repository root:

```sh
npm ci
npm run env:up
npm run build
npm run lint
npm run typecheck
npm test
```

`env:up` creates ignored, private local database configuration, starts the digest-pinned PostgreSQL 17 container on loopback port 54329, applies migrations and seeds. It preserves existing databases and refuses unexpected containers. Tests reset only the dedicated local `_test` database. CI supplies its own synthetic test database.

`npm run db:migrate` and `npm run db:seed` load `.local/database.env` if present; supplied environment variables take precedence. Seed is repeatable and never overwrites approved definitions. Docker volumes are development runtime state, not a guaranteed cloud snapshot: recreate reference data with env:up and back up any important local work explicitly.

## Managed authentication

The owner clarified that no provider exists yet. Auth0 is recommended for the pilot; follow [the setup guide](docs/AUTH0_SETUP.md) and [authentication contract](docs/AUTHENTICATION.md). No insecure development sign-in fallback exists. Tests use an isolated synthetic issuer and signing key, never production credentials.

After placing configured API variables in ignored `.local/api.env` and web variables in ignored `apps/web/.env.local`:

```sh
node --env-file=.local/database.env --env-file=.local/api.env apps/api/dist/main.js
npm run dev:web
```

These are separate terminal processes. API rebuild after edits: `npm run build:foundation`; `dev:api` watches compiled output. The web shell runs without identity configuration; sign-in fails closed until configured.

## Documentation

[Product](docs/PRODUCT.md) · [Architecture](ARCHITECTURE.md) · [Database](DATABASE.md) · [Proposed taxonomy](docs/COMPETENCY_TAXONOMY.md) · [Competency model](COMPETENCY_MODEL.md) · [Scoring](SCORING_MODEL.md) · [Security](SECURITY.md) · [API](API.md) · [UX](docs/UX.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [Phase 1 validation](docs/PHASE1_VALIDATION.md).

## Repository conventions

`apps/web`, `apps/api`, `packages/contracts`, `packages/domain`, `db/migrations`, `db/seeds`, `scripts`, `tests`, `infra` and `docs/adr`. Keep domain decisions out of presentation and persistence. Use reviewed migrations and meaningful feature commits. No real candidate data or secrets in Git. Use the existing isolated cloud checkout; do not create a worktree unless explicitly requested.

There are no approved professional standards, issued certificates or production deployments in this release. Phase 1 supports the platform foundation, not operational recruitment or certification.
