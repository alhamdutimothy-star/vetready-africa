import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  gradeObjective,
  competencyGaps,
  developmentActivities,
  GAP_ENGINE_VERSION,
  type GapRequirement,
  type GapEvidence,
  type ResponseValue,
  type ObjectiveItem,
} from '@vetready/domain';
import {
  assessmentCreateSchema,
  itemCreateSchema,
  reviewSchema,
  evidenceReviewSchema,
  moderationSchema,
} from '@vetready/contracts';
import { Database, audit } from '../database';
import type { OperationContext } from '../service';
export const DEMO_NOTICE =
  'DEMO CONTENT — NOT YET APPROVED FOR PRODUCTION ASSESSMENT';
@Injectable()
export class AssessmentRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  async candidate(client: PoolClient, user: string) {
    const row = (
      await client.query<{ id: string }>(
        'SELECT id FROM candidate_profiles WHERE user_id=$1',
        [user],
      )
    ).rows[0];
    if (!row) throw new ConflictException('Create a candidate profile first');
    return row.id;
  }
  async catalog() {
    return (
      await this.db.pool.query(
        `SELECT a.id,a.title,a.version,a.status,a.demo,a.notice,p.name AS pathway,p.id AS pathway_id,a.pathway_version_id FROM assessment_versions a JOIN pathway_versions pv ON pv.id=a.pathway_version_id JOIN pathways p ON p.id=pv.pathway_id WHERE a.status IN ('DEMO','APPROVED') ORDER BY p.name,a.title LIMIT 100`,
      )
    ).rows;
  }
  async hierarchy(pathway: string) {
    return (
      await this.db.pool.query(
        `SELECT pv.id AS pathway_version_id,d.code AS domain_code,d.name AS domain_name,c.code AS group_code,cv.id AS group_version_id,cv.name AS group_name,ch.code AS child_code,v.id AS child_version_id,v.version,v.statement,v.proposed_method,v.validation_status,v.validation_notice,v.context_kind,v.standards_to_validate,v.source_references,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',cr.id,'statement',cr.statement) ORDER BY cr.position) FROM child_criteria cr WHERE cr.child_version_id=v.id),'[]') AS criteria FROM pathway_versions pv JOIN pathway_domain_groups dg ON dg.pathway_version_id=pv.id JOIN competency_domains d ON d.id=dg.domain_id JOIN competency_versions cv ON cv.id=dg.group_version_id JOIN competencies c ON c.id=cv.competency_id JOIN child_group_mappings m ON m.group_version_id=cv.id JOIN child_competency_versions v ON v.id=m.child_version_id JOIN child_competencies ch ON ch.id=v.child_id WHERE pv.pathway_id=$1 ORDER BY pv.version DESC,d.code,c.code,ch.code`,
        [pathway],
      )
    ).rows;
  }
  async create(
    ctx: OperationContext,
    input: z.infer<typeof assessmentCreateSchema>,
  ) {
    return this.db.transaction(async (c) => {
      if (
        !(
          await c.query('SELECT 1 FROM pathway_versions WHERE id=$1', [
            input.pathwayVersionId,
          ])
        ).rowCount
      )
        throw new NotFoundException('Pathway version unavailable');
      const parent = (
        await c.query<{ id: string }>(
          'INSERT INTO assessments(code) VALUES($1) ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id',
          [input.code],
        )
      ).rows[0]!;
      // Serialize version allocation on the stable assessment identity.
      await c.query('SELECT id FROM assessments WHERE id=$1 FOR UPDATE', [
        parent.id,
      ]);
      const version = (
        await c.query(
          `INSERT INTO assessment_versions(assessment_id,version,pathway_version_id,title,randomize,author_id) SELECT $1,COALESCE(MAX(version),0)+1,$2,$3,$4,$5 FROM assessment_versions WHERE assessment_id=$1 RETURNING *`,
          [
            parent.id,
            input.pathwayVersionId,
            input.title,
            input.randomize,
            ctx.userId,
          ],
        )
      ).rows[0]!;
      await audit(
        c,
        ctx.userId,
        'assessment.created',
        'assessment_version',
        version.id,
        ctx.requestId,
        { demo: true },
      );
      return version;
    });
  }
  async item(
    ctx: OperationContext,
    assessmentId: string,
    input: z.infer<typeof itemCreateSchema>,
  ) {
    return this.db.transaction(async (c) => {
      const av = (
        await c.query<{
          id: string;
          pathway_version_id: string;
          status: string;
        }>('SELECT * FROM assessment_versions WHERE id=$1 FOR UPDATE', [
          assessmentId,
        ])
      ).rows[0];
      if (!av) throw new NotFoundException();
      if (av.status !== 'DRAFT')
        throw new ConflictException('Create a new draft assessment version');
      const mapping = await c.query(
        'SELECT 1 FROM child_group_mappings m JOIN pathway_domain_groups g ON g.group_version_id=m.group_version_id WHERE m.child_version_id=$1 AND m.group_version_id=$2 AND g.pathway_version_id=$3',
        [input.childVersionId, input.groupVersionId, av.pathway_version_id],
      );
      if (!mapping.rowCount)
        throw new UnprocessableEntityException(
          'Child/group/pathway mapping invalid',
        );
      const criteria = await c.query(
        'SELECT id FROM child_criteria WHERE child_version_id=$1 AND id=ANY($2::uuid[])',
        [input.childVersionId, input.criterionIds],
      );
      if (criteria.rowCount !== input.criterionIds.length)
        throw new UnprocessableEntityException(
          'Criteria must belong to mapped child version',
        );
      // Private asset delivery is deliberately not enabled until the storage authorization milestone.
      if (input.presentation.assetId)
        throw new UnprocessableEntityException(
          'Private assessment assets require the storage milestone',
        );
      const parent = (
        await c.query<{ id: string }>(
          'INSERT INTO assessment_items(code) VALUES($1) ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id',
          [input.code],
        )
      ).rows[0]!;
      const iv = (
        await c.query<{ id: string }>(
          `INSERT INTO assessment_item_versions(item_id,version,type,prompt,presentation,answer_key,method,difficulty,evidence_type,author_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [
            parent.id,
            input.version,
            input.type,
            input.prompt,
            JSON.stringify(input.presentation),
            input.answerKey ? JSON.stringify(input.answerKey) : null,
            input.method,
            input.difficulty,
            input.evidenceType,
            ctx.userId,
          ],
        )
      ).rows[0]!;
      await c.query('INSERT INTO assessment_blueprint VALUES($1,$2,$3,$4,$5)', [
        av.id,
        iv.id,
        av.pathway_version_id,
        input.groupVersionId,
        input.childVersionId,
      ]);
      for (const criterion of input.criterionIds)
        await c.query(
          'INSERT INTO rubric_criteria(item_version_id,child_version_id,criterion_id,description) SELECT $1,child_version_id,id,statement FROM child_criteria WHERE id=$2',
          [iv.id, criterion],
        );
      await audit(
        c,
        ctx.userId,
        'assessment.item.created',
        'assessment_item_version',
        iv.id,
        ctx.requestId,
      );
      return { id: iv.id };
    });
  }
  async publish(ctx: OperationContext, id: string) {
    return this.db.transaction(async (c) => {
      const av = (
        await c.query<{ status: string }>(
          'SELECT status FROM assessment_versions WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!av) throw new NotFoundException();
      if (av.status !== 'DRAFT')
        throw new ConflictException('Only drafts can be released');
      if (
        !(
          await c.query(
            'SELECT 1 FROM assessment_blueprint WHERE assessment_version_id=$1',
            [id],
          )
        ).rowCount
      )
        throw new ConflictException('Assessment requires mapped items');
      await c.query(
        "UPDATE assessment_versions SET status='DEMO' WHERE id=$1 AND demo=true",
        [id],
      );
      await audit(
        c,
        ctx.userId,
        'assessment.demo.released',
        'assessment_version',
        id,
        ctx.requestId,
      );
      return { id, status: 'DEMO', notice: DEMO_NOTICE };
    });
  }
  async retire(ctx: OperationContext, id: string) {
    return this.db.transaction(async (c) => {
      const row = await c.query(
        "UPDATE assessment_versions SET status='RETIRED' WHERE id=$1 AND status IN ('DRAFT','DEMO','APPROVED') RETURNING id",
        [id],
      );
      if (!row.rowCount) throw new NotFoundException();
      await audit(
        c,
        ctx.userId,
        'assessment.retired',
        'assessment_version',
        id,
        ctx.requestId,
      );
      return { id, status: 'RETIRED' };
    });
  }
  async start(ctx: OperationContext, id: string) {
    return this.db.transaction(async (c) => {
      const candidate = await this.candidate(c, ctx.userId);
      const av = (
        await c.query<{ id: string; status: string; randomize: boolean }>(
          'SELECT id,status,randomize FROM assessment_versions WHERE id=$1 FOR SHARE',
          [id],
        )
      ).rows[0];
      if (!av || !['DEMO', 'APPROVED'].includes(av.status))
        throw new NotFoundException('Assessment unavailable');
      await c.query(
        'SELECT id FROM candidate_profiles WHERE id=$1 FOR UPDATE',
        [candidate],
      );
      const existing = (
        await c.query<{ id: string }>(
          "SELECT id FROM assessment_attempts WHERE candidate_id=$1 AND assessment_version_id=$2 AND status='IN_PROGRESS'",
          [candidate, id],
        )
      ).rows[0];
      if (existing) return { id: existing.id, resumed: true };
      if (
        (
          await c.query(
            'SELECT 1 FROM assessment_blueprint b JOIN assessment_item_retirements r ON r.item_version_id=b.item_version_id WHERE b.assessment_version_id=$1',
            [id],
          )
        ).rowCount
      )
        throw new ConflictException(
          'Assessment contains retired items; a new version is required',
        );
      const attempt = (
        await c.query<{ id: string }>(
          'INSERT INTO assessment_attempts(candidate_id,assessment_version_id) VALUES($1,$2) RETURNING id',
          [candidate, id],
        )
      ).rows[0]!;
      const items = (
        await c.query<{ item_version_id: string }>(
          'SELECT item_version_id FROM assessment_blueprint WHERE assessment_version_id=$1 ORDER BY item_version_id',
          [id],
        )
      ).rows;
      if (!items.length) throw new ConflictException('Assessment has no items');
      if (av.randomize)
        for (let n = items.length - 1; n > 0; n--) {
          const j = randomInt(n + 1);
          [items[n], items[j]] = [items[j]!, items[n]!];
        }
      for (const [n, item] of items.entries())
        await c.query('INSERT INTO attempt_items VALUES($1,$2,$3,$4)', [
          attempt.id,
          id,
          item.item_version_id,
          n + 1,
        ]);
      await audit(
        c,
        ctx.userId,
        'assessment.attempt.started',
        'assessment_attempt',
        attempt.id,
        ctx.requestId,
      );
      return { id: attempt.id, resumed: false };
    });
  }
  async owned(c: PoolClient, ctx: OperationContext, id: string, lock = false) {
    const a = (
      await c.query<{
        id: string;
        candidate_id: string;
        status: string;
        assessment_version_id: string;
        assigned_assessor_id: string | null;
      }>(
        `SELECT a.* FROM assessment_attempts a JOIN candidate_profiles p ON p.id=a.candidate_id WHERE a.id=$1 AND p.user_id=$2 ${lock ? 'FOR UPDATE OF a' : ''}`,
        [id, ctx.userId],
      )
    ).rows[0];
    if (!a) throw new NotFoundException();
    return a;
  }
  async attempts(ctx: OperationContext) {
    return (
      await this.db.pool.query(
        `SELECT a.id,a.status,a.started_at,a.submitted_at,v.title,v.demo,v.notice,p.name AS pathway FROM assessment_attempts a JOIN candidate_profiles c ON c.id=a.candidate_id JOIN assessment_versions v ON v.id=a.assessment_version_id JOIN pathway_versions pv ON pv.id=v.pathway_version_id JOIN pathways p ON p.id=pv.pathway_id WHERE c.user_id=$1 ORDER BY a.started_at DESC LIMIT 100`,
        [ctx.userId],
      )
    ).rows;
  }
  async details(ctx: OperationContext, id: string, assessor = false) {
    return this.db.transaction(async (c) => {
      const a = assessor
        ? await this.assigned(c, ctx, id)
        : await this.owned(c, ctx, id);
      const info = (
        await c.query(
          'SELECT title,version,demo,notice FROM assessment_versions WHERE id=$1',
          [a.assessment_version_id],
        )
      ).rows[0];
      const items = (
        await c.query(
          `SELECT i.id,EXISTS(SELECT 1 FROM assessment_item_retirements retired WHERE retired.item_version_id=i.id) AS retired,i.type,i.prompt,i.presentation,i.method,i.difficulty,i.evidence_type,i.validation_status,i.version,t.position,r.response,r.objective_outcome,b.child_version_id,ch.code AS child_code,co.code AS group_code,d.code AS domain_code,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',rc.id,'description',rc.description) ORDER BY rc.id) FROM rubric_criteria rc WHERE rc.item_version_id=i.id),'[]') AS rubric FROM attempt_items t JOIN assessment_item_versions i ON i.id=t.item_version_id JOIN assessment_blueprint b ON b.assessment_version_id=t.assessment_version_id AND b.item_version_id=i.id JOIN child_competency_versions cv ON cv.id=b.child_version_id JOIN child_competencies ch ON ch.id=cv.child_id JOIN competency_versions gv ON gv.id=b.group_version_id JOIN competencies co ON co.id=gv.competency_id JOIN pathway_domain_groups dg ON dg.pathway_version_id=b.pathway_version_id AND dg.group_version_id=b.group_version_id JOIN competency_domains d ON d.id=dg.domain_id LEFT JOIN candidate_responses r ON r.attempt_id=t.attempt_id AND r.item_version_id=i.id WHERE t.attempt_id=$1 ORDER BY t.position`,
          [id],
        )
      ).rows;
      const reviews = (
        await c.query(
          `SELECT r.id,r.feedback,r.created_at,COALESCE((SELECT jsonb_agg(jsonb_build_object('criterionId',o.rubric_criterion_id,'observation',o.observation,'comment',o.comment)) FROM rubric_observations o WHERE o.review_id=r.id),'[]') AS observations FROM assessor_reviews r WHERE r.attempt_id=$1 ORDER BY r.created_at`,
          [id],
        )
      ).rows;
      const evidence = (
        await c.query(
          'SELECT id,child_version_id,facet,demo,status,observation,observed_at,context FROM competency_evidence WHERE attempt_id=$1',
          [id],
        )
      ).rows;
      return { ...a, ...info, items, reviews, evidence };
    });
  }
  async response(
    ctx: OperationContext,
    id: string,
    item: string,
    value: ResponseValue,
  ) {
    return this.db.transaction(async (c) => {
      const a = await this.owned(c, ctx, id, true);
      if (a.status !== 'IN_PROGRESS')
        throw new ConflictException('Attempt already submitted');
      const i = (
        await c.query<{
          type: string;
          presentation: { options?: { id: string }[] };
        }>(
          'SELECT i.type,i.presentation FROM attempt_items t JOIN assessment_item_versions i ON i.id=t.item_version_id WHERE t.attempt_id=$1 AND i.id=$2',
          [id, item],
        )
      ).rows[0];
      if (!i) throw new NotFoundException('Item unavailable');
      const mcq = i.type === 'SINGLE_MCQ' || i.type === 'MULTIPLE_RESPONSE';
      if (
        mcq &&
        (!value.selected?.length ||
          (i.type === 'SINGLE_MCQ' && value.selected.length !== 1) ||
          new Set(value.selected).size !== value.selected.length ||
          value.selected.some(
            (x) => !i.presentation.options?.some((o) => o.id === x),
          ))
      )
        throw new UnprocessableEntityException('Choose valid options');
      if (i.type === 'NUMERICAL' && typeof value.value !== 'number')
        throw new UnprocessableEntityException('Number required');
      if (
        !mcq &&
        i.type !== 'NUMERICAL' &&
        (typeof value.text !== 'string' || !value.text.trim())
      )
        throw new UnprocessableEntityException(
          'Written response required; private file uploads are not enabled',
        );
      await c.query(
        'INSERT INTO candidate_responses(attempt_id,item_version_id,response) VALUES($1,$2,$3) ON CONFLICT(attempt_id,item_version_id) DO UPDATE SET response=EXCLUDED.response,updated_at=now()',
        [id, item, JSON.stringify(value)],
      );
      await audit(
        c,
        ctx.userId,
        'assessment.response.saved',
        'assessment_attempt',
        id,
        ctx.requestId,
        { itemVersionId: item },
      );
      return { saved: true };
    });
  }
  async submit(ctx: OperationContext, id: string) {
    return this.db.transaction(async (c) => {
      const a = await this.owned(c, ctx, id, true);
      if (a.status !== 'IN_PROGRESS') return { id, status: a.status };
      const items = (
        await c.query<{
          id: string;
          type: string;
          answer_key: ObjectiveItem['answerKey'];
          response: ResponseValue | null;
          child_version_id: string;
          evidence_type: string;
          demo: boolean;
          context_kind: string;
        }>(
          `SELECT i.id,i.type,i.answer_key,r.response,b.child_version_id,i.evidence_type,v.demo,cv.context_kind FROM attempt_items t JOIN assessment_item_versions i ON i.id=t.item_version_id JOIN assessment_versions v ON v.id=t.assessment_version_id JOIN assessment_blueprint b ON b.assessment_version_id=t.assessment_version_id AND b.item_version_id=i.id JOIN child_competency_versions cv ON cv.id=b.child_version_id LEFT JOIN candidate_responses r ON r.attempt_id=t.attempt_id AND r.item_version_id=i.id WHERE t.attempt_id=$1`,
          [id],
        )
      ).rows;
      if (items.some((i) => !i.response))
        throw new ConflictException(
          'Save a response to each task before submitting',
        );
      for (const i of items) {
        const observation = gradeObjective(
          { type: i.type, answerKey: i.answer_key },
          i.response!,
        );
        await c.query(
          'UPDATE candidate_responses SET objective_outcome=$3 WHERE attempt_id=$1 AND item_version_id=$2',
          [id, i.id, observation],
        );
        await c.query(
          `INSERT INTO competency_evidence(candidate_id,child_version_id,attempt_id,item_version_id,facet,demo,observation,context) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            a.candidate_id,
            i.child_version_id,
            id,
            i.id,
            i.evidence_type,
            i.demo,
            observation,
            JSON.stringify({
              kind: i.context_kind,
              delivery: 'ONLINE_TASK',
              assessmentVersionId: a.assessment_version_id,
            }),
          ],
        );
      }
      await c.query(
        "UPDATE assessment_attempts SET status='SUBMITTED',submitted_at=now() WHERE id=$1",
        [id],
      );
      await audit(
        c,
        ctx.userId,
        'assessment.attempt.submitted',
        'assessment_attempt',
        id,
        ctx.requestId,
      );
      return { id, status: 'SUBMITTED', verification: 'UNVERIFIED' };
    });
  }
  async assigned(
    c: PoolClient,
    ctx: OperationContext,
    id: string,
    lock = false,
  ) {
    const a = (
      await c.query<{
        id: string;
        candidate_id: string;
        status: string;
        assessment_version_id: string;
        assigned_assessor_id: string | null;
      }>(
        `SELECT a.* FROM assessment_attempts a JOIN candidate_profiles p ON p.id=a.candidate_id WHERE a.id=$1 AND a.assigned_assessor_id=$2 AND p.user_id<>$2 ${lock ? 'FOR UPDATE OF a' : ''}`,
        [id, ctx.userId],
      )
    ).rows[0];
    if (!a) throw new NotFoundException('Assigned attempt unavailable');
    return a;
  }
  async assign(ctx: OperationContext, id: string, assessor: string) {
    return this.db.transaction(async (c) => {
      const a = (
        await c.query<{ owner: string; status: string }>(
          'SELECT p.user_id AS owner,a.status FROM assessment_attempts a JOIN candidate_profiles p ON p.id=a.candidate_id WHERE a.id=$1 FOR UPDATE OF a',
          [id],
        )
      ).rows[0];
      if (!a) throw new NotFoundException();
      if (a.status === 'IN_PROGRESS' || a.status === 'REVIEWED')
        throw new ConflictException('Assign a submitted attempt');
      if (a.owner === assessor)
        throw new ForbiddenException('Self-assessment prohibited');
      if (
        !(
          await c.query(
            `SELECT 1 FROM user_role_assignments u JOIN role_permissions r ON r.role_code=u.role_code JOIN users usr ON usr.id=u.user_id WHERE u.user_id=$1 AND r.permission_code='assessment:review' AND u.organization_id IS NULL AND (u.expires_at IS NULL OR u.expires_at>now()) AND usr.status='ACTIVE'`,
            [assessor],
          )
        ).rowCount
      )
        throw new UnprocessableEntityException(
          'Active assessor permission required',
        );
      await c.query(
        'UPDATE assessment_attempts SET assigned_assessor_id=$2 WHERE id=$1',
        [id, assessor],
      );
      await audit(
        c,
        ctx.userId,
        'assessment.assigned',
        'assessment_attempt',
        id,
        ctx.requestId,
        { assessorId: assessor },
      );
      return { id };
    });
  }
  async queue(ctx: OperationContext, admin = false) {
    return (
      await this.db.pool.query(
        `SELECT a.id,a.status,a.started_at,a.submitted_at,a.assigned_assessor_id,v.title,v.demo FROM assessment_attempts a JOIN assessment_versions v ON v.id=a.assessment_version_id JOIN candidate_profiles p ON p.id=a.candidate_id WHERE ${admin ? "a.status<>'IN_PROGRESS'" : "a.assigned_assessor_id=$1 AND p.user_id<>$1 AND a.status<>'IN_PROGRESS'"} ORDER BY a.started_at DESC LIMIT 100`,
        admin ? [] : [ctx.userId],
      )
    ).rows;
  }
  async review(
    ctx: OperationContext,
    id: string,
    input: z.infer<typeof reviewSchema>,
  ) {
    return this.db.transaction(async (c) => {
      const a = await this.assigned(c, ctx, id, true);
      if (a.status !== 'SUBMITTED')
        throw new ConflictException('Submitted attempt required');
      const criteria = (
        await c.query<{ id: string }>(
          'SELECT rc.id FROM rubric_criteria rc JOIN attempt_items t ON t.item_version_id=rc.item_version_id WHERE t.attempt_id=$1',
          [id],
        )
      ).rows.map((r) => r.id);
      if (
        new Set(input.observations.map((o) => o.rubricCriterionId)).size !==
          input.observations.length ||
        criteria.length !== input.observations.length ||
        input.observations.some((o) => !criteria.includes(o.rubricCriterionId))
      )
        throw new UnprocessableEntityException(
          'Review every rubric criterion exactly once',
        );
      const r = (
        await c.query<{ id: string }>(
          'INSERT INTO assessor_reviews(attempt_id,assessor_id,feedback) VALUES($1,$2,$3) RETURNING id',
          [id, ctx.userId, input.feedback],
        )
      ).rows[0]!;
      for (const o of input.observations)
        await c.query('INSERT INTO rubric_observations VALUES($1,$2,$3,$4)', [
          r.id,
          o.rubricCriterionId,
          o.observation,
          o.comment,
        ]);
      // Item-level observations are derived from the preserved criterion observations, not arbitrary case totals.
      await c.query(
        `UPDATE competency_evidence e SET observation=CASE WHEN EXISTS(SELECT 1 FROM rubric_observations o JOIN rubric_criteria rc ON rc.id=o.rubric_criterion_id WHERE o.review_id=$2 AND rc.item_version_id=e.item_version_id AND o.observation='NEEDS_DEVELOPMENT') THEN 'NEEDS_DEVELOPMENT' WHEN EXISTS(SELECT 1 FROM rubric_observations o JOIN rubric_criteria rc ON rc.id=o.rubric_criterion_id WHERE o.review_id=$2 AND rc.item_version_id=e.item_version_id AND o.observation='UNASSESSABLE') THEN 'UNASSESSABLE' ELSE 'DEMONSTRATED' END WHERE e.attempt_id=$1 AND e.facet<>'KNOWLEDGE_ASSESSED'`,
        [id, r.id],
      );
      await c.query(
        "UPDATE assessment_attempts SET status='REVIEWED',reviewed_at=now() WHERE id=$1",
        [id],
      );
      await audit(
        c,
        ctx.userId,
        'assessment.reviewed',
        'assessor_review',
        r.id,
        ctx.requestId,
        { attemptId: id },
      );
      return { id: r.id, verification: 'UNVERIFIED' };
    });
  }
  async evidence(ctx: OperationContext) {
    return (
      await this.db.pool.query(
        `SELECT e.id,e.child_version_id,ch.code,e.facet,e.demo,e.status,e.observation,e.observed_at,e.valid_until,e.context,e.attempt_id FROM competency_evidence e JOIN candidate_profiles c ON c.id=e.candidate_id JOIN child_competency_versions cv ON cv.id=e.child_version_id JOIN child_competencies ch ON ch.id=cv.child_id WHERE c.user_id=$1 ORDER BY e.observed_at DESC LIMIT 500`,
        [ctx.userId],
      )
    ).rows;
  }
  async evidenceReview(
    ctx: OperationContext,
    id: string,
    input: z.infer<typeof evidenceReviewSchema>,
  ) {
    return this.db.transaction(async (c) => {
      const e = (
        await c.query<{
          id: string;
          attempt_id: string;
          demo: boolean;
          facet: string;
          status: string;
          observation: string;
          validation_status: string;
          context: { delivery: string };
          item_status: string;
          assessment_status: string;
        }>(
          `SELECT e.*,cv.validation_status,i.validation_status AS item_status,v.status AS assessment_status FROM competency_evidence e JOIN child_competency_versions cv ON cv.id=e.child_version_id JOIN assessment_item_versions i ON i.id=e.item_version_id JOIN assessment_attempts a ON a.id=e.attempt_id JOIN assessment_versions v ON v.id=a.assessment_version_id WHERE e.id=$1 FOR UPDATE OF e`,
          [id],
        )
      ).rows[0];
      if (!e) throw new NotFoundException();
      const a = await this.assigned(c, ctx, e.attempt_id, true);
      if (a.status !== 'REVIEWED')
        throw new ConflictException('Human review required first');
      if (input.outcome === 'VERIFIED') {
        if (
          (
            await c.query(
              'SELECT 1 FROM assessment_item_retirements WHERE item_version_id=(SELECT item_version_id FROM competency_evidence WHERE id=$1)',
              [id],
            )
          ).rowCount
        )
          throw new ConflictException('Retired item cannot verify evidence');
        if (
          e.demo ||
          e.validation_status !== 'APPROVED' ||
          e.item_status !== 'APPROVED' ||
          e.assessment_status !== 'APPROVED'
        )
          throw new ConflictException(
            'Demo or unvalidated content cannot create professional verification',
          );
        if (!['CORRECT', 'DEMONSTRATED'].includes(e.observation))
          throw new ConflictException('Insufficient demonstrated evidence');
        if (
          [
            'PRACTICALLY_VERIFIED',
            'WORKPLACE_VERIFIED',
            'SIMULATION_VERIFIED',
          ].includes(e.facet)
        )
          throw new ConflictException(
            'Online tasks cannot verify real practical or workplace performance; supervised capture is required',
          );
        if (
          !(
            await c.query(
              `SELECT 1 FROM assessment_moderations m JOIN assessor_reviews r ON r.id=m.review_id WHERE r.attempt_id=$1 AND m.outcome='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM assessor_reviews r2 WHERE r2.attempt_id=r.attempt_id AND (r2.created_at,r2.id)>(r.created_at,r.id)) AND NOT EXISTS(SELECT 1 FROM assessment_moderations later WHERE later.review_id=m.review_id AND later.created_at>m.created_at)`,
              [e.attempt_id],
            )
          ).rowCount
        )
          throw new ConflictException('Independent moderation required');
      }
      const allowed: Record<string, string[]> = {
        UNVERIFIED: ['VERIFIED', 'REJECTED'],
        VERIFIED: ['REVOKED'],
        REJECTED: [],
        REVOKED: [],
      };
      if (!allowed[e.status]?.includes(input.outcome))
        throw new ConflictException(
          'Invalid evidence transition; correction requires new evidence',
        );
      await c.query(
        'INSERT INTO competency_evidence_reviews(evidence_id,reviewer_id,outcome,reason) VALUES($1,$2,$3,$4)',
        [id, ctx.userId, input.outcome, input.reason],
      );
      await c.query('UPDATE competency_evidence SET status=$2 WHERE id=$1', [
        id,
        input.outcome,
      ]);
      await audit(
        c,
        ctx.userId,
        'competency.evidence.reviewed',
        'competency_evidence',
        id,
        ctx.requestId,
        { outcome: input.outcome },
      );
      return { id, status: input.outcome };
    });
  }
  async moderate(
    ctx: OperationContext,
    id: string,
    input: z.infer<typeof moderationSchema>,
  ) {
    return this.db.transaction(async (c) => {
      const r = (
        await c.query<{
          assessor_id: string;
          owner: string;
          attempt_id: string;
        }>(
          'SELECT r.assessor_id,r.attempt_id,p.user_id AS owner FROM assessor_reviews r JOIN assessment_attempts a ON a.id=r.attempt_id JOIN candidate_profiles p ON p.id=a.candidate_id WHERE r.id=$1 FOR UPDATE OF a',
          [id],
        )
      ).rows[0];
      if (!r) throw new NotFoundException();
      if (
        (
          await c.query(
            'SELECT 1 FROM assessor_reviews newer JOIN assessor_reviews original ON original.id=$1 WHERE newer.attempt_id=original.attempt_id AND (newer.created_at,newer.id)>(original.created_at,original.id)',
            [id],
          )
        ).rowCount
      )
        throw new ConflictException('Moderate the latest review');
      if (r.assessor_id === ctx.userId || r.owner === ctx.userId)
        throw new ForbiddenException('Independent moderator required');
      await c.query(
        'INSERT INTO assessment_moderations(review_id,moderator_id,outcome,reason) VALUES($1,$2,$3,$4)',
        [id, ctx.userId, input.outcome, input.reason],
      );
      if (input.outcome === 'RETURNED') {
        await c.query(
          "UPDATE assessment_attempts SET status='SUBMITTED',reviewed_at=NULL WHERE id=$1",
          [r.attempt_id],
        );
        await c.query(
          "UPDATE competency_evidence SET status='REVOKED' WHERE attempt_id=$1 AND status='VERIFIED'",
          [r.attempt_id],
        );
      }
      await audit(
        c,
        ctx.userId,
        'assessment.moderated',
        'assessor_review',
        id,
        ctx.requestId,
        { outcome: input.outcome },
      );
      return { id, outcome: input.outcome };
    });
  }
  async appeal(ctx: OperationContext, id: string, reason: string) {
    return this.db.transaction(async (c) => {
      const a = await this.owned(c, ctx, id, true);
      if (a.status === 'IN_PROGRESS')
        throw new ConflictException('Submit assessment before appeal');
      const r = (
        await c.query<{ id: string }>(
          'INSERT INTO assessment_appeals(attempt_id,candidate_id,reason) VALUES($1,$2,$3) RETURNING id',
          [id, a.candidate_id, reason],
        )
      ).rows[0]!;
      await audit(
        c,
        ctx.userId,
        'assessment.appealed',
        'assessment_appeal',
        r.id,
        ctx.requestId,
      );
      return r;
    });
  }
  async appeals(ctx: OperationContext, admin = false) {
    return (
      await this.db.pool.query(
        `SELECT ap.* FROM assessment_appeals ap JOIN candidate_profiles p ON p.id=ap.candidate_id ${admin ? '' : 'WHERE p.user_id=$1'} ORDER BY ap.created_at DESC LIMIT 100`,
        admin ? [] : [ctx.userId],
      )
    ).rows;
  }
  async resolveAppeal(ctx: OperationContext, id: string, resolution: string) {
    return this.db.transaction(async (c) => {
      const ap = (
        await c.query<{ owner: string; assessor: string | null }>(
          'SELECT p.user_id AS owner,a.assigned_assessor_id AS assessor FROM assessment_appeals ap JOIN candidate_profiles p ON p.id=ap.candidate_id JOIN assessment_attempts a ON a.id=ap.attempt_id WHERE ap.id=$1 AND ap.resolved_at IS NULL FOR UPDATE OF ap',
          [id],
        )
      ).rows[0];
      if (!ap) throw new NotFoundException();
      if (ap.owner === ctx.userId || ap.assessor === ctx.userId)
        throw new ForbiddenException('Independent appeal reviewer required');
      await c.query(
        'UPDATE assessment_appeals SET resolved_by=$2,resolution=$3,resolved_at=now() WHERE id=$1',
        [id, ctx.userId, resolution],
      );
      await audit(
        c,
        ctx.userId,
        'assessment.appeal.resolved',
        'assessment_appeal',
        id,
        ctx.requestId,
      );
      return { id };
    });
  }
  async gaps(
    ctx: OperationContext,
    pathway: string,
    save = false,
    roleId?: string,
  ) {
    return this.db.transaction(async (c) => {
      // Snapshot requirements and evidence in one consistent transaction.
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const candidate = await this.candidate(c, ctx.userId);
      const pv = (
        await c.query<{ id: string }>(
          "SELECT id FROM pathway_versions WHERE pathway_id=$1 AND approval_status<>'RETIRED' ORDER BY version DESC LIMIT 1",
          [pathway],
        )
      ).rows[0];
      if (!pv) throw new NotFoundException();
      const requirements = (
        await c.query<GapRequirement>(
          `SELECT r.child_version_id AS "childVersionId",ch.code,cv.statement,r.proposed_facets AS facets,r.validation_status AS "validationStatus",r.mandatory FROM pathway_child_requirements r JOIN child_competency_versions cv ON cv.id=r.child_version_id JOIN child_competencies ch ON ch.id=cv.child_id WHERE r.pathway_version_id=$1 ORDER BY ch.code`,
          [pv.id],
        )
      ).rows;
      if (roleId) {
        const role = (
          await c.query<{ pathway_version_id: string }>(
            'SELECT pathway_version_id FROM role_profiles WHERE id=$1',
            [roleId],
          )
        ).rows[0];
        if (!role || role.pathway_version_id !== pv.id)
          throw new UnprocessableEntityException(
            'Role target must belong to selected pathway version',
          );
        const roleRequirements = (
          await c.query<GapRequirement>(
            `SELECT r.child_version_id AS "childVersionId",ch.code,cv.statement,r.proposed_facets AS facets,r.validation_status AS "validationStatus",r.mandatory FROM role_child_requirements r JOIN child_competency_versions cv ON cv.id=r.child_version_id JOIN child_competencies ch ON ch.id=cv.child_id WHERE r.role_profile_id=$1 ORDER BY ch.code`,
            [roleId],
          )
        ).rows;
        for (const required of roleRequirements) {
          const index = requirements.findIndex(
            (r) => r.childVersionId === required.childVersionId,
          );
          if (index < 0) requirements.push(required);
          else {
            const base = requirements[index]!;
            requirements[index] = {
              ...base,
              facets: [...new Set([...base.facets, ...required.facets])],
              validationStatus:
                base.validationStatus === 'APPROVED' &&
                required.validationStatus === 'APPROVED'
                  ? 'APPROVED'
                  : 'PROPOSED',
              mandatory:
                base.mandatory === true || required.mandatory === true
                  ? true
                  : base.mandatory === null || required.mandatory === null
                    ? null
                    : false,
            };
          }
        }
      }
      const evidence = (
        await c.query<GapEvidence>(
          `SELECT id,child_version_id AS "childVersionId",facet,status,demo,observation,valid_until::text AS "validUntil" FROM competency_evidence WHERE candidate_id=$1`,
          [candidate],
        )
      ).rows;
      const evaluatedAt = new Date();
      const gaps = competencyGaps(requirements, evidence, evaluatedAt);
      const activities = developmentActivities(gaps);
      const result = {
        pathwayVersionId: pv.id,
        roleProfileId: roleId ?? null,
        engineVersion: GAP_ENGINE_VERSION,
        evaluatedAt: evaluatedAt.toISOString(),
        notice: 'PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION',
        gaps,
        activities,
      };
      if (!save) return result;
      const plan = (
        await c.query<{ id: string }>(
          'INSERT INTO development_plans(candidate_id,pathway_version_id,engine_version,snapshot,role_profile_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [
            candidate,
            pv.id,
            GAP_ENGINE_VERSION,
            JSON.stringify({
              ...result,
              evidenceIds: evidence.map((e) => e.id),
            }),
            roleId ?? null,
          ],
        )
      ).rows[0]!;
      for (const a of activities)
        await c.query(
          'INSERT INTO development_plan_items(plan_id,child_version_id,gap,activity,validation_status) VALUES($1,$2,$3,$4,$5)',
          [plan.id, a.childVersionId, a.gap, a.activity, a.validationStatus],
        );
      await audit(
        c,
        ctx.userId,
        'development.plan.created',
        'development_plan',
        plan.id,
        ctx.requestId,
        { pathwayVersionId: pv.id },
      );
      return { ...result, id: plan.id };
    });
  }
  async plans(ctx: OperationContext) {
    return (
      await this.db.pool.query(
        `SELECT p.id,p.pathway_version_id,p.engine_version,p.snapshot,p.created_at,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'childVersionId',i.child_version_id,'gap',i.gap,'activity',i.activity,'completedAt',i.completed_at) ORDER BY i.id) FROM development_plan_items i WHERE i.plan_id=p.id),'[]') AS items FROM development_plans p JOIN candidate_profiles c ON c.id=p.candidate_id WHERE c.user_id=$1 ORDER BY p.created_at DESC LIMIT 20`,
        [ctx.userId],
      )
    ).rows;
  }
  async completeActivity(ctx: OperationContext, id: string) {
    return this.db.transaction(async (c) => {
      const r = await c.query(
        'UPDATE development_plan_items i SET completed_at=now() FROM development_plans p,candidate_profiles cp WHERE i.id=$1 AND p.id=i.plan_id AND cp.id=p.candidate_id AND cp.user_id=$2 RETURNING i.id',
        [id, ctx.userId],
      );
      if (!r.rowCount) throw new NotFoundException();
      await audit(
        c,
        ctx.userId,
        'development.activity.completed',
        'development_plan_item',
        id,
        ctx.requestId,
      );
      return { id, notice: 'Activity completion does not verify competence' };
    });
  }
  async retireItem(ctx: OperationContext, id: string, reason: string) {
    return this.db.transaction(async (c) => {
      if (
        !(
          await c.query('SELECT 1 FROM assessment_item_versions WHERE id=$1', [
            id,
          ])
        ).rowCount
      )
        throw new NotFoundException();
      await c.query(
        'INSERT INTO assessment_item_retirements(item_version_id,retired_by,reason) VALUES($1,$2,$3)',
        [id, ctx.userId, reason],
      );
      await audit(
        c,
        ctx.userId,
        'assessment.item.retired',
        'assessment_item_version',
        id,
        ctx.requestId,
      );
      return { id, retired: true };
    });
  }
  async authorCatalog() {
    return (
      await this.db.pool.query(
        'SELECT id,title,version,status,demo,notice,pathway_version_id FROM assessment_versions ORDER BY created_at DESC LIMIT 100',
      )
    ).rows;
  }
}
