---
phase: 1
slug: foundation-registry-state-machine
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-22
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase` from `01-RESEARCH.md` § Validation Architecture. Per-task rows are filled in by `/gsd-validate-phase` once PLAN.md task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 |
| **Config file** | none — Wave 0 creates `vitest.config.ts` |
| **Quick run command** | `npx vitest run --project unit` |
| **Full suite command** | `npx vitest run` (excludes the opt-in `npm run spikes` target) |
| **Estimated runtime** | ~15 seconds (quick), ~45 seconds (full) — greenfield estimate, re-measure after Wave 0 |

**Note:** Vitest 4 is a major-version jump with breaking pool-config changes; do not copy Vitest 2/3 config snippets. The spike target (`npm run spikes`) is deliberately excluded from the default run per decision D-11 — it invokes the real `claude` CLI and is opt-in.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --project unit`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full non-spike suite must be green, **plus** at least one manual run of `npm run spikes` with findings written and version-stamped (D-09/D-12)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Task IDs are assigned by the planner; this table is seeded at the requirement level and refined by `/gsd-validate-phase`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | — | — | N/A | infra | `npx vitest run` (exits 0 on empty suite) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SM-01, SM-02, SM-03, SM-04, QUAL-04 | — | N/A | unit | `npx vitest run src/core/state-machine/transitions.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | STATE-03, STATE-04, STATE-05, STATE-06 | — | Status writes flow through one transactional path only | integration | `npx vitest run src/core/event-store/record-event.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | STATE-01, STATE-02 | — | N/A | integration | `npx vitest run src/db/migrate.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PROJ-01, PROJ-02, PROJ-03, PROJ-04 | T-1-SQLI | Drizzle parameterized queries; no string-interpolated SQL for `notes`/`tags`/path fields | integration | `npx vitest run src/registry/registry.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PROJ-05 | T-1-YAML | `.fleet.yml` parsed with a safe-schema YAML loader + zod; malformed file warns, never blocks | unit | `npx vitest run src/registry/fleet-yaml.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PROJ-06 | — | N/A | integration | `npx vitest run src/cli/parity.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | OPS-04 | T-1-BIND | `listen()` called with explicit `host: '127.0.0.1'`, never Fastify's implicit default | integration | `npx vitest run src/api/http/bind.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SPIKE-01 | — | Classifier tags rate-limit/billing/overloaded shapes without a live CLI | unit | `npx vitest run src/spikes/rate-limit-classifier.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SPIKE-02 | — | N/A | spike (opt-in, real CLI) | `npm run spikes -- --grep permission-mode` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` + `.nvmrc` pinning Node ≥22 — `better-sqlite3` 13.x hard-requires it via `engines`, and the shell's active Node is 20.19.4
- [ ] `npm install -D vitest` — greenfield repo, no framework present
- [ ] `vitest.config.ts` — project/workspace split isolating the opt-in spike target from the default run (D-11)
- [ ] `npm run spikes` script wiring
- [ ] `src/core/state-machine/transitions.test.ts` — stubs for SM-01…SM-04, QUAL-04
- [ ] `src/core/event-store/record-event.test.ts` — stubs for STATE-03…STATE-06
- [ ] `src/db/migrate.test.ts` — stubs for STATE-01, STATE-02
- [ ] `src/registry/registry.test.ts`, `src/registry/fleet-yaml.test.ts`, `src/cli/parity.test.ts` — stubs for PROJ-01…PROJ-06
- [ ] `src/api/http/bind.test.ts` — stubs for OPS-04
- [ ] `src/spikes/rate-limit-classifier.test.ts` — stubs for SPIKE-01's classifier (fixture-based, no real CLI)
- [ ] `01-SPIKE-FINDINGS.md` template — the durable write-up target for SPIKE-02…SPIKE-05

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Worktree settings-file scoping — does `.claude/settings.local.json` resolve through a worktree to the main checkout? | SPIKE-03 | Requires a real `claude` invocation inside a real git worktree; cannot be faked because the behavior under test *is* the CLI's own file resolution | Create a disposable scratch repo + worktree, place a distinguishable `settings.local.json` in the main checkout, invoke `claude -p` from the worktree, record whether the setting took effect. Write result to `01-SPIKE-FINDINGS.md`. |
| `session_id` coverage across stream-json event types | SPIKE-04 | Requires one real bounded-turn CLI invocation; the field's presence per event type is not documented and cannot be asserted from fixtures without begging the question | Single `claude -p --output-format stream-json --verbose --max-turns 1` run against a disposable scratch repo; tabulate which event `type` values carry `session_id`. Write result to `01-SPIKE-FINDINGS.md`. |
| SPIKE-05 write-up completeness | SPIKE-05 | Judgement call — "durable notes the Phase 2 runner design reads" is a human-readable quality bar, not a machine assertion | Review `01-SPIKE-FINDINGS.md` for: a version stamp of the `claude` CLI tested, an explicit answer per spike question, and a stated re-run procedure. |
| Daemon genuinely refuses a non-loopback connection | OPS-04 | Asserting a real external-interface refusal needs a second network interface; the automated test asserts `listen()` args as a proxy | From another host on the LAN (or a container on a bridge network), attempt `curl http://<host-lan-ip>:<port>/` and confirm connection refused. |

**Spike-probe safety constraint (carries into every manual verification above):** SPIKE probes must run against a disposable scratch repo Fleet creates itself, **never** a real registered project's checkout, and must use the allowlisted-env spawn pattern — a target repo's own `.claude/settings.json` `apiKeyHelper`/`env` block would otherwise be read and could silently flip billing off subscription.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
