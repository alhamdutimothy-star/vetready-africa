import Link from 'next/link';
import { z } from 'zod';
import { api } from '../../../../lib/session';
import {
  curriculumCatalogSchema,
  curriculumDetailSchema,
} from '../../../../lib/dairy-learning';
import { prepareCurriculum, releaseCurriculum } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Manage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; status?: string }>;
}) {
  const q = await searchParams;
  const r = await api('/admin/dairy-learning');
  if (!r?.ok)
    return (
      <p>
        Authorized owner access is required.{' '}
        <Link href="/dairy">Dairy dashboard</Link>
      </p>
    );
  const versions = curriculumCatalogSchema.parse(await r.json());
  let detail = null;
  if (q.version && z.uuid().safeParse(q.version).success) {
    const x = await api(`/admin/dairy-learning/${q.version}`);
    if (x?.ok) detail = curriculumDetailSchema.parse(await x.json());
  }
  return (
    <>
      <h1>Governed dairy curriculum inspection</h1>
      <p>
        Production approval is disabled. Explicit demo release keeps content
        DRAFT and cannot award competence.
      </p>
      {q.status && (
        <p role="status">
          {q.status === 'unavailable'
            ? 'Action unavailable. Prepare and release the existing dairy case first; inspect content and permissions.'
            : q.status}
        </p>
      )}
      <Link href="/dairy/review">
        Existing case preparation and assessor workflow
      </Link>
      {!versions.length && (
        <form action={prepareCurriculum}>
          <button>Prepare DRAFT starter curriculum</button>
        </form>
      )}
      {versions.map((v) => (
        <section key={v.id}>
          <h2>
            {v.title} v{v.version} — {v.status}
          </h2>
          <Link href={`/dairy/learning/manage?version=${v.id}`}>
            Inspect exact version
          </Link>
        </section>
      ))}
      {detail && (
        <>
          <h2>Inspection</h2>
          <p>{detail.course.notice}</p>
          <p>
            Author: {detail.curriculum.author_id}; reviewer:{' '}
            {detail.course.reviewer_id ?? 'not reviewed'}.
          </p>
          {detail.curriculum.domains.map((d) => (
            <details key={d.code}>
              <summary>{d.title}</summary>
              <p>{d.topics.join('; ')}</p>
              <p>Mapped versions: {d.childVersionIds.join(', ')}</p>
            </details>
          ))}
          {detail.units.map((u) => (
            <section key={u.lesson_version_id}>
              <h3>{u.content.lessonCode}</h3>
              <pre style={{ whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(u.content, null, 2)}
              </pre>
            </section>
          ))}
          <form action={releaseCurriculum}>
            <input type="hidden" name="version" value={detail.course.id} />
            <button>
              Explicitly release inspected DRAFT for demo learning
            </button>
          </form>
        </>
      )}
      <p>
        Creating subsequent versions with full metadata uses the governed API.
        Previously consumed versions remain frozen.
      </p>
    </>
  );
}
