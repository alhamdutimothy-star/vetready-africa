import Link from 'next/link';
import { z } from 'zod';
import { api } from '../../../lib/session';
import { curriculumCatalogSchema } from '../../../lib/dairy-learning';
import { enrollCurriculum } from './actions';
export const dynamic = 'force-dynamic';
export default async function Learning() {
  let r: Response | null = null;
  try {
    r = await api('/dairy-learning');
  } catch {
    /* Show safe unavailable state. */
  }
  if (!r || r.status === 401)
    return <Link href="/auth/login">Sign in to view dairy learning</Link>;
  if (!r.ok)
    return <p>Learning is temporarily unavailable. Retry when connected.</p>;
  const courses = curriculumCatalogSchema.parse(await r.json());
  const e = await api('/candidates/me/dairy-learning');
  const enrollments = e?.ok
    ? z
        .array(
          z.object({
            id: z.uuid(),
            course_version_id: z.uuid(),
            title: z.string(),
            version: z.number(),
          }),
        )
        .parse(await e.json())
    : [];
  return (
    <>
      <Link href="/dairy">Dairy competency dashboard</Link>
      <h1>Dairy learning and competency domains</h1>
      <p className="notice">
        DEMO/DRAFT — REQUIRES DOMAIN EXPERT VALIDATION. Learning completion does
        not verify competence. No readiness percentage or professional award is
        active.
      </p>
      <h2>Resume my learning</h2>
      {enrollments.map((e) => (
        <p key={e.id}>
          <Link href={`/dairy/learning/${e.id}`}>
            {e.title} — version {e.version}
          </Link>
        </p>
      ))}
      {!courses.length && (
        <p>
          No dairy curriculum has been explicitly released for demonstration
          yet.
        </p>
      )}
      {courses.map((c) => (
        <section key={c.id}>
          <h2>
            {c.title} — version {c.version}
          </h2>
          <p>{c.notice}</p>
          <form action={enrollCurriculum}>
            <input type="hidden" name="version" value={c.id} />
            <button>Open / enroll in this content version</button>
          </form>
          {c.domains.map((d) => (
            <details key={d.code}>
              <summary>{d.title}</summary>
              <p>
                Proposed scope; these topics are not all taught or assessed by
                the starter units.
              </p>
              <ul>
                {d.topics.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <p>
                Reusable competency definitions: {d.childVersionIds.length}. No
                new competency awards.
              </p>
            </details>
          ))}
        </section>
      ))}
      <Link href="/dairy/learning/manage">Owner curriculum inspection</Link>
    </>
  );
}
