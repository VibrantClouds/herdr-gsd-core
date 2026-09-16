# herdr-gsd-core

A [Herdr](https://herdr.dev) plugin that observes [GSD-Core](https://github.com/opengsd/gsd-core) projects and projects their state into Herdr: sidebar tokens on every workspace that has a `.planning/`, pane tokens on the pane driving the GSD session, one notification per phase boundary, a dashboard pane, and (opt-in) supervised runs that start a harness in its own pane or worktree and send it GSD's own next command.

**Observability first, orchestration second.** The plugin never takes lifecycle authority over a pane (it only ever calls `pane.report_metadata` / `workspace.report_metadata`; Herdr's own detection says whether an agent is working, blocked or idle), never writes under `.planning/`, and never modifies GSD's own hooks.

## Install

```bash
herdr plugin install VibrantClouds/herdr-gsd-core --yes
```

Requirements: Herdr ≥ 0.9.0, Node ≥ 22, Linux or macOS. GSD-Core is optional at runtime: everything in the observer works from the `.planning/` filesystem alone. When `gsd-tools` is found (project-local `.claude/gsd-core/bin/gsd-tools.cjs`, `node_modules`, a config root such as `$CLAUDE_CONFIG_DIR`/`~/.claude`/`~/.claude-gsd`, or `PATH`) it is used for enrichment only, and only through read-only subcommands.

Local development:

```bash
npm ci && npm run build
herdr plugin link . --enabled
herdr plugin log list --plugin herdr-gsd-core
```

## What you get

Workspace tokens (render as `$gsd_phase` etc. in sidebar rows, see Herdr's `ui.sidebar` config):

| token | example | source |
|---|---|---|
| `gsd_phase` | `03 auth` | STATE.md current position / `.planning/state.json` |
| `gsd_step` | `execute 2/4` | step + plan index |
| `gsd_status` | `executing` · `blocked` · `paused` · `complete` | derived; `blocked` also when STATE.md carries `## Needs Human` or `## Deferred Verification` |
| `gsd_next` | `verify-work 3` | GSD's own `smart-entry` recommendation, falling back to a rule table |
| `gsd_err` | `gsd-tools missing` | only when something is wrong |

Pane tokens on the driver pane (need a harness adapter, TTL 90 s):

| token | example | source |
|---|---|---|
| `gsd_agent` | `executor` | open subagent span |
| `gsd_workers` | `2 active` | count of open spans |
| `gsd_tool` | `Bash git diff` | last tool call, TTL 15 s, redacted |
| `gsd_ctx` | `62%` | GSD statusline bridge file (Claude Code only) |

Notifications: one per coalesced change set (phase boundary, UAT appeared, paused, drift), per-category toggles in `config.toml`, suppressed when the pane is focused, retried once on Herdr rate limiting.

Dashboard: `herdr plugin pane open --plugin herdr-gsd-core --entrypoint dashboard` (or bind a key to it). `[enter]` on the recommended next command sends `/gsd-<next>` to the driver pane after a y/N confirmation and refuses when the driver agent is blocked. `o` / `w` / `a` start a supervised run (below) after a y/N line that states exactly what will happen, `x` stops the project's active run.

## Orchestration

Off by default. Turn it on with `[orchestration] enabled = true` in `config.toml`. Every run is planned first, and a plan that would fight GSD is refused with a sentence instead of started. What it does and does not do was decided by reading GSD-Core's own workflows and by live-testing every Herdr method involved (`docs/spikes/M4-orchestration.md`).

Units:

| action | what happens |
|---|---|
| `orchestrate-phase` | splits a pane next to the project's pane, starts the configured harness there, waits until it is idle, sends GSD's recommended next command (`$gsd_next`), and follows the run through Herdr's own agent states |
| `orchestrate-phase-isolated` | same, but first `worktree.create` on the branch GSD itself would use (`git.phase_branch_template` when `git.branching_strategy = "phase"`, else `<prefix>phase-NN-slug`), so GSD finds itself already on its phase branch; the main checkout stays untouched and you merge when done |
| `orchestrate-autonomous` | a supervised pane running `/gsd-autonomous [--from N] [--to M]`; the run reports `blocked`, notices `## Needs Human`, and (only with `resume_on_exit = true`) re-launches a *dead* session with GSD's own `--from` resume hint, within a budget |
| `orchestrate-stop` | interrupts the harness, then removes the worktree (kept and reported if it has uncommitted changes) or closes the pane the plugin created; nothing the plugin did not create is touched |
| `orchestrate-status` | notification + JSON listing of active runs |

The same commands exist on the CLI (`node packages/cli/dist/main.js orchestrate phase|isolated|autonomous|stop|list|status`, `--dry-run` to only plan) and in the dashboard.

Refused on purpose, because GSD's model does not support them: parallel phases of one roadmap (STATE.md has a single Current Position and `/gsd-progress --next` re-routes to the lowest incomplete phase), wave-level runs (waves are sequential by GSD's own gate), pane-per-plan (no such command), and `/gsd-workspace` as isolation (it creates a new, unrelated project).

Project states the planner respects before anything starts, and again before each prompt: project health (locked, parse error, no planning), `## Needs Human` / `## Deferred Verification` / non-empty blockers in STATE.md, paused projects (only `/gsd-resume-work` is offered), a completed roadmap, another active run on the same repository (one per repository, always), a harness session that is already working or blocked in the project's pane, and for isolation: `.planning/STATE.md` must be tracked by git (`commit_docs`), `git.branching_strategy` must not be `milestone`, and the branch must not collide with GSD's reserved executor-worktree names. `workflow.use_worktrees`, `parallelization`, `mode` and `workflow.auto_advance` only annotate the run with warnings.

The harness inherits the shell environment of the pane it starts in. If GSD is installed in a separate Claude config root (for example `~/.claude-gsd`), a plain `claude` will not know the `/gsd-*` commands, so give the run that root: `[harness.claude-code.env] CLAUDE_CONFIG_DIR = "/home/me/.claude-gsd"`. That table is applied to the pane a non-isolated run splits; Herdr's `worktree.create` has no env parameter, so worktree panes inherit the shell environment only (the run carries a warning when env is configured).

Claude Code's folder-trust dialog appears the first time it starts in a new worktree path; Herdr reports it as `blocked`, the run waits and notifies you, and continues when you answer. Trust is inherited from a trusted ancestor directory, so opening Claude Code once in `~/.herdr/worktrees` and accepting is a one-time fix; the plugin never edits `~/.claude.json`.

`config.toml`:

```toml
[orchestration]
enabled = false                  # off by default
harness = "claude-code"          # which [harness.*] table to start ([harness.claude-code] command = ["claude"])
worktree_branch_prefix = "gsd/"  # used when the project's git.branching_strategy is "none"
max_parallel = 3                 # across different repositories; one repository never runs more than one
isolation = "worktree"           # worktree|none
start_timeout_ms = 60000         # harness must reach idle within this, else the run waits for you
split_direction = "right"        # right|down for non-isolated runs

[orchestration.autonomous]
resume_on_exit = false           # re-launch a dead /gsd-autonomous session with GSD's own resume command
max_resumes = 3
max_wall_clock_min = 480
```

Run records live under the plugin state dir (`orchestration/<run-id>.json`) and survive daemon restarts: the daemon re-attaches to the pane by id and picks the state machine up from Herdr's current agent status.

## Harness adapters (optional)

Adapters add hook entries to the harness so tool/subagent activity shows on the pane. They are additive and marker-free: the plugin owns exactly the entries whose command points at its own hook script, and `uninstall` removes exactly those, leaving the file otherwise byte-identical.

```bash
herdr-gsd adapter install claude-code            # $CLAUDE_CONFIG_DIR or ~/.claude/settings.json
herdr-gsd adapter install claude-code --local .  # <project>/.claude/settings.json (project-local GSD)
herdr-gsd adapter install codex                  # ~/.codex/hooks.json
herdr-gsd adapter install opencode               # ~/.config/opencode/plugins/herdr-gsd-core.js
herdr-gsd adapter doctor claude-code
herdr-gsd adapter uninstall claude-code
```

`herdr-gsd` is `node <plugin-root>/packages/cli/dist/main.js`; from a linked checkout use `node packages/cli/dist/main.js …`.

### Degradation matrix

| harness | subagent spans | tool activity | context % | orchestration | notes |
|---|---|---|---|---|---|
| Claude Code | exact (`SubagentStart`/`SubagentStop`) | yes | yes (statusline bridge) | yes (`kind = claude`) | reference; folder-trust dialog handled as `blocked` |
| Codex | start-only + 15 min TTL | post only | no | yes (`kind = codex`) | hook schema beyond `SessionStart` unverified against a real install |
| OpenCode / Kilo | via plugin event bus | yes | no | yes (`kind = opencode` / `kilo`) | |
| pi / others | none | none | no | yes if Herdr can start the kind | filesystem-only; all observer features still work |

Orchestration needs Herdr to be able to start and detect the harness (`agent.start` kinds: `claude`, `codex`, `opencode`, `kilo`, `pi`, …); the planner refuses any `[harness.*] command` whose executable is not one of them.

## Configuration

`herdr plugin config-dir herdr-gsd-core` prints the config directory; `herdr-gsd config init` writes a commented `config.toml` with every default (notification toggles, agent view, harness commands, orchestration).

## Design notes

- One long-lived daemon (`gsdd`) per Herdr server socket, spawned by the plugin's `[[startup]]` hook and re-ensured by every action. Herdr does not supervise plugins, so the daemon supervises itself: pidfile + control-socket ping, stale pidfile restart, crash-loop guard (3 exits in 60 s → `gsdd.disabled` + one notification).
- The filesystem is primary; hooks are enrichment. `.planning/state.json` (GSD's published contract) is read first, `STATE.md`/`ROADMAP.md`/phase directories are the fallback, parsed with the same rules GSD uses.
- All Herdr metadata carries `source = "plugin:herdr-gsd-core"` and a wall-clock-floored `seq`, so a restarted daemon never has its reports silently dropped.
- Orchestration is event-driven: after one bounded `agent.wait` at start-up, runs follow the `pane.updated` status diffs the daemon already receives, so a daemon restart loses nothing.
- Verified facts about Herdr 0.9.0 and GSD-Core 1.14.0 live in `docs/spikes/`, the resulting decisions in `docs/DECISIONS.md`, the tested version matrix in `docs/COMPAT.md`, and the spec deltas in `spec.md` §13.

## Testing

`npm test` runs every unit and fake-Herdr test; `npm run verify` runs the milestone gates M0–M5. The M5 gate runs `scripts/e2e-herdr.cjs` against a real `herdr` server in a throwaway `--session` when the binary is on `PATH` (CI installs the pinned one); `E2E_RUN=1` additionally starts a real harness run. See `docs/TESTING.md`.

## Non-goals (v1)

No pane per GSD subagent, no streaming of subagent output, no writes to `.planning/`, no parallel phases of one roadmap, no Windows, no cross-machine federation, no replacement of Herdr's own agent detection.

## License

MIT
