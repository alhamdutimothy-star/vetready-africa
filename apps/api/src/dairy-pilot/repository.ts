import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { hasPermission } from '@vetready/domain';
import {
  caseBlueprintSchema,
  reviewSchema,
  type PilotResponseInput,
  type PilotReviewDraftInput,
} from '@vetready/contracts';
import { Database, audit } from '../database';
import { AssessmentRepository } from '../assessment/repository';
import { CaseRepository } from '../cases/repository';
import { transitionFreshCowTemplate as template } from '../cases/transition-fresh-cow.content';
import type { OperationContext } from '../service';
import { stageCategories, suppliedEvidence, assessorGuidance } from './content';
@Injectable()
export class DairyPilotRepository {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AssessmentRepository)
    private readonly assessments: AssessmentRepository,
    @Inject(CaseRepository) private readonly cases: CaseRepository,
  ) {}
  async configuration() {
    const pilot = (
      await this.db.pool.query(
        'SELECT a.id,a.title,a.version,a.status,a.notice FROM dairy_pilot_versions p JOIN assessment_versions a ON a.id=p.assessment_version_id',
      )
    ).rows[0];
    if (!pilot)
      throw new NotFoundException('Dairy pilot has not been prepared');
    const guidance = (
      await this.db.pool.query(
        'SELECT rubric_criterion_id,assessor_guidance FROM dairy_pilot_guidance WHERE assessment_version_id=$1',
        [pilot.id],
      )
    ).rows;
    return { ...pilot, privateGuidance: guidance };
  }
  async setup(ctx: OperationContext) {
    return this.db.transaction(async (c) => {
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('vetready-dairy-pilot-v1'))",
      );
      const existing = (
        await c.query(
          'SELECT a.id,a.status,a.version FROM dairy_pilot_versions p JOIN assessment_versions a ON a.id=p.assessment_version_id',
        )
      ).rows[0];
      if (existing) return { ...existing, existing: true };
      const path = (
        await c.query(
          "SELECT v.id FROM pathway_versions v JOIN pathways p ON p.id=v.pathway_id WHERE p.code='DAIRY' AND v.approval_status<>'RETIRED' ORDER BY v.version DESC LIMIT 1",
        )
      ).rows[0];
      if (!path) throw new ConflictException('Dairy pathway unavailable');
      const rows = (
        await c.query<{
          child_version_id: string;
          group_version_id: string;
          code: string;
          criteria: { id: string }[];
        }>(
          `SELECT v.id AS child_version_id,m.group_version_id,ch.code, jsonb_agg(jsonb_build_object('id',cr.id) ORDER BY cr.position) AS criteria FROM child_competency_versions v JOIN child_competencies ch ON ch.id=v.child_id JOIN child_group_mappings m ON m.child_version_id=v.id JOIN pathway_domain_groups g ON g.group_version_id=m.group_version_id JOIN child_criteria cr ON cr.child_version_id=v.id WHERE g.pathway_version_id=$1 AND v.validation_status<>'RETIRED' GROUP BY v.id,m.group_version_id,ch.code ORDER BY v.version DESC,m.group_version_id`,
          [path.id],
        )
      ).rows;
      const input = caseBlueprintSchema.parse({
        code: 'DEMO_DAIRY_PILOT',
        pathwayVersionId: path.id,
        title: template.title,
        scenario: template.scenario,
        templateReference: template.templateReference,
        sourceReferences: [],
        steps: template.steps.map((s) => {
          const h = rows.find((h) => h.code === s.suggestedChildCode);
          if (!h)
            throw new ConflictException(
              'Required proposed competency mapping unavailable',
            );
          return {
            code: s.code,
            type: s.type,
            title: s.title,
            prompt: s.prompt,
            childVersionId: h.child_version_id,
            groupVersionId: h.group_version_id,
            criteria: h.criteria.map((cr, index) => ({
              criterionId: cr.id,
              dimensions:
                index === 0
                  ? [...s.dimensions]
                  : [s.dimensions[index % s.dimensions.length]],
            })),
          };
        }),
      });
      const source = (
        await c.query(
          `SELECT av.id,av.version,av.status,av.notice,a.code FROM assessment_versions av JOIN assessments a ON a.id=av.assessment_id JOIN case_blueprints b ON b.assessment_version_id=av.id WHERE av.pathway_version_id=$1 AND b.template_reference=$2 AND av.demo AND av.status IN ('DRAFT','DEMO') ORDER BY (av.status='DRAFT') DESC,av.created_at DESC,av.id LIMIT 1 FOR UPDATE OF av`,
          [path.id, template.templateReference],
        )
      ).rows[0];
      let av: { id: string; version: number; status: string; notice: string };
      if (source) {
        const content = await this.cases.detail(source.id, true);
        if (
          content.scenario !== template.scenario ||
          content.steps.length !== template.steps.length ||
          content.steps.some(
            (step: {
              code: string;
              rubric: { dimensions: string[] | null }[];
            }) =>
              !stageCategories[step.code] ||
              !step.rubric?.length ||
              step.rubric.some((r) => !r.dimensions?.length),
          )
        )
          throw new ConflictException(
            'Existing case differs from the controlled template; review evidence alignment before preparing the pilot',
          );
        if (source.status === 'DRAFT') av = source;
        else {
          const preserved = caseBlueprintSchema.parse({
            code: source.code,
            pathwayVersionId: content.pathway_version_id,
            title: content.title,
            scenario: content.scenario,
            templateReference: content.template_reference,
            sourceReferences: content.source_references,
            steps: content.steps.map(
              (step: {
                code: string;
                title: string;
                prompt: string;
                childVersionId: string;
                groupVersionId: string;
                rubric: { criterionId: string; dimensions: string[] }[];
              }) => ({
                code: step.code,
                type: input.steps.find((s) => s.code === step.code)!.type,
                title: step.title,
                prompt: step.prompt,
                childVersionId: step.childVersionId,
                groupVersionId: step.groupVersionId,
                criteria: step.rubric.map((r) => ({
                  criterionId: r.criterionId,
                  dimensions: r.dimensions,
                })),
              }),
            ),
          });
          av = await this.cases.create(ctx, preserved, c);
        }
      } else av = await this.cases.create(ctx, input, c);
      await c.query('INSERT INTO dairy_pilot_versions VALUES($1,$2,$3)', [
        av.id,
        'TRANSITION_FRESH_COW_V1',
        JSON.stringify(suppliedEvidence),
      ]);
      const steps = (
        await c.query(
          'SELECT * FROM case_reasoning_steps WHERE assessment_version_id=$1',
          [av.id],
        )
      ).rows;
      for (const step of steps) {
        await c.query('INSERT INTO dairy_pilot_stages VALUES($1,$2,$3)', [
          av.id,
          step.item_version_id,
          stageCategories[step.code],
        ]);
        await c.query(
          'INSERT INTO dairy_pilot_guidance SELECT $1,$2,id,$3 FROM rubric_criteria WHERE item_version_id=$2',
          [av.id, step.item_version_id, assessorGuidance],
        );
      }
      await audit(
        c,
        ctx.userId,
        'dairy.pilot.prepared',
        'assessment_version',
        av.id,
        ctx.requestId,
        { demo: true },
      );
      return av;
    });
  }
  async dashboard(ctx: OperationContext) {
    return this.db.transaction(async (c) => {
      const path = (
        await c.query(
          "SELECT p.id,p.name,v.id AS version_id FROM pathways p JOIN pathway_versions v ON v.pathway_id=p.id WHERE p.code='DAIRY' ORDER BY v.version DESC LIMIT 1",
        )
      ).rows[0];
      if (!path) throw new NotFoundException();
      const candidate = (
        await c.query('SELECT id FROM candidate_profiles WHERE user_id=$1', [
          ctx.userId,
        ])
      ).rows[0];
      const pilot =
        (
          await c.query(
            "SELECT a.id,a.title,a.version,a.status,a.notice FROM dairy_pilot_versions p JOIN assessment_versions a ON a.id=p.assessment_version_id WHERE a.status='DEMO'",
          )
        ).rows[0] ?? null;
      const attempts = candidate
        ? (
            await c.query(
              `SELECT a.id,a.status,a.started_at,a.submitted_at,a.reviewed_at,(SELECT count(*)::int FROM candidate_responses r WHERE r.attempt_id=a.id) AS saved,(SELECT count(*)::int FROM attempt_items t WHERE t.attempt_id=a.id) AS total FROM assessment_attempts a JOIN dairy_pilot_versions p ON p.assessment_version_id=a.assessment_version_id WHERE a.candidate_id=$1 ORDER BY a.started_at DESC LIMIT 20`,
              [candidate.id],
            )
          ).rows
        : [];
      const evidence = candidate
        ? (
            await c.query(
              `SELECT e.id,ch.code,e.facet,e.status,e.demo,e.observation,e.attempt_id FROM competency_evidence e JOIN child_competency_versions cv ON cv.id=e.child_version_id JOIN child_competencies ch ON ch.id=cv.child_id WHERE e.candidate_id=$1 AND EXISTS(SELECT 1 FROM child_group_mappings m JOIN pathway_competencies pc ON pc.competency_version_id=m.group_version_id WHERE m.child_version_id=e.child_version_id AND pc.pathway_version_id=$2) ORDER BY e.observed_at DESC LIMIT 200`,
              [candidate.id, path.version_id],
            )
          ).rows
        : [];
      const learning = candidate
        ? (
            await c.query(
              `SELECT count(DISTINCT e.id)::int AS enrollments,count(p.lesson_version_id) FILTER(WHERE p.state='COMPLETED')::int AS completed_lessons FROM training_enrollments e JOIN training_pathway_links l ON l.course_version_id=e.course_version_id LEFT JOIN training_lesson_progress p ON p.enrollment_id=e.id WHERE e.candidate_id=$1 AND l.pathway_version_id=$2`,
              [candidate.id, path.version_id],
            )
          ).rows[0]
        : { enrollments: 0, completed_lessons: 0 };
      const competencies = pilot
        ? (
            await c.query(
              `SELECT DISTINCT cv.id,ch.code,cv.statement,cv.validation_status FROM assessment_blueprint b JOIN child_competency_versions cv ON cv.id=b.child_version_id JOIN child_competencies ch ON ch.id=cv.child_id WHERE b.assessment_version_id=$1 ORDER BY ch.code`,
              [pilot.id],
            )
          ).rows
        : [];
      const selected = candidate
        ? Boolean(
            (
              await c.query(
                'SELECT 1 FROM candidate_pathways WHERE candidate_id=$1 AND pathway_id=$2',
                [candidate.id, path.id],
              )
            ).rowCount,
          )
        : false;
      return {
        pathway: path,
        profileRequired: !candidate,
        selected,
        pilot,
        attempts,
        evidence,
        competencies,
        learning,
        practicalVerification: 'PENDING_SEPARATE_SUPERVISED_PROCESS',
        readiness: null,
        notice:
          'DRAFT — REQUIRES DOMAIN EXPERT VALIDATION. Demo review is not professional verification.',
      };
    });
  }
  async requirePilot(c: Pick<PoolClient, 'query'>, id: string) {
    const row = (
      await c.query(
        'SELECT a.* FROM assessment_attempts a JOIN dairy_pilot_versions p ON p.assessment_version_id=a.assessment_version_id WHERE a.id=$1',
        [id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException('Dairy pilot attempt unavailable');
    return row;
  }
  async start(ctx: OperationContext) {
    const pilot = (
      await this.db.pool.query(
        "SELECT a.id FROM dairy_pilot_versions p JOIN assessment_versions a ON a.id=p.assessment_version_id WHERE a.status='DEMO'",
      )
    ).rows[0];
    if (!pilot)
      throw new ConflictException(
        'Owner must prepare and release the demo case first',
      );
    return this.assessments.start(ctx, pilot.id);
  }
  async detail(ctx: OperationContext, id: string, staff = false) {
    const a = await this.requirePilot(this.db.pool, id);
    const observer = staff && hasPermission(ctx.grants, 'assessment:assign');
    if (staff && a.status === 'IN_PROGRESS')
      throw new NotFoundException('Submitted attempt required');
    const d = await this.assessments.details(ctx, id, staff, observer);
    const configuration = (
      await this.db.pool.query(
        `SELECT s.item_version_id,s.response_categories,coalesce(r.revision,0) AS revision,cv.statement AS competency FROM dairy_pilot_stages s JOIN assessment_blueprint b ON b.assessment_version_id=s.assessment_version_id AND b.item_version_id=s.item_version_id JOIN child_competency_versions cv ON cv.id=b.child_version_id LEFT JOIN dairy_pilot_response_revisions r ON r.attempt_id=$2 AND r.item_version_id=s.item_version_id WHERE s.assessment_version_id=$1`,
        [a.assessment_version_id, id],
      )
    ).rows;
    const facts = (
      await this.db.pool.query(
        'SELECT supplied_evidence FROM dairy_pilot_versions WHERE assessment_version_id=$1',
        [a.assessment_version_id],
      )
    ).rows[0].supplied_evidence;
    const feedback = (
      await this.db.pool.query(
        `SELECT r.id,r.assessor_id,r.created_at,r.feedback,d.decision,(SELECT m.outcome FROM assessment_moderations m WHERE m.review_id=r.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS moderation,coalesce((SELECT jsonb_agg(jsonb_build_object('observation',o.observation,'comment',o.comment,'childCode',ch.code,'dimensions',(SELECT jsonb_agg(m.dimension ORDER BY m.dimension) FROM case_rubric_dimensions m WHERE m.assessment_version_id=$2 AND m.rubric_criterion_id=o.rubric_criterion_id))) FROM rubric_observations o JOIN rubric_criteria rc ON rc.id=o.rubric_criterion_id JOIN child_competency_versions cv ON cv.id=rc.child_version_id JOIN child_competencies ch ON ch.id=cv.child_id WHERE o.review_id=r.id),'[]') AS observations FROM dairy_pilot_review_finalizations f JOIN assessor_reviews r ON r.id=f.review_id JOIN dairy_pilot_review_drafts d ON d.id=f.draft_id WHERE f.attempt_id=$1 ORDER BY r.created_at DESC LIMIT 20`,
        [id, a.assessment_version_id],
      )
    ).rows;
    const result = {
      ...d,
      suppliedEvidence: facts,
      configuration,
      feedback,
      canReview:
        staff &&
        hasPermission(ctx.grants, 'assessment:review') &&
        a.assigned_assessor_id === ctx.userId,
      reviewDraft: null as unknown,
      privateGuidance: [] as unknown[],
    };
    if (staff) {
      result.reviewDraft =
        (
          await this.db.pool.query(
            'SELECT * FROM dairy_pilot_review_drafts WHERE attempt_id=$1 AND assessor_id=$2 ORDER BY revision DESC LIMIT 1',
            [id, ctx.userId],
          )
        ).rows[0] ?? null;
      result.privateGuidance = (
        await this.db.pool.query(
          'SELECT * FROM dairy_pilot_guidance WHERE assessment_version_id=$1',
          [a.assessment_version_id],
        )
      ).rows;
    } else {
      // Never serialize staff-only keys into the candidate payload.
      const { reviewDraft, privateGuidance, canReview, ...publicResult } =
        result;
      void reviewDraft;
      void privateGuidance;
      void canReview;
      return publicResult;
    }
    return result;
  }
  async response(
    ctx: OperationContext,
    id: string,
    item: string,
    input: PilotResponseInput,
  ) {
    return this.db.transaction(async (c) => {
      const a = await this.assessments.owned(c, ctx, id, true);
      await this.requirePilot(c, id);
      if (a.status !== 'IN_PROGRESS')
        throw new ConflictException('Submitted answers are immutable');
      const stage = (
        await c.query(
          'SELECT response_categories FROM dairy_pilot_stages WHERE assessment_version_id=$1 AND item_version_id=$2',
          [a.assessment_version_id, item],
        )
      ).rows[0];
      if (!stage) throw new NotFoundException();
      if (
        Object.keys(input.reasoning).some(
          (k) => !stage.response_categories.includes(k),
        )
      )
        throw new UnprocessableEntityException(
          'Reasoning category is not applicable to this stage',
        );
      const value = JSON.stringify({ reasoning: input.reasoning });
      const current = (
        await c.query(
          'SELECT v.revision,r.response=$3::jsonb AS same FROM dairy_pilot_response_revisions v JOIN candidate_responses r USING(attempt_id,item_version_id) WHERE v.attempt_id=$1 AND v.item_version_id=$2',
          [id, item, value],
        )
      ).rows[0];
      if (current?.same)
        return { saved: true, revision: current.revision, replayed: true };
      if ((current?.revision ?? 0) !== input.expectedRevision)
        throw new ConflictException(
          'A newer answer exists; preserve your text and reload before reconciling',
        );
      await c.query(
        'INSERT INTO candidate_responses(attempt_id,item_version_id,response) VALUES($1,$2,$3) ON CONFLICT(attempt_id,item_version_id) DO UPDATE SET response=EXCLUDED.response,updated_at=now()',
        [id, item, value],
      );
      const revision = (
        await c.query(
          'SELECT revision FROM dairy_pilot_response_revisions WHERE attempt_id=$1 AND item_version_id=$2',
          [id, item],
        )
      ).rows[0].revision;
      await audit(
        c,
        ctx.userId,
        'assessment.response.saved',
        'assessment_attempt',
        id,
        ctx.requestId,
        { itemVersionId: item, revision },
      );
      return { saved: true, revision };
    });
  }
  async queue(ctx: OperationContext) {
    const admin = hasPermission(ctx.grants, 'assessment:assign');
    const rows = (
      await this.db.pool.query(
        `SELECT a.id,a.status,a.assigned_assessor_id,v.title,a.submitted_at FROM assessment_attempts a JOIN dairy_pilot_versions p ON p.assessment_version_id=a.assessment_version_id JOIN assessment_versions v ON v.id=p.assessment_version_id WHERE a.status<>'IN_PROGRESS' AND ($2 OR a.assigned_assessor_id=$1) ORDER BY a.submitted_at DESC LIMIT 100`,
        [ctx.userId, admin],
      )
    ).rows;
    const assessors = admin
      ? (
          await this.db.pool.query(
            "SELECT id FROM users WHERE training_capability(id,'assessment:review') ORDER BY id LIMIT 100",
          )
        ).rows
      : [];
    return { attempts: rows, assessors };
  }
  async saveReview(
    ctx: OperationContext,
    id: string,
    input: PilotReviewDraftInput,
  ) {
    return this.db.transaction(async (c) => {
      const a = await this.assessments.assigned(c, ctx, id, true);
      await this.requirePilot(c, id);
      const current = (
        await c.query(
          'SELECT *,observations=$3::jsonb AS same_observations FROM dairy_pilot_review_drafts WHERE attempt_id=$1 AND assessor_id=$2 ORDER BY revision DESC LIMIT 1',
          [id, ctx.userId, JSON.stringify(input.observations)],
        )
      ).rows[0];
      if (
        current &&
        current.decision === input.decision &&
        current.feedback === input.feedback &&
        current.same_observations &&
        ((a.status === 'SUBMITTED' &&
          !(
            await c.query(
              'SELECT 1 FROM dairy_pilot_review_finalizations WHERE draft_id=$1',
              [current.id],
            )
          ).rowCount) ||
          (a.status === 'REVIEWED' &&
            (
              await c.query(
                'SELECT 1 FROM dairy_pilot_review_finalizations WHERE draft_id=$1',
                [current.id],
              )
            ).rowCount))
      )
        return { id: current.id, revision: current.revision, replayed: true };
      if (a.status !== 'SUBMITTED')
        throw new ConflictException('Submitted attempt required');
      if ((current?.revision ?? 0) !== input.expectedRevision)
        throw new ConflictException('A newer review draft exists');
      const criteria = (
        await c.query<{ id: string }>(
          'SELECT r.id FROM attempt_items t JOIN rubric_criteria r ON r.item_version_id=t.item_version_id WHERE t.attempt_id=$1',
          [id],
        )
      ).rows.map((r) => r.id);
      if (
        input.observations.some((o) => !criteria.includes(o.rubricCriterionId))
      )
        throw new UnprocessableEntityException(
          'Rubric criterion is not part of this attempt',
        );
      const draft = (
        await c.query(
          'INSERT INTO dairy_pilot_review_drafts(attempt_id,assessor_id,revision,decision,feedback,observations,request_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,revision',
          [
            id,
            ctx.userId,
            (current?.revision ?? 0) + 1,
            input.decision,
            input.feedback,
            JSON.stringify(input.observations),
            ctx.requestId,
          ],
        )
      ).rows[0];
      await audit(
        c,
        ctx.userId,
        'dairy.review.draft.saved',
        'assessment_attempt',
        id,
        ctx.requestId,
        { draftId: draft.id, revision: draft.revision },
      );
      return draft;
    });
  }
  async finalize(ctx: OperationContext, id: string, revision: number) {
    return this.db.transaction(async (c) => {
      const a = await this.assessments.assigned(c, ctx, id, true);
      await this.requirePilot(c, id);
      const draft = (
        await c.query(
          'SELECT * FROM dairy_pilot_review_drafts WHERE attempt_id=$1 AND assessor_id=$2 ORDER BY revision DESC LIMIT 1',
          [id, ctx.userId],
        )
      ).rows[0];
      if (!draft || draft.revision !== revision)
        throw new ConflictException(
          'Save and finalize the latest review draft',
        );
      const final = (
        await c.query(
          'SELECT review_id FROM dairy_pilot_review_finalizations WHERE draft_id=$1',
          [draft.id],
        )
      ).rows[0];
      if (final && a.status === 'REVIEWED')
        return {
          id: final.review_id,
          verification: 'UNVERIFIED',
          replayed: true,
        };
      if (final || a.status !== 'SUBMITTED')
        throw new ConflictException('A fresh submitted review is required');
      const parsed = reviewSchema.safeParse({
        feedback: draft.feedback,
        observations: draft.observations,
      });
      if (!parsed.success)
        throw new UnprocessableEntityException(
          'Complete every criterion judgment/comment and overall feedback before finalizing',
        );
      const reviewed = await this.assessments.review(
        ctx,
        id,
        parsed.data,
        c,
        draft.id,
      );
      await c.query(
        'INSERT INTO dairy_pilot_review_finalizations(review_id,attempt_id,assessor_id,draft_id) VALUES($1,$2,$3,$4)',
        [reviewed.id, id, ctx.userId, draft.id],
      );
      await audit(
        c,
        ctx.userId,
        'dairy.review.finalized',
        'assessment_attempt',
        id,
        ctx.requestId,
        { reviewId: reviewed.id, draftId: draft.id, decision: draft.decision },
      );
      return reviewed;
    });
  }
}
