---
phase: "04"
slug: "images"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-15"
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase` from `04-RESEARCH.md` § Validation Architecture.
> The Per-Task Verification Map is populated by `/gsd-validate-phase` once plans exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^4.0.8` (web tests run through the `@angular/build:unit-test` builder, which uses Vitest) |
| **Config file** | `apps/web/angular.json` (`test` target); `apps/api/vitest.config.ts`; `packages/schema/vitest.config.ts` |
| **Quick run command** | `pnpm --filter web test` / `pnpm --filter api test` / `pnpm --filter @dossier/schema test` (package-scoped to the package touched) |
| **Full suite command** | `pnpm test` (root script — builds `@dossier/schema` first, then runs all package tests) |
| **Estimated runtime** | ~60 seconds (full suite; package-scoped runs are a few seconds) |

---

## Sampling Rate

- **After every task commit:** Run the package-scoped quick run command for the package touched
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green, plus both human-checkpoint plans (D-01 AWS setup, D-04 live phone+desktop smoke) completed
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *pending* | — | — | — | — | — | — | — | — | ⬜ pending |

*Populated by `/gsd-validate-phase` from the finalized `04-*-PLAN.md` `<verify><automated>` blocks.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirement → Test Map (from research)

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GALL-01 | Add/caption/reorder/remove gallery items | unit + integration | `pnpm --filter web exec vitest run src/app/subdocs/gallery` | ❌ Wave 0 |
| GALL-02 | Compression ladder produces WebP under target size, EXIF stripped | unit | `pnpm --filter web exec vitest run src/app/images/image-pipeline-core.spec.ts` | ❌ Wave 0 |
| GALL-03 | Same hash → single IndexedDB row across characters | integration | `pnpm --filter web exec vitest run src/app/integration/gallery-dedup.integration.spec.ts` | ❌ Wave 0 |
| GALL-04 | Portrait renders through same pipeline, header UI | unit | `pnpm --filter web exec vitest run src/app/components/character-header` | ✅ existing, needs Phase 4 additions |
| IMG-01 | Publish uploads only missing hashes, concurrency 3, retries | integration | `pnpm --filter web exec vitest run src/app/integration/publish-snapshot-share.integration.spec.ts` | ✅ existing, needs extension |
| IMG-02 | Server rejects hash/type/size/dimension violations | unit | `pnpm --filter api exec vitest run src/routes/images.spec.ts` | ❌ Wave 0 |
| IMG-03 | Server refuses share with missing/oversized images | unit | `pnpm --filter api exec vitest run src/routes/shares.spec.ts` | ✅ existing — verify coverage, do not assume complete |
| SHARE-11 | Size estimate UI, budget refusal, no network on failure | unit | `pnpm --filter web exec vitest run src/app/components/section-selector` | ✅ existing, needs extension |

---

## Wave 0 Requirements

- [ ] `apps/web/src/app/images/image-pipeline-core.spec.ts` — pure-function compression math (quality ladder, edge fallback, hash over a fixed test blob) — GALL-02
- [ ] `apps/web/src/app/images/image-pipeline.worker.spec.ts` — worker-testing harness (Vitest workers typically need `?worker` import suffixing or a Worker polyfill) — GALL-02
- [ ] `apps/web/src/app/subdocs/gallery/gallery-editor.component.spec.ts` — GALL-01
- [ ] `apps/web/src/app/integration/gallery-dedup.integration.spec.ts` — GALL-03
- [ ] `apps/api/src/routes/images.spec.ts` — one case per row of `SPEC-share-api.md` §4.6 check-order table (size, blocklist, magic bytes ×3, dimensions, hash mismatch, idempotent retry) — IMG-02
- [ ] `packages/schema/src/__tests__/fixture-guard.spec.ts` — already exists; auto-covers the new `gallery` plugin and the envelope version bump once both are registered (no new file)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AWS S3 + CloudFront image-CDN setup (D-01) | IMG-01, IMG-02 | Requires live AWS console/credentials; not reproducible in CI | Human checkpoint plan — bucket `character-dossier` (us-west-2), ACM certificate requested in `us-east-1` for CloudFront |
| Live phone + desktop image smoke (D-04) | GALL-01, GALL-02, GALL-04 | Real camera-sourced photos, real device memory limits, real network | Human checkpoint plan — add a phone photo to a gallery and a portrait on both a phone and a desktop browser |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
