export type SessionRegistrationStage =
  | 'jwt-validation'
  | 'identity-transaction'
  | 'identity-provisioning'
  | 'identity-lookup'
  | 'default-role-assignment'
  | 'identity-audit'
  | 'role-lookup'
  | 'browser-session-validation'
  | 'identity-commit'
  | 'session-transaction'
  | 'session-insert'
  | 'session-audit'
  | 'session-response'
  | 'session-commit';
const codes = new Set([
  '42P01',
  '42703',
  '42883',
  '23503',
  '23514',
  '23502',
  '23505',
  '22P02',
  '42501',
  '3D000',
  '28P01',
  '08006',
  'ECONNREFUSED',
  'ETIMEDOUT',
]);
const tables = new Set([
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'user_role_assignments',
  'audit_events',
  'browser_sessions',
]);
const constraints = new Set([
  'browser_sessions_user_id_fkey',
  'browser_sessions_handle_hash_key',
  'browser_sessions_handle_hash_check',
  'browser_sessions_check',
  'user_role_assignments_role_code_role_scope_fkey',
  'user_role_assignments_user_id_fkey',
  'audit_events_actor_id_fkey',
]);
export function sessionRegistrationFailure(
  stage: SessionRegistrationStage | undefined,
  error: unknown,
) {
  // Never log SQL, parameters, message/detail/hint, personal identifiers or errors.
  const e = error && typeof error === 'object' ? error : {};
  const code =
    'code' in e && typeof e.code === 'string' && codes.has(e.code)
      ? e.code
      : null;
  return {
    event: 'auth.session.registration.failed',
    stage: stage ?? 'unknown',
    code,
    table:
      'table' in e && typeof e.table === 'string' && tables.has(e.table)
        ? e.table
        : null,
    constraint:
      'constraint' in e &&
      typeof e.constraint === 'string' &&
      constraints.has(e.constraint)
        ? e.constraint
        : null,
  };
}
