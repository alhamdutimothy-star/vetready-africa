import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import { profileSnapshotCommandSchema } from '@vetready/contracts';
import { principal, RequirePermission, type AuthRequest } from '../auth';
import { CompetencyProfileRepository } from './repository';
const ctx = (r: AuthRequest) => ({ ...principal(r), requestId: r.requestId });
const id = (value: unknown) => {
  const result = z.uuid().safeParse(value);
  if (!result.success)
    throw new UnprocessableEntityException('Invalid profile identifier');
  return result.data;
};
const { $schema, ...commandSchema } = z.toJSONSchema(
  profileSnapshotCommandSchema,
);
void $schema;
@Controller('candidates/me')
@ApiBearerAuth('access-token')
@ApiTags('private derived competency profile — no readiness awards')
export class CompetencyProfileController {
  constructor(
    @Inject(CompetencyProfileRepository)
    private readonly repository: CompetencyProfileRepository,
  ) {}
  @Get('competency-profile') @RequirePermission('candidate:own') current(
    @Req() r: AuthRequest,
  ) {
    return this.repository.current(ctx(r));
  }
  @Get('skills-passport') @RequirePermission('candidate:own') passport(
    @Req() r: AuthRequest,
  ) {
    return this.repository.passport(ctx(r));
  }
  @Get('competency-profile/competencies/:id')
  @RequirePermission('candidate:own')
  competency(@Req() r: AuthRequest, @Param('id') value: string) {
    return this.repository.competency(ctx(r), id(value));
  }
  @Get('competency-profile/pathways/:id/gaps')
  @RequirePermission('candidate:own')
  gaps(@Req() r: AuthRequest, @Param('id') value: string) {
    return this.repository.gaps(ctx(r), id(value));
  }
  @Post('competency-profile/snapshots')
  @RequirePermission('candidate:own')
  @ApiBody({ schema: commandSchema as SchemaObject })
  snapshot(@Req() r: AuthRequest, @Body() body: unknown) {
    const result = profileSnapshotCommandSchema.safeParse(body);
    if (!result.success)
      throw new UnprocessableEntityException('Invalid snapshot command');
    return this.repository.snapshot(ctx(r), result.data.commandId);
  }
  @Get('competency-profile/snapshots/:id')
  @RequirePermission('candidate:own')
  saved(@Req() r: AuthRequest, @Param('id') value: string) {
    return this.repository.saved(ctx(r), id(value));
  }
}
