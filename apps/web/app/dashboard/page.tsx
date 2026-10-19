import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { api } from '../../lib/session';
import { saveProfile, selectPathway, registerEmployer } from './actions';
export const dynamic = 'force-dynamic';
const paths = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
    validation_notice: z.string(),
  }),
);
const profile = z.object({
  full_name: z.string(),
  state: z.string(),
  professional_summary: z.string(),
  willing_to_relocate: z.boolean(),
  driving_ability: z.boolean(),
});
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  let me: Response | null;
  try {
    me = await api('/me');
  } catch {
    return (
      <section>
        <h1>Profile temporarily unavailable</h1>
        <p>Please retry when the connection is restored.</p>
      </section>
    );
  }
  if (!me || me.status === 401 || me.status === 403) redirect('/auth/login');
  if (!me.ok)
    return (
      <section>
        <h1>Your private workspace</h1>
        <p>
          Sign in to create your candidate profile and select career pathways.
        </p>
        <Link className="button" href="/auth/login">
          Sign in
        </Link>
      </section>
    );
  const [pathResponse, candidateResponse] = await Promise.all([
    api('/pathways'),
    api('/candidates/me'),
  ]);
  const catalog = pathResponse?.ok
    ? paths.parse(await pathResponse.json())
    : [];
  const candidate = candidateResponse?.ok
    ? profile.parse(await candidateResponse.json())
    : null;
  return (
    <>
      <h1>Your professional foundation</h1>
      <p>
        Readiness: <strong>NOT ASSESSED</strong>. No competence has been
        certified in this foundation release.
      </p>
      {status && (
        <p role="status">
          {status === 'invalid'
            ? 'Could not save. Check your details and retry.'
            : status === 'employer'
              ? 'Organization submitted for verification.'
              : status === 'pathway'
                ? 'Career interest recorded.'
                : 'Profile saved privately.'}
        </p>
      )}
      <section>
        <h2>Candidate profile</h2>
        <form action={saveProfile}>
          <label>
            Full name
            <input
              name="fullName"
              required
              minLength={2}
              maxLength={160}
              defaultValue={candidate?.full_name}
            />
          </label>
          <label>
            State
            <input
              name="state"
              required
              minLength={2}
              maxLength={100}
              defaultValue={candidate?.state}
            />
          </label>
          <label>
            Professional summary
            <textarea
              name="professionalSummary"
              maxLength={2000}
              defaultValue={candidate?.professional_summary}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="willingToRelocate"
              defaultChecked={candidate?.willing_to_relocate}
            />
            Willing to relocate
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="drivingAbility"
              defaultChecked={candidate?.driving_ability}
            />
            Able to drive
          </label>
          <button>Save private profile</button>
        </form>
      </section>
      <section>
        <h2>Career pathways</h2>
        <p>
          <Link href="/development">
            Open baseline assessment and development dashboard
          </Link>
        </p>
        <p>
          <Link href="/assessment-workspace">Assessment staff workspace</Link>
        </p>
        <p>
          These proposed frameworks require professional review. Selecting a
          pathway records interest, not qualification.
        </p>
        <div className="grid">
          {catalog.map((p) => (
            <article key={p.id}>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <p className="notice">{p.validation_notice}</p>
              <form action={selectPathway}>
                <input type="hidden" name="pathwayId" value={p.id} />
                <button disabled={!candidate}>Select pathway</button>
              </form>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2>Register an employer organization</h2>
        <form action={registerEmployer}>
          <label>
            Organization name
            <input name="displayName" required minLength={2} maxLength={160} />
          </label>
          <label>
            Industry sector
            <input name="sector" required minLength={2} maxLength={100} />
          </label>
          <button>Submit organization</button>
        </form>
        <p>
          Organizations start pending verification. Candidate search is not
          available in Phase 1.
        </p>
      </section>
      <form action="/auth/logout" method="post">
        <button className="secondary">Sign out</button>
      </form>
    </>
  );
}
