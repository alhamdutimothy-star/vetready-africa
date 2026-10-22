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
  dairyCurriculumSchema,
  dairyActivitySchema,
} from '@vetready/contracts';
import { principal, RequirePermission, type AuthRequest } from '../auth';
import { DairyLearningRepository } from './repository';
import { dairyStarter } from './starter';
import { Database } from '../database';
const ctx = (r: AuthRequest) => ({ ...principal(r), requestId: r.requestId });
const parse = <T>(s: z.ZodType<T>, v: unknown): T => {
  const p = s.safeParse(v);
  if (!p.success)
    throw new UnprocessableEntityException('Invalid dairy learning input');
  return p.data;
};
const schema = (s: z.ZodType): SchemaObject => {
  const { $schema, ...v } = z.toJSONSchema(s);
  void $schema;
  return v as SchemaObject;
};
@ApiTags('governed dairy learning — no competence awards')
@ApiBearerAuth('access-token')
@Controller()
export class DairyLearningController {
  constructor(
    @Inject(DairyLearningRepository)
    private readonly repo: DairyLearningRepository,
    @Inject(Database) private readonly db: Database,
  ) {}
  @Get('dairy-learning') @RequirePermission('catalog:read') catalog() {
    return this.repo.catalog();
  }
  @Get('admin/dairy-learning') @RequirePermission('training:manage') admin() {
    return this.repo.catalog(true);
  }
  @Post('admin/dairy-learning')
  @RequirePermission('training:manage')
  @ApiBody({ schema: schema(dairyCurriculumSchema) })
  create(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.repo.create(ctx(r), parse(dairyCurriculumSchema, b));
  }
  @Post('admin/dairy-learning/starter')
  @RequirePermission('training:manage')
  async starter(@Req() r: AuthRequest) {
    return this.repo.create(ctx(r), await dairyStarter(this.db));
  }
  @Get('candidates/me/dairy-learning')
  @RequirePermission('candidate:own')
  enrollments(@Req() r: AuthRequest) {
    return this.repo.enrollments(ctx(r));
  }
  @Get('dairy-learning/:id') @RequirePermission('catalog:read') detail(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.repo.detail(ctx(r), parse(z.uuid(), id));
  }
  @Get('admin/dairy-learning/:id')
  @RequirePermission('training:manage')
  adminDetail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.repo.detail(ctx(r), parse(z.uuid(), id), true);
  }
  @Get('candidates/me/dairy-learning/:enrollment')
  @RequirePermission('candidate:own')
  async enrollment(@Req() r: AuthRequest, @Param('enrollment') e: string) {
    const enrollment = parse(z.uuid(), e);
    const row = (
      await this.db.pool.query(
        'SELECT course_version_id FROM training_enrollments WHERE id=$1',
        [enrollment],
      )
    ).rows[0];
    if (!row) throw new UnprocessableEntityException('Enrollment unavailable');
    return this.repo.detail(ctx(r), row.course_version_id, false, enrollment);
  }
  @Put('candidates/me/dairy-learning/:enrollment/units/:lesson/activity')
  @RequirePermission('candidate:own')
  @ApiBody({ schema: schema(dairyActivitySchema) })
  activity(
    @Req() r: AuthRequest,
    @Param('enrollment') e: string,
    @Param('lesson') l: string,
    @Body() b: unknown,
  ) {
    return this.repo.activity(
      ctx(r),
      parse(z.uuid(), e),
      parse(z.uuid(), l),
      parse(dairyActivitySchema, b),
    );
  }
}
