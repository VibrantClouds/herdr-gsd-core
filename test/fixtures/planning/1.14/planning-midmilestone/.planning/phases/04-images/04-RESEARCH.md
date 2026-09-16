# Phase 4: Images - Research

**Researched:** 2026-09-15
**Domain:** Client-side image compression/dedup pipeline, S3/CloudFront-backed image CDN, Gallery sub-document plugin
**Confidence:** HIGH (this phase's stack, data shapes, and server contract are already fully specified in canonical docs and largely implemented on the server side; the gap is almost entirely new client code plus one new server route)

## Summary

Phase 4 has unusually little technology risk: every compression ratio, size cap, S3 key, HTTP status code, and publish sequence is already pinned in `SPEC-image-pipeline.md`, `SPEC-gallery-and-portrait.md`, `SPEC-storage-s3.md`, `SPEC-share-api.md` and ADR-0012, and this session verified all of them against the actual spec text (not paraphrase). A large share of the server-side contract (`POST /shares`'s image manifest/budget/blocked checks) is **already implemented and working** in `apps/api/src/routes/shares.ts` — verified by reading the file directly. What Phase 4 actually builds is: (1) a new client-side compression pipeline in a Web Worker with a main-thread fallback, mirroring a reference implementation (`SizeComparisonSite`) that this session read directly at `/home/user/Development/SizeComparisonSite/src/app/workers/` and `.../utils/`; (2) the `gallery` sub-document plugin (schema half + UI half), the second real plugin after `intimacy`; (3) one new server route file, `apps/api/src/routes/images.ts`, whose every check is already fully specified and can reuse the existing `ObjectStore`/`S3ObjectStore` interface unchanged; (4) a portrait UI rework in `character-header.component.html/scss`, which this session read directly and confirmed is currently a bare monogram box with no button semantics; (5) an AWS CloudFront/ACM/DNS human-checkpoint plan pulled forward from Phase 7 (D-01); and (6) a shared lightbox component.

The single largest technical risk this session found and is not yet written down anywhere in the specs is **zone dependence in the Web Worker service**. The reference implementation this project is told to mirror (SizeComparisonSite) runs zone.js and wraps every `worker.onmessage`/`onerror` handler in `NgZone.run(...)`. Character Dossier is zoneless (ADR-0016, verified). Porting the `NgZone.run()` wrapper verbatim is not merely unnecessary — it is a maintenance trap that signals zone-thinking that doesn't apply here; the correct zoneless pattern is for the worker callback to write directly into a `signal()` (e.g. the upload/processing status map), which self-notifies Angular's change-detection scheduler with no zone or explicit `ApplicationRef.tick()` needed. This is detailed under Common Pitfalls.

Three additional documented-inconsistency findings from this session, all independently verified by reading the actual files (not the specs' claims about them): the `_worker.js` Content-Security-Policy's `img-src` directive does **not** yet include `https://img.characterdossierlab.app` (CONTEXT.md's code_context section asserts it already does — this is stale/wrong and must be added this phase); `docker-compose.yml`'s MinIO bucket-init step does **not** yet set an anonymous-read policy on `images/*` (D-02 requires this and it must be added); and `SPEC-security-and-abuse.md` §1 still states "SVG, GIF, PNG rejected (`415`)" for server-side image type sniffing, which D-10 explicitly overrides for GIF and which the phase must update. None of these are hard problems — each is a small, mechanical fix — but a planner relying only on the CONTEXT.md summary would miss all three, since CONTEXT.md's own code_context section asserts two of them are already done.

**Primary recommendation:** Build the worker pipeline as a direct, function-for-function structural mirror of SizeComparisonSite's `image-processing.protocol.ts` / `image-processing.worker.ts` / a new pure-function core module (following its `image-processing-core.ts` shape), but drop `NgZone` entirely from the main-thread service and drive all UI state through signals; reuse `apps/api/src/object-store.ts`'s existing `ObjectStore` interface unchanged for the new `images.ts` route; and treat the CloudFront/DNS/CSP/MinIO-policy work as a first-class, sequenced set of tasks rather than an assumed-done prerequisite.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Image decode/compress/hash | Browser (Web Worker + main-thread fallback) | — | `SPEC-image-pipeline.md` §1: hash is of stored bytes; must happen before any network call |
| Local image dedup (IndexedDB `images` store) | Browser | — | Content-addressed lookup, no server round-trip (`SPEC-image-pipeline.md` §3) |
| Gallery editor UI (add/caption/reorder/remove) | Browser (Angular, `apps/web/src/app/subdocs/gallery/`) | — | Follows the existing `SubDocumentEditor` contract (`SPEC-subdocument-plugin-contract.md`) |
| Portrait UI (frame, button, hover overlay) | Browser (`character-header.component`) | — | Lives on `CharacterCore`, not a page; rendered by the shared header component |
| Lightbox | Browser (shared component) | — | Gallery-agnostic per D-12, reused by future plugin types |
| Budget estimate / gate before publish | Browser (`SectionSelector`, `ShareStore.checkLocalBudget`) | API (authoritative recheck) | Client is a UX guard only; `SPEC-share-api.md` §4.1 steps 8–9 are the enforced control |
| `POST /images/exists`, `PUT /images/:hash` | API (`apps/api/src/routes/images.ts`, new) | S3/MinIO via existing `ObjectStore` | Server never trusts client-declared size/type/hash (`SPEC-image-pipeline.md` §6) |
| Image manifest / budget verification on publish | API (`apps/api/src/routes/shares.ts`, **already implemented**) | — | Verified by reading the file: steps 7–9 of `SPEC-share-api.md` §4.1 are live code today |
| Image bytes storage | S3 (prod) / MinIO (dev) | CloudFront (prod only) | `SPEC-storage-s3.md` §2/§4 |
| Public image delivery | CloudFront (`img.characterdossierlab.app`) | S3 origin (via OAC) | New in this phase (D-01); MinIO direct-serve in dev (D-02) |
| Envelope schema widening (`ImageRef.mime`) | Schema package (`packages/schema/src/character.ts`) | — | Envelope-owned type per ADR-0011; see Pitfall on version bump (below) |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GALL-01 | Add images to a Gallery page, caption, reorder, remove | `SPEC-gallery-and-portrait.md` Gallery section; `apps/web/src/app/subdocs/plugin.ts` contract (verified); `intimacy` plugin as structural precedent (verified) |
| GALL-02 | Client re-encode to WebP with size/edge targets, EXIF stripped | `SPEC-image-pipeline.md` §2 (compression ladder table); SizeComparisonSite `offscreen-image-processor.ts`/`image-processing-core.ts` (verified, read directly) for the OffscreenCanvas/`convertToBlob` pattern |
| GALL-03 | Content-addressed local dedup by SHA-256 | `SPEC-image-pipeline.md` §3; `images` IndexedDB store already exists at DB v1, keyPath `hash` (verified in `indexeddb-config.ts`) |
| GALL-04 | Portrait through the same pipeline, shown in header | `SPEC-gallery-and-portrait.md` Portrait section; `character-header.component.html` currently a bare `aria-hidden` monogram box (verified, must be reworked per D-05/D-06) |
| IMG-01 | Publish uploads only missing hashes, concurrency 3, retries, per-image progress | `SPEC-image-pipeline.md` §5; `SPEC-share-api.md` §8 (client sequence) |
| IMG-02 | Server rejects hash/type/size/dimension violations | `SPEC-share-api.md` §4.6; new `apps/api/src/routes/images.ts` reusing existing `ObjectStore.putIfAbsent` (412→`created:false`, verified in `apps/api/src/s3.ts`) |
| IMG-03 | Server refuses share with missing/oversized images | **Already implemented** — verified by reading `apps/api/src/routes/shares.ts` lines 108–130 (manifest match, blocked/missing HEAD checks, budget sum) |
| SHARE-11 | Pre-publish size estimate, budget refusal, no network on failure | `checkLocalBudget` in `share.store.ts` **already implemented and enforced** (verified); this phase is UI surfacing (`showSizeEstimate` in `SectionSelector`), not new enforcement logic |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` or `./.claude/CLAUDE.md` file exists in this repository (checked this session). No project-specific directives beyond the ADRs/specs already covered above.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-00 (project-level correction):** Audience is ~50% desktop / 50% phone. Desktop is first-class, not secondary. `PROJECT.md`'s "Most sessions are on a phone" line is now wrong and must be corrected in this phase.
- **D-01:** CloudFront distribution, ACM certificate, and `img.characterdossierlab.app` CNAME are stood up in Phase 4 as a human-checkpoint plan mirroring Phase 3's `03-07`/`03-08`. Pulls the CloudFront half of OPS-03 forward; OPS-03's billing alarm and offline sweep script stay in Phase 7 (Phase 7's roadmap entry must be updated to say so). Share payloads store only `{hash, mime, bytes, width, height}` — the absolute URL is built client-side from `environment.imgBaseUrl`, so moving the CDN host later is a config change, not a broken-link event.
- **D-02:** Local dev resolves images through MinIO with an anonymous-read policy on `images/*` for `character-dossier-dev`, applied by the existing `docker-compose.yml` init step. `IMG_BASE_URL=http://localhost:9000/character-dossier-dev/images`. Rejected: the `GET /dev/images/:hash` presigned shim in `SPEC-deployment.md` §5 — update that doc instead.
- **D-03:** A share-page `<img>` that fails to load renders a muted placeholder tile at the stored `width`/`height` reading "Image unavailable", caption still shown beneath, no layout shift. A blocked hash is indistinguishable from a network failure (consistent with Phase 3's D-12). No page-level banner.
- **D-04:** Phase 4 ends live on both a phone and a desktop browser, in a final human-checkpoint plan mirroring `03-08`, widened from phone-only per D-00.
- **D-05:** `.portrait-frame` keeps one fixed bounded size per breakpoint (~180px tall at 400px width, ~240px on desktop — exact values to the planner within the design tokens); image letterboxes via `object-fit: contain`.
- **D-06:** Edit-mode frame is both a `<button>` (fills the frame; click/Enter/Space/drop) and, under `@media (hover: hover) and (pointer: fine)`, a translucent hover/`:focus-visible` scrim reading "Replace portrait" / "Add portrait" (presentational only — click anywhere still opens the picker). Remove is a separate small button, a DOM sibling of the frame button, in the frame's corner, revealed by the same hover/focus rule on desktop; on touch, Replace/Remove sit beneath the frame as a persistent pair. The frame's `aria-hidden="true"` must be removed in edit mode, kept in view mode.
- **D-07:** Blobs orphaned by replacing a portrait or removing a gallery item are left in the `images` store — no local GC (consistent with ADR-0012). `SPEC-gallery-and-portrait.md`'s "until the lazy local GC runs" wording is corrected to say there is none in v1.
- **D-08:** Multi-file add shows a skeleton card per file immediately, in grid order, filling in as each `ImageRef` resolves. Files processed sequentially through the worker (not concurrently) so a mid-range phone isn't decoding eight bitmaps at once. Editor stays fully live throughout — no blocking modal.
- **D-09:** Per-file outcomes reported inline on the card, plus one summary toast at the end of the batch (refines the spec's "toast naming the file" wording, which would produce up to eight transient toasts). Failed file → persistent error card (filename, reason, dismiss). Duplicate hash → marker on the existing row, not a new card. One summary toast, e.g. "6 added · 1 duplicate · 1 couldn't be processed".
- **D-10:** Animated images (GIF, animated WebP) are preserved, not flattened — **overrides** `SPEC-image-pipeline.md` §2 step 3, which must be rewritten this phase. An animated input bypasses the compression ladder entirely and is stored as-is:
  - `ImageRef.mime` gains `'image/gif'` in `packages/schema/src/character.ts`; `imageObjectKey` in `apps/api/src/routes/shares.ts` and `SPEC-storage-s3.md` §2 gain `.gif`.
  - `PUT /images/:hash` gains a GIF magic-byte sniff (`47 49 46 38` = `GIF8`) and header dimension parse (little-endian u16 width at bytes 6–7, height at bytes 8–9).
  - The 1.5 MiB per-image cap and 2048px edge cap still apply and are **not** raised — there is no compression path to get an animated file under them.
  - EXIF stripping does not apply to GIF; upload-UI privacy wording must stay true for animated files.
  - **Reversibility: one-way.** Widening `ImageRef.mime` changes the envelope schema every stored/published document validates against. **Open question resolved by this research below** (see Common Pitfalls) — a `CHARACTER_SCHEMA_VERSION` bump is owed per the mechanical rule in `SPEC-serialization-policy.md`.
- **D-11:** An animated file over 1.5 MiB produces an error card offering one action: "Add as a still image" (runs normal first-frame compression, stores WebP/JPEG). Rejected: silent auto-flattening, and outright rejection.
- **D-12:** Lightbox is built in Phase 4 as a shared, gallery-agnostic component under `apps/web/src/app/components/`, opens from the grid in **both** view and edit mode. Desktop: `←`/`→`, `Escape`, click-outside, CDK focus trap with focus restore (model: existing `Modal` component, verified — see Code Examples). Touch: swipe.

### Claude's Discretion

- The entire budget and upload-progress UI (SHARE-11 + IMG-01 presentation): turn on `showSizeEstimate` in `SectionSelector`, render "3 pages, 14 images, 4.2 MB", render upload progress from `signal<Map<hash, 'pending'|'uploading'|'done'|'failed'>>` as a per-image strip. A hash still failed after 3 retries aborts the publish before `POST /shares`. Exact placement/wording/whether over-budget disables-vs-errors-on-click is free, provided no network request happens when the local budget check fails.
- Exact frame pixel values within design tokens (D-05); grid column count above 1200px.
- Whether animated images are permitted as portraits — default **yes, same rules**.
- Alt-text (`ImageRef.alt`, ≤200 chars) entry UI, or deferring it.
- Worker message protocol shape, mirroring SizeLab's split; check for zone-dependence.
- How gallery item reorder interacts with Phase 2's page-collapse-on-drag (different `cdkDropList`s).
- Where `navigator.storage.persist()` on first image write lives relative to the Phase 1 call on first character write.

### Deferred Ideas (OUT OF SCOPE)

- Animated-image support in print output (Phase 6 — confirm it reads acceptably as first frame).
- Owner-link image materialization (`SPEC-image-pipeline.md` §7's download-and-verify path) — SHARE-05, Phase 5. The D-03 broken-tile component is meant to be reused there.
- `blocked/<hash>` sentinel **writing** (the takedown CLI) — SEC-03, Phase 7. Phase 4 only *reads* the sentinel.
- Rate limiting the two image endpoints — SEC-01, Phase 7. Limits are specified (120/h both, plus 100 MiB summed Content-Length on PUT) but the limiter itself is not built this phase.
- Thumbnails (THMB-01) and automatic GC (GC-01) — explicitly v1-excluded.
</user_constraints>

## Standard Stack

No new runtime dependencies are needed for this phase. Everything is built on native browser APIs and the already-installed toolchain.

### Core (already installed — verified in package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@angular/core`, `@angular/cdk` | `^22.1.0` / `^22.1.6` | Signals, standalone components, `cdk/drag-drop` for gallery reorder | Already the project's only UI dependency (ADR-0016) |
| `@aws-sdk/client-s3` | `^3.1131.0` | S3/MinIO object operations | Already used by `apps/api/src/s3.ts`; no new client needed for `images.ts` |
| `zod` | `^4.6.2` | `ImageRef` schema, `PUT /images` request validation shape reuse | Already the project's validation library |
| Native `createImageBitmap`, `OffscreenCanvas`, `crypto.subtle.digest` | browser built-in | Decode, scale, re-encode, hash | ADR-0012 explicitly rejects a bundled WASM encoder; native canvas WebP encode is sufficient (Chrome/Edge/Firefox/Safari 16+) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| none new | — | — | This phase adds zero new npm dependencies to `apps/web` or `apps/api` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canvas WebP encode | Bundled WASM WebP encoder (e.g. `@jsquash/webp`) | Rejected in ADR-0012 — ~300KB bundle cost to cover older Safari's JPEG fallback, not worth it for v1 |
| Manual header-only dimension parse (WebP/JPEG/GIF) | `image-size` / `probe-image-size` npm package | Server explicitly does not decode images (`SPEC-security-and-abuse.md` — decode-on-server is a DoS vector); the header parse is a few bytes of arithmetic already specified exactly in `SPEC-image-pipeline.md` §6 and D-10, not worth a dependency |
| Server-side rate limiting on image routes | `hono-rate-limiter` or similar | Explicitly deferred to Phase 7 (SEC-01); do not add now |

**Installation:** none — no new packages this phase.

**Version verification:** N/A (no new packages).

## Package Legitimacy Audit

**No external packages are introduced by this phase.** The Package Legitimacy Gate does not apply — image compression uses only native browser APIs (`createImageBitmap`, `OffscreenCanvas`, `crypto.subtle`), and the server route reuses the existing `@aws-sdk/client-s3`-backed `ObjectStore` abstraction already present in `apps/api/src/object-store.ts` and `apps/api/src/s3.ts` (both verified this session). If the planner considers a WASM WebP encoder or an image-metadata npm package during planning, run the Package Legitimacy Gate protocol at that time — none is recommended by this research.

**Packages removed due to [SLOP] verdict:** none (none proposed).
**Packages flagged as suspicious [SUS]:** none (none proposed).

## Architecture Patterns

### System Architecture Diagram

```
[File input / drop]                              [Portrait replace]
        │                                                 │
        ▼                                                 ▼
  UX guard: reject if >25MiB or unsupported type (client only)
        │
        ▼
  createImageBitmap(file, {imageOrientation:'from-image'})  ← bakes in EXIF rotation
        │
        ├── animated (GIF / animated WebP)? ──yes──► store as-is if ≤1.5MiB (D-10)
        │                                              │ else → error card, "Add as still image" (D-11)
        │no
        ▼
  Web Worker (OffscreenCanvas) ──fails/unsupported──► main-thread <canvas> fallback
        │
        ▼
  scale to max edge (portrait 1024 / gallery 2048)
        ▼
  convertToBlob({type:'image/webp', quality})  ── Safari-PNG-fallback detected? → re-encode JPEG q0.82
        ▼
  quality step-down ladder, then edge step-down if still over target
        ▼
  crypto.subtle.digest('SHA-256', bytes) → hex hash
        ▼
  IndexedDB `images` store  (dedup: hash already present? → reuse row, no re-write)
        ▼
  ImageRef embedded in Character (core.portrait or gallery item)
        │
        │  ... later, on Publish ...
        ▼
  buildSharePayload → collectAllImageRefs → checkLocalBudget (no network on failure)
        ▼
  POST /images/exists {hashes}  →  {missing[], blocked[]}
        ▼
  PUT /images/:hash  (concurrency 3, retry 3×) for each missing hash
        │                                          ▲
        │                              apps/api/src/routes/images.ts (NEW):
        │                              Content-Length ≤1.5MiB → blocked sentinel check →
        │                              magic-byte sniff (WebP/JPEG/GIF) → dimension parse
        │                              (≤2048px) → sha256(body)===:hash → PutObject
        │                              If-None-Match:* (reuses exist

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 58612 bytes -->
