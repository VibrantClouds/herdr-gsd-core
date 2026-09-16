# Phase 4: Images - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Delivers the client-side image pipeline (`apps/web/src/app/images/`: decode → scale → re-encode → EXIF strip → SHA-256 → IndexedDB `images` store, in a Web Worker with a main-thread fallback); the `gallery` plugin as the second real sub-document type (schema half in `packages/schema/src/plugins/gallery/`, editor + view mode in `apps/web/src/app/subdocs/gallery/`); the portrait on `CharacterCore` wired through the same pipeline; `POST /images/exists` and `PUT /images/:hash` on `apps/api`; the size estimate and budget gate in the existing `SectionSelector`; and the CloudFront distribution serving `img.characterdossierlab.app`. Requirements: GALL-01, GALL-02, GALL-03, GALL-04, IMG-01, IMG-02, IMG-03, SHARE-11.

Not in this phase: living links, republish, owner-link image materialization (Phase 5 — but see the note in `<deferred>`); print stylesheet and print column collapse (Phase 6); rate limiting on the image endpoints, the takedown CLI that writes `blocked/<hash>`, the AWS billing alarm, and the offline sweep script (Phase 7 / OPS-03, SEC-01, SEC-03); thumbnails (THMB-01, v2); automatic garbage collection (GC-01, v2).

**Already built in Phase 3 — verify, do not rebuild:** `POST /shares` already implements the whole server half of IMG-03. `apps/api/src/routes/shares.ts` does the manifest-vs-referenced-hashes match (`IMAGE_MANIFEST_MISMATCH`), parallel `HEAD blocked/<hash>` (`IMAGE_BLOCKED`), parallel `HEAD images/<hash>.<ext>` (`IMAGE_MISSING`), and the summed `Content-Length` budget check (`BUDGET_EXCEEDED`). The `images` IndexedDB store (keyPath `hash`) exists in `indexeddb-config.ts` at DB v1 — **no version bump needed**. `collectAllImageRefs`, `imageRefSchema`, and every limit constant already exist and are already enforced client-side in `ShareStore.checkLocalBudget`. Phase 4's IMG-03 work is proving this path with real images, not writing it.

The compression ladders and max edges, the worker/fallback split, the `PUT /images/:hash` server check order, the `GalleryV1` shape and its caps, the S3 key scheme, and the publish sequence (concurrency 3, retry 3× at 500ms/2s/8s) are all already fixed by the specs under canonical refs. The decisions below cover only what those docs left open, or where this discussion changes them.

</domain>

<decisions>
## Implementation Decisions

### Project-level correction (applies beyond this phase)
- **D-00:** The audience split is roughly **50% desktop / 50% phone** — desktop is a first-class target, not a secondary pass. This **supersedes** `PROJECT.md`'s "Most sessions are on a phone", which is now wrong and must be corrected in this phase. Consequences already applied below: D-04 verifies on both, D-06 gives desktop a hover affordance, D-11 makes the lightbox keyboard-first.

### Image delivery
- **D-01:** The **CloudFront distribution, the ACM certificate and the `img.characterdossierlab.app` CNAME are stood up in Phase 4**, as a human checkpoint plan in the shape of Phase 3's `03-07` (AWS console) and `03-08` (DNS + live smoke). `SPEC-deployment.md` §6 steps 4/5/7 and the bucket-policy statement in `SPEC-storage-s3.md` §4 are already written for it. This pulls the CloudFront half of OPS-03 forward; **OPS-03's remaining parts — the $10/mo billing alarm and the offline sweep script — stay in Phase 7**, and Phase 7's entry must be updated to say so. Rationale: `IMG_BASE_URL` is already set to `https://img.characterdossierlab.app` on Railway and every share-page image URL is built from it, so without this the phase ships uploads that render as broken images and nothing in GALL/IMG can be verified end to end until Phase 7.
  - Note for planning: share payloads store only `{hash, mime, bytes, width, height}` — the absolute URL is built client-side at render time from `environment.imgBaseUrl` (`SPEC-image-pipeline.md` §7). Moving the CDN host later is therefore a config change and a redeploy, **not** a break of already-published links. This is unlike D-15's app-origin decision in Phase 3.
- **D-02:** Local dev resolves images through **MinIO with an anonymous-read policy on `images/*`** for the `character-dossier-dev` bucket, applied by the existing `docker-compose.yml` init step that already creates the bucket. `IMG_BASE_URL=http://localhost:9000/character-dossier-dev/images`, which keeps the `<base>/<hash>.<ext>` shape identical to production. Rejected: the `GET /dev/images/:hash` presigned shim suggested in `SPEC-deployment.md` §5 — a production-absent route is a thing to prove absent and a way to leak; `SPEC-deployment.md` §5 should be updated to record this choice instead.
- **D-03:** A share-page `<img>` that fails to load renders a **muted placeholder tile at the stored `width`/`height`** reading "Image unavailable", with the item's caption still rendered beneath it. No layout shift, because the dimensions are already in the `ImageRef`. A hash blocked by a later takedown is indistinguishable from a network failure, which is consistent with Phase 3's D-12 refusal to reveal takedowns. No page-level banner.
- **D-04:** Phase 4 **ends live on both a phone and a desktop browser**, in a final human-checkpoint plan mirroring `03-08`: add a real phone photo as a portrait and as gallery items, publish a throwaway snapshot, open the share URL in a private window on each device, confirm the images are served by `img.characterdossierlab.app` with `public, max-age=31536000, immutable`, then delete the share with its owner token. This is `SPEC-deployment.md` §7 item 6, widened from phone-only per D-00. The automated `live-smoke.mjs` extension is additive, not a substitute — it proves bytes are reachable, not that a real phone photo survives the compression ladder.

### Portrait
- **D-05:** The `.portrait-frame` keeps **one fixed bounded size per breakpoint** (~180px tall at 400px width, ~240px on desktop — exact values to the planner within the design tokens) and the image letterboxes inside it at its natural aspect ratio via `object-fit: contain`. This satisfies Phase 1's D-P1 (full image, never cropped to a circle or square) while keeping masthead height constant across characters, so the sticky section nav's `scroll-margin-top` offset and print page-breaks stay predictable. The existing monogram placeholder already occupies exactly this box.
- **D-06:** In edit mode the frame is **both a button and a desktop hover overlay** — the user asked for both explicitly. Composition, given that a `<button>` cannot nest another `<button>`:
  - The frame itself is a `<button>` filling the frame: click, Enter and Space open the file picker; it is also the drop target for a dragged file. This is the only interaction path on touch.
  - Under `@media (hover: hover) and (pointer: fine)`, a translucent scrim appears over the frame on `:hover` and `:focus-visible` showing "Replace portrait" (or "Add portrait" when `portrait` is null). The scrim is **presentational only** — clicking anywhere in the frame still opens the picker.
  - **Remove** is a separate small button positioned in the frame's corner as a **DOM sibling** of the frame button, revealed by the same hover/`focus-visible` rule on desktop. On touch, Replace and Remove sit beneath the frame as a persistent pair.
  - The frame's current `aria-hidden="true"` must be removed in edit mode and kept in view mode.
  - Precedent: the rating meters already branch on `@media (pointer: fine)` for the same reason (see the Key Decisions row on WCAG 2.5.8 hit areas).
- **D-07:** Blobs orphaned by replacing a portrait or removing a gallery item are **left in the `images` store — no local garbage collection**, consistent with ADR-0012's no-GC stance. Bounded cost (≤200KB per portrait, ≤600KB per gallery image) against an origin quota measured in hundreds of MB. Rejected: delete-if-unreferenced, whose failure mode is silently destroying an image another character still references — exactly the bug content-addressing invites. `SPEC-gallery-and-portrait.md`'s "until the lazy local GC runs" wording should be corrected to say there is none in v1.

### Gallery editor
- **D-08:** Multi-file add shows a **skeleton card per file immediately, in grid order**, filling in as each `ImageRef` resolves. Files are processed **sequentially** through the worker so a mid-range phone is not decoding eight bitmaps concurrently. The editor **stays fully live** throughout — captions, reorder and edits on already-resolved cards keep working; only unresolved skeletons are inert. No blocking modal.
- **D-09:** Per-file outcomes are reported **inline on the card, plus one summary toast at the end of the batch** — this refines `SPEC-gallery-and-portrait.md`'s "rejected with a toast naming the file", which would produce up to eight transient toasts for one drop.
  - A failed file's skeleton becomes a **persistent error card** showing the filename, the reason, and a dismiss control. It survives a pocketed phone; nothing is missed.
  - A duplicate hash (GALL-03) resolves to the **existing row** with a subtle "already added" marker on it rather than a new card.
  - One summary toast closes the batch, e.g. "6 added · 1 duplicate · 1 couldn't be processed".
- **D-10:** **Animated images are preserved, not flattened.** This **overrides** `SPEC-image-pipeline.md` §2 step 3 ("Animated inputs (GIF, animated WebP) become their first frame; the UI says so"), which must be rewritten in this phase. Because canvas re-encoding is what destroys animation, an animated input **bypasses the compression ladder entirely and is stored as-is**:
  - `ImageRef.mime` gains `'image/gif'` alongside `'image/webp'` and `'image/jpeg'` in `packages/schema/src/character.ts`; the S3 key extension map in `apps/api/src/routes/shares.ts` (`imageObjectKey`) and in `SPEC-storage-s3.md` §2 gains `.gif`.
  - `PUT /images/:hash` gains a GIF magic-byte sniff (`47 49 46 38` = `GIF8`) and a GIF header dimension parse (little-endian u16 width at bytes 6–7, height at bytes 8–9), alongside the existing WebP and JPEG cases. Animated WebP already passes the existing `RIFF....WEBP` sniff.
  - The 1.5 MiB per-image cap (ADR-0012, locked) and the 2048px edge cap still apply and are **not** raised. There is no compression path to get an animated file under them.
  - EXIF stripping does not apply to GIF (it has no EXIF); GIF comment/application extension blocks are out of scope to strip. The privacy claim in the upload UI must be worded so it stays true for animated files.
  - — **Reversibility:** one-way — widening `ImageRef.mime` changes the envelope schema that every stored character and every published snapshot share validates against. Snapshot shares are immutable and never expire (ADR-0004), so once one animated image is published the server must accept and serve that mime forever. **Open question for research:** whether widening the enum requires a `CHARACTER_SCHEMA_VERSION` bump under ADR-0011 — reading old data still validates, but a 1.0.0 character containing `image/gif` written by a new client is rejected by an older client's load boundary (`SCHM-03` rejects outright). Resolve this before implementing, per `SPEC-serialization-policy.md`.
- **D-11:** An animated file **over 1.5 MiB** produces an error card (per D-09) offering **one action: "Add as a still image"**, which runs the normal first-frame compression path and stores a WebP/JPEG. The owner keeps animation whenever it fits and still gets the image in when it does not, with the tradeoff stated rather than chosen for them. Rejected: silent automatic flattening (the owner gets a different asset than they chose, and a toast is a weak place to learn that) and outright rejection (phone-sized reaction GIFs are routinely 3–5MB, i.e. exactly the content this is for).
- **D-12:** The **lightbox is built in Phase 4** as a shared, gallery-agnostic component under `apps/web/src/app/components/`, and opens from the grid in **both view and edit mode** — an owner checking their own dossier wants the full-size image too, without publishing a share to see it. Desktop path is first-class per D-00: `←`/`→` navigation, `Escape` to close, click-outside to close, and a CDK focus trap with focus restore (the existing `ModalComponent` already proves this pattern, including Angular's `@if`-destroys-`CdkTrapFocus` focus-restore behaviour noted in Phase 2's 02-07). Touch gets swipe. Being shared and gallery-agnostic is what lets Phase 8's types reuse it.

### Claude's Discretion
- **The entire budget and upload-progress UI (SHARE-11 + IMG-01 presentation)** — the user did not select this area. Follow `SPEC-image-pipeline.md` §4 and §5 as written: turn on `showSizeEstimate` in the existing `SectionSelector` (Phase 3's D-01 deliberately left it off for this phase), render the running total in the "3 pages, 14 images, 4.2 MB" shape, and render upload progress from a `signal<Map<hash, 'pending'|'uploading'|'done'|'failed'>>` as a per-image strip in the publish dialog. A hash still failed after 3 retries aborts the publish before `POST /shares`; retrying the whole flow re-uploads only the hashes still missing. Exact placement, wording and whether over-budget disables Publish or errors on click are yours, provided no network request is made when the local budget check fails.
- Exact frame pixel values within the design tokens (D-05), and the grid's column count above 1200px on desktop.
- Whether animated images are permitted as portraits. Default to **yes, same rules** — the pipeline kind changes the target, not the mime policy, and the 1.5 MiB wall plus the D-11 flatten fallback already apply uniformly.
- Alt-text (`ImageRef.alt`, ≤200 chars) entry UI, or deferring it — it is optional in the schema and no requirement in this phase mandates it.
- Worker message protocol shape, mirroring SizeLab's `image-processing.worker.ts` + types-only `image-processing.protocol.ts` split; check it for zone-dependence per the standing project constraint.
- How gallery item reorder interacts with Phase 2's D-05 page-collapse-on-drag behaviour (gallery reorder is within a page, page reorder is across pages — they are different `cdkDropList`s).
- Where the `navigator.storage.persist()` call on first image write lives relative to the existing Phase 1 call on first character write (`SPEC-image-pipeline.md` §8).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Image pipeline and gallery
- `docs/specs/SPEC-image-pipeline.md` — §1 invariants (hash is of the *stored* bytes; originals discarded; server trusts nothing), §2 client compression steps and the per-kind quality ladder table, §3 local dedup and its accepted cross-device limit, §4 the budget table, §5 the publish flow, §6 the `PUT /images/:hash` server check order, §7 URL construction and `<img>` attributes, §8 storage persistence. **§2 step 3 is overridden by D-10 and must be rewritten this phase.**
- `docs/specs/SPEC-gallery-and-portrait.md` — portrait rules and pipeline kind, `GalleryItem`/`GalleryV1` shapes, the gallery schema object's exact members, editor grid and interactions, view mode, print behaviour, size accounting, no-thumbnails rationale. **The "lazy local GC" phrase is corrected by D-07.**
- `docs/adr/0012-content-addressed-images-no-gc.md` — content addressing, client compression, no GC in v1, the manual sweep script's role

### API and storage
- `docs/specs/SPEC-share-api.md` — §4.5 `POST /images/exists` (1–100 hashes, `missing`/`blocked` response), §4.6 `PUT /images/:hash` (server order, magic bytes, response shape, idempotency), §5 rate limits for both image endpoints (enforcement is Phase 7, but the limits are the contract), §7 response headers, §8 client publish sequence
- `docs/specs/SPEC-storage-s3.md` — §2 key scheme (`images/<sha256>.<ext>`, `blocked/<sha256>` sentinel), §4 image object attributes and the full CloudFront/OAC distribution spec including the bucket policy statement, §5 IAM for the API
- `docs/specs/SPEC-deployment.md` — §1 host table and the `img.` DNS-only record, §3 web env files (add `imgBaseUrl`; note Phase 3 corrected this table to `environment.ts` / `environment.development.ts`), §4 the `IMG_BASE_URL` env contract, §5 local dev (**to be updated per D-02**), §6 AWS setup steps 4/5/7 = the CloudFront work (**pulled into this phase per D-01**), §7 deploy checklist item 6 = the D-04 live check
- `docs/specs/SPEC-security-and-abuse.md` — what is an enforced control vs. a client-side UX check; relevant to the D-10 privacy wording and to not treating the client's declared mime as trusted

### Schema and versioning
- `docs/specs/SPEC-domain-model.md` — `ImageRef` shape, `CharacterCore.portrait`, `SharePayload.images` manifest semantics, the full string/size cap table, the IndexedDB `images` store
- `docs/specs/SPEC-serialization-policy.md` — version gating at the load boundary and on the server; **required reading for the D-10 open question**
- `docs/adr/0011-per-plugin-schema-versioning.md` — the two independent version spaces; the envelope owns `ImageRef`, so D-10 touches the envelope, not a plugin
- `docs/specs/SPEC-subdocument-plugin-contract.md` — the schema half and UI half the `gallery` plugin must implement, `collectImageRefs`, `sections`, host behaviour. Gallery is the **second** real page type, so it is the first genuine test of the contract.
- `docs/adr/0001-code-defined-subdocument-templates.md` — one instance per type per character

### Design
- `docs/specs/SPEC-design-system.md` — §4.3 card and drag states, §4.12 toast (D-09's summary toast), §4.14 section selector (D-01's `showSizeEstimate`), §4.15 drag handle, §4.16 dialog / bottom sheet (the D-12 lightbox), §6 motion and reduced motion (**animated GIFs under `prefers-reduced-motion` is an open design question for the planner**), §7 accessibility checklist
- `docs/adr/0015-visual-direction-evolve-dossier.md` — prototype look, the anti-pattern list (no box-shadow/blur/hover-transform/gradient) that constrains D-06's scrim
- `docs/adr/0003-unified-edit-in-place-page.md` — one scrolling page, edit and view mode in one template, no edit-mode toggle
- `docs/adr/0016-angular-signals-no-ui-framework.md` — standalone, signals, zoneless, only `@angular/cdk` (drag-drop + a11y)
- `docs/prototype/character-dossier.html` — the visual source of truth for the design system

### Planning
- `.planning/REQUIREMENTS.md` — GALL-01–04, IMG-01–03, SHARE-11
- `.planning/PROJECT.md` — Key Decisions table; **the "Most sessions are on a phone" line in `## Context` is corrected by D-00 this phase**
- `.planning/ROADMAP.md` — Phase 4 success criteria; **Phase 7's OPS-03 entry must be narrowed per D-01**
- `.planning/phases/03-snapshot-share-end-to-end/03-CONTEXT.md` — D-01 (`SectionSelector` built without the size estimate), D-08 (`shares` record shape), D-12 (takedowns are not revealed — the basis for D-03), D-15/D-16/D-17 (domains, MinIO, the object-store interface)
- `.planning/phases/02-intimacy-plugin-unified-page/02-CONTEXT.md` — D-01 (slim chapter bar, no enclosing card), D-05 (drag collapses pages), D-09 (add-page picker), D-13/D-14 (view mode, dev preview)
- `.planning/STATE.md` — the open Phase 2 advisory that **two-real-page drag reorder has only ever been proven with a synthetic test plugin**; gallery is the first real second page type, so this phase closes it. Also the standing Vitest TAP13 RED-evidence caveat.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/src/app/services/indexeddb-config.ts` — the `images` store already exists at DB **v1** (`keyPath: 'hash'`, no indexes). **No version bump.**
- `packages/schema/src/migrate.ts` — `collectAllImageRefs(source, registry)` already walks `core.portrait` + every page's `collectImageRefs` and dedupes by hash. Used by both `ShareStore` and `apps/api`.
- `packages/schema/src/character.ts` — `imageRefSchema` already enforces the 64-hex hash, the mime enum (**widened by D-10**), `bytes ≤ IMAGE_BYTES_MAX`, and both edges `≤ IMAGE_EDGE_MAX`.
- `packages/schema/src/limits.ts` — every constant this phase needs already exists: `GALLERY_ITEMS_MAX`, `CAPTION_MAX`, `SHARE_IMAGES_MAX`, `SHARE_IMAGE_B

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 26397 bytes -->
