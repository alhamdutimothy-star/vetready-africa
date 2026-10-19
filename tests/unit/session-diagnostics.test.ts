import { expect, it } from 'vitest';
import { sessionRegistrationFailure } from '../../apps/api/src/session-diagnostics';
it('reports only approved SQLSTATE, table and constraint identifiers', () => {
  expect(
    sessionRegistrationFailure('default-role-assignment', {
      code: '23503',
      table: 'user_role_assignments',
      constraint: 'user_role_assignments_role_code_role_scope_fkey',
    }),
  ).toEqual({
    event: 'auth.session.registration.failed',
    stage: 'default-role-assignment',
    code: '23503',
    table: 'user_role_assignments',
    constraint: 'user_role_assignments_role_code_role_scope_fkey',
  });
});
it('withholds error messages, detail, SQL, values, unknown identifiers and credentials', () => {
  const event = sessionRegistrationFailure(undefined, {
    code: 'sensitive-value',
    table: 'sensitive-table',
    constraint: 'sensitive-constraint',
    message: 'sensitive-message',
    detail: 'sensitive-identity',
    query: 'sensitive-SQL',
    password: 'sensitive-password',
  });
  expect(JSON.stringify(event)).not.toContain('sensitive-');
  expect(event).toEqual({
    event: 'auth.session.registration.failed',
    stage: 'unknown',
    code: null,
    table: null,
    constraint: null,
  });
});
