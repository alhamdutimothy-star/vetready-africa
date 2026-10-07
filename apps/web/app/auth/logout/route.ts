import { NextRequest, NextResponse } from 'next/server';
import { webConfig, providerLogoutUrl } from '../../../lib/oidc';
import {
  SESSION_COOKIE,
  FLOW_COOKIE,
  session,
  api,
} from '../../../lib/session';
export async function POST(request: NextRequest) {
  let origin: string;
  let providerUrl: string | null;
  try {
    const config = webConfig(process.env);
    origin = config.APP_ORIGIN;
    providerUrl = providerLogoutUrl(config);
  } catch {
    return NextResponse.json(
      { error: 'Authentication unavailable' },
      { status: 503 },
    );
  }
  if (request.headers.get('origin') !== origin)
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 },
    );
  // Clearing a cookie alone does not terminate a copied authenticated session.
  try {
    if (await session()) {
      const revoked = await api('/sessions/current', { method: 'DELETE' });
      if (!revoked || !revoked.ok)
        throw new Error('Session revocation unavailable');
    }
  } catch {
    return NextResponse.json(
      { error: 'Sign-out could not terminate the session. Please retry.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const response = NextResponse.redirect(providerUrl ?? origin, 303);
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(FLOW_COOKIE);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
