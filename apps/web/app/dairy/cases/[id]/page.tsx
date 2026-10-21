import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { api } from '../../../../lib/session';
import { pilotAttemptSchema } from '../../../../lib/dairy-pilot';
import { DairyReasoning } from '../../reasoning';
export const dynamic = 'force-dynamic';
export default async function DairyCase({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let r: Response | null = null;
  try {
    r = await api(`/candidates/me/dairy-pilot/attempts/${id}`);
  } catch {
    /* Preserve the safe unavailable/error state without exposing server details. */
  }
  if (!r || r.status === 401)
    return <Link href="/auth/login">Sign in to continue</Link>;
  if (r.status === 404) notFound();
  if (!r.ok)
    return (
      <p role="alert">Case temporarily unavailable. Retry when connected.</p>
    );
  const d = pilotAttemptSchema.parse(await r.json());
  return (
    <>
      <Link href="/dairy">My dairy workspace</Link>
      <h1>{d.title}</h1>
      <p className="notice">{d.notice}</p>
      <p>
        Status: {d.status.replaceAll('_', ' ')}. No professional competence or
        practical verification is awarded by this demo.
      </p>
      <section>
        <h2>Case introduction and farm context</h2>
        <p>{d.caseBlueprint?.scenario}</p>
      </section>
      <section>
        <h2>Available evidence — supplied by the case</h2>
        <p>
          These are fictional case reports, not your observations or established
          diagnoses.
        </p>
        {d.suppliedEvidence.map((e, n) => (
          <article key={n}>
            <p>{e.statement}</p>
            <p>Limitations: {e.limitation}</p>
          </article>
        ))}
      </section>
      <DairyReasoning key={d.id} attempt={d} />
      <section>
        <h2>Structured assessor feedback</h2>
        {d.feedback.length ? (
          d.feedback.map((f) => (
            <article key={f.id}>
              <h3>{f.decision.replaceAll('_', ' ')}</h3>
              <p>
                Review recorded{' '}
                {new Date(f.created_at).toLocaleString('en-NG', {
                  timeZone: 'Africa/Lagos',
                })}
                . Assessor reference: {f.assessor_id}.
              </p>
              {f.moderation === 'RETURNED' && (
                <p role="status">
                  Historical review returned for reassessment. This feedback
                  remains in your record.
                </p>
              )}
              <p>{f.feedback}</p>
              <ul>
                {f.observations.map((o, n) => (
                  <li key={n}>
                    <strong>
                      {o.childCode.replaceAll('_', ' ')}:{' '}
                      {o.observation.replaceAll('_', ' ')}
                    </strong>
                    <p>{o.dimensions.join(', ').replaceAll('_', ' ')}</p>
                    <p>{o.comment}</p>
                  </li>
                ))}
              </ul>
              <p className="notice">
                Development feedback, not certification or practical
                verification.
              </p>
            </article>
          ))
        ) : (
          <p>No finalized feedback yet. Assessor drafts are private.</p>
        )}
      </section>
      <section>
        <h2>Evidence provenance</h2>
        {d.evidence.map((e) => (
          <p key={e.id}>
            {e.facet.replaceAll('_', ' ')} · {e.status} · {e.demo ? 'DEMO' : ''}{' '}
            · reference {e.id}
          </p>
        ))}
        <p>
          This case contributes evidence toward the mapped proposed
          competencies; it does not verify supervised field skills.
        </p>
      </section>
    </>
  );
}
