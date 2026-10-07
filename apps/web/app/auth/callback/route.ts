import { NextRequest, NextResponse } from 'next/server';
import {
  webConfig,
  decryptCookie,
  exchangeCode,
  encryptCookie,
  authCookieOptions,
} from '../../../lib/oidc';
import { FLOW_COOKIE, SESSION_COOKIE } from '../../../lib/session';
export async function GET(request: NextRequest) {
  try {
    const config = webConfig(process.env);
    const value = request.cookies.get(FLOW_COOKIE)?.value;
    const code = request.nextUrl.searchParams.get('code');
    if (!value || !code || code.length > 4096) throw new Error('Missing flow');
    const flow = await decryptCookie(value, config.SESSION_SECRET, 'flow');
    if (!flow.state || request.nextUrl.searchParams.get('state') !== flow.state)
      throw new Error('State mismatch');
    const tokens = await exchangeCode(config, code, flow);
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
    if (!registered.ok) throw new Error('Browser session registration failed');
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
    const response = NextResponse.redirect(`${config.APP_ORIGIN}/dashboard`);
    const seconds = Math.min(
      tokens.expires_in,
      3600,
      Math.floor((Date.parse(record.expiresAt) - Date.now()) / 1000),
    );
    if (seconds < 1) throw new Error('Session expired');
    response.cookies.set(
      SESSION_COOKIE,
      await encryptCookie(
        { accessToken: tokens.access_token, sessionHandle: record.handle },
        config.SESSION_SECRET,
        'session',
        seconds,
      ),
      authCookieOptions(config.NODE_ENV, seconds),
    );
    response.cookies.delete(FLOW_COOKIE);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    const response = NextResponse.json(
      { error: 'Sign-in failed. Start a new sign-in attempt.' },
      { status: 401 },
    );
    response.cookies.delete(FLOW_COOKIE);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
