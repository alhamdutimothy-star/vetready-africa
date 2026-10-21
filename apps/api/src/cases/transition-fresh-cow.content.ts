/** Proposed professional content, deliberately separated from assessment logic. */
export const transitionFreshCowTemplate = {
  templateReference: 'TRANSITION_FRESH_COW_DEMO_V1',
  title: 'Transition & Fresh Cow Investigation — Commercial Dairy Practice',
  status: 'DRAFT',
  demo: true,
  notice: 'DEMO CONTENT — NOT YET APPROVED FOR PRODUCTION ASSESSMENT',
  validationNotice: 'PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION',
  author:
    'AI-assisted proposal; accountable professional author must be appointed',
  reviewer: null,
  reviewDate: null,
  effectiveDate: null,
  sourceReferences: [],
  sourceNotice:
    'Synthetic scenario; no veterinary standard, treatment protocol or external reference approval is claimed.',
  scenario:
    'A commercial dairy farm in Nigeria reports falling milk output, reduced feed intake, more fresh-cow illness and delayed reproductive recovery. Farm workers describe inconsistent transition-group feeding and water interruptions during hot weather. Records are incomplete and cow-level findings have not been clinically confirmed. Mixed breeds, variable forage supplies and limited laboratory access may affect interpretation. These reports establish neither a diagnosis nor causation. Investigate individual animals and herd patterns separately, distinguish reported from measured facts, and describe safe escalation within authorized professional scope. DEMO records (fictional, not benchmarks): reporting week A lists 70 lactating cows and 1,400 litres/day total milk; week B lists 72 lactating cows and 1,150 litres/day. Staff report more fresh-cow illness but recorded no consistent case definition or denominator. Intake is described as lower but no dry-matter measurements are available; water interruption times and weather measurements are missing. Explain which calculations are defensible and which comparisons require further evidence. Do not infer a diagnosis, prescribe a treatment protocol or recommend a feed product solely from this narrative.',
  steps: [
    {
      code: 'PROBLEM_RECOGNITION',
      type: 'CASE',
      title: 'Problem recognition',
      suggestedChildCode: 'DAIRY_INTEGRATED',
      dimensions: [
        'CLINICAL_KNOWLEDGE',
        'HERD_HEALTH_REASONING',
        'RISK_IDENTIFICATION',
      ],
      prompt:
        'Separate individual-animal clinical concerns from herd-level performance patterns. What is reported, what is confirmed, what is uncertain, and which welfare or safety concerns require urgent professional escalation?',
    },
    {
      code: 'INFORMATION_GATHERING',
      type: 'CASE',
      title: 'Information gathering',
      suggestedChildCode: 'NEEDS_INTERVIEW',
      dimensions: ['INVESTIGATION_QUALITY', 'COMMUNICATION'],
      prompt:
        'What additional cow, herd, calving, feeding, water, environmental and reproductive records would you request? Interview management and workers without assuming a cause. Preserve original data and explain what missing or inconsistent records prevent you from concluding.',
    },
    {
      code: 'DIFFERENTIAL_ASSESSMENT',
      type: 'CASE',
      title: 'Differential assessment',
      suggestedChildCode: 'DAIRY_FRESH_REASON',
      dimensions: [
        'CLINICAL_KNOWLEDGE',
        'CLINICAL_REASONING',
        'NUTRITIONAL_REASONING',
        'RISK_IDENTIFICATION',
      ],
      prompt:
        'Describe competing clinical, nutritional and management explanations for the reported findings. Explain why hypocalcaemia, ketosis, displaced-abomasum risk and retained placenta/metritis might warrant investigation without asserting they are present. Identify confounding factors and referral boundaries.',
    },
    {
      code: 'EVIDENCE_INTERPRETATION',
      type: 'CASE',
      title: 'Evidence interpretation',
      suggestedChildCode: 'DAIRY_KPI',
      dimensions: [
        'DATA_INTERPRETATION',
        'HERD_HEALTH_REASONING',
        'NUTRITIONAL_REASONING',
      ],
      prompt:
        'Explain which evidence would support or weaken each hypothesis. Specify denominators, time periods, units and comparability when interpreting milk, intake and fresh-cow records. Discuss breed, lactation stage, missing data and association versus causation. No numerical diagnostic threshold is supplied.',
    },
    {
      code: 'INVESTIGATION_PLAN',
      type: 'CASE',
      title: 'Investigation plan',
      suggestedChildCode: 'DAIRY_TRANSITION_AUDIT',
      dimensions: [
        'INVESTIGATION_QUALITY',
        'CLINICAL_REASONING',
        'PROFESSIONAL_JUDGMENT',
      ],
      prompt:
        'Plan a review of far-off, close-up, calving and fresh-cow management, alongside appropriate individual-animal clinical assessment. What should be observed, measured, examined, sampled or checked? Separate an ideal investigation from justified resource-aware alternatives without lowering safety standards.',
    },
    {
      code: 'INTERVENTION',
      type: 'CASE',
      title: 'Intervention planning',
      suggestedChildCode: 'DAIRY_FRESH_REASON',
      dimensions: [
        'INTERVENTION_PLANNING',
        'PROFESSIONAL_JUDGMENT',
        'ECONOMIC_AWARENESS',
      ],
      prompt:
        'Prioritize immediate safety/escalation steps and conditional longer-term actions. State what evidence and professional authorization each action requires. Compare likely costs, feasibility and uncertainty. Do not invent clinical protocols, doses, nutrient targets or guaranteed outcomes.',
    },
    {
      code: 'HERD_PREVENTION',
      type: 'CASE',
      title: 'Herd-level prevention',
      suggestedChildCode: 'DAIRY_HERD_PLAN',
      dimensions: [
        'PREVENTIVE_THINKING',
        'HERD_HEALTH_REASONING',
        'NUTRITIONAL_REASONING',
      ],
      prompt:
        'Propose conditional herd-level management reviews for transition grouping, feed access, forage/TMR consistency, water, heat exposure, preventive health and staff routines. Explain what evidence must be obtained before adopting a change and how responsibilities would be agreed.',
    },
    {
      code: 'MONITORING',
      type: 'CASE',
      title: 'Monitoring plan',
      suggestedChildCode: 'DAIRY_KPI',
      dimensions: ['DATA_INTERPRETATION', 'DOCUMENTATION'],
      prompt:
        'Design a monitoring record using relevant milk, intake, fresh-cow health, body-condition, fertility and environmental indicators. Define each indicator, denominator, units, collection method and data-quality limitations. Explain how an authorized expert would agree context-specific targets; do not supply invented cut-offs.',
    },
    {
      code: 'OUTCOME_EVALUATION',
      type: 'CASE',
      title: 'Outcome evaluation',
      suggestedChildCode: 'DAIRY_ECONOMICS',
      dimensions: [
        'DATA_INTERPRETATION',
        'ECONOMIC_AWARENESS',
        'PROFESSIONAL_JUDGMENT',
      ],
      prompt:
        'How would you determine whether an intervention worked? Explain baseline comparability, concurrent changes, confounding, costs, unintended effects and uncertainty. Identify when you would revise the investigation, escalate or stop an unsupported recommendation.',
    },
    {
      code: 'COMMUNICATION',
      type: 'REPORT',
      title: 'Professional farm report and briefing',
      suggestedChildCode: 'REPORT_PRODUCE',
      dimensions: ['COMMUNICATION', 'DOCUMENTATION', 'PROFESSIONAL_JUDGMENT'],
      prompt:
        'Write a concise management report separating findings, hypotheses, limitations, prioritized conditional actions, responsibilities and monitoring. Adapt a briefing for farm workers, check understanding, protect confidentiality and explain what remains unverified.',
    },
  ],
} as const;
