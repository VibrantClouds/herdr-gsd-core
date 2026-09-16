---
phase: 01-foundation-library
plan: 03
subsystem: schema
tags: [zod, migration-walker, fixture-guard, indexeddb, share-payload]

requires:
  - phase: 01-foundation-library
    provides: "characterSchema envelope, CharacterRepo/NativeIndexedDBService, pnpm workspace (01-01)"
provides:
  - "packages/schema/src/migrate.ts: the single load-boundary entry point (validateCharacter) with total rejection of unsupported versions before any migration runs"
  - "packages/schema/src/plugin.ts: the Migration/SubDocumentSchema/SCHEMA_REGISTRY contract every Phase 2+ plugin registers against"
  - "packages/schema/src/__tests__/fixture-coverage.ts + fixture-guard.spec.ts: the mechanical fixture-coverage guard, self-tested against synthetic gaps"
  - "packages/schema/src/share.ts: sharePayloadSchema, the budget-capped validator Phase 3's API will reuse unchanged"
  - "CharacterRepo.get()/list() now reject unsupported/invalid stored characters wholesale, leaving IndexedDB untouched"
affects: [01-04, 01-05, 01-06, 02, 03]

actuals:
  tokens: 8784
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Load boundary is always version-check-all -> migrate-all -> Zod-validate-last (ADR-0011); validateCharacter checks the envelope AND every page's type/version before migrating anything, so one unsupported page rejects the whole character (SCHM-03)"
    - "Gap-tolerant migration walker compares every migration's `from` against the document's ORIGINAL recorded version (not progressively updated), per SPEC-serialization-policy.md's literal pseudocode — a no-op bump recorded only in the registry can't strand a document"
    - "Named errors (UnsupportedVersionError: space+version, InvalidDocumentError: issue paths only) never carry document contents or field values (information-disclosure mitigation, T-01-03-04)"
    - "Test-only fixture-coverage.ts and fixture-guard.spec.ts use import.meta.glob(..., { eager: true, import: 'default' }) to derive fixture versions from the filesystem at test time, never hardcoded"

key-files:
  created:
    - packages/schema/src/migrate.ts
    - packages/schema/src/plugin.ts
    - packages/schema/src/share.ts
    - packages/schema/src/fixtures/envelope/1.0.0.json
    - packages/schema/src/__tests__/migrate.spec.ts
    - packages/schema/src/__tests__/fixture-coverage.ts
    - packages/schema/src/__tests__/fixture-guard.spec.ts
    - packages/schema/src/__tests__/share.spec.ts
    - packages/schema/src/__tests__/no-framework-deps.spec.ts
    - packages/schema/src/__tests__/import-meta-glob.d.ts
    - apps/web/src/app/services/character.repo.spec.ts
  modified:
    - packages/schema/src/character.ts
    - packages/schema/src/index.ts
    - apps/web/src/app/services/character.repo.ts

key-decisions:
  - "validateCharacter runs validateSubDocument (not just migrateSubDocument) on every page, so plugin.schema.parse of the page data is part of the load boundary — matches the plugin contract's 'version check -> migrate -> structural validate' even though characterSchema's own page schema treats `data` as z.unknown()"
  - "fixture-coverage.ts stays outside the build (packages/schema/tsconfig.build.json already excludes src/**/__tests__/**) since it is a test-only helper, per plan action; it derives nothing from the filesystem itself — callers glob fixture versions and pass them in"

requirements-completed: [SCHM-01, SCHM-02, SCHM-03]

coverage:
  - id: D1
    description: "Migration walker (compareVersions, migrateSubDocument, validateSubDocument, migrateEnvelope, validateCharacter) totally rejects an unsupported envelope or page version before migrating anything, migrates in gap-tolerant array order, validates last, and never mutates its input"
    requirement: SCHM-03
    verification:
      - kind: unit
        ref: "packages/schema/src/__tests__/migrate.spec.ts (14 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Plugin contract (Migration, SubDocumentSchema<TData>, SchemaRegistry, frozen empty SCHEMA_REGISTRY) that Phase 2 registers the first real plugin against"
    requirement: SCHM-02
    verification:
      - kind: unit
        ref: "packages/schema/src/__tests__/fixture-guard.spec.ts > every SCHEMA_REGISTRY entry has zero coverage problems"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fixture-coverage guard (checkFixtureCoverage) self-tested against synthetic gaps (missing fixture, orphan fixture, missing migration, numeric-not-string version ordering), then proven zero-problem for the real envelope and (empty) registry"
    requirement: SCHM-02
    verification:
      - kind: unit
        ref: "packages/schema/src/__tests__/fixture-guard.spec.ts (9 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Envelope fixture at 1.0.0 is fully populated and round-trips through validateCharacter; renaming it turns the guard build red naming the missing version"
    requirement: SCHM-02
    verification:
      - kind: unit
        ref: "packages/schema/src/__tests__/fixture-guard.spec.ts > every envelope fixture passes validateCharacter"
        status: pass
      - kind: other
        ref: "manual: renamed fixtures/envelope/1.0.0.json, vitest run fixture-guard.spec.ts exited non-zero naming '1.0.0' as missing a fixture, restored the file (git status clean afterward)"
        status: pass
    human_judgment: false
  - id: D5
    description: "sharePayloadSchema strips core.id and enforces the same budget caps as the envelope (60 images, 30 MiB total, unique page types, PAGES_MAX)"
    requirement: SCHM-01
    verification:
      - kind: unit
        ref: "packages/schema/src/__tests__/share.spec.ts (5 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "packages/schema has exactly one runtime dependency (zod), no peerDependencies, and no @angular/*, node:*, or bare Node builtin imports anywhere in src"
    requirement: SCHM-01
    verification:
      - kind: unit
        ref: "packages/schema/src/__tests__/no-framework-deps.spec.ts (2 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "CharacterRepo.get()/list() reject unsupported-version or invalid stored characters wholesale via validateCharacter, leaving the IndexedDB record byte-identical; get() propagates the named error, list() buckets it into RejectedRecord.reason"
    requirement: SCHM-03
    verification:
      - kind: integration
        ref: "apps/web/src/app/services/character.repo.spec.ts (4 tests)"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-09-11
status: complete
---

# Phase 1 Plan 3: Migration Walker, Fixture Guard, Share Schema Summary

**Per-plugin migration walker with total-rejection load-boundary semantics (`validateCharacter`), a self-tested fixture-coverage guard, `sharePayloadSchema`, and `CharacterRepo` wired to reject unsupported/invalid stored characters wholesale.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-11T20:36:00Z
- **Completed:** 2026-09-11T20:48:53Z
- **Tasks:** 3
- **Files modified:** 14 (6 commits: 3 RED + 3 GREEN, no refactor commits needed)

## Accomplishments

- `migrate.ts`: `compareVersions` (numeric per-segment, `TypeError` on malformed input), `migrateSubDocument`/`validateSubDocument` (gap-tolerant walker + Zod parse), `migrateEnvelope`, and `validateCharacter` — the single load-boundary entry point that checks the envelope version and every page's type/version before migrating anything (SCHM-03 total rejection), never mutates its input (proven against a deep-frozen character), and never leaks document contents in error messages
- `plugin.ts`: `Migration` and `SubDocumentSchema<TData>` contracts plus a frozen, empty `SCHEMA_REGISTRY` — Phase 2 registers the first real plugin against this unchanged
- `fixture-coverage.ts` + `fixture-guard.spec.ts`: mechanical fixture-coverage guard, self-tested against 5 synthetic gaps (missing fixture, orphan fixture, missing migration, numeric-vs-string version ordering), then proven zero-problem for the real envelope fixture and the (empty) `SCHEMA_REGISTRY`
- `share.ts`: `sharePayloadSchema` strips `core.id`, caps pages at `PAGES_MAX` with unique types, caps images at `SHARE_IMAGES_MAX` with a total-bytes refine at `SHARE_IMAGE_BYTES_MAX`
- `no-framework-deps.spec.ts`: proves `packages/schema` has exactly one runtime dependency (zod) and zero `@angular/*`/`node:*`/bare-builtin imports anywhere in `src`
- `CharacterRepo.get()`/`list()` now run `validateCharacter` instead of `characterSchema.parse`/`safeParse`; an unsupported-version or invalid stored record is rejected wholesale, the IndexedDB record is left byte-identical, and `list()` correctly distinguishes `'unsupported-version'` from `'invalid'` in `RejectedRecord.reason`

## Task Commits

Each TDD task produced a RED (test) commit and a GREEN (feat) commit; no REFACTOR commits were needed (implementations were clean on first pass):

1. **Task 1: Migration walker, named errors, plugin contract** — `00cff08` (test), `f19b3a8` (feat)
2. **Task 2: Envelope fixture, fixture-coverage guard, share schema, zero-dep guard** — `68ae6aa` (test), `2d68f5d` (feat)
3. **Task 3: Wire validateCharacter into CharacterRepo** — `f62f9d7` (test), `b40d15b` (feat)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified

- `packages/schema/src/migrate.ts` — walker, named errors, `validateCharacter`
- `packages/schema/src/plugin.ts` — `Migration`, `SubDocumentSchema`, `SCHEMA_REGISTRY`
- `packages/schema/src/character.ts` — added `ENVELOPE_SUPPORTED_VERSIONS`, `ENVELOPE_MIGRATIONS`
- `packages/schema/src/share.ts` — `sharePayloadSchema`, `SharePayload`, `ShareKind`
- `packages/schema/src/index.ts` — re-exports plugin/migrate/share
- `packages/schema/src/fixtures/envelope/1.0.0.json` — fully populated Character fixture
- `packages/schema/src/__tests__/migrate.spec.ts`, `fixture-coverage.ts`, `fixture-guard.spec.ts`, `share.spec.ts`, `no-framework-deps.spec.ts`, `import-meta-glob.d.ts`
- `apps/web/src/app/services/character.repo.ts` — `get()`/`list()` wired to `validateCharacter`
- `apps/web/src/app/services/character.repo.spec.ts` — load-boundary total-rejection spec (fake-indexeddb)

## Decisions Made

- `validateCharacter` runs `validateSubDocument` (not just `migrateSubDocument`) on every page, so plugin `schema.parse` of page data is part of the load boundary — matches the plugin contract's "version check → migrate → structural validate" even though `characterSchema`'s own page schema treats `data` as `z.unknown()`.
- `fixture-coverage.ts` stays outside the build (already excluded via `tsconfig.build.json`'s `src/**/__tests__/**`) as a test-only helper; it derives nothing from the filesystem — callers glob fixture versions and pass them in.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `validateCharacter`/`migrateSubDocument`/`SCHEMA_REGISTRY` are the fixed contracts Phase 2's first plugin (bio/physical or intimacy) registers against; adding a type requires zero changes to `migrate.ts` or `CharacterRepo`.
- `fixture-guard.spec.ts` will fail the build the moment Phase 2 adds a plugin without a matching fixture or a migration for a non-last supported version — mechanical enforcement is already wired to `import.meta.glob` over `../plugins/*/fixtures/*.json`, so no guard changes are needed when Phase 2 lands.
- `sharePayloadSchema` is ready for Phase 3's API to import unchanged (ADR-0008).
- No blockers for 01-04/01-05/01-06 (autosave, page CRUD, share UI), all of which read/write through the now-hardened `CharacterRepo` load boundary.

---
*Phase: 01-foundation-library*
*Completed: 2026-09-11*

## Self-Check: PASSED
