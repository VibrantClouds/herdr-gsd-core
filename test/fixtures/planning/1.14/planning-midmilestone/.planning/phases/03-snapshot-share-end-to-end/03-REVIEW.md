---
phase: 03-snapshot-share-end-to-end
reviewed: 2026-09-14T23:38:17Z
depth: standard
files_reviewed: 83
files_reviewed_list:
  - apps/api/.env.example
  - apps/api/Dockerfile
  - apps/api/package.json
  - apps/api/railway.json
  - apps/api/scripts/container-smoke.mjs
  - apps/api/scripts/live-smoke.mjs
  - apps/api/scripts/smoke.mjs
  - apps/api/src/config.ts
  - apps/api/src/index.ts
  - apps/api/src/logger.ts
  - apps/api/src/object-store.ts
  - apps/api/src/routes/healthz.ts
  - apps/api/src/routes/shares.ts
  - apps/api/src/s3.ts
  - apps/api/src/server.ts
  - apps/api/src/share-object.ts
  - apps/api/src/tokens.ts
  - apps/api/src/__tests__/config.spec.ts
  - apps/api/src/__tests__/cors.spec.ts
  - apps/api/src/__tests__/healthz.spec.ts
  - apps/api/src/__tests__/logging.spec.ts
  - apps/api/src/__tests__/s3.integration.spec.ts
  - apps/api/src/__tests__/s3.spec.ts
  - apps/api/src/__tests__/shares.route.spec.ts
  - apps/api/src/__tests__/tokens.spec.ts
  - apps/api/tsconfig.build.json
  - apps/api/tsconfig.json
  - apps/api/vitest.config.ts
  - apps/web/package.json
  - apps/web/scripts/smoke-worker.mjs
  - apps/web/_worker.js
  - apps/web/wrangler.jsonc
  - apps/web/src/app/app.routes.ts
  - apps/web/src/app/components/character-header/character-header.component.html
  - apps/web/src/app/components/character-header/character-header.component.scss
  - apps/web/src/app/components/character-header/character-header.component.spec.ts
  - apps/web/src/app/components/character-header/character-header.component.ts
  - apps/web/src/app/components/section-nav/section-nav.component.ts
  - apps/web/src/app/components/section-selector/section-selector.component.html
  - apps/web/src/app/components/section-selector/section-selector.component.scss
  - apps/web/src/app/components/section-selector/section-selector.component.spec.ts
  - apps/web/src/app/components/section-selector/section-selector.component.ts
  - apps/web/src/app/integration/publish-snapshot-share.integration.spec.ts
  - apps/web/src/app/pages/character/character-page.component.html
  - apps/web/src/app/pages/character/character-page.component.scss
  - apps/web/src/app/pages/character/character-page.component.spec.ts
  - apps/web/src/app/pages/character/character-page.component.ts
  - apps/web/src/app/pages/character/share-dialog.component.html
  - apps/web/src/app/pages/character/share-dialog.component.scss
  - apps/web/src/app/pages/character/share-dialog.component.spec.ts
  - apps/web/src/app/pages/character/share-dialog.component.ts
  - apps/web/src/app/pages/share/adult-interstitial.component.html
  - apps/web/src/app/pages/share/adult-interstitial.component.scss
  - apps/web/src/app/pages/share/adult-interstitial.component.spec.ts
  - apps/web/src/app/pages/share/adult-interstitial.component.ts
  - apps/web/src/app/pages/share/share-error.component.html
  - apps/web/src/app/pages/share/share-error.component.scss
  - apps/web/src/app/pages/share/share-error.component.spec.ts
  - apps/web/src/app/pages/share/share-error.component.ts
  - apps/web/src/app/pages/share/share-page.component.html
  - apps/web/src/app/pages/share/share-page.component.scss
  - apps/web/src/app/pages/share/share-page.component.spec.ts
  - apps/web/src/app/pages/share/share-page.component.ts
  - apps/web/src/app/services/adult-gate.service.spec.ts
  - apps/web/src/app/services/adult-gate.service.ts
  - apps/web/src/app/services/share-api.service.ts
  - apps/web/src/app/services/share.repo.spec.ts
  - apps/web/src/app/services/share.repo.ts
  - apps/web/src/app/stores/library.store.spec.ts
  - apps/web/src/app/stores/library.store.ts
  - apps/web/src/app/stores/share.store.spec.ts
  - apps/web/src/app/stores/share.store.ts
  - apps/web/src/app/testing/fake-share-api.ts
  - apps/web/src/environments/environment.development.ts
  - apps/web/src/environments/environment.ts
  - docs/specs/SPEC-deployment.md
  - docs/specs/SPEC-frontend-architecture.md
  - packages/schema/src/index.ts
  - packages/schema/src/migrate.ts
  - packages/schema/src/share.ts
  - packages/schema/src/__tests__/compute-adult.spec.ts
  - packages/schema/src/__tests__/migrate.spec.ts
  - packages/schema/src/__tests__/share.spec.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-09-14T23:38:17Z
**Depth:** standard
**Files Reviewed:** 83 (82 read directly; `apps/api/.env.example` could not be read — sandboxed against `.env*` files by the reviewing tool's own permission settings. This is a reviewer-tooling limitation, not a finding about the file.)
**Status:** issues_found

## Summary

This phase wires up the full snapshot-share round trip: API `POST/GET /v1/shares`, the `SharePage`/`ShareDialog`/`AdultInterstitial` UI, the Cloudflare Worker hosting shell, and the shared `@dossier/schema` migration/validation layer. The code is unusually well defended for a first pass: the server independently recomputes the `adult` flag from the plugin registry (never trusts the client, verified by both unit and live-smoke tests), owner tokens are generated with `node:crypto`, hashed before storage, never re-emitted after creation, and are actively redacted from logs (with a dedicated `logging.spec.ts` proving it); CORS is a strict origin allowlist with no credentials; the image manifest/blocked/missing/budget checks in `routes/shares.ts` are enforced against actual S3 `HEAD` results rather than client-declared metadata; and the frontend never uses `innerHTML`/`bypassSecurityTrust`. Test coverage for the share flow (unit, route, CORS, logging, and a full IndexedDB-backed integration spec) is thorough and exercises the adversarial cases (uppercase id prefixes, malformed ids, oversized bodies, id collisions, client-claimed `adult:false`, cross-origin fetches).

No Critical-severity defects were found in the reviewed diff. The Warning-level findings below are about header hardening drifting from the documented contract and two cases of duplicated logic that will make correctness fixes easy to apply inconsistently later; the Info items are minor forward-looking notes.

## Warnings

### WR-01: Content-Security-Policy `img-src` omits the CloudFront image origin the deployment spec requires

**File:** `apps/web/_worker.js:1-2`
**Issue:** The shipped CSP is:
```
img-src 'self' data: blob:;
```
`docs/specs/SPEC-deployment.md` §3 specifies (and the API's `IMG_BASE_URL` env var already exists to support):
```
img-src 'self' data: blob: https://img.characterdossierlab.app;
```
This header ships on every HTML response in production today. Nothing in the current phase renders a cross-origin `<img>` yet, so it is not an active break — but the moment portrait/gallery images (served from `img.characterdossierlab.app` per `SPEC-deployment.md` §1) are added, the browser will silently block them under this policy with no visible error beyond a CSP console violation, and the gap will look like a completely unrelated image-pipeline bug to whoever debugs it.
**Fix:**
```js
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://img.characterdossierlab.app; connect-src 'self' https://api.characterdossierlab.app; frame-ancestors 'none'";
```

### WR-02: API responses never set `Strict-Transport-Security`

**File:** `apps/api/src/index.ts:31-38`
**Issue:** The outermost hardening middleware sets `X-Content-Type-Options` and `Referrer-Policy` on every response but never `Strict-Transport-Security`. `SPEC-deployment.md` §4 documents Railway as terminating TLS itself for `api.characterdossierlab.app` (a CNAME with Railway-managed TLS), so nothing in the deployment topology is documented to add HSTS on the app's behalf. Given this endpoint is now public and internet-facing, the app should assert HSTS itself rather than relying on an edge that isn't guaranteed to add it.
**Fix:**
```ts
app.use('*', async (c, next) => {
  try {
    await next();
  } finally {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
});
```

### WR-03: `validateCharacter` and `validateSharePayload` duplicate ~30 lines of load-boundary logic verbatim

**File:** `packages/schema/src/migrate.ts:121-163` and `packages/schema/src/migrate.ts:199-241`
**Issue:** Both functions independently repeat the exact same sequence — null/array guard, `schemaVersion`/`pages` shape guard, envelope-version check, per-page type/version extraction and registry lookup, `migrateEnvelope`, per-page `validateSubDocument`, then a final `safeParse` — differing only in which schema they call at the end (`characterSchema` vs `sharePayloadSchema`). This is exactly the kind of duplication that causes drift: a future correctness fix (e.g. an additional envelope invariant, a new SCHM-03 total-rejection rule, or a bugfix in how `rawPages` is built) applied to one function has no structural guardrail forcing it into the other, and the two entry points already sit right next to each other with nothing (tests included) that would catch such divergence except manually re-deriving both call sites during any future change.
**Fix:** Extract the shared walk into one internal helper, e.g. `migrateAndValidatePages(record, registry): { migratedEnvelope, migratedPages }`, and have both `validateCharacter` and `validateSharePayload` call it before their own final `safeParse`.

### WR-04: `imageObjectKey` silently maps every non-`image/jpeg` mime to `.webp`

**File:** `apps/api/src/routes/shares.ts:34-36`
```ts
function imageObjectKey(image: ImageRef): string {
  return `images/${image.hash}${image.mime === 'image/jpeg' ? '.jpg' : '.webp'}`;
}
```
**Issue:** This function is only as safe as `imageRefSchema.mime` being a closed two-value enum (`image/jpeg` | `image/webp`) upstream in `character.ts` (not part of this phase's diff, so not independently re-verified here). If that enum is ever widened (e.g. to add `image/png`) without updating this switch, a manifest entry with the new mime type would silently be HEAD-checked against the *wrong* S3 key (falling through to `.webp`), causing `IMAGE_MISSING` for objects that actually exist, or — worse — colliding with an unrelated `.webp` object that happens to share the same hash prefix logic if hashes were ever mime-scoped. There is no defensive `default:`/exhaustiveness check here today.
**Fix:** Make the mapping exhaustive so a widened enum fails to compile instead of silently mis-routing:
```ts
function imageObjectKey(image: ImageRef): string {
  switch (image.mime) {
    case 'image/jpeg': return `images/${image.hash}.jpg`;
    case 'image/webp': return `images/${image.hash}.webp`;
    default: {
      const _exhaustive: never = image.mime;
      throw new Error(`Unsupported image mime: ${_exhaustive}`);
    }
  }
}
```

## Info

### IN-01: Test-only owner token generator uses `Math.random()`

**File:** `apps/web/src/app/testing/fake-share-api.ts:25-31`
**Issue:** `installFakeShareApi`'s `generateOwnerToken()` uses `Math.random()` rather than a CSPRNG. This file lives under `src/app/testing/`, which `tsconfig.app.json`'s `files` allowlist keeps out of the production bundle per `SPEC-frontend-architecture.md` §1, so there is no production exposure — flagging only so this pattern is never copied into real token-generation code (the real implementation, `apps/api/src/tokens.ts`'s `generateOwnerToken`, correctly uses `node:crypto`'s `randomBytes`).
**Fix:** No action required; consider a one-line comment noting the weaker RNG is intentional/acceptable for a fixture.

### IN-02: `timingSafeEqualHex` has no call sites yet

**File:** `apps/api/src/tokens.ts:36-39`
**Issue:** Exported and unit-tested (`tokens.spec.ts`) but unused anywhere in the current route set — its own doc comment says it's for the Phase 5 PUT/DELETE owner-auth work. Confirming this is intentional dead code, not a forgotten wire-up.
**Fix:** None needed now; verify it gets its first call site when Phase 5 lands.

### IN-03: `SharePage.classify()` collapses many distinct API failures into the generic "offline" message

**File:** `apps/web/src/app/pages/share/share-page.component.ts:157-171`
**Issue:** Any `ShareApiError` that isn't a 404/410 or `INVALID_RESPONSE` — including a hypothetical 400, 403, or 500 from the API — renders the same "Couldn't load this dossier / Check your connection and try again" copy as an actual network failure. This is safe (no data/security exposure) but actively misleading: a user hitting a real server bug is told to check their Wi-Fi, and the "Try again" affordance implies transience that may not apply.
**Fix:** Consider a distinct, still-generic "something went wrong on our end" bucket for unclassified `ShareApiError` statuses ≥500, separate from the network/offline copy used for `ShareNetworkError`.

### IN-04: `docs/specs/SPEC-deployment.md` §3's example `wrangler.jsonc` has drifted from the shipped config

**File:** `docs/specs/SPEC-deployment.md:48-68` vs `apps/web/wrangler.jsonc:1-26`
**Issue:** The spec's example still shows `compatibility_date: "2025-09-01"` and no `run_worker_first`, while the shipped config uses `compatibility_date: "2026-09-11"` and `"run_worker_first": true` (which is load-bearing — `_worker.js`'s comment explains it's required for `env.ASSETS.fetch` to apply SPA fallback correctly). Not a code defect, but worth refreshing so the spec stays trustworthy as a reference for the next contributor touching this file.
**Fix:** Update the SPEC-deployment.md example to match the current `wrangler.jsonc`, including `run_worker_first: true` and the CSP's `img-src` addition from WR-01.

---

_Reviewed: 2026-09-14T23:38:17Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
