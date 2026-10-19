import { DiscoveryHttpError } from './oidc-discovery';
// Never serialize an exception: Zod issues, causes and fetch errors can contain
// credentials, URLs or payloads. Only audited literals may reach server logs.
export type LoginStage =
  | 'configuration'
  | 'discovery'
  | 'flow-generation'
  | 'authorization-redirect'
  | 'flow-cookie-encryption'
  | 'flow-cookie-setting';
const safeMessages = new Set([
  'Authentication configuration is incomplete',
  'Invalid authentication endpoint',
  'HTTPS required',
  'APP_ORIGIN must be an origin',
  'API and web audiences must differ',
  'Auth0 Regular Web Application requires OIDC_CLIENT_SECRET',
  'Identity provider unavailable',
  'Issuer mismatch',
  'Insecure identity endpoint',
  'Invalid identity endpoint',
  'Session token exceeds secure cookie capacity',
  'fetch failed',
  'The operation was aborted due to timeout',
  'This operation was aborted',
]);
const safeNames = new Set([
  'Error',
  'TypeError',
  'ZodError',
  'DiscoveryHttpError',
  'TimeoutError',
  'AbortError',
  'JWEInvalid',
  'JOSENotSupported',
]);
const safeCodes = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
]);
export function loginFailure(stage: LoginStage, error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? cause.code
      : undefined;
  return {
    event: 'auth.login.failed',
    stage,
    errorName:
      error instanceof Error && safeNames.has(error.name)
        ? error.name
        : 'UnclassifiedError',
    errorMessage:
      error instanceof Error && safeMessages.has(error.message)
        ? error.message
        : 'Unlisted error details withheld',
    causeCode: typeof code === 'string' && safeCodes.has(code) ? code : null,
    httpStatus:
      error instanceof DiscoveryHttpError &&
      Number.isInteger(error.status) &&
      error.status >= 100 &&
      error.status <= 599
        ? error.status
        : null,
  };
}
