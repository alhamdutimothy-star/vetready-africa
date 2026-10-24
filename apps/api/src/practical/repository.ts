import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type {
  PracticalCreateInput,
  PracticalSaveInput,
  PracticalDecisionInput,
} from '@vetready/contracts';
import {
  CANDIDATE_DECLARATION,
  PRACTICAL_NOTICE,
  practicalGaps,
  hasPermission,
  type Permission,
  type PracticalGapSource,
} from '@vetready/domain';
import { Database, audit } from '../database';
import type { OperationContext } from '../service';

@Injectable()
export class PracticalRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  private require(ctx: OperationContext, permission: Permission) {
    if (!hasPermission(ctx.grants, permission))
      throw new ForbiddenException('Permission required');
  }
  private async transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(fn);
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e) {
        if (['23505', '40001', '40P01'].includes(String(e.code)))
          throw new ConflictException('Practical evidence state conflict');
        if (
          ['23503', '23514', '23502'].includes(String(e.code)) ||
          (e.code === 'P0001' &&
            'message' in e &&
            /^(Practical |Complete practical |Declared practical |Target child |Submitted mapping)/.test(
              String(e.message),
            ))
        )
          throw new UnprocessableEntityException(
            'Practical evidence reference or lifecycle invalid',
          );
      }
      throw e;
    }
  }
  private async version(c: PoolClient, id: string) {
    // Lock the stable submission before its version, consistently with database guards.
    const parent = (
      await c.query(
        'SELECT submission_id FROM evidence_submission_versions WHERE id=$1 AND practical',
        [id],
      )
    ).rows[0];
    if (!parent) throw new NotFoundException('Practical evidence unavailable');
    await c.query(
      'SELECT id FROM evidence_submissions WHERE id=$1 FOR UPDATE',
      [parent.submission_id],
    );
    const v = (
      await c.query(
        'SELECT v.*,s.created_by AS owner_id FROM evidence_submission_versions v JOIN evidence_submissions s ON s.id=v.submission_id WHERE v.id=$1 FOR UPDATE OF v',
        [id],
      )
    ).rows[0];
    return v;
  }
  private owner(ctx: OperationContext, v: { owner_id: string }) {
    this.require(ctx, 'candidate:own');
    if (v.owner_id !== ctx.userId)
      throw new NotFoundException('Practical evidence unavailable');
  }
  create(ctx: OperationContext, input: PracticalCreateInput) {
    this.require(ctx, 'candidate:own');
    return this.transaction(async (c) => {
      const candidate = (
        await c.query('SELECT id FROM candidate_profiles WHERE user_id=$1', [
          ctx.userId,
        ])
      ).rows[0];
      if (!candidate)
        throw new ConflictException('Create your candidate profile first');
      const s = (
        await c.query(
          'INSERT INTO evidence_submissions(candidate_id,created_by) VALUES($1,$2) RETURNING id',
          [candidate.id, ctx.userId],
        )
      ).rows[0];
      return (
        await c.query(
          `INSERT INTO evidence_submission_versions(submission_id,candidate_id,version,pathway_version_id,kind,summary,context,demo,practical,change_actor_id,change_reason,change_request_id) VALUES($1,$2,1,$3,$4,'','{"task":""}',true,true,$5,'Candidate created practical draft',$6) RETURNING id,submission_id,version,status,draft_revision`,
          [
            s.id,
            candidate.id,
            input.pathwayVersionId,
            input.kind,
            ctx.userId,
            ctx.requestId,
          ],
        )
      ).rows[0];
    });
  }
  save(ctx: OperationContext, id: string, input: PracticalSaveInput) {
    return this.transaction(async (c) => {
      const v = await this.version(c, id);
      this.owner(ctx, v);
      const hash = createHash('sha256')
        .update(JSON.stringify(input))
        .digest('hex');
      const replay = (
        await c.query(
          'SELECT revision,payload_hash FROM practical_draft_commands WHERE version_id=$1 AND command_id=$2',
          [id, input.commandId],
        )
      ).rows[0];
      if (replay) {
        if (replay.payload_hash !== hash)
          throw new ConflictException('Save command payload changed');
        return { revision: replay.revision, replay: true };
      }
      if (v.status !== 'DRAFT' || v.draft_revision !== input.expectedRevision)
        throw new ConflictException('Newer draft or submitted version exists');
      await c.query(
        'UPDATE evidence_submission_versions SET summary=$2,context=$3,draft_revision=draft_revision+1,change_actor_id=$4,change_request_id=$5,change_reason=$6 WHERE id=$1',
        [
          id,
          input.payload.summary,
          JSON.stringify(input.payload.context),
          ctx.userId,
          ctx.requestId,
          'Candidate saved partial practical evidence',
        ],
      );
      await c.query(
        'DELETE FROM evidence_submission_competencies WHERE submission_version_id=$1',
        [id],
      );
      for (const t of input.payload.targets)
        await c.query(
          'INSERT INTO evidence_submission_competencies(submission_version_id,candidate_id,child_version_id,requested_facet) VALUES($1,$2,$3,$4)',
          [id, v.candidate_id, t.childVersionId, t.requestedFacet],
        );
      await c.query(
        'INSERT INTO practical_draft_commands(version_id,command_id,revision,payload_hash,actor_id,request_id) VALUES($1,$2,$3,$4,$5,$6)',
        [
          id,
          input.commandId,
          v.draft_revision + 1,
          hash,
          ctx.userId,
          ctx.requestId,
        ],
      );
      return { revision: v.draft_revision + 1, replay: false };
    });
  }
  private async transition(
    c: PoolClient,
    ctx: OperationContext,
    id: string,
    state: string,
    reason: string,
  ) {
    await c.query(
      'UPDATE evidence_submission_versions SET status=$2,change_actor_id=$3,change_reason=$4,change_request_id=$5 WHERE id=$1 AND status<>$2',
      [id, state, ctx.userId, reason, ctx.requestId],
    );
  }
  submit(ctx: OperationContext, id: string, expectedRevision: number) {
    return this.transaction(async (c) => {
      const v = await this.version(c, id);
      this.owner(ctx, v);
      if (v.status !== 'DRAFT' || v.draft_revision !== expectedRevision)
        throw new ConflictException('Draft revision changed');
      await c.query(
        'INSERT INTO practical_declarations(version_id,actor_id,revision,declaration,request_id) VALUES($1,$2,$3,$4,$5)',
        [
          id,
          ctx.userId,
          expectedRevision,
          CANDIDATE_DECLARATION,
          ctx.requestId,
        ],
      );
      await this.transition(
        c,
        ctx,
        id,
        v.version === 1 ? 'SUBMITTED' : 'RESUBMITTED',
        'Candidate declared and submitted practical evidence',
      );
      await c.query(
        `INSERT INTO competency_evidence(candidate_id,child_version_id,facet,demo,observation,context,source_kind,submission_version_id) SELECT v.candidate_id,m.child_version_id,m.requested_facet,true,'REQUIRES_REVIEW',v.context,'EXTERNAL_SUBMISSION',v.id FROM evidence_submission_versions v JOIN evidence_submission_competencies m ON m.submission_version_id=v.id WHERE v.id=$1`,
        [id],
      );
      return {
        id,
        status: v.version === 1 ? 'SUBMITTED' : 'RESUBMITTED',
        competenceVerified: false,
      };
    });
  }
  withdraw(ctx: OperationContext, id: string, reason: string) {
    return this.transaction(async (c) => {
      const v = await this.version(c, id);
      this.owner(ctx, v);
      if (!['DRAFT', 'SUBMITTED', 'RESUBMITTED'].includes(v.status))
        throw new ConflictException('Withdrawal unavailable');
      await this.transition(c, ctx, id, 'WITHDRAWN', reason);
      return { id, status: 'WITHDRAWN' };
    });
  }
  revise(ctx: OperationContext, id: string, reason: string) {
    return this.transaction(async (c) => {
      const v = await this.version(c, id);
      this.owner(ctx, v);
      const latest = (
        await c.query(
          'SELECT id FROM evidence_submission_versions WHERE submission_id=$1 ORDER BY version DESC LIMIT 1',
          [v.submission_id],
        )
      ).rows[0];
      if (
        latest.id !== id ||
        ![
          'WITHDRAWN',
          'SUBMITTED',
          'RESUBMITTED',
          'UNDER_REVIEW',
          'REVIEWED',
          'NEEDS_REVISION',
          'REJECTED',
          'REVOKED',
        ].includes(v.status)
      )
        throw new ConflictException('Latest eligible version required');
      if (!['WITHDRAWN', 'REVOKED'].includes(v.status))
        await this.transition(c, ctx, id, 'SUPERSEDED', reason);
      const next = (
        await c.query(
          `INSERT INTO evidence_submission_versions(submission_id,candidate_id,version,previous_version_id,pathway_version_id,kind,summary,context,demo,practical,change_actor_id,change_reason,change_request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,true,$9,$10,$11) RETURNING id,version,status,draft_revision`,
          [
            v.submission_id,
            v.candidate_id,
            v.version + 1,
            id,
            v.pathway_version_id,
            v.kind,
            v.summary,
            v.context,
            ctx.userId,
            reason,
            ctx.requestId,
          ],
        )
      ).rows[0];
      await c.query(
        'INSERT INTO evidence_submission_competencies SELECT $1,candidate_id,child_version_id,requested_facet FROM evidence_submission_competencies WHERE submission_version_id=$2',
        [next.id, id],
      );
      return next;
    });
  }
  assign(
    ctx: OperationContext,
    id: string,
    assessorId: string,
    reason: string,
  ) {
    this.require(ctx, 'assessment:assign');
    return this.transaction(async (c) => {
      const v = await this.version(c, id);
      if (!['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'].includes(v.status))
        throw new ConflictException('Submitted evidence required');
      const a = (
        await c.query(
          'INSERT INTO practical_review_assignments(version_id,assessor_id,actor_id,reason,request_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [id, assessorId, ctx.userId, reason, ctx.requestId],
        )
      ).rows[0];
      await this.transition(c, ctx, id, 'UNDER_REVIEW', reason);
      return a;
    });
  }
  decide(ctx: OperationContext, id: string, input: PracticalDecisionInput) {
    this.require(ctx, 'assessment:review');
    return this.transaction(async (c) => {
      const v = await this.version(c, id);
      const a = (
        await c.query(
          'SELECT * FROM practical_review_assignments WHERE version_id=$1 ORDER BY sequence DESC LIMIT 1',
          [id],
        )
      ).rows[0];
      if (!a || a.assessor_id !== ctx.userId || v.owner_id === ctx.userId)
        throw new NotFoundException('Assigned review unavailable');
      const prior = (
        await c.query(
          'SELECT id FROM practical_review_decisions WHERE version_id=$1 ORDER BY sequence DESC LIMIT 1',
          [id],
        )
      ).rows[0];
      if (
        (prior?.id ?? null) !== (input.supersedesDecisionId ?? null) ||
        !['UNDER_REVIEW', 'REVIEWED', 'NEEDS_REVISION', 'REJECTED'].includes(
          v.status,
        )
      )
        throw new ConflictException(
          'Latest decision and active version required',
        );
      const d = (
        await c.query(
          'INSERT INTO practical_review_decisions(assignment_id,version_id,actor_id,outcome,rationale,conflict_declared_clear,supersedes_decision_id,request_id) VALUES($1,$2,$3,$4,$5,true,$6,$7) RETURNING id,outcome,created_at',
          [
            a.id,
            id,
            ctx.userId,
            input.outcome,
            input.rationale,
            input.supersedesDecisionId ?? null,
            ctx.requestId,
          ],
        )
      ).rows[0];
      await this.transition(
        c,
        ctx,
        id,
        input.outcome === 'DEMONSTRATED_IN_DEMO' ? 'REVIEWED' : input.outcome,
        'Assessor finalized private demonstration review',
      );
      return { ...d, competenceVerified: false, notice: PRACTICAL_NOTICE };
    });
  }
  revoke(ctx: OperationContext, id: string, reason: string) {
    this.require(ctx, 'assessment:assign');
    return this.transaction(async (c) => {
      const v = await this.version(c, id);
      if (['DRAFT', 'WITHDRAWN', 'SUPERSEDED', 'REVOKED'].includes(v.status))
        throw new ConflictException('Revocation unavailable');
      await this.transition(c, ctx, id, 'REVOKED', reason);
      return { id, status: 'REVOKED' };
    });
  }
  async list(ctx: OperationContext, staff = false) {
    this.require(ctx, staff ? 'assessment:review' : 'candidate:own');
    const rows = (
      await this.db.pool.query(
        `SELECT v.id,v.submission_id,v.version,v.status,v.draft_revision,v.summary,v.created_at FROM evidence_submission_versions v JOIN evidence_submissions s ON s.id=v.submission_id WHERE v.practical AND ${staff ? `v.status NOT IN ('DRAFT','WITHDRAWN','SUPERSEDED','REVOKED') AND (SELECT assessor_id FROM practical_review_assignments WHERE version_id=v.id ORDER BY sequence DESC LIMIT 1)=$1` : 's.created_by=$1'} ORDER BY v.created_at DESC,v.id LIMIT 101`,
        [ctx.userId],
      )
    ).rows;
    return {
      versions: rows.slice(0, 100),
      truncated: rows.length > 100,
      notice: PRACTICAL_NOTICE,
    };
  }
  adminList(ctx: OperationContext) {
    this.require(ctx, 'assessment:assign');
    return this.transaction(async (c) => {
      await audit(
        c,
        ctx.userId,
        'practical.admin.queue.read',
        'evidence_submission_version',
        null,
        ctx.requestId,
      );
      const rows = (
        await c.query(
          `SELECT id,submission_id,version,status,draft_revision FROM evidence_submission_versions WHERE practical AND status NOT IN ('DRAFT','WITHDRAWN') ORDER BY created_at DESC,id LIMIT 101`,
        )
      ).rows;
      return {
        versions: rows.slice(0, 100),
        truncated: rows.length > 100,
        notice: PRACTICAL_NOTICE,
      };
    });
  }
  detail(
    ctx: OperationContext,
    id: string,
    access: 'owner' | 'review' | 'admin' = 'owner',
  ) {
    this.require(
      ctx,
      access === 'owner'
        ? 'candidate:own'
        : access === 'review'
          ? 'assessment:review'
          : 'assessment:assign',
    );
    return this.transaction(async (c) => {
      const v = await this.version(c, id);
      if (access === 'owner') this.owner(ctx, v);
      if (access === 'review') {
        const a = (
          await c.query(
            'SELECT assessor_id FROM practical_review_assignments WHERE version_id=$1 ORDER BY sequence DESC LIMIT 1',
            [id],
          )
        ).rows[0];
        if (
          a?.assessor_id !== ctx.userId ||
          v.owner_id === ctx.userId ||
          ['DRAFT', 'WITHDRAWN'].includes(v.status)
        )
          throw new NotFoundException('Assigned review unavailable');
      }
      if (access === 'admin')
        await audit(
          c,
          ctx.userId,
          'practical.admin.read',
          'evidence_submission_version',
          id,
          ctx.requestId,
        );
      const targets = (
        await c.query(
          'SELECT child_version_id AS "childVersionId",requested_facet AS "requestedFacet" FROM evidence_submission_competencies WHERE submission_version_id=$1 ORDER BY child_version_id,requested_facet',
          [id],
        )
      ).rows;
      const declaration =
        (
          await c.query(
            'SELECT actor_id,revision,declaration,created_at FROM practical_declarations WHERE version_id=$1',
            [id],
          )
        ).rows[0] ?? null;
      const decisions = (
        await c.query(
          'SELECT id,assignment_id,actor_id,outcome,rationale,supersedes_decision_id,created_at FROM practical_review_decisions WHERE version_id=$1 ORDER BY sequence',
          [id],
        )
      ).rows;
      const assignments =
        access === 'owner'
          ? undefined
          : (
              await c.query(
                'SELECT id,assessor_id,actor_id,reason,created_at FROM practical_review_assignments WHERE version_id=$1 ORDER BY sequence',
                [id],
              )
            ).rows;
      const events = (
        await c.query(
          'SELECT from_status,to_status,actor_id,reason,request_id,created_at FROM evidence_status_events WHERE submission_version_id=$1 ORDER BY created_at,id',
          [id],
        )
      ).rows;
      const history = (
        await c.query(
          'SELECT id,version,previous_version_id,status FROM evidence_submission_versions WHERE submission_id=$1 ORDER BY version',
          [v.submission_id],
        )
      ).rows;
      return {
        version: v,
        targets,
        declaration,
        decisions,
        assignments,
        events,
        history,
        notice: PRACTICAL_NOTICE,
        competenceVerified: false,
        readiness: null,
      };
    });
  }
  async options(ctx: OperationContext) {
    this.require(ctx, 'candidate:own');
    return (
      await this.db.pool.query(
        `SELECT DISTINCT pv.id AS "pathwayVersionId",pw.name AS "pathwayName",pv.version AS "pathwayVersion",cv.id AS "childVersionId",ch.code,cv.statement FROM pathway_versions pv JOIN pathways pw ON pw.id=pv.pathway_id JOIN pathway_competencies pc ON pc.pathway_version_id=pv.id JOIN child_group_mappings m ON m.group_version_id=pc.competency_version_id JOIN child_competency_versions cv ON cv.id=m.child_version_id JOIN child_competencies ch ON ch.id=cv.child_id ORDER BY ch.code,pv.id`,
      )
    ).rows;
  }
  gaps(ctx: OperationContext, pathway: string) {
    this.require(ctx, 'candidate:own');
    return this.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const children = (
        await c.query(
          `SELECT DISTINCT m.child_version_id AS "childVersionId",COALESCE(f.facet,'NOT_CONFIGURED') AS facet FROM child_group_mappings m JOIN pathway_competencies p ON p.competency_version_id=m.group_version_id LEFT JOIN pathway_child_requirements r ON r.pathway_version_id=p.pathway_version_id AND r.child_version_id=m.child_version_id LEFT JOIN LATERAL unnest(r.proposed_facets) AS f(facet) ON true WHERE p.pathway_version_id=$1 ORDER BY m.child_version_id,facet`,
          [pathway],
        )
      ).rows;
      if (!children.length) throw new NotFoundException('Pathway unavailable');
      const sources = (
        await c.query<PracticalGapSource>(
          `SELECT e.id,e.submission_version_id AS "submissionVersionId",e.child_version_id AS "childVersionId",e.facet,e.status,e.demo,v.status AS state,(SELECT outcome FROM practical_review_decisions WHERE version_id=v.id ORDER BY sequence DESC LIMIT 1) AS decision,e.valid_until::text AS "validUntil" FROM competency_evidence e JOIN candidate_profiles p ON p.id=e.candidate_id LEFT JOIN evidence_submission_versions v ON v.id=e.submission_version_id WHERE p.user_id=$1
      UNION ALL SELECT v.id,v.id,m.child_version_id,m.requested_facet,'UNVERIFIED',v.demo,v.status,NULL,NULL FROM evidence_submission_versions v JOIN candidate_profiles p ON p.id=v.candidate_id JOIN evidence_submission_competencies m ON m.submission_version_id=v.id WHERE p.user_id=$1 AND v.practical AND NOT EXISTS(SELECT 1 FROM competency_evidence WHERE submission_version_id=v.id)`,
          [ctx.userId],
        )
      ).rows;
      return {
        pathwayVersionId: pathway,
        gaps: practicalGaps(children, sources),
        notice: PRACTICAL_NOTICE,
        readinessRulesActive: false,
        readiness: null,
      };
    });
  }
}
