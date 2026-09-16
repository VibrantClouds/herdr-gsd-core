---
phase: 02-intimacy-plugin-unified-page
reviewed: 2026-09-14T16:55:44Z
depth: standard
files_reviewed: 55
files_reviewed_list:
  - apps/web/angular.json
  - apps/web/package.json
  - apps/web/src/app/components/add-page-menu/add-page-menu.component.html
  - apps/web/src/app/components/add-page-menu/add-page-menu.component.scss
  - apps/web/src/app/components/add-page-menu/add-page-menu.component.spec.ts
  - apps/web/src/app/components/add-page-menu/add-page-menu.component.ts
  - apps/web/src/app/components/autosize-textarea/autosize-textarea.directive.spec.ts
  - apps/web/src/app/components/autosize-textarea/autosize-textarea.directive.ts
  - apps/web/src/app/components/drag-handle/drag-handle.component.html
  - apps/web/src/app/components/drag-handle/drag-handle.component.scss
  - apps/web/src/app/components/drag-handle/drag-handle.component.ts
  - apps/web/src/app/components/icon/icon.component.html
  - apps/web/src/app/components/icon/icon.component.ts
  - apps/web/src/app/components/lean-slider/lean-slider.component.html
  - apps/web/src/app/components/lean-slider/lean-slider.component.scss
  - apps/web/src/app/components/lean-slider/lean-slider.component.spec.ts
  - apps/web/src/app/components/lean-slider/lean-slider.component.ts
  - apps/web/src/app/components/meter/meter.component.html
  - apps/web/src/app/components/meter/meter.component.scss
  - apps/web/src/app/components/meter/meter.component.spec.ts
  - apps/web/src/app/components/meter/meter.component.ts
  - apps/web/src/app/components/modal/modal.component.html
  - apps/web/src/app/components/modal/modal.component.scss
  - apps/web/src/app/components/modal/modal.component.spec.ts
  - apps/web/src/app/components/modal/modal.component.ts
  - apps/web/src/app/components/section-nav/section-nav.component.html
  - apps/web/src/app/components/section-nav/section-nav.component.scss
  - apps/web/src/app/components/section-nav/section-nav.component.spec.ts
  - apps/web/src/app/components/section-nav/section-nav.component.ts
  - apps/web/src/app/components/snackbar/snackbar.component.html
  - apps/web/src/app/components/snackbar/snackbar.component.scss
  - apps/web/src/app/components/snackbar/snackbar.component.spec.ts
  - apps/web/src/app/components/snackbar/snackbar.component.ts
  - apps/web/src/app/integration/intimacy-fill-persist.integration.spec.ts
  - apps/web/src/app/integration/intimacy-page.integration.spec.ts
  - apps/web/src/app/integration/reorder-persist.integration.spec.ts
  - apps/web/src/app/pages/character/character-page.component.html
  - apps/web/src/app/pages/character/character-page.component.scss
  - apps/web/src/app/pages/character/character-page.component.spec.ts
  - apps/web/src/app/pages/character/character-page.component.ts
  - apps/web/src/app/pages/character/view-mode-preview.ts
  - apps/web/src/app/services/snackbar.service.spec.ts
  - apps/web/src/app/services/snackbar.service.ts
  - apps/web/src/app/stores/character.store.spec.ts
  - apps/web/src/app/stores/character.store.ts
  - apps/web/src/app/subdocs/intimacy/index.ts
  - apps/web/src/app/subdocs/intimacy/intimacy-editor.component.html
  - apps/web/src/app/subdocs/intimacy/intimacy-editor.component.scss
  - apps/web/src/app/subdocs/intimacy/intimacy-editor.component.spec.ts
  - apps/web/src/app/subdocs/intimacy/intimacy-editor.component.ts
  - apps/web/src/app/subdocs/intimacy/intimacy-vocabulary.ts
  - apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.html
  - apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.scss
  - apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.spec.ts
  - apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.ts
  - apps/web/src/app/subdocs/plugin-outlet/plugin-outlet.component.html
  - apps/web/src/app/subdocs/plugin-outlet/plugin-outlet.component.ts
  - apps/web/src/app/subdocs/plugin.ts
  - apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.html
  - apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.scss
  - apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.spec.ts
  - apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.ts
  - apps/web/src/app/testing/test-plugins.ts
  - apps/web/src/environments/environment.development.ts
  - apps/web/src/environments/environment.ts
  - apps/web/src/test-setup.ts
  - docs/specs/SPEC-design-system.md
  - docs/specs/SPEC-frontend-architecture.md
  - docs/specs/SPEC-intimacy-dossier.md
  - docs/specs/SPEC-subdocument-plugin-contract.md
  - packages/schema/src/index.ts
  - packages/schema/src/plugin.ts
  - packages/schema/src/plugins/intimacy/index.ts
  - packages/schema/src/plugins/intimacy/migrations.ts
  - packages/schema/src/plugins/intimacy/schema.ts
  - packages/schema/src/plugins/intimacy/v1.ts
  - packages/schema/src/plugins/intimacy/fixtures/1.0.0.json
  - packages/schema/src/__tests__/intimacy.spec.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-09-14T16:55:44Z
**Depth:** standard
**Files Reviewed:** 55 source/test files (+4 spec docs read for contract reference)
**Status:** issues_found

## Summary

Reviewed the intimacy plugin + unified character page implementation: the `@dossier/schema` intimacy plugin (schema, v1 types/defaults, migrations, fixture), the generic subdocument plugin-loading pipeline (`plugin.ts`, `plugin-outlet`, `subdoc-host`), the intimacy editor and its supporting UI primitives (meter, lean-slider, rating-card, autosize-textarea), the page-chrome components (section-nav, add-page-menu, modal, snackbar), the `CharacterStore` autosave/reorder/undo logic, and `CharacterPage`'s drag-to-reorder and add/remove/undo orchestration, plus the associated unit and integration specs.

The schema package is solid: validation boundaries, control-character stripping, and default-object independence are all covered by tests and match the implementation. The bulk of the UI code is careful about a11y (`role=radiogroup`/`radio`, live regions, focus restoration) and about not leaking sensitive intimacy data into `console.error`/toast arguments — confirmed by a dedicated privacy-focused spec.

Four findings surfaced, all in `CharacterStore`, `CharacterPage`, and `PluginOutlet` — none of them exercised by the existing test suite, which is why they weren't caught:

1. A stuck "Saving…" status after a persist failure (no failure state, no retry) — misleading UI.
2. A generic race condition in the dynamic plugin loader that isn't reachable by today's single-plugin-per-host usage but is a latent defect in reusable, general-purpose code.
3. Singleton (not per-pointer) drag-arm state that can leak `document` listeners and corrupt collapse state under overlapping pointer presses (multi-touch).
4. Unbounded growth of an in-memory undo-toast-id set for the life of the page component.

No critical/security issues were found in this diff: no `innerHTML`/`eval`, no hardcoded secrets, and all user text passes through the schema's control-character and length validation before persistence.

## Warnings

### WR-01: Autosave failure leaves "Saving…" status displayed indefinitely

**File:** `apps/web/src/app/stores/character.store.ts:181-192`
**Issue:** `persist()` catches a `repo.put` rejection, shows a one-time error toast, and logs the error — but never clears `dirty` (which was set `true` by the debounce effect before `persist` ran) or otherwise surfaces a distinct failure state. `character-page.component.html:70-72` renders `store.dirty() ? 'Saving…' : 'All changes saved'`, so after a single failed write the status line reads "Saving…" forever, even though the toast (easy to miss or already dismissed) is the only failure signal and no further write is attempted until the user makes another edit. This contradicts the "Saving…"/"All changes saved" binary the UI presents and can mislead a user into believing an in-progress save will complete when it has already permanently failed for that session.
**Fix:**
```ts
// character.store.ts
readonly saveFailed = signal(false);

private async persist(c: Character): Promise<void> {
  try {
    await this.repo.put(c);
    this.lastPersisted = c;
    if (this.character() === c) {
      this.dirty.set(false);
      this.saveFailed.set(false);
    }
  } catch (err) {
    this.saveFailed.set(true);
    this.snackbar.showError('Your latest changes could not be saved. They are still in this tab.');
    console.error('[CharacterStore]', err);
  }
}
```
```html
<!-- character-page.component.html -->
<p class="save-status" role="status" aria-live="polite">
  {{ store.saveFailed() ? 'Not saved — check your connection' : store.dirty() ? 'Saving…' : 'All changes saved' }}
</p>
```

### WR-02: `PluginOutlet` has no guard against out-of-order `load()` resolution

**File:** `apps/web/src/app/subdocs/plugin-outlet/plugin-outlet.component.ts:36-48`
**Issue:** The constructor `effect()` reads `this.plugin()` and calls `plugin.load().then((type) => this.editorType.set(type))` with no token/generation check. `PluginOutlet.plugin` is a public `input.required<SubDocumentPlugin<unknown>>()` per the `SubDocumentEditor`/`PluginOutlet` contract, so nothing prevents a future caller from swapping the bound plugin on a live instance (e.g. a `@for` track strategy change, or a host that recycles the outlet across a different page type). If plugin A's `.load()` is still pending when the input changes to plugin B and B's import resolves first, A's promise can resolve afterward and overwrite `editorType` with the wrong component — silently rendering the wrong editor for the currently-bound `data`/`mode` inputs. Today's only call site (`subdoc-host.component.html`, `@for (... track page.type)`) happens not to trigger this because each host keeps a stable `page.type` for its lifetime, but that is an accidental property of the caller, not something `PluginOutlet` itself guarantees.
**Fix:**
```ts
private loadToken = 0;

constructor() {
  effect(() => {
    const plugin = this.plugin();
    const token = REDACTED;
    this.loadFailed.set(false);
    plugin
      .load()
      .then((type) => {
        if (token !== this.loadToken) return; // superseded by a newer plugin() value
        this.editorType.set(type);
      })
      .catch((err: unknown) => {
        if (token !== this.loadToken) return;
        console.error('[PluginOutlet] failed to load', plugin.schema.type, err);
        this.loadFailed.set(true);
      });
  });
  ...
}
```

### WR-03: Drag-arm state is a single shared field, not per-pointer

**File:** `apps/web/src/app/pages/character/character-page.component.ts:85-86, 115-145`
**Issue:** `armDrag()` unconditionally overwrites the single instance fields `dragStarted` and `detachPointerListeners`, and attaches new `pointerup`/`pointercancel` listeners to `document` every time it's called. If a second `dragArmed` fires (e.g. two pointers pressing two different drag handles in close succession on a touch device) before the first pointer's `pointerup`/`pointercancel`/`cdkDragEnded` arrives, the second `armDrag()` call clobbers `this.detachPointerListeners`, permanently orphaning the first pair of `document` listeners (they're never removed — a listener leak), and `this.dragStarted` becomes a single boolean shared between two independent in-flight interactions, so `onPointerUp` can call `endDrag()` for the wrong page type or skip it entirely. Separately, if a pointer is released outside the browser window/tab (no `pointerup`/`pointercancel` delivered to `document`), `dragging()` and the collapsed page list can get stuck until the next successful drag cycle resets it.
**Fix:** Guard against re-entrant arming, and track cleanup on a per-arm basis instead of assuming a single global one:
```ts
protected armDrag(type: string): void {
  if (this.dragging()) return; // a drag is already armed/in progress; ignore concurrent pointerdown
  ...
}
```
This closes the multi-pointer corruption/leak path; the window-blur edge case is lower priority but worth a tracked follow-up (e.g. also listening for `pointerdown` capture reset via `blur`/`visibilitychange`).

## Info

### IN-01: `undoToastIds` grows for the lifetime of the page component

**File:** `apps/web/src/app/pages/character/character-page.component.ts:92, 178-202`
**Issue:** Every `onRemove()` call adds the new toast's id to `undoToastIds` (line 189) so it can be force-dismissed in `ngOnDestroy`, but ids are never removed once the toast naturally times out, is dismissed, or its undo action runs — only `onDestroy` iterates and dismisses (harmlessly, since `SnackbarService.dismiss()` on an already-gone id is a no-op) whatever has accumulated. Over a long editing session with many remove/undo cycles this set grows unbounded for no functional benefit, since at most one toast is ever "current" at a time.
**Fix:** Either cap the set to the current toast/queue contents (e.g. have `SnackbarService.show` accept an `onDismiss` callback that self-removes from the set) or, simpler, drop the tracking Set entirely and just call `this.snackbar.dismiss()` with no id in `onDestroy` (per the service's own docstring, no-id dismisses whatever is current) — the `undo` action itself doesn't need to survive component destruction anyway.

---

_Reviewed: 2026-09-14T16:55:44Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
