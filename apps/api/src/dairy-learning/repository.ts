import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  DairyCurriculumInput,
  DairyActivityInput,
} from '@vetready/contracts';
import { Database } from '../database';
import { TrainingRepository } from '../training/repository';
import type { OperationContext } from '../service';
@Injectable()
export class DairyLearningRepository {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(TrainingRepository) private readonly training: TrainingRepository,
  ) {}
  create(ctx: OperationContext, input: DairyCurriculumInput) {
    return this.training.transact(async (c) => {
      const v = input.courseId
        ? await this.training.version(
            ctx,
            input.courseId,
            input.training.content,
            c,
          )
        : await this.training.create(ctx, input.training, c);
      await c.query(
        'INSERT INTO dairy_curricula(course_version_id,domains,author_id,request_id) VALUES($1,$2,$3,$4)',
        [
          v.courseVersionId,
          JSON.stringify(input.domains),
          ctx.userId,
          ctx.requestId,
        ],
      );
      for (const unit of input.units) {
        const l = (
          await c.query<{ id: string; module_version_id: string }>(
            'SELECT v.id,v.module_version_id FROM training_lesson_versions v JOIN training_lessons l ON l.id=v.lesson_id WHERE v.course_version_id=$1 AND l.code=$2',
            [v.courseVersionId, unit.lessonCode],
          )
        ).rows[0];
        if (!l)
          throw new UnprocessableEntityException(
            'Learning unit lesson unavailable',
          );
        await c.query(
          'INSERT INTO dairy_learning_units(lesson_version_id,course_version_id,module_version_id,domain_code,content) VALUES($1,$2,$3,$4,$5)',
          [
            l.id,
            v.courseVersionId,
            l.module_version_id,
            unit.domainCode,
            JSON.stringify(unit),
          ],
        );
      }
      return v;
    });
  }
  async enrollments(ctx: OperationContext) {
    return (
      await this.db.pool.query(
        'SELECT e.id,e.course_version_id,v.title,v.version FROM training_enrollments e JOIN candidate_profiles p ON p.id=e.candidate_id JOIN dairy_curricula d ON d.course_version_id=e.course_version_id JOIN training_course_versions v ON v.id=d.course_version_id WHERE p.user_id=$1 ORDER BY e.created_at DESC LIMIT 100',
        [ctx.userId],
      )
    ).rows;
  }
  async catalog(admin = false) {
    return (
      await this.db.pool.query(
        `SELECT v.id,v.title,v.version,v.status,v.notice,v.demo_released_at,d.domains,d.author_id,d.created_at FROM dairy_curricula d JOIN training_course_versions v ON v.id=d.course_version_id ${admin ? '' : "WHERE v.status='DRAFT' AND v.demo_released_at IS NOT NULL"} ORDER BY v.created_at DESC LIMIT 100`,
      )
    ).rows;
  }
  async detail(
    ctx: OperationContext,
    id: string,
    admin = false,
    enrollmentId?: string,
  ) {
    const base = enrollmentId
      ? await this.training.enrollment(ctx, enrollmentId)
      : null;
    if (base && base.enrollment.course_version_id !== id)
      throw new NotFoundException('Learning version unavailable');
    const course = base?.course ?? (await this.training.detail(id, admin));
    const curriculum = (
      await this.db.pool.query(
        'SELECT domains,author_id,created_at FROM dairy_curricula WHERE course_version_id=$1',
        [id],
      )
    ).rows[0];
    if (!curriculum)
      throw new NotFoundException('Dairy curriculum unavailable');
    const competencies = (
      await this.db.pool.query(
        `SELECT DISTINCT v.id,ch.code,v.statement,v.validation_status FROM training_competency_links t JOIN child_competency_versions v ON v.id=t.child_version_id JOIN child_competencies ch ON ch.id=v.child_id WHERE t.course_version_id=$1 ORDER BY ch.code`,
        [id],
      )
    ).rows;
    const units = (
      await this.db.pool.query(
        'SELECT lesson_version_id,domain_code,content FROM dairy_learning_units WHERE course_version_id=$1 ORDER BY lesson_version_id',
        [id],
      )
    ).rows;
    const activities = enrollmentId
      ? (
          await this.db.pool.query(
            'SELECT DISTINCT ON(lesson_version_id) lesson_version_id,revision,response,created_at FROM dairy_learning_activities WHERE enrollment_id=$1 ORDER BY lesson_version_id,revision DESC',
            [enrollmentId],
          )
        ).rows
      : [];
    const evidence = enrollmentId
      ? (
          await this.db.pool.query(
            `SELECT e.child_version_id,e.facet,e.status,e.demo FROM competency_evidence e JOIN candidate_profiles p ON p.id=e.candidate_id WHERE p.user_id=$1 AND (e.valid_until IS NULL OR e.valid_until>now())`,
            [ctx.userId],
          )
        ).rows
      : [];
    return {
      course,
      curriculum,
      competencies,
      units: units.map((u) => ({
        ...u,
        prerequisites: u.content.prerequisites.map(
          (p: { childVersionId: string; facet: string }) => ({
            ...p,
            status: evidence.some(
              (e) =>
                e.child_version_id === p.childVersionId &&
                e.facet === p.facet &&
                e.status === 'VERIFIED' &&
                !e.demo,
            )
              ? 'VERIFIED_EVIDENCE_PRESENT'
              : 'UNVERIFIED',
            guidanceOnly: true,
          }),
        ),
      })),
      activities,
      progress: base?.progress ?? null,
      competenceVerified: false,
      readiness: null,
    };
  }
  async activity(
    ctx: OperationContext,
    enrollment: string,
    lesson: string,
    input: DairyActivityInput,
  ) {
    return this.db.transaction(async (c) => {
      if (
        !(
          await c.query(
            'SELECT e.id FROM training_enrollments e JOIN candidate_profiles p ON p.id=e.candidate_id WHERE e.id=$1 AND p.user_id=$2 FOR UPDATE OF e',
            [enrollment, ctx.userId],
          )
        ).rowCount
      )
        throw new NotFoundException('Enrollment unavailable');
      const old = (
        await c.query(
          'SELECT * FROM dairy_learning_activities WHERE enrollment_id=$1 AND command_id=$2',
          [enrollment, input.commandId],
        )
      ).rows[0];
      if (old) {
        if (
          old.lesson_version_id !== lesson ||
          old.response !== input.response ||
          old.revision !== input.expectedRevision + 1
        )
          throw new ConflictException('Activity command conflict');
        return { revision: old.revision, competenceVerified: false };
      }
      if (
        !(
          await c.query(
            "SELECT 1 FROM dairy_learning_units u JOIN training_enrollments e ON e.course_version_id=u.course_version_id JOIN training_course_versions v ON v.id=u.course_version_id WHERE e.id=$1 AND u.lesson_version_id=$2 AND v.status='DRAFT' AND v.demo_released_at IS NOT NULL",
            [enrollment, lesson],
          )
        ).rowCount
      )
        throw new NotFoundException('Active enrolled unit unavailable');
      const latest = (
        await c.query(
          'SELECT coalesce(max(revision),0)::int AS revision FROM dairy_learning_activities WHERE enrollment_id=$1 AND lesson_version_id=$2',
          [enrollment, lesson],
        )
      ).rows[0].revision;
      if (latest !== input.expectedRevision)
        throw new ConflictException('A newer activity response exists');
      await c.query(
        'INSERT INTO dairy_learning_activities(enrollment_id,lesson_version_id,actor_id,command_id,revision,response,request_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          enrollment,
          lesson,
          ctx.userId,
          input.commandId,
          latest + 1,
          input.response,
          ctx.requestId,
        ],
      );
      return { revision: latest + 1, competenceVerified: false };
    });
  }
}
