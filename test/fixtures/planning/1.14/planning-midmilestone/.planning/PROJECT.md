# Character Dossier

## What This Is

Character Dossier is a single-page web app for building, keeping and sharing reference sheets for fictional characters. A Character is a small core identity (name, species/build, pronouns, orientation, portrait) plus an ordered set of typed sub-documents ("pages"), all edited in place on one continuous page and autosaved to the browser. Sharing is by link — a small Node service on Railway writes JSON plus content-addressed images to S3, and anyone holding the link sees the same page read-only; a living link stays current with the owner's edits, a snapshot link never changes.

## Core Value

One link shows a character's whole dossier, beautifully, and the owner can keep it current. If everything else fails, opening a share link on any device must render the full, correctly ordered dossier in the intended visual style.

## Requirements

### Validated

- ✓ Library & Character core (CHAR-01–03) — create, list, open, duplicate, delete, autosave with persistent-storage request — Phase 1
- ✓ Schema (SCHM-01–03) — shared validation package, versioned migrations + fixture guard, hard version rejection — Phase 1
- ✓ Web deploy (OPS-02) — standard Angular builder, Cloudflare Workers static assets with SPA fallback — Phase 1
- ✓ Design (DSGN-01–03) — light/dark theming with persisting override, 400px/44px layout, reduced motion — Phase 1
- ✓ Library & Character (CHAR-04–06) — add/remove/reorder pages, unified scrolling page with section nav — Phase 2
- ✓ Intimacy Dossier (INTM-01–05) — 46 rating cards, lean/placement sliders, capacity fields, free text, adult flag — Phase 2
- ✓ Design (DSGN-04) — accessible meters — Phase 2
- ✓ Sharing (SHARE-01, SHARE-06, SHARE-07, SHARE-10) — snapshot publish with share URL, read-only render identical to the editor, import-to-library as a new unlinked character, styled error states for missing/deleted/unsupported/offline — Phase 3
- ✓ Adult Gate (GATE-01–02) — client interstitial remembered per browser, adult flag always recomputed server-side from the registry — Phase 3
- ✓ Security (SEC-04) — exact-match CORS on the app origin, least-privilege S3 IAM with bucket listing denied, private bucket with public access blocked — Phase 3
- ✓ Operations (OPS-01) — Railway API service live at `api.characterdossierlab.app` with a `/healthz` endpoint reporting the deployed sha — Phase 3

### Active

v1 scope: 50 requirements across 12 categories. Full requirement text, acceptance detail and phase mapping live in `.planning/REQUIREMENTS.md`.

- [ ] Library & Character (CHAR-07) — library export/import
- [ ] Gallery & Portrait (GALL-01–04) — image add/caption/reorder, client-side compression + EXIF strip, content-addressed dedup, portrait pipeline
- [ ] Sharing (SHARE-02–05, SHARE-08, SHARE-09, SHARE-11) — living links, republish-in-place, owner-link adoption, share deletion, conflict handling, payload budget (SHARE-01/06/07/10 shipped in Phase 3)
- [ ] Image Service (IMG-01–03) — dedup upload, server-side validation, share budget enforcement
- [ ] Print (PRINT-01–02) — print/"save as PDF" view mode, shared section-selector component
- [ ] Security (SEC-01–03) — rate limiting, owner-token hashing surfaced end-to-end, takedown CLI (SEC-04 shipped in Phase 3)
- [ ] Operations (OPS-03) — CloudFront in front of S3 images + billing alarm (OPS-01 shipped in Phase 3)
- [ ] Plugins (PLUG-01–02) — Bio and Physical description page types proving zero-host-change extensibility

### Out of Scope

- Accounts, login, OAuth, magic links — the link is the identity; avoids a user store, auth and a database (ADR-0005)
- Template or form builder — code-defined types cover the known needs; avoids "schema for schemas" (ADR-0001)
- Real-time collaboration — no accounts and no server-side document store; conflict detection on republish is the only concurrency control
- Moderation queue or automated content scanning — hobby-scale service; report link plus operator takedown is proportionate
- PDF generation library — the browser print dialog produces PDFs from the print stylesheet
- Internationalisation — single-language product; the rating vocabulary is part of the design
- Server-side age verification — the interstitial is a content notice, not access control (ADR-0013)
- Snapshot expiry — reference sheets get pasted into chats revisited years later; storage cost per share is negligible (ADR-0004)
- Client-side encryption (former ENC-01: key in URL fragment) — **Rejected by the user, not deferred.** The server must see plaintext to validate payloads, recompute `adult`, enforce budgets, deduplicate images and act on takedowns. SSE-S3 default at-rest encryption is unaffected. (ADR-0006)
- v2 requirements (REL-01, REL-02, STAT-01, HIST-01, SYNC-01, CUST-01, FREE-01, THMB-01, GC-01) — deferred, not in the v1 roadmap; tracked in `.planning/REQUIREMENTS.md`

## Context

- Phase 1 shipped the pnpm monorepo, `packages/schema`, and the zoneless Angular 22 app shell with an IndexedDB-backed character library, deployed as Cloudflare Workers static assets. Before that, the repository held only a doc set (16 ADRs, 1 PRD, 12 SPECs, 1 README) and a working prototype, `character-dossier.html`, which seeds the Intimacy Dossier type and the visual design system.
- Phase 3 shipped the whole snapshot-share path end to end and put the first server in production: `apps/api` (Hono on Node 22) deployed to Railway behind `api.characterdossierlab.app`, writing gzipped share objects to the private S3 bucket `character-dossier` (us-west-2). A character can be published as an immutable snapshot, opened read-only by anyone with the link, gated behind the 18+ interstitial when it includes the Intimacy Dossier, and imported into a recipient's own library.
- Users are anonymous hobbyist writers, roleplayers and artists (owners) and the people they hand links to (recipients, who may import a copy). Most sessions are on a phone.
- There are no accounts anywhere in the product's plan, v1 or v2. The link is the identity.
- A sibling project, `~/Development/Personal/SizeComparisonSite` (Angular 20, zone.js), is cited throughout the specs as a pattern reference for hosting config, migration registry, IndexedDB wrapper, share-link guard, image-processing worker and design tokens — but Character Dossier targets Angular 22 zoneless, so copied patterns must be checked for zone-dependent behavior. SizeLab's backend is a separate, unavailable Cloudflare Worker repo; this project's backend is designed from scratch.
- Ingest source for this project's planning docs: 16 ADRs (all `Accepted`/locked), 1 PRD, 12 SPECs, 1 README, synthesized via `/gsd-ingest-docs`. Full synthesized intel is in `.planning/intel/`; the conflict report (`.planning/INGEST-CONFLICTS.md`) found 0 blockers, 0 warnings, 3 informational notes.
- Phase research must confirm exact Angular 22 / Node 22 / pnpm tooling versions against official documentation before Phase 1 begins (per PRD Overview) — the reference project is pinned to an older Angular major.

## Constraints

- **Tech stack**: Angular 22, standalone components, signals, zoneless change detection (no zone.js), no NgModules, no UI framework except `@angular/cdk/drag-drop`, deployed to Cloudflare Workers static assets — ADR-0016, ADR-0009
- **Tech stack**: Node 22 + TypeScript API (Hono, Fastify acceptable substitute with concrete reason) on Railway; no database — all state is S3 objects — ADR-0007
- **Tech stack**: AWS S3 (private bucket, SSE-S3 default encryption, versioning off) with CloudFront in front of images only — ADR-0006, SPEC-storage-s3
- **Dependencies**: pnpm monorepo — `apps/web` (Angular), `apps/api` (Node), `packages/schema` (framework-free Zod schemas as the single source of validation, consumed by both apps) — ADR-0008
- **Compatibility**: Angular 22 zoneless is new ground relative to the SizeLab reference project (Angular 20, zone.js) — any borrowed pattern needs a zone-dependence check
- **Security**: ASVS Level 1 threat model; no PII, no payments, no authentication; the owner bearer token (256-bit, stored only as a SHA-256 hash) is the only credential in the system — SPEC-security-and-abuse
- **Budget**: hard image caps 1.5 MiB / 2048 px per image; per-share budget 30 MiB / 60 images; share publish JSON body cap 512 KiB — ADR-0012, ADR-0010
- **Cost**: S3 storage ~$0.04/mo at 1k characters, ~$4.15/mo at 100k; a $10/mo AWS Budgets alarm triggers a manual sweep script, never automatic garbage collection in v1 — ADR-0012, SPEC-storage-s3

## Key Decisions

<!-- ADR-locked decisions from docs/adr/. All 16 are status: Accepted, locked: true — binding, not provisional. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Sub-document types are code-defined typed templates (TS schema + Zod + `createDefault()` + own migration chain); adding a type is a code change and a release. One instance per type per character. | Fixed rating lists and known structure don't need a runtime form builder; typed code is simpler to validate and extend safely. | 🔒 Locked (ADR-0001) |
| `CharacterCore` holds only `id`, `name`, `species`, `pronouns`, `orientation`, `portrait`, `createdAt`/`updatedAt`; lean/placement stay on the Intimacy Dossier, not core. | Keeps the core identity small and type-agnostic; intimate fields belong to the plugin that owns them. | 🔒 Locked (ADR-0002) |
| One continuous, scrolling, edit-in-place character page; no per-page navigation, no edit-mode toggle; autosave to IndexedDB (500ms debounce + `pagehide`). Every sub-document editor implements both `edit` and `view` mode in one template. | Matches Goal 2 (editing is in place, no separate form mode) and lets share/print reuse the same components in view mode. | 🔒 Locked (ADR-0003) |
| Two share kinds chosen at publish: Snapshot (immutable) and Living (mutable in place, ETag/If-Match concurrency). Owner picks included pages per share; living link remembers the selection. Neither kind expires. | Covers both "paste and forget" and "keep current" sharing needs without version-history complexity. | 🔒 Locked (ADR-0004) |
| Ownership is a bearer token carried in an owner-link URL fragment; there are no accounts, in v1 or planned for v2. Server stores only `sha256(token)`, constant-time compared. Losing the token permanently freezes a living link. | The link is the identity — avoids a user store, auth flow and database entirely. | 🔒 Locked (ADR-0005) |
| Privacy is an unguessable share id only (~125 bits); no listing endpoint; objects stored in plaintext in a private S3 bucket with SSE-S3 default encryption; no client-side encryption. | Server must see plaintext to validate payloads, recompute `adult`, enforce budgets, dedupe images and act on takedowns — client-side encryption (ENC-01) was evaluated and rejected by the user for this reason. | 🔒 Locked (ADR-0006) |
| Backend is a single Node 22 + TypeScript process (`apps/api`, Hono) on one Railway service, no database, all state in S3; in-memory sliding-window rate limiter (resets on deploy). | Smallest possible always-on service for a hobby-scale, anonymous, database-free product. | 🔒 Locked (ADR-0007) |
| pnpm workspace: `apps/web`, `apps/api`, `packages/schema` (plain TS, tsc, no Angular/Node deps). Zod schemas are the single source of runtime validation and inferred types on both sides. | Guarantees browser and server validate identically (SCHM-01) without duplicating schema logic. | 🔒 Locked (ADR-0008) |
| `apps/web` on Cloudflare Workers static assets (apex/`www`); API at `api.<domain>` (Railway); images at `img.<domain>` (CloudFront + S3 `images/` prefix). CORS allows exactly the app origin plus `localhost:4200` in dev. | Matches the SizeLab hosting pattern; keeps each deployable independently scalable and cacheable. | 🔒 Locked (ADR-0009) |
| Share API bodies are JSON; only image uploads are raw bytes. Share objects stored gzipped in S3 (`Content-Encoding: gzip`); publish body capped at 512 KiB of JSON. | Keeps storage and transfer cheap without a binary protocol. | 🔒 Locked (ADR-0010) |
| Two independent version spaces: a thin envelope version (`CHARACTER_SCHEMA_VERSION`) and a per-sub-document-type version, each with its own `supportedVersions`/migrations/fixtures. A guard spec fails the build on any fixture gap. | Structural change in one plugin shouldn't force a version bump everywhere else; mirrors SizeLab's proven migration policy. | 🔒 Locked (ADR-0011) |
| Images are client-compressed (WebP via `OffscreenCanvas`, JPEG fallback), content-addressed by SHA-256 of the compressed bytes, uploaded only if the server doesn't already have the hash. No garbage collection in v1 — a manual, documented sweep script exists for when the billing alarm fires. | Storage stays cheap (dedup) and simple (no GC infra) at hobby scale; a manual sweep is enough given the $10/mo alarm threshold. | 🔒 Locked (ADR-0012) |
| Adult content is gated by a client-side 18+ interstitial shown only when an included page is flagged adult; the flag is always recomputed server-side from the registry, never trusted from the client. | Matches Goal/Non-Goal balance: a content warning, not access control — server-side recomputation prevents a tampered client from hiding the gate. | 🔒 Locked (ADR-0013) |
| Printing is `window.print()` driven by a print stylesheet; no PDF or canvas library. A section-selector component (checkbox per page, adult badge, page count) is shared between the print dialog and the share dialog. | The browser print dialog already produces PDFs; a shared selector avoids building two page-picker UIs. | 🔒 Locked (ADR-0014) |
| Visual direction evolves the prototype's editorial dossier look (not SizeLab's theme): prototype's token names, Fraunces/Source Sans 3/IBM Plex Mono, light and dark both first-class via `data-theme`, no box-shadow/blur/hover-transform/gradient anti-patterns (adopted from SizeLab) except the lean-slider track. | Preserves the prototype's established visual identity (Goal 6) while adopting SizeLab's proven anti-pattern discipline. | 🔒 Locked (ADR-0015) |
| Angular 22 standalone components only, signals for state, zoneless change detection as default (no zone.js dependency), SCSS + CSS custom properties, no UI framework or store library except `@angular/cdk/drag-drop`. | Smallest reasonable dependency surface for a solo-maintained SPA; zoneless is the modern Angular default going forward. | 🔒 Locked (ADR-0016) |
| Rating meter hit areas follow WCAG 2.5.8's 24×24px floor by default (touch, unknown pointer), but shrink to the prototype's compact 12×12 dot / 14px heart glyphs under `@media (pointer: fine)` (mouse only). | Preserves the prototype's dense desktop rating-card density without sacrificing the accessible target size on touch. | Documented in SPEC-design-system §4.7 — Phase 2 |
| Sub-document plugins may declare an optional `sections?: readonly PluginSection[]` member so a plugin registers named jump targets in the unified page's sticky section nav without any host-code change. | Keeps the plugin contract additive — existing and future plugins compile unchanged, and the section nav stays fully registry-driven. | Documented in SPEC-subdocument-plugin-contract — Phase 2 |
| Removing a page has no confirm dialog; an 8-second Undo snackbar restores the exact removed page (same character only) instead. | Matches the app's edit-in-place philosophy — a reversible action beats an interrupting confirmation. | Documented in SPEC-subdocument-plugin-contract — Phase 2 |
| A missing share and a deleted share render the identical `not-found` view — 404 and 410 map to one screen with the same text and actions. | A distinguishable "this was taken down" state leaks the fact that a share once existed at that id; indistinguishability is the privacy-preserving default for an unguessable-id system. | Documented in 03-05 — Phase 3 |
| TLS for `api.characterdossierlab.app` is terminated by Cloudflare (orange cloud), not by Railway via a DNS-only CNAME as D-15 originally specified. | Accepted rather than reverted: the Cloudflare edge joins the trust boundary, which is sound as long as the hostname's SSL/TLS mode stays **Full (strict)**. If it is ever set to Flexible, the Cloudflare→Railway hop becomes plaintext and this acceptance lapses. | Accepted risk R-03-05 in 03-SECURITY.md — Phase 3 |
| The production S3 bucket is `character-dossier` (us-west-2), not `character-dossier-prod` as SPEC-storage-s3 and SPEC-deployment specify. | The bucket already existed under that name; S3 bucket names are immutable, so renaming means create + migrate + delete. The IAM policy ARNs were updated to match instead. The specs are still stale on this point (WINDOWS #4). | Deviation logged in 03-07 — Phase 3 |

---
*Last updated: 2026-09-16 after Phase 3*
