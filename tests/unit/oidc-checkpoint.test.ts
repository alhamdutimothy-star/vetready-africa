import { it, expect } from 'vitest';
import {
  webConfig,
  exchangeCode,
  newFlow,
  authCookieOptions,
  providerLogoutUrl,
} from '../../apps/web/lib/oidc';
import { testIssuer } from '../helpers/issuer';
const env = {
  OIDC_ISSUER: 'https://vetreadyafrica-dev.eu.auth0.com/',
  OIDC_AUDIENCE: 'https://api.vetready.africa',
  OIDC_CLIENT_ID: 'public-test-client-id',
  OIDC_CLIENT_SECRET: 'synthetic-confidential-fixture',
  SESSION_SECRET: 'c'.repeat(64),
  APP_ORIGIN: 'http://localhost:3000',
  API_INTERNAL_URL: 'http://127.0.0.1:4000',
};
it('uses the existing OIDC variables, not Auth0 Quickstart aliases', () => {
  expect(webConfig(env).OIDC_ISSUER).toBe(env.OIDC_ISSUER);
  expect(() =>
    webConfig({
      AUTH0_DOMAIN: 'vetreadyafrica-dev.eu.auth0.com',
      AUTH0_CLIENT_ID: 'public',
      AUTH0_SECRET: 'unused',
    }),
  ).toThrow('incomplete');
});
it('uses secure HttpOnly, SameSite cookies in production and loopback-only HTTP in development', () => {
  expect(authCookieOptions('production', 600)).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  expect(authCookieOptions('development', 600).secure).toBe(false);
  expect(() => webConfig({ ...env, NODE_ENV: 'production' })).toThrow('HTTPS');
});
it('rejects provider callback ID tokens with a mismatched nonce', async () => {
  const identity = await testIssuer({ idTokenClaims: { nonce: 'mismatched' } });
  try {
    const flow = newFlow();
    const url = new URL(identity.issuer + '/authorize');
    url.search = new URLSearchParams({
      redirect_uri: 'http://localhost:3000/auth/callback',
      nonce: flow.nonce,
      state: flow.state,
      code_challenge: flow.challenge,
    }).toString();
    const r = await fetch(url, { redirect: 'manual' });
    const code = new URL(r.headers.get('location')!).searchParams.get('code')!;
    await expect(
      exchangeCode(
        webConfig({
          ...env,
          OIDC_ISSUER: identity.issuer,
          OIDC_CLIENT_ID: 'vetready-web',
          OIDC_AUDIENCE: 'vetready-api',
        }),
        code,
        flow,
      ),
    ).rejects.toThrow('Nonce mismatch');
  } finally {
    await identity.close();
  }
});
it('confidential client exchange fails without the configured client secret', async () => {
  const identity = await testIssuer({
    clientSecret: 'synthetic-confidential-fixture',
  });
  try {
    const flow = newFlow();
    const url = new URL(identity.issuer + '/authorize');
    url.search = new URLSearchParams({
      redirect_uri: 'http://localhost:3000/auth/callback',
      nonce: flow.nonce,
      state: flow.state,
      code_challenge: flow.challenge,
    }).toString();
    const r = await fetch(url, { redirect: 'manual' });
    const code = new URL(r.headers.get('location')!).searchParams.get('code')!;
    await expect(
      exchangeCode(
        webConfig({
          ...env,
          OIDC_CLIENT_SECRET: undefined,
          OIDC_ISSUER: identity.issuer,
          OIDC_CLIENT_ID: 'vetready-web',
          OIDC_AUDIENCE: 'vetready-api',
        }),
        code,
        flow,
      ),
    ).rejects.toThrow('Code exchange failed');
  } finally {
    await identity.close();
  }
});

it('Auth0 logout uses the registered trailing-slash return URL without tokens in query parameters', () => {
  const c = webConfig(env);
  const url = new URL(providerLogoutUrl(c)!);
  expect(url.origin).toBe('https://vetreadyafrica-dev.eu.auth0.com');
  expect(url.pathname).toBe('/v2/logout');
  expect(url.searchParams.get('returnTo')).toBe('http://localhost:3000/');
  expect(url.searchParams.get('client_id')).toBe(env.OIDC_CLIENT_ID);
  expect([...url.searchParams.keys()].sort()).toEqual([
    'client_id',
    'returnTo',
  ]);
  expect(
    providerLogoutUrl(
      webConfig({ ...env, OIDC_ISSUER: 'http://127.0.0.1:4001' }),
    ),
  ).toBeNull();
});
it('Auth0 confidential configuration fails early if the client secret is missing', () => {
  expect(() => webConfig({ ...env, OIDC_CLIENT_SECRET: undefined })).toThrow(
    'requires OIDC_CLIENT_SECRET',
  );
});
