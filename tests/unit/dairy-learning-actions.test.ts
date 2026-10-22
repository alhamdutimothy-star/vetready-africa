import { it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('../../apps/web/lib/session', () => ({ api: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw Error('Redirect');
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { api } from '../../apps/web/lib/session';
import { saveLearningActivity } from '../../apps/web/app/dairy/learning/actions';
const mock = vi.mocked(api);
beforeEach(() => mock.mockReset());
const form = () => {
  const f = new FormData();
  f.set('enrollment', randomUUID());
  f.set('lesson', randomUUID());
  f.set('response', 'Candidate reasoning preserved in the form');
  return f;
};
const state = () => ({
  ok: true,
  revision: 0,
  commandId: randomUUID(),
  message: '',
});
it('preserves text, revision and command identity after a connection failure without exposing internal errors', async () => {
  const s = state(),
    f = form();
  mock.mockRejectedValueOnce(Error('PRIVATE_ERROR_SENTINEL'));
  const r = await saveLearningActivity(s, f);
  expect(r.ok).toBe(false);
  expect(r.commandId).toBe(s.commandId);
  expect(r.revision).toBe(0);
  expect(f.get('response')).toBeTruthy();
  expect(r.message).not.toContain('PRIVATE_ERROR_SENTINEL');
});
it('only acknowledges server-confirmed saves and rotates the next command identifier', async () => {
  const s = state();
  mock.mockResolvedValueOnce(Response.json({ revision: 1 }));
  const r = await saveLearningActivity(s, form());
  expect(r.ok).toBe(true);
  expect(r.revision).toBe(1);
  expect(r.commandId).not.toBe(s.commandId);
  expect(r.message).toContain('not assessed or verified');
});
it('reports concurrent changes without overwriting another saved revision', async () => {
  mock.mockResolvedValueOnce(new Response('{}', { status: 409 }));
  const s = state();
  const r = await saveLearningActivity(s, form());
  expect(r.ok).toBe(false);
  expect(r.revision).toBe(0);
  expect(r.commandId).toBe(s.commandId);
  expect(r.message).toContain('Newer work');
});
