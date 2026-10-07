# Phase 1 validation and handoff

## Verified in this cloud instance

- Node 24.19.0, lockfile installation via npm ci, pinned PostgreSQL 17 Docker runtime.
- Development web home returned 200 with expected content; unconfigured sign-in returned the expected 503 without an authentication bypass.
- Migrations from empty test database and repeated migration/seed execution.
- Four development pathways, 12 reusable core groups and 35 pathway-specific draft groups; no professional thresholds/weights/gates set.
- 44 automated tests across unit, real PostgreSQL/API integration and web OIDC protocol smoke tests; all passed, no skipped tests in the final run.
- Production Next.js/API build, strict application/tooling type checks, ESLint and Prettier checks passed.
- Dependency audit: zero reported vulnerabilities after upgrading the affected test/documentation dependencies. This is an audit snapshot, not a security certification.
- JWT signature/issuer/audience/expiry/scope checks, ignored token-role claims, suspended accounts/expired grants, private-profile/evidence ownership and organization scope tested.
- PKCE/state/nonce flow, encrypted purpose-bound cookies, callback replay rejection, logout origin checks and a server-rendered dashboard exercised using a synthetic test issuer.
- Applied versions and approved pathway mappings are protected; repeated seeds preserve reviewed approved pathway data in a synthetic test fixture.

## Limits and assumptions

No Auth0 tenant or production credentials exist. Live provider behavior, MFA policy and deployment HTTPS behavior remain unverified. The synthetic provider is test-only and never a public login bypass. The web onboarding is a basic private profile, not the full qualification/experience/document workflow.

No knowledge/case/practical examination delivery, evidence approval, professional score, readiness decision, Skills Passport, vacancy/search/matching, file-storage integration or account-export/deletion workflow is operational. Production DB privilege separation, object scanning, backups/restore and legal sign-off remain prerequisites. No production data was migrated or deployed.

The competency taxonomy remains REQUIRES DOMAIN EXPERT VALIDATION. Named authors/reviewers, authoritative sources, level anchors, critical errors, practical gates, transfer rules, thresholds and expiry must be validated before credentialing implementation. Pilot farm/assessor capacity and operating budget remain founder decisions.

## Environment configuration

Saved installation script, startup instructions and OIDC/runtime variable requirements as an environment draft. Saving does not apply provider values or publish. Review/save in environment settings and publish when appropriate. Local Docker volumes and generated database secrets are not a promise of fresh-task data restoration. Git publication and a new-task environment restoration have not been verified.

## Next milestone

Validate the four-pathway taxonomy and baseline design; implement versioned baseline diagnostics, gap analysis and development plans. Complete Auth0 tenant integration and private-document infrastructure alongside that work. Retain human review for all high-stakes practical competence and credential decisions.
