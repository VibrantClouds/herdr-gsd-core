---
phase: 01-foundation-library
plan: 01
subsystem: infra
tags: [pnpm-workspace, angular-22-zoneless, zod, indexeddb, cloudflare-workers]

requires: []
provides:
  - "pnpm workspace scaffold (apps/*, packages/*) with pinned typescript 6.0.3 and explicit allowBuilds"
  - "@dossier/schema: characterSchema envelope, Zod validators, createEmptyCharacter"
  - "NativeIndexedDBService + CharacterRepo + LibraryStore + LibraryPage: create/list a Character through CharacterDossierDB"
  - "apps/web deploy config: wrangler.jsonc + _worker.js with SPA fallback, immutable asset caching, and CSP, proven by scripts/smoke-worker.mjs"
affects: [01-02, 01-03, 01-04, 01-05, 01-06]

actuals:
  tokens: 59877
  tasks: 2
  commits: 2

tech-stack:
  added: ["@angular/core@22.1.x", "@angular/cli@22.1.8", "typescript@6.0.3", "zod@4.6.2", "vitest@4.1.11", "wrangler@4.131.1", "fake-indexeddb@6.2.5"]
  patterns:
    - "Hand-rolled Promise-based IndexedDB wrapper (NativeIndexedDBService), ported from SizeComparisonSite, memoized init(), StorageUnavailableError on QuotaExceededError/UnknownError/SecurityError"
    - "Zod 4 schema-as-single-source validation: CharacterRepo.get/put always round-trip through characterSchema.parse; list() uses safeParse and buckets failures into RejectedRecord"
    - "Cloudflare Workers _worker.js with assets.run_worker_first:true so every response (including SPA-fallback index.html) passes through cache/CSP header logic"

key-files:
  created:
    - packages/schema/src/character.ts
    - packages/schema/src/limits.ts
    - packages/schema/src/__tests__/character.spec.ts
    - apps/web/src/app/services/native-indexeddb.service.ts
    - apps/web/src/app/services/indexeddb-config.ts
    - apps/web/src/app/services/character.repo.ts
    - apps/web/src/app/stores/library.store.ts
    - apps/web/src/app/pages/library/library-page.component.ts
    - apps/web/src/app/integration/library-crud.integration.spec.ts
    - apps/web/wrangler.jsonc
    - apps/web/_worker.js
    - apps/web/scripts/smoke-worker.mjs
  modified: []

key-decisions:
  - "pnpm allowBuilds set explicitly: esbuild:true, workerd:true, @parcel/watcher:true (native file watcher, needed by dev tooling); lmdb:false, msgpackr-extract:false (miniflare KV/D1 storage backends — unused, Phase 1 has no Worker bindings beyond static assets)"
  - "NativeIndexedDBService.delete() typed Promise<undefined>, not Promise<void> — IDBObjectStore.delete() returns IDBRequest<undefined>, and TypeScript's structural check on the onerror/onsuccess handler `this` type rejects void there"

requirements-completed: [OPS-02, CHAR-01, CHAR-02, CHAR-03, SCHM-01]

coverage:
  - id: D1
    description: "pnpm workspace installs and builds cleanly from a clean checkout (schema before web), with typescript pinned to 6.0.x and vitest to 4.x workspace-wide"
    requirement: OPS-02
    verification:
      - kind: other
        ref: "pnpm install && pnpm -r build"
        status: pass
      - kind: other
        ref: "pnpm ls -r typescript --depth 0 / pnpm ls -r vitest --depth 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "@dossier/schema characterSchema enforces field caps, control-character rejection, unique page types, and strict Z-offset timestamps; compiles and runs identically under Vitest/Node and inside the Angular build"
    requirement: SCHM-01
    verification:
      - kind: unit
        ref: "packages/schema/src/__tests__/character.spec.ts (6 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Creating a character writes a schema-validated record to IndexedDB CharacterDossierDB and it is listed again after the app/injector is torn down and re-created over the same database (tracer for CHAR-01 create, the list half of CHAR-02, and the first-write persistence request half of CHAR-03)"
    requirement: CHAR-01
    verification:
      - kind: integration
        ref: "apps/web/src/app/integration/library-crud.integration.spec.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "apps/web builds with the standard application builder (zoneless, no zone.js) and is served by wrangler dev with SPA fallback on / and /c/(uuid), immutable caching on hashed bundle files, no-cache HTML, and the locked CSP (frame-ancestors 'none', script-src 'self')"
    requirement: OPS-02
    verification:
      - kind: e2e
        ref: "apps/web/scripts/smoke-worker.mjs (10 PASS checks, 0 FAIL)"
        status: pass
    human_judgment: false
  - id: D5
    description: "No network egress from Phase 1 app code (privacy prohibition: no analytics/telemetry/API calls, only Google Fonts is a third-party request)"
    requirement: CHAR-01
    verification:
      - kind: other
        ref: "rg -q 'provideHttpClient|fetch\\(' apps/web/src/app (exit 1)"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-09-11
status: complete
---

# Phase 1 Plan 1: Foundation + Library Tracer Summary

**pnpm monorepo, a `@dossier/schema` Zod envelope, and a zoneless Angular 22 app that creates a character, persists it through a hand-rolled IndexedDB wrapper, and serves the build from `wrangler dev` with immutable caching and a CSP.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-11T20:20:21Z
- **Completed:** 2026-09-11T20:28:50Z
- **Tasks:** 2
- **Files modified:** 48 (2 commits)

## Accomplishments

- pnpm workspace (`apps/*`, `packages/*`) with `typescript@^6.0.3` pinned workspace-wide and an explicit `allowBuilds` allowlist — `pnpm install && pnpm -r build` builds `@dossier/schema` before `apps/web` with zero `ERR_PNPM_IGNORED_BUILDS`
- `@dossier/schema`: `CHARACTER_SCHEMA_VERSION`, `shortText`, `imageRefSchema`, `characterCoreSchema`, `subDocumentEnvelopeSchema`, `characterSchema`, `createEmptyCharacter` — 6 Vitest cases covering length caps (ASCII and astral code points), control-character rejection, unique page types, and Z-only ISO timestamps
- Zoneless Angular 22.1 app (`AppComponent`/`cd-root`, no `zone.js`, no `polyfills` entry) with `NativeIndexedDBService` (Promise-based port of SizeLab's wrapper), `CharacterRepo`, `LibraryStore`, and `LibraryPage`: clicking "New character" writes a schema-validated `Character` to `CharacterDossierDB` and it is listed again after a simulated reload (`TestBed.resetTestingModule()`)
- Cloudflare Workers static-assets deploy: `wrangler.jsonc` (`run_worker_first: true`) and `_worker.js` (immutable caching on `/assets/`, `/media/`, and Angular's hashed bundle filenames; `no-cache` + CSP on HTML), proven by `scripts/smoke-worker.mjs` — 10/10 PASS covering SPA root, the `/c/(uuid)` deep link, no-cache, CSP `frame-ancestors`/`script-src`, no inline `onload=`, immutable hashed-bundle caching, and non-immutable `favicon.ico`

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "create a character and see it after reload"** - `68d5b74` (feat)
2. **Task 2: Complete OPS-02 (immutable caching, CSP)** - `acfac10` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.editorconfig`, `.gitignore` — workspace root
- `packages/schema/src/character.ts`, `limits.ts`, `index.ts`, `__tests__/character.spec.ts` — the envelope schema and its tests
- `apps/web/src/app/services/native-indexeddb.service.ts`, `indexeddb-config.ts`, `character.repo.ts` — persistence
- `apps/web/src/app/stores/library.store.ts`, `pages/library/library-page.component.*` — state and UI
- `apps/web/src/app/integration/library-crud.integration.spec.ts` — real-shape integration proof (fake-indexeddb)
- `apps/web/wrangler.jsonc`, `_worker.js`, `scripts/smoke-worker.mjs` — deploy config and its automated smoke test
- `apps/web/angular.json`, `tsconfig*.json`, `main.ts`, `index.html`, `app.component.*`, `app.routes.ts`, `test-setup.ts` — Angular CLI scaffold, customized per plan (outputPath, `cd` prefix, `files: ["src/main.ts"]`, Vitest setupFiles)

## Decisions Made

- `allowBuilds` in `pnpm-workspace.yaml`: `esbuild: true`, `workerd: true`, `@parcel/watcher: true` (native file watcher, needed by dev tooling); `lmdb: false`, `msgpackr-extract: false` (miniflare's KV/D1 local storage backends — unused, since Phase 1's `wrangler.jsonc` declares only static assets, no bindings). `pnpm install` printed these three as `ERR_PNPM_IGNORED_BUILDS` stubs (`"set this to true or false"`); `pnpm install` after setting them ran clean with no further ignored-build warnings and the smoke test (which exercises `wrangler dev`) passed.
- `minimumReleaseAgeExclude` entries pnpm appended for `zod@4.6.2`, `wrangler@4.131.1`, `workerd`/`miniflare` (fast-releasing packages published within pnpm's minimum-release-age window) — left as pnpm wrote them; matches RESEARCH.md's Package Legitimacy Audit finding that these are false-positive "too-new" flags on high-download, canonical-repo packages.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `NativeIndexedDBService.delete()` typed as `Promise<void>` failed the Angular build**
- **Found during:** Task 1, first `pnpm -r build`
- **Issue:** `TS2322: Type 'IDBRequest<undefined>' is not assignable to type 'IDBRequest<void>'` — `IDBObjectStore.delete()` returns `IDBRequest<undefined>`, and TypeScript's structural check on the `onerror`/`onsuccess` handler's `this` parameter type rejects substituting `void` for `undefined` there.
- **Fix:** Changed `delete()` to `async delete(...): Promise<void> { await this.performTransaction<undefined>(...) }`, matching the real `IDBRequest<undefined>` return type at the transaction layer while keeping the public `Promise<void>` contract callers expect.
- **Files modified:** `apps/web/src/app/services/native-indexeddb.service.ts`
- **Verification:** `pnpm -r build` and `pnpm -r typecheck` both exit 0
- **Committed in:** `68d5b74` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** TypeScript-strictness fix only, no behavior or scope change.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. `wrangler.jsonc` intentionally has no `routes` entry (no artifact names the production domain yet); an actual `wrangler deploy` needs the user's own Cloudflare login and domain choice, documented as a flagged assumption in the plan.

## Next Phase Readiness

- Every interface plans 01-02 through 01-06 build on now exists with the signatures locked in this plan: `characterSchema`/`createEmptyCharacter` from `@dossier/schema`; `NativeIndexedDBService`, `CharacterRepo`, `LibraryStore`, `LibraryPage` in `apps/web`; the `wrangler.jsonc`/`_worker.js` deploy shape.
- CHAR-02 (open/duplicate/delete) and the rest of CHAR-03 (500ms debounce autosave, `pagehide`/`visibilitychange` flush) are declared by sibling plans in this phase (01-04, 01-05, 01-06) — REQUIREMENTS.md keeps them `Pending` until every declaring plan finishes, which is the intended shared-ID behavior, not a gap in this plan.
- No blockers for 01-02 (schema plugin scaffolding) or 01-03 (migration walker), both of which build directly on `packages/schema`'s envelope shape delivered here.

---
*Phase: 01-foundation-library*
*Completed: 2026-09-11*

## Self-Check: PASSED
