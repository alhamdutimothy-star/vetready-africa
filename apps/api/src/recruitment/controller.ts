import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Inject,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiBody } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import {
  createPilotJobSchema,
  revisePilotJobSchema,
  jobTransitionSchema,
  employerDecisionSchema,
  memberDecisionSchema,
  applyPilotSchema,
  recruitmentCommandSchema,
  shortlistCommandSchema,
} from '@vetready/contracts';
import { principal, type AuthRequest } from '../auth';
import { RecruitmentRepository } from './repository';
const ctx = (r: AuthRequest) => ({ ...principal(r), requestId: r.requestId });
const parse = <T>(schema: z.ZodType<T>, v: unknown): T => {
  const p = schema.safeParse(v);
  if (!p.success)
    throw new UnprocessableEntityException('Invalid technical pilot input');
  return p.data;
};
const id = (v: string) => parse(z.uuid(), v);
const body = (schema: z.ZodType) => {
  const { $schema, ...s } = z.toJSONSchema(schema);
  void $schema;
  return ApiBody({ schema: s as SchemaObject });
};
@Controller('pilot')
@ApiBearerAuth('access-token')
@ApiTags('bounded technical recruitment — no professional awards')
export class RecruitmentController {
  @Get('reference-options') reference(@Req() r: AuthRequest) {
    return this.repo.referenceOptions(ctx(r));
  }
  @Get('admin/governance') governance(@Req() r: AuthRequest) {
    return this.repo.governance(ctx(r));
  }
  constructor(
    @Inject(RecruitmentRepository) private readonly repo: RecruitmentRepository,
  ) {}
  @Post('admin/organizations/:org/verification')
  @body(employerDecisionSchema)
  verify(@Req() r: AuthRequest, @Param('org') org: string, @Body() b: unknown) {
    return this.repo.verifyEmployer(
      ctx(r),
      id(org),
      parse(employerDecisionSchema, b),
    );
  }
  @Post('admin/organizations/:org/members/:user/access')
  @body(memberDecisionSchema)
  member(
    @Req() r: AuthRequest,
    @Param('org') org: string,
    @Param('user') user: string,
    @Body() b: unknown,
  ) {
    return this.repo.memberAccess(
      ctx(r),
      id(org),
      id(user),
      parse(memberDecisionSchema, b),
    );
  }
  @Get('employer/organizations') organizations(@Req() r: AuthRequest) {
    return this.repo.organizations(ctx(r));
  }
  @Get('opportunities') opportunities(@Req() r: AuthRequest) {
    return this.repo.jobs(ctx(r));
  }
  @Get('opportunities/:job') opportunity(
    @Req() r: AuthRequest,
    @Param('job') job: string,
  ) {
    return this.repo.opportunity(ctx(r), id(job));
  }
  @Post('opportunities/:job/applications') @body(applyPilotSchema) apply(
    @Req() r: AuthRequest,
    @Param('job') job: string,
    @Body() b: unknown,
  ) {
    return this.repo.apply(ctx(r), id(job), parse(applyPilotSchema, b));
  }
  @Get('candidates/me/applications') applications(@Req() r: AuthRequest) {
    return this.repo.applications(ctx(r));
  }
  @Post('candidates/me/applications/:app/revoke-access')
  @body(recruitmentCommandSchema)
  revoke(@Req() r: AuthRequest, @Param('app') app: string, @Body() b: unknown) {
    return this.repo.candidateAction(
      ctx(r),
      id(app),
      parse(recruitmentCommandSchema, b),
      false,
    );
  }
  @Post('candidates/me/applications/:app/withdraw')
  @body(recruitmentCommandSchema)
  withdraw(
    @Req() r: AuthRequest,
    @Param('app') app: string,
    @Body() b: unknown,
  ) {
    return this.repo.candidateAction(
      ctx(r),
      id(app),
      parse(recruitmentCommandSchema, b),
      true,
    );
  }
  @Get('organizations/:org/opportunities') jobs(
    @Req() r: AuthRequest,
    @Param('org') org: string,
  ) {
    return this.repo.jobs(ctx(r), id(org));
  }
  @Post('organizations/:org/opportunities') @body(createPilotJobSchema) create(
    @Req() r: AuthRequest,
    @Param('org') org: string,
    @Body() b: unknown,
  ) {
    return this.repo.createJob(ctx(r), id(org), parse(createPilotJobSchema, b));
  }
  @Post('organizations/:org/opportunities/:job/versions')
  @body(revisePilotJobSchema)
  revise(
    @Req() r: AuthRequest,
    @Param('org') org: string,
    @Param('job') job: string,
    @Body() b: unknown,
  ) {
    return this.repo.reviseJob(
      ctx(r),
      id(org),
      id(job),
      parse(revisePilotJobSchema, b),
    );
  }
  @Post('organizations/:org/opportunities/:job/transitions')
  @body(jobTransitionSchema)
  transition(
    @Req() r: AuthRequest,
    @Param('org') org: string,
    @Param('job') job: string,
    @Body() b: unknown,
  ) {
    return this.repo.transitionJob(
      ctx(r),
      id(org),
      id(job),
      parse(jobTransitionSchema, b),
    );
  }
  @Get('organizations/:org/opportunities/:job/applications') list(
    @Req() r: AuthRequest,
    @Param('org') org: string,
    @Param('job') job: string,
  ) {
    return this.repo.employerApplications(ctx(r), id(org), id(job));
  }
  @Post('organizations/:org/applications/:app/evaluations')
  @body(recruitmentCommandSchema)
  evaluate(
    @Req() r: AuthRequest,
    @Param('org') org: string,
    @Param('app') app: string,
    @Body() b: unknown,
  ) {
    return this.repo.evaluate(
      ctx(r),
      id(org),
      id(app),
      parse(recruitmentCommandSchema, b),
    );
  }
  @Get('organizations/:org/applications/:app/evaluations/:evaluation')
  explanation(
    @Req() r: AuthRequest,
    @Param('org') org: string,
    @Param('app') app: string,
    @Param('evaluation') e: string,
  ) {
    return this.repo.explanation(ctx(r), id(org), id(app), id(e));
  }
  @Post('organizations/:org/applications/:app/shortlist')
  @body(shortlistCommandSchema)
  shortlist(
    @Req() r: AuthRequest,
    @Param('org') org: string,
    @Param('app') app: string,
    @Body() b: unknown,
  ) {
    return this.repo.shortlist(
      ctx(r),
      id(org),
      id(app),
      parse(shortlistCommandSchema, b),
    );
  }
}
