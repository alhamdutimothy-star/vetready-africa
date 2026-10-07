import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
const image =
  'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
async function main() {
  mkdirSync('.local', { recursive: true, mode: 0o700 });
  const pgFile = '.local/postgres.env';
  const dbFile = '.local/database.env';
  if (existsSync(pgFile) !== existsSync(dbFile))
    throw new Error(
      'Incomplete local database configuration; preserve files and repair explicitly',
    );
  if (!existsSync(pgFile)) {
    const password = randomBytes(32).toString('hex');
    writeFileSync(
      pgFile,
      `POSTGRES_USER=vetready\nPOSTGRES_DB=vetready\nPOSTGRES_PASSWORD=${password}\n`,
      { mode: 0o600 },
    );
    writeFileSync(
      dbFile,
      `DATABASE_URL=postgresql://vetready:${password}@127.0.0.1:54329/vetready\nTEST_DATABASE_URL=postgresql://vetready:${password}@127.0.0.1:54329/vetready_test\n`,
      { mode: 0o600 },
    );
  }
  chmodSync(pgFile, 0o600);
  chmodSync(dbFile, 0o600);
  const inspection = spawnSync(
    'docker',
    ['inspect', '--format', '{{.Config.Image}}', 'vetready-postgres'],
    { encoding: 'utf8' },
  );
  if (inspection.status === 0) {
    if (inspection.stdout.trim() !== image)
      throw new Error(
        'Existing container is not the expected pinned image; no changes made',
      );
    execFileSync('docker', ['start', 'vetready-postgres'], { stdio: 'ignore' });
  } else
    execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        'vetready-postgres',
        '--label',
        'vetready.managed=true',
        '--env-file',
        pgFile,
        '-p',
        '127.0.0.1:54329:5432',
        '-v',
        'vetready-pgdata:/var/lib/postgresql/data',
        image,
      ],
      { stdio: 'ignore' },
    );
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (
      spawnSync(
        'docker',
        ['exec', 'vetready-postgres', 'pg_isready', '-U', 'vetready'],
        { stdio: 'ignore' },
      ).status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Database did not become ready');
  const dbExists = execFileSync(
    'docker',
    [
      'exec',
      'vetready-postgres',
      'psql',
      '-U',
      'vetready',
      '-d',
      'postgres',
      '-tAc',
      "SELECT 1 FROM pg_database WHERE datname='vetready_test'",
    ],
    { encoding: 'utf8' },
  ).trim();
  if (!dbExists)
    execFileSync(
      'docker',
      [
        'exec',
        'vetready-postgres',
        'createdb',
        '-U',
        'vetready',
        'vetready_test',
      ],
      { stdio: 'ignore' },
    );
  for (const line of readFileSync(dbFile, 'utf8').split('\n')) {
    const index = line.indexOf('=');
    if (index > 0 && !process.env[line.slice(0, index)])
      process.env[line.slice(0, index)] = line.slice(index + 1);
  }
  // Validate credentials and schema using the same host connection the API uses.
  for (const script of ['migrate', 'seed'])
    execFileSync(
      process.execPath,
      ['--import', 'tsx', `scripts/${script}.ts`],
      { env: process.env, stdio: 'inherit' },
    );
  console.log(
    'Local development/test PostgreSQL ready. Existing data was preserved.',
  );
}
main().catch(() => {
  console.error(
    'Local database setup failed; check Docker, existing state and ignored configuration. No credentials logged.',
  );
  process.exitCode = 1;
});
