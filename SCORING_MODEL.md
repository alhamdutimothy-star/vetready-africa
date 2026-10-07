# Explainable scoring and matching

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

Professional scoring, readiness and matching are not implemented or populated. Only the pure mandatory-eligibility foundation is tested. Numerical examples remain proposed test specifications, not validated professional thresholds or claims of candidate readiness.
