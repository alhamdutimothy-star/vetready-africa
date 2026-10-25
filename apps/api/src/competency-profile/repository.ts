import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  profileInputSchema,
  PROFILE_ENGINE_VERSION,
  type ProfileInput,
  type ProfileSource,
} from '@vetready/contracts';
import {
  aggregateCompetencyProfile,
  normalizeProfileInput,
  profileCanonicalJson,
  skillsPassport,
  hasPermission,
} from '@vetready/domain';
import { Database } from '../database';
import type { OperationContext } from '../service';
const digest = (value: unknown) =>
  createHash('sha256').update(profileCanonicalJson(value)).digest('hex');
@Injectable()
export class CompetencyProfileRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  private async owner(c: PoolClient, ctx: OperationContext, lock = false) {
    if (!hasPermission(ctx.grants, 'candidate:own'))
      throw new ForbiddenException('Candidate ownership capability required');
    const row = (
      await c.query<{ id: string }>(
        "SELECT p.id FROM candidate_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND u.status='ACTIVE'" +
          (lock ? ' FOR UPDATE OF p' : ''),
        [ctx.userId],
      )
    ).rows[0];
    if (!row) throw new NotFoundException('Candidate profile unavailable');
    return row.id;
  }
  private async facts(c: PoolClient, candidate: string): Promise<ProfileInput> {
    const evaluatedAt = (
      await c.query<{ time: string }>(
        'SELECT to_char(transaction_timestamp() AT TIME ZONE \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\') AS time',
      )
    ).rows[0]!.time;
    const pathways = (
      await c.query(
        `SELECT pv.id,pv.pathway_id AS "pathwayId",p.code,p.name,pv.version,pv.approval_status AS status FROM pathway_versions pv JOIN pathways p ON p.id=pv.pathway_id ORDER BY pv.id`,
      )
    ).rows;
    const groups = (
      await c.query(
        `SELECT gv.id,g.code,gv.name,ARRAY(SELECT pc.pathway_version_id FROM pathway_competencies pc WHERE pc.competency_version_id=gv.id ORDER BY pc.pathway_version_id) AS "pathwayVersionIds" FROM competency_versions gv JOIN competencies g ON g.id=gv.competency_id ORDER BY gv.id`,
      )
    ).rows;
    const competencies = (
      await c.query(
        `SELECT cv.id,ch.code,cv.statement,cv.version,cv.validation_status AS "validationStatus",ARRAY(SELECT m.group_version_id FROM child_group_mappings m WHERE m.child_version_id=cv.id ORDER BY m.group_version_id) AS "groupVersionIds",ARRAY(SELECT DISTINCT pc.pathway_version_id FROM child_group_mappings m JOIN pathway_competencies pc ON pc.competency_version_id=m.group_version_id WHERE m.child_version_id=cv.id ORDER BY pc.pathway_version_id) AS "pathwayVersionIds" FROM child_competency_versions cv JOIN child_competencies ch ON ch.id=cv.child_id ORDER BY cv.id`,
      )
    ).rows;
    const requirements = (
      await c.query(
        `SELECT pathway_version_id AS "pathwayVersionId",child_version_id AS "childVersionId",proposed_facets AS facets,validation_status AS "validationStatus",mandatory FROM pathway_child_requirements ORDER BY pathway_version_id,child_version_id`,
      )
    ).rows;
    // Read all owner evidence before aggregation; never inherit UI list limits.
    const evidence = (
      await c.query(
        `SELECT e.id,e.child_version_id,e.facet,e.status,e.demo,e.observation,e.observed_at,e.valid_until,e.source_kind,e.submission_version_id,
      a.assessment_version_id,av.version AS assessment_version,av.pathway_version_id AS assessment_pathway,av.demo AS assessment_demo,a.status AS attempt_status,
      sv.submission_id,sv.version AS submission_version,sv.pathway_version_id,sv.status AS source_state,
      pd.id AS practical_decision_id,pd.outcome AS practical_outcome,pd.created_at AS practical_date,pd.actor_id AS practical_reviewer,
      er.id AS verification_id,er.outcome AS verification_outcome,er.created_at AS verification_date,er.reviewer_id,
      EXISTS(SELECT 1 FROM competency_evidence_reviews vr WHERE vr.evidence_id=e.id AND vr.outcome='VERIFIED' AND vr.reviewer_id=a.assigned_assessor_id AND vr.reviewer_id<>p.user_id) AND
      EXISTS(SELECT 1 FROM assessor_reviews r JOIN assessment_moderations m ON m.review_id=r.id WHERE r.attempt_id=a.id AND m.outcome='CONFIRMED' AND m.moderator_id<>r.assessor_id AND m.moderator_id<>p.user_id AND NOT EXISTS(SELECT 1 FROM assessor_reviews newer WHERE newer.attempt_id=r.attempt_id AND (newer.created_at,newer.id)>(r.created_at,r.id)) AND NOT EXISTS(SELECT 1 FROM assessment_moderations newer WHERE newer.review_id=m.review_id AND (newer.created_at,newer.id)>(m.created_at,m.id))) AS verification_supported
      FROM competency_evidence e JOIN candidate_profiles p ON p.id=e.candidate_id
      LEFT JOIN assessment_attempts a ON a.id=e.attempt_id LEFT JOIN assessment_versions av ON av.id=a.assessment_version_id
      LEFT JOIN evidence_submission_versions sv ON sv.id=e.submission_version_id
      LEFT JOIN LATERAL (SELECT id,outcome,created_at,actor_id FROM practical_review_decisions WHERE version_id=sv.id ORDER BY sequence DESC LIMIT 1) pd ON true
      LEFT JOIN LATERAL (SELECT id,outcome,created_at,reviewer_id FROM competency_evidence_reviews WHERE evidence_id=e.id ORDER BY created_at DESC,id DESC LIMIT 1) er ON true
      WHERE e.candidate_id=$1 ORDER BY e.id`,
        [candidate],
      )
    ).rows;
    const date = (v: Date | string | null) =>
      v === null ? null : new Date(v).toISOString();
    const empty = {
      groupVersionIds: [],
      pathwayVersionIds: [],
      groupFacet: null,
      lifecycle: null,
      observation: null,
      sourceVersionId: null,
      sourceVersion: null,
      lineageId: null,
      decisionId: null,
      decisionOutcome: null,
      decisionAt: null,
      reviewerRef: null,
      validUntil: null,
      verificationSupported: false,
      reviewPending: false,
      completedLessons: null,
      totalLessons: null,
    };
    const sources: ProfileSource[] = evidence.map((e) => ({
      ...empty,
      key: 'evidence:' + e.id,
      id: e.id,
      kind:
        e.source_kind === 'ASSESSMENT' ? 'ASSESSMENT' : 'EXTERNAL_SUBMISSION',
      targets: [{ childVersionId: e.child_version_id, facet: e.facet }],
      status: e.status,
      lifecycle: e.source_state ?? null,
      demo: e.demo || Boolean(e.assessment_demo),
      observation: e.observation,
      sourceVersionId: e.submission_version_id ?? e.assessment_version_id,
      sourceVersion: e.submission_version ?? e.assessment_version,
      lineageId: e.submission_id ?? null,
      pathwayVersionIds: [e.pathway_version_id ?? e.assessment_pathway].filter(
        Boolean,
      ),
      recordedAt: date(e.observed_at)!,
      validUntil: date(e.valid_until),
      decisionId: e.practical_decision_id ?? e.verification_id ?? null,
      decisionOutcome: e.practical_outcome ?? e.verification_outcome ?? null,
      decisionAt: date(e.practical_date ?? e.verification_date ?? null),
      reviewerRef: e.practical_reviewer ?? e.reviewer_id ?? null,
      verificationSupported:
        e.source_kind === 'ASSESSMENT' &&
        e.attempt_status === 'REVIEWED' &&
        e.verification_supported === true &&
        ['KNOWLEDGE_ASSESSED', 'CASE_ASSESSED'].includes(e.facet),
      reviewPending: ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'].includes(
        e.source_state ?? e.attempt_status,
      ),
    }));
    const drafts = (
      await c.query(
        `SELECT v.id,v.submission_id,v.version,v.pathway_version_id,v.status,v.demo,v.created_at,coalesce((SELECT jsonb_agg(jsonb_build_object('childVersionId',m.child_version_id,'facet',m.requested_facet) ORDER BY m.child_version_id,m.requested_facet) FROM evidence_submission_competencies m WHERE m.submission_version_id=v.id),'[]') AS targets FROM evidence_submission_versions v WHERE v.candidate_id=$1 AND NOT EXISTS(SELECT 1 FROM competency_evidence WHERE submission_version_id=v.id) ORDER BY v.id`,
        [candidate],
      )
    ).rows;
    for (const v of drafts)
      sources.push({
        ...empty,
        key: 'submission:' + v.id,
        id: v.id,
        kind: 'PRACTICAL_DRAFT',
        targets: v.targets,
        status: v.status,
        lifecycle: v.status,
        demo: v.demo,
        sourceVersionId: v.id,
        sourceVersion: v.version,
        lineageId: v.submission_id,
        pathwayVersionIds: [v.pathway_version_id],
        recordedAt: date(v.created_at)!,
        reviewPending: ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'].includes(
          v.status,
        ),
      });
    const legacy = (
      await c.query(
        `SELECT id,competency_version_id,source,review_status,created_at,observed_at FROM evidence_records WHERE candidate_id=$1 ORDER BY id`,
        [candidate],
      )
    ).rows;
    const legacyFacet: Record<string, ProfileSource['groupFacet']> = {
      SELF_DECLARED: 'SELF_DECLARED',
      DOCUMENT: 'DOCUMENT_VERIFIED',
      KNOWLEDGE: 'KNOWLEDGE_ASSESSED',
      CASE: 'CASE_ASSESSED',
      PRACTICAL: 'PRACTICALLY_VERIFIED',
      EMPLOYMENT: 'WORKPLACE_VERIFIED',
      INTERNSHIP: 'WORKPLACE_VERIFIED',
      MENTOR: 'SELF_DECLARED',
      EMPLOYER_FEEDBACK: 'WORKPLACE_VERIFIED',
    };
    for (const e of legacy)
      sources.push({
        ...empty,
        key: 'legacy:' + e.id,
        id: e.id,
        kind: 'LEGACY_GROUP',
        targets: [],
        groupVersionIds: [e.competency_version_id],
        groupFacet: legacyFacet[e.source] ?? null,
        status: e.review_status,
        demo: false,
        recordedAt: date(e.observed_at ?? e.created_at)!,
        reviewPending: e.review_status === 'SUBMITTED',
      });
    const learning = (
      await c.query(
        `SELECT e.id,e.course_version_id,v.version,e.created_at,v.demo,
      (SELECT count(*)::int FROM training_lesson_versions l WHERE l.course_version_id=e.course_version_id) AS total,
      (SELECT count(*)::int FROM training_lesson_progress p WHERE p.enrollment_id=e.id AND p.state='COMPLETED') AS completed,
      ARRAY(SELECT DISTINCT pathway_version_id FROM training_pathway_links WHERE course_version_id=e.course_version_id ORDER BY pathway_version_id) AS pathways,
      ARRAY(SELECT DISTINCT child_version_id FROM training_competency_links WHERE course_version_id=e.course_version_id AND child_version_id IS NOT NULL ORDER BY child_version_id) AS children,
      ARRAY(SELECT DISTINCT group_version_id FROM training_competency_links WHERE course_version_id=e.course_version_id AND group_version_id IS NOT NULL ORDER BY group_version_id) AS groups
      FROM training_enrollments e JOIN training_course_versions v ON v.id=e.course_version_id WHERE e.candidate_id=$1 ORDER BY e.id`,
        [candidate],
      )
    ).rows;
    // Learning associations use targets for navigation only; the engine never counts them as competence.
    for (const e of learning)
      sources.push({
        ...empty,
        key: 'learning:' + e.id,
        id: e.id,
        kind: 'LEARNING',
        targets: e.children.map((childVersionId: string) => ({
          childVersionId,
          facet: 'LEARNING' as const,
        })),
        groupVersionIds: e.groups,
        pathwayVersionIds: e.pathways,
        status:
          e.total > 0 && e.completed === e.total ? 'COMPLETED' : 'IN_PROGRESS',
        demo: e.demo,
        sourceVersionId: e.course_version_id,
        sourceVersion: e.version,
        recordedAt: date(e.created_at)!,
        completedLessons: e.completed,
        totalLessons: e.total,
      });
    return normalizeProfileInput(
      profileInputSchema.parse({
        engineVersion: PROFILE_ENGINE_VERSION,
        evaluatedAt,
        pathways,
        groups,
        competencies,
        requirements,
        sources,
      }),
    );
  }
  current(ctx: OperationContext) {
    return this.db.transaction(async (c) => {
      await c.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
      );
      const owner = await this.owner(c, ctx);
      return aggregateCompetencyProfile(await this.facts(c, owner));
    });
  }
  async passport(ctx: OperationContext) {
    return skillsPassport(await this.current(ctx));
  }
  async competency(ctx: OperationContext, id: string) {
    const p = await this.current(ctx);
    const competency = p.competencies.find((x) => x.id === id);
    if (!competency) throw new NotFoundException('Competency unavailable');
    const keys = new Set([
      ...competency.facets.flatMap((f) => f.sourceKeys),
      ...competency.learningSourceKeys,
      ...competency.groupSupportingSourceKeys,
    ]);
    return {
      ...p,
      competencies: [competency],
      sources: p.sources.filter((s) => keys.has(s.key)),
      groupEvidence: p.groupEvidence.filter((g) =>
        competency.groupVersionIds.includes(g.groupVersionId),
      ),
    };
  }
  async gaps(ctx: OperationContext, pathway: string) {
    const p = await this.current(ctx);
    const path = p.pathways.find((x) => x.id === pathway);
    if (!path) throw new NotFoundException('Pathway version unavailable');
    return {
      engineVersion: p.engineVersion,
      evaluatedAt: p.evaluatedAt,
      pathway: path,
      notice: p.notice,
      readiness: p.readiness,
      configurationStatus: p.configurationStatus,
      competencies: p.competencies
        .filter((c) => c.pathwayVersionIds.includes(pathway))
        .map((c) => ({
          ...c,
          gaps: c.gaps.filter((g) => g.pathwayVersionId === pathway),
        })),
    };
  }
  async snapshot(ctx: OperationContext, commandId: string) {
    for (let attempt = 0; attempt < 3; attempt++)
      try {
        return await this.saveSnapshot(ctx, commandId);
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          ['40001', '23505', '40P01'].includes(String(error.code))
        )
          continue;
        throw error;
      }
    throw new ConflictException(
      'Concurrent snapshot request; retry the same command',
    );
  }
  private saveSnapshot(ctx: OperationContext, commandId: string) {
    return this.db.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      // Serialize only explicit receipts for this owner. Reads remain fresh and side-effect free.
      const owner = await this.owner(c, ctx, true);
      const old = (
        await c.query(
          'SELECT * FROM competency_profile_snapshots WHERE candidate_id=$1 AND command_id=$2',
          [owner, commandId],
        )
      ).rows[0];
      if (old) return this.checkedSnapshot(old, true);
      // Unique-command/serialization races retry the entire consistent transaction above.
      const input = await this.facts(c, owner),
        result = aggregateCompetencyProfile(input);
      const row = (
        await c.query(
          `INSERT INTO competency_profile_snapshots(candidate_id,actor_id,command_id,request_id,engine_version,evaluated_at,input_facts,result,input_digest,result_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [
            owner,
            ctx.userId,
            commandId,
            ctx.requestId,
            PROFILE_ENGINE_VERSION,
            input.evaluatedAt,
            JSON.stringify(input),
            JSON.stringify(result),
            digest(input),
            digest(result),
          ],
        )
      ).rows[0];
      return this.checkedSnapshot(row, false);
    });
  }
  private checkedSnapshot(row: Record<string, unknown>, replay: boolean) {
    const input = profileInputSchema.parse(row.input_facts),
      result = aggregateCompetencyProfile(input);
    if (
      digest(input) !== row.input_digest ||
      digest(result) !== row.result_digest ||
      profileCanonicalJson(result) !== profileCanonicalJson(row.result)
    )
      throw new InternalServerErrorException(
        'Historical profile integrity check failed',
      );
    return {
      id: row.id,
      createdAt: row.created_at,
      inputDigest: row.input_digest,
      resultDigest: row.result_digest,
      historical: true as const,
      replay,
      notice:
        'Historical calculation only. Current evidence may have changed. This snapshot is not a current passport.',
      input,
      result,
    };
  }
  saved(ctx: OperationContext, id: string) {
    return this.db.transaction(async (c) => {
      await c.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
      );
      const owner = await this.owner(c, ctx);
      const row = (
        await c.query(
          'SELECT * FROM competency_profile_snapshots WHERE id=$1 AND candidate_id=$2',
          [id, owner],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Private snapshot unavailable');
      return this.checkedSnapshot(row, false);
    });
  }
}
