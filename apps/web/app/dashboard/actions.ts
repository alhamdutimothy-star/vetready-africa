'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { api } from '../../lib/session';
export async function saveProfile(form: FormData) {
  const response = await api('/candidates/me', {
    method: 'PUT',
    body: JSON.stringify({
      fullName: form.get('fullName'),
      state: form.get('state'),
      countryCode: 'NG',
      willingToRelocate: form.get('willingToRelocate') === 'on',
      drivingAbility: form.get('drivingAbility') === 'on',
      professionalSummary: form.get('professionalSummary'),
    }),
  });
  if (!response) redirect('/auth/login');
  if (!response.ok) redirect('/dashboard?status=invalid');
  revalidatePath('/dashboard');
  redirect('/dashboard?status=saved');
}
export async function selectPathway(form: FormData) {
  const id = form.get('pathwayId');
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))
    redirect('/dashboard?status=invalid');
  const response = await api(`/candidates/me/pathways/${id}`, {
    method: 'POST',
  });
  if (!response) redirect('/auth/login');
  if (!response.ok) redirect('/dashboard?status=invalid');
  revalidatePath('/dashboard');
  redirect('/dashboard?status=pathway');
}
export async function registerEmployer(form: FormData) {
  const response = await api('/organizations', {
    method: 'POST',
    body: JSON.stringify({
      displayName: form.get('displayName'),
      sector: form.get('sector'),
      countryCode: 'NG',
    }),
  });
  if (!response) redirect('/auth/login');
  if (!response.ok) redirect('/dashboard?status=invalid');
  redirect('/dashboard?status=employer');
}
