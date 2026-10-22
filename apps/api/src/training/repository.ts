import {
  Injectable,
  Inject,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type {
  TrainingCreateInput,
  TrainingVersionInput,
  LearningProgressInput,
} from '@vetready/contracts';
import { learningSummary } from '@vetready/domain';
import { Database } from '../database';
import type { OperationContext } from '../service';

export interface ModuleView {
  id: string;
  module_id: string;
  position: number;
  title: string;
  description: string;
  objectives: string[];
}
export interface LessonView {
  id: string;
  lesson_id: string;
  module_version_id: string;
  position: number;
  title: string;
  description: string;
  objectives: string[];
  body: string;
}
export interface CourseView {
  id: string;
  course_id: string;
  version: number;
  title: string;
  status: string;
  demo: boolean;
  notice: string;
  demo_released_at: Date | null;
}
@Injectable()
export class TrainingRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  async transact<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(operation);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        const code = String(error.code);
        if (code === '23505')
          throw new ConflictException('Training record already exists');
        if (['23503', '23514', '23502'].includes(code))
          throw new UnprocessableEntityException(
            'Invalid training hierarchy or reference',
          );
        if (code === 'P0001') {
          const message = 'message' in error ? String(error.message) : '';
          if (
            [
              'Candidate progress owner required',
              'Enrollment authority required',
              'Training management capability required',
            ].includes(message)
          )
            throw new ForbiddenException('Training operation not authorized');
          if (
            [
              'Completion cannot be erased',
              'Progress command payload conflict',
              'Progress identity immutable',
              'Progress revision conflict',
              'Released training immutable',
              'Retired training immutable',
              'Training parent immutable',
              'Training referenced competency immutable; create new version',
              'Training snapshot immutable or missing',
              'Training version identity immutable',
            ].includes(message)
          )
            throw new ConflictException('Training state or revision conflict');
          if (
            [
              'Active demo training required',
              'Active owner and released demo course required',
              'Complete training hierarchy and pathways required',
              'Invalid demo release',
              'Invalid training lesson or resume position',
              'Lesson outside enrolled version',
              'Production training approval disabled',
              'Released assessment reference required',
              'Training assessment mapping no longer valid',
              'Training assessment/pathway mismatch',
              'Training child/pathway mismatch',
              'Training competency mapping no longer valid',
              'Training group/pathway mismatch',
              'Training text size bound exceeded',
              'Unreleased training draft required',
              'Dairy pathway required',
              'Domain competency mappings required',
              'Domain competency outside training mappings',
              'Unit domain mismatch',
              'Prerequisite list required',
              'Prerequisite outside training mappings',
              'Every curriculum lesson requires a governed unit',
            ].includes(message)
          )
            throw new UnprocessableEntityException(
              'Invalid training hierarchy, reference or lifecycle operation',
            );
          // Unknown internal/audit failures remain safe 500s, never misreported as invalid candidate input.
        }
      }
      throw error;
    }
  }
  async candidate(c: PoolClient, user: string) {
    const found = (
      await c.query<{ id: string }>(
        'SELECT id FROM candidate_profiles WHERE user_id=$1',
        [user],
      )
    ).rows[0];
    if (!found) throw new ConflictException('Create a candidate profile first');
    return found.id;
  }
  async catalog(admin = false) {
    return (
      await this.db.pool.query(
        `SELECT v.id,v.course_id,c.code,v.version,v.title,v.description,v.status,v.demo,v.demo_released_at,v.notice,v.created_at,ARRAY(SELECT pathway_version_id FROM training_pathway_links WHERE course_version_id=v.id ORDER BY pathway_version_id) AS "pathwayVersionIds" FROM training_course_versions v JOIN training_courses c ON c.id=v.course_id ${admin ? '' : "WHERE v.status='DRAFT' AND v.demo_released_at IS NOT NULL"} ORDER BY v.created_at DESC,v.id LIMIT 100`,
      )
    ).rows;
  }
  create(
    ctx: OperationContext,
    input: TrainingCreateInput,
    client?: PoolClient,
  ) {
    const operation = async (c: PoolClient) => {
      const course = (
        await c.query<{ id: string }>(
          'INSERT INTO training_courses(code,created_by) VALUES($1,$2) RETURNING id',
          [input.code, ctx.userId],
        )
      ).rows[0]!;
      return this.insertVersion(c, ctx, course.id, input.content);
    };
    return client ? operation(client) : this.transact(operation);
  }
  version(
    ctx: OperationContext,
    courseId: string,
    content: TrainingVersionInput,
    client?: PoolClient,
  ) {
    const operation = async (c: PoolClient) => {
      if (
        !(
          await c.query(
            'SELECT 1 FROM training_courses WHERE id=$1 FOR UPDATE',
            [courseId],
          )
        ).rowCount
      )
        throw new NotFoundException('Training course unavailable');
      return this.insertVersion(c, ctx, courseId, content);
    };
    return client ? operation(client) : this.transact(operation);
  }
  private async insertVersion(
    c: PoolClient,
    ctx: OperationContext,
    course: string,
    input: TrainingVersionInput,
  ) {
    await c.query('SELECT id FROM training_courses WHERE id=$1 FOR UPDATE', [
      course,
    ]);
    const v = (
      await c.query<{ id: string; version: number }>(
        `INSERT INTO training_course_versions(course_id,version,title,description,objectives,author_id,source_references,change_actor_id,change_request_id) SELECT $1,coalesce(max(version),0)+1,$2,$3,$4,$5,$6,$5,$7 FROM training_course_versions WHERE course_id=$1 RETURNING id,version`,
        [
          course,
          input.title,
          input.description,
          JSON.stringify(input.objectives),
          ctx.userId,
          JSON.stringify(input.sourceReferences),
          ctx.requestId,
        ],
      )
    ).rows[0]!;
    for (const pathway of input.pathwayVersionIds)
      await c.query('INSERT INTO training_pathway_links VALUES($1,$2)', [
        v.id,
        pathway,
      ]);
    const links = async (
      node: {
        competencyMappings: TrainingVersionInput['competencyMappings'];
        assessmentVersionIds: string[];
      },
      module: string | null,
      lesson: string | null,
    ) => {
      for (const mapping of node.competencyMappings)
        await c.query(
          'INSERT INTO training_competency_links(course_version_id,module_version_id,lesson_version_id,pathway_version_id,child_version_id,group_version_id) VALUES($1,$2,$3,$4,$5,$6)',
          [
            v.id,
            module,
            lesson,
            mapping.pathwayVersionId,
            mapping.childVersionId ?? null,
            mapping.groupVersionId ?? null,
          ],
        );
      for (const assessment of node.assessmentVersionIds)
        await c.query(
          'INSERT INTO training_assessment_links(course_version_id,module_version_id,lesson_version_id,assessment_version_id) VALUES($1,$2,$3,$4)',
          [v.id, module, lesson, assessment],
        );
    };
    await links(input, null, null);
    for (const [position, m] of input.modules.entries()) {
      await c.query(
        'INSERT INTO training_modules(course_id,code) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [course, m.code],
      );
      const stable = (
        await c.query<{ id: string }>(
          'SELECT id FROM training_modules WHERE course_id=$1 AND code=$2',
          [course, m.code],
        )
      ).rows[0]!.id;
      const module = (
        await c.query<{ id: string }>(
          'INSERT INTO training_module_versions(module_id,course_id,course_version_id,position,title,description,objectives) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [
            stable,
            course,
            v.id,
            position + 1,
            m.title,
            m.description,
            JSON.stringify(m.objectives),
          ],
        )
      ).rows[0]!.id;
      await links(m, module, null);
      for (const [lessonPosition, l] of m.lessons.entries()) {
        await c.query(
          'INSERT INTO training_lessons(module_id,code) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [stable, l.code],
        );
        const lessonStable = (
          await c.query<{ id: string }>(
            'SELECT id FROM training_lessons WHERE module_id=$1 AND code=$2',
            [stable, l.code],
          )
        ).rows[0]!.id;
        const lesson = (
          await c.query<{ id: string }>(
            'INSERT INTO training_lesson_versions(lesson_id,module_id,module_version_id,course_version_id,position,title,description,objectives,body) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
            [
              lessonStable,
              stable,
              module,
              v.id,
              lessonPosition + 1,
              l.title,
              l.description,
              JSON.stringify(l.objectives),
              l.body,
            ],
          )
        ).rows[0]!.id;
        await links(l, module, lesson);
      }
    }
    return {
      courseId: course,
      courseVersionId: v.id,
      version: v.version,
      status: 'DRAFT',
      demo: true,
      competenceVerified: false,
    };
  }
  lifecycle(
    ctx: OperationContext,
    version: string,
    action: 'release-demo' | 'retire',
  ) {
    return this.transact(async (c) => {
      const current = (
        await c.query<{ status: string; demo_released_at: Date | null }>(
          'SELECT status,demo_released_at FROM training_course_versions WHERE id=$1 FOR UPDATE',
          [version],
        )
      ).rows[0];
      if (!current) throw new NotFoundException('Training version unavailable');
      if (
        (action === 'retire' && current.status === 'RETIRED') ||
        (action === 'release-demo' &&
          current.status === 'DRAFT' &&
          current.demo_released_at)
      )
        return { id: version, status: current.status, demo: true };
      if (action === 'release-demo' && current.status !== 'DRAFT')
        throw new ConflictException('Training version retired');
      const query =
        action === 'release-demo'
          ? 'demo_released_at=now()'
          : "status='RETIRED',retired_at=now()";
      return (
        await c.query(
          `UPDATE training_course_versions SET ${query},change_actor_id=$2,change_request_id=$3 WHERE id=$1 RETURNING id,status,demo,demo_released_at,notice`,
          [version, ctx.userId, ctx.requestId],
        )
      ).rows[0];
    });
  }
  private async snapshot(c: PoolClient, version: string) {
    const course = (
      await c.query<CourseView>(
        'SELECT * FROM training_course_versions WHERE id=$1',
        [version],
      )
    ).rows[0];
    if (!course) throw new NotFoundException('Training version unavailable');
    const pathwayVersionIds = (
      await c.query<{ pathway_version_id: string }>(
        'SELECT pathway_version_id FROM training_pathway_links WHERE course_version_id=$1 ORDER BY pathway_version_id',
        [version],
      )
    ).rows.map((row) => row.pathway_version_id);
    const modules = (
      await c.query<ModuleView>(
        'SELECT id,module_id,position,title,description,objectives FROM training_module_versions WHERE course_version_id=$1 ORDER BY position',
        [version],
      )
    ).rows;
    const lessons = (
      await c.query<LessonView>(
        'SELECT id,lesson_id,module_version_id,position,title,description,objectives,body FROM training_lesson_versions WHERE course_version_id=$1 ORDER BY position',
        [version],
      )
    ).rows;
    const competencyMappings = (
      await c.query(
        'SELECT module_version_id,lesson_version_id,pathway_version_id,child_version_id,group_version_id FROM training_competency_links WHERE course_version_id=$1 ORDER BY id',
        [version],
      )
    ).rows;
    const assessments = (
      await c.query(
        'SELECT t.module_version_id,t.lesson_version_id,t.assessment_version_id,a.status,a.demo FROM training_assessment_links t JOIN assessment_versions a ON a.id=t.assessment_version_id WHERE t.course_version_id=$1 ORDER BY t.id',
        [version],
      )
    ).rows;
    return {
      ...course,
      pathwayVersionIds,
      modules: modules.map((m) => ({
        ...m,
        lessons: lessons.filter((l) => l.module_version_id === m.id),
      })),
      competencyMappings,
      assessments,
      competenceVerified: false,
    };
  }
  detail(version: string, admin = false) {
    return this.transact(async (c) => {
      if (
        !admin &&
        !(
          await c.query(
            "SELECT 1 FROM training_course_versions WHERE id=$1 AND status='DRAFT' AND demo_released_at IS NOT NULL",
            [version],
          )
        ).rowCount
      )
        throw new NotFoundException('Released demo unavailable');
      return this.snapshot(c, version);
    });
  }
  enroll(ctx: OperationContext, version: string, candidate?: string) {
    return this.transact(async (c) => {
      const owner = candidate ?? (await this.candidate(c, ctx.userId));
      const row = (
        await c.query(
          'INSERT INTO training_enrollments(candidate_id,course_version_id,kind,assigned_by,request_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(candidate_id,course_version_id) DO NOTHING RETURNING *',
          [
            owner,
            version,
            candidate ? 'ASSIGNED' : 'SELF',
            ctx.userId,
            ctx.requestId,
          ],
        )
      ).rows[0];
      return (
        row ??
        (
          await c.query(
            'SELECT * FROM training_enrollments WHERE candidate_id=$1 AND course_version_id=$2',
            [owner, version],
          )
        ).rows[0]
      );
    });
  }
  enrollments(ctx: OperationContext) {
    return this.transact(
      async (c) =>
        (
          await c.query(
            'SELECT e.id,e.course_version_id,e.kind,e.created_at,v.title,v.version,v.status,v.notice FROM training_enrollments e JOIN candidate_profiles p ON p.id=e.candidate_id JOIN training_course_versions v ON v.id=e.course_version_id WHERE p.user_id=$1 ORDER BY e.created_at DESC LIMIT 100',
            [ctx.userId],
          )
        ).rows,
    );
  }
  enrollment(ctx: OperationContext, id: string) {
    return this.transact(async (c) => {
      const e = (
        await c.query(
          'SELECT e.* FROM training_enrollments e JOIN candidate_profiles p ON p.id=e.candidate_id WHERE e.id=$1 AND p.user_id=$2',
          [id, ctx.userId],
        )
      ).rows[0];
      if (!e) throw new NotFoundException('Enrollment unavailable');
      const snapshot = await this.snapshot(c, e.course_version_id);
      const progress = (
        await c.query<{
          lesson_version_id: string;
          state: 'IN_PROGRESS' | 'COMPLETED';
          completed_at: Date | null;
          resume_position: number;
          revision: number;
        }>(
          'SELECT lesson_version_id,state,resume_position,revision,completed_at FROM training_lesson_progress WHERE enrollment_id=$1',
          [id],
        )
      ).rows;
      const modules = snapshot.modules.map((m) => {
        const lessons = m.lessons.map((l) => {
          const p = progress.find((p) => p.lesson_version_id === l.id);
          return {
            ...l,
            state: p?.state ?? ('NOT_STARTED' as const),
            completedAt: p?.completed_at?.toISOString() ?? null,
            resumePosition: p?.resume_position ?? 0,
            revision: p?.revision ?? 0,
          };
        });
        return { ...m, lessons, progress: learningSummary(lessons) };
      });
      return {
        enrollment: e,
        course: { ...snapshot, modules },
        progress: learningSummary(modules.flatMap((m) => m.lessons)),
        competenceVerified: false,
      };
    });
  }
  progress(
    ctx: OperationContext,
    enrollment: string,
    lesson: string,
    input: LearningProgressInput,
  ) {
    return this.transact(async (c) => {
      if (
        !(
          await c.query(
            'SELECT 1 FROM training_enrollments e JOIN candidate_profiles p ON p.id=e.candidate_id WHERE e.id=$1 AND p.user_id=$2',
            [enrollment, ctx.userId],
          )
        ).rowCount
      )
        throw new NotFoundException('Enrollment unavailable');
      return (
        await c.query(
          'SELECT update_training_progress($1,$2,$3,$4,$5,$6,$7,$8) AS result',
          [
            enrollment,
            ctx.userId,
            lesson,
            input.commandId,
            input.expectedRevision,
            input.state,
            input.resumePosition,
            ctx.requestId,
          ],
        )
      ).rows[0].result;
    });
  }
}
