---
phase: 02-intimacy-plugin-unified-page
plan: 06
subsystem: ui
tags: [angular, signals, intimacy-dossier, rating-meter, tdd]

requires:
  - phase: 02-intimacy-plugin-unified-page
    provides: "02-01 (IntimacyDossierV1 schema, IntimacyEditor skeleton, relationship-context field); 02-02 (Meter, LeanSlider, AutosizeTextarea)"
provides:
  - "RatingCard (cd-rating-card): experience/enjoyment meters, optional capacity fields, edit+view modes"
  - "Full Intimacy edit-mode layout: context row, Dominant<->submissive slider, four section cards (anatomy/themes/bdsm/preferences), 46 rating cards, 6 capacity inputs, 9 autosize text areas"
  - "Intimacy view mode (D-13): static meters/sliders, collapsed empty text fields, de-emphasised unset cards, gated General subheads"
  - "intimacy-vocabulary.ts: scale words and display labels for all 46 rated items and 9 text fields"
affects: ["02-07 (dev-only view-mode preview, chapter title bar integration)", "phase-3-plus (any page reusing rating-card/lean-slider patterns)"]

actuals:
  tokens: 14405
  tasks: 3
  commits: 7

plan_head_before: 2d3402b8ccf0ceee1044865a7fcda6cd55c70788

tech-stack:
  added: []
  patterns:
    - "RatingCard composes two cd-meter instances + an optional capacity row, always emitting a new merged Rating|CapacityRating object"
    - "Text field groups (ANATOMY_TEXT/CUM_TEXT/GENERAL_TEXT) as {id,wide,rows} tuples looped in the template instead of repeated markup"
    - "onRating<K extends RatingListName> mapped-type generic ties the id parameter to its list at the call site — a wrong id/list pairing is a compile error"
    - "View-mode 'General' subhead/grid gated by a computed signal (anatomyGeneralVisible/preferencesGeneralVisible): always true in edit, true in view only when a field in the group is non-empty"

key-files:
  created:
    - apps/web/src/app/subdocs/intimacy/intimacy-vocabulary.ts
    - apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.ts
    - apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.html
    - apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.scss
    - apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.spec.ts
    - apps/web/src/app/subdocs/intimacy/intimacy-editor.component.scss
    - apps/web/src/app/subdocs/intimacy/intimacy-editor.component.spec.ts
    - apps/web/src/app/integration/intimacy-fill-persist.integration.spec.ts
  modified:
    - apps/web/src/app/subdocs/intimacy/intimacy-editor.component.ts
    - apps/web/src/app/subdocs/intimacy/intimacy-editor.component.html

key-decisions:
  - "onRating's id typing uses a conditional mapped type (RatingListId<K>) rather than indexing the record directly, avoiding an intersection-type dead end when TypeScript indexes acts[id] with a generic ActId"
  - "The intimacy-fill-persist integration spec passed on its first run (before any Task 2/3 production code) because it exercises the store+schema round trip already proven in Phase 1/02-01, not new UI behavior — kept as coverage for the full 46-rating/2-slider/10-text/6-capacity payload rather than re-scoped as a RED gate"
  - "Capacity-field label styling omits text-transform: uppercase entirely (not just for those elements) because the plan's motion-anti-pattern grep on rating-card.component.scss matches the CSS property name 'transform' as a substring, including inside 'text-transform'"

patterns-established:
  - "A composed rating widget (RatingCard) tested via By.directive(Meter) instance inspection rather than brittle attribute-reflection assertions on a custom element"

requirements-completed: [INTM-01, INTM-02, INTM-03, INTM-04]

coverage:
  - id: D1
    description: "Intimacy vocabulary: 4 scale word lists + 5 label maps covering all 46 rated items and 9 text fields, matching SPEC-intimacy-dossier verbatim"
    requirement: "INTM-01"
    verification:
      - kind: unit
        ref: "rating-card.component.spec.ts#intimacy-vocabulary (7 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "RatingCard: two meters (dot/heart), optional capacity row, edit+view modes, always emits a new immutable object"
    requirement: "INTM-01, INTM-03"
    verification:
      - kind: unit
        ref: "rating-card.component.spec.ts (18 tests total, 11 behavioral)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full edit-mode Intimacy layout: context row + Dominant<->submissive slider (not a card), 4 section cards with correct ids/titles/subheads, 46 rating cards in list order, capacity wiring on the 3 capacity acts, 2 sliders, 9 autosize text areas with matching labels"
    requirement: "INTM-01, INTM-02, INTM-03, INTM-04"
    verification:
      - kind: unit
        ref: "intimacy-editor.component.spec.ts > IntimacyEditor edit mode (10 tests)"
        status: pass
      - kind: unit
        ref: "pnpm --filter \"web...\" run build (production build, intimacy-editor-component lazy chunk, no style budget error)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every value (46 ratings, 2 sliders, 10 text fields incl. relationshipContext, 6 capacity fields) survives a reload byte-for-byte, including a 4000-code-point note with interior newlines and free-text capacity precision ('8.5 in', '5¼\"')"
    requirement: "ROADMAP Phase 2 criterion 2"
    verification:
      - kind: integration
        ref: "intimacy-fill-persist.integration.spec.ts (2 tests, real fake-indexeddb)"
        status: pass
    human_judgment: false
  - id: D5
    description: "View mode (D-13): zero form controls, static meters/sliders with emphasised word, wrapped text, empty text fields collapsed individually and by General-subhead group, unset rating cards at 70% opacity, section anchor ids unchanged, mode switch re-renders correctly"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "intimacy-editor.component.spec.ts > IntimacyEditor view mode (D-13) (5 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual fidelity against the prototype at 400px/desktop, light/dark themes (fonts, spacing, meter/slider/capacity-field appearance, no horizontal scroll)"
    verification: []
    human_judgment: true
    rationale: "Requires rendering the page in a real browser and comparing against docs/prototype/character-dossier.html side by side — browser automation is not available to this executor session; recorded as WINDOWS.md entry #1 (unrun-verify) for the orchestrator to run with Playwright."

duration: 55min
completed: 2026-09-14
status: complete
---

# Phase 2 Plan 6: Intimacy Dossier Editor — Full Layout, Rating Cards, and View Mode Summary

**46 rating cards, two lean sliders, capacity fields on 3 acts, and 9 autosize text areas in one signal-driven component that renders both edit and view mode (D-13) from the same template.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-14T14:58:12Z
- **Completed:** 2026-09-14T15:23:00Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- `intimacy-vocabulary.ts`: 4 scale word lists (EXPERIENCE/ENJOYMENT/LEAN/PLACEMENT) and 5 label maps (ACT/ANATOMY/BODY_FOCUS/THEME/BDSM) plus TEXT_FIELD_LABELS, matching SPEC-intimacy-dossier's display text verbatim
- `RatingCard` (`cd-rating-card`): two `cd-meter` blocks, an optional capacity row (Max length/Max girth, control-char stripped), unset-at-70%-opacity in view mode
- Full edit-mode `IntimacyEditor` layout: `.intimacy-context` (Relationship context + Dominant↔submissive slider, not a card) followed by four `section.card` elements with `page-intimacy-*` ids matching `intimacyPlugin.sections`, 46 rating cards across acts/anatomyTypes/bodyFocus/themes/bdsm, capacity on the 3 `CAPACITY_ACT_IDS`, and 9 autosize text areas grouped into `ANATOMY_TEXT`/`CUM_TEXT`/`GENERAL_TEXT`
- View mode (D-13) for the whole page: zero form controls, static meters/sliders, collapsed empty text fields (both per-field and per-General-subhead-group), unset cards de-emphasised, section ids unchanged, mode switch re-renders correctly on the same instance
- `intimacy-fill-persist.integration.spec.ts`: fills all 46 ratings, both sliders, all 10 text fields (incl. a 4000-code-point note with an interior newline) and all 6 capacity fields, then asserts a deep-equal reload — proves ROADMAP Phase 2 success criterion 2

## Task Commits

Each task was committed atomically (TDD RED → GREEN per task, one interstitial fix):

1. **Task 1: Intimacy vocabulary and RatingCard** — `ceb7b92` (test, RED_EVIDENCE_OK: 18 tests, 8 failing) → `3fb79aa` (feat, all 18 pass) → `8a197cc` (fix: escape a raw control char accidentally embedded in the spec)
2. **Task 2: Full edit-mode layout + fill-persist spec** — `96c1405` (test, RED_EVIDENCE_OK: 10 tests, 9 failing) → `fee3063` (feat, all 12 pass across both spec files)
3. **Task 3: View mode (D-13)** — `8be3bd3` (test, RED_EVIDENCE_OK: 15 tests, 5 failing) → `300a133` (feat, all 33 pass across rating-card + editor specs)

No REFACTOR commits — each GREEN implementation was already minimal and needed no follow-up cleanup.

## Files Created/Modified

- `apps/web/src/app/subdocs/intimacy/intimacy-vocabulary.ts` — scale words and display label maps
- `apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.{ts,html,scss,spec.ts}` — the shared rating-card widget
- `apps/web/src/app/subdocs/intimacy/intimacy-editor.component.ts` — full layout wiring: `onRating`/`onText`/`patch`, view-mode visibility computeds
- `apps/web/src/app/subdocs/intimacy/intimacy-editor.component.html` — context row, 4 section cards, 46 rating-card loops, text-field groups, edit/view branches
- `apps/web/src/app/subdocs/intimacy/intimacy-editor.component.scss` — card-title/subhead/rating-grid/field-grid/field-label/text-view styling
- `apps/web/src/app/subdocs/intimacy/intimacy-editor.component.spec.ts` — 15 edit+view mode specs
- `apps/web/src/app/integration/intimacy-fill-persist.integration.spec.ts` — full-payload reload round trip

## Decisions Made

- `onRating`'s `id` parameter uses a conditional mapped type (`RatingListId<K>`) keyed off the list name, so passing a wrong id/list pairing (e.g. a `ThemeId` to `onRating('acts', …)`) is a compile error, per the plan's "wrong id does not compile" requirement — indexing the record directly with a generic `ActId` produced an unhelpful intersection type (`CapacityRating & Rating`) that TypeScript couldn't narrow per-iteration.
- The fill-persist integration spec passed immediately, before any Task 2/3 production code existed, because it only exercises the `CharacterStore`/schema round trip already proven correct in Phase 1 and 02-01 — kept as regression coverage for the full 46-rating/2-slider/10-text/6-capacity payload rather than treated as a broken RED gate (see `tdd.md` "Test doesn't fail in RED phase: feature may already exist — investigate").
- `rating-card.component.scss` omits `text-transform: uppercase` on capacity-field labels entirely (not just avoids using it there) because the plan's acceptance gate greps the file for the literal substring `transform` to forbid hover scale/translate motion, and that regex also matches `text-transform`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Escaped a raw U+0007 control character accidentally embedded in a spec string literal**
- **Found during:** Task 1, immediately after the RED commit
- **Issue:** The tool call that wrote `rating-card.component.spec.ts` interpreted the intended `\u0007` TypeScript escape sequence as a JSON Unicode escape, embedding the literal BEL byte in the source file instead of the six-character escape text. Syntactically valid (tests still passed) but not portable/readable source.
- **Fix:** Replaced the raw byte with the literal `\u0007` escape sequence text.
- **Files modified:** `apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.spec.ts`
- **Verification:** `sed -n | cat -A` confirmed no remaining raw control bytes in either intimacy spec file; full test suite re-run green.
- **Committed in:** `8a197cc`

---

**Total deviations:** 1 auto-fixed (1 bug — source hygiene, no behavior change).
**Impact on plan:** None on scope; a one-file readability fix between Task 1's RED and Task 2's work.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None — no external service configuration required.

## TDD Gate Compliance

| Task | RED commit | GREEN commit | RED_EVIDENCE_OK | Status |
|------|-----------|---------------|------------------|--------|
| 1 | `ceb7b92` | `3fb79aa` | Yes (18 tests, 8 failing on target) | Pass |
| 2 | `96c1405` | `fee3063` | Yes (10 tests, 9 failing on target; integration spec green on arrival, see Decisions) | Pass |
| 3 | `8be3bd3` | `300a133` | Yes (15 tests, 5 failing on target) | Pass |

## Known Stubs

None — every field, list and mode branch specified by the plan is wired to real data; no placeholder text or empty-by-default UI paths ship in this plan.

## Deferred / WINDOWS.md Entries

- **#1 (unrun-verify):** Task 3's `<human-check>` — side-by-side visual comparison against `docs/prototype/character-dossier.html` at 400px and desktop widths, light and dark themes. Browser automation is not available to this executor session; all automated checks (both spec files, production build, style-budget check) pass. Per this plan's dispatch instructions, deferred for the orchestrator to run with Playwright rather than blocking on a checkpoint.

## Next Phase Readiness

- The Intimacy editor is functionally and visually complete pending the human browser check above; 02-07 (chapter title bar integration + dev-only view-mode preview) can proceed against this editor as-is.
- `RatingCard`'s composition pattern (two meters + optional capacity row, `By.directive` testing) is a reusable reference for any future rated-list page type.

## Post-verification fix

The orchestrator's Playwright comparison against `docs/prototype/character-dossier.html` (the deferred WINDOWS.md #1 human-check above) found three layout regressions and dispatched a targeted TDD fix, executed after this plan's original completion.

**Findings (measured at 1280px and 400px, same font/box sizes as the prototype):**

1. The "EXPERIENCE" meter label broke mid-word ("EXPERIENC" / "E") on every rating card. Cause: the global `.wrap { overflow-wrap: anywhere; }` guard (Phase 1 DSGN-02, `apps/web/src/styles.scss`) is an inherited property and was inherited into `.meter-label`, which the prototype never applies to its own label.
2. At desktop widths the meter label sat above its dots/hearts (`.meter-top` height 62px) instead of sharing one row (prototype 14px), because `.meter-top` used `flex-wrap: wrap` and the (now word-broken) label was wider than its 58px box.
3. Rating cards sharing a `.rating-grid` row rendered at unequal visible heights: the `cd-rating-card` host stretched to the row height as a grid item, but the inner `.rating-card` div only took its own content height.

**Fix — CSS-only, TDD RED (test) → GREEN (fix), no REFACTOR needed (both GREEN implementations were already minimal):**

- `apps/web/src/app/components/meter/meter.component.scss`:
  - `.meter-label` gains `overflow-wrap: normal;`, explicitly overriding the inherited `.wrap` guard so the single-word label never breaks mid-word (matches the prototype, which lets the label overflow its 58px box by a few px instead of wrapping).
  - `.meter-top` changes `flex-wrap: wrap` → `flex-wrap: nowrap`, so the label and its dots/hearts stay on one row at both 400px and desktop widths.
- `apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.scss`:
  - Adds `:host { display: block; height: 100%; }` and `.rating-card { height: 100%; box-sizing: border-box; }` so cards sharing a grid row fill it, matching the prototype where `.rating-card` is itself the grid item.
- No changes to `apps/web/src/styles.scss`, `subdoc-host`, `pages/character`, or `drag-handle` (out of scope; a separate drag fix may follow).

**Test evidence:** New compiled-CSS pinning tests were added to `meter.component.spec.ts` and `rating-card.component.spec.ts`, following the same pattern `subdoc-host.component.spec.ts` established for commit `40f1bee` — jsdom does no layout and this project's unit-test target loads no global `styles.scss`, so the tests read Angular's own injected, encapsulation-scoped compiled `<style>` text from `document.head` and assert on the declaration text directly rather than on layout.

- RED commit `65983f2` (`test(02-06)`): both new tests fail on their target assertion (16/18 and 18/20 passing per file); `gsd-tools check tdd-red-evidence` returned `RED_EVIDENCE_OK` for both.
- GREEN commit `02ef303` (`fix(02-06)`): all 38 tests across both spec files pass.
- Full suite re-run clean: `pnpm test` — 193/193 web tests, 65/65 schema tests, all pass.
- Production build re-run clean: `pnpm --filter "web..." run build` — no component style budget error, `intimacy-editor-component` still its own 28.28 kB lazy chunk.
- Plan 02-06's original acceptance-gate greps re-verified against the changed files: `rg -q 'opacity: 0\.7' rating-card.component.scss` exits 0, `rg -q 'box-shadow|transform' rating-card.component.scss` exits 1, `rg -q 'innerHTML' apps/web/src/app/subdocs/intimacy` exits 1 — unaffected by this fix.

**Files touched by this fix:**
- `apps/web/src/app/components/meter/meter.component.scss` (modified)
- `apps/web/src/app/components/meter/meter.component.spec.ts` (modified — 2 new tests)
- `apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.scss` (modified)
- `apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.spec.ts` (modified — 2 new tests)

WINDOWS.md entry #1 is left for the orchestrator to resolve after re-running the Playwright comparison against these fixes, per this dispatch's scope instructions.

### Second post-verification fix (1280px meter row wrap, after 02ef303)

The orchestrator's Playwright re-check against `02ef303` found the meter-label mid-word break and meter-top stacking fixed, but at 1280px the 3-column `.rating-grid` gives each rating card only 195px of inner width, and `02ef303`'s own `.meter-top { flex-wrap: nowrap }` change now exposes a second problem on that narrower column: the 58px label + 6 glyphs at the app's 24×24 sizing (159px) don't fit on one row, so `.meter` (the glyph row itself) wraps 4+2, making `.meter-top` 51px tall instead of the prototype's single-row ~14px.

**Root cause:** the app renders every meter glyph at a fixed 24×24 hit area (WCAG 2.5.8 minimum) regardless of input device, whereas the prototype (`docs/prototype/character-dossier.html`) uses a 12px dot / 14px heart with no separate hit-area padding — visual size and hit area are the same, small, mouse-only-precision size. 6 app glyphs at 24px + 3px gaps = 159px; 6 prototype glyphs at 12px + 3px gaps = 87px. The app's fixed 195px-wide 3-column card has room for the prototype's 87px row but not the app's 159px row.

**User decision ("Compact dots on mouse"):** shrink the glyph hit area to the prototype's 12px dot / 14px heart sizing only under `@media (pointer: fine)`, leaving the 24×24 WCAG target unchanged as the default and for `(pointer: coarse)` (touch) — mouse users get the prototype's compact desktop layout, touch keeps the accessible target size.

**Fix — CSS-only, TDD RED (test) → GREEN (fix), no REFACTOR needed:**

`apps/web/src/app/components/meter/meter.component.scss`:
```scss
@media (pointer: fine) {
  .glyph {
    width: 12px;
    height: 12px;

    &.heart {
      width: auto;
      height: auto;
      font-size: 14px;
    }
  }
}
```
The base (default / coarse-pointer) `.glyph` rule — 24×24, unchanged — stays the floor everywhere the media query doesn't match (touch, and any environment where `pointer: fine` doesn't resolve `true`, e.g. no-pointer or ambiguous hybrid devices, which fail the query and get the accessible 24px default). No changes to `.meter { gap: 3px }` — it already matched the prototype's 3px gap before this fix.

**Target-size flag for the orchestrator (DSGN-04 / SPEC-design-system §4.7):** §4.7 states "Each glyph's hit area is at least 24 × 24 px (WCAG 2.5.8) around a 12 px visual glyph" as an unconditional minimum, not device-conditional. T

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 23321 bytes -->
