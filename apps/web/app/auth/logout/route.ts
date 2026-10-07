import { NextRequest, NextResponse } from 'next/server';
import { webConfig } from '../../../lib/oidc';
import { SESSION_COOKIE, FLOW_COOKIE } from '../../../lib/session';
export async function POST(request: NextRequest) {
  let origin: string;
  try {
    origin = webConfig(process.env).APP_ORIGIN;
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
  const response = NextResponse.redirect(origin, 303);
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(FLOW_COOKIE);
  return response;
}
