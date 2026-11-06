import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { api } from '../../lib/session';
import { verificationProjectionSchema } from '@vetready/contracts';
import { submitVerification } from './actions';
export const dynamic = 'force-dynamic';
export default async function Verifications({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; command?: string }>;
}) {
  const query = await searchParams;
  let responses: (Response | null)[];
  try {
    responses = await Promise.all([
      api('/candidates/me/verifications/options'),
      api('/candidates/me/verifications'),
    ]);
  } catch {
    return (
      <p>Private verification unavailable. Check sign-in and connection.</p>
    );
  }
  if (responses.some((r) => !r?.ok))
    return <p>Save your candidate profile and sign in to use verification.</p>;
  const options = z
    .array(
      z.object({
        id: z.uuid(),
        childVersionId: z.uuid(),
        childCode: z.string(),
        statement: z.string(),
        method: z.string(),
        status: z.string(),
        demo: z.boolean(),
        version: z.number(),
      }),
    )
    .parse(await responses[0]!.json());
  const records = z
    .array(verificationProjectionSchema)
    .parse(await responses[1]!.json());
  const command = z.uuid().safeParse(query.command);
  return (
    <>
      <Link href="/development/next-steps">My development plans</Link>
      <h1>My competency verification</h1>
      <p>
        Learning completion is not verification. Submitted accounts remain
        claims until an independent, authorised review against approved
        governance. Job Ready, Field Ready, certification and licensing remain
        unconfigured.
      </p>
      <p>
        Do not include names, farm addresses, client records or confidential
        commercial details. Private uploads are not available.
      </p>
      {query.status && (
        <p role="alert">
          Submission was not confirmed. Check the form and connection. Reuse the
          request identifier when retrying.
        </p>
      )}
      {options.length === 0 ? (
        <p>
          No governed review rubric is available. Requires domain expert
          validation; no verification can be awarded.
        </p>
      ) : (
        <form action={submitVerification}>
          <input
            type="hidden"
            name="commandId"
            value={command.success ? command.data : randomUUID()}
          />
          <label>
            Exact competency/rubric version
            <select name="rubricVersionId" required>
              {options.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.childCode.replaceAll('_', ' ')}: {r.statement} · {r.method}{' '}
                  · v{r.version} · {r.demo ? 'demonstration only' : r.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Activity
            <input name="activity" maxLength={160} required />
          </label>
          <label>
            Performed at (UTC ISO timestamp)
            <input
              name="performedAt"
              placeholder="2026-11-05T09:00:00.000Z"
              required
            />
          </label>
          <label>
            General location type
            <input
              name="locationType"
              maxLength={100}
              placeholder="Supervised training facility"
              required
            />
          </label>
          <label>
            Verification process
            <select name="process">
              <option>IN_PERSON</option>
              <option>REMOTE_OBSERVATION</option>
              <option>DOCUMENT_REVIEW</option>
              <option>SIMULATION</option>
            </select>
          </label>
          <label>
            Evidence account
            <textarea name="summary" minLength={10} maxLength={4000} required />
          </label>
          <label>
            Previous case ID (reassessment only)
            <input name="previousCaseId" />
          </label>
          <label>
            <input type="checkbox" name="declaration" value="true" required />
            This is my own accurate account, contains no confidential
            third-party information, and submission is not verification.
          </label>
          <button>Submit for review</button>
        </form>
      )}
      <h2>Current evidence lineages</h2>
      {records.map((r) => (
        <p key={r.caseId}>
          <Link href={`/verifications/owner/${r.caseId}`}>
            {r.childVersionId}:{' '}
            {r.verified
              ? 'Verified evidence'
              : r.outcome === 'VERIFIED'
                ? 'Verification is not currently effective; governance or moderation remains outstanding'
                : (r.outcome ?? 'PENDING_REVIEW')}
          </Link>
        </p>
      ))}
      <p>
        <Link href="/verifications/queue/assessor">My assigned reviews</Link> ·{' '}
        <Link href="/verifications/queue/admin">Assignment administration</Link>
      </p>
    </>
  );
}
