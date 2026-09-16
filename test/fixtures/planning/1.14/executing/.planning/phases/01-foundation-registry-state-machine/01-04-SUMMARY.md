---
phase: 01-foundation-registry-state-machine
plan: 04
subsystem: testing
tags: [vitest, claude-cli, stream-json, spike-probes, subscription-billing]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Node 22 toolchain scaffold, Vitest unit/spike named projects, TypeScript strict config"
provides:
  - "src/spikes/rate-limit-classifier.ts: classifyStreamEvent/classifyRun/LimitSignal — hermetic, fixture-driven SPIKE-01 detector covering the full documented system/api_retry error enum and rate_limit_event status values, forward-compatible unknown-type handling"
  - "src/spikes/evidence-trap.ts: captureEvidence — byte-for-byte raw stdout/stderr dump to <FLEET_HOME>/spike-evidence/ on any suspected limit"
  - "src/spikes/spawn-claude.ts: spawnClaude/claudeVersion/CLAUDE_ENV_ALLOWLIST — allowlisted-env real-CLI spawn helper, argv array only, shell:false, never a login shell"
  - "src/spikes/scratch-repo.ts: withScratchRepo — disposable git repo per real-CLI probe, removed in a finally block"
  - "src/spikes/findings-writer.ts: writeFindings/FINDINGS_PATH — merge-by-spike-ID findings generator, regenerates SPIKE-01/SPIKE-05 fresh every call"
  - "Three real-CLI probes behind `npm run spikes`: permission-mode.spike.test.ts (SPIKE-02), worktree-settings.spike.test.ts (SPIKE-03), session-id.spike.test.ts (SPIKE-04)"
  - ".planning/phases/01-foundation-registry-state-machine/01-SPIKE-FINDINGS.md — empirically populated against claude 2.1.218, one section per SPIKE-01 through SPIKE-05"
affects: [02-execution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Allowlisted-env spawn (never denylist) for any code path that spawns the real `claude` CLI — child env built from an explicit whitelist of 9 keys, verified by a unit test that plants ANTHROPIC_API_KEY/ANTHROPIC_BASE_URL in the parent env and asserts neither reaches the constructed child env"
    - "Disposable scratch git repo per real-CLI invocation, never a registered project or the Fleet repo itself"
    - "Hermetic vs opt-in Vitest project split by filename convention: plain `*.test.ts` under src/spikes/ runs in the default `unit` project; `*.spike.test.ts` is excluded from `unit` and only runs under `npm run spikes`"
    - "Merge-by-section generated-document pattern: writeFindings re-renders only the spike IDs it was given plus two always-fresh built-in sections, preserving everything else already on disk — lets three independently-invoked probe files safely contribute to one shared markdown artifact without a shared in-process state"

key-files:
  created:
    - src/spikes/rate-limit-classifier.ts
    - src/spikes/rate-limit-classifier.test.ts
    - src/spikes/fixtures/stream-events.ts
    - src/spikes/evidence-trap.ts
    - src/spikes/spawn-claude.ts
    - src/spikes/spawn-claude.test.ts
    - src/spikes/scratch-repo.ts
    - src/spikes/findings-writer.ts
    - src/spikes/permission-mode.spike.test.ts
    - src/spikes/worktree-settings.spike.test.ts
    - src/spikes/session-id.spike.test.ts
    - .planning/phases/01-foundation-registry-state-machine/01-SPIKE-FINDINGS.md
  modified:
    - vitest.config.ts

key-decisions:
  - "vitest.config.ts's `unit` project exclude glob (from Plan 01) blanket-excluded all of src/spikes/**, which would have silently dropped the hermetic, non-spike rate-limit-classifier.test.ts from `npm test` — narrowed to exclude only `*.spike.test.ts`."
  - "`fileParallelism` is a Vitest 4 ROOT-level UserConfig option, not a per-project one (confirmed against node_modules/vitest's own .d.ts). An initial fix nesting it inside the `spike` project's own test block was silently inert; real execution of the probe suite proved the three real-CLI probes were still running with real parallelism. Moved to `test:` root level, which also serializes the `unit` project (~1-2s total, an acceptable trade for eliminating the write race)."
  - "findings-writer.ts's merge-by-section design initially stored the marker-STRIPPED captured body when preserving an untouched section across a write, instead of re-wrapping it. A section untouched by a given call would render correctly once but silently lose its `<!-- gsd:spike-section:ID -->` comment wrapper, making it unparseable — and therefore silently dropped — on the *next* read-modify-write. Found only by actually running the full real-CLI probe suite twice in a row and diffing which sections survived; fixed by re-wrapping every section extracted from disk before storing it back in the merge map."
  - "SPIKE-03's distinguishing signal is the `system/init` event's `model` field: a git-tracked `.claude/settings.json` sets `model: claude-haiku-4-5` in one worktree only (via a worktree checked out from the commit *before* that file was committed, on its own branch), and the probe compares the observed `system/init.model` across worktree A / worktree B / an inline `--settings` override. This is a genuinely observable, cheap (single `plan`-mode, `--max-turns 1`), non-destructive signal rather than requiring a Bash-tool-executing permission mode."

patterns-established:
  - "Pattern: every code path that spawns the real `claude` CLI goes through `spawnClaude`, which builds the child env from `CLAUDE_ENV_ALLOWLIST` (9 explicit keys) into a fresh object — never `{...process.env}` with keys deleted — and is unit-tested against a deliberately 'dirty' parent env"
  - "Pattern: a generated, version-stamped markdown artifact that multiple independent test files contribute to uses an HTML-comment section-marker format (`<!-- gsd:spike-section:ID -->...<!-- /gsd:spike-section:ID -->`) so each contributor can merge-in its own section via read-modify-write without clobbering siblings — critical detail: any preserved-but-untouched section must be re-wrapped in its markers before being written back, or it silently degrades on the next round-trip"

requirements-completed: [SPIKE-01, SPIKE-02, SPIKE-03, SPIKE-04, SPIKE-05]

coverage:
  - id: D1
    description: "classifyStreamEvent/classifyRun correctly classify every documented rate-limit/billing/overload signal, a rate_limit_event's three status values, and survive an invented/malformed/null input without throwing"
    requirement: "SPIKE-01"
    verification:
      - kind: unit
        ref: "src/spikes/rate-limit-classifier.test.ts (26 tests, incl. boundary and numeric-precision cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "captureEvidence writes the complete, byte-for-byte unmodified stdout/stderr buffers plus version string to <FLEET_HOME>/spike-evidence/ on any suspected limit"
    requirement: "SPIKE-01"
    verification:
      - kind: unit
        ref: "src/spikes/rate-limit-classifier.test.ts#captureEvidence"
        status: pass
    human_judgment: false
  - id: D3
    description: "spawnClaude's constructed child env contains no key outside CLAUDE_ENV_ALLOWLIST even when ANTHROPIC_API_KEY/ANTHROPIC_BASE_URL/AWS/GCP credentials are present in the parent process env (T-1-ENVLEAK)"
    requirement: "SPIKE-02"
    verification:
      - kind: unit
        ref: "src/spikes/spawn-claude.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "SPIKE-02: live claude --help --permission-mode choices list, cross-checked against an invalid-value rejection, matches the known-good 01-RESEARCH.md snapshot exactly (6/6, no drift) against claude 2.1.218"
    requirement: "SPIKE-02"
    verification:
      - kind: e2e
        ref: "src/spikes/permission-mode.spike.test.ts (real claude CLI, run via npm run spikes) -> .planning/phases/01-foundation-registry-state-machine/01-SPIKE-FINDINGS.md#SPIKE-02"
        status: pass
    human_judgment: true
    rationale: "The probe's own pass/fail assertion is automated and passed, but SPIKE-05's own framing (01-RESEARCH.md Assumption A5) is explicit that whether Phase 2's runner design finds this durable write-up sufficient is a human judgement call, not something this executor can assert."
  - id: D5
    description: "SPIKE-03: a git-tracked .claude/settings.json scopes per-worktree by tree content (not main-checkout resolution), and --settings inline JSON overrides it for that invocation — both observed via the system/init.model field across two real worktrees plus one inline-override invocation"
    requirement: "SPIKE-03"
    verification:
      - kind: e2e
        ref: "src/spikes/worktree-settings.spike.test.ts (real claude CLI, run via npm run spikes) -> 01-SPIKE-FINDINGS.md#SPIKE-03"
        status: pass
    human_judgment: true
    rationale: "01-RESEARCH.md flagged SPIKE-03 as the probe most likely to warrant human review of its reasoning, since the distinguishing signal (system/init.model) is not officially documented as guaranteed-stable; the probe's assertions passed and the observation was unambiguous this run, but a human should sanity-check the interpretation before Phase 2's runner design relies on it."
  - id: D6
    description: "SPIKE-04: session_id tabulated per event-type occurrence (never collapsing adjacent same-type events), 'not observed' recorded distinctly from 'absent', stable sort order"
    requirement: "SPIKE-04"
    verification:
      - kind: e2e
        ref: "src/spikes/session-id.spike.test.ts (real claude CLI, run via npm run spikes) -> 01-SPIKE-FINDINGS.md#SPIKE-04"
        status: pass
    human_judgment: false
  - id: D7
    description: "01-SPIKE-FINDINGS.md exists, carries the observed claude --version near the top, has one section per SPIKE-01 through SPIKE-05, marks SPIKE-01 explicitly detected-but-unconfirmed, and ends with the exact re-run command"
    requirement: "SPIKE-05"
    verification:
      - kind: other
        ref: "Manual inspection of .planning/phases/01-foundation-registry-state-machine/01-SPIKE-FINDINGS.md after two consecutive full `npm run spikes` runs"
        status: pass
    human_judgment: false
  - id: D8
    description: "npm test / vitest --project unit remains fast, hermetic, and spawns no claude process after adding src/spikes/**"
    requirement: "SPIKE-01"
    verification:
      - kind: unit
        ref: "vitest run --project unit -- 53/53 tests passing across 6 files"
        status: pass
    human_judgment: false

duration: 50min
completed: 2026-07-23
status: complete
---

# Phase 1 Plan 4: Spike Probe Suite and Findings Document Summary

**A hermetic SPIKE-01 rate-limit detector running inside `npm test`, plus three opt-in real-CLI probes behind `npm run spikes` that closed SPIKE-02/03/04 against a live `claude 2.1.218` subscription session, generating a version-stamped `01-SPIKE-FINDINGS.md` for Phase 2's runner design.**

## Performance

- **Duration:** 50 min
- **Started:** 2026-07-22T23:16:19-04:00
- **Completed:** 2026-07-23T00:06:19-04:00
- **Tasks:** 3
- **Files modified:** 12 created, 1 modified

## Accomplishments
- `classifyStreamEvent`/`classifyRun`/`LimitSignal` (SPIKE-01): a pure, fixture-driven classifier covering every documented `system/api_retry` error and `rate_limit_event` status value, forward-compatible against undocumented `type` values — 26 tests, zero real CLI spawns, runs inside the default `npm test` suite
- `captureEvidence` (SPIKE-01's evidence trap): dumps the complete unredacted stdout/stderr on any suspected limit, so the next genuine rate-limit encounter captures ground truth without a second deliberate run
- `spawnClaude`/`CLAUDE_ENV_ALLOWLIST` (T-1-ENVLEAK): every real-CLI invocation across all three probes goes through one allowlisted-env spawn helper, unit-verified against a deliberately "dirty" parent env carrying `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`/AWS/GCP credentials
- `withScratchRepo` (T-1-SETTINGSINJECT): every real-CLI invocation runs inside a disposable, self-cleaning git repo — verified zero stray `/tmp/fleet-spike-*` directories survived after multiple full suite runs
- Ran the real-CLI probe suite against `claude 2.1.218` (subscription auth confirmed via `claude auth status --json`) per explicit human authorization, and empirically closed SPIKE-02, SPIKE-03, and SPIKE-04 — see `01-SPIKE-FINDINGS.md` for full results
- `writeFindings`/`FINDINGS_PATH`: a merge-by-section generator that lets three independently-invoked test files each contribute a section to one shared, version-stamped markdown document without clobbering each other

## Task Commits

Each task was committed atomically:

1. **Task 1: SPIKE-01's rate-limit detector and evidence trap — hermetic, fixture-driven** - `d87db8c` (feat)
2. **Task 2: The opt-in real-CLI probe suite for SPIKE-02, SPIKE-03 and SPIKE-04, and the findings generator** - `6349eaf` (feat)
3. **Task 3: Run the probe suite against the real CLI and confirm the findings document** - `906f7a6` (feat)

**Plan metadata:** _pending — this commit_

## Files Created/Modified

**Task 1 (SPIKE-01 detector, hermetic):**
- `src/spikes/rate-limit-classifier.ts` - `classifyStreamEvent`/`classifyRun`/`readApiRetryFields`/`LimitSignal`
- `src/spikes/rate-limit-classifier.test.ts` - 26 fixture-driven tests, one per `<behavior>` bullet plus edge cases
- `src/spikes/fixtures/stream-events.ts` - hand-constructed stream-json/rate_limit_event fixtures
- `src/spikes/evidence-trap.ts` - `captureEvidence`, plain-text section-delimited (not JSON-escaped) evidence dump
- `vitest.config.ts` - narrowed the `unit` project's exclude glob to `*.spike.test.ts` only (Rule 1 fix)

**Task 2 (opt-in real-CLI probe infrastructure + probes):**
- `src/spikes/spawn-claude.ts` - `spawnClaude`/`claudeVersion`/`CLAUDE_ENV_ALLOWLIST`/`buildAllowlistedEnv`
- `src/spikes/spawn-claude.test.ts` - unit test asserting the allowlist holds against a dirty parent env (Rule 2 add)
- `src/spikes/scratch-repo.ts` - `withScratchRepo`
- `src/spikes/findings-writer.ts` - `writeFindings`/`FINDINGS_PATH`
- `src/spikes/permission-mode.spike.test.ts` - SPIKE-02 probe
- `src/spikes/worktree-settings.spike.test.ts` - SPIKE-03 probe
- `src/spikes/session-id.spike.test.ts` - SPIKE-04 probe

**Task 3 (real run + findings doc + 2 discovered-and-fixed bugs):**
- `.planning/phases/01-foundation-registry-state-machine/01-SPIKE-FINDINGS.md` - generated, populated against `claude 2.1.218`
- `vitest.config.ts` - moved `fileParallelism: false` from the (inert) `spike` project block to `test:` root level
- `src/spikes/findings-writer.ts` - fixed the marker-stripping round-trip bug in `readExistingSections`

## Decisions Made
- SPIKE-03's distinguishing signal is `system/init.model`, set via a git-tracked `.claude/settings.json` committed only on the main worktree, with a second worktree checked out from the pre-settings commit on its own branch — a cheap, observable, non-destructive way to test git-tracked settings scoping without needing a tool-executing permission mode.
- `fileParallelism` in Vitest 4 is root-only; moved from the `spike` project's nested `test` block (silently inert there) to `test:` root, accepting a small `npm test` slowdown (~1-2s total) in exchange for eliminating a real write race on the shared findings document.
- `findings-writer.ts`'s merge map must always store fully marker-wrapped section strings, never the bare captured body — the original bug degraded silently (the section still *rendered* correctly once) and was only caught by actually running the suite twice and diffing survivors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vitest.config.ts's unit-project exclude glob was too broad**
- **Found during:** Task 1
- **Issue:** Plan 01's `vitest.config.ts` excluded all of `src/spikes/**` from the `unit` project, which would have silently dropped this task's own hermetic, non-spike `rate-limit-classifier.test.ts` from `npm test` — contradicting the plan's explicit statement that this file "runs inside the default hermetic unit project."
- **Fix:** Narrowed the exclude to `src/spikes/**/*.spike.test.ts` only.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run --project unit` picked up and ran the new test file; 26/26 passing.
- **Committed in:** `d87db8c` (Task 1 commit)

**2. [Rule 2 - Missing critical] Added spawn-claude.test.ts**
- **Found during:** Task 2
- **Issue:** Task 2's own acceptance criteria requires "a unit-level test [that] asserts the resulting env object contains no key outside `CLAUDE_ENV_ALLOWLIST`" — a correctness/security test for T-1-ENVLEAK — but this file wasn't in the plan's declared `files_modified` list.
- **Fix:** Added `src/spikes/spawn-claude.test.ts`, a hermetic unit test exercising `buildAllowlistedEnv` directly against a deliberately "dirty" env.
- **Files modified:** `src/spikes/spawn-claude.test.ts`
- **Verification:** 3/3 new tests passing inside `vitest --project unit`.
- **Committed in:** `6349eaf` (Task 2 commit)

**3. [Rule 3 - Blocking, later corrected] Added `fileParallelism: false` to prevent a findings-file write race**
- **Found during:** Task 2 (reasoning ahead of execution)
- **Issue:** Three independently-invoked `.spike.test.ts` files would each read-modify-write the same `01-SPIKE-FINDINGS.md`.
- **Fix:** Added `fileParallelism: false` inside the `spike` project's own `test` block.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx tsc --noEmit` and `vitest --project unit` passed at the time — but this fix was **not actually load-bearing**; see deviation #5 below, discovered when Task 3 ran the real suite.
- **Committed in:** `6349eaf` (Task 2 commit)

**4. [Rule 1 - Bug, found via real execution] `fileParallelism` is a Vitest 4 root-level option, not per-project**
- **Found during:** Task 3, after running `npm run spikes` twice and observing `01-SPIKE-FINDINGS.md` was missing a different spike section each time (SPIKE-03 the first run, SPIKE-04 on a subsequent isolated re-run)
- **Issue:** Confirmed against `node_modules/vitest`'s own `.d.ts`: `fileParallelism` only exists in the root `UserConfig`, not inside a project's nested `test` block. Deviation #3's fix was silently ignored by Vitest — the three real-CLI probes were still running with genuine parallelism, racing on the shared findings file.
- **Fix:** Moved `fileParallelism: false` to `test:` root level.
- **Files modified:** `vitest.config.ts`
- **Verification:** Full-suite run duration went from ~11-12s (parallel) to ~12-27s matching the sum of individual test durations (sequential); `npx vitest run --project unit` still 53/53 passing.
- **Committed in:** `906f7a6` (Task 3 commit)

**5. [Rule 1 - Bug, found via real execution] findings-writer.ts's section-preservation bug**
- **Found during:** Task 3, via a deliberate 3-step isolated reproduction (running each `.spike.test.ts` file as a separate `vitest` invocation and grepping the findings doc after each) after deviation #4's fix did not fully resolve the missing-section symptom
- **Issue:** `readExistingSections()` stored the regex-captured body (markers stripped) directly into the merge map for sections it wasn't asked to rewrite. On the *next* `writeFindings` call, that section rendered its content correctly one more time but was written back **without** its `<!-- gsd:spike-section:ID -->` wrapper — making it unparseable, and therefore silently dropped, on the round-trip after that. This is a genuinely deterministic bug independent of concurrency; it reproduced identically across three separate, fully-sequential `vitest` process invocations.
- **Fix:** `readExistingSections()` now re-wraps every extracted section (`wrapSection(id, body)`) before storing it, so every value in the merge map is always a complete, self-contained section regardless of how many round-trips it survives untouched.
- **Files modified:** `src/spikes/findings-writer.ts`
- **Verification:** Reproduced the exact failing 3-step sequence again after the fix (all 5 sections present, 10 marker lines = 5×2); ran the full suite twice back-to-back from a clean slate (both times: all 5 sections, 10 markers); re-ran one probe a third time on top of an already-complete document (still stable).
- **Committed in:** `906f7a6` (Task 3 commit)

---

**Total deviations:** 5 (2 Rule 1 bug fixes affecting shared config from Plan 01, 1 Rule 2 missing-critical-test add, 1 Rule 3 blocking fix that was later found ineffective and corrected, 1 Rule 1 bug fix in this plan's own new code found only by actually running the real-CLI suite twice).
**Impact on plan:** All fixes necessary for correctness of t

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 23552 bytes -->
