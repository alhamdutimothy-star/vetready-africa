import { writeFile } from 'node:fs/promises';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { createApp } from '../apps/api/dist/app';
async function main() {
  const app = await createApp({
    DATABASE_URL: 'postgresql://localhost/unused',
    OIDC_ISSUER: 'https://identity.example.invalid/',
    OIDC_JWKS_URI: 'https://identity.example.invalid/jwks',
    OIDC_AUDIENCE: 'vetready-api',
    NODE_ENV: 'test',
    PORT: 4000,
  });
  try {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('VetReady Africa foundation API')
        .setVersion('0.1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'access-token')
        .build(),
    );
    await writeFile(
      'docs/openapi.json',
      JSON.stringify(document, null, 2) + '\n',
    );
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error('API specification generation failed');
  process.exitCode = 1;
});
