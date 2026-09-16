# Phase 3: Snapshot Share End-to-End - Research

**Researched:** 2026-09-14
**Domain:** Node/Hono API on Railway + S3 storage + Angular read-only share view + server-computed adult gate
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Page choice in a snapshot**
- **D-01:** Build the shared `SectionSelector` component (SPEC-design-system §4.14, SPEC-frontend-architecture §7) **in this phase**, without the size estimate (`showSizeEstimate` stays off until Phase 4). Phase 6 reuses it for print; Phase 5 adds selection memory.
- **D-02:** When the share dialog opens, **every page is checked**. The header row is checked and disabled. The 18+ badge on a row is the owner's cue to uncheck it.
- **D-03:** A **header-only** snapshot (zero pages checked) is allowed; Publish stays enabled.

**Publish dialog and records**
- **D-04:** A **Share** button sits in the top row of the character page beside "← Library". Phase 6 adds Print beside it. It is absent in the dev view-mode preview (D-14 of Phase 2).
- **D-05:** The Phase 3 dialog offers **snapshot only**, with no kind picker and no disabled Living option. Copy states the link never changes. Phase 5 adds the Snapshot/Living choice.
- **D-06:** The dialog shows **one plain disclosure line** above Publish, e.g. "Anyone with this link can view the selected pages. Snapshot links cannot be edited." No claim about deleting links (delete ships in Phase 5).
- **D-07:** On success, the URL is copied to the clipboard immediately and the dialog switches to a **result view**: URL in a read-only field, "Copy again", "Open link", "Done". If the clipboard write fails, the text says "Copy the link below" instead of "Link copied".
- **D-08:** Every successful publish writes a record to the existing IndexedDB `shares` store (already declared in `indexeddb-config.ts`, no DB version bump): `{shareId, kind, characterId, ownerToken, includedTypes, lastPublishedAt, etag}`. The snapshot's owner token is **kept** so Phase 5 delete (SHARE-08) and Phase 7 backup work for snapshots made now. **No list of earlier links in the UI** this phase. — **Reversibility:** one-way — a token discarded now can never be recovered; snapshots published before a storing build could never be deleted by their owner.

**Share page and import**
- **D-09:** Above the dossier, `SharePage` shows **one slim bar**: "Snapshot · published <date>" left, "Save to my library" right. No "← Library" link on the share page. The app header (wordmark, Display options) stays. Phase 5 changes the line to "updated <date>" for living links.
- **D-10:** The Save button (and all dossier content) is not visible until the 18+ interstitial is acknowledged when `adult` is true.
- **D-11:** "Save to my library" creates a **new unlinked character** (new uuid, `core` + included `pages` from the payload after validate/migrate, no `shares` record, no token), then navigates to `/c/:newId` with snackbar "Saved to your library". Tapping it again on a later visit makes another copy.
- **D-12:** `404 NOT_FOUND` and `410 REMOVED` render **one shared message**: "This link doesn't lead to a dossier" / "It may have been deleted, or the link is incomplete." A takedown is not revealed. Malformed ids never reach the API as a distinct error.
- **D-13:** Error actions: **offline/network failure** → "Try again" (re-fetch in place, no full reload) + "Go to Character Dossier"; **not found** and **unsupported version** → "Go to Character Dossier" only. The unsupported-version text tells the user to reload to get the latest app.

**Hosting and dev stack**
- **D-14:** Phase 3 ends **live**: API on Railway, real S3 bucket `character-dossier-prod` with the IAM policy from SPEC-storage-s3 §5 (no `s3:ListBucket`), web app on Workers calling it. AWS console, Railway and Cloudflare DNS steps are human checkpoints. CloudFront, `img.` and the billing alarm are **not** set up this phase.
- **D-15:** Domain is **`characterdossierlab.app`** (Cloudflare zone). App on the **apex** `https://characterdossierlab.app`; `www.characterdossierlab.app` 301-redirects to the apex. API at `https://api.characterdossierlab.app` via a **DNS-only** (grey cloud) CNAME to Railway so Railway issues the TLS certificate. `APP_ORIGIN=https://characterdossierlab.app`. Share URLs: `https://characterdossierlab.app/s/<id>`. `SPEC-deployment.md` §1 and the `<domain>` placeholders it owns, plus `apps/web/wrangler.jsonc` routes, must be updated. — **Reversibility:** one-way — share URLs published on this origin get pasted into chats and never expire (ADR-0004); moving the app origin later breaks every existing link unless a permanent redirect is kept.
- **D-16:** Local development uses **MinIO via a root `docker-compose.yml`** that also creates the `character-dossier-dev` bucket. `S3_ENDPOINT=http://localhost:9000`.
- **D-17:** The API reaches S3 through a small **object-store interface** (get / put-if-absent / head / delete). Unit and route tests use an **in-memory fake**, so `pnpm test` needs no Docker. One opt-in integration spec runs against MinIO.

### Claude's Discretion
- Error handling inside the publish dialog for `400`/`413`/`422`/`429`/network, mapped from SPEC-share-api error codes (429 shows the retry time, no auto-retry).
- Flushing pending autosave before building the payload.
- Where the server-side adult recomputation lives. Note: `computeAdult` does **not** exist in `packages/schema` yet despite the Phase 2 context saying so — add it to the schema package so web and API share it.
- Share page loading state and the exact date format in the slim bar.
- Web environment file naming: the code uses `environment.ts` (production default) + `environment.development.ts` (file replacement), which differs from SPEC-deployment §3's `environment.ts`/`environment.prod.ts`. Follow the code and add `apiBaseUrl`/`appOrigin` there; correct the spec table.
- Railway build via Nixpacks or a small `node:22-alpine` Dockerfile.
- `noindex` mechanism for share pages (meta tag set by `SharePage`).

### Deferred Ideas (OUT OF SCOPE)
- "Earlier links" list in the share dialog (date, pages, Copy) — records are stored now (D-08); a UI for them fits Phase 5 alongside delete and republish.

**Phase boundary (from CONTEXT.md `<domain>`):** Not in this phase: images, `POST /images/exists`, `PUT /images/:hash`, CloudFront, size estimate (Phase 4); living links, `PUT`/`DELETE /shares`, owner-link `#edit=` handling, selection memory (Phase 5); print dialog (Phase 6); rate limiting, takedown CLI, report link, billing alarm (Phase 7).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHARE-01 | Publish a snapshot, receive a clipboard-copied share URL; content behind the URL never changes | `POST /shares` check order (SPEC-share-api §4.1), id/token format (§2), publish dialog result view (D-07), Code Examples §"Client publish sequence" |
| SHARE-06 | Share page renders the same layout as the editor, read-only, images from the CDN | `SharePage` composition reusing `CharacterHeader`/`SectionNav`/`SubDocHost` in `mode='view'` (SPEC-frontend-architecture §6); Phase 3 has no real images yet (see Pitfall "empty images manifest") so the CDN half is a no-op this phase |
| SHARE-07 | Recipient can import a shared character as a new, unlinked character | D-11; `LibraryStore.duplicate()` pattern (verified in `library.store.ts`) as the model for materializing a new `core.id` |
| SHARE-10 | Missing/deleted/unsupported-version/offline each render a styled error page | D-12, D-13; `UnsupportedVersionError`/`InvalidDocumentError` mapping (SPEC-serialization-policy); Architecture Patterns §"Share page state machine" |
| GATE-01 | 18+ interstitial shown only when share includes an adult page, ack remembered per browser | ADR-0013, SPEC-design-system §4.13, `AdultGateService` (SPEC-frontend-architecture §3, §8) |
| GATE-02 | `adult` computed server-side from included page types, never trusted from client | SPEC-share-api §4.1 step 6; `computeAdult` gap (Assumptions/Discretion), Code Examples §"computeAdult" |
| OPS-01 | Railway service with health endpoint and documented env-var contract | SPEC-deployment §4 (env contract table, verified against SPEC-share-api §1); Environment Availability |
| SEC-04 | CORS restricted to app origin, no listing endpoint, S3 credentials can't list bucket | SPEC-share-api §6 (CORS headers), SPEC-storage-s3 §5 (IAM policy, no `s3:ListBucket`), SPEC-security-and-abuse §1 |
</phase_requirements>

## Summary

Phase 3 stands up the first backend service in this project (`apps/api`, Hono on Node 22, deployed to Railway) and the first real S3 usage, then wires the existing Angular share/view plumbing (already scaffolded conceptually in Phase 1-2's `mode='view'` support) into a working read-only share flow. The scope is narrower than the full `SPEC-share-api.md` contract: only `GET /healthz`, `POST /shares` (snapshot only — no `kind` picker, no `PUT`/`DELETE /shares`), and `GET /shares/:id` are built this phase. Images (`POST /images/exists`, `PUT /images/:hash`) do not exist yet as a feature (no portrait/gallery upload UI ships until Phase 4), so every `SharePayload.images` array published in this phase is empty — the manifest-matching and image-budget checks in the publish check order become no-ops but should still be implemented per spec so Phase 4 does not have to touch the handler again.

Two new capabilities must be added to the shared `packages/schema` before either side can use them: `computeAdult(pages)` and (for forward-compat with the plugin contract) `collectAllImageRefs`. Neither exists today — confirmed by reading `packages/schema/src/migrate.ts`, which exports only `compareVersions`, `migrateSubDocument`, `validateSubDocument`, `migrateEnvelope`, `validateCharacter` and the two error classes. This directly matches the CONTEXT.md discretion note flagging the gap.

The web side needs: a `SectionSelector` component (shared share/print, no size estimate this phase), a `ShareDialog` (snapshot-only, result view with clipboard copy), a `ShareStore`/`ShareApiService`/`ShareRepo` triad, a `SharePage` route (`/s/:shareId`) composing the existing view-mode-capable `CharacterHeader`/`SectionNav`/`SubDocHost`, an `AdultGateService` + interstitial component, and styled error states for 404/410/version/offline. All of this is already precisely specified in `SPEC-frontend-architecture.md` — this research's job is to flag the gaps between that spec and the actual repo state (Angular's test builder, environment file names, missing schema functions, empty portrait) so the planner doesn't re-derive them from scratch.

Hosting is the highest-external-risk part of the phase: three providers (Railway, AWS, Cloudflare) each need one-time manual setup (IAM user, S3 bucket, Railway service + custom domain, Cloudflare DNS records) that cannot be scripted end-to-end and must be human checkpoints, exactly as D-14 says.

**Primary recommendation:** Build `apps/api` as a single Hono app with a small `ObjectStore` interface (get / putIfAbsent / head / delete) implemented by an in-memory fake (unit/route tests), a MinIO-backed implementation (local dev + one opt-in integration spec), and the real `@aws-sdk/client-s3` implementation (production) — all three satisfying the same interface so route handlers never import the AWS SDK directly. Implement the full `POST /shares` check order from `SPEC-share-api.md` §4.1 now (even though the image-related steps are no-ops with an empty manifest) rather than a Phase-3-shortcut version, since it is the same amount of code either way and avoids a rewrite in Phase 4/5.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Build `SharePayload`, local budget pre-check, clipboard copy | Browser / Client | — | Pure client orchestration; server re-validates everything (SPEC-security-and-abuse §3) |
| Share id/token generation, `If-None-Match` retry-on-collision | API / Backend | — | Must be unguessable and server-authoritative (ADR-0006) |
| `adult` recomputation from included page types | API / Backend | Browser (advisory pre-check only) | GATE-02 requires server as sole source of truth; client value is discarded |
| Share object persistence (`shares/snap/<id>.json.gz`) | Database / Storage (S3) | API / Backend (read/write path) | No database in this project (ADR-0007); S3 *is* the persistence tier |
| CORS enforcement, no-listing guarantee | API / Backend | — | SEC-04; enforced in Hono middleware + IAM policy, not at the edge |
| Static SPA delivery, SPA fallback, CSP headers | CDN / Static (Cloudflare Workers) | — | ADR-0009; `_worker.js` serves `env.ASSETS`, no server-side rendering |
| Share page read-only render, adult interstitial, error states | Browser / Client | — | `SharePage` owns all load/error/gate states itself (no route guard, per SPEC-frontend-architecture §2) |
| Import ("Save to my library") | Browser / Client | — | Purely local IndexedDB write; no server involvement (SHARE-07 never touches the share id again) |
| Owner-token storage (`shares` IndexedDB store) | Browser / Client | — | Token never leaves the browser except at publish time over TLS (ADR-0005) |
| Health check, env-var contract validation | API / Backend | — | OPS-01; validated at boot with Zod, exits non-zero on missing var |
| Local dev object storage | Database / Storage (MinIO container) | — | D-16; swapped in via `S3_ENDPOINT` override, same key scheme as prod |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `hono` | 4.13.7 [VERIFIED: npm registry, published 2026-09-04] | HTTP framework for `apps/api` | Locked by ADR-0007; lightweight, first-class TypeScript, runs on plain Node via `@hono/node-server` |
| `@hono/node-server` | 2.1.1 [VERIFIED: npm registry, published 2026-08-14] | Node HTTP adapter so Hono can run as a standalone Node 22 process (not a Worker) | Required to run Hono outside Cloudflare Workers/Deno; this is a Railway Node process |
| `@aws-sdk/client-s3` | 3.1131.0 [VERIFIED: npm registry, published 2026-09-11] | S3 `GetObject`/`PutObject`/`HeadObject`/`DeleteObject` for the production `ObjectStore` implementation | Official AWS SDK v3, modular clients; ADR-0007 names "AWS SDK v3" explicitly |
| `zod` | ^4.6.2 [VERIFIED: packages/schema/package.json:16, already pinned] | Request/response and env-var validation, shared with the client | Already the project's sole validation library (`packages/schema`); reused for `apps/api/src/config.ts` boot validation |
| `pino` | 10.3.1 [VERIFIED: npm registry, published 2026-02-09] | Structured logging | SPEC-deployment §4 names `LOG_LEVEL` env var and "pino" explicitly as the logger |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | 4.23.13 [VERIFIED: npm registry, published 2026-08-30] | Dev-time TypeScript execution with watch mode | Root `pnpm dev` script requires `tsx watch` per SPEC-deployment §2 |
| `tsup` | 8.5.1 [VERIFIED: npm registry, published 2025-11-12] | Build `apps/api/src` to `dist/` for Railway's `node dist/server.js` start command | SPEC-frontend-architecture §1 names "tsup or tsc" for the API build; tsup is simpler for a single-entry Node service |
| `hono/testing` | bundled with `hono` | In-process route testing (`app.request(...)`) without opening a socket | SPEC-frontend-architecture §10 names `Vitest + hono/testing` explicitly for `apps/api` |
| `vitest` | ^4.0.8 [VERIFIED: packages/schema/package.json:20, already pinned in the monorepo] | Test runner for `apps/api` | Match the version already used by `packages/schema` and `apps/web` so the workspace has one test runner |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hono | Fastify | ADR-0007 explicitly allows Fastify "if a plan finds a concrete reason" — none found; Hono's Web-standard `Request`/`Response` API makes `hono/testing` trivial and keeps the bundle small for a 4-route service |
| tsup | plain `tsc` | `tsc` needs no extra dependency but produces one file per source file; tsup's single-file bundle is simpler for `node dist/server.js` and matches the "20-line Dockerfile" framing in SPEC-deployment §4 |
| `@aws-sdk/client-s3` | MinIO SDK / raw HTTP | The S3 SDK talks to both AWS S3 and MinIO (via `S3_ENDPOINT` + `forcePathStyle: true`), so one client covers dev and prod — no reason to hand-roll signing |

**Installation:**
```bash
pnpm --filter api add hono @hono/node-server @aws-sdk/client-s3 pino zod
pnpm --filter api add -D tsx tsup typescript vitest
```

**Version verification:** All versions above were confirmed live via `npm view <pkg> version dist-tags.latest time.modified` on 2026-09-14 (see Package Legitimacy Audit for full signals). `zod` and `vitest` versions are read directly from files already in the repo, not looked up.

## Package Legitimacy Audit

| Package | Registry | Age (latest publish) | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|-------------------|-------------|---------|-------------|
| `hono` | npm | 10 days | 48.7M | github.com/honojs/hono | SUS (`too-new`) | **Approved** — flag is on the latest *patch* release date, not project age; 48.7M weekly downloads and an active, well-known org make this a false positive. Planner should still add a `checkpoint:human-verify` before install per the SUS protocol. |
| `@hono/node-server` | npm | 31 days | 45.1M | github.com/honojs/node-server | OK | Approved |
| `@aws-sdk/client-s3` | npm | 3 days | 32.9M | github.com/aws/aws-sdk-js-v3 | SUS (`too-new`) | **Approved** — official AWS SDK, ships new versions almost daily; same false-positive pattern as above. `checkpoint:human-verify` recommended by the gate protocol. |
| `pino` | npm | ~1 month | 36.3M | github.com/pinojs/pino | OK | Approved |
| `tsx` | npm | 15 days | 64.5M | github.com/privatenumber/tsx | SUS (`too-new`) | **Approved** — same pattern; widely used dev dependency. `checkpoint:human-verify` recommended. |
| `tsup` | npm | ~10 months | 6.3M | github.com/egoist/tsup | OK | Approved |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `hono`, `@aws-sdk/client-s3`, `tsx` — all three flagged only because their most recent *release* is < 30 days old, not because of any structural red flag (all have a real GitHub org, tens of millions of weekly downloads, no postinstall script). The planner should still insert one combined `checkpoint:human-verify` task before `pnpm --filter api add hono @hono/node-server @aws-sdk/client-s3 tsx tsup pino` per the gate protocol, but reviewers can resolve it quickly by confirming the download counts above.

*Package names in this table came from ADR-0007 (a locked, in-repo architectural decision naming "Hono" and "the AWS SDK v3" as the framework/client) and from this project's own existing conventions (`pino` is already named as the logger in `SPEC-deployment.md` §4), not from an external websearch — the legitimacy check was still run against the npm registry to satisfy the gate.*

## Architecture Patterns

### System Architecture Diagram

```
Publish flow (SHARE-01, GATE-02):
┌─────────────┐  1. build SharePayload,           ┌──────────────┐
│  Browser     │     local budget pre-check         │ Cloudflare    │
│  ShareDialog │────────────────────────────────────▶│ Workers       │
│  (edit page) │  2. POST /shares (over CORS)        │ (static SPA   │
└──────┬───────┘◀─────────────────────────────────────│  origin only) │
       │  3. 201 {id, url, ownerToken, etag}          └──────────────┘
       │     copy url to clipboard, write IndexedDB
       │     `shares` record (D-08)
       ▼
┌───────────────────────

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 62157 bytes -->
