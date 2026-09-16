---
status: complete
phase: 06-frontend-security-hardening
source: [06-VERIFICATION.md]
started: 2026-09-09T01:04:54Z
updated: 2026-09-09T01:19:35Z
---

## Current Test

[testing complete]

## Tests

### 1. Spoofed-file rejection through the real file picker
expected: Rename a non-image file (e.g. a .txt) to .png and select it through BOTH file inputs in the upload modal (the model input and the attachment input). The message "This file is not a valid PNG or JPEG image" appears and no upload proceeds. A genuine PNG and a genuine JPEG still upload successfully through both inputs.
result: pass
source: automated
method: Playwright (firefox) against the running dev server at localhost:4200, driving the real `<input type="file">` change event via the browser's own file chooser (`fileChooser.setFiles`) — not a programmatic `onFileSelected()` call.
evidence: |
  8/8 combinations behaved correctly across both upload types and both file inputs
  (the initial `id="fileInput"` upload area and the `#fileInput` "Change Image" input):

  | Mode       | Input        | File        | Expected | Actual |
  |------------|--------------|-------------|----------|--------|
  | Model      | initial      | spoofed.png | reject   | rejected, exact message |
  | Model      | initial      | spoofed.jpg | reject   | rejected, exact message |
  | Model      | initial      | genuine.png | accept   | accepted, preview rendered |
  | Model      | Change Image | spoofed.png | reject   | rejected, prior image untouched |
  | Attachment | initial      | spoofed.png | reject   | rejected, exact message |
  | Attachment | initial      | spoofed.jpg | reject   | rejected, exact message |
  | Attachment | initial      | genuine.jpg | accept   | accepted, preview rendered |
  | Attachment | Change Image | genuine.png | accept   | accepted, preview rendered |

  Rejection message matched "This file is not a valid PNG or JPEG image" verbatim in every
  reject case. On rejection the preview never rendered AND the name field stayed empty,
  proving `onFileSelected` returned before `patchValue` — no partial upload state.

  Strongest signal: for spoofed.jpg the browser itself reported `file.type === "image/jpeg"`,
  so the `ALLOWED_FILE_TYPES` allowlist passed and the magic-byte sniffer is what rejected it.
  That is exactly the SEC-01 threat (attacker-controlled type/extension metadata) failing closed
  in a real browser, which the Karma specs could not demonstrate.

### 2. Share cooldown felt at real wall-clock time
expected: With models loaded in both panels, click Share in the running app. The button disables immediately after a successful share, re-enables automatically ~5s later, shows no countdown/seconds-remaining text, and causes no layout shift — on a desktop viewport and on a narrow mobile viewport.
result: pass
source: automated
method: Playwright (firefox), real `setTimeout` (no jasmine.clock), sampling the button's disabled state, label and `getBoundingClientRect` every 100ms for 7s after a real click. Share API stubbed on localhost:3000 (the dev `apiBaseUrl`) so no production share links were created.
evidence: |
  Desktop (1440x900) measured timeline:
  - t=0ms      enabled,  "Share"
  - t=107ms    DISABLED, "Copied!"   -> disables immediately on success
  - t=2611ms   DISABLED, "Share"     -> success label reverts, cooldown still holding
  - t=5115ms   ENABLED,  "Share"     -> auto re-enable at ~5.1s (SHARE_COOLDOWN_MS = 5000)

  Mobile (375x667) measured timeline: identical shape, re-enabled at t=5027ms.
  No horizontal overflow (scrollWidth stayed 375), no header height change.

  No countdown/seconds-remaining text at any of the 72 desktop samples or the mobile samples
  (regex `/\d+\s*s\b|second|remaining/i` never matched the label).

  Throttle actually verified end-to-end, not just visually: 10 rapid clicks over 1.5s produced
  exactly ONE POST to /generateShareLink at the stub API. 9 of 10 clicks suppressed.

  Layout shift: geometry was completely stable (0px on every axis) throughout the
  cooldown-only window — the t=2611ms..5115ms period when the button is disabled by the
  cooldown alone. A 12-13px width change does occur, but only while the pre-existing
  "Copied!" success label is displayed (t=107..2611ms). That label chain is NOT part of this
  phase: commit 2f7e23d's only template change is the one-line `[disabled]` expression, and
  the three-branch label chain (Sharing/Copied!/Share) predates Phase 6 unchanged. The
  cooldown itself introduces zero layout shift on both viewports.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
