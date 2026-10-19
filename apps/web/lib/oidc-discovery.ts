import { z } from 'zod';
const schema = z.object({
  issuer: z.url(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
});
type Metadata = Readonly<z.infer<typeof schema>>;
type Context = { OIDC_ISSUER: string; NODE_ENV: string };
const ttl = 5 * 60 * 1000;
export class DiscoveryHttpError extends Error {
  constructor(readonly status: number) {
    super('Identity provider unavailable');
    this.name = 'DiscoveryHttpError';
  }
}
// Public metadata only: no configuration secrets, tokens or per-user flow state.
// A single slot bounds memory; issuer and runtime mode isolate trust contexts.
export function createDiscoveryCache(
  fetcher: typeof fetch = (...args) => fetch(...args),
  now: () => number = Date.now,
) {
  let slot:
    | {
        key: string;
        value?: Metadata;
        expiresAt: number;
        pending?: Promise<Metadata>;
      }
    | undefined;
  async function load(config: Context): Promise<Metadata> {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetcher(
          `${config.OIDC_ISSUER.replace(/\/$/, '')}/.well-known/openid-configuration`,
          {
            signal: AbortSignal.timeout(10000),
            cache: 'no-store',
            redirect: 'error',
          },
        );
      } catch (error) {
        const code =
          error instanceof Error &&
          error.cause &&
          typeof error.cause === 'object' &&
          'code' in error.cause
            ? error.cause.code
            : undefined;
        const transient =
          error instanceof Error &&
          (error.name === 'TimeoutError' ||
            [
              'ECONNRESET',
              'ETIMEDOUT',
              'EAI_AGAIN',
              'UND_ERR_CONNECT_TIMEOUT',
              'UND_ERR_HEADERS_TIMEOUT',
            ].includes(String(code)));
        if (attempt === 0 && transient) continue;
        throw error;
      }
      if (attempt === 0 && [502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        continue;
      }
      break;
    }
    if (!response?.ok) throw new DiscoveryHttpError(response?.status ?? 0);
    const data = schema.parse(await response.json());
    if (data.issuer !== config.OIDC_ISSUER) throw new Error('Issuer mismatch');
    for (const endpoint of [
      data.authorization_endpoint,
      data.token_endpoint,
      data.jwks_uri,
    ]) {
      const u = new URL(endpoint);
      if (
        u.protocol !== 'https:' &&
        !(
          config.NODE_ENV !== 'production' &&
          u.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(u.hostname)
        )
      )
        throw new Error('Insecure identity endpoint');
      if (u.username || u.password)
        throw new Error('Invalid identity endpoint');
    }
    return Object.freeze(data);
  }
  return async function discovery(config: Context): Promise<Metadata> {
    const key = JSON.stringify([config.OIDC_ISSUER, config.NODE_ENV]);
    if (!slot || slot.key !== key) slot = { key, expiresAt: 0 };
    const entry = slot;
    if (entry.value && now() < entry.expiresAt) return entry.value;
    if (!entry.pending) {
      entry.pending = load(config)
        .then((value) => {
          entry.value = value;
          entry.expiresAt = now() + ttl;
          return value;
        })
        .finally(() => {
          // Never cache a rejected promise or extend expired metadata on failure.
          entry.pending = undefined;
        });
    }
    return entry.pending;
  };
}
export const discovery = createDiscoveryCache();
