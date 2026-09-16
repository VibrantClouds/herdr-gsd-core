---
phase: 02-execution-worktree-runner-billing-safety
plan: 03
subsystem: testing
tags: [vitest, node-child-process, spike, fixture, ndjson, stream-json]

# Dependency graph
requires:
  - phase: 01-foundation-registry-state-machine
    provides: withScratchRepo, spawnClaude/claudeVersion, writeFindings/FindingResult, rate-limit-classifier fixtures
provides:
  - "A fake `claude` executable (src/spikes/fixtures/fake-claude-cli/claude) emitting realistic stream-json NDJSON for seven named scenarios, resolvable purely via a caller-supplied PATH"
  - "FAKE_CLAUDE_BIN_DIR / fixtureEnvFor() / FixtureScenario exported from src/spikes/fixtures/fake-claude-cli/index.ts for other plans' worker-env tests"
  - "A proven-hermetic test (fake-claude-cli.test.ts) demonstrating the fixture never mutates the real process.env.PATH and that a negative-PID SIGTERM reaps the hang scenario's real grandchild"
  - "SPIKE-06: bare model alias acceptance — sonnet and haiku both confirmed accepted by --model against claude 2.1.218, resolving to claude-sonnet-5 and claude-haiku-4-5-20251001"
affects: [02-04, 02-06, 02-08, 02-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Native-node-loadable TS fixture pattern: a plain-JavaScript .mjs re-export shim + hand-written .d.mts declaration lets a TS source file be imported both under a transform (vitest/tsc, .js specifier) and via node's native, transform-free type-stripping (explicit .ts specifier) without duplicating any data or touching the project-wide tsconfig"
    - "Fixture-directory-on-PATH hermeticity: prepend the fixture bin dir onto a PATH that still contains the real node binary's directory (mirroring buildWorkerEnv's pathOverride semantics), never replace PATH wholesale — the fixture's own #!/usr/bin/env node shebang needs a working PATH lookup for node too"

key-files:
  created:
    - src/spikes/fixtures/fake-claude-cli/claude
    - src/spikes/fixtures/fake-claude-cli/scenarios.ts
    - src/spikes/fixtures/fake-claude-cli/index.ts
    - src/spikes/fixtures/fake-claude-cli.test.ts
    - src/spikes/fixtures/stream-events.native.mjs
    - src/spikes/fixtures/stream-events.native.d.mts
    - src/spikes/model-alias.spike.test.ts
  modified:
    - src/spikes/fixtures/stream-events.ts
    - .planning/phases/01-foundation-registry-state-machine/01-SPIKE-FINDINGS.md

key-decisions:
  - "Node's native TypeScript type-stripping does not remap a .js import specifier to a sibling .ts file the way tsc's NodeNext resolution does (verified empirically this session) — the standalone `claude` executable runs with zero transform, so scenarios.ts's import of stream-events.ts's shapes needed a plain-JS .mjs re-export shim (+ hand-written .d.mts) rather than the project's usual .js-specifier convention, to avoid duplicating shapes while keeping both npm run typecheck and npm run build green"
  - "The hang scenario's grandchild must NOT be spawned with detached: true, or it becomes the leader of its own new process group and a negative-PID SIGTERM sent to the fixture's group never reaches it — found and fixed while writing Task 2's kill-and-reap test"
  - "Did not run `requirements mark-complete` for QUAL-02/SAFE-03 despite them being in this plan's frontmatter: both are also referenced by 02-08-PLAN.md (SAFE-03, full model routing) and 02-10-PLAN.md (QUAL-02, coverage assertion) per this plan's own 'Flagged assumptions' note — this plan builds the harness those plans consume, it does not itself close either requirement"

requirements-completed: []  # Deliberately empty — see key-decisions above; QUAL-02/SAFE-03 close in 02-08/02-10.

coverage:
  - id: D1
    description: "Fake `claude` executable emits realistic NDJSON for seven named scenarios (happy-path, hang, malformed-line, unknown-event, rate-limit, api-key-source-leak, nonzero-exit), resolvable purely via a caller-supplied PATH"
    requirement: "QUAL-02"
    verification:
      - kind: unit
        ref: "src/spikes/fixtures/fake-claude-cli.test.ts#scenario \"%s\" produces at least one parseable NDJSON line (parameterised over all 7 scenario names)"
        status: pass
      - kind: other
        ref: "src/spikes/fixtures/fake-claude-cli/claude — manual acceptance-criteria commands from 02-03-PLAN.md Task 1 (happy-path num_turns=3, nonzero-exit=143, api-key-source-leak apiKeySource, happy-path apiKeySource=none)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The fixture is proven hermetic: spawn('claude', argv, { env }) resolves via a caller-supplied PATH with no mutation of the real process.env.PATH and no vi.stubEnv, and the hang scenario's real grandchild is reaped via a negative-PID SIGTERM within 2 seconds"
    requirement: "QUAL-02"
    verification:
      - kind: unit
        ref: "src/spikes/fixtures/fake-claude-cli.test.ts#never mutates the real process.env.PATH to include FAKE_CLAUDE_BIN_DIR"
        status: pass
      - kind: unit
        ref: "src/spikes/fixtures/fake-claude-cli.test.ts#the hang scenario backgrounds a real grandchild, and a negative-PID SIGTERM reaps both it and the direct child"
        status: pass
    human_judgment: false
  - id: D3
    description: "RESEARCH.md Open Question 2 / Assumption A4 closed: --model accepts the bare aliases sonnet and haiku against the installed CLI, recorded as SPIKE-06"
    requirement: "SAFE-03"
    verification:
      - kind: other
        ref: "npm run spikes -- src/spikes/model-alias.spike.test.ts (real-CLI probe, consumes genuine subscription turns) — recorded in .planning/phases/01-foundation-registry-state-machine/01-SPIKE-FINDINGS.md#SPIKE-06"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-07-24
status: complete
---

# Phase 2 Plan 3: Fake claude fixture harness + bare-alias spike Summary

**Hermetic fake-`claude`-on-PATH fixture with seven NDJSON scenarios plus a confirmed real-CLI probe that bare `sonnet`/`haiku` model aliases resolve correctly against claude 2.1.218**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-24T00:55:04Z
- **Completed:** 2026-07-24T01:14:50Z
- **Tasks:** 3
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments
- Built `src/spikes/fixtures/fake-claude-cli/claude`, an executable (mode 0755) resolvable purely via a caller-supplied `PATH`, emitting realistic stream-json NDJSON for seven named scenarios and reading real shapes from `stream-events.ts` rather than re-declaring them
- Proved the fixture hermetic: a dedicated test asserts the real `process.env.PATH` is never mutated to include the fixture directory, and that the `hang` scenario's real grandchild process is reaped via a negative-PID `SIGTERM` within 2 seconds — found and fixed a real bug in the process along the way (grandchild was spawned `detached: true`, escaping the process group a group-wide signal targets)
- Closed RESEARCH.md's Open Question 2 (Assumption A4): ran a real, opt-in probe against the installed CLI (`npm run spikes`) and confirmed both `--model sonnet` and `--model haiku` are accepted, resolving to `claude-sonnet-5` and `claude-haiku-4-5-20251001` respectively — recorded as SPIKE-06 in the durable findings document
- Solved a real Node-runtime constraint that would otherwise have forced either data duplication or a broken build: node's native TypeScript type-stripping does not remap a `.js` import specifier to a sibling `.ts` file, so the standalone `claude` executable (zero transform) couldn't reuse the project's usual NodeNext `.js`-specifier convention — added a plain-JS `.mjs` re-export shim + hand-written `.d.mts` declaration instead of loosening the project-wide `tsconfig.json` (which would have broken `npm run build`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the fake `claude` fixture binary and its scenario table** - `ad4ba3b` (feat)
2. **Task 2: Prove the fixture is hermetically resolvable via a caller-supplied PATH** - `73d9137` (test)
3. **Task 3: Close RESEARCH Open Question 2 — does `--model` accept the bare alias `sonnet`?** - `2f24c08` (feat)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — see Next Phase Readiness)

## Files Created/Modified
- `src/spikes/fixtures/fake-claude-cli/claude` - Executable fake CLI; reads `FLEET_FIXTURE_SCENARIO`, writes NDJSON, exits with the scenario's code; spawns a real (non-detached) grandchild for the `hang` scenario
- `src/spikes/fixtures/fake-claude-cli/scenarios.ts` - `FIXTURE_SCENARIOS` record, imports real shapes from `stream-events.ts` via the native-mjs shim, exports the exhaustive `FixtureScenario` union type
- `src/spikes/fixtures/fake-claude-cli/index.ts` - Test-facing entry: `FAKE_CLAUDE_BIN_DIR` (resolved from `import.meta.url`), `fixtureEnvFor()`, re-exports `FixtureScenario`
- `src/spikes/fixtures/fake-claude-cli.test.ts` - Hermeticity + parseable-NDJSON + process-group-kill tests (10 tests, `unit` project)
- `src/spikes/fixtures/stream-events.native.mjs` / `.native.d.mts` - Plain-JS re-export shim (+ hand-written type declaration) making `stream-events.ts` importable both natively by node and by vitest/tsc
- `src/spikes/fixtures/stream-events.ts` - Added `apiKeySource: 'none'` to `SYSTEM_INIT_EVENT`; added `SYSTEM_INIT_EVENT_LEAKED_KEY` export
- `src/spikes/model-alias.spike.test.ts` - Opt-in real-CLI probe (SPIKE-06), `spike` project only
- `.planning/phases/01-foundation-registry-state-machine/01-SPIKE-FINDINGS.md` - SPIKE-06 section appended by `writeFindings`

## Decisions Made
- **`.mjs` re-export shim over loosening tsconfig:** `allowImportingTsExtensions` (needed for a literal `.ts`-extension import specifier) requires `noEmit`/`emitDeclarationOnly`, which conflicts with the daemon's `tsc -p tsconfig.json` build. Verified this empirically (both failure and the shim-based fix) before committing to the approach, rather than adding a project-wide compiler flag that would have broken `npm run build`.
- **Grandchild must share the fixture's process group:** removing `detached: true` from the grandchild's own spawn call (inside `claude`) was necessary so `process.kill(-childPid, 'SIGTERM')` reaches both the direct child and the grandchild with one signal — this is exactly the mechanism RUN-04 (future plan) depends on.
- **Deferred requirement completion:** left `requirements-completed: []` for QUAL-02/SAFE-03 even though both appear in this plan's frontmatter, because this plan builds groundwork that 02-08 (model routing) and 02-10 (coverage assertion) actually close out — see coverage/key-decisions above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hang scenario's grandchild unreachable by process-group SIGTERM**
- **Found during:** Task 2 (writing the kill-and-reap test)
- **Issue:** `claude`'s grandchild spawn used `detached: true`, making it the leader of its own new process group; a `process.kill(-childPid, 'SIGTERM')` targeting the fixture's group never reached it, so the grandchild stayed alive after the intended kill
- **Fix:** Removed `detached: true` from the grandchild's `spawn()` call in `src/spikes/fixtures/fake-claude-cli/claude`, keeping it a member of the fixture process's own group
- **Files modified:** `src/spikes/fixtures/fake-claude-cli/claude`
- **Verification:** `fake-claude-cli.test.ts`'s kill-and-reap test passes (both PIDs `ESRCH` within 2s), re-run 3x for flakiness with no failures
- **Committed in:** `73d9137` (Task 2 commit)

**2. [Rule 1 - Bug] Doc comment tripped an unrelated structural-invariant test**
- **Found during:** Task 2 (running `npm test`)
- **Issue:** `index.ts`'s doc comment literally contained the string `process.cwd()` in prose ("never from `process.cwd()`..."), which `src/registry/cwd-boundary.test.ts`'s content-based structural scan flagged as an offending file (the scan matches on file text, not real usage)
- **Fix:** Reworded the comment to describe the same constraint without the literal token
- **Files modified:** `src/spikes/fixtures/fake-claude-cli/index.ts`
- **Verification:** `npm test` (whole `unit` project) passes, 167/167
- **Committed in:** `73d9137` (Task 2 commit)

**3. [Rule 3 - Blocking] Node's native module resolution does not remap `.js` specifiers to `.ts` files**
- **Found during:** Task 1 (designing `scenarios.ts`'s import of `stream-events.ts`)
- **Issue:** The plan instructs `scenarios.ts` to import shapes "from `../stream-events.js`" per the project's usual NodeNext convention. That convention only resolves under a transform (vitest/tsc); the standalone `claude` executable runs `scenarios.ts` with zero transform via node's native type-stripping, which does not remap `.js` specifiers to sibling `.ts` files (verified empirically both directions: fails without a fix, succeeds with the shim). Without a fix, `claude` would either crash at runtime or `scenarios.ts` would have to duplicate the imported shapes, contradicting the plan's explicit "do not invent idealized shapes" instruction.
- **Fix:** Added `stream-events.native.mjs` (plain-JS re-export shim, loadable natively) and a hand-written `stream-events.native.d.mts` (so `tsc --noEmit`/`tsc -p` still see full types); `scenarios.ts` imports the shim instead of `stream-events.ts` directly.
- **Files modified:** `src/spikes/fixtures/stream-events.native.mjs` (new), `src/spikes/fixtures/stream-events.native.d.mts` (new), `src/spikes/fixtures/fake-claude-cli/scenarios.ts`
- **Verification:** `npm run typecheck`, `npm run build`, `npm test`, and the fixture's own manual invocation (via a caller-only `PATH`) all pass; `npm run build`'s emitted JS references the `.mjs` shim unchanged (no rewriting needed, since it was never a `.ts`-extension specifier)
- **Committed in:** `ad4ba3b` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs found via test-writing, 1 blocking runtime-resolution constraint)
**Impact on plan:** All three were necessary for correctness (a silently-broken kill-and-reap guarantee, a false-positive on an unrelated test, and a fixture that would otherwise not run at all outside vitest). No scope creep — no files touched beyond what Task 1/2/3 already specified plus the shim pair that Task 1's own instructions implicitly required.

## Issues Encountered
- The worktree had no `node_modules/` (fresh checkout) — ran `npm ci` before any test/build/lint command could run. Not a plan deviation, just environment setup.
- This machine's zsh has a broken bare `node`/`npm` command handler (unrelated project constraint, documented in the executor's environment note) — all verification commands in this session used the absolute node binary path or PATH-prefixed invocations. This is purely a local shell quirk; the fixture and tests themselves make no assumption about bare `node`/`npm` resolution beyond the ordinary PATH lookup any real caller's environment already provides.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `FAKE_CLAUDE_BIN_DIR`, `fixtureEnvFor()`, and the seven `FixtureScenario` names are ready for plans 02-04, 02-06, and 02-10 to consume as `pathOverride` in their own `buildWorkerEnv()`-based tests (per this plan's `key_links` must-have).
- SPIKE-06 gives plan 02-08 a confirmed, version-stamped fact: bare `--model` aliases work, no alias-to-full-name adapter is needed.
- QUAL-02 and SAFE-03 remain `Pending` in REQUIREMENTS.md by design — 02-08 (model routing) and 02-10 (coverage assertion using this harness) are what actually close them; marking them complete here would have been premature.
- No blockers for the next plans in this phase's wave.

## Self-Check: PASSED

All 10 claimed files verified present via `git ls-files` (10 created/modified files, all tracked). All 4 commit hashes (`ad4ba3b`, `73d9137`, `2f24c08`, `7c80aa3`) verified present in `git log --oneline --all`. No missing items.

---
*Phase: 02-execution-worktree-runner-billing-safety*
*Completed: 2026-07-24*
