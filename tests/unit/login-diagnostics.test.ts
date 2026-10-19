import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loginFailure } from '../../apps/web/lib/login-diagnostics';
const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  discovery: vi.fn(),
  encrypt: vi.fn(),
  flow: vi.fn(),
}));
vi.mock('../../apps/web/lib/oidc', async (original) => ({
  ...(await original<typeof import('../../apps/web/lib/oidc')>()),
  webConfig: mocks.config,
  discovery: mocks.discovery,
  encryptCookie: mocks.encrypt,
  newFlow: mocks.flow,
}));
vi.mock('../../apps/web/lib/session', () => ({ FLOW_COOKIE: 'vetready_flow' }));
import { GET } from '../../apps/web/app/auth/login/route';
let logging: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  logging = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.config.mockReturnValue({
    OIDC_CLIENT_ID: 'fixture',
    OIDC_AUDIENCE: 'fixture-api',
    APP_ORIGIN: 'http://localhost:3000',
    NODE_ENV: 'development',
    SESSION_SECRET: 'synthetic-key-must-not-log',
  });
  mocks.discovery.mockResolvedValue({
    authorization_endpoint: 'https://provider.example/authorize',
  });
  mocks.flow.mockReturnValue({
    state: 'sensitive-state',
    nonce: 'sensitive-nonce',
    challenge: 'fixture',
  });
  mocks.encrypt.mockResolvedValue('synthetic-cookie-must-not-log');
});
afterEach(() => vi.restoreAllMocks());
it('logs the failing stage and safe exception while keeping public 503 generic', async () => {
  mocks.discovery.mockRejectedValue(
    new TypeError('fetch failed', {
      cause: Object.assign(new Error('sensitive URL must not log'), {
        code: 'ENOTFOUND',
      }),
    }),
  );
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({
    error: 'Sign-in is not configured or the identity provider is unavailable.',
  });
  expect(JSON.parse(logging.mock.calls[0]![0])).toEqual({
    event: 'auth.login.failed',
    stage: 'discovery',
    errorName: 'TypeError',
    errorMessage: 'fetch failed',
    causeCode: 'ENOTFOUND',
    httpStatus: null,
  });
});
it.each([
  ['configuration', 'config'],
  ['discovery', 'discovery'],
  ['flow-generation', 'flow'],
  ['flow-cookie-encryption', 'encrypt'],
] as const)(
  'identifies %s failures without logging arbitrary error data',
  async (stage, target) => {
    const error = new Error(
      'secret token cookie code verifier state nonce must not log',
    );
    if (target === 'discovery' || target === 'encrypt')
      mocks[target].mockRejectedValue(error);
    else
      mocks[target].mockImplementation(() => {
        throw error;
      });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(JSON.parse(logging.mock.calls[0]![0])).toMatchObject({
      stage,
      errorMessage: 'Unlisted error details withheld',
    });
    expect(JSON.stringify(logging.mock.calls)).not.toContain('must not log');
  },
);
it('redacts arbitrary exception names, messages, causes and stack traces', () => {
  const e = Object.assign(new Error('synthetic-secret'), {
    name: 'synthetic-secret',
    cause: { code: 'synthetic-secret' },
  });
  expect(JSON.stringify(loginFailure('discovery', e))).not.toContain(
    'synthetic-secret',
  );
});
it('keeps successful login redirect and secure flow cookie behavior', async () => {
  const response = await GET();
  expect(response.status).toBe(307);
  const location = new URL(response.headers.get('location')!);
  expect(location.searchParams.get('audience')).toBe('fixture-api');
  const cookie = response.headers.getSetCookie()[0]!;
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=lax');
  expect(logging).not.toHaveBeenCalled();
});
