import { createApp } from './app';
import { readConfig } from './config';
async function main() {
  const config = readConfig(process.env);
  const app = await createApp(config);
  await app.listen(config.PORT, '0.0.0.0');
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message.startsWith('Missing/invalid')
      ? error.message
      : 'API startup failed; check database and OIDC configuration.',
  );
  process.exitCode = 1;
});
