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
import { developmentCommandSchema } from '@vetready/contracts';
import { principal, RequirePermission, type AuthRequest } from '../auth';
import { DevelopmentRepository } from './repository';
const ctx = (r: AuthRequest) => ({ ...principal(r), requestId: r.requestId });
const { $schema, ...commandSchema } = z.toJSONSchema(developmentCommandSchema);
void $schema;
const id = (v: string) => {
  const r = z.uuid().safeParse(v);
  if (!r.success) throw new UnprocessableEntityException('Invalid identifier');
  return r.data;
};
@ApiTags('private development workflow')
@ApiBearerAuth('access-token')
@RequirePermission('candidate:own')
@Controller('candidates/me/development-workflows')
export class DevelopmentController {
  constructor(
    @Inject(DevelopmentRepository)
    private readonly repository: DevelopmentRepository,
  ) {}
  @Get() list(@Req() r: AuthRequest) {
    return this.repository.list(ctx(r));
  }
  @ApiBody({ schema: commandSchema as SchemaObject })
  @Post()
  create(@Req() r: AuthRequest, @Body() body: unknown) {
    const b = developmentCommandSchema.safeParse(body);
    if (!b.success)
      throw new UnprocessableEntityException(
        'Explicit pathway version and command required',
      );
    return this.repository.create(
      ctx(r),
      b.data.pathwayVersionId,
      b.data.commandId,
    );
  }
  @Get(':id') detail(@Req() r: AuthRequest, @Param('id') p: string) {
    return this.repository.detail(ctx(r), id(p));
  }
  @Post(':id/courses/:course/start') start(
    @Req() r: AuthRequest,
    @Param('id') p: string,
    @Param('course') course: string,
  ) {
    return this.repository.start(ctx(r), id(p), id(course));
  }
}
