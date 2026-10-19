import { CallbackHttpError, type CallbackStage } from './callback-diagnostics';
import { discovery } from './oidc-discovery';
export { discovery };
import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import {
  EncryptJWT,
  jwtDecrypt,
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from 'jose';
import { z } from 'zod';
const envSchema = z.object({
  OIDC_ISSUER: z.url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_AUDIENCE: z.string().min(1),
  SESSION_SECRET: z.string().regex(/^[a-f0-9]{64}$/),
  APP_ORIGIN: z.url(),
  API_INTERNAL_URL: z.url(),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});
export type WebConfig = z.infer<typeof envSchema>;
export function webConfig(env: NodeJS.ProcessEnv): WebConfig {
  const result = envSchema.safeParse(env);
  if (!result.success)
    throw new Error('Authentication configuration is incomplete');
  for (const field of [
    'OIDC_ISSUER',
    'APP_ORIGIN',
    'API_INTERNAL_URL',
  ] as const) {
    const url = new URL(result.data[field]);
    if (url.username || url.password)
      throw new Error('Invalid authentication endpoint');
    if (
      url.protocol !== 'https:' &&
      !(
        result.data.NODE_ENV !== 'production' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname)
      )
    )
      throw new Error('HTTPS required');
  }
  if (
    new URL(result.data.APP_ORIGIN).pathname !== '/' ||
    new URL(result.data.APP_ORIGIN).search ||
    new URL(result.data.APP_ORIGIN).hash
  )
    throw new Error('APP_ORIGIN must be an origin');
  if (result.data.OIDC_AUDIENCE === result.data.OIDC_CLIENT_ID)
    throw new Error('API and web audiences must differ');
  if (
    new URL(result.data.OIDC_ISSUER).hostname.endsWith('.auth0.com') &&
    !result.data.OIDC_CLIENT_SECRET
  )
    throw new Error(
      'Auth0 Regular Web Application requires OIDC_CLIENT_SECRET',
    );
  result.data.APP_ORIGIN = new URL(result.data.APP_ORIGIN).origin;
  return result.data;
}
export function newFlow() {
  const verifier = randomBytes(32).toString('base64url');
  return {
    state: randomBytes(32).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}
export async function encryptCookie(
  payload: JWTPayload,
  secret: string,
  audience: 'flow' | 'session',
  seconds: number,
) {
  const value = await new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuer('vetready-web')
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${seconds}s`)
    .encrypt(Buffer.from(secret, 'hex'));
  if (value.length > 3800)
    throw new Error('Session token exceeds secure cookie capacity');
  return value;
}
export async function decryptCookie(
  value: string,
  secret: string,
  audience: 'flow' | 'session',
) {
  const result = await jwtDecrypt(value, Buffer.from(secret, 'hex'), {
    issuer: 'vetready-web',
    audience,
    requiredClaims: ['exp', 'iat'],
    keyManagementAlgorithms: ['dir'],
    contentEncryptionAlgorithms: ['A256GCM'],
  });
  return result.payload;
}
export async function exchangeCode(
  config: WebConfig,
  code: string,
  flow: JWTPayload,
  onStage: (stage: CallbackStage) => void = () => {},
) {
  onStage('flow-validation');
  if (typeof flow.verifier !== 'string' || typeof flow.nonce !== 'string')
    throw new Error('Invalid login flow');
  onStage('discovery');
  const provider = await discovery(config);
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.OIDC_CLIENT_ID,
    code,
    redirect_uri: `${config.APP_ORIGIN}/auth/callback`,
    code_verifier: flow.verifier,
  });
  if (config.OIDC_CLIENT_SECRET)
    form.set('client_secret', config.OIDC_CLIENT_SECRET);
  onStage('token-exchange');
  const response = await fetch(provider.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) {
    const failure: unknown = await response.json().catch(() => null);
    const code =
      failure && typeof failure === 'object' && 'error' in failure
        ? failure.error
        : undefined;
    throw new CallbackHttpError('Code exchange failed', response.status, code);
  }
  onStage('token-response-validation');
  const tokens = z
    .object({
      access_token: z.string().min(1).max(16000),
      id_token: z.string(),
      expires_in: z.number().int().positive().max(86400),
      token_type: z.string().refine((v) => v.toLowerCase() === 'bearer'),
    })
    .parse(await response.json());
  onStage('id-token-validation');
  const { payload } = await jwtVerify(
    tokens.id_token,
    createRemoteJWKSet(new URL(provider.jwks_uri)),
    {
      issuer: config.OIDC_ISSUER,
      audience: config.OIDC_CLIENT_ID,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub'],
    },
  );
  if (payload.nonce !== flow.nonce) throw new Error('Nonce mismatch');
  if (
    Array.isArray(payload.aud) &&
    payload.aud.length > 1 &&
    payload.azp !== config.OIDC_CLIENT_ID
  )
    throw new Error('Authorized party mismatch');
  // Access JWT has a separate API audience; an ID token cannot be used at the API.
  onStage('access-token-validation');
  const access = await jwtVerify(
    tokens.access_token,
    createRemoteJWKSet(new URL(provider.jwks_uri)),
    {
      issuer: config.OIDC_ISSUER,
      audience: config.OIDC_AUDIENCE,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub'],
    },
  );
  if (
    access.payload.sub !== payload.sub ||
    typeof access.payload.scope !== 'string' ||
    !access.payload.scope.split(' ').includes('vetready:access')
  )
    throw new Error('Access identity/scope mismatch');
  return {
    ...tokens,
    expires_in: Math.min(
      tokens.expires_in,
      Math.max(1, (access.payload.exp ?? 0) - Math.floor(Date.now() / 1000)),
    ),
  };
}

export function authCookieOptions(nodeEnv: string, seconds: number) {
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: seconds,
  };
}

// Auth0-specific SSO logout adapter; other OIDC providers retain local logout until configured.
export function providerLogoutUrl(config: WebConfig): string | null {
  if (!new URL(config.OIDC_ISSUER).hostname.endsWith('.auth0.com')) return null;
  const url = new URL('/v2/logout', config.OIDC_ISSUER);
  url.search = new URLSearchParams({
    client_id: config.OIDC_CLIENT_ID,
    returnTo: config.APP_ORIGIN + '/',
  }).toString();
  return url.toString();
}
