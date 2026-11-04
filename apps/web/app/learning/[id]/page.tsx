import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { api } from '../../../lib/session';
import { saveReading } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Learning({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const query = await searchParams;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return <p>Learning unavailable.</p>;
  let r: Response | null = null;
  try {
    r = await api(`/candidates/me/training/enrollments/${id}`);
  } catch {
    /* Safe unavailable state. */
  }
  if (!r?.ok)
    return (
      <>
        <p>Private learning unavailable. Check sign-in and connection.</p>
        <Link href="/development/next-steps">My next steps</Link>
      </>
    );
  const d = z
    .object({
      course: z.object({
        title: z.string(),
        status: z.string(),
        notice: z.string(),
        modules: z.array(
          z.object({
            id: z.uuid(),
            title: z.string(),
            lessons: z.array(
              z.object({
                id: z.uuid(),
                title: z.string(),
                body: z.string(),
                state: z.string(),
                revision: z.number(),
                resumePosition: z.number(),
              }),
            ),
          }),
        ),
      }),
    })
    .parse(await r.json());
  return (
    <>
      <Link href="/development/next-steps">My next steps and current gaps</Link>
      <h1>{d.course.title}</h1>
      <p className="notice">{d.course.notice}</p>
      {query.status && (
        <p role="status">
          {query.status === 'saved'
            ? 'Learning progress saved. Competency gaps require separate evidence.'
            : 'Progress was not confirmed saved. Retry after checking your connection.'}
        </p>
      )}
      {d.course.modules.map((m) => (
        <section key={m.id}>
          <h2>{m.title}</h2>
          {m.lessons.map((l) => (
            <article key={l.id}>
              <h3>{l.title}</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{l.body}</p>
              <p>{l.state.replaceAll('_', ' ')}</p>
              {d.course.status !== 'RETIRED' && l.state !== 'COMPLETED' && (
                <form action={saveReading}>
                  <input type="hidden" name="enrollment" value={id} />
                  <input type="hidden" name="lesson" value={l.id} />
                  <input type="hidden" name="commandId" value={randomUUID()} />
                  <input type="hidden" name="revision" value={l.revision} />
                  <input
                    type="hidden"
                    name="position"
                    value={l.resumePosition}
                  />
                  <button name="state" value="IN_PROGRESS">
                    Save reading progress
                  </button>
                  <button name="state" value="COMPLETED">
                    Mark learning completed
                  </button>
                </form>
              )}
            </article>
          ))}
        </section>
      ))}
    </>
  );
}
