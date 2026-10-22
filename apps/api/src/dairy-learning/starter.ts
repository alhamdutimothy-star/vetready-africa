import { ConflictException } from '@nestjs/common';
import { dairyCurriculumSchema, type DairyUnit } from '@vetready/contracts';
import type { Pool } from 'pg';
import { dairyDomains } from './domains';
export const dairyNotice =
  'DEMO/DRAFT — REQUIRES DOMAIN EXPERT VALIDATION. Learning participation is not assessed competence.';
export async function dairyStarter(db: { pool: Pick<Pool, 'query'> }) {
  const path = (
    await db.pool.query(
      "SELECT v.id FROM pathway_versions v JOIN pathways p ON p.id=v.pathway_id WHERE p.code='DAIRY' AND v.approval_status<>'RETIRED' ORDER BY v.version DESC LIMIT 1",
    )
  ).rows[0];
  if (!path) throw new ConflictException('Dairy pathway unavailable');
  const rows = (
    await db.pool.query<{ id: string; code: string }>(
      `SELECT DISTINCT ON(ch.code) v.id,ch.code FROM child_competencies ch JOIN child_competency_versions v ON v.child_id=ch.id JOIN child_group_mappings m ON m.child_version_id=v.id JOIN pathway_competencies p ON p.competency_version_id=m.group_version_id WHERE p.pathway_version_id=$1 AND v.validation_status<>'RETIRED' ORDER BY ch.code,v.version DESC`,
      [path.id],
    )
  ).rows;
  const child = (code: string) => {
    const row = rows.find((r) => r.code === code);
    if (!row)
      throw new ConflictException('Required dairy competency unavailable');
    return row.id;
  };
  const pilot = (
    await db.pool.query(
      "SELECT v.id FROM dairy_pilot_versions p JOIN assessment_versions v ON v.id=p.assessment_version_id WHERE v.status='DEMO'",
    )
  ).rows[0];
  if (!pilot)
    throw new ConflictException(
      'Prepare, inspect and explicitly release the existing dairy pilot before creating linked learning',
    );
  const common = {
    africanContext:
      'Compare intensive, semi-intensive and pasture systems. Ask about breed, heat, seasonal forage supply, staff training, laboratory access and budget. Record unavailable information rather than assuming a high-input system.',
    commercialRelevance:
      'Discuss feasible priorities with the farm manager. Separate estimated losses from verified costs, state assumptions, and request local prices before discussing value.',
    commonMistakes:
      'Do not equate one observation with a confirmed diagnosis, missing records with absence of disease, or completed learning with practical competence.',
    redFlags:
      'Identify welfare and safety concerns, uncertainty and needs for prompt qualified clinical assessment. Specific escalation criteria and protocols REQUIRE DOMAIN EXPERT VALIDATION.',
    decisionPoints:
      'State what is observed, inferred and still unknown. Explain what additional evidence could change the recommendation. Agree responsibility and follow-up with the supervising veterinarian.',
  };
  const unit = (
    lessonCode: string,
    domainCode: string,
    sections: Partial<DairyUnit['sections']>,
    prompt: string,
    pre: string[],
  ): DairyUnit => ({
    lessonCode,
    domainCode,
    objectives: [
      {
        stage: 'KNOW',
        statement:
          'Identify the records and observations needed for this investigation.',
      },
      {
        stage: 'INTERPRET',
        statement:
          'Distinguish recorded findings, assumptions, missing data and competing explanations.',
      },
      {
        stage: 'INVESTIGATE',
        statement:
          'Propose an evidence collection plan comparing individual animals and relevant herd groups.',
      },
      {
        stage: 'DECIDE',
        statement:
          'Prioritize a feasible investigation and identify when to seek qualified supervision.',
      },
      {
        stage: 'COMMUNICATE',
        statement:
          'Write a concise finding, uncertainty, action and monitoring summary.',
      },
      {
        stage: 'DEMONSTRATE',
        statement:
          'Identify the supervised field observations still required; online completion does not demonstrate them.',
      },
    ],
    prerequisites: pre.map((code) => ({
      childVersionId: child(code),
      facet: 'CASE_ASSESSED',
    })),
    sections: {
      ...common,
      introduction:
        'Use a structured investigation; this is a proposed learning scaffold, not a clinical protocol.',
      coreConcepts:
        'Consider animal and herd evidence separately, check data quality and avoid premature causal claims.',
      farmRelevance:
        'Link the concern to the farm workflow and people responsible for observations.',
      clinicalRelevance:
        'Explain why examination by an appropriately qualified veterinarian may be needed.',
      herdRelevance:
        'Look for patterns by time, group, parity and management exposure.',
      ...sections,
    },
    sources: [
      {
        title: 'FAO dairy production and products resource collection',
        organization: 'Food and Agriculture Organization of the United Nations',
        publication:
          'Reference candidate; specific document and edition not yet selected',
        year: null,
        url: 'https://www.fao.org/dairy-production-products/en/',
        identifier: 'VALIDATION_REFERENCE_CANDIDATE',
        evidenceType:
          'Reference discovery lead, not evidence supporting a clinical claim',
        geographicRelevance:
          'Global; Nigerian applicability requires expert review',
        reviewerId: null,
        reviewDate: null,
        notes:
          'Not reviewed for this unit. Author must select and verify claim-level citations before professional approval. Original software demonstration text only.',
        superseded: false,
      },
    ],
    practicalRequirements: [
      'Supervised farm history and records review.',
      'Appropriate supervised animal/group observation and communication of findings.',
      'Named assessor, date, context, limitations and separate verification decision required.',
    ],
    activity: {
      kind:
        domainCode === 'RECORDS'
          ? 'DATA_INTERPRETATION'
          : 'KNOWLEDGE_REFLECTION',
      prompt,
    },
  });
  const units = [
    unit(
      'TRANSITION_INVESTIGATION',
      'TRANSITION',
      {
        introduction:
          'A fresh-cow problem may involve individual disease and common herd exposures. Begin by defining the affected group and timeline rather than naming a single disorder.',
        coreConcepts:
          'Review far-off, close-up and fresh-cow groups; distinguish feed availability from measured intake. Consider body condition, calving history, environment, grouping and prior observations. Metabolic, reproductive and management hypotheses require evidence.',
        farmRelevance:
          'Ask who monitors fresh cows, how observations are recorded and how concerns are escalated.',
        herdRelevance:
          'Compare recorded events by calving cohort and parity. Missing denominators and inconsistent case definitions limit interpretation.',
      },
      'List the records and observations needed to investigate a fresh-cow problem. Give competing hypotheses, evidence that could support or contradict them, an immediate safety/escalation priority and a monitoring plan. Do not prescribe a drug or nutrient target.',
      ['REASON_INVESTIGATE'],
    ),
    unit(
      'CALF_INVESTIGATION',
      'CALVES',
      {
        introduction:
          'When calves underperform, distinguish an individual clinical concern from patterns linked to birth, feeding, housing, hygiene and record quality.',
        coreConcepts:
          'Ask about calving and neonatal observations, colostrum process and passive-transfer assessment where available, feeding, starter, water, hygiene, respiratory and diarrhoea records, growth measures and weaning decisions. Do not substitute a proposed target for investigation.',
        herdRelevance:
          'Define which calves, age groups and periods are affected. Verify weights, dates, denominators and missing observations before comparing groups.',
      },
      'A farm reports poor calf growth but has incomplete birth and weight records. Define the problem, request missing information, distinguish nutrition/health/environment hypotheses and describe an appropriate supervised assessment. Explain the limits of any conclusion.',
      ['DATA_PREPARE'],
    ),
    unit(
      'RECORDS_INVESTIGATION',
      'RECORDS',
      {
        introduction:
          'A spreadsheet can show a pattern without proving its cause. Check animal identifiers, dates, units, denominators and recording consistency before drawing conclusions.',
        coreConcepts:
          'Fictional software dataset: group A records 20 and 18 units of milk per cow on two observations; group B records 14 and 14. Observation dates, DIM, parity, measurement method and group membership are missing. These are invented observations, not benchmarks.',
        herdRelevance:
          'Describe the change within each group. State why a comparison cannot establish a disease cause or management recommendation without context.',
      },
      'Using the fictional dataset, describe the observed changes and a useful chart. Identify missing denominators/context, an alternative explanation and the next records you would request. Explain why no clinical target or diagnosis follows from these figures.',
      ['DATA_PREPARE'],
    ),
  ];
  const allCodes = [...new Set(dairyDomains.flatMap((d) => [...d.childCodes]))];
  const mapping = (code: string) => ({
    pathwayVersionId: path.id,
    childVersionId: child(code),
  });
  return dairyCurriculumSchema.parse({
    training: {
      code: 'DEMO_DAIRY_CURRICULUM',
      content: {
        title: 'Commercial Dairy Practice — governed draft curriculum',
        description: dairyNotice,
        pathwayVersionIds: [path.id],
        competencyMappings: allCodes.map(mapping),
        modules: [
          {
            code: 'DAIRY_STARTER',
            title: 'Investigating dairy performance',
            lessons: units.map((u) => ({
              code: u.lessonCode,
              title:
                u.lessonCode === 'TRANSITION_INVESTIGATION'
                  ? 'Investigating transition and fresh-cow concerns'
                  : u.lessonCode === 'CALF_INVESTIGATION'
                    ? 'Investigating calf underperformance'
                    : 'Interpreting imperfect dairy records',
              body: Object.values(u.sections).join('\n\n'),
              objectives: u.objectives.map((o) => o.statement),
              competencyMappings: dairyDomains
                .find((d) => d.code === u.domainCode)!
                .childCodes.map(mapping),
              assessmentVersionIds:
                u.domainCode === 'TRANSITION' ? [pilot.id] : [],
            })),
          },
        ],
      },
    },
    domains: dairyDomains.map((d) => ({
      code: d.code,
      title: d.title,
      topics: [...d.topics],
      childVersionIds: d.childCodes.map(child),
    })),
    units,
  });
}
