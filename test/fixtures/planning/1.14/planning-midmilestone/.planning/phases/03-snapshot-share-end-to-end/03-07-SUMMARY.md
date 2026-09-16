---
phase: 03-snapshot-share-end-to-end
plan: 07
subsystem: infra
tags: [aws-s3, iam, aws-sdk-client-s3]

requires:
  - phase: 03-snapshot-share-end-to-end
    provides: "03-03's S3ObjectStore, s3.integration.spec.ts (EXPECT_LIST_DENIED case) and SPEC-storage-s3 IAM policy JSON"
provides:
  - "A live, verified production S3 bucket (character-dossier, us-west-2) and least-privilege IAM credential for character-dossier-api, proven against real AWS: object operations succeed, bucket listing is denied"
affects: [03-08]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Production bucket is named character-dossier, not character-dossier-prod as SPEC-storage-s3/SPEC-deployment/03-08 specify — the bucket already existed under this name and the user updated the IAM inline policy ARNs to match rather than renaming the bucket (S3 bucket names are immutable; renaming means create+migrate+delete). SPEC-storage-s3 §1/§5, SPEC-deployment, and 03-08's S3_BUCKET value must be updated to character-dossier before/during 03-08."
  - "AWS CLI is not installed in this environment; the plan's independent CLI list-denial check (task 2, verify command 2) was substituted with an equivalent inline Node script using @aws-sdk/client-s3's ListObjectsV2Command, asserting err.name === 'AccessDenied' and $metadata.httpStatusCode === 403 — functionally identical proof, no AWS CLI dependency added to the repo."

patterns-established: []

requirements-completed: [SEC-04]

coverage:
  - id: D1
    description: "The API credential can putIfAbsent/get/head/delete under shares/, get/head of a missing key return null (403 handled), and a POST-then-GET round trip through createApp succeeds — all proven live against the real character-dossier bucket, with test objects cleaned up by the spec's afterAll."
    requirement: SEC-04
    verification:
      - kind: integration
        ref: "apps/api/src/__tests__/s3.integration.spec.ts (RUN_S3_INTEGRATION=1, real AWS, character-dossier/us-west-2) — 7 passed (7)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The API credential is denied bucket listing on the real production bucket: ListObjectsV2 returns AccessDenied/403, proven twice independently — once inside the integration spec's EXPECT_LIST_DENIED case and once via a standalone Node script using the same SDK command."
    requirement: SEC-04
    verification:
      - kind: integration
        ref: "apps/api/src/__tests__/s3.integration.spec.ts#a raw list-objects-v2 call on the bucket is denied (SEC-04, run against real AWS in 03-07) — pass"
        status: pass
      - kind: other
        ref: "inline node --input-type=module ListObjectsV2Command script against character-dossier: err.name=AccessDenied, $metadata.httpStatusCode=403 — PASS"
        status: pass
    human_judgment: false

duration: ~20min (Task 2 verification only; Task 1 console setup happened in a prior session)
completed: 2026-09-14
status: complete
---

# Phase 3 Plan 7: Production S3 Bucket and API IAM Credential Verification Summary

**Verified the real production S3 bucket `character-dossier` (us-west-2, not the SPEC's `character-dossier-prod`) and the `character-dossier-api` IAM credential live: all object operations (put-if-absent, get, head, delete, missing-key-as-null, full POST/GET round trip through createApp) succeed, and bucket listing is denied twice over — proving SEC-04's "S3 credentials can't list the bucket" on the real account.**

## Performance

- **Duration:** ~20 min (this continuation session; Task 1's AWS console setup was completed in an earlier session)
- **Completed:** 2026-09-14T22:52:20Z
- **Tasks:** 2 (Task 1: checkpoint:human-action, completed previously; Task 2: auto, completed this session)
- **Files modified:** 0 (verification-only plan; no repository files change)

## Accomplishments

- Confirmed the real production bucket exists as `character-dossier` in `us-west-2` (not `character-dossier-prod` as named in SPEC-storage-s3/SPEC-deployment/03-08) and that the `character-dossier-api` IAM user's inline policy ARNs were updated by the user to target it.
- Ran `apps/api/src/__tests__/s3.integration.spec.ts` with `RUN_S3_INTEGRATION=1 EXPECT_LIST_DENIED=1` against real AWS (`S3_BUCKET=character-dossier S3_REGION=us-west-2`, no `S3_ENDPOINT`): **7 passed (7)**, 0 skipped, 0 failed. Covers putIfAbsent conditional-create (true then false), get (bytes + gzip encoding + metadata), head (content length), get/head of a never-written key (null), delete-then-get (null), a full POST-then-GET round trip through `createApp`, and the list-denial assertion.
- Independently re-verified list denial with a standalone Node script (no test framework) issuing a raw `ListObjectsV2Command` against `character-dossier` with `MaxKeys: 1`: received `AccessDenied` / HTTP 403, confirming the IAM policy has no `s3:ListBucket` permission — SEC-04 proven twice, by two independent code paths.
- Confirmed `git status --porcelain` is clean after both verification runs — no credential material, `.env` file, or other artifact was written to the repository at any point.
- Confirmed the integration spec's `afterAll` deleted every key it wrote (`putIfAbsent`/`get`/`head`/`delete` test keys plus the `createApp` POST's generated share key) — no leftover test objects in the production bucket.

## Task Commits

No commits this plan — verification-only (Task 1 was a human console action with no repo changes; Task 2 ran read/write-then-cleanup operations against the real bucket, leaving the repository unchanged). Only this SUMMARY and the plan-metadata commit follow.

## Files Created/Modified

None — this plan verifies external AWS infrastructure; no repository files are created or modified per plan design.

## Decisions Made

- **Bucket name deviation accepted as-is, not renamed.** The real bucket is `character-dossier`; SPEC-storage-s3, SPEC-deployment, and plan 03-08 all reference `character-dossier-prod`. S3 bucket names cannot be renamed in place, and the bucket already existed with production configuration and the user's IAM policy update targeting it — renaming would require creating a second bucket, migrating objects, and updating the policy again for no benefit. The specs and 03-08 must be updated to `character-dossier` instead. This is a **follow-up required before or during 03-08**, since 03-08 provisions Railway's `S3_BUCKET` environment variable from the SPEC value.
- **AWS CLI substitution for the independent list-denial check.** The environment has no AWS CLI installed. Used an inline `node --input-type=module` script issuing `ListObjectsV2Command` via `@aws-sdk/client-s3` (already a dependency of `apps/api`) with credentials passed as per-command inline environment variables only, asserting `err.name === 'AccessDenied'` and `err.$metadata.httpStatusCode === 403`. This is functionally equivalent to the plan's `aws s3api list-objects-v2 ... | rg -q 'AccessDenied'` check and required no new dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Substituted AWS CLI list-denial check with an equivalent inline Node/SDK script**
- **Found during:** Task 2, verify command 2 (`aws s3api list-objects-v2 ...`)
- **Issue:** AWS CLI v2 is not installed in this environment, despite the plan's `<interfaces>` section stating "AWS CLI v2 is installed locally."
- **Fix:** Ran an inline `node --input-type=module -e "..."` script using `@aws-sdk/client-s3`'s `ListObjectsV2Command` (same SDK the integration spec already uses) with credentials supplied as per-command inline env vars only, asserting `err.name === 'AccessDenied'` / `$metadata.httpStatusCode === 403`.
- **Files modified:** none (ad hoc script run via Bash, not persisted to the repository)
- **Verification:** Script printed `name: AccessDenied`, `httpStatusCode: 403`, `PASS: list denied as expected`.
- **Committed in:** n/a (no repository files changed)

**2. [Bucket name mismatch — carried over from Task 1, documented here per plan instruction]**
- **Found during:** Task 1 (prior session) / confirmed again this session
- **Issue:** SPEC-storage-s3 §1/§5, SPEC-deployment, and plan 03-08 all reference bucket name `character-dossier-prod`; the real production bucket is `character-dossier` (region `us-west-2`).
- **Fix:** No repository files edited (out of this plan's scope per environment notes). Recorded here as a required follow-up: the orchestrator/user should update SPEC-storage-s3, SPEC-deployment, and 03-08's `S3_BUCKET` value to `character-dossier` before or during 03-08 execution.
- **Files modified:** none
- **Verification:** n/a (documentation follow-up, not a code fix)
- **Committed in:** n/a

---

**Total deviations:** 2 (1 Rule 3 blocking substitution, 1 carried-over naming mismatch documented for follow-up). **Impact on plan:** Neither affects SEC-04's proof — both list-denial checks (spec-internal and independent) passed against the real bucket and credential. The bucket-name mismatch is a pre-existing fact about the AWS account, not a code defect, but must be reconciled in specs/03-08 before deployment.

## Issues Encountered

None beyond the two deviations above. Both integration spec runs and the independent CLI-equivalent check passed on the first attempt with the corrected bucket name and updated IAM policy.

## User Setup Required

None further — Task 1's AWS console setup (bucket creation, IAM user, inline policy, access key) was completed by the user in a prior session, and the user supplied the corrected bucket name (`character-dossier`) and confirmed the IAM policy update this session. The access key pair was used only as inline per-command process environment for the two verification commands in this session and was never written to disk, echoed, or logged.

## Next Phase Readiness

- SEC-04 (S3 half) is proven live: the `character-dossier-api` credential can perform all required object operations under `shares/` and cannot list the bucket, verified by two independent methods against the real `character-dossier` bucket in `us-west-2`.
- **Blocker/follow-up for 03-08:** SPEC-storage-s3, SPEC-deployment, and 03-08's plan must be updated to reference bucket name `character-dossier` (not `character-dossier-prod`) before Railway environment variables are configured, or 03-08 will point production at a nonexistent bucket.
- The verified access key pair (region `us-west-2`, bucket `character-dossier`) is the credential 03-08 should configure as Railway's `S3_BUCKET`/`S3_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` variables (D-14) — no new key needs to be generated.

---
*Phase: 03-snapshot-share-end-to-end*
*Completed: 2026-09-14*

## Self-Check: PASSED

No files were created or modified by this plan (verification-only), so there are no created-file existence claims to check. No task commits exist to verify in git log (Task 1 was a human console action producing no repo changes; Task 2 ran verification commands against real AWS producing no repo changes). `git status --porcelain` confirmed clean before, during, and after all verification commands — no credential material or stray artifacts were introduced.
