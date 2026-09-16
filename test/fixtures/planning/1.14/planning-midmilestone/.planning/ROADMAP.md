# Roadmap: Character Dossier

## Overview

Character Dossier ships as eight dependency-ordered phases in vertical-MVP order — a shareable character exists end-to-end by the end of Phase 3. Phase 1 establishes the monorepo, the shared schema package (envelope, registry, Zod validators, migration walker, fixture guard) and an autosaving character library on a zoneless Angular 22 shell. Phase 2 adds the first and most complex sub-document type, the Intimacy Dossier, on the unified edit-in-place page with reordering and section nav. Phase 3 closes the loop with a Railway API, S3 storage, a read-only snapshot share and the server-computed adult gate. Phases 4 and 5 branch off that shared foundation: Phase 4 adds the client-side image pipeline (Gallery, portrait, content-addressed dedup, upload budget enforcement), Phase 5 adds living (editable, owner-token-authenticated) shares with republish and conflict detection. Phase 6 layers printing on top of the page host and the living-share section selector. Phase 7 hardens the service — library backup, rate limiting, takedown tooling, billing alarm. Phase 8 proves the plugin architecture (Goal 5) by landing two more sub-document types touching no host code.

This phase structure follows the PRD's own "Proposed Phase Map" (`docs/prd/PRD-character-dossier.md`), which was accepted as-is: every v1 requirement maps to exactly one phase with no coverage or dependency issues found on review.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Foundation + Library** - Monorepo, shared schema package, Angular 22 zoneless shell with theme tokens, IndexedDB-backed character library with autosave (completed 2026-09-14)
- [x] **Phase 2: Intimacy Plugin & Unified Page** - Page host and registry; the Intimacy Dossier editor faithful to the prototype; add/remove/reorder pages (completed 2026-09-14)
- [x] **Phase 3: Snapshot Share End-to-End** - Railway API, S3 storage, read-only share view, and the server-computed adult interstitial (completed 2026-09-15)
- [ ] **Phase 4: Images** - Client-side compression, content-addressed storage, Gallery and portrait pipelines, upload budget enforcement
- [ ] **Phase 5: Living Shares** - Owner tokens, republish-in-place, owner-link adoption across devices, optimistic-concurrency conflict detection
- [ ] **Phase 6: Print & Selection UI** - Shared page-selector component and browser-print stylesheet
- [ ] **Phase 7: Backup & Hardening** - Library export/import, rate limiting, takedown CLI, billing alarm, offline sweep script
- [ ] **Phase 8: Second-Generation Plugins** - Bio and Physical description page types proving zero-host-change extensibility

## Phase Details

### Phase 1: Foundation + Library

**Goal**: A working app shell where users can create, view and persist characters, on a validated shared schema foundation.
**Depends on**: Nothing (first phase)
**Requirements**: CHAR-01, CHAR-02, CHAR-03, SCHM-01, SCHM-02, SCHM-03, OPS-02, DSGN-01, DSGN-02, DSGN-03
**Success Criteria** (what must be TRUE):

  1. User can create a character (name, species/build, pronouns, orientation) and see it appear in the library view.
  2. Reloading the browser preserves every character and its edits; the browser has requested persistent storage.
  3. User can open, duplicate, and delete any character from the library.
  4. The app shell works at 400px width with no horizontal scrolling, renders in light and dark themes following system preference with a persisting manual override, and disables animation when reduced-motion is set.
  5. The schema package's fixture-guard test passes (every supported schema version has a migration and a fixture), and the app builds via the standard Angular application builder and deploys to Cloudflare Workers static assets with SPA fallback.

**Plans**: 6/6 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Tracer: monorepo, schema envelope, zoneless Angular, IndexedDB repo, library create/list, Workers config + smoke (wave 1)
- [x] 01-02-PLAN.md — Spec corrections: full-image portrait rule (D-P1), per-plugin fixture sketch (D-P2) (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — Migration walker, total rejection at load boundary, share payload schema, fixture guard (wave 2)
- [x] 01-04-PLAN.md — Design tokens, System/Light/Dark theme, reduced motion, 400 px shell, snackbar, storage-blocked mode (wave 2)
- [x] 01-05-PLAN.md — Library management: open, duplicate, delete with confirm, ordering, empty/rejected states (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-06-PLAN.md — Character page: masthead editor, monogram portrait frame, 500 ms autosave, tab-hide flush (wave 3)

**UI hint**: yes

### Phase 2: Intimacy Plugin & Unified Page

**Goal**: A character's Intimacy Dossier can be fully authored on the unified page, with pages addable, removable and reorderable.
**Depends on**: Phase 1
**Requirements**: CHAR-04, CHAR-05, CHAR-06, INTM-01, INTM-02, INTM-03, INTM-04, INTM-05, DSGN-04
**Success Criteria** (what must be TRUE):

  1. User can add an Intimacy Dossier page to a character (and remove it), with at most one instance per character; the type is registered as adult content for later share/print gating.
  2. User can fill in all 46 rating cards (experience + enjoyment meters), the 2 sliders, and the 10 free-text fields (including capacity fields on the oral/vaginal/anal cards), and every value survives a reload.
  3. User can reorder pages by drag-and-drop or keyboard up/down; the new order persists and drives a sticky section nav built from the pages present.
  4. Rating meters are keyboard-operable as a radiogroup and announce the selected level word to assistive technology.

**Plans**: 7/7 plans executed

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Tracer: Intimacy schema plugin + fixture, both registries, store add/update, host + lazy outlet, add page and persist an edit (wave 1)
- [x] 02-02-PLAN.md — Rating widgets: DSGN-04 meter radiogroup, lean slider, autosize textarea, edit and view modes (wave 1)
- [x] 02-03-PLAN.md — Spec updates for D-01 to D-14 and the reconciled meter keyboard mapping (wave 1)
- [x] 02-04-PLAN.md — @angular/cdk legitimacy gate (blocking human checkpoint) and install (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-05-PLAN.md — Remove with Undo, ▲ ▼ and drag reorder with collapse, chapter title bar (wave 2)
- [x] 02-06-PLAN.md — Full Intimacy editor: 46 rating cards, sliders, text and capacity fields, view mode, fill-persist (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-07-PLAN.md — Sticky section nav with section pills, add-page picker dialog, dev-only view preview (wave 3)

**UI hint**: yes

### Phase 3: Snapshot Share End-to-End

**Goal**: A character can be published as a read-only share that anyone with the link can open, with adult content gated correctly.
**Depends on**: Phase 2
**Requirements**: SHARE-01, SHARE-06, SHARE-07, SHARE-10, GATE-01, GATE-02, OPS-01, SEC-04
**Success Criteria** (what must be TRUE):

  1. User can publish a snapshot share and receive a share URL (copied to clipboard) from a Railway API service that exposes a health endpoint and accepts cross-origin requests only from the app origin; the content behind that URL never changes.
  2. Opening the share URL in a private/incognito window renders the same layout as the editor, read-only, with no form controls.
  3. The 18+ interstitial appears only when the share includes the Intimacy Dossier page, computed server-side from the included page types (never trusted from the client), and the acknowledgement is remembered in that browser.
  4. A recipient can import the shared character into their own library as a new, unlinked character.
  5. Missing, deleted, unsupported-version, and offline share URLs each render a clear, styled error page instead of a blank screen.

**Plans**: 8/8 plans executed

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Package legitimacy gate, then tracer: share contract in @dossier/schema, apps/api POST/GET against the in-memory store, built-output smoke, read-only SharePage (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Full POST /shares check order, collision retry, conditional GET, CORS to app origin, response headers, /healthz, env contract, token-free logs (wave 2)
- [x] 03-03-PLAN.md — S3 ObjectStore, server entrypoint, MinIO compose + opt-in S3 integration spec, Dockerfile, railway.json (wave 2)
- [x] 03-04-PLAN.md — ShareRepo/ShareStore publish with token record, SectionSelector, snapshot ShareDialog, Share button (wave 2)
- [x] 03-05-PLAN.md — Styled share error states, adult content notice with remembered acknowledgement, share bar, Save to my library, noindex (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-06-PLAN.md — Required publish → /s/:id → identical-view integration spec, Worker CSP + www redirect, wrangler routes, deployment docs (wave 3)
- [x] 03-07-PLAN.md — AWS bucket + API IAM user (human), live proof that the credential cannot list the bucket (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-08-PLAN.md — Railway service + DNS (human), live API smoke, Worker deploy, Playwright end-to-end on characterdossierlab.app (wave 4)

**UI hint**: yes

### Phase 4: Images

**Goal**: Images are compressed, deduplicated and shared efficiently within budget.
**Depends on**: Phase 3
**Requirements**: GALL-01, GALL-02, GALL-03, GALL-04, IMG-01, IMG-02, IMG-03, SHARE-11
**Success Criteria** (what must be TRUE):

  1. User can add images to a Gallery page, caption them, reorder them, and remove them.
  2. Adding a large image (e.g. a 5MB JPEG) re-encodes it client-side to WebP under the target size (portrait ≤200KB/1024px edge, gallery ≤600KB/2048px edge) with EXIF metadata stripped.
  3. Adding the same image content twice, on any character in the library, stores it once locally, content-addressed by SHA-256; the character header shows the portrait through the same pipeline as gallery images.
  4. Publishing a share uploads only image hashes the server doesn't already hold, three at a time with retries and per-image progress; the server rejects any image whose bytes don't hash to its key, isn't WebP/JPEG, or exceeds 1.5MiB/2048px.
  5. Before publishing, the share dialog shows an estimated payload size and refuses to publish over the 30MiB/60-image budget; the server independently refuses a share whose images are missing or exceed the budget.

**Plans**: TBD
**UI hint**: yes

### Phase 5: Living Shares

**Goal**: An owner can keep a living link current across devices, with safe conflict handling.
**Depends on**: Phase 3
**Requirements**: SHARE-02, SHARE-03, SHARE-04, SHARE-05, SHARE-08, SHARE-09, SEC-02
**Success Criteria** (what must be TRUE):

  1. User can publish a living link and receive both a share URL and a separate owner link, with a forced "I have copied it" confirmation before the owner link is shown once.
  2. User can choose which pages are included in a living share; the selection is remembered across republishes and across devices reached via the owner link.
  3. Republishing a living link updates it in place under the same URL; recipients see the new content with a last-updated timestamp.
  4. Opening the owner link in a browser that doesn't already hold the character materializes a local copy (including images), links it to the living share, and grants edit rights there.
  5. The owner can delete a living share (the URL then 404s); republishing a link that changed elsewhere since it was last loaded is rejected with a "reload or overwrite" choice; owner tokens are stored only as constant-time-compared SHA-256 hashes and never appear in logs.

**Plans**: TBD

### Phase 6: Print & Selection UI

**Goal**: An owner can print or save a PDF of exactly the pages they choose, in a clean read-only layout.
**Depends on**: Phase 2, Phase 5
**Requirements**: PRINT-01, PRINT-02
**Success Criteria** (what must be TRUE):

  1. Printing (or "Save as PDF") renders only the selected pages, read-only, with no form controls, nav, or toolbar visible.
  2. Rating cards never split across a page break in the print output.
  3. User selects which pages to print using the same page-selector component used by the share dialog.

**Plans**: TBD
**UI hint**: yes

### Phase 7: Backup & Hardening

**Goal**: The library is portable and the service is resilient to abuse.
**Depends on**: Phase 4, Phase 5
**Requirements**: CHAR-07, SEC-01, SEC-03, OPS-03
**Success Criteria** (what must be TRUE):

  1. User can export the whole library (including owner tokens) as a single `.json` file and import it into another browser, restoring every character.
  2. Repeatedly hitting a mutating endpoint from one IP triggers a 429 response with `Retry-After` once the rate limit is exceeded.
  3. An operator can take down a share and block its image hashes with a CLI command; the share page carries a report link.
  4. The S3 bucket stays private behind CloudFront for images only, a billing alarm is configured, and a documented offline sweep script can remove unreferenced images.

**Plans**: TBD

### Phase 8: Second-Generation Plugins

**Goal**: The plugin architecture is proven by landing two more sub-document types with zero host-code changes.
**Depends on**: Phase 6
**Requirements**: PLUG-01, PLUG-02
**Success Criteria** (what must be TRUE):

  1. User can attach a Bio/backstory page (long-form prose sections with headings) to a character, edit it, share it, and print it.
  2. User can attach a Physical description page (structured build, height with units, distinguishing features) to a character, edit it, share it, and print it.
  3. Both new page types are added by touching only `packages/schema/src/plugins/*` and `apps/web/src/app/subdocs/*` — the page host, share dialog, print stylesheet and adult-gate logic are unchanged.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation + Library | 6/6 | Complete    | 2026-09-14 |
| 2. Intimacy Plugin & Unified Page | 7/7 | Complete    | 2026-09-14 |
| 3. Snapshot Share End-to-End | 8/8 | Complete    | 2026-09-15 |
| 4. Images | 0/TBD | Not started | - |
| 5. Living Shares | 0/TBD | Not started | - |
| 6. Print & Selection UI | 0/TBD | Not started | - |
| 7. Backup & Hardening | 0/TBD | Not started | - |
| 8. Second-Generation Plugins | 0/TBD | Not started | - |
