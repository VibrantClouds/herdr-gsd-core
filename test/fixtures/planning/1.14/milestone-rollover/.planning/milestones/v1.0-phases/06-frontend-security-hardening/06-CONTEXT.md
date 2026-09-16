# Phase 6: Frontend Security Hardening - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Client-side hardening of the two flows named in `CONCERNS.md` — image upload (SEC-01) and share-link generation (SEC-02) — plus one in-repo document stating honestly what frontend-only enforcement cannot do (SEC-03).

**In scope:** magic-byte validation on image upload; a cooldown on share-link generation; one agent-facing security-limits doc.

**Out of scope:** anything backend. The Cloudflare Worker API is not in this repo, so server-side upload enforcement, real rate limiting, share-link TTL/GC, and any age gate are documented as backend-owned rather than built (`REQUIREMENTS.md` §Out of Scope, rows 85-86).

</domain>

<decisions>
## Implementation Decisions

### Governing principle

- **D-00: Proportionality is the binding constraint on every decision in this phase. Pick the smallest implementation that satisfies the stated success criterion, and stop.** The user's direction, verbatim in substance: *this security is not much of a concern given what the site does, nothing is really sensitive, this is just for best practices, and overengineering for security is actively bad in this context.* That is a scope ceiling, not a mood. Size✦Lab has no authentication, no PII, no payments, no user accounts, and no server-side trust boundary that the frontend is guarding. SEC-01/02/03 are hygiene, not threat mitigation.

  **Downstream agents: the following are explicitly ruled OUT of this phase and must not be proposed, researched, or planned** — Content-Security-Policy headers or meta tags, Subresource Integrity, dependency-audit/CI gates, any hashing or crypto, any sanitization library dependency, a generalized rate-limiter or throttle service abstraction, a formal threat model, penetration-test scaffolding, or expanding the security surface to flows SEC-01/02/03 do not name. If research surfaces a "you should also…" recommendation, record it as a deferred idea; do not fold it into scope.

  A reviewer flagging one of these as a gap should be answered with this decision, not with new work.

### SEC-01 — Upload MIME validation

- **D-01: Magic-byte signature sniff only. No decode probe.** Read the leading bytes of the selected file (`file.slice(0, 12).arrayBuffer()`) and match the PNG signature (`89 50 4E 47 0D 0A 1A 0A`) or the JPEG SOI marker (`FF D8 FF`). This is the direct, ~20-line answer to SC#1's "spoofed image extension/MIME". A `createImageBitmap`/`Image` decode probe was considered and rejected: it is a second, slower, async gate whose only additional catch is a correctly-signed-but-corrupt file, which is not the stated threat and is already handled downstream by the existing processing pipeline's error path.

- **D-02: The allowlist stays exactly PNG + JPEG — unchanged.** This matches the existing `ALLOWED_FILE_TYPES` and both `accept=".png,.jpg,.jpeg"` inputs. Do not add WebP or AVIF; broadening accepted formats is a feature, not a security fix, and would need its own processing-pipeline verification. SVG stays excluded and that exclusion is deliberate — it is the one genuinely script-bearing image format — which earns exactly one sentence in the SEC-03 doc.

- **D-03: The sniffer is a pure, synchronous util with its own colocated spec.** It lives at `src/app/utils/image-signature.ts`. Signature: `sniffImageSignature(bytes: Uint8Array): 'image/png' | 'image/jpeg' | null`. This matches the repo's established pure-util-plus-spec convention (`image-processing-core.ts`, `category-normalization.ts`, `coordinate-transform.ts`). The async file-slice read stays at the call site; the util itself takes bytes and stays trivially testable. Do NOT put this in `UploadFormValidatorsService` — it is not an Angular form validator and does not need DI.

- **D-04: Wire it at the single existing choke point — `onFileSelected` in `upload-modal.component.ts` (~line 150).** Order: keep the existing `file.type` allowlist check first as a cheap early reject, then the signature sniff, then the existing size check. Both file inputs in the template (model at :14, attachment at :71) bind this same handler, so one insertion covers both. Keeping the existing `file.type` check rather than replacing it costs nothing and preserves today's message for the ordinary wrong-file-type case.

### SEC-02 — Share-link throttling

- **D-05: A fixed cooldown after success — not a quota, not backoff.** Note for the planner: an in-flight re-entrancy guard *already exists* (`isGeneratingShareLink` at `app.component.ts:293`, with `[disabled]` bound in `app.component.html:76`), so SC#2 is not satisfied by re-entrancy protection — that is already true today. The new behavior is a time window after a completed generation. A token bucket or rolling-window quota is the rate-limiter abstraction D-00 rules out.

- **D-06: Cooldown is 5 seconds.** Long enough to stop accidental double-taps and impatient repeat clicks; short enough that no legitimate user notices it. This value is a UX guard, not a DoS defense — say so in the SEC-03 doc rather than tuning the number as though it were protecting something.

- **D-07: In-memory only. Resets on page reload.** Persisting the cooldown to localStorage was considered and rejected on two grounds: it implies an enforcement guarantee the frontend cannot make (any user can clear it in one devtools action), and it adds a storage-availability failure mode this app already handles carefully for iOS private mode (`safe-local-storage.ts`, `StorageUnavailableError`). An honest in-memory guard beats a persisted one that pretends to be enforcement.

- **D-08: Lives in `AppComponent`, beside the existing guard — NOT in `StateExportService`.** There is exactly one caller of `generateShareLink()`. Relocating throttling into the service to cover hypothetical future callers is precisely the speculative generality D-00 forbids.

- **D-09: Only a successful generation starts the cooldown.** A failed share (network error, API 5xx) must be immediately retryable — throttling a user whose request never landed is a bug, not a safeguard.

### UX on rejection and throttle

- **D-10: Two distinct upload rejection messages, not one generic string.** Wrong extension / disallowed `file.type` keeps today's message (`'Please select a valid image file (PNG, JPG, or JPEG)'`). A signature mismatch gets its own: something to the effect of *"This file isn't a valid PNG or JPEG image."* The cost is one extra string; the benefit is that a user whose file has a correct-looking `.png` extension is not told to "select a PNG", which would be actively confusing. Both continue to surface through the existing `this.error` field in the modal — no new error channel.

- **D-11: The throttled share button reuses the existing `[disabled]` binding. No countdown UI, no timer text.** The button greys out and comes back after 5s. A visible countdown advertises a limit that is not protecting anything and would read as a far heavier restriction than it is.

### SEC-03 — Documentation

- **D-12: One new agent-facing rules file, matching the `state-serialization.md` pattern established in Phase 2.** The file is `.claude/rules/security.md`, with `paths:` frontmatter. One page. It must state: (a) adult-content filtering is cosmetic and client-side only — circumventable by inspecting network requests, and it is not an age gate; (b) upload MIME sniffing is a UX guard, not enforcement — a crafted request bypasses the frontend entirely, so real type/size limits require the backend; (c) the share-link cooldown is anti-fat-finger, not anti-abuse, and real rate limiting is backend-owned; (d) SVG is deliberately excluded from the upload allowlist and why. It must *point to* `REQUIREMENTS.md` §Out of Scope rows 85-86 as the authoritative backend-owned split rather than restating it — one source of truth, not two that can drift.

- **D-13: No user-visible in-app disclosure. No UI change on the adult-mode toggle.** SC#3 asks for "in-repo documentation" and D-12 delivers exactly that. Adding a user-facing notice would be net-new user-facing behavior in a milestone whose default posture is behavior-preserving, and the honest audience for "this filter is cosmetic" is a developer, not an end user.

- **D-14: `importFromFile` (`.msgpack` / `.json` state import) is OUT of scope.** SEC-01 is scoped to image upload. State import is user-initiated against the user's own file, already fails safe (malformed payloads throw and are caught), and that failure path gained coverage in Phase 5. Carried to Deferred Ideas.

### Phase baseline and testing

- **D-15: Do NOT run `pnpm install` during this phase.** STATE.md flags installed `@angular/core` 19.2.18 against a declared `^20.3.17`, deliberately unremediated in Phase 5 to avoid shifting the baseline its triage was calibrated against. The same reasoning holds harder here: the phase gate is a green suite, and churning the dependency tree risks 694 passing specs for zero security benefit. The drift stays recorded and open, to be settled at milestone close — not inside a security phase.

- **D-16: Close-out gate is the full suite green, consistent with Phase 5's D-16 zero-failure standard with no waiver mechanism.** New specs required: a util spec for the sniffer (valid PNG bytes, valid JPEG bytes, a spoofed buffer whose extension and `file.type` say PNG but whose bytes do not, and a too-short buffer), plus component-level specs for the upload reject path and for the cooldown window. Use Jasmine's clock for the cooldown rather than a real 5-second wait. No new integration spec — this phase does not warrant one.

### Claude's Discretion

The user declined to discuss any area and delegated all decisions, with the single explicit steer captured as D-00 (proportionality; overengineering is the failure mode to avoid). Every decision above is therefore Claude's judgment operating under that ceiling, and each is locked for planning purposes — they are recorded so the researcher and planner do not reopen them, not because the user weighed each one.

Genuinely open to the planner: exact wording of error strings and doc prose; whether the sniffer's byte-read helper sits inline in the component or in a tiny adjacent function; test-file naming. Not open: anything that enlarges scope past D-00's ruled-out list.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 6: Frontend Security Hardening" — the three success criteria this phase is graded against
- `.planning/REQUIREMENTS.md` lines 48-50 — SEC-01, SEC-02, SEC-03 wording
- `.planning/REQUIREMENTS.md` lines 85-86 (§Out of Scope) — the authoritative backend-owned split that the SEC-03 doc must reference rather than restate
- `.planning/codebase/CONCERNS.md` §"Security Considerations" — the original source of all three requirements; note its recommendations predate Phases 1-5 and its file/line pointers are stale

### Doc pattern to follow
- `.claude/rules/state-serialization.md` — the established agent-facing rules-file format (`paths:` frontmatter + markdown) that `.claude/rules/security.md` must match

### Code under change
- `src/app/components/upload-modal/upload-modal.component.ts` §`onFileSelected` (~line 150) — the single upload choke point; `ALLOWED_FILE_TYPES`/`MAX_FILE_SIZE` at lines 54-55
- `src/app/components/upload-modal/upload-modal.component.html` lines 14, 71 — the two file inputs, both bound to the same handler
- `src/app/app.component.ts` §`generateShareLink` (line 293) — existing in-flight guard; the cooldown lands here
- `src/app/app.component.html` lines 72-89 — the share button's existing `[disabled]` / loading / success states
- `src/app/services/state-export.service.ts` §`generateShareLink` (line 239) — the fetch call being throttled; do NOT put the throttle here (D-08)
- `src/app/utils/adult-content-filter.ts` — what SEC-03 is documenting as cosmetic

### Convention exemplars for the new util
- `src/app/utils/image-processing-core.ts` + `.spec.ts` — pure-util-with-spec convention
- `src/app/utils/category-normalization.ts` + `.spec.ts` — same, smaller

### Carried-forward state
- `.planning/STATE.md` §Blockers/Concerns — Angular version drift (D-15), plus two open items this phase does NOT own
- `.planning/phases/05-test-coverage-hardening/05-UAT.md` §Deferred Follow-Ups — the compare-modal resize bug, not Phase 6 work
- `CLAUDE.md` — Angular 20 standalone conventions, signals syntax, serialization invariant

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Existing `file.type` + size checks** (`upload-modal.component.ts:157-164`): already reject the ordinary wrong-file case. The signature sniff is an insertion between them, not a rewrite.
- **Existing in-flight share guard** (`app.component.ts:293-296` + `[disabled]` at `app.component.html:76`): the cooldown extends this same boolean-plus-disabled mechanism; no new UI state pattern needed.
- **`SnackbarService`** and the modal's `this.error` string field: both error channels already exist. Do not add a third.
- **Pure-util + spec convention** (`utils/image-processing-core.ts`, `utils/category-normalization.ts`, `utils/coordinate-transform.ts`): the template for `image-signature.ts`.
- **`.claude/rules/state-serialization.md`**: the doc format to clone for `security.md`.

### Established Patterns
- Errors surface via `this.error` in modals and `SnackbarService` globally (`CONVENTIONS.md` §Error Handling).
- Pure logic lives in `src/app/utils/` with a colocated `.spec.ts`; DI services live in `src/app/services/`. The sniffer is the former.
- Phase 5 set the standard that a spec must be able to fail — no assertion gated behind an `if` (CR-02/WR-01/WR-02 fixes, commit `2a317d1`). New specs here must hold that line, particularly the spoofed-buffer case.

### Integration Points
- `onFileSelected` in `upload-modal.component.ts` — one handler, both file inputs.
- `generateShareLink()` in `app.component.ts` — one caller, one button.
- `.claude/rules/` — new file, picked up by the same rules mechanism as `state-serialization.md`.

### Notable finding for the planner
Two of the three success criteria are partially satisfied already. SC#1's "not just a size check" is *half* true — a `file.type` check exists; what is missing is resistance to spoofing. SC#2's "rather than firing unlimited requests" is *already* true for concurrent requests — what is missing is a gap between sequential ones. Plan against the delta, not against a blank slate, and do not let a plan claim credit for behavior that shipped before this phase.

</code_context>

<specifics>
## Specific Ideas

The user's steer, in their framing: the site handles nothing sensitive, so this work is best-practice hygiene rather than risk reduction, and **overengineering for security is itself the bad outcome here**. That inverts the usual default — when in doubt on this phase, do less. A reviewer's "you could also harden X" is not automatically a gap; measure it against D-00 first.

</specifics>

<deferred>
## Deferred Ideas

- **`importFromFile` state-import hardening** (D-14) — validating `.msgpack`/`.json` state imports beyond the current extension check. Out of SEC-01's scope, already fails safe, covered in Phase 5.
- **Format allowlist expansion (WebP / AVIF)** (D-02) — a feature request, not a security fix; would need processing-pipeline verification.
- **Persisted or server-coordinated share-link rate limiting** (D-07) — requires the backend, which is out of this repo.
- **Everything on D-00's ruled-out list** (CSP, SRI, dependency-audit gates, sanitization dependencies, a throttle-service abstraction, a formal threat model) — recorded here so a later milestone can pick any of it up deliberately rather than it leaking into this phase.
- **Angular version drift** (D-15) — installed 19.2.18 vs declared `^20.3.17`; settle at milestone close, not here.

**Not this phase's work, but still open** (carried from Phase 5, listed so they are not mistaken for Phase 6 scope):
- Broken `Elf` model — `/assets/models/Elf.png` 404s while `src/assets/metadata/Elf.json` exists. Asset gap.
- Compare-modal panel positions not recomputed on width-only viewport resize (`compare-modal.component.ts:662`) — pre-existing from Phase 3 commit `47af8fc`.

</deferred>

---

*Phase: 6-Frontend Security Hardening*
*Context gathered: 2026-09-08*
