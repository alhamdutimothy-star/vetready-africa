'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { api } from '../../lib/session';
import {
  pilotResponseSchema,
  pilotReviewDraftSchema,
  reasoningCategories,
} from '@vetready/contracts';
import type { PilotActionState } from '../../lib/dairy-pilot';
const uuid = (v: unknown) => z.uuid().safeParse(v);
function failure(
  revision: number,
  message = 'Not saved. Your text remains on this page; check your connection, sign-in and input before retrying.',
): PilotActionState {
  return { ok: false, revision, message };
}
async function call(path: string, method = 'POST', body?: unknown) {
  return api(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
export async function enterDairy(form: FormData) {
  const id = uuid(form.get('pathwayId'));
  if (!id.success) redirect('/dairy?status=invalid');
  const r = await call(`/candidates/me/pathways/${id.data}`);
  redirect(`/dairy?status=${r?.ok ? 'entered' : 'profile'}`);
}
export async function startDairy() {
  let r: Response | null = null;
  try {
    r = await call('/dairy-pilot/attempts');
  } catch {
    redirect('/dairy?status=unavailable');
  }
  if (!r?.ok) redirect('/dairy?status=unavailable');
  const id = uuid(z.object({ id: z.uuid() }).parse(await r.json()).id);
  if (!id.success) redirect('/dairy?status=unavailable');
  redirect(`/dairy/cases/${id.data}`);
}
export async function preparePilot() {
  let ok = false;
  try {
    ok = Boolean((await call('/admin/dairy-pilot'))?.ok);
  } catch {
    /* Preserve the safe unavailable/error state without exposing server details. */
  }
  redirect(`/dairy/review?status=${ok ? 'prepared' : 'invalid'}`);
}
export async function releasePilot(form: FormData) {
  const id = uuid(form.get('assessmentId'));
  if (!id.success) redirect('/dairy/review?status=invalid');
  const r = await call(`/admin/assessments/${id.data}/release-demo`);
  redirect(`/dairy/review?status=${r?.ok ? 'released' : 'invalid'}`);
}
export async function assignPilot(form: FormData) {
  const id = uuid(form.get('attemptId')),
    assessor = uuid(form.get('assessorId'));
  if (!id.success || !assessor.success)
    redirect('/dairy/review?status=invalid');
  const r = await call(`/admin/assessment-attempts/${id.data}/assign`, 'POST', {
    assessorId: assessor.data,
  });
  redirect(`/dairy/review?status=${r?.ok ? 'assigned' : 'invalid'}`);
}
export async function saveReasoning(
  previous: PilotActionState,
  form: FormData,
): Promise<PilotActionState> {
  const id = uuid(form.get('attemptId')),
    item = uuid(form.get('itemId'));
  const reasoning = Object.fromEntries(
    reasoningCategories
      .filter((k) => form.has(k))
      .map((k) => [k, String(form.get(k) ?? '')]),
  );
  const parsed = pilotResponseSchema.safeParse({
    expectedRevision: previous.revision,
    reasoning,
  });
  if (!id.success || !item.success || !parsed.success)
    return failure(
      previous.revision,
      'Enter at least one response; each field allows up to 2,000 characters. Your text has been kept.',
    );
  try {
    const r = await call(
      `/candidates/me/dairy-pilot/attempts/${id.data}/responses/${item.data}`,
      'PUT',
      parsed.data,
    );
    if (!r?.ok)
      return failure(
        previous.revision,
        r?.status === 409
          ? 'A newer answer or submission exists. Keep your text and open the latest saved version in another tab before reconciling.'
          : undefined,
      );
    const result = z.object({ revision: z.number() }).parse(await r.json());
    return {
      ok: true,
      revision: result.revision,
      message: 'Saved on the server. You can resume this stage later.',
    };
  } catch {
    return failure(previous.revision);
  }
}
export async function submitDairy(
  previous: PilotActionState,
  form: FormData,
): Promise<PilotActionState> {
  const id = uuid(form.get('attemptId'));
  if (!id.success || form.get('confirm') !== 'on')
    return failure(0, 'Confirm all responses are saved before submitting.');
  let ok: boolean;
  try {
    ok = Boolean(
      (await call(`/candidates/me/dairy-pilot/attempts/${id.data}/submit`))?.ok,
    );
  } catch {
    return failure(
      0,
      'Submission was not confirmed. Keep this page open and retry when connected.',
    );
  }
  if (!ok)
    return failure(
      0,
      'Save a response for every stage before submitting. Your entered text has been kept.',
    );
  revalidatePath(`/dairy/cases/${id.data}`);
  redirect(`/dairy/cases/${id.data}`);
}
export async function savePilotReview(
  previous: PilotActionState,
  form: FormData,
): Promise<PilotActionState> {
  const id = uuid(form.get('attemptId'));
  const criteria = form.getAll('criterionId');
  const parsed = pilotReviewDraftSchema.safeParse({
    expectedRevision: previous.revision,
    decision: form.get('decision'),
    feedback: form.get('feedback'),
    observations: criteria.map((c) => ({
      rubricCriterionId: c,
      observation: form.get(`judgment_${c}`) || null,
      comment: form.get(`comment_${c}`) || '',
    })),
  });
  if (!id.success || !parsed.success)
    return failure(
      previous.revision,
      'Check feedback and criterion fields. Total review text is limited to 10,000 characters for mobile transfer; no judgment threshold is implied.',
    );
  try {
    const r = await call(
      `/assessor/dairy-pilot/attempts/${id.data}/review-draft`,
      'PUT',
      parsed.data,
    );
    if (!r?.ok)
      return failure(
        previous.revision,
        r?.status === 409
          ? 'A newer draft or finalized review exists. Keep your text and reconcile with the latest saved version.'
          : undefined,
      );
    const saved = z.object({ revision: z.number() }).parse(await r.json());
    if (form.get('operation') === 'finalize') {
      const result = await call(
        `/assessor/dairy-pilot/attempts/${id.data}/finalize`,
        'POST',
        { expectedRevision: saved.revision },
      );
      if (!result?.ok)
        return failure(
          saved.revision,
          'Draft saved. Finalization requires a judgment and comment for every criterion and complete overall feedback. No competence award has been made.',
        );
      return {
        ok: true,
        finalized: true,
        revision: saved.revision,
        message:
          'Feedback finalized and recorded in the review history. Competence remains unverified.',
      };
    }
    return {
      ok: true,
      revision: saved.revision,
      message:
        'Private review draft saved; candidates cannot see draft feedback.',
    };
  } catch {
    return failure(previous.revision);
  }
}
