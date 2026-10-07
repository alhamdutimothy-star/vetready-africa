# Auth0 integration checkpoint

The configured development tenant is `vetreadyafrica-dev.eu.auth0.com`. Authentication remains the existing OIDC authorization-code/S256-PKCE adapter, not Auth0 Quickstart boilerplate. API scope authorization and database-managed VetReady roles remain separate. Auth0 role claims grant no VetReady permissions.

## Configuration and private setup

Run commands from the repository root. The exact local callback is `http://localhost:3000/auth/callback`; logout return URL is `http://localhost:3000/`.

| Variable           | Location       | Value                                                         |
| ------------------ | -------------- | ------------------------------------------------------------- |
| OIDC_ISSUER        | API and web    | https://vetreadyafrica-dev.eu.auth0.com/                      |
| OIDC_AUDIENCE      | API and web    | https://api.vetready.africa                                   |
| OIDC_JWKS_URI      | API            | https://vetreadyafrica-dev.eu.auth0.com/.well-known/jwks.json |
| OIDC_CLIENT_ID     | Web            | 2hSqkGwL25FPg76AHw6s4knAotoEOZAi (public)                     |
| OIDC_CLIENT_SECRET | Web only       | Private Client Secret from that application                   |
| SESSION_SECRET     | Web only       | 32 random bytes encoded as 64 hexadecimal characters          |
| APP_ORIGIN         | Web            | http://localhost:3000                                         |
| API_INTERNAL_URL   | Web            | http://127.0.0.1:4000                                         |
| DATABASE_URL       | API/migrations | Existing ignored .local/database.env                          |
| NODE_ENV / PORT    | API            | development / 4000                                            |

The public Client ID has been supplied. On 7 October 2026, the owner independently confirmed Applications → VetReady Africa Web → Credentials → Client Authentication Methods → Client Secret (Post). The configured application method is therefore confirmed as `client_secret_post`. Tenant discovery independently advertises support for it. A real successful code exchange has not occurred; configuration confirmation does not establish live authentication. This adapter does not read Auth0 Quickstart names such as AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, AUTH0_AUDIENCE or APP_BASE_URL. Do not duplicate credentials under those aliases or expose them as NEXT_PUBLIC variables.

1. Create ignored local files without overwriting existing configuration:

   ```bash
   mkdir -p .local
   test -e .local/api.env || install -m 600 infra/auth0/api.env.example .local/api.env
   test -e apps/web/.env.local || install -m 600 infra/auth0/web.env.example apps/web/.env.local
   ```

2. Open `apps/web/.env.local` in a local editor. Confirm the supplied public Client ID. Copy the Client Secret directly from Auth0 into a new `OIDC_CLIENT_SECRET=...` line there. Never paste it into chat, tracked examples, shell commands or Git. Protect the file with `chmod 600 apps/web/.env.local`.

3. Generate the session key directly into that ignored file; this command prints no secret and refuses to replace an existing key:

   ```bash
   node --input-type=module -e 'import{readFileSync,appendFileSync,chmodSync}from"node:fs";import{randomBytes}from"node:crypto";const p="apps/web/.env.local";if(/^SESSION_SECRET=/m.test(readFileSync(p,"utf8")))throw Error("Session key already configured");appendFileSync(p,"\nSESSION_SECRET="+randomBytes(32).toString("hex")+"\n");chmodSync(p,0o600)'
   ```

4. Start the existing database with `npm run env:up` if needed, then migrate. Preserve `.local/database.env`; do not send database credentials. Build/start the API and web in separate terminals:

   ```bash
   npm run db:migrate
   npm run build:foundation
   node --use-env-proxy --env-file=.local/database.env --env-file=.local/api.env apps/api/dist/main.js
   ```

   ```bash
   NODE_USE_ENV_PROXY=1 npm run dev:web
   ```

   Node proxy support preserves the managed cloud proxy and CA trust. On a local machine without proxy variables it uses normal networking. The browser must actually reach this application's localhost origin. A cloud preview on another origin requires explicitly registered HTTPS callback/logout URLs and corresponding APP_ORIGIN; do not assume your computer's localhost reaches a cloud server.

5. Run `npm run auth:preflight`. It reports variable names and boolean metadata checks only, never credentials. A successful preflight still does not establish successful browser authentication.

## Existing architecture and changes

Existing state/nonce validation, PKCE, issuer/audience validation, private server-side access tokens, encrypted purpose-bound cookies, fresh database RBAC, and least-privilege account provisioning were retained. ID and API tokens are now pinned to RS256. Auth0 confidential clients fail configuration validation without a client secret.

Migration 008 adds revocable browser sessions storing only a SHA-256 digest of a random handle, user ownership, timestamps and revocation status. Callback registration creates a session after token verification. The encrypted HttpOnly cookie contains the access token and session handle; frontend API calls remain server-side. Lifetime is bounded by token expiration and one hour. Cookies use SameSite=Lax, HttpOnly, path=/ and Secure in production. HTTP localhost cookies are development-only.

`POST /api/v1/sessions` registers a session after valid JWT/scope checks. `DELETE /api/v1/sessions/current` requires a valid bearer token and matching owner handle. Revocation is idempotent and audited. Its narrowly scoped exception allows a suspended owner to terminate their own session; it grants no domain access. Every other request with X-VetReady-Session requires an active, unexpired, owned session. Independent bearer-only callers continue to require normal JWT, scope and RBAC checks.

Logout checks the browser origin and revokes the application session before clearing cookies. Backend failure returns a retryable error rather than claiming termination. Auth0 logout redirects to `/v2/logout` with Client ID and the exact registered trailing-slash return URL; no ID/access token is placed in that URL. This does not revoke independently held bearer JWTs or initiate federated identity-provider logout.

## Verification results

All **92 tests in seven files pass**. The full test command includes the production Next.js/NestJS build. Lint and strict TypeScript checks pass. Dependency audit reports **zero vulnerabilities**. Migration 008 was applied; PostgreSQL integration tests rebuild and validate all eight migrations. Formatting and generated OpenAPI are checked as part of the final repository verification.

| Requested check           | Automated/synthetic verification                                      | Live configured tenant                                                      |
| ------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Unauthenticated access    | Protected frontend and API deny access                                | Browser check pending                                                       |
| Login redirect            | Authorization URL, state and S256 PKCE tested                         | Browser redirect pending                                                    |
| Successful authentication | Isolated confidential OIDC provider tested                            | Pending                                                                     |
| Callback                  | State, nonce, token validation and failure paths tested               | Pending                                                                     |
| Secure session            | Cookie flags, encryption, ownership, expiration and revocation tested | Pending                                                                     |
| Authenticated frontend    | Dashboard and development/assessment pages tested                     | Pending                                                                     |
| API audience token        | Synthetic JWT uses https://api.vetready.africa                        | Actual token acquisition pending                                            |
| API JWT validation        | Signature/issuer/audience and RS256 tested                            | Public discovery and RSA/RS256 JWKS verified; authenticated request pending |
| vetready:access           | Missing scope rejected                                                | Actual issued scope pending                                                 |
| VetReady RBAC             | Fresh database roles, staff restrictions and owner isolation tested   | Live account/role checks pending                                            |
| Logout                    | Revocation, copied-cookie denial and redirect construction tested     | Auth0 SSO termination pending                                               |
| Invalid tokens            | Missing, malformed, expired, wrong-issuer and wrong-audience rejected | Synthetic negative cases; no live token requested                           |

The actual tenant's public discovery, issuer/JWKS correspondence, RS256 signing key and advertised client_secret_post support were verified with proxy-aware Node fetch. An earlier curl CONNECT request was denied by the cloud proxy; this is not a current blocker for that Node preflight. Preflight exits 1 because OIDC_CLIENT_SECRET is not configured. It explicitly reports liveEndToEndVerified=false. No real user login or real token exchange has occurred.

## Manual live acceptance and remaining risk

Configure the private files, then sign in from an unauthenticated browser. Confirm callback success, authenticated dashboard, authorized API response and denied staff access for an ordinary candidate. Check that logout returns to the registered origin and protected pages require authentication again, including back/reload behavior. A staff operator must validate intended domain role grants separately. Record only pass/fail observations; do not export cookies, tokens, secrets or credential-bearing HAR files into chat.

The cloud checkout now has ignored, mode-600 API/web configuration files containing the public settings and a securely generated session key. Only OIDC_CLIENT_SECRET remains missing here. These files are private to this workspace; repeat the setup on your own computer as necessary. No secret was printed or committed.

Pilot authentication is **not yet live-verified**. Do not treat synthetic success as live acceptance. Refresh tokens are intentionally not retained; users reauthenticate after the bounded session expires. Production requires HTTPS origins, staff MFA policy validation, appropriately restricted database credentials, operational monitoring and a retention/purge policy for expired session records. Dependency audit cannot establish absence of all security defects.

An environment draft adds only the tenant hostname and public OIDC settings, preserving existing presets. It is saved, not applied or published. Review/save the changes in environment settings and publish if adopting that reusable configuration; no secrets are included. No unrelated Phase 3 feature development is authorized by this checkpoint.
