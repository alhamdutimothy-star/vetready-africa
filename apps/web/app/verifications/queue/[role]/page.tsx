import Link from 'next/link';
import { z } from 'zod';
import { api } from '../../../../lib/session';
export const dynamic = 'force-dynamic';
export default async function Queue({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const p = z.enum(['assessor', 'admin']).safeParse((await params).role);
  if (!p.success) return <p>Queue unavailable.</p>;
  let r: Response | null;
  try {
    r = await api(`/${p.data}/verifications`);
  } catch {
    return <p>Private queue unavailable.</p>;
  }
  if (!r?.ok) return <p>Private queue unavailable.</p>;
  const rows = z
    .array(
      z.object({
        id: z.uuid(),
        childVersionId: z.uuid(),
        method: z.string(),
        revision: z.number(),
      }),
    )
    .parse(await r.json());
  return (
    <>
      <h1>
        {p.data === 'admin'
          ? 'Verification assignments'
          : 'My assigned reviews'}
      </h1>
      <p>Only case references are listed. No public candidate discovery.</p>
      {rows.map((v) => (
        <p key={v.id}>
          <Link href={`/verifications/${p.data}/${v.id}`}>
            {v.childVersionId} · {v.method}
          </Link>
        </p>
      ))}
      <Link href="/verifications">My verification</Link>
    </>
  );
}
