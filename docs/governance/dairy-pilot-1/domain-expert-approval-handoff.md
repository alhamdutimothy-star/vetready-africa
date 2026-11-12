# Commercial Dairy Pilot — Domain Expert Approval Handoff Specification

Status: proposed offline procedure for review. This document and rehearsal confer no professional approval, Field Ready or Job Ready status, employer eligibility or disclosure permission. They provision no assessor and activate no live assessment.

## Bind the decision to the reviewed material

Run the existing [Draft Verification Review Report](draft-verification-review-report.md) against the exact draft under review. Preserve the original input and report in the future approved records location. Record the draft ID and version, source digest from the report, report CLI Git revision, architecture and framework versions, and review timestamp. A report fingerprint can help reconcile a reference with the source. It does not establish that the referenced decision exists or was authorised.

Identify the decision type and exact subject. Pin the pathway version, each mapped competency child version, scope ID and version, parent scope where applicable, rubric and criterion versions, policy version, and the mapping and its provenance. A narrower scope is a separate decision. A default R01–R11 gate decision must account for every required component and exact child/rubric pair in that gate. A decision about one pair cannot stand for the rest. Compare the exact reviewed content before any future handoff. Any changed material needs a fresh report and review for the affected decision.

## Minimum future decision record

| Field                  | Required record                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision identity      | Stable decision ID and version, recorded time, decision time and any separately approved effective date.                                                                                                                                                                              |
| Subject and scope      | Decision type, exact reviewed material and references above, boundaries and limitations, and whether the decision covers a narrow scope or a complete gate.                                                                                                                           |
| Reviewer and authority | Accountable reviewer identity, authority source and record reference, permitted decision type and scope, and any validity or restrictions. A system role or a self-declared credential is insufficient.                                                                               |
| Independent check      | Checker identity, authority, check time, sources consulted, exact version and scope checked, and outcome. Check the authoritative source for identity, scope, validity, withdrawal and conflict handling. Record why the evidence supports the check or why it could not be verified. |
| Outcome and reasons    | Explicit outcome, rationale, provenance for sources and references, and each unresolved item with its affected scope. Use **DOMAIN-EXPERT STANDARD REQUIRED** for outstanding professional decisions. Silence or a complete structural report cannot be taken as assent.              |
| Conflict handling      | Record the declaration, any conflict, recusal or reassignment, the authorised resolution and its rationale. An unresolved conflict blocks the affected handoff.                                                                                                                       |
| History                | Link any predecessor and the reason for correction, withdrawal or supersession. Keep the original decision and review material available. Record who acted, when and under what authority. Recheck the current controlling decision and authority before handoff.                     |

## Keep the decisions separate

| Decision                       | What it covers                                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Professional standard approval | Acceptance of specific professional content and its applicability.                                                                                       |
| Rubric or requirement approval | Acceptance of the exact operational rubric or requirement version for the stated scope.                                                                  |
| Assessor authorisation         | Permission for an eligible person to act within an exact approved scope.                                                                                 |
| Candidate assessment           | A candidate's assessed knowledge or case performance under the applicable version.                                                                       |
| Practical verification         | A separate Level C decision on directly observed practical evidence through the existing authority chain.                                                |
| Readiness determination        | A separate decision under approved rules. Default Field-Ready requires all R01–R11 full gates with effective Level C and applicable safety requirements. |
| Employer disclosure            | A separate decision under approved wording, access and consent policy.                                                                                   |

None automatically confers another. A future eligible handoff goes to the existing trusted operator and `verification:govern` process described in [ADR 0011](../../adr/0011-governance-gated-verification.md). This specification adds no approval system, authority or provisioning action.

## Stop conditions

Withhold the affected handoff if any applicable **DOMAIN-EXPERT STANDARD REQUIRED** item remains, reviewer or checker authority cannot be verified, or a conflict has no authorised resolution. Also stop for a version or digest mismatch, changed reviewed material, incomplete scope, an attempt to use narrow approval for a full gate, or missing provenance or required references. A withdrawn or superseded decision cannot be relied on as the current decision. Record the blocker and keep the original records. Resolve the issue through a linked, independently checked decision where required. Re-running the report alone cannot remove a governance blocker.

## Synthetic rehearsal

Use the synthetic unresolved fixture from the existing report tests as a temporary local JSON input. Run the committed CLI with `node --import tsx scripts/review-dairy-verification-configuration.ts <local-draft.json>`. The following is a rehearsal of the review steps, with no real names or authority.

| Step                        | Rehearsal                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft Review Report         | Synthetic draft `pilot` version 1 returns `DRAFT_WITH_UNRESOLVED_STANDARDS`. Record its emitted source digest and report revision `23a83587d03990bc3a99997bc62ff3de93a61af2`. Trace `R07@1` to `rubric-R07@1` and `policy@1`. Exact pathway and competency mappings and criteria remain **DOMAIN-EXPERT STANDARD REQUIRED**. |
| Expert Decision             | Synthetic reviewer A records a deferred decision on the R07 first-line scope. The record identifies the missing exact mappings and criteria, refers back to the same report and grants no approval. A proposed narrower task would require its own predefined scope and exact references.                                    |
| Independent Authority Check | Synthetic checker B compares the draft identity and digest with the report and records that no authoritative reviewer appointment was supplied. The authority check remains unverified.                                                                                                                                      |
| Handoff Eligibility         | **BLOCKED** for unresolved mappings and criteria and unverifiable authority. A different digest, a different rubric version, an unresolved conflict or an attempt to substitute a narrow decision for the full gate would independently block the handoff. Nothing is sent for provisioning.                                 |

## DOMAIN-EXPERT STANDARD REQUIRED

- Exact pathway and child version mappings, full and narrow scope boundaries, R07 first-line clinical limits, R11 methods and permitted procedures.
- Applicable standards, rubric criteria, evidence requirements, observation routes, counts, diversity, timing, combination, assistance, provenance, sufficiency and currency.
- Who may approve each decision type, the authoritative sources and independent check process, conflict resolution, correction, withdrawal and supersession.
- Assessor eligibility and exact authorisation, calibration, independence, moderation, safety criteria, intervention, reassessment and restoration.
- Applicable Nigerian professional requirements, scoring or readiness criteria, candidate wording, and employer disclosure wording and policy.
