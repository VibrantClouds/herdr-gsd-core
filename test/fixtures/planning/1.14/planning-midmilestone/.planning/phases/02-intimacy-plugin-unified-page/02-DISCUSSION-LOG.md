# Phase 2: Intimacy Plugin & Unified Page - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-14
**Phase:** 02-intimacy-plugin-unified-page
**Areas discussed:** Page frame + nav, Remove a page, Add page control, View mode timing

---

## Page frame + nav

### How should the Intimacy page sit inside the page host?

| Option | Description | Selected |
|--------|-------------|----------|
| Chapter bar + 4 cards | Slim host title bar; prototype's 4 cards unchanged below | ✓ |
| One card, subheads inside | One big host card; 4 cards become h3 sections | |
| Host card, nested cards | Outer host card containing the 4 cards | |

### What should the sticky section nav show?

| Option | Description | Selected |
|--------|-------------|----------|
| Pages + their sections | Page pills plus smaller section pills; optional `sections` on the UI-half contract | ✓ |
| Page pills only, per spec | One pill per page; no jumping within Intimacy | |
| Sections when one page | Sections with one page, page pills with 2+ | |

### How should drag-and-drop work with tall pages?

| Option | Description | Selected |
|--------|-------------|----------|
| Collapse while dragging | All pages shrink to title bars during drag | ✓ |
| CDK default, full height | Drag full page with auto-scroll | |

### When should the sticky section nav be visible?

| Option | Description | Selected |
|--------|-------------|----------|
| When 1+ page exists | Hidden only with no pages | ✓ |
| When 2+ pages exist | Current spec rule; never visible in Phase 2 | |

**User's choice:** All recommended options.
**Notes:** D-02 and D-04 change SPEC-subdocument-plugin-contract, SPEC-design-system §4.2 and SPEC-frontend-architecture §6.

---

## Remove a page

### How should the app protect against a wrong tap?

| Option | Description | Selected |
|--------|-------------|----------|
| Undo snackbar | Remove at once; ~8 s "removed · Undo" | ✓ |
| window.confirm | Same as library delete | |
| Styled confirm dialog | Build modal component now | |

### When does the removal get saved?

| Option | Description | Selected |
|--------|-------------|----------|
| Save at once | Normal autosave; undo re-adds from memory | ✓ |
| Save when the snackbar ends | Pending-removal state | |

### Should an untouched page still use the undo snackbar?

| Option | Description | Selected |
|--------|-------------|----------|
| Always the same | Every removal shows undo | ✓ |
| Skip for untouched pages | Silent removal when equal to createDefault() | |

**User's choice:** All recommended options.

---

## Add page control

| Question | Options | Selected |
|----------|---------|----------|
| Control shape | Button opens picker / Inline row of type buttons | Button opens picker |
| New character pages | No pages / Auto-add Intimacy | No pages |
| No-pages state | Hint + add button / Add button only | Hint + add button |
| All types added | Hide it / Show disabled with note | Hide it |

**User's choice:** All recommended options.

---

## View mode timing

| Question | Options | Selected |
|----------|---------|----------|
| When to build view mode | Build + test now / Stub, finish in Phase 3 | Build + test now |
| How to see it before Phase 3 | Dev-only preview flag / Component specs only | Dev-only preview flag |

**User's choice:** All recommended options.

---

## Claude's Discretion

- Focus target after remove and after Undo
- Picker presentation on desktop
- Meter keyboard mapping (reconcile SPEC-intimacy-dossier vs SPEC-design-system §4.7)
- Undo duration and reorder announcement wording
- Visual de-emphasis of section pills

## Deferred Ideas

None.
