import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import { z } from 'zod';
const childrenSchema = z.array(
  z.object({
    code: z.string(),
    groups: z.array(z.string()),
    statement: z.string(),
    route: z.string(),
    criteria: z.array(z.string()),
    context: z.string(),
    standard: z.string(),
    status: z.literal('PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION'),
    sources: z.array(z.string()),
  }),
);
export async function seedPhase2(client: PoolClient) {
  const children = childrenSchema.parse(
    JSON.parse(await readFile('db/seeds/child-competencies.json', 'utf8')),
  );
  for (const [code, name] of Object.entries({
    CORE: 'Shared professional practice',
    DAIRY: 'Commercial dairy practice',
    PHARMA: 'Pharmaceutical technical-commercial practice',
    POULTRY: 'Poultry operations and performance',
    PREMIX: 'Nutrition technical-commercial practice',
  })) {
    await client.query(
      'INSERT INTO competency_domains(code,name) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [code, name],
    );
  }
  await client.query(
    `INSERT INTO pathway_domain_groups SELECT pc.pathway_version_id,pc.competency_version_id,d.id FROM pathway_competencies pc JOIN competency_versions cv ON cv.id=pc.competency_version_id JOIN competencies c ON c.id=cv.competency_id JOIN competency_domains d ON d.code=split_part(c.code,'_',1) ON CONFLICT DO NOTHING`,
  );
  for (const child of children) {
    const c = await client.query<{ id: string }>(
      'INSERT INTO child_competencies(code) VALUES($1) ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id',
      [child.code],
    );
    await client.query(
      'INSERT INTO child_competency_versions(child_id,version,statement,proposed_method,context_kind,standards_to_validate) VALUES($1,1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [
        c.rows[0]!.id,
        child.statement,
        child.route,
        child.context,
        child.standard,
      ],
    );
    const v = (
      await client.query<{ id: string; validation_status: string }>(
        'SELECT id,validation_status FROM child_competency_versions WHERE child_id=$1 AND version=1',
        [c.rows[0]!.id],
      )
    ).rows[0]!;
    if (v.validation_status !== 'PROPOSED') continue;
    if (
      (
        await client.query(
          "SELECT 1 FROM assessment_blueprint b JOIN assessment_versions a ON a.id=b.assessment_version_id WHERE b.child_version_id=$1 AND a.status<>'DRAFT'",
          [v.id],
        )
      ).rowCount
    )
      continue;
    for (const group of child.groups)
      await client.query(
        `INSERT INTO child_group_mappings SELECT $1,cv.id FROM competency_versions cv JOIN competencies c ON c.id=cv.competency_id WHERE c.code=$2 AND cv.version=1 ON CONFLICT DO NOTHING`,
        [v.id, group],
      );
    for (const [position, statement] of child.criteria.entries())
      await client.query(
        'INSERT INTO child_criteria(child_version_id,position,statement) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [v.id, position + 1, statement],
      );
    // These are proposed evidence routes, explicitly NOT approved practical gates.
    const facets =
      child.route === 'K'
        ? ['KNOWLEDGE_ASSESSED']
        : child.route === 'C'
          ? ['CASE_ASSESSED']
          : child.route === 'P'
            ? ['PRACTICALLY_VERIFIED']
            : child.route.includes('W')
              ? [
                  'WORKPLACE_VERIFIED',
                  child.route.includes('C')
                    ? 'CASE_ASSESSED'
                    : 'PRACTICALLY_VERIFIED',
                ]
              : ['CASE_ASSESSED', 'PRACTICALLY_VERIFIED'];
    await client.query(
      `INSERT INTO pathway_child_requirements(pathway_version_id,child_version_id,proposed_facets) SELECT DISTINCT pc.pathway_version_id,$1::uuid,$2::text[] FROM child_group_mappings m JOIN pathway_competencies pc ON pc.competency_version_id=m.group_version_id WHERE m.child_version_id=$1 ON CONFLICT DO NOTHING`,
      [v.id, facets],
    );
  }
  const demos = [
    {
      code: 'DEMO_DAIRY',
      path: 'DAIRY',
      child: 'DAIRY_INTEGRATED',
      group: 'DAIRY_PERFORMANCE',
      title: 'Dairy herd investigation',
      prompt:
        'A dairy herd reports declining milk yield, reduced intake, more fresh-cow problems and poorer reproductive results. Separate individual-animal findings from herd patterns. What records, observations and diagnostic evidence would you request? Explain competing hypotheses, safe escalation, prioritized actions and monitoring. Do not prescribe a treatment without verified clinical information.',
    },
    {
      code: 'DEMO_POULTRY',
      path: 'POULTRY_MANAGEMENT',
      child: 'POULTRY_INVESTIGATE',
      group: 'POULTRY_ANALYTICS',
      title: 'Layer flock performance investigation',
      prompt:
        'A layer flock reports declining egg production, changing mortality, altered feed intake and deteriorating shell quality. Describe what happened, what additional data you need, possible explanations, supporting evidence, management changes and KPIs to monitor. Account for flock age, water, heat, feed quality, health and records. No diagnosis is established by this scenario.',
    },
    {
      code: 'DEMO_PREMIX',
      path: 'PREMIX_SALES',
      child: 'PREMIX_POULTRY_REASON',
      group: 'PREMIX_PERFORMANCE',
      title: 'Investigate before recommending an additive',
      prompt:
        'A customer reports poor feed performance and asks you to sell an additive. Investigate formulation, ingredients, mixing, health, water, farm management and production history. Explain how to quantify the problem, evaluate claims, compare alternatives, design monitoring and discuss uncertain value before recommending any product.',
    },
    {
      code: 'DEMO_PHARMA',
      path: 'PHARMA_SALES',
      child: 'PHARMA_STEWARD',
      group: 'PHARMA_STEWARDSHIP',
      title: 'Antimicrobial request and ethical reasoning',
      prompt:
        'A farm customer asks for an antimicrobial without a confirmed diagnosis. Explain the history, examination or authorized referral, diagnostic evidence and approved product information needed. Discuss stewardship, professional scope, medicine-use records, withdrawal information from an authorized label and when an ethical no-sale is appropriate. No dose or product recommendation is supplied.',
    },
  ];
  for (const demo of demos) {
    if (
      (
        await client.query('SELECT 1 FROM assessments WHERE code=$1', [
          demo.code,
        ])
      ).rowCount
    )
      continue;
    const path = (
      await client.query<{ id: string }>(
        `SELECT pv.id FROM pathway_versions pv JOIN pathways p ON p.id=pv.pathway_id WHERE p.code=$1 AND pv.version=1`,
        [demo.path],
      )
    ).rows[0]!;
    const child = (
      await client.query<{ id: string }>(
        `SELECT v.id FROM child_competency_versions v JOIN child_competencies c ON c.id=v.child_id WHERE c.code=$1 AND v.version=1`,
        [demo.child],
      )
    ).rows[0]!;
    const group = (
      await client.query<{ id: string }>(
        `SELECT v.id FROM competency_versions v JOIN competencies c ON c.id=v.competency_id WHERE c.code=$1 AND v.version=1`,
        [demo.group],
      )
    ).rows[0]!;
    const a = (
      await client.query<{ id: string }>(
        'INSERT INTO assessments(code) VALUES($1) RETURNING id',
        [demo.code],
      )
    ).rows[0]!;
    const av = (
      await client.query<{ id: string }>(
        'INSERT INTO assessment_versions(assessment_id,version,pathway_version_id,title) VALUES($1,1,$2,$3) RETURNING id',
        [a.id, path.id, demo.title],
      )
    ).rows[0]!;
    const i = (
      await client.query<{ id: string }>(
        'INSERT INTO assessment_items(code) VALUES($1) RETURNING id',
        [demo.code + '_CASE'],
      )
    ).rows[0]!;
    const iv = (
      await client.query<{ id: string }>(
        `INSERT INTO assessment_item_versions(item_id,version,type,prompt,method,difficulty,evidence_type) VALUES($1,1,'CASE',$2,'CASE','INTERMEDIATE','CASE_ASSESSED') RETURNING id`,
        [i.id, demo.prompt],
      )
    ).rows[0]!;
    await client.query(
      'INSERT INTO assessment_blueprint VALUES($1,$2,$3,$4,$5)',
      [av.id, iv.id, path.id, group.id, child.id],
    );
    await client.query(
      'INSERT INTO rubric_criteria(item_version_id,child_version_id,criterion_id,description) SELECT $1,child_version_id,id,statement FROM child_criteria WHERE child_version_id=$2',
      [iv.id, child.id],
    );
    await client.query(
      "UPDATE assessment_versions SET status='DEMO' WHERE id=$1",
      [av.id],
    );
  }
}
