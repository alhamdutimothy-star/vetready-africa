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
import { redirect } from 'next/navigation';
import {
  createWorkflow,
  startWorkflowLearning,
} from '../../apps/web/app/development/next-steps/actions';
import { saveReading } from '../../apps/web/app/learning/actions';
const mock = vi.mocked(api);
const form = (values: Record<string, string | number>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, String(v));
  return f;
};
beforeEach(() => {
  mock.mockReset();
  vi.mocked(redirect).mockClear();
});
it('submits only the explicit pathway/command and navigates to the server-confirmed private plan', async () => {
  const commandId = randomUUID(),
    pathwayVersionId = randomUUID(),
    id = randomUUID();
  mock.mockResolvedValueOnce(Response.json({ id }));
  await expect(
    createWorkflow(
      form({ commandId, pathwayVersionId, candidateId: randomUUID() }),
    ),
  ).rejects.toThrow('Redirect');
  expect(mock).toHaveBeenCalledWith('/candidates/me/development-workflows', {
    method: 'POST',
    body: JSON.stringify({ commandId, pathwayVersionId }),
  });
  expect(redirect).toHaveBeenCalledWith('/development/next-steps/' + id);
});
it('retains command and pathway after uncertain plan save without leaking errors', async () => {
  const commandId = randomUUID(),
    pathwayVersionId = randomUUID();
  mock.mockRejectedValueOnce(Error('PRIVATE_ERROR'));
  await expect(
    createWorkflow(form({ commandId, pathwayVersionId })),
  ).rejects.toThrow('Redirect');
  expect(redirect).toHaveBeenCalledWith(
    `/development/next-steps?status=unavailable&command=${commandId}&pathway=${pathwayVersionId}`,
  );
});
it('rejects invalid plan commands before calling the API', async () => {
  await expect(
    createWorkflow(
      form({ commandId: 'invalid', pathwayVersionId: randomUUID() }),
    ),
  ).rejects.toThrow('Redirect');
  expect(mock).not.toHaveBeenCalled();
});
it('confirms enrollment only through the exact plan/course start endpoint', async () => {
  const plan = randomUUID(),
    course = randomUUID();
  mock.mockResolvedValueOnce(Response.json({ id: randomUUID() }));
  await expect(startWorkflowLearning(form({ plan, course }))).rejects.toThrow(
    'Redirect',
  );
  expect(mock).toHaveBeenCalledWith(
    `/candidates/me/development-workflows/${plan}/courses/${course}/start`,
    { method: 'POST' },
  );
  expect(redirect).toHaveBeenCalledWith(
    `/development/next-steps/${plan}?status=started`,
  );
});
it('does not acknowledge denied enrollment as successful', async () => {
  const plan = randomUUID();
  mock.mockResolvedValueOnce(new Response(null, { status: 404 }));
  await expect(
    startWorkflowLearning(form({ plan, course: randomUUID() })),
  ).rejects.toThrow('Redirect');
  expect(redirect).toHaveBeenCalledWith(
    `/development/next-steps/${plan}?status=unavailable`,
  );
});
it('sends actual reading completion with revision/command while leaving competency decisions to the server', async () => {
  const enrollment = randomUUID(),
    lesson = randomUUID(),
    commandId = randomUUID();
  mock.mockResolvedValueOnce(Response.json({}));
  await expect(
    saveReading(
      form({
        enrollment,
        lesson,
        commandId,
        revision: 2,
        position: 0,
        state: 'COMPLETED',
      }),
    ),
  ).rejects.toThrow('Redirect');
  expect(mock).toHaveBeenCalledWith(
    `/candidates/me/training/enrollments/${enrollment}/lessons/${lesson}/progress`,
    {
      method: 'PUT',
      body: JSON.stringify({
        commandId,
        expectedRevision: 2,
        resumePosition: 0,
        state: 'COMPLETED',
      }),
    },
  );
  expect(redirect).toHaveBeenCalledWith(`/learning/${enrollment}?status=saved`);
});
it('does not claim saved progress after a connection failure', async () => {
  const enrollment = randomUUID();
  mock.mockRejectedValueOnce(Error('PRIVATE_ERROR'));
  await expect(
    saveReading(
      form({
        enrollment,
        lesson: randomUUID(),
        commandId: randomUUID(),
        revision: 0,
        position: 0,
        state: 'COMPLETED',
      }),
    ),
  ).rejects.toThrow('Redirect');
  expect(redirect).toHaveBeenCalledWith(
    `/learning/${enrollment}?status=unavailable`,
  );
});
