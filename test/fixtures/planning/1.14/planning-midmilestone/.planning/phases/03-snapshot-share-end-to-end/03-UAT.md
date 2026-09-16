---
status: complete
phase: 03-snapshot-share-end-to-end
source: [03-VERIFICATION.md]
started: 2026-09-14T23:42:20Z
updated: 2026-09-16T01:31:57Z
---

## Current Test

[testing complete]

## Tests

### 1. Railway API service runs exactly one replica
expected: Railway service settings show Replicas = 1 (03-08 backstop must-have; WINDOWS.md #5).
result: pass

### 2. Share dialog renders as a bottom sheet at 400px
expected: On https://characterdossierlab.app at ~400px width, opening Share on a character shows the dialog as a bottom sheet with the section selector, and publishing shows "Link copied" or "Copy the link below" (03-04 human-check; live run only captured 1280px).
result: pass

### 3. No AWS API credential persisted outside Railway
expected: The character-dossier-api access key exists only in Railway variables and the operator's own records — not in any file, shell history or log (03-07 prohibition). Note: the key was pasted into the Claude session transcript during 03-07; rotating it (update Railway, delete the old key in IAM) satisfies this item.
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
