import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { databasePool } from './db';
import { sessionRegistrationFailure } from '../apps/api/src/session-diagnostics';
async function main() {
  const pool = databasePool();
  try {
    const tables = (
      await pool.query<{
        users: boolean;
        roles: boolean;
        sessions: boolean;
        audit: boolean;
        ledger: boolean;
      }>(
        "SELECT to_regclass('public.users') IS NOT NULL AS users,to_regclass('public.roles') IS NOT NULL AS roles,to_regclass('public.browser_sessions') IS NOT NULL AS sessions,to_regclass('public.audit_events') IS NOT NULL AS audit,to_regclass('public.schema_migrations') IS NOT NULL AS ledger",
      )
    ).rows[0]!;
    const candidateRolePresent =
      tables.roles &&
      Boolean(
        (
          await pool.query(
            "SELECT 1 FROM roles WHERE code='CANDIDATE' AND scope='PLATFORM'",
          )
        ).rowCount,
      );
    let sessionMigrationRecorded = false,
      sessionMigrationChecksumMatches = false;
    if (tables.ledger) {
      const row = (
        await pool.query<{ checksum: string }>(
          "SELECT checksum FROM schema_migrations WHERE name='008_browser_sessions.sql'",
        )
      ).rows[0];
      sessionMigrationRecorded = Boolean(row);
      const expected = createHash('sha256')
        .update(await readFile('db/migrations/008_browser_sessions.sql'))
        .digest('hex');
      sessionMigrationChecksumMatches = row?.checksum === expected;
    }
    const checks = {
      usersTablePresent: tables.users,
      rolesTablePresent: tables.roles,
      browserSessionsTablePresent: tables.sessions,
      auditTablePresent: tables.audit,
      candidateRolePresent,
      sessionMigrationRecorded,
      sessionMigrationChecksumMatches,
    };
    console.log(JSON.stringify(checks, null, 2));
    if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  const safe = sessionRegistrationFailure(undefined, error);
  console.log(JSON.stringify({ databaseCheckFailed: true, code: safe.code }));
  process.exitCode = 1;
});
