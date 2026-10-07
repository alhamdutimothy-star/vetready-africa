import { webConfig } from '../apps/web/lib/oidc';
const expectedIssuer = 'https://vetreadyafrica-dev.eu.auth0.com/';
const expectedAudience = 'https://api.vetready.africa';
async function main() {
  const names = [
    'OIDC_ISSUER',
    'OIDC_AUDIENCE',
    'OIDC_CLIENT_ID',
    'OIDC_CLIENT_SECRET',
    'SESSION_SECRET',
    'APP_ORIGIN',
    'API_INTERNAL_URL',
  ];
  const missing = names.filter(
    (n) =>
      !process.env[n] || process.env[n] === 'REPLACE_WITH_PUBLIC_WEB_CLIENT_ID',
  );
  let configuration = false;
  try {
    webConfig(process.env);
    configuration =
      missing.length === 0 &&
      process.env.OIDC_ISSUER === expectedIssuer &&
      process.env.OIDC_AUDIENCE === expectedAudience;
  } catch {
    /* Do not print config values/errors containing credentials. */
  }
  let publicMetadata = false,
    jwks = false,
    clientSecretPost = false;
  try {
    const r = await fetch(expectedIssuer + '.well-known/openid-configuration', {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (r.ok) {
      const d = (await r.json()) as {
        issuer?: unknown;
        jwks_uri?: unknown;
        token_endpoint_auth_methods_supported?: unknown;
      };
      publicMetadata =
        d.issuer === expectedIssuer &&
        d.jwks_uri === expectedIssuer + '.well-known/jwks.json';
      clientSecretPost =
        Array.isArray(d.token_endpoint_auth_methods_supported) &&
        d.token_endpoint_auth_methods_supported.includes('client_secret_post');
      if (publicMetadata) {
        const keys = await fetch(expectedIssuer + '.well-known/jwks.json', {
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
        });
        if (keys.ok) {
          const d = (await keys.json()) as {
            keys?: { kty?: string; alg?: string; use?: string }[];
          };
          jwks =
            Array.isArray(d.keys) &&
            d.keys.some(
              (k) => k.kty === 'RSA' && k.alg === 'RS256' && k.use === 'sig',
            );
        }
      }
    }
  } catch {
    /* Network failures are reported without credentials, headers, tokens or response bodies. */
  }
  console.log(
    JSON.stringify(
      {
        configuration,
        missingVariableNames: missing,
        publicDiscoveryVerified: publicMetadata,
        rs256JwksVerified: jwks,
        clientSecretPostAdvertised: clientSecretPost,
        liveEndToEndVerified: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'Preflight checks configuration and public metadata only; browser sign-in, callback, scope, RBAC and logout still need live testing.',
  );
  if (!configuration || !publicMetadata || !jwks || !clientSecretPost)
    process.exitCode = 1;
}
void main();
