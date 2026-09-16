---
schema_version: 1
open_count: 0
waived_count: 2
fixed_count: 0
total_count: 2
last_updated: 2026-08-01T22:41:48.000Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 05 | deviation | src/app/services/attachment-canvas-renderer.service.ts |  | 05-12 scope ruling deferred this file's coverage gap (41.31% stmt / 37.23% branch, largest of 7 TEST-02 audit targets) to 05-13 backlog promotion; render() private helpers renderOverlays/renderPendingAttachment/renderAttachmentPoints/renderAngleIndicator/renderPendingNewPoint/renderCrosshairs remain uncovered | waived | Promoted to .planning/REQUIREMENTS.md v2 Test Coverage section as TESTV2-04 (05-13); tracked there durably rather than left open against this phase's ship gate. | 2026-08-01T22:35:06.778Z | 2026-08-01T22:41:48.000Z |
| 2 | 05 | deviation | src/app/services/upload-image-pipeline.service.ts |  | 05-12 scope ruling deferred this lower-priority coverage gap (57.14% branch) as a secondary 05-13 backlog candidate; likely worker-vs-fallback dispatch and processFile error-path branches remain uncovered | waived | Promoted to .planning/REQUIREMENTS.md v2 Test Coverage section as TESTV2-05 (05-13); tracked there durably rather than left open against this phase's ship gate. | 2026-08-01T22:35:15.073Z | 2026-08-01T22:41:48.000Z |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "05",
    "file": "src/app/services/attachment-canvas-renderer.service.ts",
    "line": null,
    "description": "05-12 scope ruling deferred this file's coverage gap (41.31% stmt / 37.23% branch, largest of 7 TEST-02 audit targets) to 05-13 backlog promotion; render() private helpers renderOverlays/renderPendingAttachment/renderAttachmentPoints/renderAngleIndicator/renderPendingNewPoint/renderCrosshairs remain uncovered",
    "status": "waived",
    "reason": "Promoted to .planning/REQUIREMENTS.md v2 Test Coverage section as TESTV2-04 (05-13); tracked there durably rather than left open against this phase's ship gate.",
    "recorded_at": "2026-08-01T22:35:06.778Z",
    "resolved_at": "2026-08-01T22:41:48.000Z"
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "05",
    "file": "src/app/services/upload-image-pipeline.service.ts",
    "line": null,
    "description": "05-12 scope ruling deferred this lower-priority coverage gap (57.14% branch) as a secondary 05-13 backlog candidate; likely worker-vs-fallback dispatch and processFile error-path branches remain uncovered",
    "status": "waived",
    "reason": "Promoted to .planning/REQUIREMENTS.md v2 Test Coverage section as TESTV2-05 (05-13); tracked there durably rather than left open against this phase's ship gate.",
    "recorded_at": "2026-08-01T22:35:15.073Z",
    "resolved_at": "2026-08-01T22:41:48.000Z"
  }
]
````
