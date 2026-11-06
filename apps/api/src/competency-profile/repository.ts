import { readProfileFacts } from './facts';
import { readGovernedVerification } from '../verification/projection';
import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  profileInputSchema,
  PROFILE_ENGINE_VERSION,
} from '@vetready/contracts';
import {
  aggregateCompetencyProfile,
  profileCanonicalJson,
  skillsPassport,
  hasPermission,
} from '@vetready/domain';
import { Database } from '../database';
import type { OperationContext } from '../service';
const digest = (value: unknown) =>
  createHash('sha256').update(profileCanonicalJson(value)).digest('hex');
@Injectable()
export class CompetencyProfileRepository {
  constructor(@Inject(Database) private readonly db: Database) {}
  private async owner(c: PoolClient, ctx: OperationContext, lock = false) {
    if (!hasPermission(ctx.grants, 'candidate:own'))
      throw new ForbiddenException('Candidate ownership capability required');
    const row = (
      await c.query<{ id: string }>(
        "SELECT p.id FROM candidate_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND u.status='ACTIVE'" +
          (lock ? ' FOR UPDATE OF p' : ''),
        [ctx.userId],
      )
    ).rows[0];
    if (!row) throw new NotFoundException('Candidate profile unavailable');
    return row.id;
  }
  current(ctx: OperationContext) {
    return this.db.transaction(async (c) => {
      await c.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
      );
      const owner = await this.owner(c, ctx);
      return {
        ...aggregateCompetencyProfile(await readProfileFacts(c, owner)),
        governedVerification: await readGovernedVerification(c, owner),
      };
    });
  }
  async passport(ctx: OperationContext) {
    const profile = await this.current(ctx);
    return {
      ...skillsPassport(profile),
      governedVerification: profile.governedVerification,
    };
  }
  async competency(ctx: OperationContext, id: string) {
    const p = await this.current(ctx);
    const competency = p.competencies.find((x) => x.id === id);
    if (!competency) throw new NotFoundException('Competency unavailable');
    const keys = new Set([
      ...competency.facets.flatMap((f) => f.sourceKeys),
      ...competency.learningSourceKeys,
      ...competency.groupSupportingSourceKeys,
    ]);
    return {
      ...p,
      competencies: [competency],
      sources: p.sources.filter((s) => keys.has(s.key)),
      groupEvidence: p.groupEvidence.filter((g) =>
        competency.groupVersionIds.includes(g.groupVersionId),
      ),
    };
  }
  async gaps(ctx: OperationContext, pathway: string) {
    const p = await this.current(ctx);
    const path = p.pathways.find((x) => x.id === pathway);
    if (!path) throw new NotFoundException('Pathway version unavailable');
    return {
      engineVersion: p.engineVersion,
      evaluatedAt: p.evaluatedAt,
      pathway: path,
      notice: p.notice,
      readiness: p.readiness,
      configurationStatus: p.configurationStatus,
      competencies: p.competencies
        .filter((c) => c.pathwayVersionIds.includes(pathway))
        .map((c) => ({
          ...c,
          gaps: c.gaps.filter((g) => g.pathwayVersionId === pathway),
        })),
    };
  }
  async snapshot(ctx: OperationContext, commandId: string) {
    for (let attempt = 0; attempt < 3; attempt++)
      try {
        return await this.saveSnapshot(ctx, commandId);
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          ['40001', '23505', '40P01'].includes(String(error.code))
        )
          continue;
        throw error;
      }
    throw new ConflictException(
      'Concurrent snapshot request; retry the same command',
    );
  }
  private saveSnapshot(ctx: OperationContext, commandId: string) {
    return this.db.transaction(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      // Serialize only explicit receipts for this owner. Reads remain fresh and side-effect free.
      const owner = await this.owner(c, ctx, true);
      const old = (
        await c.query(
          'SELECT * FROM competency_profile_snapshots WHERE candidate_id=$1 AND command_id=$2',
          [owner, commandId],
        )
      ).rows[0];
      if (old) return this.checkedSnapshot(old, true);
      // Unique-command/serialization races retry the entire consistent transaction above.
      const input = await readProfileFacts(c, owner),
        result = aggregateCompetencyProfile(input);
      const row = (
        await c.query(
          `INSERT INTO competency_profile_snapshots(candidate_id,actor_id,command_id,request_id,engine_version,evaluated_at,input_facts,result,input_digest,result_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [
            owner,
            ctx.userId,
            commandId,
            ctx.requestId,
            PROFILE_ENGINE_VERSION,
            input.evaluatedAt,
            JSON.stringify(input),
            JSON.stringify(result),
            digest(input),
            digest(result),
          ],
        )
      ).rows[0];
      return this.checkedSnapshot(row, false);
    });
  }
  private checkedSnapshot(row: Record<string, unknown>, replay: boolean) {
    const input = profileInputSchema.parse(row.input_facts),
      result = aggregateCompetencyProfile(input);
    if (
      digest(input) !== row.input_digest ||
      digest(result) !== row.result_digest ||
      profileCanonicalJson(result) !== profileCanonicalJson(row.result)
    )
      throw new InternalServerErrorException(
        'Historical profile integrity check failed',
      );
    return {
      id: row.id,
      createdAt: row.created_at,
      inputDigest: row.input_digest,
      resultDigest: row.result_digest,
      historical: true as const,
      replay,
      notice:
        'Historical calculation only. Current evidence may have changed. This snapshot is not a current passport.',
      input,
      result,
    };
  }
  saved(ctx: OperationContext, id: string) {
    return this.db.transaction(async (c) => {
      await c.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
      );
      const owner = await this.owner(c, ctx);
      const row = (
        await c.query(
          'SELECT * FROM competency_profile_snapshots WHERE id=$1 AND candidate_id=$2',
          [id, owner],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Private snapshot unavailable');
      return this.checkedSnapshot(row, false);
    });
  }
}
