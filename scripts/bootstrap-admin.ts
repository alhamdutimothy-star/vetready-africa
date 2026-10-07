import { z } from 'zod';
import { databasePool, transaction } from './db';
async function main() {
  const userId = z.uuid().parse(process.env.BOOTSTRAP_USER_ID);
  const reason = z
    .string()
    .min(10)
    .max(500)
    .parse(process.env.BOOTSTRAP_REASON);
  if (process.env.BOOTSTRAP_CONFIRM !== 'grant-super-admin')
    throw new Error('Explicit confirmation required');
  const pool = databasePool();
  try {
    await transaction(pool, async (client) => {
      if (
        !(
          await client.query(
            "SELECT id FROM users WHERE id=$1 AND status='ACTIVE'",
            [userId],
          )
        ).rows[0]
      )
        throw new Error('Active previously authenticated user required');
      const result = await client.query<{ id: string }>(
        "INSERT INTO user_role_assignments(user_id,role_code,role_scope,granted_by,reason) VALUES($1,'SUPER_ADMIN','PLATFORM',$1,$2) RETURNING id",
        [userId, reason],
      );
      await client.query(
        "INSERT INTO audit_events(actor_id,action,resource_type,resource_id,metadata) VALUES($1,'role.bootstrap','role_assignment',$2,$3)",
        [userId, result.rows[0]!.id, JSON.stringify({ reason })],
      );
    });
    console.log('Initial role granted and audited.');
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    'Admin bootstrap failed; requires operator database access, active user and explicit confirmation.',
  );
  process.exitCode = 1;
});
