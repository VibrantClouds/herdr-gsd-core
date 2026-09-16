---
phase: 5
slug: test-coverage-hardening
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-01
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `05-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Karma 6.4.0 + Jasmine 5.6.0, driven by `@angular-devkit/build-angular:karma` |
| **Config file** | None standalone — configured under `angular.json` → `projects.size-comparison-tool.architect.test` |
| **Quick run command** | `CHROME_BIN=/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='<glob for file under work>'` |
| **Full suite command** | `CHROME_BIN=/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome pnpm exec ng test --no-watch --browsers=ChromeHeadless` |
| **Estimated runtime** | ~60–90 seconds (full suite, 533 specs) |

**Baseline at phase start (independently reproduced during research):** 533 specs / 504 passing / **29 failing**. The 29 failures are pre-existing, not introduced by this phase. Wave 0 triage classifies them; `D-16` requires the full suite to reach 0 failures before the phase gate.

**Environment note:** installed `@angular/core` is `19.2.18` while `package.json` declares `^20.3.17`. Do **not** run `pnpm install` mid-phase — it would shift the baseline this strategy is calibrated against.

---

## Sampling Rate

- **After every task commit:** targeted `--include` run against the spec file(s) touched (the Angular CLI karma builder supports `--include` glob filtering).
- **After every plan wave:** full suite command above.
- **Before `/gsd-verify-work`:** full suite must be green — 0 failures, per D-16 read literally.
- **Max feedback latency:** ~90 seconds (full suite); ~15 seconds (targeted `--include` run).
- **No watch-mode flags** — every command carries `--no-watch --browsers=ChromeHeadless`.

---

## Per-Task Verification Map

Task IDs are assigned by `gsd-planner`; the rows below are the requirement-level contract each plan's tasks must satisfy. The executor fills `Task ID` / `Plan` / `Wave` as plans land and flips `Status` as runs go green.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-T1/T2 | 05-01 | 1 (W0) | D-05 (triage) | — | N/A | analysis | `… --no-watch --browsers=ChromeHeadless` (capture full failure list) | ✅ W0 — `05-TRIAGE.md` created | ✅ green |
| 05-03-T1/T2 | 05-03 | 1 (W0) | D-14 (scaling math) | — | N/A | unit (service) | `… --include='**/scaling.service.spec.ts'` | ✅ W0 — new file created | ✅ green |
| 05-02-T1 | 05-02 | 1 (W0) | D-07 (fixture reuse) | — | N/A | n/a (refactor) | full suite stays green | ✅ W0 — fixtures exported to `src/app/testing/state-export-fixtures.ts` | ✅ green |
| 05-04-T1..T3, 05-05-T1..T3 | 05-04, 05-05 | 1–2 | TEST-01 | — | N/A | unit (component) | `… --include='**/attachment-edit-modal.component.spec.ts'` | ✅ new file — 75 specs | ✅ green |
| 05-06-T1..T3, 05-07-T1/T2, 05-08-T1/T2, 05-09-T2, 05-12-T1..T3 | 05-06, 05-07, 05-08, 05-09, 05-12 | 2–3 | TEST-02 | — | N/A | unit (component) | `… --include='**/upload-modal.component.spec.ts,**/attachment-preview.component.spec.ts'` | ✅ both extended per coverage audit; `attachment-canvas-renderer.service.ts` gap promoted to REQUIREMENTS.md v2 (TESTV2-04) rather than closed here | ✅ green |
| 05-10-T1..T3 | 05-10 | 2 | TEST-03 | — | Share-link import must not apply state from a malformed/unsupported-version payload | integration (TestBed + RouterTestingHarness, stubbed `fetch`) | `… --include='**/share-link-import.integration.spec.ts'` | ✅ new file + new `src/app/integration/` dir — 7 specs | ✅ green |
| 05-11-T1/T2 | 05-11 | 2 | TEST-04 | — | N/A | integration (TestBed + IndexedDB) | `… --include='**/upload-attach-use.integration.spec.ts'` | ✅ new file — 8 specs | ✅ green |
| 05-09-T1 | 05-09 | 2 | D-04 (NG0100) | — | N/A | unit (existing specs, previously red) | part of full suite | ✅ specs pass, zero `NG0100`/`code:-100` occurrences anywhere in the suite | ✅ green |
| 05-13-T3 | 05-13 | 4 (final) | D-16 (phase gate) | — | N/A | full suite | full suite command above | ✅ | ✅ green — see `05-TRIAGE.md` `## Closing Snapshot` |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `.planning/phases/05-test-coverage-hardening/05-TRIAGE.md` — classification of all 29 pre-existing failures with stack traces (D-05). Not a test file, but every fix wave depends on it. (05-01)
- [x] `src/app/services/scaling.service.spec.ts` — no spec exists today; D-14 requires it to land before the positioning-cluster fixes. (05-03)
- [x] `src/app/components/attachment-edit-modal/attachment-edit-modal.component.spec.ts` — no spec exists today (TEST-01). (05-04, 05-05)
- [x] `src/app/integration/` — directory does not exist; both TEST-03 and TEST-04 depend on its creation. (05-02)
- [x] Fixture export/extraction from `state-export.service.spec.ts` — the Phase 2 fixtures are unexported `const`s nested inside `describe` blocks and cannot be imported by an integration spec as-is (D-07). Landing spot: `src/app/testing/state-export-fixtures.ts`. (05-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real share-link round-trip against the live API | TEST-03 | The integration spec stubs `fetch`; the deployed `generateShareLink` / `loadFromShareLink` endpoints are outside this repo (Cloudflare Workers) and must not be hit from unit tests | Generate a share link in the running app, open it in a clean profile, confirm both panels, overlays, scales, and adult-mode prefix restore |
| Mobile/small-screen rendering of the tested components | Cross-cutting (mobile-first constraint) | Karma asserts logic, not layout; viewport regressions are visual | Load the app at 375×667, exercise upload → attachment-point → attach, confirm no clipping or unreachable controls |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a Wave 0 dependency — confirmed across all 13 plans' PLAN.md `<verify>` blocks
- [x] Sampling continuity: no 3 consecutive tasks without an automated verify — every task in every plan carries an `<automated>` verify command
- [x] Wave 0 covers all MISSING references listed above — all five Wave 0 requirements checked off above (05-01, 05-02, 05-03, 05-04/05-05)
- [x] No watch-mode flags in any command — every command in this document and every plan carries `--no-watch --browsers=ChromeHeadless`
- [x] Feedback latency < 90s (full suite) / < 15s (targeted) — closing full-suite run completed in ~5s (693 specs), well under budget
- [x] Full suite at 0 failures (D-16) before `/gsd-verify-work` — confirmed by 05-13's Closing Snapshot: 693 specs, 693 passing, 0 failing, exit code 0 (see `05-TRIAGE.md` `## Closing Snapshot`)
- [x] `nyquist_compliant: true` set in frontmatter — set below by 05-13, now that every other item on this checklist genuinely holds

**Approval:** signed off by 05-13 (phase close-out) — full suite green at 0 failures, behavior-delta ledger complete, all tasks' verification map rows accounted for.
