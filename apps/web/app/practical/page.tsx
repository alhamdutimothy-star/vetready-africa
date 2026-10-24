import Link from 'next/link';
import { api } from '../../lib/session';
import {
  practicalListSchema,
  practicalOptionsSchema,
} from '../../lib/practical';
import { createPractical } from './actions';
export const dynamic = 'force-dynamic';
export default async function Practical({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  let data, options;
  try {
    const [r, o] = await Promise.all([
      api('/candidates/me/practical'),
      api('/candidates/me/practical/options'),
    ]);
    if (!r?.ok || !o?.ok)
      return (
        <p>
          Sign in with a candidate profile to view private practical evidence.{' '}
          <Link href="/auth/login">Sign in</Link>
        </p>
      );
    data = practicalListSchema.parse(await r.json());
    options = practicalOptionsSchema.parse(await o.json());
  } catch {
    return (
      <p role="alert">
        Practical evidence is unavailable. Please retry when connected.
      </p>
    );
  }
  const pathways = [...new Set(options.map((o) => o.pathwayVersionId))];
  return (
    <>
      <Link href="/dairy">Dairy workspace</Link>
      <h1>My practical evidence</h1>
      {status && (
        <p role="alert">
          The draft was not created. Check your candidate profile and
          connection, then retry.
        </p>
      )}
      <p className="notice">{data.notice}</p>
      <p>
        Describe only your own activity. Do not include client, farm or other
        confidential information. Text evidence only; file uploads are
        unavailable.
      </p>
      <form action={createPractical}>
        <label>
          Pathway version
          <select name="pathway">
            {pathways.map((p) => (
              <option key={p} value={p}>
                {options.find((o) => o.pathwayVersionId === p)?.pathwayName} —
                version{' '}
                {options.find((o) => o.pathwayVersionId === p)?.pathwayVersion}
              </option>
            ))}
          </select>
        </label>
        <label>
          Evidence source
          <select name="kind">
            <option value="SUPERVISED_TASK">Supervised task</option>
            <option value="WORKPLACE_RECORD">Workplace record</option>
            <option value="SIMULATION_RECORD">Simulation record</option>
            <option value="CANDIDATE_REPORT">Candidate report</option>
          </select>
        </label>
        <button>Create private draft</button>
      </form>
      <ul>
        {data.versions.map((v) => (
          <li key={v.id}>
            <Link href={`/practical/${v.id}`}>
              Version {v.version} — {v.status}
            </Link>
            <p>{v.summary || 'Empty draft'}</p>
          </li>
        ))}
      </ul>
      {data.truncated && <p>Showing the 100 most recent versions.</p>}
    </>
  );
}
