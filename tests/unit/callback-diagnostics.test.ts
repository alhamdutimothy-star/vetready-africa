import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  callbackFailure,
  CallbackHttpError,
  type CallbackStage,
} from '../../apps/web/lib/callback-diagnostics';
const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  decrypt: vi.fn(),
  exchange: vi.fn(),
  encrypt: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('../../apps/web/lib/oidc', async (original) => ({
  ...(await original<typeof import('../../apps/web/lib/oidc')>()),
  webConfig: mocks.config,
  decryptCookie: mocks.decrypt,
  exchangeCode: mocks.exchange,
  encryptCookie: mocks.encrypt,
}));
vi.mock('../../apps/web/lib/session', () => ({
  FLOW_COOKIE: 'vetready_flow',
  SESSION_COOKIE: 'vetready_session',
}));
import { GET } from '../../apps/web/app/auth/callback/route';
let logging: ReturnType<typeof vi.spyOn>;
function request() {
  return new NextRequest(
    'http://localhost:3000/auth/callback?code=sensitive-code&state=sensitive-state',
    { headers: { cookie: 'vetready_flow=sensitive-cookie' } },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  logging = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.config.mockReturnValue({
    APP_ORIGIN: 'http://localhost:3000',
    API_INTERNAL_URL: 'http://127.0.0.1:4000',
    NODE_ENV: 'development',
    SESSION_SECRET: 'a'.repeat(64),
  });
  mocks.decrypt.mockResolvedValue({
    state: 'sensitive-state',
    verifier: 'sensitive-verifier',
    nonce: 'sensitive-nonce',
  });
  mocks.exchange.mockResolvedValue({
    access_token: 'sensitive-token',
    expires_in: 300,
  });
  mocks.encrypt.mockResolvedValue('encrypted-session-fixture');
  mocks.fetch.mockImplementation(async () =>
    Response.json({
      handle: 'h'.repeat(43),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function rejected(stage: CallbackStage) {
  const response = await GET(request());
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    error: 'Sign-in failed. Start a new sign-in attempt.',
  });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(
    response.headers
      .getSetCookie()
      .some((c) => c.startsWith('vetready_flow=;')),
  ).toBe(true);
  expect(
    response.headers
      .getSetCookie()
      .some((c) => c.startsWith('vetready_session=')),
  ).toBe(false);
  const event = JSON.parse(logging.mock.calls[0]![0]);
  expect(event.event).toBe('auth.callback.failed');
  expect(event.stage).toBe(stage);
  expect(JSON.stringify(logging.mock.calls)).not.toContain('sensitive-');
  return event;
}
it('retains the generic failure when the flow cookie is missing', async () => {
  const response = await GET(
    new NextRequest('http://localhost:3000/auth/callback'),
  );
  expect(response.status).toBe(401);
  expect(JSON.parse(logging.mock.calls[0]![0]).stage).toBe(
    'flow-cookie-retrieval',
  );
});
it.each([
  ['configuration', 'config'],
  ['flow-cookie-decryption', 'decrypt'],
  ['session-cookie-creation', 'encrypt'],
] as const)('identifies %s errors safely', async (stage, target) => {
  mocks[target].mockImplementation(() => {
    throw Error('sensitive-error');
  });
  await rejected(stage);
});
it('rejects state mismatch before token exchange', async () => {
  mocks.decrypt.mockResolvedValue({ state: 'mismatch' });
  await rejected('state-validation');
  expect(mocks.exchange).not.toHaveBeenCalled();
});
it.each([
  'discovery',
  'token-exchange',
  'token-response-validation',
  'id-token-validation',
  'access-token-validation',
  'unexpected',
] as const)('identifies exchange stage %s', async (stage) => {
  mocks.exchange.mockImplementation(
    async (_config, _code, _flow, onStage: (stage: CallbackStage) => void) => {
      onStage(stage);
      throw new Error('sensitive-error');
    },
  );
  await rejected(stage);
});
it('records rejected browser-session registration status without its response body', async () => {
  mocks.fetch.mockResolvedValue(
    new Response('sensitive-backend-response', { status: 403 }),
  );
  expect(await rejected('browser-session-registration')).toMatchObject({
    httpStatus: 403,
  });
});
it('rejects invalid browser-session records', async () => {
  mocks.fetch.mockResolvedValue(Response.json({ handle: 'sensitive-invalid' }));
  await rejected('session-registration-validation');
});
it('allows successful callback without diagnostic or token exposure', async () => {
  const response = await GET(request());
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe(
    'http://localhost:3000/dashboard',
  );
  expect(
    response.headers
      .getSetCookie()
      .some(
        (c) =>
          c.startsWith('vetready_session=encrypted-session-fixture;') &&
          c.includes('HttpOnly') &&
          c.includes('SameSite=lax'),
      ),
  ).toBe(true);
  expect(logging).not.toHaveBeenCalled();
});
it('logs only approved OAuth error codes, never provider descriptions or raw errors', () => {
  expect(
    callbackFailure(
      'token-exchange',
      new CallbackHttpError('Code exchange failed', 400, 'invalid_grant'),
    ),
  ).toMatchObject({ httpStatus: 400, oauthError: 'invalid_grant' });
  const error = Object.assign(new Error('sensitive-message'), {
    name: 'sensitive-name',
    cause: { code: 'sensitive-code' },
  });
  expect(JSON.stringify(callbackFailure('unexpected', error))).not.toContain(
    'sensitive-',
  );
  expect(
    callbackFailure(
      'token-exchange',
      new CallbackHttpError('Code exchange failed', 400, 'sensitive-value'),
    ).oauthError,
  ).toBeNull();
});

it('identifies only allowlisted JWT claim names without payload values', () => {
  const error = Object.assign(new Error('sensitive-claim-value'), {
    name: 'JWTClaimValidationFailed',
    claim: 'aud',
    payload: { aud: 'sensitive-audience' },
  });
  const event = callbackFailure('id-token-validation', error);
  expect(event.claim).toBe('aud');
  expect(JSON.stringify(event)).not.toContain('sensitive-');
  error.claim = 'sensitive-field';
  expect(callbackFailure('id-token-validation', error).claim).toBeNull();
});

it('identifies redirect construction failures', async () => {
  vi.spyOn(NextResponse, 'redirect').mockImplementationOnce(() => {
    throw Error('sensitive-redirect');
  });
  await rejected('dashboard-redirect');
});
it('identifies session cookie-setting failures', async () => {
  const response = NextResponse.redirect('http://localhost:3000/dashboard');
  vi.spyOn(response.cookies, 'set').mockImplementationOnce(() => {
    throw Error('sensitive-cookie');
  });
  vi.spyOn(NextResponse, 'redirect').mockReturnValueOnce(response);
  await rejected('session-cookie-setting');
});
