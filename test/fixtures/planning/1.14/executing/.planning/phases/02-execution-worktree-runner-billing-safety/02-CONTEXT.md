# Phase 2: Execution — Worktree, Runner & Billing Safety - Context

**Gathered:** 2026-07-23
**Status:** Ready for planning

<domain>
## Phase Boundary

A task goes from "created" to "a headless Claude Code session ran against an isolated worktree and reached a terminal state," with structural guarantees that it billed against the subscription and structurally could not push.

**Delivers:**
- `fleet task create|list|show|cancel` over CLI and HTTP, with auto-dispatch through a concurrency-capped queue
- `ensureWorktree()` — idempotent, crash-safe worktree provisioning on a `fleet/<short-id>` branch, locked while active, `.fleet.yml` setup commands run before spawn
- A `Runner` interface with a `WorktreeRunner` implementation: allowlisted-env spawn of `claude -p --output-format stream-json`, process-group teardown, wall-clock cap, line-by-line stdout parsing as observability only
- Billing safety as an enforced property, not a convention: allowlist-constructed env, pinned setting sources, a runtime `apiKeySource` assertion, and a build-failing regression test
- Queue controls: global concurrency cap, kill switch, rate-limit pause with exponential backoff, per-task model routing

**Not in this phase:** the hook receiver and hook-driven state transitions (Phase 3), crash reconciliation of orphaned runners (Phase 3), Fleet's own push and `.fleet.yml` protected-path re-verification (Phase 4, SAFE-07/SAFE-09), the dashboard and SSE (Phase 5), the OpenClaw notifier. Phase 2 drives the state machine Phase 1 built, using `stdout` and system-generated events only — hooks arrive next phase.

</domain>

<decisions>
## Implementation Decisions

**Provenance note:** the user explicitly declined the discussion and delegated every area with "use best practices for everything." Every decision below is therefore **Claude's Discretion** — defensible defaults grounded in Phase 1's empirically observed spike findings and `research/ARCHITECTURE.md`, not user-stated preferences. The planner may refine specifics; the underlying properties are what must hold. See *Claude's Discretion* at the end of this section for what that means per area.

### Credential & billing isolation (BILL-01…08, SAFE-06)

- **D-01:** Every spawn pins `--setting-sources` to the narrowest value that still authenticates, and everything Fleet needs travels in inline `--settings` JSON. SPIKE-03 proved a git-tracked `.claude/settings.json` **is** honored inside a worktree and that inline `--settings` overrides it; CLAUDE.md § A3 further establishes that `.claude/settings.local.json` resolves *through* a worktree to the main checkout — a file Fleet structurally cannot neutralize by touching the worktree. Excluding `project` and `local` as sources closes both doors at once, where deleting files in-tree closes only the one Fleet can see. The exact accepted value (whether an empty list is legal, versus `user`) is **not yet verified** — Phase 2 extends the D-09 probe suite to determine it, and falls back to `--setting-sources user` plus a daemon-startup scan of `~/.claude/settings.json` for `apiKeyHelper` / `env` / `awsAuthRefresh` if empty is rejected. — **Reversibility:** costly — Phase 3 delivers per-worktree hook URLs, and this decision forces those into the inline `--settings` blob rather than a written `.claude/settings.json`; reversing it means moving hook config between two delivery mechanisms and re-proving the billing property from scratch.

- **D-02:** The runner asserts `apiKeySource === "none"` on the `system/init` line and kills the session immediately on any other value, before a single turn is billed. This is the one guarantee that holds regardless of *which* path tried to inject a credential — env var, `apiKeyHelper` in any settings file, or a source not yet imagined. The Phase 1 spike evidence shows `"apiKeySource":"none"` on all three observed runs under subscription auth, so `none` is the known-good value. Static checks are necessary but provably incomplete; this one is observational and complete.

- **D-03:** `--bare` is prohibited outright, and a test asserts it never appears in the spawn argv. The installed CLI's own `--help` states bare mode's auth "is strictly `ANTHROPIC_API_KEY` or `apiKeyHelper` via `--settings` (OAuth and keychain are never read)" — that is precisely the API-billing path this project exists to avoid. CLAUDE.md § A1 already flags this; Phase 2 makes it enforced rather than remembered. — **Reversibility:** one-way — adopting `--bare` later would require abandoning subscription billing, which contradicts a stated hard project constraint, not merely a design choice.

- **D-04:** `CLAUDE_ENV_ALLOWLIST` and `buildAllowlistedEnv()` are promoted out of `src/spikes/spawn-claude.ts` into a production module (`src/runner/env.ts`) as the single source of truth, and extended with git credential starvation: `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/false`, `SSH_ASKPASS=/bin/false`. `HOME` must stay allowlisted for subscription OAuth, which is exactly why `GIT_CONFIG_GLOBAL` is needed — it neutralizes a `credential.helper` in the user's `~/.gitconfig` without removing the variable Claude Code's auth depends on. Because that also removes `user.name` / `user.email`, Fleet injects `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL` explicitly so the agent can still commit inside its worktree. Construction is always allowlist-forward from a fresh object, never inherit-and-delete (BILL-01).

- **D-05:** SAFE-06 is enforced by two independent non-instruction layers: env starvation (D-04) plus `--disallowedTools "Bash(git push*)"` on every spawn. Deliberately **rejected**: per-worktree `remote.origin.pushurl` poisoning via `git config --worktree`, because it requires enabling `extensions.worktreeConfig` on the user's repository — a persistent mutation of a repo Fleet does not own, cutting against PROJ-04. A linked worktree shares `.git/config` with the main checkout, so there is no way to remove the remote for the worktree alone without that mutation.

- **D-06:** BILL-06's regression test is hermetic, lives in the default `npm test` run, and asserts on **shape not denylist**: given a `process.env` fixture polluted with every forbidden variable, `buildWorkerEnv()` output must contain *only* allowlisted keys. A denylist test would pass for a credential variable nobody thought to enumerate; a shape test cannot. Companion assertions cover the spawn argv: `--bare` never present, `--setting-sources` always present, `--disallowedTools` always includes the push deny rule.

- **D-07:** BILL-05's `claude auth status` check runs at daemon startup and refuses dispatch unless it reports subscription auth. Folded in at the same call site — closing the Phase 1 deferred item that explicitly said "revisit in Phase 2 alongside BILL-05" — is a runtime capability assertion: parse `claude --help` for the accepted `--permission-mode` choices and refuse to dispatch if Fleet's configured mode is not among them. Both are "verify the CLI before dispatching," and SPIKE-02 already demonstrated the parse works and that the choice list is version-dependent.

- **D-08:** BILL-08 redaction is applied at the single write path (`recordEvent`) and via a pino serializer, before persistence rather than after. Matching is value-shape-based (`sk-ant-…`, `ghp_…`, `AKIA…`, `Bearer …`, long base64 runs) in addition to known key names, because a secret's *name* in an arbitrary repo's output is not predictable.

### Runner: caps, permission mode, tools, model routing (RUN-01…08, SAFE-03)

- **D-09:** `--permission-mode acceptEdits`. Not `bypassPermissions` (discards the safety the flag exists for), not `plan` (produces no edits), and not `auto` / `manual` / `dontAsk` — SPIKE-02 observed the CLI accepts those, but CLAUDE.md § A1 flags them as not appearing in prose-confirmed official examples, and Fleet should not build its default on an unverified mode. Note the literal string `"default"` is **not** a legal value (SPIKE-02, observed) — omitting the flag is what "default" means.

- **D-10:** `--allowedTools` defaults to `Read, Edit, Write, Glob, Grep, Bash, TodoWrite, Task, WebSearch, WebFetch`, with `Bash` unrestricted rather than prefix-scoped, paired with `--disallowedTools` denying `Bash(git push*)`, `Bash(git remote*)`, and `Bash(sudo*)`. An agent whose Bash is restricted to enumerated prefixes cannot run an arbitrary project's real test command, which makes it useless for Fleet's actual purpose; the isolation guarantee comes from the worktree boundary and the env allowlist, not from guessing at command prefixes. Overridable per project in `.fleet.yml`.

- **D-11:** Cap defaults: `--max-turns 40` and a 30-minute wall-clock cap. Resolution order for both is task > `.fleet.yml` > Fleet config > built-in default. The `tasks` table already carries nullable `max_turns` and `wall_clock_cap_ms` columns, so null means "inherit" and no schema change is needed.

- **D-12:** SAFE-03 model routing stores the CLI **alias** (`haiku` / `sonnet` / `opus`), never a full dated model id, because aliases survive model releases and a pinned id silently rots. `tasks.model` already defaults to `'sonnet'`. Tier names (cheap / default / high) are CLI sugar mapping onto those three aliases. Resolution order matches D-11.

- **D-13:** Spawn is `node:child_process.spawn` with `detached: true`, `shell: false`, an argv array, and never a login shell (BILL-04). Teardown is `process.kill(-pid, …)` against the whole process group with SIGTERM → grace → SIGKILL escalation, per ARCHITECTURE.md §3. **This deliberately overrides** the `execa` entry in CLAUDE.md's Section B stack table: §3 gives the specific reasoning (Fleet needs bespoke process-group kill logic regardless, and minimizing dependencies that shell out to arbitrary processes is itself a small security win), and the more specific, reasoned source wins. Recorded explicitly so the planner does not "correct" it back to `execa`.

- **D-14:** stdout parsing uses `readline` over `child.stdout`, one `JSON.parse` per line inside try/catch, and treats unknown `type` values as forward-compatible no-ops that are never thrown on. CLAUDE.md § A2 warns about this in the abstract; SPIKE-04 already caught a live `rate_limit_event` line in the wild that no documented schema table lists. Only lifecycle-significant lines are persisted to `events`; every parsed line is broadcast to the in-process bus. stdout is best-effort observability and is **never** the state-transition source (RUN-05) — hooks take that role in Phase 3.

- **D-15:** `--include-hook-events` is **not** adopted in Phase 2. SPIKE-04 surfaced it as undocumented-but-present, and it is genuinely interesting, but hook-driven state is Phase 3 and the correlation design is taREDACTED_SECRET (ARCHITECTURE.md §5). Introducing a second hook signal path now would create two sources for the same transition — the exact anti-pattern §"Writing `tasks.status` from more than one place" names. Deferred to Phase 3 to evaluate deliberately.

- **D-16:** RUN-06 resume: `session_id` is persisted opportunistically from the first stream line carrying it — SPIKE-04 observed it present on `system/init`, `assistant`, `rate_limit_event`, and `result`, so it is available early and often. A resume re-spawns in the same worktree with `--resume <id> --fork-session`, so the resumed run gets a fresh session id and the original transcript stays intact for audit.

- **D-17:** RUN-07's seam is a `Runner` interface (`provision` / `spawn` / `kill` / `status`) with `WorktreeRunner` as the only Phase 2 implementation. The `runner_kind`, `runner_pid`, `runner_started_at`, and `runner_meta` columns already exist, so a future container backend populates `runner_meta` and requires **no** schema change — which is exactly the property RUN-07 asks for.

### Worktree lifecycle (WT-01…07, SAFE-08)

- **D-18:** The task branch is cut from the default branch's **remote-tracking ref** (`refs/remotes/origin/<default>`) when a remote exists — with a `git fetch` first — falling back to the local default-branch ref otherwise. `git worktree add -b fleet/<short-id> <path> <baseref>` checks out only the task branch, so SAFE-08 holds structurally: the project's default branch is never the worktree's HEAD, and git independently refuses to check out a branch already checked out elsewhere as a second natural guard.

- **D-19:** `ensureWorktree()` implements ARCHITECTURE.md §4's four-step idempotent algorithm verbatim (WT-02): explicit `git worktree prune` → `git worktree list --porcelain` to detect an already-correct worktree → attach an existing branch with `git worktree add` **without** `-b` when the branch survived a partial failure → clear a stray unregistered directory and retry `add -b`. Safe to call again after a crash, which is what daemon-restart reconciliation will need in Phase 3.

- **D-20:** WT-03 uniqueness comes from the task UUID, so `fleet/<short-id>` collision is vanishingly unlikely by construction. An existing branch is treated as D-19's retry case rather than an error; a numeric suffix is appended only in the genuinely anomalous case where the branch exists *and* points at an unrelated worktree. Collisions are handled, never crashed on.

- **D-21:** WT-04 locking is part of provisioning, not a separate call site: `git worktree lock` runs immediately after `add`, with a reason string naming the task id, and unlock happens only as the first step of archival. A prune cannot delete live state because there is no window in which an active worktree is unlocked.

- **D-22:** WT-07 dirty handling runs before **any** teardown: `git status --porcelain`, and if non-empty, `git add -A && git commit -m "fleet: uncommitted work captured at session end (task <id>)"` using the D-04 injected identity. A `--force` remove never runs against an uncaptured dirty worktree. Agent work is never silently discarded.

- **D-23:** WT-06 archival fires **immediately** on transition to a terminal state (`done`, `failed`, `rejected`), not after a retention window: capture dirty work (D-22), unlock, `git worktree remove` the working directory, and **keep the branch ref**. Because removing a worktree does not delete its branch, the full history stays inspectable via `git log` / `git diff` against the base — so a retention window would buy nothing but disk. Branch deletion is never automatic; a deliberate `fleet gc` sweep is deferred.

- **D-24:** WT-05 `.fleet.yml` setup commands run after add-and-lock and before spawn, inside the worktree, under the **same allowlisted env as the worker** (a setup command is just as capable of leaking a credential into the tree as the agent is), non-login shell, each with its own timeout. A failing setup command fails provisioning: the task lands in `failed` with the command's output in the event payload rather than dispatching an agent into a half-provisioned worktree. `.fleet.yml` is read live at this moment, never snapshotted (Phase 1 D-17).

### Queue, cancel, kill switch, rate limits (SAFE-01/02/04/05, TASK-01…06, QUAL-02)

- **D-25:** SAFE-01 uses `p-queue` in-process with a default cap of 3, stored in `settings` and changeable at runtime. The durable truth remains the `tasks` table — the queue is reconstructed from `queued` rows on boot, never persisted as its own structure.

- **D-26:** TASK-06 cancel is `killTree` followed by a `CANCEL` event with `source: 'user'`, landing in `failed` per Phase 1's D-05. The worktree follows the **standard terminal-state path** with no special-casing: D-22 captures dirty work into the branch, then D-23 archives. Cancelled work is inspectable exactly like any other terminal task's, and there is no second teardown code path to keep correct.

- **D-27:** SAFE-02's kill switch terminates every running session **and pauses the queue**. A kill switch that leaves the queue draining would immediately dispatch replacements for everything it just killed — that is not a kill switch. Resuming is explicit and separate.

- **D-28:** SAFE-04/05 promote `src/spikes/rate-limit-classifier.ts` and `src/spikes/evidence-trap.ts` into production modules under `src/runner/`, with their unit tests moving into the default test run. On a suspected limit: capture evidence, emit `RATE_LIMITED`, pause the queue, and back off exponentially with jitter (60s initial, doubling, capped at 60 min) — never busy-retry. Reset timing prefers the CLI's own answer over a Fleet-side computation: SPIKE-04 captured a real `rate_limit_event` carrying `rate_limit_info.resetsAt` (unix seconds) and `rateLimitType: "five_hour"`, so when that field is present it drives the resume time and the backoff is only the fallback. Per CLAUDE.md § A5, the authoritative reset time is Anthropic's and is not locally derivable.
  **SPIKE-01 remains detected-but-unconfirmed.** Phase 2 must not treat the classifier as verified runtime behavior; the evidence trap exists precisely so the first genuine encounter in real use yields ground truth for free.

- **D-29:** TASK-05's usage proxy is `turns_used` (from the terminal `result` line's `num_turns`) and duration from `started_at` / `ended_at`. `total_cost_usd` is **not** recorded as spend. Under subscription billing it is an imputed API-equivalent price, not money that left an account, and storing it in a column named like a cost invites exactly the misreading this project exists to prevent. If retained at all it goes in the event payload under an explicitly imputed label. — **Reversibility:** costly — the figure is not persisted, so a later decision to chart it cannot be backfilled for tasks already run.

- **D-30:** TASK-03 auto-dispatches: creating a task enqueues it, and dispatch happens automatically when a slot frees. There is no separate `fleet task start`. Holding work back is a queue-level control (D-27), not a per-task state, which keeps one pause mechanism rather than two.

- **D-31:** QUAL-02's integration tests run against a **fake `claude` binary on `PATH`** emitting scripted stream-json — the fixture-process approach CLAUDE.md's dev-tools section names directly. They live in the default `npm test`: hermetic, no real CLI, no auth, no billing, fast. Coverage: happy path through the terminal `result`, wall-clock timeout → process-group kill, cancel mid-run, malformed line skipped without crashing, unknown event `type` tolerated, rate-limit classification, and the D-06 env-shape assertion. The real-CLI probe suite stays a separate opt-in target (Phase 1 D-11).

### Agent capability configuration (AGENT-01…06)

**Provenance note:** unlike D-01…D-31, this group originates from a user-raised gap rather than from delegated discretion — the question "are skills and MCP servers configurable per project?" surfaced that Phase 2's argv and env builders foreclose all three capability channels. The decisions below are additive; none reverses an earlier one.

- **D-32:** D-01's `--setting-sources ''` **stands unchanged.** Capability is delivered by explicit, auth-free flags — `--mcp-config`, `--strict-mcp-config`, and a Fleet-set `CLAUDE_CONFIG_DIR` — rather than by loosening settings-source discovery. The distinction is load-bearing: settings sources are precisely the channel that can carry an `apiKeyHelper` or an `env` block, so re-admitting `user`/`project`/`local` to gain skills would reopen the exact door D-01 closed. The capability flags carry no auth surface at all. — **Reversibility:** cheap — this is purely additive to the existing argv, and removing it returns the spawn to today's behavior.

- **D-33:** `CLAUDE_CONFIG_DIR` is injected by Fleet from the resolved agent profile as part of the forced-constants layer (alongside `FORCED_GIT_ENV`), **not** by widening `CLAUDE_ENV_ALLOWLIST`. It is never inherited from the daemon's own environment. This preserves BILL-01's allowlist-forward construction and keeps D-06's shape test meaningful: the value is Fleet-authored rather than copied from `process.env`, so it cannot become a leak channel the way an allowlist entry could. Note the daemon itself may well run under a non-default `CLAUDE_CONFIG_DIR`; that value must not silently become the worker's.

- **D-34:** MCP servers travel as inline JSON via `--mcp-config`, mirroring D-01's inline `--settin

<!-- FIXTURE TRUNCATED at 20 KiB by M0-G capture; original size 37203 bytes -->
