import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { api } from '../../lib/session';
import { PILOT_NOTICE } from '@vetready/contracts';
import {
  pilotJobsSchema,
  pilotApplicationsSchema,
} from '../../lib/recruitment';
import { applyToPilot, candidatePilotAction } from './actions';
export const dynamic = 'force-dynamic';
export default async function Opportunities({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  let jobs, applications;
  try {
    const [j, a] = await Promise.all([
      api('/pilot/opportunities'),
      api('/pilot/candidates/me/applications'),
    ]);
    if (!j?.ok || !a?.ok)
      return (
        <p>
          Sign in and complete your candidate profile to view the private
          technical pilot.
        </p>
      );
    jobs = pilotJobsSchema.parse(await j.json());
    applications = pilotApplicationsSchema.parse(await a.json());
  } catch {
    return (
      <p role="alert">
        Pilot temporarily unavailable. Please retry when connected.
      </p>
    );
  }
  const status = (await searchParams).status;
  return (
    <>
      <Link href="/dashboard">My profile</Link>
      <h1>Controlled opportunity pilot</h1>
      <p className="notice">{PILOT_NOTICE}</p>
      {status && (
        <p role="status">
          {status === 'saved'
            ? 'Request saved.'
            : 'Request not saved. Check current terms, consent and connection before retrying.'}
        </p>
      )}
      <p>
        No public candidate search or automatic hiring/rejection is available.
      </p>
      {!jobs.jobs.length && <p>No published pilot opportunity.</p>}
      {jobs.jobs.map((j) => (
        <section key={j.id}>
          <h2>{j.content.title}</h2>
          <p>Recipient organisation: {j.organizationName}</p>
          <p>{j.content.description}</p>
          <p>
            Version {j.version}. Professional requirements and weighted fit
            remain UNCONFIGURED.
          </p>
          <ul>
            {j.content.requirements.map((r) => (
              <li key={r.id}>
                {r.mandatory ? 'Mandatory' : 'Preferred'}:{' '}
                {r.kind === 'PATHWAY_INTEREST'
                  ? 'Declared pathway interest'
                  : r.kind === 'LOCATION_DECLARATION'
                    ? `Declared location ${r.state}; relocation ${r.acceptRelocation ? 'accepted' : 'not accepted'}`
                    : `${r.facet.replaceAll('_', ' ')} — REQUIRES DOMAIN EXPERT VALIDATION. No professional gate can pass.`}
              </li>
            ))}
          </ul>
          <form action={applyToPilot}>
            <input type="hidden" name="commandId" value={randomUUID()} />
            <input type="hidden" name="jobId" value={j.id} />
            <input type="hidden" name="versionId" value={j.versionId} />
            <p>
              This saves a new private snapshot and shares only the job-required
              interest/location declarations and selected competency categories
              with this organisation for this application. Your name, contact
              details, documents, reviewer identities and private notes are
              excluded. A previously viewed copy cannot be recalled.
            </p>
            <label>
              <input type="checkbox" name="consent" required />I authorize this
              job-specific share under pilot-share-1.
            </label>
            <button>Save snapshot, apply and share</button>
          </form>
        </section>
      ))}
      <h2>My applications and access</h2>
      {applications.applications.map((a) => (
        <section key={a.id}>
          <h3>{a.title}</h3>
          <p>
            {a.status}; review stage {a.stage}; employer access{' '}
            {a.consent === 'GIVEN' ? 'authorized' : 'revoked'}.
          </p>
          <p>
            Access revocation blocks future reads. Withdrawal ends this
            application. Historical audit records remain private and immutable.
          </p>
          {a.status === 'ACTIVE' && (
            <>
              {a.consent === 'GIVEN' && (
                <form action={candidatePilotAction}>
                  <input type="hidden" name="commandId" value={randomUUID()} />
                  <input type="hidden" name="applicationId" value={a.id} />
                  <button name="action" value="revoke-access">
                    Revoke employer access
                  </button>
                </form>
              )}
              <form action={candidatePilotAction}>
                <input type="hidden" name="commandId" value={randomUUID()} />
                <input type="hidden" name="applicationId" value={a.id} />
                <button name="action" value="withdraw">
                  Withdraw application
                </button>
              </form>
            </>
          )}
        </section>
      ))}
      {applications.truncated && (
        <p>
          The first 50 applications are shown. No additional candidate
          information is disclosed.
        </p>
      )}
      <p>
        To refresh changed facts or terms, withdraw and explicitly apply with a
        new snapshot.
      </p>
    </>
  );
}
