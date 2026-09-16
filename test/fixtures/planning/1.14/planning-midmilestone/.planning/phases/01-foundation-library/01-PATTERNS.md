# Phase 1: Foundation + Library - Pattern Map

**Mapped:** 2026-09-11
**Files analyzed:** 26
**Analogs found:** 15 in sibling repo `~/Development/Personal/SizeComparisonSite` / 26 total (11 have no analog anywhere and must be built from SPEC/RESEARCH shapes directly — this is expected for a greenfield schema package and Angular-22-zoneless idioms that don't exist in the Angular-20-zone.js sibling project)

**Note on repo state:** CharacterDossier is greenfield (no `apps/` or `packages/` yet). No in-repo analogs exist. All analogs below come from the sibling reference project `~/Development/Personal/SizeComparisonSite` (a different, tracked git repo — verify its own git status if reusing exact bytes; these are being read, not copied file-to-file). Files with no analog point at the RESEARCH.md/SPEC section that defines their shape instead.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/schema/src/character.ts` | model | transform | none (SPEC-domain-model.md:24-61) | no analog |
| `packages/schema/src/limits.ts` | config | transform | none (SPEC-domain-model.md field caps) | no analog |
| `packages/schema/src/plugin.ts` | model | transform | none (SPEC-subdocument-plugin-contract.md) | no analog |
| `packages/schema/src/migrate.ts` | utility | transform | `SizeComparisonSite/src/app/services/user-model-migration.service.ts` (per-version migration walker concept) | role-match |
| `packages/schema/src/share.ts` | model | transform | none (SPEC-domain-model.md SharePayload) | no analog |
| `packages/schema/src/__tests__/fixture-guard.spec.ts` | test | batch | none (SPEC-serialization-policy.md:33-42) | no analog |
| `packages/schema/src/fixtures/envelope/1.0.0.json` | config | file-I/O | none (fixture shape defined by character.ts) | no analog |
| `apps/web/wrangler.jsonc` | config | request-response | `SizeComparisonSite/wrangler.jsonc` | exact (shape only, values must change) |
| `apps/web/_worker.js` | route | request-response | `SizeComparisonSite/_worker.js` | exact (shape only, simplify — no site-mode/adult routing) |
| `.editorconfig` | config | — | `SizeComparisonSite/.editorconfig` | exact |
| `package.json` (root) | config | — | `SizeComparisonSite/package.json` (scripts + `pnpm.onlyBuiltDependencies`) | role-match |
| `apps/web/src/app/services/indexeddb-config.ts` | config | CRUD | `SizeComparisonSite/src/app/services/indexeddb-config.ts` | exact (shape; DBConfig/ObjectStoreMeta type is reused verbatim from `native-indexeddb.service.ts`) |
| `apps/web/src/app/services/native-indexeddb.service.ts` | service | CRUD | `SizeComparisonSite/src/app/services/native-indexeddb.service.ts` | exact |
| `apps/web/src/app/utils/storage-errors.ts` | utility | — | `SizeComparisonSite/src/app/utils/storage-errors.ts` | exact |
| `apps/web/src/app/services/character.repo.ts` | service | CRUD | `SizeComparisonSite/src/app/services/indexeddb-user-model.service.ts` (wraps NativeIndexedDBService + does split/validate) | role-match |
| `apps/web/src/app/services/prefs.repo.ts` | service | CRUD | `SizeComparisonSite/src/app/services/indexeddb-user-model.service.ts` (same wrapper pattern, smaller store) | role-match |
| `apps/web/src/app/stores/character.store.ts` | store | event-driven | none in sibling (sibling uses RxJS `BehaviorSubject` service, not Angular signals) — pattern is locked verbatim in RESEARCH.md Pattern 2 / `docs/adr/0003` + `SPEC-frontend-architecture.md:188-214`; `state-management.service.ts:44-90` shows the *state-service* shape (single service, `providedIn: 'root'`, typed state interface) to adapt from RxJS to signals | partial (structure only, not the reactivity primitive) |
| `apps/web/src/app/stores/library.store.ts` | store | CRUD | same as above; also `SPEC-frontend-architecture.md:128-139` for exact `LibraryStore` API | partial |
| `apps/web/src/app/services/theme.service.ts` | service | event-driven | none (sibling has `site-mode.service.ts` for a conceptually similar single-flag persisted-preference service) | partial |
| `apps/web/src/app/pages/library/*` | component | request-response | none (Angular 22 zoneless `@if`/`@for` components don't exist in sibling; build from `SPEC-frontend-architecture.md` + `docs/specs/SPEC-design-system.md`) | no analog |
| `apps/web/src/app/pages/character/*` | component | request-response | none — see above | no analog |
| `apps/web/src/app/components/character-header/*` | component | request-response | none — portrait placeholder has no circular-avatar analog anywhere (explicitly excluded per user decision); build frame from `docs/specs/SPEC-design-system.md` layout tokens, sized for full uncropped art of any aspect ratio | no analog |
| `apps/web/src/app/app.routes.ts` | route | request-response | none (Angular 22 standalone routing config differs from sibling's) — shape per RESEARCH.md Recommended Project Structure | no analog |
| `apps/web/src/app/app.config.ts` | config | — | none — zoneless `provideRouter`/`provideHttpClient` config has no zone.js-era analog | no analog |
| `apps/web/src/test-setup.ts` | test | — | `SizeComparisonSite/src/test-setup.ts` | role-match (Vitest vs Karma harness differs, but the "stub confirm/alert/ResizeObserver" pattern carries over) |
| `apps/web/src/app/integration/*.spec.ts` | test | CRUD | none (real-IndexedDB integration specs); sibling's `*.service.spec.ts` files test against the same `NativeIndexedDBService` but via Karma+Jasmine, not Vitest | partial |
| `pnpm-workspace.yaml` | config | — | none (SizeLab is a single-package repo, not a workspace) — shape per ADR-0008 / RESEARCH.md | no analog |

## Pattern Assignments

### `apps/web/src/app/services/native-indexeddb.service.ts` (service, CRUD)

**Analog:** `~/Development/Personal/SizeComparisonSite/src/app/services/native-indexeddb.service.ts` (273 lines) — port near-verbatim per RESEARCH.md, this is a locked exception to "don't hand-roll."

**Storage-blocked probe** (lines 38-47):
```typescript
static async isStorageBlocked(): Promise<boolean> {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return false;
  } catch {
    return true;
  }
}
```

**Persistent storage request** (lines 54-65):
```typescript
static async requestPersistentStorage(): Promise<boolean> {
  if (!('storage' in navigator) || !('persist' in navigator.storage)) {
    return false;
  }
  try {
    const persisted = await navigator.storage.persisted();
    if (persisted) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
```

**Init + upgrade + quota-error mapping** (lines 70-136): `indexedDB.open(config.name, config.version)`; `onerror` checks `error?.name` against `QuotaExceededError`/`UnknownError`/`SecurityError` and rejects with `STORAGE_UNAVAILABLE_MESSAGE` instead of the raw browser error; `onupgradeneeded` iterates `config.objectStoresMeta`, skips stores that already exist (`db.objectStoreNames.contains`), creates indexes idempotently.

**CRUD primitives** (lines 141-220): `add<T>`, `getByKey<T>`, `getAll<T>`, `update<T>` (uses `store.put`), `delete`, `clear` — all return RxJS `Observable<T>` via `from(new Promise(...))`, and all funnel through a shared `performTransaction` helper (lines 225-256) for read paths. Every write wraps `db.transaction([storeName], mode)` in try/catch and rejects on both `request.onerror` and `transaction.onerror`.

**Adaptation for Character Dossier:** identical shape. Replace RxJS `Observable` return types with `Promise<T>` if `CharacterRepo`/`PrefsRepo` callers are async/await-based (RESEARCH.md's Pattern 2 code example uses `await this.repo.get(id)`, i.e. promise-based repos) — either keep the Observable wrapper and `firstValueFrom()` at the call site, or strip the RxJS layer entirely since `rxjs` is only a "boundary-only" dependency per Standard Stack. Recommend stripping RxJS from this file specifically (return native Promises) since nothing else in the zoneless signal-based app needs an Observable here.

---

### `apps/web/src/app/utils/storage-errors.ts` (utility, —)

**Analog:** `~/Development/Personal/SizeComparisonSite/src/app/utils/storage-errors.ts` (36 lines) — port verbatim structure, reword the message.

```typescript
// Source: SizeComparisonSite/src/app/utils/storage-errors.ts:20-36
export const STORAGE_UNAVAILABLE_MESSAGE =
  'This browser tab can\'t save custom content because storage is blocked. ' +
  'This usually means Private Browsing mode (common on Safari and iOS). ' +
  'Open the site in a regular browser tab to upload models or to view ' +
  'shared links that include custom content.';

export class StorageUnavailableError extends Error {
  constructor(message: string = STORAGE_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}
```
Reword the message body to Character Dossier vocabulary ("characters," not "custom models"/"upload models"); keep the class shape, `name` override, and default-message pattern unchanged.

---

### `apps/web/src/app/services/indexeddb-config.ts` (config, CRUD)

**Analog:** `~/Development/Personal/SizeComparisonSite/src/app/services/indexeddb-config.ts` (234 lines) — copy only the `DBConfig`/`ObjectStoreMeta`/`IndexMeta` shape convention (types actually live in `native-indexeddb.service.ts:5-21` in the sibling, imported back into this file), not the UserModel-specific content.

**DBConfig shape to replicate** (from `native-indexeddb.service.ts:5-21`):
```typescript
export interface DBConfig {
  name: string;
  version: number;
  objectStoresMeta: ObjectStoreMeta[];
}
export interface ObjectStoreMeta {
  store: string;
  storeConfig: { keyPath: string; autoIncrement: boolean };
  storeSchema: IndexMeta[];
}
export interface IndexMeta {
  name: string;
  keypath: string;
  options: { unique: boolean };
}
```

**Store-config-object pattern** (`indexeddb-config.ts:70-113` — `USER_MODEL_DB_CONFIG` constant): one `DBConfig` literal per store, each entry an object with `store`, `storeConfig: { keyPath, autoIncrement: false }`, `storeSchema: [...]`. For Character Dossier, define `CHARACTER_DOSSIER_DB_CONFIG` with all four stores from RESEARCH.md Pattern 4 in one shot (per Assumption A3, locked): `characters` (keyPath `core.id`, indexes `updatedAt`, `core.name`), `images` (keyPath `hash`, no indexes), `shares` (keyPath `shareId`, index `characterId`), `prefs` (keyPath `key`, no indexes).

---

### `apps/web/src/app/services/character.repo.ts` (service, CRUD)

**Analog:** `~/Development/Personal/SizeComparisonSite/src/app/services/indexeddb-user-model.service.ts` — role-match only; not read in full this pass (not required — the wrapping pattern is already fully specified by `native-indexeddb.service.ts` + RESEARCH.md Pattern 2's `load()`/`persist()` shape). Concrete shape to build from instead is locked in RESEARCH.md:

```typescript
// Source: RESEARCH.md Pattern 2 (locked, mirrors docs/adr/0003 + SPEC-frontend-architecture.md:188-211)
async load(id: string) {
  this.restoring.set(true);
  try {
    const c = await this.repo.get(id);         // migrations run inside repo.get
    this.character.set(c);
  } finally {
    this.restoring.set(false);
  }
}
```
`CharacterRepo.get(id)` must call `validateSubDocument`/`migrateEnvelope` from `@dossier/schema` on the raw IndexedDB record before returning it — this is the one place browser code touches the shared schema package's migration walker.

---

### `apps/web/src/app/stores/character.store.ts` (store, event-driven)

**Analog (structure only):** `~/Development/Personal/SizeComparisonSite/src/app/services/state-management.service.ts` — shows the "one `@Injectable({ providedIn: 'root' })` class owns a typed state shape and exposes named action methods" convention (lines 41-90), but it is RxJS `BehaviorSubject`-based (zone.js era) and **must not** be copied for its reactivity primitive — ADR-0016 forbids `zone.js`/NgRx/SignalStore.

**Locked pattern to use instead** (RESEARCH.md Pattern 2, verbatim from `docs/specs/SPEC-frontend-architecture.md:188-211`):
```typescript
constructor() {
  effect((onCleanup) => {
    const c = this.character();                 // tracked
    if (!c || untracked(() => this.restoring())) return;
    this.dirty.set(true);
    const t = setTimeout(() => this.persist(c), 500);
    onCleanup(() => clearTimeout(t));
  });
  fromEvent(document, 'visibilitychange').subscribe(() => {
    if (document.visibilityState === 'hidden') void this.flush();
  });
}
```
Take from `state-management.service.ts`: the "restoring" boolean-flag convention itself is directly analogous — compare `isRestoringState$`/`setRestoringState()`/`getCurrentRestoringState()` (lines 83, 344-352) to the required `restoring` signal + `untracked(() => this.restoring())` guard. The naming and intent ("suppress reactive side-effects while a load/import is in flight") is the same problem SizeLab already solved for share-link import; only the primitive changes from `BehaviorSubject` to `signal`.

---

### `apps/web/wrangler.jsonc` (config, request-response)

**Analog:** `~/Development/Personal/SizeComparisonSite/wrangler.jsonc` (56 lines) — mirror structure, do not copy values (per Pitfall 7, `compatibility_date` must not be copied stale).

```jsonc
// Source: SizeComparisonSite/wrangler.jsonc:1-14, 46-56 (structure only)
{
  "name": "size-comparison-site",
  "main": "_worker.js",
  "compatibility_date": "2024-12-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "dist/size-comparison-tool/browser",
    "binding": "ASSETS",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "single-page-application"
  },
  "routes": [{ "pattern": "sizelab.app", "custom_domain": true }],
  "build": { "command": "pnpm run build" },
  "dev": { "local_protocol": "http", "port": 8787, "host": "127.0.0.1" }
}
```
Character Dossier's target shape is already fully specified in RESEARCH.md § Code Examples (`name: "character-dossier"`, `dist/character-dossier/browser`, `compatibility_date` set to actual first-deploy date). Drop the sibling's `env.production`/`env.development` block unless a later phase needs environment-specific Workers config — Phase 1 has no such need (single static deploy target).

---

### `apps/web/_worker.js` (route, request-response)

**Analog:** `~/Development/Personal/SizeComparisonSite/_worker.js` (82 lines).

**Core fetch handler + asset passthrough + cache headers** (lines 6-54):
```javascript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) {
      const response = new Response(asset.body, {
        status: asset.status, statusText: asset.statusText, headers: asset.headers
      });
      if (pathname.startsWith('/assets/')) {
        response.headers.set('Cache-Control', 'public, max-age=31536000');
      }
      return response;
    }
    // SPA fallback
    if (!pathname.startsWith('/assets/') && !pathname.includes('.') && !pathname.startsWith('/api/')) {
      const indexRequest = new Request(new URL('/', request.url), request);
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      if (indexResponse.status === 200) {
        return new Response(indexResponse.body, {
          status: 200, statusText: 'OK',
          headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
      }
    }
    return asset;
  }
};
```
Drop the sibling's `X-Site-Mode`/`siteMode` header logic (lines 11-12, 26) — Character Dossier has no adult/standard path-based mode split at the Worker level (ADR-0013's adult gate is a client-side interstitial, not routing). Drop the per-extension `Content-Type` guesses (lines 34-50) unless immutable-asset serving needs them; `env.ASSETS.fetch` already sets correct content types for hashed build output. Keep the `/api/` exclusion in the SPA-fallback condition even though `apps/api` doesn't exist yet in Phase 1 — it's forward-compatible with Phase 3 and costs nothing now.

---

### `.editorconfig` (config, —)

**Analog:** `~/Development/Personal/SizeComparisonSite/.editorconfig` (17 lines) — port verbatim, already reproduced in RESEARCH.md § Code Examples in full. No changes needed.

---

### `package.json` (root) (config, —)

**Analog:** `~/Development/Personal/SizeComparisonSite/package.json` — role-match for two conventions only:

**`pnpm.onlyBuiltDependencies` allowlist shape** (lines 17-25):
```json
"pnpm": {
  "onlyBuiltDependencies": ["@parcel/watcher", "esbuild", "lmdb", "msgpackr-extract", "sharp", "workerd"]
}
```
Per RESEARCH.md Pitfall 4 / Assumption A5, trim to the Character-Dossier-relevant subset (`esbuild`, `@parcel/watcher`, `workerd` — no `sharp`/`lmdb`/`msgpackr-extract` since there's no server-side image processing in Phase 1); `pnpm install` self-corrects by printing the actual blocked list.

**Scripts convention** (lines 4-15): `ng`/`start`/`build`/`watch`/`test`/`lint`(`tsc --noEmit`)/`typecheck`/`wrangler:dev`/`wrangler:deploy` — same naming convention, but this is a root workspace `package.json` now, so scripts must be `pnpm -r`/`--filter` dispatchers (e.g. `"test": "pnpm -r test"`, `"build": "pnpm --filter schema build && pnpm --filter web build"`) rather than direct `ng`/`wrangler` invocations, since those now live inside `apps/web`'s own `package.json`.

---

### `apps/web/src/test-setup.ts` (test, —)

**Analog:** `~/Development/Personal/SizeComparisonSite/src/test-setup.ts` (17 lines) — port the stub-native-dialogs convention.

```typescript
// Source: SizeComparisonSite/src/test-setup.ts:1-17
(window as any).confirm = () => true;
(window as any).alert = () => true;
(window as any).ResizeObserver = class ResizeObserver {
  constructor(callback: any) { this.callback = callback; }
  observe() {}
  disconnect() {}
  unobserve() {}
  private callback: any;
};
```
Directly relevant because Assumption A2 locks native `window.confirm()` as the Phase 1 delete-confirmation UI — this stub is required for `library.store.spec`/integration tests to run headless under Vitest+jsdom without a real confirm dialog blocking the test runner. `ResizeObserver` stub may be unnecessary if no Phase 1 component uses it (masthead/library list don't obviously need it) — include only if a jsdom `ResizeObserver is not defined` error actually surfaces.

## Shared Patterns

### IndexedDB access — never call `indexedDB` directly outside the wrapper
**Source:** `native-indexeddb.service.ts` (all methods)
**Apply to:** `character.repo.ts`, `prefs.repo.ts`, and any future `images.repo.ts`/`shares.repo.ts` (Phase 3-4). All reads/writes go through `NativeIndexedDBService`, never raw `indexedDB.open`/`transaction` calls in repo or store code.

### Storage-blocked / private-browsing guard
**Source:** `native-indexeddb.service.ts:38-47` (`isStorageBlocked`) + `storage-errors.ts` (`StorageUnavailableError`, `STORAGE_UNAVAILABLE_MESSAGE`)
**Apply to:** App bootstrap (`app.config.ts` or `main.ts`) should call `isStorageBlocked()` before `NativeIndexedDBService.init()`, and any UI surface that catches a rejected repo call should check `err instanceof StorageUnavailableError` to show the clean message instead of a raw exception (ASVS V7 requirement noted in RESEARCH.md Security Domain).

### Restoring-flag suppression during load
**Source:** RESEARCH.md Pattern 2 (locked) + `state-management.service.ts:83,344-352` (analogous RxJS-era convention)
**Apply to:** `character.store.ts`'s `restoring` signal guarding the autosave `effect()`; also applicable to `library.store.ts` if it ever needs to suppress a reactive side effect during bulk import (not needed in Phase 1, but same idiom).

### Native confirm() for destructive actions
**Source:** `test-setup.ts:1-7` (test stub proves the pattern is an accepted convention in this project family) + Assumption A2
**Apply to:** `library.store.ts`'s `remove()` / the Library view's delete button — call `window.confirm(...)` directly, no custom modal in Phase 1.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/schema/src/character.ts`, `share.ts`, `plugin.ts`, `limits.ts` | model | tran

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 23607 bytes -->
