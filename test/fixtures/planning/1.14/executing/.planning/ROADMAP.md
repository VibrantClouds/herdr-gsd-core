# Roadmap: Fleet

## Overview

Fleet gets built as a single thickening vertical slice, not horizontal layers. Phase 1 lays the persistent, observable foundation — project registry, append-only event store, and a pure task state machine — and resolves the four unverified Claude Code CLI facts the runner design depends on. Phase 2 makes that foundation do real work: isolated git worktrees, a billing-safe headless `claude` runner with explicit caps, and the full task lifecycle. Phase 3 generalizes that proven single-repo loop to several repos at once, so a task can span registered projects — each in its own worktree and branch — and an agent reads real cross-project code rather than guessing at it. Phase 4 closes the core loop by wiring hook-driven status, crash/SIGKILL recovery, and watchdog alerting on top — by the end of Phase 4 a task can go from `queued` to `review` with real commits, driven entirely by real signals, without a dashboard or OpenClaw in the picture. Phase 5 puts a visually polished, dark-mode-first dashboard on top of that proven loop so diff review and approve/reject happen in a browser instead of a terminal. Phase 6 closes the final gap: driving the whole thing from chat via OpenClaw, while keeping Fleet fully usable without it. Automation (cron sweeps, usage dashboards, templates) is explicitly v2 — it depends on real usage data this v1 doesn't have yet.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation — Registry & State Machine** - Register projects, persist every state transition through a verified pure state machine, and resolve the four CLI spikes the runner depends on (completed 2026-07-23)
- [ ] **Phase 2: Execution — Worktree, Runner & Billing Safety** - Provision isolated worktrees and run billing-safe headless Claude Code sessions with explicit caps, closing create-taREDACTED_SECRET
- [ ] **Phase 3: Multi-Repo Tasks — Cross-Project References** - Let a task span several registered projects, each in its own worktree and branch, so agents read real cross-project code instead of guessing
- [ ] **Phase 4: Status — Hooks, Crash Recovery & Watchdog** - Drive task status from real Claude Code hooks, survive crashes and SIGKILLs without losing state, and close the loop to `review` with real commits
- [ ] **Phase 5: Dashboard, Diff Review & Approval** - Review and approve/reject finished tasks from a visually polished dashboard, no terminal required
- [ ] **Phase 6: OpenClaw Integration** - Drive the whole loop from chat via OpenClaw, with Fleet remaining fully usable on its own

## Phase Details

### Phase 1: Foundation — Registry & State Machine

**Goal**: Fleet can register and track projects with durable, observable state, and the task state machine and Claude Code CLI mechanics the runner depends on are verified before the runner is built
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: SPIKE-01, SPIKE-02, SPIKE-03, SPIKE-04, SPIKE-05, PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05, PROJ-06, STATE-01, STATE-02, STATE-03, STATE-04, STATE-05, STATE-06, SM-01, SM-02, SM-03, SM-04, OPS-04, QUAL-01, QUAL-04
**Success Criteria** (what must be TRUE):

  1. I can register, list, update, and remove a git project via both CLI and HTTP API, and the data survives a daemon restart
  2. Every task state transition is recorded as an append-only row in `events`, with `tasks.status` always matching the latest event and no other code path able to write it
  3. The task state machine's transition table rejects invalid transitions and its unit tests run and pass without starting the daemon or spawning a real CLI
  4. The four SPIKE questions (rate-limit signal, `--permission-mode` values, worktree settings-file scoping, `session_id` coverage) are empirically answered and written up as durable notes the Phase 2 runner design reads
  5. The daemon binds only to `127.0.0.1` and refuses external connections

**Plans**: 6/6 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Walking Skeleton: toolchain, four-table schema + migration, loopback daemon, and `fleet project add|list` end-to-end (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Registry lifecycle: live `.fleet.yml`, show/update/soft-remove, machine-checked CLI/HTTP parity (wave 2)
- [x] 01-03-PLAN.md — Eight-state transition table, pure `applyEvent()`, and `recordEvent()` as the single write path (wave 2)
- [x] 01-04-PLAN.md — SPIKE probe suite: rate-limit detector + evidence trap, three opt-in real-CLI probes, version-stamped findings (wave 2)

**Gap closure — Wave 1** *(closes CR-01/CR-02, the failed success criterion 1)*

- [x] 01-05-PLAN.md — Module-relative migrations resolver, caller-resolved project path, absolute-path-required HTTP boundary, and out-of-process daemon+CLI regression tests (wave 1)

**Gap closure — Wave 2** *(blocked on 01-05)*

- [x] 01-06-PLAN.md — Ship the migration trail with the build output, prove the built daemon starts from an arbitrary cwd, and sync the stale requirements tracker (wave 2)

### Phase 2: Execution — Worktree, Runner & Billing Safety

**Goal**: I can create a task against a registered project and Fleet reliably provisions an isolated worktree, spawns a billing-safe headless Claude Code session with explicit caps, and tracks it to completion
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: WT-01, WT-02, WT-03, WT-04, WT-05, WT-06, WT-07, RUN-01, RUN-02, RUN-03, RUN-04, RUN-05, RUN-06, RUN-07, RUN-08, BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06, BILL-07, BILL-08, TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05, SAFE-06, SAFE-08, QUAL-02, AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06
**Success Criteria** (what must be TRUE):

  1. Creating a task (via CLI or API) against a registered project provisions an isolated git worktree on a uniquely-named task branch, runs any `.fleet.yml` setup commands, and locks the worktree while it's active
  2. Fleet spawns headless `claude -p --output-format stream-json` with explicit `--allowedTools`, `--permission-mode`, `--max-turns`, and a wall-clock cap, and killing or timing out a session leaves no orphaned child processes
  3. No credential-bearing environment variable (`ANTHROPIC_API_KEY` and related) or repo-provided `apiKeyHelper` can reach a worker process, verified by an automated regression test that fails the build if one leaks through
  4. A task records turns used and duration, can be explicitly cancelled mid-run, respects the global concurrency cap and per-task model routing, and a kill switch terminates every running session at once
  5. A worktree provisioned for a task has no push credentials and never checks out the project's default branch, so an agent structurally cannot push to or write `main`
  6. A task can run under a named agent profile that supplies an alternate Claude Code config directory and an explicit, strictly-scoped MCP server set, with the profile's skills and MCP tools actually invocable by the agent, and a task naming an unknown profile fails loudly at spawn rather than running silently without the capability

**Plans**: 17/18 plans executed

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Wave 0 groundwork: `RATE_LIMITED` transition edge, worker-env module, Node pin
- [x] 02-02-PLAN.md — Dependency & one-way decision gates: `p-queue` legitimacy + install, D-03 confirmation
- [x] 02-03-PLAN.md — Test harness: fake `claude` fixture on `PATH` + model-alias probe

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-04-PLAN.md — TRACER: end-to-end task create → locked worktree → billing-safe spawn → recorded result → archive

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-05-PLAN.md — Worktree lifecycle: idempotent provisioning, `.fleet.yml` setup, dirty capture, archival
- [x] 02-06-PLAN.md — Runner supervision: wall-clock cap, process-group teardown, stdout discipline, `apiKeySource` assertion, resume
- [x] 02-07-PLAN.md — Billing preflight + secret redaction + two-layer push impossibility
- [x] 02-08-PLAN.md — Task surface: list/events/cancel over HTTP and CLI, model routing, cap resolution

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-09-PLAN.md — Scheduler: concurrency cap, kill switch, rate-limit pause with backoff

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 02-10-PLAN.md — QUAL-02 integration suite (7 scenarios) + phase gate

**Wave 6** *(agent capability, AGENT-01…06 — folded into this phase after 02-01…02-10 were written; runs after 02-10's gate rather than in parallel with it)*

- [x] 02-11-PLAN.md — Agent capability tracer: D-35 boundary gate, Fleet-side profile store, `CLAUDE_CONFIG_DIR` as a forced constant, `--mcp-config`/`--strict-mcp-config` pairing, composed `--allowedTools`

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 02-12-PLAN.md — Agent capability resolution order, `.fleet.yml` naming-only key, `tasks.agent_profile` migration, four fail-loud paths + capability gate

**Gap closure — Wave 8** *(closes the wiring gaps and TASK-05; blocked on Wave 7)*

- [x] 02-13-PLAN.md — Thread the persisted per-task wall-clock cap into the timer that actually fires, add the timer-overflow ceiling, and give the production runner its database handle (wave 8)
- [x] 02-14-PLAN.md — Reconcile both requirement trackers against re-verified evidence, repair the ROADMAP Progress table, confirm the API coverage artifact (wave 8)
- [x] 02-15-PLAN.md — TASK-05: duration in seconds derived at the presentation boundary, surfaced on every task route and in the CLI table (wave 8)

**Gap closure — Wave 9** *(blocked on 02-15)*

- [x] 02-16-PLAN.md — RUN-06 persistence: the resume-semantics decision gate, two nullable resume columns with a generated migration, and `resumeTask()`'s named refusals (wave 9)

**Gap closure — Wave 10** *(blocked on 02-13, 02-15, 02-16)*

- [x] 02-17-PLAN.md — RUN-06 tracer: one resume from task row to recorded spawn argv, the resume route and CLI command, and a build-failing guard against the built-but-unwired defect class (wave 10)

**Gap closure — Wave 11** *(blocked on 02-17 — verifies the finished system)*

- [ ] 02-18-PLAN.md — The two blocking human gates: agent-capability invocability and one live daemon-driven task against a real subscription; resolves AGENT-01…06 as a group (wave 11)

### Phase 3: Multi-Repo Tasks — Cross-Project References

**Goal**: A task can span several registered projects, each in its own isolated worktree and branch, so an agent reads and edits real cross-project code instead of guessing at it
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: XPROJ-01, XPROJ-02, XPROJ-03, XPROJ-04, XPROJ-05
**Success Criteria** (what must be TRUE):

  1. A task created against a primary project with one or more referenced project slugs provisions an isolated worktree on a uniquely-named branch in every one of those repos, and a task naming an unregistered, soft-removed, duplicate, or self-referential slug is rejected at creation rather than at spawn
  2. The spawned session receives every provisioned worktree via `--add-dir`, so the agent can read and edit the referenced repos' real files, and no referenced repo's own working directory or default branch is ever touched
  3. Terminal-state cleanup locks, dirty-checks, and archives every worktree the task provisioned, with no repo left orphaned and no agent work discarded
  4. Task state, events, and cancellation operate over the whole repo set atomically — a task is never left half-provisioned or half-torn-down

**Plans**: Not yet planned

### Phase 4: Status — Hooks, Crash Recovery & Watchdog

**Goal**: Task status is driven by real Claude Code hook payloads rather than polling, survives daemon crashes and SIGKILLs without losing state, and a stalled session is automatically flagged
**Mode:** mvp
**Depends on**: Phase 1, Phase 2 (the hook receiver itself is buildable in parallel with Phase 2 using a mock Claude Code fixture that POSTs hook JSON; full end-to-end verification of criterion 1 needs the real Phase 2 runner)
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05, HOOK-06, HOOK-07, HOOK-08, HOOK-09, OPS-01, OPS-02, OPS-03, QUAL-03, QUAL-05
**Success Criteria** (what must be TRUE):

  1. A real task moves start-to-finish through `queued -> running -> review` driven entirely by hook payloads landing at its taREDACTED_SECRET route, ending with real commits in the worktree — proving the full core loop end to end
  2. Redelivered or duplicate hook payloads never corrupt task state, and the receiver acknowledges within milliseconds and processes asynchronously so a slow Fleet never stalls a session
  3. When a session is SIGKILLed by Fleet's own wall-clock cap and its Stop hook never fires, terminal state is reconstructed from the session transcript file and is visibly distinguishable from hook-derived state
  4. Restarting the daemon while tasks are `running` reconciles them against real process state (PID plus start time, so PID reuse can't cause a false match) and resolves orphaned worktrees or sessions without manual cleanup — including every worktree a multi-repo task provisioned, not just its primary
  5. A session with no hook activity for longer than the configured watchdog window is automatically marked stale and alerts me, and the hook receiver is fully testable against a mock Claude Code fixture with no real `claude` process required — proving it was built and verified independently of the runner

**Plans**: TBD

### Phase 5: Dashboard, Diff Review & Approval

**Goal**: I can watch the fleet, review a finished task's diff, and approve or reject it — entirely from a visually polished browser dashboard, without touching a terminal
**Mode:** mvp
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, REV-01, REV-02, REV-03, REV-04, REV-05, SAFE-07, SAFE-09, XPROJ-06, XPROJ-07
**Success Criteria** (what must be TRUE):

  1. The dashboard shows every registered project, each task's state, and any pending-human flags at a glance, served directly by the daemon with no separate deploy
  2. Opening a task shows a live event stream that updates without a manual refresh and reconnects without gaps after a dropped connection; a task stopped by context exhaustion is visibly distinguishable from one that hit its turn ceiling or genuinely completed
  3. I can review a finished task's diff in the browser, and the review view flags weakened or removed test assertions and re-checks `.fleet.yml` protected paths against the actual diff regardless of what the agent claims to have done
  4. Approving a task makes Fleet push the branch or open a PR; rejecting archives the worktree — and the full create -> run -> review -> approve loop is completable without touching a terminal
  5. The dashboard is dark-mode-first with a coherent, deliberate design system for typography, spacing, and color, and live state changes animate smoothly rather than jumping
  6. A multi-repo task shows a separate diff per repo with each repo's own `.fleet.yml` protected paths re-checked against its own diff, and one approve/reject decision covers every repo — a partial push failure leaves a visibly-partial, recoverable state rather than a silent one

**Plans**: TBD
**UI hint**: yes

### Phase 6: OpenClaw Integration

**Goal**: I can drive Fleet entirely from chat via OpenClaw — status, dispatch, approval, and being pinged on states that need me — while Fleet stays fully usable if OpenClaw is absent
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: OC-01, OC-02, OC-03, OC-04, OC-05, OC-06
**Success Criteria** (what must be TRUE):

  1. From chat I can ask OpenClaw for fleet status, dispatch a new task, and approve or reject a pending one, and each action correctly reaches Fleet's HTTP API
  2. When a task reaches a terminal state or `needs_human`, Fleet pushes a notification to OpenClaw (never polling or heartbeat-dependent) and it reaches me on whatever channel I'm currently on
  3. With OpenClaw stopped or unreachable, the dashboard and CLI remain fully sufficient to create, monitor, and approve or reject tasks — nothing is OpenClaw-gated
  4. OpenClaw never executes project code in its own runtime; it only calls Fleet's API and relays messages

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 (Phase 4 is buildable in parallel with Phase 2 at the plan level — see Phase 4's Depends on note)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Registry & State Machine | 6/6 | Complete    | 2026-07-23 |
| 2. Execution — Worktree, Runner & Billing Safety | 17/18 | In Progress|  |
| 3. Multi-Repo Tasks — Cross-Project References | 0/TBD | Not started | - |
| 4. Status — Hooks, Crash Recovery & Watchdog | 0/TBD | Not started | - |
| 5. Dashboard, Diff Review & Approval | 0/TBD | Not started | - |
| 6. OpenClaw Integration | 0/TBD | Not started | - |
