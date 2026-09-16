---
phase: 03-snapshot-share-end-to-end
plan: 06
subsystem: integration
tags: [angular-signals, cloudflare-workers, wrangler, vitest, deployment-docs]

requires:
  - phase: 03-snapshot-share-end-to-end
    provides: 03-01's ShareStore/SharePage tracer slice; 03-02/03-03's API check order and S3/server; 03-04's ShareDialog publish flow; 03-05's adult gate, error states and LibraryStore.importFromShare
provides:
  - Required SPEC-frontend-architecture §10 integration spec: publish snapshot through ShareStore, open /s/:id, prove the rendered view is identical to CharacterPage's view mode, gated when adult, and importable via "Save to my library"
  - fake-share-api.ts — reusable in-memory POST/GET /v1/shares test double behind a stubbed global fetch
  - Worker CSP connect-src for the API origin and a www-to-apex 301, wrangler custom-domain routes, and deployment docs that match what this phase actually built
affects: [03-07, 03-08]

actuals:
  tokens: 7976
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "fake-share-api.ts recomputes adult via the shared computeAdult and validates via validateSharePayload, exactly mirroring the real route's authority, so the test double can never diverge from server behavior it doesn't itself assert on"
    - "Cloudflare Worker canonicalizes the origin before assets are served: a www.<domain> request is 301-redirected to the apex at the very top of fetch(), ahead of env.ASSETS.fetch()"

key-files:
  created:
    - apps/web/src/app/testing/fake-share-api.ts
    - apps/web/src/app/integration/publish-snapshot-share.integration.spec.ts
  modified:
    - apps/web/src/app/pages/character/character-page.component.html
    - apps/web/src/app/pages/character/character-page.component.spec.ts
    - apps/web/_worker.js
    - apps/web/wrangler.jsonc
    - apps/web/scripts/smoke-worker.mjs
    - docs/specs/SPEC-deployment.md
    - docs/specs/SPEC-frontend-architecture.md

key-decisions:
  - "CharacterPage never bound [mode] to cd-character-header, so 'view mode preview' (D-13/D-14) left the header editable instead of matching SharePage's read-only render required for the identical-view spec — fixed as a Rule 1 bug, not an architectural change, since the fix is a single missing binding using an already-computed signal."
  - "The fake share API's owner token and share id formats follow the plan's literal recipe ('s' + zero-padded counter, 43-char [A-Za-z0-9_-] token) rather than importing apps/api's real generateShareId/generateOwnerToken, keeping the web-side test double dependency-free of the server package."

requirements-completed: [SHARE-01, SHARE-06, SHARE-07, GATE-01, OPS-01]

coverage:
  - id: D1
    description: "Publishing a character with an intimacy page through ShareStore, then opening /s/:id, shows the content notice first; after acknowledging, the header title, subdoc titles, section-nav labels and page content text equal what CharacterPage renders for the same character in view mode, with zero input/textarea/select elements."
    requirement: SHARE-01
    verification:
      - kind: integration
        ref: "apps/web/src/app/integration/publish-snapshot-share.integration.spec.ts#adult publish: /s/:id renders the same header, page title, nav labels and page content as the character page, only after acknowledging the content notice"
        status: pass
    human_judgment: false
  - id: D2
    description: "A header-only publish (includedTypes: []) opens SharePage immediately with no content notice and zero subdoc hosts (D-03)."
    requirement: SHARE-01
    verification:
      - kind: integration
        ref: "apps/web/src/app/integration/publish-snapshot-share.integration.spec.ts#header-only publish: SharePage shows the header immediately, no interstitial, no pages (D-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Saving from the share page adds a second, unlinked character with a different id and the source name, and the shares IndexedDB store still holds only the publisher's one row."
    requirement: SHARE-07
    verification:
      - kind: integration
        ref: "apps/web/src/app/integration/publish-snapshot-share.integration.spec.ts#save to my library: imports an unlinked copy with a different id, and the shares store still holds only the publisher's row"
        status: pass
    human_judgment: false
  - id: D4
    description: "HTML responses from the Worker carry a CSP whose connect-src allows 'self' and https://api.characterdossierlab.app; a request to www.characterdossierlab.app 301s to the apex with the same path and query (D-15)."
    requirement: OPS-01
    verification:
      - kind: other
        ref: "node --input-type=module -e (plan's WORKER-CHECK script against apps/web/_worker.js) — status 301, correct Location, CSP includes the connect-src directive"
        status: pass
      - kind: other
        ref: "pnpm --filter web run smoke:worker — CSP connect-src (root) and CSP connect-src (deep link) PASS"
        status: pass
    human_judgment: false
  - id: D5
    description: "wrangler.jsonc routes the apex and www hosts as custom domains; SPEC-deployment.md names characterdossierlab.app everywhere it had <domain>, and documents the real environment file names, the Dockerfile/config-as-code Railway build, RAILWAY_GIT_COMMIT_SHA, and docker compose local development."
    requirement: OPS-01
    verification:
      - kind: other
        ref: "rg checks: no <domain> / has characterdossierlab.app / no environment.prod.ts / has environment.development.ts / has RAILWAY_GIT_COMMIT_SHA / has minio:up in SPEC-deployment.md; no stale no-domain comment / has www.characterdossierlab.app in wrangler.jsonc — all pass"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-09-14
status: complete
---

# Phase 3 Plan 6: Publish/Open/Identical-View Integration Spec and Live Hosting Config Summary

**The SPEC-frontend-architecture required integration spec now proves a published snapshot opens to a byte-identical read-only view (gated when adult, importable via "Save to my library"), and the web deployable is wired for characterdossierlab.app: Worker CSP allows the API origin, www 301s to the apex, wrangler targets both custom domains, and SPEC-deployment.md matches the Dockerfile/railway.json/docker-compose this phase actually shipped.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-09-14T21:00:59Z
- **Tasks:** 2
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments

- `fake-share-api.ts`: an in-memory POST/GET `/v1/shares` test double behind `vi.stubGlobal('fetch', ...)`, recomputing `adult` via `computeAdult` and validating via `validateSharePayload` exactly like the real route, so it can never silently diverge from server authority.
- `publish-snapshot-share.integration.spec.ts`: three specs proving SHARE-01/SHARE-06/SHARE-07/GATE-01 together — an adult publish whose `/s/:id` render (title, subdoc titles, section-nav labels, page content) is asserted identical to `CharacterPage`'s own view mode only after the content notice is acknowledged and with zero form controls; a header-only publish that skips the gate and shows zero pages; and a "Save to my library" import that creates a second, differently-id'd character while the `shares` store still holds exactly one row.
- Found and fixed a real bug while building the required spec: `CharacterPage` never bound `[mode]` to `cd-character-header`, so its "view mode preview" left the header editable instead of matching `SharePage`'s read-only render — added the missing binding plus a regression assertion.
- `apps/web/_worker.js` + `wrangler.jsonc` + `scripts/smoke-worker.mjs`: CSP `connect-src` now allows `https://api.characterdossierlab.app`; a `www.characterdossierlab.app` request 301s to the apex with the same path/query before assets are served; wrangler routes both hosts as custom domains; the smoke script asserts the new CSP directive.
- `docs/specs/SPEC-deployment.md` and `SPEC-frontend-architecture.md`: every `<domain>` placeholder replaced with `characterdossierlab.app`; the Railway section now matches the real Dockerfile/`railway.json` (repo-root Docker build, config-as-code at `/apps/api/railway.json`, `RAILWAY_GIT_COMMIT_SHA` as the `/healthz` version); the local-dev section matches the real `docker-compose.yml`/`minio:up` flow and documents the opt-in `RUN_S3_INTEGRATION=1` spec; the `apps/api` file listing matches what's actually shipped.

## Task Commits

Each task was committed atomically:

1. **Task 1: Required integration spec — publish snapshot, open /s/:id, identical view, save to library** — `1b39bb8` (test)
2. **Task 2: Worker CSP and www redirect, wrangler routes, and deployment docs for characterdossierlab.app** — `313b07d` (feat)

**Plan metadata:** committed separately after this SUMMARY (see below).

## Files Created/Modified

- `apps/web/src/app/testing/fake-share-api.ts` — `installFakeShareApi`
- `apps/web/src/app/integration/publish-snapshot-share.integration.spec.ts` — the required §10 integration spec
- `apps/web/src/app/pages/character/character-page.component.html` — added `[mode]="editorMode()"` to `cd-character-header`
- `apps/web/src/app/pages/character/character-page.component.spec.ts` — regression assertions for the fix (`.title-text` present, `.title-input` absent in view mode preview)
- `apps/web/_worker.js` — CSP `connect-src`, www-to-apex 301
- `apps/web/wrangler.jsonc` — `routes` for both hosts
- `apps/web/scripts/smoke-worker.mjs` — CSP `connect-src` assertion
- `docs/specs/SPEC-deployment.md` — domains, Railway, local dev sections corrected
- `docs/specs/SPEC-frontend-architecture.md` — `apps/api` file listing corrected

## Decisions Made

- `CharacterPage`'s missing `[mode]` binding on `cd-character-header` is a Rule 1 bug fix (existing behavior didn't match the already-established D-13/D-14 "view mode preview" contract), not an architectural change — the fix reuses the component's own already-computed `editorMode()` signal.
- The fake share API's id/owner-token generation follows the plan's literal recipe rather than importing `apps/api`'s real `tokens.ts`, so the web-side test double stays dependency-free of the server package.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CharacterPage's view mode preview never actually rendered the header in view mode**
- **Found during:** Task 1 (building the required integration spec's "identical view" assertion)
- **Issue:** `character-page.component.html` passed `[core]` to `cd-character-header` but never bound `[mode]`, so the header always rendered its edit-mode `<input>` fields even when `editorMode()` was `'view'` — the D-13/D-14 view-mode-preview feature never actually reached parity with `SharePage`'s read-only render, which the required integration spec depends on.
- **Fix:** Added `[mode]="editorMode()"` to the `cd-character-header` binding.
- **Files modified:** `apps/web/src/app/pages/character/character-page.component.html`, `apps/web/src/app/pages/character/character-page.component.spec.ts`
- **Verification:** New assertions in the existing view-mode-preview spec (`.title-text` present, `.title-input` absent); full `pnpm --filter web exec ng test --watch=false` suite (311 tests) still green.
- **Committed in:** `1b39bb8` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug). **Impact on plan:** Necessary for the required integration spec's identical-view assertion to be meaningful — without it, the spec would have had to compare an edit-mode header against a view-mode one, or the bug would have shipped undetected since no prior test exercised `.title-text` on `CharacterPage`. No scope creep beyond the fix and its regression coverage.

## Issues Encountered

None beyond the auto-fixed item above.

## User Setup Required

None — no external service configuration required this plan. The live AWS/Railway/Cloudflare setup (D-14 human checkpoints) is scoped to 03-08.

## Next Phase Readiness

- SHARE-01, SHARE-06, SHARE-07, GATE-01 and OPS-01 all have end-to-end proof for this phase's web-integration and hosting-config scope; `pnpm test` is green at the workspace root (92 schema + 83 API [76 pass, 7 skipped opt-in] + 311 web tests).
- The Worker, wrangler and deployment docs are ready for 03-07/03-08 to deploy against — no further placeholder domains remain, and the Railway/docker-compose/local-dev instructions match what 03-03 actually shipped.
- No blockers.

---
*Phase: 03-snapshot-share-end-to-end*
*Completed: 2026-09-14*

## Self-Check: PASSED

All 2 created files verified present on disk; commits `1b39bb8`, `313b07d` verified in `git log`.
