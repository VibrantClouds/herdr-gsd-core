# Phase 1: Foundation + Library - Research

**Researched:** 2026-09-11
**Domain:** Angular 22 zoneless SPA scaffolding, pnpm monorepo, shared Zod schema package, IndexedDB persistence, Cloudflare Workers static hosting
**Confidence:** HIGH (toolchain versions, IndexedDB/autosave patterns, and domain-model shapes are directly verified; a few UI/scope details are flagged ASSUMED below)

<user_constraints>
## User Constraints (no CONTEXT.md — planning from locked ADRs/SPECs)

There is no `CONTEXT.md` for this phase; the user chose to plan directly from the 16 ingested ADRs and 12 SPECs rather than running `/gsd-discuss-phase`. Per the phase brief, **treat every ADR/SPEC decision below as a locked user decision**, not a discretionary option. Nothing here is "Claude's discretion" — anywhere this research recommends something not explicitly pinned by an ADR/SPEC (test runner choice, exact `ng new` flags, delete-confirmation UI), it is called out explicitly as a recommendation, not a locked constraint.

### Locked decisions applicable to Phase 1 (from `docs/adr/`)

- **ADR-0001**: Sub-document types are code-defined typed templates. `pages[]` has at most one entry per `type`. Rating values are integer levels, never display strings. *(Governs the schema package shape Phase 1 must scaffold, even though no plugin types ship until Phase 2.)*
- **ADR-0002**: `CharacterCore` = `id` (UUID v4, local-only), `name` (≤120), `species`, `pronouns`, `orientation` (≤200 each), `portrait: ImageRef | null`. Relationship context and dominant/submissive lean are NOT core fields (they belong to the Phase-2 Intimacy Dossier).
- **ADR-0003**: One unified, edit-in-place, continuously-scrolling character page at `/c/:characterId`. Fields are always live inputs, no edit-toggle. Autosave to IndexedDB after 500ms debounce and on `pagehide`/`visibilitychange:hidden`. A `restoring` signal suppresses autosave during `load()`.
- **ADR-0008**: pnpm workspace, three packages: `apps/web` (Angular), `apps/api` (Node, not built until Phase 3), `packages/schema` (plain TypeScript, `tsc`, zero Angular/Node dependencies). Zod schemas are the single source of runtime validation and inferred types.
- **ADR-0009**: `apps/web` deploys to Cloudflare Workers static assets (`wrangler.jsonc` + `_worker.js` modeled on `~/Development/Personal/SizeComparisonSite`). SPA fallback for extension-less paths. Immutable caching on hashed `/assets/*`.
- **ADR-0011**: Per-sub-document-type schema versions (`currentVersion`/`supportedVersions`/`migrations`/fixtures) plus a thin envelope version `CHARACTER_SCHEMA_VERSION` starting at `1.0.0`. Structural change owes a bump; behavioural change does not. Unsupported versions are hard-rejected, nothing partially applied. A guard spec enforces fixture coverage.
- **ADR-0015**: Visual direction extends the prototype (`character-dossier.html`), not SizeLab's theme — warm paper background, burgundy accent, Fraunces/Source Sans 3/IBM Plex Mono. Light and dark both first-class via `data-theme`. No box-shadow elevation, no backdrop blur, no hover transforms, no gradients except the (Phase-2) lean slider.
- **ADR-0016**: Angular 22, `bootstrapApplication`, standalone components only, no NgModules. **Zoneless change detection is the default; `zone.js` is not a dependency.** Signals for state (`input()`/`output()`/`signal`/`computed`/`effect`/`untracked`). `@if`/`@for`/`@switch`/`@defer`, never `*ngIf`/`*ngFor`. SCSS + CSS custom properties, no Angular Material/Tailwind/Bootstrap. Only UI-library dependency: `@angular/cdk/drag-drop` (not needed until Phase 2). No NgRx/SignalStore.

### Claude's discretion (nothing locked; this research's own recommendations)

- Exact `ng new` non-interactive flags (§ Code Examples).
- `apps/web` unit-test runner: this research recommends Angular's new Vitest-based builder over SizeLab's Karma+Jasmine (see § State of the Art).
- Delete-confirmation UI pattern for the Library view (native `confirm()` vs. a custom modal) — see Assumption A2.
- Whether to create all four IndexedDB stores now vs. only `characters`/`prefs` — see Assumption A3.

### Deferred / out of scope for Phase 1 (do not build)

- `apps/api`, Railway, S3, CloudFront — Phase 3 (OPS-01, SHARE-01, etc.).
- Portrait/Gallery image compression pipeline — Phase 4 (GALL-*, IMG-*). Phase 1's `CharacterCore.portrait` field exists in the schema but has no upload UI yet (see Assumption A1).
- Intimacy Dossier, page add/remove/reorder, section nav, `@angular/cdk/drag-drop` — Phase 2 (CHAR-04/05/06, INTM-*, DSGN-04).
- Share dialogs, print dialogs, the shared `SectionSelector`/modal system — Phase 3+.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAR-01 | Create a character with name, species/build, pronouns, orientation (+ optional portrait) | `CharacterCore` shape verified in `docs/specs/SPEC-domain-model.md:38-45`; portrait upload UI deferred — see Assumption A1 |
| CHAR-02 | Library view: open, duplicate, delete any character | `LibraryStore` API verified in `docs/specs/SPEC-frontend-architecture.md:128-139`; IndexedDB `characters` store keyed by `core.id` |
| CHAR-03 | Autosave within 1s, survives reload, requests persistent storage on first write | Autosave effect pattern verified in `docs/adr/0003-unified-edit-in-place-page.md` + `SPEC-frontend-architecture.md:188-214`; `requestPersistentStorage()`/`isStorageBlocked()` pattern verified in SizeLab `native-indexeddb.service.ts:38-65` |
| SCHM-01 | One shared schema package validates identically browser+server | `packages/schema` zero-Angular/Node-deps constraint verified in `docs/adr/0008-monorepo-shared-schema-package.md:19`; Phase 1 can only prove the browser half (no API yet) |
| SCHM-02 | Per-type versioned migration registry + fixture-coverage guard test | `fixture-guard.spec.ts` mechanics verified in `docs/specs/SPEC-serialization-policy.md:33-42`; **path conflict found between two SPECs, see Open Question 3** |
| SCHM-03 | Unsupported version hard-rejected, nothing partially applied | Migration walker verified in `docs/specs/SPEC-serialization-policy.md:44-58` and `docs/specs/SPEC-subdocument-plugin-contract.md:62-69` |
| OPS-02 | Standard Angular application builder; Cloudflare Workers static assets + SPA fallback | `wrangler.jsonc`/`_worker.js` shape verified against SizeLab's live files; Angular application builder confirmed via `@angular/cli@latest new --help` |
| DSGN-01 | Light/dark themes, `prefers-color-scheme`, persisting manual override | Theming rule verified in `docs/specs/SPEC-design-system.md:90-102` |
| DSGN-02 | 400px width, 44px touch targets, no horizontal scroll | Layout tokens verified in `docs/specs/SPEC-design-system.md:66-88, 113-119` |
| DSGN-03 | Disable animation/transitions on `prefers-reduced-motion` | Motion rule verified in `docs/specs/SPEC-design-system.md:231-240` |
</phase_requirements>

## Summary

Phase 1 is a pure scaffolding phase: no server, no images, no plugin pages — just a pnpm monorepo, a dependency-free `packages/schema` (envelope types + versioning machinery + fixture guard), and a zoneless Angular 22 SPA with one editable/listable entity (`Character`) persisted to IndexedDB and deployed as static assets on Cloudflare Workers. Every architectural shape is already pinned by the 16 ADRs and 12 SPECs; this research's job was to (a) verify the exact toolchain versions the ADRs deliberately left open ("phase research must confirm exact versions") against the real npm registry and the real `@angular/cli` binary, and (b) pull the concrete, load-bearing code patterns (IndexedDB wrapper, autosave effect, storage-blocked probe, wrangler config) out of the sibling reference project `~/Development/Personal/SizeComparisonSite` with exact citations.

The single most consequential finding: **the ecosystem moved out from under this spec set in the last year.** TypeScript's npm `latest` tag is now `7.0.2` — a Go-native compiler rewrite — but Angular 22.1.x's own peer dependency pins `typescript: ">=6.0 <6.1"`, so a naive `pnpm add -D typescript` will install an incompatible major version. Angular's own default unit-test runner also flipped from Karma to Vitest since SizeLab (Angular 20) was built, which simplifies this phase's test setup (no headless-Chrome dependency) but is a deviation from the SPEC's literal "SizeLab fallback" language that the SPEC itself invited phase research to resolve. Both are detailed below with exact registry-verified versions.

**Primary recommendation:** Scaffold with `@angular/cli@22.1.8` using `--zoneless --test-runner=vitest --no-ssr --routing --style=scss --package-manager=pnpm` (explicit flags — don't rely on interactive prompt defaults), pin `typescript@^6.0.3` (not `latest`), and hand-roll the IndexedDB wrapper by porting SizeLab's `native-indexeddb.service.ts` + `storage-errors.ts` almost verbatim (this is a locked SPEC decision, not a "don't reinvent the wheel" violation — see § Don't Hand-Roll).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Character CRUD (create/list/open/duplicate/delete) | Browser / Client | Database / Storage | No API exists in Phase 1 (Railway lands Phase 3, OPS-01); all mutation happens against IndexedDB directly from `LibraryStore`/`CharacterStore` |
| Schema validation & versioning (envelope, migrations, fixture guard) | Browser / Client (bundled today) | API / Backend (Phase 3+) | `packages/schema` must have zero Angular/Node deps *now* precisely because `apps/api` will import the identical module unchanged in Phase 3 (ADR-0008) |
| Local persistence (autosave, `navigator.storage.persist()`) | Browser / Client | Database / Storage | IndexedDB writes and the persistence request are entirely client-side (ADR-0003 §4) |
| Theming (light/dark, reduced motion, manual override) | Browser / Client | — | Pure CSS custom properties + a `data-theme` attribute; no server involvement |
| Static asset delivery + SPA fallback | CDN / Static | — | Cloudflare Workers static assets (ADR-0009, OPS-02) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@angular/core`, `@angular/common`, `@angular/compiler`, `@angular/compiler-cli`, `@angular/forms`, `@angular/platform-browser`, `@angular/router` | `^22.1.6` [VERIFIED: npm registry] | SPA framework, locked by ADR-0016 | Latest stable major at spec time; `npm view @angular/core dist-tags` → `"latest": "22.1.6"` |
| `@angular/cli` (dev) | `^22.1.8` [VERIFIED: npm registry] | Scaffolding + build/serve/test CLI | `npm view @angular/cli version` → `22.1.8` |
| `typescript` (dev) | `^6.0.3` — **pin exactly this major, do not use `latest`** [VERIFIED: npm registry] | Compiler | `@angular/core@22.1.6`'s own peer dep is `"typescript": ">=6.0 <6.1"` [VERIFIED: `npm view @angular/core@latest peerDependencies`]. npm's `typescript@latest` is `7.0.2`, a **different, incompatible major** (Go-native rewrite) — see § Common Pitfalls #1 |
| `zod` | `^4.6.2` [VERIFIED: npm registry, name from `docs/adr/0008-monorepo-shared-schema-package.md`] | Runtime validators + inferred types for `packages/schema` | Locked by ADR-0008. `npm view zod version` → `4.6.2`. **This is Zod v4, not v3** — error-customization API differs (see § Common Pitfalls #6) |
| `rxjs` | `^7.8.0` [VERIFIED: npm registry] | Boundary-only reactive glue (`fromEvent`, HTTP later) | `@angular/cdk@22`'s peer dep accepts `^7.4.0`; SizeLab already pins `~7.8.0` |
| `@angular/cdk` | not installed in Phase 1 | Drag-drop reordering | Needed starting Phase 2 (CHAR-05); installing early is harmless but not required — don't add the dependency until a plugin actually uses it |
| `pnpm` | `9+` per ADR-0008; `12.4.1` is npm `latest` [VERIFIED: npm registry]; `11.7.0` already installed locally | Workspace package manager | Locked by ADR-0008 (rejects Nx/Turborepo) |
| `wrangler` (dev, in `apps/web`) | `^4.131.1` [VERIFIED: npm registry; `4.131.1` already installed locally] | Cloudflare Workers deploy CLI | Locked by ADR-0009 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `^5.0.0` [VERIFIED: npm registry] | Test runner for `packages/schema` (always) and, per this research's recommendation, for `apps/web` too | `packages/schema`'s fixture-guard/migration-walker tests (ADR-0008 already locks Vitest here); `apps/web` via the new `@angular/build:unit-test` builder, whose CLI default is `vitest` — see § State of the Art |
| `tsx` | `^4.23.13` [VERIFIED: npm registry] | Not needed until `apps/api` exists (Phase 3 `pnpm dev` script) | Listed here only because ADR-0008/SPEC-deployment name it as the eventual API dev runner; no Phase 1 action |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled IndexedDB wrapper (locked) | `idb` or `Dexie.js` | Rejected by design, not by this research — see § Don't Hand-Roll |
| Angular's new Vitest test builder (recommended) | SizeLab's Karma+Jasmine+ChromeHeadless | Karma still works and is what the SPEC's literal fallback language names, but it's now the CLI's deprecated path and needs a headless-Chrome binary in CI; Vitest is the CLI default as of late 2025 and needs no browser binary |
| `typescript@^6.0.3` (recommended, matches Angular's peer range) | `typescript@latest` (7.0.2) | 7.x is a different compiler (Go-native `tsgo`); Angular 22.1.x has not adopted it as a peer dependency yet |

**Installation:**
```bash
# from repo root, after pnpm-workspace.yaml + root package.json exist
pnpm add -w -D typescript@^6.0.3

# scaffold the Angular app (see § Code Examples for exact ng new flags)
pnpm dlx @angular/cli@22.1.8 new web --directory=apps/web \
  --zoneless --test-runner=vitest --no-ssr --routing \
  --style=scss --package-manager=pnpm --skip-git

# packages/schema
pnpm add --filter schema zod@^4.6.2
pnpm add --filter schema -D typescript@^6.0.3 vitest@^5.0.0

# apps/web deploy tooling
pnpm add --filter web -D wrangler@^4.131.1
```

**Version verification performed:**
```
npm view @angular/core dist-tags        → latest: 22.1.6
npm view @angular/cli version           → 22.1.8
npm view @angular/cdk version           → 22.1.6
npm view @angular/core@latest peerDependencies → typescript ">=6.0 <6.1", zone.js "~0.15.0 || ~0.16.0" (optional — not installed if --zoneless)
npm view @angular-devkit/build-angular@latest engines/peerDependencies → typescript ">=6.0 <6.1"
npm view typescript versions            → latest stable 6.0.x line is 6.0.3; 7.0.2 is npm "latest" tag
npm view zod version                    → 4.6.2
npm view vitest version / engines       → 5.0.0; node "^22.12.0 || ^24.0.0 || >=26.0.0"
npm view wrangler version                → 4.131.1
npm view pnpm version                    → 12.4.1 (npm latest tag; 9+ is the ADR floor, 11.7.0 already installed locally is fine)
npx @angular/cli@latest new --help       → confirms --zoneless, --test-runner (choices: karma, vitest; default vitest), --ssr, --standalone (default true) flags exist
```

## Package Legitimacy Audit

Ran `gsd-tools query package-legitimacy check` against every package this phase installs. All are long-established, canonical-repo, extremely-high-download packages; every `SUS` verdict below is the checker's "too-new" heuristic firing on the **publish date of the package's latest version** (these are all fast-releasing projects that happened to ship a patch within the last few days) rather than any signal of an actually-new or suspicious package. Verified independently by GitHub repo URL and weekly-download count.

| Package | Registry | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-------------------|-------------|---------|-------------|
| `typescript` | npm | 202,889,689 | github.com/microsoft/TypeScript | OK | Approved |
| `rxjs` | npm | 73,591,853 | github.com/reactivex/rxjs | OK | Approved |
| `zod` | npm | 206,899,040 | github.com/colinhacks/zod | SUS ("too-new": latest version published 2026-09-10) | Approved — false positive, verified by download count + canonical repo. No extra checkpoint needed. |
| `vitest` | npm | 76,675,196 | github.com/vitest-dev/vitest | SUS ("too-new") | Approved — same false-positive pattern |
| `wrangler` | npm | 16,197,739 | github.com/cloudflare/workers-sdk | SUS ("too-new") | Approved — same false-positive pattern |
| `@angular/cdk` | npm | 2,829,460 | github.com/angular/components | SUS ("too-new") | Approved — same false-positive pattern; not installed until Phase 2 anyway |
| `@angular/core` | npm | 4,166,127 | github.com/angular/angular | SUS ("too-new") | Approved — same false-positive pattern |
| `@angular/cli` | npm | 3,814,707 | github.com/angular/angular-cli | SUS ("too-new") | Approved — same false-positive pattern |
| `pnpm` | npm | 131,989,119 | github.com/pnpm/pnpm | SUS ("too-new"); has a `postinstall: node install.js` | Approved — pnpm's postinstall is its own well-known self-install step (installs its native binary), not a red flag on a package with 130M+ weekly downloads |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** all flagged as `SUS` above are false positives from the "too-new" heuristic (it measures latest-version publish recency, not package age/reputation) and are approved without an added `checkpoint:human-verify` task — every one is verified independently by canonical GitHub org + downloads in the tens-to-hundreds of millions per week. The planner may cite this table instead of re-running the check.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────── Browser (Chrome/Firefox/Safari) ───────────────────────────┐
│                                                                                          │
│  ┌──────────────┐   route    ┌───────────────┐    signal reads    ┌─────────────────┐  │
│  │  LibraryPage  │──────────▶│ CharacterPage  │◀───────────────────│  CharacterStore  │  │
│  │ (list/create/ │  /c/:id   │ (header +      │   updateCore()/    │  character()     │  │
│  │  dup/delete)  │           │  masthead)     │   flush()          │  restoring()     │  │
│  └──────┬────────┘           └───────┬────────┘                    └────────┬─────────┘  │
│         │ create()/duplicate()/      │ effect(): 500ms debounce            │ load()/persist()
│         │ remove()                   │ or pagehide → persist(character)    │
│         ▼                            ▼                                     ▼
│  ┌──────────────┐           ┌────────────────────────────────────────────────────┐   │
│  │ LibraryStore │──────────▶│         CharacterRepo (apps/web/services)           │   │
│  └──────────────┘  CRUD     │  wraps NativeIndexedDBService (hand-rolled wrapper) │   │
│                              └───────────────────┬────────────────────────────────┘   │
│                                                   │ validateSubDocument / migrateEnvelope
│                                                   ▼   (from @dossier/schema, imported unchanged)
│                              ┌────────────────────────────────────────────────────┐   │
│                              │        IndexedDB `Charac

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 60784 bytes -->
