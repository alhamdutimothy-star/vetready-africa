import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { api } from '../../../../lib/session';
import {
  verificationCriterionSchema,
  verificationProjectionSchema,
} from '@vetready/contracts';
import { recordVerificationEvent } from '../../actions';
export const dynamic = 'force-dynamic';
export default async function Review({
  params,
  searchParams,
}: {
  params: Promise<{ role: string; id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const p = z
    .object({ role: z.enum(['owner', 'assessor', 'admin']), id: z.uuid() })
    .safeParse(await params);
  if (!p.success) return <p>Private case unavailable.</p>;
  const { role, id } = p.data,
    query = await searchParams;
  let r: Response | null;
  try {
    r = await api(
      role === 'owner'
        ? `/candidates/me/verifications/${id}`
        : `/${role}/verifications/${id}`,
    );
  } catch {
    return <p>Private case unavailable. Retry when connected.</p>;
  }
  if (!r?.ok) return <p>Private case unavailable.</p>;
  const d = z
    .object({
      id: z.uuid(),
      revision: z.number(),
      criteria: z.array(verificationCriterionSchema).optional(),
      activity: z.string().optional(),
      evidence: z.object({ id: z.uuid(), summary: z.string() }).optional(),
      result: verificationProjectionSchema.nullable().optional(),
      history: z.array(
        z.object({
          id: z.uuid(),
          kind: z.string(),
          revision: z.number(),
          outcome: z.string().nullable(),
          candidateExplanation: z.string().optional(),
          evidenceLevelBefore: z.string().optional(),
          evidenceLevelAfter: z.string().optional(),
        }),
      ),
    })
    .parse(await r.json());
  const last = d.history.filter((e) => e.kind === 'DECISION').at(-1);
  const hidden = (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="commandId" value={randomUUID()} />
      <input type="hidden" name="expectedRevision" value={d.revision} />
    </>
  );
  return (
    <>
      <Link href="/verifications">My verification</Link>
      <h1>Private verification case</h1>
      {role === 'owner' && (
        <p>
          Current effective result:{' '}
          {d.result?.verified
            ? 'Verified evidence'
            : d.result?.outcome === 'VERIFIED'
              ? 'Verification is not currently effective; governance or moderation remains outstanding'
              : (d.result?.outcome ?? 'Pending review or superseded lineage')}
          . Recorded history below does not itself establish current
          verification.
        </p>
      )}
      <p>
        Revision {d.revision}. No automatic readiness, certification or
        licensing award.
      </p>
      {query.status && (
        <p role="status">
          {query.status === 'saved'
            ? 'Record saved.'
            : 'Save was not confirmed. Reload before retrying a stale review.'}
        </p>
      )}
      {d.evidence && (
        <>
          <h2>Submitted account</h2>
          <p>{d.activity}</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{d.evidence.summary}</p>
        </>
      )}
      <h2>History</h2>
      {d.history.map((e) => (
        <p key={e.id}>
          Revision {e.revision}: {e.kind} {e.outcome} {e.candidateExplanation}
          {e.evidenceLevelBefore && (
            <>
              {' '}
              Evidence: {e.evidenceLevelBefore} → {e.evidenceLevelAfter}
            </>
          )}
        </p>
      ))}
      {role === 'admin' ? (
        <form action={recordVerificationEvent}>
          {hidden}
          <label>
            Authorised assessor account ID
            <input name="assessorId" required />
          </label>
          <label>
            Assignment/reassignment reason
            <textarea name="reason" minLength={10} maxLength={500} required />
          </label>
          <button>Assign assessor</button>
        </form>
      ) : role === 'owner' ? (
        <form action={recordVerificationEvent}>
          {hidden}
          <input
            type="hidden"
            name="kind"
            value={last ? 'APPEAL' : 'WITHDRAW'}
          />
          <label>
            Reason
            <textarea name="reason" minLength={10} maxLength={500} required />
          </label>
          <button>
            {last ? 'Request appeal review' : 'Withdraw submission'}
          </button>
        </form>
      ) : (
        <>
          <form action={recordVerificationEvent}>
            {hidden}
            <input type="hidden" name="kind" value="START_REVIEW" />
            <button>Start review</button>
          </form>
          <form action={recordVerificationEvent}>
            {hidden}
            <input type="hidden" name="kind" value="RECUSE" />
            <label>
              General conflict category
              <input name="category" maxLength={100} required />
            </label>
            <label>
              Conflict reason
              <textarea name="reason" minLength={10} maxLength={500} required />
            </label>
            <button>Declare conflict and recuse</button>
          </form>
          <h2>Structured findings</h2>
          <p>
            Start the review first. A declared conflict blocks decisions until
            reassignment. No professional criteria are supplied by this
            interface.
          </p>
          <form action={recordVerificationEvent}>
            {hidden}
            <input type="hidden" name="kind" value="DECISION" />
            <input
              type="hidden"
              name="criteria"
              value={JSON.stringify(
                d.criteria?.map((c) => ({ id: c.id, version: c.version })) ??
                  [],
              )}
            />
            <input type="hidden" name="evidenceId" value={d.evidence?.id} />
            <input
              type="hidden"
              name="supersedesDecisionId"
              value={last?.id ?? ''}
            />
            {d.criteria?.map((c, n) => (
              <fieldset key={c.id}>
                <legend>
                  {c.criterion} · version {c.version}
                </legend>
                <p>{c.evidenceRequirement}</p>
                <label>
                  Observation
                  <textarea
                    name={`observation-${n}`}
                    minLength={10}
                    maxLength={2000}
                    required
                  />
                </label>
                <label>
                  Finding
                  <select name={`outcome-${n}`}>
                    <option>MISSING</option>
                    <option>PARTIAL</option>
                    <option>NOT_DEMONSTRATED</option>
                    <option>DEMONSTRATED</option>
                  </select>
                </label>
                <label>
                  Rationale
                  <textarea
                    name={`rationale-${n}`}
                    minLength={10}
                    maxLength={2000}
                    required
                  />
                </label>
              </fieldset>
            ))}
            <label>
              Review type
              <select name="reviewKind">
                <option>PRIMARY</option>
                <option>MODERATION</option>
              </select>
            </label>
            <label>
              Decision
              <select name="outcome">
                <option>MORE_EVIDENCE_REQUIRED</option>
                <option>PARTIALLY_DEMONSTRATED</option>
                <option>NOT_DEMONSTRATED</option>
                <option>VERIFIED</option>
                <option>INVALIDATED</option>
              </select>
            </label>
            <label>
              Private review rationale
              <textarea
                name="rationale"
                minLength={10}
                maxLength={2000}
                required
              />
            </label>
            <label>
              Explanation for the candidate
              <textarea
                name="candidateExplanation"
                minLength={10}
                maxLength={2000}
                required
              />
            </label>
            <label>
              <input
                type="checkbox"
                name="conflictDeclaredClear"
                value="true"
                required
              />
              I have no conflict for this review.
            </label>
            <button>Record decision</button>
          </form>
        </>
      )}
      <p>
        After an uncertain save, reload and check history before sending another
        action. Unsaved text is not stored offline.
      </p>
    </>
  );
}
