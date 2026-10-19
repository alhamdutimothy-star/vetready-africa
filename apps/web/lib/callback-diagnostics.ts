import { loginFailure } from './login-diagnostics';
export type CallbackStage =
  | 'configuration'
  | 'flow-cookie-retrieval'
  | 'flow-cookie-decryption'
  | 'state-validation'
  | 'flow-validation'
  | 'discovery'
  | 'token-exchange'
  | 'token-response-validation'
  | 'id-token-validation'
  | 'access-token-validation'
  | 'browser-session-registration'
  | 'session-registration-validation'
  | 'session-cookie-creation'
  | 'session-cookie-setting'
  | 'dashboard-redirect'
  | 'unexpected';
const oauthErrors = new Set([
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
  'access_denied',
  'server_error',
  'temporarily_unavailable',
]);
export class CallbackHttpError extends Error {
  readonly oauthError: string | null;
  constructor(
    message: 'Code exchange failed' | 'Browser session registration failed',
    readonly status: number,
    oauthError?: unknown,
  ) {
    super(message);
    this.name = 'CallbackHttpError';
    this.oauthError =
      typeof oauthError === 'string' && oauthErrors.has(oauthError)
        ? oauthError
        : null;
  }
}
const safeMessages = new Set([
  'Missing flow',
  'Missing flow cookie',
  'Missing authorization code',
  'Invalid authorization code',
  'State mismatch',
  'Invalid login flow',
  'Code exchange failed',
  'Nonce mismatch',
  'Authorized party mismatch',
  'Access identity/scope mismatch',
  'Browser session registration failed',
  'Invalid registered session',
  'Session expired',
]);
const safeClaims = new Set([
  'iss',
  'aud',
  'sub',
  'exp',
  'iat',
  'nbf',
  'azp',
  'nonce',
]);
const safeNames = new Set([
  'CallbackHttpError',
  'JWTClaimValidationFailed',
  'JWTExpired',
  'JWTInvalid',
  'JWSSignatureVerificationFailed',
  'JWSInvalid',
  'JWKSNoMatchingKey',
  'JWKSInvalid',
  'JWKSTimeout',
  'JWEDecryptionFailed',
  'JWEInvalid',
  'JOSEAlgNotAllowed',
  'JOSEInvalid',
]);
export function callbackFailure(stage: CallbackStage, error: unknown) {
  const safe = loginFailure('configuration', error);
  return {
    ...safe,
    event: 'auth.callback.failed',
    stage,
    errorName:
      error instanceof Error && safeNames.has(error.name)
        ? error.name
        : safe.errorName,
    errorMessage:
      error instanceof Error && safeMessages.has(error.message)
        ? error.message
        : safe.errorMessage,
    httpStatus:
      error instanceof CallbackHttpError &&
      Number.isInteger(error.status) &&
      error.status >= 100 &&
      error.status <= 599
        ? error.status
        : safe.httpStatus,
    oauthError: error instanceof CallbackHttpError ? error.oauthError : null,
    claim:
      error instanceof Error &&
      error.name === 'JWTClaimValidationFailed' &&
      'claim' in error &&
      typeof error.claim === 'string' &&
      safeClaims.has(error.claim)
        ? error.claim
        : null,
  };
}
