import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../apps/web/lib/session', () => ({ api: request }));
import Journey from '../../apps/web/app/dairy/journey/page';
beforeEach(() => {
  request.mockReset();
});
it('renders connection failure without exposing exceptions or implying progress', async () => {
  request.mockRejectedValue(new Error('PRIVATE_DATABASE_ERROR'));
  const html = renderToStaticMarkup(await Journey());
  expect(html).toContain('Current journey information is unavailable');
  expect(html).not.toContain('PRIVATE_DATABASE_ERROR');
  expect(html).not.toContain('currently effective governed verification');
});
it('rejects malformed current data rather than rendering invented progress', async () => {
  request.mockResolvedValue(Response.json({ profileRequired: false }));
  expect(renderToStaticMarkup(await Journey())).toContain(
    'Current journey information is unavailable',
  );
});
it.each([401, 403])(
  'requires sign-in for an unauthorized %s response',
  async (status) => {
    request.mockResolvedValue(new Response(null, { status }));
    const html = renderToStaticMarkup(await Journey());
    expect(html).toContain('Sign in to continue');
    expect(html).not.toContain('dairy enrollments;');
    expect(request).toHaveBeenCalledTimes(1);
  },
);
it('does not interpret a failed API response as an empty candidate history', async () => {
  request.mockResolvedValue(new Response(null, { status: 503 }));
  const html = renderToStaticMarkup(await Journey());
  expect(html).toContain('Current journey information is unavailable');
  expect(html).not.toContain('No dairy assessment attempts recorded');
});
