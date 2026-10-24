import { beforeEach, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const { api, revalidatePath } = vi.hoisted(() => ({
  api: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('../../apps/web/lib/session', () => ({ api }));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error('redirect:' + path);
  },
}));
import { savePractical } from '../../apps/web/app/practical/actions';
const previous = {
  ok: true,
  revision: 2,
  commandId: randomUUID(),
  message: '',
};
const form = () => {
  const f = new FormData();
  f.set('id', randomUUID());
  f.set('summary', 'Synthetic saved draft');
  f.set('task', 'Synthetic task');
  f.set('facet', 'PRACTICALLY_VERIFIED');
  f.append('child', randomUUID());
  return f;
};
beforeEach(() => vi.clearAllMocks());
it('preserves revision and command identity on network failure', async () => {
  api.mockRejectedValue(new Error('private server detail'));
  const r = await savePractical(previous, form());
  expect(r.ok).toBe(false);
  expect(r.revision).toBe(2);
  expect(r.commandId).toBe(previous.commandId);
  expect(r.message).not.toContain('private server detail');
});
it('explains a stale save without reporting success', async () => {
  api.mockResolvedValue(new Response('{}', { status: 409 }));
  const r = await savePractical(previous, form());
  expect(r.ok).toBe(false);
  expect(r.message).toContain('Newer work');
  expect(revalidatePath).not.toHaveBeenCalled();
});
it('validates before contacting the API', async () => {
  const f = form();
  f.set('summary', 'x'.repeat(4001));
  expect((await savePractical(previous, f)).ok).toBe(false);
  expect(api).not.toHaveBeenCalled();
});
it('acknowledges the returned saved revision with a fresh command', async () => {
  api.mockResolvedValue(new Response(JSON.stringify({ revision: 3 })));
  const r = await savePractical(previous, form());
  expect(r.ok).toBe(true);
  expect(r.revision).toBe(3);
  expect(r.commandId).not.toBe(previous.commandId);
  expect(revalidatePath).toHaveBeenCalled();
});
it('preserves different requested facets for multiple competency mappings', async () => {
  const f = form();
  f.append('child', randomUUID());
  f.append('facet', 'WORKPLACE_VERIFIED');
  api.mockResolvedValue(new Response(JSON.stringify({ revision: 3 })));
  expect((await savePractical(previous, f)).ok).toBe(true);
  const body = JSON.parse(api.mock.calls[0]![1].body as string);
  expect(
    body.payload.targets.map(
      (t: { requestedFacet: string }) => t.requestedFacet,
    ),
  ).toEqual(['PRACTICALLY_VERIFIED', 'WORKPLACE_VERIFIED']);
});
