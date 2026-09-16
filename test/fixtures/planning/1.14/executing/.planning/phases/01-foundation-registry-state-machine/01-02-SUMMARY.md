---
phase: 01-foundation-registry-state-machine
plan: 02
subsystem: api
tags: [fastify, drizzle-orm, better-sqlite3, zod, yaml, vitest, commander]

# Dependency graph
requires:
  - phase: 01-foundation-registry-state-machine (Plan 01)
    provides: "Fastify daemon, Drizzle schema/migration, registry createProject/listProjects, pure-HTTP CLI with add/list, D-19 error shape"
provides:
  - "src/registry/fleet-yaml.ts: readFleetYml() — live, total, never-throws .fleet.yml read + strict zod validation (D-17, PROJ-05)"
  - "src/registry/projects.ts: getProject/updateProject/archiveProject/purgeProject added alongside create/list (PROJ-03, PROJ-04)"
  - "src/api/http/routes/projects.ts: GET/PATCH/DELETE /projects/:idOrSlug (PROJ-06)"
  - "src/cli/index.ts: fleet project show|update|remove, plus PROJECT_ROUTE_MAP (5-entry table-driven CLI/HTTP parity) and an exported, in-process-testable main(args) dispatch function"
  - "src/cli/parity.test.ts: structural CLI/HTTP parity + D-19 exit-code taxonomy + D-01 no-db-import assertions"
affects: [02-execution, 03-status]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "readFleetYml() is total (never throws) and holds no module-level cache — re-reads from disk on every call (D-17)"
    - "Registry lifecycle functions (archiveProject/purgeProject) never touch repo_path or the filesystem — proven by a read-only-directory test, not just by inspection"
    - "CLI subcommand-to-HTTP-route mapping is a single exported table (PROJECT_ROUTE_MAP) that every commander action reads from, rather than literal strings scattered per callback"
    - "CLI dispatch (main()) returns the D-19 exit code as a plain value; only the real entrypoint (guarded by an isMainModule check) mutates process.exitCode, so tests can call it in-process repeatedly without leaking exit codes into the test runner"

key-files:
  created:
    - src/registry/fleet-yaml.ts
    - src/registry/fleet-yaml.test.ts
    - src/registry/registry.test.ts
    - src/cli/parity.test.ts
  modified:
    - src/registry/projects.ts
    - src/api/http/routes/projects.ts
    - src/api/http/errors.ts
    - src/cli/index.ts
    - src/cli/render.ts

key-decisions:
  - "purgeProject cascades delete of a project's task and event rows inside the same transaction before deleting the project row, deviating from the plan's literal 'deletes the project row' — without this, purging a project with terminal (done/failed/rejected) task history would trip the tasks.project_id/events.task_id foreign-key constraints (foreign_keys=ON per STATE-01), silently defeating the whole point of allowing purge once tasks reach a terminal state."
  - "cli/index.ts declares a local, structurally-identical FleetYmlConfig interface instead of importing the type from src/registry/fleet-yaml.js, so Task 3's grep-based 'no src/cli/ file imports from src/registry/' assertion holds even for a type-only import."
  - "registry.test.ts's live-daemon CLI-spawn tests use async execFile (not execFileSync): a synchronous spawn from within the same process running the Fastify server via app.listen() would block that process's event loop while waiting for the child to exit, deadlocking against the child's own HTTP request to that same blocked server."

requirements-completed: [PROJ-02, PROJ-03, PROJ-04, PROJ-05, PROJ-06]

coverage:
  - id: D1
    description: "readFleetYml() reads .fleet.yml live (no caching), validates against a strict 4-field zod schema, and never throws across missing/malformed/empty/BOM/alias-tag inputs"
    requirement: "PROJ-05"
    verification:
      - kind: unit
        ref: "src/registry/fleet-yaml.test.ts (15 tests, one per <behavior> bullet)"
        status: pass
    human_judgment: false
  - id: D2
    description: "fleet project show resolves by id or slug, returns live .fleet.yml config/warnings, and 404s on an unknown identifier"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "src/registry/registry.test.ts > registry: show / update / remove lifecycle over HTTP (Task 2)"
        status: pass
      - kind: manual_procedural
        ref: "real daemon + fleet project show + editing .fleet.yml between two calls — verified live re-read"
        status: pass
    human_judgment: false
  - id: D3
    description: "fleet project update changes exactly name/env_profile/notes/tags; PATCH rejects slug/repo_path/remote_url/default_branch with 400 validation_failed; idempotent"
    requirement: "PROJ-03"
    verification:
      - kind: integration
        ref: "src/registry/registry.test.ts (PATCH behavior + idempotency tests)"
        status: pass
      - kind: manual_procedural
        ref: "real daemon + fleet project update --notes --tags --json"
        status: pass
    human_judgment: false
  - id: D4
    description: "fleet project remove soft-archives by default (idempotent archived_at, tasks/events survive); --purge hard-deletes only with zero non-terminal tasks, refused 409 purge_refused otherwise; neither path touches repo_path"
    requirement: "PROJ-04"
    verification:
      - kind: integration
        ref: "src/registry/registry.test.ts (archive/purge behavior, non-terminal-status matrix, repo_path snapshot, read-only-dir fs-untouched proof)"
        status: pass
      - kind: manual_procedural
        ref: "real daemon: fleet project remove --purge with a running task exits 1, project still listed under --all; plain remove leaves repo dir's file listing/mtimes unchanged"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every fleet project subcommand maps 1:1 onto exactly one HTTP route via PROJECT_ROUTE_MAP, machine-checked against both the live Fastify route table and the registered commander subcommand set"
    requirement: "PROJ-06"
    verification:
      - kind: unit
        ref: "src/cli/parity.test.ts > PROJECT_ROUTE_MAP (4 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "CLI exit codes are individually asserted: 3 daemon-unreachable, 2 unknown-subcommand, 1 API-rejected, 0 success; --json emits parseable JSON, table mode does not"
    requirement: "PROJ-06"
    verification:
      - kind: unit
        ref: "src/cli/parity.test.ts > CLI exit-code taxonomy (D-19) and --json contract (D-18) (5 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "No source file under src/cli/ imports from src/db/, src/registry/, or drizzle-orm (D-01 structural isolation)"
    requirement: "PROJ-06"
    verification:
      - kind: unit
        ref: "src/cli/parity.test.ts > CLI isolation (D-01)"
        status: pass
    human_judgment: false

duration: 27min
completed: 2026-07-22
status: complete
---

# Phase 1 Plan 2: Project Lifecycle — Show, Update, Remove Summary

**Full project lifecycle (`show`/`update`/`remove`) across registry, HTTP, and CLI, with live `.fleet.yml` reads and a machine-checked CLI/HTTP parity table replacing hand-maintained route strings.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-07-22T23:14:00-04:00 (approx.)
- **Completed:** 2026-07-22T23:41:00-04:00
- **Tasks:** 3
- **Files modified:** 4 created, 5 modified

## Accomplishments
- `readFleetYml()`: a total (never-throws), live-re-read (no caching) `.fleet.yml` reader validated against a strict 4-field zod schema — every failure mode (missing file, unparseable YAML, schema mismatch, unrecognized key, empty/comments-only/null document, BOM, YAML alias/custom tag) resolves to `{ present, config, warnings }` instead of throwing or executing anything
- Registry lifecycle: `getProject` (id-or-slug resolution with typed `not_found`), `updateProject` (exactly 4 mutable fields, key-presence-driven), `archiveProject` (idempotent soft-archive), `purgeProject` (refuses on any non-terminal task, cascades task/event deletion on success to avoid tripping foreign-key constraints)
- HTTP: `GET/PATCH/DELETE /projects/:idOrSlug` — GET re-reads `.fleet.yml` live on every request; PATCH's strict zod body schema rejects `slug`/`repo_path`/`remote_url`/`default_branch` before reaching the registry; DELETE dispatches to archive or purge on a `?purge=true` querystring flag
- CLI: `fleet project show|update|remove`, each a single `apiRequest` call reading its route from a new exported `PROJECT_ROUTE_MAP` (5 entries) instead of a literal string per command
- `src/cli/parity.test.ts`: structurally proves CLI/HTTP parity (`app.hasRoute` against every map entry, exact bidirectional match of registered `fleet project` subcommands vs. map commands), the D-01 "CLI never imports the db/registry layers" invariant, and the full D-19 exit-code taxonomy (3/2/1/0) plus D-18's `--json`-vs-table stdout contract — all asserted in-process via a refactored, exported `main(args)` dispatch function
- 61 → 71 passing unit tests (10 new in `parity.test.ts`, 15 new in `fleet-yaml.test.ts`, 22 new in `registry.test.ts`), fully hermetic; manually verified end-to-end against a real bound daemon with `curl` and the CLI

## Task Commits

Each task was committed atomically (Task 1 and Task 2 are `tdd="true"`, so each has a separate RED/GREEN pair):

1. **Task 1: Live `.fleet.yml` read with safe parsing and warn-not-block validation**
   - `f5b41b4` (test, RED) — failing tests, one per `<behavior>` bullet
   - `f5e24f3` (feat, GREEN) — `readFleetYml`/`fleetYmlSchema`/`FLEET_YML_FILENAME`
2. **Task 2: show / update / remove — the full project lifecycle across registry, HTTP and CLI**
   - `de98719` (test, RED) — failing integration tests, one per `<behavior>` bullet
   - `302bd95` (feat, GREEN) — registry/HTTP/CLI implementation
3. **Task 3: Machine-checked CLI/HTTP parity and the exit-code taxonomy** - `edc4b62` (feat)

**Plan metadata:** _pending — this commit_

## Files Created/Modified

**Task 1 (live `.fleet.yml` read):**
- `src/registry/fleet-yaml.ts` - `readFleetYml`/`fleetYmlSchema`/`FLEET_YML_FILENAME`, total function, no cache
- `src/registry/fleet-yaml.test.ts` - 15 tests, one per `<behavior>` bullet

**Task 2 (project lifecycle):**
- `src/registry/projects.ts` - `getProject`/`updateProject`/`archiveProject`/`purgeProject` added; `RegistryError` gained `details` and two new codes (`not_found`, `purge_refused`)
- `src/api/http/routes/projects.ts` - `GET/PATCH/DELETE /projects/:idOrSlug`
- `src/api/http/errors.ts` - `purge_refused` → 409; `RegistryError.details` now flows into the D-19 error body
- `src/cli/index.ts` - `fleet project show|update|remove` commands added
- `src/cli/render.ts` - `renderKeyValue`/`emitDetail` for the `show` detail view
- `src/registry/registry.test.ts` - 22 tests: HTTP lifecycle behavior + a live-daemon CLI-spawn describe block

**Task 3 (CLI/HTTP parity):**
- `src/cli/index.ts` - refactored to export `PROJECT_ROUTE_MAP` (5 entries) and a testable `main(args)` dispatch function returning the D-19 exit code as a value
- `src/cli/parity.test.ts` - 10 tests: route-map↔Fastify-route parity, subcommand↔map-command parity, D-01 no-db-import check, D-19 exit codes, D-18 `--json` contract

## Decisions Made
- Cascaded task/event deletion into `purgeProject`'s transaction (see Deviations below) — a correctness fix, not scope creep.
- Kept `cli/index.ts`'s `FleetYmlConfig` as a locally-declared, wire-shape-identical interface rather than importing the type from `src/registry/fleet-yaml.ts`, preserving D-01's "CLI imports nothing from `src/registry/`" invariant even for type-only imports.
- Refactored `main()` to return the exit code as a value instead of only mutating `process.exitCode`, with the real-process side effect moved to an `isMainModule`-guarded entrypoint block — this was necessary to satisfy Task 3's "invoke the CLI's top-level dispatch function in-process" requirement without polluting the test runner's own exit code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `purgeProject` cascades task/event deletion instead of only deleting the project row**
- **Found during:** Task 2 (implementing `purgeProject`)
- **Issue:** The plan's action text says purge "deletes the project row" (singular) after confirming no non-terminal tasks exist. Taken literally, this would leave any *terminal* (`done`/`failed`/`rejected`) task rows still referencing the deleted project via `tasks.project_id`'s foreign key (`foreign_keys=ON`, STATE-01) — the delete would throw `SQLITE_CONSTRAINT_FOREIGNKEY` for any project that had ever run a task to completion, defeating the entire purpose of "purge once tasks are terminal."
- **Fix:** `purgeProject` now deletes a project's `events` rows (via each task id), then its `tasks` rows, then the `projects` row — all inside the same `db.transaction()` as the non-terminal-task check, so the operation remains atomic and the refusal path is unaffected.
- **Files modified:** `src/registry/projects.ts`
- **Verification:** `registry.test.ts`'s purge-success test (zero tasks) and purge-refusal matrix (5 non-terminal statuses) both pass; manually verified via a real daemon that purge is refused while a task is `running` and the project remains listed under `--all`.
- **Committed in:** `302bd95` (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed a same-process deadlock between the test-owned Fastify server and a synchronously-spawned CLI subprocess**
- **Found during:** Task 2 (first run of `registry.test.ts`'s live-daemon CLI-spawn tests)
- **Issue:** The initial test helper used `execFileSync` (following the existing `tracer.e2e.test.ts` pattern) to spawn `fleet project show` as a child process while the *same test process* also ran the Fastify server via `app.listen()`. `execFileSync` blocks the caller's event loop until the child exits — but the child's HTTP request could never be serviced by a server whose event loop was blocked waiting on it, producing a hang (confirmed via `ps aux` showing both processes alive but idle).
- **Fix:** Switched the live-daemon test helper to `execFile` (via `node:util`'s `promisify`), which does not block the event loop, letting the Fastify server continue servicing requests while the test awaits the child process.
- **Files modified:** `src/registry/registry.test.ts`
- **Verification:** All 4 live-daemon CLI-spawn tests pass; full unit suite green (71/71) with no hangs across repeated runs.
- **Committed in:** `de98719`/`302bd95` (Task 2 test file was iterated before the final RED commit; the fix is reflected in the committed test file)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 correctness fix, 1 Rule 3 blocking fix). No architectural changes, no scope creep.

## Issues Encountered
- None beyond the two deviations above, both resolved during Task 2.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The full project lifecycle (register → list → show → update → remove/purge) is now complete over both CLI and HTTP, satisfying Phase 1 success criterion 1 in full.
- `.fleet.yml` reading is live, validated, and warn-not-block — ready for Phase 2's `WT-05` (acting on `setup`) and Phase 4's `SAFE-09` (re-verifying `protected_paths`) to build on without re-deriving the read path.
- CLI/HTTP parity is now structural (`PROJECT_ROUTE_MAP` + `parity.test.ts`), so Phase 2's `fleet task …` surface can follow the same table-driven pattern from the start rather than retrofitting it.
- No blockers for Plan 03 (state machine) or Plan 04 of this phase, which build on Plan 01's schema/toolchain independently of this plan's registry-surface work.

## Self-Check: PASSED

- FOUND: src/registry/fleet-yaml.ts
- FOUND: src/registry/fleet-yaml.test.ts
- FOUND: src/registry/registry.test.ts
- FOUND: src/cli/parity.test.ts
- FOUND commit: f5b41b4 (Task 1, RED)
- FOUND commit: f5e24f3 (Task 1, GREEN)
- FOUND commit: de98719 (Task 2, RED)
- FOUND commit: 302bd95 (Task 2, GREEN)
- FOUND commit: edc4b62 (Task 3)

---
*Phase: 01-foundation-registry-state-machine*
*Completed: 2026-07-22*
