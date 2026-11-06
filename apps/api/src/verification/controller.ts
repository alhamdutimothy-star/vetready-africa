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
  verificationSubmissionSchema,
  verificationAssignmentSchema,
  verificationEventSchema,
} from '@vetready/contracts';
import { principal, RequirePermission, type AuthRequest } from '../auth';
import { VerificationRepository } from './repository';
const ctx = (r: AuthRequest) => ({ ...principal(r), requestId: r.requestId });
const parse = <T>(s: z.ZodType<T>, v: unknown): T => {
  const p = s.safeParse(v);
  if (!p.success)
    throw new UnprocessableEntityException('Invalid verification input');
  return p.data;
};
const body = (s: z.ZodType) => {
  const { $schema, ...schema } = z.toJSONSchema(s);
  void $schema;
  return ApiBody({ schema: schema as SchemaObject });
};
@Controller()
@ApiBearerAuth('access-token')
@ApiTags('governance-gated competency verification')
export class VerificationController {
  constructor(
    @Inject(VerificationRepository)
    private readonly repo: VerificationRepository,
  ) {}
  @Get('candidates/me/verifications/options')
  @RequirePermission('candidate:own')
  options(@Req() r: AuthRequest) {
    return this.repo.options(ctx(r));
  }
  @Get('candidates/me/verifications') @RequirePermission('candidate:own') list(
    @Req() r: AuthRequest,
  ) {
    return this.repo.list(ctx(r));
  }
  @Post('candidates/me/verifications')
  @RequirePermission('candidate:own')
  @body(verificationSubmissionSchema)
  submit(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.repo.submit(ctx(r), parse(verificationSubmissionSchema, b));
  }
  @Get('candidates/me/verifications/:id')
  @RequirePermission('candidate:own')
  detail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.repo.detail(ctx(r), parse(z.uuid(), id), 'owner');
  }
  @Post('candidates/me/verifications/:id/events')
  @RequirePermission('candidate:own')
  @body(verificationEventSchema)
  ownerEvent(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const p = parse(verificationEventSchema, b);
    if (!['APPEAL', 'WITHDRAW'].includes(p.kind))
      throw new UnprocessableEntityException('Owner event required');
    return this.repo.event(ctx(r), parse(z.uuid(), id), p);
  }
  @Get('assessor/verifications') @RequirePermission('assessment:review') queue(
    @Req() r: AuthRequest,
  ) {
    return this.repo.list(ctx(r), 'assessor');
  }
  @Get('assessor/verifications/:id')
  @RequirePermission('assessment:review')
  review(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.repo.detail(ctx(r), parse(z.uuid(), id), 'assessor');
  }
  @Post('assessor/verifications/:id/events')
  @RequirePermission('assessment:review')
  @body(verificationEventSchema)
  event(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    const p = parse(verificationEventSchema, b);
    if (['APPEAL', 'WITHDRAW'].includes(p.kind))
      throw new UnprocessableEntityException('Assessor event required');
    return this.repo.event(ctx(r), parse(z.uuid(), id), p);
  }
  @Get('admin/verifications')
  @RequirePermission('assessment:assign')
  administration(@Req() r: AuthRequest) {
    return this.repo.list(ctx(r), 'admin');
  }
  @Get('admin/verifications/:id')
  @RequirePermission('assessment:assign')
  administrationDetail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.repo.detail(ctx(r), parse(z.uuid(), id), 'admin');
  }
  @Post('admin/verifications/:id/assignments')
  @RequirePermission('assessment:assign')
  @body(verificationAssignmentSchema)
  assign(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.repo.event(
      ctx(r),
      parse(z.uuid(), id),
      parse(verificationAssignmentSchema, b),
    );
  }
}
