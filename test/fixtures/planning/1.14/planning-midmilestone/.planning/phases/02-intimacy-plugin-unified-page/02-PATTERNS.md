# Phase 2: Intimacy Plugin & Unified Page - Pattern Map

**Mapped:** 2026-09-14
**Files analyzed:** 27
**Analogs found:** 20 in-repo (Phase 1 code) / 27 total — 7 have no in-repo analog and must be built from RESEARCH.md/SPEC shapes directly (registries, meter, lean-slider, section-nav, subdoc-host wiring, environments, intimacy schema/editor — all genuinely new surface area for this project)

**Note on repo state:** Unlike Phase 1 (which had to borrow from the sibling `SizeComparisonSite` repo), Phase 1's own code now exists in-repo and is the primary analog source for Phase 2. All paths below were verified tracked via `git ls-files`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/schema/src/plugins/intimacy/v1.ts` | model | transform | `packages/schema/src/character.ts` (type shapes) | role-match |
| `packages/schema/src/plugins/intimacy/schema.ts` | model | transform | `packages/schema/src/character.ts` (`characterCoreSchema`, `shortText`) | role-match |
| `packages/schema/src/plugins/intimacy/migrations.ts` | config | transform | `character.ts`'s `ENVELOPE_MIGRATIONS: readonly Migration[] = []` | exact (empty-array shape) |
| `packages/schema/src/plugins/intimacy/index.ts` | model | transform | `packages/schema/src/plugin.ts` (`SubDocumentSchema` interface + `SCHEMA_REGISTRY`) | role-match (this file's entry populates the registry `plugin.ts` currently freezes empty) |
| `packages/schema/src/plugins/intimacy/fixtures/1.0.0.json` | config | file-I/O | `packages/schema/src/fixtures/envelope/1.0.0.json` | exact (shape convention) |
| `packages/schema/src/plugins/intimacy/index.spec.ts` | test | batch | `packages/schema/src/__tests__/character.spec.ts` | role-match |
| `apps/web/src/app/subdocs/plugin.ts` | model | transform | `packages/schema/src/plugin.ts` (schema-half registry pattern, adapted for UI-half) | role-match |
| `apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.ts` | component | request-response | `apps/web/src/app/components/character-header/character-header.component.ts` (signal input/output shape) + RESEARCH.md Pattern 3 (`NgComponentOutlet` wiring — no in-repo analog for this part) | partial |
| `apps/web/src/app/subdocs/intimacy/intimacy-editor.component.ts` | component | request-response | `apps/web/src/app/components/character-header/character-header.component.ts` | role-match |
| `apps/web/src/app/components/section-nav/section-nav.component.ts` | component | event-driven | none in-repo — build from CONTEXT.md D-02/D-03/D-04 + `SPEC-design-system.md` §4.2 | no analog |
| `apps/web/src/app/components/meter/meter.component.ts` | component | request-response | none in-repo — build from RESEARCH.md Pattern 5 + prototype JS (Code Examples) | no analog |
| `apps/web/src/app/components/lean-slider/lean-slider.component.ts` | component | request-response | none in-repo — build from RESEARCH.md Pattern 7 + prototype JS | no analog |
| `apps/web/src/app/components/autosize-textarea/autosize-textarea.directive.ts` | utility | transform | none in-repo — build from RESEARCH.md Pattern 6 (prototype JS, 3-line algorithm) | no analog |
| `apps/web/src/app/components/drag-handle/drag-handle.component.ts` | component | event-driven | none in-repo — build from `SPEC-design-system.md` §4.15 | no analog |
| `apps/web/src/app/components/modal/modal.component.ts` | component | event-driven | none in-repo — build from `SPEC-frontend-architecture.md` §8 | no analog |
| `apps/web/src/app/components/add-page-menu/add-page-menu.component.ts` | component | request-response | `apps/web/src/app/pages/library/library-page.component.ts` (list + action-per-row pattern) + `modal.component.ts` (new, this phase) | partial |
| `apps/web/src/app/stores/character.store.ts` (modified: `addPage`, `removePage`, `reorder`, `updatePage`, `availableTypes`, `insertPageAt`) | store | CRUD | existing `updateCore` method in same file (immutable `character.set({...c, ...})` rule) | exact |
| `apps/web/src/app/services/snackbar.service.ts` (modified: `action` on `ShowOptions`) | service | event-driven | existing `show`/`ShowOptions`/`present` in same file | exact |
| `apps/web/src/app/components/snackbar/snackbar.component.html` (modified: render action button) | component | event-driven | existing `dismiss` button in same file (conditional-button-in-toast pattern) | exact |
| `apps/web/src/app/pages/character/character-page.component.ts` / `.html` (modified: mount page list, section nav, add control, empty state) | component | request-response | existing file itself (extend, don't replace — `store.restoring()`/`store.core()` `@if` gating pattern) | exact |
| `packages/schema/src/limits.ts` (modified: add caps if needed) | config | transform | existing constants in same file | exact |
| `apps/web/src/environments/environment.ts` + `environment.development.ts` | config | — | none in-repo (directory doesn't exist yet) — build from RESEARCH.md Pattern 9 / angular.dev `fileReplacements` docs | no analog |
| `apps/web/src/app/integration/reorder-persist.integration.spec.ts` | test | CRUD | `apps/web/src/app/integration/autosave-persist.integration.spec.ts` | exact |
| `apps/web/src/app/integration/intimacy-fill-persist.integration.spec.ts` | test | CRUD | `apps/web/src/app/integration/autosave-persist.integration.spec.ts` | exact |
| `apps/web/src/app/stores/character.store.spec.ts` (extend) | test | CRUD | existing file (extend) | exact |
| `apps/web/src/app/components/meter/meter.component.spec.ts` | test | request-response | `apps/web/src/app/components/character-header/character-header.component.spec.ts` (signal-input component test shape) | role-match |
| `apps/web/angular.json` (modified: `fileReplacements` config for `development`) | config | — | none in-repo — build from angular.dev `fileReplacements` docs (RESEARCH.md Pattern 9) | no analog |

## Pattern Assignments

### `apps/web/src/app/stores/character.store.ts` (store, CRUD) — new methods

**Analog:** same file, existing `updateCore` (lines 82-90) and the constructor's autosave `effect()` (lines 37-64).

**Immutability rule to replicate exactly** (lines 82-90):
```typescript
updateCore(patch: CoreEditPatch): void {
  const c = this.character();
  if (!c) return;
  this.character.set({
    ...c,
    core: { ...c.core, ...patch },
    updatedAt: new Date().toISOString(),
  });
}
```
Every new method (`addPage`, `removePage`, `reorder`, `updatePage`, `insertPageAt`) must follow this exact shape: read `this.character()`, guard on null, build a **new** `pages` array via spread/splice (never `c.pages.push`/`.splice` in place — see the in-code comment on `lastPersisted` reference-identity gating, lines 31-34, 44-46), call `this.character.set({ ...c, pages: newPages, updatedAt: new Date().toISOString() })`. This reference-identity discipline is load-bearing for autosave (RESEARCH.md Pitfall 1) — the existing file's own comments document why.

**`availableTypes()` pattern** — mirror `core`/`pages` as a `computed()`:
```typescript
readonly pages = computed(() => this.character()?.pages ?? []);
// new:
readonly availableTypes = computed(() =>
  Object.values(SCHEMA_REGISTRY).filter((s) => !this.pages().some((p) => p.type === s.type)),
);
```

**Error handling for persistence failures** — reuse the existing `persist()` private method (lines 106-117) unchanged; new mutation methods don't need their own try/catch, they just call `character.set(...)` and let the existing autosave effect + `persist()` handle failures via `this.snackbar.showError(...)`.

---

### `apps/web/src/app/services/snackbar.service.ts` (service, event-driven) — `action` addition

**Analog:** same file, `ShowOptions` interface (lines 12-15) and `present()` (lines 69-74).

**Current shape to extend**:
```typescript
export interface ShowOptions {
  kind?: ToastKind;
  durationMs?: number;
}
```
Add `action?: { label: string; onClick: () => void }` to both `Toast` and `ShowOptions`, matching RESEARCH.md Pattern 8. Do not change `show()`'s signature or the queue/present mechanics (lines 29-67) — this is additive only, per the existing file's `@Injectable({ providedIn: 'root' })` single-slot-queue design.

---

### `apps/web/src/app/components/snackbar/snackbar.component.html` (component template) — action button

**Analog:** same file, the existing conditional dismiss button (lines 10-12):
```html
@if (t.durationMs === 0) {
  <button type="button" class="toast-dismiss ghost" (click)="dismiss()" aria-label="Dismiss">✕</button>
}
```
Add a parallel `@if (t.action; as action)` block rendering `<button type="button" class="toast-action" (click)="onAction(action)">{{ action.label }}</button>` where `onAction` calls `action.onClick()` then `dismiss()` (per RESEARCH.md Pattern 8: "calls `onClick()` then `dismiss()`"). Keep the `role`/`aria-live` attribute pattern (lines 4-7) unchanged — D-06's undo toast is `kind: 'info'` or a new non-error kind, so `aria-live="polite"` already applies via the existing `[attr.aria-live]` binding.

---

### `apps/web/src/app/pages/character/character-page.component.ts` / `.html` (component, request-response) — extend, don't replace

**Analog:** same file. Keep the existing `loadingId` re-entrancy guard (lines 27-32, 34-40) and the `characterCoreSchema.shape.id.safeParse` / `CharacterNotFoundError` / `UnsupportedVersionError` / `InvalidDocumentError` → `rejectLoad()` → snackbar + redirect pattern (lines 47-72) completely unchanged — do not regress it.

**Template `@if` gating convention to extend** (`.html` lines 3-15):
```html
@if (store.restoring()) {
  <p class="loading-line">Loading&hellip;</p>
}
@if (store.core(); as core) {
  <div class="card">
    <cd-character-header [core]="core" (coreChange)="store.updateCore($event)" />
  </div>
  <p class="save-status" role="status" aria-live="polite">
    {{ store.dirty() ? 'Saving…' : 'All changes saved' }}
  </p>
}
```
Mount the section nav, the `@for (page of store.pages(); track page.type)` loop of `SubDocHost`, the D-11 empty-state line, and the D-09 add-page control inside the same `@if (store.core(); as core)` block, after the header card and before/alongside `save-status`. Follow the existing `[core]`/`(coreChange)` signal input/output binding convention for `SubDocHost`'s own inputs/outputs.

---

### `apps/web/src/app/components/character-header/character-header.component.ts` (component, request-response)

**Analog for `IntimacyEditor` and `SubDocHost`:** same file, in full (already the canonical Phase 1 "editor component" pattern per RESEARCH.md's own Pattern 1 citation).

**Signal input/output + immutable emit shape** (lines 17-26):
```typescript
@Component({
  selector: 'cd-character-header',
  imports: [],
  templateUrl: './character-header.component.html',
  styleUrl: './character-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharacterHeader {
  readonly core = input.required<CharacterCore>();
  readonly coreChange = output<CoreFieldPatch>();
```
`IntimacyEditor` must follow this exactly: `data = input.required<IntimacyDossierV1>()`, `mode = input<EditorMode>('edit')`, `dataChange = output<IntimacyDossierV1>()`. Always emit a **new** object (line 50: `this.coreChange.emit({ [field]: cleaned } as CoreFieldPatch)`), never mutate `data()` in place — same reference-identity discipline as the store.

**Cap-import convention** (line 2): `import { type CharacterCore, NAME_MAX, SHORT_TEXT_MAX } from '@dossier/schema';` — Intimacy's editor should import its field caps (`SHORT_TEXT_MAX`/`LONG_TEXT_MAX`) the same way, from `@dossier/schema`, not hardcode numbers.

---

### `packages/schema/src/plugin.ts` + `packages/schema/src/character.ts` (model, transform)

**Analog:** both files, in full — this is where the Intimacy plugin registers.

**`SubDocumentSchema` contract to implement** (`plugin.ts` lines 11-23):
```typescript
export interface SubDocumentSchema<TData> {
  type: string;
  displayName: string;
  description: string;
  adult: boolean;
  currentVersion: string;
  supportedVersions: readonly string[];
  migrations: readonly Migration[];
  schema: ZodType<TData>;
  createDefault(): TData;
  collectImageRefs(data: TData): ImageRef[];
  stripForShare?(data: TData): TData;
}
```
Intimacy's `packages/schema/src/plugins/intimacy/index.ts` builds one object of this shape and the phase's edit to `plugin.ts` populates `SCHEMA_REGISTRY` with it (currently `Object.freeze({})`, line 28, with the comment "Phase 2 adds the first entry" already anticipating this).

**`shortText` validator to reuse** (`character.ts` lines 18-26):
```typescript
export function shortText(max: number) {
  return z.string().trim().max(max, { error: `Must be ${max} characters or fewer` })
    .refine((value) => !CONTROL_CHARS_EXCEPT_LF_TAB.test(value), {
      error: 'Must not contain control characters other than newline and tab',
    });
}
```
Import `shortText` from `character.ts`/`@dossier/schema` for Intimacy's 10 text fields (capped at `SHORT_TEXT_MAX`/`LONG_TEXT_MAX` per `limits.ts`) instead of writing a parallel string validator — this is the established single source for string caps (per CONTEXT.md's `code_context` note on `limits.ts`).

**Migrations: ship `migrations: []`** — per RESEARCH.md Pitfall 3, `character.ts` line 14 already establishes the empty-array-for-single-version convention (`ENVELOPE_MIGRATIONS: readonly Migration[] = []`); Intimacy's `migrations.ts` follows the identical shape, not a one-entry no-op migration.

**Migration walker — do not reimplement**: `packages/schema/src/migrate.ts`'s `migrateSubDocument`/`validateSubDocument`/`validateCharacter` (read in full) already sort migrations defensively (lines 66, comment lines 50-53) and run at the load boundary. Intimacy's plugin registration is consumed by this existing walker unchanged — no new file needed here.

---

### `apps/web/src/app/integration/autosave-persist.integration.spec.ts` (test, CRUD)

**Analog:** same file, in full — model for `reorder-persist.integration.spec.ts` and `intimacy-fill-persist.integration.spec.ts`.

**Real-fake-indexeddb integration test shape** (lines 12-50):
```typescript
describe('autosave persists and survives a reload (real fake-indexeddb, no mocks)', () => {
  it('...', async () => {
    const libraryStore = TestBed.inject(LibraryStore);
    const id = await libraryStore.create();
    const store = TestBed.inject(CharacterStore);
    await store.load(id);
    TestBed.tick();
    store.updateCore({ name: 'Ari' });
    TestBed.tick();
    await vi.waitFor(() => { expect(store.dirty()).toBe(false); }, { timeout: 1000 });
    TestBed.resetTestingModule();
    const freshStore = TestBed.inject(CharacterStore);
    await freshStore.load(id);
    expect(freshStore.core()).toEqual({ /* ... */ });
  });
});
```
For `reorder-persist`, replace `store.updateCore(...)` calls with `store.addPage('intimacy')` × N + `store.reorder(from, to)`, then assert `freshStore.pages().map(p => p.type)` order. For `intimacy-fill-persist`, add a page then call `store.updatePage('intimacy', filledData)`, then assert the reloaded page's `data` deep-equals the filled `IntimacyDossierV1`. Keep the `Object.defineProperty(navigator, 'storage', ...)` `beforeEach` stub (lines 5-10) unchanged — it's shared scaffolding, not per-test.

---

### `apps/web/src/app/pages/library/library-page.component.ts` (component, request-response)

**Analog (partial, for `add-page-menu`):** same file — the "list rows with a per-row action calling a store method, then closing/updating" shape.

**Row-action-to-store-call pattern** (lines 21-35):
```typescript
protected async createCharacter(): Promise<void> {
  const id = await this.store.create();
  void this.router.navigate(['/c', id]);
}
protected deleteCharacter(id: string, name: string): void {
  const label = name || 'Untitled character';
  if (window.confirm(`Delete "${label}"? This cannot be undone.`)) {
    void this.store.remove(id);
  }
}
```
`AddPageMenu`'s row click handler follows the `createCharacter`-style shape (call a store method, then close the picker) — **not** the `deleteCharacter` `window.confirm` shape, which CONTEXT.md's `code_context` explicitly flags as intentionally not reused for page removal (D-06 uses undo, not confirm). `library-page.component.html`'s `@for (character of store.summaries(); track character.id)` list-row structure (lines 21-52) is the template shape to mirror for the picker's list of `store.availableTypes()`.

---

## Shared Patterns

### Store mutation immutability (reference-identity autosave gate)
**Source:** `apps/web/src/app/stores/character.store.ts` lines 31-34, 44-53, 82-90 (in-code comments are load-bearing documentation, not filler — read them)
**Apply to:** Every new `CharacterStore` method (`addPage`, `removePage`, `reorder`, `updatePage`, `insertPageAt`) and the `IntimacyEditor`'s `dataChange` emission. Never `.push`/`.splice` `c.pages` in place; always spread into a new array and a new top-level object.

### Signal input/output component shape
**Source:** `apps/web/src/app/components/character-header/character-header.component.ts` (entire file)
**Apply to:** `IntimacyEditor`, `SubDocHost`, `SectionNav`, `Meter`, `LeanSlider`, `AddPageMenu` — every new component: standalone, `ChangeDetectionStrategy.OnPush`, `input()`/`input.required()`/`output()`, immutable emit.

### Error-class-to-snackbar-and-redirect on load failure
**Source:** `apps/web/src/app/pages/character/character-page.component.ts` lines 47-72 (`CharacterNotFoundError`/`UnsupportedVersionError`/`InvalidDocumentError` → `rejectLoad`)
**Apply to:** No new load path is introduced in Phase 2, but any new store method that can throw (e.g. a future `store.addPage` hitting `PAGES_MAX`) should route failures through `SnackbarService.showError(...)`, matching the existing `persist()` catch block (character.store.ts lines 113-116), not a new ad-hoc alert mechanism.

### Cap constants sourced from `@dossier/schema`
**Source:** `packages/schema/src/limits.ts` (existing constants) + `character-header.component.ts` line 2 (`import { NAME_MAX, SHORT_TEXT_MAX } from '@dossier/schema'`)
**Apply to:** Intimacy's text fields and any new UI component that needs a max-length — import from `limits.ts`, do not hardcode or duplicate a number.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/web/src/app/components/meter/meter.component.ts` | component | request-response | No radiogroup/rating-widget component exists yet anywhere in the project. Build from RESEARCH.md Pattern 5 (reconciled keyboard union) and the prototype JS in RESEARCH.md's Code Examples (`docs/prototype/character-dossier.html:604-627`). |
| `apps/web/src/app/components/lean-slider/lean-slider.component.ts` | component | request-response | No range-slider component exists yet. Build from RESEARCH.md Pattern 7 and prototype JS (`character-dossier.html:556-591`). |
| `apps/web/src/app/components/autosize-textarea/autosize-textarea.directive.ts` | utility | transform | No growing-textarea directive exists yet. Build from RESEARCH.md Pattern 6 (3-line `scrollHeight` technique, verbatim). |
| `apps/web/src/app/components/section-nav/section-nav.component.ts` | component | event-driven | No sticky-nav/scroll-spy component exists yet. Build from CONTEXT.md D-02/D-03/D-04 and `SPEC-design-system.md` §4.2. |
| `apps/web/src/app/components/modal/modal.component.ts` | component | event-driven | No dialog/bottom-sheet shell exists yet. Build from `SPEC-frontend-architecture.md` §8 (focus trap via `@angular/cdk/a11y` `cdkTrapFocus`, per RESEARCH.md Don't-Hand-Roll table). |
| `apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.ts` (the `NgComponentOutlet` wiring specifically) | component | event-driven | No dynamic-component-outlet usage exists yet in this project. Build from RESEARCH.md Pattern 3 / Pitfall 5 (manual `componentInstance.dataChange.subscribe(...)` inside an `effect()` — there is no declarative output binding on `NgComponentOutlet`). |
| `apps/web/src/environments/{environment.ts,environment.development.ts}` + `angular.json` `fileReplacements` config | config | — | Directory does not exist yet (verified via `git ls-files`). Build from RESEARCH.md Pattern 9 / Pitfall 6 — flagged for an execution-time buil

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 21216 bytes -->
