import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import { caseBlueprintSchema } from '@vetready/contracts';
import { hasPermission } from '@vetready/domain';
import { principal, RequirePermission, type AuthRequest } from '../auth';
import { CaseRepository } from './repository';
import { transitionFreshCowTemplate } from './transition-fresh-cow.content';
const context = (r: AuthRequest) => ({
  ...principal(r),
  requestId: r.requestId,
});
const identifier = (v: string) => {
  const result = z.uuid().safeParse(v);
  if (!result.success)
    throw new UnprocessableEntityException('Invalid identifier');
  return result.data;
};
const { $schema, ...bodySchema } = z.toJSONSchema(caseBlueprintSchema);
void $schema;
@ApiTags('governed case blueprints')
@ApiBearerAuth('access-token')
@Controller()
export class CaseController {
  constructor(
    @Inject(CaseRepository) private readonly repository: CaseRepository,
  ) {}
  @RequirePermission('assessment:author')
  @Get('admin/case-blueprint-templates/transition-fresh-cow')
  template() {
    return transitionFreshCowTemplate;
  }
  @RequirePermission('assessment:author')
  @ApiBody({ schema: bodySchema as SchemaObject })
  @Post('admin/case-blueprints')
  create(@Req() r: AuthRequest, @Body() body: unknown) {
    const ctx = context(r);
    if (!hasPermission(ctx.grants, 'assessment:author'))
      throw new ForbiddenException();
    const parsed = caseBlueprintSchema.safeParse(body);
    if (!parsed.success)
      throw new UnprocessableEntityException({
        code: 'INVALID_CASE_BLUEPRINT',
        fields: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    return this.repository.create(ctx, parsed.data);
  }
  @RequirePermission('catalog:read')
  @Get('case-blueprints/:id')
  detail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.repository.detail(
      identifier(id),
      hasPermission(context(r).grants, 'assessment:author'),
    );
  }
  @RequirePermission('candidate:own')
  @Get('candidates/me/evidence-manifest')
  manifest(@Req() r: AuthRequest) {
    return this.repository.manifest(context(r));
  }
}
