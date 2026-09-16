---
phase: 02-execution-worktree-runner-billing-safety
verified: 2026-07-26T17:17:51Z
status: gaps_found
score: 4/6 roadmap success criteria verified (1 behavior-unverified, 1 partial-fail)
behavior_unverified: 1
overrides_applied: 0
data_integrity_note: >
  ROADMAP.md tags this phase `Mode: mvp`, but the Goal line is written as a
  first-person capability statement ("I can create a task..."), not the
  `As a … I want to … so that …` form `gsd_run query user-story.validate`
  requires (confirmed invalid: missing role/capability/outcome slots and
  terminal period). This was already noticed by the executor — 02-04-PLAN.md
  carries an explicit MVP-mode note declining to invent a user story and
  proceeding under the roadmap's existing 6 detailed Success Criteria instead.
  Given the phase demonstrably was NOT executed as an MVP vertical slice (12
  plans, 43 requirement IDs, full technical criteria), this verification
  follows the same precedent: full goal-backward verification against the 6
  ROADMAP Success Criteria, not the MVP User Flow Coverage format. Flagging
  for a human to either fix the ROADMAP Mode tag or accept this as intentional.
gaps:
  - truth: "A task records turns used and duration ... (Success Criterion 4)"
    status: partial
    reason: >
      turnsUsed, cancel-mid-run, concurrency cap, per-task model routing, and
      the kill switch are all genuinely implemented and verified. "duration"
      is NOT: `tasks.startedAt`/`tasks.endedAt` are stored as raw ISO
      timestamps, but no derived duration value (in seconds or otherwise) is
      ever computed or surfaced anywhere in the CLI, HTTP API, or database.
      `taskColumns` in src/cli/index.ts has no DURATION column. TASK-05 is
      correctly left unchecked in REQUIREMENTS.md — this is the one Pending
      marker in the phase that accurately reflects a real gap.
    artifacts:
      - path: src/tasks/service.ts
        issue: "No durationSeconds/duration field computed from startedAt/endedAt"
      - path: src/cli/index.ts
        issue: "taskColumns (line ~143) has no DURATION column"
    missing:
      - "A derived duration-in-seconds value, computed from startedAt/endedAt (or from the runner's own durationMs), persisted or computed at the API/CLI presentation boundary and exposed to `fleet task show`."
  - truth: "RUN-06: Sessions can be continued via --resume with the stored session id"
    status: failed
    reason: >
      buildSpawnArgv() correctly appends `--resume <id> --fork-session` when
      given a resumeSessionId (unit-tested in worktree-runner.test.ts, "resume
      argv (RUN-06)"), but this is a pure function capability with NO
      production call site. WorktreeRunner.spawn() never passes
      resumeSessionId to buildSpawnArgv. There is no CLI subcommand
      (`fleet task resume`), no HTTP route (`POST /tasks/:id/resume`), and no
      Scheduler code path that ever supplies a stored session_id back into a
      new spawn. This is a "built but unwired" primitive of exactly the kind
      already caught twice in this phase for `pauseForRateLimit`/
      `cancelQueued` (both since fixed) — RUN-06 was not re-checked and
      remains unwired. 02-06-SUMMARY.md's frontmatter claims
      `requirements-completed: [... RUN-06 ...]`, which overstates what the
      code delivers; REQUIREMENTS.md itself correctly leaves RUN-06 unchecked.
    artifacts:
      - path: src/runner/worktree-runner.ts
        issue: "spawn() builds argv without ever passing resumeSessionId (line ~443)"
    missing:
      - "A CLI/HTTP surface (e.g. `fleet task resume <id>`, `POST /tasks/:id/resume`) that reads a task's stored session_id and re-spawns WorktreeRunner with resumeSessionId set."
human_verification:
  - test: "Success Criterion 6: profile skills and MCP tools are actually invocable by a real Claude Code session under a Fleet-set CLAUDE_CONFIG_DIR while --setting-sources is pinned to ''"
    expected: "A real spawn's system/init line lists the placed skill under `skills` and the declared server under `mcp_servers`; a real task actually invokes the skill or an MCP tool (confirmed via `fleet task events`); apiKeySource still reads 'none'."
    why_human: >
      This is D-37's explicitly unresolved contingency, gated behind plan
      02-12's Task 3 (`checkpoint:human-verify`, `gate="blocking"`), which
      requires a real authenticated `claude` CLI invocation against a genuine
      subscription, a real skill directory outside ~/.claude, and a real
      `agent_profiles` entry in the operator's actual <FLEET_HOME>/config.json.
      Not run in this execution. Only the argv/env WIRING is proven (hermetic
      fixture test in agent-capability.integration.test.ts) — real
      invocability is unproven by construction.
  - test: "Phase gate: one real end-to-end task against the daemon and a genuine Claude subscription (02-10 Task 2)"
    expected: "npm run spikes exits 0 against the currently-installed claude/git versions; one real daemon-driven task reaches a terminal state; apiKeySource observed 'none' on the real run."
    why_human: >
      Requires real subscription billing and a running daemon; explicitly
      deferred by the user per the orchestrator's known-state brief. Steps 1-3
      already ran and passed (git 2.55.0, claude 2.1.220, auth status
      loggedIn/claude.ai/max, apiKeySource "none", npm run spikes 4/4 exit 0)
      per 02-10-SUMMARY.md. Step 4 (the live task) was deferred by the user.
---

# Phase 2: Execution — Worktree, Runner & Billing Safety Verification Report

**Phase Goal:** I can create a task against a registered project and Fleet reliably provisions an isolated worktree, spawns a billing-safe headless Claude Code session with explicit caps, and tracks it to completion
**Verified:** 2026-07-26T17:17:51Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Creating a task provisions an isolated git worktree on a uniquely-named branch, runs `.fleet.yml` setup, and locks the worktree while active | VERIFIED | `ensureWorktree()` (`src/runner/worktree-manager.ts`) implements the full 4-step idempotent algorithm (prune → detect-registered → attach-existing → clear-stray-and-retry), `runSetupCommands()` runs `.fleet.yml` setup under the worker's own starved env, `ensureLocked()` locks immediately after `add`. Proven end-to-end (not just unit-level) by `worktree-runner.integration.test.ts` against a real scratch git repo with a real bare "remote": branch-name regex, `git check-ref-format --branch`, `git worktree list --porcelain` lock-line assertions, idempotent double-call test. |
| 2 | Fleet spawns headless `claude -p --output-format stream-json` with explicit `--allowedTools`, `--permission-mode`, `--max-turns`, wall-clock cap, and killing/timing out leaves no orphaned children | VERIFIED (see gap note below) | `buildSpawnArgv()` emits every named flag exactly once (asserted by `it.each` across input combinations in `worktree-runner.test.ts`); `killTree()` sends `SIGTERM`→`SIGKILL` against the negative PID (whole process group). The integration test "kills a hung session at its wall-clock cap..." spawns a REAL child+grandchild process tree, waits for the 500ms cap to fire, and asserts both PIDs return `ESRCH` (genuinely dead) via `process.kill(pid, 0)` polling — this is a real behavioral proof, not a mock. **Caveat (not severe enough to fail this criterion, but a real gap — see Requirements Coverage):** the wall-clock cap that actually fires in production is always the hardcoded 30-minute default; `tasks.wallClockCapMs` (resolved per-task from task > `.fleet.yml` > Fleet config at creation time) is computed and persisted but never read back into `RunnerTask` or threaded into `WorktreeRunner.spawn()`'s timer — `RunnerTask` (`runner.interface.ts`) has no `wallClockCapMs` field at all, and `WorktreeRunner`'s wall-clock value comes only from a runner-construction-time `caps` override that app.ts's production instance never sets per-task. `--max-turns` and model routing, by contrast, ARE genuinely per-task (see criterion 4). |
| 3 | No credential-bearing env var or repo `apiKeyHelper` can reach a worker, verified by a build-failing regression test | VERIFIED | `src/runner/env.ts`'s `buildWorkerEnv()` is allowlist-forward from a fresh object (never inherit-and-delete); `env.test.ts` asserts the output key set is a SUBSET of the allowed set (shape assertion, not a denylist) with a `process.env` fixture polluted with the full credential family (BILL-06). `--setting-sources ''` is emitted on every spawn (excludes both `project` and `local` scopes, closing the `.claude/settings.local.json`-resolves-through-worktree hole). `worktree-runner.test.ts` and `push-impossibility.test.ts` re-assert the same subset property at the spawn-argv/env boundary, independently. `apiKeySource` is asserted at runtime on the first `system/init` line and kills the session on any value other than `"none"` (D-02). `npm test` (473/473) is green and includes all of this in the default run. |
| 4 | A task records turns used and duration, can be cancelled mid-run, respects the concurrency cap and per-task model routing, and a kill switch stops every session at once | **PARTIAL — see gap** | turnsUsed: VERIFIED (`SpawnResult.turnsUsed` ← terminal `result` line's `num_turns`, surfaced via CLI `TURNS` column and API). Cancel mid-run: VERIFIED against a real killed child + real dirty-work commit (integration test). Concurrency cap: VERIFIED (`Scheduler` wraps `p-queue`, persists `scheduler.concurrency`, survives reconstruction). Per-task model routing: VERIFIED (`resolveModel()`'s task>fleetYml>config>default order feeds `task.model` directly into `buildSpawnArgv`). Kill switch: VERIFIED (`killSwitch()` pauses THEN kills, tested). **"duration" is NOT implemented anywhere** — see Gaps. |
| 5 | A worktree has no push credentials and never checks out the default branch — an agent structurally cannot push to or write `main` | VERIFIED | Two independent layers, each proven with the OTHER's mechanism entirely absent (`push-impossibility.test.ts`): (a) `FORCED_GIT_ENV` + allowlist starvation — a poisoned `process.env` fixture covering the full credential family yields none of them in `buildWorkerEnv()`'s output, regardless of `--disallowedTools`; (b) `--disallowedTools Bash(git push*),Bash(git remote*),Bash(sudo*)` — asserted present regardless of env state. `git worktree add -b <branch> <path> <baseRef>` checks out ONLY the task branch (never `HEAD` on the default branch), asserted via `git -C <worktreePath> rev-parse --abbrev-ref HEAD` in the integration test while the worktree is live. This is enforced by construction (two structurally independent mechanisms), not merely by a behavior-preserving test of current output. |
| 6 | A task can run under a named agent profile (config dir + strictly-scoped MCP servers), with skills/MCP tools **actually invocable**, and an unknown profile fails loudly at spawn | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The wiring is fully implemented and tested: `CLAUDE_CONFIG_DIR` injected only from a resolved profile, never from `process.env` (`buildWorkerEnv`); `--mcp-config`/`--strict-mcp-config` emitted as a structurally-paired unit; `composeAllowedTools()` adds `Skill` plus each declared MCP server's tool glob; four fail-loud paths (`agent_profile_not_found`, `agent_profile_config_dir_missing` ×2 causes, `agent_profile_unknown_mcp_server`) all proven via `agent-capability.integration.test.ts` to fail BEFORE any child process is created (the fixture's own argv-readback file staying absent is the proof). **"Actually invocable" is unproven by design** — this is D-37's explicitly-flagged unresolved contingency (`02-RESEARCH.md` Pattern 2 observed `mcp_servers`/`skills` shrinking under `--setting-sources ''` in a real spawn), gated behind 02-12's Task 3 human-verify gate, which has NOT been run. The hermetic fixture test proves correct ARGV/ENV construction, not real CLI behavior. This is honestly documented in-source and in 02-12-SUMMARY.md — not a silent gap. |

**Score:** 4/6 verified, 1 partial-fail (criterion 4), 1 behavior-unverified (criterion 6)

### Required Artifacts (representative sample, not exhaustive across all 12 plans)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/runner/env.ts` | Single allowlist definition, `buildWorkerEnv()` | VERIFIED | Allowlist-forward, forced git constants applied after copy, `FLEET_AUTHORED_ENV_KEYS` disjoint from allowlist (D-33) |
| `src/core/state-machine/transitions.ts` | `RATE_LIMITED` edge on `running`/`needs_human` | VERIFIED | PD-01 implemented exactly as recorded; guarded correctly on `blockReason` |
| `src/runner/worktree-manager.ts` | `ensureWorktree`/`archiveWorktree`/`captureDirtyWork` | VERIFIED | Full D-19/20/21/22/23/24 implementation, path-traversal guard (`assertWithinWorktreeRoot`) |
| `src/runner/worktree-runner.ts` | `WorktreeRunner`, `buildSpawnArgv`, `killTree` | VERIFIED | All D-03/05/09/10/13/14 properties present; see criterion 2's caveat for the one real gap |
| `src/scheduler/queue.ts` | `Scheduler` (concurrency, kill switch, backoff) | VERIFIED | `pauseForRateLimit`/`cancelQueued` both confirmed WIRED into production (`app.ts`, `routes/tasks.ts`) — the phase's two previously-known unwired-primitive defects are genuinely fixed |
| `src/tasks/service.ts` | `createTask`/`cancelTask`/precedence resolvers | VERIFIED | Single-write-path discipline holds (`recordEvent` only); precedence order correct and shared across model/caps/agent-profile resolvers |
| `src/runner/agent-profile.ts` | Profile resolution, fail-loud codes | VERIFIED | All four `AgentProfileErrorCode`s reachable and tested; MCP server membership check is prefix-based (no ambiguous regex extraction) |
| `src/runner/preflight.ts` | `verifySubscriptionAuth`/`verifyPermissionModeSupported` | VERIFIED | Refuses loudly on any unrecognised shape rather than guessing either direction; wired into `startDaemon()` and gates `POST /tasks` via a Fastify hook |
| `src/core/event-store/redact.ts` | Value-shape + key-name secret redaction | VERIFIED | Wired into BOTH `recordEvent()` (payload) and pino's `formatters.log` (whole log object) — single pattern definition site for both paths |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `POST /tasks` | `Scheduler.enqueue()` | `createTask()` then `scheduler.enqueue(task.id)` | WIRED | Auto-dispatch on creation, no separate start step (TASK-03/D-30) |
| `Scheduler.dispatch()` | `WorktreeRunner.provision/spawn` | direct call, `RunnerTask` assembled from `tasks`+`projects` rows | WIRED | Confirmed no `db.update(tasks)` outside `record-event.ts` anywhere under `runner/`, `scheduler/`, `tasks/`, `api/http/routes/` |
| `WorktreeRunner` rate-limit classification | `Scheduler.pauseForRateLimit()` | `onRateLimit` callback, boxed mutable reference in `app.ts` | WIRED | Confirmed by grep — genuinely reaches production, not just tests |
| `Scheduler.cancelQueued()` | `POST /tasks/:id/cancel` | direct call before `cancelTask()` | WIRED | Confirmed by grep and `routes/tasks.ts` reading — genuine dequeue before `provision()`/`spawn()` |
| `buildSpawnArgv`'s `resumeSessionId` | any production caller | — | **NOT WIRED** | See Gaps — `WorktreeRunner.spawn()` never supplies it; no CLI/HTTP surface exists |
| `tasks.wallClockCapMs` (resolved, persisted) | `WorktreeRunner`'s per-spawn timer | — | **NOT WIRED** | `RunnerTask` interface carries no such field; only a runner-construction-time override exists, which app.ts's shared production instance never sets per task |
| Production `WorktreeRunner` | `db` (for TIMEOUT/apiKeySource/RATE_LIMITED direct event recording) | `WorktreeRunnerOptions.db` | **NOT WIRED in production** (documented) | `app.ts` constructs `new WorktreeRunner({ onRateLimit })` with no `db`. The kill still happens unconditionally (safety intact) and the Scheduler's post-`spawn()` catch-all still records a generic `CRASH` reason, so the task still reaches `failed` — but the specific typed reason (`TIMEOUT`, `apiKeySource=...`) is not recorded by the runner itself. Honestly documented in the runner's own doc comment; WARNING-level, not a safety failure. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit test suite passes | `npm test` | 29 files / 473 tests, all passing, ~29.5s | ✓ PASS |
| Hung child+grandchild reaped at wall-clock cap | integration test (real spawned process tree, `process.kill(pid,0)` polling to `ESRCH`) | both PIDs confirmed dead | ✓ PASS (already run as part of `npm test`, not re-run separately per the single-full-run rule) |
| Cancel mid-run captures dirty work into a real commit | integration test (`git log <branch>` assertion) | commit message present, branch ref survives | ✓ PASS |
| RUN-06 resume reachable end-to-end | grep for `resumeSessionId` production call site | zero non-test call sites | ✗ FAIL (see Gaps) |
| Duration-in-seconds surfaced anywhere | grep for `duration`/`durationSec` in CLI/API/service | zero hits outside internal `durationMs` (runner-internal only) | ✗ FAIL (see Gaps) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention exists in this project; the phase's real-CLI verification lives in `npm run spikes` (excluded from `npm test` by design, per Phase 1 D-11) and was not re-run here per the environment note's explicit instruction not to consume real subscription turns. Already-recorded results (02-10-SUMMARY.md): `npm run spikes` 4/4 exit 0, `claude auth status` confirmed `loggedIn`/`claude.ai`/`max`, `apiKeySource: "none"`.

### Requirements Coverage

All 43 requirement IDs assigned to this phase in ROADMAP.md are claimed across the 12 plans' frontmatter with no orphans (cross-checked: every ID in the ROADMAP's `Requirements:` line appears in at least one plan's `requirements:` array).

| Requirement | Status | Evidence |
|---|---|---|
| WT-01, WT-03, WT-04 | SATISFIED | `worktree-manager.ts` + integration tests against real scratch repos |
| WT-02 | SATISFIED (REQUIREMENTS.md stale) | `ensureWorktree()`'s idempotent double-call proven by both unit and integration tests. REQUIREMENTS.md still shows `[ ] Pending` despite 02-05-SUMMARY.md's own `requirements-completed: [... WT-02 ...]` claim — a tracking-document staleness issue, not a code gap (see Data Integrity note below) |
| WT-05, WT-06, WT-07 | SATISFIED (REQUIREMENTS.md stale) | `runSetupCommands()`, `archiveWorktree()` called from `Scheduler.dispatch()`'s `finally`, `captureDirtyWork()`. Same stale-checkbox pattern as WT-02 |
| RUN-01, RUN-02, RUN-07, RUN-08 | SATISFIED | `buildSpawnArgv`, `Runner` 4-member interface, `stdio:['ignore','pipe','pipe']` (no PTY) |
| RUN-03, RUN-04, RUN-05 | SATISFIED (REQUIREMENTS.md stale) | Wall-clock timer + `killTree`; readline one-JSON-per-line with try/catch. Per-task cap CUSTOMIZATION not fully wired (see criterion 2 caveat) but the requirement itself ("a wall-clock cap terminates any session that exceeds it") holds |
| RUN-06 | **BLOCKED** | Argv-builder support exists and is unit-tested; zero production call site. REQUIREMENTS.md correctly shows this as `[ ] Pending` — the one ID where the stale-vs-real distinction resolves in REQUIREMENTS.md's favor |
| BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06, BILL-07, BILL-08 | SATISFIED (several stale in REQUIREMENTS.md) | env.ts, preflight.ts, redact.ts as detailed above. BILL-03/BILL-04 show `Complete`; BILL-01/02/05/06/07/08 show `[ ] Pending` despite equally solid evidence and despite 02-01/02-06/02-07-SUMMARY.md's own completion claims |
| TASK-01, TASK-02, TASK-03, TASK-04, TASK-06 | SATISFIED | CLI+HTTP parity, auto-dispatch, event history endpoint, cancel |
| TASK-05 | **BLOCKED** | turnsUsed done; "duration in seconds" not implemented anywhere (see Gaps). Correctly `[ ] Pending` in REQUIREMENTS.md |
| SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05, SAFE-08 | SATISFIED | Concurrency cap+persistence, kill switch, model routing, backoff+jitter+clamping, structural default-branch protection |
| SAFE-06 | SATISFIED (REQUIREME

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 25664 bytes -->
