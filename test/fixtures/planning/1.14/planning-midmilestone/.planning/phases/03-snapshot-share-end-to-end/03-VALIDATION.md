---
phase: "03"
slug: "snapshot-share-end-to-end"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-14"
validated: "2026-09-16"
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.8 — `packages/schema` (plain Vitest), `apps/api` (plain Vitest; routes exercised through Hono `app.request` against `MemoryObjectStore`, new in 03-01-02), `apps/web` (`@angular/build:unit-test`) |
| **Config file** | `packages/schema/vitest.config.ts` (existing); `apps/api/vitest.config.ts` (none — created by 03-01-02); `apps/web/angular.json` `test` target (existing) |
| **Quick run command** | `pnpm --filter @dossier/schema exec vitest run <spec>` · `pnpm --filter api exec vitest run <spec>` · `pnpm --filter web exec ng test --watch=false --include=<spec>` |
| **Full suite command** | `pnpm --filter "web..." run build && pnpm test` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick-run command matching the package(s) touched (schema / api / web)
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** `pnpm typecheck && pnpm test` green at workspace root, plus the `SPEC-deployment.md` §7 deploy checklist
- **Max feedback latency:** 90 seconds
- **Docker and live checks** (03-03-02 MinIO, 03-03-03 container build, 03-07-02 real S3, 03-08-02 and 03-08-03 live deploy) exceed that latency; they run only at their own task, never per commit.

---

## Per-Task Verification Map

One row per planned task. Pass/fail conditions (`<fails_when>`) live in each task's `<verify>` in its PLAN.md. Commands tagged `[Cn]` contain shell pipes and are reproduced verbatim under *Long-form commands*.

File Exists: ✅ exists today · ❌ W0 written test-first by this task · ← `03-PP-TT` created by that earlier task · — no file (checkpoint or inline command).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | SHARE-01, SHARE-06, GATE-02 | T-03-01-SC | No install until a human confirms hono, @aws-sdk/client-s3, tsx and @types/node | manual (checkpoint:human-verify, blocking-human) | — | — | ☑️ manual |
| 03-01-02 | 01 | 1 | SHARE-01, SHARE-06, GATE-02 | T-03-01-01, T-03-01-02, T-03-01-03, T-03-01-04, T-03-01-05, T-03-01-06 | Server-computed adult overrides client false; only the token hash is stored; malformed id is 404; `constructor` page type is 422 not 500; share page renders by interpolation with zero form controls | tracer: built-output smoke + route integration + web unit | `pnpm --filter @dossier/schema build && pnpm --filter api run build && pnpm --filter api run smoke`<br>`pnpm --filter api exec vitest run src/__tests__/shares.route.spec.ts`<br>`pnpm --filter web exec ng test --watch=false --include=src/app/pages/share/share-page.component.spec.ts --include=src/app/components/character-header/character-header.component.spec.ts --include=src/app/pages/character/character-page.component.spec.ts` | ❌ W0 `smoke.mjs`, `shares.route.spec.ts`, `share-page.component.spec.ts` · ✅ `character-header.component.spec.ts`, `character-page.component.spec.ts` | ✅ green |
| 03-02-01 | 02 | 2 | GATE-02 | — | computeAdult false for unknown and `constructor` types; versions checked before shape; input never mutated | unit (schema, TDD) | `pnpm --filter @dossier/schema exec vitest run src/__tests__/compute-adult.spec.ts src/__tests__/migrate.spec.ts src/__tests__/share.spec.ts` | ❌ W0 `compute-adult.spec.ts` · ✅ `migrate.spec.ts`, `share.spec.ts` | ✅ green |
| 03-02-02 | 02 | 2 | SHARE-01, SEC-04 | T-03-02-02, T-03-02-03, T-03-02-05, T-03-02-06 | 413 before JSON parse; nothing written on any rejection; collision never overwrites; no collection GET; unknown or malformed id is 404 | route integration + unit (TDD) | `pnpm --filter @dossier/schema build && pnpm --filter api exec vitest run src/__tests__/shares.route.spec.ts src/__tests__/tokens.spec.ts` | ← 03-01-02 `shares.route.spec.ts` · ❌ W0 `tokens.spec.ts` | ✅ green |
| 03-02-03 | 02 | 2 | SEC-04, OPS-01, SHARE-01 | T-03-02-01, T-03-02-04, T-03-02-07, T-03-02-08 | CORS exact-match on APP_ORIGIN (trailing slash, scheme, port, www refused); nosniff and no-referrer on every response; `/healthz` 200; ConfigError names keys, never values; logs carry the route pattern only | route unit (TDD) + api typecheck and suite | `pnpm --filter @dossier/schema build && pnpm --filter api exec vitest run src/__tests__/cors.spec.ts src/__tests__/healthz.spec.ts src/__tests__/config.spec.ts src/__tests__/logging.spec.ts`<br>`pnpm --filter api run typecheck && pnpm --filter api run test` | ❌ W0 `cors.spec.ts`, `healthz.spec.ts`, `config.spec.ts`, `logging.spec.ts` | ✅ green |
| 03-03-01 | 03 | 2 | SEC-04 | T-03-03-01, T-03-03-03, T-03-03-04 | `IfNoneMatch '*'` on every create (412/409 means false); 403 on get/head means null; no list command | unit with fake S3 client (TDD) | `pnpm --filter @dossier/schema build && pnpm --filter api exec vitest run src/__tests__/s3.spec.ts` | ❌ W0 `s3.spec.ts` | ✅ green |
| 03-03-02 | 03 | 2 | OPS-01, SEC-04 | T-03-03-01, T-03-03-02, T-03-03-03 | Conditional put refused against MinIO; `.env` git-ignored; server exits non-zero naming missing keys; `pnpm test` needs no Docker | MinIO integration (opt-in) + boot check + api suite | `pnpm run minio:up && pnpm --filter @dossier/schema build && RUN_S3_INTEGRATION=1 S3_ENDPOINT=http://localhost:9000 S3_BUCKET=character-dossier-dev S3_REGION=us-east-1 AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin pnpm --filter api exec vitest run src/__tests__/s3.integration.spec.ts`<br>[C1] boot check<br>`pnpm --filter api exec vitest run` | ❌ W0 `s3.integration.spec.ts`, `docker-compose.yml` (`minio:up`) | ✅ green |
| 03-03-03 | 03 | 2 | OPS-01 | T-03-03-02, T-03-03-05, T-03-03-06 | Image runs as `USER node`; `.dockerignore` excludes `.env`; container refuses to boot without env; railway.json health check `/healthz` | container smoke (Docker) | `pnpm run minio:up && node apps/api/scripts/container-smoke.mjs` | ❌ W0 `container-smoke.mjs` | ✅ green |
| 03-04-01 | 04 | 2 | SHARE-01 | T-03-04-01, T-03-04-02, T-03-04-04 | Owner token kept in the shares row (D-08) and absent from console args; recordSaved false is surfaced; 524288-byte budget enforced before fetch | web unit (TDD) | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/services/share.repo.spec.ts --include=src/app/stores/share.store.spec.ts` | ❌ W0 `share.repo.spec.ts`, `share.store.spec.ts` | ✅ green |
| 03-04-02 | 04 | 2 | SHARE-01 | T-03-04-03, T-03-04-05 | Every page row shown with its 18+ badge; only checked types emitted, in page order; header row fixed (D-01, D-02, D-03) | web unit (TDD) | `pnpm --filter web exec ng test --watch=false --include=src/app/components/section-selector/section-selector.component.spec.ts` | ❌ W0 `section-selector.component.spec.ts` | ✅ green |
| 03-04-03 | 04 | 2 | SHARE-01 | T-03-04-01, T-03-04-05 | Token absent from dialog text and input values; snapshot only; exact disclosure line; Share button absent in view mode (D-04 to D-07) | web unit (TDD) + Playwright human-check | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/pages/character/share-dialog.component.spec.ts --include=src/app/pages/character/character-page.component.spec.ts` | ❌ W0 `share-dialog.component.spec.ts` · ✅ `character-page.component.spec.ts` | ✅ green |
| 03-05-01 | 05 | 2 | SHARE-10 | T-03-05-02, T-03-05-03 | 404 and 410 render identical views; malformed id never fetches; superseded response discarded; offline retries in place (D-12, D-13) | web unit (TDD) | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/pages/share/share-error.component.spec.ts --include=src/app/pages/share/share-page.component.spec.ts` | ❌ W0 `share-error.component.spec.ts` · ← 03-01-02 `share-page.component.spec.ts` | ✅ green |
| 03-05-02 | 05 | 2 | GATE-01 | T-03-05-01, T-03-05-06 | No dossier DOM before acknowledgement; notice when `adult` or `computeAdult(pages)`; `cd.adultAck` = '1' persisted; unreadable storage shows the notice (D-10) | web unit (TDD) + Playwright human-check | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/services/adult-gate.service.spec.ts --include=src/app/pages/share/adult-interstitial.component.spec.ts --include=src/app/pages/share/share-page.component.spec.ts` | ❌ W0 `adult-gate.service.spec.ts`, `adult-interstitial.component.spec.ts` · ← 03-01-02 `share-page.component.spec.ts` | ✅ green |
| 03-05-03 | 05 | 2 | SHARE-07, SHARE-06 | T-03-05-03, T-03-05-04, T-03-05-05, T-03-05-07 | Import runs validateCharacter, writes no shares row or token, new uuid per save; noindex meta while mounted (D-09, D-11) | web unit (TDD) | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/stores/library.store.spec.ts --include=src/app/pages/share/share-page.component.spec.ts` | ✅ `library.store.spec.ts` · ← 03-01-02 `share-page.component.spec.ts` | ✅ green |
| 03-06-01 | 06 | 3 | SHARE-01, SHARE-06, SHARE-07, GATE-01 | T-03-06-03 | Fake API recomputes adult like the server; an adult snapshot is gated, then matches CharacterPage view mode with zero form controls; import leaves one shares row | web integration (fake-indexeddb, stubbed fetch) | `pnpm --filter @dossier/schema build && pnpm --filter web exec ng test --watch=false --include=src/app/integration/publish-snapshot-share.integration.spec.ts` | ❌ W0 `publish-snapshot-share.integration.spec.ts`, `testing/fake-share-api.ts` | ✅ green |
| 03-06-02 | 06 | 3 | OPS-01 | T-03-06-01, T-03-06-02 | CSP connect-src adds exactly `https://api.characterdossierlab.app`; www 301s to the apex before assets (D-15) | Worker check (node) + build smoke | [C2] Worker check<br>`pnpm --filter "web..." run build && pnpm --filter web run smoke:worker` | ✅ `_worker.js`, `smoke-worker.mjs` | ✅ green |
| 03-07-01 | 07 | 3 | SEC-04 | T-03-07-01, T-03-07-02 | Bucket blocks all public access; IAM user holds only the SPEC-storage-s3 §5 policy (D-14) | manual (checkpoint:human-action) | — | — | ☑️ manual |
| 03-07-02 | 07 | 3 | SEC-04 | T-03-07-01, T-03-07-03, T-03-07-04 | Real credential: object operations work, missing key is null, list-objects-v2 is AccessDenied; no credential on disk; test objects deleted | real-S3 integration + AWS CLI | `pnpm --filter @dossier/schema build && RUN_S3_INTEGRATION=1 EXPECT_LIST_DENIED=1 S3_BUCKET=character-dossier S3_REGION=us-west-2 pnpm --filter api exec vitest run src/__tests__/s3.integration.spec.ts`<br>[C3] list denial | ← 03-03-02 `s3.integration.spec.ts` | ✅ green (operator-gated) |
| 03-08-01 | 08 | 4 | OPS-01 | T-03-08-02, T-03-08-03 | Secrets only in Railway variables; DNS-only CNAME so Railway terminates TLS; one replica (D-14, D-15) | manual (checkpoint:human-action) | — | — | ☑️ manual |
| 03-08-02 | 08 | 4 | OPS-01, SEC-04, SHARE-01 | T-03-08-01 | Live `/healthz` reports the deployed sha; foreign-origin preflight gets no allow-origin; live adult false reads back true; `GET /v1/shares` is 404 | live HTTP smoke | `API_URL=https://api.characterdossierlab.app APP_ORIGIN=https://characterdossierlab.app EXPECT_VERSION=$(git rev-parse HEAD) node apps/api/scripts/live-smoke.mjs` | ❌ W0 `live-smoke.mjs` | ✅ green (operator-gated) |
| 03-08-03 | 08 | 4 | SHARE-06, GATE-01, SHARE-01 | T-03-08-05 | Live www 301 and apex CSP; adult share gated then read-only; every created test share deleted | live HTTP check + Playwright human-check | [C4] live web check | — | ✅ green (operator-gated) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ☑️ manual (human-action checkpoint) · operator-gated = automated command exists and has run green, but needs a production credential or mutates live state, so it is not re-run on every audit*

### Long-form commands

C1 (03-03-02 boot check):

```bash
pnpm --filter api run build && node -e "const r=require('node:child_process').spawnSync(process.execPath,['apps/api/dist/server.js'],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:10000});if(r.status===0||!/invalid environment: .*APP_ORIGIN/.test(r.stderr)){console.error('BOOT-CHECK-FAILED',r.status,r.stderr);process.exit(1)}"
```

C2 (03-06-02 Worker check):

```bash
node --input-type=module -e "const w=(await import('./apps/web/_worker.js')).default;const env={ASSETS:{fetch:async()=>new Response('<cd-root></cd-root>',{headers:{'Content-Type':'text/html'}})}};const r=await w.fetch(new Request('https://www.characterdossierlab.app/s/abc?x=1'),env,{});const h=await w.fetch(new Request('https://characterdossierlab.app/s/abc'),env,{});const csp=h.headers.get('content-security-policy')||'';if(r.status!==301||r.headers.get('location')!=='https://characterdossierlab.app/s/abc?x=1'||!csp.includes(\"connect-src 'self' https://api.characterdossierlab.app\")){console.error('WORKER-CHECK-FAILED',r.status,r.headers.get('location'),csp);process.exit(1)}"
```

C3 (03-07-02 list denial):

```bash
# bucket is `character-dossier` (us-west-2) — SPEC's `character-dossier-prod` never existed (03-07-SUMMARY)
aws s3api list-objects-v2 --bucket character-dossier --max-items 1 2>&1 | rg -q 'AccessDenied'
```

C4 (03-08-03 live web check):

```bash
node --input-type=module -e "const w=await fetch('https://www.characterdossierlab.app/c/x',{redirect:'manual'});const a=await fetch('https://characterdossierlab.app/s/s0000000000000000000000000',{headers:{Accept:'text/html'}});const csp=a.headers.get('content-security-policy')||'';const body=await a.text();if(w.status!==301||w.headers.get('location')!=='https://characterdossierlab.app/c/x'||a.status!==200||!body.includes('<cd-root')||!csp.includes(\"connect-src 'self' https://api.characterdossierlab.app\")){console.error('LIVE-WEB-FAILED',w.status,w.headers.get('location'),a.status,csp);process.exit(1)}"
```

---

## Wave 0 Requirements

No plan is a standalone Wave 0. Each missing file is written test-first inside the task that owns the behavior (tracer-first, `tdd="true"`), before that task's implementation. Boxes are checked as execution creates the files.

- [x] `apps/api` framework install (`vitest`, `typescript`, `tsx`, `@types/node`) — 03-01-02, after the 03-01-01 legitimacy gate
- [x] `apps/api/package.json` (`build`, `test`, `typecheck`, `smoke`), `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts` — 03-01-02
- [x] `apps/api/src/object-store.ts` `MemoryObjectStore` (route-test store, D-17) and the `app.request` route-spec convention in `apps/api/src/__tests__/shares.route.spec.ts` — 03-01-02
- [x] `apps/api/scripts/smoke.mjs` — 03-01-02
- [x] `apps/web/src/app/pages/share/share-page.component.spec.ts` — 03-01-02 (extended by 03-05-01, 03-05-02, 03-05-03)
- [x] `packages/schema/src/__tests__/compute-adult.spec.ts` — GATE-02 edges — 03-02-01
- [x] `apps/api/src/__tests__/tokens.spec.ts` — 03-02-02
- [x] `apps/api/src/__tests__/cors.spec.ts`, `healthz.spec.ts`, `config.spec.ts`, `logging.spec.ts` — 03-02-03
- [x] `apps/api/src/__tests__/s3.spec.ts` — 03-03-01
- [x] `docker-compose.yml` and root `minio:up` (MinIO with `character-dossier-dev`, D-16), `apps/api/.env.example`, `apps/api/src/__tests__/s3.integration.spec.ts` (skipped unless `RUN_S3_INTEGRATION=1`) — 03-03-02
- [x] `apps/api/scripts/container-smoke.mjs` — 03-03-03
- [x] `apps/web/src/app/services/share.repo.spec.ts`, `apps/web/src/app/stores/share.store.spec.ts` — 03-04-01
- [x] `apps/web/src/app/components/section-selector/section-selector.component.spec.ts` — 03-04-02
- [x] `apps/web/src/app/pages/character/share-dialog.component.spec.ts` — 03-04-03
- [x] `apps/web/src/app/pages/share/share-error.component.spec.ts` — 03-05-01
- [x] `apps/web/src/app/services/adult-gate.service.spec.ts`, `apps/web/src/app/pages/share/adult-interstitial.component.spec.ts` — 03-05-02
- [x] `apps/web/src/app/testing/fake-share-api.ts` and `apps/web/src/app/integration/publish-snapshot-share.integration.spec.ts` (SPEC-frontend-architecture §10 required spec) — 03-06-01
- [x] `apps/api/scripts/live-smoke.mjs` — 03-08-02

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| npm package legitimacy before the first `apps/api` install (03-01-01) | SHARE-01, SHARE-06, GATE-02 | Legitimacy checkpoints are blocking-human and never auto-approved (T-03-01-SC) | On npmjs.com confirm publisher, repository and version for hono 4.13.7, @aws-sdk/client-s3 3.1131.0, tsx 4.23.13, @types/node 22.x, @hono/node-server 2.1.1 and pino 10.3.1; reply "approved" or name packages to reject |
| Production bucket and least-privilege API user (03-07-01) | SEC-04 | AWS console steps are human-only (D-14) | Create the production bucket (actual name: `character-dossier`, us-west-2) (block all public access, SSE-S3, versioning off, 1-day abort-multipart rule) and IAM user `character-dossier-api` with only the SPEC-storage-s3 §5 policy; hand over region and key pair in-session. 03-07-02 then proves list denial automatically |
| Railway service, variables, custom domain, Cloudflare DNS and push of `master` (03-08-01) | OPS-01 | Dashboard configuration and pushing are the user's call (D-14, D-15) | Railway Config File `/apps/api/railway.json`, root directory unset, 1 replica, SPEC-deployment §4 variables (no `PORT`, `S3_ENDPOINT` or `RATE_LIMIT_DISABLED`), CNAME `api` DNS-only; reply once healthy with a certificate. 03-08-02 checks `/healthz`; the one-replica truth is confirmed from the dashboard |

Browser checks run by Claude with Playwright (`<human-check>`, not handed to the user):

- 03-04-03 — Share sits beside "← Library" at 400 px and 1280 px; bottom sheet under 700 px; every page starts checked with the 18+ badge; Publish shows "Link copied" and the `/s/` URL opens in a new context
- 03-05-02 — an adult share in a fresh context at 400 px shows only the content notice (screenshot); Tab cycles the two actions; Escape does nothing; reload after acknowledging renders the dossier directly
- 03-08-03 — live: adult share gated then read-only and remembered after reload; non-adult share ungated; `/s/notavalidid` shows not-found; a share published from the live UI opens read-only in a fresh context; screenshots attached to the SUMMARY

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 18 of 21 task rows carry a green automated command; the 3 exceptions (03-01-01, 03-07-01, 03-08-01) are human-action checkpoints already recorded under Manual-Only
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — all 31 mapped files exist on disk
- [x] No watch-mode flags
- [x] Feedback latency < 90s — full suite runs in ~12s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-09-16 by /gsd-validate-phase 03

---

## Validation Audit 2026-09-16

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Input state: **A** (existing `03-VALIDATION.md`, `status: draft`). The map was seeded by
`/gsd-plan-phase` and never reconciled against execution; this audit reconciles it.

**Requirement-level classification — all COVERED, none PARTIAL or MISSING:**

| Requirement | Covering automated verification |
|-------------|--------------------------------|
| SHARE-01 | `shares.route.spec.ts`, `share.repo.spec.ts`, `share.store.spec.ts`, `share-dialog.component.spec.ts`, `publish-snapshot-share.integration.spec.ts` |
| SHARE-06 | `share-page.component.spec.ts`, `publish-snapshot-share.integration

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 23308 bytes -->
