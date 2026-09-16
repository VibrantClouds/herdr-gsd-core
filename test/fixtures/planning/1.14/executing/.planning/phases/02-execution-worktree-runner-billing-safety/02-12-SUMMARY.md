---
phase: 02-execution-worktree-runner-billing-safety
plan: 12
subsystem: runner
tags: [agent-profile, precedence, fleet-yaml, drizzle-migration, fail-loud, vitest]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "src/runner/agent-profile.ts's single agent-profile trust boundary (resolveAgentProfile, AgentProfileError, loadAgentProfileStore) and the CLAUDE_CONFIG_DIR/--mcp-config/--allowedTools composition wired into WorktreeRunner.spawn() by plan 02-11; the resolveModel/resolveCaps precedence shape from plan 02-08; the seven-scenario QUAL-02 e2e suite and production onRateLimit/cancelQueued wiring from plan 02-10"
provides:
  - "resolveAgentProfileName() in src/runner/agent-profile.ts — the third precedence resolver, sharing one it.each test table with resolveModel/resolveCaps so the task > .fleet.yml > Fleet config order cannot silently drift across the three"
  - "tasks.agent_profile — nullable text column shipped via a real drizzle-generated migration (drizzle/0001_agent_profile.sql), null means inherit"
  - ".fleet.yml's agent_profile naming key (D-35) — a repo may only NAME a Fleet-side profile; the schema's allowed_tools key (plan 02-08) is REMOVED (D-36 — subsumed by the profile's extraAllowedTools, one override route instead of two)"
  - "Scheduler.dispatch()'s full task/.fleet.yml/Fleet-config precedence resolution, replacing plan 02-11's default-only tracer wire; an AgentProfileError's code is now prefixed onto the persisted CRASH reason"
  - "Four AGENT-06 fail-loud integration scenarios (profile not found, config dir missing, config dir is a file, unknown MCP server) plus two control scenarios and the D-35 security-boundary regression, in src/runner/agent-capability.integration.test.ts"
  - "CODE_TO_STATUS entries for the four agent-profile error codes; POST /tasks' agentProfile field (identifier-pattern constrained); fleet task create --agent-profile and a taskColumns PROFILE column"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A pure precedence resolver (resolveAgentProfileName) implemented LOCALLY in runner/agent-profile.ts rather than importing tasks/service.ts's resolvePrecedence<T>, specifically to avoid a runner -> tasks -> runner import cycle (tasks/service.ts already imports from runner/). The three resolvers are proven to agree via a SHARED TEST TABLE, not a shared implementation function."
    - "A row-read assertion (task status + events payload, read back from SQLite) as the sole proof of a fail-loud path, never a caught-value assertion — a break between the runner's throw and the event store's record is exactly the seam only a persisted-state read catches."
    - "An argv-readback file's continued ABSENCE, not a mock-not-called assertion, as proof that a child process was never created — unambiguous because the file is only ever written by the fixture process itself."

key-files:
  created:
    - drizzle/0001_agent_profile.sql
  modified:
    - src/registry/fleet-yaml.ts
    - src/registry/fleet-yaml.test.ts
    - src/db/schema.ts
    - drizzle/meta/_journal.json
    - drizzle/meta/0001_snapshot.json
    - src/db/migrate.test.ts
    - src/runner/agent-profile.ts
    - src/tasks/service.ts
    - src/tasks/service.test.ts
    - src/api/http/routes/tasks.ts
    - src/api/http/errors.ts
    - src/cli/index.ts
    - src/scheduler/queue.ts
    - src/runner/agent-capability.integration.test.ts
    - .planning/phases/02-execution-worktree-runner-billing-safety/02-VALIDATION.md

key-decisions:
  - "resolveAgentProfileName() is implemented as its own small local function in agent-profile.ts (task/fleetYml/config, treating null and undefined identically as absent) rather than importing tasks/service.ts's generic resolvePrecedence<T> — tasks/service.ts already imports from runner/worktree-runner.ts, so the reverse import would create a runner -> tasks -> runner cycle. The three resolvers' agreement is proven by a SHARED it.each TEST TABLE in service.test.ts instead, exactly as the plan's own must-have describes (\"the same precedence table ... asserted against\"), not by one shared implementation underneath."
  - "Plan 02-08 HAD added fleetYmlSchema's allowed_tools key (confirmed by reading the file before editing) — removed per D-36, along with its sole consumer, tasks/service.ts's resolveAllowedTools() function and its test block, and the now-dead allowedTools field on FleetConfigDefaults/readFleetConfigDefaults. disallowed_tools and resolveDisallowedTools are untouched, per the plan's own instruction that a deny-only list carries no capability-granting surface."
  - "Scheduler.dispatch()'s catch block now formats a persisted CRASH reason as \"${err.code}: ${message}\" when the thrown error is an AgentProfileError, and leaves every other error's reason unchanged (bare message) — this is what makes the AGENT-06 must-have (\"the profile error's code ... preserved in the event payload\") true; without it, only the prose message reached the payload, which does not reliably contain the code string."
  - "The CLI's taskColumns PROFILE column renders a null task-level value as the literal string \"(inherit)\", never a bare \"-\" — per the plan's own instruction that conflating \"inherited, resolved later\" with \"no profile at all\" would hide the exact thing AGENT-05 is about. The task row only ever carries the TASK-level override; the resolved value (after .fleet.yml/config precedence) is never persisted, so \"(inherit)\" is the honest label for a null column, not a claim about what will actually run."
  - "AGENT-05's the-taREDACTED_SECRET decision was verified against the ACTUAL installed drizzle-kit rather than hand-written: the migration was generated via `npm run db:generate -- --name agent_profile`, confirmed to be a single ALTER TABLE ADD COLUMN statement (not a table rebuild), and confirmed present in drizzle/meta/_journal.json's two-entry trail before any test ran against it."
  - "REQUIREMENTS.md's AGENT-01 through AGENT-06 checkboxes are DELIBERATELY left unchanged by this plan, even though AGENT-03/05/06's own coding work is fully done and tested here. Plan 02-11's own SUMMARY left AGENT-01/02/03/04 pending specifically because AGENT-01's \"actually invocable\" clause is unresolved until this plan's Task 3 gate runs — marking any subset of the six AGENT requirements complete before that gate is approved would produce an inconsistent, premature signal. All six should be marked together once Task 3 resolves (approved or narrowed per D-37)."

requirements-completed: []
# AGENT-03, AGENT-05, AGENT-06's CODE is fully implemented and tested by Tasks 1-2
# below, but this plan's Task 3 (the blocking human-verify gate) has NOT yet run —
# see "Task 3 — NOT YET RUN" below. requirements-completed is left empty
# deliberately (see key-decisions) rather than partially checking off a group of
# six requirements that were intentionally left pending together by plan 02-11.

coverage:
  - id: D1
    description: "Agent profile resolution order is task, then .fleet.yml, then Fleet config default — the first non-null wins, absence of all three yields no profile (never an error); asserted against the SAME precedence table resolveModel/resolveCaps are asserted against"
    requirement: "AGENT-05"
    verification:
      - kind: unit
        ref: "src/tasks/service.test.ts#resolveAgentProfileName shares its precedence order with resolveModel/resolveCaps (AGENT-05, D-11, D-12) — 4 cases + null-vs-undefined equivalence test"
        status: pass
    human_judgment: false
  - id: D2
    description: "A task row's agent_profile column is nullable and null means inherit, shipped via a real drizzle-generated migration, matching how max_turns/wall_clock_cap_ms already express the same idea"
    requirement: "AGENT-05"
    verification:
      - kind: unit
        ref: "src/db/migrate.test.ts#the tasks table gains a nullable agent_profile column (AGENT-05, plan 02-12)"
        status: pass
    human_judgment: false
  - id: D3
    description: ".fleet.yml gains exactly one new key (agent_profile, optional string) and loses allowed_tools (D-36); an object-valued agent_profile is rejected by the strict schema, and readFleetYml surfaces it as a null config plus a warning rather than silently accepting it"
    requirement: "AGENT-03"
    verification:
      - kind: unit
        ref: "src/registry/fleet-yaml.test.ts#the zod schema accepts agent_profile.../REJECTS an object-valued agent_profile.../the schema key set is EXACTLY the expected set"
        status: pass
    human_judgment: false
  - id: D4
    description: "No field of a resolved profile can originate in a repository: a .fleet.yml naming an object-valued agent_profile (an attempted MCP server definition) is rejected, dispatch falls through to the Fleet-config default, and no string from that file reaches the recorded argv"
    requirement: "AGENT-03"
    verification:
      - kind: integration
        ref: "src/runner/agent-capability.integration.test.ts#a .fleet.yml whose agent_profile value is an object ... is rejected by the strict schema, and dispatch falls through to the Fleet-config default with no string from that file reaching the recorded argv (D-35 security boundary)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A repository naming a profile that does not exist in Fleet's config fails the spawn before any child process is created, with the requested name in the error, and the task lands in failed with the code preserved in the event payload"
    requirement: "AGENT-06"
    verification:
      - kind: integration
        ref: "src/runner/agent-capability.integration.test.ts#a task naming a profile absent from the store lands in failed with agent_profile_not_found in the event payload, and the fixture never ran"
        status: pass
    human_judgment: false
  - id: D6
    description: "A profile whose declared config directory does not exist, or exists but is a file rather than a directory, fails the spawn before any child process is created"
    requirement: "AGENT-06"
    verification:
      - kind: integration
        ref: "src/runner/agent-capability.integration.test.ts#a task naming a profile whose config directory does not exist.../config directory path exists but is a regular file... both lands in failed with agent_profile_config_dir_missing"
        status: pass
    human_judgment: false
  - id: D7
    description: "A profile whose extra allowed tools name an MCP server the profile does not declare fails at resolution, before any child process is created"
    requirement: "AGENT-06"
    verification:
      - kind: integration
        ref: "src/runner/agent-capability.integration.test.ts#a task naming a profile whose extra allowed tools name an undeclared MCP server lands in failed with agent_profile_unknown_mcp_server"
        status: pass
    human_judgment: false
  - id: D8
    description: "A task naming a valid profile and a task naming none both succeed (reach the same terminal status the happy path does, with the fixture actually invoked) — the fail-loud path did not make the working cases fragile"
    requirement: "AGENT-06"
    verification:
      - kind: integration
        ref: "src/runner/agent-capability.integration.test.ts#a task naming a VALID profile reaches the same terminal status the happy path does.../a task naming NO profile at all reaches the same terminal status..."
        status: pass
    human_judgment: false
  - id: D9
    description: "Task 3 — the blocking human-verify capability gate proving a real session's skills/MCP tools are actually invocable, and that apiKeySource is still 'none' under a profiled real spawn"
    verification: []
    human_judgment: true
    rationale: "Requires a real, authenticated claude CLI invocation against a genuine Claude subscription (npm run spikes, a running daemon, a registered real project, and one real task consuming subscription turns), plus the plan's own user_setup steps (a real skill directory and a trusted MCP server declared in the operator's actual <FLEET_HOME>/config.json) that this worktree-isolated agent cannot perform or verify. NOT run in this execution — see '## Task 3 — NOT YET RUN' below."

duration: ~35min
completed: 2026-07-26
status: complete
---

# Phase 02 Plan 12: Agent Profile Precedence, Repo-Names-Only Boundary, Fail-Loud Paths Summary

**Task/`.fleet.yml`/Fleet-config precedence for agent profiles sharing one test table with `resolveModel`/`resolveCaps`; `.fleet.yml`'s `allowed_tools` override removed in favor of the profile (D-36); a real drizzle migration for `tasks.agent_profile`; and four fail-loud integration scenarios proving a bad profile never reaches a spawn — Task 3's real-CLI capability gate is the one item left for a human to run.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-26 (continuation of wave 6, base commit `3d66482`)
- **Completed:** 2026-07-26
- **Tasks:** 2 of 3 (Task 1 and Task 2 complete and committed; Task 3 is a blocking human-verify gate, NOT run by this agent — see below)
- **Files modified:** 17 (1 created, 16 modified across both task commits)

## Accomplishments

- `resolveAgentProfileName()` in `src/runner/agent-profile.ts`: a PURE precedence resolver (task, then `.fleet.yml`, then Fleet config default, first non-null wins, `null` when all absent) sharing one `it.each` test table in `service.test.ts` with `resolveModel`/`resolveCaps`, so the three cannot silently drift apart.
- `tasks.agent_profile`: a nullable text column shipped via a REAL `drizzle-kit generate` migration (`drizzle/0001_agent_profile.sql` — a single `ALTER TABLE ADD COLUMN`, confirmed in the journal trail, confirmed by a `PRAGMA table_info` test), not hand-written SQL.
- `.fleet.yml` gains exactly one new key, `agent_profile` (optional string, NAME only, mirroring `env_profile`); an object-valued `agent_profile` is rejected by the `.strict()` schema, and an exhaustive key-set test now pins the schema's entire accepted surface.
- `.fleet.yml`'s `allowed_tools` key (added by plan 02-08) is REMOVED, along with its sole consumer `resolveAllowedTools()` — D-36 subsumes the per-project tool-list override into the agent profile's `extraAllowedTools`, so there is exactly one route to widen a tool list. `disallowed_tools` (deny-only, no capability-granting surface) is untouched.
- `Scheduler.dispatch()` now resolves the FULL task/`.fleet.yml`/Fleet-config precedence order (replacing plan 02-11's default-only tracer wire), and an `AgentProfileError`'s `code` is now prefixed onto the persisted `CRASH` reason so the fail-loud requirement ("the profile error's code and message preserved in the event payload") is actually true, not merely the prose message.
- Four AGENT-06 fail-loud integration scenarios (`agent_profile_not_found`, `agent_profile_config_dir_missing` x2 causes, `agent_profile_unknown_mcp_server`) plus two control scenarios (valid profile, no profile) and the D-35 security-boundary regression (an object-valued `.fleet.yml` `agent_profile` never leaks a command string into a real dispatch's recorded argv) — every assertion reads the task row and its `events` rows back from SQLite, never a caught value, and proves "no spawn happened" via the fixture's argv-readback file staying absent.
- `CODE_TO_STATUS` gained the four agent-profile error codes; `POST /tasks` accepts an identifier-pattern-constrained `agentProfile` field; `fleet task create --agent-profile <name>` and a `taskColumns` `PROFILE` column (rendering `null` as `(inherit)`, never a bare `-`, per the plan's own distinguishability requirement) round out the CLI/HTTP surface.
- `02-VALIDATION.md` extended with six new Per-Task Verification Map rows (AGENT-01 through AGENT-06), one Manual-Only Verifications row (the Task 3 gate), and one Open Items entry (D-37's skill-discoverability contingency) — every pre-existing row preserved verbatim.

## Task Commits

Each completed task was committed atomically:

1. **Task 1: Three-level resolution — task, repository, Fleet config — sharing one precedence table** - `8a2993d` (feat)
2. **Task 2: Fail loud — four ways a profile can be wrong, none of which runs degraded** - `29bfd65` (test)
3. **Task 3: Capability gate — prove the profile's skills and MCP tools are actually invocable** - NOT run; see "Task 3 — NOT YET RUN" below. No commit — this task requires real human/billing action this worktree-isolated agent cannot perform.

**Plan metadata:** committed alongside this SUMMARY (worktree mode — STATE.md/ROADMAP.md excluded; orchestrator updates centrally). REQUIREMENTS.md deliberately NOT updated by this plan — see key-decisions.

## Files Created/Modified

- `drizzle/0001_agent_profile.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0001_snapshot.json` - the generated migration trail for `tasks.agent_profile`
- `src/db/schema.ts` - `agentProfile` nullable text column, placed immediately after `model`
- `src/db/migrate.test.ts` - `PRAGMA table_info(tasks)` assertion for the new column
- `src/registry/fleet-yaml.ts` - `agent_profile` key added, `allowed_tools` key removed, header comment extended
- `src/registry/fleet-yaml.test.ts` - agent_profile acceptance/readback/rejection tests, the exhaustive key-set assertion, updated the 02-08-override-keys test to drop `allowed_tools`
- `src/runner/agent-profile.ts` - `resolveAgentProfileName()` and its `AgentProfileNameInput` type
- `src/tasks/service.ts` - `CreateTaskInput.agentProfile`, wired into `createTask()`'s INSERT; `resolveAllowedTools()` and the dead `allowedTools` config-default field removed
- `src/tasks/service.test.ts` - the shared `resolveAgentProfileName`/`resolveModel`/`resolveCaps` precedence table; removed the `resolveAllowedTools` describe block
- `src/api/http/routes/tasks.ts` - `agentProfile` field on `createTaskBody`, identifier-pattern constrained
- `src/api/http/errors.ts` - four agent-profile `CODE_TO_STATUS` entries
- `src/cli/index.ts` - `--agent-profile` option on `task create`, `PROFILE` column on `taskColumns`
- `src/scheduler/queue.ts` - `dispatch()`'s full precedence resolution via `readFleetYml`/`resolveAgentProfileName`; the `AgentProfileError`-code-prefixed CRASH reason
- `src/runner/agent-capability.integration.test.ts` - the four fail-loud scenarios, two control scenarios, and the D-35 security-boundary regression
- `.planning/phases/02-execution-worktree-runner-billing-safety/02-VALIDATION.md` - six AGENT rows, one Manual-Only row, one Open Items entry

## Decisions Made

See `key-decisions` in frontmatter. Summary:

- `resolveAgentProfileName()` is implemented independently rather than importing `tasks/service.ts`'s `resolvePrecedence<T>`, to avoid a `runner -> tasks -> runner` import cycle; the three resolvers' agreement is proven by a shared TEST table instead of shared implementation code.
- Plan 02-08 HAD added `allowed_tools` (confirmed before editing) — removed per D-36, along with its sole consumer.
- The CRASH reason now carries an `AgentProfileError`'s code as a prefix, not just its prose message — required for the AGENT-06 "code ... preserved in the event payload" must-have to actually hold.
- The CLI's new `PROFILE` column renders `null` as `(inherit)`, distinguishing "will resolve later" from a bare no-value glyph.
- REQUIREMENTS.md's six AGENT checkboxes are left untouched — consistent with plan 02-11's own choice to leave them pending as a group until Task 3's gate is resolved.

## Deviations from Plan

### Auto-fixed Issues

None beyond the plan's own explicitly-scoped work. Two notes, not deviations:

1. **Test files not listed in Task 1/2's own `<files>` tags were modified anyway, because the tasks' own `<acceptance_criteria>` require it.** `src/tasks/service.test.ts` (the shared precedence table) and the exhaustive key-set test in `src/registry/fleet-yaml.test.ts` are not named in Task 1/2's `<files>` elements, but both are directly required by those tasks' own stated acceptance criteria ("A shared it.each precedence table drives resolveAgentProfileName, resolveModel, and resolveCaps...", "A test compares new Set(Object.keys(fleetYmlSchema.shape))..."). The plan's top-level `files_modified` frontmatter list already covers `fleet-yaml.test.ts`; `service.test.ts` was the one omission, added because the acceptance criteria leave no oth

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 26911 bytes -->
