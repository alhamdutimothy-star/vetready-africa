'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { api } from '../../lib/session';
const id = (f: FormData, key: string) => {
  const v = z.uuid().safeParse(f.get(key));
  if (!v.success) redirect('/assessment-workspace?status=invalid');
  return v.data;
};
async function mutate(path: string, body?: unknown) {
  const r = await api(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r) redirect('/auth/login');
  if (!r.ok) redirect('/assessment-workspace?status=invalid');
  revalidatePath('/assessment-workspace');
  return r;
}
export async function createAssessment(form: FormData) {
  await mutate('/admin/assessments', {
    code: form.get('code'),
    pathwayVersionId: id(form, 'pathwayVersionId'),
    title: form.get('title'),
    randomize: form.get('randomize') === 'on',
  });
  redirect('/assessment-workspace?status=saved');
}
export async function releaseDemo(form: FormData) {
  await mutate(`/admin/assessments/${id(form, 'assessmentId')}/release-demo`);
  redirect('/assessment-workspace?status=saved');
}
export async function retireAssessment(form: FormData) {
  await mutate(`/admin/assessments/${id(form, 'assessmentId')}/retire`);
  redirect('/assessment-workspace?status=saved');
}
export async function createItem(form: FormData) {
  const assessment = id(form, 'assessmentId');
  const child = id(form, 'childVersionId');
  const group = id(form, 'groupVersionId');
  const pathway = id(form, 'pathwayId');
  const h = await api(`/pathways/${pathway}/hierarchy`);
  if (!h?.ok) redirect('/assessment-workspace?status=invalid');
  const hierarchy = z
    .array(
      z.object({
        child_version_id: z.uuid(),
        group_version_id: z.uuid(),
        criteria: z.array(z.object({ id: z.uuid() })),
      }),
    )
    .parse(await h.json());
  const match = hierarchy.find(
    (r) => r.child_version_id === child && r.group_version_id === group,
  );
  if (!match) redirect('/assessment-workspace?status=invalid');
  const type = form.get('type');
  const method = form.get('method');
  const evidenceType = (
    {
      KNOWLEDGE: 'KNOWLEDGE_ASSESSED',
      CASE: 'CASE_ASSESSED',
      SIMULATION: 'SIMULATION_VERIFIED',
      PRACTICAL: 'PRACTICALLY_VERIFIED',
      WORKPLACE: 'WORKPLACE_VERIFIED',
    } as Record<string, string>
  )[String(method)];
  await mutate(`/admin/assessments/${assessment}/items`, {
    code: form.get('code'),
    version: Number(form.get('version')),
    type,
    prompt: form.get('prompt'),
    method,
    difficulty: form.get('difficulty'),
    evidenceType,
    groupVersionId: group,
    childVersionId: child,
    criterionIds: match.criteria.map((c) => c.id),
    answerKey: null,
    presentation: {},
  });
  redirect('/assessment-workspace?status=saved');
}
export async function assignAttempt(form: FormData) {
  await mutate(`/admin/assessment-attempts/${id(form, 'attemptId')}/assign`, {
    assessorId: id(form, 'assessorId'),
  });
  redirect('/assessment-workspace?status=saved');
}
export async function reviewAttempt(form: FormData) {
  const attempt = id(form, 'attemptId');
  const ids = form.getAll('criterionId').map((v) => z.uuid().parse(v));
  await mutate(`/assessor/attempts/${attempt}/reviews`, {
    feedback: form.get('feedback'),
    observations: ids.map((r) => ({
      rubricCriterionId: r,
      observation: form.get(`observation_${r}`),
      comment: form.get(`comment_${r}`),
    })),
  });
  redirect('/assessment-workspace?status=saved');
}
export async function reviewEvidence(form: FormData) {
  await mutate(`/assessor/evidence/${id(form, 'evidenceId')}/reviews`, {
    outcome: form.get('outcome'),
    reason: form.get('reason'),
  });
  redirect('/assessment-workspace?status=saved');
}
export async function moderateReview(form: FormData) {
  await mutate(
    `/admin/assessment-reviews/${id(form, 'reviewId')}/moderations`,
    { outcome: form.get('outcome'), reason: form.get('reason') },
  );
  redirect('/assessment-workspace?status=saved');
}
export async function resolveAppeal(form: FormData) {
  await mutate(`/admin/assessment-appeals/${id(form, 'appealId')}/resolve`, {
    resolution: form.get('resolution'),
  });
  redirect('/assessment-workspace?status=saved');
}
