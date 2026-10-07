import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { databasePool } from './db';
async function main() {
  const pool = databasePool();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(418271)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const files = (await readdir('db/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const name of files) {
      const sql = await readFile(`db/migrations/${name}`, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE name=$1',
        [name],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
          [name, checksum],
        );
        await client.query('COMMIT');
        console.log(`Applied ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(418271)');
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    'Migration failed; inspect configuration/schema without logging credentials.',
  );
  process.exitCode = 1;
});
