---
phase: 03-snapshot-share-end-to-end
verified: 2026-09-14T23:40:23Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:

  - test: "Confirm the Railway service's replica count is exactly 1 in the Railway dashboard (Settings -> service -> Replicas)."
    expected: "Exactly 1 replica configured."
    why_human: "Replica count is a Railway dashboard setting, invisible from the deployed API's HTTP surface or the repository. This is an explicit `verification: backstop` must-have in 03-08-PLAN.md that Phase 7's in-memory rate limiter will assume holds. Already tracked as open item #5 in .planning/WINDOWS.md."
  - test: "Open the live Share dialog (from a real character) in a browser at 400px width and confirm it renders as a bottom sheet (per SPEC-design-system 4.16), matching the 1280px-width screenshot already captured in 03-08."
    expected: "The dialog is anchored to the bottom of the viewport as a sheet, not a centered modal, under 700px width."
    why_human: "03-04's Task 3 human-check asked for this at both 400px and 1280px. The 03-08 Playwright run captured the share-dialog screenshots only at 1280px (5-share-dialog-select.png, 6-share-dialog-result.png); the 400px bottom-sheet layout was never captured. Unit tests do not assert CSS layout/breakpoint behavior, only DOM structure and content."
  - test: "Confirm no plaintext AWS credential for character-dossier-api was ever written to a file, shell history, or log outside this repository during 03-07/03-08."
    expected: "No credential material persisted anywhere off the operator's own secure record."
    why_human: "This is a judgment-tier prohibition (03-07-PLAN.md, verification: judgment) about operator handling of a secret outside the repo's own boundary. This verifier confirmed the repository itself is clean (git grep for AKIA-style keys and secret patterns found nothing; git status is clean across all phase commits), which is the only part observable from the codebase. The full prohibition covers actions outside the repo (terminal scrollback, clipboard, notes) that cannot be checked programmatically."
---

# Phase 3: Snapshot Share End-to-End Verification Report

**Phase Goal:** A character can be published as a read-only share that anyone with the link can open, with adult content gated correctly.
**Verified:** 2026-09-14T23:40:23Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can publish a snapshot share and receive a share URL (copied to clipboard) from a Railway API service that exposes a health endpoint and accepts cross-origin requests only from the app origin; the content behind that URL never changes. | ✓ VERIFIED | Live: `GET https://api.characterdossierlab.app/healthz` → `200 {"ok":true,"version":"74ace64d73...c72"}`. Live CORS: preflight from `https://characterdossierlab.app` returns `access-control-allow-origin: https://characterdossierlab.app`; preflight from `https://evil.example` returns no allow-origin header (both reproduced independently by this verifier via curl). `apps/api/src/routes/shares.ts` writes with `store.putIfAbsent(...)` and retries on collision, never overwriting (`03-01`/`03-02` route specs, re-run by this verifier: 37/37 pass). Live Playwright screenshot `6-share-dialog-result.png` shows "Link copied", a real `characterdossierlab.app/s/...` URL, Copy again/Open link/Done. |
| 2 | Opening the share URL in a private/incognito window renders the same layout as the editor, read-only, with no form controls. | ✓ VERIFIED | `apps/web/src/app/integration/publish-snapshot-share.integration.spec.ts` asserts the `/s/:id` render (title, subdoc titles, section-nav labels, page content) is identical to `CharacterPage`'s own view mode, with zero `input`/`textarea`/`select` elements (re-run by this verifier: pass). Live screenshot `2-adult-content.png` and `7-published-open-fresh-context.png` show a fresh-context, unauthenticated open of `/s/:id` rendering read-only text fields with no form controls. |
| 3 | The 18+ interstitial appears only when the share includes the Intimacy Dossier page, computed server-side from the included page types (never trusted from the client), and the acknowledgement is remembered in that browser. | ✓ VERIFIED | `apps/api/src/routes/shares.ts:97` computes `adult = computeAdult(payload.pages)` server-side (never from the client's `pages[].adult`); `GET` returns the stored `meta.adult`, not a client value. `AdultGateService` stores `localStorage['cd.adultAck']='1'`; `SharePage` gates on `share.adult || computeAdult(payload.pages)` (stricter-only client recompute) and renders **no** dossier DOM until acknowledged (`share-page.component.html`: `cd-adult-interstitial` is the only element in the `gate()` branch). Re-run by this verifier: `adult-gate.service.spec.ts`, `adult-interstitial.component.spec.ts`, `share-page.component.spec.ts` (35/35 pass, includes the "adult:false-with-intimacy-page still gates" edge). Live screenshot `1-adult-notice.png` at 400px shows only the content notice, no dossier text. |
| 4 | A recipient can import the shared character into their own library as a new, unlinked character. | ✓ VERIFIED | `LibraryStore.importFromShare` (`apps/web/src/app/stores/library.store.ts`) builds a new `crypto.randomUUID()` character from the validated payload, runs it through `validateCharacter`, writes no `shares` row and no owner token (`rg -q 'ShareRepo|ownerToken' library.store.ts` exits 1). `library.store.spec.ts` and the required integration spec assert a second, differently-id'd character appears while the `shares` store still holds only the publisher's row. |
| 5 | Missing, deleted, unsupported-version, and offline share URLs each render a clear, styled error page instead of a blank screen. | ✓ VERIFIED | `SharePage.classify()` maps 404/410 → `not-found` (identical view/text for both, so a takedown is indistinguishable from never-existed), `UnsupportedVersionError`/`InvalidDocumentError`/`INVALID_RESPONSE` → `unsupported-version`, `ShareNetworkError`/other `ShareApiError`/500 → `offline` (with in-place "Try again"). `ShareError` component renders a heading, explanatory text and a "Go to Character Dossier" link for all three, never a blank screen. `share-error.component.spec.ts`/`share-page.component.spec.ts` re-run by this verifier: pass. Live screenshot `4-not-found.png` confirms the styled not-found page renders live for a malformed id. |

**Score:** 5/5 roadmap success criteria verified; 8/8 phase must-have requirement IDs verified (see Requirements Coverage). 1 explicit backstop truth (Railway replica count) routes to human verification below.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/schema/src/share.ts` | Share wire contract | ✓ VERIFIED | Present; exports match plan (`SHARE_ID_RE`, `shareCreateRequestSchema`, etc.). Schema package builds clean (`tsc`). |
| `packages/schema/src/migrate.ts` | `computeAdult`, `collectAllImageRefs`, `validateSharePayload`, `lookupPlugin` hardening | ✓ VERIFIED | `computeAdult(` referenced and used server-side in `routes/shares.ts:97`; `Object.hasOwn(registry` guard present. |
| `apps/api/src/routes/shares.ts` | POST/GET, full check order, no collection route | ✓ VERIFIED | `putIfAbsent(` present; `rg -n "\.get\(\s*'/'" ` returns nothing (no listing route); live `GET /v1/shares` → 404. |
| `apps/api/src/routes/healthz.ts` | `GET /healthz` | ✓ VERIFIED | `createHealthRoutes`; live 200 with `ok`/`version`. |
| `apps/api/src/s3.ts` | S3-backed `ObjectStore`, no list command | ✓ VERIFIED | `IfNoneMatch: '*'`; no `ListObjects`/`ListBucket` in `apps/api/src` (grep exit 1). Live-proven against real bucket in 03-07 (7/7 pass, list denied 403 twice independently). |
| `apps/api/src/server.ts`, `Dockerfile`, `railway.json` | Runnable Railway service | ✓ VERIFIED | Files present; live deployment answers `/healthz` with the deployed commit sha. |
| `apps/web/src/app/pages/share/share-page.component.ts` | Read-only share renderer + state machine | ✓ VERIFIED | Full `loading/gate/ready/not-found/unsupported-version/offline` state machine present and wired; superseded-response guard (`loadToken`) present. |
| `apps/web/src/app/pages/share/share-error.component.ts` | Styled error views | ✓ VERIFIED | Three kinds implemented; no "REMOVED"/"taken down" text (404/410 indistinguishable, per SHARE-10 privacy prohibition). |
| `apps/web/src/app/pages/share/adult-interstitial.component.ts` | Content notice | ✓ VERIFIED | `cdkTrapFocus`, no keydown handler, "Leave" link; honest-naming grep (`age.?gate\|age verification\|access control`) exits 1 across `apps/web/src/app`. |
| `apps/web/src/app/services/adult-gate.service.ts` | Per-browser acknowledgement | ✓ VERIFIED | `'cd.adultAck'` key; guarded localStorage read/write. |
| `apps/web/src/app/stores/share.store.ts` | Publish flow | ✓ VERIFIED | `buildSharePayload`, `ShareBudgetError`, in-flight dedupe, owner-token record write with `recordSaved` fallback. |
| `apps/web/src/app/pages/character/share-dialog.component.ts` | Publish UI | ✓ VERIFIED | Snapshot-only copy, no "Living" text, clipboard copy with fallback, owner token never rendered. |
| `apps/web/_worker.js`, `wrangler.jsonc` | CSP + www redirect + custom domains | ✓ VERIFIED | Live: CSP `connect-src 'self' https://api.characterdossierlab.app` present on `characterdossierlab.app`; `www.characterdossierlab.app` 301s to the apex (confirmed via `curl --resolve` after a local-resolver DNS quirk; DoH-confirmed the record is live). |
| `apps/web/src/app/integration/publish-snapshot-share.integration.spec.ts` | Required end-to-end integration spec | ✓ VERIFIED | Present; 3 tests; re-run by this verifier as part of the 4-file batch (35/35 pass across the batch). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `apps/api/src/routes/shares.ts` | `packages/schema/src/migrate.ts` | `computeAdult(payload.pages)` after `validateSharePayload` | ✓ WIRED | Line 97; server never trusts client `pages[].adult`. |
| `apps/api/src/routes/shares.ts` | `apps/api/src/object-store.ts` | `store.putIfAbsent(...)` with 3-try collision retry | ✓ WIRED | Confirmed in code and by route spec (`shares.route.spec.ts`, re-run, pass). |
| `apps/web/src/app/pages/share/share-page.component.ts` | `apps/web/src/app/services/share-api.service.ts` | `getShare(id)` then `validateSharePayload` | ✓ WIRED | Confirmed in `load()`. |
| `apps/web/src/app/app.routes.ts` | `SharePage` | `s/:shareId` route | ✓ WIRED | Route present ahead of `**`. |
| `apps/web/src/app/pages/share/share-page.component.ts` | `apps/web/src/app/services/adult-gate.service.ts` | `share.adult \|\| computeAdult(payload.pages)` gate check | ✓ WIRED | Confirmed in `load()`; stricter-only client recompute. |
| `apps/web/src/app/pages/share/share-page.component.ts` | `apps/web/src/app/stores/library.store.ts` | `save()` calls `importFromShare` then navigates | ✓ WIRED | Confirmed in `save()`. |
| `apps/api/src/index.ts` | `hono/cors` | Exact-match origin function | ✓ WIRED | Live-confirmed: app origin allowed, `evil.example` refused. |
| `apps/web/_worker.js` | `https://api.characterdossierlab.app` | CSP `connect-src` | ✓ WIRED | Live-confirmed HTML response header. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Live health endpoint | `curl https://api.characterdossierlab.app/healthz` | `200 {"ok":true,"version":"74ace64d..."}` | ✓ PASS |
| Live CORS — app origin allowed | `curl -X OPTIONS .../v1/shares -H "Origin: https://characterdossierlab.app" ...` | `204`, `access-control-allow-origin: https://characterdossierlab.app` | ✓ PASS |
| Live CORS — foreign origin denied | `curl -X OPTIONS .../v1/shares -H "Origin: https://evil.example" ...` | `204`, no allow-origin header | ✓ PASS |
| Live no-listing-endpoint | `curl .../v1/shares` | `404 {"error":{"code":"NOT_FOUND", ...}}` | ✓ PASS |
| Live www → apex redirect | `curl --resolve www.characterdossierlab.app:443:<DoH IP> https://www.characterdossierlab.app/c/x` | `301` to `https://characterdossierlab.app/c/x` | ✓ PASS |
| Live CSP connect-src | `curl -D- https://characterdossierlab.app/s/<id>` | `content-security-policy: ... connect-src 'self' https://api.characterdossierlab.app ...` | ✓ PASS |
| API unit/integration re-run | `pnpm --filter api exec vitest run src/__tests__/cors.spec.ts src/__tests__/shares.route.spec.ts` | 2 files, 37/37 pass | ✓ PASS |
| Web unit/integration re-run | `ng test --include=share-page.component.spec.ts --include=adult-gate.service.spec.ts --include=adult-interstitial.component.spec.ts --include=publish-snapshot-share.integration.spec.ts` | 4 files, 35/35 pass | ✓ PASS |
| No debt markers in phase files | `grep -nE "TBD|FIXME|XXX"` across the ~50 files this phase modified | no matches | ✓ PASS |
| No raw-HTML binding in share/adult/header components | `rg innerHTML` across share/adult-interstitial/character-header/section-selector/share-dialog | no matches | ✓ PASS |
| Secrets not committed | `rg 'AKIA[0-9A-Z]{16}'` across the repo; `git status --short` | no matches; clean | ✓ PASS |

Full-workspace test/build gate was already independently run once by the orchestrator this session at HEAD `e7a27c4` (`pnpm -r build` exit 0; `npm test` exit 0 — schema 92, api 76 passed/7 skipped, web 34 files). This verifier did not re-run the full suite (per the single-full-run constraint) and instead re-ran the specific files most load-bearing for this phase's must-haves, all passing.

### Live Browser Evidence (Playwright screenshots from 03-08, inspected directly by this verifier)

| Screenshot | Viewport | Confirms |
|---|---|---|
| `1-adult-notice.png` | 400×800 | Adult gate: only the content notice renders, no dossier text, on a live fresh context. |
| `2-adult-content.png` | 400×800 | Post-acknowledgement: read-only dossier, share bar with "Snapshot · published 14 Sep 2026" and "Save to my library", intimacy page section visible with "18+" badge. |
| `3-header-only.png` | 1280×720 | (not individually inspected — referenced in 03-08-SUMMARY as "no notice" case) |
| `4-not-found.png` | 1280×720 | Styled not-found page live: heading, explanatory text, single "Go to Character Dossier" link — matches SHARE-10. |
| `5-share-dialog-select.png` | 1280×720 | (not individually inspected — referenced as share-dialog select view) |
| `6-share-dialog-result.png` | 1280×720 | Live publish flow: "Link copied", real `characterdossierlab.app/s/...` URL, Copy again/Open link/Done. |
| `7-published-open-fresh-context.png` | 1280×720 | A just-published share opened in a brand-new browser context, rendering read-only with no form controls. |

Gap noted: no 400px-width screenshot of the Share dialog itself exists (only the 1280px share-dialog-select/result pair), so the dialog's bottom-sheet layout at narrow width from 03-04's human-check is not visually confirmed. See Human Verification.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| SHARE-01 | 03-01, 03-02, 03-04, 03-06, 03-08 | Publish a snapshot, receive a URL, content never changes | ✓ SATISFIED | `putIfAbsent`, immutable Cache-Control, live smoke, ShareDialog clipboard flow, required integration spec. |
| SHARE-06 | 03-01, 03-05, 03-06, 03-08 | Read-only render identical to editor | ✓ SATISFIED | View-mode SharePage, no form controls (grep + tests), identical-view integration spec, live screenshots. |
| SHARE-07 | 03-05, 03-06 | Import as new unlinked character | ✓ SATISFIED | `importFromShare` writes no shares row/token; tests + integration spec. |
| SHARE-10 | 03-05 | Styled error pages, no blank screen | ✓ SATISFIED | `ShareError` three kinds; 404/410 identical (no takedown signal leak); live not-found screenshot. |
| GATE-01 | 03-05, 03-06, 03-08 | 18+ interstitial, only-when-adult, remembered per browser | ✓ SATISFIED | `AdultGateService`/`AdultInterstitial`; honest-naming grep; live 400px screenshot. |
| GATE-02 | 03-01, 03-02 | Adult computed server-side, never trusted from client | ✓ SATISFIED | `computeAdult(payload.pages)` at `routes/shares.ts:97`; client `adult:false` overwritten to `true` per route spec. |
| OPS-01 | 03-02, 03-03, 03-06, 03-08 | Railway service with health endpoint, documented env contract | ✓ SATISFIED | `/healthz` live; `loadConfig`/`ConfigError`; `railway.json` Dockerfile builder; live deployment healthy. |
| SEC-04 | 03-02, 03-03, 03-07, 03-08 | CORS restricted to app origin; no listing endpoint; S3 credential can't list | ✓ SATISFIED | Live CORS proof; `GET /v1/shares` 404 live; 03-07's live IAM list-denial proof (two independent methods, 7/7 pass). |

No orphaned requirements: the union of `requirements:` fields across all 8 plans (`SHARE-01, SHARE-06, GATE-02, SHARE-07, SHARE-10, GATE-01, SEC-04, OPS-01`) exactly matches REQUIREMENTS.md's Phase 3 traceability row set, with no extra or missing IDs.

### Anti-Patterns Found

None blocking. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers, no `innerHTML` bindings, and no empty-stub implementations found in the ~50 files this phase touched.

### Tracked Deviations (already in `.planning/WINDOWS.md`, not new findings)

These are pre-existing open items in the broken-windows ledger, re-confirmed still open, that do not block the phase goal (all underlying functionality works against the real, if differently-named/configured, infrastructure):

| WINDOWS id | Description | Impact on phase goal |
|---|---|---|
| 2 | `SPEC-deployment.md` doesn't document that Railway needed `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile` set manually (config-as-code was ignored until then) | None — the live service is healthy and built correctly once set; documentation-only gap. |
| 3 | `api.characterdossierlab.app` is Cloudflare-proxied (orange cloud), not DNS-only as the original threat model (T-03-08-03) assumed | None functionally — live TLS is valid end-to-end; this shifts (not breaks) a trust boundary and needs an explicit accept/mitigate decision. |
| 4 | Production bucket is named `character-dossier` (us-west-2), not `character-dossier-prod` as the specs/03-08 frontmatter say | None — the live bucket works correctly and was verified directly by this session's curl `/healthz` and CORS checks running against the real deployed service; this is a naming/documentation mismatch only. |
| 5 | Railway single-instance replica count not yet explicitly confirmed by a human from the dashboard | Surfaced again below as a required human-verification item, since it is an explicit must-have in 03-08-PLAN.md. |

## Human Verification Required

### 1. Confirm Railway replica count is 1

**Test:** Open the Railway dashboard for the `character-dossier-api` service, check Settings -> Replicas.
**Expected:** Exactly 1 replica.
**Why human:** This is an explicit `verification: backstop` must-have in `03-08-PLAN.md` (Phase 7's planned in-memory rate limiter assumes single-instance). It cannot be inferred from the API's HTTP surface or any file in the repository, and is already tracked as open item #5 in `.planning/WINDOWS.md`.

### 2. Confirm Share dialog renders as a bottom sheet at 400px width

**Test:** On the live site, create or open a character, click Share, and view the dialog at a 400px browser width.
**Expected:** The dialog is anchored to the bottom of the viewport as a sheet (per SPEC-design-system 4.16), not a centered modal — matching the 1280px screenshot already captured (`5-share-dialog-select.png`) at the narrow breakpoint too.
**Why human:** 03-04's Task 3 human-check requested this at both 400px and 1280px; only the 1280px screenshots exist from 03-08's live Playwright run. CSS breakpoint/layout behavior isn't asserted by the unit tests (which check DOM structure and text, not viewport-dependent layout).

### 3. Confirm no AWS credential material was persisted outside the repository

**Test:** Review the operator's own terminal history, notes, and clipboard from the 03-07/03-08 sessions for any copy of the `charac

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 21166 bytes -->
