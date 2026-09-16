# Project Research Summary

**Project:** Fleet
**Domain:** Self-hosted, single-user daemon that dispatches autonomous headless Claude Code sessions against a registry of git repos
**Researched:** 2026-07-22
**Confidence:** MEDIUM-HIGH

## Executive Summary

Fleet occupies a genuinely unoccupied niche: a self-hosted, single-user "fleet manager" spanning many independent repos on subscription billing. Every comparable product is either multi-tenant SaaS (Devin, Cursor, Copilot) scoped to one repo/org, or a single-repo local parallel-session tool (Conductor, Crystal, claude-squad, uzi). The research converges on a boring, single-deployable Node/TypeScript stack (Fastify + better-sqlite3 + Drizzle + React/Vite/Tailwind/shadcn), git-worktree-per-task isolation, a hand-rolled (not XState) 8-state task machine backed by event-sourced-lite SQLite, and hooks-as-ground-truth for state transitions with stdout stream-json parsing as best-effort observability only.

The largest risk category is silent billing-mode leakage (8+ corroborating GitHub issues, real four-figure losses): denylisting known-bad env vars is provably insufficient because settings-file `apiKeyHelper` injects credentials with no env var present. The second-largest risk is that hooks-as-sole-ground-truth has real reliability gaps (no delivery on SIGKILL, non-blocking HTTP semantics) that must be designed around from Phase 1.

Critically, research surfaced several places where PROJECT.md's stated mechanism is wrong or unverified — see Corrections below. These change the shape of the provisioner, hook receiver correlation, and security model, and must be reflected in Phase 1 design.

## Corrections to the Original Vision

### 1. Per-worktree hook config does not work via `.claude/settings.local.json`
PROJECT.md says to "install per-worktree Claude Code hook config at provision time." Research (VERIFIED against official hooks docs) found `.claude/settings.local.json` resolves through worktrees to the MAIN checkout — one file governs every worktree, not per-worktree. **Correct mechanism: pass hook config via `--settings <inline-json>` at spawn time**, baking the Fleet task token into hook URLs at invocation. This changes the Runner design: hook config is a spawn-time argument, not a provisioning-time file write.

### 2. Env denylist is insufficient — allowlist-only, with corrected mechanism
Denylist stripping cannot be complete: `apiKeyHelper` in a settings file injects a key with no env var present at all. **Allowlist-only child-env construction is required**, plus refusing/stripping any repo-provided `.claude/settings*.json` at provision time. STACK.md corrects PITFALLS.md's stated mechanism: subagents do NOT independently rediscover credentials (they share the parent process's already-resolved credential). The real risk is **per-worktree settings-file re-discovery across separate `claude -p` process spawns** — each task's independent CLI invocation re-runs the full auth precedence chain against whatever `.claude/settings.json` is in that specific worktree.

### 3. HTTP hooks are non-blocking — cannot enforce, only report
The native `type: "http"` hook handler exists as assumed, but non-2xx responses AND timeouts/connection failures are both non-blocking — the session continues regardless of receiver health. **No design may assume a hook can veto or gate an agent action.** Enforcement must be structural: capability removal (no push credentials in the worktree) and `--allowedTools`/`--disallowedTools` scoping. This also means a dead hook receiver is silent, not stalling — reinforcing the watchdog as load-bearing, not optional.

### 4. Hook-as-ground-truth has a hole that Fleet's own safety mechanism causes
A SIGKILL'd session never fires its Stop hook. Fleet's own wall-clock cap enforcement is precisely what would SIGKILL a runaway session — the safety mechanism most likely to defeat "hooks are ground truth." **Transcript-file fallback plus an idempotent hook receiver (upsert, tolerating redelivery) are load-bearing Phase 1 requirements**, not defensive extras. Dashboard should visibly flag "reconstructed from transcript" vs. hook-derived state.

### 5. Correlation race is likely a non-issue — taREDACTED_SECRET is still the right design
PROJECT.md says the hook receiver "correlates payloads by session UUID." `session_id` is confirmed present from the very first `SessionStart` hook payload, so the feared race is minor. Regardless, **recommended design: correlate by a Fleet-issued task token baked into the hook URL** (`/hooks/claude/:taskId/:kind`, set via `--settings` per Correction #1) — zero-race, primary-key lookup, with `session_id` persisted only as a secondary field for `--resume`.

## Key Findings

### Recommended Stack
Boring, single Node process, single deployable. Node 22 LTS + TypeScript 5.x strict; Fastify 5.x (API + hook receiver + static dashboard, one server); better-sqlite3 (not experimental `node:sqlite`) + Drizzle ORM; `p-queue` in-process for dispatch (SQLite is durable source of truth, explicitly not Redis/BullMQ); `better-sse` for live feed; React 19 + Vite + Tailwind v4 + shadcn/ui for the dashboard. Claude Agent SDK explicitly rejected — subscription billing stability and stream-json schema instability are Fleet's problem to hand-parse defensively, not the SDK's.

**Core technologies:**
- Fastify 5.x — HTTP API + hook receiver + static dashboard host
- better-sqlite3 + Drizzle ORM — durable state, typed migrations
- p-queue (in-process) — concurrency-capped dispatch, SQLite-backed for crash-safety
- React 19 + Vite + Tailwind v4 + shadcn/ui — dashboard, single static build
- `claude` CLI headless only, never the Agent SDK

### Expected Features
No direct competitor combines "registry of many repos" with "subscription usage-window awareness."

**Must have (table stakes, v1):** task creation (CLI/API/cron), isolated crash-safe worktree provisioning, live progress visibility, diff review before landing, approve/reject merge gate, fleet-at-a-glance overview, durable event history, terminal/needs_human notifications, session resume/crash recovery, kill switch, rate-limit-aware pause+backoff, turns/duration capture.

**Should have (differentiators, v1.x):** structured/filterable tool-call timeline, first-pass automated review summary (Haiku-routed — highest-leverage differentiator), turns/duration usage dashboard (no competitor does this), rate-limit-aware shared-queue pause (genuinely novel), task templates, cron sweeps, distinct `needs_human` state.

**Defer (v2+):** Docker/container runner backend, cloud/sandbox execution, cross-task dependency graphs. Actively resist: multi-user auth/RBAC, USD cost tracking, in-dashboard chat, full issue tracker, multi-viewer collaboration, video-demo recording, visual DAG builder, inline PR comment threads.

### Architecture Approach
Single Node daemon owning HTTP API, SSE, hook receiver, runner/scheduler, backed by one WAL-mode SQLite database. State machine is hand-rolled, pure, table-driven (not XState — flat 8-state graph, no nesting/parallelism). Event-sourced-lite persistence: `events` append-only ground truth, `tasks` a live projection updated transactionally in the same write via a single `recordEvent()` function — the only code path allowed to mutate `tasks.status`. SSE (not WebSocket) for live dashboard updates, since the dashboard only consumes; `events.id` doubles as SSE `Last-Event-ID` for gap-free reconnection.

**Major components:**
1. **State machine** — pure transition table + guards, zero I/O, fully unit-testable
2. **Event store** — single `recordEvent()` write path; nothing else writes `tasks`
3. **Runner** (interface + WorktreeRunner) — spawn, readline stdout parsing, wall-clock/timeout enforcement, process-group kill; abstracted for a future DockerRunner
4. **Worktree Manager** — idempotent `ensureWorktree`, dirty-worktree auto-commit before teardown, archive-not-delete-branch
5. **Hook Receiver** (`POST /hooks/claude/:taskId/:kind`) — pure translation, correlated by task token not session UUID
6. **Scheduler/Queue** — concurrency cap, cron sweeps, rate-limit pause/backoff

Thinnest end-to-end vertical slice: SQLite schema -> pure state machine (unit-tested standalone) -> event store -> minimal registry -> Worktree Manager -> WorktreeRunner (spawn + stripped env + readline parse) -> per-task `--settings` inline hook config -> Hook Receiver -> dispatch proving register->task->worktree->hooks->events->branch-with-commits end to end. Dashboard/SSE/notifier/cron build on top without changing this shape.

### Critical Pitfalls
1. **Billing-mode leakage** (8+ GitHub issues, four-figure real losses) — allowlist-only env, refuse repo-provided settings files, never spawn via login shell, hard startup gate on `claude auth status`.
2. **Headless hangs** — either waiting on a permission prompt with nowhere to render, or hanging after success — always exhaustive `--allowedTools`/`--permission-mode`; wall-clock cap as universal backstop; don't conflate "didn't exit" with "failed."
3. **Hook delivery has no reliability guarantees** — idempotent upsert receiver, fast-ack-then-async, transcript-file fallback, explicit `Stop`->`SubagentStop` handling.
4. **Git worktree crash/prune/submodule/branch-collision hazards** — `git worktree lock` for active tasks, guaranteed-unique branch names, `.fleet.yml` setup-command support, archive-on-terminal-state to bound disk growth.
5. **Structural (not advisory) enforcement** — since hooks can't enforce, only capability removal (no push creds in worktree) and tool-scoping actually work; protected-path checks must be re-verified at diff-review time regardless of agent compliance.

## Implications for Roadmap

### Phase 1: Core execution loop (registry, worktree, runner, hooks, state machine)
**Rationale:** Every other capability depends on a session that reliably runs, is billing-safe, and produces trustworthy state. This is ARCHITECTURE.md's "thinnest vertical slice" and where nearly every critical pitfall must be addressed.
**Delivers:** register project -> create task -> provision worktree -> spawn `claude -p` with allowlisted env and `--settings` inline hook config -> hooks land at `/hooks/claude/:taskId/:kind` -> events fill in -> task reaches `review` with real commits. No dashboard/SSE/OpenClaw needed to prove this.
**Addresses:** task creation, registry CRUD, worktree provisioning, headless runner, hook receiver + state machine, kill switch, rate-limit detection, turns/duration capture.
**Avoids:** Pitfalls 1, 2, 3, 5, 6, 7, 8, 9, 10 — nearly all of them.
**Must incorporate all five Corrections above.**

### Phase 2: Dashboard, diff review, approve/reject
**Rationale:** Diff review requires a finished task branch (Phase 1 output); the merge gate needs something to gate on.
**Delivers:** fleet-at-a-glance overview, task detail with live SSE stream, plain-diff review, approve->push/PR and reject->archive.
**Uses:** Fastify SSE, React/Vite/Tailwind/shadcn dashboard, react-diff-view + gitdiff-parser.
**Avoids:** Pitfall 4 (context-exhaustion vs turn-ceiling must be visibly distinguished); Pitfall 8's review-time protected-path re-verification and test-tampering checklist.

### Phase 3: OpenClaw integration, watchdog, safety-rail hardening
**Rationale:** Once the core loop and review UI are proven, close the terminal-free loop and harden reliability mechanisms Phase 1 built but that need real-world exercising.
**Delivers:** OpenClaw `fleet` skill, push notifications, fully wired watchdog, `--resume` reconciliation tested against daemon-restart scenarios.
**Avoids:** Pitfall 5 (`--resume` path sensitivity), Pitfall 6's full defensive design under real conditions.

### Phase 4: Automation (cron sweeps, templates, usage dashboards, first-pass review)
**Rationale:** FEATURES.md's own v1.x trigger conditions are usage-driven (e.g. "you've hit a plan window limit at least once").
**Delivers:** cron/scheduled tasks, task templates, turns/duration usage dashboard, first-pass automated review summary (Haiku-routed).
**Avoids:** Pitfall 7's disk-usage/worktree-accumulation (unattended volume now makes it likely), Pitfall 9's usage-tracking-vs-CLI-reported cross-check.

### Phase Ordering Rationale
- Worktree + runner + hooks must precede review UI — nothing to review before it exists.
- Billing-safety and structural enforcement must be built in Phase 1, not retrofitted — these are correctness requirements per PITFALLS.md, not hygiene.
- Hook Receiver and Runner can be built/tested in parallel within Phase 1 using a mock Claude Code fixture, matching PROJECT.md's stated testing approach.
- Automation is explicitly usage-triggered — sequencing it last avoids building unvalidated infrastructure before the core loop is trustworthy.

### Research Flags
Needs deeper research during planning:
- **Phase 1:** rate-limit terminal-state detection, `session_id` presence on every stream-json event type, worktree settings-file cwd-scoping, `--permission-mode` valid value list — all Phase 1-critical and should be resolved via empirical spike before finalizing runner design.
- **Phase 3:** `--resume` path/config-dir sensitivity has multiple independently-reported failure modes only partially understood from docs — spike against actual daemon-restart-then-resume behavior.

Standard patterns (skip research-phase):
- **Phase 2:** SSE/diff-review patterns are well-established, HIGH confidence, no CLI-specific unknowns.
- **Phase 4:** cron sweeps, templates, usage dashboards are standard patterns on an already-proven schema.

## Unverified Items — Phase 1 Spike Candidates

1. **Rate-limit terminal-state detection has no single reliable signal** (weakest-confidence area across all four files). Only officially-documented structured signal (`system/api_retry`, `error: "rate_limit"`) covers retryable mid-turn errors, not necessarily hard subscription-window exhaustion. `result` subtypes and `rate_limit_event`/`SDKRateLimitInfo` are community-sourced only, with documented bugs where self-reported usage percentage fires at implausible levels (0%, 5%, 16%). Recommended: combine multiple weak signals, bias toward pausing on ambiguous signals. Flag for explicit Phase 1 spike against a live rate-limited session.

2. **Whether `session_id` appears on every stream-json event type.** Confirmed on `system/api_retry`, the `--output-format json` result payload, and every hook payload from `SessionStart` onward. Presence on `system/init` and other stdout events is UNVERIFIED (though largely non-load-bearing given Correction #5's taREDACTED_SECRET design).

3. **Worktree settings-file cwd-scoping is MEDIUM confidence, community-sourced only** (GitHub issues #34437, #28242, not the official hooks page). Directly affects whether a git-tracked project-scope `.claude/settings.json` behaves as expected per worktree — recommend explicit Phase 1 empirical verification.

4. **`--permission-mode` valid value list only partially confirmed.** Core four modes are prose-confirmed in official docs; `auto`/`manual` surfaced once via automated fetch but not in prose examples — don't build against them without a raw-page recheck. Similarly a `fable` model alias is likely an artifact.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | CLI flags, hooks, and auth precedence verified directly against official code.claude.com pages; Node/TS ecosystem picks are standard |
| Features | MEDIUM | Table-stakes categorization HIGH due to strong cross-product convergence; specific competitor details and the "fleet manager" category itself lower-confidence, web-search sourced |
| Architecture | MEDIUM | Component design follows well-supported general practice (HIGH within scope); Claude Code-specific integration points share Stack's community-sourced caveats |
| Pitfalls | MEDIUM-HIGH | Billing-leakage corroborated by 8+ GitHub issues plus official docs (HIGH); most other sections MEDIUM; rate-limit signal reliability explicitly flagged LOW |

**Overall confidence:** MEDIUM-HIGH — execution-mechanics (CLI flags, hooks, auth) unusually well-verified via direct official-doc fetches; weakest area by consensus is rate-limit/usage-window detection, flagged for a spike in every file that touches it.

### Gaps to Address
- **Rate-limit terminal-state detection** — no reliable single signal exists; Phase 1 ships a multi-signal, bias-toward-pausing heuristic, revised once real usage data is available.
- **Worktree settings-file cwd-scoping** — community-sourced only; verify empirically before finalizing `--settings` inline-JSON as the sole per-task hook mechanism.
- **`--resume` reliability under daemon-restart/config-dir conditions** — exact failure boundary not fully characterized; Phase 3 needs an explicit "resume rejected" fallback, not silent retry.
- **Context-window exhaustion detection** — auto-compact reliability bugs exist; whether stream-json surfaces usable context-consumption signals is unconfirmed, check during Phase 1 implementation.

## Sources

### Primary (HIGH confidence)
- https://code.claude.com/docs/en/headless, /cli-reference, /hooks, /authentication, /errors, /env-vars — official docs, fetched directly

### Secondary (MEDIUM confidence)
- GitHub `anthropics/claude-code` issues #12352, #37686, #44669, #39903, #53638, #43333, #45572, #62770, #62013, #7497, #3187, #25629, #54850, #19220, #66144, #12730, #33912, #16103, #54177, #26392, #26498, #29579, #27603, #34437, #28242 — billing leakage, headless hangs, resume failures, rate-limit unreliability, worktree cwd-scoping
- `anthropics/claude-agent-sdk-python` #599, #603 — rate_limit_event parse-breakage
- WebSearch aggregation on Fastify/Hono, better-sqlite3/node:sqlite, Drizzle ORM, shadcn/ui+Tailwind v4
- Competitor/prior-art survey (Devin, Cursor, Copilot, Amp, Conductor, Crystal, claude-squad, uzi, container-use, Sidekiq, Bull Board, Hatchet, Temporal UI)

### Tertiary (LOW confidence)
- Prose rate-limit strings observed in the wild — UI text, may change across versions
- Docker Engineering Blog / incidentdatabase.ai / Cyera "Agent-Inflicted Damage" analysis — qualitative corroboration only
- `auto`/`manual` `--permission-mode` values, `fable` model alias — single automated-fetch artifacts, unconfirmed

---
*Research completed: 2026-07-22*
*Ready for roadmap: yes*
