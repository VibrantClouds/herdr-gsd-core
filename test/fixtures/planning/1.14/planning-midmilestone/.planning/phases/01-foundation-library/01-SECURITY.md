---
phase: "01"
slug: "foundation-library"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-14"
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| npm registry to workspace | Every dependency and its install script crosses here | Third-party code / build-time |
| user input to DOM | Character names and fields typed by the user are rendered | User text / low |
| Cloudflare edge to browser | Response headers (CSP) govern what the page may load | Headers / integrity |
| IndexedDB record to app state | Stored records are untrusted until validateCharacter passes | Character documents / low (on-device) |
| Share payload to server (Phase 3) | sharePayloadSchema is the shared validator for untrusted client JSON | Share payloads / future |
| prefs store to ThemeService | Stored preference values are untrusted until validated | Theme choice / low |
| Browser to Google Fonts | Third-party stylesheet and font request | IP and user agent only |
| URL route param to IndexedDB lookup | `characterId` is user-controllable text | Route id / low |
| Keyboard/paste input to stored document | Free text typed or pasted into the masthead | User text / low |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-SC | Tampering | npm/pnpm installs | high | mitigate | `pnpm-workspace.yaml`: `engineStrict: true`; `allowBuilds` esbuild, workerd, @parcel/watcher true, lmdb and msgpackr-extract false. @parcel/watcher is justified in 01-01-SUMMARY. Declared deps are the audited set plus the Angular CLI scaffold's `tslib` and `prettier`, neither of which runs an install script. | closed |
| T-01-01-01 | Tampering | LibraryPage name rendering | medium | mitigate | No `innerHTML`, `outerHTML`, `bypassSecurityTrust` or `DomSanitizer` in `apps/web/src`. | closed |
| T-01-01-02 | Tampering | clickjacking of the SPA | medium | mitigate | `apps/web/_worker.js` CSP `frame-ancestors 'none'`; asserted by `apps/web/scripts/smoke-worker.mjs:75`. | closed |
| T-01-01-03 | Information Disclosure | injected-script exfiltration | medium | mitigate | CSP `script-src 'self'`, `connect-src 'self'`; no HttpClient, fetch, XHR, WebSocket, EventSource or sendBeacon in app or schema source. | closed |
| T-01-01-04 | Information Disclosure | plaintext IndexedDB on the device | low | accept | See Accepted Risks Log AR-01. | closed |
| T-01-01-05 | Information Disclosure | committed secrets or local Worker state | low | mitigate | `.gitignore:4` ignores `.wrangler/`; Phase 1 stores no secrets. | closed |
| T-01-02-01 | Tampering | docs/specs edits | low | accept | See Accepted Risks Log AR-02. | closed |
| T-01-02-02 | Information Disclosure | git staging of the untracked docs/ tree | low | mitigate | 01-02 commits staged spec files by path. The wider `docs/` tree is tracked through a separate, deliberate baseline commit `b8b1cd9`, not through 01-02 staging. | closed |
| T-01-03-01 | Tampering | validateCharacter / characterSchema | medium | mitigate | `packages/schema/src/migrate.ts:111`: root shape and envelope/plugin version membership checked before `migrateEnvelope`; `characterSchema.safeParse` runs last and rejects the whole record. `shortText` in `character.ts` caps length and rejects control characters. | closed |
| T-01-03-02 | Denial of Service | compareVersions | low | mitigate | `supportedVersions.includes` precedes migration; `compareVersions` throws TypeError unless MAJOR.MINOR.PATCH (`migrate.ts:37`). | closed |
| T-01-03-03 | Tampering | object parsing of stored/imported JSON | medium | mitigate | Checked at audit time against installed zod 4.6.2: a parsed JSON payload with an own `__proto__` key and an unknown key came back with neither key, `Object.prototype` intact, and no pollution. No regression spec exists in the repo. | closed |
| T-01-03-04 | Information Disclosure | error messages | low | mitigate | `UnsupportedVersionError` carries only space and version; `InvalidDocumentError` carries only issue paths. | closed |
| T-01-03-05 | Tampering | sharePayloadSchema budget | medium | mitigate | `packages/schema/src/share.ts`: `.max(SHARE_IMAGES_MAX)` (60) and a refine on summed bytes `<= SHARE_IMAGE_BYTES_MAX` (31457280 = 30 MiB). | closed |
| T-01-04-01 | Tampering | ThemeService.init | low | mitigate | `theme.service.ts:8-29`: `isThemeChoice` against `['system','light','dark']`, fallback `'system'`. | closed |
| T-01-04-02 | Information Disclosure | Google Fonts request | low | accept | See Accepted Risks Log AR-03. | closed |
| T-01-04-03 | Information Disclosure | storage error surfacing | low | mitigate | `app.component.ts:39` shows only `STORAGE_UNAVAILABLE_MESSAGE`; `native-indexeddb.service.ts:113` logs with a `[NativeIndexedDBService]` prefix. | closed |
| T-01-04-04 | Denial of Service | in-memory mode | low | accept | See Accepted Risks Log AR-04. | closed |
| T-01-05-01 | Tampering | LibraryPage rendering of names | medium | mitigate | Interpolation only; no raw-HTML binding in `apps/web/src`. | closed |
| T-01-05-02 | Tampering | Delete action | medium | mitigate | `library-page.component.ts:32` names the character in `window.confirm` before `store.remove`; cancel path covered by `library-page.component.spec.ts:96` and confirmed live in 01-UAT test 3. | closed |
| T-01-05-03 | Denial of Service | large libraries | low | accept | See Accepted Risks Log AR-05. | closed |
| T-01-06-01 | Tampering | CharacterPage route param | low | mitigate | `character-page.component.ts:48` runs `characterCoreSchema.shape.id.safeParse` before `store.load`. | closed |
| T-01-06-02 | Tampering | CharacterHeader input | medium | mitigate | `[attr.maxlength]` on short fields, code-point truncation of the name (`character-header.component.ts:45`), `stripControlCharsExceptTabAndNewline` on input, `characterSchema.parse` in `character.repo.ts:60` before every write. | closed |
| T-01-06-03 | Denial of Service | autosave on tab close | medium | mitigate | `character.store.ts:55-63` flushes on `visibilitychange` (hidden) and `pagehide`; covered by `character.store.spec.ts:142,155`. | closed |
| T-01-06-04 | Information Disclosure | load-error messages | low | mitigate | `character-page.component.ts:47-67` shows fixed NOT_FOUND / UNSUPPORTED_VERSION / INVALID_DOCUMENT messages; unexpected errors go to `console.error` with a `[CharacterPage]` prefix. | closed |
| T-01-06-05 | Tampering | masthead rendering | medium | mitigate | Property binding and interpolation only; no raw-HTML binding in `apps/web/src`. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-01-04 | ADR-0006: no client-side encryption in the product; data never leaves the device in Phase 1. | Plan 01-01 (ADR-0006) | 2026-09-11 |
| AR-02 | T-01-02-01 | Prose-only change to three spec files, reviewed by commit diff, no runtime effect. | Plan 01-02 | 2026-09-11 |
| AR-03 | T-01-04-02 | ADR-0015 and SPEC-design-system 1.2 chose Google Fonts; request reveals only IP and user agent; CSP limits font/style hosts. | Plan 01-04 (ADR-0015) | 2026-09-11 |
| AR-04 | T-01-04-04 | In-memory fallback loses data on tab close by design; a sticky notice warns the user first. | Plan 01-04 | 2026-09-11 |
| AR-05 | T-01-05-03 | Hobby scale (~30 KB per character); whole-list render is acceptable and virtual scrolling is not required. | Plan 01-05 | 2026-09-11 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-14 | 25 | 25 | 0 | /gsd-secure-phase orchestrator (ASVS L1 grep-depth; register authored at plan time, auditor short-circuited) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-14
