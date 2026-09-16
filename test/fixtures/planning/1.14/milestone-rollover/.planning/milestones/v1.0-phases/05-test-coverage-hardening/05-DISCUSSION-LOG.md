# Phase 5: Test Coverage Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-01
**Phase:** 5-Test Coverage Hardening
**Areas discussed:** Inherited suite failures, Integration test mechanism, attachment-edit-modal depth / TEST-02, Scope beyond named files

---

## Area selection

All four presented gray areas were selected, with an added observation from the user that reframed the first area:

> "It's also worth noting, that some of these failing tests MIGHT be accurate too. The old codebase before being onboarded with GSD wasn't fully vetted."

This prompted a fresh full-suite run before discussion continued, which invalidated the recorded baseline: **29 failures / 533 specs**, not the documented 50 / 391, and **zero `NullInjectorError`** — the DI-scaffolding root cause the baseline attributes "the large majority" of failures to no longer exists. Phases 3/4 fixed it incidentally. The remaining 29 were categorized by actual error before the first question was asked.

---

## Inherited suite failures

### Q1 — Disposition

| Option | Description | Selected |
|--------|-------------|----------|
| Adjudicate each, fix whichever side is wrong | Determine against real app behavior whether spec or code is correct; fix that side. Production bugs found (NG0100, scaling mismatches) fixed here and recorded as named behavior deltas. Makes SC#5 literally true. | ✓ |
| Adjudicate, but fix only spec-side; log code-side as findings | Same investigation, but code-side defects become documented findings + `xit` rather than fixes. Keeps Phase 5 pure; risks parking real bugs. | |
| Fix only what blocks the four named requirements | Fix the UploadModal DI mismatch and obstructions; carry Phase 3's subset gate forward for the rest. Smallest scope; reads SC#5 non-literally a third time. | |

**User's choice:** Adjudicate each, fix whichever side is wrong.
**Notes:** Makes production changes in-scope for a phase nominally about tests. Recorded in CONTEXT.md as an explicit, accepted departure from the milestone's behavior-preserving default (D-02).

### Q2 — Adjudication authority

| Option | Description | Selected |
|--------|-------------|----------|
| Live app behavior is the authority | Run the app, observe today's behavior, treat it as correct unless visibly broken. Behavior-preserving milestone ⇒ today's shipped behavior is the users' baseline. Costs a manual pass per disputed case. | ✓ |
| Documented invariants are the authority | Adjudicate against scaling-system / attachment-system SKILL.md and CLAUDE.md's critical invariants. Mechanical and reviewable; docs may be stale. | |
| Invariants first, live app as tiebreaker | Contract first, observation where the docs are silent (e.g. the imperial zero-inches formatting question). Each verdict records its authority. | |

**User's choice:** Live app behavior is the authority.

### Q3 — Latent defects the live app won't reveal (5 × NG0100 in ImageDisplayComponent)

| Option | Description | Selected |
|--------|-------------|----------|
| Fix it — a dev-mode error is a real defect | NG0100 is benign in prod only because Angular strips the assertion, not because the write-after-check is correct. image-display is the core renderer; "no silent race conditions" is the milestone's core value. | ✓ |
| Fix if the cause is contained, else record and defer | Investigate first; localized ordering fix lands here, a restructure of overlay input flow becomes its own phase. | |
| Out of scope — spec-side only | Adjust specs not to trip the assertion; record as a finding. Keeps Phase 5 out of the highest-traffic rendering component. | |

**User's choice:** Fix it — a dev-mode error is a real defect.

### Q4 — Work organization

| Option | Description | Selected |
|--------|-------------|----------|
| Wave 0 triage plan → disposition table → fix waves | First plan investigates all 29, runs the live app for disputed cases, writes `05-TRIAGE.md` (failure → verdict → evidence → assigned fix). Later plans execute against it. Mirrors `03-BASELINE.md`. Costs one extra plan. | ✓ |
| Group by root cause, adjudicate inside each fix plan | ~5 clusters, each plan investigates and fixes its own. Fewer plans, context stays local — but no single record of verdicts. | |
| Triage first, but only for the disputed ones | Skip triage for the ~6 clear spec-rot failures. Smaller up-front plan, same evidence trail where it matters. | |

**User's choice:** Wave 0 triage plan → disposition table → fix waves.

**Deferred within this area:** whether SC#5 now means literal zero failures and what the escape hatch is if a verdict exceeds the phase — offered as a follow-up question, user chose to move on. Resolved implicitly by Q4 of the final area (D-16: no waiver; an over-scope verdict becomes a checkpoint conversation).

---

## Integration test mechanism

Scouting findings presented before questioning: `RouteShellComponent` is intentionally empty (AppComponent renders outside the router outlet), and `loadFromShareLink` uses global `fetch`, not `HttpClient` — so `HttpTestingController` cannot intercept it.

### Q1 — TEST-03 depth

| Option | Description | Selected |
|--------|-------------|----------|
| Router → guard → real services → assert AppState | RouterTestingHarness to `/:shareId`, real guard + StateExportService + StateManagementService, stub only global fetch with a MessagePack fixture. Exercises exactly the chain SC#3 names. | ✓ |
| Same, plus render AppComponent to assert the UI | Closer to end-to-end, but AppComponent's ngOnInit touches migration/snackbar/site-mode/viewport/state-export (Phase 4 D-05 flagged the mock weight) and drags the render tree into a state test. | |
| Service-level: call the guard function directly | Cheapest and deterministic, but skips route matching, the `/adult` variant, and guard ordering. | |

**User's choice:** Router → guard → real services → assert AppState.

### Q2 — TEST-04 drive point

| Option | Description | Selected |
|--------|-------------|----------|
| Service-level chain with real persistence | UploadImagePipelineService → IndexedDBUserModelService → CustomAttachmentPointService → StateManagementService, real IndexedDB, synthetic PNG. Proves the data contract end-to-end. Skips modal templates — TEST-01/02's job. | ✓ |
| Component-driven: mount upload-modal, then attachment flow | Closest to real usage; catches template/wiring breaks — but three component fixtures with heavy DI, and the upload half now crosses a Web Worker boundary. | |
| Hybrid: component for upload, services for the rest | One fixture instead of three, still proves the upload-output → attachment-input seam. | |

**User's choice:** Service-level chain with real persistence.

### Q3 — Location

| Option | Description | Selected |
|--------|-------------|----------|
| New `src/app/integration/` directory | Makes the two flows discoverable as a set; `tsconfig.spec.json` already globs `**/*.spec.ts`. | ✓ |
| Co-locate with the flow's entry point | Zero new structure, fits CONVENTIONS.md — but buries a multi-service test in a file named after one unit, and the upload flow has no obvious owner. | |
| You decide | Planner's call, per the naming discretion granted in Phases 1 and 4. | |

**User's choice:** New `src/app/integration/` directory.

### Q4 — Relationship to Phase 2's migration coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Current-version happy path + one legacy version through the route | Phase 2 already proves all twelve migrate at service level; TEST-03 proves the route-level chain. Plus the 404 → snackbar → redirect error path. | ✓ |
| All twelve versions through the route | Same coverage at route level as service level. Strongest guarantee, but twelve navigations for an already-covered layer. | |
| Current version only | Leanest, but the roadmap's stated Phase 2 dependency then has nothing behind it. | |

**User's choice:** Current-version happy path + one legacy version through the route.

---

## attachment-edit-modal depth / TEST-02

Scouting findings presented: 596 lines, `editType` branches through ~15 methods, two subscriptions, adult-mode-gated penetration-zone logic, and an `onPointPlaced` carrying a "Pitfall 5 — MUST stay here" comment from Phase 1.

### Q1 — Save-path coverage

| Option | Description | Selected |
|--------|-------------|----------|
| All three save paths, each end-to-end | For each editType: populate form, place point, onSave, assert correct service + payload. Converts Phase 1 D-07's manual checklist into automated coverage. Plus onDelete, onClose, two-subscription teardown. | ✓ |
| One representative branch deeply, others at save-dispatch level | Cover `custom_model` fully (ruler + angle dial + penetration zone); assert only dispatch for the other two. Half the size, but leaves Pitfall 5's branched construction unverified for two types. | |
| Form + cleanup only, skip save-path assertions | Literal reading of TEST-01's three named concerns; extracted services already spec'd — but the save switch is where Phase 1 had no net at all. | |

**User's choice:** All three save paths, each end-to-end.

### Q2 — Mocking strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Spy on persistence, real for pure logic | createSpyObj for IndexedDBUserModelService / CustomAttachmentPointService / StateManagementService so saves assert exact payloads; keep MeasurementRulerService + AttachmentPointDefinitionService real. Matches TESTING.md. | ✓ |
| All six real, assert on persisted state | Catches persistence bugs, consistent with TEST-04 — but async with real storage teardown, and assertions degrade to "something got stored". | |
| Spy on all six | Fastest and most isolated, but the spec can pass while the component calls the pure services wrongly. | |

**User's choice:** Spy on persistence, real for pure logic.

### Q3 — TEST-02 approach

Framing presented: CONCERNS.md's "~49% spec-to-source LOC ratio" was measured against the pre-decomposition 978/856-line components. Post-Phase-1 the ratios have inverted (upload-modal 402 src / 560 spec; attachment-preview 384 / 430), and all five extractions carry their own specs — so the premise may already be largely satisfied.

| Option | Description | Selected |
|--------|-------------|----------|
| Coverage-audit first, then fill measured gaps | Run `--code-coverage`, read real per-file numbers, write specs only for uncovered branches. Records the audit as evidence. Risk: the honest answer may be "mostly covered", which must be stated rather than padded. | ✓ |
| Assume gaps, write specs for named untested behaviors | Target behaviors visibly absent from current describe blocks (attachment-preview hit-testing, upload-modal worker dispatch). Faster to plan, judged by spec names not measured branches. | |
| Audit, and set an explicit coverage floor | Adds a mechanical pass/fail — but no thresholds are configured in the repo today; a new gate the milestone didn't ask for. | |

**User's choice:** Coverage-audit first, then fill measured gaps.

### Q4 — Wave 0 structure

| Option | Description | Selected |
|--------|-------------|----------|
| One Wave 0 plan producing both artifacts | One `--code-coverage` run yields both `05-TRIAGE.md` and the TEST-02 gap list. One snapshot, one place to record the "coverage measured with 29 known failures" caveat. | ✓ |
| Two separate Wave 0 plans, run in parallel | Cleaner ownership (judgment-heavy triage vs mechanical audit), but two suite runs and two baseline records. | |
| You decide | Planner's call; both artifacts required either way. | |

**User's choice:** One Wave 0 plan producing both artifacts.

**Deferred within this area:** whether the edit-modal spec covers the adult-mode-gated paths, and whether it needs a destroy-mid-interaction regression like Phase 3's — offered as follow-ups, user moved on. Both recorded under Claude's Discretion.

---

## Scope beyond named files

Seven services have no spec: state-management (419), indexeddb-user-model (414), user-model-migration (287), native-indexeddb (273), scaling (142), seo (120), viewport (119). None named by TEST-01–04.

### Q1 — What to pull in (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| `scaling.service.ts` | 142 lines of the pixel/height math every comparison depends on, and the likely subject of the disputed positioning failures. Spec'ing it makes those adjudications evidence-based. | ✓ |
| `state-management.service.ts` | 419 lines, the store both integration tests assert against — question is whether it also gets a direct spec for methods the integration paths don't touch. | |
| `indexeddb-user-model.service.ts` | 414 lines, deferred by Phases 2, 3 and 4 in turn. TEST-04 exercises save/read; a spec would add delete, quota, StorageUnavailableError. | |
| Phase 4's punted D-04 re-fire test | One spec in model-selector/attachment-selector; Phase 4 named Phase 5 as the fallback. | |

**User's choice:** `scaling.service.ts` only.

### Q2 — Disposition of the three not selected

| Option | Description | Selected |
|--------|-------------|----------|
| Move to REQUIREMENTS.md v2 / backlog | Promote out of per-phase deferred lists into a durable home so Phase 6 doesn't rediscover them. Stops the punt cycle; costs an edit outside this phase's artifacts. | ✓ |
| Record in CONTEXT.md deferred section only | Standard practice for Phases 1–4 — but that's exactly the mechanism that let indexeddb-user-model slide four times. | |
| Deferred section, plus flag indexeddb explicitly in STATE.md | Keeps it visible at every phase transition without a requirements change. | |

**User's choice:** Move to REQUIREMENTS.md v2 / backlog.

### Q3 — Sequencing of the scaling.service spec

| Option | Description | Selected |
|--------|-------------|----------|
| Before the fixes — it grounds the adjudication | Characterize scaling.service early so disputed positioning verdicts are decided against a tested service, not by reading code. Adds a critical-path dependency; makes hard verdicts defensible. | ✓ |
| After the fixes — it captures the settled behavior | Avoids specifying math about to change; but the adjudication then happens without a net. | |
| You decide | Sequence based on what triage actually finds. | |

**User's choice:** Before the fixes — it grounds the adjudication.

### Q4 — Close-out gate

| Option | Description | Selected |
|--------|-------------|----------|
| Zero failures, plus recorded human verification of behavior deltas | `pnpm test` green (SC#5 literal) plus a UAT pass on the production fixes — the NG0100 change-detection fix and any scaling/formatting correction. Follows Phase 3/4 precedent; `human_verify_mode` is already `end-of-phase`. | ✓ |
| Zero failures, automated only | Leaner, and arguably the point is that the suite becomes trustworthy enough to be the gate — but a fix that satisfies a spec while shifting something visible would slip through. | |
| Green suite, with any unresolvable verdict explicitly waived | Same as the first, plus a documented one-time escape hatch rather than forcing scope creep to reach green. | |

**User's choice:** Zero failures, plus recorded human verification of behavior deltas.

---

## Claude's Discretion

- Whether the edit-modal spec covers the adult-mode-gated paths (`canShowPenetrationZone`, angle-dial visibility, the `isPenetrationZone` save branch).
- Whether the edit-modal spec needs a destroy-mid-interaction regression in the shape of Phase 3 D-17 / Phase 4 D-05.
- Structure and location of any shared test fixtures or TestBed harness that emerges.
- Plan/wave decomposition beyond the D-13 Wave 0 and D-14 ordering constraints.
- How `05-TRIAGE.md` records evidence for live-app adjudications.
- Whether the `compare-modal` template-query cluster is investigated as one unit or split by control.
- Whether TEST-04 feature-detects the Web Worker path or forces the main-thread fallback for determinism.

## Deferred Ideas

**Promoted to REQUIREMENTS.md v2 (D-15):** indexeddb-user-model.service coverage; state-management.service coverage; Phase 4's D-04 re-fire behavior test.

**Deferred, this phase only:** specs for native-indexeddb / user-model-migration / viewport / seo services; `route-shell.component.ts` (intentionally empty); coverage thresholds as a configured build gate; standardizing the eight manual-`Subscription` components on `takeUntil` (carried from Phase 4, which named "after Phase 5" as the right time); consolidating the remaining three `ResizeObserver` sites (carried from Phase 4 D-06); adopting an E2E framework (blocked by PROJECT.md's no-heavy-dependencies constraint).

**Reviewed todos:** none — `todo.match-phase 5` returned 0 matches.
