'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  verificationSubmissionSchema,
  verificationEventSchema,
  verificationAssignmentSchema,
} from '@vetready/contracts';
import { api } from '../../lib/session';
export async function submitVerification(form: FormData) {
  const b = verificationSubmissionSchema.safeParse({
    commandId: form.get('commandId'),
    rubricVersionId: form.get('rubricVersionId'),
    summary: form.get('summary'),
    activity: form.get('activity'),
    performedAt: form.get('performedAt'),
    locationType: form.get('locationType'),
    process: form.get('process'),
    declaration: form.get('declaration') === 'true',
    ...(form.get('previousCaseId')
      ? { previousCaseId: form.get('previousCaseId') }
      : {}),
  });
  if (!b.success) redirect('/verifications?status=invalid');
  let r: Response | null = null;
  try {
    r = await api('/candidates/me/verifications', {
      method: 'POST',
      body: JSON.stringify(b.data),
    });
  } catch {
    /* Explicit retry only; no assumed submission. */
  }
  if (!r?.ok)
    redirect(`/verifications?status=unavailable&command=${b.data.commandId}`);
  const p = z.object({ id: z.uuid() }).parse(await r.json());
  revalidatePath('/verifications');
  redirect(`/verifications/owner/${p.id}`);
}
export async function recordVerificationEvent(form: FormData) {
  const route = z
    .object({ id: z.uuid(), role: z.enum(['owner', 'assessor', 'admin']) })
    .safeParse({ id: form.get('id'), role: form.get('role') });
  if (!route.success) redirect('/verifications?status=invalid');
  const { id, role } = route.data;
  const base = {
    commandId: form.get('commandId'),
    expectedRevision: Number(form.get('expectedRevision')),
  };
  let payload: unknown;
  if (role === 'admin')
    payload = {
      ...base,
      assessorId: form.get('assessorId'),
      reason: form.get('reason'),
    };
  else {
    const kind = form.get('kind');
    if (kind === 'DECISION') {
      const criteria = z
        .array(z.object({ id: z.uuid(), version: z.number().int().positive() }))
        .max(100)
        .safeParse(
          (() => {
            try {
              return JSON.parse(String(form.get('criteria')));
            } catch {
              return null;
            }
          })(),
        );
      if (!criteria.success)
        redirect(`/verifications/${role}/${id}?status=invalid`);
      payload = {
        ...base,
        kind,
        outcome: form.get('outcome'),
        reviewKind: form.get('reviewKind'),
        conflictDeclaredClear: form.get('conflictDeclaredClear') === 'true',
        rationale: form.get('rationale'),
        candidateExplanation: form.get('candidateExplanation'),
        ...(form.get('supersedesDecisionId')
          ? { supersedesDecisionId: form.get('supersedesDecisionId') }
          : {}),
        findings: criteria.data.map((c, n) => ({
          criterionId: c.id,
          criterionVersion: c.version,
          observation: form.get(`observation-${n}`),
          outcome: form.get(`outcome-${n}`),
          rationale: form.get(`rationale-${n}`),
          evidenceIds: [form.get('evidenceId')],
        })),
      };
    } else
      payload = {
        ...base,
        kind,
        ...(kind === 'RECUSE'
          ? { category: form.get('category'), reason: form.get('reason') }
          : kind === 'APPEAL' || kind === 'WITHDRAW'
            ? { reason: form.get('reason') }
            : {}),
      };
  }
  const b = (
    role === 'admin' ? verificationAssignmentSchema : verificationEventSchema
  ).safeParse(payload);
  if (!b.success) redirect(`/verifications/${role}/${id}?status=invalid`);
  const path =
    role === 'owner'
      ? `/candidates/me/verifications/${id}/events`
      : role === 'admin'
        ? `/admin/verifications/${id}/assignments`
        : `/assessor/verifications/${id}/events`;
  let r: Response | null = null;
  try {
    r = await api(path, { method: 'POST', body: JSON.stringify(b.data) });
  } catch {
    /* Never infer a saved decision. */
  }
  revalidatePath('/verifications', 'layout');
  revalidatePath('/competencies');
  revalidatePath('/skills-passport');
  redirect(
    `/verifications/${role}/${id}?status=${r?.ok ? 'saved' : 'unavailable'}`,
  );
}
