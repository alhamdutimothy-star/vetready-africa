import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  candidateProfileSchema,
  employerSchema,
  evidenceSchema,
  roleAssignmentSchema,
} from '@vetready/contracts';
import {
  hasPermission,
  type Permission,
  type RoleGrant,
} from '@vetready/domain';
import { FoundationRepository } from './repository';
export interface OperationContext {
  userId: string;
  grants: RoleGrant[];
  requestId: string;
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new UnprocessableEntityException({
      code: 'INVALID_INPUT',
      fields: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  return result.data;
}
function requirePermission(context: OperationContext, permission: Permission) {
  if (!hasPermission(context.grants, permission))
    throw new ForbiddenException('Permission required');
}
@Injectable()
export class FoundationService {
  constructor(
    @Inject(FoundationRepository)
    private readonly repository: FoundationRepository,
  ) {}
  health() {
    return { status: 'ok', phase: 'foundation' };
  }
  ready() {
    return this.repository.ready();
  }
  me(context: OperationContext) {
    return { id: context.userId, permissions: context.grants };
  }
  pathways(context: OperationContext) {
    requirePermission(context, 'catalog:read');
    return this.repository.pathways();
  }
  competencies(context: OperationContext) {
    requirePermission(context, 'catalog:read');
    return this.repository.competencies();
  }
  pathwayCompetencies(context: OperationContext, id: string) {
    requirePermission(context, 'catalog:read');
    return this.repository.pathwayCompetencies(parse(z.uuid(), id));
  }
  candidate(context: OperationContext) {
    requirePermission(context, 'candidate:own');
    return this.repository.candidate(context);
  }
  saveCandidate(context: OperationContext, input: unknown) {
    requirePermission(context, 'candidate:own');
    return this.repository.saveCandidate(
      context,
      parse(candidateProfileSchema, input),
    );
  }
  enroll(context: OperationContext, id: string) {
    requirePermission(context, 'candidate:own');
    return this.repository.enroll(context, parse(z.uuid(), id));
  }
  createOrganization(context: OperationContext, input: unknown) {
    return this.repository.createOrganization(
      context,
      parse(employerSchema, input),
    );
  }
  organization(context: OperationContext, id: string) {
    const organizationId = parse(z.uuid(), id);
    if (!hasPermission(context.grants, 'employer:own', organizationId))
      throw new NotFoundException();
    return this.repository.organization(context, organizationId);
  }
  createEvidence(context: OperationContext, input: unknown) {
    requirePermission(context, 'evidence:own');
    return this.repository.createEvidence(
      context,
      parse(evidenceSchema, input),
    );
  }
  evidence(context: OperationContext) {
    requirePermission(context, 'evidence:own');
    return this.repository.evidence(context);
  }
  evidenceById(context: OperationContext, id: string) {
    requirePermission(context, 'evidence:own');
    return this.repository.evidenceById(context, parse(z.uuid(), id));
  }
  summary(context: OperationContext) {
    requirePermission(context, 'admin:summary');
    return this.repository.summary();
  }
  assign(context: OperationContext, input: unknown) {
    requirePermission(context, 'roles:grant');
    return this.repository.assign(context, parse(roleAssignmentSchema, input));
  }
}
