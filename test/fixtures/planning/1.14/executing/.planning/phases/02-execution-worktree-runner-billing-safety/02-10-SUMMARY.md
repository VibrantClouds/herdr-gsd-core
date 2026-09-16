---
phase: 02-execution-worktree-runner-billing-safety
plan: 10
subsystem: testing
tags: [integration-test, vitest, fake-timers, scheduler, worktree-runner, rate-limit, cancellation, qual-02]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "The tracer's happy-path integration harness (plan 02-04); the full worktree lifecycle incl. dirty capture/archival (plan 02-05); the wall-clock cap, process-group teardown, apiKeySource assertion, and rate-limit classification wired into WorktreeRunner's exit path (plan 02-06); the task surface's cancelTask()/queued.CANCEL transition (plan 02-08); the full Scheduler control surface — setConcurrency/killSwitch/pauseForRateLimit/cancelQueued — built and unit-tested but NOT wired into production dispatch (plan 02-09)"
provides:
  - "The seven-scenario QUAL-02 end-to-end integration suite in src/runner/worktree-runner.integration.test.ts, each scenario asserting on persisted database state (tasks row + events rows), hermetic, ~2s for the seven new scenarios and 25s for the whole unit project"
  - "WorktreeRunnerOptions.onRateLimit — a callback seam invoked alongside the existing RATE_LIMITED event recording, letting a Scheduler register itself as a rate-limit pause listener without worktree-runner.ts importing scheduler/queue.ts (avoids a circular dependency)"
  - "app.ts's default Scheduler+WorktreeRunner pair now wires onRateLimit -> Scheduler.pauseForRateLimit() via a boxed reference assigned after both are constructed"
  - "POST /tasks/:id/cancel now calls Scheduler.cancelQueued() before cancelTask(), closing PD-10 (flagged by plan 02-08, mechanically closed but left unwired by plan 02-09) at the production call site — a queued task's cancellation is now a genuine dequeue, empirically proven never to reach provision()/spawn()"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A narrow callback/observer seam (onRateLimit) on WorktreeRunner, registered by the Scheduler that owns it, instead of a direct import — the runner stays decoupled from scheduler/queue.ts, avoiding a circular dependency"
    - "A boxed mutable reference ({ current?: Scheduler }) instead of a self-referential const or a reassigned let, for wiring a callback that must reference an object not yet constructed at closure-creation time (used identically in both app.ts's production wiring and the rate-limit test's own trio construction)"
    - "Vitest fake timers scoped narrowly to toFake: ['setTimeout', 'clearTimeout'] only, layered around a real spawned child process, so a pending backoff timer can be inspected without waiting out the real ~60s delay, while leaving I/O-driven async (readline, better-sqlite3, Fastify) untouched"
    - "A same-test happy-path baseline computed fresh (not hardcoded) for comparing an event-row count against, so a future change to the happy-path fixture's own shape cannot silently invalidate an unrelated scenario's assertion"

key-files:
  created: []
  modified:
    - src/runner/worktree-runner.integration.test.ts
    - src/runner/worktree-runner.ts
    - src/api/http/app.ts
    - src/api/http/routes/tasks.ts
    - src/api/http/routes/tasks.test.ts

key-decisions:
  - "Approved scope expansion (orchestrator-directed, not a plan deviation): the plan as written could only touch worktree-runner.integration.test.ts, but the rate-limit scenario's own must-have (\"the scheduler is paused with exactly one resume timer pending\") cannot pass against production code as merged from plan 02-09 — Scheduler.pauseForRateLimit()/cancelQueued() were fully unit-tested but called from nowhere outside their own test file. Widened files_modified to worktree-runner.ts, app.ts, routes/tasks.ts, and routes/tasks.test.ts per the orchestrator's explicit instruction, committed separately (2fad71a) from the integration scenarios (b91c85a)."
  - "onRateLimit is a callback on WorktreeRunnerOptions, not a direct import of Scheduler into worktree-runner.ts — the design guidance's own constraint (avoid a circular queue.ts -> worktree-runner.ts -> queue.ts dependency). resetsAtUnixSeconds is not extracted from the raw stream-json line and passed through: no shape this module already reads (ClassifyRunResult) carries it (PD-13, plan 02-09's own documented gap), so the callback is invoked with resetsAtUnixSeconds left undefined, and Scheduler.pauseForRateLimit() falls back to its own exponential backoff curve. Extracting resetsAt from the raw rate_limit_event line is unclaimed follow-up work, not required by this plan's must-haves (which only require the pause to fire, not that it prefer resetsAt)."
  - "The wall-clock-timeout and cancel-mid-run scenarios needed to observe the fixture's grandchild pid externally (an HTTP-driven caller never sees WorktreeRunner's internal stdout). The shared fake-claude-cli hang scenario has no mechanism to report that pid to a caller outside its own stdout stream, and extending the shared fixture is out of this plan's approved scope. Reused plan 02-06's own established precedent: a small, test-local hang fixture script (not a modification of the shared fixture) that writes its grandchild's pid to a file when LOCAL_HANG_GRANDCHILD_PID_OUT is set. The cancel-mid-run scenario uses the SHARED hang fixture instead (no pid observability needed there — the assertion is about the dirty-capture commit and the CANCEL event, not process reaping), matching routes/tasks.test.ts's own precedent exactly."
  - "The direct child's pid (needed for the timeout scenario's ESRCH probe) is read via a documented, deliberate escape hatch — a duck-typed read of WorktreeRunner's own private tracked map, exactly matching the precedent routes/tasks.ts's runnerFor() already established for reading a collaborator's private field from outside its own module when the public interface has no accessor for it (PID is deliberately excluded from the Runner interface itself, per ARCHITECTURE.md §7 — this reads the concrete WorktreeRunner class directly, not through that interface)."

requirements-completed: [QUAL-02]

coverage:
  - id: D1
    description: "Happy path: POST /tasks reaches a terminal status, turnsUsed is 3, sessionId is non-empty, the worktree is archived, and the branch survives with the agent's commits — asserted via both the HTTP response and a direct SQLite read of the tasks/events rows"
    requirement: "QUAL-02"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#WorktreeRunner tracer (end-to-end) > provisions a locked worktree, spawns against the fixture, records turnsUsed/duration, and archives while keeping the branch"
        status: pass
    human_judgment: false
  - id: D2
    description: "Wall-clock timeout: a hung session is killed at its 500ms cap, a TIMEOUT event row exists with accepted:1, both the child pid and the fixture-reported grandchild pid are unreachable (ESRCH), and the worktree is archived"
    requirement: "QUAL-02"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#WorktreeRunner tracer (end-to-end) > kills a hung session at its wall-clock cap, records a TIMEOUT event, reaps the child AND its grandchild, and archives the worktree"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cancel mid-run: a running session cancelled via POST /tasks/:id/cancel lands in failed, a CANCEL event row exists with source:'user' and accepted:1, dirty work written into the worktree before cancellation is captured into a commit on the surviving branch, and the worktree is archived through the same terminal path a normal completion uses"
    requirement: "QUAL-02"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#WorktreeRunner tracer (end-to-end) > cancels a running session mid-flight, captures dirty work into a commit on the branch, and archives the worktree through the same terminal path a normal completion uses"
        status: pass
    human_judgment: false
  - id: D4
    description: "Malformed line: the malformed-line fixture completes to the same terminal event count as a same-test happy-path baseline — the unparseable and bare-text lines produce no extra events rows"
    requirement: "QUAL-02"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#WorktreeRunner tracer (end-to-end) > the malformed-line scenario reaches the same terminal event count as the happy path, with the unparseable and bare-text lines producing no events rows"
        status: pass
    human_judgment: false
  - id: D5
    description: "Unknown event: the unknown-event fixture completes to the same terminal event count as a same-test happy-path baseline, with neither undocumented type producing an events row"
    requirement: "QUAL-02"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#WorktreeRunner tracer (end-to-end) > the unknown-event scenario reaches the same terminal event count as the happy path, with neither undocumented type producing an events row"
        status: pass
    human_judgment: false
  - id: D6
    description: "Rate-limit classification: the rate-limit fixture produces a RATE_LIMITED event row with accepted:1, an evidence file exists under the temp FLEET_HOME's spike-evidence/ containing the fixture's raw stdout byte-for-byte, and — via the new onRateLimit wiring — the Scheduler is genuinely paused (isPaused:true, rateLimitAttempt:1) with exactly one pending resume timer (Vitest fake timers scoped to setTimeout/clearTimeout)"
    requirement: "QUAL-02"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#WorktreeRunner tracer (end-to-end) > the rate-limit fixture records a RATE_LIMITED event, captures unredacted evidence, and pauses the scheduler with a pending resume timer"
        status: pass
    human_judgment: false
  - id: D7
    description: "Env shape: a credential-bearing variable (ANTHROPIC_API_KEY) set on the test process never reaches the fixture-observed environment key set (a subset of the allowed set), and the task still completes normally"
    requirement: "QUAL-02"
    verification:
      - kind: integration
        ref: "src/runner/worktree-runner.integration.test.ts#WorktreeRunner tracer (end-to-end) > a credential-bearing variable set on the test process never reaches the fixture-observed environment, and the task still completes normally"
        status: pass
    human_judgment: false
  - id: D8
    description: "Production wiring (approved scope expansion): Scheduler.cancelQueued() is called from POST /tasks/:id/cancel before cancelTask(), and empirically a queued task cancelled this way never transitions past 'idle' even after its concurrency slot frees — provision()/spawn() are never reached (PD-10 closed at the call site, not merely at the mechanical p-queue-AbortSignal level plan 02-09 already proved)"
    verification:
      - kind: integration
        ref: "src/api/http/routes/tasks.test.ts#task routes: GET /tasks, GET /tasks/:id/events, POST /tasks/:id/cancel > cancels a queued task by recording CANCEL without touching the runner"
        status: pass
    human_judgment: false
  - id: D9
    description: "Whole unit suite (394 tests, up from 388) stays green, hermetic, under 30s wall-clock; npm run typecheck and npm run lint both exit 0; grep -c \"watch\" over the integration test file returns 0"
    verification:
      - kind: unit
        ref: "npm test (unit project, 394/394 passing, 25.19s-25.22s across two runs); npm run typecheck; npm run lint"
        status: pass
    human_judgment: false
  - id: D10
    description: "Phase gate (Task 2 of this plan): re-confirm the phase's version-pinned empirical foundations (claude 2.1.218, git 2.55.0) against the actually-installed toolchain, run npm run spikes, and perform one real end-to-end task against the daemon and a genuine Claude subscription"
    verification: []
    human_judgment: true
    rationale: "This step is explicitly and irreducibly a human action per the plan's own design: it requires a real claude CLI invocation against the developer's actual subscription (consuming genuine plan turns), starting the real daemon, and registering a real project — none of which any agent, worktree-isolated or otherwise, can or should perform on the user's behalf. NOT completed by this execution. See '## Phase Gate — Not Yet Closed' below for what was pre-checked (read-only, zero-cost) and the full checklist still outstanding."
duration: ~50min
completed: 2026-07-26
status: complete
---

# Phase 02 Plan 10: QUAL-02 End-to-End Integration Suite Summary

**All seven D-31 scenarios (happy path, wall-clock timeout, cancel-mid-run with dirty-work capture, malformed-line, unknown-event, rate-limit, env-shape) now run as named end-to-end tests asserting on persisted SQLite state — and along the way, the orchestrator-approved scope expansion closed a real production gap: `Scheduler.pauseForRateLimit()` and `cancelQueued()` were fully unit-tested since plan 02-09 but called from nowhere in production, so a real rate limit would have recorded an event and kept dispatching, and a queued task's cancellation only rejected its eventual DISPATCH after the fact instead of genuinely dequeuing it.**

## Phase Gate — Partially Closed (steps 1–3 run and recorded 2026-07-26)

> **GATE OUTCOME, recorded by the orchestrator after this SUMMARY was written.**
> The user authorised running the billing-consuming checks. Steps 1–3 below were
> executed against the drifted `2.1.220` CLI and **all passed**. Step 4 (daemon +
> real project + real task) was deliberately **deferred by the user** and remains
> the only outstanding item.
>
> | Check | Command | Result |
> |---|---|---|
> | git version | `git --version` | `git version 2.55.0` — matches pinned finding |
> | CLI version | `claude --version` | **`2.1.220`** (pinned findings were `2.1.218` — drift confirmed) |
> | Step 3 — auth | `claude auth status` | exit 0 · `loggedIn: true`, `authMethod: "claude.ai"`, `apiProvider: "firstParty"`, `subscriptionType: "max"` |
> | Step 2 — **billing guarantee** | `claude -p "say ok" --setting-sources "" --permission-mode plan --output-format stream-json --verbose --max-turns 1` | exit 0 · first stdout line `type: system`, `subtype: init`, **`apiKeySource: "none"`** ✅ |
> | Step 1 — spike suite | `npm run spikes` | exit 0 · **4 files / 4 tests passed** — SPIKE-02/03/04/06 re-exercised against `2.1.220` |
>
> **Verdict on the drift:** `2.1.218 → 2.1.220` introduced no observable regression in
> any finding this phase depends on. The load-bearing D-01/D-02 guarantee
> (`apiKeySource: "none"` under subscription auth) holds on the newer CLI.
>
> **Still outstanding:** step 4 only — the daemon end-to-end run (register a real
> project, create one real task with `--max-turns 2`, confirm the worktree appears
> under `~/.fleet/worktrees/`, is locked while running, the branch survives, and
> `turnsUsed` is populated). Unaffected by the version drift; it exercises Fleet's
> own wiring rather than any pinned CLI fact.

Task 2 of this plan (`checkpoint:human-verify`, `gate="blocking"`) is a phase-completion gate that **cannot be performed by this agent** — it requires a real `claude` CLI invocation against a genuine Claude subscription, a running daemon, and a registered real project. It was **not** run as part of this execution. What follows is the full checklist from the plan, annotated with what could be safely pre-checked (read-only, zero cost, zero billing) versus what is genuinely left for the human.

**Pre-checked (read-only, no billing, no side effects):**
- `git --version` on this machine: **`git version 2.55.0`** — matches the phase's pinned finding exactly.
- `claude --version` on this machine: **`2.1.220`** — the phase's findings are pinned to `2.1.218`. **This has drifted** (2.1.218 → 2.1.220). Per the plan's own instruction, this means steps 2–4 below are not "a formality" — they are the actual point of this checkpoint and must be run by hand.

**Still outstanding — requires the human, in order:**
1. Run `npm run spikes` (the opt-in, real-CLI probe suite) and confirm it exits 0. Re-exercises SPIKE-02 (legal `--permission-mode` values), SPIKE-03 (settings-file scoping inside a worktree), SPIKE-04 (`session_id` presence per event type), SPIKE-06 (bare model-alias acceptance) — all against the now-newer `2.1.220` CLI, not the `2.1.218` these were originally observed against.
2. Confirm by hand: `claude -p "say ok" --setting-sources "" --permission-mode plan --output-format stream-json --verbose --max-turns 1` still exits 0 and its first stdout line carries `"apiKeySource":"none"`. This is the load-bearing D-01/D-02 finding — the phase's central billing guarantee.
3. Confirm `claude auth status` still returns JSON containing `loggedIn` and `authMethod` keys.
4. Start the daemon (`npm run dev`), register a real project, create one real task with a trivial prompt and `--max-turns 2`. Watch `fleet task show <id>` / `fleet task events <id>`. Confirm the worktree appeared under `~/.fleet/worktrees/`, was locked while running, the branch survives, and `turnsUsed` is populated. This consumes a small number of real subscription turns.
5. Record the outcome of steps 1–4 (and any drift found) — the phase cannot be marked closed until this is done and recorded, per this plan's own `<verification>` block ("The manual gate is recorded as approved, with the observed `claude` and `git` versions written into the summary").

Two things this checkpoint deliberately does not ask anyone to verify (per the plan's own text): a genuine rate-limit hit (SPIKE-01 remains detected-but-unconfirmed — the evidence trap captures the first real one for free), and whether `--resume --fork-session` yields a fresh session id while preserving the original transcript (server-side state, observable only over real usage).

**Recommendation:** this checkpoint should be surfaced to the user as a `checkpoint:human-verify` (`gate="blocking"`) before the phase is considered closed. The two commits below are complete, tested, and reviewable independently of this gate.

## Performance

- **Duration:** ~50 min
- **Started:** 2026-07-26T16:50:00Z (approx)
- **Completed:** 2026-07-26T17:40:00Z (approx)
- **Tasks:** 1 of 2 (Task 1 complete; Task 2 is the pending human phase gate above)
- **Files modified:** 6 (0 created, 6 modified: 2 test files, 3 production files, 1 requirements doc)

## Accomplishments

- All seven D-31 scenarios now run as named `it()` blocks inside `WorktreeRunner tracer (end-to-end)`, each asserting on the `tasks` row and its `events` rows read directly from SQLite — not merely on an HTTP response body or a runner's return value.
- The wall-clock-timeout scenario proves BOTH the direct child and its fixture-reported grandchild are unreachable (`ESRCH`) after the 500ms cap fires, using a test-local hang fixture (mirroring plan 02-06's own precedent) since the shared fixture's `hang` scenario has no way to report its grandchild's pid to an HTTP-driven caller.
- The cancel-mid-run scenario dirties the worktree before cancelling, then asserts the resulting `fleet: uncommitted work captured at session end` commit actually landed on the surviving branch — the one place the cancel path and the dirty-capture path are proven to compose end to end.
- The malformed-line and unknown-event scenarios each compute a same-test happy-path baseline event count fresh, rather than hardcoding an expected number, so a future change to the happy-path fixture's own event shape cannot silently invalidate an unrelated scenario's assertion.
- The rate-limit scenario is the one that surfaced the real production gap: `Scheduler.pauseForRateLimit()` was unreachable from `WorktreeRunner`'s real exit path. Closed via a new `onRateLimit` callback seam on `WorktreeRunnerOptions`, wired in `app.ts` for the default runner and directly in the test for its own fixture-backed pair — confirmed empirically that `scheduler.isPaused` becomes `true` with exactly one pending resume timer (Vitest fake timers scoped to `setTimeout`/`clearTimeout` only, leaving real I/O untouched).
- The env-shape scenari

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 26434 bytes -->
