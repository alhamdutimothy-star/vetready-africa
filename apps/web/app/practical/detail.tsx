import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { api } from '../../lib/session';
import {
  practicalDetailSchema,
  practicalOptionsSchema,
  practicalGapsSchema,
} from '../../lib/practical';
import { PracticalDraft } from './draft';
import { practicalCommand } from './actions';
const labels: Record<string, string> = {
  EXPERT_REQUIREMENTS_NOT_CONFIGURED:
    'Professional requirements await expert configuration',
  MISSING_EVIDENCE: 'No evidence recorded',
  INSUFFICIENT_VERIFICATION_LEVEL:
    'Evidence does not establish this verification facet',
  PENDING_REVIEW: 'Submitted evidence awaits a final review',
  DRAFT_NOT_SUBMITTED: 'Draft has not been submitted',
  SUPERSEDED_EVIDENCE: 'Earlier evidence was replaced; inspect its successor',
  REVOKED_EVIDENCE: 'Evidence has been revoked',
  WITHDRAWN_EVIDENCE: 'Evidence was withdrawn',
  REVISION_REQUESTED: 'Assessor requested a revision',
  REJECTED_EVIDENCE: 'Evidence was rejected',
  EXPIRED_EVIDENCE: 'Recorded validity has expired',
};
export async function PracticalDetail({
  id,
  role,
  status,
}: {
  id: string;
  role: 'owner' | 'review' | 'admin';
  status?: string;
}) {
  let d, options;
  try {
    const prefix =
      role === 'owner'
        ? 'candidates/me'
        : role === 'review'
          ? 'assessor'
          : 'admin';
    const r = await api(`/${prefix}/practical/${id}`);
    if (!r?.ok)
      return <p role="alert">Private evidence unavailable for this account.</p>;
    d = practicalDetailSchema.parse(await r.json());
    const o =
      role === 'owner' ? await api('/candidates/me/practical/options') : null;
    options = o?.ok ? practicalOptionsSchema.parse(await o.json()) : [];
  } catch {
    return (
      <p role="alert">
        Private evidence unavailable. Please retry when connected.
      </p>
    );
  }
  const v = d.version;
  const fields = (command: string) => (
    <>
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="command" value={command} />
    </>
  );
  let gaps: null | ReturnType<typeof practicalGapsSchema.parse> = null;
  if (role === 'owner')
    try {
      const r = await api(
        `/candidates/me/practical/gaps/${v.pathway_version_id}`,
      );
      if (r?.ok) gaps = practicalGapsSchema.parse(await r.json());
    } catch {
      /* Evidence details still available. */
    }
  return (
    <>
      <Link href={role === 'owner' ? '/practical' : `/practical/${role}`}>
        Back to private evidence
      </Link>
      <h1>Practical evidence — version {v.version}</h1>
      <p className="notice">{d.notice}</p>
      <p>Status: {v.status}</p>
      {status && (
        <p role="status">
          {status === 'saved'
            ? 'Action recorded.'
            : 'Action was not completed. Check your entries, saved revision and connection.'}
        </p>
      )}
      {role === 'owner' && v.status === 'DRAFT' ? (
        <PracticalDraft
          id={v.id}
          revision={v.draft_revision}
          commandId={randomUUID()}
          summary={v.summary}
          task={v.context.task}
          targets={d.targets}
          options={options.filter(
            (o) => o.pathwayVersionId === v.pathway_version_id,
          )}
        />
      ) : (
        <>
          <h2>Activity account</h2>
          <p>{v.summary}</p>
          <p>{v.context.task}</p>
          <p>
            {d.targets.length} competency/facet mapping(s) preserved with this
            version.
          </p>
        </>
      )}
      {d.declaration && (
        <section>
          <h2>Candidate declaration</h2>
          <p>{d.declaration.declaration}</p>
          <p>Recorded {d.declaration.created_at}</p>
        </section>
      )}
      <section>
        <h2>Review decisions</h2>
        {!d.decisions.length && <p>No finalized decision recorded.</p>}
        {d.decisions.map((x) => (
          <article key={x.id}>
            <h3>{x.outcome.replaceAll('_', ' ')}</h3>
            <p>{x.rationale}</p>
            <p>
              {x.created_at}
              {x.supersedes_decision_id
                ? ' — explicitly corrects an earlier decision'
                : ''}
            </p>
          </article>
        ))}
      </section>
      {role === 'owner' &&
        ['DRAFT', 'SUBMITTED', 'RESUBMITTED'].includes(v.status) && (
          <form action={practicalCommand}>
            {fields('withdraw')}
            <label>
              Reason
              <input name="reason" required minLength={10} maxLength={500} />
            </label>
            <button>Withdraw this version</button>
          </form>
        )}
      {role === 'owner' &&
        [
          'WITHDRAWN',
          'SUBMITTED',
          'RESUBMITTED',
          'UNDER_REVIEW',
          'REVIEWED',
          'NEEDS_REVISION',
          'REJECTED',
          'REVOKED',
        ].includes(v.status) &&
        d.history.at(-1)?.id === id && (
          <form action={practicalCommand}>
            {fields('revisions')}
            <label>
              Correction or replacement reason
              <input name="reason" required minLength={10} maxLength={500} />
            </label>
            <button>Create successor draft</button>
          </form>
        )}
      {role === 'review' &&
        ['UNDER_REVIEW', 'REVIEWED', 'NEEDS_REVISION', 'REJECTED'].includes(
          v.status,
        ) && (
          <form action={practicalCommand}>
            {fields('decisions')}
            {d.decisions.length > 0 && (
              <input
                name="supersedes"
                type="hidden"
                value={d.decisions.at(-1)!.id}
              />
            )}
            <label>
              Demonstration decision
              <select name="outcome">
                <option value="NEEDS_REVISION">Needs revision</option>
                <option value="REJECTED">Rejected</option>
                <option value="DEMONSTRATED_IN_DEMO">
                  Demonstrated in demo — no competence award
                </option>
              </select>
            </label>
            <label>
              Reason and observations
              <textarea
                name="rationale"
                required
                minLength={10}
                maxLength={2000}
              />
            </label>
            <label>
              <input type="checkbox" name="conflict" required />I confirm I am
              independent of the candidate and have no conflict for this review.
            </label>
            <button>
              {d.decisions.length
                ? 'Finalize superseding decision'
                : 'Finalize immutable decision'}
            </button>
          </form>
        )}
      {role === 'admin' &&
        ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'].includes(v.status) && (
          <form action={practicalCommand}>
            {fields('assignments')}
            <label>
              Platform assessor user ID
              <input name="assessor" required />
            </label>
            <label>
              Assignment reason
              <input name="reason" required minLength={10} maxLength={500} />
            </label>
            <button>Assign private review</button>
          </form>
        )}
      {role === 'admin' &&
        !['DRAFT', 'WITHDRAWN', 'SUPERSEDED', 'REVOKED'].includes(v.status) && (
          <form action={practicalCommand}>
            {fields('revoke')}
            <label>
              Revocation reason
              <input name="reason" required minLength={10} maxLength={500} />
            </label>
            <button>Revoke this evidence version</button>
          </form>
        )}
      <section>
        <h2>Version history</h2>
        <ul>
          {d.history.map((h) => (
            <li key={h.id}>
              <Link
                href={
                  role === 'owner'
                    ? `/practical/${h.id}`
                    : `/practical/${role}/${h.id}`
                }
              >
                Version {h.version}: {h.status}
              </Link>
            </li>
          ))}
        </ul>
        <h2>Lifecycle history</h2>
        <ul>
          {d.events.map((e, i) => (
            <li key={i}>
              {e.from_status ?? 'Created'} → {e.to_status}: {e.reason} (
              {e.created_at})
            </li>
          ))}
        </ul>
      </section>
      {role === 'owner' && (
        <section>
          <h2>Explainable evidence gaps</h2>
          <p>
            These use existing proposed pathway facets. They are development
            guidance. No readiness threshold is configured.
          </p>
          {!gaps ? (
            <p>Gap explanations are temporarily unavailable.</p>
          ) : (
            <ul>
              {gaps.gaps.map((g, i) => (
                <li key={i}>
                  {options.find((o) => o.childVersionId === g.childVersionId)
                    ?.code ?? 'Competency'}{' '}
                  — {g.facet.replaceAll('_', ' ')}:{' '}
                  {g.reasons.map((r) => labels[r] ?? r).join('; ')}.{' '}
                  {g.evidenceIds.length} related evidence/source record(s).{' '}
                  {g.submissionVersionIds.map((s) => (
                    <Link key={s} href={`/practical/${s}`}>
                      {' '}
                      View source version{' '}
                    </Link>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
