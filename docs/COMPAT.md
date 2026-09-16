# COMPAT.md — tested version matrix

Per spec §12.4: **bump any version in this file only with a spike.** Never bump implicitly
because "it probably still works."

## Tested matrix

| Component | Version | Protocol / schema | Confidence |
|---|---|---|---|
| Herdr | **0.9.0** | protocol `22`, `schema_version 1` | Live-tested: real socket, real session, live token round-trip (`docs/spikes/M0-H-herdr.md`) |
| GSD-Core (`@opengsd/gsd-core`) | **1.14.0** | spec floor is `≥1.8.0`; **1.8.0 itself was NOT tested this session** — only 1.14.0 fixtures exist | Live-tested against an installed package + 3 real `.planning` trees (`docs/spikes/M0-G-gsd.md`) |
| Node | **24.21** | engine requirement `≥ 22` | Machine-installed, used to run all spike commands |
| Claude Code | **2.1.273** | hooks: doc-derived (raw HTML of `code.claude.com/docs/en/hooks`) + binary-verified (Zod presence, `unrecognized_keys` behavior) | High for documented fields; the "unknown key inside a hook-entry object" question is unresolved (§1.3 of M0-A) |
| Codex | **not installed** | hooks.json shape from GSD's own installer source, not a live Codex process | Low — all Codex payload fixtures are speculative-by-analogy to Claude Code's schema and MUST be re-verified before the adapter ships (see "Codex unverified fields" below) |
| OpenCode | installed, `@opencode-ai/plugin@0.15.18` | plugin API from raw HTML docs + two live installed plugin files | High — cross-checked against two independently-authored, currently-loaded plugins on this machine |

**Platform:** Linux (Fedora, kernel 7.2) tested locally. macOS is tested by CI (`macos-latest`,
2026-09-16): unit tests, gates M0–M5 including the real-Herdr e2e in a headless session. Two
macOS-specific findings are folded in: FSEvents may deliver a directory's write events in a later
debounced batch, and `/var/folders` / `/tmp` are symlinks to `/private/…`, so caller-supplied
project roots are matched by real path. Harness adapters on macOS remain a manual checklist.

### GSD-Core 1.8.0 floor — not tested

The spec's stated floor is `≥1.8.0`; this spike only had 1.14.0 available. One data point
from `docs/spikes/M0-G-gsd.md` §4 supports partial cross-version stability: a `1.9.1`
installation of `gsd-statusline.js` (found on a different local project) writes the exact
same `claude-ctx-<sid>.json` bridge schema as 1.14.0's. This is not sufficient to claim 1.8.0
compatibility for anything else (CLI JSON shapes, `state.json` contract, hook wiring). Treat
1.8.0 as unverified until a real 1.8.0 spike runs.

### Codex — unverified fields (explicit list)

Everything below is speculative-by-analogy to Claude Code's schema, sourced from GSD's own
Codex installer code, not a live Codex session:

- Exact stdin/payload field names for `PreToolUse`, `PostToolUse`, `SubagentStart`,
  `SubagentStop`, `Stop` (only `SessionStart`'s wiring is GSD-precedented; GSD itself never
  registers the other 5 events for Codex today).
- Whether those 5 events actually fire and carry usable data at all — GSD's own comment
  says the context-monitor hook it once registered for them was "a guaranteed silent no-op"
  for its use case, but that was diagnosed as a bridge-file mismatch, not proof the events
  themselves are broken.
- The Codex version that first shipped the `hooks.json` surface. Confirmed floors are for
  adjacent features only: `[agents.gsd-*]` needs ≥0.120.0, `[[hooks.<Event>]]` needs
  ≥0.124.0, the `hooks` feature-flag namespace needs ≥0.130.0. Spec's guessed "≥0.137" is
  neither confirmed nor refuted.
- Whether an unrecognized key inside a `hooks.json` entry object is tolerated (Claude Code
  skips the bad entry; Codex's `deny_unknown_fields` posture is stricter but untested against
  this specific shape).
- `test/fixtures/hooks/codex/*.json` fixtures are Claude-schema-by-analogy — see
  `test/fixtures/hooks/README.md` provenance table before trusting any field in them.

**Action before the Codex adapter ships:** install real Codex, attach a diagnostic hook,
capture one real payload per event (M0-A's noted follow-up, "M0-B").

## Herdr socket methods the plugin uses

Confirmed present in the live protocol-22 catalogue (`docs/spikes/M0-H-herdr.md` §2–§3),
104 methods total on the server; this plugin's subset:

**M1–M3 (used now):**
`ping`, `session.snapshot`, `workspace.list`, `workspace.get`, `pane.list`, `pane.get`,
`pane.process_info`, `agent.list`, `agent.get`, `plugin.list`, `worktree.list`,
`workspace.report_metadata`, `pane.report_metadata`, `notification.show`,
`agent.view.set`, `agent.view.clear`, `events.subscribe`.

**M4 (orchestration) — live-tested on 2026-09-16 in a scratch `herdr --session` with Claude Code
2.1.273 (`docs/spikes/M4-orchestration.md`, captures `M4-*.json`):**
`agent.prompt` (with and without `wait`), `agent.wait`, `agent.send_keys`, `agent.start`
(returns `launch_pending` immediately), `agent.read`, `agent.get`, `pane.split`, `pane.close`
(closes the workspace with its last pane), `pane.read`, `worktree.create`, `worktree.open`,
`worktree.remove` (`dirty_worktree_requires_force`). Not exercised: `pane.send_text` (the plugin
never uses it), `workspace.create` (used only by the e2e script through the CLI).

Notes carried from the spike:
- The socket is **connection-per-request**; only `events.subscribe` (and wait-style calls)
  keep a connection open. See `docs/DECISIONS.md` "Additional decisions."
- `pane.report_agent` (semantic lifecycle authority) exists on the server but this plugin
  **never calls it** — see spec §2.3 principle 1.

## gsd-tools subcommands used (read-only)

Verified safe (no disk write) in `docs/spikes/M0-G-gsd.md` §2.6:

`state get`, `state load`, `state json`, `state-snapshot`, `phases list`, `progress`,
`history-digest`, `phase-plan-index <N>`, `roadmap get-phase <N>`, `stats`,
`smart-entry --json`, `runtime-identity`, `config-path`, `config-get <key>`, `state` (no
subcommand), `find-phase`.

There is **no `--json` flag** — JSON is `gsd-tools`'s default output; `--raw` turns it off.
Use `--project-dir <path>` (skips ancestor walk-up, requires `.planning/`) and `--pick
<field>` for targeted extraction.

### Never call (write subcommands)

Confirmed to mutate `.planning/` (publish `state.json` and/or rewrite `STATE.md`/
`ROADMAP.md`) — the plugin must never invoke these:

`state advance-plan`, `state begin-phase`, `state planned-phase`, `state milestone-switch`,
`state complete-phase`, `state patch`, `state update`, `state record-metric`,
`state update-progress`, `state add-decision`, `state record-session`, `phase add`,
`phase add-batch`, `phase insert`, `phase remove`, `phase complete`, `milestone complete`,
`config-set`, `commit*`, `worktree create`, `worktree cleanup-wave`, `worktree record-agent`,
`scaffold`, `graphify build`.

`state planned-phase` is called out specifically: during this spike it was invoked believing
it a read and it rewrote a real project's `STATE.md`/`state.json` (see `docs/DECISIONS.md`,
G2/incident note). `packages/core` must pin the read-only list above and assert it in tests.

Also confirmed absent in 1.14.0 despite being named in the original spec: `--version` flag,
`state sync` subcommand (use `drift-guard`/`validate` instead).

## Versioning rule (spec §12.4)

Pin every version in this file deliberately. Bumping any row — Herdr, GSD-Core, Node, or a
harness — requires a new spike capturing the delta (raw command output + a decision entry
in `docs/DECISIONS.md`), never an implicit assumption that a newer minor/patch still behaves
the same.
