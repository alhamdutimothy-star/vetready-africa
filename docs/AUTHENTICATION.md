# Managed OIDC provider integration

## Provider contract

Use Auth0 for the pilot, or a compatible managed OpenID Connect provider supporting authorization code + S256 PKCE, discovery, JWKS, signed JWT access tokens, separate web-client and API audiences, and the `vetready:access` scope. RS256 is required. Configure refresh-token/long-lived sessions later; this phase deliberately uses short sessions without retaining refresh tokens.

The API accepts access tokens only, validates signature/issuer/audience/expiry/issued-at/subject/scope, and obtains authorization from current database role assignments. Claimed token roles have no authority. First valid access provisions one user per issuer/subject and a candidate onboarding capability. Employer registration adds a pending organization and an organization-scoped owner role; it does not authorize talent search.

## Required non-secret identifiers

- OIDC_ISSUER: exact provider issuer, including any tenant path.
- OIDC_JWKS_URI: trusted provider's documented JWKS URL for API validation.
- OIDC_AUDIENCE: distinct API resource audience.
- OIDC_CLIENT_ID: web client identifier; configure custom audience/scope support.
- APP_ORIGIN and API_INTERNAL_URL: deployment origins; HTTPS required in production.

Register `${APP_ORIGIN}/auth/callback` exactly as the redirect URI. Provider client must support the `openid profile vetready:access` scope and return access JWTs for the API audience. Some providers require a resource parameter instead of audience or a different client-auth method: adapt and test the adapter once the actual provider contract is supplied. Do not relax token validation to force compatibility.

Secrets: SESSION_SECRET is 32 random bytes encoded as 64 hex characters, kept in secure runtime configuration. OIDC_CLIENT_SECRET is required for Auth0 Regular Web Applications; this adapter uses client_secret_post. Other OIDC providers may support a public client. Store credentials in environment settings or ignored local files only. Never paste secrets into chat. Review proxy-secret support before using an environment-proxy secret: local session encryption needs a real runtime secret, not a network placeholder.

## Browser security and limitations

State/nonce, PKCE, encrypted purpose-bound HttpOnly SameSite=Lax cookies, production Secure cookies, bounded session lifetime, server-only access tokens, no-store private responses and origin checks on logout. Next server actions perform origin validation; API authentication uses bearer tokens, not ambient browser cookies. No permissive CORS is enabled.

Logout first revokes the application session in PostgreSQL, then clears cookies and redirects Auth0 clients to /v2/logout with the registered return URL. A copied browser cookie cannot reuse a revoked session. Independent bearer JWTs are not revoked by application logout and remain subject to expiration and database suspension. Provider MFA policy and end-to-end live provider validation are outstanding. Tests demonstrate the protocol against an isolated synthetic provider, not production connectivity.

## Initial administrator

After an operator-approved person signs in, obtain their internal `/me` UUID. Use the operator-only `npm run admin:bootstrap` with BOOTSTRAP_USER_ID, BOOTSTRAP_REASON (≥10 characters) and BOOTSTRAP_CONFIRM=grant-super-admin securely set. This requires privileged database access and records an audit event. There is no public bootstrap or hard-coded administrator email. Further grants require SUPER_ADMIN capability and a reason. Two-person role-grant approval and staff MFA enforcement are production-hardening work.

The development tenant is configured. Follow the current [Auth0 checkpoint](AUTH0_CHECKPOINT.md) for exact configuration, private credential placement and the remaining live verification. The older setup guide is historical; the confirmed audience is https://api.vetready.africa.
