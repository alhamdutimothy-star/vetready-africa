'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { dairyActivitySchema } from '@vetready/contracts';
import { api } from '../../../lib/session';
import type { LearningSaveState } from '../../../lib/dairy-learning';
const id = (v: unknown) => z.uuid().safeParse(v);
export async function prepareCurriculum() {
  let ok = false;
  try {
    ok = Boolean(
      (await api('/admin/dairy-learning/starter', { method: 'POST' }))?.ok,
    );
  } catch {
    /* Safe generic error only. */
  }
  redirect(`/dairy/learning/manage?status=${ok ? 'created' : 'unavailable'}`);
}
export async function releaseCurriculum(f: FormData) {
  const v = id(f.get('version'));
  if (!v.success) redirect('/dairy/learning/manage?status=invalid');
  let ok = false;
  try {
    ok = Boolean(
      (
        await api(`/admin/training/versions/${v.data}/release-demo`, {
          method: 'POST',
        })
      )?.ok,
    );
  } catch {
    /* No server details exposed. */
  }
  redirect(`/dairy/learning/manage?status=${ok ? 'released' : 'unavailable'}`);
}
export async function enrollCurriculum(f: FormData) {
  const v = id(f.get('version'));
  if (!v.success) redirect('/dairy/learning?status=invalid');
  let e: string | null = null;
  try {
    const r = await api(`/training/versions/${v.data}/enrollments`, {
      method: 'POST',
    });
    if (r?.ok) e = z.object({ id: z.uuid() }).parse(await r.json()).id;
  } catch {
    /* Preserve unavailable state. */
  }
  if (!e) redirect('/dairy/learning?status=unavailable');
  redirect(`/dairy/learning/${e}`);
}
export async function startLinkedCase(f: FormData) {
  const v = id(f.get('assessment'));
  if (!v.success) redirect('/dairy/learning?status=invalid');
  let a: string | null = null;
  try {
    const r = await api(`/assessments/${v.data}/attempts`, { method: 'POST' });
    if (r?.ok) a = z.object({ id: z.uuid() }).parse(await r.json()).id;
  } catch {
    /* Safe generic error. */
  }
  if (!a) redirect('/dairy/learning?status=unavailable');
  redirect(`/assessments/${a}`);
}
export async function saveLearningActivity(
  previous: LearningSaveState,
  f: FormData,
): Promise<LearningSaveState> {
  const e = id(f.get('enrollment')),
    l = id(f.get('lesson'));
  const body = dairyActivitySchema.safeParse({
    commandId: previous.commandId,
    expectedRevision: previous.revision,
    response: f.get('response'),
  });
  const failure = (
    message = 'Not saved. Keep this page open; your text remains here. Check your connection and retry.',
  ) => ({ ...previous, ok: false, message });
  if (!e.success || !l.success || !body.success)
    return failure(
      'Enter a response of up to 4,000 characters. Your text has been kept.',
    );
  try {
    const r = await api(
      `/candidates/me/dairy-learning/${e.data}/units/${l.data}/activity`,
      { method: 'PUT', body: JSON.stringify(body.data) },
    );
    if (!r?.ok)
      return failure(
        r?.status === 409
          ? 'Newer work exists. Keep your text and reconcile with the saved version in another tab.'
          : undefined,
      );
    const result = z.object({ revision: z.number() }).parse(await r.json());
    revalidatePath(`/dairy/learning/${e.data}`);
    return {
      ok: true,
      revision: result.revision,
      commandId: randomUUID(),
      message:
        'Learning activity saved. This is an unscored reflection, not assessed or verified competence.',
    };
  } catch {
    return failure();
  }
}
export async function recordLearning(f: FormData) {
  const e = id(f.get('enrollment')),
    l = id(f.get('lesson'));
  if (!e.success || !l.success) redirect('/dairy/learning?status=invalid');
  const revision = z.coerce
    .number()
    .int()
    .nonnegative()
    .safeParse(f.get('revision'));
  const position = z.coerce
    .number()
    .int()
    .nonnegative()
    .safeParse(f.get('position'));
  if (!revision.success || !position.success)
    redirect(`/dairy/learning/${e.data}?status=invalid`);
  let ok = false;
  try {
    ok = Boolean(
      (
        await api(
          `/candidates/me/training/enrollments/${e.data}/lessons/${l.data}/progress`,
          {
            method: 'PUT',
            body: JSON.stringify({
              commandId: randomUUID(),
              expectedRevision: revision.data,
              state:
                f.get('state') === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
              resumePosition: position.data,
            }),
          },
        )
      )?.ok,
    );
  } catch {
    /* No claim of save on connection error. */
  }
  redirect(`/dairy/learning/${e.data}?status=${ok ? 'saved' : 'unavailable'}`);
}
