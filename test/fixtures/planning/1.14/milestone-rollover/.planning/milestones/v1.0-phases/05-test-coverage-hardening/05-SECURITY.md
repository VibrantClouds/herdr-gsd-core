---
phase: 05
slug: test-coverage-hardening
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-09
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register origin: **authored at plan time** — all 13 PLAN.md files carry a parseable
`<threat_model>` block, so this audit verifies that declared mitigations are present
rather than building a register retroactively. ASVS L1 (grep-depth verification),
block_on: `high`.

Phase 05 is a test-coverage phase. Its threat surface is dominated by *integrity of the
test suite itself* — the risk that a spec appears to pass while asserting nothing, or that
test scaffolding leaks into production or across the Karma run. Its single production
change (`image-display.component.ts`/`.html`, plan 05-09) carries the only critical entry.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Share-link API → client state | Attacker-controlled or corrupted MessagePack payload reaching `decode()` and then `AppState`. The app's only untrusted-input boundary in scope for this phase. | Serialized `ExportedState` (binary MessagePack) |
| User file upload → IndexedDB | User-supplied image files entering the upload pipeline and persisting to browser storage. | Image bytes, data URLs, attachment-point coordinates |
| Test scaffolding → production bundle | `src/app/testing/` fixtures and spec-only code potentially reachable from the app entry point. | Fixture payloads (would be build-time inclusion) |
| Spec → shared root singletons | Root-provided services, real IndexedDB, and localStorage written by one spec and observed by another in the same Karma run. | State-service values, custom attachment points, DB records |
| Repo → package registry | Dependency installation surface (`package.json` / `pnpm-lock.yaml`). | None this phase — no installs performed |

---

## Threat Register

Sixty threats across 13 plans. All are CLOSED: 45 verified mitigations and 15 documented
accepted risks. Grouped by plan for legibility; per-threat mitigation text lives in each
plan's `<threat_model>` block.

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01-01 | Tampering | Baseline snapshot integrity | medium | mitigate | Single recorded command invocation written into the artifact (D-13) | closed |
| T-05-01-02 | Tampering | `node_modules` drift | high | mitigate | No install performed; installed-vs-declared versions recorded — verified `package.json`/`pnpm-lock.yaml` unchanged across the phase | closed |
| T-05-01-SC | Tampering | npm/pnpm installs | high | accept | No packages installed this phase (see Accepted Risks R-01) | closed |
| T-05-02-01 | Tampering | Fixture-coverage guard | high | mitigate | `SUPPORTED_FIXTURES` intact at twelve entries; guard diffs against `SUPPORTED_VERSIONS` | closed |
| T-05-02-02 | Information Disclosure | Fixtures reaching production bundle | low | accept | `tsconfig.app.json` `files: ["src/main.ts"]`; verified 0 production imports of `src/app/testing/` (R-02) | closed |
| T-05-02-SC | Tampering | npm/pnpm installs | high | accept | No installs (R-01) | closed |
| T-05-03-01 | Denial of Service | `calculateImageDimensions` divide-by-zero | medium | mitigate | `rulerPixelLength > 0` guard verified at `scaling.service.ts:75`; zero-length case pinned by spec | closed |
| T-05-03-02 | Tampering | Cross-spec state leakage via root `BehaviorSubject`s | medium | mitigate | All `scaleState$` subscriptions unsubscribed; full-suite failure count did not rise | closed |
| T-05-03-SC | Tampering | npm/pnpm installs | high | accept | No installs (R-01) | closed |
| T-05-04-01 | Tampering | Attachment point id construction | high | mitigate | Hardcoded `'attachment-point'` verified at `attachment-edit-modal.component.ts:404,509`; all three branches independently asserted (D-10) | closed |
| T-05-04-02 | Tampering | Fixture aliasing between form state and caller model | medium | mitigate | Object-reference inequality asserted, so a dropped spread fails a test | closed |
| T-05-04-03 | Denial of Service | Real `CategoryService` reaching IndexedDB from a form spec | low | mitigate | `CategoryService` stood in; `NativeIndexedDBService` chain cut | closed |
| T-05-04-SC | Tampering | npm/pnpm installs | high | accept | No installs (R-01) | closed |
| T-05-05-01 | Tampering | `saveCustomItem` attachment point id | high | mitigate | Dedicated case seeds a differing incoming id and asserts the hardcoded value persists | closed |
| T-05-05-02 | Repudiation | Irreversible delete without confirmation | medium | mitigate | Cancelled-confirm case asserts `deleteCustomPoint` not called; `spyOn(window, 'confirm')` defeats the global always-true stub | closed |
| T-05-05-03 | Information Disclosure | Adult classification leaking when adult mode off | medium | mitigate | Two cases assert `adultClassification`/`circumference` stay undefined and penetration fields suppressed — the gate is tested, not the checkbox | closed |
| T-05-05-04 | Denial of Service | Post-destroy form rebuild | medium | mitigate | Teardown spec asserts `editForm` reference stable across post-destroy emission | closed |
| T-05-05-SC | Tampering | npm/pnpm installs | high | accept | No installs (R-01) | closed |
| T-05-06-01 | Tampering | Unique-name validator coverage | medium | mitigate | Spy rewired to the real consult target, restoring genuine duplicate-name coverage | closed |
| T-05-06-02 | Spoofing | Test spies masking real service behavior | high | mitigate | Deprecated service name asserted gone; correct service asserted provided | closed |
| T-05-06-03 | Tampering | Silent scope reduction via skipped specs | high | mitigate | Verified 0 occurrences of `xit`/`xdescribe`/`fit`/`fdescribe`/`pending()` repo-wide | closed |
| T-05-06-SC | Tampering | npm/pnpm installs | high | accept | No installs (R-01) | closed |
| T-05-07-01 | Tampering | Selector rot masking a missing control | medium | mitigate | Verdicts sourced from `05-TRIAGE.md`; negative/effect assertions added; covered by D-16 UAT | closed |
| T-05-07-02 | Tampering | Index-based element selection | low | mitigate | Selectors container-scoped, not positional | closed |
| T-05-07-03 | Denial of Service | Regressing the 40px POSITION_BUFFER | medium | accept | Existing buffer regression specs green and unmodified (R-03) | closed |
| T-05-07-SC | Tampering | npm/pnpm installs | high | accept | No installs (R-01) | closed |
| T-05-08-01 | Tampering | Unreviewed blast radius of a shared-util change | high | mitigate | Every `formatHeight` call site grepped and impact recorded in the behavior-delta ledger | closed |
| T-05-08-02 | Tampering | Silent serialized-structure change | high | mitigate | `SliderSettings` unchanged; `CURRENT_VERSION` verified still `'1.0.11'` at `state-export.service.ts:139` | closed |
| T-05-08-03 | Tampering | Divergence between selected-model and pending-attachment defaults | medium | mitigate | New spec asserts the two constant trios agree | closed |
| T-05-08-04 | Repudiation | Undocumented user-visible change | medium | mitigate | Production changes recorded as named behavior deltas, flagged for D-16 UAT | closed |
| T-05-08-SC | Tampering | npm/pnpm installs | high | accept | No installs (R-01) | closed |
| T-05-09-01 | Tampering | Core renderer production change | critical | mitigate | Ordering-only change; failing assertions unmodified; recorded as a named behavior delta and **verified by UAT test 3 on 2026-08-09** (first-paint positioning + scale change correct, 0 console errors) | closed |
| T-05-09-02 | Tampering | Undoing PERF-01 / PERF-02 guarantees | high | mitigate | Verified: 2 `resizeObserverService.observe/unobserve` uses, 2 `takeUntil(this.destroy$)`, 0 `new ResizeObserver(` | closed |
| T-05-09-03 | Tampering | Reintroducing a deferred-timing guess | high | mitigate | Verified 0 `setTimeout`/`requestAnimationFrame`/`queueMicrotask` in `image-display.component.ts` | closed |
| T-05-09-04 | Tampering | Dual-renderer divergence | high | mitigate | Canvas renderer unchanged; `attachment-preview.component.spec.ts` passing | closed |
| T-05-09-05 | Tampering | Assertion weakening disguised as a fix | high | mitigate | No exact→fuzzy downgrades without recorded justification; 0 skipped specs | closed |
| T-05-09-SC | Tampering | npm/pnpm installs | high | accept | No installs (R-01) | closed |
| T-05-10-01 | Tampering | Malformed MessagePack payload reaching `decode()` | high | mitigate | Route-level spec asserts decode failure is caught and state is unchanged | closed |
| T-05-10-02 | Tampering | Unsupported or tampered `version` string | high | mitigate | `SUPPORTED_VERSIONS` allow-list runs first; hard-rejection contract asserted with no partial application | closed |
| T-05-10-03 | Information Disclosure | Real network request escaping from a test | medium | mitigate | Verified 4 `spyOn(window, 'fetch')` stubs and 0 `HttpTestingController`/`provideHttpClientTesting` in the integration spec | closed |
| T-05-10-04 | Denial of Service | Stuck loading banner on the failure path | medium | mitigate | Every failure scenario asserts the duration-0 snackbar is dismissed | closed |
| T-05-10-05 | Tampering | Root-singleton state leaking between specs | medium | mitigate | `afterEach` resets state service, adult mode, and localStorage | closed |
| T-05-10-SC | Tampering | npm/pnpm installs | high | accept | No installs (R-01) | closed |
| T-05-11-01 | Tampering | Non-image file reaching persistence | medium | mitigate | `ALLOWED_FILE_TYPES` gate verified at `upload-modal.component.ts:55,157` and `upload-image-pipeline.service.ts:42`; rejection spec asserts nothing persists. MIME-spoofing hardening is SEC-01, scoped to Phase 6 | closed |
| T-05-11-02 | Tampering | Malformed data URL reaching `base64ToBlob` | medium | mitigate | Valid PNG payload used; round trip asserted to reassemble a valid data URL | closed |
| T-05-11-03 | Tampering | Attachment point coordinate drift | high | mitigate | Coordinates asserted to read back exactly across the full chain — the only end-to-end assertion of this invariant | closed |
| T-05-11-04 | Denial of Service | Real IndexedDB leaking across the Karma run | high | mitigate | Mandatory `afterEach` clears DB, localStorage, and state service; convention documented in `src/app/integration/README.md` | closed |
| T-05-11-05 | Tampering | Nondeterministic worker path widening failure surface | medium | mitigate | `ImageProcessingService` stood in; real worker path retains its own coverage | closed |
| T-05-11-SC | Tampering | npm/pnpm installs | high | accept | No installs; `fake-indexeddb` considered and rejected (R-01) | closed |
| T-05-12-01 | Tampering | Out-of-bounds attachment point creation | medium | mitigate | Three bounds-rejection specs assert no emission outside `originalDimensions` | closed |
| T-05-12-02 | Tampering | Deleting an occupied or non-custom attachment point | medium | mitigate | Two suppression specs assert `pointDeleted` does not fire | closed |
| T-05-12-03 | Denial of Service | Unrestored `ResizeObserver` global stub | high | mitigate | Verified exactly 1 top-level `describe` and an intact `originalResizeObserver` restore `afterEach` | closed |
| T-05-12-04 | Tampering | Coverage figures misread from a red-baseline run | medium | mitigate | Flagged gaps inside 05-06-repaired specs re-checked per Pitfall 7 | closed |
| T-05-12-SC | Tampering | npm/pnpm installs | high | accept | No installs (R-01) | closed |
| T-05-13-01 | Repudiation | Unrecorded behavior delta escaping UAT | high | mitigate | All production changes consolidated into one ledger with concrete UAT instructions | closed |
| T-05-13-02 | Tampering | Gate reinterpretation to declare success | high | mitigate | Full-suite gate held with no subset reinterpretation — 694/694 passing | closed |
| T-05-13-03 | Tampering | Cross-spec leakage producing order-dependent results | high | mitigate | Four leakage sources named and fixed at the leaking `afterEach` | closed |
| T-05-13-04 | Tampering | Silent serialization version bump | high | mitigate | No serialized interface changed; `CURRENT_VERSION` still `'1.0.11'` | closed |
| T-05-13-05 | Repudiation | Stale artifact misleading Phase 6 | medium | mitigate | Phase 3→5 blocker retired; Angular drift recorded; deferred items promoted to durable backlog | closed |
| T-05-13-SC | Tampering | npm/pnpm installs | high | accept | No installs anywhere in the phase (R-01) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-01 | T-05-{01..13}-SC (13 entries) | This phase installs no packages. 05-RESEARCH.md § "Package Legitimacy Audit" records "not applicable, no new packages" — `RouterTestingHarness`, `karma-coverage`, and `@msgpack/msgpack` were already present, and `fake-indexeddb` was explicitly considered and rejected in favour of headless Chrome's real implementation. Verified: `package.json` and `pnpm-lock.yaml` unchanged across all 13 plans. Nothing to audit or gate. | Phase 05 plans (13×), re-verified by audit | 2026-08-09 |
| R-02 | T-05-02-02 | Test fixtures in `src/app/testing/` cannot reach the shipped bundle: `tsconfig.app.json` uses `files: ["src/main.ts"]`, so only modules reachable from the app entry point compile in. Verified 0 imports of `src/app/testing/` from non-spec production code. Severity low. | Phase 05 plan 05-02, re-verified by audit | 2026-08-09 |
| R-03 | T-05-07-03 | The 40px `POSITION_BUFFER` regression specs are green and this plan was forbidden from modifying them; no change to the dimension logic was in scope. Accepted rather than re-derived. | Phase 05 plan 05-07 | 2026-08-09 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-09 | 60 | 60 | 0 | /gsd-secure-phase (orchestrator, ASVS L1 short-circuit) |

Audit method: `register_authored_at_plan_time: true` and `asvs_level == 1`, so per the
secure-phase short-circuit rule the register was verified at L1 grep depth without
spawning a separate auditor. Every `mitigate` disposition was checked against the
implementation (results inline in the register above); every `accept` disposition is
recorded in the Accepted Risks Log. Independent corroboration: full suite 694/694
passing, `tsc --noEmit` clean, and UAT tests 1–4 all passed on 2026-08-09.

**Out-of-scope observations** (recorded, not threats against this phase):

- A pre-existing panel-repositioning defect on viewport resize (`compare-modal.component.ts:662`,
  originating in Phase 3 commit `47af8fc`) was found during UAT and logged as a deferred
  follow-up in `05-UAT.md`. Availability/cosmetic only — no trust boundary is crossed.
- The `Elf` model 404s (`/assets/models/Elf.png` missing while `Elf.json` exists). Asset
  gap, not a security issue.
- MIME-spoofing hardening beyond the extension/type gate remains **SEC-01, scoped to Phase 6**.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-09
