# Phase 3: Snapshot Share End-to-End - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-14
**Phase:** 03-snapshot-share-end-to-end
**Areas discussed:** Page choice in snapshot, Publish dialog & records, Share page & import, Hosting & dev stack

---

## Page choice in snapshot

| Option | Description | Selected |
|--------|-------------|----------|
| Build selector now | Shared SectionSelector (§4.14) now, no size estimate; Phase 5/6 reuse | ✓ |
| Simple checkbox list now | Dialog-only list, replaced in Phase 6 | |
| Share every page | No choice until Phase 5 | |

**User's choice:** Build selector now

| Option | Description | Selected |
|--------|-------------|----------|
| All pages checked | Owner unchecks Intimacy when needed | ✓ |
| Adult pages unchecked | Opt in to adult pages | |
| Nothing checked | Owner picks every page | |

**User's choice:** All pages checked

| Option | Description | Selected |
|--------|-------------|----------|
| Allow header-only | Empty pages array is valid | ✓ |
| Require one page | Publish disabled until a page is checked | |

**User's choice:** Allow header-only

---

## Publish dialog & records

| Option | Description | Selected |
|--------|-------------|----------|
| Top bar beside Library link | Print joins it in Phase 6 | ✓ |
| In the header card | Near the name | |
| Bottom near Add page | Below last page | |

**User's choice:** Top bar beside Library link

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot only, no picker | Phase 5 adds the choice | ✓ |
| Picker with Living disabled | "Coming soon" option | |

**User's choice:** Snapshot only

| Option | Description | Selected |
|--------|-------------|----------|
| Dialog shows link + Copy | Auto-copy, result view, clipboard-failure text | ✓ |
| Close dialog + snackbar | Faster, URL lost if clipboard fails | |

**User's choice:** Dialog shows link + Copy

| Option | Description | Selected |
|--------|-------------|----------|
| Store silently now | `shares` record incl. owner token, no UI list | ✓ |
| Store + show list | "Earlier links" in dialog | |
| Do not store | Token discarded | |

**User's choice:** Store silently now

| Option | Description | Selected |
|--------|-------------|----------|
| One short plain line | "Anyone with this link can view…" | ✓ |
| Line + no-expiry note | Mentions deleting, which ships in Phase 5 | |

**User's choice:** One short plain line

---

## Share page & import

| Option | Description | Selected |
|--------|-------------|----------|
| Slim bar: kind + date + Save | No Library link; theme toggle stays | ✓ |
| No bar, Save at bottom | Clean sheet, no date | |
| Banner explaining the app | More context, more noise | |

**User's choice:** Slim bar

| Option | Description | Selected |
|--------|-------------|----------|
| Go to the new copy | Navigate to /c/:newId + snackbar | ✓ |
| Stay + snackbar with Open | Remain on share page | |

**User's choice:** Go to the new copy

| Option | Description | Selected |
|--------|-------------|----------|
| One shared message | 404 and 410 identical | ✓ |
| Separate removed message | Reveals takedown | |

**User's choice:** One shared message

| Option | Description | Selected |
|--------|-------------|----------|
| Retry for offline, Home for all | Try again re-fetches in place | ✓ |
| Home link only | Manual reload | |

**User's choice:** Retry for offline, Home for all

---

## Hosting & dev stack

| Option | Description | Selected |
|--------|-------------|----------|
| Live on Railway + AWS | Human checkpoints for consoles; no CloudFront yet | ✓ |
| Local only, deploy-ready | Config written, not applied | |
| Railway live, S3 later | Existing S3-compatible bucket | |

**User's choice:** Live on Railway + AWS

| Option | Description | Selected |
|--------|-------------|----------|
| Use platform URLs for now | workers.dev + up.railway.app | |
| Yes, I have a domain | Set up now | ✓ |

**User's choice:** "I have a domain, it's characterdossierlab.app on cloudflare"

| Option | Description | Selected |
|--------|-------------|----------|
| Apex, www redirects | Shortest share links | ✓ |
| www, apex redirects | Longer links | |

**User's choice:** Apex, www redirects
**Notes:** api CNAME to Railway is DNS-only (grey cloud) — accepted default.

| Option | Description | Selected |
|--------|-------------|----------|
| MinIO in Docker Compose | Root compose file creates dev bucket | ✓ |
| Real AWS dev bucket | Credentials on local machine | |
| LocalStack | Heavier emulator | |

**User's choice:** MinIO in Docker Compose

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory fake behind interface | No Docker for `pnpm test`; one opt-in MinIO spec | ✓ |
| Always real MinIO | Tests need Docker | |
| Mock the AWS SDK | aws-sdk-client-mock | |

**User's choice:** In-memory fake behind interface

---

## Claude's Discretion

- Publish-dialog error mapping per SPEC-share-api codes
- Autosave flush before payload build
- Location of shared `computeAdult` (does not yet exist)
- Share page loading state and date format
- Web environment file naming (follow code, correct SPEC-deployment §3)
- Railway build via Nixpacks or Dockerfile
- `noindex` mechanism

## Deferred Ideas

- "Earlier links" list in the share dialog — Phase 5
