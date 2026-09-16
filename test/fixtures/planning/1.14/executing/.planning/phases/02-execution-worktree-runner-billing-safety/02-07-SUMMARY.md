---
phase: 02-execution-worktree-runner-billing-safety
plan: 07
subsystem: infra
tags: [billing-safety, preflight, redaction, pino, event-store, fastify]

# Dependency graph
requires:
  - phase: 02-execution-worktree-runner-billing-safety
    provides: "src/runner/env.ts (buildAllowlistedEnv, buildWorkerEnv, FORCED_GIT_ENV) from plan 02-01; recordEvent()'s extraFields parameter and api/http/errors.ts's complete CODE_TO_STATUS set (including preflight_failed) from plan 02-04; WorktreeRunner/buildSpawnArgv/DEFAULT_DISALLOWED_TOOLS/PERMISSION_MODE from plan 02-04"
provides:
  - "src/runner/preflight.ts: verifySubscriptionAuth() and verifyPermissionModeSupported() — the BILL-05/D-07 daemon-startup gate, PreflightResult/PreflightError/CommandRunner types"
  - "src/core/event-store/redact.ts: redact(), SECRET_PATTERNS, REDACTION_TOKEN, MIN_BASE64_RUN, redactionSerializer — the single BILL-08/D-08 redaction matcher shared by the event-store write path and the Fastify/pino logger"
  - "src/runner/push-impossibility.test.ts: two independent tests proving SAFE-06's env-starvation and argv-deny-rule layers each hold alone"
  - "buildApp()'s injectable `preflight` dep and the POST /tasks preHandler gate, for any later plan needing to test preflight-refused dispatch"
affects: [02-09, ops, dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Preflight-as-injected-dep: buildApp() accepts a PreflightResult and gates only POST /tasks via a scoped preHandler hook, rather than mutating the Scheduler — keeps the gate entirely inside this plan's owned file (app.ts) without touching queue.ts"
    - "Value-shape + key-name redaction split inside one module: VALUE_SHAPE_PATTERNS replace their entire match; KEY_NAME_PATTERNS use a 3-group capture so the key name stays readable and only the value is replaced — both exported together as one SECRET_PATTERNS array for structural assertions"
    - "pino formatters.log with a serializer-owned-key allowlist: redactionSerializer walks every log field except req/res/err/request/response, which are left as live references so Fastify's own serializers (which need prototype getters, not JSON-stringifiable own-properties) still run correctly afterward"

key-files:
  created:
    - src/runner/preflight.ts
    - src/runner/preflight.test.ts
    - src/runner/push-impossibility.test.ts
    - src/core/event-store/redact.ts
    - src/core/event-store/redact.test.ts
  modified:
    - src/api/http/app.ts
    - src/core/event-store/record-event.ts
    - src/core/event-store/record-event.test.ts

key-decisions:
  - "PD-08 (made during execution): 'construct the scheduler in a refusing state' is implemented as an app.ts-level preHandler hook scoped to POST /tasks, not a Scheduler-level pause flag. queue.ts is not in this plan's files_modified list (it's plan 02-09's), and the plan's own acceptance criteria only require POST /tasks to 503 with preflight_failed while GET /health/GET /tasks/:id keep responding — a route-level gate satisfies that contract without touching a file outside this plan's ownership or widening scope into 02-09's pause/resume work."
  - "PD-09: verifySubscriptionAuth()/verifyPermissionModeSupported() use a locally-defined CommandRunner + defaultRunner (spawnSync-based, buildAllowlistedEnv()) rather than reusing src/spikes/spawn-claude.ts's spawnClaude(), because spawnClaude() throws on a non-zero/ENOENT result whereas the preflight needs to convert that into a PreflightResult refusal, never an unhandled throw. spawn-claude.ts is not in this plan's files_modified list."
  - "PD-10: MIN_BASE64_RUN is set to 44, one above the plan's stated floor of 40, specifically so a bare 40-character git SHA-1 hex digest (a subset of the base64 alphabet) is never caught by the unlabeled base64-run matcher — the plan's own guidance to set the threshold 'conservatively' to avoid redacting legitimate hashes in diffs was the deciding factor. Credential families with a distinctive prefix (sk-ant-, ghp_, AKIA) or a known key name are still caught by the other patterns regardless of length."

patterns-established:
  - "redactionSerializer's serializer-owned-key allowlist (req/res/err/request/response) is the pattern any future pino formatter must follow: formatters.log runs BEFORE Fastify's built-in serializers, so touching those keys' object identity (e.g. via a JSON round-trip) silently strips the getter-backed fields those serializers depend on."

requirements-completed: [BILL-05, BILL-08, SAFE-06]

coverage:
  - id: D1
    description: "verifySubscriptionAuth() parses claude auth status JSON and refuses dispatch unless loggedIn && authMethod === 'claude.ai', refusing loudly (never guessing either direction) on a non-zero exit, non-JSON output, an unrecognised object shape, or a thrown ENOENT from the command runner"
    requirement: "BILL-05"
    verification:
      - kind: unit
        ref: "src/runner/preflight.test.ts#verifySubscriptionAuth (BILL-05) — 7 cases (ok, wrong authMethod names the observed value, loggedIn false, missing authMethod reports unrecognised-shape not not-logged-in, non-JSON output, thrown ENOENT, non-zero exit code)"
        status: pass
    human_judgment: false
  - id: D2
    description: "verifyPermissionModeSupported() parses claude --help's --permission-mode choices list and refuses when the configured mode is absent, naming the observed choice list — closing the Phase 1 deferred item"
    requirement: "BILL-05"
    verification:
      - kind: unit
        ref: "src/runner/preflight.test.ts#verifyPermissionModeSupported (D-07) — 2 cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "startDaemon() wires both preflight checks before app.listen(); buildApp() gates POST /tasks with a preflight_failed 503 (rendered via the existing generic code-keyed error branch) while GET /health and GET /tasks/:id keep responding — the daemon never silently exits on a refused preflight"
    requirement: "BILL-05"
    verification:
      - kind: unit
        ref: "src/runner/preflight.test.ts#POST /tasks refuses with preflight_failed when the daemon preflight was refused (T-2-18) — asserts 503/preflight_failed on POST /tasks and 200 on GET /health from the same app instance"
        status: pass
    human_judgment: false
  - id: D4
    description: "redact() applies value-shape patterns (sk-ant-, ghp_/gho_/ghs_, AKIA, Bearer headers, an unlabeled base64 run at/above MIN_BASE64_RUN=44) and key-name patterns (PITFALLS.md's enumerated credential families) globally and idempotently; redact('') is '', a secret-free payload is byte-identical, three distinct secret shapes are all replaced, and REDACTION_TOKEN cannot itself match any pattern"
    requirement: "BILL-08"
    verification:
      - kind: unit
        ref: "src/core/event-store/redact.test.ts#redact (BILL-08, D-08) — 19 cases including the MIN_BASE64_RUN boundary pair, an it.each idempotency sweep across 7 fixtures, and the REDACTION_TOKEN self-match check"
        status: pass
    human_judgment: false
  - id: D5
    description: "recordEvent() redacts the serialized event payload inside its existing transaction closure, before the events INSERT — never a post-hoc UPDATE against the append-only table; every pre-existing record-event.test.ts assertion still passes unchanged"
    requirement: "BILL-08"
    verification:
      - kind: unit
        ref: "src/core/event-store/record-event.test.ts#redacts a secret-shaped value in the event payload before it is written, leaving the rest of the reason intact (BILL-08) — plus all 12 pre-existing tests in the same file, unchanged"
        status: pass
      - kind: other
        ref: "grep -rn \"db.update(events)\\|db.delete(events)\" src/ -> no matches"
        status: pass
    human_judgment: false
  - id: D6
    description: "redactionSerializer is registered as pino's formatters.log hook on the Fastify logger, importing the SAME redact.ts module recordEvent() uses; a secret-shaped value in an arbitrary logged object is replaced, while req/res logging (which relies on Fastify's own serializers running afterward) is preserved"
    requirement: "BILL-08"
    verification:
      - kind: unit
        ref: "src/core/event-store/record-event.test.ts#pino redactionSerializer wired into the Fastify logger (BILL-08, T-2-17) — asserts a secret is replaced in a captured pino log line"
        status: pass
      - kind: other
        ref: "grep -rln \"sk-ant-\" src/ | grep -v test | grep -v redact.ts -> no matches (one definition site outside tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "SAFE-06's two push-impossibility layers each hold independently: the environment credential-starvation layer holds with the --disallowedTools deny rules entirely stripped from the argv under test, and the argv deny-rule layer holds with the forced git env constants entirely stripped from the env under test — asserted as two separate tests, never one combined assertion"
    requirement: "SAFE-06"
    verification:
      - kind: unit
        ref: "src/runner/push-impossibility.test.ts — exactly 2 tests, one per layer, plus a doc comment naming D-05's deliberately-rejected third layer (per-worktree remote.origin.pushurl poisoning)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-07-26
status: complete
---

# Phase 02 Plan 07: Daemon-Startup Preflight, Single Redaction Matcher, and SAFE-06 Independence Summary

**A daemon-startup preflight that parses `claude auth status` JSON and refuses dispatch (visibly, 503 `preflight_failed`) unless the CLI is on a subscription login, a single value-shape `redact()` matcher shared by the event-store write path and the pino logger, and two independent tests proving SAFE-06's env-starvation and argv-deny-rule layers each hold alone.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-26T10:37:00Z (approx)
- **Completed:** 2026-07-26T14:52:24Z (last task commit)
- **Tasks:** 3
- **Files modified:** 8 (5 created, 3 modified)

## Accomplishments

- `src/runner/preflight.ts`: `verifySubscriptionAuth()` parses `claude auth status`'s JSON (the CLI's default output format, per RESEARCH.md Pattern 5) and gates on `loggedIn === true && authMethod === 'claude.ai'` — deliberately not on `subscriptionType`. Any unparseable/unexpected-shape response, non-zero exit, or thrown `ENOENT` refuses loudly with a stated reason, never silently guessing "logged in" or "not logged in" either direction.
- `verifyPermissionModeSupported()` parses `claude --help`'s `--permission-mode` choices and refuses when Fleet's configured mode (`acceptEdits`) is absent — closing the Phase 1 deferred item that said "revisit in Phase 2 alongside BILL-05."
- `src/api/http/app.ts`: `startDaemon()` runs both checks before `app.listen()`; `buildApp()` gained an injectable `preflight` dep and a `preHandler` hook scoped to `POST /tasks` that throws `PreflightError` (rendered as 503 via the existing generic code-keyed branch in `registerErrorHandler` — `preflight_failed` was already in `CODE_TO_STATUS`). `GET /health`/`GET /tasks/:id` keep responding on a refused preflight; the daemon never silently exits.
- `src/core/event-store/redact.ts`: one pure, idempotent `redact()` combining value-shape patterns (`sk-ant-`, `ghp_`/`gho_`/`ghs_`, `AKIA`, `Bearer` headers, an unlabeled base64 run at/above `MIN_BASE64_RUN=44`) with key-name patterns over PITFALLS.md's enumerated credential families — the latter replacing only the value while keeping the key name readable. `REDACTION_TOKEN` cannot itself match any pattern, which is what makes the function idempotent.
- `recordEvent()` now redacts the serialized event payload inside its existing transaction closure, immediately before the `events` INSERT — never a post-hoc `UPDATE`, since `events` is append-only. Every pre-existing `record-event.test.ts` assertion still passes unchanged.
- `redactionSerializer` is registered as pino's `formatters.log` hook on the Fastify logger, importing the exact same `redact.ts` module — one pattern definition site backs both the event-store path and the log path (verified structurally: `grep -rln "sk-ant-" src/` outside test files returns only `redact.ts`).
- `src/runner/push-impossibility.test.ts`: two independent tests prove SAFE-06's two layers each hold alone — the environment layer with the argv deny rules entirely stripped, and the argv layer with the forced git env constants entirely stripped — with a doc comment recording D-05's deliberately-rejected third layer (per-worktree `remote.origin.pushurl` poisoning, rejected because it needs `extensions.worktreeConfig` on a repository Fleet doesn't own).

## Task Commits

Each task was committed atomically:

1. **Task 1: Daemon-startup preflight — subscription auth and CLI capability assertion** - `f08d504` (feat)
2. **Task 2: A single value-shape redaction matcher** - `ec4fe7d` (feat)
3. **Task 3: Wire redaction into the single write path and the logger, and prove SAFE-06's two layers are independent** - `7da37c2` (feat)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — STATE.md/ROADMAP.md excluded; orchestrator updates centrally)

## Files Created/Modified

- `src/runner/preflight.ts` - `verifySubscriptionAuth()`, `verifyPermissionModeSupported()`, `PreflightResult`, `PreflightError`, `CommandRunner`, `CommandResult`
- `src/runner/preflight.test.ts` - 10 tests covering every `<behavior>` case plus the `POST /tasks` 503/`preflight_failed` + `GET /health` 200 integration case
- `src/core/event-store/redact.ts` - `redact()`, `SECRET_PATTERNS`, `REDACTION_TOKEN`, `MIN_BASE64_RUN`, `redactionSerializer`
- `src/core/event-store/redact.test.ts` - 19 tests including the `MIN_BASE64_RUN` boundary pair and an `it.each` idempotency sweep
- `src/core/event-store/record-event.ts` - `redact()` wired into the transaction closure before the `events` INSERT
- `src/core/event-store/record-event.test.ts` - one new BILL-08 redaction-at-write-time test, plus a new `pino redactionSerializer` describe block
- `src/runner/push-impossibility.test.ts` - two independent SAFE-06 layer tests plus a D-05 doc comment
- `src/api/http/app.ts` - `buildApp()`'s injectable `preflight` dep and `POST /tasks`-scoped `preHandler` gate; `startDaemon()` runs both preflight checks; Fastify logger now carries `redactionSerializer` as `formatters.log`

## Decisions Made

See `key-decisions` in frontmatter (PD-08 through PD-10). Summary:
- **PD-08:** The "scheduler in a refusing state" requirement is implemented as an `app.ts`-level route gate (a `preHandler` hook scoped to `POST /tasks`), not a `Scheduler` pause flag — `queue.ts` is outside this plan's `files_modified` and belongs to plan 02-09.
- **PD-09:** The preflight's `claude` invocations use a locally-defined `CommandRunner`/`defaultRunner`, not `spawn-claude.ts`'s `spawnClaude()`, because the latter throws on failure where the preflight needs a `PreflightResult` refusal instead.
- **PD-10:** `MIN_BASE64_RUN` is 44, not the plan's stated floor of 40, specifically to avoid catching a bare 40-character git SHA-1 hex digest.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `redactionSerializer`'s initial design stripped Fastify's req/res log detail**
- **Found during:** Task 3, verifying the full test suite after wiring `redactionSerializer` into `app.ts`'s Fastify logger
- **Issue:** The first implementation round-tripped the ENTIRE pino log object through `JSON.stringify`/`JSON.parse`. Empirically confirmed (via a standalone script) that pino's `formatters.log` hook runs BEFORE Fastify's built-in `req`/`res` serializers, so at the point the formatter ran, `req`/`res` were still the live Fastify `Request`/`Response` instances whose useful fields (`method`, `url`, `headers`) are prototype getters, not own-enumerable properties. `JSON.stringify`-ing those instances silently dropped every getter-backed field, leaving the serializers that ran afterward with nothing to serialize — every logged `req`/`res` collapsed to `{}`, a genuine observability regression not caught by any written test (no test asserted req/res log shape).
- **Fix:** `redactionSerializer` now leaves a small allowlist of serializer-owned keys (`req`, `res`, `err`, `request`, `response`) untouched as their original references, redacting every other field via the JSON round-trip. Verified against a standalone script that `req`/`res` logging is fully restored while a secret-shaped value in custom log data (e.g. `app.log.info({ token: secret }, ...)`) is still redacted.
- **Files modified:** `src/core/event-store/redact.ts`
- **Verification:** Standalone script confirming `req: {"method":"GET","url":"/x",...}` is preserved; `record-event.test.ts`'s new pino test confirms the secret is still redacted; full `npm test` (242/242) green.
- **Committed in:** `7da37c2` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug, caught during Task 3's own verification pass before the task was considered done — never landed in a committed state).
**Impact on plan:** No scope creep; the fix stayed inside `redact.ts`, the single file this plan's Task 2/3 own for the redaction matcher.

## Issues Encountered

None beyond the one auto-fixed deviation above. `npm test` (242/242), `npm run typecheck`, and `npm run lint` are all green as of the final commit. Both acceptance-criteria greps (`db.update(events)|db.delete(events)` and `sk-ant-` outside test/`redact.ts`) return no matches.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `verifySubscriptionAuth()`/`verifyPermissionModeSupported()` are ready for a live smoke-test against a real authenticated `claude` CLI once a human runs the daemon manually (this plan intentionally never invokes the real binary, per the billing-safety instructions governing this plan's own execution).
- `redact()`/`SECRET_PATTERNS`/`REDACTION_TOKEN`/`MIN_BASE64_RUN`/`redactionSerializer` are the single definition site any later plan needing to redact a value before persistence or logging must import — never declare a competing pattern.
- `buildApp()`'s injectable `preflight` dep is available to plan 02-09 if pause/resume ever needs to compose with a refused preflight (though today the two are independent: preflight gates `POST /tasks` at the route layer, pause/resume will gate the `Scheduler` itself).
- No blockers for subsequent plans in this phase's wave.

## Self-Check: PASSED

All 5 created files verified present on disk: `src/runner/preflight.ts`, `src/runner/preflight.test.ts`, `src/runner/push-impossibility.test.ts`, `src/core/event-store/redact.ts`, `src/core/event-store/redact.test.ts`. All three task commit hashes (`f08d504`, `ec4fe7d`, `7da37c2`) verified present in `git log --oneline --all`. `npm test` (unit project) 242/242 green, `npm run typecheck` and `npm run lint` both clean as of the final commit.

---
*Phase: 02-execution-worktree-runner-billing-safety*
*Completed: 2026-07-26*
