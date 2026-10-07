import 'server-only';
import { cookies } from 'next/headers';
import { decryptCookie, webConfig } from './oidc';
export const SESSION_COOKIE = 'vetready_session';
export const FLOW_COOKIE = 'vetready_flow';
export async function session() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const config = webConfig(process.env);
    const payload = await decryptCookie(
      value,
      config.SESSION_SECRET,
      'session',
    );
    return typeof payload.accessToken === 'string'
      ? { accessToken: payload.accessToken }
      : null;
  } catch {
    return null;
  }
}
export async function api(path: string, options?: RequestInit) {
  const current = await session();
  if (!current) return null;
  const config = webConfig(process.env);
  return fetch(`${config.API_INTERNAL_URL}/api/v1${path}`, {
    ...options,
    headers: {
      ...options?.headers,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${current.accessToken}`,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
}
