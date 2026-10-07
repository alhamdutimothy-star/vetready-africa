import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  Req,
  Inject,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiBody, ApiOperation } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import {
  assessmentCreateSchema,
  itemCreateSchema,
  responseSchema,
  reviewSchema,
  evidenceReviewSchema,
  moderationSchema,
} from '@vetready/contracts';
import { principal, type AuthRequest, RequirePermission } from '../auth';
import { AssessmentService } from './service';
const ctx = (r: AuthRequest) => ({ ...principal(r), requestId: r.requestId });
const schema = (s: z.ZodType): SchemaObject => {
  const { $schema, ...rest } = z.toJSONSchema(s);
  void $schema;
  return rest as SchemaObject;
};
@ApiTags('assessment and development')
@ApiBearerAuth('access-token')
@Controller()
export class AssessmentController {
  constructor(
    @Inject(AssessmentService) private readonly service: AssessmentService,
  ) {}
  @RequirePermission('catalog:read') @Get('assessments') catalog(
    @Req() r: AuthRequest,
  ) {
    return this.service.catalog(ctx(r));
  }
  @RequirePermission('catalog:read') @Get('pathways/:id/hierarchy') hierarchy(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.hierarchy(ctx(r), id);
  }
  @RequirePermission('assessment:author')
  @Get('admin/assessments')
  authorCatalog(@Req() r: AuthRequest) {
    return this.service.authorCatalog(ctx(r));
  }
  @RequirePermission('assessment:author')
  @ApiBody({ schema: schema(assessmentCreateSchema) })
  @Post('admin/assessments')
  create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.create(ctx(r), b);
  }
  @RequirePermission('assessment:author')
  @ApiBody({ schema: schema(itemCreateSchema) })
  @Post('admin/assessments/:id/items')
  item(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.item(ctx(r), id, b);
  }
  @RequirePermission('assessment:author')
  @ApiOperation({
    summary:
      'Release demo only; production approval is intentionally unavailable',
  })
  @Post('admin/assessments/:id/release-demo')
  publish(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.publish(ctx(r), id);
  }
  @RequirePermission('assessment:author')
  @Post('admin/assessments/:id/retire')
  retire(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.retire(ctx(r), id);
  }
  @RequirePermission('assessment:author')
  @ApiBody({
    schema: schema(z.object({ reason: z.string().min(10).max(3000) }).strict()),
  })
  @Post('admin/assessment-items/:id/retire')
  retireItem(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.retireItem(ctx(r), id, b);
  }
  @RequirePermission('candidate:own') @Post('assessments/:id/attempts') start(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.start(ctx(r), id);
  }
  @RequirePermission('candidate:own') @Get('candidates/me/attempts') attempts(
    @Req() r: AuthRequest,
  ) {
    return this.service.attempts(ctx(r));
  }
  @RequirePermission('candidate:own')
  @Get('candidates/me/attempts/:id')
  details(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.details(ctx(r), id);
  }
  @RequirePermission('candidate:own')
  @ApiBody({ schema: schema(responseSchema) })
  @Put('candidates/me/attempts/:id/responses/:item')
  response(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Param('item') item: string,
    @Body() b: unknown,
  ) {
    return this.service.response(ctx(r), id, item, b);
  }
  @RequirePermission('candidate:own')
  @Post('candidates/me/attempts/:id/submit')
  submit(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.submit(ctx(r), id);
  }
  @RequirePermission('candidate:own')
  @Get('candidates/me/competency-evidence')
  evidence(@Req() r: AuthRequest) {
    return this.service.evidence(ctx(r));
  }
  @RequirePermission('candidate:own')
  @Get('candidates/me/pathways/:id/gaps')
  gaps(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Query('roleId') roleId?: string,
  ) {
    return this.service.gaps(ctx(r), id, false, roleId);
  }
  @RequirePermission('candidate:own')
  @Post('candidates/me/pathways/:id/development-plans')
  plan(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Query('roleId') roleId?: string,
  ) {
    return this.service.gaps(ctx(r), id, true, roleId);
  }
  @RequirePermission('candidate:own')
  @Get('candidates/me/development-plans')
  plans(@Req() r: AuthRequest) {
    return this.service.plans(ctx(r));
  }
  @RequirePermission('candidate:own')
  @Post('candidates/me/development-plan-items/:id/complete')
  complete(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.complete(ctx(r), id);
  }
  @RequirePermission('assessment:assign')
  @Get('admin/assessment-attempts')
  adminQueue(@Req() r: AuthRequest) {
    return this.service.adminQueue(ctx(r));
  }
  @RequirePermission('assessment:assign')
  @ApiBody({ schema: schema(z.object({ assessorId: z.uuid() }).strict()) })
  @Post('admin/assessment-attempts/:id/assign')
  assign(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.assign(ctx(r), id, b);
  }
  @RequirePermission('assessment:review') @Get('assessor/attempts') queue(
    @Req() r: AuthRequest,
  ) {
    return this.service.queue(ctx(r));
  }
  @RequirePermission('assessment:review')
  @Get('assessor/attempts/:id')
  reviewDetails(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.reviewDetails(ctx(r), id);
  }
  @RequirePermission('assessment:review')
  @ApiBody({ schema: schema(reviewSchema) })
  @Post('assessor/attempts/:id/reviews')
  review(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.review(ctx(r), id, b);
  }
  @RequirePermission('assessment:review')
  @ApiBody({ schema: schema(evidenceReviewSchema) })
  @Post('assessor/evidence/:id/reviews')
  evidenceReview(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.evidenceReview(ctx(r), id, b);
  }
  @RequirePermission('assessment:moderate')
  @ApiBody({ schema: schema(moderationSchema) })
  @Post('admin/assessment-reviews/:id/moderations')
  moderate(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.moderate(ctx(r), id, b);
  }
  @RequirePermission('candidate:own')
  @ApiBody({
    schema: schema(z.object({ reason: z.string().min(10).max(3000) }).strict()),
  })
  @Post('candidates/me/attempts/:id/appeals')
  appeal(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.appeal(ctx(r), id, b);
  }
  @RequirePermission('candidate:own')
  @Get('candidates/me/assessment-appeals')
  appeals(@Req() r: AuthRequest) {
    return this.service.appeals(ctx(r));
  }
  @RequirePermission('assessment:moderate')
  @Get('admin/assessment-appeals')
  adminAppeals(@Req() r: AuthRequest) {
    return this.service.adminAppeals(ctx(r));
  }
  @RequirePermission('assessment:moderate')
  @ApiBody({
    schema: schema(
      z.object({ resolution: z.string().min(10).max(3000) }).strict(),
    ),
  })
  @Post('admin/assessment-appeals/:id/resolve')
  resolve(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.resolve(ctx(r), id, b);
  }
}
