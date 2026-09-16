# Phase 1: Foundation — Registry & State Machine - Context

**Gathered:** 2026-07-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Fleet can register and track git projects with durable, observable state, and the mechanics Phase 2's runner depends on are verified before that runner is built.

**Delivers:**
- SQLite state store (`projects`, `tasks`, `events`, `settings`) in WAL mode with a migration runner
- A pure, table-driven task state machine with the 8 SM-02 states, unit-testable without the daemon or a real CLI
- `recordEvent()` as the single write path into `tasks.status`, transactional with the `events` append
- Project registry CRUD over both a thin CLI and the HTTP API, plus `.fleet.yml` reading
- A loopback-only Fastify daemon
- Empirical resolution of SPIKE-01…04 against the real `claude` CLI, written up durably for Phase 2

**Not in this phase:** worktree provisioning, spawning `claude`, hook receiving, the dashboard, SSE, the OpenClaw notifier, crash reconciliation. Those are Phases 2–5. Phase 1 defines the `tasks` schema and the state machine that later phases drive, but nothing in Phase 1 dispatches a task.

</domain>

<decisions>
## Implementation Decisions

### Daemon topology & CLI coupling

- **D-01:** The thin CLI is a pure HTTP API client. Every `fleet` command is a request to `127.0.0.1`; no CLI code path opens the SQLite file. When the daemon is unreachable the CLI reports that plainly and exits nonzero — it does not degrade to direct DB access. This is what structurally guarantees STATE-05's single-writer property: a second process holding the DB open for writes would make `recordEvent()` a lie. — **Reversibility:** costly — adding a direct-DB path later means auditing every CLI command for write safety and re-proving the single-writer invariant that STATE-05 and the event-store design rest on.

- **D-02:** Fleet's state lives in one flat home directory, `~/.fleet/` — `~/.fleet/fleet.db`, `~/.fleet/config.json`, and (from Phase 2) `~/.fleet/worktrees/<project-slug>/<task-id>/`. Overridable in full via `FLEET_HOME`. No XDG split. This matches the worktree root that `research/ARCHITECTURE.md` §4 already assumed, and keeps the entire fleet in one directory to back up, audit for disk usage, or delete.

- **D-03:** The daemon binds `127.0.0.1:4177` by default (OPS-04 fixes the address regardless). The port is overridable via `~/.fleet/config.json` or `FLEET_PORT`, and the CLI resolves the port through the identical order so the two always agree without any discovery mechanism. If the port is already bound, the daemon fails loudly at startup rather than silently picking another. A stable, known port is load-bearing: Phase 3 bakes hook URLs into per-task settings, and those URLs must not move across daemon restarts.

- **D-04:** `fleet daemon` runs in the foreground and logs to stdout. Fleet never self-daemonizes — no fork/detach, no PID file, no `fleet start`/`fleet stop`. Supervision is delegated to the OS via a systemd user unit and a launchd plist shipped as installable artifacts. Rationale carried from `research/ARCHITECTURE.md` §3: a PID file is a second unsynchronized source of truth in a system whose design principle is that SQLite is the ground truth.

### Task state machine

The transition table in `research/ARCHITECTURE.md` §1 is the starting point. These decisions close the gaps it left open. All of them keep the state enum at exactly the 8 names SM-02 fixes.

- **D-05:** An explicit user cancellation of a running task lands in `failed`, carrying a distinct `CANCEL` event type with `source: 'user'` in the `events` row. The state enum is not widened. Why the cancel happened is answered by querying the event log, not by adding a state — the same pattern research already applied to `RECONCILE_ORPHANED` landing in `failed`. (The cancel action itself is TASK-06, Phase 2; Phase 1 only needs the transition and event type to exist.) — **Reversibility:** costly — adding a `cancelled` state later means a schema migration on the `tasks.status` CHECK constraint plus updating every dashboard and API consumer that switches on the state set.

- **D-06:** `failed` and `rejected` are fully terminal. No transition leaves them. Retrying means creating a **new** task, optionally pre-filled from the prior task's prompt. This keeps the state graph a DAG, keeps each task's event log a single unambiguous story, and makes "how many attempts did this take" answerable by counting task rows. A retry edge back to `queued` would let one task row accumulate several contradictory runs, PIDs, worktrees, and branches.

- **D-07:** `approved` means "the human said yes; the push is not yet confirmed." A successful push emits `PUSH_SUCCEEDED` → `done`. A failed push emits `PUSH_FAILED` → `needs_human`, so an auth failure, a conflict, or an unreachable remote surfaces instead of stalling invisibly in `approved`. Push failure is deliberately **not** routed to `failed`, because `failed` is terminal (D-06) and a transient network blip must not force re-running the whole task. (The push itself is Phase 4 / SAFE-07; Phase 1 defines the edges.)

- **D-08:** `needs_human` is reachable from two materially different situations — an agent `Notification` hook mid-run, and a post-approval push failure (D-07) — so the task persists **why** it is blocked, sourced from the event that caused the transition. Guard functions on the transition table then permit only the edges valid for that reason:
  - blocked mid-run → `HOOK_STOP` → `review`, or `TIMEOUT` → `failed`
  - blocked on push → retry-push → `done`, or `REJECT` → `rejected`

  This uses the guard mechanism the transition table already has, and structurally prevents "retry push" on a task that was never approved. It also avoids re-approving something already approved, which a generic `RESOLVE → review` escape would have required.

### Verification spikes (SPIKE-01…05)

- **D-09:** Spike output is a **committed, re-runnable probe suite plus a generated findings document** — not one-time hand-written notes. Each spike question gets a script that invokes the real `claude` CLI and asserts what it observed. The whole reason these four facts are UNVERIFIED is that the CLI's stream-json schema is explicitly not a stable contract; a probe that can be re-run after a CLI upgrade turns "a fact silently drifted" from a mystery runner failure into a test failure. — **Reversibility:** reversible — the probes are additive and can be deleted if they prove not worth maintaining.

- **D-10:** SPIKE-01 (how a subscription usage-limit hit is signalled) cannot be forced on demand without burning a plan window — the exact resource this project exists to conserve. Phase 1 therefore ships **a detector plus an evidence trap**, not a verified fact:
  - Implement SAFE-05's multi-signal approach now against all four candidate signals — non-zero exit code, a non-`success` `result` subtype, a forward-compatible check for `rate_limit_event` / `system.api_retry` with `error: "rate_limit"`, and a last-resort stderr substring match — biasing toward pausing when ambiguous.
  - Add a probe that dumps the full raw stream on any *suspected* limit, so the next genuine rate-limit encounter yields ground truth for free.

  The findings doc must state plainly that SPIKE-01 is detected-but-unconfirmed, so Phase 2 doesn't inherit it as settled.

- **D-11:** The probe suite is a **separate opt-in target excluded from the default test run** (e.g. `npm run spikes`, or a distinctly tagged Vitest project). It requires real CLI auth, burns real turns, and is slow. The default `npm test` must stay fast, hermetic, and runnable with no daemon and no real `claude` process — QUAL-04 requires exactly that for the state machine, and mixing the two would break it. The probes are invoked deliberately, most importantly after a CLI upgrade.

- **D-12:** The generated findings live at `.planning/phases/01-foundation-registry-state-machine/01-SPIKE-FINDINGS.md`, alongside the phase that produced them, so downstream GSD agents pick them up as a phase artifact without needing a separate pointer. The doc must record the exact `claude --version` the observations were made against; a finding without a version stamp is not durable.

### CLI surface & registration semantics

The user delegated this area, asking for best-practice defaults. These are Claude's picks — see *Claude's Discretion* below.

- **D-13:** Noun-verb subcommands, with the CLI mapping 1:1 onto HTTP routes so PROJ-06 parity is structural rather than maintained by hand: `fleet project add|list|show|update|remove`, `fleet daemon`. `fleet task …` arrives in Phase 2.

- **D-14:** `fleet project add [path]` defaults `path` to the current directory and **infers** what it can, with every inference overridable by an explicit flag (`--slug`, `--remote`, `--default-branch`, `--name`):
  - `repo_path` — the resolved absolute path
  - `slug` — derived from the directory name, sanitized to be filesystem-safe (it appears in worktree paths per the §8 schema comment)
  - `remote_url` — from `git remote get-url origin`
  - `default_branch` — from `git symbolic-ref refs/remotes/origin/HEAD`, falling back to the local HEAD branch

- **D-15:** Registration validation is fail-fast on things that make a project unusable, warn-and-record on things that only matter later: **hard-fail** if the path is not a git repository, is not resolvable, or if the slug collides with an existing project; **warn but still register** if no `origin` remote exists or the default branch can't be resolved from the remote (such a repo is still trackable — only the Phase 4 push would fail, and by then the user will have fixed it or not care).

- **D-16:** `fleet project remove` is a **soft archive** by default — it sets `archived_at`, which the §8 schema already provides — preserving task and event history and keeping foreign-key integrity intact. `--purge` performs a hard delete and is refused if the project has any task in a non-terminal state. Neither ever touches the underlying repository, per PROJ-04. — **Reversibility:** costly — switching the default to hard delete later is trivial, but making it the default now would destroy event history that the append-only design (STATE-03) is meant to guarantee.

- **D-17:** `.fleet.yml` is **re-read live at each point of use, never snapshotted at registration.** It lives inside the repo and changes with commits; a snapshot would go stale silently and diverge from what the repo actually says. Parsed and validated with zod. A malformed or unparseable file surfaces as a project-level warning in `fleet project show` rather than blocking registration — the file is optional per PROJ-05, so a broken one must not brick a project. Phase 1 reads, validates, and exposes it only; acting on `setup` commands is Phase 2 (WT-05), and re-verifying `protected_paths` against a diff is Phase 4 (SAFE-09).

- **D-18:** Read commands render a human-readable table by default and emit raw API JSON under an explicit `--json` flag. No implicit TTY-based format switching — silently changing output shape based on whether stdout is a pipe is a well-known source of broken scripts.

- **D-19:** Distinguishable failure modes. CLI exit codes: `0` success, `1` operation failed, `2` usage error, `3` daemon unreachable — so a script (and later OpenClaw) can tell "Fleet is down" from "the thing you asked for failed," which matters given D-01 makes an unreachable daemon a routine condition. The HTTP API returns a consistent structured error body (`{ error: { code, message, details } }`) via Fastify's schema validation.

### Claude's Discretion

- The entire **CLI surface & registration semantics** area (D-13 → D-19) was explicitly delegated by the user with "pick best practices and recommended items." These are defensible defaults, not user-stated preferences — the planner may refine details (exact flag names, table column selection, error code taxonomy) as long as the underlying properties hold: CLI/HTTP 1:1 parity, inference with explicit override, fail-fast only on unusable state, non-destructive removal by default, live `.fleet.yml` reads, explicit `--json`, and distinguishable exit codes.
- Monorepo package layout (single package vs. workspaces for daemon/cli/dashboard/shared) was not discussed. The `src/` tree in `research/ARCHITECTURE.md` §9 is the intended module boundary; how that maps onto package boundaries is the planner's call, constrained only by "monorepo, single deployable."
- Migration tooling specifics (`drizzle-kit generate`/`migrate` wiring, migration file naming) are the planner's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture — the primary source for this phase
- `.planning/research/ARCHITECTURE.md` §1 — hand-rolled table-driven state machine; `applyEvent()` pure signature; why not XState
- `.planning/research/ARCHITECTURE.md` §2 — `recordEvent()` as the single write path; WAL mode; transaction boundaries; targeted restart reconciliation rather than full replay; PID + `/proc` start-time capture
- `.planning/research/ARCHITECTURE.md` §7 — component boundary table; what each module may and may not touch
- `.planning/research/ARCHITECTURE.md` §8 — **the concrete SQLite schema for `projects` / `tasks` / `events` / `settings`.** Treat as the baseline; note `events.accepted` (illegal transitions recorded, not dropped) and `tasks.version`
- `.planning/research/ARCHITECTURE.md` §9 — `src/` module layout; `core/` has zero outward dependencies
- `.planning/research/ARCHITECTURE.md` §10 — build order and the thinnest end-to-end slice; steps 1–4 are Phase 1's spine
- `.planning/research/ARCHITECTURE.md` "Anti-Patterns to Avoid" — multiple writers of `tasks.status`; session-UUID hook correlation; full event replay on boot

### Stack
- `.claude/CLAUDE.md` "Section B: Node/TypeScript Stack" — pinned library choices and versions (Fastify 5, better-sqlite3 11, Drizzle, Vitest, zod 4), plus the "What NOT to Use" table
- `.planning/research/STACK.md` — the same choices with fuller rationale

### Claude Code CLI facts — the input to the spikes
- `.claude/CLAUDE.md` "Section A" A1–A5 — the verified/unverified flag and event-schema table. **A5 in particular is flagged as the weakest-confidence area and is what SPIKE-01 exists to resolve.** Note A2's explicit instruction: treat unknown stream-json `type` values as forward-compatible no-ops rather than throwing
- `.planning/research/PITFALLS.md` — known failure modes; read before writing the spike probes

### Requirements & scope
- `.planning/REQUIREMENTS.md` — SPIKE-01…05, PROJ-01…06, STATE-01…06, SM-01…04, OPS-04, QUAL-01, QUAL-04 are this phase's requirement set
- `.planning/ROADMAP.md` "Phase 1" — goal and the 5 success criteria this phase is verified against
- `.planning/PROJECT.md` "Constraints" — billing, execution, deployment, network, isolation, git-safety, platform constraints. Non-negotiable

### Produced by this phase (does not exist yet)
- `.planning/phases/01-foundation-registry-state-machine/01-SPIKE-FINDINGS.md` — per D-12. **Phase 2's runner design must read this before hardcoding any CLI flag value.**

</canonical_refs>

<code_context>
## Existing Code Insights

**Greenfield.** The repository contains only `.planning/` and `.claude/` — no source, no `package.json`, no test setup, no lockfile. Phase 1 creates the entire project skeleton.

### Reusable Assets
- None in-repo. The nearest thing to a reusable asset is `research/ARCHITECTURE.md` §1, §2, and §8, which contain near-implementable TypeScript and SQL for the state machine, `recordEvent()`, and the schema. Treat them as strong starting points to adapt, not as literal copy targets.

### Established Patterns
- No code patterns exist yet. **Phase 1 sets them**, and everything downstream inherits them: TypeScript strict mode (QUAL-01), the `core/` inward-dependency rule, single-write-path discipline, and Vitest as the sole runner.
- The one convention already fixed outside this phase: `.claude/CLAUDE.md` is authoritative on library selection and explicitly forbids the Claude Agent SDK, BullMQ/Redis, `node:sqlite`, Prisma, and Next.js.

### Integration Points
- **`claude` CLI** — the spike probes are Phase 1's only contact with it, and they only observe; nothing in Phase 1 dispatches a real task.
- **Local git** — read-only in Phase 1 (remote and default-branch inference at registration, per D-14). Worktree mutation begins in Phase 2.
- **Filesystem** — `~/.fleet/` is created and owned by Fleet from this phase forward (D-02).

</code_context>

<specifics>
## Specific Ideas

- Port **4177** specifically — it is already used throughout `research/ARCHITECTURE.md` §5's hook-URL examples, so keeping it avoids gratuitous drift between the docs and the code.
- Branch namespace `fleet/<taREDACTED_SECRET>` from §4 is referenced by the `tasks.branch_name` column that Phase 1 creates, even though Phase 1 never writes it.
- The findings doc must carry the observed `claude --version`. A version-less finding is not durable (D-12).
- The user's framing on the delegated CLI area was "pick best practices and recommended items" — treat D-13 → D-19 as sound defaults open to refinement, not as locked user preferences.

</specifics>

<deferred>
## Deferred Ideas

- **Amending SM-02 to add a `cancelled` state** — rejected in favour of D-05's event-type approach. If the dashboard later proves it genuinely needs cancellation visible as a distinct state rather than an event, that is a REQUIREMENTS.md amendment plus a schema migration, not a Phase 1 change.
- **Runtime capability assertion at daemon startup** — probing `--permission-mode` validity or checking the `system/init` `capabilities` array on boot and refusing to dispatch on a mismatch. Considered and set aside during D-09; it shifts detection from dev-time to run-time. Worth revisiting in Phase 2 alongside BILL-05's `claude auth status` startup check, since both are "verify the CLI before dispatching" and would share a code path.
- **`docs/claude-cli-facts.md` as a repo-level doc** — considered and set aside in D-12; the findings are a planning input for Phase 2 more than product documentation. Reconsider if the runner source ends up needing an in-repo pointer.
- **Deliberately burning a plan window to observe a real rate limit** — rejected in D-10 as too expensive. If SPIKE-01's evidence trap has still captured nothing by the time Phase 2's queue-pause logic needs verifying, revisit then.

</deferred>

---

*Phase: 1-Foundation — Registry & State Machine*
*Context gathered: 2026-07-22*
