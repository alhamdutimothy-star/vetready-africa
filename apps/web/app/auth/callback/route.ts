import { NextRequest, NextResponse } from 'next/server';
import {
  webConfig,
  decryptCookie,
  exchangeCode,
  encryptCookie,
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
    const response = NextResponse.redirect(`${config.APP_ORIGIN}/dashboard`);
    const seconds = Math.min(tokens.expires_in, 3600);
    response.cookies.set(
      SESSION_COOKIE,
      await encryptCookie(
        { accessToken: tokens.access_token },
        config.SESSION_SECRET,
        'session',
        seconds,
      ),
      {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: seconds,
      },
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
    return response;
  }
}
