import Link from 'next/link';
import { z } from 'zod';
import { developmentDetailSchema } from '@vetready/contracts';
import { api } from '../../../../lib/session';
import { startWorkflowLearning } from '../actions';
import { startAssessment } from '../../actions';
export const dynamic = 'force-dynamic';
export default async function Plan({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const query = await searchParams;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return <p>Plan unavailable.</p>;
  let r: Response | null = null;
  try {
    r = await api(`/candidates/me/development-workflows/${id}`);
  } catch {
    /* Safe retry. */
  }
  if (!r?.ok)
    return (
      <>
        <h1>Private plan unavailable</h1>
        <Link href="/development/next-steps">Return to my next steps</Link>
      </>
    );
  const p = developmentDetailSchema.parse(await r.json());
  return (
    <>
      <Link href="/development/next-steps">My next steps</Link>
      <h1>My development plan</h1>
      <p className="notice">{p.notice}</p>
      <p>
        Original plan saved{' '}
        {new Date(p.createdAt).toLocaleDateString('en-NG', {
          timeZone: 'Africa/Lagos',
        })}
        . Order follows competency codes, not professional priority. Learning is
        recommended demo practice; mandatory requirements are not configured.
      </p>
      {query.status && (
        <p role="status">
          {query.status === 'started'
            ? 'Enrollment confirmed. Open or resume learning below.'
            : 'Enrollment was not confirmed. Check your connection and retry; no completion has been assumed.'}
        </p>
      )}
      {p.currentStatus !== 'AVAILABLE' && (
        <p role="status">
          This pathway is no longer available for new learning. Historical
          information is retained.
        </p>
      )}
      <p>
        <Link href={`/competencies?pathway=${p.pathwayVersionId}`}>
          Review current competency evidence
        </Link>{' '}
        ·{' '}
        <Link href="/development/next-steps">
          Save a new plan from current information
        </Link>
      </p>
      {p.items.map((item) => {
        const current = p.currentItems.find(
          (c) => c.childVersionId === item.childVersionId,
        );
        return (
          <section key={item.childVersionId}>
            <h2>
              {item.order}. {item.code.replaceAll('_', ' ')}
            </h2>
            <p>{item.statement}</p>
            <p>
              Why included: this competency belongs to the selected pathway and
              its professional requirements are unconfigured.
            </p>
            <p>
              Evidence at creation:{' '}
              {item.evidenceState === 'UNKNOWN'
                ? 'Unknown; no current effective evidence'
                : 'Evidence recorded; this is not professional qualification'}
              . Current evidence:{' '}
              {current?.evidenceState === 'PRESENT'
                ? 'recorded'
                : 'unknown or unavailable'}
              .
            </p>
            <p>
              Proposed facets still needing appropriate evidence:{' '}
              {current?.unverifiedFacets.join(', ').replaceAll('_', ' ') ||
                'Review separately; professional determination remains unavailable'}
              .
            </p>
            {item.recommendations.length === 0 ? (
              <p>
                No governed learning activity is currently available for this
                gap. The gap is retained; discuss appropriate follow-up with an
                authorized reviewer.
              </p>
            ) : (
              <ul>
                {[
                  ...new Set(
                    item.recommendations.map((m) => m.courseVersionId),
                  ),
                ].map((courseId) => {
                  const c = p.courses.find((c) => c.id === courseId)!;
                  const followUps =
                    p.competencyFollowUps.find(
                      (f) =>
                        f.childVersionId === item.childVersionId &&
                        f.courseVersionId === courseId,
                    )?.followUps ?? [];
                  return (
                    <li key={courseId}>
                      <h3>{c.title}</h3>
                      <p>
                        Recommended demonstration practice ·{' '}
                        {c.progress.completedLessons}/{c.progress.totalLessons}{' '}
                        lessons completed ·{' '}
                        {c.progress.state.replaceAll('_', ' ')}
                      </p>
                      {!c.available ? (
                        <p>
                          Retired or unavailable for new learning. Historical
                          progress is retained.
                        </p>
                      ) : !c.enrollmentId ? (
                        <form action={startWorkflowLearning}>
                          <input type="hidden" name="plan" value={p.id} />
                          <input type="hidden" name="course" value={c.id} />
                          <button>
                            Confirm enrollment in this demo learning
                          </button>
                        </form>
                      ) : null}
                      {c.href && (
                        <p>
                          <Link href={c.href}>Open or resume learning</Link>
                        </p>
                      )}
                      {c.progress.state === 'LEARNING_COMPLETED' && (
                        <>
                          <p>
                            Learning completed; the competency gap has not been
                            automatically resolved. Separate assessment or
                            verification is required.
                          </p>
                          {followUps.length && c.available ? (
                            followUps.map((a) => (
                              <form key={a.id} action={startAssessment}>
                                <input
                                  type="hidden"
                                  name="assessmentId"
                                  value={a.id}
                                />
                                <button>
                                  Start or resume{' '}
                                  {a.demo
                                    ? 'competency-specific demo case follow-up'
                                    : 'competency-specific assessment follow-up'}
                                  : {a.title}
                                </button>
                              </form>
                            ))
                          ) : (
                            <p>
                              No competency-specific reassessment is currently
                              mapped and available. Further verification is
                              required.
                              {c.courseLevelFollowUps.length > 0 &&
                                ' See the separate course-level follow-up section.'}
                            </p>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      {p.courses.some((c) => c.courseLevelFollowUps.length > 0) && (
        <section aria-label="Course-level follow-up">
          <h2>Course-level follow-up</h2>
          <p>
            These activities are explicitly mapped to the whole course, not to
            individual competency gaps. Completion does not verify competency or
            resolve gaps.
          </p>
          {p.courses
            .filter((c) => c.courseLevelFollowUps.length > 0)
            .map((c) => (
              <article key={c.id}>
                <h3>{c.title}</h3>
                {!c.available ? (
                  <p>Course follow-up is unavailable for new activity.</p>
                ) : c.progress.state !== 'LEARNING_COMPLETED' ? (
                  <p>
                    Complete the course learning before starting a course-level
                    follow-up.
                  </p>
                ) : (
                  c.courseLevelFollowUps.map((a) => (
                    <form key={a.id} action={startAssessment}>
                      <input type="hidden" name="assessmentId" value={a.id} />
                      <button>
                        Start or resume course-level{' '}
                        {a.demo
                          ? 'demo case follow-up'
                          : 'assessment follow-up'}
                        : {a.title}
                      </button>
                    </form>
                  ))
                )}
              </article>
            ))}
        </section>
      )}
    </>
  );
}
