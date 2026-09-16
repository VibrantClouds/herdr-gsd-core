---
phase: 03-snapshot-share-end-to-end
plan: 08
subsystem: infra
tags: [railway, cloudflare-workers, wrangler, playwright, aws-s3, cors, deployment]

requires:
  - phase: 03-snapshot-share-end-to-end
    provides: "03-02's CORS/security headers and shares route; 03-03's Dockerfile/railway.json and S3ObjectStore; 03-06's Worker CSP/www-redirect/wrangler routes; 03-07's live production S3 bucket and IAM credential"
provides:
  - "A live production deployment of Phase 3: apps/api on Railway behind api.characterdossierlab.app (healthz reports the deployed commit sha), the web app on Cloudflare Workers at characterdossierlab.app and www.characterdossierlab.app"
  - "apps/api/scripts/live-smoke.mjs — repeatable live HTTP smoke test for health/CORS/publish/read-back"
  - "Browser-verified end-to-end share flow: adult gate, header-only (ungated) share, invalid-id error page, and a live publish-and-open round trip through the real API and Worker"
  - "All test share objects created during 03-08 deleted from the production bucket and confirmed gone via HeadObject and the live API"
affects: []

tech-stack:
  added: []
  patterns:
    - "Live verification scripts (live-smoke.mjs) take API_URL/APP_ORIGIN/EXPECT_VERSION as env, never hardcode the production host, and print CREATED <id> lines for downstream cleanup steps"
    - "One-off browser and cleanup scripts for live verification live in the session scratchpad (not the repo) when they are not reusable artifacts the plan asks to keep — apps/api/scripts/live-smoke.mjs is the one exception because the plan's own <files> list names it"

key-files:
  created: []
  modified: []

key-decisions:
  - "Playwright is not a repo dependency; installed transiently into the session scratchpad (pnpm add -D playwright + playwright install firefox) rather than touching apps/web/package.json or the workspace lockfile, per the plan's own scope (Task 3's <files> is 'none — deploy and verification only')."
  - "The HTTP verify one-liner (www 301 + CSP connect-src) was run via curl --resolve against IPs confirmed through Google's DoH resolver, because this execution environment's local DNS resolver held a stale/negative cache for www.characterdossierlab.app specifically (the apex and api.characterdossierlab.app resolved locally throughout). Public DoH and curl --resolve both confirmed the record is live and correct; this is an environment quirk, not a deployment defect."
  - "S3 cleanup credentials were used strictly as inline per-command process env (never exported, echoed, or written to any file); the cleanup script itself was placed transiently inside apps/api/ (to reuse its installed @aws-sdk/client-s3) and deleted immediately after the run, confirmed by a clean git status."

patterns-established: []

requirements-completed: [OPS-01, SEC-04, SHARE-01, SHARE-06, GATE-01]

coverage:
  - id: D1
    description: "https://api.characterdossierlab.app/healthz returns 200 {ok:true, version} where version equals the deployed commit sha"
    requirement: OPS-01
    verification:
      - kind: other
        ref: "apps/api/scripts/live-smoke.mjs run in Task 2 (commit 2833143); re-confirmed live this session via curl https://api.characterdossierlab.app/healthz -> {\"ok\":true,\"version\":\"74ace64d73694728c5805732e46264e790c42720\"}"
        status: pass
    human_judgment: false
  - id: D2
    description: "Live CORS: preflight from https://characterdossierlab.app is allowed; from https://evil.example gets no Access-Control-Allow-Origin"
    requirement: SEC-04
    verification:
      - kind: other
        ref: "apps/api/scripts/live-smoke.mjs (Task 2, commit 2833143) — CORS checks PASS"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live publish/read-back: header-only 201/200 with immutable Cache-Control and adult false; an intimacy-page publish reads back adult true; GET /v1/shares is 404"
    requirement: SHARE-01
    verification:
      - kind: other
        ref: "apps/api/scripts/live-smoke.mjs (Task 2, commit 2833143) — all publish/read-back checks PASS, two CREATED lines"
        status: pass
    human_judgment: false
  - id: D4
    description: "www.characterdossierlab.app redirects 301 to the apex; the apex serves the SPA with a CSP connect-src allowing the API origin"
    requirement: OPS-01
    verification:
      - kind: other
        ref: "curl --resolve www.characterdossierlab.app:443:104.21.90.127 https://www.characterdossierlab.app/c/x -> 301 to https://characterdossierlab.app/c/x; curl https://characterdossierlab.app/s/s0000000000000000000000000 -> 200, body has <cd-root>, content-security-policy header includes \"connect-src 'self' https://api.characterdossierlab.app\""
        status: pass
    human_judgment: false
  - id: D5
    description: "In a fresh browser context, an adult share at 400px shows only the content notice; after acknowledging, header+content render with zero form controls; reload skips the notice; a header-only share shows no notice; a malformed id shows the not-found page; publishing from the live UI opens read-only in a fresh context"
    requirement: SHARE-06
    verification:
      - kind: automated_ui
        ref: "playwright:screenshots/1-adult-notice.png, 2-adult-content.png, 3-header-only.png, 4-not-found.png, 5-share-dialog-select.png, 6-share-dialog-result.png, 7-published-open-fresh-context.png — all 6 scenario assertions PASS (script output: adult, headerOnly, notFound, publish, openFresh all PASS)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The Railway service runs exactly one instance, as the in-memory rate limiter planned for Phase 7 assumes"
    verification: []
    human_judgment: true
    rationale: "Replica count is a Railway dashboard setting, not visible or verifiable from the deployed API's HTTP surface or from the repo; the plan itself calls this a backstop the human confirms from the dashboard. Not yet explicitly confirmed by the user in this session — carried over as an open item from 03-07/03-08's tracked deviations."

duration: ~50min (Task 3 only, this continuation session)
completed: 2026-09-14
status: complete
---

# Phase 3 Plan 8: Live Deployment and End-to-End Verification Summary

**Phase 3 is live: apps/api runs on Railway behind api.characterdossierlab.app (health reports the deployed commit sha), the Angular SPA is deployed to Cloudflare Workers at characterdossierlab.app/www, and a Playwright-driven browser session proved the adult gate, header-only share, invalid-id error page, and a real publish-and-reopen round trip all work end-to-end against the live API.**

## Performance

- **Duration:** ~50 min (this continuation session, Task 3 only; Tasks 1-2 were completed in the prior session)
- **Completed:** 2026-09-14T23:35:00Z
- **Tasks:** 3 (1 human-action checkpoint, 2 auto — all three now complete across two sessions)
- **Files modified:** 0 in this session (Task 3 is deploy-and-verify only, no repository changes)

## Accomplishments

- Deployed `apps/web` to Cloudflare Workers with `pnpm --filter web wrangler:deploy`: built the Angular SPA, uploaded 13 assets, and attached both custom domain routes (`characterdossierlab.app`, `www.characterdossierlab.app`). Current Worker Version ID `4d1aa5fa-2278-47cd-ad6c-ede016237707`.
- Verified the live HTTP contract: `www.characterdossierlab.app/c/x` returns 301 to `https://characterdossierlab.app/c/x`; the apex `/s/<id>` returns 200 with `<cd-root>` in the body and a `content-security-policy` header whose `connect-src` includes `https://api.characterdossierlab.app`.
- Installed Playwright (firefox) into the session scratchpad (not a repo dependency) and ran a 6-scenario live browser check against the real deployment:
  1. Adult share at 400px width, fresh context: only the content notice renders (no `.share-bar`/`#page-header` behind it); after clicking "I am 18 or older" the header and Intimacy content render with **zero** `input`/`textarea`/`select` elements; reloading the page does not show the notice again (acknowledgement persisted in `localStorage`).
  2. Header-only share, fresh context: no content notice.
  3. `/s/notavalidid`, fresh context: shows "This link doesn't lead to a dossier."
  4. On `/`, created a real character, opened the Share dialog, published (header-only, since the new character has no pages), got "Link copied" and a `https://characterdossierlab.app/s/<id>` URL; opened that URL in a brand-new context and confirmed it renders read-only with zero form controls.
  - Screenshots: `/tmp/claude-1000/-home-vibrantclouds-Development-CharacterDossier/2f0d2b73-b309-4afb-b26c-b7461eb76d91/scratchpad/pw/screenshots/{1-adult-notice,2-adult-content,3-header-only,4-not-found,5-share-dialog-select,6-share-dialog-result,7-published-open-fresh-context}.png`
- Deleted every test share object created across Tasks 2 and 3 (5 ids total) from the production `character-dossier` bucket, and confirmed each is gone two ways: `HeadObjectCommand` returns 403 (no `ListBucket`, so "not found" surfaces as access-denied rather than a plain 404 — expected per the 03-07 IAM policy), and `GET https://api.characterdossierlab.app/v1/shares/<id>` returns 404 (checked with `cache: 'no-store'` against the live API, not a cached browser response).
- Re-confirmed `/healthz` still reports `{"ok":true,"version":"74ace64d73694728c5805732e46264e790c42720"}` at the end of this session — the Railway deployment has not drifted since Task 2.

## Task Commits

1. **Task 1: Create the Railway service, its variables and domain, the Cloudflare DNS record, and push the phase commits** — human action, no repository commit (Railway/Cloudflare dashboard configuration; `master` pushed at `74ace64d73694728c5805732e46264e790c42720`)
2. **Task 2: Live API smoke — health sha, CORS, publish and read-back** — `2833143` (feat)
3. **Task 3: Deploy the web app, verify the live share flow in a browser, clean up test shares** — no repository commit (deploy + verification only, per the plan's own `<files>none</files>`; confirmed `git status --short` clean after cleanup)

**Plan metadata:** committed separately after this SUMMARY (see below).

## Files Created/Modified

None in the repository this session. Artifacts produced live outside the repo:
- Cloudflare Worker deployment `character-dossier`, Version ID `4d1aa5fa-2278-47cd-ad6c-ede016237707`, routes `characterdossierlab.app` and `www.characterdossierlab.app`.
- Session scratchpad: `pw/live-check.js` (Playwright script), `pw/screenshots/*.png` (7 screenshots), `cleanup-shares.mjs` (S3 delete-and-confirm script) — all in `/tmp/claude-1000/.../scratchpad/`, not part of the repository.

## Decisions Made

- Playwright installed only into the scratchpad, not `apps/web`'s dependencies, because the plan scoped Task 3 as verification-only and the environment notes explicitly said not to modify `package.json`/the lockfile without a checkpoint. `firefox-1543` was freshly downloaded (the pre-existing `firefox-1509` cache didn't match this Playwright version's expected build).
- The plan's own HTTP verify one-liner (Node `fetch`) failed with `ENOTFOUND` for `www.characterdossierlab.app` specifically, even though `characterdossierlab.app` and `api.characterdossierlab.app` resolved fine on the same host throughout. Confirmed via Google's DNS-over-HTTPS resolver that the `www` A record is correct and live (same Cloudflare anycast IPs as the apex), so this is a local resolver cache/propagation quirk in this sandboxed environment, not a real DNS or deployment problem. Re-ran the equivalent check with `curl --resolve` pinned to the DoH-confirmed IP and it passed cleanly.
- The S3 cleanup script needed `@aws-sdk/client-s3` for module resolution, which is only installed under `apps/api/node_modules`. Rather than adding a new dependency anywhere, the script was copied in as a dot-prefixed temp file (`apps/api/.cleanup-shares-tmp.mjs`), run once, and deleted immediately; `git status --short` was checked clean afterward to confirm no trace was left in the repository.

## Deviations from Plan

### Auto-fixed Issues

None this session — Task 3 required no code changes, only deploy and live verification.

### Carried-over deviations (documented in prior 03-08/03-07 sessions, still open)

**1. Railway build path required an explicit `RAILWAY_DOCKERFILE_PATH` service variable**
- Railway ignored the repo's `railway.json` config-as-code and built with Railpack (failing with `TS2307` on `@dossier/schema`) until the user set `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile` as a service variable. The Dockerfile itself builds correctly from the repo root at commit `74ace64`. Follow-up: document this in `docs/specs/SPEC-deployment.md`'s Railway section (not done this session — out of Task 3's scope).

**2. `api.characterdossierlab.app` is Cloudflare-proxied, not DNS-only, contrary to D-15/T-03-08-03**
- The plan's threat model (`T-03-08-03`) assumed a DNS-only (grey-cloud) CNAME so Railway terminates TLS directly. The live record resolves to Cloudflare anycast IPs (`2606:4700:...`), meaning Cloudflare is proxying and terminating TLS in front of Railway. This works (valid TLS observed throughout Task 2 and this session), but it's a different trust boundary than the threat model assumed — see Threat Flags below. Still awaiting the user's explicit confirmation/decision on whether to switch to DNS-only or accept the proxied configuration.

**3. Production bucket is `character-dossier`, not `character-dossier-prod`**
- Carried from 03-07: the real bucket name differs from `SPEC-storage-s3`/`SPEC-deployment`/03-08's frontmatter. Not renamed (S3 names are immutable in place); cleanup and all Task 2/3 operations correctly used `character-dossier`. Follow-up: update the specs to match reality (not done this session — documentation-only, out of Task 3's scope).

**4. AWS CLI not installed — inline `@aws-sdk/client-s3` scripts used instead**
- Carried from 03-07, repeated this session for the Task 3 cleanup: no `aws` binary in this environment. Used an inline Node script against `@aws-sdk/client-s3`'s `DeleteObjectCommand`/`HeadObjectCommand` (same SDK the app itself depends on), functionally equivalent to `aws s3api delete-object`/`head-object`.

**5. Railway single-instance replica count — pending explicit user confirmation**
- The must-haves "backstop" truth (Railway runs exactly one instance, which the Phase 7 in-memory rate limiter will assume) cannot be verified from the deployed API's HTTP surface or the repository; it's a Railway dashboard setting only the user can confirm. Not claimed as verified — see coverage item D6 (`human_judgment: true`).

---

**Total deviations this session:** 0 auto-fixed (Task 3 needed no code changes). **5 deviations carried forward from prior sessions remain open as documented above**, none of which block Phase 3's live proof (all automated and browser checks pass against the deployment as actually configured).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: trust-boundary-shift | Cloudflare DNS (`api.characterdossierlab.app`) | T-03-08-03's mitigation assumed a DNS-only CNAME so Railway alone terminates TLS; the live record is Cloudflare-proxied, so Cloudflare terminates TLS and forwards to Railway. TLS is still valid end-to-end and no plaintext hop is introduced, but this adds Cloudflare's edge as a second party in the API's trust boundary that the original threat register didn't account for. Needs an explicit accept/mitigate decision from the user (switch to DNS-only, or accept and update T-03-08-03's disposition and rationale in the SPEC/threat register).

## Issues Encountered

- Local DNS resolver in this execution environment held a stale/negative cache specifically for `www.characterdossierlab.app` (apex and `api` subdomain resolved fine throughout). Worked around with `curl --resolve` pinned to an IP confirmed via Google's public DoH resolver; not a deployment defect.
- Installed Playwright's `firefox-1543` build fresh since the pre-existing cached `firefox-1509` build didn't match this Playwright version's expected executable path.

## User Setup Required

None further for this plan. Two items from the carried-over deviations above need a user decision/follow-up outside this session's scope:
1. Confirm (or change) whether `api.characterdossierlab.app` should be DNS-only per the original threat model, or accept the current Cloudflare-proxied configuration.
2. Confirm the Railway service's replica count is exactly 1 in the dashboard.

## Next Phase Readiness

- Phase 3's D-14 ("Phase 3 ends live") is proven: a real user can open `https://characterdossierlab.app`, create a character, publish a snapshot, and share the link; anyone opening that link sees a read-only, byte-identical view, gated when adult, served by the real production API and Worker.
- OPS-01, SEC-04, SHARE-01, SHARE-06, and GATE-01 all have live, end-to-end proof (not just unit/integration tests) for this phase's scope.
- All test data created during 03-08 has been removed from production; the bucket holds no leftover share objects from this verification work.
- Open items for a future session/phase: reconcile `SPEC-deployment.md`/`SPEC-storage-s3` with the real bucket name and Railway build-path variable; get explicit user sign-off on the Cloudflare-proxied API domain and the single-replica setting.

---
*Phase: 03-snapshot-share-end-to-end*
*Completed: 2026-09-14*

## Self-Check: PASSED

- FOUND: `.planning/phases/03-snapshot-share-end-to-end/03-08-SUMMARY.md`
- FOUND: commit `2833143` (Task 2) in `git log`
- FOUND: commit `74ace64` (Task 1's push) in `git log`
- FOUND: 7 Playwright screenshots in the session scratchpad (`pw/screenshots/*.png`)
- `git status --short` confirmed clean after the S3 cleanup temp script was removed
