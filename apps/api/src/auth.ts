import type { SessionRegistrationStage } from './session-diagnostics';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request } from 'express';
import type { Permission, RoleGrant } from '@vetready/domain';
import { hasPermission } from '@vetready/domain';
import { API_CONFIG, type ApiConfig } from './config';
import { Database, audit } from './database';
export interface Principal {
  userId: string;
  tokenExpiresAt: number;
  grants: RoleGrant[];
}
export interface AuthRequest extends Request {
  principal?: Principal;
  sessionRegistrationStage?: SessionRegistrationStage;
  requestId: string;
}
const PUBLIC = 'public';
const PERMISSION = 'permission';
const REVOKE_SESSION = 'revoke-session';
export const AllowRevokedSession = () => SetMetadata(REVOKE_SESSION, true);
export const Public = () => SetMetadata(PUBLIC, true);
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION, permission);
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly keys: ReturnType<typeof createRemoteJWKSet>;
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(Database) private readonly db: Database,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {
    this.keys = createRemoteJWKSet(new URL(config.OIDC_JWKS_URI), {
      timeoutDuration: 5000,
    });
  }
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const revokeSession =
      this.reflector.getAllAndOverride<boolean>(REVOKE_SESSION, [
        context.getHandler(),
        context.getClass(),
      ]) === true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const registering =
      request.method === 'POST' && request.path === '/api/v1/sessions';
    const mark = (stage: SessionRegistrationStage) => {
      if (registering) request.sessionRegistrationStage = stage;
    };
    mark('jwt-validation');
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ') || authorization.length > 16000)
      throw new UnauthorizedException('Valid access token required');
    let subject: string;
    let tokenExpiresAt: number;
    try {
      const { payload } = await jwtVerify(authorization.slice(7), this.keys, {
        issuer: this.config.OIDC_ISSUER,
        audience: this.config.OIDC_AUDIENCE,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iat', 'sub'],
        clockTolerance: 5,
      });
      if (
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        payload.sub.length > 255 ||
        typeof payload.scope !== 'string' ||
        !payload.scope.split(' ').includes('vetready:access')
      )
        throw new Error('Invalid access scope');
      subject = payload.sub;
      tokenExpiresAt = payload.exp!;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    mark('identity-transaction');
    request.principal = await this.db.transaction(async (client) => {
      mark('identity-provisioning');
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO users(issuer,subject) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',
        [this.config.OIDC_ISSUER, subject],
      );
      mark('identity-lookup');
      const user =
        inserted.rows[0] ??
        (
          await client.query<{ id: string; status: string }>(
            'SELECT id,status FROM users WHERE issuer=$1 AND subject=$2',
            [this.config.OIDC_ISSUER, subject],
          )
        ).rows[0];
      if (!user) throw new UnauthorizedException();
      if ('status' in user && user.status !== 'ACTIVE' && !revokeSession)
        throw new ForbiddenException('Account unavailable');
      if (inserted.rows[0]) {
        mark('default-role-assignment');
        await client.query(
          "INSERT INTO user_role_assignments(user_id,role_code,role_scope,reason) VALUES($1,'CANDIDATE','PLATFORM','Default candidate onboarding capability')",
          [user.id],
        );
        mark('identity-audit');
        await audit(
          client,
          user.id,
          'identity.provisioned',
          'user',
          user.id,
          request.requestId,
        );
      }
      mark('role-lookup');
      const grants = await client.query<{
        permission: string;
        organizationId: string | null;
      }>(
        `SELECT rp.permission_code AS permission,ura.organization_id AS "organizationId" FROM user_role_assignments ura JOIN role_permissions rp ON rp.role_code=ura.role_code WHERE ura.user_id=$1 AND (ura.expires_at IS NULL OR ura.expires_at>now())`,
        [user.id],
      );
      mark('browser-session-validation');
      const sessionHandle = request.headers['x-vetready-session'];
      if (sessionHandle !== undefined) {
        if (
          typeof sessionHandle !== 'string' ||
          !/^[A-Za-z0-9_-]{43}$/.test(sessionHandle)
        )
          throw new UnauthorizedException('Invalid browser session');
        const hash = (await import('node:crypto'))
          .createHash('sha256')
          .update(sessionHandle)
          .digest('hex');
        if (
          !(
            await client.query(
              `SELECT 1 FROM browser_sessions WHERE handle_hash=$1 AND user_id=$2 ${revokeSession ? '' : 'AND revoked_at IS NULL AND expires_at>now()'}`,
              [hash, user.id],
            )
          ).rowCount
        )
          throw new UnauthorizedException('Browser session expired or revoked');
      }
      mark('identity-commit');
      return { userId: user.id, grants: grants.rows, tokenExpiresAt };
    });
    return true;
  }
}
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const permission = this.reflector.getAllAndOverride<Permission>(
      PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (
      !request.principal ||
      !hasPermission(request.principal.grants, permission)
    )
      throw new ForbiddenException('Permission required');
    return true;
  }
}
export function principal(request: AuthRequest): Principal {
  if (!request.principal) throw new UnauthorizedException();
  return request.principal;
}
