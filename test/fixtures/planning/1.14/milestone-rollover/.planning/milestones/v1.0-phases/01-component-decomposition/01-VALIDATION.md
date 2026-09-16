---
phase: 01
slug: component-decomposition
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Karma 6.4.0 + Jasmine 5.6.0, via `@angular-devkit/build-angular:karma` |
| **Config file** | None standalone — configured in `angular.json` under `projects.size-comparison-tool.architect.test`; global setup in `src/test-setup.ts` (mocks `window.confirm`/`alert`/`ResizeObserver`) |
| **Quick run command** | `pnpm exec ng test --include='**/<file>.spec.ts' --watch=false --browsers=ChromeHeadless` |
| **Full suite command** | `pnpm test --no-watch` |
| **Estimated runtime** | Not measured (research sandbox lacked Chrome/Chromium). Executor must confirm Chrome/Chromium is available and record actual full-suite runtime as the first Wave 0 step. |

---

## Sampling Rate

- **After every task commit:** Run the quick run command scoped to the spec file(s) touched by that task's extraction (`--include` glob per component/service).
- **After every plan wave:** Run `pnpm test --no-watch` (full suite).
- **Before `/gsd-verify-work`:** Full suite must be green, PLUS a manual walkthrough of all three `attachment-edit-modal` `editType` save paths (`server_custom_point`, `custom_attachment`, `custom_model`) — no automated substitute exists this phase per D-06/D-07.
- **Max feedback latency:** Not measured — keep quick-run scoped to a single spec file glob to keep feedback fast; do not run the full suite after every task commit.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD (assigned by planner) | TBD | TBD | DECOMP-01 | — | `upload-modal` splits into <400-line files; image processing / ruler / form handling separated; upload behavior unchanged | unit (existing) | `pnpm exec ng test --include='**/upload-modal.component.spec.ts' --watch=false --browsers=ChromeHeadless` | ✅ exists (481 lines) — baseline pass/fail must be established first (Open Question 1) | ⬜ pending |
| TBD (assigned by planner) | TBD | TBD | DECOMP-01 | — | New `MeasurementRulerService`/`AttachmentPointPickerComponent` extracted from upload-modal have their own tests | unit | New spec files, e.g. `pnpm exec ng test --include='**/measurement-ruler.service.spec.ts'` | ❌ Wave 0 — new files, no existing spec | ⬜ pending |
| TBD (assigned by planner) | TBD | TBD | DECOMP-02 | — | `attachment-edit-modal` splits into <400-line files; attachment-point definition extracted; edit behavior unchanged | manual verification (per D-06/D-07) | N/A — automated coverage explicitly deferred to Phase 5 (TEST-01); planner must define manual walkthrough steps for all 3 `editType` branches instead | ❌ intentionally no automated test this phase | ⬜ pending |
| TBD (assigned by planner) | TBD | TBD | DECOMP-03 | — | `attachment-preview` splits into <400-line files; Canvas rendering separated from selection state; preview behavior unchanged | unit (existing) | `pnpm exec ng test --include='**/attachment-preview.component.spec.ts' --watch=false --browsers=ChromeHeadless` | ✅ exists (416 lines) | ⬜ pending |
| TBD (assigned by planner) | TBD | TBD | DECOMP-01/02/03 (Success Criterion #5) | — | `pnpm test` green overall, no behavior change | full suite | `pnpm test --no-watch` | ✅ full suite exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Confirm Chrome/Chromium availability in the actual execution environment (`pnpm exec ng test --watch=false --browsers=ChromeHeadless --include='**/app.component.spec.ts'` as a smoke check) before assuming `pnpm test` runs cleanly.
- [ ] Establish baseline pass/fail for `upload-modal.component.spec.ts` and `attachment-preview.component.spec.ts` BEFORE any extraction (Open Question 1 from RESEARCH.md). Note: `upload-modal.component.spec.ts` mocks the deprecated `UserModelService`, not the actually-injected `IndexedDBUserModelService` — its "unique name" test's mock may have no real effect; confirm current pass/fail as the pre-existing baseline, do not fix in this phase.
- [ ] `attachment-edit-modal.component.ts` has no spec file today (confirmed — D-06). No new automated spec is added this phase; instead define an explicit manual-verification checklist (open the modal for each `editType`, define/edit a point, save, confirm persistence) as a phase-gate task.
- [ ] New spec files for each newly-extracted service/component (e.g. `measurement-ruler.service.spec.ts`, `attachment-point-picker.component.spec.ts`, `angle-dial.component.spec.ts`, and whatever the `attachment-preview` rendering extraction is named) — none exist yet, all new, stub or full coverage per planner's task breakdown.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `attachment-edit-modal` save flow for all 3 `editType` branches (`server_custom_point`, `custom_attachment`, `custom_model`) | DECOMP-02 | No spec file exists for this component (D-06); automated coverage explicitly deferred to Phase 5 (TEST-01) | Open the edit modal for each `editType`; define/edit an attachment point or rotation angle; save; confirm the change persists and the modal closes/emits correctly, matching pre-decomposition behavior |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency measured and recorded (currently unmeasured — see Test Infrastructure)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
