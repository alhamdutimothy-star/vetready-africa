import Link from 'next/link';
import { z } from 'zod';
import { api } from '../../lib/session';
import { pathwaySchema, attemptSchema } from '../../lib/assessment';
import {
  createAssessment,
  createItem,
  releaseDemo,
  retireAssessment,
  assignAttempt,
  reviewAttempt,
  reviewEvidence,
  moderateReview,
  resolveAppeal,
} from './actions';
export const dynamic = 'force-dynamic';
const draftsSchema = z.array(
  z.object({
    id: z.uuid(),
    title: z.string(),
    version: z.number(),
    status: z.string(),
    pathway_version_id: z.uuid(),
  }),
);
const queueSchema = z.array(
  z.object({
    id: z.uuid(),
    title: z.string(),
    status: z.string(),
    assigned_assessor_id: z.uuid().nullable(),
  }),
);
export default async function Workspace({
  searchParams,
}: {
  searchParams: Promise<{
    attempt?: string;
    pathway?: string;
    child?: string;
    status?: string;
  }>;
}) {
  const query = await searchParams;
  const me = await api('/me');
  if (!me || !me.ok) return <Link href="/auth/login">Sign in to continue</Link>;
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
  const author = has('assessment:author'),
    assign = has('assessment:assign'),
    assessor = has('assessment:review'),
    moderator = has('assessment:moderate');
  if (!author && !assign && !assessor && !moderator)
    return (
      <section>
        <h1>Assessment workspace</h1>
        <p>This workspace requires an assigned staff role.</p>
        <Link href="/dashboard">Return to dashboard</Link>
      </section>
    );
  const [pathsRes, draftRes, queueRes, appealsRes] = await Promise.all([
    api('/pathways'),
    author ? api('/admin/assessments') : null,
    assign
      ? api('/admin/assessment-attempts')
      : assessor
        ? api('/assessor/attempts')
        : null,
    moderator ? api('/admin/assessment-appeals') : null,
  ]);
  const paths = pathsRes?.ok ? pathwaySchema.parse(await pathsRes.json()) : [];
  const drafts = draftRes?.ok ? draftsSchema.parse(await draftRes.json()) : [];
  const queue = queueRes?.ok ? queueSchema.parse(await queueRes.json()) : [];
  const selected = z.uuid().safeParse(query.attempt);
  const attemptRes =
    assessor && selected.success
      ? await api(`/assessor/attempts/${selected.data}`)
      : null;
  const attempt = attemptRes?.ok
    ? attemptSchema.parse(await attemptRes.json())
    : null;
  const path = z.uuid().safeParse(query.pathway);
  const hierarchyRes =
    author && path.success
      ? await api(`/pathways/${path.data}/hierarchy`)
      : null;
  const hierarchy = hierarchyRes?.ok
    ? z
        .array(
          z.object({
            child_version_id: z.uuid(),
            group_version_id: z.uuid(),
            child_code: z.string(),
            group_code: z.string(),
            statement: z.string(),
            criteria: z.array(
              z.object({ id: z.uuid(), statement: z.string() }),
            ),
          }),
        )
        .parse(await hierarchyRes.json())
    : [];
  const child = hierarchy.find((h) => h.child_version_id === query.child);
  const appeals = appealsRes?.ok
    ? z
        .array(
          z.object({
            id: z.uuid(),
            reason: z.string(),
            resolved_at: z.string().nullable(),
            resolution: z.string().nullable(),
          }),
        )
        .parse(await appealsRes.json())
    : [];
  return (
    <>
      <Link href="/dashboard">Dashboard</Link>
      <h1>Assessment workspace</h1>
      <p className="notice">PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION</p>
      <p>
        Content release is limited to demonstration practice. Production
        approval and observed field verification require the professional
        validation milestone.
      </p>
      {query.status && (
        <p role="status">
          {query.status === 'saved'
            ? 'Saved.'
            : 'Action was not completed. Check permissions, mappings, review status and input.'}
        </p>
      )}
      {author && (
        <>
          <section>
            <h2>Create an assessment draft</h2>
            <form action={createAssessment}>
              <label>
                Code
                <input name="code" pattern="[A-Z][A-Z0-9_]{2,79}" required />
              </label>
              <label>
                Title
                <input name="title" minLength={3} maxLength={200} required />
              </label>
              <label>
                Pathway version
                <select name="pathwayVersionId">
                  {paths.map((p) => (
                    <option key={p.version_id} value={p.version_id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input type="checkbox" name="randomize" defaultChecked />
                Randomize task order
              </label>
              <button>Create demo draft</button>
            </form>
          </section>
          <section>
            <h2>Assessment versions</h2>
            {drafts.map((d) => (
              <article key={d.id}>
                <h3>
                  {d.title} · version {d.version}
                </h3>
                <p>{d.status}</p>
                {d.status === 'DRAFT' && (
                  <form action={releaseDemo}>
                    <input type="hidden" name="assessmentId" value={d.id} />
                    <button>Release for demo practice</button>
                  </form>
                )}
                {d.status !== 'RETIRED' && (
                  <form action={retireAssessment}>
                    <input type="hidden" name="assessmentId" value={d.id} />
                    <button>Retire this version</button>
                  </form>
                )}
              </article>
            ))}
          </section>
          <section>
            <h2>Map a case or written task</h2>
            <form method="get">
              <label>
                Pathway
                <select
                  name="pathway"
                  defaultValue={path.success ? path.data : ''}
                >
                  <option value="" disabled>
                    Select
                  </option>
                  {paths.map((p) => (
                    <option key={p.version_id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button>Browse child competencies</button>
            </form>
            <details>
              <summary>Proposed child competencies</summary>
              {hierarchy.map((h) => (
                <p key={`${h.child_version_id}-${h.group_version_id}`}>
                  <Link
                    href={`/assessment-workspace?pathway=${path.success ? path.data : ''}&child=${h.child_version_id}`}
                  >
                    {h.child_code.replaceAll('_', ' ')}
                  </Link>{' '}
                  · {h.group_code.replaceAll('_', ' ')}
                </p>
              ))}
            </details>
            {child && (
              <>
                <h3>{child.statement}</h3>
                <ul>
                  {child.criteria.map((c) => (
                    <li key={c.id}>{c.statement}</li>
                  ))}
                </ul>
                <form action={createItem}>
                  <input
                    type="hidden"
                    name="pathwayId"
                    value={path.success ? path.data : ''}
                  />
                  <input
                    type="hidden"
                    name="childVersionId"
                    value={child.child_version_id}
                  />
                  <input
                    type="hidden"
                    name="groupVersionId"
                    value={child.group_version_id}
                  />
                  <label>
                    Draft assessment
                    <select name="assessmentId" required>
                      {drafts
                        .filter(
                          (d) =>
                            d.status === 'DRAFT' &&
                            paths.some(
                              (p) =>
                                p.id === (path.success ? path.data : '') &&
                                p.version_id === d.pathway_version_id,
                            ),
                        )
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.title} v{d.version}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Item code
                    <input
                      name="code"
                      required
                      pattern="[A-Z][A-Z0-9_]{2,79}"
                    />
                  </label>
                  <label>
                    Item version
                    <input
                      name="version"
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={1}
                      required
                    />
                  </label>
                  <label>
                    Task type
                    <select name="type">
                      {[
                        'CASE',
                        'DATA_INTERPRETATION',
                        'CLINICAL_SCENARIO',
                        'FARM_SCENARIO',
                        'SHORT_TEXT',
                        'EXTENDED_TEXT',
                        'REPORT',
                        'TECHNICAL_SALES',
                        'PRACTICAL_PLACEHOLDER',
                      ].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Proposed evidence method
                    <select name="method">
                      {[
                        'CASE',
                        'KNOWLEDGE',
                        'SIMULATION',
                        'PRACTICAL',
                        'WORKPLACE',
                      ].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Difficulty
                    <select name="difficulty">
                      {['INTRODUCTORY', 'INTERMEDIATE', 'ADVANCED'].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Prompt
                    <textarea
                      name="prompt"
                      required
                      minLength={10}
                      maxLength={12000}
                    />
                  </label>
                  <p>
                    All listed child criteria will form the rubric. Objective
                    item authoring is also supported through the documented API.
                  </p>
                  <button>Add mapped task and rubric</button>
                </form>
              </>
            )}
          </section>
        </>
      )}
      <section>
        <h2>{assign ? 'Submitted attempts' : 'Assigned attempts'}</h2>
        {queue.length ? (
          queue.map((a) => (
            <article key={a.id}>
              <h3>{a.title}</h3>
              <p>{a.status}</p>
              {assessor && (
                <Link href={`/assessment-workspace?attempt=${a.id}`}>
                  Open assigned review
                </Link>
              )}
              {assign && a.status === 'SUBMITTED' && (
                <form action={assignAttempt}>
                  <input type="hidden" name="attemptId" value={a.id} />
                  <label>
                    Assessor user ID
                    <input
                      name="assessorId"
                      required
                      defaultValue={a.assigned_assessor_id ?? ''}
                    />
                  </label>
                  <button>Assign active assessor</button>
                </form>
              )}
            </article>
          ))
        ) : (
          <p>No available attempts.</p>
        )}
      </section>
      {attempt?.pilot && (
        <p>
          <Link href={`/dairy/review?attempt=${attempt.id}`}>
            Open the dairy review workflow to save drafts and finalize feedback
          </Link>
        </p>
      )}
      {attempt && !attempt.pilot && (
        <section>
          <h2>Review: {attempt.title}</h2>
          <p className="notice">{attempt.notice}</p>
          <form action={reviewAttempt}>
            <input type="hidden" name="attemptId" value={attempt.id} />
            {attempt.items.map((i) => (
              <article key={i.id}>
                <h3>{i.child_code.replaceAll('_', ' ')}</h3>
                <p>{i.prompt}</p>
                <pre style={{ whiteSpace: 'pre-wrap' }}>
                  {i.response?.text ?? JSON.stringify(i.response)}
                </pre>
                {i.rubric.map((c) => (
                  <fieldset
                    key={c.id}
                    disabled={attempt.status !== 'SUBMITTED'}
                  >
                    <legend>{c.description}</legend>
                    <input type="hidden" name="criterionId" value={c.id} />
                    <label>
                      Observation
                      <select name={`observation_${c.id}`}>
                        <option>UNASSESSABLE</option>
                        <option>NEEDS_DEVELOPMENT</option>
                        <option>DEMONSTRATED</option>
                      </select>
                    </label>
                    <label>
                      Criterion feedback
                      <textarea
                        name={`comment_${c.id}`}
                        minLength={3}
                        maxLength={2000}
                        required
                      />
                    </label>
                  </fieldset>
                ))}
              </article>
            ))}
            <label>
              Overall feedback
              <textarea
                name="feedback"
                minLength={10}
                maxLength={6000}
                required
              />
            </label>
            <button disabled={attempt.status !== 'SUBMITTED'}>
              Record criterion observations
            </button>
          </form>
          {attempt.evidence.map((e) => (
            <article key={e.id}>
              <p>
                {e.facet} · {e.status} · {e.observation}
              </p>
              <form action={reviewEvidence}>
                <input type="hidden" name="evidenceId" value={e.id} />
                <label>
                  Evidence decision
                  <select name="outcome">
                    <option>REJECTED</option>
                    <option>REVOKED</option>
                    {!e.demo && <option>VERIFIED</option>}
                  </select>
                </label>
                <label>
                  Reason
                  <textarea
                    name="reason"
                    minLength={10}
                    maxLength={3000}
                    required
                  />
                </label>
                <button>Submit evidence decision</button>
              </form>
            </article>
          ))}
        </section>
      )}
      {moderator && (
        <>
          <section>
            <h2>Independent moderation</h2>
            <form action={moderateReview}>
              <label>
                Review ID
                <input name="reviewId" required />
              </label>
              <label>
                Outcome
                <select name="outcome">
                  <option>CONFIRMED</option>
                  <option>RETURNED</option>
                </select>
              </label>
              <label>
                Reason
                <textarea
                  name="reason"
                  minLength={10}
                  maxLength={3000}
                  required
                />
              </label>
              <button>Record moderation</button>
            </form>
          </section>
          <section>
            <h2>Assessment appeals</h2>
            {appeals.map((a) => (
              <article key={a.id}>
                <p>{a.reason}</p>
                {a.resolved_at ? (
                  <p>{a.resolution}</p>
                ) : (
                  <form action={resolveAppeal}>
                    <input type="hidden" name="appealId" value={a.id} />
                    <label>
                      Independent resolution
                      <textarea
                        name="resolution"
                        minLength={10}
                        maxLength={3000}
                        required
                      />
                    </label>
                    <button>Record resolution</button>
                  </form>
                )}
              </article>
            ))}
          </section>
        </>
      )}
    </>
  );
}
