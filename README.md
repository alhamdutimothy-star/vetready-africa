# VetReady Africa

## Current checkpoint — Phase 3B

Governed demo training now has a Course → Module → Lesson snapshot hierarchy, existing-competency/assessment links, scoped enrollment/assignment and revision-aware resumable progress APIs. **Training completion is not competence verification.** No production content approval, automatic evidence/award, upload or public Passport is enabled. See [training model](TRAINING_MODEL.md), [API](API.md) and [ADR 0005](docs/adr/0005-governed-training-and-progress.md). No new environment variables or secrets are required.

Evidence-based veterinary talent development and recruitment for Nigeria, designed for future African expansion.

## Phases 1–2 implemented

Next.js mobile web shell and private onboarding; NestJS API; strict TypeScript workspaces; managed-provider OIDC/PKCE integration; database-backed platform/organization RBAC; users, candidates, pending employers, configurable pathways, reusable competencies and evidence-submission models; SQL migrations, draft seeds, audit events and automated tests.

Initial reference pathways: Commercial Dairy Practice; Veterinary Pharmaceutical Technical Sales; Poultry Farm Management; Premix & Feed Additives Technical Sales. All professional definitions are **REQUIRES DOMAIN EXPERT VALIDATION**. No threshold, weight, mandatory professional gate or readiness credential has been assigned. Evidence submissions cannot confer verified competence.

Phase 2 adds the 69 proposed assessable children, immutable assessment/item versions and blueprints, four demo cases, objective task grading, human criterion reviews/moderation/appeals, assessment-derived evidence, pathway/role gap analysis and saved development plans. Candidate development and staff assessment screens are available. See [Phase 2 completion](docs/PHASE2_COMPLETION.md).

Not implemented: approved production examinations, real supervised simulation/practical/workplace capture, private document/image storage, final scoring/readiness policies, Skills Passport sharing, search/matching, vacancy workflows, payments or AI. Professional readiness remains NOT ASSESSED.

## Phase 3 setup checkpoint

The Windows-verified authentication baseline is protected by `working-authentication-2026-10-20`. Phase 3A was accepted at `df6c0ca`; Phase 3B training foundations are implemented for review. The [earlier setup guide](docs/PHASE3_SETUP_CHECKPOINT.md) is historical; no authentication redesign or new secret configuration is part of training.

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

There are no approved professional standards, issued certificates or production deployments in this release. Phases 1–2 support identity, diagnostic and development foundations, not operational recruitment or certification.

Current authentication status and private configuration steps: [Auth0 checkpoint](docs/AUTH0_CHECKPOINT.md). Public tenant metadata is verified; real browser login remains pending.
