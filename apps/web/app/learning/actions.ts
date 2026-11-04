'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { api } from '../../lib/session';
export async function saveReading(form: FormData) {
  const p = z
    .object({
      enrollment: z.uuid(),
      lesson: z.uuid(),
      commandId: z.uuid(),
      revision: z.coerce.number().int().nonnegative(),
      position: z.coerce.number().int().nonnegative(),
      state: z.enum(['IN_PROGRESS', 'COMPLETED']),
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success) redirect('/development/next-steps?status=invalid');
  const b = p.data;
  let r: Response | null = null;
  try {
    r = await api(
      `/candidates/me/training/enrollments/${b.enrollment}/lessons/${b.lesson}/progress`,
      {
        method: 'PUT',
        body: JSON.stringify({
          commandId: b.commandId,
          expectedRevision: b.revision,
          resumePosition: b.position,
          state: b.state,
        }),
      },
    );
  } catch {
    /* Never assume completion after connection loss. */
  }
  revalidatePath(`/learning/${b.enrollment}`);
  revalidatePath('/development/next-steps', 'layout');
  redirect(
    `/learning/${b.enrollment}?status=${r?.ok ? 'saved' : 'unavailable'}`,
  );
}
