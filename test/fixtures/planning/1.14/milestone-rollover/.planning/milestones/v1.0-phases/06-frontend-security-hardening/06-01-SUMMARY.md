---
phase: 06-frontend-security-hardening
plan: 01
subsystem: upload-validation
tags: [security, upload, magic-bytes, angular, karma, jasmine]

# Dependency graph
requires: []
provides:
  - "sniffImageSignature pure util classifying leading bytes as PNG/JPEG/null"
  - "UploadModalComponent.onFileSelected rejects declared-PNG/JPEG files whose bytes don't match"
affects: [06-02, 06-03]

# Actuals (#2632)
actuals:
  tokens: 3700
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: ["pure-util-plus-colocated-spec convention (no Angular/DOM imports)", "fail-closed async validation guard"]

key-files:
  created:
    - src/app/utils/image-signature.ts
    - src/app/utils/image-signature.spec.ts
  modified:
    - src/app/components/upload-modal/upload-modal.component.ts
    - src/app/components/upload-modal/upload-modal.component.spec.ts

key-decisions:
  - "Ordering is type -> sniff -> size (D-04): the sniff sits between the two pre-existing checks, not before or after both."
  - "A rejected byte read (arrayBuffer() throwing) takes the exact same rejection path as a null sniff result -- fail-closed, never fail-open."
  - "No decode probe (createImageBitmap/Image) added -- magic-byte sniff only, per D-01 scope ceiling."

patterns-established:
  - "Pattern: pure validation utils live in src/app/utils/ with zero imports; the async file read stays at the Angular call site."

requirements-completed: [SEC-01]

coverage:
  - id: D1
    description: "A file whose name/type claim PNG but whose bytes don't match is rejected in onFileSelected with a distinct error message, never reaching UploadImagePipelineService.processFile."
    requirement: "SEC-01"
    verification:
      - kind: unit
        ref: "src/app/components/upload-modal/upload-modal.component.spec.ts#should reject a file whose declared PNG type does not match its actual bytes (SEC-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "sniffImageSignature's contract is pinned: both signatures, both length boundaries, empty input, spoofed input, byte-vs-text semantics, input immutability."
    requirement: "SEC-01"
    verification:
      - kind: unit
        ref: "src/app/utils/image-signature.spec.ts (12 specs)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The pre-existing file-size check still does its own job after the async sniff insertion, proven by an anti-vacuity red/green check."
    requirement: "SEC-01"
    verification:
      - kind: unit
        ref: "src/app/components/upload-modal/upload-modal.component.spec.ts#should reject oversized files"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-09-08
status: complete
---

# Phase 6 Plan 1: Upload Magic-Byte Signature Sniff Summary

**A `sniffImageSignature` pure util plus a three-line `onFileSelected` insertion now rejects any file whose declared PNG/JPEG type contradicts its actual leading bytes, closing the spoofed-upload gap SEC-01 targets.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-08T20:27:00Z (approx, worktree checkout)
- **Completed:** 2026-09-08T20:33:06Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- New `src/app/utils/image-signature.ts` — a zero-import, synchronous `sniffImageSignature(bytes)` function classifying a leading-byte buffer as `'image/png' | 'image/jpeg' | null`, with an explicit length guard (not an out-of-range-index coincidence) per the plan's backstop truth.
- `UploadModalComponent.onFileSelected` now sniffs the file's real bytes between the pre-existing `file.type` allowlist check and the pre-existing `file.size` check (D-04 ordering), fail-closed on a rejected read.
- `src/app/utils/image-signature.spec.ts` — 12 specs pinning both signatures, both boundary truncations, empty/1-byte input, a spoofed ASCII buffer, a near-miss-first-byte buffer, byte-vs-text semantics (via `TextEncoder`), and input immutability.
- `should reject oversized files` (pre-existing spec) proven to still exercise the size check specifically after the async insertion, with an explicit anti-vacuity red/green check.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end spoofed-upload rejection — util, wiring, one proving spec** - `be860f8` (feat)
2. **Task 2: Util spec — signatures, boundaries, empty input, byte-not-text** - `84524cc` (test)
3. **Task 3: Prove the inserted await did not silently disarm the existing size-check spec** - `ba8c3c9` (test)

_Note: Task 3's fix also required correcting two pre-existing specs in Task 1's commit whose fixtures used non-image bytes for declared-PNG files (see Deviations below); Task 3 itself only touches the size-check spec._

## Files Created/Modified
- `src/app/utils/image-signature.ts` - Pure `sniffImageSignature` util, zero imports, PNG/JPEG magic-byte comparison
- `src/app/utils/image-signature.spec.ts` - 12-spec contract test for the util
- `src/app/components/upload-modal/upload-modal.component.ts` - `onFileSelected` wiring: import, `SIGNATURE_READ_BYTES` field, sniff inserted between type and size checks, fail-closed try/catch
- `src/app/components/upload-modal/upload-modal.component.spec.ts` - New spoofed-file spec; fixed 3 pre-existing specs whose fixtures needed real PNG bytes or an `await` after the new async insertion

## Decisions Made
- Kept the sniff strictly to a magic-byte comparison (D-01/D-00 scope ceiling) — no decode probe, no format-allowlist expansion, no sanitization library.
- Reused `this.error` as the sole error channel (D-10) — no `SnackbarService` call, no second message variant.
- Read window is the first 12 bytes (`SIGNATURE_READ_BYTES = 12`), enough to cover both the 8-byte PNG signature and the 3-byte JPEG SOI marker with headroom.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing specs used non-image byte content for declared-PNG fixtures**
- **Found during:** Task 1, first test run after wiring the sniff into `onFileSelected`
- **Issue:** `should handle file selection with valid file` and the D-15 `processing indicator` spec both constructed `new File(['test'], 'test.png', { type: 'image/png' })` — plain text bytes, not a real PNG signature. Once the sniff runs on every accepted-type file, these two specs failed: the new signature check rejected the fixture before the (mocked) pipeline call was ever reached.
- **Fix:** Changed both fixtures to `new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])` (real PNG signature bytes). The D-15 test additionally needed a real task-queue flush (`await new Promise(resolve => setTimeout(resolve, 20))`) before asserting `isProcessingImage === true`, because the signature sniff's `arrayBuffer()` read is now the first await in `onFileSelected` — ahead of where `isProcessingImage` is set — so it is no longer synchronously observable immediately after calling the method.
- **Files modified:** `src/app/components/upload-modal/upload-modal.component.spec.ts`
- **Verification:** Full `upload-modal.component.spec.ts` suite green (50/50) after the fix; `pnpm run typecheck` exits 0.
- **Committed in:** `be860f8` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — pre-existing spec fixtures broken by the new signature check)
**Impact on plan:** Necessary for correctness — without this fix, two pre-existing passing specs would have gone red as a direct side effect of the new check, which the plan's "no regression" truth explicitly forbids. No scope creep: no new behavior was added beyond what Task 1 specified.

## Anti-Vacuity Evidence (Task 3, plan-required)

Per the plan's explicit instruction, the size-check spec's ability to fail was proven empirically, not assumed:

1. **Before any fix** (Task 1's un-awaited, non-PNG-byte fixture): running the suite showed `should reject oversized files` FAILED with `Expected null to be 'File size must be less than 10MB per file'` — i.e. `component.error` was still `null` at assertion time. This confirmed the **async-ordering hazard** (the un-awaited call let assertions run before the new `await` settled), not a wrong-branch rejection by the signature check.
2. **Task 3 fix applied:** fixture changed to real PNG signature bytes + 11MB padding, call converted to `await component.onFileSelected(event)`. Full suite: **50/50 green.**
3. **Anti-vacuity check — RED:** temporarily deleted the `file.size > this.MAX_FILE_SIZE` block from `onFileSelected`. Re-ran `upload-modal.component.spec.ts`: **1 FAILED, 49 SUCCESS** — the single failure was exactly `should reject oversized files`. No other spec was affected.
4. **Anti-vacuity check — GREEN:** restored the block (confirmed via `git diff` showing zero diff against the committed version). Re-ran the suite: **50/50 SUCCESS.**

This confirms the size-check spec is demonstrably still able to fail on its own after the async insertion, and does so for the correct reason (the size check specifically, not the signature check).

## Issues Encountered
- The worktree checkout had no `node_modules` of its own. Node's module resolution walks up the directory tree and resolved Angular CLI / TypeScript from the parent repo's `node_modules` (the worktree lives nested under the main repo path), so `pnpm exec ng test` worked directly; `pnpm exec tsc` needed to be invoked via its resolved absolute path instead (`node <resolved-path>/typescript/bin/tsc --noEmit`) since no global `tsc` binary was on `PATH`. No code or config changes were needed to work around this — informational only, included so the pattern is recognized if hit again in future plans.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SEC-01 is satisfied: spoofed uploads are rejected on their actual bytes, the sniffer's contract is pinned by a dedicated spec, and the pre-existing type/size checks are provably still doing their own jobs.
- Plan 06-02 (SEC-02, share-link cooldown) and 06-03 have no code dependency on this plan's changes — `image-signature.ts` and the `onFileSelected` insertion are self-contained to the upload-modal flow.
- No blockers.

---
*Phase: 06-frontend-security-hardening*
*Completed: 2026-09-08*

## Self-Check: PASSED
- FOUND: src/app/utils/image-signature.ts
- FOUND: src/app/utils/image-signature.spec.ts
- FOUND commit: be860f8
- FOUND commit: 84524cc
- FOUND commit: ba8c3c9
