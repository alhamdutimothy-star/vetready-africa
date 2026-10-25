'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { profileSnapshotCommandSchema } from '@vetready/contracts';
import { api } from '../../lib/session';
export async function saveProfileSnapshot(form: FormData) {
  const body = profileSnapshotCommandSchema.safeParse({
    commandId: form.get('commandId'),
  });
  let id: string | null = null;
  if (body.success)
    try {
      const r = await api('/candidates/me/competency-profile/snapshots', {
        method: 'POST',
        body: JSON.stringify(body.data),
      });
      if (r?.ok) id = z.object({ id: z.uuid() }).parse(await r.json()).id;
    } catch {
      /* Private details never enter errors. */
    }
  redirect(
    id ? `/competencies/snapshots/${id}` : '/competencies?status=unavailable',
  );
}
