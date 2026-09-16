# Phase 3: Snapshot Share End-to-End - Context

**Gathered:** 2026-09-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Delivers `apps/api` (Hono on Node 22) live on Railway with `GET /healthz`, `POST /shares` (snapshot only) and `GET /shares/:id` against a real private S3 bucket; the web share dialog with a page selector; the `/s/:shareId` read-only share page with the server-computed 18+ interstitial; "Save to my library" import; and styled error pages. Requirements: SHARE-01, SHARE-06, SHARE-07, SHARE-10, GATE-01, GATE-02, OPS-01, SEC-04.

Not in this phase: images, `POST /images/exists`, `PUT /images/:hash`, CloudFront, size estimate (Phase 4); living links, `PUT`/`DELETE /shares`, owner-link `#edit=` handling, selection memory (Phase 5); print dialog (Phase 6); rate limiting, takedown CLI, report link, billing alarm (Phase 7).

The API contract, id/token formats, publish check order, S3 key scheme and object shape, IAM policy, CORS headers, env-variable contract, interstitial look and behaviour, and `SharePage` composition are already fixed by the specs under canonical refs. The decisions below cover only what those docs left open for this phase.

</domain>

<decisions>
## Implementation Decisions

### Page choice in a snapshot
- **D-01:** Build the shared `SectionSelector` component (SPEC-design-system §4.14, SPEC-frontend-architecture §7) **in this phase**, without the size estimate (`showSizeEstimate` stays off until Phase 4). Phase 6 reuses it for print; Phase 5 adds selection memory.
- **D-02:** When the share dialog opens, **every page is checked**. The header row is checked and disabled. The 18+ badge on a row is the owner's cue to uncheck it.
- **D-03:** A **header-only** snapshot (zero pages checked) is allowed; Publish stays enabled.

### Publish dialog and records
- **D-04:** A **Share** button sits in the top row of the character page beside "← Library". Phase 6 adds Print beside it. It is absent in the dev view-mode preview (D-14 of Phase 2).
- **D-05:** The Phase 3 dialog offers **snapshot only**, with no kind picker and no disabled Living option. Copy states the link never changes. Phase 5 adds the Snapshot/Living choice.
- **D-06:** The dialog shows **one plain disclosure line** above Publish, e.g. "Anyone with this link can view the selected pages. Snapshot links cannot be edited." No claim about deleting links (delete ships in Phase 5).
- **D-07:** On success, the URL is copied to the clipboard immediately and the dialog switches to a **result view**: URL in a read-only field, "Copy again", "Open link", "Done". If the clipboard write fails, the text says "Copy the link below" instead of "Link copied".
- **D-08:** Every successful publish writes a record to the existing IndexedDB `shares` store (already declared in `indexeddb-config.ts`, no DB version bump): `{shareId, kind, characterId, ownerToken, includedTypes, lastPublishedAt, etag}`. The snapshot's owner token is **kept** so Phase 5 delete (SHARE-08) and Phase 7 backup work for snapshots made now. **No list of earlier links in the UI** this phase. — **Reversibility:** one-way — a token discarded now can never be recovered; snapshots published before a storing build could never be deleted by their owner.

### Share page and import
- **D-09:** Above the dossier, `SharePage` shows **one slim bar**: "Snapshot · published <date>" left, "Save to my library" right. No "← Library" link on the share page. The app header (wordmark, Display options) stays. Phase 5 changes the line to "updated <date>" for living links.
- **D-10:** The Save button (and all dossier content) is not visible until the 18+ interstitial is acknowledged when `adult` is true.
- **D-11:** "Save to my library" creates a **new unlinked character** (new uuid, `core` + included `pages` from the payload after validate/migrate, no `shares` record, no token), then navigates to `/c/:newId` with snackbar "Saved to your library". Tapping it again on a later visit makes another copy.
- **D-12:** `404 NOT_FOUND` and `410 REMOVED` render **one shared message**: "This link doesn't lead to a dossier" / "It may have been deleted, or the link is incomplete." A takedown is not revealed. Malformed ids never reach the API as a distinct error.
- **D-13:** Error actions: **offline/network failure** → "Try again" (re-fetch in place, no full reload) + "Go to Character Dossier"; **not found** and **unsupported version** → "Go to Character Dossier" only. The unsupported-version text tells the user to reload to get the latest app.

### Hosting and dev stack
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### API and storage
- `docs/specs/SPEC-share-api.md` — conventions, id/token formats (§2), endpoint table (§3), `POST /shares` check order (§4.1), `GET /shares/:id` shape and cache headers (§4.3), CORS (§6), response headers (§7), client publish sequence (§8)
- `docs/specs/SPEC-storage-s3.md` — bucket settings (§1), key scheme (§2), share object with `meta` (§3), IAM policy with no ListBucket (§5), local dev (§8)
- `docs/specs/SPEC-deployment.md` — domains (§1; **to be updated** for D-15), web env files (§3; **to be corrected** per discretion note), Railway settings + env contract (§4), local dev (§5), AWS setup (§6), deploy checklist (§7)
- `docs/specs/SPEC-security-and-abuse.md` — §1 enforced controls (no enumeration, CORS, response hardening, adult recomputed), §3 client checks that are not controls
- `docs/adr/0004-share-links-snapshot-and-living.md` — snapshot immutability, no expiry
- `docs/adr/0006-privacy-unguessable-id-plaintext-s3.md` — unguessable id, plaintext + SSE-S3
- `docs/adr/0007-backend-node-typescript-railway-s3.md` — Hono, single Node 22 process, no database
- `docs/adr/0009-hosting-cloudflare-static-api-subdomain.md` — host split and CORS origin
- `docs/adr/0010-json-gzip-payload-encoding.md` — JSON bodies, gzip storage, 512 KiB cap

### Adult gate
- `docs/adr/0013-adult-gate-interstitial.md` — server recomputes `adult`; `localStorage['cd.adultAck']`; honest naming (never "age gate"); `noindex`
- `docs/specs/SPEC-design-system.md` §4.13 — interstitial anatomy and behaviour (0-opacity page behind, Escape does nothing)
- `docs/specs/SPEC-frontend-architecture.md` §8 — `AdultGateService`, interstitial rules

### Web client
- `docs/specs/SPEC-frontend-architecture.md` §1 (layout: `pages/share/`, `components/section-selector/`, `share.store.ts`, `share.repo.ts`, `share-api.service.ts`), §2 (routes, no guard for `/s/:shareId`), §3 (`ShareStore`, `ShareApiService`), §5 step 7 (view mode + "Save to my library"), §6 (`SharePage` reuses header, nav, host in view mode), §7 (section selector), §10 (required integration spec: publish snapshot → open `/s/:id` → identical view), §12 (invariants)
- `docs/specs/SPEC-design-system.md` §4.11 (buttons), §4.12 (toast), §4.14 (section selector), §4.16 (dialog / bottom sheet)
- `docs/specs/SPEC-domain-model.md` — `SharePayload`, `shares` store row shape
- `docs/specs/SPEC-subdocument-plugin-contract.md` — `stripForShare`, `collectImageRefs`, `adult`
- `docs/specs/SPEC-serialization-policy.md` — version gating on load and on the server

### Planning
- `.planning/REQUIREMENTS.md` — SHARE-01, SHARE-06, SHARE-07, SHARE-10, GATE-01, GATE-02, OPS-01, SEC-04
- `.planning/phases/02-intimacy-plugin-unified-page/02-CONTEXT.md` — D-04 nav rule reused on share page, D-13 view mode, D-14 dev preview

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/src/app/services/indexeddb-config.ts`: DB `CharacterDossierDB` v1 already declares the `shares` store (keyPath `shareId`, index `characterId`) and `images` store — no schema bump needed for D-08.
- `apps/web/src/app/components/modal/modal.component.ts`: `open` / `title` inputs, `close` output, CDK focus trap with focus restore — use for the share dialog (bottom sheet under 700 px).
- `apps/web/src/app/services/snackbar.service.ts`: `show` with action, success/error/info — for "Saved to your library" and publish errors.
- `apps/web/src/app/components/character-header/`, `components/section-nav/`, `subdocs/subdoc-host/`: all support `mode = 'view'` from Phase 2 — `SharePage` composes them.
- `apps/web/src/app/stores/library.store.ts` `duplicate()`: model for materializing a new character with a fresh id (D-11).
- `packages/schema`: `sharePayloadSchema` (`share.ts`), `validateCharacter`, `validateSubDocument`, `migrateSubDocument` (`migrate.ts`), `SCHEMA_REGISTRY`, limits — shared by web and API.
- `apps/web/src/environments/`: `environment.ts` (prod default) + `environment.development.ts` via file replacement — extend with API base URL and app origin.

### Established Patterns
- Zoneless, OnPush, `input()`/`output()`, `@if`/`@for` with `track`; lazy `loadComponent` routes in `app.routes.ts`.
- Load-boundary errors (`UnsupportedVersionError` / `InvalidDocumentError`) are named errors — map them to the share page's unsupported-version state.
- Integration specs with real IndexedDB and a stubbed global `fetch` live in `apps/web/src/app/integration/`.
- Vitest across packages; TDD RED evidence needs manual TAP summary lines (see STATE.md blocker).

### Integration Points
- `apps/web/src/app/app.routes.ts`: add `s/:shareId` before the `**` redirect.
- `apps/web/src/app/pages/character/character-page.component.html`: top row with "← Library" gains the Share button; share dialog mounts here.
- `apps/web/wrangler.jsonc`: no `routes` yet (comment says no production domain was named) — add apex + www redirect for `characterdossierlab.app`.
- New workspace package `apps/api` (does not exist yet); root `package.json` scripts and `pnpm-workspace.yaml` already glob `apps/*`.
- New root `docker-compose.yml` for MinIO (D-16).

</code_context>

<specifics>
## Specific Ideas

- Share bar text: "Snapshot · published 14 Sep 2026" + "Save to my library".
- Not-found text: "This link doesn't lead to a dossier" / "It may have been deleted, or the link is incomplete."
- Disclosure line: "Anyone with this link can view the selected pages. Snapshot links cannot be edited."
- Import snackbar: "Saved to your library".
- Production origin: `https://characterdossierlab.app`; API `https://api.characterdossierlab.app/v1`.

</specifics>

<deferred>
## Deferred Ideas

- "Earlier links" list in the share dialog (date, pages, Copy) — records are stored now (D-08); a UI for them fits Phase 5 alongside delete and republish.

</deferred>

---

*Phase: 03-snapshot-share-end-to-end*
*Context gathered: 2026-09-14*
