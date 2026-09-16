# Phase 1: Foundation — Registry & State Machine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-22
**Phase:** 1-Foundation — Registry & State Machine
**Areas discussed:** Daemon home & CLI↔daemon coupling, State machine edges (cancel/retry/terminal), Spike methodology & durable write-up, CLI surface & registration semantics (delegated)

---

## Area selection

Four gray areas were offered; the user selected all four.

| Area | Selected |
|------|----------|
| Daemon home & CLI↔daemon coupling | ✓ |
| State machine edges: cancel, retry, terminal | ✓ |
| Spike methodology & durable write-up | ✓ |
| CLI surface & registration semantics | ✓ |

---

## Daemon home & CLI↔daemon coupling

### How should the thin CLI talk to Fleet's state?

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP only — CLI is a pure API client | Every command is an HTTP call; daemon down means the CLI errors and exits nonzero. Structurally guarantees one writer. | ✓ |
| HTTP first, read-only SQLite fallback | Writes over HTTP; reads fall back to opening the DB read-only when unreachable. | |
| CLI can open the DB directly for everything | CLI writes directly when the daemon is down. Breaks STATE-05's single-writer guarantee. | |

**User's choice:** HTTP only — CLI is a pure API client
**Notes:** Chosen despite the cost that the daemon must be running even to list projects. The single-writer guarantee is the deciding factor.

### Where should Fleet's own state live on disk?

| Option | Description | Selected |
|--------|-------------|----------|
| `~/.fleet/` — one flat home dir | fleet.db, config.json, worktrees/ in one tree; FLEET_HOME override. Matches research §4's worktree root. | ✓ |
| XDG-compliant split | DB, config, and state in three separate XDG trees. Spec-correct, inconsistent on macOS. | |
| `~/.fleet/` with XDG override honored | Default flat, respect XDG_* when explicitly set. | |

**User's choice:** `~/.fleet/` — one flat home dir

### How should the daemon's listen port be decided?

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed default 4177, overridable in config | Config/env override, identical resolution order in the CLI, fail loudly if bound. | ✓ |
| Fixed 4177, no override at all | Hardcoded. Zero config surface; blocks running a test daemon alongside the real one. | |
| Ephemeral port written to a runtime file | Bind :0, write chosen port to disk. Never collides; stales baked hook URLs and adds a second source of truth. | |

**User's choice:** Fixed default 4177, overridable in config
**Notes:** Stable port matters because Phase 3 bakes hook URLs into per-task settings.

### How does the daemon get started and stay running in v1?

| Option | Description | Selected |
|--------|-------------|----------|
| Foreground `fleet daemon` + ship a systemd unit | Foreground, logs to stdout; systemd user unit and launchd plist shipped as artifacts. No self-daemonizing. | ✓ |
| Foreground only, supervision is my problem | No unit files shipped in v1. | |
| Self-daemonizing `fleet start` / `fleet stop` | CLI forks and tracks via PID file. Reintroduces PID-file-as-second-source-of-truth. | |

**User's choice:** Foreground `fleet daemon` + ship a systemd unit

---

## State machine edges: cancel, retry, terminal

### Where does an explicit user cancel of a running task land?

| Option | Description | Selected |
|--------|-------------|----------|
| `failed`, with a distinct CANCEL event type | State stays `failed`; the events row records why. Enum stays at SM-02's 8 names. | ✓ |
| `review`, so you can still inspect the work | Partial work reaches the diff viewer; blurs "finished" with "killed." | |
| Widen the state set with `cancelled` | Maximally explicit; contradicts SM-02 and requires amending REQUIREMENTS.md. | |

**User's choice:** `failed`, with a distinct CANCEL event type

### Should a task be able to leave `failed` or `rejected`?

| Option | Description | Selected |
|--------|-------------|----------|
| Fully terminal — retry means a new task | Nothing leaves either. Graph stays a DAG; attempt count = task count. | ✓ |
| `failed` → `queued` retry edge, `rejected` stays terminal | Convenient for transient failures; overwrites worktree/branch/PID fields. | |
| Both `failed` and `rejected` can return to `queued` | Maximum flexibility, maximum ambiguity — multiple review verdicts per task row. | |

**User's choice:** Fully terminal — retry means a new task

### How should the `approved` → `done` edge work, given the push can fail?

| Option | Description | Selected |
|--------|-------------|----------|
| PUSH_SUCCEEDED → done, PUSH_FAILED → needs_human | `approved` = human said yes, push unconfirmed. Failure surfaces rather than stalling. | ✓ |
| PUSH_SUCCEEDED → done, PUSH_FAILED → failed | Conflates bad agent work with a transient network failure; `failed` being terminal makes this expensive. | |
| APPROVE goes straight to `done`; push is fire-and-forget | Fewest states; a failed push leaves a `done` task that was never pushed. | |

**User's choice:** PUSH_SUCCEEDED → done, PUSH_FAILED → needs_human
**Notes:** This choice is what created the follow-up question below — `needs_human` became reachable from two distinct situations.

### How should a human resolve a `needs_human` task?

| Option | Description | Selected |
|--------|-------------|----------|
| Track why it's stuck, and allow only the edges that fit | Persist the blocking reason; guards permit only valid edges per reason. | ✓ |
| One generic escape: RESOLVE → review | Simplest graph; a push-failed task would land back in `review` and need re-approving. | |
| Split into two states in the enum | Zero ambiguity; contradicts SM-02's fixed 8-state list. | |

**User's choice:** Track why it's stuck, and allow only the edges that fit

---

## Spike methodology & durable write-up

### What form should the spike output take?

| Option | Description | Selected |
|--------|-------------|----------|
| Committed re-runnable probe suite + generated findings doc | A script per spike question that invokes the real CLI and asserts. Re-run after CLI upgrades. | ✓ |
| One-time findings doc, hand-written | Cheapest; nothing tells you when a fact goes stale. | |
| Findings doc + runtime capability assertion at daemon startup | Shifts detection from dev-time to run-time. | |

**User's choice:** Committed re-runnable probe suite + generated findings doc

### How should Phase 1 handle SPIKE-01, which can't be forced on demand?

| Option | Description | Selected |
|--------|-------------|----------|
| Build the multi-signal detector now, capture evidence opportunistically | Implement SAFE-05's four-signal detection plus a raw-stream evidence trap on any suspected limit. | ✓ |
| Deliberately burn a plan window to observe it | Real ground truth; costs the scarce resource the project exists to conserve. | |
| Defer SPIKE-01 to Phase 2 and mark it explicitly unresolved | Honest, but leaves Phase 2's queue-pause design unverified at the moment it's built. | |

**User's choice:** Build the multi-signal detector now, capture evidence opportunistically

### How should the probe suite be wired into the repo?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate opt-in target, never in the default test run | `npm run spikes` excluded from `npm test`; keeps the default suite hermetic per QUAL-04. | ✓ |
| Same suite, skipped unless FLEET_SPIKES=1 | One command; risk of silently skipping and reporting green. | |
| Standalone scripts, not tests at all | Flexible for exploration; nothing asserts. | |

**User's choice:** Separate opt-in target, never in the default test run

### Where should the generated findings doc live?

| Option | Description | Selected |
|--------|-------------|----------|
| `.planning/phases/01-.../01-SPIKE-FINDINGS.md` | Lives with the producing phase; picked up automatically as a canonical ref. | ✓ |
| `docs/claude-cli-facts.md` in the repo proper | Versioned next to dependent code; needs explicit listing as a canonical ref. | |
| Both — phase artifact plus a repo doc that points at it | Discoverable from either direction; two files to keep in sync. | |

**User's choice:** `.planning/phases/01-.../01-SPIKE-FINDINGS.md`

---

## CLI surface & registration semantics

**User's choice:** Delegated — "Please pick best practices and recommended items in the next area."

No options were presented for this area. Claude selected defaults directly; they are recorded as D-13 through D-19 in CONTEXT.md and flagged there as discretionary rather than user-stated. Summary of what was chosen:

- Noun-verb subcommands mapping 1:1 onto HTTP routes (`fleet project add|list|show|update|remove`, `fleet daemon`)
- `fleet project add [path]` defaults to cwd and infers slug / remote / default branch, all overridable by explicit flags
- Fail-fast on non-git path, unresolvable path, or slug collision; warn-and-register on a missing remote or unresolvable default branch
- `remove` is a soft archive setting `archived_at`; `--purge` hard-deletes and is refused when non-terminal tasks exist; neither touches the repo
- `.fleet.yml` re-read live at each point of use, validated with zod; malformed files warn rather than block registration
- Human table output by default, raw JSON under explicit `--json`; no TTY-based format switching
- CLI exit codes 0 / 1 / 2 / 3 (success / failed / usage error / daemon unreachable); structured `{ error: { code, message, details } }` HTTP error bodies

---

## Claude's Discretion

- The entire CLI surface & registration semantics area (D-13 → D-19), explicitly delegated by the user.
- Monorepo package layout — single package vs. workspaces. Not discussed; research §9's `src/` tree defines module boundaries, the package mapping is the planner's call.
- Migration tooling specifics — `drizzle-kit` wiring and migration file naming.

## Deferred Ideas

- Amending SM-02 to add a `cancelled` state — set aside in favour of the CANCEL event type. Would require a REQUIREMENTS.md amendment plus a schema migration.
- Runtime capability assertion at daemon startup — considered during the spike-form question and set aside. Worth revisiting in Phase 2 next to BILL-05's `claude auth status` check, since both are "verify the CLI before dispatching."
- `docs/claude-cli-facts.md` as a repo-level doc — set aside; findings are a planning input more than product documentation.
- Deliberately burning a plan window to observe a real rate limit — rejected as too expensive; revisit if the evidence trap has captured nothing by the time Phase 2 needs it.
