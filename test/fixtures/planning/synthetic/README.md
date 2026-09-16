# Synthetic `.planning/` fixtures

Hand-written, deliberately small. The 1.14 trees next door are real captures;
these exist only to reach the branches a real project does not happen to have.
Each is a project **root** containing `.planning/`.

| dir | what it pins down |
|---|---|
| `paused/` | `.planning/phases/NN-slug/.continue-here.md` pause marker → `paused` + `gsd_status = paused` |
| `blocked/` | `## Blockers` h2 (GSD-faithful) + `Status: blocked` token → current phase `blocked`; `- None yet` placeholder is dropped. The `### Blockers/Concerns` counterpart (advisory `concerns`, never blocking) is exercised by the three real 1.14 fixtures. |
| `locked-stale/` | all three locks held (`STATE.md.lock`, `.lock`, `milestone.lock`) → `health: locked` with the previous snapshot preserved |
| `parse-error/` | frontmatter fence opened and never closed → `health: parse_error`, body still parsed |
| `uat-fail/` | `01-UAT.md` `status: failed` + VERIFICATION `status: gaps_found` → `uat: fail`, phase `verifying` |
| `uat-pass/` | `01-UAT.md` `result: pass` + VERIFICATION `status: passed` → `uat: pass`, phase `complete` |
| `state-json-fresh/` | `.planning/state.json` newer than STATE.md → milestone + phase-status + `next` overlay applies |
| `state-json-stale/` | identical tree, `updated_at` far in the past → overlay ignored, diagnostic emitted |
| `decimal-phase/` | `2.1-hotfix` decimal phase kept as a **string**; sentinels (`0`, `999.1`) and a non-numeric dir excluded; `## Phases` checkbox fallback when there is no Progress table |
| `nested-plans/` | plans in a nested `plans/` subdir plus a bare `PLAN.md` (#3139); Progress table with an extra `Milestone` column (header superset); `HANDOFF.json` pause marker |

`state-json-fresh` / `state-json-stale` are copied to a temp dir by the tests,
which then set explicit mtimes — git does not preserve them.
