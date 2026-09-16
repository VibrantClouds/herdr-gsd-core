---
phase: 06-frontend-security-hardening
reviewed: 2026-09-08T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - .claude/rules/security.md
  - src/app/app.component.html
  - src/app/app.component.spec.ts
  - src/app/app.component.ts
  - src/app/components/upload-modal/upload-modal.component.spec.ts
  - src/app/components/upload-modal/upload-modal.component.ts
  - src/app/services/custom-attachment-point.service.spec.ts
  - src/app/utils/image-signature.spec.ts
  - src/app/utils/image-signature.ts
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-09-08T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This phase adds three self-contained, low-blast-radius pieces of client-side hardening:
magic-byte image signature sniffing in `image-signature.ts` wired into
`upload-modal.component.ts`'s `onFileSelected`, a post-success cooldown on share-link
generation in `app.component.ts`/`app.component.html`, and a documentation file
(`.claude/rules/security.md`) that explicitly and correctly scopes both as client-side UX
guards rather than security boundaries.

I traced `sniffImageSignature`/`matchesSignature` byte-by-byte, checked the three-gate
ordering in `onFileSelected` against the security doc's stated order (declared-type
allowlist → signature sniff → size cap), verified fail-closed behavior on a failed
`arrayBuffer()` read, and cross-checked every claim in `security.md` against the actual
code it describes — all of it is accurate and internally consistent, including the subtle
point that a declared-PNG file with actual JPEG bytes (or vice versa) is deliberately
accepted (the sniff checks "is this some recognized image format," not "does it match the
declared type"). The `generateShareLink()` cooldown state machine (`isGeneratingShareLink`
+ `shareOnCooldown`, gated by two independent timers) was traced through all four new spec
cases (double-click, window-elapsed, failure-doesn't-cooldown, destroy-clears-timer) and
matches the documented behavior in every branch I checked.

The one substantive gap: the newly added `shareCooldownTimer` gets an explicit
`clearTimeout` in `ngOnDestroy()`, but the pre-existing sibling `shareSuccessTimer` — which
follows the exact same "guard-clear-then-set" pattern two lines above it in
`generateShareLink()` — still has no `ngOnDestroy()` cleanup at all. Given this phase's own
precedent sitting directly adjacent, and the milestone's explicit "no leaked listeners or
subscriptions" goal, this reads as an incomplete application of the phase's own pattern
rather than an untouched pre-existing concern.

## Warnings

### WR-01: `shareSuccessTimer` has no `ngOnDestroy()` cleanup, unlike the new `shareCooldownTimer` it sits beside

**File:** `src/app/app.component.ts:46, 173, 336-338`
**Issue:** This phase adds `shareCooldownTimer` and correctly clears it in `ngOnDestroy()`:
```ts
ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
  if (this.shareCooldownTimer) { clearTimeout(this.shareCooldownTimer); this.shareCooldownTimer = null; }
}
```
But the pre-existing `shareSuccessTimer`, set two lines earlier in `generateShareLink()`
using the identical guard-clear-then-set pattern:
```ts
this.shareSuccess = true;
if (this.shareSuccessTimer) { clearTimeout(this.shareSuccessTimer); }
this.shareSuccessTimer = setTimeout(() => { this.shareSuccess = false; }, 2500);
```
is never cleared on destroy. If the component is destroyed within 2.5s of a successful
share-link generation, the pending timer callback still fires later and mutates
`this.shareSuccess` on an already-destroyed component instance, and the closure holding
`this` keeps the component instance reachable until the timer fires. `AppComponent` is the
app root and is rarely destroyed in production, so real-world impact is low, but this phase
established the correct cleanup pattern for the sibling timer right next to this one and
did not apply it here — the two timers are now inconsistent with each other inside the same
method.
**Fix:** Clear both timers symmetrically in `ngOnDestroy()`:
```ts
ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
  if (this.shareSuccessTimer) { clearTimeout(this.shareSuccessTimer); this.shareSuccessTimer = null; }
  if (this.shareCooldownTimer) { clearTimeout(this.shareCooldownTimer); this.shareCooldownTimer = null; }
}
```

## Info

### IN-01: Duplicated "clear-then-set" timer pattern between `shareSuccessTimer` and `shareCooldownTimer`

**File:** `src/app/app.component.ts:336-342`
**Issue:** The two timers in `generateShareLink()` repeat the same three-line
guard/clear/set shape back to back:
```ts
if (this.shareSuccessTimer) { clearTimeout(this.shareSuccessTimer); }
this.shareSuccessTimer = setTimeout(() => { this.shareSuccess = false; }, 2500);

this.shareOnCooldown = true;
if (this.shareCooldownTimer) { clearTimeout(this.shareCooldownTimer); }
this.shareCooldownTimer = setTimeout(() => { this.shareOnCooldown = false; }, this.SHARE_COOLDOWN_MS);
```
Extracting a small private helper (e.g. `private setTimedFlag(currentTimer, setFlag, ms)`)
would remove the duplication and make it structurally impossible to add a third timer (or
forget cleanup for one) without following the same shape.
**Fix:** Optional refactor; not required for correctness. If picked up, fold WR-01's fix in
at the same time so both timers are constructed and torn down through the same code path.

---

_Reviewed: 2026-09-08T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
