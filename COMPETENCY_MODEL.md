# Competency and assessment architecture

## Phase 3B — learning support is not demonstrated competence

Training maps many-to-many to existing exact group/child versions and pathway applicability. No taxonomy is duplicated. Completing a course/module/lesson writes learning progress only; it does not create knowledge/case/practical verification, readiness, official awards, certificates or Passport claims. Professional mappings/objectives remain **PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION**. See [training model](TRAINING_MODEL.md).

## Phase 3A implementation boundary

**IMPLEMENTED:** External submissions target exact reusable child versions and requested evidence facets through composite-FK-backed mappings. The 47 groups/69 children and four pathway seeds are unchanged. A requested practical facet is not a practical award. All new external receipts remain `UNVERIFIED`; existing gap semantics are unchanged.

**PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION:** Context equivalence, professional verification, assessor eligibility and progression rules. No weights, pass marks, expiry periods or readiness gates are activated. See [Evidence model](EVIDENCE_MODEL.md).

## Framework

Competency identity is stable; its definitions are immutable versions. A version includes code, title, category, description, knowledge outcomes, practical tasks, permitted assessment methods, level anchors, rubric, required evidence, critical-error rules, passing policy, reassessment/expiry policy and authoritative references with reviewer sign-off. Many pathways can reference the same competency with different required levels and weights.

Levels: Awareness, Foundation, Working Knowledge, Practically Competent, Advanced, Expert/Mentor. These are proposed descriptive levels, not statutory professional qualifications. A percentage alone must never infer the level: rubrics specify observable behavior and the assessment required for each level. Mentor status also requires approved experience and governance review.

Separate definition fields from candidate evidence: verification status and evidence belong to an outcome/evidence record, not to the general competency definition.

## Evidence chain

Training participation → assessment attempt → submitted/observed evidence → rubric results → assessor decision → moderation where needed → verification event → current candidate competency projection.

Sources: diagnostic, quiz, structured case/report, data exercise, observed practical task, verified experience. Each has a method, date, subject, provenance, scope, reviewer, context, rubric version, confidence limitations and expiry where relevant. Self-report remains visible as self-report and cannot satisfy a practical gate.

## Diagnostic and development plan

Baseline includes reviewed question sets and short tasks in clinical reasoning, production, dairy, poultry, nutrition, pharmacology, reproduction, epidemiology/biosecurity, data/Excel, communication, report writing, sales and commercial awareness. Deliver only relevant pilot sections initially. Missing sections are unassessed, not zero ability.

Map diagnostic outcomes to required pathway competencies and prerequisite lessons using rules. Candidates can see why each activity was assigned. Baseline scores identify learning needs and never grant certification.

## Case and practical assessment

Dairy pilot case: investigate a reported fall from 24 to 19 L/cow/day in 120 lactating cows, lower feed intake, fresh-cow metritis and high calving BCS. These observations support questions and differentials, not a confirmed diagnosis. The rubric evaluates problem identification, additional data requested, reasoning, differentials, nutrition/management risks, prioritization, safe escalation, monitoring KPIs, and a clear report. Expert reviewers must validate case data and marking anchors before use.

Sales pilot: present a reviewed product dossier, communicate limitations and stewardship, handle objections, prepare an ethical territory plan, and document an adverse-event escalation. Do not reward unsupported efficacy claims or unnecessary antimicrobial sales volume.

Observed task outcomes: PASS, NEEDS_IMPROVEMENT, FAIL. Structured rubric scores and narrative reasons accompany each decision. Assessors record supervision, farm context, identity check and evidence. A critical safety error may prevent passing even with a high mean; the approved rubric must define the error in advance.

Evidence files exclude identifiable farm workers and proprietary farm data unless permission and necessity are documented. Practical examination and invasive procedures are restricted to appropriately licensed/supervised participants.

## Assessment lifecycle

DRAFT → EXPERT REVIEWED → APPROVED → RETIRED for definitions. Publication freezes a version.
Attempt: CREATED → IN_PROGRESS → SUBMITTED → UNDER_REVIEW → DECIDED. Server controls time, eligibility, transitions and final submission. Answers are never returned in candidate-facing question payloads. Autosave is versioned; submit is idempotent.
Decision: PROVISIONAL → MODERATION_REQUIRED or VERIFIED → SUPERSEDED/REVOKED/EXPIRED. Candidate may appeal a decision; an independent reviewer records outcome and reasons. Appeals never destroy the original record.

Quiz scoring is deterministic under an explicit published marking rule. Case marking and practical sign-off are human-led; structured rubrics improve consistency. Assessors cannot review their own work, their own profile, or conflicted candidates; high-stakes credential issue requires a separate authorized approval.

## Readiness policy

The founder-approved catalog is NOT ASSESSED, FOUNDATION, DEVELOPING, KNOWLEDGE VERIFIED, CASE VERIFIED, PRACTICALLY VERIFIED, JOB READY, FIELD READY and ADVANCED. Store codes as configurable reference data and evaluate approved rules independently per pathway/role. Evidence verification facets are not a universal ordinal ladder; an assessed knowledge score does not replace case or practical evidence. FIELD READY must satisfy all approved practical gates. Thresholds, weights, required levels, expiry and gate requirements remain NULL pending review. Mentor is a role rather than a pilot readiness classification.

Phase 1 stores draft definitions, pathway interests and submitted evidence. Phase 2 adds diagnostic delivery and scoped review below; professional readiness is still not computed. [The four-pathway taxonomy](docs/COMPETENCY_TAXONOMY.md) is proposed for expert validation.

## Professional validation register

Before production, validate assessment thresholds and levels, clinical/production benchmarks, procedure permissions, assessor licensing and calibration, antimicrobial stewardship/product claims, local disease/biosecurity context, credential wording, appeal procedures and expiry rules. Candidate training must account for farm scale, season, heat stress, feed variability, water/power constraints, and regional disease context. References should be drawn from current VCN rules, Nigerian competent authorities, WOAH, FAO and appropriate peer-reviewed veterinary sources; applicability requires expert review, not an assumed universal standard.

## Phase 2 implemented hierarchy and evidence boundaries

The 47 groups and 69 proposed assessable children are now separate identities, with versioned child statements, proposed methods, context, standards-to-validate and criteria. Core and cross-track children reuse a single child version through many-to-many group links. Definitions live in database records/configuration, not in grading logic. Domains normalize pathway/group placement; role targets reuse child evidence.

Seeded definitions are **PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION**, with no mandatory flags, scores or thresholds. Gaps and development activities are derived from evidence facets and stored with an evaluation snapshot when a plan is saved. Existing group-level documents/self-declarations do not silently become child proof. See [Phase 2 report](docs/PHASE2_COMPLETION.md) for the online versus observed-evidence limits.
