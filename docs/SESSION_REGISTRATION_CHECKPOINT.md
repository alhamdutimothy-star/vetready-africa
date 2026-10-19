# Browser-session registration investigation

The callback HTTP 500 identifies an API-side registration failure. It does not identify a particular SQL error. Do not infer missing migration/reference data solely from this status.

A valid JWT is verified before database access (RS256, issuer, audience, expiry, subject and vetready:access). AuthGuard atomically inserts users by unique issuer/subject, grants a new identity the existing CANDIDATE PLATFORM role, records provisioning and commits. It creates no candidate profile or professional claims. Concurrent first requests converge on one identity/default role. Candidate profile completion is a separate onboarding step.

POST /api/v1/sessions has no candidate-profile DTO or candidate foreign key. Its transaction creates a random handle, stores only its SHA-256 digest with the provisioned user foreign key and bounded expiry, and appends an audit. The successful response contains the raw handle and ISO expiry for server-side encrypted cookie creation. Neither is logged. Audit failure rolls back the session; a retry after an operator repairs schema/reference data does not duplicate identity provisioning.

Migration 008_browser_sessions.sql creates the table, user FK, unique/hash checks, expiry check and active-session index. No new migration or schema relaxation is introduced here. The existing migration must be applied to the same database used by the API; running migrations against a different database does not fix it. Missing CANDIDATE reference data is a seed prerequisite, not a reason to auto-create privileged roles inside a request.

The API now emits auth.session.registration.failed for registration 5xx errors, including failures before the controller. Stages distinguish JWT validation, identity transaction/provisioning/lookup, default role assignment, provisioning audit, role lookup, session insert, session audit and commit. Only a server-generated request ID, fixed stage, allowlisted SQLSTATE/transport code and known table/constraint names are included. No SQL, parameters, database URLs, raw errors, detail/hint/stack, subject, user ID, headers or tokens are serialized. Existing client responses remain generic.

## Windows verification

After applying the incremental API patch, build with npm run build:foundation and restart the API using the existing private environment files/command. No secret or web configuration changes are needed.

From the repository root, run the read-only check with the same database configuration as the API:

```powershell
node --env-file=.local/database.env --env-file=.local/api.env --import tsx scripts/session-db-check.ts
```

Only boolean readiness checks and a fixed failure code are printed. If migration/table checks are false, inspect the selected database configuration privately and apply existing migrations using npm run db:migrate with the same database binding. Do not edit applied SQL, migration checksums or the ledger. If candidateRolePresent is false, restore approved reference seeds with npm run db:seed against that database. These operator commands change the database; the diagnostic does not execute them automatically.

Then start a fresh sign-in. If registration still returns 500, provide only the auth.session.registration.failed JSON event. Examples: 42P01 at session-insert identifies a missing relation in the active schema; 23503 at default-role-assignment identifies a reference-data FK failure; 23514 at session-insert identifies an expiry/hash check requiring investigation of values/clocks without disabling the check. The actual Windows SQLSTATE remains unknown until observed.

Local regression coverage includes a new external user's concurrent first registrations with no candidate profile, least-privilege authorization, missing session-table diagnosis/recovery, audit rollback and diagnostic redaction. Tests use a dedicated disposable database and synthetic signed JWTs, not real Auth0 credentials. These results cannot establish the Windows database state or complete live acceptance.
