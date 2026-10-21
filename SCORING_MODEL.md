# Explainable scoring and matching

## Phase 3B — participation summaries only

Course/module completion derives from completed lesson rows for the exact snapshot. Counts and timestamps describe participation, not mastery or employability. There is no training-to-evidence/verification write path and no score, pass mark, weight, readiness threshold or professional gate added. Existing Phase 2 assessment scoring and Phase 3A evidence safeguards remain authoritative and unchanged.

## Phase 3A boundary — no new score

**IMPLEMENTED:** Source integrity and lifecycle controls only. No scoring algorithm, readiness percentage, professional threshold or practical verification gate is added or activated. External receipt labels and draft targets are never competency awards; unverified/demo receipts cannot satisfy existing verified-evidence gaps. Numerical examples elsewhere in this document remain **PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION**, not seeded policy. See [Verification model](VERIFICATION_MODEL.md).

All numerical examples below are proposed software policies, **not validated veterinary standards**. The approved policy must be versioned and frozen for each calculation. Scores describe evidence against a role specification, not inherent professional worth.

## Competency and employability score

Rubric items have published weights summing to 1. Score = 100 × sum(weight × earned_points / maximum_points). Reject invalid weights, nonpositive maxima, impossible points and missing required items; never silently normalize malformed configuration. Critical safety failures independently block passing.

Each domain uses approved competency weights. Only current verified eligible outcomes contribute to the verified score; diagnostic and self-reported results are displayed separately. The aggregation policy specifies accepted method, level, expiry and which accepted attempt supersedes earlier evidence. Do not cherry-pick highest attempts; default to the latest verified valid attempt for the same scope, with outstanding adverse safety decisions triggering review.

Role score = sum(role_domain_weight × domain_score). Unknown required domains produce an **incomplete** score; display evidence coverage and known-domain subscores, not a final employability percentage. Any provisional planning estimate must be clearly labeled and excluded from employer ranking.

Illustrative dairy weights: technical knowledge .15, practical competence .25, clinical reasoning .20, communication .10, data/digital .10, commercial awareness .05, professionalism .10, verified experience .05. Scores [80,90,85,70,80,60,90,50] give **81.0/100**. A practical gate failure still means not field-ready.

Illustrative sales weights: technical knowledge .15, practical/product demonstration .10, reasoning .10, communication .20, data/digital .10, commercial/sales .20, professionalism .10, verified experience .05. Avoid double-counting the same behavior across domains. Practical verification is an evidence eligibility gate, not an extra bonus counted again.

## Candidate–job fit

1. Enforce privacy and verified employer access before computing or exposing a match.
2. Evaluate hard requirements: lawful professional status where needed, required competencies/levels, required certifications, availability, location/relocation, and driving when genuinely essential.
3. Return eligibility as ELIGIBLE, INELIGIBLE or NEEDS_REVIEW. Unknown hard requirements produce NEEDS_REVIEW; mandatory failures cannot be offset by attractive optional skills.
4. Compute a transparent weighted soft fit for eligible candidates using the published vacancy policy.

Example soft weights: verified competency fit .60, verified relevant experience .15, pathway alignment .10, geography/relocation .10, availability .05. Component values [90,80,100,100,100] give **91%**.

Competency fit is the weighted proportion of role requirements met, using explicit level/method rules. Extra experience is capped at the published target, avoiding an unlimited advantage for age/seniority. Geography measures candidate-stated compatibility, not distance or ethnicity. Unknown soft data yields a fit interval: lower bound assumes 0, upper bound assumes 100 for unknown weight; label incomplete and do not rank it as a precise score. Hard and soft uses of a requirement must be explicit.

Return component values, weights, eligible evidence IDs/versions, coverage, unmet gates, missing data, strengths, development gaps, and policy version. Example: verified dairy reasoning and data competence; compatible with Kano through stated relocation; sales task unassessed. Do not fabricate confidence or transform job fit into a probability of job success.

Store match snapshots with calculation time and input version references. Recompute when requirements, consent, evidence validity or availability changes. Historical snapshots are for audit and must not bypass current consent checks. Candidate can contest incorrect evidence and inspect matching explanations.

## Deterministic acceptance cases to implement

| Case                                                 | Expected result                                                |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| Rubric weights .4/.6; items 8/10 and 9/10            | 86/100                                                         |
| Complete dairy example above                         | 81.0/100                                                       |
| Same candidate missing practical domain (.25)        | Incomplete; coverage 75%; no final verified role score         |
| Score above threshold with required practical FAIL   | Readiness blocked                                              |
| Expired or revoked required evidence                 | Gate unsatisfied; no certified readiness                       |
| Diagnostic 100, no verified evidence                 | No verified competence                                         |
| Complete job-fit example above                       | 91%, only if all hard gates pass                               |
| Required driving absent, other components 100        | INELIGIBLE                                                     |
| Required registration unknown                        | NEEDS_REVIEW, no eligible ranking                              |
| Unknown experience (.15), known contributions 79     | Fit interval 79–94%; incomplete                                |
| Consent revoked or employer unverified               | No candidate payload or match disclosure                       |
| Equal scores                                         | Stable ordering by documented neutral ID; no hidden attributes |
| Invalid weights, zero maxima, duplicate requirements | Validation error; no score                                     |

Round only at presentation (one decimal or whole percent); retain calculation precision. No public leaderboard. Employer feedback is excluded from V1 scoring. Monitor assessment access, coverage, outcome disparity and calibration before changing weights; policy changes require review and do not rewrite historical decisions.

## Phase 1 boundary

Professional scoring, readiness and matching are not implemented or populated. Mandatory-eligibility and Phase 2 objective/evidence-gap domain functions are tested. Numerical examples remain proposed test specifications, not validated professional thresholds or claims of candidate readiness.

## Phase 2 diagnostic outcomes

Implemented objective item outcomes are CORRECT/INCORRECT/REQUIRES_REVIEW. Human reviews preserve observations and comments per criterion, without professional numerical weights or pass marks. Gaps compare exact required evidence facets and expose source IDs, engine version and policy status. Missing evidence is UNVERIFIED. Knowledge cannot satisfy practical evidence; demo evidence is excluded entirely. No employability/readiness percentage is calculated. Approved numeric answer keys in isolated test fixtures verify software arithmetic, not veterinary standards.

## Phase 3C case dimensions

Thirteen qualitative rubric dimensions tag existing version-bound criteria. No case total, pass mark, weight, readiness percentage, practical gate or professional expiry is introduced. The owner-only provenance manifest describes existing evidence status and explicitly recorded validity; it performs no new verification. Nine readiness names remain reserved and inactive.

## Phase 3D qualitative review

Assessor drafts preserve nullable/unjudged criteria, comments and development decisions. Finalization requires a complete existing criterion set and feedback; it is not a pass mark or weighted score. DEMONSTRATED refers only to the submitted written response, while canonical evidence remains UNVERIFIED/DEMO. No professional threshold, target, dose, withdrawal rule, nutritional specification, expiry, certification or readiness percentage is activated. Text-length/revision bounds are technical transport/validation constraints only.
