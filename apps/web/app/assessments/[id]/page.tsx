import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { api } from '../../../lib/session';
import { attemptSchema, uuidSchema } from '../../../lib/assessment';
import { saveResponse, submitAttempt, appealAttempt } from './actions';
export const dynamic = 'force-dynamic';
export default async function Assessment({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { status } = await searchParams;
  const r = await api(`/candidates/me/attempts/${id}`);
  if (!r || r.status === 401) return <Link href="/auth/login">Sign in</Link>;
  if (r.status === 404) notFound();
  if (!r.ok) return <p>Assessment temporarily unavailable.</p>;
  const a = attemptSchema.parse(await r.json());
  if (a.pilot) redirect(`/dairy/cases/${id}`);
  const editable = a.status === 'IN_PROGRESS';
  return (
    <>
      <Link href="/development">Back to my development</Link>
      <h1>{a.title}</h1>
      <p className="notice">{a.notice}</p>
      <p>
        Progress: {a.items.filter((i) => i.response).length} of {a.items.length}{' '}
        tasks saved. Status: {a.status.replaceAll('_', ' ')}.
      </p>
      <p>
        Save each answer before submitting. Saved responses can be resumed after
        a connection interruption.
      </p>
      {status && (
        <p role="status">
          {(
            {
              saved: 'Response saved.',
              invalid: 'Response was not saved. Check the input and try again.',
              incomplete: 'Save a response to every task before submitting.',
              submitted:
                'Submitted for review. Professional competence has not been verified.',
              appealed: 'Appeal recorded for independent review',
            } as Record<string, string>
          )[status] ?? ''}
        </p>
      )}
      {a.caseBlueprint && (
        <section aria-labelledby="case-scenario-heading">
          <h2 id="case-scenario-heading">Farm investigation case</h2>
          <p className="notice">{a.caseBlueprint.validation_notice}</p>
          <p>{a.caseBlueprint.scenario}</p>
          <p>
            This written case does not verify practical performance or job
            readiness.
          </p>
        </section>
      )}
      {a.items.map((i, n) => (
        <section key={i.id}>
          <h2>
            Task {n + 1}:{' '}
            {a.caseBlueprint?.steps.find((s) => s.itemVersionId === i.id)
              ?.title ?? i.child_code.replaceAll('_', ' ')}
          </h2>
          <p>{i.prompt}</p>
          {i.retired && (
            <p role="alert">
              This task has been retired. Your historical response is preserved;
              contact the assessor before relying on this result.
            </p>
          )}
          <p>
            Proposed evidence route: {i.evidence_type.replaceAll('_', ' ')}.
            This task alone does not verify that route.
          </p>
          <details>
            <summary>Assessment criteria</summary>
            <ul>
              {i.rubric.map((c) => (
                <li key={c.id}>{c.description}</li>
              ))}
            </ul>
          </details>
          <form action={saveResponse}>
            <input type="hidden" name="attemptId" value={id} />
            <input type="hidden" name="itemId" value={i.id} />
            <input type="hidden" name="type" value={i.type} />
            <fieldset disabled={!editable}>
              {i.type === 'SINGLE_MCQ' || i.type === 'MULTIPLE_RESPONSE' ? (
                i.presentation.options?.map((o) => (
                  <label key={o.id}>
                    <input
                      name="selected"
                      type={i.type === 'SINGLE_MCQ' ? 'radio' : 'checkbox'}
                      value={o.id}
                      defaultChecked={i.response?.selected?.includes(o.id)}
                    />
                    {o.text}
                  </label>
                ))
              ) : i.type === 'NUMERICAL' ? (
                <label>
                  Calculation{' '}
                  {i.presentation.units && `(${i.presentation.units})`}
                  <input
                    name="value"
                    type="number"
                    step="any"
                    required
                    defaultValue={i.response?.value}
                  />
                </label>
              ) : (
                <label>
                  {i.type === 'PRACTICAL_PLACEHOLDER'
                    ? 'Describe the supervised evidence still required; this written record cannot verify practical competence'
                    : 'Your response'}
                  <textarea
                    name="text"
                    rows={8}
                    required
                    maxLength={20000}
                    defaultValue={i.response?.text}
                  />
                </label>
              )}
              {editable && <button>Save response</button>}
            </fieldset>
          </form>
        </section>
      ))}
      {editable && (
        <form action={submitAttempt}>
          <input type="hidden" name="attemptId" value={id} />
          <button>Submit for review</button>
        </form>
      )}
      <section>
        <h2>Assessor feedback</h2>
        {a.reviews.length ? (
          a.reviews.map((v) => (
            <article key={v.id}>
              <p>{v.feedback}</p>
            </article>
          ))
        ) : (
          <p>No assessor feedback yet.</p>
        )}
      </section>
      {!editable && (
        <section>
          <h2>Request a review or correction</h2>
          <form action={appealAttempt}>
            <input type="hidden" name="attemptId" value={id} />
            <label>
              Reason
              <textarea
                name="reason"
                minLength={10}
                maxLength={3000}
                required
              />
            </label>
            <button>Submit appeal</button>
          </form>
        </section>
      )}
    </>
  );
}
