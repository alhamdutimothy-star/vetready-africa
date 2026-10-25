import Link from 'next/link';
import { z } from 'zod';
import { api } from '../../../../lib/session';
import { competencyProfileResponseSchema } from '../../../../lib/competency-profile';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return <p>Private snapshot unavailable.</p>;
  let s;
  try {
    const r = await api(`/candidates/me/competency-profile/snapshots/${id}`);
    if (!r?.ok) return <p>Private snapshot unavailable for this account.</p>;
    s = z
      .object({
        historical: z.literal(true),
        notice: z.string(),
        inputDigest: z.string(),
        resultDigest: z.string(),
        result: competencyProfileResponseSchema,
      })
      .parse(await r.json());
  } catch {
    return (
      <p role="alert">
        Historical snapshot temporarily unavailable. Please retry when
        connected.
      </p>
    );
  }
  return (
    <>
      <h1>Private historical profile snapshot</h1>
      <p className="notice">{s.notice}</p>
      <p>
        Evaluated {s.result.evaluatedAt}; engine {s.result.engineVersion};{' '}
        {s.result.competencies.length} version-bound competency definitions.
      </p>
      <p>Readiness unavailable. No certification or licensing decision.</p>
      <h2>Integrity receipts</h2>
      <p>
        Input SHA-256: <code>{s.inputDigest}</code>
      </p>
      <p>
        Result SHA-256: <code>{s.resultDigest}</code>
      </p>
      <p>
        Provenance and calculation integrity were verified before displaying
        this receipt.
      </p>
      <Link href="/skills-passport">View current private passport</Link>
      <p>
        <Link href="/competencies">Return to current competency evidence</Link>
      </p>
    </>
  );
}
