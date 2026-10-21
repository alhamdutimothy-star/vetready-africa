import { expect, it, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('../../apps/web/lib/session', () => ({ api: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('Unexpected redirect');
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { api } from '../../apps/web/lib/session';
import {
  saveReasoning,
  savePilotReview,
} from '../../apps/web/app/dairy/actions';
const mocked = vi.mocked(api);
beforeEach(() => mocked.mockReset());
function answer() {
  const f = new FormData();
  f.set('attemptId', randomUUID());
  f.set('itemId', randomUUID());
  f.set('observations', 'Synthetic candidate draft kept on this page.');
  return f;
}
it('returns a recoverable failure without redirecting or erasing candidate input when the connection fails', async () => {
  const f = answer();
  mocked.mockRejectedValueOnce(new Error('Synthetic network outage'));
  const result = await saveReasoning(
    { ok: false, message: '', revision: 3 },
    f,
  );
  expect(result.ok).toBe(false);
  expect(result.revision).toBe(3);
  expect(result.message).not.toContain('Synthetic network outage');
  expect(f.get('observations')).toBe(
    'Synthetic candidate draft kept on this page.',
  );
});
it('preserves the prior revision and text when a newer response exists', async () => {
  const f = answer();
  mocked.mockResolvedValueOnce(new Response('{}', { status: 409 }));
  const r = await saveReasoning(
    { ok: true, message: 'Previously saved', revision: 1 },
    f,
  );
  expect(r.ok).toBe(false);
  expect(r.revision).toBe(1);
  expect(r.message).toContain('newer answer');
  expect(f.get('observations')).toBeTruthy();
});
it('acknowledges only a server-confirmed revision', async () => {
  const f = answer();
  mocked.mockResolvedValueOnce(Response.json({ saved: true, revision: 2 }));
  const r = await saveReasoning({ ok: false, message: '', revision: 1 }, f);
  expect(r.ok).toBe(true);
  expect(r.revision).toBe(2);
  const sent = JSON.parse(mocked.mock.calls[0]![1]!.body as string);
  expect(sent.reasoning).toEqual({ observations: f.get('observations') });
  expect(sent).not.toHaveProperty('facts');
});
it('retains the saved draft revision if finalization needs more feedback', async () => {
  const f = new FormData();
  f.set('attemptId', randomUUID());
  f.set('decision', 'MORE_EVIDENCE_REQUIRED');
  f.set('feedback', 'Incomplete private draft');
  f.set('operation', 'finalize');
  mocked.mockResolvedValueOnce(Response.json({ revision: 4 }));
  mocked.mockResolvedValueOnce(new Response('{}', { status: 422 }));
  const r = await savePilotReview({ ok: false, message: '', revision: 3 }, f);
  expect(r.ok).toBe(false);
  expect(r.revision).toBe(4);
  expect(r.message).toContain('Draft saved');
  expect(f.get('feedback')).toBe('Incomplete private draft');
});
