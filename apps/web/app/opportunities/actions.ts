'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { api } from '../../lib/session';
import {
  applyPilotSchema,
  createPilotJobSchema,
  revisePilotJobSchema,
  jobTransitionSchema,
  employerDecisionSchema,
  memberDecisionSchema,
  recruitmentCommandSchema,
  shortlistCommandSchema,
  type JobRequirement,
} from '@vetready/contracts';
const uuid = (f: FormData, k: string) => z.uuid().parse(f.get(k));
const send = async (path: string, body: unknown) => {
  const r = await api(path, { method: 'POST', body: JSON.stringify(body) });
  if (!r?.ok) throw Error('Pilot operation unavailable');
  return z.object({ id: z.uuid() }).parse(await r.json()).id;
};
export async function applyToPilot(f: FormData) {
  let ok = false;
  try {
    const commandId = uuid(f, 'commandId'),
      job = uuid(f, 'jobId'),
      version = uuid(f, 'versionId');
    if (f.get('consent') !== 'on') throw Error('Consent required');
    const snapshot = await send('/candidates/me/competency-profile/snapshots', {
      commandId,
    });
    await send(
      `/pilot/opportunities/${job}/applications`,
      applyPilotSchema.parse({
        commandId,
        jobVersionId: version,
        snapshotId: snapshot,
        consent: true,
        consentVersion: 'pilot-share-1',
      }),
    );
    ok = true;
  } catch {
    /* Do not expose private API errors. */
  }
  redirect('/opportunities?status=' + (ok ? 'saved' : 'unavailable'));
}
export async function candidatePilotAction(f: FormData) {
  let ok = false;
  try {
    const action = z.enum(['withdraw', 'revoke-access']).parse(f.get('action'));
    await send(
      `/pilot/candidates/me/applications/${uuid(f, 'applicationId')}/${action}`,
      recruitmentCommandSchema.parse({ commandId: uuid(f, 'commandId') }),
    );
    ok = true;
  } catch {
    /* Keep private errors server-side; redirect with a generic state. */
  }
  redirect('/opportunities?status=' + (ok ? 'saved' : 'unavailable'));
}
export async function savePilotJob(f: FormData) {
  let org = '';
  let ok = false;
  try {
    org = uuid(f, 'organizationId');
    const requirements: JobRequirement[] = [
      {
        id: uuid(f, 'interestRequirementId'),
        kind: 'PATHWAY_INTEREST',
        mandatory: true,
      },
    ];
    if (f.get('state'))
      requirements.push({
        id: uuid(f, 'locationRequirementId'),
        kind: 'LOCATION_DECLARATION',
        mandatory: true,
        state: String(f.get('state')),
        acceptRelocation: f.get('acceptRelocation') === 'on',
      });
    if (f.get('childVersionId'))
      requirements.push({
        id: uuid(f, 'competencyRequirementId'),
        kind: 'COMPETENCY_FACET',
        mandatory: f.get('mandatoryCompetency') === 'on',
        childVersionId: uuid(f, 'childVersionId'),
        facet: z
          .enum([
            'SELF_DECLARED',
            'DOCUMENT_VERIFIED',
            'KNOWLEDGE_ASSESSED',
            'CASE_ASSESSED',
            'PRACTICALLY_VERIFIED',
          ])
          .parse(f.get('facet')),
      });
    const body = {
      commandId: uuid(f, 'commandId'),
      content: {
        title: String(f.get('title')),
        description: String(f.get('description')),
        pathwayVersionId: uuid(f, 'pathwayVersionId'),
        requirements,
      },
    };
    if (f.get('jobId'))
      await send(
        `/pilot/organizations/${org}/opportunities/${uuid(f, 'jobId')}/versions`,
        revisePilotJobSchema.parse({
          ...body,
          expectedVersion: Number(f.get('expectedVersion')),
        }),
      );
    else
      await send(
        `/pilot/organizations/${org}/opportunities`,
        createPilotJobSchema.parse(body),
      );
    ok = true;
  } catch {
    /* Keep private errors server-side; redirect with a generic state. */
  }
  redirect(
    '/employer-pilot' +
      (org ? '?org=' + org + '&' : '?') +
      'status=' +
      (ok ? 'saved' : 'unavailable'),
  );
}
export async function transitionPilotJob(f: FormData) {
  let org = '';
  let ok = false;
  try {
    org = uuid(f, 'organizationId');
    await send(
      `/pilot/organizations/${org}/opportunities/${uuid(f, 'jobId')}/transitions`,
      jobTransitionSchema.parse({
        commandId: uuid(f, 'commandId'),
        expectedVersion: Number(f.get('expectedVersion')),
        action: f.get('action'),
      }),
    );
    ok = true;
  } catch {
    /* Keep private errors server-side; redirect with a generic state. */
  }
  redirect(
    '/employer-pilot' +
      (org ? '?org=' + org + '&' : '?') +
      'status=' +
      (ok ? 'saved' : 'unavailable'),
  );
}
export async function evaluatePilotApplication(f: FormData) {
  let target = '/employer-pilot?status=unavailable';
  try {
    const org = uuid(f, 'organizationId'),
      application = uuid(f, 'applicationId');
    const evaluation = await send(
      `/pilot/organizations/${org}/applications/${application}/evaluations`,
      { commandId: uuid(f, 'commandId') },
    );
    target = `/employer-pilot?org=${org}&application=${application}&evaluation=${evaluation}`;
  } catch {
    /* Keep private errors server-side; redirect with a generic state. */
  }
  redirect(target);
}
export async function shortlistPilotApplication(f: FormData) {
  let org = '';
  let ok = false;
  try {
    org = uuid(f, 'organizationId');
    await send(
      `/pilot/organizations/${org}/applications/${uuid(f, 'applicationId')}/shortlist`,
      shortlistCommandSchema.parse({
        commandId: uuid(f, 'commandId'),
        evaluationId: uuid(f, 'evaluationId'),
        expectedRevision: Number(f.get('expectedRevision')),
        action: f.get('action'),
      }),
    );
    ok = true;
  } catch {
    /* Keep private errors server-side; redirect with a generic state. */
  }
  redirect(
    '/employer-pilot' +
      (org ? '?org=' + org + '&' : '?') +
      'status=' +
      (ok ? 'saved' : 'unavailable'),
  );
}
export async function governPilot(f: FormData) {
  let ok = false;
  try {
    const org = uuid(f, 'organizationId'),
      body = {
        commandId: uuid(f, 'commandId'),
        status: f.get('status'),
        reason: f.get('reason'),
      };
    if (f.get('userId'))
      await send(
        `/pilot/admin/organizations/${org}/members/${uuid(f, 'userId')}/access`,
        memberDecisionSchema.parse(body),
      );
    else
      await send(
        `/pilot/admin/organizations/${org}/verification`,
        employerDecisionSchema.parse(body),
      );
    ok = true;
  } catch {
    /* Keep private errors server-side; redirect with a generic state. */
  }
  redirect('/pilot-governance?status=' + (ok ? 'saved' : 'unavailable'));
}
