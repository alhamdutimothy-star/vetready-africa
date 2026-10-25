import Link from 'next/link';
import { z } from 'zod';
import { api } from '../../../lib/session';
import {
  competencyProfileResponseSchema,
  profileLabel,
} from '../../../lib/competency-profile';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return <p>Competency unavailable.</p>;
  let p;
  try {
    const r = await api(`/candidates/me/competency-profile/competencies/${id}`);
    if (!r?.ok)
      return <p>Private competency evidence unavailable for this account.</p>;
    p = competencyProfileResponseSchema.parse(await r.json());
  } catch {
    return (
      <p role="alert">
        Competency explanation is temporarily unavailable. Please retry when
        connected.
      </p>
    );
  }
  const c = p.competencies[0];
  if (!c) return <p>Competency unavailable.</p>;
  const requested = Number((await searchParams).page);
  const pages = Math.max(1, Math.ceil(p.sources.length / 20));
  const page = Number.isSafeInteger(requested)
    ? Math.min(pages, Math.max(1, requested))
    : 1;
  return (
    <>
      <Link href="/competencies">My competencies</Link>
      <h1>{c.code}: evidence explanation</h1>
      <p className="notice">{p.notice}</p>
      <p>
        Requirements remain unconfigured. These records cannot determine
        readiness, certification or licensing.
      </p>
      <h2>Evidence history</h2>
      {!p.sources.length && (
        <p>No child or supporting group evidence recorded.</p>
      )}
      {p.sources.slice((page - 1) * 20, page * 20).map((s) => (
        <section key={s.key}>
          <h3>{profileLabel(s.disposition)}</h3>
          <p>
            Source {s.id}; {s.kind.replaceAll('_', ' ').toLowerCase()}; source
            version {s.sourceVersion ?? 'not recorded'} (
            {s.sourceVersionId ?? 'not recorded'}).
          </p>
          <p>
            Recorded {s.recordedAt}; decision {s.decisionAt ?? 'not recorded'};
            validity {s.validUntil ?? 'not configured'}.
          </p>
          <p>{s.reasons.map(profileLabel).join('; ')}</p>
          <p>
            Recorded pathway context:{' '}
            {s.pathwayVersionIds
              .map((v) => p.pathways.find((x) => x.id === v)?.name ?? v)
              .join('; ') || 'Not recorded'}
            . Shared mappings do not establish pathway-specific readiness.
          </p>
          <p>
            Effective for its recorded evidence activity:{' '}
            {s.effective ? 'yes' : 'no'}. This does not confer other facets or
            pathway readiness.
          </p>
        </section>
      ))}
      <nav aria-label="Evidence history pages">
        <p>
          Page {page} of {pages}
        </p>
        {page > 1 && (
          <Link href={`/competencies/${id}?page=${page - 1}`}>
            Previous evidence
          </Link>
        )}
        {page < pages && (
          <Link href={`/competencies/${id}?page=${page + 1}`}>
            More evidence
          </Link>
        )}
      </nav>
      <h2>Next action</h2>
      <p>
        Keep learning and review the underlying evidence. A veterinary expert
        must configure professional requirements before readiness can be
        determined.
      </p>
      <p>
        <Link href="/development">Learning and assessment development</Link>
      </p>
      <p>
        <Link href="/practical">My private practical evidence</Link>
      </p>
    </>
  );
}
