---
phase: 06
slug: frontend-security-hardening
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-09
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register origin: authored at plan time (all three of `06-01/02/03-PLAN.md` carry a parseable
`<threat_model>` block). No `## Threat Flags` were raised in any SUMMARY during execution.
Assessed at ASVS L1 with `security_block_on: high`, proportionate to a frontend-only SPA with no
authentication, no user accounts, no PII and no payments (D-00).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| local filesystem → browser app | A user-chosen file crosses into the upload pipeline. Its name, extension and `type` are all attacker-controllable metadata. | Arbitrary user-supplied bytes; no PII |
| browser app → Cloudflare Worker `generateShareLink` | Requests leave the app. The client controls how many it sends; the server controls how many it accepts. Only the first half is in this repo. | User-selected viewport models (MessagePack); no PII, no credentials |
| repo → future contributors | Documentation asserting what the client-side guards do and do not guarantee. | Claims of coverage |

The server side of boundary 2 lives in the Cloudflare Worker API, **outside this repo**. No
server-side trust boundary is enforceable from this codebase.

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-01 | Spoofing | `UploadModalComponent.onFileSelected` | medium | mitigate | `sniffImageSignature` reads the file's actual leading bytes between the type-allowlist and size checks, so a `.txt` renamed `.png` is rejected regardless of declared metadata. `src/app/utils/image-signature.ts`; call site `upload-modal.component.ts:175` | closed |
| T-06-02 | Tampering | `UploadImagePipelineService.processFile` | medium | mitigate | Non-PNG/JPEG bytes are rejected before reaching decode/crop/compress. The byte read is wrapped in try/catch and a rejected read takes the same rejection path — fail-closed, never falls through to acceptance (`upload-modal.component.ts:169-178`) | closed |
| T-06-03 | Denial of Service | image-processing worker / main thread | low | accept | See Accepted Risks R-06-01 | closed — below high threshold (non-blocking) |
| T-06-04 | Information Disclosure | the D-10 rejection message | low | accept | See Accepted Risks R-06-02 | closed — below high threshold (non-blocking) |
| T-06-05 | Denial of Service | `StateExportService.generateShareLink` → Worker endpoint | low | mitigate (partial, client-side only) | 5s post-success cooldown on top of the pre-existing `isGeneratingShareLink` in-flight guard (`app.component.ts:45,48,298,340,342`; `app.component.html:76`). A UX guard, not a control — trivially bypassed by calling the endpoint directly | closed |
| T-06-06 | Information Disclosure | share-link payload | low | accept | See Accepted Risks R-06-03 | closed — below high threshold (non-blocking) |
| T-06-07 | Tampering | the cooldown flag itself | low | accept | See Accepted Risks R-06-04 | closed — below high threshold (non-blocking) |
| T-06-08 | Repudiation | future contributors / this repo's own record | medium | mitigate | `.claude/rules/security.md` states in-repo that MIME sniffing and the share cooldown are client-side UX guards, and points at `.planning/REQUIREMENTS.md` §Out of Scope for what the backend still owes. 5 sections present; no mechanism is called "enforcement", "protection", "a security control" or "an age gate" | closed |
| T-06-09 | Information Disclosure | `src/app/utils/adult-content-filter.ts` | low | accept | See Accepted Risks R-06-05 | closed — below high threshold (non-blocking) |
| T-06-10 | Tampering | the documentation itself | low | accept | See Accepted Risks R-06-06 | closed — below high threshold (non-blocking) |
| T-06-SC | Tampering | package-manager installs | low | accept | See Accepted Risks R-06-07 | closed — below high threshold (non-blocking) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

No threat in this phase is rated high or critical. All four `mitigate` threats
(T-06-01, T-06-02, T-06-05, T-06-08) were verified present in the landed implementation.

### Runtime evidence beyond static verification

T-06-01, T-06-02 and T-06-05 were additionally exercised in a real browser during Phase 06 UAT
(see `06-UAT.md`), not only grep-verified:

- **T-06-01/02** — a text file named `spoofed.jpg` was offered through the real `<input type="file">`
  change event. The browser itself reported `file.type === "image/jpeg"`, so the `ALLOWED_FILE_TYPES`
  allowlist passed and the magic-byte sniffer is what rejected it. Rejected in 4/4 spoof cases across
  both upload types and both file inputs; 4/4 genuine PNG/JPEG still accepted. On rejection neither the
  preview nor the name field populated, confirming the guard returns before any pipeline work.
- **T-06-05** — 10 rapid clicks over 1.5s produced exactly **one** POST to `/generateShareLink`
  (9 of 10 suppressed), measured at a stubbed local endpoint. Cooldown released at ~5.0-5.1s wall-clock
  on both desktop and mobile viewports.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-06-01 | T-06-03 | A crafted but correctly-signed large image can still consume processing time. The existing 10MB cap bounds it, and the attacker and victim are the same browser session. Real size enforcement is backend-owned — `.planning/REQUIREMENTS.md` §Out of Scope. A decode probe was explicitly rejected (D-01). | Phase 06 plan (D-01) | 2026-09-09 |
| R-06-02 | T-06-04 | The rejection message is a fixed literal interpolating no filename or file content, so it cannot echo user-controlled text into the DOM. Angular template interpolation escapes by default regardless. | Phase 06 plan (D-10) | 2026-09-09 |
| R-06-03 | T-06-06 | The share payload carries only viewport models the user selected themselves, and link generation is explicitly user-initiated. Unchanged by this phase; TTL/GC is backend-owned. | Phase 06 plan | 2026-09-09 |
| R-06-04 | T-06-07 | `shareOnCooldown` is an in-memory boolean any user can flip in devtools or bypass with a reload. D-07 chose in-memory precisely so the app does not pretend otherwise; persisting it would imply an enforcement guarantee the frontend cannot make. | Phase 06 plan (D-07) | 2026-09-09 |
| R-06-05 | T-06-09 | Adult-classified models are filtered in the browser after the full list is fetched, so the filtered set is observable in network traffic and in-memory state. Accepted and documented as cosmetic; a real age gate is backend-owned. D-13 rules out a user-visible notice. | Phase 06 plan (D-13) | 2026-09-09 |
| R-06-06 | T-06-10 | Documentation can go stale. Partially mitigated by grounding every claim in a named file path and referencing (not copying) the requirements table. The one drift-prone number (cooldown duration) is called out as a backstop truth. | Phase 06 plan | 2026-09-09 |
| R-06-07 | T-06-SC | No dependency was added anywhere in Phase 06. D-15 forbids `pnpm install` for the whole phase and the new util is dependency-free (zero imports), so no supply-chain surface was created and no package legitimacy audit is owed. | Phase 06 plan (D-15) | 2026-09-09 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-09 | 11 | 11 | 0 | Claude (/gsd-secure-phase, L1 short-circuit — register authored at plan time, asvs_level 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-09
