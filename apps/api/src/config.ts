import { z } from 'zod';
export const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OIDC_ISSUER: z.url(),
  OIDC_AUDIENCE: z.string().min(1),
  OIDC_JWKS_URI: z.url(),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});
export type ApiConfig = z.infer<typeof configSchema>;
export function readConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const result = configSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Missing/invalid configuration fields: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  for (const field of ['OIDC_ISSUER', 'OIDC_JWKS_URI'] as const) {
    const url = new URL(result.data[field]);
    if (url.username || url.password)
      throw new Error('Credential-bearing identity URLs are prohibited');
    if (
      url.protocol !== 'https:' &&
      !(
        result.data.NODE_ENV !== 'production' &&
        url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost'].includes(url.hostname)
      )
    )
      throw new Error('OIDC requires HTTPS except local development/test');
  }
  return result.data;
}
export const API_CONFIG = Symbol('API_CONFIG');
