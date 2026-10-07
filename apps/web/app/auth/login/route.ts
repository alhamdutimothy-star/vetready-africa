import { NextResponse } from 'next/server';
import {
  webConfig,
  discovery,
  newFlow,
  encryptCookie,
} from '../../../lib/oidc';
import { FLOW_COOKIE } from '../../../lib/session';
export async function GET() {
  try {
    const config = webConfig(process.env);
    const provider = await discovery(config);
    const flow = newFlow();
    const url = new URL(provider.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: config.OIDC_CLIENT_ID,
      redirect_uri: `${config.APP_ORIGIN}/auth/callback`,
      response_type: 'code',
      scope: 'openid profile vetready:access',
      audience: config.OIDC_AUDIENCE,
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: flow.challenge,
      code_challenge_method: 'S256',
    }).toString();
    const response = NextResponse.redirect(url);
    response.cookies.set(
      FLOW_COOKIE,
      await encryptCookie(flow, config.SESSION_SECRET, 'flow', 600),
      {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 600,
      },
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json(
      {
        error:
          'Sign-in is not configured or the identity provider is unavailable.',
      },
      { status: 503 },
    );
  }
}
