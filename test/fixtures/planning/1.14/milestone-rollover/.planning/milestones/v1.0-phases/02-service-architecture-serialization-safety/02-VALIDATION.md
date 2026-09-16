---
phase: 2
slug: service-architecture-serialization-safety
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-30
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Karma 6.4.0 + Jasmine 5.6.0 (via `@angular-devkit/build-angular` `ng test`) |
| **Config file** | none standalone — defined in `angular.json` under `projects.size-comparison-tool.architect.test` |
| **Quick run command** | `CHROME_BIN=$CHROME_BIN npx ng test --no-watch --browsers=ChromeHeadless --include='**/state-export.service.spec.ts'` |
| **Full suite command** | `CHROME_BIN=$CHROME_BIN pnpm test --no-watch` |
| **Estimated runtime** | ~25 seconds (single-file include) / ~90 seconds (full suite) |

**Environment prerequisite:** No system Chrome/Chromium is installed. `CHROME_BIN` MUST be exported before any `ng test`/`pnpm test` invocation:

```bash
export CHROME_BIN=/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome
```

(Or the currently-installed `chromium-XXXX` directory under `~/.cache/ms-playwright/`.) Same finding and fallback as Phase 1's `01-BASELINE.md`.

**Baseline discipline:** Phase 1 established a known pre-existing-52-failure baseline (`01-BASELINE.md`). Any *new* failure beyond that baseline is a genuine regression. Note the baseline is expected to drop by 2 once the `state-export.service.spec.ts` DI mock is fixed in Wave 0 (baseline items #6–7).

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to whichever spec the task touched (`**/state-export.service.spec.ts` and/or `**/category.service.spec.ts`)
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green relative to the adjusted baseline
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Task IDs are filled in by the planner. This map fixes the requirement→test-type→command binding the plans must satisfy; the planner MUST NOT introduce a task touching phase requirements without an automated verify drawn from this table (or an explicit Wave 0 dependency on one).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | SERL-03 (prereq) | — | Spec exercises the real injected `IndexedDBUserModelService` mock, not a silently-ignored `UserModelService` spy | unit | `npx ng test --no-watch --browsers=ChromeHeadless --include='**/state-export.service.spec.ts'` | ✅ exists (mock broken) | ⬜ pending |
| TBD | TBD | 0 | DEP-01 (prereq) | — | Cascade rename/delete behavior pinned before DI refactor | unit | `npx ng test --no-watch --browsers=ChromeHeadless --include='**/category.service.spec.ts'` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | SERL-01 | T-2-01 (malformed/hostile imported state) | Unknown/absent version rejected with a clear error; no migration applied to unvalidated input | unit | `npx ng test --no-watch --browsers=ChromeHeadless --include='**/state-export.service.spec.ts'` | ✅ | ⬜ pending |
| TBD | TBD | 1 | SERL-01 | — | Each registry entry is a *named* function applied in version order; no-op entries documented as such | unit | `npx ng test --no-watch --browsers=ChromeHeadless --include='**/state-export.service.spec.ts'` | ✅ | ⬜ pending |
| TBD | TBD | 1 | SERL-03 | — | Fixture for every `SUPPORTED_VERSIONS` entry deserializes into current `AppState`/`ImageModel` without error | unit (fixture-driven) | `npx ng test --no-watch --browsers=ChromeHeadless --include='**/state-export.service.spec.ts'` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | SERL-03 | — | At least one old-version fixture round-trips through msgpack `encode()`/`decode()`, not only JSON (share links use msgpack exclusively) | unit | `npx ng test --no-watch --browsers=ChromeHeadless --include='**/state-export.service.spec.ts'` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | SERL-03 (flip fix) | — | `horizontalFlip` round-trips through export→import for v1.0.10+ fixtures (user-approved bugfix, see Decisions) | unit | `npx ng test --no-watch --browsers=ChromeHeadless --include='**/state-export.service.spec.ts'` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | DEP-01 | — | `CategoryService` reaches `IndexedDBUserModelService` by direct constructor injection; no `Injector`, no `any` | unit + static | `npx tsc --noEmit` + `npx ng test --no-watch --browsers=ChromeHeadless --include='**/category.service.spec.ts'` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | SERL-02 | — | Deprecation policy exists in-repo and states supported versions + retirement process | manual/doc-review | N/A — prose artifact | ❌ N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/services/state-export.service.spec.ts` — fix stale DI mock (`UserModelService` → `IndexedDBUserModelService`, using the `initialized$`/`userModels$` spy pattern from `model-attachment-defaults.service.spec.ts:78-82`); also replace the hardcoded `expect(parsed.version).toBe('1.0.5')` at line 123 with `CURRENT_VERSION`. **Prerequisite for SERL-03** — fixture tests added to this file before the mock is fixed inherit an unreliable DI setup.
- [ ] Version fixtures — one serialized `ExportedState` fixture per `SUPPORTED_VERSIONS` entry (1.0.0 … 1.0.11), covering SERL-03. Fixtures must reflect the *real* per-version shape from the git-verified history table in `02-RESEARCH.md`, not a uniform blob.
- [ ] `src/app/services/category.service.spec.ts` — does not exist; needed as the safety net for DEP-01's DI refactor, covering `cascadeRenameCategory`/`cascadeDeleteCategory`.
- [ ] Framework install: **none needed** — Karma/Jasmine already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Version-deprecation policy is documented, accurate, and discoverable | SERL-02 | Prose documentation artifact — no meaningful automated assertion beyond file existence | Read the policy doc. Confirm it (a) lists every currently-supported version, (b) states the retirement process for old versions, (c) states what happens on load of an unsupported version, and (d) records the deferred/known gaps noted in research. Cross-check the version list against `SUPPORTED_VERSIONS` in `state-export.service.ts`. |
| Real share link created pre-change still loads post-change | SERL-03 | End-to-end path depends on the live share API (`generateShareLink`/`loadFromShareLink`); not reachable from a unit test | Generate a share link on the current build, apply the phase changes, then load that same link and confirm both panels, overlays, scales, and flip state restore identically. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (spec DI mock, version fixtures, category spec)
- [ ] No watch-mode flags (`--no-watch` on every command)
- [ ] `CHROME_BIN` exported in every test-running task
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
