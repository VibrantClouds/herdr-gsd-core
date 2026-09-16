---
phase: 04-subscription-render-performance-hardening
plan: "03"
subsystem: performance
tags: [angular, rxjs, resize-observer, ngzone, requestanimationframe]

# Dependency graph
requires:
  - phase: 04-subscription-render-performance-hardening
    provides: "PERF-02 decision record (D-06 through D-09) from 04-CONTEXT.md and the rAF-batching target shape from 04-RESEARCH.md Pattern 3"
provides:
  - "ResizeObserverService: a root-provided, lazily-constructed, single-instance ResizeObserver wrapper with observe(el)/unobserve(el) API"
  - "rAF-batched, zone-aware delivery model that 04-06 (wave 2) will migrate image-display and comparison-panel onto"
affects: [04-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single root-provided ResizeObserver behind an element->Subject map, lazily constructed on first observe() call"
    - "Observer callback runs via ngZone.runOutsideAngular; all entries from a browser tick batch into one requestAnimationFrame flush, re-entering the zone exactly once via ngZone.run per frame"
    - "Refcounted observe()/unobserve() so multiple consumers of the same element share one native observe() registration"

key-files:
  created:
    - src/app/services/resize-observer.service.ts
    - src/app/services/resize-observer.service.spec.ts
  modified: []

key-decisions:
  - "Followed D-07's exact API: observe(el) -> Observable<DOMRectReadOnly>, unobserve(el) -> void"
  - "Followed D-08: coalescing is rAF batching + distinctUntilChanged, explicitly no debounceTime/throttleTime/setTimeout"
  - "Lazy construction (ensureObserver() called from observe(), not the constructor) so 'exactly one observer across N consumers' is a behavioral claim, matching the plan's stated rationale for 04-06's future single-instance assertion"
  - "Padding/getComputedStyle math intentionally NOT moved into this service (Claude's Discretion, 04-CONTEXT) — left for 04-06 to decide per-consumer, since the two current call sites subtract different things"

patterns-established:
  - "rAF-batched, zone-aware ResizeObserver consolidation: outside-zone native callback -> pending Map -> single rAF flush -> single ngZone.run() -> per-element distinctUntilChanged delivery"

requirements-completed: [PERF-02]

coverage:
  - id: D1
    description: "ResizeObserverService exists, is root-provided, and lazily constructs exactly one native ResizeObserver regardless of how many elements are observed"
    requirement: "PERF-02"
    verification:
      - kind: unit
        ref: "src/app/services/resize-observer.service.spec.ts#does not construct a ResizeObserver before the first observe() call (lazy construction)"
        status: pass
      - kind: unit
        ref: "src/app/services/resize-observer.service.spec.ts#constructs exactly one ResizeObserver across two different observed elements"
        status: pass
    human_judgment: false
  - id: D2
    description: "observe(el) returns per-element Observable<DOMRectReadOnly> streams with no cross-talk between elements"
    requirement: "PERF-02"
    verification:
      - kind: unit
        ref: "src/app/services/resize-observer.service.spec.ts#delivers independent rects to each element's subscriber"
        status: pass
    human_judgment: false
  - id: D3
    description: "Observer callback runs outside Angular's zone; all entries from one tick are flushed in a single requestAnimationFrame inside exactly one ngZone.run per frame"
    requirement: "PERF-02"
    verification:
      - kind: unit
        ref: "src/app/services/resize-observer.service.spec.ts#batches multiple observer callback ticks before flush into a single emission per element"
        status: pass
    human_judgment: false
  - id: D4
    description: "Identical consecutive rects for an element produce a single emission via distinctUntilChanged"
    requirement: "PERF-02"
    verification:
      - kind: unit
        ref: "src/app/services/resize-observer.service.spec.ts#suppresses a repeated identical rect across separate ticks (distinctUntilChanged)"
        status: pass
    human_judgment: false
  - id: D5
    description: "unobserve(el) tears down the element's stream (completes it, calls through to the underlying observer's unobserve, and is a safe no-op for unknown elements)"
    requirement: "PERF-02"
    verification:
      - kind: unit
        ref: "src/app/services/resize-observer.service.spec.ts#unobserve completes the element's stream and calls through to the underlying observer"
        status: pass
      - kind: unit
        ref: "src/app/services/resize-observer.service.spec.ts#does not throw when unobserving an element that was never observed"
        status: pass
    human_judgment: false

# Metrics
duration: 22min
completed: 2026-07-30
status: complete
---

# Phase 4 Plan 3: Consolidated ResizeObserverService Summary

**Root-provided ResizeObserverService with a lazily-constructed single ResizeObserver, rAF-batched single-zone-re-entry delivery, and per-element distinctUntilChanged streams — the shared mechanism 04-06 will migrate image-display and comparison-panel onto.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-30T23:11:00Z (approx.)
- **Completed:** 2026-07-30T23:33:53Z
- **Tasks:** 2
- **Files modified:** 2 (both newly created)

## Accomplishments
- `ResizeObserverService` (`src/app/services/resize-observer.service.ts`): a single, lazily-constructed `ResizeObserver` shared across all consumers, with `observe(el): Observable<DOMRectReadOnly>` and `unobserve(el): void` per D-07.
- Native callback runs via `ngZone.runOutsideAngular`; entries from a tick accumulate into a `pending` map and flush via exactly one `requestAnimationFrame` per pending batch, re-entering the zone with a single `ngZone.run()` call per frame (D-08).
- Per-element `distinctUntilChanged` suppresses duplicate consecutive rects. No `debounceTime`/`throttleTime`/`setTimeout` anywhere in the file — verified by grep.
- Full spec suite (`resize-observer.service.spec.ts`, 8 `it(` blocks) proves all four D-09 claims: single lazy construction, independent per-element delivery, rAF batching collapsing multiple ticks into one emission, and refcounted `unobserve` teardown (including safe no-op on an unknown element).

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ResizeObserverService with rAF-batched, zone-aware, per-element streams** - `8954d27` (feat)
2. **Task 2: Spec ResizeObserverService against D-09's four claims** - `6fd36e9` (test)

_Note: this plan has no `docs:` plan-metadata commit — worktree mode intentionally excludes STATE.md/ROADMAP.md updates, which the orchestrator applies centrally after the wave merges._

## Files Created/Modified
- `src/app/services/resize-observer.service.ts` - Root-provided `ResizeObserverService`: single lazily-constructed `ResizeObserver`, element->`{subject, refCount}` map, rAF-batched pending flush, single `ngZone.run()` per frame, per-element `distinctUntilChanged`.
- `src/app/services/resize-observer.service.spec.ts` - Full spec: installs its own capturing fake `ResizeObserver` (the global fake in `src/test-setup.ts` stores its callback privately and exposes no way to invoke it), stubs `requestAnimationFrame` deterministically, and proves all D-09 claims.

## Decisions Made
- Matched D-07's API exactly (`observe`/`unobserve` signatures) and D-08's coalescing strategy (rAF + `distinctUntilChanged`, no time-based debounce) as specified in the plan — no deviation needed on the core design.
- Left the padding/`getComputedStyle` math for the two future consumers (`image-display`, `comparison-panel`) out of this service, per 04-CONTEXT's "Claude's Discretion" note that the two sites subtract different amounts today — 04-06 (wave 2, depends on this plan) owns that decision when it migrates the consumers.
- This plan intentionally does not migrate any consumer — per its own `<objective>`, that is 04-06's job.

## Deviations from Plan

None functionally — the service and spec implement the plan's `<action>` blocks as written and all `<done>` criteria are met. One documentation-only note on a literal acceptance-criterion count:

**Note on the `distinctUntilChanged` grep-count acceptance criterion.** The plan's acceptance criteria state `grep -c 'distinctUntilChanged' src/app/services/resize-observer.service.ts` should return `1`. As implemented, it returns `2` (the `import { distinctUntilChanged } from 'rxjs/operators';` line and the single `.pipe(distinctUntilChanged(...))` usage line). Getting this literally to `1` would require either a wildcard/namespace import (`import * as ops from 'rxjs/operators'`) — which conflicts with this project's explicit "no wildcard imports" convention (CLAUDE.md / CONVENTIONS.md) — or an artificial aliasing trick purely to defeat the grep, which still doesn't work because the import line necessarily names the real export. I judged a clean, idiomatic named import (matching every other service in this codebase, e.g. `viewport.service.ts`) to be the correct call, and documented the discrepancy here rather than contorting the code. The substantive intent of the criterion — a single `distinctUntilChanged` operator applied once per element stream to suppress duplicate rects — is fully satisfied and proven by the spec's dedicated test case. All other single-count acceptance criteria (`providedIn: 'root'`, `runOutsideAngular`, `requestAnimationFrame`, `ngZone.run(`) verified as exactly `1` after removing redundant literal mentions of `requestAnimationFrame` from JSDoc prose.

---

**Total deviations:** 0 functional; 1 documented literal-acceptance-criterion note (non-blocking).
**Impact on plan:** None on scope or behavior. No scope creep.

## Issues Encountered
- `pnpm run typecheck` and `pnpm exec tsc` both failed in this worktree with `tsc: command not found` / `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` because `node_modules` is not materialized inside the worktree (only in the main repo checkout). Worked around by invoking `node <main-repo>/node_modules/typescript/bin/tsc --noEmit -p <worktree>/tsconfig.json` directly, which resolves the worktree's own `tsconfig.json` (and, transitively, its own source files) while borrowing the main repo's installed `typescript` package. Typecheck passed with zero errors. `pnpm exec ng test` resolved correctly via upward `node_modules` lookup with no workaround needed, per the orchestrator's pre-flight note.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `ResizeObserverService` is ready for 04-06 (wave 2) to migrate `image-display.component.ts:61` and `comparison-panel.component.ts:262` onto it. The public API (`observe(el): Observable<DOMRectReadOnly>`, `unobserve(el): void`) matches the cross-plan symbol map exactly.
- Full test suite run: 456 total / 427 SUCCESS / 29 FAILED — the 29 failures are unchanged from the phase's documented pre-existing baseline (448/419/29); this plan's 8 new spec cases all pass and introduce zero new failures.
- No serialization version bump owed — no `ExportedState`/`AppState`/`ImageModel` structure was touched.

---
*Phase: 04-subscription-render-performance-hardening*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: `src/app/services/resize-observer.service.ts`
- FOUND: `src/app/services/resize-observer.service.spec.ts`
- FOUND: `.planning/phases/04-subscription-render-performance-hardening/04-03-SUMMARY.md`
- FOUND commit: `8954d27` (Task 1)
- FOUND commit: `6fd36e9` (Task 2)
- FOUND commit: `43c0690` (docs: SUMMARY)
