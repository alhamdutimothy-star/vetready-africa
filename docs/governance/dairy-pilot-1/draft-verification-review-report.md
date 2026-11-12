# Commercial Dairy Pilot draft verification review report

Build the foundation packages with `npm run build:foundation`, then run:

```text
node --import tsx scripts/review-dairy-verification-configuration.ts ./synthetic-draft.json
```

Supply exactly one local JSON file. Use synthetic, non-sensitive data, including non-sensitive identifiers. The tool writes deterministic JSON to standard output and does not connect to a database, resolve an external reference or change the draft.

| Result                                           | Exit code | Meaning                                                                   |
| ------------------------------------------------ | --------- | ------------------------------------------------------------------------- |
| `LOCAL_FILE_REQUIRED` or `UNREADABLE_LOCAL_FILE` | 2         | The input was not supplied as a readable local file.                      |
| `MALFORMED_JSON` or `INVALID`                    | 1         | JSON parsing or the committed configuration validator rejected the input. |
| `DRAFT_WITH_UNRESOLVED_STANDARDS`                | 0         | The draft is structurally valid and has explicit unresolved fields.       |
| `STRUCTURALLY_COMPLETE_DRAFT`                    | 0         | The validator found no structural errors or unresolved markers.           |

Neither draft result confers professional approval, publication authority, Field Ready or Job Ready status, employer eligibility or disclosure authority. The report preserves exact typed identifiers and versions, including pathway and child mappings, and separates each default scope from narrower scopes. A source digest identifies the reviewed UTF-8 text. External decision references are marked **REQUIRES VERIFICATION** and represented by their paths and SHA-256 fingerprints of the schema-normalised references. Reviewers can reconcile them locally with the original draft. The report omits reference text, narratives, raw rejected values and input filenames. Fingerprints are for reconciliation, not anonymisation. Identifiers are shown as supplied, so do not use credentials or protected information in identifiers.

## DOMAIN-EXPERT STANDARD REQUIRED

The report lists every unresolved path identified by the validator. Review remains open for:

- Exact pathway and child versions, clinical boundaries, procedural permissions, scope and claim wording, rubric criteria, evidence requirements and safety-critical designations.
- Permitted direct observation routes, counts, contexts and diversity, timing and combination, assistance limits, provenance, sufficiency, decision criteria and currency.
- Assessor eligibility and exact authorisation, calibration references and reference examples, periodic review, independence and moderation.
- Safety criteria, intervention and review, reassessment and restoration.
- Locally applicable professional requirements and disclosure policy.

The R07 first-line reproductive boundary and separate R11 components remain as defined by the committed configuration. Knowledge and case assessment cannot supply Level C evidence. Nothing in this report changes existing verification, readiness, Passport or recruitment decisions.
