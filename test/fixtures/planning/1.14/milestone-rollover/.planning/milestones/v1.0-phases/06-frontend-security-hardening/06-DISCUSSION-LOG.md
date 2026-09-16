# Phase 6: Frontend Security Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-08
**Phase:** 6-Frontend Security Hardening
**Areas discussed:** None — user declined discussion and delegated all decisions

---

## Gray Area Selection

Four phase-specific gray areas were identified from analysis and codebase scout, and presented for selection (first via `AskUserQuestion`, which was dismissed, then as a plain-text numbered list):

| Option | Description | Selected |
|--------|-------------|----------|
| Spoof detection depth | How far past `file.type` SEC-01 goes: magic-byte sniff, decode probe, or both; format allowlist; where the check lives | |
| Throttle policy & placement | What throttling means beyond the existing in-flight guard: cooldown vs quota vs backoff; persisted vs in-memory; `AppComponent` vs `StateExportService` | |
| Rejection & throttle UX | Distinct vs generic rejection messages; countdown UI vs plain disabled button | |
| Doc home, audience & blast radius | `.claude/rules/security.md` vs `docs/` vs README vs JSDoc; dev-facing vs user-visible; whether `importFromFile` is in scope | |

**User's choice:** None of the above — declined to discuss any area.

**Notes:** User's stated rationale, in substance: *"I don't care to discuss any, use your best judgement for everything. This security is not much of a concern for me given what this site does, nothing is really sensitive, this is just for best practices. Overengineering for security is actually bad in my opinion in this context."*

This was treated as more than a delegation — it is a scope ceiling, and was recorded as the governing decision **D-00** in CONTEXT.md, with an explicit ruled-out list (CSP, SRI, dependency-audit gates, crypto/hashing, sanitization dependencies, a throttle-service abstraction, formal threat modeling) so that downstream research and planning cannot quietly re-expand the phase.

---

## Claude's Discretion

All sixteen implementation decisions (D-01 through D-16) are Claude's judgment, made under the D-00 proportionality ceiling. Summary of what was chosen and the main alternative rejected in each case:

| Decision | Chosen | Rejected alternative |
|----------|--------|----------------------|
| D-01 | Magic-byte signature sniff | Additional `createImageBitmap` decode probe — slower, catches only corrupt-but-signed files, not the stated threat |
| D-02 | PNG + JPEG allowlist unchanged | WebP/AVIF expansion — a feature, not a security fix |
| D-03 | Pure util `utils/image-signature.ts` | `UploadFormValidatorsService` — not a form validator, needs no DI |
| D-04 | Wire into existing `onFileSelected` | Replacing the existing `file.type` check rather than layering on it |
| D-05 | Fixed post-success cooldown | Token bucket / rolling-window quota — the abstraction D-00 rules out |
| D-06 | 5 seconds | Tuning the value as if it were a real DoS defense |
| D-07 | In-memory, resets on reload | localStorage persistence — implies unmakeable guarantees, adds an iOS-private-mode failure mode |
| D-08 | Throttle in `AppComponent` | `StateExportService` — speculative generality for one caller |
| D-09 | Only successes start the cooldown | Throttling after failures — would block legitimate retries |
| D-10 | Two distinct rejection messages | One generic string — confusing when the extension looks correct |
| D-11 | Plain `[disabled]`, no countdown | Countdown timer UI — advertises a limit that protects nothing |
| D-12 | `.claude/rules/security.md`, agent-facing | `docs/SECURITY.md`, README section, or JSDoc-only |
| D-13 | No user-visible in-app disclosure | Adult-mode toggle notice — net-new user-facing behavior in a behavior-preserving milestone |
| D-14 | `importFromFile` out of scope | Extending MIME hardening to state import |
| D-15 | No `pnpm install`; drift stays open | Remediating the Angular 19.2.18 / `^20.3.17` drift inside a security phase |
| D-16 | Green-suite gate, util + component specs | A new integration spec — not warranted at this size |

---

## Notable Scout Findings

Recorded here because they change what "done" means, and were surfaced before the user declined discussion:

- **SC#1 is half-satisfied already.** `upload-modal.component.ts:157` checks `file.type` against `ALLOWED_FILE_TYPES` — but `file.type` is browser-derived from the extension, so a renamed non-image passes today. The delta is spoof resistance, not type checking.
- **SC#2's concurrency case is already satisfied.** `app.component.ts:293` returns early on `isGeneratingShareLink` and the button is `[disabled]` while in flight. The delta is a gap between *sequential* requests.
- **SEC-03 has a pre-existing source of truth.** `REQUIREMENTS.md` lines 85-86 already state the backend-owned split; the new doc must point at it rather than duplicate it.

---

## Deferred Ideas

- `importFromFile` state-import hardening (D-14)
- Format allowlist expansion, WebP / AVIF (D-02)
- Persisted or server-coordinated share-link rate limiting (D-07) — backend-owned
- Everything on D-00's ruled-out list — CSP, SRI, dependency-audit gates, sanitization dependencies, throttle-service abstraction, formal threat model
- Angular version drift, installed 19.2.18 vs declared `^20.3.17` (D-15) — settle at milestone close

**Carried from Phase 5, not Phase 6 scope:** broken `Elf` model asset (404); compare-modal panel positions not recomputed on width-only viewport resize.
