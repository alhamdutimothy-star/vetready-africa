# Verification model — Phase 3A

## IMPLEMENTED

The protected authentication baseline stays unchanged. Domain roles remain in PostgreSQL, not Auth0. Existing Phase 2 assessment verification keeps approved-content, independent assigned assessor, latest human review and independent moderation constraints.

New `assessor_profiles` and `assessor_scope_grants` are immutable **PROPOSED** records only. A self-proposed profile may describe exact pathway version, child version, assessment method and context. A scope child must belong to that pathway. These records grant no capability, eligibility, assignment or professional qualification. Their inserts are audited. No administrator or super-administrator role becomes a professional assessor automatically.

`scopeMatches` compares exact scope dimensions; it does not authorize review. `practicalVerificationBlockers` expresses future technical prerequisites and always includes `REVIEW_WORKFLOW_NOT_ENABLED` in 3A. It also rejects self-review and identifies missing capability, assignment, eligibility, conflict clearance, approved scope, rubric and policy version. Its inputs must eventually come from trusted persisted governance decisions, never client assertions. No public endpoint accepts them.

External receipts remain `UNVERIFIED` and cannot produce official competence claims. Existing gap/development logic is unchanged: missing evidence means unverified, knowledge does not imply practical verification, and demonstration content does not establish competence.

## PROPOSED — REQUIRES DOMAIN EXPERT VALIDATION

Future practical verification requires all of the following, with versioned policy and auditable decision provenance:

- Current platform capability and assignment to the exact submitted revision.
- Active professional eligibility and independently approved scope.
- Candidate/assessor separation, conflict clearance and any required independent moderation.
- Immutable rubric version/criteria, criterion-level observations and governed appeals/corrections.
- Approved evidence applicability, professional policy and source legitimacy.

Scope approval/revocation, calibration, qualification criteria, assignment services, review rubrics and external decisions will need later migrations. No qualification threshold, expiry period, pass mark, practical gate or readiness percentage is defined here. Profiles/proposals are append-only foundations, not a complete governance interface.

The future Skills Passport is a private owner-only projection of legitimate current claims. It is not an editable badge store. No passport projection, share grant, public claim, certificate signing, Open Badge or Verifiable Credential issuance is implemented in 3A. Stable UUID/version/source identifiers preserve future interoperability options without asserting standards compliance today.
