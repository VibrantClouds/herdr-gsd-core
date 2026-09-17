# DECISIONS — M0 exit deliverable

Every `VERIFY` item named in `spec.md` §1 is resolved below. Format per item: **Question**
(as spec posed it) → **Finding** (spike citation) → **DECISION** → **Amends**.
Full evidence is in `docs/spikes/M0-H-herdr.md`, `docs/spikes/M0-G-gsd.md`,
`docs/spikes/M0-A-hooks.md`.

---

## M0-H — Herdr 0.9.0 (spec §1.1 VERIFY)

### H1. Exact JSON shape of `agent.list` entries
**Finding:** M0-H §2 captured live `AgentInfo`: `terminal_id, agent, terminal_title(_stripped),
agent_status, agent_session, workspace_id, tab_id, pane_id, focused, state_change_seq, cwd,
foreground_cwd, revision`, optional `tokens, name, interactive_ready, launch_pending,
screen_detection_skipped, title, display_agent, state_labels`. No `attention` field exists.
**DECISION:** adopt this shape verbatim in `packages/herdr-client` types. "Needs attention"
is derived from `agent_status ∈ {blocked, done}`, since `attention` is a view-sort-only
concept, not a readable field.
**Amends:** §1.1, §3.3 (sort clause), §6 (dashboard attention semantics).

### H2. `pane.agent_status_changed` payload / global stream
**Finding:** M0-H §1.3 — this event type is pane-scoped and **requires `pane_id`** per
subscription entry; there is no global agent-status stream. `pane.updated` fires on any
`PaneInfo` change (including `agent_status`) and carries the full object.
**DECISION:** subscribe once to `pane.updated` and diff `agent_status` client-side, instead
of per-pane `pane.agent_status_changed` subscriptions that would need re-arming on every
`pane.created`/`pane.moved`.
**Amends:** §1.1, §4.4.

### H3. `worktree.create` params
**Finding:** M0-H §3.5 — `{workspace_id?|cwd?, branch?, base?, path?, label?, focus?=false,
trust_repository?}` → `worktree_created{workspace, tab, root_pane, worktree}`.
`worktree.remove` addresses by `workspace_id`, not path.
**DECISION:** store the returned `workspace_id` in the §7.2 run record as the sole handle
for removal; drop the separate `pane.split` step from §7.1 — `root_pane` is already ready.
**Amends:** §1.1, §7.1, §7.2, §7.4.

### H4. `agent.start` params (harness launch argv)
**Finding:** M0-H §3.3 — `{name*, kind*, pane_id*, args?, timeout_ms?}` →
`{agent_started, agent, argv[]}`. Requires an existing pane already at its shell prompt;
never creates/splits layout. `kind` is a fixed enum of 24 executables. `timeout_ms` bounds:
`>3000, ≤300000`.
**DECISION:** orchestration order is `workspace.create`/`pane.split` → `agent.start` →
`agent.prompt`; validate configured `harness.*.command` kinds against the fixed enum at
config-load time.
**Amends:** §1.1, §7.1.

### H5. Does `agent.view.set` filter support `exists` on tokens?
**Finding:** M0-H §3.2 — yes, `exists{field:{"token":"<name>"}}` is schema-valid; live
probe returned `plugin_not_found` only because the plugin wasn't linked yet, not because
the filter is invalid.
**DECISION:** keep §3.3's filter as specified. Note `agent.view.set` (unlike
`report_metadata`) **is plugin-gated**, so the positive path is untestable before M1
linking — first `verify:m1` check.
**Amends:** §1.1, §3.3.

---

## M0-G — GSD-Core 1.14.0 (spec §1.2 VERIFY items 1–5)

### G1. Does the ADR-1239 hook bus expose a third-party lifecycle-event subscription seam?
**Finding:** M0-G §1 — No. `host` bus `subscribe()` is an empty stub, `emit()` throws; the
event vocabulary contains zero GSD-domain events; `@opengsd/gsd-core/sdk` 404s;
`capability.json` overlays are data-only, not callbacks.
**DECISION:** no event seam exists or is imminent. Rely entirely on harness hooks +
filesystem watching, confirming spec §2.1's original placement decision. File the two
upstream asks from M0-G §8.
**Amends:** §1.2 item 1, §2.1 (confirmed), §2.3.

### G2. Exact output of `gsd-tools state get/phases list/progress --json` (or equivalent)
**Finding:** M0-G §2.2 — there is **no `--json` flag**; JSON is the unconditional default;
`--raw` turns it off. `.planning/state.json` is GSD's own atomic, versioned, published
state contract (frozen key order, 3-value status vocabulary), published at 11 step
boundaries.
**DECISION:** drop `--json` from every `gsd-tools` invocation in the spec; use
`--project-dir` + `--pick`. Read `.planning/state.json` first; `STATE.md` markdown parsing
is the fallback when it is absent.
**Amends:** §1.2 item 2, §2.3.6, §3.1 (parsing rules).

### G3. Is there a command to execute one plan of a phase in isolation?
**Finding:** M0-G §3 — no plan-level flag exists in 1.14.0. `--wave N` is the only
sub-phase granularity; it refuses if a lower wave is incomplete and leaves the phase
unverified after a partial wave.
**DECISION:** orchestration parallelism is **wave-level within a phase**, phase-level
across worktrees. §7.1's "Plan/wave run" unit becomes "Wave run"; pane-per-plan is dropped.
**Amends:** §1.2 item 3, §7.1, §7.4.

### G4. Where does the Claude Code statusline hook write its intermediate data?
**Finding:** M0-G §4 — `$TMPDIR/claude-ctx-<session_id>.json`, **context % only** (no
phase/state), bare `writeFileSync` (non-atomic), unversioned, no project binding, every
render (no throttle).
**DECISION:** keep `gsd_ctx` as an optional best-effort token sourced from this file with a
60 s staleness cutoff and a `try/catch` JSON parse; never source phase/state from it.
**Amends:** §1.2 item 4, §3.3 (`gsd_ctx` row).

### G5. `gsd-phase-boundary.sh` semantics — marker on disk?
**Finding:** M0-G §5 — misnomer: it does a path-string test only, no STATE.md diff or
phase comparison, writes nothing to disk, exits 0 always, and is gated behind
`hooks.community` (default `false`, unset in every local project).
**DECISION:** unusable as a third-party signal. The plugin's own `PostToolUse` adapter
entry already replicates its entire useful behavior in one line; do not depend on it or
its gate.
**Amends:** §1.2 item 5, §5.1, §5.5.

---

## M0-A — Harness hooks (spec §5.1/§5.2/§5.3 VERIFY notes)

### A1 (§5.1). Is `Task` the current subagent tool name, and does the payload carry `subagent_type`/`description`?
**Finding:** M0-A §1/§1.1 — No: the subagent tool is **`Agent`**; `Task` is a distinct
todo-tracking tool family. `tool_input` on the `PreToolUse` `Agent` call does carry
`subagent_type`/`description`/`prompt`. Also, **`SubagentStart` exists** in Claude Code
2.1.273, contradicting spec's assumption it doesn't.
**DECISION:** matcher becomes `Bash|Edit|Write|MultiEdit|Agent|Task` (`Task` kept as a
legacy fallback); `subagent.start` inference keys off `tool_name == "Agent"` primarily.
`gsd_workers` can be counted exactly via `SubagentStart`/`SubagentStop` pairing — drop the
"Claude Code shows `?`" caveat.
**Amends:** §5.1, §3.3 (`gsd_workers` row), §5.5 (degradation matrix).

### A2 (§5.2). Codex installer location — `~/.codex/hooks.json` vs `config.toml [[hooks]]`?
**Finding:** M0-A §2 — GSD's own installer confirms `hooks.json` (nested
`{"hooks":{...}}`), keeping `config.toml` for feature flags only, to avoid a Codex
mixed-representation startup warning. GSD itself wires only `SessionStart` there; the
other 9 events have zero live GSD precedent.
**DECISION:** adopt `~/.codex/hooks.json` as the install target. Register
`PreToolUse`/`PostToolUse`/`SubagentStart`/`SubagentStop`/`Stop` ourselves (no GSD
precedent to copy), gated on `codex --version ≥ 0.130`; mark Codex fixtures speculative
until a real install exists.
**Amends:** §5.2, `docs/COMPAT.md` (version floor, spec's guessed "≥0.137" unconfirmed).

### A3 (§5.3, implicit). Is the OpenCode plugin dir "pinned CJS" by a GSD config-root marker requiring us to avoid a second marker?
**Finding:** M0-A §3 / M0-G §6 — the config-root CJS marker was **retired** (migration
007, `introducedIn: 1.8.0`); the marker now lives only in `<root>/plugins/package.json`.
OpenCode runs on Bun, which loads ESM `.js` files regardless of a `"type"` marker when a
plugin does no subprocess spawn. Also, the dir is `plugins/` (plural), not `plugin/`.
**DECISION:** ship `plugins/herdr-gsd-core.js` as a standalone ESM file doing in-process
spool writes — no subprocess spawn, so no CJS marker is needed at all, sidestepping the
classify-before-write problem entirely.
**Amends:** §5.3.

---

## Additional decisions not anticipated by the spec

New findings the spikes surfaced with no corresponding spec VERIFY item:

- **Connection-per-request transport.** The Herdr socket closes after one response; only
  `events.subscribe`/wait methods stay open. The client must be connection-per-request plus
  one long-lived subscription connection, never a multiplexed keep-alive. (M0-H §1.1)
- **No global agent-status stream → subscribe `pane.updated` and diff.** (M0-H §1.3, H2 above)
- **Workspaces have no `cwd`** anywhere in the API → derive root from the root pane's `cwd`,
  or `worktree.checkout_path`/`repo_root` for worktree workspaces. (M0-H §2)
- **`rate_limited`/`busy` are `result.reason` values on a successful `notification.show`
  call, not error codes** — fix §4.4's wording, which lists them beside `agent_blocked`.
  (M0-H §1.2, §3.4)
- **seq high-water semantics → wall-clock-floored seq.** A restarted daemon resetting `seq`
  to 1 has all reports silently dropped until the prior high-water mark is passed, which
  Herdr never exposes. Use `Date.now()`-derived seq, persisted in `seq.json`. (M0-H §4)
- **TTL is per report, not per key.** `ttl_ms` applies to every key named in that one
  `pane.report_metadata` call; different TTLs (90 s vs 15 s) require separate calls.
  (M0-H §3.1)
- **Token values are silently truncated at 80 chars**, not rejected — clamp in
  `packages/core` before reporting. (M0-H §3.1, §4)
- **`attention` is sort-only.** It exists as an `agent.view.set` sort field but is never
  readable from `agent.get`/`agent.list`. (M0-H §2)
- **`agent.view.set` is plugin-gated** (rejects `source:"plugin:<id>"` until linked);
  `report_metadata` calls are not. (M0-H §3.2, §4 finding 6)
- **Claude/Codex integrations are session-only, so `blocked` must be corroborated by the
  filesystem snapshot.** `agent_status` for these two harnesses is always screen-scraped,
  even with the official integration installed — gate §4.4's notification primarily on
  `gsd_status`/new `*-UAT.md`, using `agent_status == blocked` only as corroboration.
  (M0-H §7)
- **`PaneInfo.agent_session.value`** (Claude Code session UUID) is the pane↔hook join key —
  more reliable than pid/cwd matching. (M0-H §2)
- **`pane.process_info.cmdline`/`argv` can contain secrets** (a live capture held an API
  key and a DB password) — never log or spool it; match on `foreground_processes[0].name`/
  argv[0] basename only for harness detection. (M0-H §2)
- **`.planning/state.json` is GSD's published contract and the primary read** — atomic,
  versioned, frozen key order, published at 11 step-boundary commands. `STATE.md` is the
  fallback, not the primary source spec §3.1 implied. (M0-G §2.3)
- **`gsd-tools` JSON is the default, with `@file:` spill** for outputs over 50,000 chars
  (e.g. `history-digest`) — the plugin must follow the indirection. (M0-G §2.2, §5)
- **No `--json`/`--version`/`state sync` exist.** Use `runtime-identity` for version,
  `drift-guard`/`validate` for drift instead of `state sync --verify`. (M0-G §2.2, §7)
- **`state planned-phase` is a WRITE — incident recorded.** Probing believed it a read; it
  rewrote a real project's `STATE.md` and published a new `state.json` during the spike.
  Both were restored from git (`STATE.md` via `git checkout --`, `state.json` deleted as
  untracked). §2.6's read-only list is now pinned into `packages/core` and asserted by
  tests to prevent recurrence. (M0-G incident notice, §2.6)
- **Pause marker is `.continue-here.md`** (dot-prefixed) **inside the active phase dir**
  (`.planning/phases/NN-slug/`), not `.planning/continue-here.md` as spec §3.1 states, plus
  a sibling `.planning/HANDOFF.json`. (M0-G §7 row)
- **Three phase-status vocabularies coexist**, none matching spec's 7-value
  `PhaseStatus`: `state.json` (3: `complete|in_progress|pending`),
  `progress`/`determinePhaseStatus` (6), `normalizeStateStatus` (7, project-level, distinct
  set). The plugin needs an explicit mapping table; `blocked` stays plugin-derived, never a
  GSD-native value. (M0-G §2.3, §2.5, §7)
- **Wave-level (not plan-level) execution** is the only sub-phase orchestration unit
  (G3 above). (M0-G §3)
- **Statusline bridge file carries context % only** — no phase, state, or project binding
  (G4 above). (M0-G §4)
- **Codex `hooks.json` SessionStart-only precedent** — GSD unconditionally strips its own
  registration of the other 9 events for Codex; its "extended events" descriptor is stale.
  (M0-G §6, A2 above)
- **Subagent tool is `Agent`, and `SubagentStart` exists** (A1 above). (M0-A §1)
- **Drop the JSON marker key in favour of command-substring ownership.** GSD identifies its
  own managed `settings.json` hook entries by matching a distinctive substring in the
  `command` string (`isManagedHookCommand`), not a JSON marker key — Codex's stricter
  schema (`deny_unknown_fields`) would reject an extra key outright anyway. Drop spec
  §5.1's proposed `"_herdr_gsd_core": "managed"` key; use a distinctive path segment in the
  `command` string, filtered per-`hooks[]`-entry on uninstall, everywhere. (M0-A §1.3)
- **OpenCode `plugins/` dir** is plural, confirmed against 8 documented example paths and
  two live installed plugins. (M0-A §3)
- **`HERDR_PANE_ID` is inherited by hook processes** with no adapter plumbing required —
  confirmed empirically by walking `/proc/<pid>/environ` up the process tree from a live
  Claude Code session; the installer does not need to "emit" it into events as spec §3.2
  describes. (M0-A §5)

---

## Owner decisions

- **Scope this session:** M0 → M3. M4/M5 are follow-up milestones, not attempted now.
- **Plugin identity:** id `herdr-gsd-core`, GitHub `VibrantClouds/herdr-gsd-core`, MIT
  license.
- **Claude Code adapter root:** `$CLAUDE_CONFIG_DIR` else `~/.claude`; `--local <dir>`
  supports project-local installs, since GSD can be installed per-project and no
  `~/.claude` may exist on a given machine.
- **Spec §0 assumptions 1–3:** accepted at their stated defaults (one GSD project ↔ one
  Herdr workspace plus linked worktrees; both sidebar tokens and a dashboard pane, dashboard
  in M3; orchestration may create worktrees/start processes without per-action confirmation
  once a profile is enabled, but sending prompts to a foreign pane always confirms).

---

## M2 adapter implementation decisions

Taken while implementing `packages/adapters/{claude-code,codex,opencode}`; each follows
from M0-A/M0-G but was not spelled out there.

- **Spool dir reaches the hook as a `--spool <dir>` argv flag, not an env var.** Spec §3.2
  says the installer "exports `HERDR_GSD_SPOOL_DIR` into harness hook config"; hook
  `command` strings are argv lines, not shell scripts with an env-assignment prefix, so
  the installer bakes `--spool "<dir>"` into the command instead. `HERDR_GSD_SPOOL_DIR`
  is still honoured (it is how the OpenCode plugin and tests pass it), and the fallback is
  `~/.local/state/herdr-gsd-core/spool/`. Precedence: `--spool` → env → default.
- **Claude Code emits BOTH `tool.pre` and an inferred `subagent.start` on an `Agent`/`Task`
  PreToolUse, AND `SubagentStart` is registered.** `SubagentStart` exists in 2.1.273
  (M0-A §1.1) but not in every supported build, so the inferred span is kept as the
  back-compat path. **The daemon must de-duplicate**: an inferred `subagent.start` carries
  a `tool` field (`Agent`/`Task`) while the real `SubagentStart` event does not — collapse
  a `SubagentStart` that arrives within the same session shortly after an inferred one.
- **Codex registers no `matcher`.** GSD omits `matcher` on this surface and Codex tool
  names are lowercase (`shell`), so a Claude-style matcher would silently never match.
  `doctor` always emits a warning that only `SessionStart` has a live precedent.
- **OpenCode ships CommonJS, not ESM.** M0-A §3 suggested ESM was fine under Bun, but the
  export shape that is *verified to load* is GSD's: `module.exports` assigned from a
  VARIABLE holding `{ server: <fn> }` with a NON-ENUMERABLE `id`, so the loader's
  `for (const entry of Object.values(mod)) getServerPlugin(entry)` resolves under both
  raw-CJS and ESM-interop import and never sees a non-function value. Copying that exact
  shape is worth more than the ESM ergonomics. `plugins/package.json` is classified but
  never written (GSD owns that marker); `"type":"module"` is a warning only.
- **Shared adapter code is copied, then inlined.** `packages/adapters/claude-code/src/`
  `{emit,redact,hookfile}.ts` are the source of truth; `scripts/copy-shared.cjs` copies
  them verbatim into the other two adapters (`--check` guards drift in CI) and
  `scripts/bundle-hooks.cjs` inlines every relative `require` after `tsc -b`, so each
  shipped hook/plugin is one file needing nothing but Node builtins (spec §12.5).
- **Uninstall removes empty containers it finds, not only ones it created.** After deleting
  our entries, an emptied `hooks[]` array, matcher group, event array, or the whole `hooks`
  table is dropped. This is what makes install→uninstall byte-identical; the (harmless)
  edge case is a pre-existing *empty* `hooks` table, which uninstall would also remove.

---

## M4 — orchestration (2026-09-16, `docs/spikes/M4-orchestration.md`)

The owner's bar: orchestration must fit how GSD is normally used, respect every state and
configuration a project can be in, and be worth having ("done poorly is not worth doing").
Resolved by reading GSD-Core 1.14.0's own workflows and by live-testing every Herdr method the
design needs in a scratch `herdr --session` with a real Claude Code.

### O1. Which units of work are compatible with GSD?
**Finding:** GSD has one `## Current Position` slot, `/gsd-progress --next` re-routes to the lowest
incomplete phase, its sanctioned parallel unit is a **workstream**, `--wave N` refuses while a
lower wave is incomplete, and `/gsd-workspace --new` creates a **new, empty** project (M4 spike
G2–G4).
**DECISION:** keep three units — a phase run in a new pane, an isolated phase run in a worktree
on the branch GSD itself would use, and a supervised `/gsd-autonomous` pane. Drop parallel phases,
wave-level runs, pane-per-plan, and `isolation = "gsd-workspace"`. One active run per repository,
`max_parallel` only across repositories.
**Amends:** §7.1, §7.4, §3.4 (`isolation` enum).

### O2. Project-state guards
**Finding:** GSD writes `## Needs Human` (after 3 failed retries in autonomous mode) and
`## Deferred Verification` into STATE.md; `commit_docs: false` keeps `.planning/` out of git;
`git.branching_strategy` decides branch naming and GSD reuses an existing branch as-is;
`workflow.use_worktrees` only changes what GSD does inside a run; branches named `agent-*` /
`worktree-*` make `execute-phase` FATAL (G1, G6–G9).
**DECISION:** the planner (`packages/daemon/src/orchestration/plan.ts`, pure, unit-tested) refuses
on health ≠ ok, human-stop markers, blockers, a completed roadmap, a paused project (only
`/gsd-resume-work` is offered), an active run on the repository, a working/blocked harness in the
project's pane, and for isolation on untracked `.planning`, `commit_docs = false`,
`branching_strategy = milestone`, or a reserved branch name. `use_worktrees`, `parallelization`,
`mode`, `auto_advance` become warnings on the run record. `packages/core` now parses the config
keys and the human-stop headings; `gsd_status` is `blocked` while a human-stop marker exists.
**Amends:** §3.1 (`config`, `humanStops`), §7.4.

### O3. Herdr behaviours the design must honour (live)
**Finding:** `agent.start` returns immediately with `launch_pending` (H1); Claude Code's
folder-trust dialog is `blocked` and trust is inherited from a trusted ancestor (H2/H3);
`pane.close` on the last pane closes the workspace and then `worktree.remove` fails with
`workspace_not_found`, orphaning the checkout (H5); `worktree.remove` on a clean worktree with a
running agent succeeds without orphan processes (H6); dirty worktrees answer
`dirty_worktree_requires_force` (H8); an orphaned checkout is recoverable via `worktree.open`
(H7).
**DECISION:** after `agent.start` the daemon does one bounded `agent.wait`; a `blocked` result is
"startup needs input" (run `waiting/startup_input`, notification names the pane, the prompt goes
out on the next idle). Stop order for isolated runs is `worktree.remove` first, never
`pane.close`; dirty worktrees are kept and reported unless `--discard`. Trust is documented, not
automated; `~/.claude.json` is never edited.
**Amends:** §7.3, §7.4, `docs/COMPAT.md` (M4 methods now live-tested).

### O4. Run supervision is event-driven, never blind-retrying
**Finding:** the daemon already subscribes to `pane.updated` and diffs `agent_status` (H2 of
M0-H); `agent.prompt --wait` would tie a socket to a run for hours; spike M0-H §3.3 says never
retry a prompt blindly after a stall.
**DECISION:** runs follow `pane.updated` diffs; no `working` within `stallMs` after a prompt
marks the run `waiting/stalled` with the last screen lines and a notification, and nothing is
resent. `/gsd-autonomous` is re-launched only when the *session is gone* and only with
`autonomous.resume_on_exit = true`, within `max_resumes` / `max_wall_clock_min`, using GSD's own
`--from <lowest incomplete>` hint; a live idle session is never re-prompted because GSD stopped it
on purpose.
**Amends:** §7.1 (autonomous loop), §7.2 (run record fields).

### O5. Anchor pane for non-isolated runs
**Finding (live e2e):** a project whose workspace holds only a shell has no driver pane; the
first implementation refused to split.
**DECISION:** split from the project's driver pane when there is one, else the focused pane of a
bound workspace, else any pane there. Caught by `scripts/e2e-herdr.cjs` with `E2E_RUN=1`.

### O6. Command safety
**DECISION:** the orchestrator only ever sends `/gsd-<name> …`. Explicit `/gsd-…`, `/gsd:…`,
`gsd:…` spellings are normalised; a bare name must be one of the 72 commands captured in
`docs/spikes/captures/M0-G-commands.txt`. Arbitrary text is refused at plan time.

## M5 — hardening and release (2026-09-16)

- CI (`.github/workflows/ci.yml`): ubuntu-latest + macos-latest, Node 22, Herdr 0.9.0 from the
  GitHub release asset per runner arch, GSD-Core 1.14.0 via the installer's non-interactive
  flags into `~/.claude-gsd` (tolerated failure: the plugin is filesystem-first), `npm ci` +
  `npm run build` (exactly the manifest's build commands), `npm test`, gates M0–M5, and on the
  default branch a `herdr plugin install <owner>/<repo> --yes --ref <sha>` into a second
  headless session.
- Real-Herdr e2e (`scripts/e2e-herdr.cjs`): a throwaway `--session`, a fixture repo, this
  plugin's daemon with its own state/config dirs, tokens asserted through `herdr api snapshot`,
  `## Needs Human` → `blocked`, plan/refuse through the control socket; `E2E_RUN=1` also starts a
  real harness run and stops it. Because `herdr plugin link` is global, the owner's linked plugin
  also spawns its own daemon into any new session; the e2e's daemon uses a separate state dir so
  they never share a pidfile.
- Marketplace: repository topic `herdr-plugin` (mirrored in `package.json` keywords), manifest
  metadata parseable at the repo root, README documents install, the degradation matrix and the
  no-lifecycle-authority stance.

### O7. Agent-status transitions need the pane-scoped subscription (corrects M0-H H2)
**Finding (live probe, M4 spike H10):** `pane.updated` did not carry Claude Code's
`blocked → idle → working → idle` transitions; only `pane.agent_status_changed {pane_id}` did, and
the one `pane_updated` frame that arrived carried a stale status.
**DECISION:** keep a dedicated, debounced-rebuilt subscription over every pane with an agent;
ignore `agent_status` from `pane.updated` for subscribed panes; orchestrated runs await the
stream after `agent.start` and record `state_change_seq` at prompt time (`reactedSincePrompt`)
so a missed frame cannot produce a false stall. The fake Herdr's `statusViaPaneUpdated = false`
reproduces the real behaviour and is the mode the orchestrator tests run in.
**Amends:** §1.1, §4.4, §13 (M0-H H2 row).

### O8. `milestone.lock` is an advisory claim, not a read lock (corrects M0-G §7 "widen the lock check")
**Finding (live, 2026-09-16):** after the daemon restart the owner's CharacterDossier workspace
showed `gsd_phase = none`, `gsd_status = idle`, `gsd_err = STATE.md locked` because
`.planning/milestone.lock` existed. GSD's `bin/lib/milestone-lock.cjs` header: "an advisory claim
file, not a mutex" holding `{phase, session, pid, updated_at}`, heartbeated by the active session
and expiring by TTL — it lives for the whole session and never guards a write.
**DECISION:** only `STATE.md.lock` and `.lock` gate reads. `milestone.lock` is read through
(its `phase` is GSD's own claim of the phase being worked, which matches the position anyway).
**Amends:** §3.1 (locks), §13 (M0-G lock row), `docs/COMPAT.md`.

## M6 — live-projection corrections (2026-09-17)

Five defects found against the owner's running daemon (two GSD projects, two non-GSD workspaces)
and confirmed from GSD-Core 1.14.0's source and both projects' git history.

### O9. Source precedence, written down once
**Finding:** the plugin blends four sources but the order lived only in scattered comments, which
is how O10–O12 each drifted in a different direction.
**DECISION:** resolve in this order, and keep it here rather than re-deriving it per call site.
1. `.planning/state.json` — GSD's published machine contract (per-phase status)
2. `.planning/STATE.md` frontmatter, then its `## Current Position` body — the live declaration
3. phase-directory artifacts — corroboration, and the **only** source for steps STATE.md has no
   field for (code review, UI review, UAT), and the tiebreak when STATE.md's counters have gone
   stale against them
4. `.planning/ROADMAP.md` — milestone-level completion override

**Considered and rejected: deriving state from "the newest planning document on disk."** Artifacts
are written at the *end* of a step, so they are structurally one step behind; the next phase has no
directory until GSD creates it (GPS.CommercialCRM: `phases/40-…` fully complete, no `41/`, STATE.md
already on 41); mtimes are bulk-restamped by clone/checkout/rsync in three of six real local
projects; and GSD's own `smart-entry.cjs` reads STATE.md first, so inverting the order would make
the sidebar disagree with `/gsd-status`. Where artifacts *are* authoritative (O11) it is because
STATE.md records nothing at all, not because the filesystem is generally more current.

**Corollary — every cross-file comparison uses declared timestamps, never mtimes.** `last_updated`
in STATE.md's frontmatter, `timestamp`/`paused_at` in `HANDOFF.json`. Filesystem mtimes are an
artefact of how the tree was obtained.

### O10. A pause marker must still describe the present
**Finding (live):** GPS.CommercialCRM reported `gsd_status = paused` continuously from 2026-09-11
to 2026-09-17. `.planning/HANDOFF.json` existed, recording `"phase": "34"`, while STATE.md had
moved to phase 41. GSD never deletes the file, and the plugin treated its existence as the state.
**DECISION:** `.continue-here.md` still pauses on presence — `/gsd-resume-work` consumes it, so it
cannot go stale (O-pause above). `HANDOFF.json` is honoured only when it still describes the
present: its `phase` matches the current phase, and its declared timestamp is not older than
STATE.md's `last_updated`. An ignored marker becomes a diagnostic and is **not** placed on
`snap.paused`, whose five consumers (`next` rules, notifier, both status derivations,
`diffSnapshots`) all mean "paused now".

### O11. Code review and verification exist only on disk
**Finding:** GSD writes no `Status`, no `Current Plan` and no `Stopped At` during the code-review
gate or verification. The complete `Status` writer set is `state-transition.cjs` + `state.cjs:6022`;
none of it mentions review, UAT, gaps or humans. `Verifying Phase N` is a *recognizer* only
(`state-document.cjs:680`) — no writer emits it. `workflows/code-review.md` touches STATE.md only
to exclude it from a git diff. Confirmed live: CommercialCRM phase 40 wrote `40-REVIEW.md` at 15:49
and `40-VERIFICATION.md` at 15:56 with **no STATE.md commit** between 15:36 and the 15:57
transition; IDP phase 53 held `status: executing` across UAT, security review, verification and UI
review.
**DECISION:** add a `reviewing` phase status and a `review` step, derived from phase artifacts
alone. The STATE.md status tables stay byte-identical to GSD's `state-document.cjs:637` — there is
no status string to recognise. Artifact presence means *that step finished*, so the status shown is
the step that comes next in `execute-phase.md`'s order:

| evidence (summaries ≥ plans) | status |
|---|---|
| no REVIEW, no VERIFICATION | `reviewing` |
| REVIEW present (`clean`/`issues_found`/`skipped`) | `verifying` |
| VERIFICATION `status: passed` | `complete` |
| VERIFICATION any other value, or present but unreadable | `verifying` |

`NN-UI-REVIEW.md` also ends `-REVIEW.md` and is a different pass — it never satisfies the gate.
Frontmatter reads stay column-0 anchored: CommercialCRM's real `40-VERIFICATION.md` carries a
nested `re_verification.previous_status: gaps_found` beneath a top-level `status: passed`, the trap
GSD warns about at `bin/lib/commands.cjs:142-144`.

### O12. `state.json`'s phase list is always trusted; its milestone and `next` are not
**Finding:** gating the whole file on `updated_at >= STATE.md mtime - 2s` discarded it on
essentially every snapshot — `state-contract.cjs` publishes at 11 step boundaries while STATE.md is
rewritten on every plan advance. Both live projects logged `state.json ignored as stale`
continuously, leaving phase status to be inferred from counting PLAN/SUMMARY files. That is how
phase 40 read `complete` while STATE.md said `executing` and state.json said `in_progress`.
**DECISION:** per-phase statuses apply unconditionally. `milestone` and `next` keep the freshness
gate — both are genuinely time-sensitive, and milestone identity belongs to ROADMAP.md. A phase
state.json knows about but that has no directory is *not* injected into `snap.phases`: that field
means "phases with artifacts on disk" to the dashboard, the `next` rules and `diffSnapshots`.

### O13. "Every phase directory is complete" is not "the milestone is done"
**Finding:** `.planning/phases/` holds only the current milestone's directories, and GSD creates
the next phase's directory when it plans it. CommercialCRM had 37–40 all complete on disk while
STATE.md was on 41.
**DECISION:** two independent guards, because four of six real projects predate `state.json` and so
cannot contribute a pending phase: every known phase must be complete **and** the phase STATE.md
names must be one of them. A shipped milestone declares no current phase, so it still reads
`complete`.

### O14. The plan index comes from summaries when the counter is behind
**Finding:** `advancePlan`'s phase-complete branch deliberately does not touch `Current Plan`
(`state-transition.cjs:1448`), neither verify nor review writes it, and only `completePhase` resets
it. CommercialCRM's phase-40 transition diff was `Plan: 4 of 10` → `Plan: Not started` while
`stopped_at` read `Completed 40-09-PLAN.md`. GSD's own `state-snapshot` declines to publish the
counter at all on the `executing/` fixture (`"current_plan": null`) where STATE.md says `2 of 18`
over 17 summaries.
**DECISION:** `total = max(declared, plans)`; the declared index stands while it is at or ahead of
the summary count, otherwise the summaries win (`min(summaries + 1, total)` mid-execution, clamped
to `total` once the phase is past execution). The step override is one-directional and capped at
`verify` — it never walks backwards and never promotes to `ship`, which is STATE.md's and ROADMAP's
call.

### O15. A binding is dropped when it stops resolving, even if the workspace is still open
**Finding (live):** workspaces w6 (`GPS.DocumentService.gRPC`) and w7 (`herdr-gsd-core`) — neither
a GSD project — rendered phase 54 and phase 40/41 from two unrelated projects. Both binding
timestamps match `resync (workspace.created)` lines in `gsdd.log` to the second: each was bound at
the instant it was created, while its pane still reported the cwd it was spawned from. The prune
required the workspace to have vanished from Herdr too, so nothing ever corrected it.
**DECISION:** any non-manual binding a rebind pass does not re-affirm is deleted, open or not, and
the workspace's tokens are cleared explicitly — workspace metadata carries no TTL (unlike pane
metadata), so anything the daemon stops refreshing stays on screen forever. `workspace.created`
additionally defers its binding decision to the debounced pass, and `rootForWorkspace` orders its
candidate panes (focused → driver → agent-bearing → rest) instead of taking Map order.
**Not adopted:** skipping panes whose cwd matches another bound workspace's root. Two workspaces
legitimately open on one project are indistinguishable from the bug, and the prune above makes the
guard unnecessary.
