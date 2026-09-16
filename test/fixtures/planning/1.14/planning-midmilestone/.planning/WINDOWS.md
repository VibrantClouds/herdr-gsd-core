---
schema_version: 1
open_count: 4
waived_count: 0
fixed_count: 1
total_count: 5
last_updated: 2026-09-14T23:29:27.850Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | unrun-verify | apps/web/src/app/subdocs/intimacy/intimacy-editor.component.html |  | Task 3 human-check: side-by-side visual comparison against docs/prototype/character-dossier.html at 400px/desktop, light/dark themes — deferred, browser automation unavailable to this executor | fixed |  | 2026-09-14T15:22:42.546Z | 2026-09-14T16:38:18.460Z |
| 2 | 03 | deviation | docs/specs/SPEC-deployment.md |  | Railway ignored config-as-code and built with Railpack until RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile was set manually; SPEC-deployment's Railway section needs this documented | open |  | 2026-09-14T23:29:27.634Z |  |
| 3 | 03 | deviation | docs/specs/SPEC-deployment.md |  | api.characterdossierlab.app is Cloudflare-proxied (orange cloud) rather than DNS-only per D-15/T-03-08-03; needs explicit user accept/mitigate decision and threat register update | open |  | 2026-09-14T23:29:27.704Z |  |
| 4 | 03 | deviation | docs/specs/SPEC-storage-s3.md |  | Production bucket is named character-dossier (us-west-2), not character-dossier-prod as SPEC-storage-s3/SPEC-deployment/03-08 specify | open |  | 2026-09-14T23:29:27.779Z |  |
| 5 | 03 | unmet-truth | .planning/phases/03-snapshot-share-end-to-end/03-08-PLAN.md |  | Railway single-instance replica count (backstop truth for Phase 7's in-memory rate limiter) not yet explicitly confirmed by the user from the dashboard | open |  | 2026-09-14T23:29:27.850Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "apps/web/src/app/subdocs/intimacy/intimacy-editor.component.html",
    "line": null,
    "description": "Task 3 human-check: side-by-side visual comparison against docs/prototype/character-dossier.html at 400px/desktop, light/dark themes — deferred, browser automation unavailable to this executor",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-14T15:22:42.546Z",
    "resolved_at": "2026-09-14T16:38:18.460Z"
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "03",
    "file": "docs/specs/SPEC-deployment.md",
    "line": null,
    "description": "Railway ignored config-as-code and built with Railpack until RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile was set manually; SPEC-deployment's Railway section needs this documented",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-14T23:29:27.634Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "03",
    "file": "docs/specs/SPEC-deployment.md",
    "line": null,
    "description": "api.characterdossierlab.app is Cloudflare-proxied (orange cloud) rather than DNS-only per D-15/T-03-08-03; needs explicit user accept/mitigate decision and threat register update",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-14T23:29:27.704Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "03",
    "file": "docs/specs/SPEC-storage-s3.md",
    "line": null,
    "description": "Production bucket is named character-dossier (us-west-2), not character-dossier-prod as SPEC-storage-s3/SPEC-deployment/03-08 specify",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-14T23:29:27.779Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "unmet-truth",
    "phase": "03",
    "file": ".planning/phases/03-snapshot-share-end-to-end/03-08-PLAN.md",
    "line": null,
    "description": "Railway single-instance replica count (backstop truth for Phase 7's in-memory rate limiter) not yet explicitly confirmed by the user from the dashboard",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-14T23:29:27.850Z",
    "resolved_at": null
  }
]
````
