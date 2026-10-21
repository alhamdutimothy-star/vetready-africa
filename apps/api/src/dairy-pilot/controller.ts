import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import {
  pilotResponseSchema,
  pilotReviewDraftSchema,
  pilotFinalizeSchema,
} from '@vetready/contracts';
import { hasPermission, type Permission } from '@vetready/domain';
import { principal, RequirePermission, type AuthRequest } from '../auth';
import { AssessmentRepository } from '../assessment/repository';
import { DairyPilotRepository } from './repository';
const context = (r: AuthRequest) => ({
  ...principal(r),
  requestId: r.requestId,
});
const parse = <T>(s: z.ZodType<T>, v: unknown): T => {
  const r = s.safeParse(v);
  if (!r.success)
    throw new UnprocessableEntityException('Invalid dairy pilot input');
  return r.data;
};
const schema = (s: z.ZodType): SchemaObject => {
  const { $schema, ...result } = z.toJSONSchema(s);
  void $schema;
  return result as SchemaObject;
};
const permit = (r: AuthRequest, ...p: Permission[]) => {
  if (!p.some((p) => hasPermission(context(r).grants, p)))
    throw new ForbiddenException('Dairy staff capability required');
};
@ApiTags('functional dairy pilot')
@ApiBearerAuth('access-token')
@Controller()
export class DairyPilotController {
  constructor(
    @Inject(DairyPilotRepository)
    private readonly repository: DairyPilotRepository,
    @Inject(AssessmentRepository)
    private readonly assessments: AssessmentRepository,
  ) {}
  @RequirePermission('assessment:author') @Post('admin/dairy-pilot') setup(
    @Req() r: AuthRequest,
  ) {
    return this.repository.setup(context(r));
  }
  @RequirePermission('assessment:author')
  @Get('admin/dairy-pilot')
  configuration() {
    return this.repository.configuration();
  }
  @RequirePermission('candidate:own')
  @Get('candidates/me/dairy-pilot')
  dashboard(@Req() r: AuthRequest) {
    return this.repository.dashboard(context(r));
  }
  @RequirePermission('candidate:own') @Post('dairy-pilot/attempts') start(
    @Req() r: AuthRequest,
  ) {
    return this.repository.start(context(r));
  }
  @RequirePermission('candidate:own')
  @Get('candidates/me/dairy-pilot/attempts/:id')
  detail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.repository.detail(context(r), parse(z.uuid(), id));
  }
  @RequirePermission('candidate:own')
  @ApiBody({ schema: schema(pilotResponseSchema) })
  @Put('candidates/me/dairy-pilot/attempts/:id/responses/:item')
  response(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Param('item') item: string,
    @Body() b: unknown,
  ) {
    return this.repository.response(
      context(r),
      parse(z.uuid(), id),
      parse(z.uuid(), item),
      parse(pilotResponseSchema, b),
    );
  }
  @RequirePermission('candidate:own')
  @Post('candidates/me/dairy-pilot/attempts/:id/submit')
  async submit(@Req() r: AuthRequest, @Param('id') raw: string) {
    const id = parse(z.uuid(), raw);
    await this.repository.detail(context(r), id);
    return this.assessments.submit(context(r), id);
  }
  @RequirePermission('catalog:read') @Get('staff/dairy-pilot') queue(
    @Req() r: AuthRequest,
  ) {
    permit(r, 'assessment:assign', 'assessment:review');
    return this.repository.queue(context(r));
  }
  @RequirePermission('catalog:read')
  @Get('staff/dairy-pilot/attempts/:id')
  staffDetail(@Req() r: AuthRequest, @Param('id') id: string) {
    permit(r, 'assessment:assign', 'assessment:review');
    return this.repository.detail(context(r), parse(z.uuid(), id), true);
  }
  @RequirePermission('assessment:review')
  @ApiBody({ schema: schema(pilotReviewDraftSchema) })
  @Put('assessor/dairy-pilot/attempts/:id/review-draft')
  draft(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.repository.saveReview(
      context(r),
      parse(z.uuid(), id),
      parse(pilotReviewDraftSchema, b),
    );
  }
  @RequirePermission('assessment:review')
  @ApiBody({ schema: schema(pilotFinalizeSchema) })
  @Post('assessor/dairy-pilot/attempts/:id/finalize')
  finalize(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.repository.finalize(
      context(r),
      parse(z.uuid(), id),
      parse(pilotFinalizeSchema, b).expectedRevision,
    );
  }
}
