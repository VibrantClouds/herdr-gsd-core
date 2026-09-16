---
phase: 2
slug: execution-worktree-runner-billing-safety
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-23
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `02-RESEARCH.md` § Validation Architecture. Per-task rows are filled by `/gsd-validate-phase` once PLAN.md task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 — two named projects: `unit` (default, gates CI) and `spike` (opt-in, real CLI) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test` (== `vitest run --project unit`) |
| **Full suite command** | `npm test` — the `unit` project is the only gating suite; `npm run spikes` is deliberately excluded from every gate (Phase 1 D-11) |
| **Estimated runtime** | ~1s today (`fileParallelism: false`); expected to stay under ~10s with Phase 2's additions |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds
- **Phase gate (manual, human-run, not automated):** `npm run spikes` once after implementation, to re-confirm the empirical findings this phase rests on still hold. Every finding is version-pinned to `claude` 2.1.218 / `git` 2.55.0.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | BILL-01, BILL-02, BILL-06 | T-2-01 (credential leak → API billing) | `buildWorkerEnv()` output contains **only** allowlisted keys given a polluted `process.env` fixture — shape assertion, never a denylist (D-06) | unit | `npm test -- src/runner/env.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BILL-03, BILL-04 | T-2-01 | Spawn argv never contains `--bare`; spawn always uses `shell: false` + argv array; `--setting-sources` always present; `--disallowedTools` always includes the push deny rule | unit | `npm test -- src/runner/worktree-runner.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BILL-07 | T-2-01 | `apiKeySource === "none"` asserted on the `system/init` line; session killed immediately on any other value, before a turn is billed (D-02) | unit, fixture-driven | `npm test -- src/runner/worktree-runner.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | BILL-08 | T-2-04 (secret in event log) | Value-shape redaction (`sk-ant-…`, `ghp_…`, `AKIA…`, `Bearer …`, long base64) applied at the single `recordEvent()` write path before persistence | unit | `npm test -- src/core/event-store/redact.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RUN-02, RUN-04 | — | Wall-clock timeout kills the whole process group **including a backgrounded grandchild** — no orphans | unit, fixture-driven (D-31) | `npm test -- src/runner/worktree-runner.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | RUN-05 | — | Malformed stdout line skipped without crashing; unknown event `type` tolerated as a forward-compatible no-op | unit, fixture-driven | `npm test -- src/runner/rate-limit.test.ts` | ⚠️ relocate | ⬜ pending |
| TBD | TBD | TBD | WT-01…WT-07, SAFE-08 | T-2-02 (agent writes default branch) | `ensureWorktree()` four-step idempotent algorithm; lock-on-add; dirty-capture-before-teardown; archive removes worktree and keeps branch; default branch never the worktree HEAD | unit, real scratch git repo (no `claude`, no network) | `npm test -- src/runner/worktree-manager.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SAFE-01, SAFE-02 | — | Concurrency cap honored; kill switch terminates every session **and** pauses the queue (D-27) | unit | `npm test -- src/scheduler/queue.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SAFE-04, SAFE-05 | — | `classifyRun()` multi-signal classification against fixture NDJSON including the undocumented `rate_limit_event` shape; exponential backoff with jitter, never busy-retry | unit, already exists | `npm test -- src/runner/rate-limit.test.ts` | ⚠️ relocate | ⬜ pending |
| TBD | TBD | TBD | SAFE-06 | T-2-03 (agent pushes) | No push credential reachable (env starvation) **and** `Bash(git push*)` denied — two independent layers | unit | `npm test -- src/runner/env.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TASK-01…TASK-06 | T-2-05 (path traversal via request body) | Task create/list/show/cancel over HTTP with zod-validated bodies; CLI↔HTTP 1:1 parity; worktree path built only from server-generated identifiers | unit (Fastify `inject`, no daemon boot) | `npm test -- src/api/http/routes/tasks.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | QUAL-02 | — | End-to-end runner integration against the fake-`claude` fixture: happy path, timeout, cancel, malformed line, unknown event, rate-limit, env shape | unit, fixture-driven | `npm test -- src/runner/worktree-runner.integration.test.ts` | ❌ W0 | ⬜ pending |
| Task 2/3 | 02-11 | 6 | AGENT-01 | T-2-31 | `CLAUDE_CONFIG_DIR` reaches a worker only from a resolved agent profile's Fleet-authored forced constant, never from `CLAUDE_ENV_ALLOWLIST` or the daemon's own `process.env`; absence is distinguishable from an empty string | unit + integration, fixture-driven | `npm test -- src/runner/env.test.ts src/runner/agent-capability.integration.test.ts` | ✅ | ✅ green |
| Task 2/3 | 02-11 | 6 | AGENT-02 | T-2-32 | `--mcp-config`/`--strict-mcp-config` emitted as a structural pair from one expression; inline JSON's server names equal exactly the resolved profile's declared servers; zero declared servers yields neither flag; no Fleet-authored file (`.mcp.json`, `.claude/settings.json`) is ever written into the worktree | unit + integration, fixture-driven | `npm test -- src/runner/worktree-runner.test.ts src/runner/agent-capability.integration.test.ts` | ✅ | ✅ green |
| Task 1 | 02-11, 02-12 | 6-7 | AGENT-03 | T-2-30 | A repository's `.fleet.yml` may only ever NAME a Fleet-side profile (one `.strict()`-schema optional string, mirroring `env_profile`); an object-valued `agent_profile` (an attempted MCP server definition) is rejected by the schema, and a dispatch against such a repository produces a recorded argv containing no string from that file | unit + integration | `npm test -- src/registry/fleet-yaml.test.ts src/runner/agent-profile.test.ts src/runner/agent-capability.integration.test.ts` | ✅ | ✅ green |
| Task 3 | 02-11 | 6 | AGENT-04 | T-2-33 | `--allowedTools` always contains `Skill`; a declared MCP server's tools are composed in as `mcp__<server>__*` globs so a loaded server's tools are actually invocable, never capability that exists but cannot be called; deduplicated when a profile's extra tools repeat a default | unit + integration, fixture-driven | `npm test -- src/runner/worktree-runner.test.ts src/runner/agent-capability.integration.test.ts` | ✅ | ✅ green |
| Task 1 | 02-12 | 7 | AGENT-05 | T-2-38 | Profile resolution order is task, then `.fleet.yml`, then Fleet config default — the first non-null wins, absence of all three yields no profile (never an error); a shared `it.each` table drives `resolveAgentProfileName`, `resolveModel`, and `resolveCaps` through the same four precedence cases, proving they cannot silently drift apart | unit | `npm test -- src/tasks/service.test.ts` | ✅ | ✅ green |
| Task 2 | 02-12 | 7 | AGENT-06 | T-2-34, T-2-39 | All four kinds of bad profile (unknown name, missing/non-directory config dir, unknown MCP server) fail the SPAWN before any child process is created — proven by the fixture's argv-readback file never existing — and land the task in `failed` with the `AgentProfileError` code preserved in a persisted `events` row's payload, read back from SQLite rather than asserted on a caught value; a valid-profile task and a no-profile task both reach the same terminal status the happy path does | integration, fixture-driven | `npm test -- src/runner/agent-capability.integration.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/core/state-machine/transitions.ts` — **add the missing `RATE_LIMITED` transition row for `running`.** `TaskEvent` already includes `RATE_LIMITED` and D-28 requires emitting it, but `applyEvent` currently rejects it. Load-bearing: SAFE-04/05's queue-pause logic would otherwise be built on a transition that silently fails. Target state is an open decision (see Manual-Only / Open Items below).
- [ ] `npm install p-queue@^9.3.3` — **9.x, not the 8.x in CLAUDE.md's stack table** (stale on this one figure)
- [ ] `src/runner/env.ts` + `src/runner/env.test.ts` — promote `CLAUDE_ENV_ALLOWLIST` / `buildAllowlistedEnv()` from `src/spikes/spawn-claude.ts`, extend with D-04's git-starvation vars, add the BILL-06 shape assertion
- [ ] `src/runner/worktree-manager.ts` + `.test.ts` — new; WT-01…07 against a real scratch git repo
- [ ] `src/runner/worktree-runner.ts` + `.test.ts` + `.integration.test.ts` — new; the core of QUAL-02
- [ ] `src/spikes/fixtures/fake-claude-cli/` — new fixture binary + scenario scripts, reusing `src/spikes/fixtures/stream-events.ts`'s NDJSON data. Hermetic: `spawn()` resolves bare commands via `options.env.PATH`, so no real-environment mutation is needed (verified)
- [ ] `src/scheduler/queue.ts` + `.test.ts` — new; wraps `p-queue`
- [ ] `src/api/http/routes/tasks.ts` + `.test.ts` — new; mirrors `routes/projects.ts` and extends `src/cli/parity.test.ts`
- [ ] Relocate `src/spikes/rate-limit-classifier.ts` / `.test.ts` and `src/spikes/evidence-trap.ts` into `src/runner/`, moving their tests into the `unit` project (D-28). Confirm `vitest.config.ts`'s `src/spikes/**/*.spike.test.ts` exclude needs no adjustment — these were never `.spike.test.ts` files
- [ ] `.nvmrc` (or explicit `nvm use 22` in the daemon startup wrapper) — `package.json` declares `engines.node >= 22`, but the machine's `nvm` default alias currently resolves to v20.19.4. One-line fix, not a blocker

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A genuine subscription rate-limit hit produces the signal `classifyRun()` expects | SAFE-04, SAFE-05 | **Not validatable by any test in this phase.** SPIKE-01 is detected-but-unconfirmed; the fixtures are hand-constructed from documented shapes, not a captured real limit. Deliberately accepted per D-28 — the evidence trap exists so the first real encounter yields ground truth for free | Wait for real usage. When it fires, `captureEvidence()` writes raw stdout/stderr to `<FLEET_HOME>/spike-evidence/`; promote that capture into a fixture |
| `--resume --fork-session` yields a fresh session id while preserving the original transcript | RUN-06 | Session continuation is server-side state the fake-CLI fixture cannot simulate — it can only assert the argv Fleet passes | Opt-in `spike`-project test, real auth, real turns: `npm run spikes` |
| `claude auth status --json` field names (`authMethod`, `subscriptionType`) remain stable across CLI versions | BILL-05 | External contract, not ownable by a unit test | The startup gate (D-07) must **refuse dispatch** on an unparseable/unexpected shape — never silently degrade to "not logged in" or, worse, "logged in". Re-run `npm run spikes` after any CLI upgrade |
| `--model` accepts bare aliases (`sonnet`/`opus`/`haiku`) vs. requiring full dated names | SAFE-03 (D-12) | Research Open Question 2 — not re-probed against 2.1.218 this session | One-line pre-implementation check: `claude -p "hi" --model sonnet --output-format json --max-turns 1`, assert exit 0 and inspect `modelUsage`. Cheap; close it before locking D-12's implementation |
| A profile's declared skills and MCP tools are actually invocable by a real, authenticated session (not merely that the argv/env Fleet builds is correct) | AGENT-01 (ROADMAP Phase 2 success criterion 6) | The fixture reads back argv and environment keys; it structurally cannot load a real skill or start a real MCP server. `02-RESEARCH.md` Pattern 2 recorded a live run under the pinned empty `--setting-sources` value in which `mcp_servers` came back empty and `slash_commands` visibly shrank — the MCP half is well-founded by construction, but the skills half is an unverified bet | Originally written as plan `02-12` Task 3 (`checkpoint:human-verify`, `gate="blocking"`); never run there, carried forward verbatim and NOW LIVE as plan `02-18` Task 1 — a real `claude` CLI run via `npm run spikes`, then one real daemon-driven task, checking `system/init`'s `skills`/`mcp_servers`/`tools` arrays and re-confirming `apiKeySource: "none"`. See "Open Item 2" below for the exact commands and exact observations to record. |
| One real daemon-driven task reaches a terminal state end to end (worktree provisioned, branch created, wall-clock cap armed, duration recorded, worktree archived, `apiKeySource` still `none`), and `--resume --fork-session` is exercised against the real CLI, not just the fake fixture | RUN-06, BILL-07 re-confirmation (deferred from plan `02-10` Task 2 step 4) | Step 4 of the original phase gate (`02-10-SUMMARY.md`) was deliberately deferred by the operator; steps 1-3 (spike suite, `apiKeySource: "none"`, auth status) already passed against a drifted CLI (`2.1.220`). This gap-closure round then added duration surfacing (`02-15`), a per-task wall-clock timer that actually arms (`02-13`), a database-backed production runner, and the entire resume path (`02-16`, `02-17`) — all fixture-proven only, never run against the real binary | Plan `02-18` Task 2 (`checkpoint:human-verify`, `gate="blocking"`). See "Open Item 3" below for the exact commands and exact observations to record. |

---

## Open Items Requiring a Planner Decision

1. **`RATE_LIMITED` target state from `running`** (Research Open Question 1, Assumption A3 — risk: Medium). Option (a) `→ failed`, matching every other non-success exit and terminal per Phase 1 D-06, but the operator must recreate every rate-limited task by hand. Option (b) `→ queued`, a genuinely new backward edge that lets D-30's dispatch-on-slot-free naturally re-attempt once the pause lifts — coherent with D-16's `--resume --fork-session`, but new scope beyond CONTEXT.md, and it needs answers for worktree reuse and whether `turns_used` accumulates or resets. The plan must make this an explicit, recorded decision, not a silent pick by analogy.
2. **Skill discoverability under the pinned `--setting-sources` value** (D-37, carried forward from plan 02-11 through plan 02-12, now live as plan `02-18` Task 1, unresolved until that gate is run). If the gate finds skills absent even with a Fleet-set `CLAUDE_CONFIG_DIR`, D-37 pre-authorizes an ordered fallback (`--plugin-dir`, then `--agents <json>`, then narrowing AGENT-01's scope and recording the limitation in `REQUIREMENTS.md`) — explicitly NOT loosening `--setting-sources`, which is locked by D-32. Stays open until that gate runs and records an observed `skills` array.

   **Copy-pasteable commands for the human running plan `02-18` Task 1** (this machine's shell has a broken
   `command_not_found_handler` — a bare `node`/`npm`/`npx` invocation fails with "maximum nested function
   level reached"; use the absolute paths below or prefix `PATH` as shown):

   ```bash
   # Step 1 — opt-in real-CLI probe suite (includes src/spikes/agent-capability.spike.test.ts)
   PATH="/home/user/.nvm/versions/node/v22.21.1/bin:$PATH" npm run spikes
   # Confirm exit 0. Find the captured system/init line in the spike findings directory
   # (printed by the spike test / written under its findings output path).
   ```

   **Exact observations to record verbatim from that `system/init` line** (copy the raw JSON array
   contents, do not paraphrase):
   - `mcp_servers` — full array contents, including each entry's `status` field
   - `skills` — full array contents (empty array `[]` is a valid, expected-possible observation — record it as such, not as "none found")
   - `tools` — confirm presence/absence of the literal string `Skill`, and list every `mcp__`-prefixed entry found

   ```bash
   # Step 3 — start daemon in one terminal
   PATH="/home/user/.nvm/versions/node/v22.21.1/bin:$PATH" npm run dev

   # In a second terminal — register the throwaway repo, then create one real task
   # that can only succeed by invoking the placed skill or a declared MCP tool:
   fleet project add <path-to-throwaway-repo>
   fleet task create --project <slug> --title "capability probe" \
     --prompt "<prompt naming the skill or MCP tool by name>" --max-turns 3
   fleet task events <id>
   # PASS: a tool-use event naming the skill or an mcp__-prefixed tool appears.

   # Step 4 — unknown-profile fail-loud check against the real binary
   fleet task create --project <slug> --title "bad profile probe" \
     --agent-profile does-not-exist --prompt "noop" --max-turns 1
   fleet task show <id>
   # PASS: status is failed immediately, reason names the unknown profile, and no
   # claude process was ever started for it.
   ```

   **Exact observations to record from steps 3-5:**
   - Step 3: whether the expected tool-use event appeared in `fleet task events <id>`, verbatim event type/name
   - Step 4: the exact `status` and failure reason string from `fleet task show <id>`
   - Step 5: the exact `apiKeySource` value captured in step 3's stream — must be recorded even if it is not `none`

3. **Live daemon gate against the real CLI, including a real resume** (deferred from plan `02-10` Task 2 step 4;
   now live as plan `02-18` Task 2). Unresolved until that gate is run and its observed values are recorded.

   **Copy-pasteable commands for the human running plan `02-18` Task 2** (same node/npm/npx PATH caveat as
   above — reuse Task 1's already-running daemon and already-registered project):

   ```bash
   # Step 1 — confirm toolchain has not drifted further since 02-10-SUMMARY.md's 2.1.220 / 2.55.0 observation
   claude --version
   git --version

   # Step 2 — one real, cheap, capped task
   fleet task create --project <slug> --title "live gate" \
     --prompt "print the contents of README.md and stop" --max-turns 2

   # Step 3 — watch to a terminal status
   fleet task show <id>

   # Step 4 — full event trail, no gaps, no credential-shaped payloads
   fleet task events <id>

   # Step 5 — worktree lifecycle: directory gone, branch kept
   ls ~/.fleet/worktrees/   # the task's worktree dir should be ABSENT
   git -C <path-to-throwaway-repo> branch --list 'fleet/*'   # the task's branch should be PRESENT

   # Step 6 — resume against the real CLI (after cancelling or letting the task fail)
   fleet task resume <id>
   fleet task show <new-id>
   git -C <path-to-throwaway-repo> log fleet/<new-branch> --oneline
   ```

   **Exact observations to record verbatim:**
   - Step 1: the exact `claude --version` and `git --version` output strings
   - Step 3: the terminal `STATUS`, the `TURNS` value, the `DURATION` value (must show a trailing `s`, not a
     dash — a dash is itself a finding, not an error to paper over), the `BRANCH` value
   - Step 5: worktree directory absent (yes/no) and branch present (yes/no)
   - Step 6: the resume command's printed old-id/new-id pair, the new task's terminal status, whether
     `fleet task show <new-id>` shows lineage pointing at the original id, whether the new branch's log
     contains the original branch's commits, and the exact text of any CLI rejection if the real binary
     refuses the resume flags for that session
   - The final `apiKeySource` value captured on this run's stream — must be recorded even if it is not `none`

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all M

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 20627 bytes -->
