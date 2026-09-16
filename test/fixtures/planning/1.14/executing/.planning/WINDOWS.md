---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-07-26T18:18:35.107Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | deviation | src/db/packaging.e2e.test.ts |  | Plan 02-15's full npm test run surfaced pre-existing failures in cwd-independence.e2e.test.ts, registry.test.ts, tracer.e2e.test.ts, packaging.e2e.test.ts (ERR_MODULE_NOT_FOUND for commander in a built dist) unrelated to this plan's files; this plan's own scoped test run (79 tests across service/routes/parity) is green | open |  | 2026-07-26T18:18:35.107Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "02",
    "file": "src/db/packaging.e2e.test.ts",
    "line": null,
    "description": "Plan 02-15's full npm test run surfaced pre-existing failures in cwd-independence.e2e.test.ts, registry.test.ts, tracer.e2e.test.ts, packaging.e2e.test.ts (ERR_MODULE_NOT_FOUND for commander in a built dist) unrelated to this plan's files; this plan's own scoped test run (79 tests across service/routes/parity) is green",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-26T18:18:35.107Z",
    "resolved_at": null
  }
]
````
