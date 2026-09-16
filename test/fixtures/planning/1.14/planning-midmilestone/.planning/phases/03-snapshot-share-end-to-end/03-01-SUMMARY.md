---
phase: 03-snapshot-share-end-to-end
plan: 01
subsystem: api
tags: [hono, aws-sdk-client-s3, zod, angular-signals, share-links]

requires:
  - phase: 02-intimacy-plugin-unified-page
    provides: SCHEMA_REGISTRY, SubDocHost/PluginOutlet view-mode rendering, section-nav scroll-spy
provides:
  - Share wire contract in packages/schema (request/response/id/token/record schemas)
  - computeAdult, collectAllImageRefs, validateSharePayload load-boundary functions
  - apps/api package: Hono POST/GET /v1/shares against an in-memory ObjectStore
  - Web ShareApiService typed fetch client
  - Read-only SharePage at /s/:shareId, CharacterHeader view mode, shared buildNavEntries
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07, 03-08]

actuals:
  tokens: 14978
  tasks: 2
  commits: 1

tech-stack:
  added: [hono@4.13.7, "@hono/node-server@2.1.1", "@aws-sdk/client-s3@3.1131.0", pino@10.3.1, tsx@4.23.13]
  patterns:
    - "apps/api mirrors packages/schema's tsc-build shape (tsconfig.json/tsconfig.build.json/vitest.config.ts), not tsup"
    - "ObjectStore interface (get/putIfAbsent/head/delete) isolates routes from the AWS SDK; MemoryObjectStore backs unit/route tests (D-17)"
    - "Object.hasOwn registry lookup (lookupPlugin) replaces bracket-index access everywhere migrate.ts reads a plugin by untrusted type string"
    - "buildNavEntries extracted to section-nav.component.ts so CharacterPage and SharePage build identical nav from one implementation"

key-files:
  created:
    - apps/api/package.json
    - apps/api/tsconfig.json
    - apps/api/tsconfig.build.json
    - apps/api/vitest.config.ts
    - apps/api/src/index.ts
    - apps/api/src/config.ts
    - apps/api/src/object-store.ts
    - apps/api/src/tokens.ts
    - apps/api/src/share-object.ts
    - apps/api/src/routes/shares.ts
    - apps/api/src/__tests__/shares.route.spec.ts
    - apps/api/scripts/smoke.mjs
    - apps/web/src/app/services/share-api.service.ts
    - apps/web/src/app/pages/share/share-page.component.ts
    - apps/web/src/app/pages/share/share-page.component.html
    - apps/web/src/app/pages/share/share-page.component.scss
    - apps/web/src/app/pages/share/share-page.component.spec.ts
  modified:
    - packages/schema/src/share.ts
    - packages/schema/src/migrate.ts
    - packages/schema/src/index.ts
    - apps/web/src/environments/environment.ts
    - apps/web/src/environments/environment.development.ts
    - apps/web/src/app/components/character-header/character-header.component.ts
    - apps/web/src/app/components/character-header/character-header.component.html
    - apps/web/src/app/components/character-header/character-header.component.scss
    - apps/web/src/app/components/character-header/character-header.component.spec.ts
    - apps/web/src/app/components/section-nav/section-nav.component.ts
    - apps/web/src/app/pages/character/character-page.component.ts
    - apps/web/src/app/app.routes.ts
    - pnpm-lock.yaml

key-decisions:
  - "apps/api builds with tsc (tsconfig.build.json), not tsup, matching packages/schema's existing shape rather than 03-RESEARCH.md's tsup suggestion — the in-repo pattern wins (plan's own instruction)."
  - "Id-generation collision loop throws (reaches onError's fixed 500) after 3 failed putIfAbsent attempts, rather than returning a bespoke error — matches the plan's literal 'after 3 falses throw'."
  - "SharePage's ShareState keeps the full ShareGetResponse alongside the validated SharePayload (not just the payload) so a later plan (updatedAt-based UI, D-13 state split) doesn't need to re-thread the fetch."

patterns-established:
  - "Pattern: apps/api route handlers never import the AWS SDK directly — everything goes through the ObjectStore interface (D-17), so tests never touch Docker/MinIO."
  - "Pattern: lookupPlugin(registry, type) via Object.hasOwn is the only sanctioned way to read SCHEMA_REGISTRY by an untrusted string; migrateSubDocument/validateSubDocument/validateCharacter/validateSharePayload/computeAdult/collectAllImageRefs all route through it."

requirements-completed: [SHARE-01, SHARE-06, GATE-02]

coverage:
  - id: D1
    description: "POST /v1/shares publishes a snapshot: validates the payload, recomputes adult server-side, hashes the owner token, retries id collisions up to 3 times, and writes the object once with putIfAbsent."
    requirement: SHARE-01
    verification:
      - kind: integration
        ref: "apps/api/src/__tests__/shares.route.spec.ts#round trips a snapshot: payload, includedTypes and etag are unchanged on read"
        status: pass
      - kind: integration
        ref: "apps/api/src/__tests__/shares.route.spec.ts#stores the object under shares/snap/<id>.json.gz with a hashed token, and never persists or returns the plaintext token"
        status: pass
      - kind: integration
        ref: "apps/api/src/__tests__/shares.route.spec.ts#rejects an unsupported page version with 422 VERSION_UNSUPPORTED"
        status: pass
      - kind: integration
        ref: "apps/api/src/__tests__/shares.route.spec.ts#rejects a malformed JSON body with 400 SCHEMA_INVALID"
        status: pass
      - kind: other
        ref: "pnpm --filter api run smoke (built-output publish/read against dist/)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /v1/shares/:id reads a snapshot back unchanged with an immutable Cache-Control and an ETag equal to the ETag returned by POST; a well-formed unknown id is 404 NOT_FOUND (never 400), and so is a malformed id."
    requirement: SHARE-01
    verification:
      - kind: integration
        ref: "apps/api/src/__tests__/shares.route.spec.ts#returns 404 NOT_FOUND for a well-formed but unknown id"
        status: pass
      - kind: integration
        ref: "apps/api/src/__tests__/shares.route.spec.ts#returns 404 NOT_FOUND (never 400) for a malformed id, so the id space is not probed cheaply"
        status: pass
      - kind: other
        ref: "pnpm --filter api run smoke: GET Cache-Control is immutable for a snapshot / GET ETag equals the POST etag"
        status: pass
    human_judgment: false
  - id: D3
    description: "adult is always computeAdult(pages) from SCHEMA_REGISTRY on the server; a client-sent pages[].adult:false is silently overwritten to true, never trusted (GATE-02)."
    requirement: GATE-02
    verification:
      - kind: integration
        ref: "apps/api/src/__tests__/shares.route.spec.ts#overwrites a client-sent adult:false with the server-computed true"
        status: pass
      - kind: other
        ref: "pnpm --filter api run smoke: GET adult is server-computed true / GET payload.pages[0].adult is true"
        status: pass
    human_judgment: false
  - id: D4
    description: "/s/:shareId renders the shared CharacterHeader and Intimacy page in view mode with zero input/textarea/select elements and no subdoc-bar buttons."
    requirement: SHARE-06
    verification:
      - kind: unit
        ref: "apps/web/src/app/pages/share/share-page.component.spec.ts#loads a snapshot and renders the header and one subdoc-host in view mode with no form controls"
        status: pass
      - kind: unit
        ref: "apps/web/src/app/components/character-header/character-header.component.spec.ts#view mode renders zero inputs and the name as text"
        status: pass
      - kind: other
        ref: "rg -q innerHTML apps/web/src/app/pages/share apps/web/src/app/components/character-header (exit 1)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A malformed share id renders \"This link doesn't lead to a dossier\" without calling fetch; an HTTP 404 envelope renders the same text."
    requirement: SHARE-06
    verification:
      - kind: unit
        ref: "apps/web/src/app/pages/share/share-page.component.spec.ts#shows the not-found text for a malformed id and never calls fetch"
        status: pass
      - kind: unit
        ref: "apps/web/src/app/pages/share/share-page.component.spec.ts#shows the not-found text and does not retry when the API returns a 404 envelope"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-09-14
status: complete
---

# Phase 3 Plan 1: Snapshot Share End-to-End (Tracer) Summary

**A real snapshot now travels end to end: Hono POST /v1/shares writes a gzip'd, hashed-token object through a pluggable ObjectStore, GET reads it back immutable with a server-recomputed adult flag, and Angular's new /s/:id SharePage renders it read-only with zero form controls.**

## Performance

- **Duration:** 16 min (across two sessions, separated by the Task 1 package-legitimacy checkpoint)
- **Started:** 2026-09-14T19:16:37Z
- **Completed:** 2026-09-14T19:32:06Z
- **Tasks:** 2 (Task 1 checkpoint:human-verify, Task 2 tracer)
- **Files modified:** 30 (17 created, 13 modified, incl. pnpm-lock.yaml)

## Accomplishments

- `packages/schema`: full share wire contract (`SHARE_ID_RE`, `OWNER_TOKEN_RE`, `shareCreateRequestSchema`, `shareCreateResponseSchema`, `shareGetResponseSchema`, `apiErrorSchema`, `shareRecordSchema`), plus `computeAdult`, `collectAllImageRefs`, `validateSharePayload`, and a `lookupPlugin` (`Object.hasOwn`) hardening applied to every existing registry lookup in `migrate.ts` (closes the `type: 'constructor'` TypeError hazard now that the function receives untrusted server input).
- New `apps/api` package: Hono app (`createApp`), `POST /v1/shares` and `GET /v1/shares/:id` against a `MemoryObjectStore`, config loader, token/id generation, gzip share-object codec, a `tsc`-built smoke script, and a route-level Vitest spec.
- Web: `ShareApiService` typed fetch client (`ShareApiError`/`ShareNetworkError`), `CharacterHeader` view mode (`.title-text`/`.meta-label`/`.meta-value`), `buildNavEntries` extracted from `CharacterPage` into `section-nav.component.ts` and reused by both pages, and the new read-only `SharePage` at `/s/:shareId`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm legitimacy of the apps/api npm packages before install** — checkpoint:human-verify, gate="blocking-human"; no files. User replied "approved" for all six packages (`hono` 4.13.7, `@hono/node-server` 2.1.1, `@aws-sdk/client-s3` 3.1131.0, `pino` 10.3.1, `tsx` 4.23.13, `@types/node` 22.x); the orchestrator independently confirmed each exact version against the npm registry and its expected source repo before resuming.
2. **Task 2: End-to-end publish/read/render tracer** — `02ae738` (feat)

**Plan metadata:** committed separately after this SUMMARY (see below).

## Files Created/Modified

- `packages/schema/src/share.ts` — share wire contract schemas and inferred types
- `packages/schema/src/migrate.ts` — `lookupPlugin`, `computeAdult`, `collectAllImageRefs`, `validateSharePayload`
- `packages/schema/src/index.ts` — exports the above
- `apps/api/src/config.ts` — `envSchema`/`AppConfig`/`ConfigError`/`loadConfig`
- `apps/api/src/object-store.ts` — `ObjectStore`, `StoredObject`, `MemoryObjectStore`
- `apps/api/src/tokens.ts` — `generateShareId`, `generateOwnerToken`, `hashToken`, `timingSafeEqualHex`, `computeEtag`
- `apps/api/src/share-object.ts` — `shareObjectKey`, `storedShareSchema`, `encodeShareObject`, `decodeShareObject`
- `apps/api/src/routes/shares.ts` — `createSharesRoutes` (POST/GET)
- `apps/api/src/index.ts` — `createApp`, `AppDeps`, `AppLogger`
- `apps/api/scripts/smoke.mjs` — built-output publish/read smoke (9 PASS lines)
- `apps/api/src/__tests__/shares.route.spec.ts` — 7 route specs
- `apps/web/src/app/services/share-api.service.ts` — `ShareApiService`, error types, DI tokens
- `apps/web/src/app/pages/share/share-page.component.{ts,html,scss,spec.ts}` — `SharePage`
- `apps/web/src/app/components/character-header/character-header.component.*` — `mode` input, view template/SCSS, spec cases
- `apps/web/src/app/components/section-nav/section-nav.component.ts` — `buildNavEntries`
- `apps/web/src/app/pages/character/character-page.component.ts` — now calls `buildNavEntries`
- `apps/web/src/app/app.routes.ts` — `s/:shareId` route
- `apps/web/src/environments/environment*.ts` — `apiBaseUrl`, `appOrigin`

## Decisions Made

- Built `apps/api` with `tsc` (mirroring `packages/schema`), not `tsup` as 03-RESEARCH.md suggested — the plan's own instruction ("the in-repo pattern wins") and acceptance criteria (`rg -q '"tsup"'` must exit 1) both confirmed this.
- The share-id collision loop in `POST /v1/shares` throws after 3 failed `putIfAbsent` attempts (reaching `onError`'s fixed 500 body) rather than a bespoke error path, matching the plan's literal wording.
- `SharePage`'s internal state keeps the full `ShareGetResponse` (not just the validated `SharePayload`) in its `ready` variant, since the plan's own `<interfaces>` block specified that shape and a later plan (D-13 error-state split, republish UI) will likely need `updatedAt`/`etag` without re-threading the fetch.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. `AWS_ACCESS_KEY_ID`/`S3_*` env vars are consumed only by `loadConfig`, which no route in this plan invokes against a real environment (dev/prod env setup lands with 03-03's server entrypoint).

## Next Phase Readiness

- SHARE-01 core (publish + immutable read), SHARE-06 core (read-only render) and GATE-02 (server-computed adult) are proven end to end on the thinnest real slice — schema contract, Hono route, `ObjectStore` interface, and the web `SharePage`.
- 03-02 can add the remaining `POST` check order (body-size cap, image-manifest/budget checks, CORS, health, config tests) without touching this plan's shapes.
- 03-03 can add the S3-backed `ObjectStore` and the `@hono/node-server` entrypoint against the same `AppDeps`/`createApp` surface.
- Flagged (unresolved) assumptions carried forward per the plan: publish-side budget/version/collision edges pin in 03-02; the D-13 error-state split (not-found vs failed vs removed) and the CharacterPage-vs-SharePage side-by-side layout comparison land in 03-04/03-05/03-06.
- No blockers.

---
*Phase: 03-snapshot-share-end-to-end*
*Completed: 2026-09-14*

## Self-Check: PASSED

All 17 key files verified present on disk; commit `02ae738` verified in `git log`.
