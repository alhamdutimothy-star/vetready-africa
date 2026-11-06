import { it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
vi.mock('next/link', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../apps/web/lib/session', () => ({ api: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw Error('REDIRECT');
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { api } from '../../apps/web/lib/session';
import { redirect } from 'next/navigation';
import VerificationPage from '../../apps/web/app/verifications/page';
import VerificationDetail from '../../apps/web/app/verifications/[role]/[id]/page';
import {
  submitVerification,
  recordVerificationEvent,
} from '../../apps/web/app/verifications/actions';
const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(redirect).mockClear();
});
it('renders an unavailable case rather than verified evidence when the API rejects malformed governance', async () => {
  vi.mocked(api).mockResolvedValueOnce(new Response(null, { status: 409 }));
  const html = renderToStaticMarkup(
    await VerificationDetail({
      params: Promise.resolve({ id: randomUUID(), role: 'owner' }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(html).toContain('Private case unavailable');
  expect(html).not.toContain('Verified evidence');
});
const ineffective = () => ({
  caseId: randomUUID(),
  childVersionId: randomUUID(),
  pathwayVersionId: randomUUID(),
  evidenceId: randomUUID(),
  rubricVersionId: randomUUID(),
  policyReference: 'Synthetic policy reference',
  facet: 'PRACTICALLY_VERIFIED',
  process: 'IN_PERSON',
  performedAt: '2026-01-01T00:00:00.000Z',
  outcome: 'VERIFIED',
  verified: false,
  decisionId: randomUUID(),
  reviewedAt: '2026-01-01T00:00:00.000Z',
  candidateExplanation: 'Synthetic candidate explanation',
  evidenceLevelBefore: 'SELF_DECLARED',
  evidenceLevelAfter: 'SELF_DECLARED',
  readiness: 'UNCONFIGURED',
});
it('does not display a positive claim when a recorded VERIFIED outcome is ineffective', async () => {
  vi.mocked(api)
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(Response.json([ineffective()]));
  const html = renderToStaticMarkup(
    await VerificationPage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain('Verification is not currently effective');
  expect(html).not.toContain('Verified evidence');
});
it('distinguishes current authority from historical outcomes on the actual owner page', async () => {
  const result = ineffective();
  vi.mocked(api).mockResolvedValueOnce(
    Response.json({
      id: result.caseId,
      revision: 3,
      result,
      criteria: [],
      history: [
        {
          id: result.decisionId,
          kind: 'DECISION',
          revision: 3,
          outcome: 'VERIFIED',
          candidateExplanation: result.candidateExplanation,
        },
      ],
    }),
  );
  const html = renderToStaticMarkup(
    await VerificationDetail({
      params: Promise.resolve({ id: result.caseId, role: 'owner' }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(html).toContain(
    'Current effective result: Verification is not currently effective',
  );
  expect(html).toContain(
    'Recorded history below does not itself establish current verification',
  );
});
it('submits only owner-derived evidence context and redirects to the saved case', async () => {
  const id = randomUUID(),
    rubric = randomUUID();
  vi.mocked(api).mockResolvedValue(Response.json({ id }));
  await expect(
    submitVerification(
      form({
        commandId: randomUUID(),
        rubricVersionId: rubric,
        summary: 'Synthetic owned evidence',
        activity: 'Software protocol',
        performedAt: '2026-01-01T00:00:00.000Z',
        locationType: 'Synthetic facility',
        process: 'IN_PERSON',
        declaration: 'true',
        candidateId: randomUUID(),
      }),
    ),
  ).rejects.toThrow('REDIRECT');
  const init = vi.mocked(api).mock.calls[0]![1];
  expect(JSON.parse(String(init?.body))).not.toHaveProperty('candidateId');
  expect(redirect).toHaveBeenCalledWith(`/verifications/owner/${id}`);
});
it('retains the submission command after an uncertain network result', async () => {
  const command = randomUUID();
  vi.mocked(api).mockRejectedValue(Error('PRIVATE_FAILURE'));
  await expect(
    submitVerification(
      form({
        commandId: command,
        rubricVersionId: randomUUID(),
        summary: 'Synthetic owned evidence',
        activity: 'Software protocol',
        performedAt: '2026-01-01T00:00:00.000Z',
        locationType: 'Synthetic facility',
        process: 'IN_PERSON',
        declaration: 'true',
      }),
    ),
  ).rejects.toThrow('REDIRECT');
  expect(redirect).toHaveBeenCalledWith(
    `/verifications?status=unavailable&command=${command}`,
  );
});
it('does not call the API for a missing candidate declaration', async () => {
  await expect(submitVerification(form({}))).rejects.toThrow('REDIRECT');
  expect(api).not.toHaveBeenCalled();
});
it('sends an explicit review start without client ownership or reviewer authority', async () => {
  const id = randomUUID(),
    command = randomUUID();
  vi.mocked(api).mockResolvedValue(
    Response.json({ id: randomUUID(), revision: 2 }),
  );
  await expect(
    recordVerificationEvent(
      form({
        id,
        role: 'assessor',
        commandId: command,
        expectedRevision: '1',
        kind: 'START_REVIEW',
        actorId: randomUUID(),
      }),
    ),
  ).rejects.toThrow('REDIRECT');
  expect(api).toHaveBeenCalledWith(`/assessor/verifications/${id}/events`, {
    method: 'POST',
    body: JSON.stringify({
      commandId: command,
      expectedRevision: 1,
      kind: 'START_REVIEW',
    }),
  });
  expect(redirect).toHaveBeenCalledWith(
    `/verifications/assessor/${id}?status=saved`,
  );
});
it('never claims a review was saved after a failed response', async () => {
  const id = randomUUID();
  vi.mocked(api).mockResolvedValue(new Response(null, { status: 409 }));
  await expect(
    recordVerificationEvent(
      form({
        id,
        role: 'assessor',
        commandId: randomUUID(),
        expectedRevision: '1',
        kind: 'START_REVIEW',
      }),
    ),
  ).rejects.toThrow('REDIRECT');
  expect(redirect).toHaveBeenCalledWith(
    `/verifications/assessor/${id}?status=unavailable`,
  );
});
