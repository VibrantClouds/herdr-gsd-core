# Phase 3: Snapshot Share End-to-End - Pattern Map

**Mapped:** 2026-09-14
**Files analyzed:** 24
**Analogs found:** 19 / 24

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/api/package.json` | config | — | `packages/schema/package.json` | role-match (no apps/api yet) |
| `apps/api/tsconfig.json` | config | — | `packages/schema/tsconfig.json` (not read; same shape as `vitest.config.ts` sibling) | role-match |
| `apps/api/vitest.config.ts` | config | — | `packages/schema/vitest.config.ts` | exact shape |
| `apps/api/src/index.ts` | route/controller | request-response | none in repo (first Hono app) | no analog — use RESEARCH Code Examples |
| `apps/api/src/server.ts` | config | request-response | none | no analog |
| `apps/api/src/config.ts` | config | request-response | none (Zod is used in `packages/schema`, not for env) | no analog — use RESEARCH env-contract example |
| `apps/api/src/routes/shares.ts` | route/controller | CRUD | none | no analog — use RESEARCH Pattern 1/2 |
| `apps/api/src/object-store.ts` | service | file-I/O | `apps/web/src/app/services/character.repo.ts`-style repo interface (not read this pass; same "interface + impl" shape as `CharacterRepo`) | role-match |
| `apps/api/src/ids.ts` | utility | transform | none | no analog — pure crypto, self-contained per RESEARCH Pattern 2 |
| `apps/api/src/healthz.ts` | route/controller | request-response | none | no analog |
| `apps/api/src/logger.ts` | utility | — | none | no analog |
| `apps/api/src/__tests__/*.spec.ts` | test | request-response | `packages/schema/src/__tests__/*.spec.ts` (Vitest conventions) | role-match |
| `packages/schema/src/migrate.ts` (add `computeAdult`) | utility | transform | same file, existing exports (`compareVersions` etc.) | exact — extend in place |
| `packages/schema/src/__tests__/compute-adult.spec.ts` | test | transform | existing `packages/schema/src/__tests__/*.spec.ts` | exact |
| `apps/web/src/app/components/section-selector/section-selector.component.ts` | component | CRUD (selection state) | `apps/web/src/app/components/add-page-menu/add-page-menu.component.ts` (not read; sibling list-picker component) — better: `apps/web/src/app/pages/character/character-page.component.ts` nav/list patterns | role-match |
| `apps/web/src/app/pages/character/share-dialog.component.ts` | component | request-response | `apps/web/src/app/components/modal/modal.component.ts` (shell) + `character-page.component.ts` (host wiring) | role-match, strong |
| `apps/web/src/app/pages/share/share-page.component.ts` | component | request-response | `apps/web/src/app/pages/character/character-page.component.ts` | exact (view-mode composition, load/error state machine) |
| `apps/web/src/app/pages/share/adult-interstitial.component.ts` | component | event-driven | `apps/web/src/app/components/modal/modal.component.ts` | role-match (focus trap reuse) |
| `apps/web/src/app/pages/share/share-error.component.ts` | component | request-response | `character-page.component.ts` error branches (`rejectLoad`, `NOT_FOUND_MESSAGE` etc.) | role-match |
| `apps/web/src/app/stores/share.store.ts` | store | CRUD | `apps/web/src/app/stores/library.store.ts` | exact |
| `apps/web/src/app/services/share-api.service.ts` | service | request-response | none in repo yet (no `fetch`-based service exists) | no analog — follow RESEARCH CORS/env code examples for consumer side |
| `apps/web/src/app/services/share.repo.ts` | service | CRUD (IndexedDB) | `apps/web/src/app/services/indexeddb-config.ts` (schema) + `character.repo.ts`-style repo (not read; same store as `characters`) | role-match |
| `apps/web/src/app/services/adult-gate.service.ts` | service | event-driven | `apps/web/src/app/services/snackbar.service.ts` (signal-based single-slot service) | role-match |
| `apps/web/src/app/app.routes.ts` (add `s/:shareId`) | route | request-response | same file, existing route entries | exact — extend in place |
| `apps/web/src/environments/environment.ts` / `environment.development.ts` (add `apiBaseUrl`/`appOrigin`) | config | — | same files, existing `viewModePreview` field | exact — extend in place |
| `apps/web/wrangler.jsonc` (add `routes`) | config | — | same file | exact — extend in place |
| `docker-compose.yml` (root, new) | config | file-I/O | none in repo (first compose file) | no analog — use RESEARCH Pattern 4 |

## Pattern Assignments

### `apps/api/package.json`, `tsconfig.json`, `vitest.config.ts` (config)

**Analog:** `packages/schema/package.json`, `packages/schema/vitest.config.ts`

`packages/schema` is the only other workspace package and sets the shape a new `apps/api` package should copy: `"type": "module"`, `scripts.build`/`test`/`typecheck` split, Vitest with `environment: 'node'`, `globals: true`, `include: ['src/**/*.spec.ts']`.

```json
// packages/schema/package.json (lines 1-24) — copy shape, adjust deps per RESEARCH Standard Stack
{
  "name": "@dossier/schema",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

```typescript
// packages/schema/vitest.config.ts (full file) — copy verbatim for apps/api, keep environment: 'node'
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    globals: true,
  },
});
```

Root `package.json` (lines 8-14): `test` and `typecheck` scripts build `@dossier/schema` first, then run `pnpm -r`. `apps/api` is picked up automatically via `pnpm-workspace.yaml`'s `apps/*` glob — no root script changes needed.

---

### `apps/api/src/routes/shares.ts`, `index.ts`, `config.ts`, `ids.ts`, `object-store.ts`, `healthz.ts` (no in-repo analog)

**No analog exists** — this is the first backend service in the monorepo (confirmed: `apps/api` does not exist; `git ls-files` shows only `apps/web` and `packages/schema` as workspace members). Use the concrete code already worked out in `03-RESEARCH.md`:
- CORS + app assembly: RESEARCH "Code Examples § `hono/cors` origin function"
- Env validation: RESEARCH "Code Examples § Env contract validation on boot"
- `ObjectStore` interface + `MemoryObjectStore`: RESEARCH "Pattern 1"
- Id/token generation: RESEARCH "Pattern 2"
- `computeAdult`: RESEARCH "Pattern 3" (see below — lands in `packages/schema`, not `apps/api`)

**Test conventions to borrow:** `packages/schema/src/__tests__/*.spec.ts` naming (`*.spec.ts`, colocated under `src/__tests__/`) and the plain-Vitest style (no custom test utils) — apply the same layout to `apps/api/src/__tests__/`, swapping in `hono/testing`'s `app.request(...)` per RESEARCH's Validation Architecture table.

---

### `packages/schema/src/migrate.ts` — add `computeAdult` (utility, transform)

**Analog:** same file, existing function style (`compareVersions`, `migrateSubDocument`)

**Imports pattern** (lines 1-9):
```typescript
import {
  CHARACTER_SCHEMA_VERSION,
  ENVELOPE_MIGRATIONS,
  ENVELOPE_SUPPORTED_VERSIONS,
  characterSchema,
  type Character,
  type SubDocument,
} from './character.js';
import { SCHEMA_REGISTRY, type SchemaRegistry } from './plugin.js';
```

**Function style to match** (lines 37-48, `compareVersions`): pure function, `registry: SchemaRegistry = SCHEMA_REGISTRY` default-parameter pattern (also used in `migrateSubDocument` line 54-57, `validateSubDocument` line 78-81, `validateCharacter` line 111) — every schema-registry-consuming function in this file takes the registry as an injectable default param for testability. `computeAdult` must follow the same signature shape:

```typescript
export function computeAdult(pages: readonly SubDocument[], registry: SchemaRegistry = SCHEMA_REGISTRY): boolean {
  return pages.some((page) => registry[page.type]?.adult === true);
}
```

Confirmed via `packages/schema/src/plugins/intimacy/index.ts` line 10 (`adult: true`) that the per-plugin `adult` flag already exists on `SubDocumentSchema` — `computeAdult` is pure aggregation, no plugin changes needed.

**Doc-comment style** (lines 35-36, 50-53, 107-110): each exported function gets a `/** ... */` block explaining a non-obvious invariant (gap-tolerance, sort order, rejection order) — not a routine description. Follow this for `computeAdult` only if there's a genuine invariant to state (e.g. "server-authoritative; never trust the client's value").

**Test file placement:** `packages/schema/src/__tests__/compute-adult.spec.ts`, new sibling to whatever existing `migrate.spec.ts`/similar tests already cover `compareVersions` etc. (not read this pass — grep for existing `__tests__/*.spec.ts` filenames before creating to confirm the exact directory).

---

### `apps/web/src/app/pages/share/share-page.component.ts` (component, request-response)

**Analog:** `apps/web/src/app/pages/character/character-page.component.ts`

This is the strongest analog in the repo: `CharacterPage` already implements the exact load/error state machine `SharePage` needs (`loadCharacter`, catching `CharacterNotFoundError` / `UnsupportedVersionError` / `InvalidDocumentError`, view-mode composition of `CharacterHeader`/`SectionNav`/`SubDocHost`).

**Imports pattern** (lines 1-25):
```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { characterCoreSchema, InvalidDocumentError, UnsupportedVersionError, type SubDocument } from '@dossier/schema';
import { CharacterHeader } from '../../components/character-header/character-header.component';
import { SectionNav } from '../../components/section-nav/section-nav.component';
import { SubDocHost } from '../../subdocs/subdoc-host/subdoc-host.component';
import { SnackbarService } from '../../services/snackbar.service';
```

**Load-and-classify-error pattern** (lines 241-266) — copy this shape, replacing `CharacterStore`/IndexedDB with `ShareApiService`/`fetch` and the four `ShareViewState` variants from RESEARCH Pattern 5 instead of a snackbar+redirect:
```typescript
private async loadCharacter(id: string): Promise<void> {
  if (!characterCoreSchema.shape.id.safeParse(id).success) {
    this.rejectLoad(NOT_FOUND_MESSAGE);
    return;
  }
  try {
    await this.store.load(id);
  } catch (err) {
    if (err instanceof CharacterNotFoundError) {
      this.rejectLoad(NOT_FOUND_MESSAGE);
    } else if (err instanceof UnsupportedVersionError) {
      this.rejectLoad(UNSUPPORTED_VERSION_MESSAGE);
    } else if (err instanceof InvalidDocumentError) {
      this.rejectLoad(INVALID_DOCUMENT_MESSAGE);
    } else {
      console.error('[CharacterPage] unexpected load failure', err);
      this.rejectLoad(INVALID_DOCUMENT_MESSAGE);
    }
  }
}
```
Note `SharePage` must NOT redirect on error (RESEARCH Pattern 5 — it owns 4 distinct error states, not one message+redirect), so `rejectLoad`'s body changes but the try/catch/instanceof cascade shape carries over directly.

**View-mode composition in the template** (`character-page.component.html` lines 7-18): `@if (store.core(); as core)` guarding `CharacterHeader` + `SectionNav` + `page-list` — `SharePage`'s template composes the same three components in `mode='view'` per SPEC-frontend-architecture §6, but without the `cdkDropList`/drag machinery (view mode never drags) and without the "← Library" link (D-09 says no back-link on share pages).

**Effect-driven load-on-input-change pattern** (lines 101-113):
```typescript
constructor() {
  effect(() => {
    const id = this.characterId();
    if (id === this.loadingId) return;
    this.loadingId = id;
    void this.loadCharacter(id);
  });
}
```
Same shape applies to `SharePage` keyed on `shareId()` instead of `characterId()`.

---

### `apps/web/src/app/pages/character/share-dialog.component.ts` (component, request-response)

**Analog:** `apps/web/src/app/components/modal/modal.component.ts` (shell) + how `character-page.component.ts`/`.html` mounts `cd-modal` for the add-page menu

**Modal shell to reuse, not reimplement** (`modal.component.ts` full file):
```typescript
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'cd-modal',
  imports: [CdkTrapFocus],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Modal {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly close = output<void>();
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }
}
```

**Host wiring pattern** (`character-page.component.html` lines 65-67):
```html
<cd-modal [open]="addMenuOpen()" title="Add page" (close)="addMenuOpen.set(false)">
  <cd-add-page-menu [types]="store.availableTypes()" (pick)="onPick($event)" />
</cd-modal>
```
`ShareDialog` follows the same `[open]`/`title`/`(close)` contract; its internal content swaps between the page-selector+disclosure view and the D-07 result view (URL field, Copy again, Open link, Done) using a local signal, same as `addMenuOpen` gates the add-page menu.

**Note:** `Modal` component's own doc comment (line 6-7) already states it's "reused by the Phase 3 share dialog and the Phase 6 print dialog" — this is a pre-existing forward reference confirming the intended reuse.

---

### `apps/web/src/app/pages/share/adult-interstitial.component.ts` (component, event-driven)

**Analog:** `apps/web/src/app/components/modal/modal.component.ts` — reuse `CdkTrapFocus`, not the whole `Modal` component (per RESEARCH "Don't Hand-Roll" table: interstitial has no backdrop-click-to-close, no header ×, Escape does nothing — those are the aspects to drop from `Modal`, everything else about the focus-trap directive usage carries over).

---

### `apps/web/src/app/stores/share.store.ts` (store, CRUD)

**Analog:** `apps/web/src/app/stores/library.store.ts`

**Signal-based store shape to copy** (lines 14-24):
```typescript
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly repo = inject(CharacterRepo);
  readonly summaries = signal<CharacterSummary[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);
  private pendingCreate: Promise<string> | null = null;
```
`ShareStore` follows the same shape: `private readonly repo = inject(ShareRepo)` / `private readonly api = inject(ShareApiService)`, plus a `publishing = signal(false)` mirroring `creating`.

**In-flight-promise dedupe pattern** (lines 57-69) — directly reusable for "Publish" double-click protection:
```typescript
create(): Promise<string> {
  if (this.pendingCreate) {
    return this.pendingCreate;
  }
  this.creating.set(true);
  this.pendingCreate = this.doCreate().finally(() => {
    this.creating.set(false);
    this.pendingCreate = null;
  });
  return this.pendingCreate;
}
```

**"Save to my library" import pattern — model directly from `duplicate()`** (lines 78-105):
```typescript
async duplicate(id: string): Promise<string> {
  const source = await this.repo.get(id);
  if (source == null) throw new Error(`Character ${id} not found`);
  const now = new Date().toISOString();
  const copy = {
    ...source,
    core: { ...source.core, id: crypto.randomUUID(), name: `${truncated} (copy)` },
    pages: structuredClone(source.pages),
    createdAt: now,
    updatedAt: now,
  };
  await this.repo.put(copy);
  await this.refresh();
  return copy.core.id;
}
```
D-11's import flow (new uuid, `core` + included `pages` from the payload, navigate to `/c/:newId`) is structurally identical to `duplicate()` — same `crypto.randomUUID()` id-swap, same `repo.put` + navigate shape — except the source is a fetched `SharePayload` run through `validateCharacter`/`migrateSubDocument` (Pitfall 6) instead of an existing IndexedDB record, and there is no `shares` record or owner token written (D-11 explicit).

---

### `apps/web/src/app/services/share-api.service.ts` (service, request-response)

**No existing `fetch`-based service in the repo** — this is the first HTTP client. Follow the env-file pattern below for `apiBaseUrl`, and the "never log tokens" security rule from RESEARCH (Security Domain, V7). No structural analog to copy from; use `SnackbarService`'s DI style (`@Injectable({ providedIn: 'root' })`, `private readonly x = inject(...)`) as the baseline Angular service shape (see `snackbar.service.ts` lines 27-29).

---

### `apps/web/src/app/services/share.repo.ts` (service, CRUD/IndexedDB)

**Analog:** `apps/web/src/app/services/indexeddb-config.ts` (schema only — the `shares` store already exists, no version bump)

```typescript
// apps/web/src/app/services/indexeddb-config.ts lines 36-40 — shares store already declared
{
  store: 'shares',
  storeConfig: { keyPath: 'shareId', autoIncrement: false },
  storeSchema: [{ name: 'characterId', keypath: 'characterId', options: { unique: false } }],
},
```
No `CharacterRepo` implementation file was read this pass (not in the required-reading set) — before writing `share.repo.ts`, grep `apps/web/src/app/services/character.repo.ts` for its `get`/`put`/`delete`/`list` method shapes against `ngx-indexed-db` (or whatever wrapper `indexeddb-config.ts` implies) and mirror them for the `shares` store instead of re-deriving the IndexedDB access pattern from scratch.

---

### `apps/web/src/app/services/adult-gate.service.ts` (service, event-driven)

**Analog:** `apps/web/src/app/services/snackbar.service.ts`

**Single-slot signal service shape** (lines 27-34):
```typescript
@Injectable({ providedIn: 'root' })
export class SnackbarService {
  private readonly _current = signal<Toast | null>(null);
  readonly current = this._current.asReadonly();
```
`AdultGateService` follows the same `_private signal + readonly public accessor` shape, backed by `localStorage['cd.adultAck']` reads/writes instead of an in-memory queue (per ADR-0013 / RESEARCH canonical refs).

---

### `apps/web/src/app/app.routes.ts` — add `s/:shareId`

**Analog:** same file, existing entries (lines 1-13):
```typescript
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/library/library-page.component').then((m) => m.LibraryPage) },
  { path: 'c/:characterId', loadComponent: () => import('./pages/character/character-page.component').then((m) => m.CharacterPage) },
  { path: '**', redirectTo: '' },
];
```
Add `{ path: 's/:shareId', loadComponent: () => import('./pages/share/share-page.component').then((m) => m.SharePage) }` before the `**` catch-all, matching the existing lazy `loadComponent` convention exactly. Per RESEARCH/SPEC-frontend-architecture §2, this route has **no** `CanActivateFn` guard — `SharePage` owns its own load state (see Pattern 5 in RESEARCH), consistent with `character-page.component.ts` also having no guard and doing its own load-and-classify in the constructor effect.

---

### `apps/web/src/environments/environment.ts` / `environment.development.ts` — add `apiBaseUrl`/`appOrigin`

**Analog:** same two files, existing `viewModePreview` field:
```typescript
// environment.ts (production default)
export const environment = { viewModePreview: false };
// environment.development.ts
export const environment = { viewModePreview: true };
```
Extend both objects in place — `angular.json`'s existing `fileReplacements` already swaps `environment.ts` → `environment.development.ts` under the `development` configuration (confirmed by RESEARCH's direct read of `angular.json:65-75`), so no build-config change is needed, only adding fields to both files per RESEARCH's Code Examples § "Angular environment files extended."

---

### `apps/web/wrangler.jsonc` — add `routes`

**Analog:** same file. Current state (lines 13-14) has a comment explicitly flagging this as deferred:
```jsonc
// No `routes` entry: no artifact names the production domain yet (see 01-01-PLAN.md
// Flagged assumptions). The user adds this once a domain is chosen.
```
D-15 now names the domain (`characterdossierlab.app`, apex + `www` 301 redirect) — add the `routes` array and remove the stale comment (replace it, don't leave both — "the second copy is the one that drifts").

---

#

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 24162 bytes -->
