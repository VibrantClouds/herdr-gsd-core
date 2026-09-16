# Walking Skeleton — Fleet

**Phase:** 1
**Generated:** 2026-07-22

## Capability Proven End-to-End

A human runs `fleet project add .` inside a git repo, and a loopback-only Fastify daemon — backed by a WAL-mode SQLite file it migrated itself — records the project and hands it back on `fleet project list`, with the row surviving a daemon restart.

This is the thinnest capability that exercises the whole stack Fleet will ever need: a real toolchain, a real migration, a real database write and read, a real HTTP surface, and a real user-facing interaction. There is no browser UI in Phase 1, so the CLI and HTTP API together satisfy the skeleton's "real interactive element wired to the API" leg; the React dashboard added in Phase 4 becomes a second client of the same routes without altering anything recorded below.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 22 LTS, pinned by `.nvmrc` and `package.json` `engines` | `better-sqlite3` 13.x hard-requires `>=22` via its `engines` field. The dev machine's shell default is v20.19.4 with v22.21.1 available via nvm, so the pin is load-bearing, not decorative. |
| Language | TypeScript 5.x, `strict: true`, ESM (`"type": "module"`, `moduleResolution: NodeNext`) | QUAL-01 ("typed end to end") has exactly one enforcement surface, and it is this compiler setting. |
| Package layout | **Single package at the repo root**, module boundaries expressed as directories under `src/` rather than as workspaces | CONTEXT.md leaves this to the planner, constrained only by "monorepo, single deployable." Workspaces would add a build-graph and a publish story for a thing that ships as one daemon binary. The Phase 4 dashboard lands as `src/dashboard/` with its own Vite config, built to static assets the same Fastify process serves — still one package, still one deployable. |
| Directory layout | `src/core/` (state machine, event store — zero outward dependencies), `src/db/`, `src/registry/`, `src/api/http/`, `src/cli/`, `src/spikes/`; later phases add `src/scheduler/`, `src/runner/`, `src/hooks/`, `src/notifier/`, `src/dashboard/` | Mirrors ARCHITECTURE.md §9 exactly so the code layout cannot drift from the intended component boundaries in §7. Phase 2+ directories are deliberately **not** scaffolded empty — an empty directory is a planning artifact, not a deliverable. |
| HTTP framework | Fastify 5 with `fastify-type-provider-zod` | Schema-validated routes where the zod schema is also the TypeScript type, so runtime validation and static types cannot drift apart. Locked by CLAUDE.md § Section B. |
| Data layer | better-sqlite3 13 + Drizzle ORM, one file at `~/.fleet/fleet.db` | Synchronous driver suits a single-writer local daemon with no connection pool. Drizzle is a thin typed layer over SQL, not a query-engine ORM. `node:sqlite` is still experimental in the Node 22/24 LTS lines and is the wrong foundation for a correctness-critical append-only log. |
| Migrations | `drizzle-kit generate` producing committed, versioned SQL under `drizzle/`, applied at daemon startup by `drizzle-orm/better-sqlite3/migrator` | **Deliberately not `drizzle-kit push`.** `push` is schema-diff-apply with no migration trail; the `events` and `tasks` schema is correctness-critical from day one and needs an auditable history. |
| Durability pragmas | `journal_mode = WAL`, `foreign_keys = ON`, and a busy timeout via better-sqlite3's constructor `timeout` option — all established in the first migration | STATE-01 requires it, and PITFALLS records that retrofitting WAL after concurrent writers exist (Phase 3's hook receiver) is a much worse problem than setting it before any table exists to contend over. |
| Write discipline | `recordEvent()` in `src/core/event-store/` is the **only** code path permitted to mutate `tasks.status`; enforced by a repository-wide scan test, not by convention | STATE-05. Two writers make the `events` log and the `tasks` projection able to disagree, and the disagreement is invisible because both writers appear to work. |
| State model | A hand-rolled, table-driven transition map with guard functions and a pure `applyEvent()`; no XState | Eight states, flat graph, no nesting or parallel regions. The "actor" is a spawned OS process supervised by the Runner, not by the state machine. Zero runtime dependency, and the type-checker enforces legal transitions. |
| CLI | `commander`, noun-verb subcommands mapping 1:1 onto HTTP routes; a pure HTTP client that never opens the database | D-01 and D-13. The CLI holding the SQLite file open for writes would make the single-writer property a lie. The 1:1 map is a machine-checked table, not a convention. |
| State home | One flat directory, `~/.fleet/` (`fleet.db`, `config.json`, and from Phase 2 `worktrees/<project-slug>/<task-id>/`), overridable in full via `FLEET_HOME`. No XDG split. | D-02. One directory to back up, audit for disk usage, or delete. |
| Network | Fastify `listen({ port, host: '127.0.0.1' })` with the host passed explicitly; default port 4177, overridable via `FLEET_PORT` or `~/.fleet/config.json`, resolved by one shared function both the daemon and CLI import | D-03 and OPS-04. A bound port fails loudly rather than silently picking another, because Phase 3 bakes hook URLs into per-task settings and those URLs must not move across restarts. Remote access is Tailscale's problem. |
| Process model | `fleet daemon` runs in the foreground and logs to stdout. No fork, no detach, no PID file, no `start`/`stop`. Supervision is delegated to a systemd user unit or a launchd plist. | D-04. A PID file is a second unsynchronized source of truth in a system whose design principle is that SQLite is the ground truth. |
| Auth | None, by design | Single user, loopback-only, forever. Adding an auth system would be building the wrong thing. |
| Test runner | Vitest 4, split into two named projects: `unit` (default, hermetic, no daemon, no `claude`) and `spike` (opt-in, spawns the real CLI) | D-11 and QUAL-04. Vitest 4 is a major-version jump — `poolOptions`, `maxThreads`, `maxForks`, `singleThread` and `singleFork` were removed; write config fresh rather than adapting a v2/v3 snippet. |
| Deployment | No deploy step. `npm run dev` starts the daemon locally against `~/.fleet/`; `npm run build` emits `dist/` for the same single process. | One long-running daemon on one box. The Phase 4 dashboard is built to static assets served by this same process — never a second server. |

## Stack Touched in Phase 1

- [x] Project scaffold — Node 22 pin, TypeScript strict, ESLint, Prettier, Vitest projects, drizzle-kit config (Plan 01 Task 1)
- [x] Routing — real routes: `GET /health`, `POST /projects`, `GET /projects`, then `GET|PATCH|DELETE /projects/:idOrSlug` (Plans 01 and 02)
- [x] Database — one real write (`POST /projects` inserts a `projects` row) and one real read (`GET /projects` selects it back), through a committed versioned migration (Plan 01 Tasks 2 and 3)
- [x] User-facing interaction wired to the API — `fleet project add` and `fleet project list` over loopback HTTP, with no CLI code path opening the database (Plan 01 Task 2). No browser UI exists in this phase; the CLI plus HTTP surface is the skeleton's interaction leg.
- [x] Deployment — documented local full-stack run: `nvm use 22 && npm ci && npm run dev`, then `fleet project add .` from any git repo

## Out of Scope (Deferred to Later Slices)

Phase 1 defines the `tasks` schema and the state machine that later phases drive, but **nothing in Phase 1 dispatches a task**. Explicitly deferred:

- Worktree provisioning and the Fleet-owned worktree root (Phase 2, WT-01…07)
- Spawning `claude` from the daemon, the Runner interface, process-group kill, wall-clock caps (Phase 2, RUN-01…08) — Phase 1's only contact with the CLI is the opt-in spike probes, which observe and never dispatch
- Billing-safety enforcement in the production runner (Phase 2, BILL-01…08) — Phase 1 applies the allowlisted-env pattern to its probes only
- Task creation, the queue, the concurrency cap, cancellation (Phase 2, TASK-01…06, SAFE-01…03)
- The hook receiver and hook-driven status (Phase 3, HOOK-01…09)
- Crash reconciliation, orphan detection, the watchdog (Phase 3, OPS-01…03)
- The React dashboard, SSE, diff review, approve/reject, Fleet-performed pushes (Phase 4)
- The OpenClaw notifier and skill (Phase 5)
- A `cancelled` task state — rejected in favour of a `CANCEL` event type landing in `failed` (D-05); revisiting it is a REQUIREMENTS.md amendment plus a schema migration, not a Phase 1 change
- Runtime capability assertion at daemon startup (probing `--permission-mode` validity on boot) — set aside during D-09; revisit in Phase 2 alongside BILL-05's `claude auth status` startup check
- Automation, container backends, Beads integration — v2

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering the architectural decisions above.

- **Phase 2 — Execution:** create a task against a registered project; Fleet provisions an isolated worktree on a `fleet/<taREDACTED_SECRET>` branch and spawns a billing-safe headless `claude -p` session with explicit caps. Consumes Phase 1's `tasks` schema, `recordEvent()`, and the SPIKE-FINDINGS document before hardcoding any CLI flag value.
- **Phase 3 — Status:** task status driven by real hook payloads landing at a taREDACTED_SECRET route, surviving daemon crashes and SIGKILLs. Consumes `recordEvent()` unchanged; adds `src/hooks/` and `src/scheduler/` reconciliation.
- **Phase 4 — Dashboard:** a React SPA built by Vite and served statically by the same Fastify process, plus an SSE stream whose `Last-Event-ID` is the `events.id` this phase already made monotonic. Approve and reject are ordinary REST POSTs that call `recordEvent()` — never a second write path.
- **Phase 5 — OpenClaw:** an outbound notifier subscribing to the in-process event bus, and a chat skill that calls the same HTTP API the CLI already uses. Fleet stays fully usable with OpenClaw absent.
