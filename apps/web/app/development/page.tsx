import Link from 'next/link';
import { z } from 'zod';
import { api } from '../../lib/session';
import {
  pathwaySchema,
  catalogSchema,
  attemptsSchema,
  evidenceSchema,
  gapSchema,
} from '../../lib/assessment';
import { startAssessment, generatePlan } from './actions';
export const dynamic = 'force-dynamic';
export default async function Development({
  searchParams,
}: {
  searchParams: Promise<{ pathway?: string; status?: string }>;
}) {
  const query = await searchParams;
  const requests = await Promise.all([
    api('/pathways'),
    api('/assessments'),
    api('/candidates/me/attempts'),
    api('/candidates/me/competency-evidence'),
    api('/candidates/me/development-plans'),
  ]);
  if (requests.some((r) => !r || r.status === 401 || r.status === 403))
    return (
      <section>
        <h1>Development dashboard</h1>
        <Link href="/auth/login">Sign in to continue</Link>
      </section>
    );
  if (requests.some((r) => !r?.ok))
    return (
      <section>
        <h1>Development dashboard unavailable</h1>
        <p>Please retry when your connection returns.</p>
      </section>
    );
  const [paths, catalog, attempts, evidence, plans] = await Promise.all(
    requests.map((r) => r!.json()),
  );
  const tracks = pathwaySchema.parse(paths);
  const target = z.uuid().safeParse(query.pathway);
  const uniqueTracks = tracks.filter(
    (t, n) => tracks.findIndex((x) => x.id === t.id) === n,
  );
  const gapResponse = target.success
    ? await api(`/candidates/me/pathways/${target.data}/gaps`)
    : null;
  const gap = gapResponse?.ok
    ? gapSchema.parse(await gapResponse.json())
    : null;
  const planList = z
    .array(
      z.object({ id: z.uuid(), created_at: z.string(), snapshot: gapSchema }),
    )
    .parse(plans);
  return (
    <>
      <p>
        <Link href="/dashboard">Profile dashboard</Link>
      </p>
      <h1>My development</h1>
      <p>
        <Link href="/competencies">My competency evidence and gaps</Link> ·{' '}
        <Link href="/skills-passport">My private Skills Passport</Link>
      </p>
      <p>
        Missing evidence means unverified, not incompetent. Demo tasks provide
        practice and feedback; they do not award professional readiness.
      </p>
      {query.status === 'profile' && (
        <p role="alert">
          Save your candidate profile before starting an assessment or creating
          a plan.
        </p>
      )}
      {query.status === 'planned' && (
        <p role="status">
          Development plan saved with its evidence and requirement snapshot.
        </p>
      )}
      <section>
        <h2>My target pathway</h2>
        <form method="get">
          <label>
            Explore a target pathway
            <select
              name="pathway"
              defaultValue={target.success ? target.data : ''}
              required
            >
              <option value="" disabled>
                Select a pathway
              </option>
              {uniqueTracks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button>Review development gaps</button>
        </form>
        <p>
          Targets are exploratory. Your profile records selected career
          interests separately.
        </p>
      </section>
      <section>
        <h2>Baseline assessment</h2>
        <div className="grid">
          {catalogSchema
            .parse(catalog)
            .filter((a) => !target.success || a.pathway_id === target.data)
            .map((a) => (
              <article key={a.id}>
                <h3>{a.title}</h3>
                <p>{a.pathway}</p>
                <p className="notice">{a.notice}</p>
                <form action={startAssessment}>
                  <input type="hidden" name="assessmentId" value={a.id} />
                  <button>Start or resume</button>
                </form>
              </article>
            ))}
        </div>
      </section>
      <section>
        <h2>Assessment progress</h2>
        {attemptsSchema.parse(attempts).length === 0 ? (
          <p>No attempts yet.</p>
        ) : (
          attemptsSchema.parse(attempts).map((a) => (
            <article key={a.id}>
              <Link href={`/assessments/${a.id}`}>{a.title}</Link>
              <p>
                {a.status.replaceAll('_', ' ')} ·{' '}
                {a.demo ? 'Demo practice' : 'Assessment'} · {a.pathway}
              </p>
            </article>
          ))
        )}
      </section>
      <section>
        <h2>Competency profile and evidence status</h2>
        {evidenceSchema.parse(evidence).length === 0 ? (
          <p>
            No assessment evidence recorded. Competencies remain unverified.
          </p>
        ) : (
          evidenceSchema.parse(evidence).map((e) => (
            <article key={e.id}>
              <h3>{e.code.replaceAll('_', ' ')}</h3>
              <p>
                {e.facet.replaceAll('_', ' ')} · {e.status} ·{' '}
                {e.observation.replaceAll('_', ' ')}
              </p>
              {e.demo && (
                <p className="notice">
                  Demo evidence — excluded from professional verification and
                  gap closure.
                </p>
              )}
            </article>
          ))
        )}
      </section>
      {gap && (
        <>
          <section>
            <h2>Verified strengths</h2>
            {gap.gaps.some((g) => g.verifiedEvidenceIds.length) ? (
              gap.gaps
                .filter((g) => g.verifiedEvidenceIds.length)
                .map((g) => (
                  <p key={g.code}>
                    {g.statement}: {g.state.replaceAll('_', ' ')}
                  </p>
                ))
            ) : (
              <p>No verified evidence meets these proposed requirements yet.</p>
            )}
          </section>
          <section>
            <h2>Development gaps</h2>
            <p className="notice">{gap.notice}</p>
            {gap.gaps.map((g) => (
              <details key={g.childVersionId}>
                <summary>
                  {g.code.replaceAll('_', ' ')} — {g.state.replaceAll('_', ' ')}
                </summary>
                <p>{g.statement}</p>
                <p>
                  Evidence to develop:{' '}
                  {g.missingFacets.join(', ').replaceAll('_', ' ') || 'None'}
                </p>
                <p>
                  Requirement policy: {g.policyStatus}. No final pass mark or
                  readiness percentage is assigned.
                </p>
                {gap.activities
                  .filter((a) => a.childVersionId === g.childVersionId)
                  .map((a) => (
                    <p key={a.gap}>{a.activity}</p>
                  ))}
              </details>
            ))}
          </section>
          <section>
            <h2>Individual development plan</h2>
            <form action={generatePlan}>
              <input
                type="hidden"
                name="pathwayId"
                value={target.success ? target.data : ''}
              />
              <button>Save this development plan</button>
            </form>
          </section>
        </>
      )}
      <section>
        <h2>Saved development plans</h2>
        {planList.length === 0 ? (
          <p>No saved plans yet.</p>
        ) : (
          planList.map((p) => (
            <details key={p.id}>
              <summary>
                Plan saved{' '}
                {new Date(p.created_at).toLocaleDateString('en-NG', {
                  timeZone: 'Africa/Lagos',
                })}
              </summary>
              <p className="notice">{p.snapshot.notice}</p>
              <ol>
                {p.snapshot.activities.map((a, n) => (
                  <li key={`${a.childVersionId}-${n}`}>
                    {a.code.replaceAll('_', ' ')}: {a.activity}
                  </li>
                ))}
              </ol>
            </details>
          ))
        )}
      </section>
    </>
  );
}
