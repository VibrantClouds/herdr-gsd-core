# Requirements: Character Dossier

**Defined:** 2026-09-11
**Core Value:** One link shows a character's whole dossier, beautifully, and the owner can keep it current.

## v1 Requirements

Requirements for the initial release. Each maps to exactly one roadmap phase (see Traceability below). Source: `docs/prd/PRD-character-dossier.md`.

### Library & Character (CHAR)

- [x] **CHAR-01**: User can create a character with name, species/build, pronouns, orientation and an optional portrait image.
- [x] **CHAR-02**: User can see all characters in a library view and open, duplicate or delete any of them.
- [x] **CHAR-03**: Every edit is saved locally within 1 second, survives a page reload, and the app requests persistent storage (`navigator.storage.persist()`) on first write.
- [x] **CHAR-04**: User can add a page of any registered sub-document type not already present on the character, and remove an existing page.
- [x] **CHAR-05**: User can reorder pages by drag-and-drop and by keyboard (move up/down), and the order persists.
- [x] **CHAR-06**: The character page renders the header and every attached page as one continuous scrolling document with a sticky section navigation built from the pages present.
- [ ] **CHAR-07**: User can export the whole library as a single `.json` file (including owner tokens) and import it into another browser.

### Intimacy Dossier (INTM)

- [x] **INTM-01**: The Intimacy Dossier page presents every fixed list from the prototype (11 acts, 10 partner anatomy types, 8 body-focus spots, 7 themes, 10 BDSM items) as rating cards, each with a 6-level experience meter and a 6-level enjoyment meter, where clicking the current level clears it.
- [x] **INTM-02**: The page has a 5-position dominant/submissive lean slider and a 5-position inside/outside placement slider, each showing its current word.
- [x] **INTM-03**: The Oral (giving), Vaginal intercourse and Anal intercourse cards carry max-length and max-girth text fields.
- [x] **INTM-04**: The page has the prototype's nine free-text fields plus a relationship-context field, and text areas grow with their content.
- [x] **INTM-05**: The Intimacy Dossier type is flagged adult, so any share or print that includes it is treated as adult content.

### Gallery & Portrait (GALL)

- [ ] **GALL-01**: User can add images to a Gallery page, caption them, reorder them and remove them.
- [ ] **GALL-02**: Every added image is re-encoded in the browser (portrait ≤ 1024 px edge, ≤ 200 KB target; gallery ≤ 2048 px edge, ≤ 600 KB target) and EXIF metadata is stripped before storage.
- [ ] **GALL-03**: Adding the same image content twice, on any character in the library, stores it once locally (content-addressed by SHA-256).
- [ ] **GALL-04**: The character header shows the portrait, processed by the same pipeline as gallery images.

### Sharing (SHARE)

- [x] **SHARE-01**: User can publish a snapshot and receives a share URL copied to the clipboard; the content behind that URL never changes.
- [ ] **SHARE-02**: User can publish a living link and receives both a share URL and a separate owner link, with a forced "I have copied it" step for the owner link.
- [ ] **SHARE-03**: User can choose which pages are included in a share; a living link remembers the selection across republishes and across devices reached via the owner link.
- [ ] **SHARE-04**: Republishing a living link updates it in place under the same URL, and recipients see the new content with a last-updated timestamp.
- [ ] **SHARE-05**: Opening an owner link in a browser that does not hold the character materializes a local copy (including images), links it to the living share, and grants edit rights there.
- [x] **SHARE-06**: A share page renders the same layout as the editor in read-only form, with images served from the image CDN.
- [x] **SHARE-07**: A recipient can import a shared character into their own library as a new, unlinked character.
- [ ] **SHARE-08**: The holder of an owner token can delete the share, after which the URL returns a not-found page.
- [ ] **SHARE-09**: Republishing a living link that was changed elsewhere since it was last loaded is rejected, and the user is offered "reload" or "overwrite".
- [x] **SHARE-10**: Missing, deleted, unsupported-version and offline conditions each show a clear, styled error page rather than a blank screen.
- [ ] **SHARE-11**: Before any network request, the share dialog shows an estimated payload size and refuses to publish when the 30 MiB / 60-image budget is exceeded.

### Image Service (IMG)

- [ ] **IMG-01**: Publishing checks which image hashes the server already holds and uploads only the missing ones, three at a time, with retries and per-image progress.
- [ ] **IMG-02**: The server rejects any image upload whose bytes do not hash to the requested key, whose magic bytes are not WebP or JPEG, or which exceeds 1.5 MiB or 2048 px on either edge.
- [ ] **IMG-03**: The server refuses to publish a share whose referenced images are missing or whose total image bytes exceed 30 MiB.

### Adult Gate (GATE)

- [x] **GATE-01**: A share page shows an 18+ interstitial before rendering only when at least one included page is flagged adult, and the acknowledgement is remembered in that browser.
- [x] **GATE-02**: The adult flag on a share is computed by the server from the included page types, never trusted from the client.

### Print (PRINT)

- [ ] **PRINT-01**: Printing (or "save as PDF") renders the selected pages in read-only mode with no form controls, rating cards never split across page breaks, and nav/toolbar elements hidden.
- [ ] **PRINT-02**: User can choose which pages to print using the same page-selector component as the share dialog.

### Schema (SCHM)

- [x] **SCHM-01**: One shared schema package validates characters and share payloads identically in the browser and on the server.
- [x] **SCHM-02**: Each sub-document type owns a versioned migration registry, and a guard test fails the build when any supported version lacks a fixture.
- [x] **SCHM-03**: Loading a document at an unsupported version is rejected outright with a named error and nothing is partially applied.

### Security (SEC)

- [ ] **SEC-01**: The API rate-limits every mutating endpoint per IP and responds 429 with `Retry-After` when exceeded.
- [ ] **SEC-02**: Owner tokens are stored only as SHA-256 hashes, compared in constant time, and never written to logs.
- [ ] **SEC-03**: An operator can take down a share and block its image hashes with a CLI command, and every share page carries a report link.
- [x] **SEC-04**: The API accepts cross-origin requests only from the app origin, offers no listing endpoint, and its S3 credentials cannot list the bucket.

### Operations (OPS)

- [x] **OPS-01**: The API runs as a Railway service with a health endpoint and a documented environment-variable contract.
- [x] **OPS-02**: The Angular 22 web app builds with the standard application builder and deploys to Cloudflare Workers static assets with single-page-application fallback and long-lived caching for hashed assets.
- [ ] **OPS-03**: The S3 bucket is private with CloudFront in front of images only, a billing alarm is configured, and a documented offline sweep script can remove unreferenced images.

### Design (DSGN)

- [x] **DSGN-01**: The app ships light and dark themes driven by design tokens, following `prefers-color-scheme` with a manual override that persists.
- [x] **DSGN-02**: Every screen works at 400 px width with 44 px minimum touch targets and no horizontal scrolling.
- [x] **DSGN-03**: All animation and transitions are disabled when `prefers-reduced-motion` is set.
- [x] **DSGN-04**: Rating meters are keyboard-operable with radiogroup semantics and announce the selected level word to assistive technology.

### Plugins (PLUG)

- [ ] **PLUG-01**: A Bio/backstory page type (long-form prose sections with headings) can be attached, edited, shared and printed.
- [ ] **PLUG-02**: A Physical description page type (structured build, height with units, distinguishing features) can be attached, edited, shared and printed, and both new types land without changes to the page host, share or print code.

## v2 Requirements

Deferred. Tracked but not in the v1 roadmap. 9 requirements total.

### Relationships (REL)

- **REL-01**: A Relationships page links to other characters in the same library with a role and notes.
- **REL-02**: Sharing a character with a Relationships page inlines the referenced characters' core identities.

### Stats (STAT)

- **STAT-01**: A Stats/abilities page holds named numeric attributes and skill lists.

### History (HIST)

- **HIST-01**: Every publish of a living link is retained and recipients can browse earlier versions.

### Sync (SYNC)

- **SYNC-01**: A library can be kept in sync across devices without an owner link per character.

### Customisation (CUST)

- **CUST-01**: User can add custom items to the fixed rating lists, carried with the character.

### Freeform (FREE)

- **FREE-01**: A generic freeform page type of user-labelled text fields and rating lists.

### Thumbnails (THMB)

- **THMB-01**: Gallery grids load reduced-size thumbnails and fetch full images on demand.

### Garbage collection (GC)

- **GC-01**: Unreferenced images are removed automatically on a schedule.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---|---|
| Accounts, login, OAuth, magic links | The link is the identity; adds a user store, auth and a database to a service that otherwise needs none (ADR-0005) |
| Template or form builder | Doubles the schema surface ("schema for schemas"); code-defined types cover the known needs (ADR-0001) |
| Real-time collaboration | No accounts and no server-side document store; conflict detection on republish is the only concurrency control |
| Moderation queue or automated scanning | Hobby-scale service; report link plus operator takedown is proportionate |
| PDF generation library | The browser print dialog produces PDFs from the print stylesheet |
| Internationalisation | Single-language product; the rating vocabulary is part of the design |
| Server-side age verification | The interstitial is a content notice, not access control (ADR-0013) |
| Snapshot expiry | Reference sheets get pasted into chats revisited years later; storage cost per share is negligible (ADR-0004) |
| Client-side encryption (former ENC-01: key in URL fragment) | **Rejected by the user, not deferred.** The server must see plaintext to validate payloads, recompute `adult`, enforce budgets, deduplicate images and act on takedowns. SSE-S3 default at-rest encryption is unaffected. (ADR-0006) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAR-01 | Phase 1 | Complete |
| CHAR-02 | Phase 1 | Complete |
| CHAR-03 | Phase 1 | Complete |
| SCHM-01 | Phase 1 | Complete |
| SCHM-02 | Phase 1 | Complete |
| SCHM-03 | Phase 1 | Complete |
| OPS-02 | Phase 1 | Complete |
| DSGN-01 | Phase 1 | Complete |
| DSGN-02 | Phase 1 | Complete |
| DSGN-03 | Phase 1 | Complete |
| CHAR-04 | Phase 2 | Complete |
| CHAR-05 | Phase 2 | Complete |
| CHAR-06 | Phase 2 | Complete |
| INTM-01 | Phase 2 | Complete |
| INTM-02 | Phase 2 | Complete |
| INTM-03 | Phase 2 | Complete |
| INTM-04 | Phase 2 | Complete |
| INTM-05 | Phase 2 | Complete |
| DSGN-04 | Phase 2 | Complete |
| SHARE-01 | Phase 3 | Complete |
| SHARE-06 | Phase 3 | Complete |
| SHARE-07 | Phase 3 | Complete |
| SHARE-10 | Phase 3 | Complete |
| GATE-01 | Phase 3 | Complete |
| GATE-02 | Phase 3 | Complete |
| OPS-01 | Phase 3 | Complete |
| SEC-04 | Phase 3 | Complete |
| GALL-01 | Phase 4 | Pending |
| GALL-02 | Phase 4 | Pending |
| GALL-03 | Phase 4 | Pending |
| GALL-04 | Phase 4 | Pending |
| IMG-01 | Phase 4 | Pending |
| IMG-02 | Phase 4 | Pending |
| IMG-03 | Phase 4 | Pending |
| SHARE-11 | Phase 4 | Pending |
| SHARE-02 | Phase 5 | Pending |
| SHARE-03 | Phase 5 | Pending |
| SHARE-04 | Phase 5 | Pending |
| SHARE-05 | Phase 5 | Pending |
| SHARE-08 | Phase 5 | Pending |
| SHARE-09 | Phase 5 | Pending |
| SEC-02 | Phase 5 | Pending |
| PRINT-01 | Phase 6 | Pending |
| PRINT-02 | Phase 6 | Pending |
| CHAR-07 | Phase 7 | Pending |
| SEC-01 | Phase 7 | Pending |
| SEC-03 | Phase 7 | Pending |
| OPS-03 | Phase 7 | Pending |
| PLUG-01 | Phase 8 | Pending |
| PLUG-02 | Phase 8 | Pending |

**Coverage:**

- v1 requirements: 50 total
- Mapped to phases: 50
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-11*
*Last updated: 2026-09-11 after initial roadmap creation*
