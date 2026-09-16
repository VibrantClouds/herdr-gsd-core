# Deferred Items — Phase 03 (race-condition-lifecycle-fixes)

Items discovered during plan execution that are out of scope for the discovering plan
and are logged here rather than fixed, per the Scope Boundary rule.

## From Plan 03-05

1. **`compare-modal.component.spec.ts` — 9 pre-existing template/selector-drift failures**
   - Found during: Task 2 verification run
   - Specs: `On Top Toggle` (4 specs querying `.on-top-control`, `.slide-toggle`, `.label-left`,
     `.label-right`) and `Horizontal Flip` (5 specs querying `.flip-button`, `.flip-button.left-flip`,
     `.flip-button.right-flip`) — none of these CSS classes exist in
     `compare-modal.component.html` anymore (current template uses `.on-top-chip`, `.reset-chip`,
     no flip-button markup found at all).
   - These 9 failures are unrelated to RACE-02 (default-position calculation / ResizeObserver) and
     predate this phase: `01-BASELINE.md`'s Phase 1 close-out full-suite capture already records
     all 30 `CompareModalComponent` specs (including these 9) as failing, at that time due to a
     missing `HttpClient` TestBed provider (see item 2 below). After fixing that DI gap, these 9
     remain red for the template-drift reason above — a separate, pre-existing bug in the test
     suite's DOM selectors.
   - Not fixed here: fixing would mean either restoring dead markup/classes to the template
     (behavior-neutral but out of this plan's file scope) or rewriting the spec assertions to match
     the current template (a different task's worth of work, unrelated to the ResizeObserver fix).
   - Recommendation: a future plan (or `03-08`'s close-out) should decide whether the on-top/flip
     UI still needs these controls and either restore the markup or delete the dead specs.

## Deviations already applied (documented in 03-05-SUMMARY.md, not deferred)

2. **`compare-modal.component.spec.ts` — missing `provideHttpClient()`/`provideHttpClientTesting()`
   TestBed providers** — this WAS fixed (Rule 3, blocking issue) because it blocked verifying
   Task 1/2's acceptance criteria; see `03-05-SUMMARY.md` Deviations section for detail.
