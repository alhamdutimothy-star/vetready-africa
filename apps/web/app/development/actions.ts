'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { api } from '../../lib/session';
export async function startAssessment(form: FormData) {
  const id = z.uuid().safeParse(form.get('assessmentId'));
  if (!id.success) redirect('/development?status=invalid');
  const r = await api(`/assessments/${id.data}/attempts`, { method: 'POST' });
  if (!r) redirect('/auth/login');
  if (!r.ok) redirect('/development?status=profile');
  const attempt = z.object({ id: z.uuid() }).parse(await r.json());
  redirect(`/assessments/${attempt.id}`);
}
export async function generatePlan(form: FormData) {
  const id = z.uuid().safeParse(form.get('pathwayId'));
  if (!id.success) redirect('/development?status=invalid');
  const r = await api(`/candidates/me/pathways/${id.data}/development-plans`, {
    method: 'POST',
  });
  if (!r) redirect('/auth/login');
  if (!r.ok) redirect('/development?status=profile');
  revalidatePath('/development');
  redirect(`/development?pathway=${id.data}&status=planned`);
}
