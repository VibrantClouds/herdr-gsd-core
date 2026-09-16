# Phase 3: Race Condition & Lifecycle Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-30
**Phase:** 3-Race Condition & Lifecycle Fixes
**Areas discussed:** Drag rework mechanism (RACE-03), compare-modal layout trigger (RACE-02), penetration-modal reveal timing (RACE-01)

**Area selection:** Four gray areas were offered — the three above plus Category normalization (RACE-04). The user selected the first three; RACE-04 was left to Claude's discretion and locked as normalize-on-load with in-memory-only scope (see CONTEXT.md D-14/D-15/D-16).

---

## Drag rework mechanism (RACE-03)

### Q1: How should ruler/dial dragging capture pointer events?

| Option | Description | Selected |
|--------|-------------|----------|
| PointerCapture on the handle element | `setPointerCapture()` routes all subsequent pointer events to the element until release — no document listeners, so a modal closing mid-drag physically cannot leak. Requires unifying mouse+touch into pointer events. | ✓ |
| Explicit drag-context manager service | Keep document listeners, centralize registration/teardown behind one manager. Smaller diff, keeps the mouse+touch split — but cleanup stays discipline-based. | |
| PointerCapture with a document-listener fallback | Capture where supported, fall back to today's path otherwise. Safest for old browsers, but two live code paths. | |

**User's choice:** PointerCapture on the handle element
**Notes:** Chose the option where correctness is structural rather than dependent on `ngOnDestroy` discipline.

### Q2: Where should ruler drag state live once PointerCapture lands?

| Option | Description | Selected |
|--------|-------------|----------|
| Component owns drag; service becomes stateless math | `MeasurementRulerComponent` handles pointerdown/move/up with capture; the service keeps only pure functions. Drag state dies with the component. Costs rewriting the existing `startDrag`/`stopDragDefensively` specs and removing those calls from both modals' `ngOnDestroy`. | ✓ |
| Keep the service API, scope it per-component | Service listed in the component's `providers` so each ruler gets its own instance. Smaller diff, specs mostly survive — but drag state still lives outside the element owning the pointer. | |
| Keep the root singleton, swap the mechanism only | Service stays `providedIn:'root'`, just calls `setPointerCapture` instead of adding document listeners. Smallest change, but two modals still share one drag-state object. | |

**User's choice:** Component owns drag; service becomes stateless math
**Notes:** Scouting surfaced that `MeasurementRulerService` is a root singleton holding mutable per-drag state shared by upload-modal and attachment-edit-modal — a sharper problem than CONCERNS.md documents, which this option eliminates outright.

### Q3: How wide should the PointerCapture rework go?

| Option | Description | Selected |
|--------|-------------|----------|
| Ruler + dial only — RACE-03 literal scope | Convert `MeasurementRulerComponent` and `AngleDialComponent`, the two surfaces that actually leak. compare-modal's panel drag noted as follow-up. | ✓ |
| Ruler + dial + compare-modal panel drag | One consistent pattern across all three drag surfaces. Panel drag is the most user-visible interaction and isn't currently broken — highest regression risk for zero current defect. | |
| Ruler + dial + attachment-preview canvas interaction | Also covers `attachment-preview`'s `(mousemove)` hover/hit-testing. Hover, not drag; no cleanup problem — consistency only. | |

**User's choice:** Ruler + dial only
**Notes:** compare-modal's panel drag uses `@HostListener('document:mousemove')`, which Angular tears down on destroy — evaluated and confirmed not to leak, so it was deferred rather than folded in.

---

## compare-modal layout trigger (RACE-02)

### Q1 (first framing, superseded): What should trigger the default-position calculation?

The first framing of this question offered "ResizeObserver one-shot", "recompute on every resize", and "afterNextRender". The user selected the one-shot option. That framing was drawn from `calculateDefaultPositions()` in isolation and was inaccurate: the surrounding wiring already calls it on every panel-state change (`compare-modal.component.ts:92-96`) and on every `comparisonCenter` resize (`:109-124`). Recompute-on-resize is therefore today's behavior, and one-shot-then-disconnect would have been a regression. The question was corrected and re-asked below.

### Q1 (corrected): How should the canvas measurement be made deterministic?

| Option | Description | Selected |
|--------|-------------|----------|
| Observe `#comparisonCanvas` too; read cached dims synchronously | ResizeObserver caches canvas dimensions; `calculateDefaultPositions()` reads the cache and runs synchronously. Existing triggers unchanged. Fully behavior-preserving, just deterministic. | ✓ |
| Observe the canvas and drive recalculation from it | Move the trigger onto the canvas observer; state changes queue until dimensions are known. Cleaner single source of truth, but reorders when recalcs fire. | |
| One-shot: compute once when the canvas first lays out | Would change behavior — positions would stop following model/scale changes and window resizes. | |

**User's choice:** Observe `#comparisonCanvas` too; read cached dims synchronously
**Notes:** Key grounding fact recorded during discussion — `calculateDefaultPositions()` measures `#comparisonCanvas` while the existing observer watches `comparisonCenter`. That element mismatch is the actual mechanism behind RACE-02.

### Q2: Is the `setApplyingDefaults` timing hack in scope for this phase?

| Option | Description | Selected |
|--------|-------------|----------|
| In scope — fix both call sites deterministically | Same defect class, and one call site is in compare-modal already. Replace the 100ms guess with a service-owned window; both `compare-modal:235` and `comparison-panel:396` get the same treatment. | ✓ |
| Out of scope — note as a follow-up | RACE-02 names only the default-position calculation; keep the phase to its four stated requirements. | |
| Fix only compare-modal's call site | Handle the one in the file being touched, leave the duplicate. | |

**User's choice:** In scope — fix both call sites
**Notes:** The flag gates a `filter()` in `model-attachment-defaults.service.ts:350`'s auto-save stream; if the 100ms guess is wrong the app persists defaults it was supposed to skip.

### Q3: What if a state change requests positions before the canvas has real dimensions?

| Option | Description | Selected |
|--------|-------------|----------|
| Mark pending, recompute when dimensions arrive | Dirty flag; the canvas observer's first non-zero callback runs the deferred calculation. This is what actually kills the race. | ✓ |
| Drop the request, wait for the next trigger | Matches today's silent-return semantics exactly, just deterministically — preserves the failure mode. | |

**User's choice:** Mark pending, recompute when dimensions arrive

---

## penetration-modal reveal timing (RACE-01)

### Q1: When should penetration-modal content become visible?

| Option | Description | Selected |
|--------|-------------|----------|
| Immediately — content renders as the modal animates in | `showContent` flips as soon as state is read. What RACE-01 asks for. Visual change: content is present during the 0.3s entrance instead of popping in at the end. | ✓ |
| Keep the staged reveal, driven by `animationend` | Compute immediately but hold `showContent` until the shell's animation ends. Preserves today's look with no timer; costs a listener plus a `prefers-reduced-motion` fallback. | |
| Immediately, and drop the entrance animation coupling entirely | Treat the 0.3s CSS as pure shell decoration. | |

**User's choice:** Immediately
**Notes:** The existing `setTimeout(..., 300)` coincides exactly with the shell's `opacity/visibility 0.3s` transition and `slideIn 0.3s` animation, so it was ambiguous whether the delay bought time for state or for the animation. Resolved in favour of state correctness.

### Q2: Should the modal keep tracking state while open, or snapshot once?

| Option | Description | Selected |
|--------|-------------|----------|
| Live subscription while open, torn down on close/destroy | `takeUntil(destroy$)` + `distinctUntilChanged`, gated on `isOpen`. Removes the stale-snapshot failure entirely. Behavior change: today the modal is frozen at open-time state. | ✓ |
| Snapshot once when `isOpen` becomes true | Preserve today's semantics deterministically via `take(1)`. Smaller delta, but the modal stays blind to changes made while open. | |
| Live subscription, but only for panel state | Panel state live; `measurementUnit` stays on its existing separate subscription. Splits the lifecycle across two mechanisms. | |

**User's choice:** Live subscription while open

### Q3: What happens to the now-redundant `leftPanelState`/`rightPanelState` `@Input`s?

| Option | Description | Selected |
|--------|-------------|----------|
| Remove them; service subscription is the single source | Delete both `@Input`s, `getEffectiveLeftState`/`getEffectiveRightState`, and the two `\| async` bindings in `app.component.html`. Kills the dual-source confusion the original code comment complains about. | ✓ |
| Keep them as a fallback | Leave the `??` chain for safety. `StateManagementService` is a BehaviorSubject so the fallback would be unreachable, but it's zero risk. | |
| Keep the `@Input`s, drop the internal state instead | Smallest component, but re-introduces the stale-input race the internal state worked around. | |

**User's choice:** Remove them
**Notes:** Confirmed during scouting that `app.component.html:142-147` is the only binding site.

### Q4: With `ngOnChanges` going away, what lifecycle shape replaces it?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep `@Input isOpen`, drive a Subject + `switchMap` in `ngOnInit` | Matches the RxJS pattern used elsewhere in the codebase; diff contained to this component. | |
| Migrate `isOpen` to a signal input with `toObservable` | `input(false)` plus `toObservable(isOpen)` feeding the same RxJS chain — no `ngOnChanges` at all. Matches CLAUDE.md's stated direction. Parent binding unchanged; spec needs `setInput()`. | ✓ |
| Full signal migration of the component | Convert `showContent`, transforms, dimensions too. Most idiomatic end state, but decomposition-scale blast radius on a race fix. | |

**User's choice:** Migrate `isOpen` to a signal input
**Notes:** Scope of the signal migration is explicitly limited to `isOpen` — the full-migration option was rejected as too wide for this phase.

---

## Claude's Discretion

- **RACE-04 category normalization** — not selected for discussion; locked at Claude's discretion as normalize-on-load applied consistently across server models, user models and custom categories, in-memory only (no serialized shape change, no version bump), with `image-metadata.service.spec.ts` created for the mixed-case test the roadmap requires.
- **Test depth for Phase 3 vs Phase 5** — locked at Claude's discretion: rewrite the specs this rework breaks, create the mixed-case category spec, add the mid-drag listener regression test, defer TEST-01..04 to Phase 5.
- Naming/placement of the shared category-normalization helper.
- API shape of the deterministic `applyDefaults` window on `ModelAttachmentDefaultsService`.
- Whether the compare-modal canvas-dimension cache is a plain field or a signal.
- `pointercancel` handling in the PointerCapture rework.
- Whether ruler pointer handlers keep separate mouse/touch method names or collapse to one.

## Deferred Ideas

- compare-modal panel drag (`@HostListener('document:mousemove'/'document:touchmove')`, lines 500-534) → PointerCapture. Doesn't leak; highest regression risk for zero current defect.
- attachment-preview canvas `(mousemove)` hover/hit-testing → pointer events. Consistency only.
- Benign `setTimeout(0/10)` focus and scroll deferrals in `size-slider`, `category-dropdown`, `image-display`, plus snackbar/share-success timers — not races.
- Persisted category-string normalization (data migration in IndexedDB/localStorage) — out of RACE-04's scope.
- Broader test coverage: TEST-01..04 remain Phase 5.
- `indexeddb-user-model.service.ts` still has no spec file — carried forward from Phase 2's known-gaps note.
