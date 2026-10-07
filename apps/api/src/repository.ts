import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CandidateProfileInput,
  EmployerInput,
  EvidenceInput,
  RoleAssignmentInput,
} from '@vetready/contracts';
import { hasPermission, initialEvidenceStatus } from '@vetready/domain';
import { Database, audit } from './database';
import type { OperationContext } from './service';
@Injectable()
export class FoundationRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  health() {
    return { status: 'ok', phase: 'foundation' };
  }
  async ready() {
    const result = await this.db.pool.query(
      "SELECT 1 FROM roles WHERE code='CANDIDATE'",
    );
    if (!result.rowCount)
      throw new ServiceUnavailableException('Database setup incomplete');
    return { database: 'ready' };
  }
  me(context: OperationContext) {
    const p = context;
    return { id: p.userId, permissions: p.grants };
  }
  async pathways() {
    return (
      await this.db.pool.query(
        `SELECT p.id,p.code,p.name,p.description,pv.id AS version_id,pv.version,pv.approval_status,pv.validation_notice FROM pathways p JOIN pathway_versions pv ON pv.pathway_id=p.id ORDER BY p.code,pv.version DESC`,
      )
    ).rows;
  }
  async competencies() {
    return (
      await this.db.pool.query(
        `SELECT c.id,c.code,c.category,cv.id AS version_id,cv.name,cv.description,cv.approval_status,cv.validation_notice,cv.passing_threshold FROM competencies c JOIN competency_versions cv ON cv.competency_id=c.id ORDER BY c.code,cv.version DESC`,
      )
    ).rows;
  }

  async pathwayCompetencies(id: string) {
    return (
      await this.db.pool.query(
        `SELECT c.code,cv.id AS version_id,cv.name,pc.layer,pc.required_level,pc.weight,pc.mandatory,cv.approval_status,cv.validation_notice FROM pathway_competencies pc JOIN pathway_versions pv ON pv.id=pc.pathway_version_id JOIN competency_versions cv ON cv.id=pc.competency_version_id JOIN competencies c ON c.id=cv.competency_id WHERE pv.pathway_id=$1 ORDER BY pc.layer,c.code`,
        [id],
      )
    ).rows;
  }
  async candidate(context: OperationContext) {
    const result = await this.db.pool.query(
      'SELECT id,full_name,country_code,state,willing_to_relocate,driving_ability,professional_summary,discoverable FROM candidate_profiles WHERE user_id=$1',
      [context.userId],
    );
    if (!result.rows[0])
      throw new NotFoundException('Complete candidate onboarding');
    return result.rows[0];
  }

  async saveCandidate(context: OperationContext, data: CandidateProfileInput) {
    const user = context.userId;
    return this.db.transaction(async (client) => {
      const result = await client.query<{ id: string; discoverable: boolean }>(
        `INSERT INTO candidate_profiles(user_id,full_name,country_code,state,willing_to_relocate,driving_ability,professional_summary) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id) DO UPDATE SET full_name=EXCLUDED.full_name,country_code=EXCLUDED.country_code,state=EXCLUDED.state,willing_to_relocate=EXCLUDED.willing_to_relocate,driving_ability=EXCLUDED.driving_ability,professional_summary=EXCLUDED.professional_summary,updated_at=now() RETURNING id,discoverable`,
        [
          user,
          data.fullName,
          data.countryCode,
          data.state,
          data.willingToRelocate,
          data.drivingAbility,
          data.professionalSummary,
        ],
      );
      const id = result.rows[0]!.id;
      await audit(
        client,
        user,
        'candidate.saved',
        'candidate',
        id,
        context.requestId,
      );
      return { id, discoverable: result.rows[0]!.discoverable };
    });
  }

  async enroll(context: OperationContext, id: string) {
    const pathwayId = id;
    const user = context.userId;
    return this.db.transaction(async (client) => {
      const candidate = (
        await client.query<{ id: string }>(
          'SELECT id FROM candidate_profiles WHERE user_id=$1',
          [user],
        )
      ).rows[0];
      if (!candidate)
        throw new ConflictException('Complete candidate onboarding');
      const path = (
        await client.query('SELECT id FROM pathways WHERE id=$1', [pathwayId])
      ).rows[0];
      if (!path) throw new NotFoundException();
      await client.query(
        'INSERT INTO candidate_pathways(candidate_id,pathway_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [candidate.id, pathwayId],
      );
      await audit(
        client,
        user,
        'candidate.pathway_selected',
        'candidate',
        candidate.id,
        context.requestId,
        { pathwayId },
      );
      return {
        pathwayId,
        status: 'INTEREST_RECORDED',
        readiness: 'NOT_ASSESSED',
      };
    });
  }

  async createOrganization(context: OperationContext, data: EmployerInput) {
    const user = context.userId;
    return this.db.transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO organizations(display_name,sector,country_code,created_by) VALUES($1,$2,$3,$4) RETURNING id`,
        [data.displayName, data.sector, data.countryCode, user],
      );
      const id = result.rows[0]!.id;
      await client.query(
        'INSERT INTO organization_memberships VALUES($1,$2,now())',
        [id, user],
      );
      await client.query(
        "INSERT INTO user_role_assignments(user_id,role_code,role_scope,organization_id,granted_by,reason) VALUES($1,'EMPLOYER','ORGANIZATION',$2,$1,'Owner of newly registered pending organization')",
        [user, id],
      );
      await audit(
        client,
        user,
        'organization.created',
        'organization',
        id,
        context.requestId,
      );
      return { id, verificationStatus: 'PENDING' };
    });
  }
  async organization(context: OperationContext, id: string) {
    const organizationId = id;
    if (!hasPermission(context.grants, 'employer:own', organizationId))
      throw new NotFoundException();
    const result = await this.db.pool.query(
      'SELECT id,display_name,sector,country_code,verification_status FROM organizations WHERE id=$1',
      [organizationId],
    );
    if (!result.rows[0]) throw new NotFoundException();
    return result.rows[0];
  }

  async createEvidence(context: OperationContext, data: EvidenceInput) {
    const user = context.userId;
    return this.db.transaction(async (client) => {
      const candidate = (
        await client.query<{ id: string }>(
          'SELECT id FROM candidate_profiles WHERE user_id=$1',
          [user],
        )
      ).rows[0];
      if (!candidate)
        throw new ConflictException('Complete candidate onboarding');
      const definition = (
        await client.query('SELECT id FROM competency_versions WHERE id=$1', [
          data.competencyVersionId,
        ])
      ).rows[0];
      if (!definition)
        throw new NotFoundException('Unknown competency version');
      const result = await client.query<{ id: string }>(
        `INSERT INTO evidence_records(candidate_id,competency_version_id,source,summary,observed_at,review_status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          candidate.id,
          data.competencyVersionId,
          data.source,
          data.summary,
          data.observedAt ?? null,
          initialEvidenceStatus(data.source),
          user,
        ],
      );
      const id = result.rows[0]!.id;
      await audit(
        client,
        user,
        'evidence.submitted',
        'evidence',
        id,
        context.requestId,
        { source: data.source },
      );
      return { id, reviewStatus: 'SUBMITTED', competenceVerified: false };
    });
  }
  async evidence(context: OperationContext) {
    return (
      await this.db.pool.query(
        `SELECT e.id,e.competency_version_id,e.source,e.summary,e.review_status,e.observed_at,e.created_at FROM evidence_records e JOIN candidate_profiles c ON c.id=e.candidate_id WHERE c.user_id=$1 ORDER BY e.created_at DESC LIMIT 100`,
        [context.userId],
      )
    ).rows;
  }
  async evidenceById(context: OperationContext, id: string) {
    const result = await this.db.pool.query(
      `SELECT e.id,e.competency_version_id,e.source,e.summary,e.review_status FROM evidence_records e JOIN candidate_profiles c ON c.id=e.candidate_id WHERE e.id=$1 AND c.user_id=$2`,
      [id, context.userId],
    );
    if (!result.rows[0]) throw new NotFoundException();
    return result.rows[0];
  }
  async summary() {
    const result = await this.db.pool.query(
      `SELECT (SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM candidate_profiles) AS candidates,(SELECT count(*)::int FROM organizations) AS organizations,(SELECT count(*)::int FROM evidence_records WHERE review_status='SUBMITTED') AS evidence_pending`,
    );
    return result.rows[0];
  }

  async assign(context: OperationContext, data: RoleAssignmentInput) {
    const actor = context.userId;
    return this.db.transaction(async (client) => {
      const role = (
        await client.query<{ scope: string }>(
          'SELECT scope FROM roles WHERE code=$1',
          [data.roleCode],
        )
      ).rows[0];
      if (!role) throw new UnprocessableEntityException('Unknown role');
      if ((role.scope === 'ORGANIZATION') !== Boolean(data.organizationId))
        throw new UnprocessableEntityException('Role scope mismatch');
      if (
        !(
          await client.query(
            "SELECT id FROM users WHERE id=$1 AND status='ACTIVE'",
            [data.userId],
          )
        ).rows[0]
      )
        throw new NotFoundException('Active user required');
      if (
        data.organizationId &&
        !(
          await client.query(
            'SELECT 1 FROM organization_memberships WHERE organization_id=$1 AND user_id=$2',
            [data.organizationId, data.userId],
          )
        ).rows[0]
      )
        throw new ForbiddenException('Organization membership required');
      const result = await client.query<{ id: string }>(
        'INSERT INTO user_role_assignments(user_id,role_code,role_scope,organization_id,granted_by,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
        [
          data.userId,
          data.roleCode,
          role.scope,
          data.organizationId ?? null,
          actor,
          data.reason,
        ],
      );
      const id = result.rows[0]!.id;
      await audit(
        client,
        actor,
        'role.granted',
        'role_assignment',
        id,
        context.requestId,
        {
          roleCode: data.roleCode,
          targetUserId: data.userId,
          reason: data.reason,
        },
      );
      return { id };
    });
  }
}
