import { Pool } from 'pg';
import { execFileSync } from 'node:child_process';
export async function prepareTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL required. Run npm run env:up.');
  const parsed = new URL(url);
  if (
    !parsed.pathname.endsWith('_test') ||
    !['localhost', '127.0.0.1'].includes(parsed.hostname)
  )
    throw new Error('Tests require a dedicated local database ending _test');
  const pool = new Pool({ connectionString: url });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  const env = { ...process.env, DATABASE_URL: url };
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], {
    env,
    stdio: 'pipe',
  });
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/seed.ts'], {
    env,
    stdio: 'pipe',
  });
  return { pool, url };
}
