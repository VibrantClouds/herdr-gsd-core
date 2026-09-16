---
phase: "03"
slug: "snapshot-share-end-to-end"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
block_on: high
threats_total: 45
threats_closed: 45
register_authored_at_plan_time: true
created: "2026-09-16"
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register origin: **authored at plan time** — all 8 PLAN.md files carry a `<threat_model>` block.
This audit verified that each declared mitigation exists in the implementation; it did not scan
for new threats.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser/any client → API | POST body and GET id are untrusted | Share payload (character text, page types, image manifest), share id |
| API → object store | Stored bytes are read back and parsed | Gzipped share object, owner token hash |
| API response → browser | Share payload text is rendered by the share page | Character prose, display names, page titles |
| npm registry → repo | New dependencies enter the lockfile | Package tarballs, transitive deps |
| Cloudflare edge → Railway | TLS terminated at Cloudflare, re-originated to Railway | All API traffic (see accepted risk R-03-01) |
| Operator → AWS / Railway consoles | Bucket policy, IAM policy, service variables | Production credentials, deployment config |

---

## Threat Register

45 threats. Every row verified against implementation files by `gsd-security-auditor`
(2026-09-16). Evidence is grep/read-based against real source, except the five console/dashboard
rows explicitly marked **attested**.

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01-01 | Tampering | POST adult flag | high | mitigate | `routes/shares.ts:97` `computeAdult(payload.pages)` server-side; `migrate.ts:84` forces `adult` from the registry | closed |
| T-03-01-02 | Information Disclosure | owner token at rest | high | mitigate | `routes/shares.ts:135,141` stores only `hashToken(ownerToken)`; `share-object.ts:14` `tokenHash` is the only token field | closed |
| T-03-01-03 | Information Disclosure | share id guessing | medium | mitigate | `tokens.ts:10-12` `randomBytes(16)` (125 bits); malformed id and miss both 404 (`routes/shares.ts:181-187`) | closed |
| T-03-01-04 | Denial of Service | page type `constructor` | medium | mitigate | `migrate.ts:55-56` `Object.hasOwn` registry lookup at all 6 read sites → 422, not a 500 TypeError | closed |
| T-03-01-05 | Tampering | corrupt stored object | low | mitigate | `share-object.ts:32-34` Zod `.parse`; `index.ts:73` `app.onError` fixed 500 body | closed |
| T-03-01-06 | Elevation of Privilege | rendering shared text | medium | mitigate | No `innerHTML` in share/character-header trees (grep exit 1); `SharePage.load()` re-runs `validateSharePayload` | closed |
| T-03-01-SC | Tampering | npm installs | high | mitigate | Blocking-human legitimacy checkpoint before install (03-01-SUMMARY); `pnpm-lock.yaml` tracked | closed |
| T-03-02-01 | Spoofing | CORS origin check | high | mitigate | `index.ts:42-47` exact-match origin fn; no wildcard/reflect anywhere (grep exit 1) | closed |
| T-03-02-02 | Denial of Service | oversized POST body | high | mitigate | `routes/shares.ts:55-56` `bodyLimit` 524288 bytes before parsing | closed |
| T-03-02-03 | Tampering | overwrite of an existing share | high | mitigate | `routes/shares.ts:154-169` 3-attempt `putIfAbsent`, throws rather than overwriting | closed |
| T-03-02-04 | Information Disclosure | logs | high | mitigate | `index.ts:60-61,75` logs only `{method, route, status, ms}` and `{err.name}` | closed |
| T-03-02-05 | Information Disclosure | enumeration | medium | mitigate | Only `shares.get('/:id')`; no collection route. Live: `GET /v1/shares` → 404 | closed |
| T-03-02-06 | Tampering | image manifest / budget | medium | mitigate | `routes/shares.ts:99-127` budget sums real HEAD `contentLength`, never the client's declared bytes | closed |
| T-03-02-07 | Information Disclosure | config errors | medium | mitigate | `config.ts:29,34` `ConfigError` message is key names only | closed |
| T-03-02-08 | Elevation of Privilege | `RATE_LIMIT_DISABLED` in production | low | mitigate | `config.ts:22-24` `.refine` rejects it at boot | closed |
| T-03-03-01 | Tampering | concurrent create of same key | high | mitigate | `s3.ts:71,79-81` `IfNoneMatch: '*'` on every create; 412/409 → false | closed |
| T-03-03-02 | Information Disclosure | credential leak via git | high | mitigate | `.gitignore:7-9`; only `.env.example` tracked (MinIO defaults only); `.dockerignore:3` excludes `**/.env` | closed |
| T-03-03-03 | Information Disclosure | bucket enumeration | high | mitigate | No `ListObjects`/`ListBucket` in store or routes (grep exit 1) | closed |
| T-03-03-04 | Denial of Service | 403-for-missing misread as server error | medium | mitigate | `s3.ts:52,90` `get`/`head` map 404 and 403 → null | closed |
| T-03-03-05 | Elevation of Privilege | container runs as root | low | mitigate | `apps/api/Dockerfile:23` `USER node` | closed |
| T-03-03-06 | Tampering | unpinned base images | low | accept | `Dockerfile:3` `node:22-alpine` floats as declared; MinIO/mc pinned to `RELEASE.*` tags — see R-03-02 | closed |
| T-03-04-01 | Information Disclosure | owner token display/logs | high | mitigate | `share-dialog.component.ts` has zero `ownerToken`/`console.*` references; `share.store.ts:147,153` logs `err.name` only | closed |
| T-03-04-02 | Repudiation | lost token after publish | medium | mitigate | `share-dialog.component.html:18` `@if (!r.recordSaved)` surfaces the alert | closed |
| T-03-04-03 | Information Disclosure | publishing unintended pages | medium | mitigate | `section-selector.component.ts:27,39-44` emits page-ordered checked types only; store serializes the filtered set | closed |
| T-03-04-04 | Tampering | client budget check | low | accept | UX guard only; server re-checks (same code as T-03-02-06) — see R-03-03 | closed |
| T-03-04-05 | Elevation of Privilege | rendering display names/URL | low | mitigate | No `innerHTML` in dialog or selector (grep exit 1) | closed |
| T-03-05-01 | Information Disclosure | adult content before acknowledgement | high | mitigate | `share-page.component.html` `@if (gate())` renders only `<cd-adult-interstitial>`; dossier markup is a mutually exclusive branch. Gate is `share.adult \|\| computeAdult(payload.pages)` (`:146-148`) | closed |
| T-03-05-02 | Information Disclosure | takedown vs missing | medium | mitigate | `share-page.component.ts:159` maps 404 and 410 to one view; no "removed/taken down" text (grep exit 1) | closed |
| T-03-05-03 | Tampering | imported payload shape | medium | mitigate | `share-page.component.ts:145` `validateSharePayload`; `library.store.ts:136` `validateCharacter` | closed |
| T-03-05-04 | Elevation of Privilege | owner rights via import | medium | mitigate | No `ShareRepo`/`ownerToken` in `library.store.ts` (grep exit 1) | closed |
| T-03-05-05 | Information Disclosure | indexing of share URLs | low | mitigate | `share-page.component.ts:92-93` `noindex` meta added in constructor, removed on destroy | closed |
| T-03-05-06 | Spoofing | bypassing the notice | low | accept | ADR-0013; `SPEC-security-and-abuse.md:42` documents the courtesy-notice limitation — see R-03-04 | closed |
| T-03-05-07 | Elevation of Privilege | rendering shared text | low | mitigate | No `innerHTML` under `pages/share` (grep exit 1) | closed |
| T-03-06-01 | Elevation of Privilege | CSP connect-src | medium | mitigate | `_worker.js:2` adds exactly one https origin to `connect-src`; `script-src`/`frame-ancestors` unchanged | closed |
| T-03-06-02 | Spoofing | www host serving a second origin | low | mitigate | `_worker.js:11-14` 301 runs before `env.ASSETS.fetch` | closed |
| T-03-06-03 | Tampering | fake API diverging from the server | low | mitigate | `testing/fake-share-api.ts:1,60,68` imports the shared `validateSharePayload` and `computeAdult` | closed |
| T-03-07-01 | Information Disclosure | bucket enumeration by API credential | high | mitigate | **Attested (strong).** `SPEC-storage-s3.md:77,86` policy has no `s3:ListBucket`; 03-07 ran two independent live checks against the real bucket, both `AccessDenied`/403 | closed |
| T-03-07-02 | Information Disclosure | public bucket | high | mitigate | **Attested (weaker).** Human-confirmed completion of the 03-07 console checklist. No independent `GetPublicAccessBlock` check is recorded — see Follow-Ups | closed |
| T-03-07-03 | Information Disclosure | credential leak during verification | high | mitigate | Inline per-command env only; `git status` clean in-session; 03-UAT item 3 confirms the once-pasted credential was rotated | closed |
| T-03-07-04 | Tampering | leftover test objects | low | mitigate | `s3.integration.spec.ts` `afterAll` deletes every key written; confirmed clean against the real bucket in 03-07 | closed |
| T-03-08-01 | Spoofing | CORS in production | high | mitigate | Live-verified, not merely attested: `live-smoke.mjs:69-72` plus independent curl reproduction in 03-VERIFICATION.md (allow and deny cases) | closed |
| T-03-08-02 | Information Disclosure | secrets in Railway | high | mitigate | `rg 'AKIA[0-9A-Z]{16}'` across the repo → no matches; boot error is names-only. Dashboard-only variables **attested** | closed |
| T-03-08-03 | Tampering | TLS on the API subdomain | medium | **accept** | Deployed reality differs from the declared DNS-only CNAME: Cloudflare proxies and terminates TLS in front of Railway. Accepted 2026-09-16 — see R-03-05 | closed |
| T-03-08-04 | Denial of Service | no rate limiting yet | medium | accept | `bodyLimit` bounds per-request cost until Phase 7 — see R-03-06 | closed |
| T-03-08-05 | Information Disclosure | leftover test shares | low | mitigate | 03-08 deleted 5 test ids, each confirmed gone via `HeadObjectCommand` and a live 404 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-03-05 | T-03-08-03 | `api.characterdossierlab.app` is Cloudflare-proxied (orange cloud) rather than the DNS-only CNAME D-15/T-03-08-03 declared, so Cloudflare — not Railway — terminates client TLS and re-originates to Railway. Accepted on the basis that the hostname's Cloudflare SSL/TLS mode is **Full (strict)**, which keeps the Cloudflare→Railway hop encrypted and certificate-validated end to end. The trust boundary now includes the Cloudflare edge; this is recorded in Trust Boundaries above. **This audit did not independently observe the SSL/TLS mode** — it is operator-attested. If that mode is ever set to Flexible, the Cloudflare→Railway hop becomes plaintext HTTP and this acceptance no longer holds. | User | 2026-09-16 |
| R-03-02 | T-03-03-06 | `node:22-alpine` floats within Node 22 per SPEC-deployment, trading reproducibility for automatic patch uptake; MinIO/mc images are pinned to explicit release tags | Plan-time | 2026-09-14 |
| R-03-03 | T-03-04-04 | The client-side size check is a UX guard only (SPEC-security-and-abuse §3); the server re-checks manifest, blocked sentinel and byte budget independently | Plan-time | 2026-09-14 |
| R-03-04 | T-03-05-06 | Per ADR-0013 the 18+ interstitial is a courtesy content notice, trivially bypassed by design; the limitation is disclosed in SPEC-security-and-abuse §2 | Plan-time | 2026-09-14 |
| R-03-06 | T-03-08-04 | Rate limiting is scheduled for Phase 7; until then the 524288-byte `bodyLimit` bounds per-request cost. Phase 7's in-memory limiter assumes a single replica — confirmed as 1 in 03-UAT item 1 | Plan-time | 2026-09-14 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-16 | 45 | 45 | 0 | gsd-security-auditor (ASVS L1, block_on: high) |

Input state: **B** — no prior `03-SECURITY.md`; register rebuilt from the 8 PLAN `<threat_model>`
blocks and SUMMARY threat flags. The auditor returned `## OPEN_THREATS` with 44 closed and
T-03-08-03 open/non-blocking; the user then accepted T-03-08-03 as R-03-05, closing it. Several
threats were verified beyond L1 grep depth (actual check logic traced) where the code made that
cheap.

---

## Follow-Ups (non-blocking)

- **T-03-07-02 evidence tier.** The only record that block-all-public-access is ON is the
  operator's self-reported console checklist. One `aws s3api get-public-access-block --bucket
  character-dossier` would raise it to T-03-07-01's dual-verification tier. The AWS CLI is not
  installed in the current environment.
- **WINDOWS #3** (`api.characterdossierlab.app` Cloudflare-proxied) — the decision half is now
  resolved by R-03-05, but `docs/specs/SPEC-deployment.md` still describes the DNS-only CNAME and
  needs updating before the window can be closed.
- **WINDOWS #4** — `docs/specs/SPEC-storage-s3.md` and `SPEC-deployment.md` still name the bucket
  `character-dossier-prod`; the real bucket is `character-dossier` (us-west-2). Corrected in
  `03-VALIDATION.md`; the specs themselves are still stale.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-16
