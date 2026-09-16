# Phase 2: Intimacy Plugin & Unified Page - Research

**Researched:** 2026-09-14
**Domain:** Angular 22 signals SPA — plugin registry architecture, drag/keyboard reorder, accessible rating-meter widgets, client-side autosave/migration
**Confidence:** HIGH

## Summary

Phase 2 has almost no open design space: `SPEC-intimacy-dossier.md` fixes every field, id, scale and layout; `SPEC-subdocument-plugin-contract.md` fixes the two-registry split and the editor interface; `SPEC-frontend-architecture.md` fixes the store API surface and directory layout; `02-CONTEXT.md` closes the remaining gaps (host chrome, undo-not-confirm removal, nav composition, dev-only view preview). This research therefore focuses on (a) confirming the exact Angular/CDK APIs the specs assume are still current for Angular 22.1, (b) surfacing implementation traps that the specs describe in prose but the code must get exactly right (autosave reference-identity, `NgComponentOutlet` output binding, the ARIA radiogroup "clear to unset" deviation from the standard pattern, fixture-guard rules for a brand-new plugin), and (c) resolving one real inconsistency found between two canonical docs (ADR-0011 vs. the plugin contract checklist, on whether a first-ever plugin version needs a no-op migration entry).

**Primary recommendation:** Build the store, host and plugin registry exactly to `SPEC-subdocument-plugin-contract.md` / `SPEC-frontend-architecture.md` §3 and §6, port the prototype's meter/slider/autosize JS 1:1 into small Angular signal components, add `@angular/cdk` (`^22.1.0`, matching the pinned `@angular/core` range) for `drag-drop` and `a11y`, and treat the CONTEXT.md decisions (D-01…D-14) as locked — do not re-derive alternatives for anything they already settled.

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

**Page frame and section nav**
- D-01: `SubDocHost` renders a slim chapter title bar — plugin icon, `displayName`, 18+ badge, drag handle, ▲ ▼, remove — and **not** an enclosing card. The plugin renders its own content below it. The Intimacy editor keeps the prototype's four separate cards (Anatomy & capacity, Themes, BDSM, Preferences) unchanged. No nested cards. In `view` mode the bar reduces to title + adult badge (per contract).
- D-02: The sticky section nav shows one pill per page **followed by that page's section pills** in a smaller, secondary style (e.g. `[HEADER] [INTIMACY] ·anatomy ·themes ·bdsm ·prefs`). Plugins declare these through a new **optional** `sections` list on the UI-half `SubDocumentPlugin` (label + anchor id). A plugin without `sections` gets only its page pill. Scroll-spy applies to section pills as well. — Reversibility: costly — changes the published plugin contract that Phase 8 types are written against; `SPEC-subdocument-plugin-contract.md` (UI half) and `SPEC-design-system.md` §4.2 must be updated in this phase.
- D-03: Section anchor ids must be unique on the page; namespace them by page type (e.g. `page-intimacy-themes`). `scroll-margin-top` applies to section cards as well as page bars.
- D-04: Nav visibility: shown whenever the character has **at least one page**; hidden only when the character has no pages. This replaces the design-system rule "hidden when there is one page". Still hidden in print. The share-page rule (Phase 3) follows the same logic. `SPEC-design-system.md` §4.2 and `SPEC-frontend-architecture.md` §6 must be updated.
- D-05: Drag-and-drop on tall pages: pressing the drag handle **collapses every page to its title bar** for the duration of the drag; after drop (or cancel) pages expand and the viewport scrolls to the moved page. ▲ ▼ buttons do not collapse anything. Reduced-motion rules from `SPEC-design-system.md` §6 still apply.

**Removing a page**
- D-06: Remove has **no confirm step**. The page is removed immediately and a snackbar shows "<displayName> removed · Undo" for about 8 seconds. Undo re-inserts the page at its original index with its original data. This replaces "remove button with confirm" in the plugin contract's host behaviour. `SnackbarService` gains an action (label + callback) capability.
- D-07: The removal is persisted by the normal autosave path (500 ms debounce) — no pending-removal state. The undo payload lives only in memory; navigating away, reloading, or the snackbar expiring discards it. Undo itself is a normal store mutation and autosaves again.
- D-08: Every removal shows the undo snackbar, including pages still equal to `createDefault()`.

**Add page control**
- D-09: A "+ Add page" button below the last page opens a picker listing `store.availableTypes()` with icon, `displayName`, `description` and 18+ badge. Bottom sheet under 700 px. Selecting a row calls `store.addPage(type)` (appended last) and closes the picker.
- D-10: A new character starts with **no pages**. The adult Intimacy page is never added automatically.
- D-11: When a character has no pages, a muted line "This dossier has no pages yet." sits under the header, above the add control.
- D-12: When every registered type is present, the add control is **hidden** (not disabled). In Phase 2 this happens as soon as Intimacy is added.

**View mode**
- D-13: The Intimacy editor's `view` mode is built **fully in Phase 2** per `SPEC-intimacy-dossier.md` "View mode" and `SPEC-design-system.md` §4.6–4.10 (static meters with level word, empty text fields omitted, unset rating cards at 70% opacity, slider as static track with emphasised word), covered by component specs. The host's view-mode chrome reduction is built too.
- D-14: A **dev-build-only** preview: `/c/:id?mode=view` renders the character page in `view` mode for visual UAT. It must be absent from production builds (compile-time, e.g. environment flag / file replacement), so ADR-0003's "no edit-mode toggle" holds for users.

### Claude's Discretion
- Keyboard focus target after a page is removed and after Undo (e.g. next page's title bar, or the add control when none remain).
- Picker presentation on desktop (anchored popover vs. centered dialog), provided it follows `SPEC-frontend-architecture.md` §8 modal conventions if it is a dialog.
- Meter keyboard mapping: the two specs differ (`SPEC-intimacy-dossier.md`: Space on the checked radio clears; `SPEC-design-system.md` §4.7: Space toggles, Home/End jump, Delete/Backspace clears, focus ring on the group). Implement the union, reconcile the two spec texts, and pick roving-tabindex vs. group focus per current ARIA APG guidance.
- Exact undo snackbar duration (~8 s) and the aria-live wording for reorder announcements ("Intimacy Dossier moved to position 1 of 2").
- How section pills are visually de-emphasised, within the design tokens.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAR-04 | Add a page of any registered type not already present; remove an existing page | Store API pattern (§ Architecture Patterns, Pattern 2), D-09/D-10/D-12, `PAGES_MAX=10` already enforced in `characterSchema` |
| CHAR-05 | Reorder pages by drag-and-drop and keyboard up/down; order persists | CDK `drag-drop` (§ Standard Stack), ▲▼ pattern, `store.reorder` immutable-splice pattern (§ Pitfall 1) |
| CHAR-06 | Header + every page as one continuous document with sticky section nav from pages present | `SectionNav` scroll-spy pattern, D-02/D-03/D-04 |
| INTM-01 | 46 rating cards (11 acts + 10 anatomy + 8 body-focus + 7 themes + 10 BDSM), each 6-level experience + 6-level enjoyment meter, click-current-to-clear | Prototype meter JS ported verbatim (§ Code Examples), `IntimacyDossierV1` shape (verified from spec) |
| INTM-02 | 5-position lean slider (dominant/submissive) and 5-position placement slider (inside/outside), each showing current word | Prototype `buildLean` JS ported verbatim (§ Code Examples) |
| INTM-03 | Oral(giving)/Vaginal/Anal cards carry max-length/max-girth text fields | `CapacityRating` type, `CAPACITY_ACTS` set in schema (verified) |
| INTM-04 | Prototype's 9 free-text fields + relationship-context field; textareas grow with content | `text{}` object in `IntimacyDossierV1`, autosize pattern (§ Code Examples) |
| INTM-05 | Intimacy Dossier type flagged adult | `SubDocumentSchema.adult: true` (contract field, already exists in `packages/schema/src/plugin.ts`) |
| DSGN-04 | Rating meters keyboard-operable as radiogroup, announce selected level word to AT | ARIA APG Rating Radio Group findings (§ Common Pitfalls, Pitfall 4), reconciled keyboard union |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `SCHEMA_REGISTRY` / `PLUGIN_REGISTRY` | Browser/Client | — | Static in-memory registries; no server exists in this phase (API ships Phase 3) |
| Intimacy data validation (Zod schema, migrations) | Browser/Client | Database/Storage | `validateSubDocument`/`validateCharacter` run inside `CharacterRepo.get`/`.put`, at the IndexedDB load boundary, in-browser |
| Page CRUD (add/remove/reorder) | Browser/Client | Database/Storage | `CharacterStore` mutations trigger the existing 500 ms debounced autosave into IndexedDB |
| Section nav / scroll-spy | Browser/Client | — | Pure DOM/IntersectionObserver, no data dependency beyond `pages()` |
| Meter & slider accessibility (DSGN-04) | Browser/Client | — | ARIA semantics and keyboard handling live entirely in the `meter`/`lean-slider` components |
| Undo snackbar (D-06/D-07) | Browser/Client | Database/Storage | In-memory payload; undo is a normal store mutation that re-triggers autosave |
| Adult flag (INTM-05) | Browser/Client (schema declares `adult: true`) | *(Server recompute deferred to Phase 3, GATE-02)* | This phase only needs the flag registered; server-side trust boundary is out of scope |
| Dev-only view-mode preview (D-14) | Build tooling (Angular CLI `fileReplacements`) | Browser/Client | Compile-time absence, not a runtime guard |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@angular/cdk` | `^22.1.0` [VERIFIED: npm registry — `npm view @angular/cdk versions` lists `22.1.6` as latest stable, matching the pinned `@angular/core@^22.1.0` in `apps/web/package.json`] | `drag-drop` (reorder), `a11y` (`LiveAnnouncer`, `cdkTrapFocus` for the add-page dialog/sheet) | Already reserved by ADR-0016 ("the only UI library dependency") and `SPEC-frontend-architecture.md` §9; no substitute considered |
| `zod` | already a dependency of `@dossier/schema` (`4.6.5` on the registry [VERIFIED: npm registry]) — pin whatever `packages/schema/package.json` already resolves, do not bump independently | Intimacy schema validator, `IntimacyDossierV1` inference | Established in Phase 1; `SubDocumentSchema.schema` contract requires a `ZodType` |

No other new runtime dependency is needed. `@dossier/schema`, `CharacterStore`, `SnackbarService`, `CharacterHeader` are all Phase 1 code to extend, not replace.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@angular/cdk/a11y` `LiveAnnouncer` | bundled with `@angular/cdk` | Announce reorder ("Intimacy Dossier moved to position 1 of 2") and meter clear events to AT without hand-writing an `aria-live` region manager | Any point the spec calls for `aria-live="polite"` announcement outside a naturally-live DOM node |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@angular/cdk/drag-drop` | Hand-rolled HTML5 DnD | Rejected by ADR-0003 explicitly: "touch support is the hard part; the CDK carries no Material styling" |
| `@angular/cdk/a11y` `LiveAnnouncer` | A hand-rolled `<div aria-live="polite">` toggled by a service | CDK's version already debounces duplicate announcements and cleans up the DOM node; hand-rolling duplicates a solved problem for one extra dependency already in the stack |

**Installation:**
```bash
pnpm --filter web add @angular/cdk@^22.1.0
```

**Version verification:** `npm view @angular/cdk versions` confirms `22.1.6` is published and current as of research date; it tracks `@angular/core`'s minor version by Angular CDK convention (both packages are released from the same `angular/components`/`angular/angular` train). No separate `pip`/`cargo` verification applies — this is a pure Angular monorepo phase.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@angular/cdk` | npm | latest version published 2026-09-09 (5 days before this research); package itself is the official Angular team's Component Dev Kit, part of `angular/components` since 2017 | 2,865,998/week [VERIFIED: `gsd_run query package-legitimacy check`] | `github.com/angular/components` [VERIFIED: `gsd_run query package-legitimacy check`] | SUS (flagged "too-new" — the *latest patch* is 5 days old, not the package) | Approved — false-positive on the "too-new" heuristic; this is the official Angular monorepo package, already the app's designated UI dependency per ADR-0016, published under the same cadence as `@angular/core` (already in use at `22.1.x`). No `checkpoint:human-verify` needed; the planner may note the seam's SUS verdict for audit-trail completeness but should not gate the install behind human review. |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@angular/cdk` — see disposition above (verdict overridden with justification, not a checkpoint).

## Architecture Patterns

### System Architecture Diagram

```
                          CharacterPage (route: /c/:characterId)
                                     |
                                     v
                          CharacterStore.load(id) ---------> CharacterRepo.get(id) --> IndexedDB
                                     |                              |
                                     |                    validateCharacter() (migrate -> Zod parse)
                                     v
        +----------------------------------------------------------------------+
        |  store.core()      store.pages()        store.availableTypes()       |
        +----------------------------------------------------------------------+
              |                    |                           |
              v                    v                           v
       CharacterHeader      SectionNav                 AddPageMenu (D-09)
       (core, view/edit)    (built from pages(),        picker of SCHEMA_REGISTRY
                             D-02 section pills,         minus present types
                             D-04 visibility)                  |
                                                                v
                                                     store.addPage(type)
                                                     -> SCHEMA_REGISTRY[type].createDefault()
                                                     -> pages.push(new envelope)  [new array ref]
                                     |
                                     v
              @for (page of store.pages(); track page.type)
                                     |
                                     v
                    SubDocHost [page] [mode] [index] [count]
                       title bar: icon, displayName, 18+ badge,
                       drag handle (CDK cdkDrag), ▲▼, remove (D-06)
                                     |
                          @defer (on viewport) { ngComponentOutlet }
                                     |
                                     v
                    await PLUGIN_REGISTRY[type].load()  (lazy chunk)
                                     |
                                     v
                       SubDocumentEditor<TData>  (IntimacyEditor)
                       data=[migrated,validated data]  mode=edit|view
                       emits dataChange (new immutable object)
                                     |
                       (no declarative output binding on
                        NgComponentOutlet -- host subscribes
                        to componentInstance.dataChange, see
                        Pitfall 5)
                                     v
                    SubDocHost calls store.updatePage(type, next)
                                     |
                                     v
                    CharacterStore: character.set({...c, pages: [...new array with
                                    the one page replaced]})
                                     |
                                     v
                    existing autosave effect (500ms debounce) -> repo.put()
                                     |
                                     v
                                 IndexedDB

  Remove path (D-06/D-07):
    remove button -> store.removePage(type)  [splice into new array, autosaves]
                  -> SnackbarService.show("<name> removed", {action: {label:'Undo', onClick: ...}})
                  -> Undo callback holds {index, envelope} captured before removal, in memory only
                  -> Undo click -> store.insertPageAt(index, envelope) [new array, autosaves again]

  Reorder path (CHAR-05):
    drag handle (cdkDragHandle) -> cdkDropList (dropped) -> moveItemInArray()  -> store.reorder(from,to)
    ▲ / ▼ buttons               -> store.reorder(i, i-1 | i+1)  [no CDK involvement]
    both -> LiveAnnouncer.announce("<name> moved to position N of M")
```

### Recommended Project Structure
Exactly as `SPEC-frontend-architecture.md` §1 lays out (verified — matches the existing `apps/web/src/app/` tree read this session, which currently has no `subdocs/`, `components/section-nav/`, `components/meter/`, `components/lean-slider/`, `components/autosize-textarea/`, `components/drag-handle/`, `components/modal/`, or `src/environments/`):

```
apps/web/src/
  environments/{environment.ts,environment.development.ts}   # new — needed for D-14
  app/
    subdocs/
      plugin.ts                    # SubDocumentPlugin, SubDocumentEditor, PLUGIN_REGISTRY
      subdoc-host/                 # SubDocHost — title bar, drag handle, up/down, remove
      intimacy/
        intimacy-editor.component.ts|html|scss|spec.ts
        index.ts                   # SubDocumentPlugin registration, load(): dynamic import
    components/
      section-nav/                 # sticky pill nav, scroll-spy, D-02 section pills
      meter/                       # rating meter (dots/hearts), radiogroup (DSGN-04)
      lean-slider/                 # dominant/submissive + inside/outside sliders
      autosize-textarea/           # grow-with-content textarea directive/component
      drag-handle/                 # 24x24 six-dot glyph + ▲▼ pair
      modal/                       # base dialog/bottom-sheet shell (needed now for D-09's picker;
                                    # reused by Phase 3 share dialog, Phase 6 print dialog)
      add-page-menu/                # D-09 picker
packages/schema/src/
  plugins/intimacy/
    v1.ts            # Level, Lean, Rating, CapacityRating, Id unions, IntimacyDossierV1, createDefault
    schema.ts         # Zod schema mirroring v1.ts
    migrations.ts      # empty array — see Pitfall 3 on ADR-0011 vs. the contract checklist
    index.ts           # SubDocumentSchema object; register in SCHEMA_REGISTRY
    fixtures/1.0.0.json # fully populated fixture (fixture-guard requires it)
```

### Pattern 1: Editor implements `SubDocumentEditor<TData>` with one template, two modes
**What:** One `IntimacyEditor` component, `data = input.required<IntimacyDossierV1>()`, `mode = input<EditorMode>('edit')`, `dataChange = output<IntimacyDossierV1>()`. Template branches per-field with `@if (mode() === 'edit') { <input> } @else { <span> }` (or per-widget components that take `mode` themselves, e.g. the `meter` component renders static dots in view mode).
**When to use:** Every plugin editor, per the contract ("One component renders both modes").
**Example (mirrors the existing `CharacterHeader` pattern read this 

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 61114 bytes -->
