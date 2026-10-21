import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { databasePool, transaction } from './db';
import { seedPhase2 } from './seed-phase2';
const competency = z.object({ code: z.string(), name: z.string() });
const schema = z.object({
  validationNotice: z.literal('REQUIRES DOMAIN EXPERT VALIDATION'),
  core: z.array(competency),
  pathways: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      description: z.string(),
      competencies: z.array(competency),
    }),
  ),
});
async function main() {
  const data = schema.parse(
    JSON.parse(await readFile('db/seeds/reference-data.json', 'utf8')),
  );
  const pool = databasePool();
  try {
    await transaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(418272)');
      const permissions = [
        'candidate:own',
        'employer:own',
        'catalog:read',
        'evidence:own',
        'admin:summary',
        'roles:grant',
        'assessment:author',
        'assessment:assign',
        'assessment:review',
        'assessment:moderate',
      ];
      for (const p of permissions)
        await client.query(
          'INSERT INTO permissions(code) VALUES($1) ON CONFLICT DO NOTHING',
          [p],
        );
      const roles: Record<string, { scope: string; permissions: string[] }> = {
        CANDIDATE: {
          scope: 'PLATFORM',
          permissions: ['candidate:own', 'catalog:read', 'evidence:own'],
        },
        EMPLOYER: { scope: 'ORGANIZATION', permissions: ['employer:own'] },
        TRAINER: { scope: 'PLATFORM', permissions: ['catalog:read'] },
        ASSESSOR: {
          scope: 'PLATFORM',
          permissions: ['catalog:read', 'assessment:review'],
        },
        ADMIN: {
          scope: 'PLATFORM',
          permissions: [
            'catalog:read',
            'admin:summary',
            'assessment:author',
            'assessment:assign',
            'assessment:moderate',
          ],
        },
        SUPER_ADMIN: {
          scope: 'PLATFORM',
          permissions: [
            'catalog:read',
            'admin:summary',
            'roles:grant',
            'assessment:author',
            'assessment:assign',
            'assessment:moderate',
          ],
        },
      };
      for (const [code, role] of Object.entries(roles)) {
        await client.query(
          'INSERT INTO roles(code,scope) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [code, role.scope],
        );
        for (const p of role.permissions)
          await client.query(
            'INSERT INTO role_permissions VALUES($1,$2) ON CONFLICT DO NOTHING',
            [code, p],
          );
      }
      // Add only new training capabilities when migration 010 is present; prior-schema
      // upgrade fixtures remain representative of their original permission catalog.
      if (
        (
          await client.query(
            "SELECT to_regclass('training_courses') IS NOT NULL AS present",
          )
        ).rows[0].present
      ) {
        await client.query(
          "INSERT INTO role_permissions(role_code,permission_code) SELECT r.code,p.code FROM roles r CROSS JOIN permissions p WHERE r.code IN ('ADMIN','SUPER_ADMIN') AND p.code IN ('training:manage','training:assign') ON CONFLICT DO NOTHING",
        );
      }
      for (const code of [
        'NOT_ASSESSED',
        'FOUNDATION',
        'DEVELOPING',
        'KNOWLEDGE_VERIFIED',
        'CASE_VERIFIED',
        'PRACTICALLY_VERIFIED',
        'JOB_READY',
        'FIELD_READY',
        'ADVANCED',
      ])
        await client.query(
          'INSERT INTO readiness_classifications VALUES($1,$2) ON CONFLICT DO NOTHING',
          [code, code.replaceAll('_', ' ')],
        );
      async function seedCompetency(
        item: z.infer<typeof competency>,
        category: string,
      ) {
        const c = await client.query<{ id: string }>(
          'INSERT INTO competencies(code,category) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id',
          [item.code, category],
        );
        const id = c.rows[0]!.id;
        const v = await client.query<{ id: string }>(
          `INSERT INTO competency_versions(competency_id,version,name,description) VALUES($1,1,$2,$3) ON CONFLICT(competency_id,version) DO NOTHING RETURNING id`,
          [
            id,
            item.name,
            `${item.name}. Scope, rubric and thresholds require expert review.`,
          ],
        );
        if (v.rows[0]) return v.rows[0].id;
        return (
          await client.query<{ id: string }>(
            'SELECT id FROM competency_versions WHERE competency_id=$1 AND version=1',
            [id],
          )
        ).rows[0]!.id;
      }
      const coreIds = [];
      for (const item of data.core)
        coreIds.push(await seedCompetency(item, 'CORE'));
      for (const path of data.pathways) {
        const p = await client.query<{ id: string }>(
          'INSERT INTO pathways(code,name,description) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id',
          [path.code, path.name, path.description],
        );
        await client.query(
          'INSERT INTO pathway_versions(pathway_id,version) VALUES($1,1) ON CONFLICT DO NOTHING',
          [p.rows[0]!.id],
        );
        const version = (
          await client.query<{ id: string; approval_status: string }>(
            'SELECT id,approval_status FROM pathway_versions WHERE pathway_id=$1 AND version=1',
            [p.rows[0]!.id],
          )
        ).rows[0]!;
        if (['APPROVED', 'RETIRED'].includes(version.approval_status)) continue;
        const pv = version.id;
        for (const id of coreIds)
          await client.query(
            "INSERT INTO pathway_competencies(pathway_version_id,competency_version_id,layer) VALUES($1,$2,'CORE') ON CONFLICT DO NOTHING",
            [pv, id],
          );
        for (const item of path.competencies) {
          const id = await seedCompetency(item, path.code);
          await client.query(
            "INSERT INTO pathway_competencies(pathway_version_id,competency_version_id,layer) VALUES($1,$2,'PATHWAY') ON CONFLICT DO NOTHING",
            [pv, id],
          );
        }
      }
    });
    await transaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(418272)');
      await seedPhase2(client);
    });
    console.log(
      'Reference catalogs present; new definitions are draft, existing approvals preserved, no thresholds assigned by seed.',
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error('Seeding failed; check validated schema/configuration.');
  process.exitCode = 1;
});
