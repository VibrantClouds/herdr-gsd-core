# PLANNING.md — herdr-gsd-core build log

Read at the start of every session (spec §12.1). Update task state, decisions, risks and the exact next action at the end.

## Session 2 — 2026-09-16 (M4 feasibility → M4 + M5 build)

### Owner decisions (this session)
- Orchestration only if it fits how GSD is normally used and is not awkward; "done poorly is not worth doing at all". If M4 is reasonable, build M4 **and** M5.
- The plugin must respect every state and configuration a GSD project can be in (e.g. `workflow.use_worktrees = false`).
- When implementation is complete, publish the repo to the owner's GitHub with the `gh` CLI.

### Feasibility verdict (docs/spikes/M4-orchestration.md)
Build a **reduced** M4. Kept: phase run in a new pane, isolated phase run in a worktree on the branch GSD itself would use, supervised `/gsd-autonomous`, stop/status, persisted run records with restart re-attach. Dropped because they fight GSD: parallel phases of one roadmap (single Current Position, `--next` re-routes to the lowest incomplete phase), wave-level runs (sequential by GSD's own gate), pane-per-plan, `gsd-workspace` isolation (creates a new project). Evidence: GSD-Core 1.14.0 sources (cited in the spike) + live Herdr captures `docs/spikes/captures/M4-*.json` from a scratch `herdr --session gsd-spike` with a real Claude Code 2.1.273.

### Task state
- [x] M4 spike: GSD semantics research + live `agent.start`/`agent.prompt`/`agent.wait`/`worktree.*`/`pane.close` in a scratch session (15 captures)
- [x] core: `.planning/config.json` keys (`use_worktrees`, `branching_strategy`, `phase_branch_template`, `allow_default_branch_commits`, `auto_advance`, `mode`, `commit_docs`), `## Needs Human` / `## Deferred Verification` → `humanStops` → `gsd_status = blocked`
- [x] herdr-client: per-call timeouts for long calls, `agent.read`, `HERDR_AGENT_KINDS`
- [x] fake-herdr: `launch_pending` start, event-driven `agent.wait`/`agent.prompt{wait}`, workspace closes with its last pane, `dirty_worktree_requires_force`, screens
- [x] daemon: `orchestration/` (run store with serialised saves, pure planner, git facts, event-driven orchestrator), control methods `orchestrate.plan|start|stop|list|get|status`, event `run.changed`, wired into resync/events/tick
- [x] cli `orchestrate …`, manifest actions `orchestrate-phase|phase-isolated|autonomous|stop|status`
- [x] dashboard: `o`/`w`/`a`/`x` with plan-first y/N lines, `Runs` rows, run events
- [x] `verify:m4` (planner unit tests, 6 orchestrator e2e tests vs fake Herdr, daemon + dashboard regression)
- [x] M5: `.github/workflows/ci.yml` (ubuntu + macos, pinned Herdr 0.9.0 + GSD-Core 1.14.0, gates M0–M5, `herdr plugin install` on the default branch), `scripts/e2e-herdr.cjs` (real Herdr, throwaway session), `verify:m5`, README (orchestration, degradation matrix incl. orchestration column, stance), TESTING.md, DECISIONS.md O1–O6 + M5, spec §13.1, COMPAT.md
- [x] Live: plan-only e2e green; `E2E_RUN=1` with a real Claude Code caught the no-driver split bug (O5), the reattach-during-startup bug, and the missing status transitions (H10/O7); the final live run completed split → trust dialog → answered → `/gsd-help` → working → done
- [x] Live after daemon restart: `milestone.lock` was blanking CharacterDossier's tokens → no longer treated as a lock (O8)
- [ ] Publish: `gh` installed to `~/.local/bin`; needs `gh auth login` by the owner, then `gh repo create VibrantClouds/herdr-gsd-core --public --source . --push` and `gh repo edit --add-topic herdr-plugin` (see "Exact next action")

### Environment (tested matrix, see docs/COMPAT.md)
Herdr 0.9.0 (protocol 22) · GSD-Core 1.14.0 · Node 24.21 (engine ≥22) · Claude Code 2.1.273 · OpenCode present · Codex absent.

### Build conventions
- TypeScript → CommonJS via `tsc -b`; tests are `src/**/*.test.ts` run with `node --test` from `dist/`.
- Zero runtime deps except `smol-toml`. Hook scripts are single-file bundles with no imports beyond Node builtins.
- On this machine use `/home/vibrantclouds/.local/bin/node` and `node node_modules/typescript/bin/tsc -b …` explicitly (zsh `command_not_found` shim recursion breaks bare `node`/`npx`).
- The Bash tool runs inside the owner's live Herdr pane: `HERDR_SOCKET_PATH` there is the **live** server. Scratch work must hardcode `~/.config/herdr/sessions/<name>/herdr.sock` (incident recorded in the M4 spike).
- `herdr plugin link` is global: every new session (including scratch ones) gets the linked plugin's `[[startup]]` daemon. The e2e script uses its own state/config dirs so the two daemons never share a pidfile.

### Evidence (session 2)
- Full chain before commit (2026-09-16): `npm test` 385 tests, 0 failures; `verify:m0`…`verify:m5` all checks passed (the M5 gate ran the real-Herdr e2e in a throwaway session).
- `scripts/e2e-herdr.cjs`: tokens on a fresh headless session in ~250 ms; `## Needs Human` → `blocked` and plan refused; phase and isolated plans ok; non-GSD command refused.

### Known gaps / follow-ups
- Codex hook events beyond `SessionStart` remain unverified against a real Codex install (M0-A follow-up "M0-B").
- The `[[startup]]`-spawned daemon of a *linked* checkout also appears in scratch sessions; harmless, but a future `herdr plugin link --session` scope would be cleaner (upstream ask).
- `ensureDaemon` treats "alive but not answering within 500 ms" as hung and restarts; a daemon under heavy event load could in theory be restarted mid-run (runs re-attach, so nothing is lost; watch `gsdd.log` for `run re-attached`).
- Daemon start-up takes ~8–13 s on projects where gsd-tools enrichment runs during the first resync (the control socket answers earlier; orchestrate.* requests wait for readiness). Tokens still appear within ~250 ms from the filesystem pass.
- A run that finished (`done`) leaves its pane open on purpose; `orchestrate stop` only tears down active runs.
- Claude Code's folder-trust dialog in fresh worktrees is documented (trust inherits from an ancestor); not automated by design.
- macOS untested locally; CI's `macos-latest` job is the first real check.

### Exact next action
1. Owner: `gh auth login` (the CLI is installed at `~/.local/bin/gh`, SSH to GitHub already works).
2. Then, from the repo root: `gh repo create VibrantClouds/herdr-gsd-core --public --source . --remote origin --push --description "Herdr plugin for GSD-Core: sidebar tokens, notifications, dashboard, supervised runs"` and `gh repo edit VibrantClouds/herdr-gsd-core --add-topic herdr-plugin --add-topic gsd --add-topic herdr`.
3. Watch the first CI run (macOS job is the untested platform); `herdr plugin install VibrantClouds/herdr-gsd-core --yes` from a clean machine closes M5.
4. On the live server: `herdr plugin action invoke daemon-restart --plugin herdr-gsd-core` after every rebuild so the running daemon picks up new code; `[orchestration] enabled = true` in `herdr plugin config-dir herdr-gsd-core`/config.toml to turn orchestration on.

## Session 1 — 2026-09-15

### Owner decisions (confirmed)
- Scope this session: M0 → M3. M4/M5 follow-up.
- Plugin id `herdr-gsd-core`; GitHub `VibrantClouds/herdr-gsd-core`; MIT.
- Claude Code adapter root: `$CLAUDE_CONFIG_DIR` else `~/.claude`; `--local <dir>` writes `<dir>/.claude/settings.json`. Project-local GSD installs are first-class (no `~/.claude` may exist).
- gsd-tools resolution order: project `.claude/gsd-core/bin/gsd-tools.cjs` → project `node_modules/.bin/gsd-tools` → config roots (`$CLAUDE_CONFIG_DIR`, `~/.claude`, `~/.claude-gsd`, `~/.codex`, `~/.config/opencode`)`/gsd-core/bin/gsd-tools.cjs` → PATH.
- Spec §0 assumptions 1–3 accepted at defaults.

### Task state
- [x] M0-H spike (docs/spikes/M0-H-herdr.md)
- [x] M0-G spike (docs/spikes/M0-G-gsd.md)
- [x] M0-A spike (docs/spikes/M0-A-hooks.md)
- [x] docs/DECISIONS.md, docs/COMPAT.md
- [x] spec.md §13 amendments appended (M0 exit, per §12.2)
- [x] M1 packages/core + tests ≥95% branch (138 tests, 97.6 % branch)
- [x] M1 herdr-client + fake-herdr (28 tests; smoke-tested read-only against live Herdr)
- [x] M1 daemon (watch → project → notify), cli, manifest, startup (59 daemon tests incl. e2e vs fake Herdr; live-verified on the owner's server)
- [x] M1 verify script (`npm run verify:m1` passes)
- [x] M2 adapters (111 tests; `verify:m2` passes; live adapter install NOT performed on the owner's real harness configs — manual checklist in docs/TESTING.md)
- [x] M3 dashboard (28 tests; `verify:m3` passes; live pane open/close verified)

### M0 evidence
| Spike file | Key command used | Capture file |
|---|---|---|
| docs/spikes/M0-H-herdr.md | `herdr api schema --json`; manual `pane.report_metadata`/`workspace.report_metadata` round-trip via raw socket | `docs/spikes/captures/M0-H-*.json` (envelope-and-errors, schema-params, session-snapshot, lists, get-and-process-info, metadata-livetest, events-catalogue) |
| docs/spikes/M0-G-gsd.md | `gsd-tools state-snapshot`, `phases list`, `progress`, `smart-entry --json`, `runtime-identity` (against 4 real `.planning` fixtures) | `docs/spikes/captures/M0-G-{cli,hooks,commands,statusline,parsers}.txt`; `test/fixtures/planning/1.14/` |
| docs/spikes/M0-A-hooks.md | raw-HTML fetch of `code.claude.com/docs/en/hooks`; `env`/`/proc/<pid>/environ` walk for `HERDR_PANE_ID`; read of GSD's own installer source for Codex/OpenCode | `test/fixtures/hooks/{claude-code,codex,opencode}/*.json`, provenance table in `test/fixtures/hooks/README.md` |

### Session 1 evidence
- `npm test`: 360 tests, 0 failures. `npm run verify`: M0–M3 all checks passed (2026-09-15).
- Live: plugin linked (`herdr plugin link . --enabled`), tokens visible on w1/w2 ~100 ms after daemon start, kill -9 recovery with seq strictly increasing, dashboard pane opened/closed.
- Incident: a research subagent ran `gsd-tools state planned-phase` against ~/Development/ProjectManager (a WRITE); restored from git within a minute. Read-only subcommand list now enforced in `packages/core/src/readonly.ts`.
