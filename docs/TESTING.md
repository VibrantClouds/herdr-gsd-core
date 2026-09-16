# Testing

## Automated

```bash
npm ci && npm run build
npm test              # every compiled *.test.js across the workspace (node --test)
npm run verify        # M0 → M5 gates, each prints ok/FAIL lines and an output hash
npm run e2e:herdr     # real Herdr server in a throwaway --session (needs `herdr` on PATH)
```

| gate | what it proves |
|---|---|
| `verify:m0` | spike docs, decisions, compat matrix, fixtures present; every VERIFY item has a decision |
| `verify:m1` | `packages/core` ≥ 95 % branch coverage; herdr-client + fake-herdr; daemon e2e against the fake Herdr (tokens on bind, STATE change → tokens + exactly one notification, kill/restart with strictly increasing `seq`, rate-limit retry, lock handling, socket loss exit) |
| `verify:m2` | hook bundles are single files with Node builtins only; every recorded/doc-derived payload → exit 0 + one spool line; p99 < 500 ms (observed ~20 ms); redaction fixtures never leak; install → uninstall byte-identical on files with unrelated hooks |
| `verify:m3` | dashboard render fixtures, client reconnect, `--once` renders < 500 ms, `prompt.send` refusal when blocked |
| `verify:m4` | planner unit tests (every project-state guard, branch naming, command normalisation); orchestrator e2e against the fake Herdr: phase run lifecycle (`pane.split` → `agent.start` → `agent.wait` → `agent.prompt` → working → idle = done), startup dialog (`blocked`) → waiting → prompt on idle, stalled prompt captured from the screen and never resent, isolated run (`worktree.create` on the GSD branch, `agent_blocked` → waiting, dirty worktree kept on stop, removed with `--discard`), daemon restart re-attaches and a dead autonomous session is resumed once with GSD's `--from` hint, `## Needs Human` → waiting/human_stop and released when cleared; dashboard keys `o`/`w`/`a`/`x` |
| `verify:m5` | CI workflow present and pinned (Herdr 0.9.0, GSD-Core 1.14.0, ubuntu + macos), manifest build commands are exactly `npm ci` + `npm run build`, marketplace metadata, README sections, and the real-Herdr e2e when a `herdr` binary is on `PATH` |

The fake Herdr (`test/fake-herdr`) reproduces the shapes captured in `docs/spikes/captures/` and the server's quirks (one request per connection, seq high-water drops, token limits, `rate_limited` as a result reason, `agent.start` returning `launch_pending`, event-driven `agent.wait` with `timeout`, the workspace closing with its last pane, `dirty_worktree_requires_force`).

### Real-Herdr e2e (`scripts/e2e-herdr.cjs`)

Starts `herdr --session <name> server` headless, seeds a git repo from the `executing` fixture, opens it as a workspace, runs this plugin's daemon against that session with its own state and config dirs (orchestration enabled), and asserts through `herdr api snapshot` that the workspace tokens appear, that a `## Needs Human` section flips `gsd_status` to `blocked` and makes the planner refuse, and that phase and isolated plans succeed while a non-GSD command is refused. It stops the daemon and the session and removes its temp dirs. Never touches the default session.

`E2E_RUN=1` additionally starts a real harness run (`E2E_COMMAND`, default `help`, is sent as `/gsd-help`), waits for it to settle, and stops it. `E2E_HARNESS_ENV="CLAUDE_CONFIG_DIR=/path/to/gsd-config-root"` gives the harness the config root where GSD is installed (a plain `claude` may not know `/gsd-*`). Claude Code shows its folder-trust dialog in the fresh repo; the run reports it as `waiting/startup_input` and, with `E2E_ANSWER_TRUST=1`, the script accepts it the way a user would (it is a throwaway repo the script created) so the prompt path is exercised too. `E2E_REPO_DIR=<dir>` places the repo under a chosen parent.

Because `herdr plugin link` is global, a linked checkout also spawns the owner's daemon into every new session via `[[startup]]`; the e2e's daemon uses a separate state dir, so the two never share a pidfile or a control socket.

## Live checks performed on 2026-09-15/16 (Herdr 0.9.0, GSD-Core 1.14.0, Claude Code 2.1.273)

- `herdr plugin link . --enabled` registers the plugin; `herdr plugin action invoke herdr-gsd-core.status` starts `gsdd`.
- Two real GSD workspaces received `$gsd_phase $gsd_step $gsd_status $gsd_next` ~100 ms after daemon start (one project used a global `~/.claude-gsd` gsd-tools, the other a project-local `.claude/gsd-core`).
- `kill -9` of `gsdd` then any action restored it; tokens re-reported with strictly increasing `seq`.
- `herdr plugin pane open --plugin herdr-gsd-core --entrypoint dashboard` rendered the dashboard in a split pane; `herdr plugin pane close <id>` closed it.
- M4 spike (`docs/spikes/M4-orchestration.md`): in a scratch `herdr --session gsd-spike`, `worktree.create` → `agent.start claude` → folder-trust dialog reported `blocked` → `agent.send_keys` → idle → `agent.prompt` with `wait` settled `done` in 2.3 s → `worktree.remove` closed the workspace with no orphan process; `pane.close` on the last pane closes the workspace and orphans the checkout (so isolated runs remove the worktree first); dirty worktrees answer `dirty_worktree_requires_force`.
- `scripts/e2e-herdr.cjs` (plan-only and `E2E_RUN=1 E2E_HARNESS_ENV=CLAUDE_CONFIG_DIR=~/.claude-gsd E2E_ANSWER_TRUST=1`) against fresh headless sessions. The live runs caught three real bugs, all fixed and covered: a project without a harness pane had nothing to split from; a run created while the daemon was still starting was "re-attached" against a stale pane map; and `pane.updated` never carried the harness's status transitions, so the daemon now keeps a pane-scoped `pane.agent_status_changed` subscription (spike H10). The final live run: pane split with the GSD config root → Claude Code started → folder-trust dialog reported as `waiting/startup_input` → answered → `/gsd-help` sent → 11 s of work observed → run `done`.
- Live after the daemon restart: a workspace whose project holds GSD's advisory `milestone.lock` showed no phase; the lock list now excludes it (DECISIONS O8).
- Not performed on the live server: `herdr server stop`/start (it hosts the owner's sessions). Covered by the daemon restart test instead; the `[[startup]]` hook re-runs `daemon ensure` on server start.

## Manual checklist: adapters (cannot run headless in CI)

Claude Code cannot run hooks in CI without an account, so this is a manual pass.

1. `node packages/cli/dist/main.js adapter install claude-code` (or `--local <project>` for a project-local GSD install). `adapter doctor claude-code` must print only `ok` lines.
2. Open the project in a Herdr workspace, start `claude` in a pane, run `/gsd-execute-phase N` (or any GSD command that dispatches subagents).
3. Expect on that pane within a few seconds: `$gsd_agent` (e.g. `executor`), `$gsd_workers` (`1 active`), `$gsd_tool` (e.g. `Bash pnpm test`, disappears 15 s after the last tool call), `$gsd_ctx` (context %, from the GSD statusline bridge).
4. Stop the session; `$gsd_agent`/`$gsd_workers` clear, the 90 s TTL removes the rest.
5. `adapter uninstall claude-code`; `diff` the settings file against the pre-install `.bak` — only our entries may differ (byte-identical when nothing else changed).
6. Repeat for Codex (`~/.codex/hooks.json`; only `SessionStart` has a verified precedent) and OpenCode (`~/.config/opencode/plugins/herdr-gsd-core.js`).

## Manual checklist: orchestration on a real project

1. `[orchestration] enabled = true` in `config.toml` (`herdr plugin config-dir herdr-gsd-core`), restart the daemon (`GSD: restart daemon` action).
2. In a GSD workspace, invoke `GSD: run next step in a new pane`. Expect: a new pane to the right, the harness starting, the recommended `/gsd-…` command typed once the harness is idle, a `GSD run done` notification when it settles. `orchestrate list` (CLI) or the dashboard `Runs` row shows the record.
3. `GSD: run current phase in a worktree`. Expect: a new worktree workspace on `gsd/phase-NN-slug` (or your `git.phase_branch_template`), the harness in its root pane; on first use Claude Code shows the folder-trust dialog → run `waiting/startup_input` + notification; after you accept, the command is sent.
4. `GSD: stop this workspace's run` from the worktree workspace: the harness is interrupted and the worktree removed when clean; with uncommitted changes the workspace stays open and the run says `worktree kept`; `orchestrate stop --discard` removes it.
5. Add `## Needs Human` to STATE.md: `gsd_status` becomes `blocked`, every orchestrate action is refused with the marker text; remove it and the refusal clears.

## Failure injection covered by tests

kill daemon mid-report (restart test), corrupt spool line (`spool.test`), `STATE.md.lock` held (`gsdd.test`, `lock.test`), Herdr socket disappears (`gsdd.test` tick), `gsd-tools` absent (filesystem-only mode is the default in daemon tests), watcher failure → polling (`watcher.test`), daemon restart mid-run and a dead harness session (`orchestrator.test`), startup dialog and stalled prompt (`orchestrator.test`), dirty worktree on stop (`orchestrator.test`, fake `dirtyWorktrees`).
