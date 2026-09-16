---
phase: 02-execution-worktree-runner-billing-safety
plan: 11
subsystem: runner
tags: [billing-safety, mcp, skills, agent-profile, env-allowlist, argv-composition, vitest]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "src/runner/env.ts (buildWorkerEnv, CLAUDE_ENV_ALLOWLIST, FORCED_GIT_ENV) from 02-01; buildSpawnArgv/WorktreeRunner from 02-04/02-06; resolveModel/resolveCaps precedence shape from 02-08; the seven-scenario QUAL-02 e2e suite and onRateLimit wiring from 02-10"
provides:
  - "src/runner/agent-profile.ts — the single source of agent-profile truth: zod schemas, ResolvedAgentProfile, AgentProfileError, mcpToolGlobFor(), loadAgentProfileStore(), readAgentProfileStore(), readDefaultAgentProfileName(), resolveAgentProfile(), resolveDefaultAgentProfile()"
  - "FLEET_AUTHORED_ENV_KEYS on env.ts (D-33) and WorkerEnvInput.claudeConfigDir — CLAUDE_CONFIG_DIR set only from resolved-profile input, never from process.env, never added to CLAUDE_ENV_ALLOWLIST"
  - "composeAllowedTools() and the structural --mcp-config/--strict-mcp-config pairing on buildSpawnArgv (D-34, D-36)"
  - "RunnerTask.agentProfileName wired through Scheduler.dispatch() from Fleet's configured default (tracer wire only — full task/repo/config precedence is plan 02-12)"
affects: [02-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shape-discriminated zod union (two .strict() object schemas with genuinely different required fields) used in place of z.discriminatedUnion when no natural shared literal key exists across transports"
    - "Membership-by-construction (build the exact declared prefix string, then startsWith) instead of regex-extraction, so a server name containing an underscore stays unambiguous"
    - "A single spread expression `...(condition ? [flagA, value, flagB] : [])` inside an argv array literal, making a two-flag pairing structural rather than enforced by convention"
    - "Runner-level defaultAgentProfileName option alongside an injectable profile store, so a test can exercise full profile resolution without writing a real Fleet config.json"

key-files:
  created:
    - src/runner/agent-profile.ts
    - src/runner/agent-profile.test.ts
    - src/runner/agent-capability.integration.test.ts
    - src/spikes/agent-capability.spike.test.ts
  modified:
    - src/config.ts
    - src/runner/env.ts
    - src/runner/env.test.ts
    - src/runner/runner.interface.ts
    - src/runner/worktree-runner.ts
    - src/runner/worktree-runner.test.ts
    - src/scheduler/queue.ts
    - src/tasks/service.ts
    - src/runner/rate-limit.test.ts

key-decisions:
  - "Task 1's one-way boundary decision was RESOLVED BEFORE this execution began (checkpoint resolution supplied by the orchestrator, per D-35 as written): a repository's .fleet.yml may only ever NAME a Fleet-side agent profile, never define one. No code in this plan reads a profile field from a repository; that boundary is enforced entirely by 02-12's .fleet.yml schema (not this plan's file scope)."
  - "RunnerTask.agentProfileName was made a REQUIRED field (string | null), matching the plan's literal wording, rather than optional. This forced three mechanical fixes to RunnerTask literal-construction call sites outside this plan's own file scope (src/tasks/service.ts's cancelTask(), and two makeRunnerTask() test helpers in src/runner/worktree-runner.test.ts plus one in src/runner/rate-limit.test.ts) — documented as Rule 3 auto-fixes below, since the type change would otherwise break the whole unit project's compile."
  - "WorktreeRunner.spawn() resolves task.agentProfileName ?? options.defaultAgentProfileName as the effective profile name, not task.agentProfileName alone — the plan's action text only specified behavior for task.agentProfileName being non-null; adding the options-level fallback lets a test (or a future caller) exercise profile resolution without threading a name through Scheduler/a real task row, and does not change behavior for the documented case."
  - "Scheduler.dispatch() reads readDefaultAgentProfileName() INSIDE the try block (after runnerTask.agentProfileName is provisionally set to null at construction), not at RunnerTask construction time — a malformed Fleet config.json now surfaces through the existing CRASH catch handler instead of becoming an unhandled rejection inside enqueue()'s own .catch."
  - "The agent-capability.integration.test.ts happy-path scenario writes a REAL <FLEET_HOME>/config.json (not an injected WorktreeRunnerOptions.agentProfiles store), specifically so the full config.json -> loadAgentProfileStore() -> readAgentProfileStore() chain is exercised end to end, per the plan's own key_links requirement that every link be proven."
  - "The D-34 'no Fleet-authored config file in the worktree' assertion is checked WHILE the task is genuinely still running, using a local (non-shared-fixture) hang script that also implements the shared fixture's FLEET_FIXTURE_ARGV_OUT/FLEET_FIXTURE_ENV_OUT readback contract — the fast-exiting happy-path fixture's worktree is already archived (and therefore removed from disk) by the time a test could inspect it, which would make the assertion trivially true rather than meaningful."

requirements-completed: [AGENT-01, AGENT-02, AGENT-03, AGENT-04]

coverage:
  - id: D1
    description: "A spawn under a resolved agent profile receives CLAUDE_CONFIG_DIR equal to that profile's declared directory; a spawn with no resolved profile receives no CLAUDE_CONFIG_DIR key at all, even when the daemon's own process.env sets one"
    requirement: "AGENT-01"
    verification:
      - kind: unit
        ref: "src/runner/env.test.ts#'CLAUDE_CONFIG_DIR' in buildWorkerEnv(...) is false when no config directory is supplied, and true with the supplied value when one is"
        status: pass
      - kind: integration
        ref: "src/runner/agent-capability.integration.test.ts#a task dispatched under Fleet's configured default agent profile spawns with the config dir forced onto the environment... / a task dispatched with no configured default agent profile spawns with no CLAUDE_CONFIG_DIR key at all"
        status: pass
    human_judgment: false
  - id: D2
    description: "CLAUDE_CONFIG_DIR is never a member of CLAUDE_ENV_ALLOWLIST, and its value can never be inherited from the daemon's own environment even when a sentinel value is present in the source"
    requirement: "AGENT-01"
    verification:
      - kind: unit
        ref: "src/runner/env.test.ts#CLAUDE_ENV_ALLOWLIST and FLEET_AUTHORED_ENV_KEYS share no member / for every FLEET_AUTHORED_ENV_KEYS member, a sentinel value... is never present / given a source sentinel... AND an explicit Fleet-supplied value, the output carries the Fleet value, never the sentinel"
        status: pass
    human_judgment: false
  - id: D3
    description: "buildWorkerEnv's output key set remains a subset of CLAUDE_ENV_ALLOWLIST union FORCED_GIT_ENV keys union WORKER_ENV_IDENTITY_KEYS union FLEET_AUTHORED_ENV_KEYS — the BILL-06 shape assertion stays a shape assertion, upgraded by union rather than degraded to a forbidden-names list"
    requirement: "AGENT-01"
    verification:
      - kind: unit
        ref: "src/runner/env.test.ts#output key set is a SUBSET of CLAUDE_ENV_ALLOWLIST union FORCED_GIT_ENV keys union identity keys union FLEET_AUTHORED_ENV_KEYS (D-33 extension of D-06)"
        status: pass
    human_judgment: false
  - id: D4
    description: "--mcp-config and --strict-mcp-config are either both present or both absent in every argv buildSpawnArgv can produce, across every input combination including profiled ones; the inline JSON's mcpServers keys equal exactly the resolved profile's declared server names"
    requirement: "AGENT-02"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#--mcp-config presence implies --strict-mcp-config presence, and vice versa ($name) [it.each over 6 combinations, 3 profiled] / --mcp-config's inline JSON mcpServers keys equal exactly the resolved profile's declared server names"
        status: pass
      - kind: integration
        ref: "src/runner/agent-capability.integration.test.ts#...its MCP server inline and strictly scoped..."
        status: pass
    human_judgment: false
  - id: D5
    description: "A profile declaring zero MCP servers produces an argv containing neither MCP flag, while --allowedTools still contains Skill"
    requirement: "AGENT-02"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#a profile with zero MCP servers produces an argv with neither MCP flag, while --allowedTools still contains Skill"
        status: pass
      - kind: unit
        ref: "src/runner/agent-profile.test.ts#a profile declaring zero MCP servers resolves to a null mcpConfig and an empty mcpToolGlobs array"
        status: pass
    human_judgment: false
  - id: D6
    description: "--allowedTools contains Skill in every argv the builder produces, with or without a profile; contains an mcp__<server>__* glob for each declared server and none for an undeclared one; contains no duplicate entry even when a profile's extra tools repeat a default"
    requirement: "AGENT-04"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#the composed allowed-tools value contains Skill ($name) [it.each, 6 combinations] / a two-server profile yields exactly two MCP-prefixed allowed-tools entries, naming no undeclared server / composeAllowedTools deduplicates when a profile's extra allowed tools repeat a base-list entry"
        status: pass
    human_judgment: false
  - id: D7
    description: "--setting-sources is still present exactly once with an empty-string value in every argv the profile path produces, and each of --allowedTools/--mcp-config/--strict-mcp-config appears at most once — capability was added by addition only (D-32 regression guard)"
    requirement: "AGENT-02, AGENT-04"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#the settings-source flag still appears exactly once, immediately followed by a zero-length element ($name) / each of --allowedTools, --mcp-config, --strict-mcp-config appears at most once ($name)"
        status: pass
      - kind: integration
        ref: "src/runner/agent-capability.integration.test.ts#...the settings-source flag untouched..."
        status: pass
    human_judgment: false
  - id: D8
    description: "The profile path writes no file of any kind into the worktree — after a run under a profile declaring MCP servers, the worktree contains no .mcp.json and no .claude/settings.json authored by Fleet"
    requirement: "AGENT-02"
    verification:
      - kind: integration
        ref: "src/runner/agent-capability.integration.test.ts#...checked WHILE the task is genuinely still running (D-34 rejection)"
        status: pass
    human_judgment: false
  - id: D9
    description: "A resolved profile is a Fleet-side object assembled only from Fleet's own <FLEET_HOME>/config.json; resolveAgentProfile fails loudly (named error codes) for an absent name, a missing/non-directory config dir, and an extra allowed tool naming an undeclared MCP server — and does NOT throw when a declared server name itself contains an underscore, proving membership-by-construction"
    requirement: "AGENT-03"
    verification:
      - kind: unit
        ref: "src/runner/agent-profile.test.ts (all describe blocks — one test per AgentProfileErrorCode, plus the underscore-server-name non-throw case)"
        status: pass
    human_judgment: false
  - id: D10
    description: "The one question no hermetic test can answer (whether skill discovery and MCP tool invocation actually work under the pinned --setting-sources value with a Fleet-set CLAUDE_CONFIG_DIR) has a written, opt-in probe that spawns a real CLI, captures system/init's skills/mcp_servers/tools arrays and apiKeySource, and carries a D-37 --plugin-dir fallback arm in the same run"
    verification: []
    human_judgment: true
    rationale: "Requires a real, authenticated claude CLI invocation against a genuine Claude subscription and consumes real subscription turns — explicitly out of scope for this execution per the plan's own instruction ('Do NOT gate this task's automated verify on the probe'). src/spikes/agent-capability.spike.test.ts was written and typechecks; it was NOT run in this execution (no billing-consuming action was taken without explicit authorization). It will be run and its result recorded at plan 02-12's Task 3 blocking human-verify gate."

duration: ~90min
completed: 2026-07-26
status: complete
---

# Phase 02 Plan 11: Agent Capability Configuration — Tracer + Contract Lock Summary

**One Fleet-declared agent profile now reaches a real spawn end to end (`CLAUDE_CONFIG_DIR` forced-constant env injection, `--mcp-config`/`--strict-mcp-config` structurally paired, `Skill` plus MCP tool globs composed into `--allowedTools`), with the BILL-06 shape test upgraded — not weakened — to a four-collection union, and every property proven by a build-failing test.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-07-26 (continuation dispatch — Task 1's checkpoint was pre-resolved by the orchestrator)
- **Completed:** 2026-07-26
- **Tasks:** 3 (Task 1: decision, pre-resolved, no code; Task 2: tracer; Task 3: contract lock)
- **Files modified:** 14 (4 created, 10 modified — 3 of the 10 modifications are mechanical fixes outside this plan's stated file scope, made necessary by a required-field interface change; see Deviations)

## Task 1 — One-Way Boundary Decision

**Resolved before this execution began**, per the orchestrator's `<checkpoint_resolution>`: a repository's `.fleet.yml` may carry only a profile NAME (one optional string, mirroring `env_profile`), never a profile DEFINITION. No code written in this plan reads any agent-profile field from a repository — `resolveAgentProfile`, `loadAgentProfileStore`, and `readAgentProfileStore` all read exclusively from Fleet's own `<FLEET_HOME>/config.json`. Enforcing this boundary on the `.fleet.yml` side (adding the one-key `agent_profile: <name>` schema entry, and the regression test proving an object-valued key is rejected) is plan 02-12's Task 1/2 scope — `src/registry/fleet-yaml.ts` is not in this plan's `files_modified`.

## Accomplishments

- `src/runner/agent-profile.ts`: the single source of agent-profile truth. Zod schemas for MCP server definitions (a shape-discriminated union of a stdio form and a remote form, each `.strict()`), the profile schema, and the store schema. `resolveAgentProfile()` throws one of four named `AgentProfileError` codes and never touches a repository.
- `CLAUDE_CONFIG_DIR` reaches a worker exclusively as a Fleet-authored forced constant (`FLEET_AUTHORED_ENV_KEYS`) — never widened onto `CLAUDE_ENV_ALLOWLIST`, never copied from `process.env`/`input.source`. Absence is distinguishable from an empty string.
- `composeAllowedTools()` — the whole of D-36 — makes a loaded MCP server's tools actually invocable rather than capability that exists and cannot be called, appending `Skill` plus a profile's declared globs and extra tools, deduplicated.
- `--mcp-config`/`--strict-mcp-config` are emitted from a single spread expression in `buildSpawnArgv`, so the pair is structural: the strict flag cannot be dropped by a later edit without deleting `--mcp-config` in the same breath.
- `WorktreeRunner.spawn()` resolves the profile BEFORE building argv or creating the child process, letting `AgentProfileError` propagate to the Scheduler's existing `CRASH`-recording `catch` — no second terminal-state route was added.
- `Scheduler.dispatch()` wires `RunnerTask.agentProfileName` from Fleet's configured default (the tracer's single wire — the full task/repo/config precedence order is plan 02-12's `resolveAgentProfileName`).
- The BILL-06 env-shape test is upgraded from a three-collection union to a four-collection union (adding `FLEET_AUTHORED_ENV_KEYS`), plus two NEW provenance guarantees: allowlist/Fleet-authored-keys disjointness, and a sentinel-value loop proving a Fleet-authored key's value never originates in the source environment.
- `worktree-runner.test.ts`'s `INPUT_COMBINATIONS` now includes three profiled cases built through the real `resolveAgentProfile` resolver, so every pre-existing `it.each` property assertion in that file (including the BILL-03/BILL-04 `--setting-sources`/`--bare` guards) now re-runs against profiled argv for free.
- A written, opt-in real-CLI probe (`src/spikes/agent-capability.spike.test.ts`) answers the one flagged assumption no hermetic test can — whether skill discovery and MCP server invocation actually work under the pinned `--setting-sources` value — carrying a D-37 `--plugin-dir` fallback arm in the same run. Not executed in this session (see below).

## Task Commits

Each task was committed atomically:

1. **Task 1: One-way boundary decision** — pre-resolved by the orchestrator before this execution; no commit (decision-only task, no code).
2. **Task 2: End-to-end tracer** - `8240a34` (feat)
3. **Task 3: Lock the capability contract** - `911ea42` (test)

**Plan metadata:** committed with this SUMMARY (worktree mode — STATE.md/ROADMAP.md excluded; orchestrator updates centrally)

## BILL-06 — What the Shape Test Asserts After This Change

The env-shape test (`src/runner/env.test.ts`) is STILL a subset-of-a-computed-union assertion, never a list of forbidden names. After this plan:

```
ALLOWED_KEYS = CLAUDE_ENV_ALLOWLIST ∪ Object.keys(FORCED_GIT_ENV) ∪ WORKER_ENV_IDENTITY_KEYS ∪ FLEET_AUTHORED_ENV_KEYS
```

`buildWorkerEnv()`'s output key set is asserted to be a subset of `ALLOWED_KEYS`, computed from four exported arrays/objects rather than any literal key name written into the test file, given a source environment polluted with every enumerated credential/routing variable (`ANTHROPIC_API_KEY`, AWS/GCP credentials, etc.). This is a fail-closed assertion: a future, unenumerated key nobody thought to add to any of the four collections would still be caught, because it would not belong to `ALLOWED_KEYS` at all.

Two NEW provenance guarantees, specific to `FLEET_AUTHORED_ENV_KEYS`, close the gap the union alone cannot:
1. **Disjointness:** `CLAUDE_ENV_ALLOWLIST` and `FLEET_AUTHORED_ENV_KEYS` share no member, computed directly from the two exported arrays.
2. **Sentinel provenance:** looping over every member of `FLEET_AUTHORED_ENV_KEYS`, setting that key to an implausible sentinel string in the source environment, and asserting the built output's value is never that sentinel (with no Fleet value supplied) — and, separately, that an explicit Fleet-supplied value wins over a source-side sentinel rather than being overridden by it.

`ANTHROPIC_API_KEY` and every other credential/routing variable enumerated in `PITFALLS.md` remain provably absent from every possible output — unchanged from plan 02-01's original assertion, now re-verified against the widened union.

## `--bare` Prohibition

Unaffected. `PROHIBITED_BARE_FLAG` is still asserted absent from every argv `buildSpawnArgv` can produce, including all three new profiled `INPUT_COMBINATIONS` entries (the existing `it.each` assertion runs over the full, now-six-entry, combination list).

## `--mcp-config` / `--strict-mcp-config` Pairing

Asserted as a bidirectional structural implication (`argv.includes('--mcp-config') === argv.includes('--strict-mcp-config')`), across six input combinations (three unprofiled, three profiled) via `it.each`, plus dedicated tests for the zero-server (neither flag), one-server, and two-server (inline JSON server-name equality) cases. Also proven end to end against a real spawned fixture process in `agent-capability.integration.test.ts`.

## Files Created/Modified

- `src/runner/agent-profile.ts` — new: the single agent-profile trust boundary and resolver.
- `src/runner/agent-profile.test.ts` — new: one test per `AgentProfileErrorCode`, `loadAgentProfileStore` edge cases, success shapes.
- `src/runner/agent-capability.integration.test.ts` — new: the tracer's end-to-end verify against a real `<FLEET_HOME>/config.json` and the fake-claude-cli fixture.
- `src/spikes/agent-capability.spike.test.ts` — new: the opt-in real-CLI probe.
- `src/config.ts` — exports `FleetConfigFile`, `AGENT_PROFILES_CONFIG_KEY

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 27720 bytes -->
