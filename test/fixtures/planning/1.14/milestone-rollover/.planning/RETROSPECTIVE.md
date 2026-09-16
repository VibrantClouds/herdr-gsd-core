# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Code Health & Hardening

**Shipped:** 2026-09-08
**Phases:** 6 | **Plans:** 48 | **Commits:** 325 | **Timeline:** 70 days (2026-07-01 → 2026-09-08)

### What Was Built

A hardening-only milestone against `.planning/codebase/CONCERNS.md` — no user-facing features, all 21 v1 requirements shipped and verified.

- **Decomposition** — three modals split behind unchanged behavior (`upload-modal` 979→397, `attachment-preview` 856→384, `attachment-edit-modal` 909→599), with five extracted services and two shared presentational components now reused across upload and edit.
- **Serialization** — a named 7-entry `MIGRATIONS` registry at the single import choke point, plus 12 per-version fixtures proving every supported share link still loads. Found and fixed a latent bug: `horizontalFlip` was never restored on import.
- **Timing & lifecycle** — every `setTimeout` timing guess in the modal layer replaced with a deterministic mechanism (`ResizeObserver`, `queueMicrotask`, `toObservable → switchMap`), and document-level drag listeners replaced with element-owned PointerCapture.
- **Leaks & perf** — `takeUntil(destroy$)` on all long-lived subscriptions with destroy-then-emit regression specs; one shared rAF-batched `ResizeObserver`; image processing on an OffscreenCanvas Web Worker sharing a pure core module with the main-thread fallback.
- **Tests** — 336 specs / 52 failures at start → 711 specs / 0 failures at close. `attachment-edit-modal` went 0 → 75 specs; two real integration flows added.
- **Security** — magic-byte upload sniffing, a 5s share cooldown, and `.claude/rules/security.md` documenting precisely what those guards are *not*.

### What Worked

- **Sequencing decomposition first.** Phase 1 ran before the test, race-condition, and Worker work, so every later fix landed in a small file. Phase 5's `attachment-edit-modal` spec would have been substantially harder against the original 909-line component.
- **Recorded baselines instead of aspirational gates.** Phases 1 and 3 wrote down the exact set of pre-existing failing specs (`03-BASELINE.md`, 50 names) before starting, then gated on "no *new* failures" via `comm -23`. That kept inherited red from blocking unrelated work — and Phase 3 incidentally repaired 21 of them.
- **Extracting a pure core before forking an implementation.** Pulling `image-processing-core.ts` out as a pure module *before* writing the Worker path made worker/main-thread geometry match by construction rather than by assertion. The parity spec then only had to check encoder output, not logic.
- **Promoting deferrals into requirements instead of re-deferring them.** Phase 5's D-15 moved five coverage items into REQUIREMENTS.md v2 rather than into another phase's deferred section — three of them had already slid across Phases 2, 3, and 4 that way.
- **Naming guards honestly.** Phase 6's D-12 refused to call the client-side MIME sniff "validation" or the cooldown "rate limiting" in any artifact, precisely so a future reader can't close a backend requirement by reading a changelog line.

### What Was Inefficient

- **Test debt compounded for three phases before anyone paid it.** Phases 1–3 each shipped with a growing inherited failure set (52 → 50 → 29). Phase 5 then spent 13 plans — the largest phase in the milestone — largely adjudicating failures created earlier. Cheaper to fix at the phase that introduced them.
- **The subset gate got reinterpreted.** Three consecutive phases read "failing set ⊆ baseline" as license to close green-ish. Phase 5 had to explicitly install a zero-failure, no-waiver gate (D-16) to stop it. The mechanism was sound; the repeated reinterpretation was the cost.
- **Three "tests that cannot fail" survived into Phase 5.** CR-02, WR-01, WR-02 were vacuous assertions that predated the milestone and passed every gate along the way. They were only caught by an explicit anti-vacuity check (reintroduce a regression, confirm the right specs turn red). Nothing in the normal loop would have found them.
- **The codebase map went stale mid-milestone.** `.planning/codebase/` was generated 2026-07-01 and describes pre-decomposition structure. It was the scope document *and* the reference document, and Phase 1 invalidated half of it on day 6.
- **Phase 2 researched a dependency cycle that didn't exist.** DEP-01 was written against a `CategoryService` `Injector` workaround assumed to be load-bearing; research found no class-level cycle and the lazy injection was purely anticipatory. Correct outcome, but the requirement was written from a symptom rather than a traced cause.

### Patterns Established

- **Record the failing-spec baseline by name before a phase starts**, and gate on set difference, not on count.
- **Pure-core extraction before implementation forking** — when two runtimes must agree (Worker/main thread, Canvas/DOM), share a dependency-free module rather than asserting parity after the fact.
- **`pure-util-plus-colocated-spec`** for logic with no Angular or DOM dependency (`normalizeCategory`, `sniffImageSignature`, `image-processing-core.ts`).
- **Element-owned PointerCapture over document listeners** for any drag inside a dismissable surface.
- **Anti-vacuity proof for new specs** — reintroduce the regression the spec claims to catch and confirm exactly those specs fail.
- **Test scaffolding in `src/app/testing/`, integration specs in `src/app/integration/`**, kept out of the bundle by `tsconfig.app.json`'s `files: ["src/main.ts"]`.
- **Security artifacts state what a mitigation is not**, and point at the out-of-scope record rather than duplicating it.

### Key Lessons

1. **Pay test debt in the phase that creates it.** Deferring it produced one 13-plan cleanup phase and three phases of gate erosion. A phase that leaves the suite redder than it found it should be treated as unfinished.
2. **A gate stated as a subset relation will be reinterpreted generously.** If the real requirement is "green," write "green" and provide an explicit waiver mechanism — Phase 5 formally waived two coverage gaps and it worked fine, because waiving was a visible act.
3. **Passing specs are not evidence until proven falsifiable.** Three specs could not fail under any input and passed every gate for months.
4. **Decompose before you test, fix, or parallelize.** Every downstream phase was cheaper because Phase 1 ran first.
5. **Write requirements from a traced cause, not an observed symptom.** DEP-01's premise dissolved under research; the phase delivered the right end state anyway, but only because research ran before planning.
6. **Regenerate the codebase map when the milestone that consumes it also invalidates it.** `/gsd-map-codebase` should re-run before the next milestone.

### Cost Observations

- Model mix: not instrumented this milestone (`.planning/config.json` `model_profile: adaptive`, per-plan token actuals recorded in SUMMARY frontmatter but not aggregated).
- Notable: plan count per phase varied 3–13 against similar requirement counts. Phase 5 (4 requirements, 13 plans) was inflated by inherited-failure triage, not by its own scope — a signal that plan count tracks debt absorbed, not work specified.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 6 | 48 | Baseline milestone. Established recorded-baseline gating, then replaced it with a zero-failure no-waiver gate after three phases of erosion. |

### Cumulative Quality

| Milestone | Specs | Failures at close | Spec files | Zero-Dep Additions |
|-----------|-------|-------------------|------------|--------------------|
| v1.0 | 711 (from 336) | 0 (from 52) | 47 | 0 — no new runtime dependencies added |

### Top Lessons (Verified Across Milestones)

*Requires a second milestone to cross-validate. v1.0's candidates, in priority order:*

1. Test debt deferred across phases costs more than it saves.
2. A gate's wording determines its enforcement; subset gates erode.
3. Structural work (decomposition) sequenced first reduces the cost of everything after it.
