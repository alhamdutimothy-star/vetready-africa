import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { api } from '../../lib/session';
import { PILOT_NOTICE } from '@vetready/contracts';
import {
  pilotOrganizationsSchema,
  pilotJobsSchema,
  pilotOptionsSchema,
  employerApplicationsSchema,
  employerExplanationSchema,
} from '../../lib/recruitment';
import {
  savePilotJob,
  transitionPilotJob,
  evaluatePilotApplication,
  shortlistPilotApplication,
} from '../opportunities/actions';
export const dynamic = 'force-dynamic';
export default async function EmployerPilot({
  searchParams,
}: {
  searchParams: Promise<{
    org?: string;
    application?: string;
    evaluation?: string;
    status?: string;
  }>;
}) {
  const q = await searchParams;
  let organizations, options, jobs, apps, explanation;
  try {
    const [o, r] = await Promise.all([
      api('/pilot/employer/organizations'),
      api('/pilot/reference-options'),
    ]);
    if (!o?.ok || !r?.ok)
      return (
        <p>
          Pilot organisation access unavailable. Sign in with current employer
          membership.
        </p>
      );
    organizations = pilotOrganizationsSchema.parse(await o.json());
    options = pilotOptionsSchema.parse(await r.json());
    const org =
      organizations.organizations.find((o) => o.id === q.org) ??
      organizations.organizations[0];
    if (!org)
      return (
        <p>
          An independent administrator must verify the single pilot organisation
          before employer access is available.
        </p>
      );
    const j = await api(`/pilot/organizations/${org.id}/opportunities`);
    if (!j?.ok) return <p>Pilot access unavailable.</p>;
    jobs = pilotJobsSchema.parse(await j.json());
    const job = jobs.jobs[0];
    if (job) {
      const a = await api(
        `/pilot/organizations/${org.id}/opportunities/${job.id}/applications`,
      );
      if (a?.ok) apps = employerApplicationsSchema.parse(await a.json());
    }
    if (
      z.uuid().safeParse(q.application).success &&
      z.uuid().safeParse(q.evaluation).success
    ) {
      const e = await api(
        `/pilot/organizations/${org.id}/applications/${q.application}/evaluations/${q.evaluation}`,
      );
      if (e?.ok) explanation = employerExplanationSchema.parse(await e.json());
    }
    const selected = apps?.applications.find((a) => a.id === q.application);
    return (
      <>
        <Link href="/dashboard">Dashboard</Link>
        <h1>Employer technical pilot</h1>
        <p className="notice">{PILOT_NOTICE}</p>
        <h2>{org.name}</h2>
        {q.status && (
          <p role="status">
            {q.status === 'saved'
              ? 'Request saved.'
              : 'Request unavailable. Recheck current authority, consent, terms and connection.'}
          </p>
        )}
        {q.evaluation && !explanation && (
          <p>
            Evaluation unavailable or stale. Candidate access and current source
            validity are required.
          </p>
        )}
        <form action={savePilotJob}>
          <h2>
            {job
              ? 'Create a new requirement version'
              : 'Create the single pilot opportunity'}
          </h2>
          <input type="hidden" name="commandId" value={randomUUID()} />
          <input type="hidden" name="organizationId" value={org.id} />
          <input
            type="hidden"
            name="interestRequirementId"
            value={randomUUID()}
          />
          <input
            type="hidden"
            name="locationRequirementId"
            value={randomUUID()}
          />
          <input
            type="hidden"
            name="competencyRequirementId"
            value={randomUUID()}
          />
          {job && (
            <>
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="expectedVersion" value={job.version} />
            </>
          )}
          <label>
            Title
            <input
              name="title"
              required
              minLength={3}
              maxLength={160}
              defaultValue={job?.content.title}
            />
          </label>
          <label>
            Technical pilot description
            <textarea
              name="description"
              required
              minLength={10}
              maxLength={2000}
              defaultValue={job?.content.description}
            />
          </label>
          <label>
            Pathway definition
            <select
              name="pathwayVersionId"
              defaultValue={job?.content.pathwayVersionId}
            >
              {options.pathways.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}, version {p.version} — {p.status}
                </option>
              ))}
            </select>
          </label>
          <p>
            Declared pathway interest is a mandatory technical condition, not a
            competence claim.
          </p>
          <label>
            Optional required state declaration
            <input name="state" maxLength={100} />
          </label>
          <label>
            <input type="checkbox" name="acceptRelocation" />
            Accept an explicit willingness-to-relocate declaration
          </label>
          <label>
            Optional exact child competency
            <select name="childVersionId">
              <option value="">No competency requirement</option>
              {options.competencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Independent evidence category
            <select name="facet">
              {[
                'SELF_DECLARED',
                'DOCUMENT_VERIFIED',
                'KNOWLEDGE_ASSESSED',
                'CASE_ASSESSED',
                'PRACTICALLY_VERIFIED',
              ].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" name="mandatoryCompetency" />
            Mandatory competency requirement (keeps eligibility UNCONFIGURED)
          </label>
          <p>
            All professional requirements: REQUIRES DOMAIN EXPERT VALIDATION. No
            weights are available. Saving makes a new immutable version and
            returns the opportunity to draft.
          </p>
          <button>{job ? 'Save new draft version' : 'Create draft'}</button>
        </form>
        {job && (
          <>
            <h2>Opportunity state</h2>
            <p>
              {job.status}, version {job.version}
            </p>
            {job.status !== 'CLOSED' && (
              <form action={transitionPilotJob}>
                <input type="hidden" name="commandId" value={randomUUID()} />
                <input type="hidden" name="organizationId" value={org.id} />
                <input type="hidden" name="jobId" value={job.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={job.version}
                />
                <button
                  name="action"
                  value={job.status === 'DRAFT' ? 'PUBLISH' : 'CLOSE'}
                >
                  {job.status === 'DRAFT'
                    ? 'Publish technical pilot terms'
                    : 'Close opportunity'}
                </button>
              </form>
            )}
          </>
        )}
        <h2>Consenting applications</h2>
        {apps?.applications.map((a) => (
          <section key={a.id}>
            <h3>Candidate alias {a.candidateAlias}</h3>
            <p>Human review stage: {a.stage}</p>
            <form action={evaluatePilotApplication}>
              <input type="hidden" name="commandId" value={randomUUID()} />
              <input type="hidden" name="organizationId" value={org.id} />
              <input type="hidden" name="applicationId" value={a.id} />
              <button>Calculate current technical eligibility</button>
            </form>
          </section>
        ))}
        {apps?.truncated && (
          <p>The first 50 authorized applications are shown.</p>
        )}
        {explanation && (
          <section>
            <h2>Explainable technical evaluation</h2>
            <p>
              {explanation.projection.eligibility} — declared technical
              conditions only. Evaluated {explanation.evaluatedAt}.
            </p>
            <p>
              Weighted fit UNCONFIGURED; professional readiness UNAVAILABLE.
            </p>
            <ul>
              {explanation.projection.requirements.map((r) => (
                <li key={r.requirementId}>
                  {r.kind}: {r.outcome} — {r.reason}
                </li>
              ))}
            </ul>
            {explanation.projection.competencies.map((c, i) => (
              <p key={i}>
                {c.facet}: {c.state}. Pathway context is not professionally
                validated.
              </p>
            ))}
            {selected && (
              <form action={shortlistPilotApplication}>
                <input type="hidden" name="commandId" value={randomUUID()} />
                <input type="hidden" name="organizationId" value={org.id} />
                <input type="hidden" name="applicationId" value={selected.id} />
                <input
                  type="hidden"
                  name="evaluationId"
                  value={explanation.id}
                />
                <input
                  type="hidden"
                  name="expectedRevision"
                  value={selected.revision}
                />
                <button name="action" value="REVIEW">
                  Keep in human review
                </button>
                {explanation.projection.eligibility === 'ELIGIBLE' && (
                  <button name="action" value="SHORTLIST">
                    Record human shortlist
                  </button>
                )}
                <button name="action" value="REMOVE">
                  Remove shortlist flag
                </button>
              </form>
            )}
          </section>
        )}
      </>
    );
  } catch {
    return (
      <p role="alert">
        Employer pilot temporarily unavailable. No private candidate details are
        displayed. Retry when connected.
      </p>
    );
  }
}
