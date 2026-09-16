---
phase: 06-frontend-security-hardening
verified: 2026-09-08T21:10:00Z
status: passed
score: 12/12 must-haves verified (automated)
behavior_unverified: 0
overrides_applied: 0
human_verification:

  - test: "Rename a non-image file (e.g. a .txt) to .png and select it through BOTH file inputs in the upload modal (the model input and the attachment input)."
    expected: "The message 'This file is not a valid PNG or JPEG image' appears in the modal and no upload proceeds. A genuine PNG and a genuine JPEG still upload successfully through both inputs."
    why_human: "Karma specs construct File/Blob objects directly and call onFileSelected() programmatically; they do not exercise the real <input type=\"file\"> change event or the OS file picker. (Deferred from 06-VALIDATION.md Manual-Only Verifications, human_verify_mode: end-of-phase.)"

  - test: "With models loaded in both panels, click Share in the running app. Confirm the button greys out, becomes clickable again after roughly 5 seconds with no countdown text, and that layout does not shift — on a desktop viewport and on a narrow mobile viewport."
    expected: "Button disables immediately after a successful share, re-enables automatically ~5s later, no countdown/seconds-remaining text is shown, and no layout shift occurs on desktop or mobile."
    why_human: "Specs use jasmine.clock() to mock setTimeout; the felt UX of a real 5-second wall-clock disable/re-enable, absence of layout shift, and absence of countdown text are not assertable by Karma. (Deferred from 06-VALIDATION.md Manual-Only Verifications, human_verify_mode: end-of-phase.)"
---

# Phase 06: Frontend Security Hardening Verification Report

**Phase Goal:** Upload and share-link flows get client-side hardening appropriate for a frontend-only app, with the limits of that hardening documented in-repo.
**Verified:** 2026-09-08T21:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A spoofed file (declared PNG/JPEG type, non-matching bytes) is rejected by upload validation, not just size | ✓ VERIFIED | `src/app/utils/image-signature.ts` `sniffImageSignature`; wired into `upload-modal.component.ts` `onFileSelected` between the type and size checks; spec `should reject a file whose declared PNG type does not match its actual bytes (SEC-01)` passes (ran live: 50/50 SUCCESS in `upload-modal.component.spec.ts`) |
| 2 | `sniffImageSignature` contract is pinned (both signatures, boundary truncation, empty/1-byte input, byte-vs-text encoding, purity) | ✓ VERIFIED | `src/app/utils/image-signature.spec.ts`, 12 specs; ran live: 12/12 SUCCESS |
| 3 | Sniff fails closed — a rejected byte read is treated as a mismatch, never falls through to acceptance | ✓ VERIFIED | `onFileSelected` wraps `file.slice(...).arrayBuffer()` in try/catch; catch sets the same error and returns (source-read, `upload-modal.component.ts` lines ~165-175) |
| 4 | No regression — a real PNG/JPEG under the size cap still reaches `processFile` | ✓ VERIFIED | Pre-existing happy-path spec `should handle file selection with valid file` (fixture updated to real PNG signature bytes) passes; full upload-modal suite 50/50 |
| 5 | Anti-vacuity: the pre-existing size-check spec still fails when the size check is removed | ✓ VERIFIED | 06-01-SUMMARY.md records the empirical red (1 FAILED — `should reject oversized files` — with the block removed) / green (50/50 restored) observation; commit `ba8c3c9` matches this claim |
| 6 | Rapid repeated share-link generation is throttled client-side (cooldown, not unlimited requests) | ✓ VERIFIED | `AppComponent.shareOnCooldown` / `shareCooldownTimer` / `SHARE_COOLDOWN_MS = 5000` in `app.component.ts`; guard `if (this.isGeneratingShareLink || this.shareOnCooldown) return;`; spec `refuses a second generation inside the 5s window` passes (ran live: 7/7 SUCCESS in `app.component.spec.ts`) |
| 7 | Cooldown expires automatically after 5s with no user action required | ✓ VERIFIED | Spec `allows generation again after the window elapses` (jasmine.clock tick 5000) passes |
| 8 | A failed share-link generation does NOT start the cooldown (immediately retryable) | ✓ VERIFIED | Cooldown-start line sits only in the `try` block's success path, after `this.shareSuccess = true`, never in `catch`/`finally`; spec `does not start the cooldown when generation fails` passes |
| 9 | Share button `[disabled]` reads the cooldown flag; no fourth label branch / no countdown UI added | ✓ VERIFIED | `app.component.html` line 76: `[disabled]="isGeneratingShareLink || shareOnCooldown || !(canShare$ \| async)"`; label chain still exactly 3 branches (`Sharing`/`Copied!`/`Share`) |
| 10 | A component destroyed mid-cooldown leaves no pending timer callback | ✓ VERIFIED | `ngOnDestroy()` clears `shareCooldownTimer`; spec `clears the pending cooldown timer on destroy` passes |
| 11 | In-repo doc states adult-content filtering is cosmetic/client-side only, and upload size/rate limits require backend enforcement | ✓ VERIFIED | `.claude/rules/security.md` — sections "Adult-content filtering is cosmetic", "Upload signature sniffing is a UX guard", "The share-link cooldown is anti-fat-finger", "SVG is deliberately excluded", "Backend-owned enforcement" (points at `.planning/REQUIREMENTS.md` §Out of Scope); no mechanism is called "enforcement"/"protection"/"a security control"/"an age gate" anywhere in the file |
| 12 | Phase gate: full suite green, above Phase 5 baseline, no waivers | ✓ VERIFIED | Orchestrator evidence: 711/711 across 3 separate runs (Phase 5 baseline 693); spot-checked subsets independently in this verification (12/12, 7/7, 50/50 all SUCCESS) |

**Score:** 12/12 truths verified (automated). 2 human-verification items outstanding (see below) — deliberately deferred per `.planning/config.json` `human_verify_mode: end-of-phase`, not automated-check failures.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/utils/image-signature.ts` | Pure, dependency-free `sniffImageSignature` util | ✓ VERIFIED | Zero imports; exports exactly `sniffImageSignature(bytes: Uint8Array): 'image/png' \| 'image/jpeg' \| null`; explicit length-guard in `matchesSignature` (not an out-of-range-index coincidence) |
| `src/app/utils/image-signature.spec.ts` | Unit spec pinning the sniff contract | ✓ VERIFIED | 12 specs, all passing live |
| `src/app/components/upload-modal/upload-modal.component.ts` (modified) | Sniff wired between type and size checks | ✓ VERIFIED | Import + `SIGNATURE_READ_BYTES = 12` field + sniff call in correct order, fail-closed try/catch |
| `src/app/components/upload-modal/upload-modal.component.spec.ts` (modified) | New spoof spec + fixed pre-existing specs | ✓ VERIFIED | 50 specs, all passing live |
| `src/app/app.component.ts` (modified) | Cooldown fields, guard, success-path start, `ngOnDestroy` clear | ✓ VERIFIED | All present at the expected lines, matching plan's must_haves textually |
| `src/app/app.component.html` (modified) | `[disabled]` reads cooldown flag | ✓ VERIFIED | Exact expression match to plan spec |
| `src/app/app.component.spec.ts` (modified) | 4 cooldown specs using Jasmine's clock | ✓ VERIFIED | `describe('share-link cooldown (SEC-02)', ...)` with 4 `it` blocks, all passing live |
| `.claude/rules/security.md` | New agent-facing rules doc | ✓ VERIFIED | `paths:` frontmatter present, 5 `##` sections (4 D-12 items + backend-owned-enforcement pointer), grounded in real symbol names/values read from landed code |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `onFileSelected` | `sniffImageSignature` | relative import, called between type-allowlist and size checks | ✓ WIRED | `import { sniffImageSignature } from '../../utils/image-signature';`; call site confirmed at correct position |
| `.btn-share [disabled]` | `AppComponent.shareOnCooldown` | template boolean expression | ✓ WIRED | `[disabled]="isGeneratingShareLink \|\| shareOnCooldown \|\| !(canShare$ \| async)"` |
| `generateShareLink()` success path | `shareCooldownTimer` / `SHARE_COOLDOWN_MS` | `setTimeout` started only inside `try`, after `shareSuccess = true` | ✓ WIRED | Confirmed textually; not present in `catch` or `finally` |
| `.claude/rules/security.md` | `.planning/REQUIREMENTS.md` §Out of Scope | reference, not restatement | ✓ WIRED | Doc's "Backend-owned enforcement" section names the file and explicitly says "do not copy its rows here" |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `image-signature.spec.ts` full contract | `ng test --include='**/image-signature.spec.ts'` | 12/12 SUCCESS | ✓ PASS |
| `app.component.spec.ts` incl. SEC-02 cooldown block | `ng test --include='**/app.component.spec.ts'` | 7/7 SUCCESS | ✓ PASS |
| `upload-modal.component.spec.ts` incl. SEC-01 spoof spec | `ng test --include='**/upload-modal.component.spec.ts'` | 50/50 SUCCESS | ✓ PASS |
| Full suite (orchestrator-run, 3x) | `ng test --no-watch --browsers=ChromeHeadless` | 711/711 SUCCESS, up from Phase 5's 693 | ✓ PASS |
| `pnpm run build` | production build | exits 0 (pre-existing bundle-budget warning only) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| SEC-01 | 06-01 | Upload validates/sanitizes image MIME types (not only file size) and rejects non-image or spoofed files | ✓ SATISFIED | `sniffImageSignature` + wiring, verified above. REQUIREMENTS.md checkbox is `[x]` — matches. |
| SEC-02 | 06-02 | Share-link generation is throttled client-side to prevent rapid repeated requests | ✓ SATISFIED (code) / ⚠️ checkbox stale | Cooldown implemented and tested, verified above. **REQUIREMENTS.md still shows `[ ]` for SEC-02** — bookkeeping gap, not a functional gap (see Anti-Patterns below). |
| SEC-03 | 06-03 | In-repo documentation states that adult-content filtering is cosmetic (client-side only) and that upload size/rate limits require backend enforcement | ✓ SATISFIED (code) / ⚠️ checkbox stale | `.claude/rules/security.md` verified above. **REQUIREMENTS.md still shows `[ ]` for SEC-03** — same bookkeeping gap. |

No orphaned requirements: `.planning/REQUIREMENTS.md`'s "Phase 6 | Mapped" traceability table lists exactly SEC-01/02/03, all three claimed by the three plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 49-50 | SEC-02 and SEC-03 checkboxes remain `[ ]` despite both being implemented, tested, and their SUMMARY.md files declaring `requirements-completed: [SEC-02]` / `[SEC-03]` | ℹ️ Info | Documentation bookkeeping only — does not affect runtime behavior or test evidence, which independently confirm both requirements are met in code. Should be flipped to `[x]` before milestone close so the requirements ledger matches reality (only SEC-01's box was ticked, apparently during 06-01's execution; 06-02/06-03 did not repeat that step). |

No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`), no stub returns, and no hardcoded-empty-data patterns found in any of the 9 files this phase touched.

### Human Verification Required

Both items below come from `06-VALIDATION.md`'s "Manual-Only Verifications" table, explicitly deferred to end-of-phase per `.planning/config.json`'s `human_verify_mode: end-of-phase` setting (consistent with how 06-02 and 06-03's own SUMMARYs record the same deferral). They are not automated-check failures — the equivalent logic is already unit-tested — but the *felt*, real-browser behavior needs a human pass.

### 1. Spoofed-file rejection through the real file picker

**Test:** Rename a non-image file (e.g. a `.txt`) to `.png` and select it through BOTH file inputs in the upload modal — the model input and the attachment input.
**Expected:** The message "This file is not a valid PNG or JPEG image" appears in the modal and no upload proceeds. A genuine PNG and a genuine JPEG still upload successfully through both inputs.
**Why human:** Karma specs construct `File`/`Blob` objects directly and call `onFileSelected()` programmatically — they don't exercise the real `<input type="file">` change event or the OS file picker.

### 2. Share cooldown felt at real wall-clock time

**Test:** With models loaded in both panels, click Share in the running app. Confirm the button greys out, becomes clickable again after roughly 5 seconds with no countdown text, and that layout does not shift — on a desktop viewport and on a narrow mobile viewport.
**Expected:** Button disables immediately after a successful share, re-enables automatically ~5s later, no countdown/seconds-remaining text is shown, no layout shift on desktop or mobile.
**Why human:** Specs use `jasmine.clock()` to mock `setTimeout`; the felt UX of a real 5-second wall-clock disable/re-enable and absence of layout shift are not assertable by Karma.

### Gaps Summary

No blocking gaps. All 12 derived observable truths for SEC-01/SEC-02/SEC-03 are verified against the actual codebase (not just SUMMARY claims) — the magic-byte sniffer is real, dependency-free, and fail-closed; the share cooldown is a real 5-second in-memory timer gated correctly on the success path only; and `.claude/rules/security.md` genuinely names the four required limitations, grounds them in real file paths, and points at (not duplicates) `.planning/REQUIREMENTS.md` for the backend-owned split. All targeted spec files were independently re-run in this verification and passed (12/12, 7/7, 50/50), consistent with the orchestrator's reported 711/711 full-suite runs.

Two items are routed to human verification because they test perceptual/real-time browser behavior that Karma component specs cannot observe — this is an expected `human_needed` outcome under `human_verify_mode: end-of-phase`, not evidence of a defect.

One informational (non-blocking) documentation gap: `.planning/REQUIREMENTS.md`'s SEC-02 and SEC-03 checkboxes were not flipped to `[x]` even though both are complete and verified in code — recommend fixing before milestone close so the ledger matches reality.

---

*Verified: 2026-09-08T21:10:00Z*
*Verifier: Claude (gsd-verifier)*
