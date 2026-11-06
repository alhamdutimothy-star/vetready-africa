import Link from 'next/link';
import { api } from '../../../lib/session';
import { pilotDashboardSchema } from '../../../lib/dairy-pilot';
import {
  competencyProfileResponseSchema,
  profileLabel,
} from '../../../lib/competency-profile';
import { attemptsSchema } from '../../../lib/assessment';
import { dairyJourney } from '../../../lib/dairy-journey';
export const dynamic = 'force-dynamic';

export default async function Journey() {
  let dairy, profile, attempts;
  try {
    const r = await api('/candidates/me/dairy-pilot');
    if (!r || r.status === 401 || r.status === 403)
      return (
        <section>
          <h1>My dairy journey</h1>
          <Link href="/auth/login">Sign in to continue</Link>
        </section>
      );
    if (!r.ok) throw new Error('Dairy workspace unavailable');
    dairy = pilotDashboardSchema.parse(await r.json());
    if (dairy.profileRequired)
      return (
        <section>
          <h1>My dairy journey</h1>
          <p>Start with your private candidate profile.</p>
          <Link href="/dashboard">Save your private candidate profile</Link>
        </section>
      );
    const [p, a] = await Promise.all([
      api('/candidates/me/competency-profile'),
      api('/candidates/me/attempts'),
    ]);
    if (!p?.ok || !a?.ok) throw new Error('Current evidence unavailable');
    profile = competencyProfileResponseSchema.parse(await p.json());
    if (!profile.governedVerification)
      throw new Error('Current verification projection required');
    attempts = attemptsSchema.parse(await a.json());
  } catch {
    return (
      <section>
        <h1>My dairy journey</h1>
        <p role="alert">
          Current journey information is unavailable. Reconnect and reload this
          page. No progress or verification is inferred while information is
          unavailable.
        </p>
        <Link href="/dairy/journey">Retry current journey</Link>
        <p>
          <Link href="/dashboard">My private profile</Link>
        </p>
      </section>
    );
  }
  const j = dairyJourney(dairy, profile, attempts);
  if (!j.available) return null;
  const path = dairy.pathway.version_id;
  const facets = [
    'SELF_DECLARED',
    'DOCUMENT_VERIFIED',
    'KNOWLEDGE_ASSESSED',
    'CASE_ASSESSED',
    'PRACTICALLY_VERIFIED',
  ] as const;
  return (
    <>
      <h1>My Commercial Dairy Practice journey</h1>
      <p className="notice">{dairy.notice}</p>
      <p>
        Pathway interest: {dairy.selected ? 'Selected' : 'Not selected'}.
        Learning, assessment and candidate claims do not establish practical
        competence.
      </p>
      <section aria-labelledby="next-action">
        <h2 id="next-action">Your next step</h2>
        <Link className="button" href={j.next.href}>
          {j.next.label}
        </Link>
        <p>
          This is a navigation suggestion, not a professional eligibility
          decision.
        </p>
      </section>
      <section>
        <h2>Readiness and outstanding requirements</h2>
        <p>
          <strong>Readiness: unavailable</strong> — professional thresholds
          require domain-expert validation. Job Ready, Field Ready,
          certification and licensing remain unconfigured.
        </p>
        <p>
          {j.gaps.length} mapped competencies have recorded gap reasons; these
          are development signals, not a pass/fail determination.
        </p>
        <Link href={'/competencies?pathway=' + path}>
          Inspect explainable competency gaps
        </Link>
      </section>
      <section>
        <h2>Assessment and dairy case progress</h2>
        <p>
          Assessment performance remains separate from practical verification.
        </p>
        {j.history.length ? (
          <ul>
            {j.history.map((a) => (
              <li key={a.id}>
                {a.title}: {a.status}
                {a.demo ? ' — demonstration only' : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No dairy assessment attempts recorded.</p>
        )}
        <p>
          <Link href={'/development?pathway=' + dairy.pathway.id}>
            Start or resume baseline assessment
          </Link>
        </p>
        <Link href="/dairy">
          Open dairy case activities and saved reasoning
        </Link>
      </section>
      <section>
        <h2>Development and training</h2>
        <p>
          {dairy.learning.enrollments} dairy enrollments;{' '}
          {dairy.learning.completed_lessons} lessons completed. Completion is
          learning progress only.
        </p>
        <p>
          <Link href="/development/next-steps">
            Related competencies, gap explanations and learning next steps
          </Link>
        </p>
        <Link href="/dairy/learning">Continue governed dairy learning</Link>
      </section>
      <section>
        <h2>Evidence and independent verification</h2>
        <p>
          {j.pendingEvidence.length} dairy evidence records awaiting review.
          Review is not automatic verification.
        </p>
        {j.evidence.length > 0 && (
          <ul>
            {j.evidence.map((s) => (
              <li key={s.key}>
                {s.kind.replaceAll('_', ' ')}: receipt {s.lifecycle ?? s.status}{' '}
                — current status: {s.currentStatus}
                {s.demo ? ' — demonstration only' : ''}
              </li>
            ))}
          </ul>
        )}
        <p>
          {j.effectiveCount} dairy competencies have currently effective
          governed verification. Review history alone is not an effective claim.
        </p>
        <p>
          <Link href="/practical">
            Create, resume or submit private practical evidence
          </Link>
        </p>
        <p>
          Use the existing text-only forms for your own account; do not include
          farm, client or confidential records. Saved draft revisions and
          submission status remain available there.
        </p>
        <p>
          <Link href="/verifications">
            Review submission status, revisions and candidate-safe feedback
          </Link>
        </p>
        {j.verification.length ? (
          <ul>
            {j.verification.map((v) => (
              <li key={v.caseId}>
                {j.competencies.find((c) => c.id === v.childVersionId)?.code}:{' '}
                {v.verified
                  ? 'Currently effective governed verification'
                  : v.outcome
                    ? `${v.outcome} — not currently effective verification`
                    : 'Awaiting independent review'}
                {v.verified ? ` — ${profileLabel(v.facet)}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No governed verification cases currently projected for this pathway.
          </p>
        )}
      </section>
      <section>
        <h2>Competency evidence by facet</h2>
        <p>
          Each evidence facet remains separate. Demonstration, pending and
          unverified records are not VetReady-verified. Counts below are
          evidence states, not readiness scores.
        </p>
        <p>
          Current governed dairy decisions take precedence over historical
          receipt state. Other facet states describe the existing
          competency-wide evidence record and do not establish professional
          eligibility for this pathway.
        </p>
        {j.competencies.length ? (
          <ul>
            {j.competencies.map((c) => (
              <li key={c.id}>
                <Link href={'/competencies/' + c.id}>
                  {c.code}: {c.statement}
                </Link>
                <ul>
                  {facets.map((f) => (
                    <li key={f}>
                      {profileLabel(f)}:{' '}
                      {c.facets.find((x) => x.facet === f)?.currentStatus ??
                        'NO_EVIDENCE'}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p>No child competencies mapped to this pathway version.</p>
        )}
      </section>
      <section>
        <h2>Profile and private Skills Passport</h2>
        <p>
          <Link href={'/competencies?pathway=' + path}>
            View current competency profile and evidence provenance
          </Link>
        </p>
        <Link href={'/skills-passport?pathway=' + path}>
          Open private Skills Passport and readiness explanation
        </Link>
        <p>
          Current views are refreshed from authorised evidence. Historical
          receipts do not establish current verification.
        </p>
      </section>
      <Link href="/dashboard">Edit my private candidate profile</Link>
    </>
  );
}
