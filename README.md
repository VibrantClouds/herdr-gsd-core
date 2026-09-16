# herdr-gsd-core

A [Herdr](https://herdr.dev) plugin for [GSD-Core](https://github.com/opengsd/gsd-core) projects. It reads each project's `.planning/` and shows where the project is, right in Herdr: phase and status tokens in the sidebar, a notification when a phase changes or GSD is waiting for you, a dashboard pane, and (opt-in) supervised runs that start your coding agent in its own pane or worktree and hand it GSD's next command.

<!-- screenshot: Herdr sidebar with $gsd_phase $gsd_status tokens on two workspaces, and the dashboard pane open -->
![Herdr sidebar showing GSD phase tokens and the dashboard pane](docs/images/overview.png)

The plugin only reports. It never takes lifecycle authority over a pane (it uses `pane.report_metadata` and `workspace.report_metadata` only; Herdr's own detection decides whether an agent is working, blocked or idle), never writes under `.planning/`, and never touches GSD's own hooks.

## Install

```bash
herdr plugin install VibrantClouds/herdr-gsd-core --yes
```

Requirements: Herdr 0.9.0 or newer, Node 22 or newer, Linux or macOS. GSD-Core itself is optional at runtime; when `gsd-tools` is found it is used for extra detail, read-only.

## What appears where

- **Sidebar**: one extra line of text on each GSD workspace's row (for example `04 Images executing`), and on agent rows when an adapter is installed. It is a row layout, not a panel; step 2 below switches it on.
- **Notifications**: a desktop or Herdr toast when a phase changes, a UAT file appears, the project is paused, or the agent is waiting for you.
- **Dashboard pane**: the full progress view (phases, plans, blockers, next command, runs, activity). It is a pane you open with the action **GSD: open dashboard pane**, a key bound to it, or `herdr plugin pane open --plugin herdr-gsd-core --entrypoint dashboard`. It does not open by itself.
- **Supervised runs** (opt-in): a new pane or worktree in which your agent runs GSD's next command, tracked in the dashboard.

## Quick start

1. Install, then open or restart Herdr. The plugin's daemon starts and reports `$gsd_phase $gsd_step $gsd_status $gsd_next` on every workspace whose repository has a `.planning/`.
2. Tell Herdr's sidebar to draw them. Herdr only renders plugin tokens that a row layout names, so add them to **Herdr's own** `~/.config/herdr/config.toml` and run `herdr server reload-config`:

   ```toml
   [ui.sidebar.spaces]
   rows = [["state_icon", "workspace"], ["branch", "git_status"], ["$gsd_phase", "$gsd_status"]]

   [ui.sidebar.agents]
   rows = [["state_icon", "machine", "workspace", "tab"], ["agent", "$gsd_agent", "$gsd_tool"]]
   ```

   Any `$gsd_*` token can go in either layout; Herdr's `ui.sidebar.*.rows` reference documents per-token colours and rules. Without this step nothing is visible except notifications and the dashboard pane.
3. Run the action **GSD: show config file** from Herdr's action palette. It creates `config.toml` if it does not exist yet and shows its path in a notification (normally `~/.config/herdr/plugins/config/herdr-gsd-core/config.toml`).
4. Edit the file. To turn on supervised runs, set `enabled = true` under `[orchestration]`. If GSD is installed in a separate Claude config root, add its path under `[harness.claude-code.env]` (see Orchestration).
5. Run the action **GSD: restart daemon**. The daemon reads the file only when it starts.
6. Open the dashboard with the action **GSD: open dashboard pane**. To bind a key, add to Herdr's `config.toml`:

   ```toml
   [[keys.command]]
   key = "prefix+g"
   type = "plugin_action"
   command = "herdr-gsd-core.dashboard"
   description = "GSD dashboard"
   ```

7. Optional: install a harness adapter for tool-level activity on the pane (below).

## Updating

Herdr has no `plugin update`; reinstalling replaces the managed checkout and keeps your config and state:

```bash
herdr plugin install VibrantClouds/herdr-gsd-core --yes
```

Then run the action **GSD: restart daemon** so the running daemon picks up the new code (Herdr re-reads the manifest and actions on its own).

## What you see

**Sidebar tokens** on every workspace bound to a GSD project. Add them to your sidebar row format in Herdr's `config.toml` (`ui.sidebar`), for example `$gsd_phase · $gsd_status`.

| token | example | meaning |
|---|---|---|
| `gsd_phase` | `03 auth` | current phase |
| `gsd_step` | `execute 2/4` | current step, plan index of total |
| `gsd_status` | `executing`, `verifying`, `blocked`, `paused`, `complete` | `blocked` also when STATE.md has `## Needs Human`, `## Deferred Verification` or blockers |
| `gsd_next` | `verify-work 3` | GSD's own recommended next command |
| `gsd_err` | `STATE.md locked` | only when something is wrong |

**Pane tokens** on the pane that runs the GSD session, when a harness adapter is installed: `gsd_agent` (the subagent working now), `gsd_workers` (how many), `gsd_tool` (last tool call, redacted, 15 s), `gsd_ctx` (context use, Claude Code only).

<!-- screenshot: a pane row showing $gsd_agent executor · $gsd_tool Bash pnpm test -->
![Pane tokens showing the active subagent and tool](docs/images/pane-tokens.png)

**Notifications** for a phase change, a new UAT file, a pause, and when the driver agent is waiting for you. Each category can be switched off in `[notify]`; notifications are suppressed while that pane is focused.

**Dashboard pane**: `herdr plugin pane open --plugin herdr-gsd-core --entrypoint dashboard`, or bind it to a key.

<!-- screenshot: the dashboard pane at 80x24 with phases, plans, next, runs and activity rows -->
![Dashboard pane](docs/images/dashboard.png)

| key | action |
|---|---|
| `enter` | send `/gsd-<next>` to the driver pane, after y/N; refused while the agent is blocked |
| `o` | start a supervised run of the next command in a new pane, after y/N |
| `w` | same, in a new worktree on the phase branch |
| `a` | start a supervised `/gsd-autonomous` |
| `x` | stop the project's active run, after y/N |
| `tab` | next project · `r` rescan · `n` test notification · `q` quit |

## Configuration

One file: `config.toml` in the directory `herdr plugin config-dir herdr-gsd-core` prints. The **GSD: show config file** action creates it with every key present and commented; **GSD: restart daemon** applies changes. `config show` on the CLI prints the effective configuration and warns about unknown keys or bad values.

Minimal file to turn on supervised runs:

```toml
[orchestration]
enabled = true

[harness.claude-code.env]
CLAUDE_CONFIG_DIR = "/home/me/.claude-gsd"   # only if GSD lives in a separate Claude config root
```

All keys, with defaults:

| table | key | default | meaning |
|---|---|---|---|
| `[notify]` | `phase_boundary`, `blocked`, `uat_ready`, `drift` | `true`, `true`, `true`, `false` | per-category switches |
| | `quiet_when_focused` | `true` | no notification for the focused pane |
| | `sound` | `"done"` | `none`, `done` or `request` |
| `[views]` | `enabled` | `false` | apply a "gsd" agent view (replaces your current view) |
| `[harness.<name>]` | `command` | `["claude"]` | executable Herdr starts for runs; must be a kind Herdr can detect (`claude`, `codex`, `opencode`, `kilo`, `pi`, …) |
| `[harness.<name>.env]` | any | none | environment for the pane a run splits (not applied to worktree panes) |
| `[orchestration]` | `enabled` | `false` | supervised runs on or off |
| | `harness` | `"claude-code"` | which `[harness.*]` table to use |
| | `isolation` | `"worktree"` | `worktree` or `none` |
| | `worktree_branch_prefix` | `"gsd/"` | branch prefix when the project's `git.branching_strategy` is `none` |
| | `max_parallel` | `3` | active runs across different repositories; one repository never runs more than one |
| | `start_timeout_ms` | `60000` | how long the harness may take to reach a prompt before the run waits for you |
| | `split_direction` | `"right"` | `right` or `down` |
| `[orchestration.autonomous]` | `resume_on_exit` | `false` | re-launch a dead `/gsd-autonomous` session with GSD's own resume command |
| | `max_resumes`, `max_wall_clock_min` | `3`, `480` | budget for that |
| `[projects]` | `autodiscover` | `true` | bind workspaces whose repo contains `.planning/` |
| `[log]` | `level` | `"info"` | `debug`, `info`, `warn`, `error` |

## Orchestration

Off by default. A run is planned first; if it would fight GSD or the project is not in a state to run, it is refused with a plain-language reason and nothing is started.

| action | what happens |
|---|---|
| **GSD: run next step in a new pane** (`orchestrate-phase`) | splits a pane next to the project's pane, starts the harness, waits until it is at its prompt, sends GSD's recommended next command, and follows the run through Herdr's agent states |
| **GSD: run current phase in a worktree** (`orchestrate-phase-isolated`) | same, but first creates a worktree on the branch GSD itself would use (your `git.phase_branch_template` when `git.branching_strategy = "phase"`, else `gsd/phase-NN-slug`); your main checkout stays untouched and you merge when done |
| **GSD: start supervised /gsd-autonomous** (`orchestrate-autonomous`) | a supervised pane running `/gsd-autonomous`; you are notified when it is blocked or when STATE.md says a human is needed; with `resume_on_exit = true` a session that died is re-launched with GSD's own `--from` hint |
| **GSD: stop this workspace's run** (`orchestrate-stop`) | interrupts the harness, then removes the worktree (kept and reported if it has uncommitted changes) or closes the pane the plugin created |
| **GSD: orchestration status** (`orchestrate-status`) | notification and listing of active runs |

<!-- screenshot: a run in progress — the split pane with Claude Code working, the dashboard Runs row showing "running /gsd-execute-phase 3 → w1:p2" -->
![A supervised run in progress](docs/images/orchestration-run.png)

A run reports `waiting` and notifies you when the agent asks a question, when it has not reacted to the prompt, or when STATE.md gains `## Needs Human`. It ends `done` when the harness settles after working. Records survive daemon restarts.

The planner refuses when: the project is locked, unparsable or has no phases; STATE.md has `## Needs Human`, `## Deferred Verification` or blockers; the project is paused (only `/gsd-resume-work` is offered); every phase is complete; another run is active on the same repository; a harness session is already working or blocked in the project's pane. Worktree runs additionally need `.planning/` tracked by git (`commit_docs`) and a `git.branching_strategy` other than `milestone`. Not offered at all: parallel phases of one roadmap, wave-level runs, pane-per-plan, and `/gsd-workspace` as isolation; GSD's model does not support them.

Two practical notes:

- The harness inherits the environment of the pane it starts in. If GSD is installed in a separate Claude config root, a plain `claude` will not know `/gsd-*`; set `[harness.claude-code.env] CLAUDE_CONFIG_DIR`. That applies to split panes only, because Herdr's worktree creation has no environment parameter.
- Claude Code asks whether to trust a folder the first time it starts in a new worktree path. The run reports `waiting`, notifies you, and continues once you answer. Trust is inherited from a trusted parent directory, so accepting once in `~/.herdr/worktrees` covers future worktrees. The plugin never edits `~/.claude.json`.

## Harness adapters (optional)

Adapters add hook entries to the harness so subagent and tool activity shows on the pane. They only add entries whose command points at the plugin's own hook script, and `uninstall` removes exactly those.

```bash
herdr-gsd adapter install claude-code            # $CLAUDE_CONFIG_DIR or ~/.claude/settings.json
herdr-gsd adapter install claude-code --local .  # <project>/.claude/settings.json for a project-local GSD
herdr-gsd adapter install codex                  # ~/.codex/hooks.json
herdr-gsd adapter install opencode               # ~/.config/opencode/plugins/herdr-gsd-core.js
herdr-gsd adapter doctor claude-code
herdr-gsd adapter uninstall claude-code
```

### Degradation matrix

| harness | subagent spans | tool activity | context % | orchestration |
|---|---|---|---|---|
| Claude Code | exact | yes | yes | yes |
| Codex | start only, 15 min TTL | after each tool | no | yes (hooks beyond `SessionStart` unverified on a real install) |
| OpenCode / Kilo | via plugin event bus | yes | no | yes |
| pi / others | none | none | no | if Herdr can start the kind |

Everything in "What you see" except pane tokens works with no adapter at all.

## CLI

`herdr-gsd` is `node <plugin-root>/packages/cli/dist/main.js`; `herdr plugin list` prints the plugin root. Add `--json` for machine output.

| command | purpose |
|---|---|
| `status` | daemon, projects, bindings, active runs |
| `config init` / `config path` / `config show` | create the config file if missing / print its path / print the effective config with warnings |
| `daemon ensure|restart|stop|status` | daemon control |
| `project list|rescan` | bound projects |
| `orchestrate plan --root <dir> [--unit phase-isolated] [--command "<gsd cmd>"]` | plan only; prints the reasons a run would be refused |
| `orchestrate phase|isolated|autonomous [--root <dir>] [--command …] [--phase N] [--from N --to N] [--dry-run]` | start a run |
| `orchestrate stop [--run <id>] [--discard]` / `list` / `status` | manage runs; `--discard` removes a dirty worktree |
| `adapter install|uninstall|doctor <claude-code|codex|opencode> [--local <dir>]` | harness adapters |

## Troubleshooting

- **No tokens on a workspace.** The repository needs `.planning/STATE.md` or `PROJECT.md`. Run **GSD: status**, or `herdr plugin log list --plugin herdr-gsd-core` for the daemon's start-up log.
- **`gsd_err` shows `STATE.md locked`.** GSD is writing; tokens keep their previous values and recover when the lock goes away.
- **The daemon stopped restarting.** After three crashes in a minute it writes `gsdd.disabled` in the plugin state dir with the last error; **GSD: restart daemon** clears it.
- **A run was refused.** `orchestrate plan --root <project>` prints every reason.
- **A worktree stayed on disk after stopping a run.** It had uncommitted changes; `orchestrate stop --run <id> --discard` removes it, or clean it up with `git worktree remove`.

## Development

`npm ci && npm run build`, then `herdr plugin link . --enabled`. `npm test` runs the unit and fake-Herdr tests; `npm run verify` runs the milestone gates, including an end-to-end run against a real `herdr` server in a throwaway session. Design decisions, the tested version matrix and the live findings the design rests on are in `docs/` (`DECISIONS.md`, `COMPAT.md`, `TESTING.md`, `spikes/`).

## License

MIT
