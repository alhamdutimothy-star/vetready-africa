import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { API_CONFIG, type ApiConfig } from './config';
@Injectable()
export class Database implements OnModuleDestroy {
  readonly pool: Pool;
  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.pool = new Pool({ connectionString: config.DATABASE_URL, max: 10 });
  }
  async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
export async function audit(
  client: PoolClient,
  actor: string,
  action: string,
  type: string,
  id: string | null,
  requestId: string,
  metadata: Record<string, unknown> = {},
) {
  await client.query(
    'INSERT INTO audit_events(actor_id,action,resource_type,resource_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6)',
    [actor, action, type, id, requestId, JSON.stringify(metadata)],
  );
}
