import { NextRequest, NextResponse } from 'next/server';
import {
  webConfig,
  decryptCookie,
  exchangeCode,
  encryptCookie,
  authCookieOptions,
} from '../../../lib/oidc';
import { FLOW_COOKIE, SESSION_COOKIE } from '../../../lib/session';
import {
  callbackFailure,
  CallbackHttpError,
  type CallbackStage,
} from '../../../lib/callback-diagnostics';
export async function GET(request: NextRequest) {
  let stage: CallbackStage = 'configuration';
  try {
    const config = webConfig(process.env);
    stage = 'flow-cookie-retrieval';
    const value = request.cookies.get(FLOW_COOKIE)?.value;
    const code = request.nextUrl.searchParams.get('code');
    if (!value) throw new Error('Missing flow cookie');
    if (!code) throw new Error('Missing authorization code');
    if (code.length > 4096) throw new Error('Invalid authorization code');
    stage = 'flow-cookie-decryption';
    const flow = await decryptCookie(value, config.SESSION_SECRET, 'flow');
    stage = 'state-validation';
    if (!flow.state || request.nextUrl.searchParams.get('state') !== flow.state)
      throw new Error('State mismatch');
    stage = 'unexpected';
    const tokens = await exchangeCode(config, code, flow, (value) => {
      stage = value;
    });
    stage = 'browser-session-registration';
    const registered = await fetch(
      `${config.API_INTERNAL_URL}/api/v1/sessions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!registered.ok)
      throw new CallbackHttpError(
        'Browser session registration failed',
        registered.status,
      );
    stage = 'session-registration-validation';
    const record = (await registered.json()) as {
      handle?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof record.handle !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(record.handle) ||
      typeof record.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(record.expiresAt))
    )
      throw new Error('Invalid registered session');
    stage = 'session-cookie-creation';
    const seconds = Math.min(
      tokens.expires_in,
      3600,
      Math.floor((Date.parse(record.expiresAt) - Date.now()) / 1000),
    );
    if (seconds < 1) throw new Error('Session expired');
    const encryptedSession = await encryptCookie(
      { accessToken: tokens.access_token, sessionHandle: record.handle },
      config.SESSION_SECRET,
      'session',
      seconds,
    );
    stage = 'dashboard-redirect';
    const response = NextResponse.redirect(`${config.APP_ORIGIN}/dashboard`);
    stage = 'session-cookie-setting';
    response.cookies.set(
      SESSION_COOKIE,
      encryptedSession,
      authCookieOptions(config.NODE_ENV, seconds),
    );
    response.cookies.delete(FLOW_COOKIE);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error(JSON.stringify(callbackFailure(stage, error)));
    const response = NextResponse.json(
      { error: 'Sign-in failed. Start a new sign-in attempt.' },
      { status: 401 },
    );
    response.cookies.delete(FLOW_COOKIE);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
