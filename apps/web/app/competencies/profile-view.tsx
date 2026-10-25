import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { api } from '../../lib/session';
import {
  competencyProfileResponseSchema,
  skillsPassportResponseSchema,
  profileLabel,
} from '../../lib/competency-profile';
import { saveProfileSnapshot } from './actions';
export async function ProfileView({
  passport = false,
  pathway,
  page = 1,
  status,
}: {
  passport?: boolean;
  pathway?: string;
  page?: number;
  status?: string;
}) {
  let p;
  try {
    const r = await api(
      passport
        ? '/candidates/me/skills-passport'
        : '/candidates/me/competency-profile',
    );
    if (!r?.ok)
      return (
        <section>
          <h1>
            {passport ? 'My private Skills Passport' : 'My competency evidence'}
          </h1>
          <p>
            Sign in with your candidate profile to view this private workspace.
          </p>
          <Link href="/auth/login">Sign in</Link>
          <p>
            <Link href="/dashboard">Complete candidate profile</Link>
          </p>
        </section>
      );
    p = (
      passport ? skillsPassportResponseSchema : competencyProfileResponseSchema
    ).parse(await r.json());
  } catch {
    return (
      <p role="alert">
        Competency evidence is temporarily unavailable. Please retry when
        connected.
      </p>
    );
  }
  const path = pathway ? p.pathways.find((x) => x.id === pathway) : undefined;
  const rows = p.competencies.filter(
    (c) => !path || c.pathwayVersionIds.includes(path.id),
  );
  const count = Math.max(1, Math.ceil(rows.length / 15)),
    current = Math.min(Math.max(page, 1), count);
  const visible = rows.slice((current - 1) * 15, current * 15);
  const base = passport ? '/skills-passport' : '/competencies';
  const href = (n: number) =>
    `${base}?page=${n}${path ? '&pathway=' + path.id : ''}`;
  return (
    <>
      <Link href="/dashboard">My profile</Link>
      <h1>
        {passport ? 'My private Skills Passport' : 'My competency evidence'}
      </h1>
      <p className="notice">{p.notice}</p>
      <p>
        Private to your account. Employer and public sharing are unavailable.
      </p>
      <p>
        Readiness: unavailable — requires domain expert validation. Professional
        requirements remain unconfigured.
      </p>
      <p>Evaluated {p.evaluatedAt}</p>
      {status && (
        <p role="alert">
          The private snapshot was not saved. Check your connection and retry.
        </p>
      )}
      <p>
        <Link href={passport ? '/competencies' : '/skills-passport'}>
          {passport
            ? 'View my competency profile'
            : 'View my private Skills Passport'}
        </Link>
      </p>
      <form method="get">
        <label>
          Pathway and definition version
          <select name="pathway" defaultValue={path?.id ?? ''}>
            <option value="">All pilot pathways</option>
            {p.pathways.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} — version {x.version} ({x.status})
              </option>
            ))}
          </select>
        </label>
        <button>Show competencies</button>
      </form>
      <p>
        Evidence categories describe different activities. A category name alone
        is not a verification claim. Shared evidence does not establish
        pathway-specific readiness.
      </p>
      {visible.map((c) => (
        <section key={c.id}>
          <h2>
            {c.code}: {c.statement}
          </h2>
          <p>
            Definition version {c.version}; {c.validationStatus}.{' '}
            {c.pathwayVersionIds
              .map((id) => p.pathways.find((x) => x.id === id)?.name)
              .filter(Boolean)
              .join('; ')}
          </p>
          <p>
            Group:{' '}
            {c.groupVersionIds
              .map((id) => p.groups.find((g) => g.id === id)?.name)
              .filter(Boolean)
              .join('; ')}
          </p>
          <dl>
            {c.facets.map((f) => (
              <div key={f.facet}>
                <dt>{profileLabel(f.facet)}</dt>
                <dd>
                  {profileLabel(f.state)}
                  {f.effectiveSourceKeys.length
                    ? ` — ${f.effectiveSourceKeys.length} current source(s)`
                    : ''}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            {c.learningSourceKeys.length} associated learning record(s);{' '}
            {c.groupSupportingSourceKeys.length} group-level supporting
            record(s). These do not establish child competence.
          </p>
          <p>
            Gap:{' '}
            {c.gaps
              .filter((g) => !path || g.pathwayVersionId === path.id)
              .flatMap((g) => g.reasons)
              .filter((v, i, a) => a.indexOf(v) === i)
              .map(profileLabel)
              .join('; ') || 'Requirement not configured'}
          </p>
          <p>
            <Link href={`/competencies/${c.id}`}>
              Explain evidence, provenance and next action
            </Link>
          </p>
          {passport && (
            <ul>
              {p.sources
                .filter((s) =>
                  c.facets.some((f) => f.sourceKeys.includes(s.key)),
                )
                .slice(0, 5)
                .map((s) => (
                  <li key={s.key}>
                    {s.kind.replaceAll('_', ' ').toLowerCase()} —{' '}
                    {profileLabel(s.disposition)}, source {s.id}, version{' '}
                    {s.sourceVersion ?? 'not recorded'}, {s.recordedAt}.{' '}
                    {s.lifecycle ? profileLabel(s.lifecycle) : ''}
                  </li>
                ))}
            </ul>
          )}
        </section>
      ))}
      <section>
        <h2>Group-level supporting records</h2>
        <p>
          Claims and documents attached to a group do not verify its child
          competencies. Document verification and professional requirements
          remain unconfigured.
        </p>
        {p.groups
          .filter(
            (g) =>
              (!path || g.pathwayVersionIds.includes(path.id)) &&
              p.sources.some(
                (s) =>
                  s.kind === 'LEGACY_GROUP' && s.groupVersionIds.includes(g.id),
              ),
          )
          .map((g) => (
            <p key={g.id}>
              {g.name}:{' '}
              {
                p.sources.filter(
                  (s) =>
                    s.kind === 'LEGACY_GROUP' &&
                    s.groupVersionIds.includes(g.id),
                ).length
              }{' '}
              group record(s), including{' '}
              {
                p.sources.filter(
                  (s) =>
                    s.kind === 'LEGACY_GROUP' &&
                    s.groupVersionIds.includes(g.id) &&
                    s.groupFacet === 'SELF_DECLARED',
                ).length
              }{' '}
              self-declared record(s) and{' '}
              {
                p.sources.filter(
                  (s) =>
                    s.kind === 'LEGACY_GROUP' &&
                    s.groupVersionIds.includes(g.id) &&
                    s.groupFacet === 'DOCUMENT_VERIFIED',
                ).length
              }{' '}
              document claim(s).
            </p>
          ))}
      </section>
      <nav aria-label="Competency pages">
        <p>
          Page {current} of {count}
        </p>
        {current > 1 && <Link href={href(current - 1)}>Previous page</Link>}
        {current < count && <Link href={href(current + 1)}>Next page</Link>}
      </nav>
      {!passport && (
        <form action={saveProfileSnapshot}>
          <input type="hidden" name="commandId" value={randomUUID()} />
          <p>
            A saved snapshot is a historical calculation receipt. It does not
            freeze current verification or create a shareable credential.
          </p>
          <button>Save private historical snapshot</button>
        </form>
      )}
    </>
  );
}
