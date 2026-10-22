import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { api } from '../../../../lib/session';
import { curriculumDetailSchema } from '../../../../lib/dairy-learning';
import { LearningActivity } from '../activity';
import { recordLearning, startLinkedCase } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Unit({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return <p>Invalid enrollment.</p>;
  let r: Response | null = null;
  try {
    r = await api(`/candidates/me/dairy-learning/${id}`);
  } catch {
    /* Safe unavailable state. */
  }
  if (!r || r.status === 401)
    return <Link href="/auth/login">Sign in to resume learning</Link>;
  if (!r.ok)
    return (
      <p>Enrollment unavailable. Check your profile, sign-in and connection.</p>
    );
  const d = curriculumDetailSchema.parse(await r.json());
  const { status } = await searchParams;
  const next = d.course.modules
    .flatMap((m) => m.lessons)
    .find((l) => l.state !== 'COMPLETED');
  return (
    <>
      <Link href="/dairy/learning">Dairy curriculum</Link>
      <h1>{d.course.title}</h1>
      <p className="notice">{d.course.notice}</p>
      <p>
        Exact course version {d.course.version}. Author reference:{' '}
        {d.curriculum.author_id}. Professional review: pending. No readiness
        claim.
      </p>
      <p>
        Suggested next learning:{' '}
        {next?.title ??
          'Review feedback and discuss separate supervised development with your assessor'}
        . This follows saved reading progress, not a professional readiness
        rule.
      </p>
      {status && (
        <p role="status">
          {status === 'saved'
            ? 'Learning position saved.'
            : 'Position not confirmed saved. Retry when connected; no progress has been claimed.'}
        </p>
      )}
      {d.course.modules.map((m) => (
        <section key={m.id}>
          <h2>{m.title}</h2>
          {m.lessons.map((l) => {
            const u = d.units.find((u) => u.lesson_version_id === l.id)!;
            const a = d.activities.find((a) => a.lesson_version_id === l.id);
            const links = d.course.assessments.filter(
              (a) => a.lesson_version_id === l.id,
            );
            return (
              <article key={l.id}>
                <h3>{l.title}</h3>
                <p>
                  {
                    d.curriculum.domains.find((x) => x.code === u.domain_code)
                      ?.title
                  }{' '}
                  • {l.state ?? 'NOT_STARTED'} • resume position{' '}
                  {l.resumePosition ?? 0}
                </p>
                <h4>Learning objectives</h4>
                <ul>
                  {u.content.objectives.map((o, i) => (
                    <li key={i}>
                      {o.stage}: {o.statement}
                    </li>
                  ))}
                </ul>
                {Object.entries(u.content.sections).map(([k, v]) => (
                  <section key={k}>
                    <h4>{k.replace(/([A-Z])/g, ' $1')}</h4>
                    <p>{v}</p>
                  </section>
                ))}
                <h4>Proposed prerequisite guidance</h4>
                {u.prerequisites.length ? (
                  u.prerequisites.map((p) => (
                    <p key={p.childVersionId}>
                      {d.competencies.find((c) => c.id === p.childVersionId)
                        ?.statement ?? p.childVersionId}
                      : {p.facet} — {p.status}. Guidance only; missing evidence
                      is unverified, not failed. No professional gate is active.
                    </p>
                  ))
                ) : (
                  <p>No prerequisite guidance supplied.</p>
                )}
                <h4>Mapped competency definition versions</h4>
                <ul>
                  {d.course.competencyMappings
                    .filter((x) => x.lesson_version_id === l.id)
                    .map((x, i) => (
                      <li key={i}>
                        {d.competencies.find((c) => c.id === x.child_version_id)
                          ?.statement ?? x.child_version_id}
                      </li>
                    ))}
                </ul>
                <h4>Separate supervised evidence still required</h4>
                <ul>
                  {u.content.practicalRequirements.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <details>
                  <summary>Sources and provenance</summary>
                  {u.content.sources.map((s, i) => (
                    <p key={i}>
                      {s.title} — {s.organization}; {s.publication}.{' '}
                      {s.year ?? 'Year not established'}. {s.notes} Review:{' '}
                      {s.reviewDate ?? 'not reviewed'}; superseded:{' '}
                      {s.superseded ? 'yes' : 'no'}.{' '}
                      {s.url && (
                        <a href={s.url} rel="noreferrer">
                          Reference lead
                        </a>
                      )}
                    </p>
                  ))}
                </details>
                {d.course.status === 'RETIRED' ? (
                  <p>
                    Historical learning response:{' '}
                    {a?.response ?? 'No activity saved'}. This content version
                    is retired; new learning writes are disabled.
                  </p>
                ) : (
                  <>
                    <LearningActivity
                      key={`${id}:${l.id}`}
                      enrollment={id}
                      lesson={l.id}
                      prompt={u.content.activity.prompt}
                      response={a?.response ?? ''}
                      revision={a?.revision ?? 0}
                      commandId={randomUUID()}
                    />
                    <form action={recordLearning}>
                      <input type="hidden" name="enrollment" value={id} />
                      <input type="hidden" name="lesson" value={l.id} />
                      <input
                        type="hidden"
                        name="revision"
                        value={l.revision ?? 0}
                      />
                      <label>
                        Resume character position (0–{l.body.length})
                        <input
                          type="number"
                          name="position"
                          min={0}
                          max={l.body.length}
                          defaultValue={l.resumePosition ?? 0}
                        />
                      </label>
                      <button name="state" value="IN_PROGRESS">
                        Save reading position
                      </button>
                      <button name="state" value="COMPLETED">
                        Record learning completed
                      </button>
                    </form>
                  </>
                )}
                {links.map((a) => (
                  <form key={a.assessment_version_id} action={startLinkedCase}>
                    <input
                      type="hidden"
                      name="assessment"
                      value={a.assessment_version_id}
                    />
                    <p>
                      Linked assessment version {a.assessment_version_id}. Case
                      submission and assessor review are separate from this
                      learning activity.
                    </p>
                    <button>Start / resume linked dairy case</button>
                  </form>
                ))}
                {!links.length && (
                  <p>
                    No approved or demo case is linked to this unit yet. Further
                    assessment development is required.
                  </p>
                )}
              </article>
            );
          })}
        </section>
      ))}
      <Link href="/dairy">View assessed evidence and development needs</Link>
    </>
  );
}
