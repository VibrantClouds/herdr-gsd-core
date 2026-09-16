---
phase: 3
slug: race-condition-lifecycle-fixes
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-30
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Karma 6.4.0 + Jasmine 5.6.0 |
| **Config file** | none standalone — configured inline via `angular.json` `test` builder (`@angular-devkit/build-angular:karma`) |
| **Quick run command** | `pnpm ng test --no-watch --include='**/<touched-spec>.spec.ts'` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30–60 seconds (full suite) |

**Environment prerequisite:** Karma requires a real Chrome/Chromium binary. Research found no
`google-chrome`/`chromium` binary and unset `CHROME_BIN` in its sandbox. Before execution, either
install `google-chrome-stable`/`chromium`, set `CHROME_BIN`, or configure
`ChromeHeadlessNoSandbox`. If the gate cannot run, flag it — do not silently skip.

---

## Sampling Rate

- **After every task commit:** Run the targeted spec glob for the file(s) touched
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-04 Task 1/2 | 03-04 | 1 | RACE-01 | — | N/A | unit | `CHROME_BIN=<path> pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='**/penetration-modal.component.spec.ts'` | ✅ (expanded 1→7 tests) | ✅ green |
| 03-05 Task 1/2 | 03-05 | 1 | RACE-02 | — | N/A | unit | `CHROME_BIN=<path> pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='**/compare-modal.component.spec.ts'` | ✅ (Default Positions + Image Dimensions with Buffer describe blocks) | ✅ green (9 pre-existing, deferred template-selector-drift failures unrelated to RACE-02 — see 03-GATE.md) |
| 03-07 Task 1/2 | 03-07 | 2 | RACE-02 | — | N/A | unit | `CHROME_BIN=<path> pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='**/model-attachment-defaults.service.spec.ts'` | ✅ (applyDefaults describe block) | ✅ green |
| 03-02 Task 1/2 | 03-02 | 1 | RACE-03 | — | N/A | unit/regression | `CHROME_BIN=<path> pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='**/measurement-ruler*.spec.ts'` | ✅ (both files rewritten, destroy-mid-drag regression added) | ✅ green |
| 03-03 Task 1/2 | 03-03 | 1 | RACE-03 | — | N/A | unit/regression | `CHROME_BIN=<path> pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='**/angle-dial.component.spec.ts'` | ✅ (rewritten, destroy-mid-drag regression added) | ✅ green |
| 03-01 Task 2 / 03-06 Task 1-3 | 03-01, 03-06 | 1, 2 | RACE-04 | — | N/A | unit | `CHROME_BIN=<path> pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='**/image-metadata.service.spec.ts'` | ✅ (created by 03-06, mixed-case test present) | ✅ green |
| 03-08 Task 1 | 03-08 | 3 | RACE-01..04 (gate) | T-03-16, T-03-17 | Full-suite regression diff is a mechanical `comm -23` against a committed baseline | unit (full suite) | `CHROME_BIN=<path> pnpm test --no-watch` | ✅ (03-BASELINE.md, 03-GATE.md) | ✅ green (448/419/29, comm -23 empty) |

*Status legend: pending (not yet run) · ✅ green · ❌ red · ⚠️ flaky. All rows above are ✅ green — no row remains in the pending state.*

---

## Wave 0 Requirements

- [x] `src/app/services/image-metadata.service.spec.ts` — created by plan 03-06 (did not exist before); covers mixed-case category input (RACE-04, Success Criterion 4) and read-time normalization of persisted user-model categories. 4/4 green.
- [x] `src/app/services/measurement-ruler.service.spec.ts` — rewritten by plan 03-02, co-committed with the implementation change (not landed ahead of it). The old specs asserted the exact document-listener add/remove lifecycle (`startDrag`/`stopDragDefensively`) that D-03/D-04 delete outright, so a "tests first, then implementation" ordering would have left the suite red between commits with no way to write a passing pre-change spec for behavior about to be deleted. 10/10 green.
- [x] `src/app/components/.../measurement-ruler.component.spec.ts` — rewritten by plan 03-02, co-committed with the implementation for the same reason as above: it now drives drags through the real rendered `.ruler-start`/`.ruler-end` SVG handle elements (not the stubbed `createImageEl()` object) as the pointer-capture target, and includes the destroy-mid-drag regression test. 11/11 green.
- [x] `src/app/components/.../angle-dial.component.spec.ts` — rewritten by plan 03-03, co-committed with the implementation for the same document-listener-deletion reason. Drives real `PointerEvent`s on the rendered element, includes the destroy-mid-drag regression test. 10/10 green.
- [x] `src/app/components/penetration-modal/penetration-modal.component.spec.ts` — expanded by plan 03-04 from the single `'should create'` test to 7 tests covering the live state subscription, removed dual `@Input`s, and `fixture.componentRef.setInput()` for the signal `isOpen` input. 7/7 green.
- [x] `compare-modal.component.spec.ts` — plan 03-05 added the `Default Positions — layout-driven` describe block (4 specs) covering the mark-pending case (recalculation requested before canvas dimensions are known, deferred and resolved once dimensions arrive) and the synchronous-when-already-known case.
- [x] Framework install: none needed — Karma/Jasmine already configured. Chrome-binary availability confirmed present at both `chromium-1223` and `chromium-1208` for the full phase, including this gate.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Result |
|----------|-------------|------------|-------------------|--------|
| Ruler/dial drag feels correct on a touch device (no scroll hijack, capture follows finger off-element) | RACE-03 | PointerCapture behavior under real touch input is not faithfully reproduced by synthetic `PointerEvent`s in Karma | On a phone or Chrome device-emulation: open upload-modal, drag the ruler past the element edge, confirm the value keeps tracking; close the modal mid-drag, then drag elsewhere and confirm nothing responds | ✅ Confirmed — approved via 03-08 Task 3 checkpoint (tracks A/B, steps 1-5) |
| Compare-modal images are not clipped at small scales after the layout-driven position change | RACE-02 | Visual clipping is a rendered-pixel property; the automated specs assert the 40px `POSITION_BUFFER` math, not the rendered result | Open compare modal with two models at minimum scale; confirm neither image is cut off at the container edge | ✅ Confirmed — approved via 03-08 Task 3 checkpoint (track C, steps 6-8) |

Both rows confirmed by human verdict "approved" (all ten numbered steps across tracks A-D,
no defects reported). Verified via Chrome DevTools device emulation (touch input enabled)
against the dev server on the main checkout at `http://localhost:4200`; see `03-GATE.md`'s
"Task 3 — Human Verification" section for the full record, including tracks B and D which
this table does not separately enumerate but which Task 3's checkpoint also covered.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] Chrome/Chromium available to Karma in the execution environment (`chromium-1223`, confirmed present and used for every gate command in this document and in `03-GATE.md`)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-07-30 (phase gate `03-08`, all three tasks complete — automated tasks 1-2 plus Task 3's human-verification checkpoint, approved with all ten steps across tracks A-D confirmed; see `03-08-SUMMARY.md` and `03-GATE.md`)
