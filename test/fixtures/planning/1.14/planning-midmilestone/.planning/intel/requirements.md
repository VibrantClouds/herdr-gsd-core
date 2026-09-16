# Requirements

Synthesized from `docs/prd/PRD-character-dossier.md` (single PRD; no competing-variant conflicts — only one PRD in the ingest set). IDs below preserve the PRD's own requirement IDs (`CHAR-01` etc.) under `REQ-` prefix for downstream consistency. v1 requirements total: 50 (per PRD's own coverage count). v2 requirements: 9, deferred. The PRD's ENC-01 (client-side encryption) was rejected by the user during ingest and is listed under Out of Scope, not v2.

## v1 Requirements

### Library & Character (CHAR)

## REQ-CHAR-01
- source: docs/prd/PRD-character-dossier.md
- description: User can create a character with name, species/build, pronouns, orientation and an optional portrait image.
- acceptance: (see description; no separate acceptance-criteria section in source — PRD checklist format)
- scope: character creation, core fields

## REQ-CHAR-02
- source: docs/prd/PRD-character-dossier.md
- description: User can see all characters in a library view and open, duplicate or delete any of them.
- acceptance: absent (PRD checklist item, no separate criteria)
- scope: library view, character management

## REQ-CHAR-03
- source: docs/prd/PRD-character-dossier.md
- description: Every edit is saved locally within 1 second, survives a page reload, and the app requests persistent storage (`navigator.storage.persist()`) on first write.
- acceptance: absent
- scope: autosave, IndexedDB, persistent storage

## REQ-CHAR-04
- source: docs/prd/PRD-character-dossier.md
- description: User can add a page of any registered sub-document type not already present on the character, and remove an existing page.
- acceptance: absent
- scope: pages, sub-document types

## REQ-CHAR-05
- source: docs/prd/PRD-character-dossier.md
- description: User can reorder pages by drag-and-drop and by keyboard (move up/down), and the order persists.
- acceptance: absent
- scope: reordering, drag-and-drop, keyboard accessibility

## REQ-CHAR-06
- source: docs/prd/PRD-character-dossier.md
- description: The character page renders the header and every attached page as one continuous scrolling document with a sticky section navigation built from the pages present.
- acceptance: absent
- scope: unified page, section navigation

## REQ-CHAR-07
- source: docs/prd/PRD-character-dossier.md
- description: User can export the whole library as a single `.json` file (including owner tokens) and import it into another browser.
- acceptance: absent
- scope: backup export/import, owner tokens

### Intimacy Dossier (INTM)

## REQ-INTM-01
- source: docs/prd/PRD-character-dossier.md
- description: The Intimacy Dossier page presents every fixed list from the prototype (11 acts, 10 partner anatomy types, 8 body-focus spots, 7 themes, 10 BDSM items) as rating cards, each with a 6-level experience meter and a 6-level enjoyment meter, where clicking the current level clears it.
- acceptance: absent
- scope: Intimacy Dossier, rating cards, meters

## REQ-INTM-02
- source: docs/prd/PRD-character-dossier.md
- description: The page has a 5-position dominant/submissive lean slider and a 5-position inside/outside placement slider, each showing its current word.
- acceptance: absent
- scope: Intimacy Dossier, sliders

## REQ-INTM-03
- source: docs/prd/PRD-character-dossier.md
- description: The Oral (giving), Vaginal intercourse and Anal intercourse cards carry max-length and max-girth text fields.
- acceptance: absent
- scope: Intimacy Dossier, capacity fields

## REQ-INTM-04
- source: docs/prd/PRD-character-dossier.md
- description: The page has the prototype's nine free-text fields plus a relationship-context field, and text areas grow with their content.
- acceptance: absent
- scope: Intimacy Dossier, text fields, autosize textarea

## REQ-INTM-05
- source: docs/prd/PRD-character-dossier.md
- description: The Intimacy Dossier type is flagged adult, so any share or print that includes it is treated as adult content.
- acceptance: absent
- scope: Intimacy Dossier, adult flag

### Gallery & Portrait (GALL)

## REQ-GALL-01
- source: docs/prd/PRD-character-dossier.md
- description: User can add images to a Gallery page, caption them, reorder them and remove them.
- acceptance: absent
- scope: Gallery, image management

## REQ-GALL-02
- source: docs/prd/PRD-character-dossier.md
- description: Every added image is re-encoded in the browser (portrait ≤ 1024 px edge, ≤ 200 KB target; gallery ≤ 2048 px edge, ≤ 600 KB target) and EXIF metadata is stripped before storage.
- acceptance: absent
- scope: image compression, EXIF stripping

## REQ-GALL-03
- source: docs/prd/PRD-character-dossier.md
- description: Adding the same image content twice, on any character in the library, stores it once locally (content-addressed by SHA-256).
- acceptance: absent
- scope: content-addressed storage, deduplication

## REQ-GALL-04
- source: docs/prd/PRD-character-dossier.md
- description: The character header shows the portrait, processed by the same pipeline as gallery images.
- acceptance: absent
- scope: portrait, image pipeline

### Sharing (SHARE)

## REQ-SHARE-01
- source: docs/prd/PRD-character-dossier.md
- description: User can publish a snapshot and receives a share URL copied to the clipboard; the content behind that URL never changes.
- acceptance: absent
- scope: snapshot share

## REQ-SHARE-02
- source: docs/prd/PRD-character-dossier.md
- description: User can publish a living link and receives both a share URL and a separate owner link, with a forced "I have copied it" step for the owner link.
- acceptance: absent
- scope: living share, owner link

## REQ-SHARE-03
- source: docs/prd/PRD-character-dossier.md
- description: User can choose which pages are included in a share; a living link remembers the selection across republishes and across devices reached via the owner link.
- acceptance: absent
- scope: section selection, living share

## REQ-SHARE-04
- source: docs/prd/PRD-character-dossier.md
- description: Republishing a living link updates it in place under the same URL, and recipients see the new content with a last-updated timestamp.
- acceptance: absent
- scope: living share, republish

## REQ-SHARE-05
- source: docs/prd/PRD-character-dossier.md
- description: Opening an owner link in a browser that does not hold the character materializes a local copy (including images), links it to the living share, and grants edit rights there.
- acceptance: absent
- scope: owner link, multi-device

## REQ-SHARE-06
- source: docs/prd/PRD-character-dossier.md
- description: A share page renders the same layout as the editor in read-only form, with images served from the image CDN.
- acceptance: absent
- scope: share page, view mode

## REQ-SHARE-07
- source: docs/prd/PRD-character-dossier.md
- description: A recipient can import a shared character into their own library as a new, unlinked character.
- acceptance: absent
- scope: import, share page

## REQ-SHARE-08
- source: docs/prd/PRD-character-dossier.md
- description: The holder of an owner token can delete the share, after which the URL returns a not-found page.
- acceptance: absent
- scope: share deletion, owner token

## REQ-SHARE-09
- source: docs/prd/PRD-character-dossier.md
- description: Republishing a living link that was changed elsewhere since it was last loaded is rejected, and the user is offered "reload" or "overwrite".
- acceptance: absent
- scope: optimistic concurrency, conflict resolution

## REQ-SHARE-10
- source: docs/prd/PRD-character-dossier.md
- description: Missing, deleted, unsupported-version and offline conditions each show a clear, styled error page rather than a blank screen.
- acceptance: absent
- scope: error states, share page

## REQ-SHARE-11
- source: docs/prd/PRD-character-dossier.md
- description: Before any network request, the share dialog shows an estimated payload size and refuses to publish when the 30 MiB / 60-image budget is exceeded.
- acceptance: absent
- scope: share dialog, budget check

### Image Service (IMG)

## REQ-IMG-01
- source: docs/prd/PRD-character-dossier.md
- description: Publishing checks which image hashes the server already holds and uploads only the missing ones, three at a time, with retries and per-image progress.
- acceptance: absent
- scope: image upload, deduplication

## REQ-IMG-02
- source: docs/prd/PRD-character-dossier.md
- description: The server rejects any image upload whose bytes do not hash to the requested key, whose magic bytes are not WebP or JPEG, or which exceeds 1.5 MiB or 2048 px on either edge.
- acceptance: absent
- scope: server-side image validation

## REQ-IMG-03
- source: docs/prd/PRD-character-dossier.md
- description: The server refuses to publish a share whose referenced images are missing or whose total image bytes exceed 30 MiB.
- acceptance: absent
- scope: server-side budget enforcement

### Adult Gate (GATE)

## REQ-GATE-01
- source: docs/prd/PRD-character-dossier.md
- description: A share page shows an 18+ interstitial before rendering only when at least one included page is flagged adult, and the acknowledgement is remembered in that browser.
- acceptance: absent
- scope: adult gate, interstitial

## REQ-GATE-02
- source: docs/prd/PRD-character-dossier.md
- description: The adult flag on a share is computed by the server from the included page types, never trusted from the client.
- acceptance: absent
- scope: adult gate, server-side computation

### Print (PRINT)

## REQ-PRINT-01
- source: docs/prd/PRD-character-dossier.md
- description: Printing (or "save as PDF") renders the selected pages in read-only mode with no form controls, rating cards never split across page breaks, and nav/toolbar elements hidden.
- acceptance: absent
- scope: print, view mode

## REQ-PRINT-02
- source: docs/prd/PRD-character-dossier.md
- description: User can choose which pages to print using the same page-selector component as the share dialog.
- acceptance: absent
- scope: print, section selector

### Schema (SCHM)

## REQ-SCHM-01
- source: docs/prd/PRD-character-dossier.md
- description: One shared schema package validates characters and share payloads identically in the browser and on the server.
- acceptance: absent
- scope: shared schema, validation

## REQ-SCHM-02
- source: docs/prd/PRD-character-dossier.md
- description: Each sub-document type owns a versioned migration registry, and a guard test fails the build when any supported version lacks a fixture.
- acceptance: absent
- scope: schema versioning, migrations, fixture guard

## REQ-SCHM-03
- source: docs/prd/PRD-character-dossier.md
- description: Loading a document at an unsupported version is rejected outright with a named error and nothing is partially applied.
- acceptance: absent
- scope: version rejection

### Security (SEC)

## REQ-SEC-01
- source: docs/prd/PRD-character-dossier.md
- description: The API rate-limits every mutating endpoint per IP and responds 429 with `Retry-After` when exceeded.
- acceptance: absent
- scope: rate limiting

## REQ-SEC-02
- source: docs/prd/PRD-character-dossier.md
- description: Owner tokens are stored only as SHA-256 hashes, compared in constant time, and never written to logs.
- acceptance: absent
- scope: owner token security

## REQ-SEC-03
- source: docs/prd/PRD-character-dossier.md
- description: An operator can take down a share and block its image hashes with a CLI command, and every share page carries a report link.
- acceptance: absent
- scope: takedown, abuse mitigation

## REQ-SEC-04
- source: docs/prd/PRD-character-dossier.md
- description: The API accepts cross-origin requests only from the app origin, offers no listing endpoint, and its S3 credentials cannot list the bucket.
- acceptance: absent
- scope: CORS, S3 IAM

### Operations (OPS)

## REQ-OPS-01
- source: docs/prd/PRD-character-dossier.md
- description: The API runs as a Railway service with a health endpoint and a documented environment-variable contract.
- acceptance: absent
- scope: deployment, Railway

## REQ-OPS-02
- source: docs/prd/PRD-character-dossier.md
- description: The Angular 22 web app builds with the standard application builder and deploys to Cloudflare Workers static assets with single-page-application fallback and long-lived caching for hashed assets.
- acceptance: absent
- scope: deployment, Cloudflare Workers

## REQ-OPS-03
- source: docs/prd/PRD-character-dossier.md
- description: The S3 bucket is private with CloudFront in front of images only, a billing alarm is configured, and a documented offline sweep script can remove unreferenced images.
- acceptance: absent
- scope: S3, CloudFront, billing alarm

### Design (DSGN)

## REQ-DSGN-01
- source: docs/prd/PRD-character-dossier.md
- description: The app ships light and dark themes driven by design tokens, following `prefers-color-scheme` with a manual override that persists.
- acceptance: absent
- scope: theming

## REQ-DSGN-02
- source: docs/prd/PRD-character-dossier.md
- description: Every screen works at 400 px width with 44 px minimum touch targets and no horizontal scrolling.
- acceptance: absent
- scope: responsive design, touch targets

## REQ-DSGN-03
- source: docs/prd/PRD-character-dossier.md
- description: All animation and transitions are disabled when `prefers-reduced-motion` is set.
- acceptance: absent
- scope: reduced motion, accessibility

## REQ-DSGN-04
- source: docs/prd/PRD-character-dossier.md
- description: Rating meters are keyboard-operable with radiogroup semantics and announce the selected level word to assistive technology.
- acceptance: absent
- scope: accessibility, ARIA, keyboard operability

### Plugins (PLUG)

## REQ-PLUG-01
- source: docs/prd/PRD-character-dossier.md
- description: A Bio/backstory page type (long-form prose sections with headings) can be attached, edited, shared and printed.
- acceptance: absent
- scope: plugin extensibility, Bio type

## REQ-PLUG-02
- source: docs/prd/PRD-character-dossier.md
- description: A Physical description page type (structured build, height with units, distinguishing features) can be attached, edited, shared and printed, and both new types land without changes to the page host, share or print code.
- acceptance: absent
- scope: plugin extensibility, Physical description type, zero-host-change proof

## v2 Requirements (deferred — not in v1 roadmap)

## REQ-REL-01
- source: docs/prd/PRD-character-dossier.md
- description: A Relationships page links to other characters in the same library with a role and notes.
- acceptance: absent
- scope: v2, Relationships

## REQ-REL-02
- source: docs/prd/PRD-character-dossier.md
- description: Sharing a character with a Relationships page inlines the referenced characters' core identities.
- acceptance: absent
- scope: v2, Relationships, sharing

## REQ-STAT-01
- source: docs/prd/PRD-character-dossier.md
- description: A Stats/abilities page holds named numeric attributes and skill lists.
- acceptance: absent
- scope: v2, Stats

## REQ-HIST-01
- source: docs/prd/PRD-character-dossier.md
- description: Every publish of a living link is retained and recipients can browse earlier versions.
- acceptance: absent
- scope: v2, version history

## REQ-SYNC-01
- source: docs/prd/PRD-character-dossier.md
- description: A library can be kept in sync across devices without an owner link per character.
- acceptance: absent
- scope: v2, sync

## REQ-CUST-01
- source: docs/prd/PRD-character-dossier.md
- description: User can add custom items to the fixed rating lists, carried with the character.
- acceptance: absent
- scope: v2, customisation

## REQ-FREE-01
- source: docs/prd/PRD-character-dossier.md
- description: A generic freeform page type of user-labelled text fields and rating lists.
- acceptance: absent
- scope: v2, freeform page type

## REQ-THMB-01
- source: docs/prd/PRD-character-dossier.md
- description: Gallery grids load reduced-size thumbnails and fetch full images on demand.
- acceptance: absent
- scope: v2, thumbnails

## REQ-GC-01
- source: docs/prd/PRD-character-dossier.md
- description: Unreferenced images are removed automatically on a schedule.
- acceptance: absent
- scope: v2, garbage collection

## Out of Scope (from PRD, informational — not requirements)

- Accounts, login, OAuth, magic links — see ADR-0005
- Template or form builder — see ADR-0001
- Real-time collaboration
- Moderation queue or automated scanning
- PDF generation library
- Internationalisation
- Server-side age verification — see ADR-0013
- Snapshot expiry — see ADR-0004
- Client-side encryption (former REQ-ENC-01, key in URL fragment) — REJECTED by the user, not deferred; see ADR-0006. SSE-S3 at-rest encryption is unaffected.
