import {
  Injectable,
  Inject,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { z } from 'zod';
import { hasPermission, type Permission } from '@vetready/domain';
import {
  trainingCreateSchema,
  trainingVersionSchema,
  trainingAssignmentSchema,
  learningProgressSchema,
} from '@vetready/contracts';
import type { OperationContext } from '../service';
import { TrainingRepository } from './repository';
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new UnprocessableEntityException({
      code: 'INVALID_TRAINING_INPUT',
      fields: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  return result.data;
};
const id = (value: string) => parse(z.uuid(), value);
function allowed(ctx: OperationContext, permission: Permission) {
  if (!hasPermission(ctx.grants, permission))
    throw new ForbiddenException('Permission required');
}
@Injectable()
export class TrainingService {
  constructor(
    @Inject(TrainingRepository) private readonly repository: TrainingRepository,
  ) {}
  catalog(ctx: OperationContext, admin = false) {
    allowed(ctx, admin ? 'training:manage' : 'catalog:read');
    return this.repository.catalog(admin);
  }
  detail(ctx: OperationContext, version: string, admin = false) {
    allowed(ctx, admin ? 'training:manage' : 'catalog:read');
    return this.repository.detail(id(version), admin);
  }
  create(ctx: OperationContext, body: unknown) {
    allowed(ctx, 'training:manage');
    return this.repository.create(ctx, parse(trainingCreateSchema, body));
  }
  version(ctx: OperationContext, course: string, body: unknown) {
    allowed(ctx, 'training:manage');
    return this.repository.version(
      ctx,
      id(course),
      parse(trainingVersionSchema, body),
    );
  }
  lifecycle(
    ctx: OperationContext,
    version: string,
    action: 'release-demo' | 'retire',
  ) {
    allowed(ctx, 'training:manage');
    return this.repository.lifecycle(ctx, id(version), action);
  }
  enroll(ctx: OperationContext, version: string) {
    allowed(ctx, 'candidate:own');
    return this.repository.enroll(ctx, id(version));
  }
  assign(ctx: OperationContext, body: unknown) {
    allowed(ctx, 'training:assign');
    const input = parse(trainingAssignmentSchema, body);
    return this.repository.enroll(
      ctx,
      input.courseVersionId,
      input.candidateId,
    );
  }
  enrollments(ctx: OperationContext) {
    allowed(ctx, 'candidate:own');
    return this.repository.enrollments(ctx);
  }
  enrollment(ctx: OperationContext, enrollment: string) {
    allowed(ctx, 'candidate:own');
    return this.repository.enrollment(ctx, id(enrollment));
  }
  progress(
    ctx: OperationContext,
    enrollment: string,
    lesson: string,
    body: unknown,
  ) {
    allowed(ctx, 'candidate:own');
    return this.repository.progress(
      ctx,
      id(enrollment),
      id(lesson),
      parse(learningProgressSchema, body),
    );
  }
}
