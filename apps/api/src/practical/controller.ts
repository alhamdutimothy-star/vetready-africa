import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import {
  practicalCreateSchema,
  practicalSaveSchema,
  practicalSubmitSchema,
  practicalReasonSchema,
  practicalAssignSchema,
  practicalDecisionSchema,
} from '@vetready/contracts';
import { principal, RequirePermission, type AuthRequest } from '../auth';
import { PracticalRepository } from './repository';
const ctx = (r: AuthRequest) => ({ ...principal(r), requestId: r.requestId });
const parse = <T>(s: z.ZodType<T>, v: unknown): T => {
  const p = s.safeParse(v);
  if (!p.success)
    throw new UnprocessableEntityException('Invalid practical evidence input');
  return p.data;
};
const schema = (s: z.ZodType): SchemaObject => {
  const { $schema, ...v } = z.toJSONSchema(s);
  void $schema;
  return v as SchemaObject;
};
@ApiTags('private practical evidence — DRAFT demonstration')
@ApiBearerAuth('access-token')
@Controller()
export class PracticalController {
  constructor(
    @Inject(PracticalRepository) private readonly repo: PracticalRepository,
  ) {}
  @Get('candidates/me/practical/options')
  @RequirePermission('candidate:own')
  options(@Req() r: AuthRequest) {
    return this.repo.options(ctx(r));
  }
  @Get('candidates/me/practical/gaps/:pathway')
  @RequirePermission('candidate:own')
  gaps(@Req() r: AuthRequest, @Param('pathway') p: string) {
    return this.repo.gaps(ctx(r), parse(z.uuid(), p));
  }
  @Get('candidates/me/practical') @RequirePermission('candidate:own') list(
    @Req() r: AuthRequest,
  ) {
    return this.repo.list(ctx(r));
  }
  @Post('candidates/me/practical')
  @RequirePermission('candidate:own')
  @ApiBody({ schema: schema(practicalCreateSchema) })
  create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.repo.create(ctx(r), parse(practicalCreateSchema, b));
  }
  @Get('candidates/me/practical/:id')
  @RequirePermission('candidate:own')
  detail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.repo.detail(ctx(r), parse(z.uuid(), id));
  }
  @Put('candidates/me/practical/:id')
  @RequirePermission('candidate:own')
  @ApiBody({ schema: schema(practicalSaveSchema) })
  save(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.repo.save(
      ctx(r),
      parse(z.uuid(), id),
      parse(practicalSaveSchema, b),
    );
  }
  @Post('candidates/me/practical/:id/submit')
  @RequirePermission('candidate:own')
  @ApiBody({ schema: schema(practicalSubmitSchema) })
  submit(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    const input = parse(practicalSubmitSchema, b);
    return this.repo.submit(
      ctx(r),
      parse(z.uuid(), id),
      input.expectedRevision,
    );
  }
  @Post('candidates/me/practical/:id/withdraw')
  @RequirePermission('candidate:own')
  @ApiBody({ schema: schema(practicalReasonSchema) })
  withdraw(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.repo.withdraw(
      ctx(r),
      parse(z.uuid(), id),
      parse(practicalReasonSchema, b).reason,
    );
  }
  @Post('candidates/me/practical/:id/revisions')
  @RequirePermission('candidate:own')
  @ApiBody({ schema: schema(practicalReasonSchema) })
  revise(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.repo.revise(
      ctx(r),
      parse(z.uuid(), id),
      parse(practicalReasonSchema, b).reason,
    );
  }
  @Get('assessor/practical') @RequirePermission('assessment:review') reviews(
    @Req() r: AuthRequest,
  ) {
    return this.repo.list(ctx(r), true);
  }
  @Get('assessor/practical/:id') @RequirePermission('assessment:review') review(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.repo.detail(ctx(r), parse(z.uuid(), id), 'review');
  }
  @Post('assessor/practical/:id/decisions')
  @RequirePermission('assessment:review')
  @ApiBody({ schema: schema(practicalDecisionSchema) })
  decide(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.repo.decide(
      ctx(r),
      parse(z.uuid(), id),
      parse(practicalDecisionSchema, b),
    );
  }
  @Get('admin/practical') @RequirePermission('assessment:assign') adminList(
    @Req() r: AuthRequest,
  ) {
    return this.repo.adminList(ctx(r));
  }
  @Get('admin/practical/:id')
  @RequirePermission('assessment:assign')
  adminDetail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.repo.detail(ctx(r), parse(z.uuid(), id), 'admin');
  }
  @Post('admin/practical/:id/assignments')
  @RequirePermission('assessment:assign')
  @ApiBody({ schema: schema(practicalAssignSchema) })
  assign(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    const input = parse(practicalAssignSchema, b);
    return this.repo.assign(
      ctx(r),
      parse(z.uuid(), id),
      input.assessorId,
      input.reason,
    );
  }
  @Post('admin/practical/:id/revoke')
  @RequirePermission('assessment:assign')
  @ApiBody({ schema: schema(practicalReasonSchema) })
  revoke(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.repo.revoke(
      ctx(r),
      parse(z.uuid(), id),
      parse(practicalReasonSchema, b).reason,
    );
  }
}
