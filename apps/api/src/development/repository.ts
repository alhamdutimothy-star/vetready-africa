import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  developmentItemsSchema,
  developmentMappingSchema,
} from '@vetready/contracts';
import {
  aggregateCompetencyProfile,
  developmentWorkflow,
  developmentProgress,
  developmentFollowUps,
  hasPermission,
  profileCanonicalJson,
} from '@vetready/domain';
import { createHash, randomUUID } from 'node:crypto';
import { Database } from '../database';
import type { OperationContext } from '../service';
import { CompetencyProfileRepository } from '../competency-profile/repository';
import { readProfileFacts } from '../competency-profile/facts';
const digest = (v: unknown) =>
  createHash('sha256').update(profileCanonicalJson(v)).digest('hex');
@Injectable()
export class DevelopmentRepository {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(CompetencyProfileRepository)
    private readonly profiles: CompetencyProfileRepository,
  ) {}
  private async owner(c: PoolClient, ctx: OperationContext) {
    if (!hasPermission(ctx.grants, 'candidate:own'))
      throw new ForbiddenException();
    const row = (
      await c.query<{ id: string }>(
        "SELECT p.id FROM candidate_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND u.status='ACTIVE'",
        [ctx.userId],
      )
    ).rows[0];
    if (!row) throw new NotFoundException('Candidate profile unavailable');
    return row.id;
  }
  async create(ctx: OperationContext, pathway: string, command: string) {
    const replay = await this.db.transaction(async (c) => {
      const owner = await this.owner(c, ctx);
      return (
        await c.query(
          'SELECT id,pathway_version_id FROM development_workflow_plans WHERE candidate_id=$1 AND command_id=$2',
          [owner, command],
        )
      ).rows[0];
    });
    if (replay) {
      if (replay.pathway_version_id !== pathway)
        throw new ConflictException('Command already targets another pathway');
      return { id: replay.id };
    }
    // Existing immutable receipts preserve full profile provenance and deterministic historical replay.
    // A client plan command must never select an older standalone profile receipt.
    const snapshot = await this.profiles.snapshot(ctx, randomUUID());
    return this.db.transaction(async (c) => {
      const owner = await this.owner(c, ctx);
      await c.query(
        'SELECT id FROM candidate_profiles WHERE id=$1 FOR UPDATE',
        [owner],
      );
      const old = (
        await c.query(
          'SELECT id,pathway_version_id FROM development_workflow_plans WHERE candidate_id=$1 AND command_id=$2',
          [owner, command],
        )
      ).rows[0];
      if (old) {
        if (old.pathway_version_id !== pathway)
          throw new ConflictException(
            'Command already targets another pathway',
          );
        return { id: old.id };
      }
      if (
        !snapshot.result.pathways.some(
          (p) => p.id === pathway && p.status !== 'RETIRED',
        )
      )
        throw new NotFoundException('Pathway version unavailable');
      const mappings = developmentMappingSchema
        .array()
        .parse(
          (
            await c.query(
              `SELECT l.id AS "mappingId",l.course_version_id AS "courseVersionId",l.pathway_version_id AS "pathwayVersionId",l.child_version_id AS "childVersionId",l.group_version_id AS "groupVersionId",v.title FROM training_competency_links l JOIN training_course_versions v ON v.id=l.course_version_id WHERE l.pathway_version_id=$1 AND v.status='DRAFT' AND v.demo AND v.demo_released_at IS NOT NULL ORDER BY l.id FOR SHARE OF v`,
              [pathway],
            )
          ).rows,
        );
      const items = developmentWorkflow(snapshot.result, pathway, mappings);
      return (
        await c.query(
          'INSERT INTO development_workflow_plans(candidate_id,pathway_version_id,snapshot_id,actor_id,command_id,request_id,items) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [
            owner,
            pathway,
            snapshot.id,
            ctx.userId,
            command,
            ctx.requestId,
            JSON.stringify(items),
          ],
        )
      ).rows[0];
    });
  }
  list(ctx: OperationContext) {
    return this.db.transaction(async (c) => {
      const owner = await this.owner(c, ctx);
      return (
        await c.query(
          'SELECT p.id,p.created_at AS "createdAt",v.version,w.name AS pathway FROM development_workflow_plans p JOIN pathway_versions v ON v.id=p.pathway_version_id JOIN pathways w ON w.id=v.pathway_id WHERE candidate_id=$1 ORDER BY p.created_at DESC,p.id LIMIT 50',
          [owner],
        )
      ).rows;
    });
  }
  detail(ctx: OperationContext, id: string) {
    return this.db.transaction(async (c) => {
      await c.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
      );
      const owner = await this.owner(c, ctx);
      const p = (
        await c.query(
          'SELECT * FROM development_workflow_plans WHERE id=$1 AND candidate_id=$2',
          [id, owner],
        )
      ).rows[0];
      if (!p)
        throw new NotFoundException('Private development plan unavailable');
      const items = developmentItemsSchema.parse(p.items);
      if (digest(items) !== p.items_digest)
        throw new ConflictException('Plan integrity unavailable');
      const current = aggregateCompetencyProfile(
        await readProfileFacts(c, owner),
      );
      const currentAvailable = current.pathways.some(
        (v) => v.id === p.pathway_version_id && v.status !== 'RETIRED',
      );
      const currentItems = currentAvailable
        ? developmentWorkflow(current, p.pathway_version_id, [])
        : [];
      const courses = [];
      const competencyFollowUps = [];
      for (const course of [
        ...new Set(
          items.flatMap((i) => i.recommendations.map((r) => r.courseVersionId)),
        ),
      ]) {
        const v = (
          await c.query(
            "SELECT id,title,status,(status='DRAFT' AND demo_released_at IS NOT NULL) AS available FROM training_course_versions WHERE id=$1",
            [course],
          )
        ).rows[0];
        const e = (
          await c.query(
            'SELECT e.id FROM training_enrollments e WHERE candidate_id=$1 AND course_version_id=$2',
            [owner, course],
          )
        ).rows[0];
        const counts = (
          await c.query<{ total: string; completed: string; started: boolean }>(
            `SELECT count(*)::text AS total,count(*) FILTER(WHERE p.state='COMPLETED')::text AS completed,coalesce(bool_or(p.state IS NOT NULL),false) AS started FROM training_lesson_versions l LEFT JOIN training_lesson_progress p ON p.lesson_version_id=l.id AND p.enrollment_id=$2 WHERE l.course_version_id=$1`,
            [course, e?.id ?? null],
          )
        ).rows[0]!;
        const dairy = Boolean(
          (
            await c.query(
              'SELECT 1 FROM dairy_curricula WHERE course_version_id=$1',
              [course],
            )
          ).rowCount,
        );
        const mappingIds = items.flatMap((i) =>
          i.recommendations
            .filter((r) => r.courseVersionId === course)
            .map((r) => r.mappingId),
        );
        const scopes = (
          await c.query<{
            mappingId: string;
            moduleVersionId: string | null;
            lessonVersionId: string | null;
          }>(
            'SELECT id AS "mappingId",module_version_id AS "moduleVersionId",lesson_version_id AS "lessonVersionId" FROM training_competency_links WHERE id=ANY($1::uuid[]) AND course_version_id=$2 AND pathway_version_id=$3 ORDER BY id',
            [mappingIds, course, p.pathway_version_id],
          )
        ).rows;
        const links = (
          await c.query<{
            assessmentLinkId: string;
            id: string;
            title: string;
            demo: boolean;
            moduleVersionId: string | null;
            lessonVersionId: string | null;
          }>(
            `SELECT l.id AS "assessmentLinkId",a.id,a.title,a.demo,l.module_version_id AS "moduleVersionId",l.lesson_version_id AS "lessonVersionId" FROM training_assessment_links l JOIN assessment_versions a ON a.id=l.assessment_version_id WHERE l.course_version_id=$1 AND a.pathway_version_id=$2 AND a.status IN ('DEMO','APPROVED') ORDER BY l.id`,
            [course, p.pathway_version_id],
          )
        ).rows;
        const followUps = developmentFollowUps(items, course, scopes, links);
        competencyFollowUps.push(...followUps.competencyFollowUps);
        courses.push({
          id: course,
          title: v.title,
          available: v.available && currentAvailable,
          demo: true as const,
          enrollmentId: e?.id ?? null,
          href: e ? `${dairy ? '/dairy/learning' : '/learning'}/${e.id}` : null,
          progress: developmentProgress(
            Number(counts.total),
            Number(counts.completed),
            counts.started,
          ),
          courseLevelFollowUps: followUps.courseLevelFollowUps,
        });
      }
      return {
        id: p.id,
        createdAt: p.created_at,
        pathwayVersionId: p.pathway_version_id,
        snapshotId: p.snapshot_id,
        itemsDigest: p.items_digest,
        policyStatus: 'UNCONFIGURED' as const,
        professionalDetermination: null,
        notice:
          'Governed demo learning only. Learning completion does not resolve competency gaps or award professional status.',
        currentStatus: currentAvailable ? 'AVAILABLE' : 'PATHWAY_UNAVAILABLE',
        items,
        currentItems,
        courses,
        competencyFollowUps,
      };
    });
  }
  start(ctx: OperationContext, id: string, course: string) {
    return this.db.transaction(async (c) => {
      const owner = await this.owner(c, ctx);
      await c.query(
        'SELECT id FROM candidate_profiles WHERE id=$1 FOR UPDATE',
        [owner],
      );
      const p = (
        await c.query(
          'SELECT * FROM development_workflow_plans WHERE id=$1 AND candidate_id=$2',
          [id, owner],
        )
      ).rows[0];
      if (
        !p ||
        !developmentItemsSchema
          .parse(p.items)
          .some((i) =>
            i.recommendations.some((r) => r.courseVersionId === course),
          )
      )
        throw new NotFoundException('Recommendation unavailable');
      if (
        !(
          await c.query(
            "SELECT 1 FROM pathway_versions WHERE id=$1 AND approval_status<>'RETIRED' FOR SHARE",
            [p.pathway_version_id],
          )
        ).rowCount
      )
        throw new NotFoundException('Pathway unavailable');
      if (
        !(
          await c.query(
            "SELECT id FROM training_course_versions WHERE id=$1 AND status='DRAFT' AND demo AND demo_released_at IS NOT NULL FOR SHARE",
            [course],
          )
        ).rowCount
      )
        throw new NotFoundException('Learning retired or unavailable');
      // Use the canonical enrollment table and its existing governance/audit triggers.
      await c.query(
        "INSERT INTO training_enrollments(candidate_id,course_version_id,kind,assigned_by,request_id) VALUES($1,$2,'SELF',$3,$4) ON CONFLICT(candidate_id,course_version_id) DO NOTHING",
        [owner, course, ctx.userId, ctx.requestId],
      );
      const e = (
        await c.query(
          'SELECT id FROM training_enrollments WHERE candidate_id=$1 AND course_version_id=$2',
          [owner, course],
        )
      ).rows[0]!;
      if (
        !(
          await c.query(
            'SELECT 1 FROM development_workflow_starts WHERE plan_id=$1 AND course_version_id=$2',
            [id, course],
          )
        ).rowCount
      )
        await c.query(
          'INSERT INTO development_workflow_starts(plan_id,course_version_id,candidate_id,enrollment_id,actor_id,request_id) VALUES($1,$2,$3,$4,$5,$6)',
          [id, course, owner, e.id, ctx.userId, ctx.requestId],
        );
      return { id: e.id };
    });
  }
}
