import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type {
  VerificationSubmission,
  VerificationEvent,
  VerificationAssignment,
} from '@vetready/contracts';
import { hasPermission, profileCanonicalJson } from '@vetready/domain';
import { verificationCriteriaSchema } from '@vetready/contracts';
import { Database } from '../database';
import type { OperationContext } from '../service';
import { readGovernedVerification } from './projection';
const digest = (input: unknown) =>
  createHash('sha256').update(profileCanonicalJson(input)).digest('hex');
const criteria = (value: unknown) => {
  const parsed = verificationCriteriaSchema.safeParse(value);
  if (!parsed.success)
    throw new ConflictException('Verification governance unavailable');
  return parsed.data;
};
@Injectable()
export class VerificationRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  private async transaction<T>(fn: (c: PoolClient) => Promise<T>) {
    try {
      return await this.db.transaction(fn);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        if (['23505', '40001', '40P01'].includes(String(error.code)))
          throw new ConflictException(
            'Verification command or revision conflict',
          );
        if (['23503', '23514', '23502', '22P02'].includes(String(error.code)))
          throw new UnprocessableEntityException(
            'Invalid verification reference',
          );
        if (
          error.code === 'P0001' &&
          'message' in error &&
          String(error.message).startsWith('Verification ')
        )
          throw new ConflictException(
            'Verification governance or lifecycle requirements not met',
          );
      }
      throw error;
    }
  }
  private async owner(c: PoolClient, ctx: OperationContext) {
    if (!hasPermission(ctx.grants, 'candidate:own'))
      throw new ForbiddenException();
    const p = (
      await c.query(
        "SELECT p.id FROM candidate_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND u.status='ACTIVE' FOR UPDATE OF p",
        [ctx.userId],
      )
    ).rows[0];
    if (!p) throw new NotFoundException('Candidate profile unavailable');
    return p.id as string;
  }
  options(ctx: OperationContext) {
    return this.transaction(async (c) => {
      await this.owner(c, ctx);
      return (
        await c.query(
          `SELECT r.id,r.pathway_version_id AS "pathwayVersionId",r.child_version_id AS "childVersionId",cv.statement,ch.code AS "childCode",r.version,r.method,r.facet,r.status,r.demo,r.criteria,r.allowed_processes AS "allowedProcesses" FROM verification_rubric_versions r JOIN child_competency_versions cv ON cv.id=r.child_version_id JOIN child_competencies ch ON ch.id=cv.child_id WHERE verification18_valid_criteria(r.criteria) AND NOT EXISTS(SELECT 1 FROM verification_governance_revocations x WHERE x.rubric_version_id=r.id) ORDER BY r.id`,
        )
      ).rows;
    });
  }
  submit(ctx: OperationContext, b: VerificationSubmission) {
    return this.transaction(async (c) => {
      const owner = await this.owner(c, ctx),
        hash = digest(b);
      const old = (
        await c.query(
          'SELECT id,input_digest FROM verification_cases WHERE candidate_id=$1 AND command_id=$2',
          [owner, b.commandId],
        )
      ).rows[0];
      if (old) {
        if (old.input_digest !== hash)
          throw new ConflictException('Command meaning changed');
        return { id: old.id, replay: true };
      }
      const r = (
        await c.query(
          'SELECT * FROM verification_rubric_versions WHERE id=$1 FOR SHARE',
          [b.rubricVersionId],
        )
      ).rows[0];
      if (!r) throw new UnprocessableEntityException('Rubric unavailable');
      criteria(r.criteria);
      const s = (
        await c.query(
          'INSERT INTO evidence_submissions(candidate_id,created_by) VALUES($1,$2) RETURNING id',
          [owner, ctx.userId],
        )
      ).rows[0];
      const v = (
        await c.query(
          `INSERT INTO evidence_submission_versions(submission_id,candidate_id,version,pathway_version_id,kind,summary,context,demo,change_actor_id,change_reason,change_request_id) VALUES($1,$2,1,$3,'CANDIDATE_REPORT',$4,$5,$6,$7,'Candidate submitted governed evidence',$8) RETURNING id`,
          [
            s.id,
            owner,
            r.pathway_version_id,
            b.summary,
            JSON.stringify({ task: b.activity }),
            r.demo,
            ctx.userId,
            ctx.requestId,
          ],
        )
      ).rows[0];
      await c.query(
        'INSERT INTO evidence_submission_competencies(submission_version_id,candidate_id,child_version_id,requested_facet) VALUES($1,$2,$3,$4)',
        [v.id, owner, r.child_version_id, r.facet],
      );
      await c.query(
        "SELECT transition_evidence_submission($1,$2,'DRAFT','SUBMITTED','Candidate declared governed evidence',$3)",
        [v.id, ctx.userId, ctx.requestId],
      );
      const e = (
        await c.query(
          `INSERT INTO competency_evidence(candidate_id,child_version_id,facet,demo,observation,context,source_kind,submission_version_id) VALUES($1,$2,$3,$4,'REQUIRES_REVIEW',$5,'EXTERNAL_SUBMISSION',$6) RETURNING id`,
          [
            owner,
            r.child_version_id,
            r.facet,
            r.demo,
            JSON.stringify({ task: b.activity }),
            v.id,
          ],
        )
      ).rows[0];
      const result = (
        await c.query(
          `INSERT INTO verification_cases(candidate_id,evidence_id,rubric_version_id,previous_case_id,activity,performed_at,location_type,process,declaration,actor_id,command_id,input_digest,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,$12) RETURNING id`,
          [
            owner,
            e.id,
            r.id,
            b.previousCaseId ?? null,
            b.activity,
            b.performedAt,
            b.locationType,
            b.process,
            ctx.userId,
            b.commandId,
            hash,
            ctx.requestId,
          ],
        )
      ).rows[0];
      return { id: result.id, replay: false };
    });
  }
  list(ctx: OperationContext, role: 'owner' | 'assessor' | 'admin' = 'owner') {
    return this.transaction(async (c) => {
      if (role === 'owner') {
        const owner = await this.owner(c, ctx);
        return readGovernedVerification(c, owner);
      }
      if (
        !hasPermission(
          ctx.grants,
          role === 'admin' ? 'assessment:assign' : 'assessment:review',
        )
      )
        throw new ForbiddenException();
      return (
        await c.query(
          `SELECT v.id,r.child_version_id AS "childVersionId",r.method,
      coalesce((SELECT max(revision) FROM verification_case_events WHERE case_id=v.id),0) AS revision
      FROM verification_cases v JOIN verification_rubric_versions r ON r.id=v.rubric_version_id
      WHERE NOT EXISTS(SELECT 1 FROM verification_cases s WHERE s.previous_case_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM verification_case_events x WHERE x.case_id=v.id AND x.kind='WITHDRAW')
      ${role === 'assessor' ? `AND (SELECT assessor_id FROM verification_case_events WHERE case_id=v.id AND kind='ASSIGN' ORDER BY revision DESC LIMIT 1)=$1 AND NOT EXISTS(SELECT 1 FROM verification_case_events x WHERE x.case_id=v.id AND x.kind='RECUSE' AND x.actor_id=$1) AND (r.demo OR verification18_authorized($1,r.id)) AND NOT EXISTS(SELECT 1 FROM verification_governance_revocations x WHERE x.rubric_version_id=r.id)` : ''}
      ORDER BY v.created_at,v.id LIMIT 100`,
          role === 'assessor' ? [ctx.userId] : [],
        )
      ).rows;
    });
  }
  private async access(
    c: PoolClient,
    ctx: OperationContext,
    id: string,
    role: 'owner' | 'assessor' | 'admin',
    recusalOnly = false,
  ) {
    const v = (
      await c.query(
        `SELECT v.*,p.user_id,r.criteria,r.demo,r.status AS rubric_status,r.moderation_required,r.facet,r.child_version_id,r.pathway_version_id FROM verification_cases v JOIN candidate_profiles p ON p.id=v.candidate_id JOIN verification_rubric_versions r ON r.id=v.rubric_version_id WHERE v.id=$1 FOR UPDATE OF v`,
        [id],
      )
    ).rows[0];
    if (!v) throw new NotFoundException('Private verification unavailable');
    const assignment = (
      await c.query(
        "SELECT * FROM verification_case_events WHERE case_id=$1 AND kind='ASSIGN' ORDER BY revision DESC LIMIT 1",
        [id],
      )
    ).rows[0];
    const permission =
      role === 'owner'
        ? 'candidate:own'
        : role === 'admin'
          ? 'assessment:assign'
          : 'assessment:review';
    // Former deciding reviewers may declare their own conflict, but this path
    // never authorizes a private read, new review or decision.
    const formerDecider =
      recusalOnly &&
      role === 'assessor' &&
      Boolean(
        (
          await c.query(
            "SELECT 1 FROM verification_case_events WHERE case_id=$1 AND kind='DECISION' AND actor_id=$2",
            [id, ctx.userId],
          )
        ).rowCount,
      );
    if (
      !hasPermission(ctx.grants, permission) ||
      (role === 'owner'
        ? v.user_id !== ctx.userId
        : role === 'assessor'
          ? (!formerDecider && assignment?.assessor_id !== ctx.userId) ||
            v.user_id === ctx.userId
          : false)
    )
      throw new NotFoundException('Private verification unavailable');
    if (
      role === 'assessor' &&
      !recusalOnly &&
      (
        await c.query(
          "SELECT 1 FROM verification_case_events WHERE case_id=$1 AND kind='RECUSE' AND actor_id=$2",
          [id, ctx.userId],
        )
      ).rowCount
    )
      throw new NotFoundException('Private verification unavailable');
    if (
      role === 'assessor' &&
      !recusalOnly &&
      !(
        await c.query(
          `SELECT (r.demo OR verification18_authorized($1,r.id)) AND NOT EXISTS(SELECT 1 FROM verification_governance_revocations x WHERE x.rubric_version_id=r.id) AS allowed FROM verification_rubric_versions r WHERE r.id=$2`,
          [ctx.userId, v.rubric_version_id],
        )
      ).rows[0]?.allowed
    )
      throw new NotFoundException('Private verification unavailable');
    if (!recusalOnly) v.criteria = criteria(v.criteria);
    return v;
  }
  detail(
    ctx: OperationContext,
    id: string,
    role: 'owner' | 'assessor' | 'admin',
  ) {
    return this.transaction(async (c) => {
      const v = await this.access(c, ctx, id, role);
      const events = (
        await c.query(
          'SELECT * FROM verification_case_events WHERE case_id=$1 ORDER BY revision',
          [id],
        )
      ).rows;
      const revision = events.at(-1)?.revision ?? 0;
      if (role === 'owner')
        return {
          id,
          revision,
          submissionId: v.evidence_id,
          criteria: v.criteria,
          result:
            (await readGovernedVerification(c, v.candidate_id)).find(
              (x) => x.caseId === id,
            ) ?? null,
          history: events.map((e) => ({
            id: e.id,
            kind: e.kind,
            revision: e.revision,
            outcome: e.outcome,
            createdAt: e.created_at,
            candidateExplanation:
              e.kind === 'DECISION'
                ? e.payload.candidateExplanation
                : undefined,
            evidenceLevelBefore:
              e.kind === 'DECISION' ? e.payload.evidenceLevelBefore : undefined,
            evidenceLevelAfter:
              e.kind === 'DECISION' ? e.payload.evidenceLevelAfter : undefined,
          })),
        };
      // Assignment operators get references/history, not candidate evidence or assessor narratives.
      if (role === 'admin')
        return {
          id,
          revision,
          childVersionId: v.child_version_id,
          history: events.map((e) => ({
            id: e.id,
            kind: e.kind,
            revision: e.revision,
            assessorId: e.assessor_id,
            outcome: e.outcome,
          })),
        };
      const evidence = (
        await c.query(
          'SELECT e.id,v.summary FROM competency_evidence e JOIN evidence_submission_versions v ON v.id=e.submission_version_id WHERE e.id=$1',
          [v.evidence_id],
        )
      ).rows[0];
      return {
        id,
        revision,
        rubricVersionId: v.rubric_version_id,
        criteria: v.criteria,
        facet: v.facet,
        demo: v.demo,
        activity: v.activity,
        performedAt: v.performed_at,
        locationType: v.location_type,
        process: v.process,
        evidence,
        history: events,
      };
    });
  }
  event(
    ctx: OperationContext,
    id: string,
    b: VerificationEvent | VerificationAssignment,
  ) {
    return this.transaction(async (c) => {
      const kind = 'kind' in b ? b.kind : 'ASSIGN';
      const role =
        kind === 'ASSIGN'
          ? 'admin'
          : ['APPEAL', 'WITHDRAW'].includes(kind)
            ? 'owner'
            : 'assessor';
      const v = await this.access(c, ctx, id, role, kind === 'RECUSE'),
        hash = digest({ id, ...b });
      const old = (
        await c.query(
          'SELECT id,case_id,input_digest,revision FROM verification_case_events WHERE actor_id=$1 AND command_id=$2',
          [ctx.userId, b.commandId],
        )
      ).rows[0];
      if (old) {
        if (old.case_id !== id || old.input_digest !== hash)
          throw new ConflictException('Command meaning changed');
        return { id: old.id, revision: old.revision, replay: true };
      }
      const revision = (
        await c.query(
          'SELECT coalesce(max(revision),0)::int AS n FROM verification_case_events WHERE case_id=$1',
          [id],
        )
      ).rows[0].n;
      if (revision !== b.expectedRevision)
        throw new ConflictException('Review changed; reload');
      const payload: Record<string, unknown> = { ...b };
      if (kind === 'DECISION')
        payload.authorizationId =
          (
            await c.query(
              `SELECT a.id FROM verification_assessor_authorizations a WHERE assessor_id=$1 AND rubric_version_id=$2 AND valid_until>now() AND NOT EXISTS(SELECT 1 FROM verification_governance_revocations x WHERE x.authorization_id=a.id) ORDER BY created_at DESC,id LIMIT 1`,
              [ctx.userId, v.rubric_version_id],
            )
          ).rows[0]?.id ?? null;
      return (
        await c.query(
          `INSERT INTO verification_case_events(case_id,revision,kind,assessor_id,outcome,supersedes_decision_id,payload,actor_id,command_id,input_digest,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,revision`,
          [
            id,
            revision + 1,
            kind,
            'assessorId' in b ? b.assessorId : null,
            'outcome' in b ? b.outcome : null,
            'supersedesDecisionId' in b
              ? (b.supersedesDecisionId ?? null)
              : null,
            JSON.stringify(payload),
            ctx.userId,
            b.commandId,
            hash,
            ctx.requestId,
          ],
        )
      ).rows[0];
    });
  }
}
