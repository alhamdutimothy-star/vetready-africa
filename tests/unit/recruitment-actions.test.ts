import { it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('../../apps/web/lib/session', () => ({ api: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw Error('Redirect');
  }),
}));
import { api } from '../../apps/web/lib/session';
import { redirect } from 'next/navigation';
import {
  applyToPilot,
  candidatePilotAction,
  evaluatePilotApplication,
} from '../../apps/web/app/opportunities/actions';
const mock = vi.mocked(api);
beforeEach(() => {
  mock.mockReset();
  vi.mocked(redirect).mockClear();
});
function form() {
  const f = new FormData();
  for (const k of [
    'commandId',
    'jobId',
    'versionId',
    'organizationId',
    'applicationId',
  ])
    f.set(k, randomUUID());
  return f;
}
it('makes no snapshot or share request without explicit candidate consent', async () => {
  await expect(applyToPilot(form())).rejects.toThrow('Redirect');
  expect(mock).not.toHaveBeenCalled();
  expect(redirect).toHaveBeenCalledWith('/opportunities?status=unavailable');
});
it('validates the locked version before creating a snapshot', async () => {
  const f = form();
  f.set('consent', 'on');
  f.set('versionId', 'not-a-version');
  await expect(applyToPilot(f)).rejects.toThrow('Redirect');
  expect(mock).not.toHaveBeenCalled();
});
it('binds the candidate share to server-confirmed snapshot and frozen job version', async () => {
  const f = form(),
    snapshot = randomUUID();
  f.set('consent', 'on');
  mock
    .mockResolvedValueOnce(Response.json({ id: snapshot }))
    .mockResolvedValueOnce(Response.json({ id: randomUUID() }));
  await expect(applyToPilot(f)).rejects.toThrow('Redirect');
  const body = JSON.parse(String(mock.mock.calls[1]![1]!.body));
  expect(body).toEqual({
    commandId: f.get('commandId'),
    jobVersionId: f.get('versionId'),
    snapshotId: snapshot,
    consent: true,
    consentVersion: 'pilot-share-1',
  });
  expect(redirect).toHaveBeenCalledWith('/opportunities?status=saved');
});
it('preserves command identity when retrying a failed application after snapshot creation', async () => {
  const f = form();
  f.set('consent', 'on');
  const snapshot = randomUUID();
  mock
    .mockResolvedValueOnce(Response.json({ id: snapshot }))
    .mockRejectedValueOnce(Error('PRIVATE_API_ERROR'));
  await expect(applyToPilot(f)).rejects.toThrow('Redirect');
  expect(String(mock.mock.calls[0]![1]!.body)).toContain(
    String(f.get('commandId')),
  );
  expect(String(mock.mock.calls[1]![1]!.body)).toContain(
    String(f.get('commandId')),
  );
  expect(String(vi.mocked(redirect).mock.calls)).not.toContain(
    'PRIVATE_API_ERROR',
  );
});
it('rejects forged action paths without invoking the API', async () => {
  const f = form();
  f.set('action', '../../skills-passport');
  await expect(candidatePilotAction(f)).rejects.toThrow('Redirect');
  expect(mock).not.toHaveBeenCalled();
});
it('does not expose denied employer projections through redirect parameters', async () => {
  mock.mockResolvedValueOnce(new Response('PRIVATE_ERROR', { status: 404 }));
  await expect(evaluatePilotApplication(form())).rejects.toThrow('Redirect');
  expect(redirect).toHaveBeenCalledWith('/employer-pilot?status=unavailable');
});
