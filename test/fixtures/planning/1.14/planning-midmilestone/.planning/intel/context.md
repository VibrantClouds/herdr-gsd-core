# Context

Synthesized from 1 DOC-classified document. DOC has lowest precedence (below ADR, SPEC, PRD) per this repo's own stated taxonomy.

## Topic: Repository purpose and structure
- source: docs/README.md
- This repository (at time of writing) contains only a specification and the original prototype; there is no application code yet.
- Prototype: `character-dossier.html` (repo root) — a single-file "Intimacy Dossier" (fixed rating lists, lean sliders, free-text fields, localStorage save slots, paste-based export/import, print stylesheet, light and dark themes). Seed for the first sub-document type and the design system. (Not ingested — not Markdown; referenced by ADR-0001, ADR-0015, SPEC-design-system as a known external artifact per the ingest instructions.)
- Product summary: Character Dossier — Angular 22 (zoneless-by-default) SPA where a Character (name, species/build, pronouns, orientation, portrait) owns an ordered set of typed sub-documents, all on one unified edit-in-place page, stored locally in IndexedDB, shared by link through a small Node service on Railway writing to S3.

## Topic: Document taxonomy (author's own GSD precedence statement)
- source: docs/README.md
- The docs are written to be ingested by GSD, which classifies by directory/frontmatter and applies precedence ADR > SPEC > PRD > DOC: `adr/` (locked decisions, highest), `specs/` (technical constraints, above PRD), `prd/` (requirements with REQ-IDs, mid), `README.md` (context only, lowest).
- This matches the PRECEDENCE input given to this synthesis run (`['ADR','SPEC','PRD','DOC']`) — no conflict with configured precedence.

## Topic: Reading order (informational, not binding)
- source: docs/README.md
- Suggested order: PRD → ADR-0001 through ADR-0016 → SPEC-domain-model + SPEC-subdocument-plugin-contract → SPEC-intimacy-dossier + SPEC-gallery-and-portrait → SPEC-share-api + SPEC-storage-s3 + SPEC-image-pipeline → SPEC-frontend-architecture + SPEC-design-system → SPEC-serialization-policy + SPEC-security-and-abuse + SPEC-deployment.

## Topic: Cross-cutting invariants (author's own summary, echoes ADR content)
- source: docs/README.md
- A character holds at most one instance of each sub-document type.
- The `pages` array order is the display order; there is no separate order field.
- An image's identity is the SHA-256 of the stored, compressed bytes; that hash is the IndexedDB key, the S3 key and the CDN path.
- A share's `adult` flag is recomputed on the server from the registry; the client's value is never trusted.
- The owner token lives only in the URL fragment (`#edit=...`) and in the owner's own browser storage; never sent to any server as part of a URL and never logged.
- Rating values are integer levels keyed by stable ids, never display strings.
- A structural schema change = version bump + named migration + fixture, per type, enforced by a guard spec. Behavioural changes do not bump.
- Snapshot shares are immutable; living shares are overwritten in place; neither expires.
- These invariants are consistent with, and restate, decisions already recorded in the ADRs (see `decisions.md`); no independent claims beyond what the ADRs/SPECs already establish were found.

## Topic: Author's expected ingest outcome (self-referential — informational only, not authoritative)
- source: docs/README.md
- The README states an expectation that `/gsd-ingest-docs docs` discovery reports "about 30 documents: 16 ADR, 1 PRD, 12 SPEC, 1 DOC" and that "the conflict report should show 0 blockers... the ADRs are internally consistent."
- This synthesis run independently verified 30 classifications (16 ADR/1 PRD/12 SPEC/1 DOC) matching the author's stated expectation, and found 0 blockers upon full-content review. This alignment is noted for transparency; it was not used as a substitute for independent conflict detection — every ADR, PRD requirement, and SPEC constraint was read and cross-checked in full.
- The README also names a routing recommendation ("Create planning setup," project name "Character Dossier") — this is process guidance for the ingest workflow, not project content, and is out of scope for this synthesizer (routing/roadmapping is `gsd-roadmapper`'s responsibility).

## Topic: Reference project (Size✦Lab)
- source: docs/README.md
- Specs cite patterns from Size✦Lab at `~/Development/Personal/SizeComparisonSite` (Angular 20, zone.js). Character Dossier targets Angular 22 and zoneless change detection, so copied patterns must be checked for zone-dependent behaviour. A table of specific SizeLab files worth opening is provided (hosting config, migration registry, IndexedDB wrapper, share-link guard, snackbar/viewport services, image-processing worker, upload signature sniffing, design tokens, security-naming rule, Angular conventions). SizeLab's backend is a separate, unavailable Cloudflare Worker repo — Character Dossier's backend is designed from scratch.
