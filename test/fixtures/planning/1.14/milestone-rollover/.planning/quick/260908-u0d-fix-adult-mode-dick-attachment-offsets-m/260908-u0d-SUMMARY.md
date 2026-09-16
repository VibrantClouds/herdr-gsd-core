---
phase: 260908-u0d
plan: 01
subsystem: data
tags: [metadata, attachment-points, adult-mode]

# Dependency graph
requires: []
provides:
  - "Male Human default attachment-point moved from thigh (925, 1460) to crotch (850, 1435)"
  - "Male Furry default attachment-point moved from thigh (965, 1470) to crotch (910, 1465)"
affects: [attachment-system, adult-mode]

# Actuals (#2632)
actuals:
  tokens: 250
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/assets/metadata/Male_Human.json
    - src/assets/metadata/Male_Furry.json

key-decisions:
  - "Data-only fix: corrected the two wrong coordinate pairs in the base-model metadata rather than touching renderer math, since both renderers were already verified to align source/target attachment points correctly to within 0.2px."
  - "No state-export.service.ts CURRENT_VERSION bump — this changes values inside existing fields, not the ExportedState/AppState/ImageModel/AttachmentPoint shape."

patterns-established: []

requirements-completed: [QUICK-260908-u0d]

coverage:
  - id: D1
    description: "Male Human default attachment-point moved from (925, 1460) to (850, 1435)"
    requirement: "QUICK-260908-u0d"
    verification:
      - kind: other
        ref: "node JSON.parse assertion script (plan <verify><automated>) — confirmed p.x===850 && p.y===1435, penetration-zone/originalDimensions/sliderSettings unmodified"
        status: pass
    human_judgment: false
  - id: D2
    description: "Male Furry default attachment-point moved from (965, 1470) to (910, 1465)"
    requirement: "QUICK-260908-u0d"
    verification:
      - kind: other
        ref: "node JSON.parse assertion script (plan <verify><automated>) — confirmed p.x===910 && p.y===1465, penetration-zone/originalDimensions/sliderSettings unmodified"
        status: pass
    human_judgment: false
  - id: D3
    description: "In adult mode, Human Dick and Canine Dick attachments render at the crotch on Male Human and Male Furry respectively"
    requirement: "QUICK-260908-u0d"
    verification: []
    human_judgment: true
    rationale: "Requires visual browser confirmation in adult mode with both attachments applied — the plan's own <human-check> designates this as an orchestrator-run Playwright verification, not something the executor can assert from the metadata alone."

# Metrics
duration: 8min
completed: 2026-09-08
status: complete
---

# Quick Task 260908-u0d: Fix Adult-Mode Dick Attachment Offsets Summary

**Moved the default `attachment-point` on Male Human and Male Furry metadata from the thigh to the crotch, fixing the visible offset of adult-mode dick attachments.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-08T00:00:00Z
- **Completed:** 2026-09-08T00:08:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Corrected `Male_Human.json` default `attachment-point` from (925, 1460) to (850, 1435).
- Corrected `Male_Furry.json` default `attachment-point` from (965, 1470) to (910, 1465).
- Verified both files still parse as valid JSON, still contain exactly two attachment points each, and that `penetration-zone`, `originalDimensions`, and `sliderSettings` are byte-identical to before.

## Task Commits

Each task was committed atomically:

1. **Task 1: Move default attachment-point to the crotch on both male base models** - `7f49f1d` (fix)

_Note: This is a data-only quick task; no separate plan-metadata commit is made by the executor (orchestrator handles docs commit)._

## Files Created/Modified
- `src/assets/metadata/Male_Human.json` - `attachment-point` x/y changed from (925, 1460) to (850, 1435)
- `src/assets/metadata/Male_Furry.json` - `attachment-point` x/y changed from (965, 1470) to (910, 1465)

## Decisions Made
- Confirmed the offset was a base-model metadata defect, not a renderer bug — both DOM (`image-display`) and Canvas (`attachment-preview`) renderers already align `sourceAttachmentPointId` ('attachment-point') onto the base model's `targetAttachmentPointId` correctly. Fixed at the data source instead of touching any TypeScript.
- No `state-export.service.ts` `CURRENT_VERSION` bump — the `ExportedState`/`AppState`/`ImageModel`/`AttachmentPoint` shapes are unchanged; only two integer values inside an existing field changed.

## Deviations from Plan

None - plan executed exactly as written. Four single-value edits (2 per file), scoped `Edit` calls anchored on surrounding context to avoid touching the nearby `penetration-zone` x/y values, single atomic commit.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness

- Fix is self-contained and complete. Old share links / exported state created before this change still embed the old (thigh) coordinates in their snapshotted `ImageModel` — this is accepted pre-existing snapshot-serialization behavior per the plan's `<known_accepted_behavior>`, not a regression, and not something this task attempts to fix.
- Orchestrator should run the Playwright browser verification described in the plan's `<human-check>` (adult mode, Male Human + Human Dick, Male Furry + Canine Dick, confirm crotch placement) to close out coverage item D3.

---
*Phase: 260908-u0d-fix-adult-mode-dick-attachment-offsets-m*
*Completed: 2026-09-08*
