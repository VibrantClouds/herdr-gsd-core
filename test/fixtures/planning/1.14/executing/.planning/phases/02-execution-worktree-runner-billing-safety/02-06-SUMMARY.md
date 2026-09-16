---
phase: 02-execution-worktree-runner-billing-safety
plan: 06
subsystem: runner
tags: [child-process, process-group, wall-clock-timeout, sigterm-sigkill, stdout-parsing, rate-limit, billing-safety, drizzle]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "WorktreeRunner's minimal tracer supervision from plan 02-04 (buildSpawnArgv, killTree's original shape, the Runner interface); the fake-claude-cli fixture and its seven scenarios from plan 02-03; the RATE_LIMITED transition edge on running->failed from plan 02-01; the SPIKE-01 classifier/evidence-trap Phase 1 spike code"
provides:
  - "WorktreeRunner hardened to the full RUN-03...RUN-06 contract: a wall-clock cap with no orphaned process group, defensive per-line stdout parsing that can never crash the daemon or drive a second state-transition source, the apiKeySource runtime kill assertion, and RUN-06's --resume/--fork-session argv support"
  - "resolveCaps()/CapsSource/ResolvedCaps/CapsError — D-11's task > .fleet.yml > Fleet config > built-in-default cap resolution as a pure, throwing-on-invalid-value function"
  - "src/runner/rate-limit.ts and src/runner/evidence-trap.ts — SPIKE-01's classifier and evidence trap promoted out of src/spikes/ into production, run in the default npm test project, wired into WorktreeRunner's exit path"
  - "parseLine() exported from rate-limit.ts as the phase's one canonical never-throw stdout-line parser"
affects: [02-09, 02-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "terminatedByRunner flag: once this runner itself decides a run is over (wall-clock timeout or the apiKeySource violation), every subsequent stdout line is dropped unread and the exit-path's rate-limit classification is skipped — prevents a run we killed from also falsely re-triggering suspicion or double-processing observability data"
    - "recordIfDbPresent(): WorktreeRunnerOptions.db is optional so app.ts's existing default construction keeps compiling; the runner-decided events (TIMEOUT/apiKeySource CRASH/RATE_LIMITED) are recorded immediately when db is present and silently skipped (kill still happens) when it is not — documented as a Known Gap needing app.ts wiring"
    - "test-local ad-hoc 'claude' fixture executables (chmod 0755 scripts written to a temp bin dir, PATH-overridden) for adversarial shapes the shared fake-claude-cli fixture cannot produce without editing files outside this plan's scope: a genuinely-persistent hang, an apiKeySource-absent system/init line, and a leaked HOOK_STOP-shaped line"

key-files:
  created: []
  modified:
    - src/runner/worktree-runner.ts
    - src/runner/worktree-runner.test.ts
    - src/spikes/findings-writer.ts
  renamed:
    - src/spikes/rate-limit-classifier.ts -> src/runner/rate-limit.ts
    - src/spikes/rate-limit-classifier.test.ts -> src/runner/rate-limit.test.ts
    - src/spikes/evidence-trap.ts -> src/runner/evidence-trap.ts

key-decisions:
  - "Reordered Task 3's file relocation ahead of Task 2 in actual execution (though committed under Task 2's commit): Task 2's own action text imports parseLine from the post-relocation path src/runner/rate-limit.ts, so the move had to land before that import could compile. Committed as part of the Task 2 commit with the reorder documented as a Rule 3 (blocking dependency) auto-fix."
  - "wallClockCapMs is threaded into spawn() via a new WorktreeRunnerOptions.caps field (fed into resolveCaps() as the 'task' layer), not via RunnerTask itself — RunnerTask and Scheduler are both outside this plan's files_modified, so there is no way to carry a per-task wall-clock override through the real dispatch path yet. Documented as a Known Gap."
  - "db is an optional WorktreeRunnerOptions field, not a required constructor argument — app.ts's existing `new WorktreeRunner()` default construction (also outside files_modified) would fail to compile against a required db parameter. When db is absent, the kill still happens unconditionally (the actual billing/DoS-safety mechanism); only the immediate typed-event recording is degraded to the Scheduler's existing generic post-spawn CRASH recording."
  - "The shared fake-claude-cli 'hang' scenario's direct child process was discovered, while writing this plan's tests, to exit naturally within ~50ms on its own (only its un-detached grandchild persists, via its own setInterval) — the scenario's own top-level script has no further pending work once it finishes printing synchronously. This is sufficient for the fixture's own pre-existing hermeticity test (which never asserts the direct child was still alive before sending its SIGTERM) but insufficient to exercise a wall-clock cap meant to catch a session that is genuinely still running. Since src/spikes/fixtures/fake-claude-cli/ is outside this plan's files_modified, tests needing a truly persistent process use a small test-local fixture instead, written directly in worktree-runner.test.ts."
  - "resolveCaps()'s .fleet.yml/Fleet-config layers are accepted as plain input values (ResolveCapsInput.fleetYml/.config) but are not wired to any real data source — fleetYmlSchema has no caps field yet and no 'Fleet config' reader for one exists anywhere in this codebase. The function's resolution-order contract is fully implemented and unit-tested; only the two upper layers' real data sources remain unwired, matching the precedent 02-04's own partial resolveCaps() in tasks/service.ts already set."

patterns-established:
  - "Doc comments and prose that discuss a literal flag/path string a plan's own acceptance-criteria grep checks for must avoid reproducing that exact substring (discovered twice this plan: findings-writer.ts's 'src/spikes/rate-limit-classifier.ts' mention, and a buildSpawnArgv doc comment naming '--include-hook-events') — reword around the literal token rather than quoting it verbatim, matching the precedent plans 02-03/02-04 already set for db.update(tasks)/process.cwd()."

requirements-completed: [RUN-03, RUN-04, RUN-05, RUN-06, BILL-07, SAFE-05]

coverage:
  - id: D1
    description: "A hung session is killed at its wall-clock cap (task > .fleet.yml > Fleet config > 1_800_000 default resolution via resolveCaps()), its whole process group (including a real grandchild) is reaped via killTree()'s SIGTERM-then-SIGKILL escalation, a TIMEOUT event is recorded with accepted:1, and the task lands in failed; a completed run never records a spurious TIMEOUT"
    requirement: "RUN-03, RUN-04"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#WorktreeRunner wall-clock cap and teardown (RUN-03, RUN-04) > a hung session is killed at its 500ms wall-clock cap, its grandchild is reaped too, a TIMEOUT event is recorded, and the task lands in failed"
        status: pass
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#WorktreeRunner wall-clock cap and teardown (RUN-03, RUN-04) > the happy-path fixture with a 30-second cap records zero TIMEOUT events"
        status: pass
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#killTree (RUN-04) — both cases (already-exited pid, SIGTERM-ignoring child dies after grace)"
        status: pass
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#resolveCaps (RUN-03 precision, D-11) — all 5 cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "No stdout line can crash the daemon (malformed JSON, a bare string, or an undocumented event type are all skipped via the shared parseLine() parser) or drive a second state-transition source (a HOOK_STOP-shaped line never reaches recordEvent, verified against an adversarial local fixture)"
    requirement: "RUN-05"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#WorktreeRunner stdout discipline > the malformed-line scenario reaches a terminal result without failing on account of the bad lines"
        status: pass
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#WorktreeRunner stdout discipline > the unknown-event scenario produces zero events rows for either undocumented type"
        status: pass
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#WorktreeRunner stdout discipline > feeds a HOOK_STOP-shaped stdout line and asserts no HOOK_STOP row appears in events"
        status: pass
    human_judgment: false
  - id: D3
    description: "A session whose apiKeySource is anything other than 'none' — including entirely absent — is killed on the first system/init line, before a single subsequent line is processed, with a CRASH event naming the observed value and the task landing in failed"
    requirement: "BILL-07"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#WorktreeRunner stdout discipline > the api-key-source-leak scenario is killed on the system/init line: a CRASH event names the observed value, the task lands in failed, and no assistant-derived observation is recorded"
        status: pass
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#WorktreeRunner stdout discipline > a system/init line with apiKeySource entirely absent also triggers the kill-and-CRASH path"
        status: pass
    human_judgment: false
  - id: D4
    description: "buildSpawnArgv() appends --resume <id> --fork-session when a stored session id is supplied and omits both otherwise (RUN-06); rate-limit classification and the evidence trap are promoted to src/runner/, run in the default npm test project, and wired into WorktreeRunner's exit path so a suspected run captures unredacted evidence and records a RATE_LIMITED event"
    requirement: "RUN-06, SAFE-05"
    verification:
      - kind: unit
        ref: "src/runner/worktree-runner.test.ts#resume argv (RUN-06) — both cases"
        status: pass
      - kind: unit
        ref: "src/runner/rate-limit.test.ts#classifyRun on the real rate-limit fixture scenario (SAFE-05, Task 3 wiring) > reports suspected: true with at least two fired signals"
        status: pass
      - kind: unit
        ref: "src/runner/rate-limit.test.ts#WorktreeRunner wires classifyRun/captureEvidence into its exit path (SAFE-05) > a suspected run writes an evidence file ... and records a RATE_LIMITED event with the task landing in failed"
        status: pass
    human_judgment: false
  - id: D5
    description: "The relocation is a pure move: every export preserved, no file left behind under src/spikes/ named rate-limit-classifier*/evidence-trap*, vitest.config.ts unchanged, the whole npm test/typecheck/lint suite green"
    requirement: "(structural — plan's own <verification> block)"
    verification:
      - kind: other
        ref: "test ! -e src/spikes/rate-limit-classifier.ts && test ! -e src/spikes/rate-limit-classifier.test.ts && test ! -e src/spikes/evidence-trap.ts; grep -rn spikes/rate-limit-classifier|spikes/evidence-trap src/ (no matches); git diff vitest.config.ts (no changes)"
        status: pass
      - kind: unit
        ref: "npm test (unit project, 231/231 passing); npm run typecheck; npm run lint"
        status: pass
    human_judgment: false

duration: ~150min
completed: 2026-07-26
status: complete
---

# Phase 02 Plan 06: Wall-Clock Cap, Process Teardown, Stdout Discipline, and Rate-Limit Promotion Summary

**`WorktreeRunner` hardened from the tracer's minimal supervision to the full RUN-03…RUN-06 contract — a resolveCaps()-driven wall-clock cap with SIGTERM→SIGKILL process-group teardown, a defensive per-line stdout parser that can never crash the daemon or open a second state-transition path, an immediate kill-before-billing assertion on a leaked apiKeySource, RUN-06's `--resume`/`--fork-session` argv support, and SPIKE-01's rate-limit classifier plus its evidence trap promoted out of `src/spikes/` into `src/runner/` and wired into the exit path.**

## Performance

- **Duration:** ~150 min
- **Tasks:** 3 (wall-clock cap/teardown; stdout discipline + apiKeySource + resume argv; rate-limit promotion + exit-path wiring)
- **Files modified:** 6 (3 modified, 3 renamed with modifications)

## Accomplishments

- `killTree(pid, graceMs)` hardened to RESEARCH.md's verified shape (SIGTERM to the process group wrapped in try/catch, SIGKILL escalation after an unref'd grace timer) and a new `resolveCaps()` implements D-11's task > `.fleet.yml` > Fleet config > built-in-default resolution order for `maxTurns`/`wallClockCapMs`/`setupTimeoutMs`, rejecting an explicit `0` rather than treating it as "inherit."
- A wall-clock timer wired into `spawn()` kills a still-running session and records a `TIMEOUT` event (when `db` is wired in), cleared on the child's own exit so a completed session never records a late timeout — proven against a real, genuinely-persistent local test fixture (not the shared `fake-claude-cli` fixture, whose `hang` scenario's direct child was discovered to exit naturally within ~50ms on its own).
- `applyLine()` now delegates to `parseLine()` (relocated from the Phase 1 spike code, exported as the phase's one canonical never-throw defensive parser) instead of a second hand-rolled `JSON.parse`/try-catch; a `terminatedByRunner` flag stops all further stdout processing the instant this runner itself ends a run.
- The `apiKeySource` runtime assertion (D-02/BILL-07/T-2-01): on the first `system/init` line, an `apiKeySource` value other than `'none'` — including entirely absent — kills the session and records a `CRASH` event naming the observed value, before any subsequent line is processed.
- `buildSpawnArgv()` gained `resumeSessionId` (RUN-06): appends `--resume <id> --fork-session` when supplied, reusing the existing worktree `cwd`.
- `src/spikes/rate-limit-classifier.ts`/`.test.ts` and `src/spikes/evidence-trap.ts` relocated verbatim to `src/runner/rate-limit.ts`/`.test.ts` and `src/runner/evidence-trap.ts`, with `parseLine` newly exported and a header doc comment recording SPIKE-01 as detected-but-unconfirmed. `WorktreeRunner`'s exit path now calls `classifyRun()` over the accumulated stdout/stderr/exit code, captures unredacted evidence via `captureEvidence()`, and records a `RATE_LIMITED` event on suspicion — skipped entirely for a run this runner already killed itself.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wall-clock cap and process-group teardown with SIGTERM→SIGKILL escalation** - `5c33264` (feat)
2. **Task 2: stdout discipline, the apiKeySource assertion, and session resume** (includes Task 3's file relocation, pulled forward as a Rule 3 blocking-dependency fix) - `fbf0292` (feat)
3. **Task 3: Promote rate-limit classification and the evidence trap into production modules** - `bdcda00` (feat)
4. **Fix: reword a doc comment tripping Task 2's own `--include-hook-events` grep gate** - `08a0c0c` (fix)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — STATE.md/ROADMAP.md excluded; orchestrator updates centrally)

## Files Created/Modified

- `src/runner/worktree-runner.ts` - `killTree()` hardened; `resolveCaps()`/`CapsSource`/`ResolvedCaps`/`CapsError`/`DEFAULT_WALL_CLOCK_CAP_MS`/`DEFAULT_SETUP_TIMEOUT_MS` added; wall-clock timer, `apiKeySource` assertion, stdout/stderr buffering, `terminatedByRunner` gating, and the `classifyRun`/`captureEvidence`/`RATE_LIMITED` exit-path wiring added to `spawn()`; `buildSpawnArgv()` gained `resumeSessionId`; `WorktreeRunnerOptions` gained optional `db`/`caps` fields
- `src/runner/worktree-runner.test.ts` - new `describe` blocks: `killTree (RUN-04)`, `resolveCaps (RUN-03 precision, D-11)`, `WorktreeRunner wall-clock cap and teardown (RUN-03, RUN-04)`, `resume argv (RUN-06)`, `WorktreeRunner stdout discipline (...)`
- `src/runner/rate-limit.ts` (renamed from `src/spikes/rate-limit-classifier.ts`) - `parseLine` newly exported; header doc comment recording SPIKE-01's unconfirmed status
- `src/runner/rate-limit.test.ts` (renamed from `src/spikes/rate-limit-classifier.test.ts`) - imports repointed at `./rate-limit.js`/`./evidence-trap.js`/`../spikes/fixtures/stream-events.js`; new `parseLine` tests and new TaREDACTED_SECRET `describe` blocks
- `src/runner/evidence-trap.ts` (renamed from `src/spikes/evidence-trap.ts`) - unchanged content, relative `../config.js` import stays valid one level under `src/`
- `src/spikes/findings-writer.ts` - two prose strings updated to name the promoted module locations, reworded to avoid the literal old-path substrings this plan's own acceptance criteria grep for

## Decisions Made

See `key-decisions` in frontmatter. Summary:
- File relocation (originally Task 3's action) was executed before Task 2's logic because Task 2's own action text imports `parseLine` from the post-relocation path — committed together with Task 2's other changes, documented as a Rule 3 (blocking dependency) fix rather than a silent reorder.
- `WorktreeRunnerOptions` gained `db`/`caps` as optional fields rather than widening `RunnerTask`/`Scheduler` (both outside this plan's `files_modified`) — the wall-clock cap and the three runner-decided events are fully functional when a caller wires `db` in (as this plan's own tests do), but `app.ts`'s existing default `new WorktreeRunner()` construction (unchanged, since `app.ts` is out of scope) does not pass one yet. See Known Gaps.
- Discovered the shared `fake-claude-cli` `hang` scenario's direct child process exits naturally within ~50ms (only its grandchild persists) — used small test-local fixture scripts instead of extending the shared fixture (out of scope) for every test needing a genuinely-persistent process.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 3's file relocation had to happen before Task 2's logic, not after**
- **Found during:** Beginning Task 2's implementation
- **Issue:** Task 2's action text instructs importing `parseLine` "from `src/runner/rate-limit.ts` (relocated in Task 3)" — but the plan's own task ordering lists Task 2 before Task 3, so as literally sequenced the import target would not exist yet.
- **Fix:** Performed Task 3's `git mv` relocation (plus exporting `parseLine` and the SPIKE-01 header doc comment) as a prerequisite step folded into the Task 2 commit, rather than deferring it to a Task 3 commit that would come after code already depending on it.
- **Files modified:** `src/spikes/rate-limit-classifier.ts` -> `src/runner/rate-limit.ts`, `src/spikes/rate-limit-classifier.test.ts` -> `src/runner/rate-limit.test.ts`, `src/spikes/evidence-trap.ts` -> `src/runner/evidence-trap.ts`, `src/runner/worktree-runner.ts`
- **Verification:** `npm test -- src/runner/rate-limit.test.ts` (26 passing) confirmed the relocation alone before adding Task 2's logic on top; full suite green after.
- **Committed in:** `fbf0292` (Task 2 commit)

**2. [Rule 1 - Bug] The shared fake-claude-cli `hang` scenario's direct child process does not actually hang**
- **Found during:** Task 1, writing the 500ms-wall-clock-cap test against the shared `hang` fixture scenario
- **Issue:** The fixture's `hang` scenario prints its lines, backgrounds an un-detached grandchild, and returns — with no further pending work in its own event loop, the direct child process exits naturally (code 0) within ~50ms, well before any wall-clock cap in the range this plan needed to test would fire. Only the grandchild (which runs its own `setInterval`) actually persists. `src/spikes/fixtures/fake-claude-cli/claude`/`scenarios.ts` are outside this plan's `files_modified`, so the shared fixture itself could not be fixed.
- **Fix:** Wrote a small, test-local `claude` executable (a temp-dir script, chmod 0755, PATH-overridden) that keeps both itself and its grandchild alive via `setInterval` until externally killed, used only in `worktree-runner.test.ts`'s wall-clock-cap tests. The shared fixture's `hang` scenario is unaffected and still passes its own pre-existing hermeticity test.
- **Files modified:** `src/runner/worktree-runner.test.ts` (test-local fixture only; no shared fixture files touched)
- **Verification:** The rewritten test asserts the wall-clock cap fires within 2 seconds, both the direct child and its grandchild pid probe `ESRCH`, a `TIMEOUT` event is recorded with `accepted: 1`, and the task lands in `failed`.
- **Committed in:** `5c33264` (Task 1 commit)

**3. [Rule 1 - Bug] A doc comment tripped this plan's own acceptance-criteria grep gates*

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 26804 bytes -->
