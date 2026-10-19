import { NextResponse } from 'next/server';
import {
  webConfig,
  discovery,
  newFlow,
  encryptCookie,
  authCookieOptions,
} from '../../../lib/oidc';
import { FLOW_COOKIE } from '../../../lib/session';
import { loginFailure, type LoginStage } from '../../../lib/login-diagnostics';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  let stage: LoginStage = 'configuration';
  try {
    const config = webConfig(process.env);
    stage = 'discovery';
    const provider = await discovery(config);
    stage = 'flow-generation';
    const flow = newFlow();
    stage = 'authorization-redirect';
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
    stage = 'flow-cookie-encryption';
    const encryptedFlow = await encryptCookie(
      flow,
      config.SESSION_SECRET,
      'flow',
      600,
    );
    stage = 'flow-cookie-setting';
    response.cookies.set(
      FLOW_COOKIE,
      encryptedFlow,
      authCookieOptions(config.NODE_ENV, 600),
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error(JSON.stringify(loginFailure(stage, error)));
    return NextResponse.json(
      {
        error:
          'Sign-in is not configured or the identity provider is unavailable.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
