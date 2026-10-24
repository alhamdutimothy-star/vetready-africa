import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { CaseBlueprintInput } from '@vetready/contracts';
import { evidenceDisposition } from '@vetready/domain';
import { Database, audit } from '../database';
import { AssessmentRepository } from '../assessment/repository';
import type { OperationContext } from '../service';

@Injectable()
export class CaseRepository {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AssessmentRepository)
    private readonly assessments: AssessmentRepository,
  ) {}
  async create(
    ctx: OperationContext,
    input: CaseBlueprintInput,
    client?: PoolClient,
  ) {
    const operation = async (c: PoolClient) => {
      const av = await this.assessments.create(
        ctx,
        {
          code: input.code,
          pathwayVersionId: input.pathwayVersionId,
          title: input.title,
          randomize: false,
        },
        c,
      );
      await c.query(
        'INSERT INTO case_blueprints(assessment_version_id,scenario,template_reference,source_references) VALUES($1,$2,$3,$4)',
        [
          av.id,
          input.scenario,
          input.templateReference,
          JSON.stringify(input.sourceReferences),
        ],
      );
      for (const [index, step] of input.steps.entries()) {
        // Stable item identity is scoped to case identity + stage, with the root version.
        const item = await this.assessments.item(
          ctx,
          av.id,
          {
            code: `${input.code}_${step.code}`,
            version: av.version,
            type: step.type,
            prompt: step.prompt,
            presentation: {},
            answerKey: null,
            method: 'CASE',
            difficulty: 'INTERMEDIATE',
            evidenceType: 'CASE_ASSESSED',
            groupVersionId: step.groupVersionId,
            childVersionId: step.childVersionId,
            criterionIds: step.criteria.map((x) => x.criterionId),
          },
          c,
        );
        await c.query(
          'INSERT INTO case_reasoning_steps VALUES($1,$2,$3,$4,$5)',
          [av.id, item.id, index + 1, step.code, step.title],
        );
        for (const criterion of step.criteria) {
          const rc = (
            await c.query<{ id: string }>(
              'SELECT id FROM rubric_criteria WHERE item_version_id=$1 AND criterion_id=$2',
              [item.id, criterion.criterionId],
            )
          ).rows[0]!;
          for (const dimension of criterion.dimensions)
            await c.query(
              'INSERT INTO case_rubric_dimensions VALUES($1,$2,$3,$4)',
              [av.id, item.id, rc.id, dimension],
            );
        }
      }
      await audit(
        c,
        ctx.userId,
        'case.blueprint.created',
        'assessment_version',
        av.id,
        ctx.requestId,
        { demo: true, stageCount: input.steps.length },
      );
      return {
        id: av.id,
        version: av.version,
        status: av.status,
        demo: true,
        notice: av.notice,
      };
    };
    return client ? operation(client) : this.db.transaction(operation);
  }
  async detail(id: string, author: boolean) {
    const result = (
      await this.db.pool.query(
        `SELECT a.id,a.version,a.title,a.pathway_version_id,a.status,a.demo,a.notice,
      a.author_id,a.reviewer_id,a.reviewed_at,a.created_at,b.scenario,b.template_reference,b.source_references,b.validation_notice,b.professional_status,b.effective_at,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('code',s.code,'title',s.title,'position',s.position,'itemVersionId',s.item_version_id,'prompt',i.prompt,
      'childVersionId',bp.child_version_id,'groupVersionId',bp.group_version_id,
      'rubric',(SELECT jsonb_agg(jsonb_build_object('id',rc.id,'criterionId',rc.criterion_id,'description',rc.description,
      'dimensions',(SELECT jsonb_agg(d.dimension ORDER BY d.dimension) FROM case_rubric_dimensions d WHERE d.assessment_version_id=a.id AND d.rubric_criterion_id=rc.id)) ORDER BY rc.id) FROM rubric_criteria rc WHERE rc.item_version_id=s.item_version_id)) ORDER BY s.position)
      FROM case_reasoning_steps s JOIN assessment_item_versions i ON i.id=s.item_version_id JOIN assessment_blueprint bp ON bp.assessment_version_id=s.assessment_version_id AND bp.item_version_id=s.item_version_id WHERE s.assessment_version_id=a.id),'[]') AS steps
      FROM case_blueprints b JOIN assessment_versions a ON a.id=b.assessment_version_id WHERE a.id=$1 AND ($2 OR a.status IN ('DEMO','APPROVED'))`,
        [id, author],
      )
    ).rows[0];
    if (!result) throw new NotFoundException('Case blueprint unavailable');
    if (
      !author &&
      (
        await this.db.pool.query(
          'SELECT 1 FROM dairy_pilot_versions WHERE assessment_version_id=$1',
          [id],
        )
      ).rowCount
    ) {
      for (const step of result.steps) delete step.rubric;
    }
    return result;
  }
  async manifest(ctx: OperationContext) {
    return this.db.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const candidate = await this.assessments.candidate(c, ctx.userId);
      const claims = (
        await c.query(
          `SELECT e.id,e.child_version_id,e.facet,e.status,e.demo,e.observation,e.observed_at,e.valid_until,
      e.attempt_id,e.item_version_id,e.source_kind,e.submission_version_id,
      a.assessment_version_id,av.version AS assessment_version,COALESCE(av.pathway_version_id,sv.pathway_version_id) AS pathway_version_id,
      sv.version AS submission_version,sv.status AS submission_status,
      CASE WHEN sv.practical THEN (SELECT jsonb_build_object('id',d.id,'outcome',d.outcome,'date',d.created_at,'competenceVerified',false) FROM practical_review_decisions d WHERE d.version_id=sv.id ORDER BY d.sequence DESC LIMIT 1) ELSE NULL END AS practical_demo_review,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'assessorId',r.assessor_id,'reviewedAt',r.created_at) ORDER BY r.created_at,r.id) FROM assessor_reviews r WHERE r.attempt_id=e.attempt_id),'[]') AS assessor_reviews,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'reviewerId',r.reviewer_id,'outcome',r.outcome,'date',r.created_at) ORDER BY r.created_at,r.id) FROM competency_evidence_reviews r WHERE r.evidence_id=e.id),'[]') AS verification_history,
      COALESCE((SELECT jsonb_agg(rc.id ORDER BY rc.id) FROM rubric_criteria rc WHERE rc.item_version_id=e.item_version_id),'[]') AS rubric_criterion_ids
      FROM competency_evidence e LEFT JOIN assessment_attempts a ON a.id=e.attempt_id LEFT JOIN assessment_versions av ON av.id=a.assessment_version_id LEFT JOIN evidence_submission_versions sv ON sv.id=e.submission_version_id WHERE e.candidate_id=$1 ORDER BY e.observed_at DESC,e.id LIMIT 501`,
          [candidate],
        )
      ).rows;
      const evaluatedAt = new Date();
      return {
        notice: 'PRIVATE EVIDENCE MANIFEST — NOT A PUBLIC SKILLS PASSPORT',
        evaluatedAt: evaluatedAt.toISOString(),
        readinessRulesActive: false,
        professionalReadiness: null,
        truncated: claims.length > 500,
        reassessmentPolicy: 'NOT_CONFIGURED',
        claims: claims.slice(0, 500).map((e) => ({
          ...e,
          disposition: evidenceDisposition(
            {
              facet: e.facet,
              status: e.status,
              demo: e.demo,
              observation: e.observation,
              validUntil: e.valid_until?.toISOString() ?? null,
            },
            evaluatedAt,
          ),
        })),
      };
    });
  }
}
