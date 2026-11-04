'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { developmentCommandSchema } from '@vetready/contracts';
import { api } from '../../../lib/session';
export async function createWorkflow(form: FormData) {
  const b = developmentCommandSchema.safeParse({
    commandId: form.get('commandId'),
    pathwayVersionId: form.get('pathwayVersionId'),
  });
  if (!b.success) redirect('/development/next-steps?status=invalid');
  let r: Response | null = null;
  try {
    r = await api('/candidates/me/development-workflows', {
      method: 'POST',
      body: JSON.stringify(b.data),
    });
  } catch {
    /* Explicit retry with the same form command; no assumed save. */
  }
  if (!r?.ok)
    redirect(
      `/development/next-steps?status=unavailable&command=${b.data.commandId}&pathway=${b.data.pathwayVersionId}`,
    );
  const p = z.object({ id: z.uuid() }).parse(await r.json());
  revalidatePath('/development/next-steps');
  redirect(`/development/next-steps/${p.id}`);
}
export async function startWorkflowLearning(form: FormData) {
  const b = z
    .object({ plan: z.uuid(), course: z.uuid() })
    .safeParse({ plan: form.get('plan'), course: form.get('course') });
  if (!b.success) redirect('/development/next-steps?status=invalid');
  let r: Response | null = null;
  try {
    r = await api(
      `/candidates/me/development-workflows/${b.data.plan}/courses/${b.data.course}/start`,
      { method: 'POST' },
    );
  } catch {
    /* No optimistic completion. */
  }
  revalidatePath(`/development/next-steps/${b.data.plan}`);
  redirect(
    `/development/next-steps/${b.data.plan}?status=${r?.ok ? 'started' : 'unavailable'}`,
  );
}
