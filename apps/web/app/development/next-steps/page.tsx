import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { api } from '../../../lib/session';
import { profilePathwaySchema } from '@vetready/contracts';
import { createWorkflow } from './actions';
export const dynamic = 'force-dynamic';
export default async function NextSteps({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    command?: string;
    pathway?: string;
  }>;
}) {
  const query = await searchParams;
  const command = z.uuid().safeParse(query.command),
    pathway = z.uuid().safeParse(query.pathway);
  let responses: (Response | null)[] = [];
  try {
    responses = await Promise.all([
      api('/candidates/me/competency-profile'),
      api('/candidates/me/development-workflows'),
    ]);
  } catch {
    /* Safe unavailable state. */
  }
  if (responses.length !== 2 || responses.some((r) => !r?.ok))
    return (
      <section>
        <h1>My next steps</h1>
        <p>
          Save your profile and sign in to view private development plans. Retry
          if your connection is unavailable.
        </p>
        <Link href="/auth/login">Sign in</Link>
      </section>
    );
  const profile = z
    .object({ pathways: z.array(profilePathwaySchema) })
    .parse(await responses[0]!.json());
  const plans = z
    .array(
      z.object({ id: z.uuid(), createdAt: z.string(), pathway: z.string() }),
    )
    .parse(await responses[1]!.json());
  return (
    <>
      <Link href="/development">Development dashboard</Link>
      <h1>My next steps</h1>
      <p>
        Save an evidence-based development plan. Current requirements remain
        unconfigured; recommendations are governed demonstration practice, not
        professional requirements or qualifications.
      </p>
      {query.status && (
        <p role="alert">
          Plan save was not confirmed. Check your connection and retry. The same
          request identifier is retained for a safe retry.
        </p>
      )}
      <form action={createWorkflow}>
        <input
          type="hidden"
          name="commandId"
          value={command.success ? command.data : randomUUID()}
        />
        <label>
          Target pathway
          <select
            name="pathwayVersionId"
            required
            defaultValue={pathway.success ? pathway.data : undefined}
          >
            {profile.pathways
              .filter((p) => p.status !== 'RETIRED')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — version {p.version}
                </option>
              ))}
          </select>
        </label>
        <button>Save a next-step plan</button>
      </form>
      <h2>Saved plans</h2>
      <p>
        Latest 50 plans. Each retains its original evidence snapshot; open it to
        see current progress and gaps.
      </p>
      {plans.map((p) => (
        <p key={p.id}>
          <Link href={`/development/next-steps/${p.id}`}>
            {p.pathway} —{' '}
            {new Date(p.createdAt).toLocaleDateString('en-NG', {
              timeZone: 'Africa/Lagos',
            })}
          </Link>
        </p>
      ))}
    </>
  );
}
