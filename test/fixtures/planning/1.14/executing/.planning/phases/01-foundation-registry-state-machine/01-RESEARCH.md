# Phase 1: Foundation — Registry & State Machine - Research

**Researched:** 2026-07-22
**Domain:** SQLite-backed state store + pure state machine + project registry (CLI+HTTP) + loopback daemon + empirical spike probes against the live `claude` CLI
**Confidence:** HIGH (state machine, event store, schema, env/CLI facts — carried from prior committed research and cross-verified live against the installed `claude` v2.1.218); MEDIUM (migration tooling, test-fixture patterns, Fastify+zod wiring — WebSearch-sourced, no Context7 available this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The thin CLI is a pure HTTP API client. No CLI code path opens the SQLite file. Daemon unreachable → CLI reports plainly, exits nonzero, never degrades to direct DB access. This structurally guarantees STATE-05.
- **D-02:** All state lives in `~/.fleet/` (`fleet.db`, `config.json`, and from Phase 2 `worktrees/<project-slug>/<task-id>/`). Overridable via `FLEET_HOME`. No XDG split.
- **D-03:** Daemon binds `127.0.0.1:4177` by default. Port overridable via `~/.fleet/config.json` or `FLEET_PORT`; CLI resolves port through the identical order. If the port is already bound, fail loudly at startup — never silently pick another.
- **D-04:** `fleet daemon` runs in the foreground, logs to stdout. No self-daemonizing, no fork/detach, no PID file, no start/stop subcommands. OS-level supervision (systemd/launchd) is out of Fleet's own hands.
- **D-05:** Explicit user cancellation lands in `failed`, carrying a distinct `CANCEL` event type with `source: 'user'`. State enum stays at exactly 8 names (SM-02). (Cancel action itself is Phase 2/TASK-06; Phase 1 only needs the transition + event type to exist.)
- **D-06:** `failed` and `rejected` are fully terminal — no transition leaves them. Retrying means creating a **new** task row, never reusing one.
- **D-07:** `approved` means "human said yes, push not yet confirmed." `PUSH_SUCCEEDED` → `done`. `PUSH_FAILED` → `needs_human` (never `failed`, since `failed` is terminal and a transient push failure must not force a full re-run). Push mechanics are Phase 4; Phase 1 defines the edges only.
- **D-08:** `needs_human` persists **why** it's blocked, sourced from the causing event. Guard functions permit only valid edges per reason: mid-run block → `HOOK_STOP`→`review` or `TIMEOUT`→`failed`; push-block → retry-push→`done` or `REJECT`→`rejected`.
- **D-09:** Spike output is a **committed, re-runnable probe suite** (scripts that invoke the real `claude` CLI and assert observations) plus a generated findings doc — not one-time hand-written notes.
- **D-10:** SPIKE-01 (rate-limit signal) cannot be forced without burning a plan window. Ship a **detector plus an evidence trap**, not a verified fact: implement the multi-signal SAFE-05 approach now; add a probe that dumps the full raw stream on any *suspected* limit. Findings doc must state SPIKE-01 is detected-but-unconfirmed.
- **D-11:** The probe suite is a **separate opt-in target** excluded from the default test run (e.g. `npm run spikes`). Default `npm test` stays fast, hermetic, no daemon, no real `claude` process (QUAL-04).
- **D-12:** Findings live at `.planning/phases/01-foundation-registry-state-machine/01-SPIKE-FINDINGS.md`. Must record the exact `claude --version` observations were made against.
- **D-13:** Noun-verb CLI subcommands mapping 1:1 onto HTTP routes: `fleet project add|list|show|update|remove`, `fleet daemon`. `fleet task …` is Phase 2.
- **D-14:** `fleet project add [path]` defaults to cwd, infers `repo_path`/`slug`/`remote_url`/`default_branch`, every inference overridable by an explicit flag (`--slug`, `--remote`, `--default-branch`, `--name`).
- **D-15:** Hard-fail registration if path isn't a git repo, isn't resolvable, or slug collides. Warn-but-register if no `origin` remote or default branch can't be resolved.
- **D-16:** `fleet project remove` is a **soft archive** by default (sets `archived_at`). `--purge` hard-deletes, refused if the project has any task in a non-terminal state. Never touches the underlying repo.
- **D-17:** `.fleet.yml` is **re-read live at each point of use**, never snapshotted at registration. Parsed/validated with zod. Malformed file → project-level warning in `fleet project show`, never blocks registration.
- **D-18:** Read commands render a human-readable table by default, raw JSON only under explicit `--json`. No implicit TTY-based format switching.
- **D-19:** CLI exit codes: `0` success, `1` operation failed, `2` usage error, `3` daemon unreachable. HTTP API returns `{ error: { code, message, details } }` via Fastify schema validation.

### Claude's Discretion

- The entire **CLI surface & registration semantics** area (D-13→D-19) was delegated with "pick best practices and recommended items." Defensible defaults, not locked preferences — planner may refine exact flag names, table columns, error taxonomy, as long as the underlying properties hold (CLI/HTTP parity, inference+override, fail-fast-on-unusable-only, non-destructive removal default, live `.fleet.yml` reads, explicit `--json`, distinguishable exit codes).
- Monorepo package layout (single package vs. workspaces) — planner's call, constrained only by "monorepo, single deployable." `src/` tree in ARCHITECTURE.md §9 is the intended module boundary.
- Migration tooling specifics (`drizzle-kit generate`/`migrate` wiring, migration file naming) — planner's call; see Code Examples below for the concrete mechanism.

### Deferred Ideas (OUT OF SCOPE)

- Amending SM-02 to add a `cancelled` state — rejected in favor of D-05's event-type approach.
- Runtime capability assertion at daemon startup (probing `--permission-mode` validity / `system/init` `capabilities` array on boot) — set aside during D-09; revisit Phase 2 alongside BILL-05.
- `docs/claude-cli-facts.md` as a repo-level doc — set aside in D-12; findings are a planning input, not product documentation.
- Deliberately burning a plan window to observe a real rate limit — rejected in D-10 as too expensive.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SPIKE-01 | Determine how `claude` signals a plan usage-limit hit | Section "SPIKE Probe Design" below — detector-plus-evidence-trap approach per D-10; live-verified `--permission-mode`/`--help` output feeds the probe's known-good baseline |
| SPIKE-02 | Verify `--permission-mode` valid values against the live CLI | **Empirically resolved this session** — live `claude --help` (v2.1.218) shows the actual choice list; see "SPIKE-02: RESOLVED" below |
| SPIKE-03 | Verify `.claude/settings.json` worktree scoping vs. `--settings` inline JSON | Confirmed by official docs (STACK.md A3) that `.claude/settings.local.json` resolves to main checkout; probe design below turns this into a re-runnable assertion |
| SPIKE-04 | Verify `session_id` presence across stream-json event types | Official docs confirm `session_id` on `SessionStart` hook payload and `system/api_retry`; probe design below closes the gap for `system/init` and `assistant`/`user`/`result` |
| SPIKE-05 | Spike findings recorded as durable notes | D-12 fixes the location and the version-stamp requirement; template provided below |
| PROJ-01…06 | Project registry CRUD, CLI+HTTP, `.fleet.yml` | Standard Stack + Code Examples (git validation, zod parsing) |
| STATE-01…06 | SQLite WAL, 4-table schema, append-only events, single-writer projection | ARCHITECTURE.md §2/§8 (canonical schema), Code Examples (`recordEvent`) |
| SM-01…04 | Pure table-driven state machine, unit-testable | ARCHITECTURE.md §1 (canonical `transitions`/`applyEvent`), Validation Architecture below |
| OPS-04 | Loopback-only bind | Code Examples (Fastify `host: '127.0.0.1'`), Security Domain below |
| QUAL-01 | Typed end to end | Standard Stack (TypeScript 5.x strict) |
| QUAL-04 | State machine unit tests, no daemon/CLI | Validation Architecture below |

</phase_requirements>

## Summary

Phase 1 has almost no open architectural questions — `.planning/research/ARCHITECTURE.md` §1/§2/§7/§8/§9/§10 already contain near-implementable code for the state machine, the single-write-path event store, the SQLite schema, and the build order, and `.claude/CLAUDE.md` already locks the stack (Fastify 5, better-sqlite3, Drizzle, zod, Vitest). This document does not re-derive any of that. It does three new things: (1) **empirically resolves SPIKE-02** against the actually-installed `claude` CLI (v2.1.218) rather than leaving it as a TODO for a Phase 1 task — the valid `--permission-mode` value set turned out to differ from what `.claude/CLAUDE.md` had flagged as "confirmed core 4"; (2) verifies exact current package versions via the npm registry, catching a load-bearing drift (`better-sqlite3` is now major version 13, requiring Node ≥22, not the "11.x" pinned in `.claude/CLAUDE.md`, and the locally available Node default is v20); (3) fills the concrete implementation-pattern gaps CONTEXT.md flagged as open: Drizzle+better-sqlite3 migration wiring, Fastify+zod route validation, the fake-`claude`-binary Vitest fixture pattern, and git default-branch inference with a real fallback chain.

**Primary recommendation:** Build exactly the walking skeleton ARCHITECTURE.md §10 steps 1–4 describe (schema+migrations → state machine → event store → registry), treat the already-live SPIKE-02 answer below as authoritative for the runner-facing parts of the probe suite, and gate the `better-sqlite3` 13.x / Node 22 dependency behind an explicit `.nvmrc`/engines check since the dev machine's default Node is currently v20.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Project registry CRUD (PROJ-01…06) | API / Backend | — | Fastify routes own validation + SQLite writes; CLI is a pure HTTP client per D-01 |
| `.fleet.yml` parsing (PROJ-05) | API / Backend | — | Read live from the repo at each use (D-17); lives in the registry module, not the CLI |
| SQLite schema + migrations (STATE-01…06) | Database / Storage | — | `better-sqlite3` + Drizzle Kit own the four tables; single Node process, no separate DB tier |
| Task state machine (SM-01…04) | API / Backend (pure module) | — | `core/state-machine` per ARCHITECTURE.md §9 — zero I/O, zero DB, zero HTTP; sits inside the backend process but architecturally isolated from it |
| Event store / `recordEvent()` (STATE-03…05) | API / Backend | Database / Storage | The function lives in-process but its entire purpose is the DB-transaction boundary — API tier orchestrates, DB tier persists |
| Loopback HTTP binding (OPS-04) | API / Backend | — | Fastify's own `.listen({host})` call; no reverse proxy, no separate network tier in Phase 1 |
| Thin CLI (D-01, D-13…19) | Client (local process) | — | Talks to the API tier over loopback HTTP only; never touches SQLite or the state machine directly |
| SPIKE probes | API / Backend (spawns a child process) | — | Not part of the daemon's request path; a standalone script/test target that spawns `claude` and inspects stdout/exit code |

## Standard Stack

### Core

| Library | Version (verified 2026-07-22 via `npm view`) | Purpose | Why Standard |
|---------|------|---------|--------------|
| Node.js | 22 LTS — `better-sqlite3` 13.x hard-requires `engines.node >= 22` [VERIFIED: npm registry] | Runtime | `.claude/CLAUDE.md` already pins Node 22 LTS; this is now a **hard** requirement, not a preference — see Environment Availability below |
| TypeScript | 5.x, strict mode | Type safety end to end (QUAL-01) | Project requirement |
| Fastify | 5.10.0 [VERIFIED: npm registry] | HTTP API + hook receiver host (hooks arrive Phase 3) | Schema-validated routes, first-class plugin model; already locked in `.claude/CLAUDE.md` |
| better-sqlite3 | 13.0.1 [VERIFIED: npm registry] — **drift from `.claude/CLAUDE.md`'s "11.x"** | SQLite driver | Synchronous API fits single-writer daemon; ships its own bundled TS types (`@types/better-sqlite3` last published for the 7.x API surface — do not add it as a dependency on top of 13.x, it's redundant/stale) |
| Drizzle ORM | drizzle-orm 0.45.2, drizzle-kit 0.31.10 [VERIFIED: npm registry] | Schema, typed queries, migrations | Thin layer over SQL; `drizzle-kit generate`/`migrate` gives versioned migration files |
| zod | 4.4.3 [VERIFIED: npm registry] | `.fleet.yml` validation, Fastify route schemas | Locked in `.claude/CLAUDE.md`; pairs with `fastify-type-provider-zod` for route typing |

### Supporting

| Library | Version (verified) | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fastify-type-provider-zod` | latest supports Fastify `>=5 <7` [CITED: github.com/turkerdev/fastify-type-provider-zod] | Zod-schema route validation + response serialization with inferred TS types | Every Fastify route this phase adds (`project` CRUD, `daemon` health) — not in `.claude/CLAUDE.md`'s original list but directly needed to make "zod for route bodies" (Section B) concrete |
| `execa` | 10.0.0 [VERIFIED: npm registry] | Not used in Phase 1's daemon (no `claude` spawn yet) — only relevant for the SPIKE probe scripts, which do spawn `claude` | The probe suite (D-09) is the one place in Phase 1 that spawns a real process; `execa` or plain `child_process.spawn` both work — ARCHITECTURE.md §3 recommends plain `spawn` for the *runner* (Phase 2), but the probes are throwaway-adjacent scripts where `execa`'s ergonomics are a reasonable simplification |
| `pino` | 10.3.1 [VERIFIED: npm registry] | Structured daemon logs, distinct from the `events` table | Fastify's default logger |
| Vitest | 4.1.10 [VERIFIED: npm registry] — **major version jump; verify config against the v4 migration guide, not older tutorials** | Unit tests (state machine), integration tests (registry, event store), fake-binary fixture tests | Pool-options config shape changed in v4 (`poolOptions` removed, `maxWorkers` replaces `maxThreads`/`maxForks`) — irrelevant to Phase 1's simple config but worth a version-aware read before writing `vitest.config.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fastify-type-provider-zod` | Fastify's native JSON-Schema validation only | Loses TS type inference from the zod schema; zod is already the project's chosen validator (`.claude/CLAUDE.md` Section B), so the type-provider is the natural pairing, not a new dependency class |
| `execa` for probe scripts | Plain `child_process.spawn` | Both fine; `execa` reduces boilerplate for a throwaway-adjacent script; ARCHITECTURE.md's plain-`spawn` recommendation is specifically for the production Runner (Phase 2), not these probes |
| `drizzle-kit generate`+`migrate` | `drizzle-kit push` (schema-diff apply, no migration files) | `push` is for rapid local prototyping without a versioned history; Fleet's `events`/`tasks` schema is correctness-critical and benefits from an auditable migration file trail — use `generate`+`migrate`, not `push`, even in dev |

**Installation:**
```bash
# Core (daemon)
npm install fastify @fastify/static better-sqlite3 drizzle-orm zod pino fastify-type-provider-zod

# CLI (if a separate package in the monorepo)
npm install commander   # or the planner's chosen arg-parser; not yet locked — see Open Questions

# Dev dependencies
npm install -D typescript drizzle-kit vitest @types/node tsx eslint typescript-eslint prettier
```

Do **not** install `@types/better-sqlite3` — version 13.x ships its own bundled types (`main: lib/index.js` with adjacent `.d.ts`); adding the separate `@types` package risks a stale/conflicting type surface since that package's last publish targets the older API shape. [VERIFIED: npm registry — `better-sqlite3` package metadata]

**Version verification performed this session:**
```
npm view fastify version                → 5.10.0
npm view @fastify/static version        → 10.1.2
npm view better-sqlite3 version         → 13.0.1
npm view better-sqlite3 engines         → { node: '>=22' }
npm view drizzle-orm version            → 0.45.2
npm view drizzle-kit version            → 0.31.10
npm view zod version                    → 4.4.3
npm view vitest version                 → 4.1.10
npm view execa version                  → 10.0.0
npm view pino version                   → 10.3.1
npm view better-sse version             → 0.16.1
npm view tsx version                    → 4.23.1
npm view @types/better-sqlite3 version  → 7.6.13  (stale relative to better-sqlite3 13.x)
```
All commands run against the live npm registry on 2026-07-22 from this working directory.

## Package Legitimacy Audit

Ran `gsd-tools query package-legitimacy check --ecosystem npm` against every package this phase installs.

| Package | Registry | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-------------------|-------------|---------|-------------|
| fastify | npm | 10,036,893 | github.com/fastify/fastify | SUS (`too-new`) | **Approved** — flag is a false positive: the "too-new" signal fires on latest-*version* publish date (2026-07-05), not package age; fastify has 10M+ weekly downloads and a canonical org repo |
| @fastify/static | npm | 4,195,861 | github.com/fastify/fastify-static | SUS (`too-new`) | **Approved** — same false-positive pattern; official Fastify org package |
| better-sqlite3 | npm | 8,488,947 | github.com/WiseLibs/better-sqlite3 | SUS (`too-new`) | **Approved** — same pattern; 8.4M weekly downloads, years-established maintainer |
| drizzle-orm | npm | 15,498,137 | github.com/drizzle-team/drizzle-orm | OK | Approved |
| drizzle-kit | npm | 12,943,221 | github.com/drizzle-team/drizzle-orm | OK | Approved |
| zod | npm | 234,133,326 | github.com/colinhacks/zod | OK | Approved |
| vitest | npm | 79,970,325 | github.com/vitest-dev/vitest | SUS (`too-new`) | **Approved** — same false-positive pattern (v4.1.10 published 2026-07-06) |
| execa | npm | 147,621,721 | github.com/sindresorhus/execa | SUS (`too-new`) | **Approved** — same pattern |
| pino | npm | 40,073,637 | github.com/pinojs/pino | OK | Approved |
| better-sse | npm | 50,968 | github.com/MatthewWid/better-sse | OK | Approved (not used until Phase 4/SSE, listed for completeness — lower download count reflects a narrower niche package, not illegitimacy) |
| tsx | npm | 80,420,150 | github.com/privatenumber/tsx | SUS (`too-new`) | **Approved** — same false-positive pattern |
| typescript-eslint | npm | 80,654,122 | github.com/typescript-eslint/typescript-eslint | SUS (`too-new`) | **Approved** — same pattern |
| fastify-type-provider-zod | npm | 798,247 | github.com/turkerdev/fastify-type-provider-zod | SUS (`too-new`) | **Approved** — same pattern; maintained under the `fastify` GitHub org umbrella per its README, real usage volume |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** all `too-new` flags above are a **verified false-positive pattern** — the legitimacy checker's "too-new" heuristic reads the *latest published version's* timestamp, not the package's first-publish date, and every flagged package here has an established GitHub org repo and download counts in the millions-to-hundreds-of-millions/week range. No `checkpoint:human-verify` is warranted for any of these specifically because the download-count + repo-provenance signals independently confirm legitimacy — but the planner should still note this heuristic limitation if it recurs on a package that does NOT have comparable download/repo evidence.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────┐        HTTP (loopback only)        ┌──────────────────────────────┐
│  fleet CLI   │ ─────────────────────────────────▶ │        Fleet Daemon           │
│ (D-01: pure  │ ◀───────────────────────────────── │  (single Node process)        │
│  HTTP client)│         JSON responses 

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 67612 bytes -->
