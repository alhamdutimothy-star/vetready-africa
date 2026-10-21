# Phase 3 architecture and implementation boundary

## IMPLEMENTED: Phase 3B governed training

Migration 010 and training API/domain/contracts add immutable demo course snapshots, reusable competency/assessment references and candidate-owned, resumable learning participation. Production approval and competence awards remain disabled. The accepted Phase 3A checkpoint was `df6c0ca`; authentication and migrations 001–009 are protected. See [training model](../TRAINING_MODEL.md) and [ADR 0005](adr/0005-governed-training-and-progress.md). Phase 3C remains deferred.

## IMPLEMENTED: Phase 3A foundation

The implementation workspace was reconciled by fast-forward to `origin/feat/phase-3-training-verification` at `3cb5b3a3bcc46305be3193addf64056532a328d1`. The protected authentication tag is an ancestor. Cloud-only uncommitted source/documentation was preserved and verified outside the checkout before reconciliation; private configuration was not copied or overwritten. The reconciled clean baseline passed 134 tests, lint, formatting, strict typechecking and production/foundation builds before implementation.

Phase 3A adds migration 009, evidence/verification types, private contracts and an unbound storage port. No new controller, endpoint, UI, seed content, role grant or authentication behavior is introduced. See [Evidence model](../EVIDENCE_MODEL.md), [Verification model](../VERIFICATION_MODEL.md) and [ADR 0004](adr/0004-phase-three-evidence-and-verification.md).

Presentation → application/API → domain → persistence remains a modular monolith. The same exact child versions can be reused by Commercial Dairy Practice, Veterinary Pharmaceutical Technical Sales, Poultry Farm Management and Premix & Feed Additives Technical Sales. Nothing in shared code assumes poultry.

## Implementation status and proposed later milestones

| Milestone        | Direction                                                                           | Exit condition requiring later review                                                   |
| ---------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 3B (implemented) | Governed training structure and progress                                            | Course/lesson versions and resumable progress, never attendance-to-competence           |
| 3C               | Poultry layer-production investigation demo using Phase 2 assessment/rubric sources | Synthetic, clearly labeled, traceable observations without official claims              |
| 3D               | Private evidence submission/upload workflow                                         | Vendor, quarantine/scanning, authorization, farm confidentiality and retention approved |
| 3E               | Scoped assessor eligibility, review, moderation and appeals                         | Approved scopes/rubrics/policies, conflicts blocked, independent auditable decisions    |
| 3F               | Governed progression and private owner Passport                                     | Approved professional rules, current valid claims and explainable projection            |

The future vertical slice is training → governed case → submission → scoped review → canonical evidence → approved progression → legitimate claim → private Passport. No second LMS/case/evidence/readiness/audit authority is introduced.

## REQUIRES DOMAIN EXPERT VALIDATION

Professional definitions, rubric anchors, biological/nutritional/clinical standards, evidence applicability, assessor eligibility, pass marks, validity/expiry, critical gates and readiness policy remain unapproved. No successful demo implies JOB READY or FIELD READY. Use no unreviewed Drive material or unsupported reference claims.

## Deferred boundaries

No real uploads/public URLs, public Passport, employer matching, payment, AI competence decision, official award, signed credential or production professional content approval is enabled. Future consent-limited sharing must be scoped/revocable/audited. Nigerian privacy/professional review and storage processor/transfer decisions remain necessary before production evidence collection.

Stop after Phase 3B validation and owner review. Phase 3C is not started or implicitly authorized by this foundation.

## Phase 3C — dairy-first governed case overlay

See [DAIRY_CASE_MODEL.md](../DAIRY_CASE_MODEL.md) for the implementation boundary and coverage matrix. Existing assessment versions, rubric observations, evidence and RBAC are reused; migration 011 adds case-specific metadata and ordered stage/dimension links only. One synthetic Transition & Fresh Cow case blueprint is available for author inspection and explicit demonstration release. No professional case approval, practical verification, production readiness, public passport or employer matching is activated.

## Phase 3D functional dairy workflow

The [functional pilot model](../DAIRY_PILOT_MODEL.md) describes the dairy-only adapter, structured candidate reasoning, private review drafts and bound canonical finalization. Existing Phase 3C content/version identities and Phase 2 assessment/evidence remain the core. New professional content stays DRAFT and no readiness/certification workflow is activated. No later phase is authorized by this implementation.
