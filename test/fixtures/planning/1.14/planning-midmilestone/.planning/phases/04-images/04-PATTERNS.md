# Phase 4: Images - Pattern Map

**Mapped:** 2026-09-15
**Files analyzed:** 17 new/modified files (client pipeline, gallery plugin schema+UI, portrait rework, image API route, lightbox, doc/config fixes)
**Analogs found:** 15 / 17 (2 have no strong in-repo analog; use external reference + spec instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/web/src/app/images/image-pipeline.protocol.ts` | utility (types) | event-driven | `/home/user/Development/SizeComparisonSite/src/app/workers/image-processing.protocol.ts` (external reference, not in this repo) | exact (structural mirror, explicitly mandated by RESEARCH.md) |
| `apps/web/src/app/images/image-pipeline.worker.ts` | worker | event-driven | `/home/user/Development/SizeComparisonSite/src/app/workers/image-processing.worker.ts` (external) | exact, minus `NgZone` |
| `apps/web/src/app/images/image-pipeline-core.ts` | utility (pure fns) | transform | `/home/user/Development/SizeComparisonSite/src/app/utils/image-processing-core.ts` + `offscreen-image-processor.ts` (external) | exact (math/canvas pattern) |
| `apps/web/src/app/images/image-pipeline.service.ts` | service | event-driven + request-response | No in-repo worker-dispatch service exists; closest structural analog is `apps/web/src/app/services/character.repo.ts` (init/await pattern, signal-driven state) | role-match, zoneless dispatch is net-new (see Shared Patterns) |
| `apps/web/src/app/images/image.repo.ts` | model (IndexedDB CRUD) | CRUD | `apps/web/src/app/services/character.repo.ts` | exact |
| `packages/schema/src/plugins/gallery/index.ts` | config (plugin registration) | request-response | `packages/schema/src/plugins/intimacy/index.ts` | exact |
| `packages/schema/src/plugins/gallery/v1.ts` | model | transform | `packages/schema/src/plugins/intimacy/v1.ts` | role-match (intimacy has no images; gallery's `collectImageRefs` is genuinely new logic) |
| `packages/schema/src/plugins/gallery/schema.ts` | model (zod) | CRUD | `packages/schema/src/plugins/intimacy/schema.ts` | role-match |
| `packages/schema/src/plugins/gallery/migrations.ts` | model | CRUD | `packages/schema/src/plugins/intimacy/migrations.ts` | exact |
| `packages/schema/src/plugins/gallery/fixtures/1.0.0.json` | test fixture | CRUD | `packages/schema/src/plugins/intimacy/fixtures/1.0.0.json` | exact |
| `apps/web/src/app/subdocs/gallery/index.ts` | provider (plugin registration) | request-response | `apps/web/src/app/subdocs/intimacy/index.ts` | exact |
| `apps/web/src/app/subdocs/gallery/gallery-editor.component.ts/.html/.scss` | component | CRUD + event-driven | `apps/web/src/app/subdocs/intimacy/intimacy-editor.component.ts` (editor shape) + `apps/web/src/app/components/section-selector/section-selector.component.ts` (input/output/computed idiom) | role-match (no existing editor does file I/O, drag-drop, or async per-item resolution) |
| `apps/web/src/app/components/lightbox/lightbox.component.ts/.html/.scss` | component | request-response | `apps/web/src/app/components/modal/modal.component.ts` | exact (CDK focus trap, backdrop-click, open/title/close) |
| `apps/web/src/app/components/character-header/character-header.component.ts/.html` (modified) | component | event-driven | itself (existing file, modified in place) | exact — pattern to extend is already in this file |
| `apps/api/src/routes/images.ts` | route/controller | request-response | `apps/api/src/routes/shares.ts` | exact (Hono route shape, `apiError` helper, `ObjectStore` usage, check-order style) |
| `apps/api/src/object-store.ts` (no new file — reused) | service | CRUD | itself | exact — reuse unchanged, no new abstraction |
| `apps/web/src/environments/environment.ts` / `environment.development.ts` (modified) | config | — | itself | exact — add `imgBaseUrl` key alongside existing keys |
| `docker-compose.yml` (modified) | config | — | itself | exact — extend existing `createbuckets` step |
| `apps/web/_worker.js` (modified CSP) | config | — | itself | exact — extend existing `img-src` directive |

## Pattern Assignments

### `apps/web/src/app/images/image-pipeline.protocol.ts` (utility/types, event-driven)

**Analog:** `/home/user/Development/SizeComparisonSite/src/app/workers/image-processing.protocol.ts` (external reference project, explicitly named in RESEARCH.md as the mirror target — no in-repo worker protocol exists yet)

**Full pattern** (types-only, no runtime code):
```typescript
export type ImageWorkerRequest =
  | { kind: 'compress'; id: number; file: Blob; fileType: string; pipelineKind: 'portrait' | 'gallery' };

export type ImageWorkerResponse =
  | ({ kind: 'compress'; id: number } & OffscreenCompressResult)
  | { kind: 'error'; id: number; message: string };
```
Key convention: every request/response carries a correlating numeric `id` alongside a `kind` discriminant so a stray/duplicate `onmessage` is detectable, not silently accepted. Import `CompressionOptions`-equivalent types from the sibling core module, never from Angular.

---

### `apps/web/src/app/images/image-pipeline.worker.ts` (worker, event-driven)

**Analog:** `/home/user/Development/SizeComparisonSite/src/app/workers/image-processing.worker.ts`

**Full pattern:**
```typescript
export {};
import { compressImageOffscreen } from '../utils/offscreen-image-processor'; // -> image-pipeline-core.ts here
import { ImageWorkerRequest, ImageWorkerResponse } from './image-processing.protocol';

self.onmessage = async (event: MessageEvent<ImageWorkerRequest>) => {
  const request = event.data;
  try {
    switch (request.kind) {
      case 'compress': {
        const result = await compressImageOffscreen(request.file, request.fileType, request.pipelineKind);
        self.postMessage({ kind: 'compress', id: request.id, ...result } satisfies ImageWorkerResponse);
        break;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    self.postMessage({ kind: 'error', id: request.id, message } satisfies ImageWorkerResponse);
  }
};
```
No zone/NgZone anywhere in the worker file itself — this file is plain TS with no Angular imports at all, both in the reference and required here.

---

### `apps/web/src/app/images/image-pipeline-core.ts` (utility/pure functions, transform)

**Analog:** `/home/user/Development/SizeComparisonSite/src/app/utils/image-processing-core.ts` + `offscreen-image-processor.ts`

**Core pattern** (decode → scale → encode, no DOM/Angular coupling beyond canvas globals):
```typescript
const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); // bakes in EXIF rotation
const canvas = new OffscreenCanvas(targetWidth, targetHeight);
const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
```
Hashing pattern to append (native, no library): `crypto.subtle.digest('SHA-256', bytes)` → hex string. Keep this module pure — no `Worker`, no `self`, no Angular — so it is independently unit-testable per RESEARCH.md's Wave-0 gap `image-pipeline-core.spec.ts`.

---

### `apps/web/src/app/images/image-pipeline.service.ts` (service, event-driven/request-response)

**Analog:** No in-repo worker-dispatch service exists. Structural shape to copy from `apps/web/src/app/services/character.repo.ts` (injectable, `providedIn: 'root'`, async methods awaiting an internal init); **zoneless dispatch pattern is net-new** (see Shared Patterns > Zoneless Worker Dispatch below — this is the single highest-risk pattern in the phase per RESEARCH.md Pitfall 1).

**Core pattern:**
```typescript
@Injectable({ providedIn: 'root' })
export class ImagePipelineService {
  readonly progress = signal<Map<string, 'pending' | 'uploading' | 'done' | 'failed'>>(new Map());

  private runWorkerRequest(request: ImageWorkerRequest): Promise<ImageWorkerResponse> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./image-pipeline.worker', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<ImageWorkerResponse>) => {
        const response = event.data;
        if (response.id !== request.id) return; // stray/duplicate message guard
        worker.terminate();
        if (response.kind === 'error') { reject(new Error(response.message)); return; }
        resolve(response);
      };
      worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message)); };
      worker.postMessage(request);
    });
  }
}
```
**Do not** `inject(NgZone)` or wrap the callback in `.run(...)` — this codebase is zoneless (ADR-0016). Writing to a `signal` after resolve/reject is what notifies change detection.

---

### `apps/web/src/app/images/image.repo.ts` (model, CRUD)

**Analog:** `apps/web/src/app/services/character.repo.ts` (lines 1-40, 55-68)

**Imports pattern:**
```typescript
import { Injectable, inject } from '@angular/core';
import { CHARACTER_DOSSIER_DB_CONFIG } from './indexeddb-config';
import { NativeIndexedDBService } from './native-indexeddb.service';

const STORE = 'images';
```

**Core CRUD pattern:**
```typescript
@Injectable({ providedIn: 'root' })
export class ImageRepo {
  private readonly db = inject(NativeIndexedDBService);
  private hasPersisted = false;

  private init(): Promise<void> {
    return this.db.init(CHARACTER_DOSSIER_DB_CONFIG);
  }

  async getByHash(hash: string): Promise<StoredImage | null> {
    await this.init();
    return this.db.getByKey<StoredImage>(STORE, hash);
  }

  async put(image: StoredImage): Promise<StoredImage> {
    await this.init();
    await this.db.update(STORE, image);
    if (!this.hasPersisted) {
      this.hasPersisted = true;
      void this.db.requestPersistence(); // SPEC-image-pipeline.md §8 — decide ordering vs. Phase 1's character-write call (Claude's Discretion)
    }
    return image;
  }
}
```
`images` store already exists at DB v1 (`keyPath: 'hash'`, no indexes, no version bump needed) — see `apps/web/src/app/services/indexeddb-config.ts` lines 29-33.

---

### `packages/schema/src/plugins/gallery/index.ts` (config, request-response)

**Analog:** `packages/schema/src/plugins/intimacy/index.ts` (full file, 18 lines)

**Full pattern to copy verbatim except values:**
```typescript
import type { SubDocumentSchema } from '../../plugin.js';
import { GALLERY_MIGRATIONS } from './migrations.js';
import { galleryV1Schema } from './schema.js';
import { createGalleryDefault, type GalleryV1 } from './v1.js';

export const gallerySchema: SubDocumentSchema<GalleryV1> = {
  type: 'gallery',
  displayName: 'Gallery',
  description: 'A collection of images with captions.',
  adult: false,
  currentVersion: '1.0.0',
  supportedVersions: ['1.0.0'],
  migrations: GALLERY_MIGRATIONS,
  schema: galleryV1Schema,
  createDefault: createGalleryDefault,
  collectImageRefs: (doc) => doc.items.map((item) => item.image), // gallery-specific: intimacy returns []
};

export * from './v1.js';
```
Then register in `packages/schema/src/plugin.ts`'s `SCHEMA_REGISTRY = Object.freeze({ intimacy, gallery })`.

---

### `packages/schema/src/plugins/gallery/migrations.ts` (model, CRUD)

**Analog:** `packages/schema/src/plugins/intimacy/migrations.ts` (full file, 6 lines) — copy verbatim, rename constant.
```typescript
import type { Migration } from '../../plugin.js';

/** Zero migrations for the first-ever supported version — see RESEARCH.md Pitfall 3;
 * ADR-0011's "one no-op migration" prose is stale, `intimacy` already established this. */
export const GALLERY_MIGRATIONS: readonly Migration[] = [];
```

---

### `packages/schema/src/plugins/gallery/schema.ts` (model, CRUD)

**Analog:** `packages/schema/src/plugins/intimacy/schema.ts`

**Imports + validation pattern:**
```typescript
import { z } from 'zod';
import { shortText } from '../../character.js';
import { CAPTION_MAX, GALLERY_ITEMS_MAX } from '../../limits.js';
import { imageRefSchema } from '../../character.js'; // reuse existing, widened enum per D-10
import type { SubDocumentSchema } from '../../plugin.js';
import type { GalleryV1 } from './v1.js';

const galleryItemSchema = z.object({
  image: imageRefSchema,
  caption: shortText(CAPTION_MAX),
});

export const galleryV1Schema = z.object({
  items: z.array(galleryItemSchema).max(GALLERY_ITEMS_MAX),
}) as unknown as SubDocumentSchema<GalleryV1>['schema'];
```
Note the intimacy file's `as unknown as SubDocumentSchema<...>['schema']` cast at the bottom — required by the plugin contract's type, copy that idiom exactly.

---

### `apps/web/src/app/subdocs/gallery/index.ts` (provider, request-response)

**Analog:** `apps/web/src/app/subdocs/intimacy/index.ts` (full file, 12 lines) — copy verbatim, change values:
```typescript
import { gallerySchema, type GalleryV1 } from '@dossier/schema';
import type { SubDocumentPlugin } from '../plugin';

export const galleryPlugin: SubDocumentPlugin<GalleryV1> = {
  schema: gallerySchema,
  load: () => import('./gallery-editor.component').then((m) => m.GalleryEditor),
  icon: 'ph-image',
  printBreakBefore: true, // D-10 open design question: confirm with SPEC-design-system.md §6 motion/print
  sections: [{ id: 'page-gallery', label: 'Gallery' }],
};
```
Then register in `apps/web/src/app/subdocs/plugin.ts`'s `SUBDOC_PLUGINS`.

---

### `apps/web/src/app/subdocs/gallery/gallery-editor.component.ts` (component, CRUD + event-driven)

**Analog:** `apps/web/src/app/subdocs/intimacy/intimacy-editor.component.ts` (editor shape/inputs/outputs — read for the `SubDocumentEditor` contract shape) combined with `apps/web/src/app/components/section-selector/section-selector.component.ts` (imports/computed/output idiom, lines 1-18).

**Sequential multi-file processing pattern** (D-08, mandatory — not `Promise.all`):
```typescript
// apps/web/src/app/subdocs/gallery/gallery-editor.component.ts
async function processFiles(files: File[], pipeline: ImagePipelineService): Promise<void> {
  for (const file of files) {
    // Skeleton card already rendered synchronously before this loop starts (D-08).
    await pipeline.processGalleryImage(file); // awaited — not Promise.all
  }
}
```
Duplicate-hash handling should look up `image.repo.ts`/local list state by hash before inserting a card, per D-09.

**Reorder:** use `@angular/cdk/drag-drop`'s `cdkDropList`/`cdkDrag` — same library as ADR-0003's page reorder, but a **separate** `cdkDropList` scoped to the gallery grid (per RESEARCH's Claude's Discretion note on interaction with Phase 2's page-collapse-on-drag).

---

### `apps/web/src/app/components/lightbox/lightbox.component.ts` (component, request-response)

**Analog:** `apps/web/src/app/components/modal/modal.component.ts` (full file, 26 lines)

**Full pattern to extend:**
```typescript
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'cd-lightbox',
  imports: [CdkTrapFocus],
  templateUrl: './lightbox.component.html',
  styleUrl: './lightbox.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Lightbox {
  readonly open = input(false);
  readonly close = output<void>();
  // net-new vs. Modal: images list + activeIndex input, next/prev outputs, keydown handler for ←/→/Escape

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
}
```
Note the `@if`-destroys-`CdkTrapFocus` focus-restore behavior documented in Phase 2's `02-07` — reuse the same host-toggle idiom Modal relies on (`@if (open()) { <cd-lightbox-content ...> }` in the parent, not an internal `[hidden]`).

---

### `apps/web/src/app/components/character-header/character-header.component.html` + `.ts` (modified, event-driven)

**Analog:** itself — the file already has the input/output/computed idioms to extend (lines 1-52 of the `.ts`, full `.html`).

**Current state (to be replaced in edit mode):**
```html
<div class="portrait-frame" aria-hidden="true">
  <span class="monogram">{{ monogram() }}</span>
</div>
```

**Target pattern (D-06):**
```html
<div class="portrait-frame-wrap">
  <button type="button" class="portrait-frame" (click)="openPicker()" (drop)="onDrop($event)">
    @if (core().portrait) {
      <img [src]="portraitObjectUrl()" [width]="core().portrait!.width" [height]="core().portrait!.height" alt="" />
    } @else {
      <span class="monogram">{{ monogram() }}</span>
    }
    <span class="portrait-scrim">{{ core().portrait ? 'Replace portrait' : 'Add portrait' }}</span>
  </button>
  @if (core().portrait) {
    <button type="button" class="portrait-remove" (click)="removePortrait()" aria-label="Remove portrait">×</button>
  }
</div>
<!-- view mode keeps aria-hidden on the wrap; edit mode must NOT carry aria-hidden per D-06 -->
```
Keep the existing `onFieldInput`/`stripControlCharsExceptTabAndNewline` idiom in the `.ts` for any new text-like input; the `mode() === 'view' | else` branch structure already in the template is the pattern to extend, not replace.

---

### `apps/api/src/routes/images.ts` (route/controller, request-response)

**Analog:** `apps/api/src/routes/shares.ts` (imports lines 1-19, `apiError` helper lines 22-30, `imageObjectKey` lines 33-35, route body lines 52-172)

**Imports pattern:**
```typescript
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { IMAGE_BYTES_MAX, IMAGE_EDGE_MAX } from '@dossier/schema';
import type { AppDeps } from '../index.js';
```

**Error helper (copy verbatim):**
```typescript
function apiError<S extends ContentfulStatusCode>(
  c: Context, status: S, code: string, message: string, details?: Record<string, unknown>,
) {
  return c.json({ error: { code, message, ...(details ? { details } : {}) } }, status);
}
```

**Route factory + `ObjectStore` reuse pattern (Pattern 3 from RESEARCH.md):**
```typescript
export function createImagesRoutes(deps: AppDeps): Hono {
  const images = new Hono();

  images.post('/exists', async (c) => { /* 1-100 hashes -> {missing[], blocked[]} via deps.store.head(...) */ });

  images.put(
    '/:hash',
    bodyLimit({ maxSize: IMAGE_BYTES_MAX, onError: (c) => apiError(c, 413, 'PAYLOAD_TOO_LARGE', 'Image too large') }),
    async (c) => {
      // check order per SPEC-share-api.md §4.6: size -> blocked sentinel -> magic bytes -> dims -> hash match -> putIfAbsent
      const created = await deps.store.putIfAbsent(`images/${hash}.webp`, body, {
        contentType: 'image/webp',
        metadata: {},
      });
      return c.json({ hash, bytes: body.byteLength, created, url: `${deps.config.IMG_BASE_URL}/${hash}.webp` }, created ? 201 : 200);
    },
  );
  return images;
}
```
`imageObjectKey`-equivalent extension map must add `.gif` per D-10 — mirror `shares.ts` lines 33-35 exactly but add the GIF branch. GIF/WebP/JPEG magic-byte sniffing: see RESEARCH.md's `sniffGif` code example (byte offsets 0-3 signature, 6-9 little-endian u16 dims) — no in-repo analog exists for magic-byte sniffing; this is genuinely new code, write it as a pure exported function alongside the route for direct unit testing (mirrors how `shares.ts` keeps `imageObjectKey`/`hashSet`/`setsEqual` as top-level pure functions, lines 33-46).

Register in `apps/api/src/index.ts` alongside the existing `createSharesRoutes(deps)` mount.

## Shared Patterns

### Zoneless Worker Dispatch (net-new, highest-risk pattern this phase)
**Source:** No in-repo precedent; contrast is `/home/user/Development/SizeComparisonSite/src/app/services/image-processing.service.ts:385` (zone-based, do NOT copy the `NgZone.run()` wrapper)
**Apply to:** `image-pipeline.service.ts` only
```typescript
// WRONG (reference project, zone.js): this.ngZone.run(() => { ...resolve(response)... })
// RIGHT (this project, zoneless per ADR-0016): resolve/reject directly from onmessage/onerror;
// caller writes into a signal, which self-notifies the zoneless CD scheduler.
progress.update(map => new Map(map).set(hash, 'done'));
```

### Hono Route Error Shape
**Source:** `apps/api/src/routes/shares.ts` lines 22-30 (`apiEr

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 24334 bytes -->
