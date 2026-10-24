import Link from 'next/link';
import { api } from '../../lib/session';
import { practicalListSchema } from '../../lib/practical';
export async function PracticalQueue({ role }: { role: 'admin' | 'review' }) {
  let d;
  try {
    const r = await api(
      `/${role === 'admin' ? 'admin' : 'assessor'}/practical`,
    );
    if (!r?.ok)
      return <p>Private review workspace unavailable for this account.</p>;
    d = practicalListSchema.parse(await r.json());
  } catch {
    return (
      <p role="alert">Review workspace unavailable. Retry when connected.</p>
    );
  }
  return (
    <>
      <Link href="/dairy">Dairy workspace</Link>
      <h1>
        {role === 'admin'
          ? 'Practical review assignments'
          : 'My assigned practical reviews'}
      </h1>
      <p className="notice">{d.notice}</p>
      {role === 'admin' && <p>Administrative queue access is audited.</p>}
      <ul>
        {d.versions.map((v) => (
          <li key={v.id}>
            <Link href={`/practical/${role}/${v.id}`}>
              Version {v.version} — {v.status}
            </Link>
          </li>
        ))}
      </ul>
      {!d.versions.length && <p>No evidence available in this queue.</p>}
      {d.truncated && <p>Showing the 100 most recent versions.</p>}
    </>
  );
}
