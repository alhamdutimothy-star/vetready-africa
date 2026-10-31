import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  jobContentSchema,
  profileInputSchema,
  matchingFactsSchema,
  matchingInputSchema,
  PILOT_NOTICE,
  type JobContent,
} from '@vetready/contracts';
import {
  aggregateCompetencyProfile,
  profileCanonicalJson,
  pilotMatchingFacts,
  evaluatePilotMatch,
  employerPilotProjection,
} from '@vetready/domain';
import { Database, audit } from '../database';
import type { OperationContext } from '../service';
import { readProfileFacts } from '../competency-profile/facts';
const digest = (v: unknown) =>
  createHash('sha256').update(profileCanonicalJson(v)).digest('hex');
type RecordRow = Record<string, unknown>;
const identifier = (v: unknown) => z.uuid().parse(v);
@Injectable()
export class RecruitmentRepository {
  referenceOptions(ctx: OperationContext) {
    return this.tx(async (c) => {
      await this.capability(c, ctx, 'catalog:read');
      return {
        pathways: (
          await c.query(
            'SELECT v.id,p.name,v.version,v.approval_status AS status FROM pathway_versions v JOIN pathways p ON p.id=v.pathway_id ORDER BY p.name,v.version',
          )
        ).rows,
        competencies: (
          await c.query(
            'SELECT v.id,c.code,v.statement,v.validation_status AS status,array_agg(DISTINCT pc.pathway_version_id) AS pathways FROM child_competency_versions v JOIN child_competencies c ON c.id=v.child_id JOIN child_group_mappings m ON m.child_version_id=v.id JOIN pathway_competencies pc ON pc.competency_version_id=m.group_version_id GROUP BY v.id,c.code ORDER BY c.code,v.version',
          )
        ).rows,
      };
    });
  }
  governance(ctx: OperationContext) {
    return this.tx(async (c) => {
      await this.govern(c, ctx);
      return {
        notice: PILOT_NOTICE,
        organizations: (
          await c.query(
            'SELECT o.id,o.display_name AS name,o.verification_status AS status FROM organizations o ORDER BY o.created_at DESC,o.id LIMIT 51',
          )
        ).rows,
        members: (
          await c.query(
            'SELECT m.organization_id AS "organizationId",m.user_id AS "userId",coalesce((SELECT status FROM pilot16_member_events e WHERE e.organization_id=m.organization_id AND e.user_id=m.user_id ORDER BY sequence DESC LIMIT 1),\'ACTIVE\') AS status FROM organization_memberships m JOIN pilot16_organizations p ON p.organization_id=m.organization_id ORDER BY m.organization_id,m.user_id LIMIT 51',
          )
        ).rows,
      };
    });
  }
  constructor(@Inject(Database) private readonly db: Database) {}
  private async capability(
    c: PoolClient,
    ctx: OperationContext,
    permission: string,
  ) {
    if (
      !(
        await c.query('SELECT training_capability($1,$2) AS ok', [
          ctx.userId,
          permission,
        ])
      ).rows[0]?.ok
    )
      throw new ForbiddenException('Current capability required');
  }
  private async govern(c: PoolClient, ctx: OperationContext) {
    if (
      !(await c.query('SELECT pilot16_govern($1) AS ok', [ctx.userId])).rows[0]
        ?.ok
    )
      throw new ForbiddenException('Pilot governance required');
  }
  private async candidate(c: PoolClient, ctx: OperationContext) {
    await this.capability(c, ctx, 'candidate:own');
    const p = (
      await c.query(
        'SELECT id,state,willing_to_relocate FROM candidate_profiles WHERE user_id=$1',
        [ctx.userId],
      )
    ).rows[0];
    if (!p) throw new NotFoundException('Complete candidate profile');
    return p;
  }
  private async lockOrganization(c: PoolClient, id: string) {
    if (
      !(
        await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [
          id,
        ])
      ).rowCount
    )
      throw new NotFoundException('Pilot resource unavailable');
    // A changed access epoch forces repeatable-read waiters to retry with fresh grants.
    await c.query(
      'SELECT organization_id FROM pilot16_organizations WHERE organization_id=$1 FOR UPDATE',
      [id],
    );
  }
  private async employer(c: PoolClient, ctx: OperationContext, org: string) {
    await this.lockOrganization(c, org);
    if (
      !(
        await c.query('SELECT pilot16_employer($1,$2) AS ok', [ctx.userId, org])
      ).rows[0]?.ok
    )
      throw new NotFoundException('Pilot resource unavailable');
  }
  private async tx<T>(fn: (c: PoolClient) => Promise<T>) {
    for (let n = 0; n < 3; n++)
      try {
        return await this.db.transaction(async (c) => {
          await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
          return fn(c);
        });
      } catch (e) {
        if (
          e &&
          typeof e === 'object' &&
          'code' in e &&
          ['40001', '40P01', '23505'].includes(String(e.code))
        )
          continue;
        throw e;
      }
    throw new ConflictException(
      'Concurrent pilot change; retry the same command',
    );
  }
  private command(
    ctx: OperationContext,
    scope: string,
    body: { commandId: string },
    authorize: (c: PoolClient) => Promise<unknown>,
    work: (c: PoolClient) => Promise<RecordRow>,
  ) {
    return this.tx(async (c) => {
      await authorize(c);
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16))', [
        ctx.userId + ':' + body.commandId,
      ]);
      const old = (
        await c.query(
          'SELECT * FROM pilot16_commands WHERE actor_id=$1 AND command_id=$2',
          [ctx.userId, body.commandId],
        )
      ).rows[0];
      const hash = digest({ scope, body });
      if (old) {
        if (old.scope !== scope || old.request_digest !== hash)
          throw new ConflictException(
            'Command already used with different input',
          );
        return { ...old.response, replay: true };
      }
      const response = await work(c);
      await c.query(
        'INSERT INTO pilot16_commands(actor_id,command_id,scope,request_digest,response) VALUES($1,$2,$3,$4,$5)',
        [ctx.userId, body.commandId, scope, hash, JSON.stringify(response)],
      );
      return { ...response, replay: false };
    });
  }
  verifyEmployer(
    ctx: OperationContext,
    org: string,
    body: { commandId: string; status: string; reason: string },
  ) {
    return this.command(
      ctx,
      'employer:' + org,
      body,
      async (c) => {
        await this.govern(c, ctx);
        await this.lockOrganization(c, org);
        if (
          (
            await c.query(
              'SELECT 1 FROM organization_memberships WHERE organization_id=$1 AND user_id=$2',
              [org, ctx.userId],
            )
          ).rowCount
        )
          throw new ForbiddenException('Independent employer review required');
      },
      async (c) => {
        await c.query(
          'INSERT INTO pilot16_organizations(organization_id,status) VALUES($1,$2) ON CONFLICT(organization_id) DO UPDATE SET status=excluded.status',
          [org, body.status],
        );
        await c.query(
          'UPDATE organizations SET verification_status=$2 WHERE id=$1',
          [org, body.status],
        );
        const id = (
          await c.query(
            'INSERT INTO pilot16_employer_events(organization_id,actor_id,status,reason,request_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
            [org, ctx.userId, body.status, body.reason, ctx.requestId],
          )
        ).rows[0].id;
        return { id, status: body.status };
      },
    );
  }
  memberAccess(
    ctx: OperationContext,
    org: string,
    user: string,
    body: { commandId: string; status: string; reason: string },
  ) {
    return this.command(
      ctx,
      'member:' + org + ':' + user,
      body,
      async (c) => {
        await this.govern(c, ctx);
        await this.lockOrganization(c, org);
        if (
          !(
            await c.query(
              'SELECT 1 FROM organization_memberships m JOIN pilot16_organizations p ON p.organization_id=m.organization_id WHERE m.organization_id=$1 AND m.user_id=$2',
              [org, user],
            )
          ).rowCount
        )
          throw new NotFoundException('Membership unavailable');
      },
      async (c) => {
        await c.query(
          'UPDATE pilot16_organizations SET access_revision=access_revision+1 WHERE organization_id=$1',
          [org],
        );
        const id = (
          await c.query(
            'INSERT INTO pilot16_member_events(organization_id,user_id,actor_id,status,reason,request_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
            [org, user, ctx.userId, body.status, body.reason, ctx.requestId],
          )
        ).rows[0].id;
        return { id, status: body.status };
      },
    );
  }
  organizations(ctx: OperationContext) {
    return this.tx(async (c) => {
      const rows = (
        await c.query(
          'SELECT o.id,o.display_name AS name FROM organizations o WHERE pilot16_employer($1,o.id) ORDER BY o.id',
          [ctx.userId],
        )
      ).rows;
      return { notice: PILOT_NOTICE, organizations: rows };
    });
  }
  private async job(c: PoolClient, id: string, org?: string, lock = false) {
    const j = (
      await c.query(
        `SELECT j.*,o.display_name AS organization_name,v.id AS version_id,v.content,v.pathway_version_id FROM pilot16_jobs j JOIN pilot16_job_versions v ON v.job_id=j.id AND v.version=j.current_version JOIN organizations o ON o.id=j.organization_id WHERE j.id=$1${org ? ' AND j.organization_id=$2' : ''}${lock ? ' FOR UPDATE OF j' : ''}`,
        org ? [id, org] : [id],
      )
    ).rows[0];
    if (!j) throw new NotFoundException('Opportunity unavailable');
    return j;
  }
  private jobDto(j: RecordRow) {
    return {
      id: j.id,
      organizationId: j.organization_id,
      organizationName: j.organization_name,
      status: j.status,
      version: j.current_version,
      versionId: j.version_id,
      content: jobContentSchema.parse(j.content),
      notice: PILOT_NOTICE,
      policy: {
        version: 'pilot-policy-1',
        professionalStatus: 'UNCONFIGURED',
        weightedFit: 'UNCONFIGURED',
      },
    };
  }
  jobs(ctx: OperationContext, org?: string) {
    return this.tx(async (c) => {
      if (org) await this.employer(c, ctx, org);
      else await this.candidate(c, ctx);
      const rows = (
        await c.query(
          `SELECT j.*,o.display_name AS organization_name,v.id AS version_id,v.content FROM pilot16_jobs j JOIN pilot16_job_versions v ON v.job_id=j.id AND v.version=j.current_version JOIN pilot16_organizations p ON p.organization_id=j.organization_id JOIN organizations o ON o.id=j.organization_id WHERE ${org ? 'j.organization_id=$1' : "j.status='PUBLISHED' AND p.status='VERIFIED' AND o.verification_status='VERIFIED'"} ORDER BY j.id`,
          org ? [org] : [],
        )
      ).rows;
      return { notice: PILOT_NOTICE, jobs: rows.map((j) => this.jobDto(j)) };
    });
  }
  opportunity(ctx: OperationContext, id: string) {
    return this.tx(async (c) => {
      await this.candidate(c, ctx);
      const j = await this.job(c, id);
      if (
        j.status !== 'PUBLISHED' ||
        !(
          await c.query(
            "SELECT 1 FROM pilot16_organizations p JOIN organizations o ON o.id=p.organization_id WHERE p.organization_id=$1 AND p.status='VERIFIED' AND o.verification_status='VERIFIED'",
            [j.organization_id],
          )
        ).rowCount
      )
        throw new NotFoundException('Opportunity unavailable');
      return this.jobDto(j);
    });
  }
  private async validateContent(c: PoolClient, content: JobContent) {
    if (
      !(
        await c.query('SELECT 1 FROM pathway_versions WHERE id=$1', [
          content.pathwayVersionId,
        ])
      ).rowCount
    )
      throw new UnprocessableEntityException('Unknown pathway version');
    for (const r of content.requirements)
      if (
        r.kind === 'COMPETENCY_FACET' &&
        !(
          await c.query(
            'SELECT 1 FROM child_group_mappings m JOIN pathway_competencies pc ON pc.competency_version_id=m.group_version_id WHERE m.child_version_id=$1 AND pc.pathway_version_id=$2',
            [r.childVersionId, content.pathwayVersionId],
          )
        ).rowCount
      )
        throw new UnprocessableEntityException(
          'Child version outside selected pathway',
        );
  }
  createJob(
    ctx: OperationContext,
    org: string,
    body: { commandId: string; content: JobContent },
  ) {
    return this.command(
      ctx,
      'job:create:' + org,
      body,
      (c) => this.employer(c, ctx, org),
      async (c) => {
        await this.validateContent(c, body.content);
        if ((await c.query('SELECT 1 FROM pilot16_jobs')).rowCount)
          throw new ConflictException('The pilot supports one opportunity');
        const id = randomUUID();
        await c.query(
          'INSERT INTO pilot16_jobs(id,organization_id,actor_id,request_id) VALUES($1,$2,$3,$4)',
          [id, org, ctx.userId, ctx.requestId],
        );
        const version = await this.insertVersion(c, ctx, id, 1, body.content);
        await c.query('UPDATE pilot16_jobs SET current_version=1 WHERE id=$1', [
          id,
        ]);
        await this.jobEvent(c, ctx, id, version, 'CREATED');
        return { id, versionId: version, version: 1 };
      },
    );
  }
  private async insertVersion(
    c: PoolClient,
    ctx: OperationContext,
    job: string,
    n: number,
    content: JobContent,
  ) {
    return (
      await c.query(
        'INSERT INTO pilot16_job_versions(job_id,version,pathway_version_id,content,actor_id,request_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
        [
          job,
          n,
          content.pathwayVersionId,
          JSON.stringify(content),
          ctx.userId,
          ctx.requestId,
        ],
      )
    ).rows[0].id as string;
  }
  private async jobEvent(
    c: PoolClient,
    ctx: OperationContext,
    job: string,
    version: string,
    action: string,
  ) {
    await c.query(
      'INSERT INTO pilot16_job_events(job_id,version_id,actor_id,action,request_id) VALUES($1,$2,$3,$4,$5)',
      [job, version, ctx.userId, action, ctx.requestId],
    );
  }
  reviseJob(
    ctx: OperationContext,
    org: string,
    id: string,
    body: { commandId: string; expectedVersion: number; content: JobContent },
  ) {
    return this.command(
      ctx,
      'job:revise:' + id,
      body,
      async (c) => {
        await this.employer(c, ctx, org);
        await this.job(c, id, org, true);
      },
      async (c) => {
        const j = await this.job(c, id, org);
        if (j.current_version !== body.expectedVersion)
          throw new ConflictException('Stale job version');
        await this.validateContent(c, body.content);
        const version = await this.insertVersion(
          c,
          ctx,
          id,
          j.current_version + 1,
          body.content,
        );
        await c.query(
          "UPDATE pilot16_jobs SET current_version=current_version+1,status='DRAFT',actor_id=$2,request_id=$3 WHERE id=$1",
          [id, ctx.userId, ctx.requestId],
        );
        await this.jobEvent(c, ctx, id, version, 'REVISED');
        return { id, versionId: version, version: j.current_version + 1 };
      },
    );
  }
  transitionJob(
    ctx: OperationContext,
    org: string,
    id: string,
    body: {
      commandId: string;
      expectedVersion: number;
      action: 'PUBLISH' | 'CLOSE';
    },
  ) {
    return this.command(
      ctx,
      'job:transition:' + id,
      body,
      async (c) => {
        await this.employer(c, ctx, org);
        await this.job(c, id, org, true);
      },
      async (c) => {
        const j = await this.job(c, id, org);
        if (j.current_version !== body.expectedVersion)
          throw new ConflictException('Stale job version');
        if (
          (body.action === 'PUBLISH' && j.status !== 'DRAFT') ||
          (body.action === 'CLOSE' && j.status !== 'PUBLISHED')
        )
          throw new ConflictException('Invalid opportunity transition');
        const status = body.action === 'PUBLISH' ? 'PUBLISHED' : 'CLOSED';
        await c.query(
          'UPDATE pilot16_jobs SET status=$2,actor_id=$3,request_id=$4 WHERE id=$1',
          [id, status, ctx.userId, ctx.requestId],
        );
        await this.jobEvent(c, ctx, id, j.version_id, status);
        return { id, status };
      },
    );
  }
  private async declared(
    c: PoolClient,
    candidate: string,
    content: JobContent,
  ) {
    const p = (
      await c.query(
        'SELECT state,willing_to_relocate FROM candidate_profiles WHERE id=$1',
        [candidate],
      )
    ).rows[0];
    const interest =
      (
        await c.query(
          'SELECT 1 FROM candidate_pathways cp JOIN pathway_versions pv ON pv.pathway_id=cp.pathway_id WHERE cp.candidate_id=$1 AND pv.id=$2',
          [candidate, content.pathwayVersionId],
        )
      ).rowCount !== 0;
    return {
      state: p.state as string,
      willingToRelocate: p.willing_to_relocate as boolean,
      pathwayInterest: interest,
    };
  }
  apply(
    ctx: OperationContext,
    jobId: string,
    body: {
      commandId: string;
      jobVersionId: string;
      snapshotId: string;
      consent: true;
      consentVersion: string;
    },
  ) {
    return this.command(
      ctx,
      'apply:' + jobId,
      body,
      async (c) => {
        await this.candidate(c, ctx);
        const j = await this.job(c, jobId);
        await this.lockOrganization(c, j.organization_id);
        await this.job(c, jobId, undefined, true);
      },
      async (c) => {
        const p = await this.candidate(c, ctx),
          j = await this.job(c, jobId);
        if (j.status !== 'PUBLISHED' || j.version_id !== body.jobVersionId)
          throw new ConflictException('Opportunity terms changed');
        const snapshot = (
          await c.query(
            'SELECT * FROM competency_profile_snapshots WHERE id=$1 AND candidate_id=$2',
            [body.snapshotId, p.id],
          )
        ).rows[0];
        if (!snapshot)
          throw new NotFoundException('Owner snapshot unavailable');
        const input = profileInputSchema.parse(snapshot.input_facts),
          oldProfile = aggregateCompetencyProfile(input);
        if (
          digest(input) !== snapshot.input_digest ||
          digest(oldProfile) !== snapshot.result_digest
        )
          throw new InternalServerErrorException(
            'Snapshot integrity unavailable',
          );
        const content = jobContentSchema.parse(j.content),
          declaration = await this.declared(c, p.id, content),
          captured = pilotMatchingFacts(oldProfile, content, declaration),
          fresh = pilotMatchingFacts(
            aggregateCompetencyProfile(await readProfileFacts(c, p.id)),
            content,
            declaration,
          );
        if (digest(captured) !== digest(fresh))
          throw new ConflictException(
            'Create a current owner snapshot before sharing',
          );
        const id = randomUUID();
        await c.query(
          'INSERT INTO pilot16_applications(id,candidate_id,job_id,job_version_id,snapshot_id,actor_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            id,
            p.id,
            jobId,
            j.version_id,
            body.snapshotId,
            ctx.userId,
            ctx.requestId,
          ],
        );
        await c.query(
          "INSERT INTO pilot16_consent_events(application_id,actor_id,action,terms_version,request_id) VALUES($1,$2,'GIVEN',$3,$4)",
          [id, ctx.userId, body.consentVersion, ctx.requestId],
        );
        await c.query(
          'INSERT INTO pilot16_shares(application_id,facts,facts_digest) VALUES($1,$2,$3)',
          [id, JSON.stringify(captured), digest(captured)],
        );
        await this.appEvent(c, ctx, id, 'APPLIED', 0, null);
        return { id };
      },
    );
  }
  private async ownedApplication(
    c: PoolClient,
    ctx: OperationContext,
    id: string,
    lock = false,
  ) {
    const p = await this.candidate(c, ctx);
    const a = (
      await c.query(
        'SELECT a.*,j.organization_id FROM pilot16_applications a JOIN pilot16_jobs j ON j.id=a.job_id WHERE a.id=$1 AND a.candidate_id=$2',
        [id, p.id],
      )
    ).rows[0];
    if (!a) throw new NotFoundException('Application unavailable');
    if (lock) {
      await this.lockOrganization(c, a.organization_id);
      await c.query(
        'SELECT id FROM pilot16_applications WHERE id=$1 FOR UPDATE',
        [id],
      );
    }
    return a;
  }
  applications(ctx: OperationContext) {
    return this.tx(async (c) => {
      const p = await this.candidate(c, ctx);
      const rows = (
        await c.query(
          'SELECT a.id,a.job_id AS "jobId",a.job_version_id AS "jobVersionId",a.status,a.stage,a.revision,v.content->>\'title\' AS title,(SELECT action FROM pilot16_consent_events e WHERE e.application_id=a.id ORDER BY sequence DESC LIMIT 1) AS consent FROM pilot16_applications a JOIN pilot16_job_versions v ON v.id=a.job_version_id WHERE a.candidate_id=$1 ORDER BY a.created_at DESC,a.id LIMIT 51',
          [p.id],
        )
      ).rows;
      return {
        notice: PILOT_NOTICE,
        applications: rows.slice(0, 50),
        truncated: rows.length > 50,
      };
    });
  }
  private async appEvent(
    c: PoolClient,
    ctx: OperationContext,
    id: string,
    action: string,
    revision: number,
    evaluation: string | null,
  ) {
    await c.query(
      'INSERT INTO pilot16_application_events(application_id,evaluation_id,action,revision,actor_id,request_id) VALUES($1,$2,$3,$4,$5,$6)',
      [id, evaluation, action, revision, ctx.userId, ctx.requestId],
    );
  }
  candidateAction(
    ctx: OperationContext,
    id: string,
    body: { commandId: string },
    withdraw: boolean,
  ) {
    return this.command(
      ctx,
      (withdraw ? 'withdraw:' : 'revoke:') + id,
      body,
      (c) => this.ownedApplication(c, ctx, id, true),
      async (c) => {
        const a = await this.ownedApplication(c, ctx, id);
        await c.query(
          'UPDATE pilot16_organizations SET access_revision=access_revision+1 WHERE organization_id=$1',
          [a.organization_id],
        );
        if (withdraw) {
          if (a.status !== 'ACTIVE')
            throw new ConflictException('Application already withdrawn');
          await c.query(
            "UPDATE pilot16_applications SET status='WITHDRAWN',revision=revision+1,actor_id=$2,request_id=$3 WHERE id=$1",
            [id, ctx.userId, ctx.requestId],
          );
          await this.appEvent(c, ctx, id, 'WITHDRAWN', a.revision + 1, null);
        }
        await c.query(
          "INSERT INTO pilot16_consent_events(application_id,actor_id,action,terms_version,request_id) VALUES($1,$2,'REVOKED','pilot-share-1',$3)",
          [id, ctx.userId, ctx.requestId],
        );
        return { id, status: withdraw ? 'WITHDRAWN' : 'ACCESS_REVOKED' };
      },
    );
  }
  private async employerApplication(
    c: PoolClient,
    ctx: OperationContext,
    org: string,
    id: string,
  ) {
    await this.employer(c, ctx, org);
    const a = (
      await c.query(
        'SELECT a.*,v.content,j.current_version,j.status AS job_status,v.version FROM pilot16_applications a JOIN pilot16_jobs j ON j.id=a.job_id JOIN pilot16_job_versions v ON v.id=a.job_version_id WHERE a.id=$1 AND j.organization_id=$2 FOR UPDATE OF a',
        [id, org],
      )
    ).rows[0];
    if (
      !a ||
      !(await c.query('SELECT pilot16_access($1,$2) AS ok', [id, ctx.userId]))
        .rows[0]?.ok
    )
      throw new NotFoundException('Application unavailable');
    return a;
  }
  employerApplications(ctx: OperationContext, org: string, jobId: string) {
    return this.tx(async (c) => {
      await this.employer(c, ctx, org);
      await this.job(c, jobId, org);
      const rows = (
        await c.query(
          'SELECT a.id,a.alias AS "candidateAlias",a.stage,a.revision FROM pilot16_applications a WHERE a.job_id=$1 AND pilot16_access(a.id,$2) ORDER BY a.created_at,a.id LIMIT 51',
          [jobId, ctx.userId],
        )
      ).rows;
      await audit(
        c,
        ctx.userId,
        'recruitment.application.list',
        'technical_pilot',
        jobId,
        ctx.requestId,
      );
      return {
        notice: PILOT_NOTICE,
        applications: rows.slice(0, 50),
        truncated: rows.length > 50,
      };
    });
  }
  private async currentInput(c: PoolClient, a: RecordRow) {
    if (a.job_status !== 'PUBLISHED' || a.current_version !== a.version)
      throw new ConflictException(
        'Opportunity terms changed; candidate must apply to the current version',
      );
    const content = jobContentSchema.parse(a.content);
    const saved = (
      await c.query(
        'SELECT facts,facts_digest FROM pilot16_shares WHERE application_id=$1',
        [a.id],
      )
    ).rows[0];
    if (!saved)
      throw new InternalServerErrorException('Shared projection unavailable');
    const facts = matchingFactsSchema.parse(saved.facts);
    if (digest(facts) !== saved.facts_digest)
      throw new InternalServerErrorException(
        'Shared projection integrity unavailable',
      );
    const candidate = identifier(a.candidate_id);
    const current = pilotMatchingFacts(
      aggregateCompetencyProfile(await readProfileFacts(c, candidate)),
      content,
      await this.declared(c, candidate, content),
    );
    if (digest(facts) !== digest(current))
      throw new ConflictException(
        'Shared facts changed; candidate must refresh their application',
      );
    return matchingInputSchema.parse({
      engineVersion: 'pilot-match-1',
      policyVersion: 'pilot-policy-1',
      jobVersionId: a.job_version_id,
      pathwayVersionId: content.pathwayVersionId,
      requirements: content.requirements,
      facts,
    });
  }
  evaluate(
    ctx: OperationContext,
    org: string,
    id: string,
    body: { commandId: string },
  ) {
    return this.command(
      ctx,
      'evaluate:' + id,
      body,
      (c) => this.employerApplication(c, ctx, org, id),
      async (c) => {
        const a = await this.employerApplication(c, ctx, org, id),
          input = await this.currentInput(c, a),
          result = evaluatePilotMatch(input);
        const row = (
          await c.query(
            'INSERT INTO pilot16_evaluations(application_id,actor_id,policy_id,input,result,input_digest,result_digest,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
            [
              id,
              ctx.userId,
              input.policyVersion,
              JSON.stringify(input),
              JSON.stringify(result),
              digest(input),
              digest(result),
              ctx.requestId,
            ],
          )
        ).rows[0];
        return { id: row.id };
      },
    );
  }
  explanation(
    ctx: OperationContext,
    org: string,
    id: string,
    evaluationId: string,
  ) {
    return this.tx(async (c) => {
      const a = await this.employerApplication(c, ctx, org, id),
        fresh = await this.currentInput(c, a);
      const e = (
        await c.query(
          'SELECT * FROM pilot16_evaluations WHERE id=$1 AND application_id=$2',
          [evaluationId, id],
        )
      ).rows[0];
      if (!e) throw new NotFoundException('Evaluation unavailable');
      const input = matchingInputSchema.parse(e.input),
        result = evaluatePilotMatch(input);
      if (
        digest(input) !== e.input_digest ||
        digest(result) !== e.result_digest ||
        profileCanonicalJson(result) !== profileCanonicalJson(e.result)
      )
        throw new InternalServerErrorException(
          'Evaluation integrity unavailable',
        );
      if (digest(fresh) !== e.input_digest)
        throw new ConflictException('Evaluation stale');
      await audit(
        c,
        ctx.userId,
        'recruitment.projection.read',
        'technical_pilot',
        id,
        ctx.requestId,
      );
      return {
        id: e.id,
        evaluatedAt: e.evaluated_at,
        projection: employerPilotProjection(String(a.alias), input, result),
      };
    });
  }
  shortlist(
    ctx: OperationContext,
    org: string,
    id: string,
    body: {
      commandId: string;
      evaluationId: string;
      expectedRevision: number;
      action: 'REVIEW' | 'SHORTLIST' | 'REMOVE';
    },
  ) {
    return this.command(
      ctx,
      'shortlist:' + id,
      body,
      (c) => this.employerApplication(c, ctx, org, id),
      async (c) => {
        const a = await this.employerApplication(c, ctx, org, id);
        if (a.revision !== body.expectedRevision)
          throw new ConflictException('Stale application revision');
        const input = await this.currentInput(c, a),
          e = (
            await c.query(
              'SELECT * FROM pilot16_evaluations WHERE id=$1 AND application_id=$2',
              [body.evaluationId, id],
            )
          ).rows[0];
        if (!e) throw new NotFoundException('Evaluation unavailable');
        const result = evaluatePilotMatch(input);
        if (
          digest(input) !== e.input_digest ||
          digest(result) !== e.result_digest ||
          profileCanonicalJson(result) !== profileCanonicalJson(e.result)
        )
          throw new ConflictException(
            'Evaluation stale or integrity unavailable',
          );
        if (body.action === 'SHORTLIST' && result.eligibility !== 'ELIGIBLE')
          throw new ConflictException(
            'Mandatory technical gates not met; human review remains available',
          );
        await c.query(
          'UPDATE pilot16_applications SET stage=$2,revision=revision+1,actor_id=$3,request_id=$4 WHERE id=$1',
          [id, body.action, ctx.userId, ctx.requestId],
        );
        await this.appEvent(
          c,
          ctx,
          id,
          body.action,
          a.revision + 1,
          body.evaluationId,
        );
        return { id, stage: body.action, revision: a.revision + 1 };
      },
    );
  }
}
