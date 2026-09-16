# Phase 2: Execution — Worktree, Runner & Billing Safety - Research

**Researched:** 2026-07-23
**Domain:** Git worktree provisioning, headless `claude` CLI process supervision, billing-safety enforcement, in-process job queue
**Confidence:** HIGH — every one of CONTEXT.md's six priority open questions was resolved empirically against the installed `claude` 2.1.218 and `git` 2.55.0 on this machine (not from docs or training data), during this research session

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Provenance note:** the user explicitly declined the discussion and delegated every area with "use best practices for everything." Every decision below is therefore **Claude's Discretion** — defensible defaults grounded in Phase 1's empirically observed spike findings and `research/ARCHITECTURE.md`, not user-stated preferences. The planner may refine specifics; the underlying properties are what must hold.

**Credential & billing isolation (BILL-01…08, SAFE-06):**
- D-01: Every spawn pins `--setting-sources` to the narrowest value that still authenticates; everything Fleet needs travels in inline `--settings` JSON. The exact accepted value was **not yet verified** at context-gathering time — **this research resolves it: see "D-01 Resolution" below.**
- D-02: The runner asserts `apiKeySource === "none"` on the `system/init` line and kills the session immediately on any other value.
- D-03: `--bare` is prohibited outright; a test asserts it never appears in spawn argv.
- D-04: `CLAUDE_ENV_ALLOWLIST`/`buildAllowlistedEnv()` promoted from `src/spikes/spawn-claude.ts` to `src/runner/env.ts`, extended with git credential starvation (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/false`, `SSH_ASKPASS=/bin/false`) plus injected `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL`. Construction is always allowlist-forward from a fresh object.
- D-05: SAFE-06 enforced by env starvation (D-04) plus `--disallowedTools "Bash(git push*)"` on every spawn. Per-worktree `remote.origin.pushurl` poisoning via `git config --worktree` is deliberately rejected (requires `extensions.worktreeConfig`, a persistent repo mutation Fleet does not own).
- D-06: BILL-06's regression test asserts on **shape not denylist** — given a polluted `process.env` fixture, `buildWorkerEnv()` output must contain *only* allowlisted keys. Companion assertions: `--bare` never present, `--setting-sources` always present, `--disallowedTools` always includes the push deny rule.
- D-07: BILL-05's `claude auth status` check runs at daemon startup and refuses dispatch unless subscription auth. Also folds in a runtime capability assertion: parse `claude --help` for accepted `--permission-mode` choices and refuse to dispatch if Fleet's configured mode isn't among them.
- D-08: BILL-08 redaction applied at the single write path (`recordEvent`) and via a pino serializer, before persistence. Matching is value-shape-based (`sk-ant-…`, `ghp_…`, `AKIA…`, `Bearer …`, long base64 runs) in addition to known key names.

**Runner: caps, permission mode, tools, model routing (RUN-01…08, SAFE-03):**
- D-09: `--permission-mode acceptEdits`. Not `bypassPermissions`, not `plan`, not `auto`/`manual`/`dontAsk` (accepted by the CLI per SPIKE-02 but unverified as prose-confirmed). The literal string `"default"` is NOT legal — omitting the flag is what "default" means.
- D-10: `--allowedTools` defaults to `Read, Edit, Write, Glob, Grep, Bash, TodoWrite, Task, WebSearch, WebFetch`, `Bash` unrestricted, paired with `--disallowedTools` denying `Bash(git push*)`, `Bash(git remote*)`, `Bash(sudo*)`. Overridable per project in `.fleet.yml`.
- D-11: Cap defaults: `--max-turns 40`, 30-minute wall-clock cap. Resolution order: task > `.fleet.yml` > Fleet config > built-in default. `tasks.max_turns`/`tasks.wall_clock_cap_ms` already nullable.
- D-12: SAFE-03 model routing stores the CLI **alias** (`haiku`/`sonnet`/`opus`), never a dated model id. `tasks.model` defaults `'sonnet'`. Tier names (cheap/default/high) are CLI sugar over those three aliases.
- D-13: Spawn is `node:child_process.spawn` with `detached: true`, `shell: false`, argv array, never a login shell. Teardown is `process.kill(-pid, …)` against the whole process group, SIGTERM → grace → SIGKILL. **This deliberately overrides the `execa` entry in CLAUDE.md's stack table** — do not "correct" it back.
- D-14: stdout parsing uses `readline` over `child.stdout`, one `JSON.parse` per line in try/catch, unknown `type` values are forward-compatible no-ops, never thrown on. Only lifecycle-significant lines persist to `events`; every parsed line broadcasts to the in-process bus. stdout is best-effort observability, **never** the state-transition source.
- D-15: `--include-hook-events` is **not** adopted in Phase 2 — deferred to Phase 3.
- D-16: RUN-06 resume — `session_id` persisted opportunistically from the first stream line carrying it. Resume re-spawns in the same worktree with `--resume <id> --fork-session`.
- D-17: RUN-07's seam is a `Runner` interface (`provision`/`spawn`/`kill`/`status`) with `WorktreeRunner` as the only Phase 2 implementation.

**Worktree lifecycle (WT-01…07, SAFE-08):**
- D-18: Task branch cut from the default branch's remote-tracking ref (`refs/remotes/origin/<default>`) when a remote exists (with a `git fetch` first), falling back to the local default-branch ref otherwise. `git worktree add -b fleet/<short-id> <path> <baseref>` checks out only the task branch.
- D-19: `ensureWorktree()` implements ARCHITECTURE.md §4's four-step idempotent algorithm verbatim: `git worktree prune` → `git worktree list --porcelain` to detect an already-correct worktree → attach an existing branch with `git worktree add` **without** `-b` when the branch survived a partial failure → clear a stray unregistered directory and retry `add -b`.
- D-20: WT-03 uniqueness from the task UUID. An existing branch is treated as D-19's retry case, not an error; a numeric suffix only in the genuinely anomalous case.
- D-21: WT-04 locking is part of provisioning: `git worktree lock` runs immediately after `add`, with a reason string naming the task id; unlock happens only as the first step of archival.
- D-22: WT-07 dirty handling runs before **any** teardown: `git status --porcelain`, and if non-empty, `git add -A && git commit -m "fleet: uncommitted work captured at session end (task <id>)"` using the D-04 injected identity. `--force` never runs against an uncaptured dirty worktree.
- D-23: WT-06 archival fires **immediately** on transition to a terminal state (`done`, `failed`, `rejected`): capture dirty work, unlock, `git worktree remove`, **keep the branch ref**. Branch deletion is never automatic.
- D-24: WT-05 `.fleet.yml` setup commands run after add-and-lock and before spawn, under the **same allowlisted env as the worker**, non-login shell, each with its own timeout. A failing setup command fails provisioning (`failed`, output in event payload). `.fleet.yml` read live, never snapshotted.

**Queue, cancel, kill switch, rate limits (SAFE-01/02/04/05, TASK-01…06, QUAL-02):**
- D-25: SAFE-01 uses `p-queue` in-process, default cap 3, stored in `settings`, changeable at runtime. Durable truth remains the `tasks` table — queue reconstructed from `queued` rows on boot.
- D-26: TASK-06 cancel is `killTree` followed by a `CANCEL` event with `source: 'user'`, landing in `failed`. Worktree follows the standard terminal-state path with no special-casing.
- D-27: SAFE-02's kill switch terminates every running session **and pauses the queue**.
- D-28: SAFE-04/05 promote `src/spikes/rate-limit-classifier.ts` and `src/spikes/evidence-trap.ts` into `src/runner/`, tests moving into the default test run. On suspected limit: capture evidence, emit `RATE_LIMITED`, pause the queue, back off exponentially with jitter (60s initial, doubling, capped 60 min). Reset timing prefers the CLI's own `rate_limit_info.resetsAt` when present. **SPIKE-01 remains detected-but-unconfirmed** — Phase 2 must not treat the classifier as verified runtime behavior.
- D-29: TASK-05's usage proxy is `turns_used` (from the terminal `result` line's `num_turns`) and duration from `started_at`/`ended_at`. `total_cost_usd` is **not** recorded as spend.
- D-30: TASK-03 auto-dispatches — creating a task enqueues it; dispatch happens automatically when a slot frees. No separate `fleet task start`.
- D-31: QUAL-02's integration tests run against a **fake `claude` binary on `PATH`** emitting scripted stream-json, in the default `npm test`. Coverage: happy path, wall-clock timeout → process-group kill, cancel mid-run, malformed line skipped, unknown event type tolerated, rate-limit classification, D-06 env-shape assertion.

### Claude's Discretion

The user declined discussion and delegated everything with "use best practices for everything." **All four areas** — credential/push isolation, runner caps and model routing, worktree lifecycle, and queue/cancel/kill-switch semantics — are Claude's picks. Properties that must hold:
- No credential can reach a worker by any path, enforced by a shape test plus a runtime assertion, not a denylist.
- The spawn is never `--bare`, never a login shell, never a shell string.
- Push is impossible for structural reasons, with zero mutation of the user's repository.
- The default branch is never a worktree's HEAD.
- No agent work is discarded without first being committed to its branch.
- stdout never drives a state transition.
- Every cap and every model choice is overridable per task and per project, with sane defaults.
- The kill switch stops the queue as well as the sessions.

Concrete numbers most likely to warrant a later opinion: `--max-turns 40`, the 30-minute wall clock, the concurrency cap of 3, the 60s→60min backoff curve, and the `--allowedTools` set (D-10's unrestricted `Bash` in particular). All are single-value edits, none are structural.

### Deferred Ideas (OUT OF SCOPE)

- `--include-hook-events` — Phase 3, alongside the hook receiver.
- `fleet gc` — an explicit branch-pruning sweep. Later phase.
- Overage handling (`overageStatus`, `overageDisabledReason`, `isUsingOverage` fields on `rate_limit_event`) — Fleet ignores in Phase 2.
- Container/Docker runner backend — RUN-07 leaves the seam; v2.
- Re-attaching to a surviving orphaned runner after a daemon crash — Phase 3 (`killTree` + `RECONCILE_ORPHANED` is the honest v1 behavior).
- SAFE-07 (Fleet performs pushes after approval) and SAFE-09 (`.fleet.yml` protected-path re-verification) — Phase 4.
- Dashboard, SSE, `Last-Event-ID` backfill — Phase 5.
- Deliberately burning a plan window to confirm SPIKE-01 — rejected again; the evidence trap is the cheaper path.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| WT-01 | Isolated worktree per task, Fleet-owned dir | Architecture Patterns → Worktree Lifecycle; ARCHITECTURE.md §4 |
| WT-02 | Idempotent provisioning | D-19 verbatim algorithm — verified empirically below (git 2.55.0) |
| WT-03 | Unique branch names, collisions handled | D-20; verified `add -b` on existing branch fails cleanly (255), recoverable via `add` without `-b` |
| WT-04 | Locked while active | Verified: `git worktree lock --reason` + porcelain shows `locked <reason>`; `remove` refuses without `-f -f` |
| WT-05 | `.fleet.yml` setup commands on creation | D-24; `src/registry/fleet-yaml.ts` already parses; Phase 2 executes only |
| WT-06 | Archive on terminal state | D-23; verified branch ref survives `worktree remove` |
| WT-07 | Dirty worktree preserved before teardown | D-22; verified `remove` refuses dirty tree without `--force` |
| RUN-01 | Spawn `claude -p --output-format stream-json` | Code Examples → Spawn Invocation |
| RUN-02 | Explicit tool scoping, permission mode, max-turns | D-09/D-10/D-11; SPIKE-02 confirms legal `--permission-mode` values |
| RUN-03 | Wall-clock cap | Code Examples → killTree/timeout; verified via process-group kill test |
| RUN-04 | Whole process-group kill, no orphans | **Verified empirically this session** — see "Process-Group Teardown" below |
| RUN-05 | stdout parsed as observability only | D-14; ARCHITECTURE.md §3; Common Pitfalls #3 |
| RUN-06 | `--resume` with stored session id | D-16; Common Pitfalls (Pitfall 5, path-scoping) |
| RUN-07 | Runner interface, container-ready | D-17; ARCHITECTURE.md §7 |
| RUN-08 | Never drive interactive TUI | Structural — `-p` only, enforced by never invoking without `--output-format stream-json` |
| BILL-01…08 | Credential isolation, full stack | D-01 through D-08; "D-01 Resolution" below is the key new finding |
| TASK-01…06 | Task CRUD, dispatch, cancel, usage tracking | D-25 through D-31; **Open Questions** flags a state-machine gap for TASK-06/RATE_LIMITED |
| SAFE-01…06, SAFE-08 | Concurrency cap, kill switch, model routing, rate-limit pause, push impossibility, no default-branch HEAD | D-25 through D-28; D-18; Security Domain section |
| QUAL-02 | Integration tests via fake-`claude`-on-PATH fixture | Validation Architecture; **verified this session** that `child_process.spawn`'s executable resolution honors `options.env.PATH`, not the test process's own `process.env.PATH` |

</phase_requirements>

## Summary

Phase 2 turns Phase 1's schema and state machine into an actual dispatcher. Six of CONTEXT.md's open questions were flagged as highest-value to resolve empirically before planning; all six were resolved this session against the exact installed toolchain (`claude` 2.1.218, `git` 2.55.0, Node — see Environment Availability for a version caveat):

1. **`--setting-sources ""` (empty list) is legal.** Confirmed via a live spawn: exit 0, `apiKeySource: "none"` preserved (subscription auth intact), and `mcp_servers`/`slash_commands` visibly shrank versus an unrestricted run — proving `project` scope was genuinely excluded. **D-01's fallback (`--setting-sources user` + a daemon-startup scan for stray `apiKeyHelper`) is not needed.** Use `--setting-sources ""` directly.
2. **Rate-limit signal reliability remains genuinely weak** — SPIKE-01 stays detected-but-unconfirmed; this research adds no new evidence here (correctly so, per D-10's explicit refusal to burn a plan window). What *is* new: a **state-machine gap** was found — `transitions.ts`'s `running` row has no entry for `RATE_LIMITED` even though `TaskEvent` includes it, so `applyEvent` currently rejects it. Phase 2 must add this edge (see Open Questions).
3. **`git worktree` semantics were fully verified** against the installed git 2.55.0: `prune`, `list --porcelain` (including the `locked <reason>` porcelain line), `add -b` on a fresh branch, `add` without `-b` to re-attach a branch that survived a partial failure, `add -b` on an already-existing branch (fails, exit 255, exact message captured), `lock`/`unlock`, and `remove` refusing both a locked and a dirty tree (requiring `-f -f` for locked+dirty simultaneously). D-19's four-step algorithm is directly implementable from these observations with no surprises.
4. **Process-group teardown was verified working** on this Linux box: `spawn(..., { detached: true })` followed by `process.kill(-pid, 'SIGTERM')` terminated both the immediate child and a grandchild it had backgrounded — exactly the shape a `claude -p` session running `npm test &` would need.
5. **`p-queue`'s current published version is 9.3.3, not 8.x** as CLAUDE.md's stack table states — the planner should pin `^9.x`, not `^8.x`. Its documented API (`.pause()`, `.start()`, `.clear()`, `.concurrency` settable property, `.pending`, `.size`, `.isPaused`) covers every control D-25/D-27 need.
6. **The fake-`claude`-on-`PATH` fixture pattern for D-31/QUAL-02 was verified mechanically**: `child_process.spawn()`'s executable-name resolution honors the `env.PATH` passed via `options.env` — **not** the test process's own `process.env.PATH`. This means the fixture never needs to touch the real process environment at all; a test can point the constructed allowlisted env's `PATH` at a fixture directory and nothing else changes.

Additionally, `claude auth status --json` (JSON is the *default* output format) returns a directly parseable `{ loggedIn, authMethod, subscriptionType }` object — confirmed live against this machine's subscription login (`authMethod: "claude.ai"`, `subscriptionType: "max"`). This is the exact structured signal D-07/BILL-05 need; no string-scraping required.

**Primary recommendation:** Build `src/runner/env.ts`, `src/runner/worktree-manager.ts`, `src/runner/worktree-runner.ts`, and `src/runner/rate-limit.ts` (promoted from spikes) as the four new modules, wire them through the existing `Runner` interface seam, use `--setting-sources ""` directly (no fallback path needed), and add the missing `RATE_LIMITED` transition edge to `src/core/state-machine/transitions.ts` before building the queue's pause logic on top of it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Task CRUD + dispatch trigger | API / Backend (`src/api/http/routes/tasks.ts`, new) | — | Mirrors `projects.ts`; CLI is a pure HTTP client per Phase 1 D-01 |
| Concurrency queue (`p-queue` wrapper) | API / Backend (`src/scheduler/`, new) | Database / Storage (`tasks` table as durable truth) | In-process only; SQLite is what survives a restart, the queue is rebuilt from it |
| Worktree provisioning (`ensureWorktree`) | API / Backend (`src/runner/worktree-manager.ts`, new) | — | Mutates the local filesystem/git only from the daemon process, never from the CLI or a worker |
| Process spawn + supervision (`WorktreeRunner`) | API / Backend (`src/runner/worktree-runner.ts`, new) | — | Owns `child_process.spawn`, readline parsing, timeout/kill logic |
| Env allowlist construction | API / Backend (`src/runner/env.ts`, new) | — | Single source of truth consumed by both the worker spawn and `.fleet.yml` setup-command spawn |
| Rate-limit classification | API / Backend (`src/runner/rate-limit.ts`, promoted) | Database / Storage (`events` table records `RATE_LIMITED`) | Pure classification function, promoted as-is from `src/spikes/rate-limit-classifier.ts` |
| State transitions | Database / Storage adjacent, but logically its own tier — `core/` (pure, zero I/O) | — | `core/state-machine` has zero outward dependencies per ARCHITECTURE.md §9; Phase 2 emits events into it, never edits its logic beyond adding the missing `RATE_LIMITED` edge |
| Event persistence | Database / Storage (`recordEvent()`) | — | Single write path, already exists from Phase 1; Phase 2 is a caller, not an owner |
| CLI surface (`fleet task …`) | Browser/Client analog: CLI is a pure HTTP client | — | No new tier — extends the existing CLI-as-HTTP-client pattern from Phase 1 |

No capability in this phase belongs in a "Browser/Client" or "CDN/Static" tier — Phase 2 has no dashboard component (that's Phase 4/5). The one boundary worth double-checking during planning: **`.fleet.yml` setup-command execution belongs to the Worktree Manager, not the Runner** — the runner spawns exactly one process (`claude`), the worktree manager may spawn several (each setup command), and conflating the two would blur RUN-07's "runner interface may only spawn the agent process" boundary.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `p-queue` | `^9.3.3` [VERIFIED: npm registry] | In-process concurrency-capped job queue (SAFE-01, D-25) | `npm view p-queue version` returned `9.3.3` this session — **CLAUDE.md's stack table says `8.x`; that figure is stale.** `9.3.3` requires Node `>=20` per its `engines` field [VERIFIED: npm registry], compatible with this project's `>=22` requirement. ESM-only (no CJS export) — matches this project's `"type": "module"`. |
| `node:child_process` | built-in (Node 22) | Spawn `claude -p`, spawn `.fleet.yml` setup commands, spawn `git` for worktree ops | D-13 deliberately overrides CLAUDE.md's `execa` stack-table entry — **do not revert this.** `execa` remains in `package.json devDependencies` from Phase 1 setup but Phase 2's runner code mu

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 75547 bytes -->
