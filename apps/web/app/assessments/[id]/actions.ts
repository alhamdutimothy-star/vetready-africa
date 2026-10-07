'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { api } from '../../../lib/session';
function attemptId(form: FormData) {
  const r = z.uuid().safeParse(form.get('attemptId'));
  if (!r.success) redirect('/development');
  return r.data;
}
export async function saveResponse(form: FormData) {
  const id = attemptId(form);
  const item = z.uuid().safeParse(form.get('itemId'));
  if (!item.success) redirect(`/assessments/${id}?status=invalid`);
  const type = form.get('type');
  let value: unknown;
  if (type === 'SINGLE_MCQ' || type === 'MULTIPLE_RESPONSE')
    value = { selected: form.getAll('selected') };
  else if (type === 'NUMERICAL') {
    const raw = form.get('value');
    if (typeof raw !== 'string' || !raw.trim() || !Number.isFinite(Number(raw)))
      redirect(`/assessments/${id}?status=invalid`);
    value = { value: Number(raw) };
  } else value = { text: form.get('text') };
  const r = await api(`/candidates/me/attempts/${id}/responses/${item.data}`, {
    method: 'PUT',
    body: JSON.stringify(value),
  });
  if (!r) redirect('/auth/login');
  if (!r.ok) redirect(`/assessments/${id}?status=invalid`);
  revalidatePath(`/assessments/${id}`);
  redirect(`/assessments/${id}?status=saved`);
}
export async function submitAttempt(form: FormData) {
  const id = attemptId(form);
  const r = await api(`/candidates/me/attempts/${id}/submit`, {
    method: 'POST',
  });
  if (!r) redirect('/auth/login');
  if (!r.ok) redirect(`/assessments/${id}?status=incomplete`);
  revalidatePath('/development');
  redirect(`/assessments/${id}?status=submitted`);
}
export async function appealAttempt(form: FormData) {
  const id = attemptId(form);
  const r = await api(`/candidates/me/attempts/${id}/appeals`, {
    method: 'POST',
    body: JSON.stringify({ reason: form.get('reason') }),
  });
  if (!r) redirect('/auth/login');
  redirect(`/assessments/${id}?status=${r.ok ? 'appealed' : 'invalid'}`);
}
