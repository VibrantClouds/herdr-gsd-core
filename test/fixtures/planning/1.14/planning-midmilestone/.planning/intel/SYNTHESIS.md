# Synthesis Summary — Character Dossier

Mode: `new` (net-new bootstrap, no existing `.planning/` context to reconcile against).

## Doc counts by type

| Type | Count |
|---|---|
| ADR | 16 (all `status: Accepted`, all `locked: true`) |
| PRD | 1 |
| SPEC | 12 |
| DOC | 1 (`docs/README.md`) |
| **Total** | **30** |

`docs/prototype/character-dossier.html` was not ingested (not Markdown); it is referenced by ADR-0001, ADR-0015 and SPEC-design-system as a known external artifact (the seed for the Intimacy Dossier type and the design system), not a missing doc.

## Decisions locked

16 of 16 ADRs locked, all `Accepted`. Sources: `docs/adr/0001-code-defined-subdocument-templates.md` through `docs/adr/0016-angular-signals-no-ui-framework.md`. Full detail in `decisions.md`. No LOCKED-vs-LOCKED contradictions.

## Requirements extracted

50 v1 requirements across 12 groups (CHAR ×7, INTM ×5, GALL ×4, SHARE ×11, IMG ×3, GATE ×2, PRINT ×2, SCHM ×3, SEC ×4, OPS ×3, DSGN ×4, PLUG ×2) plus 9 deferred v2 requirements (REL ×2, STAT, HIST, SYNC, CUST, FREE, THMB, GC). ENC-01 (client-side encryption) was rejected by the user during ingest and is Out of Scope, not v2. All from the single PRD, `docs/prd/PRD-character-dossier.md`. No competing acceptance variants (single PRD in ingest set). Full detail in `requirements.md`. Note: this PRD uses a checkbox-list format without a discrete "acceptance criteria" subsection per requirement — `acceptance:` is marked absent throughout rather than inferred from the description text.

## Constraints

12 SPEC documents synthesized, one entry each (each SPEC is a cohesive constraint document; further decomposition into atomic constraints is left to the roadmapper/phase-planning stage, which can pull specific rules from the `content:` blocks as needed). Type breakdown: schema ×4 (domain-model, intimacy-dossier, gallery-and-portrait, storage-s3), protocol ×4 (subdocument-plugin-contract, image-pipeline, frontend-architecture, serialization-policy), api-contract ×1 (share-api), nfr ×3 (design-system, security-and-abuse, deployment). Full detail in `constraints.md`.

## Context topics

5 topics extracted from the single DOC (`docs/README.md`): repository purpose/structure, document taxonomy, reading order, cross-cutting invariants (restates ADR content, no independent claims), and the reference project (Size✦Lab). Full detail in `context.md`.

## Conflicts

- **0 blockers**
- **0 competing-variants (warnings)**
- **3 auto-resolved/informational (info)**: a judgment call on the dense but non-circular cross-reference graph, a note on the README's self-referential expectation not being used as a substitute for independent checking, and a summary confirmation of cross-document consistency.

Full detail: `../INGEST-CONFLICTS.md`

## Per-type intel files

- `decisions.md` — 16 ADR entries
- `requirements.md` — 59 requirement entries (50 v1 + 9 v2)
- `constraints.md` — 12 SPEC entries
- `context.md` — 5 topic entries from README.md

## Status

READY — safe to route. No blockers, no unresolved competing variants.
