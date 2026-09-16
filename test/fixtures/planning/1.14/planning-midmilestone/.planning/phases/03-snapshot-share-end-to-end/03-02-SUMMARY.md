---
phase: 03-snapshot-share-end-to-end
plan: 02
subsystem: api
tags: [hono, body-limit, cors, compress, zod, vitest]

requires:
  - phase: 03-snapshot-share-end-to-end
    provides: 03-01's Hono app (createApp/AppDeps), ObjectStore/MemoryObjectStore, share-object codec, tokens.ts, share wire contract and load-boundary functions in packages/schema
provides:
  - Full POST /v1/shares check order (body size, image manifest, blocked/missing/budget, collision-safe write)
  - Conditional GET /v1/shares/:id (304 on If-None-Match match)
  - CORS restricted to APP_ORIGIN (+ localhost:4200 in dev), response hardening, /healthz, validated env contract, token-free request logging
  - Characterization specs pinning GATE-02 aggregation and the share load-boundary in packages/schema
affects: [03-03, 03-04, 03-05, 03-06, 03-07, 03-08]

actuals:
  tokens: 14223
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Route-level bodyLimit(SHARE_PAYLOAD_BYTES_MAX) middleware on POST, ahead of c.req.json(), so an oversized body 413s before any parse or S3 call"
    - "Per-share image checks (manifest-hash-set equality, blocked/missing HEAD, byte-budget sum) all read through ObjectStore.head — the manifest's client-declared bytes field never drives the budget decision, only the actual S3 HEAD Content-Length does"
    - "Security-header middleware wraps next() in try/finally so nosniff/no-referrer still land on onError's 500 response, since Hono's onError is a top-level catch outside each middleware's own next() call"

key-files:
  created:
    - apps/api/src/routes/healthz.ts
    - apps/api/src/__tests__/tokens.spec.ts
    - apps/api/src/__tests__/cors.spec.ts
    - apps/api/src/__tests__/healthz.spec.ts
    - apps/api/src/__tests__/config.spec.ts
    - apps/api/src/__tests__/logging.spec.ts
    - packages/schema/src/__tests__/compute-adult.spec.ts
  modified:
    - apps/api/src/routes/shares.ts
    - apps/api/src/index.ts
    - apps/api/src/config.ts
    - apps/api/src/__tests__/shares.route.spec.ts
    - packages/schema/src/__tests__/migrate.spec.ts
    - packages/schema/src/__tests__/share.spec.ts

key-decisions:
  - "Task 1's specs pin already-correct 03-01 behavior (lookupPlugin's Object.hasOwn guard, migrateSubDocument's forced plugin.adult) — no production change to migrate.ts was needed; documented as characterization/pinning tests rather than forced RED, since fabricating a failure against already-correct code would have meant weakening the implementation just to get a red bar."
  - "BUDGET_EXCEEDED is proven via an actual oversized S3 object body (real HEAD Content-Length), not via payload.images[].bytes, because imageRefSchema caps that field at IMAGE_BYTES_MAX (1.5 MiB) per entry — the only way to exceed the 30 MiB share budget is for the route's own HEAD-derived total to exceed it, matching production reality (a client's declared bytes is untrusted)."
  - "ConfigError's message text changed from 'Invalid configuration: ' to 'invalid environment: ' to match the plan's literal spec text; still names only key names, never values."
  - "compress({ threshold: 0 }) — Hono's compress middleware default 1024-byte threshold would make the Content-Encoding gzip assertion depend on response body size; forcing threshold 0 keeps the test deterministic and matches SPEC-share-api §7's unconditional 'when negotiated' wording."

patterns-established:
  - "Pattern: TDD tasks in this phase where the target behavior already exists in an already-shipped file cannot honor strict RED-first (the test would need to be wrong to fail); the executor documents this explicitly rather than force a contrived failure — see Deviations."

requirements-completed: [SHARE-01, GATE-02, SEC-04, OPS-01]

coverage:
  - id: D1
    description: "GATE-02 aggregation and share load-boundary edges (computeAdult, collectAllImageRefs, validateSharePayload version-before-shape ordering, non-mutation) are pinned by characterization specs against 03-01's already-correct migrate.ts."
    requirement: GATE-02
    verification:
      - kind: unit
        ref: "packages/schema/src/__tests__/compute-adult.spec.ts (12 cases: computeAdult and collectAllImageRefs edges incl. 'constructor' and unknown types)"
        status: pass
      - kind: unit
        ref: "packages/schema/src/__tests__/migrate.spec.ts#describe('validateSharePayload') (10 cases: version-before-shape, adult recomputation, duplicate pages, exp range, non-mutation)"
        status: pass
      - kind: unit
        ref: "packages/schema/src/__tests__/share.spec.ts (SHARE_ID_RE adjacency, shareRecordSchema, shareCreateResponseSchema)"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /v1/shares enforces the full SPEC-share-api 4.1 check order before any write: 413 body size, 400 schema/kind/includedTypes, 422 version, 400 image manifest mismatch, 422 image blocked/missing, 422 budget exceeded, then the collision-safe write (3 retries, 500 on exhaustion, byte-identical pre-existing object)."
    requirement: SHARE-01
    verification:
      - kind: integration
        ref: "apps/api/src/__tests__/shares.route.spec.ts (26 cases covering the size limit, request schema, kind/includedTypes, manifest/blocked/missing/budget, and id-collision retry)"
        status: pass
      - kind: unit
        ref: "apps/api/src/__tests__/tokens.spec.ts (id/token generation distribution over 2000 samples, hashToken known-answer vector, timingSafeEqualHex, computeEtag shape)"
        status: pass
      - kind: other
        ref: "pnpm --filter api run smoke (built-output publish/read against dist/, unaffected by this plan's changes)"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /v1/shares/:id supports conditional revalidation: 304 with the same ETag and no body when If-None-Match matches; 200 otherwise; 404 for any malformed or unknown id, with the error envelope."
    requirement: SHARE-01
    verification:
      - kind: integration
        ref: "apps/api/src/__tests__/shares.route.spec.ts#describe('GET /v1/shares/:id — conditional revalidation')"
        status: pass
    human_judgment: false
  - id: D4
    description: "Browsers are answered with CORS restricted to exactly APP_ORIGIN (plus localhost:4200 in development), never '*' or a reflected origin; adjacency variants (trailing slash, scheme, port, www prefix) get no Access-Control-Allow-Origin; no collection-listing route exists."
    requirement: SEC-04
    verification:
      - kind: integration
        ref: "apps/api/src/__tests__/cors.spec.ts (preflight, actual-request exposure, 5 adjacency-rejection cases, dev-only localhost, no-Origin passthrough)"
        status: pass
      - kind: other
        ref: "rg -n \"\\.get\\(\\s*'/'\" apps/api/src/routes/shares.ts (no output — no collection GET route)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every response carries X-Content-Type-Options nosniff and Referrer-Policy no-referrer (including the 500 path), never Set-Cookie or Access-Control-Allow-Credentials; gzip is applied when negotiated."
    requirement: SEC-04
    verification:
      - kind: integration
        ref: "apps/api/src/__tests__/cors.spec.ts#describe('response hardening')"
        status: pass
    human_judgment: false
  - id: D6
    description: "GET /healthz returns 200 {ok:true, version} with Cache-Control no-store and no auth; GET /v1/healthz 404s; loadConfig validates the full Railway env contract, rejecting a bad APP_ORIGIN shape, RATE_LIMIT_DISABLED=1 in production, and any missing/invalid key by name only, never leaking a secret value."
    requirement: OPS-01
    verification:
      - kind: unit
        ref: "apps/api/src/__tests__/healthz.spec.ts (3 cases)"
        status: pass
      - kind: unit
        ref: "apps/api/src/__tests__/config.spec.ts (12 cases: full valid env, each of 9 required keys removed, APP_ORIGIN shape, RATE_LIMIT_DISABLED/production, secret-free message)"
        status: pass
    human_judgment: false
  - id: D7
    description: "SHARE-01 privacy prohibition: request logs never carry a share id, owner token, Authorization header, or payload content — only the route pattern, method, status and duration."
    requirement: SHARE-01
    verification:
      - kind: integration
        ref: "apps/api/src/__tests__/logging.spec.ts#never logs the owner token, share id, or payload name, and records the route pattern"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-14
status: complete
---

# Phase 3 Plan 2: Snapshot Share Hardening (POST Check Order, CORS, Health, Env Contract) Summary

**The Phase 3 API is now spec-complete: every POST /v1/shares check runs in the SPEC-share-api 4.1 order before any write (body size, schema, version, image manifest/blocked/missing/budget, collision-safe id), GET supports 304 revalidation, CORS is locked to the app origin, every response is hardened, /healthz answers, the Railway env contract is validated with no secret leakage, and request logs never carry a share id, token or payload text.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-14T19:34:57Z (03-01 handoff)
- **Completed:** 2026-09-14T19:49:22Z
- **Tasks:** 3
- **Files modified:** 13 (7 created, 6 modified)

## Accomplishments

- `packages/schema`: `compute-adult.spec.ts` (new) plus extended `migrate.spec.ts`/`share.spec.ts` pin GATE-02's aggregation and the share load-boundary's version-before-shape ordering, adult recomputation, duplicate-page rejection, out-of-range `exp` rejection and input non-mutation — all already correct from 03-01, so no `migrate.ts` change was needed.
- `apps/api/src/routes/shares.ts`: `bodyLimit` before JSON parse (413), the image-manifest-equality check (400 `IMAGE_MANIFEST_MISMATCH`), parallel blocked/missing HEAD checks (422 `IMAGE_BLOCKED`/`IMAGE_MISSING`), the real byte-budget check from HEAD `Content-Length` (422 `BUDGET_EXCEEDED`), and conditional `GET` (304 on `If-None-Match` match). The pre-existing collision-retry loop and request-schema/kind/includedTypes checks from 03-01 are unchanged.
- `apps/api/src/index.ts`: security-header middleware (nosniff, no-referrer, alive through `onError`), `cors` with an exact-match origin function (never `'*'`, never reflected), `compress()`, and a request-log middleware that logs only `{method, route, status, ms}`.
- `apps/api/src/routes/healthz.ts` (new): `GET /healthz` → `{ok, version}`, `Cache-Control: no-store`.
- `apps/api/src/config.ts`: `ConfigError` message text aligned to `'invalid environment: <keys>'`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin the shared share-contract edges in the schema package** — `3b752a8` (test)
2. **Task 2: Complete the POST /shares check order, collision retry and conditional GET** — `7f47d12` (feat)
3. **Task 3: CORS restricted to the app origin, response hardening, /healthz, env contract and token-free logging** — `e304a2b` (feat)

**Plan metadata:** committed separately after this SUMMARY (see below).

## Files Created/Modified

- `packages/schema/src/__tests__/compute-adult.spec.ts` — computeAdult/collectAllImageRefs edges
- `packages/schema/src/__tests__/migrate.spec.ts` — `validateSharePayload` describe block
- `packages/schema/src/__tests__/share.spec.ts` — `SHARE_ID_RE`, `shareRecordSchema`, `shareCreateResponseSchema` cases
- `apps/api/src/routes/shares.ts` — full POST check order, conditional GET
- `apps/api/src/__tests__/shares.route.spec.ts` — 26 route specs (size, schema, manifest, blocked/missing/budget, collision, conditional GET)
- `apps/api/src/__tests__/tokens.spec.ts` (new) — id/token distribution, known-answer hash, timing-safe compare, etag shape
- `apps/api/src/index.ts` — headers/cors/compress/logging middleware, route mounting
- `apps/api/src/routes/healthz.ts` (new) — `createHealthRoutes`
- `apps/api/src/config.ts` — `ConfigError` message text
- `apps/api/src/__tests__/cors.spec.ts` (new) — preflight, adjacency, hardening, gzip
- `apps/api/src/__tests__/healthz.spec.ts` (new) — health contract
- `apps/api/src/__tests__/config.spec.ts` (new) — env contract
- `apps/api/src/__tests__/logging.spec.ts` (new) — token-free logging proof

## Decisions Made

- Task 1's specs are characterization/pinning tests, not new-feature TDD — see Deviations.
- `BUDGET_EXCEEDED` is proven via a real oversized S3 object body rather than an inflated `payload.images[].bytes`, since `imageRefSchema` caps that field at `IMAGE_BYTES_MAX` per entry; the route's budget decision correctly reads only the actual HEAD `Content-Length`, never the client's self-reported size.
- `compress({ threshold: 0 })` forces unconditional gzip negotiation so the `Content-Encoding` assertion doesn't depend on a share's JSON size crossing Hono's default 1024-byte threshold.
- `ConfigError` message changed to `'invalid environment: '` (lowercase, matching the plan's literal text) while keeping the existing names-only, no-values security posture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `structuredClone` has no ambient type in the schema package's `lib: ["ES2022"]`**
- **Found during:** Task 1 (`migrate.spec.ts`'s non-mutation test)
- **Issue:** `tsc` failed with `TS2304: Cannot find name 'structuredClone'` — the package's tsconfig has no `dom`/`webworker` lib, so the global (available at runtime on Node 17+) has no type declaration.
- **Fix:** Added a local `declare const structuredClone: <T>(value: T) => T;` ambient declaration in the test file.
- **Files modified:** `packages/schema/src/__tests__/migrate.spec.ts`
- **Verification:** `pnpm --filter @dossier/schema run typecheck` passes; test still asserts real deep-clone semantics (not JSON round-trip).
- **Committed in:** `3b752a8` (Task 1 commit)

**2. [Rule 3 - Blocking] `imageRefSchema.bytes` cap made the first `BUDGET_EXCEEDED` test construction invalid**
- **Found during:** Task 2 (image budget test)
- **Issue:** The initial test set `payload.images[0].bytes` to `SHARE_IMAGE_BYTES_MAX + 1` to trigger the route's budget check, but `imageRefSchema` caps `bytes` at `IMAGE_BYTES_MAX` (1.5 MiB) per manifest entry, so the payload failed schema validation (400) before reaching the route's HEAD-based budget logic (422).
- **Fix:** Kept the manifest's declared `bytes` small (within cap) and instead seeded the `MemoryObjectStore` with an actual oversized body, so the route's real `HEAD Content-Length` sum triggers `BUDGET_EXCEEDED` — matching how the check works against real S3 objects in production.
- **Files modified:** `apps/api/src/__tests__/shares.route.spec.ts`
- **Verification:** Test passes with status 422 and `details: {bytes, limit}` as specified.
- **Committed in:** `7f47d12` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking). **Impact on plan:** Both fixes were needed to make the tests compile and correctly exercise the intended behavior; no scope creep, no production logic added beyond the plan's spec.

### Note: TDD process deviation (not a Rule 1-4 item)

Tasks 2 and 3 were developed with specs and implementation in the same edit pass rather than a strict manual RED phase followed by a separate GREEN commit, given: (a) `.planning/config.json` has `workflow.tdd_mode: false` (no gate enforcement is active for this project), (b) STATE.md already flags that this project's Vitest `tap-flat` reporter can't produce the `node --test`-style TAP13 summary `gsd_run check tdd-red-evidence` expects, so RED evidence would need to be hand-appended regardless, and (c) the check-order surface for Tasks 2/3 is large (20+ new behaviors across 2 files). For every new assertion, the corresponding production code was absent or incomplete in 03-01's shares.ts/index.ts, so a genuine failure existed at the point the spec was authored — this was verified by inspection of the pre-Task-2/3 file contents, not by re-running the tests against reverted code. Task 1's specs, by contrast, target behavior 03-01 already implemented correctly (see Decisions) — no RED was possible there without weakening the spec, so those are documented as pinning tests rather than forced TDD.

## Issues Encountered

None beyond the two auto-fixed items above.

## User Setup Required

None — no external service configuration required. The env contract (`loadConfig`) is exercised only by unit tests against synthetic `Record<string,string>` inputs; real Railway env setup remains scoped to 03-03 (server entrypoint).

## Next Phase Readiness

- SHARE-01 (full publish check order + immutable, revalidatable read), GATE-02 (pinned aggregation edges), SEC-04 (CORS lockdown + response hardening + no listing route) and OPS-01 (health + env contract) are all complete for the API surface this phase owns.
- 03-03 can add the S3-backed `ObjectStore` and the `@hono/node-server` entrypoint against the same `AppDeps`/`createApp` surface — no shape changes were made to `AppDeps`, `ObjectStore`, or the share wire contract in this plan.
- Rate limiting (`429 RATE_LIMITED`, SPEC-share-api §5) and `PUT`/`DELETE /shares/:id` (Bearer auth, `timingSafeEqualHex` already exported for this) remain out of scope for this plan, per the Flagged Assumptions in 03-02-PLAN.md — tracked for their respective later plans in this phase.
- No blockers.

---
*Phase: 03-snapshot-share-end-to-end*
*Completed: 2026-09-14*

## Self-Check: PASSED
