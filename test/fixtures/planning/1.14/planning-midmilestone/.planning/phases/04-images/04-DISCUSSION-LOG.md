# Phase 4: Images - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-15
**Phase:** 04-images
**Areas discussed:** Image delivery path, Portrait frame + replace UX, Gallery editor + lightbox
**Areas offered but not selected:** Budget + upload progress UI (→ Claude's discretion)

---

## Image delivery path

### Q1 — How should Phase 4 serve image bytes, given CloudFront is currently OPS-03 in Phase 7?

| Option | Description | Selected |
|--------|-------------|----------|
| CloudFront now | Pull the distribution + ACM cert + `img.` CNAME into Phase 4 as a human checkpoint, per SPEC-deployment §6 steps 4/5/7. Billing alarm and sweep script stay in Phase 7. | ✓ |
| API proxy, CloudFront later | `GET /images/:hash` on apps/api streaming from S3; zero AWS console work, but every byte runs through the single Railway instance and it's a route built now and deleted later. | |
| Defer — accept broken | Ship the pipeline; share images 404 until Phase 7. Phase 4's own UAT couldn't prove GALL/IMG for a recipient. | |

**User's choice:** CloudFront now
**Notes:** Surfaced by Claude during analysis — `IMG_BASE_URL` is already set to `https://img.characterdossierlab.app` on Railway from Phase 3, but the distribution and DNS record don't exist. Without this the phase ships uploads that render as broken images. Later noted during write-up: share payloads store only the `ImageRef`, and the absolute URL is built client-side from `environment.imgBaseUrl`, so moving the CDN host later is a config change — unlike Phase 3's D-15 app-origin decision, this does not break published links.

### Q2 — How should IMG_BASE_URL resolve in local dev, where the store is MinIO?

| Option | Description | Selected |
|--------|-------------|----------|
| MinIO anonymous read | Anonymous download policy on `images/*` for `character-dossier-dev` in the existing docker-compose init step; dev URL shape matches prod. | ✓ |
| Dev-only presigned shim | SPEC-deployment §5's suggestion: `GET /dev/images/:hash` mounted only when `NODE_ENV=development`, 302 to a presigned URL. A route that must be provably absent from production. | |
| Point dev at prod CloudFront | Costs nothing, but locally-published shares reference images only ever written to MinIO — it just moves the problem. | |

**User's choice:** MinIO anonymous read
**Notes:** SPEC-deployment §5 should be updated to record this instead of the shim.

### Q3 — What should a recipient see when one share-page `<img>` fails to load?

| Option | Description | Selected |
|--------|-------------|----------|
| Placeholder tile, keep caption | Muted tile at the stored width/height reading "Image unavailable", caption still below. No layout shift; a takedown is indistinguishable from a network failure. | ✓ |
| Drop the item silently | Cleanest-looking, but the recipient can't tell a partly-broken dossier from a small one and the caption vanishes. | |
| Banner above the dossier | More honest, but draws attention to an infrastructure problem the recipient can't act on. | |

**User's choice:** Placeholder tile, keep caption
**Notes:** Consistent with Phase 3's D-12 (a takedown is never revealed).

### Q4 — How far should Phase 4's live verification go?

| Option | Description | Selected |
|--------|-------------|----------|
| Full live loop on a phone | Human-checkpoint plan mirroring 03-08: real photo → publish → open in a private window → confirm CDN + immutable caching → delete. SPEC-deployment §7 item 6. | ✓ |
| Desktop browser only | Faster and Playwright-scriptable, but the worker/OffscreenCanvas path is where mobile browsers most differ. | |
| Automated smoke, no manual step | Extend live-smoke.mjs. Proves bytes are reachable, not that a real phone photo survives the ladder. | |

**User's choice:** Full live loop on a phone
**Notes:** **Widened mid-discussion.** After the user's correction on audience split (see below), this was broadened to a live check on *both* a phone and a desktop browser. Recorded as D-04 in CONTEXT.md.

---

## Portrait frame + replace UX

### Q1 — How should the portrait frame size once a real image is in it?

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed box, image contained | One bounded size per breakpoint; image letterboxes at natural ratio. Masthead height constant across characters, so nav offset and print page-breaks stay predictable. | ✓ |
| Fixed width, height follows image | Shows each image largest, but variable masthead height shifts the sticky nav offset and print breaks. | |
| Max-height cap, natural ratio | Middle ground — still variable-height, with a ceiling on the damage. | |

**User's choice:** Fixed box, image contained
**Notes:** Satisfies Phase 1's D-P1 (full image, never cropped). The existing monogram placeholder already occupies this box.

### Q2 — How does the owner add, replace and remove the portrait?

| Option | Description | Selected |
|--------|-------------|----------|
| Frame is the control | Frame is a `<button>` (picker + drop target); Replace/Remove beneath once set. One target, works on touch without hover. | |
| Hover overlay on the frame | Translucent overlay with Replace/Remove on hover or focus. Clean, but needs a tap-to-reveal fallback that becomes a second interaction model. | |
| Buttons only, frame inert | Simplest to make accessible, but separates control from subject and adds permanent chrome to an editorial masthead. | |
| **Other (free text)** | — | ✓ |

**User's choice:** *Free text* — "Can it be a hover overlay which is good for desktop users, but also have the frame be a button?"
**Notes:** Both, combined. Claude flagged the constraint that a `<button>` cannot nest another `<button>`, so Replace/Remove can't live inside the frame button, and asked a follow-up on composition (below). Precedent cited: the rating meters already branch on `@media (pointer: fine)`.

### Q2b — How should the overlay be composed, given the nesting constraint?

| Option | Description | Selected |
|--------|-------------|----------|
| Overlay is the label, Remove is a sibling | Frame button fills the frame and is the whole picker/drop target; desktop scrim is presentational only; Remove is a DOM sibling in the corner, revealed by the same hover/focus rule; touch gets a persistent pair beneath. | ✓ |
| Scrim holds both, frame not a button | Ideal layout per pointer type, but genuinely two interaction models — two templates, two spec sets, keyboard path differs by media query. | |
| Same controls, always visible on touch | Simpler CSS, but puts a small destructive control permanently in the editorial masthead, against ADR-0015's restraint. | |

**User's choice:** Overlay is the label, Remove is a sibling

### Q3 — What happens to local blobs orphaned by replacing a portrait or removing a gallery item?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave them, no GC | Consistent with ADR-0012. Bounded cost against a quota measured in hundreds of MB. | ✓ |
| Delete on replace/remove | Needs a full-library reference scan; failure mode is silently destroying an image another character still uses. | |
| Mark orphaned, sweep later | Bookkeeping for a problem no one has reported, and the field must be migrated into the images store now. | |

**User's choice:** Leave them, no GC
**Notes:** SPEC-gallery-and-portrait's "until the lazy local GC runs" wording should be corrected — there is none in v1.

---

## Mid-discussion correction from the user (project-level)

> "Note that this app is probably 50% desktop 50% phone, desktop experience cannot be neglected"

This **supersedes** `PROJECT.md`'s "Most sessions are on a phone" in `## Context`, which must be corrected. Two consequences were applied immediately: D-04's live check widened from phone-only to phone *and* desktop, and the desktop hover/keyboard paths were treated as first-class rather than progressive enhancement (D-06, D-12). Recorded as D-00 in CONTEXT.md.

---

## Gallery editor + lightbox

### Q1 — What should the owner be able to do while a batch of files processes?

| Option | Description | Selected |
|--------|-------------|----------|
| Skeletons in place, editor stays live | Skeleton cards in grid order fill in as each ImageRef resolves; sequential worker processing; editor never blocks. | ✓ |
| Modal progress, editor locked | Unambiguous, but freezes the editor 20+ seconds on a phone and adds a fourth modal. | |
| Process in parallel, no skeletons | Fastest on desktop, but cards arrive out of order and a mid-range phone runs OffscreenCanvas out of memory. | |

**User's choice:** Skeletons in place, editor stays live

### Q2 — How should per-file failures, duplicates and animated inputs be reported?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline on the card, one summary toast | Failed skeleton becomes a persistent error card (filename, reason, dismiss); duplicate marks the existing row; one summary toast closes the batch. Refines the spec's per-file toast. | ✓ |
| One toast per file, as specced | Faithful to SPEC-gallery-and-portrait, but 8 mixed files produce a queue that scrolls past before it can be read. | |
| Summary toast only | Quietest, but a failed file leaves no trace once the toast expires. | |

**User's choice:** Inline on the card, one summary toast — **plus a scope change**
**Notes:** Free-text addition: *"Though I'd also like to support GIFs, if an animated item is uploaded, we shouldn't reduce to just the first frame"*. This **overrides SPEC-image-pipeline §2 step 3**. Claude stated the cost before proceeding: canvas re-encoding is what destroys animation, so animated files bypass the compression ladder entirely and are stored as-is; the 1.5 MiB cap (ADR-0012, locked) becomes a hard wall with no compression path under it; `ImageRef.mime` gains `image/gif`; the server gains a GIF magic-byte sniff and header dimension parse; the S3 key map gains `.gif`. Flagged as **one-way** in CONTEXT.md with an open research question on whether widening the mime enum requires a `CHARACTER_SCHEMA_VERSION` bump under ADR-0011.

### Q3 — What should happen to an oversize animated file?

| Option | Description | Selected |
|--------|-------------|----------|
| Offer flatten as a fallback | Under the cap it plays; over it, the error card offers one action — "Add as a still image" — running the normal first-frame path. Tradeoff stated, not chosen for the owner. | ✓ |
| Reject outright, no fallback | Simplest, but phone-sized reaction GIFs are routinely 3–5MB — exactly the content the feature is for. | |
| Flatten automatically when oversize | Nothing is refused, but the owner gets a different asset than they chose and a toast is a weak place to learn that. | |

**User's choice:** Offer flatten as a fallback

### Q4 — What's the lightbox's scope in Phase 4?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared component, both modes, full keyboard | Reusable component under components/; opens in view *and* edit mode; ←/→, Escape, click-outside, CDK focus trap on desktop; swipe on touch. Ready for Phase 8. | ✓ |
| View mode only, as specced | Smaller surface, but the owner must publish a share to see their own image full-size. | |
| Defer the lightbox to Phase 6 | Tighter phase, but a 180px grid cell is not how anyone looks at character art — it would ship visibly unfinished. | |

**User's choice:** Shared component, both modes, full keyboard
**Notes:** Weighted by the 50/50 audience correction — the desktop keyboard path is first-class, not an add-on.

---

## Claude's Discretion

- **The entire budget and upload-progress UI (SHARE-11 + IMG-01 presentation)** — offered as a fourth gray area, not selected. Follow SPEC-image-pipeline §4–5 as written; the constraint is that no network request happens when the local budget check fails.
- Exact portrait frame pixel values within the design tokens; desktop grid column count above 1200px.
- Whether animated images are permitted as portraits (default: yes, same rules).
- Alt-text (`ImageRef.alt`) entry UI, or deferring it.
- Worker message protocol shape (mirroring SizeLab's worker + types-only protocol split, checked for zone-dependence).
- Gallery item reorder vs. Phase 2's D-05 page-collapse-on-drag behaviour.
- Placement of the `navigator.storage.persist()` call on first image write.

## Deferred Ideas

- Animated-image behaviour in the print output — Phase 6 should confirm the first frame reads acceptably.
- Owner-link image materialization with per-image `sha256` verification — SHARE-05, Phase 5. The broken-tile component from D-03 is the natural thing to reuse there.
- Writing the `blocked/<hash>` sentinel (takedown CLI) — SEC-03, Phase 7. Phase 4 only reads it.
- Rate limiting the two image endpoints — SEC-01, Phase 7. The limits are specified; the limiter is not.
- Thumbnails (THMB-01) and automatic GC (GC-01) — explicitly v1-excluded.
