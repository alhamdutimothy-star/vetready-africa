import {
  Body,
  Controller,
  Get,
  Put,
  Post,
  Param,
  Req,
  Inject,
} from '@nestjs/common';
import { z } from 'zod';
import { ApiBody, ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  candidateProfileSchema,
  employerSchema,
  evidenceSchema,
  roleAssignmentSchema,
} from '@vetready/contracts';
import { Public, RequirePermission, principal, type AuthRequest } from './auth';
import { FoundationService, type OperationContext } from './service';
function bodySchema(schema: z.ZodType): SchemaObject {
  const { $schema, ...result } = z.toJSONSchema(schema);
  void $schema;
  return result as SchemaObject;
}
function context(request: AuthRequest): OperationContext {
  return { ...principal(request), requestId: request.requestId };
}
@ApiTags('foundation')
@ApiBearerAuth('access-token')
@Controller()
export class FoundationController {
  constructor(
    @Inject(FoundationService) private readonly service: FoundationService,
  ) {}
  @Public() @ApiOperation({ security: [] }) @Get('health') health() {
    return this.service.health();
  }
  @Public() @ApiOperation({ security: [] }) @Get('ready') ready() {
    return this.service.ready();
  }
  @Get('me') me(@Req() request: AuthRequest) {
    return this.service.me(context(request));
  }
  @RequirePermission('catalog:read') @Get('pathways') pathways(
    @Req() request: AuthRequest,
  ) {
    return this.service.pathways(context(request));
  }
  @RequirePermission('catalog:read') @Get('competencies') competencies(
    @Req() request: AuthRequest,
  ) {
    return this.service.competencies(context(request));
  }
  @RequirePermission('catalog:read')
  @Get('pathways/:id/competencies')
  pathwayCompetencies(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.service.pathwayCompetencies(context(request), id);
  }
  @RequirePermission('candidate:own') @Get('candidates/me') candidate(
    @Req() request: AuthRequest,
  ) {
    return this.service.candidate(context(request));
  }
  @RequirePermission('candidate:own')
  @ApiBody({ schema: bodySchema(candidateProfileSchema) })
  @Put('candidates/me')
  saveCandidate(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.service.saveCandidate(context(request), body);
  }
  @RequirePermission('candidate:own')
  @Post('candidates/me/pathways/:id')
  enroll(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.service.enroll(context(request), id);
  }
  @ApiBody({ schema: bodySchema(employerSchema) })
  @Post('organizations')
  createOrganization(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.service.createOrganization(context(request), body);
  }
  @Get('organizations/:id') organization(
    @Req() request: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.organization(context(request), id);
  }
  @RequirePermission('evidence:own')
  @ApiBody({ schema: bodySchema(evidenceSchema) })
  @Post('evidence')
  createEvidence(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.service.createEvidence(context(request), body);
  }
  @RequirePermission('evidence:own') @Get('evidence') evidence(
    @Req() request: AuthRequest,
  ) {
    return this.service.evidence(context(request));
  }
  @RequirePermission('evidence:own') @Get('evidence/:id') evidenceById(
    @Req() request: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.evidenceById(context(request), id);
  }
  @RequirePermission('admin:summary') @Get('admin/summary') summary(
    @Req() request: AuthRequest,
  ) {
    return this.service.summary(context(request));
  }
  @RequirePermission('roles:grant')
  @ApiBody({ schema: bodySchema(roleAssignmentSchema) })
  @Post('admin/role-assignments')
  assign(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.service.assign(context(request), body);
  }
}
