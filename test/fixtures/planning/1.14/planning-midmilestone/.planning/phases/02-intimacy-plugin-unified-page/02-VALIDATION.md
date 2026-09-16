---
phase: "02"
slug: "intimacy-plugin-unified-page"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-14"
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest, via `@angular/build:unit-test` (web) and Vitest (`packages/schema`, `apps/api`) |
| **Config file** | `apps/web/angular.json` (`architect.test`), `apps/web/tsconfig.spec.json`, `apps/web/src/test-setup.ts` |
| **Quick run command** | `pnpm --filter web test` (plus `pnpm --filter @dossier/schema test` for schema-side plugin work) |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter web test` (and `pnpm --filter @dossier/schema test` for schema tasks)
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 02-01 | 1 | CHAR-04, INTM-05 | T-02-01-02, T-02-01-04 | adult flag from registry; no raw-HTML binding | tracer integration | `pnpm --filter @dossier/schema build && pnpm --filter @dossier/schema exec vitest run src/__tests__/fixture-guard.spec.ts && pnpm --filter web exec ng test --watch=false --include=src/app/integration/intimacy-page.integration.spec.ts --include=src/app/pages/character/character-page.component.spec.ts` | ❌ W0 | ⬜ pending |
| 02-01-T2 | 02-01 | 1 | CHAR-04, INTM-02, INTM-03, INTM-05 | T-02-01-01, T-02-01-05, T-02-01-06 | literal scales, code-point caps, hasOwn type lookup, no values in logs | unit | `pnpm --filter @dossier/schema exec vitest run src/__tests__/intimacy.spec.ts src/__tests__/fixture-guard.spec.ts` then `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/stores/character.store.spec.ts` | ❌ W0 | ⬜ pending |
| 02-02-T1 | 02-02 | 1 | DSGN-04, INTM-01 | T-02-02-02 | clamped levels | component | `pnpm --filter web exec ng test --watch=false --include=src/app/components/meter/meter.component.spec.ts` | ❌ W0 | ⬜ pending |
| 02-02-T2 | 02-02 | 1 | INTM-02, INTM-04 | T-02-02-01 | integer-only slider emit | component | `pnpm --filter web exec ng test --watch=false --include=src/app/components/lean-slider/lean-slider.component.spec.ts --include=src/app/components/autosize-textarea/autosize-textarea.directive.spec.ts` | ❌ W0 | ⬜ pending |
| 02-03-T1 | 02-03 | 1 | CHAR-04, CHAR-06 | — | N/A | docs grep | `rg` checks in 02-03 Task 1 verify | ✅ | ⬜ pending |
| 02-03-T2 | 02-03 | 1 | DSGN-04 | — | N/A | docs grep | `rg` checks in 02-03 Task 2 verify | ✅ | ⬜ pending |
| 02-04-T1 | 02-04 | 1 | CHAR-05 | T-02-SC | human confirms package legitimacy | checkpoint (blocking-human) | manual | — | ⬜ pending |
| 02-04-T2 | 02-04 | 1 | CHAR-05 | T-02-SC | core-matched version, no install scripts | build | `node` import check of `@angular/cdk/drag-drop` and `/a11y`, then `pnpm --filter "web..." run build` | ✅ | ⬜ pending |
| 02-05-T1 | 02-05 | 2 | CHAR-04, CHAR-05 | T-02-05-01, T-02-05-03 | same-character restore; bounded reorder indices | unit | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/services/snackbar.service.spec.ts --include=src/app/components/snackbar/snackbar.component.spec.ts --include=src/app/stores/character.store.spec.ts` | ❌ W0 | ⬜ pending |
| 02-05-T2 | 02-05 | 2 | CHAR-05 | — | N/A | component | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/subdocs/subdoc-host/subdoc-host.component.spec.ts` | ❌ W0 | ⬜ pending |
| 02-05-T3 | 02-05 | 2 | CHAR-04, CHAR-05 | T-02-05-01 | undo toasts dismissed on page destroy | component + integration | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/pages/character/character-page.component.spec.ts --include=src/app/integration/reorder-persist.integration.spec.ts` | ❌ W0 | ⬜ pending |
| 02-06-T1 | 02-06 | 2 | INTM-01, INTM-03 | T-02-06-02 | capacity maxlength and control-char strip | component | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/subdocs/intimacy/rating-card/rating-card.component.spec.ts` | ❌ W0 | ⬜ pending |
| 02-06-T2 | 02-06 | 2 | INTM-01, INTM-02, INTM-03, INTM-04 | T-02-06-01 | interpolation-only text | component + integration | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/subdocs/intimacy/intimacy-editor.component.spec.ts --include=src/app/integration/intimacy-fill-persist.integration.spec.ts` | ❌ W0 | ⬜ pending |
| 02-06-T3 | 02-06 | 2 | INTM-01, INTM-02, INTM-03, INTM-04 | T-02-06-01 | view mode renders text as text | component | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/subdocs/intimacy/intimacy-editor.component.spec.ts --include=src/app/subdocs/intimacy/rating-card/rating-card.component.spec.ts` | ❌ W0 | ⬜ pending |
| 02-07-T1 | 02-07 | 3 | CHAR-06 | — | N/A | component | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/components/section-nav/section-nav.component.spec.ts --include=src/app/pages/character/character-page.component.spec.ts` | ❌ W0 | ⬜ pending |
| 02-07-T2 | 02-07 | 3 | CHAR-04 | T-02-07-03 | focus trap with Escape and restore | component | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/components/modal/modal.component.spec.ts --include=src/app/components/add-page-menu/add-page-menu.component.spec.ts --include=src/app/pages/character/character-page.component.spec.ts` | ❌ W0 | ⬜ pending |
| 02-07-T3 | 02-07 | 3 | CHAR-06 | T-02-07-01, T-02-07-02 | preview flag off in production bundle | component + build diff | `ng build --configuration development` + `rg` for enabled flag; `ng build --configuration production` + negative `rg` | ❌ W0 | ⬜ pending |

*Task IDs are filled in by the planner. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/schema/src/plugins/intimacy/{v1.ts,schema.ts,migrations.ts,index.ts,fixtures/1.0.0.json}` — plugin plus fixture; `fixture-guard.spec.ts` starts exercising real coverage (02-01)
- [ ] `packages/schema/src/__tests__/intimacy.spec.ts` — schema edges and adult flag (02-01; under `__tests__` so the tsc build excludes it)
- [ ] `apps/web/src/app/integration/intimacy-page.integration.spec.ts` — tracer: add page, edit, reload through the UI (02-01)
- [ ] `apps/web/src/test-setup.ts` — IntersectionObserver, scrollIntoView, scrollBy stubs for jsdom (02-01)
- [ ] `apps/web/src/app/components/meter/meter.component.spec.ts` — DSGN-04 (02-02)
- [ ] `apps/web/src/app/components/lean-slider/lean-slider.component.spec.ts`, `autosize-textarea.directive.spec.ts` (02-02)
- [ ] `apps/web/src/app/testing/test-plugins.ts` — synthetic `test-notes` type; Phase 2 has one real type (02-05)
- [ ] `apps/web/src/app/services/snackbar.service.spec.ts` (extend), `components/snackbar/snackbar.component.spec.ts` (02-05)
- [ ] `apps/web/src/app/subdocs/subdoc-host/subdoc-host.component.spec.ts` — chrome and `ngComponentOutlet` output wiring (02-05)
- [ ] `apps/web/src/app/stores/character.store.spec.ts` — extend for `addPage`/`updatePage`/`availableTypes` (02-01) and `removePage`/`restorePage`/`reorder` (02-05)
- [ ] `apps/web/src/app/integration/reorder-persist.integration.spec.ts` (02-05) and `intimacy-fill-persist.integration.spec.ts` (02-06)
- [ ] `apps/web/src/app/subdocs/intimacy/rating-card/rating-card.component.spec.ts`, `intimacy-editor.component.spec.ts` (02-06)
- [ ] `apps/web/src/app/components/section-nav/section-nav.component.spec.ts`, `modal/modal.component.spec.ts`, `add-page-menu/add-page-menu.component.spec.ts` (02-07)

*Framework install: none — Vitest tooling exists from Phase 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-and-drop reorder feel | CHAR-05 | Pointer drag gestures are not reliably simulated in unit tests | Drag a page by its handle; reload; confirm order and nav match |
| Screen reader announces meter level word | DSGN-04 | Real AT output cannot be asserted in Vitest | With a screen reader, arrow through a meter; confirm the level word is spoken |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
