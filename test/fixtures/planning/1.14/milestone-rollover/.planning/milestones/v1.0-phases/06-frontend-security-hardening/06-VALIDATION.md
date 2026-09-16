---
phase: 6
slug: frontend-security-hardening
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-08
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Seeded by plan-phase without a RESEARCH.md** — research was skipped for this phase
> (06-CONTEXT.md locks every implementation decision, and D-00 rules out scope expansion).
> The Test Infrastructure block below is carried forward verbatim-in-substance from
> `05-VALIDATION.md`; D-15 forbids `pnpm install` this phase, so the toolchain baseline
> it was calibrated against is unchanged.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Karma 6.4.0 + Jasmine 5.6.0, driven by `@angular-devkit/build-angular:karma` |
| **Config file** | None standalone — configured under `angular.json` → `projects.size-comparison-tool.architect.test` |
| **Quick run command** | `CHROME_BIN=/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='<glob for file under work>'` |
| **Full suite command** | `CHROME_BIN=/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome pnpm exec ng test --no-watch --browsers=ChromeHeadless` |
| **Estimated runtime** | ~5–90 seconds (full suite; Phase 5 close-out measured ~5s for 693 specs) |

**Baseline at phase start:** Phase 5 closed at **693 specs / 693 passing / 0 failing**
(`05-TRIAGE.md` § Closing Snapshot). 46 `*.spec.ts` files exist under `src/`. Phase 6's
close-out gate (D-16) is the same zero-failure standard with no waiver mechanism.

**Environment note (D-15):** installed `@angular/core` is `19.2.18` while `package.json`
declares `^20.3.17`. Do **not** run `pnpm install` during this phase — the drift stays
recorded and open, to be settled at milestone close.

---

## Sampling Rate

- **After every task commit:** targeted `--include` run against the spec file(s) touched.
- **After every plan wave:** full suite command above.
- **Before `/gsd-verify-work`:** full suite must be green — 0 failures, per D-16 read literally.
- **Max feedback latency:** ~90 seconds (full suite); ~15 seconds (targeted `--include` run).
- **No watch-mode flags** — every command carries `--no-watch --browsers=ChromeHeadless`.

---

## Per-Task Verification Map

Task IDs are assigned by `gsd-planner`; the rows below are the requirement-level contract
each plan's tasks must satisfy. The executor fills `Task ID` / `Plan` / `Wave` as plans land
and flips `Status` as runs go green.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01 / Task 2 | 06-01 | 1 | SEC-01 (D-01, D-03) | T-06-01 | `sniffImageSignature` returns `null` for a buffer whose extension and `file.type` claim PNG but whose leading bytes are neither the PNG signature nor the JPEG SOI marker | unit (pure util) | `… --include='**/image-signature.spec.ts'` | ✅ `src/app/utils/image-signature.spec.ts` exists | ✅ green |
| 06-01 / Task 1 | 06-01 | 1 | SEC-01 (D-04, D-10) | T-06-01, T-06-02 | `onFileSelected` rejects a signature-mismatched file and sets the distinct signature-mismatch message on `this.error`, without emitting the file downstream | unit (component) | `… --include='**/upload-modal.component.spec.ts'` | ✅ spec exists — extended | ✅ green |
| 06-02 / Task 2 | 06-02 | 1 | SEC-02 (D-05..D-09) | T-06-05 | After a **successful** `generateShareLink()`, a second invocation within the 5s window is refused / the button stays disabled; a **failed** generation is immediately retryable | unit (component, Jasmine clock) | `… --include='**/app.component.spec.ts'` | ✅ spec exists — extended | ✅ green |
| 06-03 / Task 1 | 06-03 | 2 | SEC-03 (D-12) | T-06-08 | N/A (documentation) | source assertion | `.claude/rules/security.md` exists with `paths:` frontmatter and covers items (a)–(d) of D-12 | ✅ `.claude/rules/security.md` exists | ✅ green |
| 06-03 / Task 2 | 06-03 | 2 | D-16 (phase gate) | — | N/A | full suite | full suite command above | ✅ | ✅ green |
| 06-01 / Task 3 | 06-01 | 1 | SEC-01 (D-16 anti-vacuity) | — | The pre-existing `should reject oversized files` spec still turns RED when the `file.size` check is deleted — the inserted `await` did not silently disarm it | unit (component, red/green proof) | `… --include='**/upload-modal.component.spec.ts'` | ✅ spec exists — verified & possibly re-fixtured | ✅ green |
| 06-02 / Task 1 | 06-02 | 1 | SEC-02 (D-11) | T-06-05 | The share button's `[disabled]` expression reads the cooldown flag; the three-branch label chain gains no countdown text | source assertion + typecheck | `pnpm run typecheck` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/app/utils/image-signature.ts` + `src/app/utils/image-signature.spec.ts` — landed in 06-01.
- [x] `.claude/rules/security.md` — new file (D-12). Landed in 06-03 (wave 2), after 06-01/06-02
  so the doc names symbols (`sniffImageSignature`, `SHARE_COOLDOWN_MS`, the signature-mismatch
  message) that already exist in code rather than documenting an intention.

*Existing infrastructure covers everything else — `upload-modal.component.spec.ts` and
`app.component.spec.ts` both already exist and are extended rather than created.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|-------------|------------|-------------------|--------|
| Real spoofed-file rejection through the browser file picker | SEC-01 | Karma specs construct `File`/`Blob` objects directly; they do not exercise the actual `<input type="file">` change event or the OS picker | Rename a `.txt` (or any non-image) to `.png`, select it in both the model and attachment inputs (`upload-modal.component.html` lines 14 and 71), confirm the signature-mismatch message appears in the modal and no upload proceeds | ⏸ deferred to end-of-phase (`human_verify_mode: end-of-phase` in `.planning/config.json`) |
| Share cooldown felt at real wall-clock time | SEC-02 | Specs use Jasmine's clock (D-16); the perceived UX of a 5s greyed-out button is not assertable | Generate a share link in the running app, confirm the button greys out, comes back after ~5s, and shows no countdown text (D-11) | ⏸ deferred to end-of-phase (`human_verify_mode: end-of-phase` in `.planning/config.json`) |

Per `.planning/config.json`'s `human_verify_mode: end-of-phase` setting, both checks are recorded
here as still pending an interactive human pass over the running app, consistent with how 06-02
deferred its own D5 human check (see `06-02-SUMMARY.md` "Next Phase Readiness"). This worktree
executor has no live browser/UI interaction available to perform them; the automated portion of
the gate (full suite, typecheck) is confirmed green above.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without an automated verify
- [x] Wave 0 covers all MISSING references listed above
- [x] No watch-mode flags in any command
- [x] Feedback latency < 90s (full suite) / < 15s (targeted) — full suite ran in ~2.7s across three consecutive clean runs
- [x] Full suite at 0 failures (D-16) before `/gsd-verify-work` — 711/711 passing, 3 consecutive clean runs after the cross-spec pollution fix (see 06-03-SUMMARY.md)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** automated gate met (711/711, 0 failures, typecheck clean); both Manual-Only Verifications remain open pending an end-of-phase human pass before the phase is sealed.
