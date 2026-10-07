import {
  Inject,
  Injectable,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { z } from 'zod';
import { hasPermission, type Permission } from '@vetready/domain';
import {
  assessmentCreateSchema,
  itemCreateSchema,
  responseSchema,
  reviewSchema,
  evidenceReviewSchema,
  moderationSchema,
} from '@vetready/contracts';
import type { OperationContext } from '../service';
import { AssessmentRepository } from './repository';
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new UnprocessableEntityException({
      code: 'INVALID_INPUT',
      fields: r.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  return r.data;
}
function allowed(c: OperationContext, p: Permission) {
  if (!hasPermission(c.grants, p))
    throw new ForbiddenException('Permission required');
}
const id = (v: string) => parse(z.uuid(), v);
@Injectable()
export class AssessmentService {
  constructor(
    @Inject(AssessmentRepository)
    private readonly repository: AssessmentRepository,
  ) {}
  catalog(c: OperationContext) {
    allowed(c, 'catalog:read');
    return this.repository.catalog();
  }
  hierarchy(c: OperationContext, path: string) {
    allowed(c, 'catalog:read');
    return this.repository.hierarchy(id(path));
  }
  create(c: OperationContext, body: unknown) {
    allowed(c, 'assessment:author');
    return this.repository.create(c, parse(assessmentCreateSchema, body));
  }
  item(c: OperationContext, assessment: string, body: unknown) {
    allowed(c, 'assessment:author');
    return this.repository.item(
      c,
      id(assessment),
      parse(itemCreateSchema, body),
    );
  }
  publish(c: OperationContext, assessment: string) {
    allowed(c, 'assessment:author');
    return this.repository.publish(c, id(assessment));
  }
  retire(c: OperationContext, assessment: string) {
    allowed(c, 'assessment:author');
    return this.repository.retire(c, id(assessment));
  }
  retireItem(c: OperationContext, item: string, body: unknown) {
    allowed(c, 'assessment:author');
    const v = parse(
      z.object({ reason: z.string().min(10).max(3000) }).strict(),
      body,
    );
    return this.repository.retireItem(c, id(item), v.reason);
  }
  authorCatalog(c: OperationContext) {
    allowed(c, 'assessment:author');
    return this.repository.authorCatalog();
  }
  start(c: OperationContext, assessment: string) {
    allowed(c, 'candidate:own');
    return this.repository.start(c, id(assessment));
  }
  attempts(c: OperationContext) {
    allowed(c, 'candidate:own');
    return this.repository.attempts(c);
  }
  details(c: OperationContext, attempt: string) {
    allowed(c, 'candidate:own');
    return this.repository.details(c, id(attempt));
  }
  response(c: OperationContext, attempt: string, item: string, body: unknown) {
    allowed(c, 'candidate:own');
    return this.repository.response(
      c,
      id(attempt),
      id(item),
      parse(responseSchema, body),
    );
  }
  submit(c: OperationContext, attempt: string) {
    allowed(c, 'candidate:own');
    return this.repository.submit(c, id(attempt));
  }
  evidence(c: OperationContext) {
    allowed(c, 'candidate:own');
    return this.repository.evidence(c);
  }
  gaps(c: OperationContext, path: string, save = false, role?: string) {
    allowed(c, 'candidate:own');
    return this.repository.gaps(c, id(path), save, role ? id(role) : undefined);
  }
  plans(c: OperationContext) {
    allowed(c, 'candidate:own');
    return this.repository.plans(c);
  }
  complete(c: OperationContext, item: string) {
    allowed(c, 'candidate:own');
    return this.repository.completeActivity(c, id(item));
  }
  queue(c: OperationContext) {
    allowed(c, 'assessment:review');
    return this.repository.queue(c);
  }
  adminQueue(c: OperationContext) {
    allowed(c, 'assessment:assign');
    return this.repository.queue(c, true);
  }
  reviewDetails(c: OperationContext, attempt: string) {
    allowed(c, 'assessment:review');
    return this.repository.details(c, id(attempt), true);
  }
  assign(c: OperationContext, attempt: string, body: unknown) {
    allowed(c, 'assessment:assign');
    const v = parse(z.object({ assessorId: z.uuid() }).strict(), body);
    return this.repository.assign(c, id(attempt), v.assessorId);
  }
  review(c: OperationContext, attempt: string, body: unknown) {
    allowed(c, 'assessment:review');
    return this.repository.review(c, id(attempt), parse(reviewSchema, body));
  }
  evidenceReview(c: OperationContext, evidence: string, body: unknown) {
    allowed(c, 'assessment:review');
    return this.repository.evidenceReview(
      c,
      id(evidence),
      parse(evidenceReviewSchema, body),
    );
  }
  moderate(c: OperationContext, review: string, body: unknown) {
    allowed(c, 'assessment:moderate');
    return this.repository.moderate(
      c,
      id(review),
      parse(moderationSchema, body),
    );
  }
  appeal(c: OperationContext, attempt: string, body: unknown) {
    allowed(c, 'candidate:own');
    const v = parse(
      z.object({ reason: z.string().min(10).max(3000) }).strict(),
      body,
    );
    return this.repository.appeal(c, id(attempt), v.reason);
  }
  appeals(c: OperationContext) {
    allowed(c, 'candidate:own');
    return this.repository.appeals(c);
  }
  adminAppeals(c: OperationContext) {
    allowed(c, 'assessment:moderate');
    return this.repository.appeals(c, true);
  }
  resolve(c: OperationContext, appeal: string, body: unknown) {
    allowed(c, 'assessment:moderate');
    const v = parse(
      z.object({ resolution: z.string().min(10).max(3000) }).strict(),
      body,
    );
    return this.repository.resolveAppeal(c, id(appeal), v.resolution);
  }
}
