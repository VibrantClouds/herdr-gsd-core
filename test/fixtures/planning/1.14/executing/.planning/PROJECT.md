# Fleet

## What This Is

Fleet is a self-hosted, local-first control plane for my personal software projects. It is the single source of truth for where each of my many git repos lives, what state it's in, and what's pending — and it is the dispatcher for autonomous headless Claude Code sessions that advance those projects. Single user (me), loopback-only, no auth beyond the network layer.

## Core Value

I create a task against a registered project and Fleet reliably runs an isolated, capped, observable Claude Code session that produces a reviewable branch — without me babysitting a terminal.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Registry & state**
- [ ] Register, list, update, and remove git projects (repo path, remote, default branch, env profile, notes, tags)
- [ ] Persist all state in SQLite: `projects`, `tasks`, `events` (append-only), `settings`
- [ ] Every state transition is observable as a row in the `events` table
- [ ] Read optional per-repo `.fleet.yml` (setup commands, test command, env profile name, protected paths)
- [ ] Surface open Beads (`bd`) counts read-only for repos that use it

**Task lifecycle**
- [ ] Create a task against a project (title + prompt) from CLI, HTTP API, or cron sweep
- [ ] Enqueue tasks and dispatch when a concurrency slot frees up
- [ ] Task status machine: `queued → running → needs_human | review → approved | rejected → done | failed`
- [ ] The state machine is an explicit, single artifact in code — not implied by scattered status writes

**Isolation & execution**
- [ ] Provision one isolated git worktree on a task branch per task, under a Fleet-owned directory
- [ ] Worktree provisioning is idempotent and crash-safe; daemon restart reconciles orphaned worktrees/sessions from the events log
- [ ] Launch headless Claude Code via the `claude` CLI: `claude -p --output-format stream-json`, with explicit `--allowedTools`, `--permission-mode`, `--max-turns`, and wall-clock cap
- [ ] Parse `stream-json` from stdout for in-process visibility
- [ ] Continue sessions via `--resume <session-uuid>`
- [ ] Inject env per-project from Fleet config; never propagate repo `.env`; redact secrets in logs
- [ ] Actively strip `ANTHROPIC_API_KEY` and any Anthropic billing-related variables from worker environments, even when present in the daemon's own environment
- [ ] Verify at daemon startup that the CLI is authenticated on a Claude subscription (not API key) and refuse to dispatch otherwise
- [ ] Runner interface is abstracted so a Docker backend can slot in later without schema changes

**Status reporting**
- [ ] Install per-worktree Claude Code hook config at provision time (Stop, Notification, SubagentStop, PostToolUse)
- [ ] Hook receiver at `http://127.0.0.1:<port>/hooks/claude` correlates payloads by session UUID
- [ ] Hook payloads are the ground truth for state transitions — status is hook-driven, not polled
- [ ] Watchdog marks a session stale and alerts when no hook activity arrives for N minutes

**Safety rails**
- [ ] Global concurrency cap (default 3)
- [ ] Per-task `--max-turns` cap and per-task wall-clock cap
- [ ] Model routing: Haiku for cheap classification/summarization, Sonnet default, Opus opt-in per task
- [ ] Kill switch that terminates all running sessions
- [ ] Detect CLI rate-limit responses, pause the queue with exponential backoff until the window resets, notify me, and never busy-retry
- [ ] Track per-task turns and duration as the usage proxy for plan limits (5-hour and weekly windows)
- [ ] Agents never push to default branches; Fleet performs all git pushes, only after approval

**Dashboard & review**
- [ ] Fleet overview: all projects, task states, pending-human flags at a glance
- [ ] Task detail with live event stream
- [ ] Diff review for a finished task
- [ ] Approve → Fleet pushes the branch / opens a PR; Reject → Fleet archives the worktree
- [ ] Full loop completable without touching a terminal
- [ ] Dashboard is visually polished — sleek, stylish, and pleasant to look at, not a utilitarian status table. This is a personal tool I'll look at daily; aesthetics are a real requirement, not a nice-to-have
- [ ] Coherent design system: deliberate typography, spacing, and color; dark mode as the primary look; live state changes feel responsive rather than jumpy

**OpenClaw integration**
- [ ] An OpenClaw `fleet` skill wrapping Fleet's HTTP API: list projects, fleet status, create task, approve/reject task, pause/resume queue
- [ ] Fleet pushes notifications outbound to OpenClaw's local API/webhook (`openclaw message send` pattern), never heartbeat-dependent delivery
- [ ] Terminal states and needs-human states reach me on whatever channel I'm on
- [ ] Fleet remains fully usable without OpenClaw — dashboard + CLI are sufficient alone

**Automation**
- [ ] Cron sweeps for recurring per-project runs (e.g. nightly dependency/doc updates)
- [ ] Stale-session watchdog alerts
- [ ] Usage dashboards: turns/duration per task, rate-limit window consumption
- [ ] First-pass automated review summary attached to each finished task

**Quality**
- [ ] Typed end to end
- [ ] Integration tests for the runner state machine and hook receiver, using a mock Claude Code fixture process that emits hook calls

### Out of Scope

- **Multi-user, auth, RBAC** — single user, forever; loopback + Tailscale is the whole security model
- **USD budget caps** — billing is subscription-based; the scarce resource is plan usage windows, not dollars. Only relevant if an API-key mode is ever added, which it should not be by default
- **API-key billing / Claude Agent SDK execution** — subscription-only operation is a hard requirement; the SDK's billing treatment is less stable than the CLI's
- **Driving an interactive Claude Code TUI programmatically** — headless `-p` mode only
- **Cloud/sandbox execution** — design the runner interface for it, don't build it in v1
- **Container isolation** — later phase; v1 uses worktrees
- **A chat interface** — OpenClaw owns chat
- **Rebuilding an issue tracker** — Beads and GitHub exist; Beads integration is read-only in v1
- **Running agent code inside OpenClaw's runtime or workspace** — OpenClaw never executes project code
- **Imposing a task tracker on repos** — Fleet reads optional `.fleet.yml`, nothing more
- **Public network exposure of any component** — everything binds `127.0.0.1`
- **Windows support** — Linux/macOS only

## Context

**Existing ecosystem:** OpenClaw is my existing personal agent gateway. I talk to OpenClaw from Telegram; OpenClaw talks to Fleet; Fleet runs the actual coding sessions. OpenClaw is an adapter in front of Fleet, not a dependency of it.

**The problem being solved:** I have many git-based repos in varying states of completion and I lose track of where each one lives, what state it's in, and what's pending.

**The core loop, end to end:** I (or OpenClaw on my behalf, or a cron sweep) create a task against a registered project. Fleet enqueues it. When a concurrency slot is free, Fleet provisions an isolated git worktree on a task branch, launches headless Claude Code with explicit caps, and tracks the session. Claude Code hooks POST structured JSON status back to Fleet's webhook receiver. Terminal and needs-human states are pushed to me through OpenClaw. I review the diff; approve → Fleet pushes the branch / opens a PR; reject → Fleet archives the worktree. The dashboard shows the whole fleet at a glance.

**Repo conventions:** Fleet does not impose a tracker on repos. It reads an optional `.fleet.yml` per repo for setup commands to run on worktree creation, test command, env profile name, and protected paths.

**Deliberately deferred to phase discussion:**
- Dashboard depth in v1 — read-mostly status board vs. full task creation/review UI. I lean full review UI including diff viewer, but push back if it bloats Phase 1.
- Diff review UX — render in dashboard vs. deep-link into a local tool.
- Whether task prompts support templates/variables (e.g. a reusable "update deps and fix breakage" template).
- Notification granularity defaults — every state change vs. terminal + `needs_human` only.

## Constraints

- **Billing**: Subscription-only Claude Code operation — never API-key billing. If `ANTHROPIC_API_KEY` leaks into a worker environment, Claude Code silently switches from subscription to per-token API billing. This makes env stripping a correctness requirement, not hygiene.
- **Execution**: Spawn the `claude` CLI directly in headless mode. Do not use the Claude Agent SDK — its billing treatment is less stable than the CLI's. Never drive an interactive TUI programmatically.
- **Deployment**: One long-running daemon (API + queue + session runner + hook receiver) + SQLite + web dashboard + thin CLI. Monorepo, single deployable.
- **Tech stack**: TypeScript/Node for daemon and dashboard — aligns with OpenClaw's ecosystem. Dashboard is plain React with a minimal component setup, served by the daemon; no separate deploy.
- **Network**: Everything binds `127.0.0.1` only. Remote access is Tailscale's problem, not Fleet's. No auth system in v1.
- **Isolation**: One task → one branch → one worktree → one agent. Worktrees live under a Fleet-owned directory and copy only git-tracked file context — no `.env` propagation.
- **Git safety**: Agents never push to default branches. All pushes are performed by Fleet, after approval.
- **Design**: The dashboard must look genuinely good — sleek and stylish, dark-mode-first, with a coherent design system. This is a daily-use personal tool, so visual quality is a stated requirement rather than polish deferred indefinitely.
- **Platform**: Linux/macOS only.
- **Scale**: Single user. No multi-tenancy, ever.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| One daemon + SQLite + dashboard + CLI, monorepo single deployable | Local-first single-user tool; multiple services would be operational overhead with no benefit | — Pending |
| TypeScript/Node for daemon and dashboard | Aligns with OpenClaw's ecosystem and the Claude Code tooling world | — Pending |
| Spawn the `claude` CLI headless, not the Claude Agent SDK | The CLI's subscription billing treatment is stable; the SDK's is less so, and subscription-only is a hard requirement | — Pending |
| `--output-format stream-json` parsed from stdout | Gives in-process visibility into a running session without polling | — Pending |
| Hooks are ground truth for state transitions, not polling | Hooks are the only authoritative signal Claude Code emits; polling would be lossy and lagging | — Pending |
| Git worktree per task, not containers, in v1 | Cheapest isolation that still guarantees one-agent-one-branch; runner interface is abstracted so Docker can slot in later | — Pending |
| Strip `ANTHROPIC_API_KEY` from worker envs even if set on the daemon | A leaked key silently flips Claude Code from subscription to per-token API billing | — Pending |
| Track turns + duration, not USD, as the usage proxy | Headless subscription runs don't report dollar cost; the scarce resource is plan usage windows | — Pending |
| Rate limits pause the queue with exponential backoff, never busy-retry | Busy-retrying against a plan limit burns the window and delivers nothing | — Pending |
| Fleet performs all git pushes after approval; agents never push | Keeps a human gate between agent output and any shared branch | — Pending |
| OpenClaw is an adapter, not a dependency | Dashboard + CLI must be sufficient on their own so Fleet never dies with its gateway | — Pending |
| Loopback-only binding; no auth in v1 | Single user; Tailscale already solves remote access, and an auth system would be pure cost | — Pending |
| Read optional `.fleet.yml`; don't impose a tracker | Repos already have their own conventions (Beads, GitHub); Fleet adapts rather than dictating | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-22 after initialization*
