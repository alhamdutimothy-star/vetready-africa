import {
  Controller,
  Post,
  Delete,
  Req,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Database, audit } from './database';
import { principal, AllowRevokedSession, type AuthRequest } from './auth';
export function sessionDigest(handle: string) {
  return createHash('sha256').update(handle).digest('hex');
}
@ApiTags('browser sessions')
@ApiBearerAuth('access-token')
@Controller('sessions')
export class SessionController {
  constructor(@Inject(Database) private readonly db: Database) {}
  @ApiOperation({
    summary: 'Register a revocable browser session; no domain role is granted',
  })
  @Post()
  create(@Req() r: AuthRequest) {
    const user = principal(r);
    r.sessionRegistrationStage = 'session-transaction';
    return this.db.transaction(async (c) => {
      const handle = randomBytes(32).toString('base64url');
      const expiresAt = new Date(
        Math.min(user.tokenExpiresAt * 1000, Date.now() + 3600000),
      );
      if (expiresAt.getTime() <= Date.now())
        throw new UnauthorizedException('Access token expired');
      r.sessionRegistrationStage = 'session-insert';
      const row = (
        await c.query<{ id: string }>(
          'INSERT INTO browser_sessions(handle_hash,user_id,expires_at) VALUES($1,$2,$3) RETURNING id',
          [sessionDigest(handle), user.userId, expiresAt],
        )
      ).rows[0]!;
      r.sessionRegistrationStage = 'session-audit';
      await audit(
        c,
        user.userId,
        'session.created',
        'browser_session',
        row.id,
        r.requestId,
      );
      r.sessionRegistrationStage = 'session-response';
      const response = { handle, expiresAt: expiresAt.toISOString() };
      r.sessionRegistrationStage = 'session-commit';
      return response;
    });
  }
  @ApiOperation({
    summary:
      'Revoke the current browser session; valid bearer tokens still expire separately',
  })
  @AllowRevokedSession()
  @Delete('current')
  revoke(@Req() r: AuthRequest) {
    const user = principal(r);
    const handle = r.headers['x-vetready-session'];
    if (typeof handle !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(handle))
      throw new UnauthorizedException('Session required');
    return this.db.transaction(async (c) => {
      const row = (
        await c.query<{ id: string; revoked_at: Date | null }>(
          'SELECT id,revoked_at FROM browser_sessions WHERE handle_hash=$1 AND user_id=$2 FOR UPDATE',
          [sessionDigest(handle), user.userId],
        )
      ).rows[0];
      if (!row) throw new UnauthorizedException('Session unavailable');
      if (!row.revoked_at) {
        await c.query(
          'UPDATE browser_sessions SET revoked_at=now() WHERE id=$1',
          [row.id],
        );
        await audit(
          c,
          user.userId,
          'session.revoked',
          'browser_session',
          row.id,
          r.requestId,
        );
      }
      return { revoked: true };
    });
  }
}
