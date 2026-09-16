# Requirements: Fleet

**Defined:** 2026-07-22
**Core Value:** I create a task against a registered project and Fleet reliably runs an isolated, capped, observable Claude Code session that produces a reviewable branch — without me babysitting a terminal.

**v1 milestone boundary:** All 6 roadmap phases (foundation → execution → multi-repo → status → dashboard & review → OpenClaw). This corresponds to the original 3-phase seed; the roadmapper split the oversized core-execution-loop phase into three. Automation is deferred to v2 because its value is usage-triggered — cron sweeps and usage dashboards are only meaningfully designed after the loop has run for real and hit a plan window at least once.

## v1 Requirements

### Verification Spike

Research verified most Claude Code CLI mechanics against official docs, but four load-bearing facts remain UNVERIFIED. The runner is built on top of these, so a wrong flag string produces a runner that silently fails.

- [x] **SPIKE-01**: Empirically determine how the `claude` CLI signals a subscription plan usage-limit hit in headless mode (exit code, stderr, `result` subtype, or `system/api_retry` event), and record the detection strategy — _detected but unconfirmed per D-10 (`01-SPIKE-FINDINGS.md`): a deliberate, honest non-answer, not an empirically confirmed signal_
- [x] **SPIKE-02**: Verify the valid value list for `--permission-mode` against the live CLI before any value is hardcoded into the runner
- [x] **SPIKE-03**: Verify empirically whether a `.claude/settings.json` inside a git worktree scopes per-worktree or resolves to the main checkout, confirming or refuting the `--settings <inline-json>` spawn-time approach
- [x] **SPIKE-04**: Verify whether `session_id` appears on every stream-json event type, or only on hook payloads and the result payload
- [x] **SPIKE-05**: Spike findings are recorded as durable notes that later phases can read, not just applied and forgotten

### Project Registry

- [x] **PROJ-01**: I can register a git repo as a project via CLI, capturing repo path, remote URL, and default branch
- [x] **PROJ-02**: I can list all registered projects with their current state
- [x] **PROJ-03**: I can update a registered project's metadata (env profile, notes, tags)
- [x] **PROJ-04**: I can remove a project from the registry without touching the underlying repo
- [x] **PROJ-05**: Fleet reads an optional `.fleet.yml` from a registered repo for setup commands, test command, env profile name, and protected paths
- [x] **PROJ-06**: Registry operations are available over the HTTP API, not only the CLI

### State Store

- [x] **STATE-01**: All state persists in SQLite with WAL mode and a busy timeout configured in the first migration
- [x] **STATE-02**: Schema covers `projects`, `tasks`, `events`, and `settings`
- [x] **STATE-03**: The `events` table is append-only and is the ground truth for every state transition
- [x] **STATE-04**: The `tasks` table is a projection updated transactionally in the same write as the corresponding event
- [x] **STATE-05**: Exactly one code path (`recordEvent()`) can mutate `tasks.status` — no other writer exists
- [x] **STATE-06**: Every state transition is observable as a row in the `events` table

### Task State Machine

- [x] **SM-01**: The task state machine is an explicit, table-driven artifact in code, not implied by scattered status writes
- [x] **SM-02**: States are `queued`, `running`, `needs_human`, `review`, `approved`, `rejected`, `failed`, `done`
- [x] **SM-03**: Transition logic is a pure function with zero I/O, unit-testable without starting the daemon
- [x] **SM-04**: Invalid transitions are rejected rather than silently applied

### Task Lifecycle

- [x] **TASK-01**: I can create a task against a registered project with a title and prompt, from the CLI
- [x] **TASK-02**: I can create a task over the HTTP API
- [x] **TASK-03**: Tasks enqueue and dispatch automatically when a concurrency slot frees
- [x] **TASK-04**: I can view a task's full event history
- [x] **TASK-05**: A task records turns used and duration in seconds as the usage proxy (evidence: `taskDurationSeconds()` in `src/tasks/service.ts`, plan 02-15)
- [x] **TASK-06**: A task can be explicitly cancelled while running

### Worktree Isolation

- [x] **WT-01**: Each task gets one isolated git worktree on its own task branch, under a Fleet-owned directory
- [x] **WT-02**: Worktree provisioning is idempotent — re-running it against an existing worktree converges rather than failing — _`ensureWorktree()` in `src/runner/worktree-manager.ts`, idempotent double-call proven by unit and integration tests_
- [x] **WT-03**: Branch names are guaranteed unique, with collisions handled rather than crashing
- [x] **WT-04**: Active task worktrees are locked (`git worktree lock`) so a prune cannot delete live state
- [x] **WT-05**: `.fleet.yml` setup commands run on worktree creation — _`runSetupCommands()` in `src/runner/worktree-manager.ts`_
- [x] **WT-06**: Terminal-state worktrees are archived rather than left to accumulate, bounding disk growth — _`archiveWorktree()` in `src/runner/worktree-manager.ts`, called from `Scheduler.dispatch()`'s `finally`_
- [x] **WT-07**: A dirty worktree is detected before teardown and its work preserved, never silently discarded — _`captureDirtyWork()` in `src/runner/worktree-manager.ts`_

### Execution Runner

- [x] **RUN-01**: Fleet spawns headless Claude Code via the `claude` CLI with `-p` and `--output-format stream-json`
- [x] **RUN-02**: Each spawn passes explicit tool scoping, permission mode, and a max-turns cap
- [x] **RUN-03**: A wall-clock cap terminates any session that exceeds it — _the `setTimeout`/`killTree()` pair in `src/runner/worktree-runner.ts`, proven against a real hung child+grandchild process tree_
- [x] **RUN-04**: Process termination kills the whole process group, leaving no orphaned children — _`killTree()` in `src/runner/worktree-runner.ts`, SIGTERM→SIGKILL against the negative PID_
- [x] **RUN-05**: stdout stream-json is parsed line-by-line without backpressure loss, as best-effort observability (not as the state-transition source) — _the `readline`-based stdout loop in `src/runner/worktree-runner.ts`_
- [x] **RUN-06**: Sessions can be continued via `--resume` with the stored session id — _`POST /tasks/:id/resume` in `src/api/http/routes/tasks.ts` calls `resumeTask()` (`src/tasks/service.ts`), which `Scheduler.enqueue()`s the returned task through the same dispatch path; `Scheduler.dispatch()` (`src/scheduler/queue.ts`) derives `RunnerTask.baseRefOverride` from the lineage parent's branch and passes `RunnerTask.resumeSessionId` through to `WorktreeRunner.spawn()`'s `buildSpawnArgv()` call, which has emitted `--resume <id> --fork-session` since plan 02-06. Proven end to end by the tracer integration test in `src/runner/worktree-runner.integration.test.ts` reading the fake CLI fixture's recorded argv for both the parent and resumed invocations, plus `fleet task resume <id>` in `src/cli/index.ts`_
- [x] **RUN-07**: The runner is an interface with a worktree-backed implementation, abstracted so a container backend can be added later without schema changes
- [x] **RUN-08**: Fleet never drives an interactive Claude Code TUI

### Agent Capability Configuration

The mirror image of Billing Safety: that section governs what a worker must never have, this one governs what a worker must actually be given. A spawn that is perfectly billing-safe but has no skills, no MCP servers, and no way to reach a project's tooling is a correctly-isolated agent that cannot do the job.

- [ ] **AGENT-01**: A worker's Claude Code config directory is selectable per project via `CLAUDE_CONFIG_DIR`, so a project whose tooling lives outside `~/.claude` gets it
- [ ] **AGENT-02**: MCP servers available to a worker are passed explicitly at spawn via `--mcp-config`, always paired with `--strict-mcp-config` so no ambient MCP configuration can load
- [ ] **AGENT-03**: MCP server definitions are authored in Fleet's own config only, never read from a registered repo's `.fleet.yml`; a repo may only name a Fleet-side agent profile
- [ ] **AGENT-04**: A spawn's `--allowedTools` includes the `Skill` tool and the MCP tool globs the resolved profile declares, so declared capability is actually invocable
- [ ] **AGENT-05**: Agent profile resolution order is task > `.fleet.yml` > Fleet config default, matching the existing cap (D-11) and model (D-12) resolution order
- [ ] **AGENT-06**: A profile naming an unknown MCP server or a nonexistent config directory fails the spawn with a clear error rather than silently running without the capability

### Cross-Project References

A task often needs to read a second repo to change the first one correctly — a shared client, an API contract, a sibling service. Guessing at that code is the failure mode this section removes. References are whole projects Fleet already knows about, each isolated exactly like the primary, so the one-branch-per-repo review model extends across N repos rather than degrading at the boundary.

- [ ] **XPROJ-01**: A task can declare one or more referenced projects alongside its primary project, addressed by registered project slug
- [ ] **XPROJ-02**: Each referenced project gets its own isolated worktree on its own uniquely-named task branch, provisioned by the same idempotent path as the primary worktree
- [ ] **XPROJ-03**: Every worktree a task provisions is passed to the session via `--add-dir`, so the agent reads and edits real code rather than inferring it
- [ ] **XPROJ-04**: A task naming an unregistered, soft-removed, or duplicate project slug — or naming its own primary project as a reference — fails at task creation with a clear error, never at spawn
- [ ] **XPROJ-05**: Referenced worktrees are locked, dirty-checked, and archived under the same lifecycle rules as the primary worktree, with no path that discards agent work
- [ ] **XPROJ-06**: Review shows a separate diff per repo, and `.fleet.yml` protected-path checks run per repo against that repo's own config
- [ ] **XPROJ-07**: Approval is one decision across every repo in the task; Fleet pushes each branch, and a partial push failure leaves a recoverable, visibly-partial state rather than a silent one

### Billing Safety

The single highest-cost failure mode. A leaked credential silently switches Claude Code from subscription to per-token API billing; research found 8+ filed issues with real charges from $150 to $1,800+.

- [x] **BILL-01**: Worker process environments are constructed from an explicit allowlist, never by inheriting the daemon environment and deleting known-bad keys — _`buildWorkerEnv()` in `src/runner/env.ts`, allowlist-forward from a fresh object_
- [x] **BILL-02**: `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK`, and `CLAUDE_CODE_USE_VERTEX` are absent from every worker environment — _`buildWorkerEnv()`'s allowlist in `src/runner/env.ts`, asserted as a subset property in `src/runner/env.test.ts`_
- [x] **BILL-03**: Repo-provided `.claude/settings*.json` files are refused or neutralized at provision time, since an `apiKeyHelper` entry can inject a credential with no environment variable present at all
- [x] **BILL-04**: Workers are never spawned through a login shell that would source a user profile
- [x] **BILL-05**: At startup the daemon verifies via `claude auth status` that the CLI is authenticated on a subscription, and refuses to dispatch otherwise — _`verifySubscriptionAuth()` in `src/runner/preflight.ts`, wired into `startDaemon()` and gating `POST /tasks`_
- [x] **BILL-06**: An automated regression test fails the build if a credential-bearing variable can reach a worker environment — _`src/runner/env.test.ts`'s subset-of-allowlist assertion against a credential-polluted `process.env` fixture_
- [x] **BILL-07**: Per-project env injection comes from Fleet config only; repo `.env` files are never propagated — _`buildWorkerEnv()` in `src/runner/env.ts` sources only Fleet-config-declared env, never a repo `.env` file_
- [x] **BILL-08**: Secrets are redacted in all logs and in the event store — _`redact()` in `src/core/event-store/redact.ts`, wired into `recordEvent()` and pino's log formatter_

### Hook-Driven Status

- [ ] **HOOK-01**: Fleet passes per-task hook configuration at spawn time via `--settings` inline JSON, rather than writing a settings file into the worktree
- [ ] **HOOK-02**: Hook receiver accepts POSTs at a taREDACTED_SECRET route so correlation is a primary-key lookup with no race
- [ ] **HOOK-03**: `session_id` is persisted as a secondary field for `--resume`, not used as the correlation key
- [ ] **HOOK-04**: Hooks wired at minimum: Stop, Notification, SubagentStop, PostToolUse
- [ ] **HOOK-05**: The receiver is idempotent — redelivered or duplicate hook payloads do not corrupt state
- [ ] **HOOK-06**: The receiver acknowledges fast and processes asynchronously, so a slow Fleet never stalls a session
- [ ] **HOOK-07**: No design path assumes a hook can veto or gate an agent action — HTTP hooks are non-blocking on both non-2xx and timeout, so enforcement is structural only
- [ ] **HOOK-08**: When a session ends without a Stop hook (notably after Fleet's own wall-clock SIGKILL), terminal state is reconstructed from the session transcript file
- [ ] **HOOK-09**: State reconstructed from a transcript is distinguishable from hook-derived state, not silently equivalent

### Safety Rails

- [x] **SAFE-01**: A global concurrency cap (default 3) limits simultaneous sessions
- [x] **SAFE-02**: A kill switch terminates all running sessions
- [x] **SAFE-03**: Model routing per task — a cheap model for classification/summarization, a default mid-tier, and an opt-in high-tier
- [x] **SAFE-04**: Rate-limit conditions pause the queue with exponential backoff until the window resets, and never busy-retry
- [x] **SAFE-05**: Rate-limit detection combines multiple weak signals and biases toward pausing when ambiguous
- [x] **SAFE-06**: Agents cannot push — push credentials are absent from the worktree, enforced structurally rather than by instruction — _two independent layers proven in `src/runner/push-impossibility.test.ts` (env credential starvation and `--disallowedTools` deny rules)_
- [ ] **SAFE-07**: Fleet performs all git pushes itself, and only after explicit approval
- [x] **SAFE-08**: Agents never write to a project's default branch
- [ ] **SAFE-09**: `.fleet.yml` protected paths are re-verified against the actual diff at review time, regardless of whether the agent complied

### Crash Safety & Reconciliation

- [ ] **OPS-01**: Daemon restart reconciles tasks left in `running` against actual process state, using PID plus process start time so PID reuse cannot cause a false match
- [ ] **OPS-02**: Orphaned worktrees and sessions are detected and resolved after a crash
- [ ] **OPS-03**: A watchdog marks a session stale and alerts when no hook activity arrives within a configured window
- [x] **OPS-04**: The daemon binds to loopback only

### Dashboard

- [ ] **DASH-01**: A fleet-at-a-glance overview shows every project, task state, and pending-human flag
- [ ] **DASH-02**: Task detail shows a live event stream, updating without a manual refresh
- [ ] **DASH-03**: The live stream reconnects without gaps after a dropped connection
- [ ] **DASH-04**: The dashboard is served by the daemon itself — no separate deploy
- [ ] **DASH-05**: A task that stopped due to context exhaustion is visibly distinguishable from one that hit its turn ceiling or genuinely completed
- [ ] **DASH-06**: The dashboard is visually polished — sleek and stylish, not a utilitarian status table
- [ ] **DASH-07**: A coherent design system governs typography, spacing, and color, with dark mode as the primary look
- [ ] **DASH-08**: Live state changes animate smoothly rather than jumping

### Review & Approval

- [ ] **REV-01**: I can review a finished task's diff in the browser
- [ ] **REV-02**: Approving a task makes Fleet push the branch or open a PR
- [ ] **REV-03**: Rejecting a task makes Fleet archive the worktree
- [ ] **REV-04**: Review surfaces a check for test tampering — assertions weakened or removed to make a suite pass
- [ ] **REV-05**: The full create → run → review → approve loop is completable without touching a terminal

### OpenClaw Integration

- [ ] **OC-01**: An OpenClaw `fleet` skill wraps Fleet's HTTP API: list projects, fleet status, create task, approve/reject, pause/resume queue
- [ ] **OC-02**: Fleet pushes notifications outbound to OpenClaw rather than depending on OpenClaw polling or a heartbeat
- [ ] **OC-03**: Terminal states and `needs_human` states reach me on whatever channel I'm currently on
- [ ] **OC-04**: Fleet is fully usable with OpenClaw absent or down — dashboard and CLI suffice alone
- [ ] **OC-05**: OpenClaw never executes project code in its own runtime
- [ ] **OC-06**: From chat I can ask for fleet status, dispatch a task, get pinged on `needs_human`, and approve — end to end

### Quality

- [x] **QUAL-01**: The codebase is typed end to end
- [x] **QUAL-02**: Integration tests cover the runner state machine
- [ ] **QUAL-03**: Integration tests cover the hook receiver, driven by a mock Claude Code fixture process that emits hook calls
- [x] **QUAL-04**: The state machine has unit tests that run without the daemon or a real CLI
- [ ] **QUAL-05**: Hook receiver and runner are independently testable, so they can be built in parallel

## v2 Requirements

Deferred. Automation's design depends on real usage data that doesn't exist until v1 has run.

### Automation

- **AUTO-01**: Cron sweeps run recurring per-project tasks (nightly dependency or doc updates)
- **AUTO-02**: Task prompts support reusable templates with variables
- **AUTO-03**: A usage dashboard shows turns and duration per task and consumption against plan windows
- **AUTO-04**: A first-pass automated review summary is attached to each finished task
- **AUTO-05**: Usage tracking is cross-checked against whatever the CLI self-reports

### Execution Backends

- **EXEC-01**: A container-backed runner implementation slots into the existing runner interface
- **EXEC-02**: Cross-task dependency graphs

### Integrations

- **INTEG-01**: Beads (`bd`) open-issue counts surface in the dashboard, read-only

### Observability

- **OBS-01**: A structured, filterable tool-call timeline per task
- **OBS-02**: Richer notification granularity controls

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-user, auth, RBAC | Single user, forever. Loopback plus Tailscale is the entire security model |
| USD budget caps / cost tracking | Billing is subscription-based; the scarce resource is plan usage windows, not dollars. Headless subscription runs don't report dollar cost |
| API-key billing mode | Subscription-only is a hard requirement. Adding an API-key path would reintroduce the exact failure mode BILL-01 through BILL-08 exist to prevent |
| Claude Agent SDK for execution | Its billing treatment is less stable than the CLI's. Accepted tradeoff: Fleet hand-parses stream-json, which is not a contractually stable schema |
| Driving an interactive Claude Code TUI | Headless `-p` mode only |
| Cloud / sandbox execution | Design the runner interface for it; don't build it |
| A chat interface | OpenClaw owns chat |
| Rebuilding an issue tracker | Beads and GitHub exist |
| Imposing a task tracker on repos | Fleet reads optional `.fleet.yml`, nothing more |
| Running agent code in OpenClaw's runtime | OpenClaw is a messaging adapter, never an executor |
| Public network exposure | Everything binds `127.0.0.1` |
| Windows support | Linux/macOS only |
| Multi-viewer collaboration, video recording, visual DAG builder, inline PR comment threads | Anti-features identified in research — real prior art exists, all of it wrong for a single-user tool |

## Traceability

Every v1 requirement mapped to exactly one phase during roadmap creation (2026-07-22). See `.planning/ROADMAP.md` for phase goals and success criteria.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SPIKE-01 | Phase 1 | Complete (detected but unconfirmed per D-10) |
| SPIKE-02 | Phase 1 | Complete |
| SPIKE-03 | Phase 1 | Complete |
| SPIKE-04 | Phase 1 | Complete |
| SPIKE-05 | Phase 1 | Complete |

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 24661 bytes -->
