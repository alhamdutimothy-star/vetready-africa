# Product definition and critical analysis

## Problem and vision

Employers lack reliable evidence that newly qualified veterinarians can perform commercial livestock work. Candidates lack clear, affordable routes from academic knowledge to industry skills. VetReady Africa will provide an auditable development record and consent-controlled recruitment pipeline, rather than equating course attendance with qualification.

Success means an employer can understand what a candidate was assessed on, by whom, when, with what evidence, and with what limitations. The platform provides assessed development records; it does not replace professional registration or authorize veterinary practice.

## Target users and personas

- Candidate: a recent graduate in Kaduna using an Android phone and intermittent data, seeking dairy work and affordable supervised practice.
- Employer: a verified farm manager hiring in Kano who needs herd records, field observation, farmer communication, and production troubleshooting.
- Technical-sales candidate/employer: a veterinarian and pharmaceutical company needing ethical product presentation, stewardship, territory planning, and customer support.
- Trainer/mentor: an experienced professional developing learning materials and feedback, without automatic authority to certify.
- Assessor: a qualified practitioner conducting observed tasks against an approved rubric.
- Administrator: operations staff managing cohorts, employer legitimacy, quality, disputes, and placements.
- Super administrator: system custodian managing privileged access and configuration.

## Weaknesses and improvements

1. **Evidence supply is the bottleneck.** Software cannot create trusted farm placements or qualified assessors. Recruit partner farms and assessor capacity before enrolling a large cohort; budget travel, supervision, animal welfare, and candidate safety.
2. **A universal employability ranking is misleading.** Use role-specific, versioned scores with coverage, mandatory gates, and expiry. Avoid a public leaderboard and unsupported precision.
3. **Standards are not yet validated.** A veterinary review group must approve competency definitions, critical errors, rubrics, thresholds, assessor qualifications, reassessment rules, and local applicability. Label all initial content as draft.
4. **Assessor reliability needs governance.** Require calibration, conflict declarations, random double marking, variance review, moderation, appeals, and an evidence trail. Trainers should not be the sole verifier of their own learners for high-stakes decisions.
5. **Evidence integrity is missing from a conventional LMS.** Record provenance, rubric version, observed context, identity confidence, file hashes, and verification/revocation events. A video upload alone is not proof of independent performance.
6. **Baseline is diagnostic, not credentialing.** Preserve self-report, diagnostic result, assessed skill, and verified skill as distinct evidence types.
7. **Employer trust requires employer verification.** Review organizations and vacancies, prevent fraudulent recruitment fees, and restrict scraping and misuse of candidate records.
8. **Access and affordability affect fairness.** Explain fees, provide realistic placement options, and track unequal access to training/assessment. Do not rank by school prestige, age, sex, ethnicity, disability, or ability to pay.
9. **Medical and farm safety need controls.** Practical tasks require informed site permission, supervision, biosecurity, PPE, safe handling, lawful scope of practice, and incident reporting. Do not prescribe platform-generated treatment protocols.
10. **Post-placement quality needs measurement.** Collect structured feedback with candidate response and moderation. Track retention and suitability without making unverified employer allegations public or automatically lowering competence.

## MVP recommendation

Pilot four pathways: Commercial Dairy Practice, Veterinary Pharmaceutical Technical Sales, Poultry Farm Management, and Premix & Feed Additives Technical Sales. Confirm partner access before launch. Seed only the four approved pilot tracks as configurable data; future tracks can be added through the same model without implementation now.

Include the fourteen proposed MVP items, with narrow implementations:

- Authentication and scoped roles; candidate and verified employer onboarding.
- Candidate profile, qualifications, registration declaration/review, experience, pathway preferences, and availability.
- Versioned competencies, baseline diagnostics, a development plan, and a small curated learning catalog.
- Quizzes, a realistic case/report submission, and observed practical assessment with an assessor queue.
- Competency dashboard and private Skills Passport with explicit, revocable, limited sharing.
- Vacancy authoring, competency requirements, structured candidate search, explained matching, applications, and shortlists.
- Administrator operations dashboard with actionable queues and basic aggregate metrics.

**Add to MVP:** human verification and moderation, assessor calibration, appeals, consent and revocation, audit events, organization verification, and a manually recorded placement outcome. These are necessary to prove trust rather than optional administration.

A public certificate-verification endpoint may be included only after the pilot framework is approved. It should expose minimal status and credential facts, never the full passport. Learning-completion acknowledgements must be visibly different from competency credentials.

## Not in Version 1

Payments; subscriptions; AI assessment or matching; general-purpose course marketplace; eight fully populated tracks; public candidate rankings; native Android/iOS apps; full offline assessment; automated interview scheduling; mentor marketplace; automated pharmacovigilance operations; advanced HR integrations; multi-country regulatory rules; non-veterinary professions; predictive workforce analytics; employer-feedback scoring; automated registration verification unless an authorized reliable integration exists.

Mentorship begins as staff-supported assignment and feedback, not a marketplace. Interviews begin as invitations with manually recorded outcomes. Placement feedback begins as reviewed records, not automatic reputation changes.

## Primary workflows

1. Candidate consents, creates a private profile, selects a pathway, and declares qualification/registration status.
2. Diagnostic assessment identifies gaps; a rule-based plan assigns reviewed learning and assessment activities.
3. Candidate learns, submits a case and evidence, and books an observed task through staff.
4. Assessor evaluates against a frozen rubric; moderator handles flagged decisions; verified evidence updates competency records and role readiness.
5. Candidate opts into discovery or grants a limited passport share. A verified employer posts a vacancy with published requirements.
6. Search and matching reveal eligible candidates, evidence strengths, unmet requirements, and missing evidence. Candidate applies or consents to contact exchange.
7. Staff records placement, gathers reviewed feedback, and handles appeals without silently overwriting assessment history.

## Requirements

Functional: the workflows above; configurable content and pathway mapping; evidence-linked decisions; candidate export/deletion requests; notification inbox; administrative review queues; expiry/revocation; accessible audit history for authorized reviewers.

Non-functional pilot targets (to confirm): WCAG 2.2 AA; Android Chrome support; useful core screens on a 360px viewport; no autoplay media; initial application transfer target under 300 KB compressed excluding optional media; save progress under interrupted connectivity; p95 ordinary API responses under 750 ms at a provisional 100 concurrent active users; monthly availability target 99.5%; recovery point 24 hours and recovery time 8 hours. Validate these on measured infrastructure rather than treating them as established guarantees.

## Metrics and launch criteria

Measure verified competencies earned, assessment pass/appeal rates, inter-rater agreement, evidence coverage, time to reviewed result, time to shortlist, placement retention at 90 days, candidate/employer satisfaction, and cost per assessed candidate. Define denominators and exclusions. Training completion alone is not the success metric.

Launch requires approved rubrics, calibrated assessors, verified pilot employers, lawful data handling, tested access controls, a tested restore, and a full candidate-to-placement demonstration. Placement retention is a later outcome, not a prerequisite that can be established before launch.

## Assumptions requiring founder confirmation

- Initial operating jurisdiction is Nigeria; West Africa expansion follows a country-specific review.
- The first cohort is approximately 50–100 adults; minors are excluded initially.
- Dairy practice, pharmaceutical technical sales, poultry farm management and premix/feed-additives technical sales are the pilot tracks; partner farms and assessors are available.
- Students may learn and be assessed on supervised tasks but cannot be presented as independently licensed practitioners.
- A qualified veterinary review group owns standards; the platform does not claim VCN accreditation without authorization.
- English is the initial interface language; farmer-facing communication can be assessed in relevant languages by qualified assessors.
- Candidates remain private by default; discovery and contact disclosure require separate permission.
- Fees and payments are postponed; funded pilot operations and assessor compensation need a business decision.
- Self-declared experience is distinguishable from verified experience; registration checks initially involve authorized manual review.
- An operator, complaints owner, privacy lead, assessor coordinator, and incident contact will be appointed.
- Hosting region, cross-border transfer arrangements, budget, and recovery objectives require confirmation.
- Final retention periods, appeal windows, credential expiry, and job-readiness gates require professional/legal approval.
- No automated AI decision affects certification, access to work, or candidate ranking in Version 1.
- Employer feedback remains private and reviewed, with candidate response and appeal.

## Risks

Trust failure from inconsistent assessors; insufficient practical access; inflated credential claims; fraudulent employers; data disclosure; bias caused by missing evidence; clinical harm; expensive media and hosting; unsafe placements; and operational workload. Reduce these with a narrow cohort, explicit evidence states, quality review, privacy controls, safe-task protocols, and defined service ownership.

## Approved refinement and Phase 1 scope

The founder approved four initial tracks and a pathway-agnostic core + pathway + role-specific framework. One candidate can pursue multiple tracks without duplicated shared competency records. Premix/feed-additives sales is distinct from pharmaceutical sales, and poultry management includes production, nutrition, people and finance rather than disease alone. The complete eventual MVP now includes 23 capabilities in the founder brief, including opportunity-readiness gaps; Phase 1 implements only identity/RBAC, core profile/catalog/evidence models and operational foundations.

Readiness-gap foundation will link permitted candidate evidence to each vacancy requirement and map unmet requirements to reviewed training/assessment activities. Unknown evidence is not asserted incompetence; recommendations remain candidate-visible and explainable. Vacancy/search/scoring execution is future work.

Auth0 is the recommended pilot provider following clarification that no existing OIDC tenant is available. Professional taxonomy is awaiting founder/expert validation; see COMPETENCY_TAXONOMY.md.
