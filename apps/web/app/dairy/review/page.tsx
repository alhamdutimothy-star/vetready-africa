import Link from 'next/link';
import { z } from 'zod';
import { api } from '../../../lib/session';
import { staffPilotSchema } from '../../../lib/dairy-pilot';
import { preparePilot, releasePilot, assignPilot } from '../actions';
import { DairyReviewForm } from '../review-form';
export const dynamic = 'force-dynamic';
export default async function Review({
  searchParams,
}: {
  searchParams: Promise<{ attempt?: string; status?: string }>;
}) {
  const query = await searchParams;
  let me: Response | null = null;
  try {
    me = await api('/me');
  } catch {
    /* Preserve the safe unavailable/error state without exposing server details. */
  }
  if (!me?.ok) return <Link href="/auth/login">Sign in to continue</Link>;
  const grants = z
    .object({
      permissions: z.array(
        z.object({
          permission: z.string(),
          organizationId: z.string().nullable(),
        }),
      ),
    })
    .parse(await me.json()).permissions;
  const has = (p: string) =>
    grants.some((g) => g.permission === p && g.organizationId === null);
  if (
    !has('assessment:author') &&
    !has('assessment:assign') &&
    !has('assessment:review')
  )
    return (
      <>
        <h1>Dairy staff workspace</h1>
        <p>Assigned staff access is required.</p>
        <Link href="/dairy">My dairy dashboard</Link>
      </>
    );
  const queueResponse = await api('/staff/dairy-pilot');
  const queue = queueResponse?.ok
    ? z
        .object({
          attempts: z.array(
            z.object({
              id: z.uuid(),
              status: z.string(),
              title: z.string(),
              assigned_assessor_id: z.uuid().nullable(),
            }),
          ),
          assessors: z.array(z.object({ id: z.uuid() })),
        })
        .parse(await queueResponse.json())
    : { attempts: [], assessors: [] };
  const selected = z.uuid().safeParse(query.attempt);
  const r = selected.success
    ? await api(`/staff/dairy-pilot/attempts/${selected.data}`)
    : null;
  const d = r?.ok ? staffPilotSchema.parse(await r.json()) : null;
  const draftsResponse = has('assessment:author')
    ? await api('/admin/dairy-pilot')
    : null;
  const configured = draftsResponse?.ok
    ? z
        .object({
          id: z.uuid(),
          title: z.string(),
          status: z.string(),
          notice: z.string(),
        })
        .nullable()
        .parse(await draftsResponse.json())
    : null;
  const drafts = configured ? [configured] : [];
  return (
    <>
      <Link href="/dairy">Dairy dashboard</Link>
      <h1>Dairy assessment and feedback</h1>
      <p className="notice">
        DRAFT — REQUIRES DOMAIN EXPERT VALIDATION. No certification, pass mark
        or readiness threshold is active.
      </p>
      {query.status && (
        <p role="status">
          {(
            {
              prepared:
                'Demo draft prepared (or already exists). Inspect it before explicit release.',
              released: 'Released for DEMO practice only.',
              assigned: 'Assessor assignment saved.',
            } as Record<string, string>
          )[query.status] ??
            'Action was not completed. Check authorization and input.'}
        </p>
      )}
      {has('assessment:author') && (
        <section>
          <h2>Owner pilot preparation</h2>
          <p>
            Create the version-bound dairy draft from the existing Phase 3C
            template. This does not approve professional content.
          </p>
          <form action={preparePilot}>
            <button>Prepare dairy demo draft</button>
          </form>
          {drafts.map((a) => (
            <article key={a.id}>
              <h3>{a.title}</h3>
              <p>{a.status}</p>
              <p className="notice">{a.notice}</p>
              <p>
                <Link href={`/dairy/review/blueprint?id=${a.id}`}>
                  Inspect draft blueprint and mappings
                </Link>
              </p>
              {a.status === 'DRAFT' && (
                <form action={releasePilot}>
                  <input name="assessmentId" type="hidden" value={a.id} />
                  <button>Release for demo practice</button>
                </form>
              )}
            </article>
          ))}
        </section>
      )}
      <section>
        <h2>
          {has('assessment:assign')
            ? 'Submitted dairy cases'
            : 'My assigned dairy cases'}
        </h2>
        {queue.attempts.length ? (
          queue.attempts.map((a) => (
            <article key={a.id}>
              <h3>{a.title}</h3>
              <p>{a.status}</p>
              <Link href={`/dairy/review?attempt=${a.id}`}>
                Inspect submission and review
              </Link>
              {has('assessment:assign') && a.status === 'SUBMITTED' && (
                <form action={assignPilot}>
                  <input type="hidden" name="attemptId" value={a.id} />
                  <label>
                    Active assessor
                    <select
                      name="assessorId"
                      required
                      defaultValue={a.assigned_assessor_id ?? ''}
                    >
                      <option value="" disabled>
                        Select assessor
                      </option>
                      {queue.assessors.map((u) => (
                        <option key={u.id} value={u.id}>
                          Assessor reference {u.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button>Assign assessor</button>
                </form>
              )}
            </article>
          ))
        ) : (
          <p>No submitted cases available.</p>
        )}
      </section>
      {selected.success && !d && (
        <p role="alert">
          Submission unavailable or not assigned to you. No candidate data was
          loaded.
        </p>
      )}
      {d && (
        <>
          <h2>Submission: {d.title}</h2>
          <p>
            Status: {d.status}. Case/rubric version reference:{' '}
            {d.caseBlueprint?.assessment_version_id ??
              'See assessment version in provenance'}
            .
          </p>
          <p>{d.caseBlueprint?.scenario}</p>
          <section>
            <h3>Evidence provenance</h3>
            <p>Attempt: {d.id}</p>
            {d.evidence.map((e) => (
              <p key={e.id}>
                {e.id} · {e.facet} · {e.status} · {e.demo ? 'DEMO' : ''}
              </p>
            ))}
          </section>
          <DairyReviewForm key={d.id} attempt={d} />
          <section>
            <h3>Finalized feedback history</h3>
            {d.feedback.map((f) => (
              <article key={f.id}>
                <p>
                  {f.created_at} · assessor {f.assessor_id} · review {f.id}
                </p>
                <p>{f.decision.replaceAll('_', ' ')}</p>
                <p>{f.feedback}</p>
              </article>
            ))}
          </section>
        </>
      )}
    </>
  );
}
