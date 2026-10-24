import Link from 'next/link';
import { api } from '../../lib/session';
import { pilotDashboardSchema } from '../../lib/dairy-pilot';
import { enterDairy, startDairy } from './actions';
export const dynamic = 'force-dynamic';
export default async function Dairy({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  let r: Response | null = null;
  try {
    r = await api('/candidates/me/dairy-pilot');
  } catch {
    /* Preserve the safe unavailable/error state without exposing server details. */
  }
  if (!r || r.status === 401)
    return (
      <>
        <h1>Commercial Dairy Practice</h1>
        <Link href="/auth/login">Sign in to continue</Link>
      </>
    );
  if (!r.ok)
    return (
      <p role="alert">
        Dairy workspace is temporarily unavailable. Please retry when connected.
      </p>
    );
  const d = pilotDashboardSchema.parse(await r.json());
  const count = (facet: string) =>
    d.evidence.filter((e) => e.facet === facet).length;
  return (
    <>
      <Link href="/dashboard">My profile</Link>
      <h1>Commercial Dairy Practice</h1>
      <p className="notice">{d.notice}</p>
      <p>
        Observe → Identify → Prioritise → Investigate → Interpret → Recommend →
        Monitor → Reassess.
      </p>
      {status && (
        <p role="status">
          {status === 'entered'
            ? 'Dairy pathway interest recorded.'
            : status === 'profile'
              ? 'Save your profile first.'
              : 'The action was not completed. Check your connection and profile; the owner must release the demo case before you can start.'}
        </p>
      )}
      {d.profileRequired ? (
        <p>
          <Link href="/dashboard">Create your candidate profile</Link> before
          starting.
        </p>
      ) : (
        !d.selected && (
          <form action={enterDairy}>
            <input type="hidden" name="pathwayId" value={d.pathway.id} />
            <button>Enter dairy pathway</button>
          </form>
        )
      )}
      <p>
        <Link href="/dairy/learning">
          Explore dairy domains and governed learning
        </Link>
      </p>
      <section>
        <h2>My progress and evidence</h2>
        <p>
          <Link href="/practical">
            My private practical evidence and explainable gaps
          </Link>
        </p>
        <dl>
          <dt>Dairy pilot assessment</dt>
          <dd>
            {d.attempts.length
              ? `${d.attempts.length} pilot attempt(s) recorded`
              : 'Not assessed'}
          </dd>
          <dt>Training / learning</dt>
          <dd>
            {d.learning.enrollments} enrollments; {d.learning.completed_lessons}{' '}
            lessons completed. Learning completion is not competence.
          </dd>
          <dt>Knowledge assessed</dt>
          <dd>
            {count('KNOWLEDGE_ASSESSED')} recent evidence records; demo and
            verification status shown separately below.
          </dd>
          <dt>Case assessed</dt>
          <dd>
            {count('CASE_ASSESSED')} evidence records. Written case performance
            does not establish practical ability.
          </dd>
          <dt>Practical verification</dt>
          <dd>
            Private practical evidence can be saved and reviewed in the
            practical workspace. Reviews remain demonstrations pending expert
            configuration; this pilot cannot award practical verification.
          </dd>
          <dt>Practically verified</dt>
          <dd>
            Not established by this online case. Assessed reasoning and
            supervised practical evidence are different.
          </dd>
          <dt>Professional readiness / certification</dt>
          <dd>Not awarded. No readiness rule is active.</dd>
        </dl>
      </section>
      <section>
        <h2>Transition &amp; Fresh Cow Investigation</h2>
        {d.pilot ? (
          <>
            <p>
              {d.pilot.title} · version {d.pilot.version}
            </p>
            <p className="notice">{d.pilot.notice}</p>
            <p>
              Investigate individual-animal concerns and herd-level patterns.
              Work through ten stages, keep facts separate from hypotheses, and
              save each stage before submitting.
            </p>
            <form action={startDairy}>
              <button disabled={d.profileRequired}>
                Open / resume dairy case
              </button>
            </form>
          </>
        ) : (
          <p>The owner has not released the controlled demo case yet.</p>
        )}
      </section>
      <section>
        <h2>Proposed competencies evaluated in this case</h2>
        <p>
          These are assessment targets, not awards. General topic coverage does
          not establish practical skill.
        </p>
        {d.competencies.map((c) => (
          <article key={c.id}>
            <h3>{c.statement}</h3>
            <p>{c.validation_status} — REQUIRES DOMAIN EXPERT VALIDATION</p>
            <p>
              {d.evidence.some((e) => e.code === c.code)
                ? 'Recent evidence is listed below with its demo and verification status.'
                : 'No recent evidence recorded for this target; it remains unverified.'}
            </p>
          </article>
        ))}
      </section>
      <section>
        <h2>My case attempts</h2>
        {d.attempts.length ? (
          d.attempts.map((a) => (
            <article key={a.id}>
              <Link href={`/dairy/cases/${a.id}`}>Open case and feedback</Link>
              <p>
                {a.status.replaceAll('_', ' ')} · {a.saved}/{a.total} stages
                saved
              </p>
            </article>
          ))
        ) : (
          <p>
            No case submitted. Missing evidence means unverified, not
            incompetent.
          </p>
        )}
      </section>
      <section>
        <h2>My recent dairy evidence</h2>
        <p>
          Showing up to 200 recent records. Case history lists up to 20 recent
          attempts.
        </p>
        <p>
          Self-declared skills are not assessed evidence. DEMO records cannot
          establish VetReady-verified competence.
        </p>
        {d.evidence.map((e) => (
          <article key={e.id}>
            <h3>{e.code.replaceAll('_', ' ')}</h3>
            <p>
              {e.facet.replaceAll('_', ' ')} · {e.status} ·{' '}
              {e.observation.replaceAll('_', ' ')}
            </p>
            {e.demo && (
              <p className="notice">
                DEMO — excluded from professional verification.
              </p>
            )}
          </article>
        ))}
      </section>
      <p>
        <Link href="/dairy/review">Authorized dairy staff workspace</Link>
      </p>
      <p>
        <Link href="/development">
          Development plans and other existing records
        </Link>
      </p>
    </>
  );
}
