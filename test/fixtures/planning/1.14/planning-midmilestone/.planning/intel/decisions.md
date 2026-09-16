# Decisions

Synthesized from 16 ADRs, all `status: Accepted`, all `locked: true`. No LOCKED-vs-LOCKED contradictions detected — see `INGEST-CONFLICTS.md`.

## ADR-0001: Sub-document types are code-defined typed templates with fixed rating lists
- source: docs/adr/0001-code-defined-subdocument-templates.md
- status: locked (Accepted)
- decision: Every sub-document type is a code-defined typed template (TypeScript schema, Zod validator, `createDefault()`, own version/migration chain, Angular editor component); adding a type is a code change and a release. A character holds at most one instance of each type (`pages[]` invariant: unique `type`). Rating lists inside a type are fixed; each list item has a stable kebab-case id; rating values are stored as integer levels (0 = unset, 1..6), never display strings.
- scope: sub-document types, TypeScript schema, code-defined templates, rating lists, character, version, migration, Angular editor

## ADR-0002: Character core fields are name, species/build, pronouns, orientation and portrait
- source: docs/adr/0002-character-core-fields.md
- status: locked (Accepted)
- decision: `CharacterCore` holds exactly `id` (UUID v4, local only, stripped from share payloads), `name`, `species`, `pronouns`, `orientation`, `portrait: ImageRef | null`, plus `createdAt`/`updatedAt` on the enclosing `Character`. Relationship context and dominant/submissive lean remain fields of the Intimacy Dossier, not the core. Field caps: name 120 chars, other short fields 200 chars.
- scope: CharacterCore, character fields, name, species, pronouns, orientation, portrait

## ADR-0003: One unified, reorderable, edit-in-place character page
- source: docs/adr/0003-unified-edit-in-place-page.md
- status: locked (Accepted)
- decision: The character page (`/c/:characterId`) renders the header followed by every sub-document in one continuous, scrolling document; no per-page navigation. Display order is the array order of `Character.pages`; reordered via drag-and-drop and keyboard up/down. Fields are always live inputs (no edit toggle); autosave to IndexedDB after 500ms debounce and on `pagehide`. Every sub-document editor implements both `mode: 'edit'` and `mode: 'view'` in one template; share page and print reuse the same components in `view` mode.
- scope: character page, edit-in-place editing, drag-and-drop reordering, autosave, IndexedDB, sub-documents, view mode, share page, print

## ADR-0004: Two share-link kinds, snapshot and living, with per-share section selection and no expiry
- source: docs/adr/0004-share-links-snapshot-and-living.md
- status: locked (Accepted)
- decision: Two share kinds chosen at publish time: Snapshot (immutable, new object/id per publish) and Living (mutable in place by owner, last-updated stamp, no version history UI). Share ids are 128 random bits, Crockford base32, first char `s`/`l` denotes kind. Owner picks which sub-documents to include per share; a living link remembers its selection server-side. Neither kind expires. Living updates use ETag and optional If-Match; stale republish gets 412.
- scope: share links, snapshot, living, section selection, storage

## ADR-0005: Ownership is a bearer token carried in an owner link; there are no accounts
- source: docs/adr/0005-owner-token-owner-link-no-accounts.md
- status: locked (Accepted)
- decision: Every publish returns an owner token (256 bits, base64url, 43 chars). For living shares it authorises PUT and DELETE; for snapshots, DELETE only. Server stores only `sha256(token)`, constant-time compare, never logged/returned by GET. Owner link = share URL with token in the fragment (`#edit=<token>`), never sent to any server or CDN. Losing the token freezes the living link permanently (no recovery). There are no accounts, login, or email, in v1 or planned for v2.
- scope: bearer tokens, owner links, ownership verification, anonymous product, IndexedDB, shares, publishing

## ADR-0006: Privacy is an unguessable id; objects are stored in plaintext in S3
- source: docs/adr/0006-privacy-unguessable-id-plaintext-s3.md
- status: locked (Accepted)
- decision: A share is protected only by its id (~125 bits effective randomness). No listing endpoint; API IAM policy has no `ListBucket`; share pages carry `noindex`. Share objects and images are stored in plaintext in a private S3 bucket with default SSE-S3 encryption at rest; no client-side encryption. The share dialog discloses that anyone with the link can view the content and that content is stored unencrypted server-side. The adult interstitial (ADR-0013) is a content warning, not an access control.
- scope: privacy, S3 storage, plaintext objects, unguessable ID, encryption, share links

## ADR-0007: The backend is a small Node + TypeScript service on Railway writing to AWS S3
- source: docs/adr/0007-backend-node-typescript-railway-s3.md
- status: locked (Accepted)
- decision: The API is a single Node 22 process in `apps/api`, TypeScript, using Hono as the HTTP framework (Fastify acceptable substitute if a plan finds concrete reason) and the AWS SDK v3 S3 client. Runs as one Railway service, exposes `GET /healthz`, configured entirely by environment variables. Holds no database — all state is S3 objects; rate limiting is an in-memory sliding window per IP that resets on deploy. Validates every payload with the same Zod schemas the client uses. Image bytes served by CloudFront directly from S3, never proxied through Railway.
- scope: Node.js, TypeScript, Railway, AWS S3, Hono, payload validation, rate limiting

## ADR-0008: pnpm monorepo with a shared schema package consumed by web and api
- source: docs/adr/0008-monorepo-shared-schema-package.md
- status: locked (Accepted)
- decision: Repository is a pnpm workspace with three packages: `apps/web` (Angular), `apps/api` (Node service), `packages/schema` (plain TypeScript built with tsc, containing envelope types, contracts, registry, plugin Zod schemas, versions, migrations, fixtures, migration walker). Zod schemas are the single source: runtime validators on both sides and inferred TData types. `packages/schema` has no Angular or Node dependencies.
- scope: pnpm, monorepo, workspace, schema package, TypeScript, Zod, type validation, Angular, Node.js, migrations

## ADR-0009: Frontend on Cloudflare Workers static assets; API and images on separate subdomains
- source: docs/adr/0009-hosting-cloudflare-static-api-subdomain.md
- status: locked (Accepted)
- decision: `apps/web` deploys to Cloudflare Workers static assets with `wrangler.jsonc` and `_worker.js` modelled on SizeLab's. App served from apex/`www`; API at `https://api.<domain>/v1` on Railway; images at `https://img.<domain>/<hash>.<ext>` from CloudFront in front of the S3 `images/` prefix. CORS on the API allows exactly the app origin plus `localhost:4200` for development.
- scope: Cloudflare Workers, static assets, Railway API, CloudFront images, subdomains, CORS, SPA

## ADR-0010: Share payloads are JSON, stored gzipped at rest
- source: docs/adr/0010-json-gzip-payload-encoding.md
- status: locked (Accepted)
- decision: All API request/response bodies for shares are JSON (`Content-Type: application/json`); only image uploads are raw bytes. Share objects written to S3 gzipped with `Content-Encoding: gzip` at `shares/snap/<id>.json.gz` and `shares/live/<id>.json.gz`. API decompresses on read; CloudFront is not in front of `shares/`. Zod validates the parsed JSON directly. Body cap for a share publish is 512 KiB of JSON.
- scope: JSON encoding, gzip compression, S3 storage, share payloads, API requests/responses, Content-Encoding

## ADR-0011: Per-sub-document-type schema versions with a thin envelope version, mirroring SizeLab's migration policy
- source: docs/adr/0011-per-plugin-schema-versioning.md
- status: locked (Accepted)
- decision: Each sub-document type owns its own `currentVersion`, `supportedVersions`, ordered `migrations`, and one fixture per supported version. A thin envelope version `CHARACTER_SCHEMA_VERSION` (starting `1.0.0`) covers only `CharacterCore`, the `SubDocument` wrapper shape, and `SharePayload`. Structural change owes a version bump; behavioural change does not. Unsupported versions are hard-rejected before any migration or structural check, nothing partially applied. A guard spec diffs each plugin's fixture set against its `supportedVersions` and fails the build on any gap.
- scope: schema versioning, sub-document types, plugin versioning, migrations, CharacterCore, envelope version, versions registry, fixtures

## ADR-0012: Images are client-compressed, content-addressed by SHA-256, uploaded only if missing, and never garbage-collected in v1
- source: docs/adr/0012-content-addressed-images-no-gc.md
- status: locked (Accepted)
- decision: Client-side compression before storage (`createImageBitmap` → `OffscreenCanvas` → `convertToBlob` as WebP, Web Worker with main-thread fallback; JPEG fallback if WebP encode unavailable). Content addressing: SHA-256 of stored compressed bytes is the image's identity everywhere (IndexedDB key, S3 key, CDN URL, `ImageRef.hash`). Upload only if missing (`POST /images/exists` then `PUT /images/<hash>` for missing only). Budgets: 1.5 MiB hard cap per image, 30 MiB and 60 images per share. No garbage collection in v1; a documented offline mark-and-sweep script exists to run by hand if a $10/month billing alarm fires. S3 versioning is off.
- scope: image storage, client-side compression, content addressing, SHA-256, S3, IndexedDB, WebP, JPEG

## ADR-0013: Adult content is gated by a client-side interstitial shown only when an included section is adult, with the flag recomputed server-side
- source: docs/adr/0013-adult-gate-interstitial.md
- status: locked (Accepted)
- decision: Every sub-document type declares `adult: boolean` in its `SubDocumentSchema`. Intimacy Dossier is `adult: true`; Gallery, Bio, Physical description are `adult: false`. On publish the server recomputes the share's `adult` flag from the registry for included page types; client-supplied value is ignored. Share page shows an 18+ interstitial before rendering only if `adult` is true; acknowledgement remembered per browser in `localStorage['cd.adultAck']`. The interstitial is a content warning, never described as an age gate or access control.
- scope: adult content gating, interstitial, share pages, Intimacy Dossier, SubDocumentSchema, localStorage acknowledgement

## ADR-0014: Print uses a browser print stylesheet with a page selector shared with the share dialog
- source: docs/adr/0014-print-stylesheet-with-page-selection.md
- status: locked (Accepted)
- decision: Printing is browser print (`window.print()`) driven by a print stylesheet; no PDF or canvas library. Before printing, the character page flips every sub-document editor to `mode: 'view'` via a `printMode` signal, then restores edit mode afterwards. A section selector component (checkbox per page, adult badge, page count) is used by both the print dialog and the share dialog. Print rules hide controls/nav/toasts/drag handles; white background/black text; `break-inside: avoid` on cards; `printBreakBefore` per sub-document.
- scope: printing, browser print, print stylesheet, page selection, view mode, section selector, share dialog

## ADR-0015: The visual direction evolves the prototype's editorial dossier look, in light and dark
- source: docs/adr/0015-visual-direction-evolve-dossier.md
- status: locked (Accepted)
- decision: The design system extends the prototype (not SizeLab's theme): tokens are the prototype's `--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--accent`, `--accent-strong`, `--accent-soft`, `--focus`, plus spacing/radius/motion tokens in the shape of SizeLab's `_theme.scss`. Fonts: Fraunces (display), Source Sans 3 (body), IBM Plex Mono (labels). Light and dark are both first-class via `data-theme`. Anti-patterns adopted from SizeLab: no box-shadow elevation, no backdrop blur, no hover transforms, no gradient surfaces (except lean slider track). Mobile-first: 44px touch targets, single-column collapse, bottom sheet for overflow.
- scope: design system, light/dark theming, typography, CSS custom properties, ARIA accessibility, mobile-first design

## ADR-0016: Angular 22 standalone components with signals and zoneless change detection, SCSS and CSS custom properties; no UI framework or store library
- source: docs/adr/0016-angular-signals-no-ui-framework.md
- status: locked (Accepted)
- decision: Angular 22, `bootstrapApplication`, standalone components only, no NgModules, lazy routes. Zoneless change detection is the default; `zone.js` is not a dependency. Signals for state (`input()`/`input.required()`, `output()`, `signal`/`computed`/`effect`/`untracked` in root-provided store services). Control flow is `@if`/`@for`/`@switch`/`@defer`; never `*ngIf`/`*ngFor`. Styling is SCSS with CSS custom properties; no Angular Material, Tailwind, or Bootstrap. Only UI library dependency is `@angular/cdk/drag-drop`. No NgRx or SignalStore.
- scope: Angular 22, signals, standalone components, zoneless change detection, SCSS, CSS custom properties, state management, component architecture
