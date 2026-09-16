---
phase: 03-snapshot-share-end-to-end
plan: 03
subsystem: api
tags: [aws-sdk-client-s3, pino, hono-node-server, docker, minio, railway]

requires:
  - phase: 03-snapshot-share-end-to-end
    provides: 03-01's ObjectStore interface, AppConfig/loadConfig, createApp/AppDeps; 03-02's full route check order, CORS, response hardening, /healthz
provides:
  - S3ObjectStore (real S3 + MinIO via S3_ENDPOINT) implementing the ObjectStore interface with IfNoneMatch conditional create and list-less 403/404 missing-key handling
  - Node server entrypoint (server.ts) validating env on boot and serving via @hono/node-server
  - pino logger with redaction (defense in depth)
  - Root docker-compose.yml (MinIO + bucket bootstrap) and minio:up/dev scripts
  - apps/api Dockerfile, railway.json and a container smoke script proving the deployable image
affects: [03-04, 03-05, 03-06, 03-07, 03-08]

actuals:
  tokens: 6860
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "S3ObjectStore classifies AWS SDK v3 errors purely by err.$metadata.httpStatusCode (412/409 -> putIfAbsent false, 404/403 -> get/head null); no S3ServiceException subclass matching"
    - "Integration specs that build AppConfig via loadConfig({...process.env, <fixed keys>}) must spread process.env FIRST and put every fixed/deterministic key LAST — Vitest sets NODE_ENV='test' on process.env, which is outside the config schema's enum and silently wins if the fixed keys are spread first"
    - "container-smoke.mjs reuses apps/api/scripts/smoke.mjs's record()/PASS-FAIL convention for a Docker-level (not app-level) proof"

key-files:
  created:
    - apps/api/src/s3.ts
    - apps/api/src/__tests__/s3.spec.ts
    - apps/api/src/logger.ts
    - apps/api/src/server.ts
    - apps/api/src/__tests__/s3.integration.spec.ts
    - docker-compose.yml
    - apps/api/.env.example
    - apps/api/Dockerfile
    - .dockerignore
    - apps/api/railway.json
    - apps/api/scripts/container-smoke.mjs
  modified:
    - apps/api/package.json
    - .gitignore
    - package.json
    - apps/web/package.json

key-decisions:
  - "S3ObjectStore constructor takes (client: S3Client, bucket: string) directly rather than an options object, matching the plan's interface spec; createS3ObjectStore(config) is the only place that builds the real S3Client."
  - "container-smoke.mjs hardcodes the MinIO env values (mirroring .env.example) rather than parsing the file at runtime, keeping the smoke script dependency-free and matching apps/api/scripts/smoke.mjs's existing no-dependency convention."

patterns-established:
  - "Pattern: s3.integration.spec.ts's beforeAll defers loadConfig/createS3ObjectStore construction so describe.skipIf(!RUN) actually skips setup, not just test bodies — Vitest still executes a skipped describe's callback body during collection."

requirements-completed: [OPS-01, SEC-04]

coverage:
  - id: D1
    description: "S3ObjectStore.putIfAbsent sends IfNoneMatch '*' on every create; a 412 PreconditionFailed or 409 ConditionalRequestConflict resolves false (never overwrites), other errors propagate."
    requirement: SEC-04
    verification:
      - kind: unit
        ref: "apps/api/src/__tests__/s3.spec.ts#S3ObjectStore > putIfAbsent"
        status: pass
      - kind: integration
        ref: "apps/api/src/__tests__/s3.integration.spec.ts#putIfAbsent resolves true, then false for the same key"
        status: pass
    human_judgment: false
  - id: D2
    description: "S3ObjectStore.get and .head return null for 404 and for 403 AccessDenied (the API credential has no list permission, so a missing key answers 403); no ListObjects/ListBucket call exists anywhere in s3.ts, object-store.ts or routes."
    requirement: SEC-04
    verification:
      - kind: unit
        ref: "apps/api/src/__tests__/s3.spec.ts#S3ObjectStore > get and > head (404/403 cases)"
        status: pass
      - kind: other
        ref: "rg -q 'ListObjects|ListBucket' apps/api/src/s3.ts apps/api/src/object-store.ts apps/api/src/routes (exit 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The opt-in integration spec proves put-if-absent, conditional-put refusal, get with gzip encoding and metadata, head, delete-then-null, a never-written key, and a POST-then-GET round trip through createApp — all against real MinIO; it is skipped (not run) under plain pnpm test, which needs no Docker."
    requirement: SEC-04
    verification:
      - kind: integration
        ref: "apps/api/src/__tests__/s3.integration.spec.ts (6 cases, run with RUN_S3_INTEGRATION=1 against docker compose MinIO)"
        status: pass
      - kind: other
        ref: "pnpm --filter api exec vitest run reports the integration file as 1 skipped test file with no RUN_S3_INTEGRATION set"
        status: pass
    human_judgment: false
  - id: D4
    description: "The built server (dist/server.js) exits non-zero and prints 'invalid environment: <keys>' (names only) to stderr when started without its env contract."
    requirement: OPS-01
    verification:
      - kind: other
        ref: "node -e spawnSync boot check against apps/api/dist/server.js with no env: status 1, stderr matches /invalid environment: .*APP_ORIGIN/"
        status: pass
    human_judgment: false
  - id: D5
    description: "The API container image builds from the repo root with apps/api/Dockerfile, refuses to boot without env (non-zero exit), and once started against MinIO answers GET /v1/shares/<unknown> with a 404 NOT_FOUND envelope carrying X-Content-Type-Options; the container is always removed afterward."
    requirement: OPS-01
    verification:
      - kind: other
        ref: "node apps/api/scripts/container-smoke.mjs — 5 PASS lines (build, boot-refusal, container start, 404 envelope, hardening header), 0 FAIL"
        status: pass
      - kind: other
        ref: "docker ps -a --format '{{.Image}}' | rg -q character-dossier-api:local (exit 1 — no leftover container)"
        status: pass
    human_judgment: false
  - id: D6
    description: "apps/api/railway.json selects the DOCKERFILE builder with dockerfilePath apps/api/Dockerfile, and sets healthcheckPath /healthz with restartPolicyType ON_FAILURE."
    requirement: OPS-01
    verification:
      - kind: other
        ref: "node -e assertion against require('./apps/api/railway.json') (builder/healthcheckPath/restartPolicyType)"
        status: pass
    human_judgment: false
  - id: D7
    description: "apps/api/.env.example lists every SPEC-deployment §4 env-contract key (12 total, matching config.ts's envSchema exactly) with MinIO-local placeholder values; .env and .env.* are git-ignored except .env.example, verified by git check-ignore."
    requirement: OPS-01
    verification:
      - kind: other
        ref: "grep -cE '^[A-Za-z_][A-Za-z0-9_]*=' apps/api/.env.example == 12, keys match envSchema exactly; git check-ignore -q apps/api/.env exits 0"
        status: pass
    human_judgment: false

duration: 46min
completed: 2026-09-14
status: complete
---

# Phase 3 Plan 3: S3-Backed Storage, Server Entrypoint and Deployment Artifacts Summary

**A real S3ObjectStore (IfNoneMatch conditional create, list-less 403-as-missing) now backs the API, with a Node/Hono server entrypoint that validates its env contract on boot, MinIO local dev via docker-compose, an opt-in S3 integration spec, and a reproducible Docker image plus Railway config-as-code proven by a container-level smoke test.**

## Performance

- **Duration:** 46 min
- **Started:** 2026-09-14T15:55:00Z
- **Completed:** 2026-09-14T16:41:00Z
- **Tasks:** 3
- **Files modified:** 15 (11 created, 4 modified)

## Accomplishments

- `apps/api/src/s3.ts`: `s3ClientConfig` (plain S3 vs. MinIO/`S3_ENDPOINT` with `forcePathStyle`/checksum overrides), `S3ObjectStore` implementing the `ObjectStore` interface (`get`/`putIfAbsent`/`head`/`delete`) with AWS SDK v3 error classification purely on `$metadata.httpStatusCode`, and `createS3ObjectStore(config)`. No list command anywhere in this file.
- `apps/api/src/server.ts` + `logger.ts`: boot-time `loadConfig` with a non-zero exit and names-only stderr message on failure, a redacting pino logger, `@hono/node-server` `serve` on `0.0.0.0`, and graceful `SIGTERM`/`SIGINT` shutdown.
- Root `docker-compose.yml` (pinned `quay.io/minio/minio` + `quay.io/minio/mc` sidecar) creates the `character-dossier-dev` bucket via `pnpm run minio:up`; root `dev` now runs schema build then web+api in parallel.
- `apps/api/.env.example` (all 12 env-contract keys) and `.gitignore` (`.env`/`.env.*` except `.env.example`).
- `apps/api/src/__tests__/s3.integration.spec.ts`: opt-in (`RUN_S3_INTEGRATION=1`) proof against real MinIO, including a full `POST`-then-`GET` round trip through `createApp`.
- `apps/api/Dockerfile` (repo-root build context, `pnpm install --frozen-lockfile --filter "api..."`, `USER node`), `.dockerignore`, `apps/api/railway.json` (Dockerfile builder, `/healthz`, `ON_FAILURE` restart), and `container-smoke.mjs` proving the built image boots, refuses a bad environment, and serves the share routes.

## Task Commits

Each task was committed atomically (Task 1 as a genuine RED-then-GREEN TDD pair):

1. **Task 1: S3-backed ObjectStore with conditional create and list-less missing-key handling** — `d06710f` (test, RED — module-not-found against the not-yet-created `s3.ts`), `071b8cd` (feat, GREEN — all 14 tests pass)
2. **Task 2: Server entrypoint, pino logger, MinIO compose and the opt-in S3 integration spec** — `0b9bc0a` (feat)
3. **Task 3: API container image, Railway config-as-code and a container smoke** — `929f77a` (feat)

**Plan metadata:** committed separately after this SUMMARY (see below).

## Files Created/Modified

- `apps/api/src/s3.ts` — `s3ClientConfig`, `S3ObjectStore`, `createS3ObjectStore`
- `apps/api/src/__tests__/s3.spec.ts` — 14 unit specs against a fake `S3Client`
- `apps/api/src/logger.ts` — `createLogger` (pino, redacted)
- `apps/api/src/server.ts` — Node entrypoint (config, logger, S3 store, serve, shutdown)
- `apps/api/src/__tests__/s3.integration.spec.ts` — opt-in MinIO/S3 integration spec (7 cases, 1 conditional on `EXPECT_LIST_DENIED`)
- `docker-compose.yml` — `minio` + `createbuckets` services
- `apps/api/.env.example` — 12-key env contract with MinIO-local values
- `apps/api/Dockerfile` — repo-root-context production image
- `.dockerignore` — build-context exclusions
- `apps/api/railway.json` — Railway config-as-code
- `apps/api/scripts/container-smoke.mjs` — Docker-level PASS/FAIL smoke
- `apps/api/package.json` — `dev`, `start`, `test:s3`, `smoke:container` scripts
- `.gitignore` — `.env`/`.env.*` ignore with `.env.example` exception
- `package.json` (root) — `minio:up`, updated `dev`
- `apps/web/package.json` — `dev` alias for `start`

## Decisions Made

- `S3ObjectStore`'s error classification reads only `err.$metadata.httpStatusCode` (no per-exception-class matching), since the AWS SDK v3 base `S3ServiceException` and MinIO's SDK-compatible error responses both populate that field consistently — simpler and equally correct for the 412/409/404/403 cases this store needs.
- `container-smoke.mjs` hardcodes the MinIO env block (matching `.env.example`) instead of parsing the file at runtime, keeping it dependency-free like the existing `smoke.mjs`.
- Verified the plan's Flagged Assumption directly: `tsx watch --env-file=.env src/server.ts` does forward Node's `--env-file` (confirmed live — the server logged `"listening"` on port 3000 with only `.env` values, no other env set), so no fallback to `node --env-file=.env --import tsx --watch` was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Integration spec's config spread order let Vitest's own `NODE_ENV=test` leak through**
- **Found during:** Task 2 (`s3.integration.spec.ts`, first MinIO run)
- **Issue:** The plan's literal recipe (`loadConfig({ NODE_ENV: 'development', ..., ...process.env })`) spreads `process.env` last, so Vitest's own `NODE_ENV='test'` (set automatically by the test runner, outside the config schema's `['development','production']` enum) silently overrode the fixed `'development'` value, failing `loadConfig` with `ConfigError: invalid environment: NODE_ENV`.
- **Fix:** Reversed the spread order — `{ ...process.env, NODE_ENV: 'development', PORT: '3000', APP_ORIGIN: ..., IMG_BASE_URL: ..., TRUST_PROXY: '0' }` — so the five deterministic keys always win, while `S3_ENDPOINT`/`S3_BUCKET`/`S3_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` still come from the shell exactly as the plan's `<verify>` command supplies them.
- **Files modified:** `apps/api/src/__tests__/s3.integration.spec.ts`
- **Verification:** `RUN_S3_INTEGRATION=1 S3_ENDPOINT=... pnpm --filter api exec vitest run src/__tests__/s3.integration.spec.ts` passes (6 of 7; the 7th is conditional on `EXPECT_LIST_DENIED`, correctly skipped against MinIO).
- **Committed in:** `0b9bc0a` (Task 2 commit)

**2. [Rule 3 - Blocking] `describe.skipIf` still executes the describe callback body during collection**
- **Found during:** Task 2 (same spec, same run)
- **Issue:** Building `config`/`store` at the top of the `describe.skipIf(!RUN)` callback body ran `loadConfig` even when the suite was meant to be skipped (`describe.skipIf` only marks the registered *tests* skipped — it still executes the surrounding function to register them), breaking plain `pnpm test` with no `RUN_S3_INTEGRATION` set.
- **Fix:** Moved `loadConfig`/`createS3ObjectStore` into a `beforeAll` hook (which Vitest does correctly skip alongside the tests), with `config`/`store` declared as `let` above it.
- **Files modified:** `apps/api/src/__tests__/s3.integration.spec.ts`
- **Verification:** `pnpm --filter api exec vitest run` (no Docker, no `RUN_S3_INTEGRATION`) reports the file as 1 skipped test file, 0 failures.
- **Committed in:** `0b9bc0a` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking). **Impact on plan:** Both were needed to make the opt-in integration spec actually opt-in and correct; no production `s3.ts`/`server.ts` logic changed as a result — only the test's own setup.

## Issues Encountered

- **Task 2 acceptance criterion regex undercounts `.env.example`'s key lines.** The acceptance criterion `rg -c '^[A-Z_]+=' apps/api/.env.example` prints 12 (`[A-Z_]+` excludes digits), but `apps/api/.env.example` correctly contains all 12 SPEC-deployment §4 keys — three of them (`S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`) contain the digit `3`, which `[A-Z_]` does not match, so the actual count against the file as written is 9. These key names are fixed by `config.ts`'s `envSchema` (shipped in 03-01) and cannot be renamed without an architectural change to an already-tested config contract. Verified equivalence instead: `grep -cE '^[A-Za-z_][A-Za-z0-9_]*=' apps/api/.env.example` returns 12, and the key list matches `envSchema`'s 12 keys exactly (`NODE_ENV`, `PORT`, `APP_ORIGIN`, `IMG_BASE_URL`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `TRUST_PROXY`, `RATE_LIMIT_DISABLED`, `LOG_LEVEL`). Not logged as a code deviation since no file content needed to change — the acceptance criterion's regex itself doesn't account for digits in AWS-style env var names.

## User Setup Required

None — no external service configuration required this plan. MinIO is fully driven by `pnpm run minio:up`; Railway/AWS/Cloudflare human checkpoints (D-14) are scoped to 03-08.

## Next Phase Readiness

- OPS-01 (runnable server, validated env contract, health check, Railway config) and SEC-04 (conditional writes, list-less missing-key handling proven both unit-level and against real MinIO) are complete for this plan's scope.
- 03-07 can reuse `s3.integration.spec.ts`'s `EXPECT_LIST_DENIED` case directly against real AWS to prove the IAM policy has no `ListBucket`.
- 03-08 can point Railway's service config file path at `/apps/api/railway.json` and deploy `apps/api/Dockerfile` as-is; the container smoke script doubles as a pre-deploy sanity check.
- No blockers.

---
*Phase: 03-snapshot-share-end-to-end*
*Completed: 2026-09-14*

## Self-Check: PASSED

All 11 created files verified present on disk; commits `d06710f`, `071b8cd`, `0b9bc0a`, `929f77a` verified in `git log`.
