import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { api } from '../../lib/session';
import { pilotGovernanceSchema } from '../../lib/recruitment';
import { governPilot } from '../opportunities/actions';
export const dynamic = 'force-dynamic';
export default async function Governance({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  let p;
  try {
    const r = await api('/pilot/admin/governance');
    if (!r?.ok)
      return <p>Independent platform administrator authority is required.</p>;
    p = pilotGovernanceSchema.parse(await r.json());
  } catch {
    return <p>Pilot governance temporarily unavailable.</p>;
  }
  return (
    <>
      <Link href="/dashboard">Dashboard</Link>
      <h1>Technical pilot governance</h1>
      <p>{p.notice}</p>
      {(await searchParams).status && (
        <p>
          Check the current state below. Unavailable or conflicting requests are
          not applied.
        </p>
      )}
      <p>
        Only one organisation may enter this pilot. Verification concerns
        employer identity, not veterinary authority or professional approval. An
        administrator cannot verify their own organisation.
      </p>
      {p.organizations.map((o) => (
        <section key={o.id}>
          <h2>{o.name}</h2>
          <p>{o.status}</p>
          <form action={governPilot}>
            <input type="hidden" name="commandId" value={randomUUID()} />
            <input type="hidden" name="organizationId" value={o.id} />
            <label>
              Review reason
              <input name="reason" required minLength={10} maxLength={500} />
            </label>
            <button name="status" value="VERIFIED">
              Record independent employer verification
            </button>
            <button name="status" value="SUSPENDED">
              Suspend pilot employer access
            </button>
          </form>
        </section>
      ))}
      <h2>Pilot member access</h2>
      {p.members.map((m) => (
        <form action={governPilot} key={m.organizationId + m.userId}>
          <p>
            {m.userId}: {m.status}
          </p>
          <input type="hidden" name="commandId" value={randomUUID()} />
          <input type="hidden" name="organizationId" value={m.organizationId} />
          <input type="hidden" name="userId" value={m.userId} />
          <label>
            Access review reason
            <input name="reason" required minLength={10} maxLength={500} />
          </label>
          <button name="status" value="REVOKED">
            Offboard pilot access
          </button>
          <button name="status" value="ACTIVE">
            Restore membership access
          </button>
        </form>
      ))}
      <p>
        Professional policies and weighted ranking remain unconfigured; this
        screen cannot approve them.
      </p>
    </>
  );
}
