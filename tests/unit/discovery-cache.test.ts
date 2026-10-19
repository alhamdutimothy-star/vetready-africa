import { expect, it, vi } from 'vitest';
import { createDiscoveryCache } from '../../apps/web/lib/oidc-discovery';
import { loginFailure } from '../../apps/web/lib/login-diagnostics';
const context = {
  OIDC_ISSUER: 'https://identity.example/',
  NODE_ENV: 'production',
};
const document = {
  issuer: context.OIDC_ISSUER,
  authorization_endpoint: 'https://identity.example/authorize',
  token_endpoint: 'https://identity.example/token',
  jwks_uri: 'https://identity.example/jwks',
};
function mockFetch() {
  return vi.fn<typeof fetch>();
}
it('coalesces concurrent requests, reuses only fresh metadata, and freezes it', async () => {
  let now = 0;
  const fetcher = mockFetch().mockImplementation(async () =>
    Response.json(document),
  );
  const discovery = createDiscoveryCache(fetcher, () => now);
  const values = await Promise.all(
    Array.from({ length: 8 }, () => discovery(context)),
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(Object.isFrozen(values[0])).toBe(true);
  await discovery(context);
  expect(fetcher).toHaveBeenCalledTimes(1);
  now = 300000;
  await discovery(context);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('reproduces discovery-stage timeouts, bounds retries and recovers after failure', async () => {
  const timeout = new DOMException(
    'The operation was aborted due to timeout',
    'TimeoutError',
  );
  const fetcher = mockFetch()
    .mockRejectedValueOnce(timeout)
    .mockRejectedValueOnce(timeout)
    .mockResolvedValueOnce(Response.json(document));
  const discovery = createDiscoveryCache(fetcher);
  await expect(discovery(context)).rejects.toBe(timeout);
  expect(loginFailure('discovery', timeout)).toMatchObject({
    stage: 'discovery',
    errorName: 'TimeoutError',
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(await discovery(context)).toEqual(document);
});
it('retries a temporary gateway failure once and does not cache failures', async () => {
  const fetcher = mockFetch()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(Response.json(document));
  await createDiscoveryCache(fetcher)(context);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not fetch during fresh-cache reuse even when network subsequently fails', async () => {
  const fetcher = mockFetch()
    .mockResolvedValueOnce(Response.json(document))
    .mockRejectedValue(new Error('offline'));
  const discovery = createDiscoveryCache(fetcher);
  await discovery(context);
  expect(await discovery(context)).toEqual(document);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not serve expired metadata during an outage and recovers without restart', async () => {
  let now = 0;
  const fetcher = mockFetch()
    .mockResolvedValueOnce(Response.json(document))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(Response.json(document));
  const discovery = createDiscoveryCache(fetcher, () => now);
  await discovery(context);
  now = 300000;
  await expect(discovery(context)).rejects.toThrow('offline');
  expect(await discovery(context)).toEqual(document);
});
it.each([
  { ...document, issuer: 'https://wrong.example/' },
  { ...document, token_endpoint: 'http://identity.example/token' },
  { ...document, jwks_uri: 'https://user:password@identity.example/jwks' },
  { ...document, authorization_endpoint: undefined },
])('never caches or retries invalid metadata', async (data) => {
  const fetcher = mockFetch()
    .mockResolvedValueOnce(Response.json(data))
    .mockResolvedValueOnce(Response.json(document));
  const discovery = createDiscoveryCache(fetcher);
  await expect(discovery(context)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await discovery(context)).toEqual(document);
});
it('isolates issuer and runtime trust contexts', async () => {
  const fetcher = mockFetch()
    .mockResolvedValueOnce(Response.json(document))
    .mockResolvedValueOnce(Response.json(document));
  const discovery = createDiscoveryCache(fetcher);
  await discovery({ ...context, NODE_ENV: 'development' });
  await discovery(context);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('reports safe HTTP status and does not retry rate limiting or authorization failures', async () => {
  for (const status of [401, 429]) {
    const fetcher = mockFetch().mockResolvedValue(new Response('', { status }));
    try {
      await createDiscoveryCache(fetcher)(context);
      throw Error('expected failure');
    } catch (error) {
      expect(loginFailure('discovery', error)).toMatchObject({
        errorName: 'DiscoveryHttpError',
        httpStatus: status,
      });
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});

it('uses the same ten-second discovery deadline as preflight', async () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  try {
    const fetcher = mockFetch().mockResolvedValue(Response.json(document));
    await createDiscoveryCache(fetcher)(context);
    expect(timeout).toHaveBeenCalledWith(10000);
    const options = fetcher.mock.calls[0]![1]!;
    expect(options.cache).toBe('no-store');
    expect(options.redirect).toBe('error');
  } finally {
    timeout.mockRestore();
  }
});
