# Auth0 pilot setup guide

Recommended hosted provider for the pilot: Auth0. There is no existing tenant yet. Do not start production enrollment until provider, privacy and deployment settings have been reviewed. Plan limits and dashboard labels can change; check the provider's current documentation.

## 1. Create your tenant

Create an Auth0 account and tenant. Choose a region after considering Nigerian data-protection/international-transfer obligations, latency and vendor agreements. Record its tenant domain and exact issuer from discovery; the issuer commonly ends in `/`. Keep account recovery and administrator MFA enabled.

## 2. Register the API

In the Auth0 dashboard create an API named VetReady Africa API. Choose a stable identifier, for example `https://api.vetready.africa` **only if you control that namespace**; this identifier is an audience, not necessarily a running endpoint. Use RS256 signing. Add permission/scope `vetready:access`. Initially allow the registered application to request that scope according to the provider's consent settings. Do not use Auth0 roles as a substitute for database RBAC.

Keep access-token lifetime short and document it. Configure MFA requirements for privileged users before production. Do not claim MFA enforcement from API code alone.

## 3. Register the web application

Create a **Regular Web Application** for the server-rendered Next.js app. Enable Authorization Code with S256 PKCE. For local development, register the exact callback `http://localhost:3000/auth/callback`. For deployment add only the exact HTTPS application callback. Configure appropriate allowed origins and logout URLs for your actual domain; avoid wildcards. This app currently performs local logout, not Auth0 SSO logout.

The initial adapter supports client_secret_post for a confidential client. Ensure the provider accepts that method; use a provider-specific adapter and tests if your policy requires another method. Do not use an SPA client to store bearer tokens in browser local storage.

## 4. Fill configuration securely

Non-secret fields:

| Variable         | Value                                                   |
| ---------------- | ------------------------------------------------------- |
| OIDC_ISSUER      | Exact `issuer` from tenant discovery                    |
| OIDC_JWKS_URI    | `jwks_uri` from that discovery                          |
| OIDC_AUDIENCE    | API identifier from step 2                              |
| OIDC_CLIENT_ID   | Web application's client ID                             |
| APP_ORIGIN       | Local origin or deployed HTTPS origin, no trailing path |
| API_INTERNAL_URL | API origin reachable by the Next.js server              |

Secret fields: OIDC_CLIENT_SECRET from the confidential web app, and SESSION_SECRET containing 32 random bytes encoded as 64 hexadecimal characters. Use secure environment settings or ignored local files, never Git or chat. A session-encryption key must be a genuine runtime value, not a network-proxy placeholder. Generate it through your secret manager or a cryptographically secure local generator and save directly to private configuration.

The API requires DATABASE_URL, OIDC_ISSUER, OIDC_JWKS_URI and OIDC_AUDIENCE. The web app needs the web fields and confidential-client/session secrets. `npm run env:up` creates private local database configuration for development only. Copy required identifiers to `.local/api.env` and `apps/web/.env.local`; do not blindly copy empty `.env.example` fields over injected secrets.

## 5. Validate live sign-in

Start PostgreSQL, migrations, built API and web as described in README. Sign in as a test person. Confirm redirect/state/PKCE succeeds, `/me` provisions one user, private profile saves, four draft pathways load, and another person cannot read that profile or organization's records. Confirm a forged/wrong-audience token is rejected. Bootstrap the first administrator through the documented operator-only command, then enforce MFA.

Before deployment verify HTTPS cookie behavior, tenant token expiry, account recovery, logout expectations, redacted logs and provider network access. Add the actual tenant/JWKS hosts to restricted cloud networking once known; no domain was guessed or broad wildcard added during setup.

The automated suite verifies this contract using an isolated issuer. **Live Auth0 authentication remains unverified until these steps are completed.** You can provide the tenant domain, client ID and API audience in chat; enter secrets only in secure settings.

Official starting references: https://auth0.com/docs/get-started/auth0-overview/create-tenants ; https://auth0.com/docs/get-started/apis ; https://auth0.com/docs/get-started/applications ; https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce . Provider plan/region/pricing and current interface details have not been independently verified in this phase.
