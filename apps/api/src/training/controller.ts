import {
  Controller,
  Inject,
  Get,
  Post,
  Put,
  Param,
  Body,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiBody, ApiOperation } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import {
  trainingCreateSchema,
  trainingVersionSchema,
  learningProgressSchema,
  trainingAssignmentSchema,
} from '@vetready/contracts';
import { principal, RequirePermission, type AuthRequest } from '../auth';
import { TrainingService } from './service';
const ctx = (request: AuthRequest) => ({
  ...principal(request),
  requestId: request.requestId,
});
const schema = (value: z.ZodType): SchemaObject => {
  const { $schema, ...rest } = z.toJSONSchema(value);
  void $schema;
  return rest as SchemaObject;
};
@ApiTags('governed demo training — completion is not competence')
@ApiBearerAuth('access-token')
@Controller()
export class TrainingController {
  constructor(
    @Inject(TrainingService) private readonly service: TrainingService,
  ) {}
  @Get('training/courses') @RequirePermission('catalog:read') catalog(
    @Req() r: AuthRequest,
  ) {
    return this.service.catalog(ctx(r));
  }
  @Get('training/versions/:id') @RequirePermission('catalog:read') detail(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.detail(ctx(r), id);
  }
  @Get('admin/training/courses')
  @RequirePermission('training:manage')
  adminCatalog(@Req() r: AuthRequest) {
    return this.service.catalog(ctx(r), true);
  }
  @Get('admin/training/versions/:id')
  @RequirePermission('training:manage')
  adminDetail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.detail(ctx(r), id, true);
  }
  @Post('admin/training/courses')
  @RequirePermission('training:manage')
  @ApiBody({ schema: schema(trainingCreateSchema) })
  create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.create(ctx(r), b);
  }
  @Post('admin/training/courses/:id/versions')
  @RequirePermission('training:manage')
  @ApiBody({ schema: schema(trainingVersionSchema) })
  version(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) {
    return this.service.version(ctx(r), id, b);
  }
  @Post('admin/training/versions/:id/release-demo')
  @RequirePermission('training:manage')
  @ApiOperation({
    summary:
      'Freeze and release demonstration content; retains DRAFT and never approves production content',
  })
  release(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.lifecycle(ctx(r), id, 'release-demo');
  }
  @Post('admin/training/versions/:id/retire')
  @RequirePermission('training:manage')
  retire(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.lifecycle(ctx(r), id, 'retire');
  }
  @Post('admin/training/assignments')
  @RequirePermission('training:assign')
  @ApiBody({ schema: schema(trainingAssignmentSchema) })
  assign(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.assign(ctx(r), b);
  }
  @Post('training/versions/:id/enrollments')
  @RequirePermission('candidate:own')
  enroll(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.enroll(ctx(r), id);
  }
  @Get('candidates/me/training/enrollments')
  @RequirePermission('candidate:own')
  enrollments(@Req() r: AuthRequest) {
    return this.service.enrollments(ctx(r));
  }
  @Get('candidates/me/training/enrollments/:id')
  @RequirePermission('candidate:own')
  enrollment(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.enrollment(ctx(r), id);
  }
  @Put('candidates/me/training/enrollments/:id/lessons/:lesson/progress')
  @RequirePermission('candidate:own')
  @ApiBody({ schema: schema(learningProgressSchema) })
  progress(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Param('lesson') lesson: string,
    @Body() b: unknown,
  ) {
    return this.service.progress(ctx(r), id, lesson, b);
  }
}
