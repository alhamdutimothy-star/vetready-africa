import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT, type JWTPayload } from 'jose';
export async function testIssuer() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  let issuer = '';
  const codes = new Map<
    string,
    { nonce: string; challenge: string; redirectUri: string }
  >();
  async function token(subject = 'candidate-a', claims: JWTPayload = {}) {
    return new SignJWT({ scope: 'vetready:access', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('vetready-api')
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  }
  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', issuer || 'http://127.0.0.1');
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/jwks') {
      response.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    if (url.pathname === '/.well-known/openid-configuration') {
      response.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
        }),
      );
      return;
    }
    if (url.pathname === '/authorize') {
      const redirectUri = url.searchParams.get('redirect_uri') ?? '';
      const code = randomUUID();
      codes.set(code, {
        nonce: url.searchParams.get('nonce') ?? '',
        challenge: url.searchParams.get('code_challenge') ?? '',
        redirectUri,
      });
      const callback = new URL(redirectUri);
      callback.searchParams.set('code', code);
      callback.searchParams.set('state', url.searchParams.get('state') ?? '');
      response.writeHead(302, { Location: callback.toString() });
      response.end();
      return;
    }
    if (url.pathname === '/token') {
      let body = '';
      for await (const chunk of request) body += chunk.toString();
      const form = new URLSearchParams(body);
      const code = form.get('code') ?? '';
      const flow = codes.get(code);
      codes.delete(code);
      if (
        !flow ||
        form.get('redirect_uri') !== flow.redirectUri ||
        createHash('sha256')
          .update(form.get('code_verifier') ?? '')
          .digest('base64url') !== flow.challenge
      ) {
        response.statusCode = 400;
        response.end('{}');
        return;
      }
      const id = await new SignJWT({ nonce: flow.nonce })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(issuer)
        .setAudience('vetready-web')
        .setSubject('browser-candidate')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
      response.end(
        JSON.stringify({
          access_token: await token('browser-candidate'),
          id_token: id,
          expires_in: 300,
          token_type: 'Bearer',
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Issuer port unavailable');
  issuer = `http://127.0.0.1:${address.port}`;
  return {
    issuer,
    token,
    privateKey,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
