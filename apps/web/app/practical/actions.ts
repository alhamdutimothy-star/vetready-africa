'use server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  practicalCreateSchema,
  practicalSaveSchema,
  practicalDecisionSchema,
} from '@vetready/contracts';
import { api } from '../../lib/session';
import type { PracticalSaveState } from '../../lib/practical';
export async function createPractical(f: FormData) {
  const input = practicalCreateSchema.safeParse({
    pathwayVersionId: f.get('pathway'),
    kind: f.get('kind'),
  });
  let id: string | null = null;
  if (input.success)
    try {
      const r = await api('/candidates/me/practical', {
        method: 'POST',
        body: JSON.stringify(input.data),
      });
      if (r?.ok) id = z.object({ id: z.uuid() }).parse(await r.json()).id;
    } catch {
      /* Safe message only. */
    }
  redirect(id ? `/practical/${id}` : '/practical?status=unavailable');
}
export async function savePractical(
  previous: PracticalSaveState,
  f: FormData,
): Promise<PracticalSaveState> {
  const id = z.uuid().safeParse(f.get('id'));
  const input = practicalSaveSchema.safeParse({
    commandId: previous.commandId,
    expectedRevision: previous.revision,
    payload: {
      summary: f.get('summary'),
      context: { task: f.get('task') },
      targets: f.getAll('child').flatMap((child, index) =>
        child
          ? [
              {
                childVersionId: child,
                requestedFacet: f.getAll('facet')[index],
              },
            ]
          : [],
      ),
    },
  });
  const fail = (
    message = 'Not saved. Your text remains here. Check your connection and retry.',
  ) => ({ ...previous, ok: false, message });
  if (!id.success || !input.success)
    return fail(
      'Check the field lengths and competency selection. Your text remains here.',
    );
  try {
    const r = await api(`/candidates/me/practical/${id.data}`, {
      method: 'PUT',
      body: JSON.stringify(input.data),
    });
    if (!r?.ok)
      return fail(
        r?.status === 409
          ? 'Newer work exists. Keep your text and reconcile with the saved version in another tab.'
          : undefined,
      );
    const result = z.object({ revision: z.number() }).parse(await r.json());
    revalidatePath(`/practical/${id.data}`);
    return {
      ok: true,
      revision: result.revision,
      commandId: randomUUID(),
      message: 'Draft saved. Submission and declaration are separate steps.',
    };
  } catch {
    return fail();
  }
}
export async function practicalCommand(f: FormData) {
  const id = z.uuid().safeParse(f.get('id'));
  const command = z
    .enum([
      'submit',
      'withdraw',
      'revisions',
      'assignments',
      'revoke',
      'decisions',
    ])
    .safeParse(f.get('command'));
  const role = z.enum(['owner', 'review', 'admin']).safeParse(f.get('role'));
  if (!id.success || !command.success || !role.success)
    redirect('/practical?status=invalid');
  const path =
    role.data === 'owner'
      ? `/practical/${id.data}`
      : `/practical/${role.data}/${id.data}`;
  let body: unknown;
  if (command.data === 'submit')
    body = {
      expectedRevision: Number(f.get('revision')),
      declaration: f.get('declaration') === 'on',
    };
  else if (command.data === 'decisions') {
    const parsed = practicalDecisionSchema.safeParse({
      outcome: f.get('outcome'),
      rationale: f.get('rationale'),
      conflictDeclaredClear: f.get('conflict') === 'on',
      ...(f.get('supersedes')
        ? { supersedesDecisionId: f.get('supersedes') }
        : {}),
    });
    if (!parsed.success) redirect(path + '?status=invalid');
    body = parsed.data;
  } else
    body = {
      reason: f.get('reason'),
      ...(command.data === 'assignments'
        ? { assessorId: f.get('assessor') }
        : {}),
    };
  const prefix =
    role.data === 'owner'
      ? 'candidates/me'
      : role.data === 'review'
        ? 'assessor'
        : 'admin';
  let ok = false,
    next: string | null = null;
  try {
    const r = await api(`/${prefix}/practical/${id.data}/${command.data}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    ok = Boolean(r?.ok);
    if (ok && command.data === 'revisions')
      next = z.object({ id: z.uuid() }).parse(await r!.json()).id;
  } catch {
    /* No private details. */
  }
  if (next) redirect(`/practical/${next}`);
  revalidatePath(path);
  redirect(path + `?status=${ok ? 'saved' : 'unavailable'}`);
}
