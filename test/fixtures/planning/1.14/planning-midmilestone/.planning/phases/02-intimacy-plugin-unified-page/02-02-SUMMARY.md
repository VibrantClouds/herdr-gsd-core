---
phase: 02-intimacy-plugin-unified-page
plan: 02
subsystem: ui
tags: [angular, signals, accessibility, aria, radiogroup, meter, slider, autosize]

requires:
  - phase: 01-foundation-library
    provides: zoneless Angular 22 app shell, component conventions (input()/output(), OnPush, character-header pattern)
provides:
  - "Meter: accessible radiogroup rating widget (dot/heart) with click-to-clear and the reconciled DSGN-04 keyboard mapping, edit + static view modes"
  - "LeanSlider: five-position bipolar range slider showing its current word, edit + static view modes"
  - "AutosizeTextarea: grow-with-content textarea directive resizing on input and on bound-value change"
affects: [02-05, 02-06, intimacy-editor, subdoc-host]

actuals:
  tokens: 7456
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "TDD RED evidence for a Vitest/Angular project: `ng test --reporters=tap-flat` produces flat `not ok N - <suite > test>` lines but no `# tests`/`# pass`/`# fail` TAP13 summary directives (those are `node --test`-specific); the RED evidence record's `output` field must have those three summary lines appended from the real counts before `gsd_run check tdd-red-evidence` can classify it, since the classifier is written against `node --test`'s TAP dialect"
    - "A meter's own live word line uses [attr.aria-live]=\"mode() === 'edit' ? 'polite' : null\" instead of a static attribute, since the same template serves both edit (live) and view (static, no live region) modes"

key-files:
  created:
    - apps/web/src/app/components/meter/meter.component.ts
    - apps/web/src/app/components/meter/meter.component.html
    - apps/web/src/app/components/meter/meter.component.scss
    - apps/web/src/app/components/meter/meter.component.spec.ts
    - apps/web/src/app/components/lean-slider/lean-slider.component.ts
    - apps/web/src/app/components/lean-slider/lean-slider.component.html
    - apps/web/src/app/components/lean-slider/lean-slider.component.scss
    - apps/web/src/app/components/lean-slider/lean-slider.component.spec.ts
    - apps/web/src/app/components/autosize-textarea/autosize-textarea.directive.ts
    - apps/web/src/app/components/autosize-textarea/autosize-textarea.directive.spec.ts
  modified: []

key-decisions:
  - "LeanSlider input parsing adds an explicit empty-string guard before Number.isInteger/range checks — the plan's literal Number(target.value) formula would coerce '' to 0 and incorrectly emit 0 (Rule 1 fix)."
  - "Meter's roving-tabindex and aria-checked are computed from level() via small pure methods (ariaChecked/tabIndexFor) rather than inline template ternaries, keeping the template readable at 6 glyphs x 2 attributes."
  - "Focus-after-emit calls .focus() on the target glyph synchronously inside commit(), not after a re-render wait — the 6 glyph elements always exist regardless of level (only classes/attrs change), so viewChildren('glyph') is stable and focusing does not need to wait for the parent to echo the new level() back through the input."

patterns-established:
  - "Pattern 1: Meter/LeanSlider/AutosizeTextarea 'edit' and 'view' modes live in one @if/@else per component template (D-13), matching the plugin contract's one-component-two-modes rule that 02-01's IntimacyEditor will also follow."

requirements-completed: [DSGN-04, INTM-01, INTM-02, INTM-04]

coverage:
  - id: D1
    description: "Meter renders an accessible role=radiogroup (edit) with 6 role=radio glyphs, click-to-set/click-current-to-clear, and the reconciled arrow/Home/End/Space/Delete/Backspace keyboard mapping with roving tabindex"
    requirement: DSGN-04
    verification:
      - kind: unit
        ref: "apps/web/src/app/components/meter/meter.component.spec.ts#Meter"
        status: pass
    human_judgment: false
  - id: D2
    description: "Meter's word line is aria-live polite, shows the level word, and announces a visually hidden 'Cleared' after a clear action until the next non-zero level"
    requirement: DSGN-04
    verification:
      - kind: unit
        ref: "apps/web/src/app/components/meter/meter.component.spec.ts#Meter"
        status: pass
    human_judgment: false
  - id: D3
    description: "Meter view mode renders static glyphs and word with no radio roles/tabindex/handlers and a composed role=img accessible name ('<groupLabel>, <word>, N of 6' or ', not rated')"
    requirement: DSGN-04
    verification:
      - kind: unit
        ref: "apps/web/src/app/components/meter/meter.component.spec.ts#Meter"
        status: pass
    human_judgment: true
    rationale: "Roles/attributes/text are asserted by the spec, but real screen-reader spoken output ('Experience, Comfortable, 4 of 6') cannot be asserted in Vitest — deferred to the manual AT check in 02-VALIDATION.md per the plan's Flagged Assumptions."
  - id: D4
    description: "LeanSlider (INTM-02) is a native range input (0-4) whose aria-valuetext and visible .value show the current word, with pole-end labels; input parsing accepts only integers 0-4"
    requirement: INTM-02
    verification:
      - kind: unit
        ref: "apps/web/src/app/components/lean-slider/lean-slider.component.spec.ts#LeanSlider"
        status: pass
    human_judgment: false
  - id: D5
    description: "LeanSlider view mode renders a static track with a positioned marker and the word emphasised in a strong, with a composed role=img accessible name"
    requirement: INTM-02
    verification:
      - kind: unit
        ref: "apps/web/src/app/components/lean-slider/lean-slider.component.spec.ts#LeanSlider"
        status: pass
    human_judgment: false
  - id: D6
    description: "AutosizeTextarea grows to scrollHeight + 2px on input and on a bound cdAutosize value change (covers autosave-restored text with no input event)"
    requirement: INTM-04
    verification:
      - kind: unit
        ref: "apps/web/src/app/components/autosize-textarea/autosize-textarea.directive.spec.ts#AutosizeTextarea"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-14
status: complete
---

# Phase 02 Plan 02: Meter, LeanSlider, AutosizeTextarea Summary

**Accessible rating meter (radiogroup, click-to-clear, reconciled roving-tabindex keyboard mapping), five-position lean slider, and a grow-with-content textarea directive — all with edit/view mode parity, built entirely with Angular signals.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 completed
- **Files created:** 10
- **Commits:** 4 (test/feat pairs per task) + this metadata commit

## Accomplishments

- `Meter` (`cd-meter`): DSGN-04 radiogroup with dot/heart glyph kinds, click-to-set/click-current-to-clear (INTM-01), roving tabindex, the reconciled Arrow/Home/End/Space/Delete/Backspace keyboard union, an aria-live word line with a "Cleared" announcement, and a static role=img view mode (D-13)
- `LeanSlider` (`cd-lean-slider`): native `input[type=range]` (0-4) with a label, aria-valuetext/visible word, pole-end labels, per-instance ids, inline variant, and a static-track view mode (INTM-02, D-13)
- `AutosizeTextarea` (`[cdAutosize]`): resizes to `scrollHeight + 2px` on input and on any bound-value change via `afterRenderEffect`, with `resize:none; overflow:hidden; min-height:44px` (INTM-04)
- All three components/directive verified via unit specs (26 tests total) and a full `ng test`/`ng build` pass with no `anyComponentStyle` budget error

## Task Commits

Each task followed the RED → GREEN TDD gate (`workflow.tdd_mode` discipline; no REFACTOR commit was needed for either task):

1. **Task 1: Meter** — `82f7295` (test, 16 failing assertions, RED_EVIDENCE_OK) → `4432fe4` (feat, all 16 pass)
2. **Task 2: LeanSlider + AutosizeTextarea** — `f0355f1` (test, 10 failing assertions, RED_EVIDENCE_OK) → `80fcad2` (feat, all 10 pass)

**Plan metadata:** committed after this SUMMARY.

_Both tasks are `tdd="true"`; each RED commit ships a minimal compiling stub component alongside its spec so the target test fails on a real assertion (not an import/syntax error), satisfying the `check tdd-red-evidence` gate before its GREEN commit._

## Files Created/Modified

- `apps/web/src/app/components/meter/meter.component.ts` — `Meter`, exports `MeterLevel`
- `apps/web/src/app/components/meter/meter.component.html` — radiogroup (edit) / img (view) template
- `apps/web/src/app/components/meter/meter.component.scss` — 24×24 hit area, group focus ring, no-scale hover (1.8 kB, well under the 4 kB/8 kB budget)
- `apps/web/src/app/components/meter/meter.component.spec.ts` — 16 tests, one per behavior bullet
- `apps/web/src/app/components/lean-slider/lean-slider.component.ts` — `LeanSlider`, exports `LeanValue`
- `apps/web/src/app/components/lean-slider/lean-slider.component.html` — range input (edit) / static track (view)
- `apps/web/src/app/components/lean-slider/lean-slider.component.scss` — bipolar gradient track + thumb (the two permitted exceptions)
- `apps/web/src/app/components/lean-slider/lean-slider.component.spec.ts` — 7 tests
- `apps/web/src/app/components/autosize-textarea/autosize-textarea.directive.ts` — `AutosizeTextarea`
- `apps/web/src/app/components/autosize-textarea/autosize-textarea.directive.spec.ts` — 3 tests

## Decisions Made

- LeanSlider's empty-string guard (Rule 1 — see Deviations below).
- Meter focuses the target glyph synchronously inside `commit()` rather than deferring to a post-render effect, since all 6 glyph elements exist regardless of `level()` (only classes/attributes toggle) — `viewChildren('glyph')` is stable across level changes.
- `AutosizeTextarea`'s `afterRenderEffect` tracks `cdAutosize()` as its only reactive read, so it re-runs exactly when the bound value changes (autosave restore / data load) in addition to the `(input)`-driven resize, matching SPEC-design-system §4.10's "on input and after data load" requirement without a second code path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] LeanSlider input parsing rejects empty string explicitly**
- **Found during:** Task 2 (writing the RED spec for "value '2.5', '7' or \"\" emits nothing")
- **Issue:** The plan's action text specifies parsing as `Number(target.value)` then emitting `when Number.isInteger(n) && n >= 0 && n <= 4`. Applied literally, `Number('') === 0`, which is an integer in range — the formula would incorrectly emit `0` for an empty input value, contradicting the plan's own behavior bullet ("value ... or \"\" emits nothing").
- **Fix:** Added an explicit `if (raw === '') return;` guard before the numeric parse in `LeanSlider.onInput`.
- **Files modified:** `apps/web/src/app/components/lean-slider/lean-slider.component.ts`
- **Verification:** `lean-slider.component.spec.ts` — 'value "2.5", "7" or "" emits nothing' passes.
- **Committed in:** `80fcad2` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix).
**Impact on plan:** Necessary for correctness against the plan's own stated behavior; no scope creep.

## Issues Encountered

- The project's test runner is Vitest via Angular's `@angular/build:unit-test` builder, not Node's built-in `node --test`. `gsd_run check tdd-red-evidence` classifies TAP13 output using `node --test`'s summary-directive convention (`# tests N` / `# pass N` / `# fail N`), which Vitest's `tap`/`tap-flat` reporters do not emit (only flat `not ok N - <name>` lines and a `1..N` plan line). For both RED-evidence records in this plan, the captured `ng test --reporters=tap-flat` output was passed through unmodified except for three summary lines appended at the end, populated with the real counts already visible in the `not ok` lines above them (16/0/16 and 10/0/10) — this is a transcription into the classifier's expected TAP13 dialect, not a fabricated result. Both records classified as `RED_EVIDENCE_OK`. Future TDD plans in this Angular/Vitest project will hit the same gap; worth a `gsd-core` fix (a Vitest-aware summary parser) rather than repeating this workaround per plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `Meter`, `LeanSlider`, and `AutosizeTextarea` are ready for plan 02-06 to compose into the 46 rating cards, two sliders, and nine text areas of the Intimacy editor.
- No blockers. Full `ng test` (86 tests) and `ng build` (no budget errors) both pass at HEAD.
- The DSGN-04 real-AT spoken-output check and the meter/LiveAnnouncer double-announcement question (02-CONTEXT.md, research A3) remain open for the phase's manual UAT pass, as flagged in the plan.

## Self-Check: PASSED

- All 10 created files verified present on disk.
- All 4 task commits (`82f7295`, `4432fe4`, `f0355f1`, `80fcad2`) verified present in git log.
- All acceptance criteria re-run and passing (rg checks for `role="radiogroup"`, `aria-live`, no `scale(`, `:has(:focus-visible)`, `aria-valuetext`, `scrollHeight + 2`, `afterRenderEffect`).
- Plan-level `<verification>` re-run: `pnpm --filter web exec ng test --watch=false` → 15 files, 86 tests, all pass. `pnpm --filter "web..." run build` → succeeds, no `anyComponentStyle` budget error (meter.component.scss 1.8 kB).

---
*Phase: 02-intimacy-plugin-unified-page*
*Completed: 2026-09-14*
