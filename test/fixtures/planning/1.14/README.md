# GSD-Core 1.14.0 `.planning/` fixtures

Captured 2026-09-15 from real GSD projects on the author's machine by the
**M0-G** verification spike (`docs/spikes/M0-G-gsd.md`). Every fixture is a
project **root** containing a `.planning/` tree, so it can be passed straight to
`gsd-tools --project-dir <fixture-root>` or to `packages/core`'s reader.

GSD version that produced these trees and the `expected/` outputs: **1.14.0**
(`gsd-tools runtime-identity`).

## Scenarios

| dir | source | STATE.md `status` | position | GSD `smart-entry` situation | GSD recommended next |
|---|---|---|---|---|---|
| `executing/` | ProjectManager | `executing` | Phase 02, "Plan: 2 of 18", 17/18 summaries | `executing` | `/gsd:progress --next` (alt `/gsd:execute-phase`) |
| `planning-midmilestone/` | CharacterDossier | `planning` | Phase 4 "Images", 3 phases complete, 21/21 plans done, `Resume file: .planning/phases/04-images/04-CONTEXT.md` | `planning` | `/gsd:progress --next` (alt `/gsd:plan-phase 4`) |
| `milestone-rollover/` | SizeComparisonSite | `planning` | Phase 7 of a **new** milestone v1.1; v1.0 archived under `.planning/milestones/` | `planning` | `/gsd:progress --next` (alt `/gsd:plan-phase 7`) |
| `empty/` | synthetic | *(no STATE.md)* | none | `needs-first-phase` | `/gsd:discuss-phase` |

Why these three: they are the three most structurally different real trees
available — one mid-execute, one between phases with a resume pointer, one just
after a milestone rollover (archived `milestones/`, a `quick/` dir, and a
`MILESTONES.md` + `RETROSPECTIVE.md` the others lack).

**No `paused` fixture exists.** No project on the capture machine had a pause
marker. Note that GSD 1.14 writes **`.continue-here.md`** (dot-prefixed) and it
normally lives in the *active phase directory*
(`.planning/phases/NN-slug/.continue-here.md`), not at `.planning/` root —
`.planning/.continue-here.md` is only used for research-shaped work. `/gsd-pause-work`
also writes `.planning/HANDOFF.json` (machine-readable). A `paused` fixture must
be synthesised; see the spike doc.

## `expected/`

Each fixture carries `expected/*.json`: the verbatim stdout of GSD's own CLI run
against **that fixture** (not against the source project), so a fallback parser
can be diffed against GSD's own truth.

| file | command |
|---|---|
| `state-get.json` | `gsd-tools state get --project-dir <fixture>` (`{"content": "<raw STATE.md>"}`) |
| `state-snapshot.json` | `gsd-tools state-snapshot --project-dir <fixture>` |
| `phases-list.json` | `gsd-tools phases list --project-dir <fixture>` |
| `progress.json` | `gsd-tools progress --project-dir <fixture>` |
| `smart-entry.json` | `gsd-tools smart-entry --json --project-dir <fixture>` |
| `runtime-identity.json` | `gsd-tools runtime-identity` |
| `state-get.err` | stderr, non-empty only for `empty/` (`Error: STATE.md not found`) |

**Not stable across environments** — do not assert on these keys inside
`smart-entry.json`: `git_dirty`, `git_unpushed`, `has_git`, `stale_activity`,
`state_commits_behind`, `state_commit_stale`. `smart-entry` reads the git state
of whatever repo encloses the fixture, which here is `gsd-core-herdr` itself.
`situation`, `recommended`, `actions[]`, `current_phase`, `total_phases`,
`status`, `paused`, `blockers` are deterministic from the tree.

## Capture rules applied

- Only `*.md` and `*.json` were copied. Nothing binary, no `graphs/`,
  no `.cache/` bodies.
- Inside `graphs/ codebase/ research/ intel/ ui-reviews/ milestones/` and any
  `.cache/`, files larger than 20 KiB were **skipped entirely**.
- Every remaining file larger than 20 KiB was **truncated** to its first 20 KiB
  with a trailing `<!-- FIXTURE TRUNCATED at 20 KiB ... -->` marker. This changes
  body-derived numbers (notably `task_count` in `gsd-tools phase-plan-index`) but
  never frontmatter, filenames, or file counts — which is what phase/plan status
  derivation actually reads.
- Scrubbed: e-mail addresses → `redacted@example.invalid`; `sk-`/`ghp_`/
  `github_pat_`/`xox?-`/`AKIA` prefixed strings and `key|secret|token|password|bearer`
  assignments → `REDACTED*`.
- Git cannot store empty directories, so `executing/` is missing the source
  project's empty `phases/03-multi-repo-tasks-cross-project-references/`.
  Its `expected/` outputs were regenerated against the fixture, so they list
  2 phase dirs, not 3 — fixture and expectations agree.

## `ProjectSnapshot` notes these fixtures exercise

- Both `01`/`02` zero-padded and bare `4`/`7` phase-number spellings.
- Frontmatter `progress:` **nested** object (all three) vs flat scalars.
- `Phase:`/`Plan:`/`Status:` prose under `## Current Position`, in three
  different spellings (`Phase: 02 (slug) — EXECUTING`, `Phase: 4 — Images`,
  `Phase: 7 — Coordinate & Scale Correctness Foundations (not started)`).
- A `Resume file:` line under `## Session Continuity` that is not a pause marker.
- `.planning/state.json` (GSD's own published state contract) present in
  `planning-midmilestone/` and absent in the others.
