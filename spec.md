# herdr-gsd-core — Specification

**Status:** v0.1 draft for implementation
**Date:** 2026-09-15
**Target:** Herdr ≥ 0.9.0, GSD-Core (`@opengsd/gsd-core`) ≥ 1.8.0, Node ≥ 22, Linux + macOS
**Audience:** an agentic coding system building this from scratch. Every section is normative unless marked *Rationale* or *VERIFY*.

---

## 0. Decisions already made

| Decision | Value | Source |
|---|---|---|
| Harness support | Harness-agnostic. Claude Code is the first-class reference; Codex and OpenCode must work with the same core. | Owner |
| Primary goal | Observability first, orchestration second. | Owner |
| Where logic lives | **A single Herdr plugin.** GSD-Core is not patched, forked, or wrapped. Per-harness hook adapters are optional, shipped in the same repo, and degrade to no-op. | This spec (§2) |
| Upstream patches | None. Only published extension surfaces of Herdr and GSD-Core are used. If a capability is missing, file an upstream issue and design around it. | This spec |
| Language | TypeScript compiled to CommonJS, run by Node ≥ 22. No Bun dependency (GSD-Core is Node/npm; Herdr plugin build commands cannot assume Bun). | This spec |
| Platforms | linux, macos. Windows is explicitly out of scope for v1 (Unix socket transport used directly by the daemon). | This spec |
| License | MIT. | Owner to confirm |

**Assumptions to confirm before M1** (defaults apply if unanswered):
1. One GSD project ↔ one Herdr workspace, plus N linked worktree workspaces sharing that project. Default: yes.
2. The user wants sidebar tokens *and* a dashboard pane, not only one. Default: both, dashboard is M3.
3. Orchestration may create worktrees and start harness processes without per-action confirmation once a "profile" is enabled. Default: creation yes, sending prompts to *existing* panes the plugin does not own always requires confirmation.

---

## 1. Ground truth: what each side exposes

This section is the factual basis for the design. Items marked **VERIFY** must be confirmed in M0 against the installed binaries; the schema output of `herdr api schema --json` and `gsd-tools --help` are authoritative over this document.

### 1.1 Herdr (0.9.x)

Plugin host surface (`herdr-plugin.toml`):
- `[[build]]`, `[[startup]]` (one-shot, runs after socket ready; **not** a supervised daemon), `[[actions]]` (manifest-declared, invokable via keybinding/CLI/`plugin.action.invoke`), `[[events]]` (command run on named Herdr events with `HERDR_PLUGIN_EVENT_JSON`), `[[panes]]` (argv terminal UI; placements `overlay|popup|split|tab|zoomed`), `[[link_handlers]]`.
- Env injected: `HERDR_SOCKET_PATH`, `HERDR_BIN_PATH`, `HERDR_PLUGIN_ID`, `HERDR_PLUGIN_ROOT` (read-only checkout), `HERDR_PLUGIN_CONFIG_DIR`, `HERDR_PLUGIN_STATE_DIR`, `HERDR_PLUGIN_CONTEXT_JSON`, `HERDR_WORKSPACE_ID/TAB_ID/PANE_ID` when available.
- No plugin storage API; plugins own files under CONFIG_DIR/STATE_DIR.
- `min_herdr_version` required.

Socket API (NDJSON over Unix socket; request `{id,method,params}`):
- **Presentation (display-only, safe):** `pane.report_metadata` (`title`, `display_agent`, `state_labels`, `tokens{}` with per-key TTL, `seq`, `source`), `workspace.report_metadata` (`tokens{}`). Token limits: ≤16 keys per report, ≤32 retained per resource, names `[A-Za-z0-9_-]{1,32}`, values ≤80 chars. Tokens render as `$name` in sidebar rows. Not restored after server restart.
- **Semantic (authoritative, dangerous):** `pane.report_agent` sets lifecycle state and displaces Herdr's own integration for that pane. **This plugin never calls it** (see §2.3).
- **Agent view:** `agent.view.set` with `source = "plugin:<id>"`, filter/sort on `status`, `workspace_id`, `{"token":"name"}`; cleared when plugin disabled; must be re-applied from `[[startup]]`.
- **Read:** `session.snapshot`, `workspace.list`, `pane.list`, `agent.list`, `agent.get`, `pane.process_info` (foreground pid/argv/cwd), `pane.read`.
- **Events:** `events.subscribe` (long-lived connection): `workspace.*`, `tab.*`, `pane.created|closed|exited|agent_detected|agent_status_changed|moved`, `worktree.created|opened|removed`, `layout.updated`. No replay.
- **Orchestration:** `worktree.create|open|remove`, `pane.split` (with `env`, `cwd`), `layout.apply`, `agent.start`, `agent.prompt` (optional `wait{until,timeout_ms}`; returns `agent_blocked` if target already blocked), `agent.wait` (event-driven, pins pane occupant), `notification.show` (title ≤80, body ≤240, `sound: none|done|request`, rate limited).
- Herdr already has official integrations for Claude Code, Codex, OpenCode, pi, kimi, etc. Claude Code / Codex report *session identity* (state from screen detection); OpenCode/pi/kimi report *semantic state*.

**VERIFY (M0-H):** exact JSON shapes of `agent.list` entries, `pane.agent_status_changed` payload, `worktree.create` params, `agent.start` params (harness launch argv), and whether `agent.view.set` filter supports `exists` on tokens.

### 1.2 GSD-Core (1.8+)

- `.planning/` is the entire state contract and is identical on every harness: `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md` (writes are lock-protected via `STATE.md.lock`, O_EXCL), `config.json`, `MILESTONES.md`, `continue-here.md` (pause-work), `phases/NN-slug/{NN-PLAN*.md, NN-SUMMARY*.md, NN-UAT.md, ...}`, `research/`, `codebase/`, `graphs/`.
- `gsd-tools` CLI (`gsd-core/bin/gsd-tools.cjs`, on PATH after npm install): `state get|patch|sync --verify|planned-phase`, `phases list`, `roadmap get-phase`, `history-digest`, `progress`, `query config-set`. Dispatches through `CommandRoutingHub` with a no-throw `{ok:boolean, kind, ...}` result contract.
- `gsd-mcp-server` (stdio, stateless, cwd-scoped): tools `gsd_invoke_command{family,subcommand,args}`, `gsd_read_state{path}`, `gsd_write_state{path,content}`; resources/prompts catalog.
- Hooks are GSD-managed scripts staged under the harness config root (`hooks/` or `gsd-hooks/`), wired per harness. Coverage differs:
  - Claude Code: `SessionStart, PreToolUse, PostToolUse, SubagentStop, Stop, PreCompact, FileChanged(config.json)` — **no `SubagentStart`**.
  - Codex: `SessionStart, SubagentStart, Stop, PostToolUse` — **no `SubagentStop`**.
  - OpenCode/Kilo: no native hooks; GSD's bundled `plugins/gsd-core.js` bridges the OpenCode event bus to GSD hook scripts.
  - pi: extension-only, no hook bus.
- GSD emits a Claude Code statusline segment with phase/state and a context meter (config keys under `statusline.*`).
- GSD has `/gsd-workspace --new --strategy worktree` for same-repo isolation with independent `.planning/`.
- ADR-1239 "embeddable orchestration engine": negotiated host-integration interface, hook-bus + stateIO seams, extension-event vocabulary, capability registry.

**VERIFY (M0-G):**
1. Does the ADR-1239 hook bus expose a documented way for a *third party* to subscribe to GSD lifecycle events (phase boundary, plan start/stop, subagent dispatch) without editing GSD's staged hook scripts? Check `docs/adr/1239-*.md`, `docs/reference/host-integration-capability-matrix.md`, `docs/INVENTORY.md`, and `.planning/config.json` `hooks.*` keys.
2. Exact output of `gsd-tools state get --json`, `gsd-tools phases list --json`, `gsd-tools progress --json` (or whatever the JSON flag is). If no JSON mode exists for a command, parse Markdown with the same regexes GSD's own `state get` uses (locate in `src/*.cts`).
3. Is there a command to execute **one plan** of a phase in isolation (needed for pane-per-plan orchestration)? Candidates: `/gsd-execute-phase N --plan K`, `--wave W`. If absent, orchestration parallelism is phase-level across worktrees only (§7.4).
4. Where the Claude Code statusline hook writes its intermediate data (if a file exists it is a free, harness-specific enrichment source).
5. `gsd-phase-boundary.sh` semantics: what it detects and whether it leaves a marker on disk.

---

## 2. Architecture

### 2.1 Placement decision

**All integration logic lives in one Herdr plugin (`herdr-gsd-core`).** GSD-Core is consumed only via (a) its filesystem contract, (b) `gsd-tools`, and (c) optionally its per-harness hook events, forwarded by thin adapters the plugin installs into the *harness*, not into GSD.

*Rationale:*
- The only thing that is identical across all GSD-supported harnesses is `.planning/`. Every harness-specific channel (hooks, statusline, MCP) has gaps; the filesystem has none. Building the core on the filesystem is the only way to honour "harness-agnostic" without a support matrix explosion.
- Herdr is the only process that knows what a pane is. Any GSD-side component would still have to talk to the Herdr socket, so putting logic on the GSD side buys nothing and costs a second install/upgrade lifecycle.
- GSD-Core's hook scripts are managed and overwritten on `gsd update`. Anything placed inside them is lost. Harness hook config (e.g. `~/.claude/settings.json` hooks array) is *additive* — the plugin can register its own entries alongside GSD's without touching GSD's.
- gsd-herdr (the GSD-Pi project) needed a runtime patch because Pi *is* the runtime. GSD-Core is not; the harness owns process control, so there is no seam to patch and no reason to.

### 2.2 Components

```
herdr-gsd-core/                      (one repo, one npm workspace)
├── herdr-plugin.toml                (manifest)
├── packages/
│   ├── core/                        gsd-model: .planning reader + normalizer  (no Herdr deps)
│   ├── herdr-client/                NDJSON socket client + typed methods + event stream
│   ├── daemon/                      gsdd: watcher → projector → notifier; orchestrator
│   ├── cli/                         `herdr-gsd` argv entrypoints used by the manifest
│   ├── dashboard/                   TUI pane (Ink or plain ANSI), reads daemon state
│   └── adapters/
│       ├── claude-code/             hook scripts + settings.json installer
│       ├── codex/                   hook scripts + config installer
│       └── opencode/                plugin file installer
└── test/                            fixtures, fake-herdr server, e2e
```

Runtime processes:

| Process | Lifetime | Started by | Owns |
|---|---|---|---|
| `gsdd` (daemon) | long-lived, one per Herdr server socket | `[[startup]]` hook spawns it detached; `herdr-gsd daemon ensure` idempotently (re)starts it | fs watchers, Herdr event subscription, projection, notifications, orchestration state |
| `herdr-gsd <action>` | short | Herdr actions/events/keybindings | talks to `gsdd` over a local control socket; never talks to Herdr directly except `notification.show` for errors |
| dashboard | while pane open | `[[panes]]` | renders `gsdd` state; sends commands to `gsdd` |
| adapter hook scripts | ms | the harness | append one JSONL line to the event spool and exit 0 |

**Daemon self-supervision (because Herdr does not supervise):**
- pidfile + lockfile at `$HERDR_PLUGIN_STATE_DIR/<socket-hash>/gsdd.pid`; `ensure` checks liveness via `kill -0` and a `ping` on the control socket; stale pidfile → restart.
- The daemon exits when the Herdr socket closes (server stopped) and is re-spawned by the next `[[startup]]` (server restart / live handoff) or by any action.
- Every `[[actions]]` and `[[events]]` command first calls `daemon ensure`.
- Crash loop guard: if `gsdd` exits non-zero 3× within 60 s, `ensure` stops retrying, writes `gsdd.disabled` with the last stderr, and shows one `notification.show` pointing at `herdr plugin log list`.

### 2.3 Principles (normative)

1. **Never take lifecycle authority.** The plugin uses `pane.report_metadata` and `workspace.report_metadata` only. Semantic state (`working|blocked|idle|done`) stays with Herdr's own detection/integrations. Consequence: GSD "waiting for user" shows up as Herdr `blocked` via the harness integration, and the plugin only *annotates* it (e.g. token `gsd_wait = "UAT 03"`).
2. **Filesystem is primary; hooks are enrichment.** All M1 acceptance criteria must pass with zero adapters installed.
3. **Idempotent, restart-safe projection.** All Herdr metadata carries `source = "plugin:<HERDR_PLUGIN_ID>"` and a monotonically increasing `seq` per (resource, source). On daemon start: full resync from disk + `session.snapshot`.
4. **Bounded blast radius.** Adapters write only to their own marker-delimited blocks in harness config; uninstall removes exactly those blocks. Nothing under a GSD-managed path is ever modified.
5. **Fail visibly, not silently.** Any capability the daemon needs but cannot get (socket method missing, `gsd-tools` not on PATH, `.planning` unreadable) produces one notification and a persistent token `gsd_err` on the affected workspace, not a silent no-op.
6. **Pin and probe.** On start, `gsdd` calls `ping`, fetches `herdr api schema --json`, and checks every method it uses exists; runs `gsd-tools --version`. Mismatches with the tested matrix are warnings, not fatals, unless a required method is absent.

---

## 3. Data contracts

### 3.1 `ProjectSnapshot` (produced by `packages/core`)

Derived from `.planning/` + `gsd-tools`. All fields optional except `root`, `observedAt`, `health`.

```ts
type PhaseStatus = 'not_started'|'discussed'|'planned'|'executing'|'verifying'|'complete'|'blocked';

interface ProjectSnapshot {
  root: string;                    // abs path of repo containing .planning
  planningDir: string;
  observedAt: number;              // unix ms
  health: 'ok'|'no_planning'|'locked'|'parse_error'|'tools_missing';
  gsdVersion?: string;             // from gsd-tools --version or config.json
  project?: { name: string; milestone?: string };
  position?: {                     // from STATE.md "current position"
    phase?: { number: string; slug: string; status: PhaseStatus };
    plan?: { id: string; index: number; total: number };
    wave?: number;
    step?: 'discuss'|'plan'|'execute'|'verify'|'ship';
  };
  phases: Array<{ number: string; slug: string; status: PhaseStatus; plans: number; summaries: number; uat?: 'pending'|'pass'|'fail' }>;
  blockers: string[];              // STATE.md blockers section
  lastActivity?: { file: string; at: number };  // newest mtime under .planning (excluding *.lock)
  paused?: { file: 'continue-here.md'; at: number };
  drift?: { stateVsDisk: boolean; details?: string };  // gsd-tools state sync --verify, throttled
  config?: { parallelization?: boolean; modelProfile?: string; commitDocs?: boolean };
}
```

Parsing rules:
- Prefer `gsd-tools <cmd> --json` when available (VERIFY M0-G.2). Fall back to Markdown parsing that mirrors GSD's own parsers; keep the fallback under test with fixture trees captured from real projects (one per supported GSD minor version).
- Never read `STATE.md` while `STATE.md.lock` exists; retry with backoff (50 ms → 1 s, max 5 s), then report `health: 'locked'` and keep the previous snapshot.
- `gsd-tools` invocations are throttled (≥ 2 s apart per project) and run with `cwd = root`, 10 s timeout.

### 3.2 `ActivityEvent` (JSONL spool, written by adapters, read by daemon)

Spool path: `$HERDR_PLUGIN_STATE_DIR/<socket-hash>/spool/<project-hash>.jsonl`. Adapters locate STATE_DIR via an env var the plugin exports into harness hook config at install time (`HERDR_GSD_SPOOL_DIR`), falling back to `~/.local/state/herdr-gsd-core/spool/`. Append-only, one JSON object per line, ≤ 4 KiB, `O_APPEND` single `write(2)`.

```ts
interface ActivityEvent {
  v: 1;
  ts: number;                      // unix ms
  harness: 'claude-code'|'codex'|'opencode'|'other';
  sessionId?: string;              // harness-native session id if the hook payload has one
  cwd: string;                     // project root as seen by the harness
  panePid?: number;                // getppid() chain top if resolvable; used to map to Herdr pane
  kind: 'session.start'|'session.stop'|'subagent.start'|'subagent.stop'|'tool.pre'|'tool.post'|'compact.pre'|'phase.boundary';
  agent?: string;                  // e.g. gsd-executor, gsd-verifier (from GSD_AGENT_NAME or payload)
  tool?: string;                   // Bash, Edit, Read…
  detail?: string;                 // ≤200 chars, redacted (see §5.4)
}
```

Daemon consumption: tail with a byte offset persisted per file; rotate at 5 MiB (rename to `.1`, keep 2 generations). Events older than 24 h are ignored on cold start.

Pane mapping precedence: (1) `HERDR_PANE_ID` if the harness hook inherits Herdr's pane env (true when the harness was launched inside a Herdr pane — the adapter installer emits `"$HERDR_PANE_ID"` into the event when set); (2) `pane.process_info` ancestor pid match; (3) `cwd` match against `pane.list[].foreground_cwd` / `cwd` (ambiguous → attach to the workspace, not a pane).

### 3.3 Herdr projection

Workspace tokens (via `workspace.report_metadata`, no TTL, replaced on change):

| token | value example | source |
|---|---|---|
| `gsd_phase` | `03 auth` | position.phase |
| `gsd_step` | `execute 2/4` | position.step + plan index/total |
| `gsd_status` | `executing` / `blocked` / `paused` / `complete` | derived; `paused` if continue-here.md is newer than STATE.md |
| `gsd_next` | `verify-work 3` | recommended next command (rule table in §4.3) |
| `gsd_err` | `gsd-tools missing` | only when health ≠ ok |

Pane tokens (via `pane.report_metadata`, on the pane running the GSD driver session; TTL 90 s, refreshed by activity or by snapshot change):

| token | value example | source |
|---|---|---|
| `gsd_agent` | `executor` | last `subagent.start` without matching stop |
| `gsd_workers` | `2 active` | count of open subagent spans (Codex/OpenCode only; Claude Code shows `?` until SubagentStart exists) |
| `gsd_tool` | `Bash git diff` | last `tool.pre`, TTL 15 s |
| `gsd_ctx` | `62%` | from statusline data if VERIFY M0-G.4 finds it; else absent |

Pane presentation: `title` = `GSD · <project> · <phase>` only if the pane has no user-set title (check `terminal_title_stripped`/existing metadata before writing; never overwrite a title from another source). `display_agent` untouched.

Agent view (`agent.view.set`, label `gsd`): filter `any[ token gsd_phase exists, status in [blocked, done] ]`, sort `[attention desc, token gsd_phase asc, state_change_seq desc]`. Applied only if `views.enabled = true` in plugin config (default false — it replaces the user's view).

### 3.4 Plugin config — `$HERDR_PLUGIN_CONFIG_DIR/config.toml`

```toml
[projects]
autodiscover = true              # scan workspace cwd (and parents up to git root) for .planning
ignore = ["**/node_modules/**"]

[notify]
phase_boundary = true            # phase status changed
blocked = true                   # GSD driver pane became blocked AND gsd_status != complete
uat_ready = true                 # a new *-UAT.md appeared
drift = false                    # state sync --verify reports drift
quiet_when_focused = true        # suppress when the pane is focused (Herdr already does tab-aware suppression; keep both)
sound = "done"                   # none|done|request

[views]
enabled = false

[harness.claude-code]
command = ["claude"]
prompt_flag = []                 # prompt is sent via agent.prompt after start, not argv
[harness.codex]
command = ["codex"]
[harness.opencode]
command = ["opencode"]

[orchestration]
enabled = false                  # M4
worktree_branch_prefix = "gsd/"
max_parallel = 3
confirm_prompt_to_foreign_pane = true
```

### 3.5 Daemon state — `$HERDR_PLUGIN_STATE_DIR/<socket-hash>/`

`gsdd.pid`, `gsdd.sock` (control), `spool/`, `bindings.json` (workspace_id ↔ project root ↔ role), `seq.json` (per-resource seq counters), `view.json` (last applied agent view, re-applied on startup), `orchestration/<run-id>.json` (M4 run records), `log/gsdd.log` (rotating, 5 MiB × 3).

Control socket protocol: same NDJSON envelope as Herdr. Methods: `ping`, `status`, `projects.list`, `project.get`, `project.rescan`, `bindings.set`, `notify.test`, `orchestrate.plan|start|stop|status` (M4).

---

## 4. Behaviour

### 4.1 Project discovery and binding

1. On start and on `workspace.created|updated|closed` / `worktree.*` events: for each workspace, resolve `cwd`; walk up to the git toplevel; if `<root>/.planning/STATE.md` or `PROJECT.md` exists, bind `workspace_id → root`.
2. Linked worktree workspaces (`workspace.worktree` provenance) bind to the *same* root if they share `.planning` (GSD non-isolated worktrees) or to their own root if `/gsd-workspace --strategy worktree` produced an isolated `.planning`. Detect by existence.
3. Roles: the workspace whose panes host the harness process (via `pane.process_info` name ∈ known harness names, or a bound `ActivityEvent`) is `driver`; others are `observer`. Only the driver pane receives pane tokens; all bound workspaces receive workspace tokens.
4. Bindings persist in `bindings.json` and are validated (root still exists) on start.

### 4.2 Watching

- One recursive watcher per bound root on `.planning/` (fs.watch on macOS/Linux; fall back to 2 s polling if `EMFILE`/unsupported). Debounce 300 ms. Ignore `*.lock`, `graphs/**` (chatty), `*.tmp`.
- Recompute `ProjectSnapshot`, diff against previous, emit internal `snapshot.changed` with a change set (`phase`, `step`, `status`, `blockers`, `uat`, `paused`).
- Drift check (`state sync --verify`) at most every 10 min per project and only when idle (no activity events for 60 s), since it spawns a Node process.

### 4.3 Recommended-next rule table (`gsd_next`)

| condition | gsd_next |
|---|---|
| no phases planned | `new-project` / `onboard` |
| phase N not_started/discussed | `plan-phase N` |
| phase N planned, no summaries | `execute-phase N` |
| summaries == plans, UAT absent | `verify-work N` |
| UAT fail | `execute-phase N` (fix plan) |
| UAT pass | `ship N` or `plan-phase N+1` |
| continue-here.md newer than STATE.md | `resume-work` |

Keep this table data-driven (`packages/core/rules.json`) so it can be tuned without code changes.

### 4.4 Notifications

Single `notification.show` per change-set batch, coalesced within 2 s. Title ≤80: `GSD · <project>: phase 03 executing → verifying`. Body: `gsd_next` hint. Respect Herdr's `rate_limited`/`busy` results by retrying once after 5 s, then dropping. `blocked` notifications fire only when the driver pane's semantic status (from `agent.list`) transitions to `blocked` *and* the snapshot is not `complete`.

### 4.5 Restart, reattach, handoff

- Client detach/reattach: nothing to do (server-side state).
- Server restart / live handoff: `[[startup]]` runs → `daemon ensure` → daemon does full resync: `session.snapshot`, rebind, re-report all tokens with fresh `seq`, re-apply agent view from `view.json`.
- Plugin disable/unlink: Herdr clears the agent view; the daemon (if still running) notices `plugin.list` no longer shows it enabled on its next heartbeat (30 s) and exits, clearing its tokens first (report `null` per key).

---

## 5. Harness adapters (M2)

Each adapter is an *installer* + *hook script(s)*. Installer commands: `herdr-gsd adapter install <harness> [--global|--local <dir>]`, `adapter uninstall`, `adapter doctor`. All installers are idempotent and edit only a marker-delimited region.

### 5.1 Claude Code
- Writes into `~/.claude/settings.json` (or `CLAUDE_CONFIG_DIR`) `hooks` entries for `SessionStart`, `SubagentStop`, `PreToolUse` (matcher: `Bash|Edit|Write|MultiEdit|Task`), `PostToolUse` (matcher `Task`), `Stop`, `PreCompact`, each `command: "node <PLUGIN_ROOT>/packages/adapters/claude-code/dist/hook.cjs <kind>"` with `timeout` 2 s. Marker: a JSON object key `"_herdr_gsd_core": "managed"` on each entry so uninstall can filter precisely.
- `subagent.start` is inferred: a `PreToolUse` with `tool == "Task"` (Claude Code's subagent tool) opens a span; `SubagentStop` closes it. **VERIFY** that `Task` is the current tool name and whether the payload carries `subagent_type`/`description` (→ `agent`).
- The hook reads stdin JSON, extracts `session_id`, `cwd`, `tool_name`, `tool_input` (redacted, §5.4), writes one spool line, exits 0 within 200 ms. Never blocks, never returns a decision.

### 5.2 Codex
- Codex ≥ 0.137 hook schema. Events `SessionStart`, `SubagentStart`, `Stop`, `PostToolUse`. `subagent.stop` is inferred from the next `SubagentStart`/`Stop` or a 15-min TTL. Installer location: **VERIFY** (`~/.codex/hooks.json` vs `config.toml` `[[hooks]]`) by reading how GSD's own installer writes Codex hooks.

### 5.3 OpenCode / Kilo
- Ships `plugins/herdr-gsd-core.js` (CommonJS — OpenCode's plugin dir is pinned CJS by GSD's own `package.json` marker; do not add a second marker). Subscribes to `session.created`, `tool.execute.before/after`, `session.idle`, writes spool lines. Never registers as a hook that can block.

### 5.4 Redaction
`detail` is derived from tool input by an allow-list: for `Bash` the first 3 argv tokens with any token matching `/(key|token|secret|password|bearer)/i` replaced by `***`; for file tools the path relative to project root; everything else → tool name only. No stdin/stdout of tools is ever spooled.

### 5.5 Degradation matrix

| harness | subagent spans | tool activity | context % | notes |
|---|---|---|---|---|
| Claude Code | inferred (Task → SubagentStop) | yes | if statusline data file exists | reference |
| Codex | start-only + TTL | post only | no | |
| OpenCode/Kilo | via GSD plugin bus events | yes | no | |
| pi / others | none | none | no | filesystem-only; still passes M1 |

---

## 6. Dashboard pane (M3)

`[[panes]] id="dashboard"`, placement default `split`, command `node packages/dashboard/dist/main.cjs`. Renders from `gsdd` control socket (`project.get` + subscribe to `snapshot.changed`/`activity`), 4 Hz max.

Layout (80×24 minimum):
```
 GSD · myproj · Phase 03 auth · executing (plan 2/4, wave 1)      ↻ 2s ago
 ─────────────────────────────────────────────────────────────────────────
 Phases   01 core ✓   02 db ✓   03 auth ▶   04 api ·   05 ship ·
 Plans    03-01 ✓  03-02 ▶ executor (Bash: pnpm test)  03-03 ·  03-04 ·
 Blockers  none
 Next     verify-work 3          [enter] send to driver pane   [w] worktree
 Activity 12:01:03 executor  Edit src/auth/session.ts
          12:00:41 executor  Bash pnpm test
          11:58:10 planner   subagent.stop
 Keys  q quit · r rescan · n notify test · o orchestrate (M4)
```
`[enter]` sends `/gsd-<next>` into the driver pane via `agent.prompt` **only after** a y/N confirmation; if the driver agent is `blocked`, show the `agent_blocked` error instead of sending.

---

## 7. Orchestration (M4)

Goal: give each parallel unit of GSD work its own Herdr pane/workspace, using only harness processes Herdr already knows how to detect. GSD's in-process subagents remain in-process (no pane per subagent — see §9).

### 7.1 Units of work
- **Phase run:** one harness session in a pane, driven by `agent.prompt("/gsd-<cmd> N")`.
- **Isolated phase run:** `worktree.create` (branch `gsd/phase-N`) → GSD isolated workspace (`/gsd-workspace --new --repos . --strategy worktree`) or plain worktree sharing `.planning` — choose by `orchestration.isolation = "gsd-workspace"|"worktree"|"none"`.
- **Plan/wave run:** only if VERIFY M0-G.3 confirms a per-plan/per-wave command exists; otherwise not offered.
- **Autonomous loop:** `agent.prompt("/gsd-autonomous", wait:{until:"blocked"|"done", timeout_ms})` in a dedicated pane, with the daemon re-prompting on `done` if the snapshot says more phases remain and the run's budget (max phases, max wall-clock) allows.

### 7.2 Run record
`orchestration/<run-id>.json`: `{id, project, unit, target{workspace_id, pane_id}, harness, startedAt, status: planned|starting|running|waiting|done|failed|cancelled, prompts:[…], lastAgentStatus, exit?}`. Runs survive daemon restart; on resync the daemon re-attaches to panes by id and re-arms `agent.wait`.

### 7.3 Actions
`orchestrate:phase`, `orchestrate:phase-isolated`, `orchestrate:autonomous`, `orchestrate:stop` (sends `esc` twice via `agent.send_keys`, then `pane.close` after confirmation), `orchestrate:status`. Each action is a manifest `[[actions]]` entry with `contexts = ["workspace"]`.

### 7.4 Safety
- Never `pane.send_text` to a pane the plugin did not create unless `confirm_prompt_to_foreign_pane` is answered in the dashboard.
- Never remove a worktree the plugin did not create; `worktree.remove` only with `force=false`.
- Concurrency cap `max_parallel`; new runs queue.
- Two runs may not target the same non-isolated `.planning` for `execute-phase` simultaneously (STATE.md is a shared write target; GSD's lock prevents corruption but not logical races). Enforce at plan time.

---

## 8. Milestones and acceptance criteria

Each milestone ends with its checks executable via `npm run verify:<m>`; `PLANNING.md` records evidence (command + output hash). No milestone starts before the previous one's checks pass.

### M0 — Verification spikes (no product code)
Deliverables: `docs/spikes/M0-*.md` with commands, raw outputs, and a decision per VERIFY item in §1; `docs/COMPAT.md` pinning tested Herdr and GSD-Core versions.
- M0-H: dump `herdr api schema --json`; confirm presence and param shapes of every method in §1.1; capture one real `agent.list`, `pane.process_info`, `worktree.create` response; confirm `pane.report_metadata` token renders in the sidebar (`$gsd_phase`) with a manual `herdr api` call.
- M0-G: items 1–5 in §1.2. Capture fixture `.planning` trees from two real projects (one mid-execute, one paused).
- M0-A: capture real hook payloads from Claude Code (SessionStart, PreToolUse Task, SubagentStop, Stop) and Codex; store as test fixtures with secrets scrubbed.
- Exit: every VERIFY resolved to a decision recorded in `docs/DECISIONS.md`.

### M1 — Observe core (filesystem only)
- Plugin links with `herdr plugin link .`; `[[startup]]` starts `gsdd`; `herdr plugin log list` shows clean start.
- Opening a workspace whose repo has `.planning` yields `$gsd_phase $gsd_step $gsd_status $gsd_next` tokens within 2 s; editing `STATE.md` updates them within 1 s (debounce included).
- Killing `gsdd` and invoking any action restores it and re-reports identical tokens (seq strictly increasing).
- `herdr server stop` → start → tokens reappear without user action.
- Phase status change triggers exactly one notification; rate-limit responses handled.
- Unit tests: ≥ 95 % branch coverage on `packages/core` parsers against fixtures for GSD 1.8 and current `next`.
- No adapter installed anywhere during M1 tests.

### M2 — Adapters and activity
- `adapter install claude-code` adds only managed entries; `adapter uninstall` restores the file byte-identical (test on a fixture settings.json with unrelated hooks).
- Running a GSD execute in Claude Code inside a Herdr pane shows `$gsd_agent` and `$gsd_tool` on that pane, TTLs expire correctly.
- Hook scripts complete in < 200 ms p99 and never fail the harness (exit 0 on every error path).
- Same for Codex (start-only spans) and OpenCode.
- Redaction tests: fixtures containing tokens/keys never reach the spool.

### M3 — Dashboard
- Pane opens via keybinding and `herdr plugin pane open`; renders within 500 ms; survives daemon restart (reconnects).
- `[enter]` on `gsd_next` sends the command after confirmation; refuses when driver is `blocked`.

### M4 — Orchestration
- `orchestrate:phase-isolated` creates a worktree workspace, starts the configured harness, sends the prompt, and the run record reaches `done` or `waiting`; Herdr's own integration (not the plugin) reports the semantic state.
- Daemon restart mid-run re-attaches and re-arms waits.
- `orchestrate:stop` leaves no orphan process (`pane.process_info` empty foreground after close).
- Logical-race guard rejects a second `execute-phase` on a shared `.planning`.

### M5 — Hardening and release
- CI matrix: ubuntu-latest + macos-latest; installs pinned Herdr and GSD-Core; runs e2e against a real `herdr` server in `--session ci`.
- `herdr plugin install <owner>/herdr-gsd-core --yes` works from a clean machine; build commands are only `npm ci` + `npm run build`.
- Repo tagged `herdr-plugin` for marketplace listing; README documents the degradation matrix and the "no lifecycle authority" stance.

---

## 9. Non-goals (v1)

- Pane-per-GSD-subagent. GSD-Core subagents are in-process children of the harness (Claude Code `Task`, Codex agents). No harness exposes a way to host them in a separate PTY. Subagents are shown as activity rows/tokens only. Revisit if a harness adds out-of-process subagent execution.
- Token-by-token streaming of subagent output into panes.
- Modifying GSD-Core's own hooks, statusline, or `.planning` files (the plugin is read-only w.r.t. `.planning`; `gsd_write_state` is never used).
- Windows.
- Cross-machine (Herdr 0.9 federation) — single local server only; the daemon binds to one `HERDR_SOCKET_PATH`.
- Replacing Herdr's agent detection for any harness.

---

## 10. Testing strategy

- **Unit:** `packages/core` against fixture `.planning` trees (`test/fixtures/planning/<gsd-version>/<scenario>/`). Snapshot tests for `ProjectSnapshot`. Rule table tests for `gsd_next`.
- **Fake Herdr:** `test/fake-herdr/` — an NDJSON Unix-socket server implementing the subset in §1.1 with recorded response shapes from M0; asserts call ordering, `seq` monotonicity, token limits, and rejects unknown methods. All daemon tests run against it.
- **Hook fixtures:** recorded harness payloads (M0-A) piped into adapter hook scripts; assert spool line and timing.
- **E2E (CI):** real `herdr` server in a named session; a real `.planning` fixture repo; assert via `herdr api snapshot` that tokens/metadata appear. Adapters e2e only where the harness can run headless (Claude Code cannot in CI → adapter e2e is a manual checklist in `docs/TESTING.md`).
- **Failure injection:** kill daemon mid-report; corrupt spool line; `STATE.md.lock` held for 10 s; Herdr socket disappears; `gsd-tools` absent; EMFILE on watchers.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Herdr socket schema drift (0.9 → 0.10) | Startup schema probe (§2.3.6); `min_herdr_version`; COMPAT.md matrix; CI pins |
| GSD `.planning` format drift | Prefer `gsd-tools --json`; fixture per GSD minor; parsers versioned by detected `gsdVersion` |
| Claude Code has no SubagentStart | Inferred spans via `Task`; documented as inferred; file upstream issue with GSD-Core to add it |
| Token limit (32 per resource) contention with other plugins | Use ≤ 8 tokens; namespace `gsd_` |
| Daemon without supervision | §2.2 self-supervision + crash-loop guard |
| Notification fatigue | Coalescing, `quiet_when_focused`, per-category toggles |
| Orchestration logical races on shared STATE.md | §7.4 guard; default to isolated worktrees |

---

## 12. Development rules for the implementing agent

1. Read `PLANNING.md` at the start of every session; update task state, decisions, risks, and *exact next action* at the end. (Same discipline GSD-Core itself uses.)
2. Nothing marked VERIFY may be assumed. If a spike contradicts this spec, the spike wins; record the delta in `docs/DECISIONS.md` and amend the spec.
3. Every Herdr call goes through `packages/herdr-client`; every `.planning` read goes through `packages/core`. No ad-hoc socket writes or file reads elsewhere.
4. Pin versions in `docs/COMPAT.md`; bump deliberately with a spike, never implicitly.
5. All hook scripts: no imports beyond Node builtins, single-file bundles, exit 0 on every path, hard 2 s self-timeout.
6. Prefer `HERDR_BIN_PATH` CLI calls in short-lived commands; the raw socket is for the daemon only.
7. Never write under any GSD-managed path or inside `.planning/`.
8. Keep the degradation matrix (§5.5) true: a change that breaks filesystem-only operation is a regression regardless of what it adds.

---

## 13. Amendments after M0 (2026-09-15)

Per §12.2: "If a spike contradicts this spec, the spike wins; record the delta in
`docs/DECISIONS.md` and amend the spec." This table is that amendment record. The
sections above are left as originally written; this table is normative where it conflicts
with them. Full reasoning and citations are in `docs/DECISIONS.md` and the three spike
docs under `docs/spikes/`.

| § | Original text (short quote) | Amended to | Source |
|---|---|---|---|
| §1.1 | "`events.subscribe`... `pane.created\|closed\|exited\|agent_detected\|agent_status_changed\|moved`" | No global `pane.agent_status_changed` stream exists — it is pane-scoped and requires `pane_id`. Subscribe to `pane.updated` (fires on any `PaneInfo` change) and diff `agent_status` instead. | M0-H §1.3 |
| §1.1 | "`tokens{}` with per-key TTL" | TTL (`ttl_ms`) is per **report call**, not per key. Different TTLs for different tokens require separate `pane.report_metadata` calls. | M0-H §3.1 |
| §1.1 | "confirm... whether `agent.view.set` filter supports `exists` on tokens" | Confirmed yes: `exists{field:{"token":"<name>"}}` is schema-valid. `agent.view.set` is plugin-gated (rejects an unlinked `source`), unlike `report_metadata`. | M0-H §3.2 |
| §2.3 (principle 3) | "monotonically increasing `seq` per (resource, source)" | `seq ≤` the last accepted value is silently ignored with no error and no event. Use a wall-clock-derived `seq` (`Date.now()`-based), since Herdr never exposes the prior high-water mark across a daemon restart. | M0-H §4 |
| §4.1 (step 1) | "for each workspace, resolve `cwd`" | There is no `cwd` field on a workspace anywhere in the API. Derive the root from the root pane's `cwd`/`foreground_cwd`, or from `workspace.worktree.checkout_path`/`repo_root` for worktree workspaces. | M0-H §2 |
| §4.1 (step 2) | worktree binding described without call scope | `worktree.list` is repo-scoped (`{workspace_id\|cwd}`), not global — call it once per bound repo root. | M0-H §2 |
| §4.4 | "Respect Herdr's `rate_limited`/`busy` results by retrying once" | `rate_limited` and `busy` are `result.reason` values on a **successful** `notification.show` response, not error codes — implement the retry against `result.reason`. | M0-H §1.2, §3.4 |
| §4.4 | "`blocked` notifications fire only when the driver pane's semantic status... transitions to `blocked`" | For Claude Code and Codex, `agent_status` is always screen-scraped (even with the official integration installed), and strict detection can false-negative on an unrecognized prompt. Gate the notification primarily on the filesystem snapshot (`gsd_status`, new `*-UAT.md`); use `agent_status == blocked` only as corroboration. | M0-H §7 |
| §3.3 | "sort `[attention desc, token gsd_phase asc, state_change_seq desc]`" | `attention` is a write-only sort key — it cannot be read back from `agent.get`/`agent.list`. Derive "needs attention" from `agent_status ∈ {blocked, done}` wherever the daemon needs to read it. | M0-H §2 |
| §3.3 | "`gsd_workers`... Claude Code shows `?` until SubagentStart exists" | `SubagentStart` exists in Claude Code 2.1.273. `gsd_workers` can be counted exactly via `SubagentStart`/`SubagentStop` pairing for Claude Code, same as Codex/OpenCode. | M0-A §1 |
| §5.1 | "PreToolUse (matcher: `Bash\|Edit\|Write\|MultiEdit\|Task`)" and "confirm `Task` is the current tool name" | The subagent tool is **`Agent`**, not `Task` (`Task` is a separate todo-tracking tool family). Matcher becomes `Bash\|Edit\|Write\|MultiEdit\|Agent\|Task`, with `Task` kept only as a legacy fallback. | M0-A §1.1 |
| §5.1 | "Marker: a JSON object key `\"_herdr_gsd_core\": \"managed\"` on each entry" | Drop the JSON marker key. Identify herdr-owned hook entries by a distinctive substring in the `command` string (matching GSD's own `isManagedHookCommand` approach), filtered per-`hooks[]`-entry on uninstall — portable to Codex's stricter, unknown-key-rejecting schema. | M0-A §1.3 |
| §5.2 | "Installer location: **VERIFY** (`~/.codex/hooks.json` vs `config.toml [[hooks]]`)" | Confirmed: `~/.codex/hooks.json` (nested `{"hooks": {...}}`), not `config.toml`. GSD itself wires only `SessionStart` there; the other events have no live GSD precedent and must be registered by this plugin directly, gated on `codex --version ≥ 0.130`. | M0-A §2 |
| §5.2 | "Codex ≥ 0.137 hook schema" | No confirmed version floor — Codex was not installed this session. Adjacent-feature floors found: `hooks` feature-flag namespace needs ≥0.130.0. Treat "≥0.130" as the working floor pending a real Codex spike. | M0-A §2 |
| §5.3 | "OpenCode's plugin dir is pinned CJS by GSD's own `package.json` marker; do not add a second marker" | The config-root CJS marker was **retired** (GSD migration 007, `introducedIn: 1.8.0`). The marker now lives only in `<root>/plugins/package.json`. A standalone ESM plugin doing no subprocess spawn (this plugin's design) needs no marker at all. | M0-A §3, M0-G §6 |
| §3.2 | "the adapter installer emits `\"$HERDR_PANE_ID\"` into the event" | Not needed. `HERDR_PANE_ID` is already inherited by any hook process launched inside a Herdr pane — confirmed by walking `/proc/<pid>/environ` up a live process tree. No adapter plumbing required for this path. | M0-A §5 |
| §3.1 | `PhaseStatus` 7-value enum (`not_started\|discussed\|planned\|executing\|verifying\|complete\|blocked`) | GSD itself has three separate, non-matching vocabularies (`state.json`'s 3-value, `determinePhaseStatus`'s 6-value, `normalizeStateStatus`'s 7-value project-level set). None equals the spec's set. `packages/core` needs an explicit mapping table; `blocked` remains a plugin-derived value, never native to GSD. | M0-G §2.3, §2.5, §7 |
| §3.1 | "`continue-here.md` (pause-work)" at the `.planning/` root | The file is **`.continue-here.md`** (dot-prefixed) and normally lives in the active phase directory (`.planning/phases/NN-slug/.continue-here.md`); root-level is for research-shaped work only. `/gsd-pause-work` also writes a sibling `.planning/HANDOFF.json`. | M0-G §7 |
| §3.1 | "`blockers: string[]`" from STATE.md | GSD only parses an h2 `## Blockers`; real projects write `### Blockers/Concerns` under `## Accumulated Context`, so GSD's own parser returns `[]` for all 3 captured fixtures. Match GSD's behavior (faithful empty result) and document the divergence rather than silently extending it. | M0-G §7 |
| §3.1 | "`STATE.md.lock`" as the lock file | Two more locks exist: `.planning/.lock` and `.planning/milestone.lock`. Widen the lock check to all three. | M0-G §7 |
| §1.2, §3.1 | "`gsd-tools <cmd> --json`" | There is **no `--json` flag** — JSON is `gsd-tools`'s unconditional default output; `--raw` turns it off. Use `--project-dir` + `--pick` instead. | M0-G §2.2, §7 |
| §2.3 (principle 6) | "runs `gsd-tools --version`" | No `--version` flag exists and errors out. Use `gsd-tools runtime-identity` → `{packageName, version}`. | M0-G §2.2, §7 |
| §4.2 | "Drift check (`state sync --verify`)" | No `state sync` subcommand exists in 1.14.0. Use `drift-guard`/`validate` for the read-only equivalent. | M0-G §2.6, §7 |
| §1.2 | "`state get\|patch\|sync --verify\|planned-phase`" listed together as the read surface | `state planned-phase` is a **write** — it publishes `state.json` and mutates `STATE.md`. Confirmed the hard way: it rewrote a real, unrelated project during this spike (restored from git; see `docs/DECISIONS.md`). Pin the verified read-only command list (`docs/COMPAT.md`) and assert it in tests. | M0-G incident notice, §2.6 |
| §4.3 | hand-rolled `gsd_next` rule table (`rules.json`) | GSD already ships this exact answer via `gsd-tools smart-entry --json` (`{situation, recommended, actions[].command}`) and `.planning/state.json.next`, built from the same `classifyProject` logic. Replace the hand-rolled table with `smart-entry`, keeping a hard-coded table only as an offline fallback. | M0-G §7 |
| §1.2 | statusline described as carrying "phase/state and a context meter" | The on-disk bridge file (`$TMPDIR/claude-ctx-<session_id>.json`) carries **context % only** — no phase, no state, no project binding, non-atomic, unversioned. Keep `gsd_ctx` sourced from it; never source phase/state from it. | M0-G §4, §7 |
| §1.2 | "ADR-1239... hook-bus + stateIO seams" implied to be a usable third-party subscription surface | Shipped but unwired: `subscribe()` is an empty stub, `emit()` throws, there are no producers, no GSD-domain events exist, and `@opengsd/gsd-core/sdk` is `MODULE_NOT_FOUND`. The filesystem-primary design in §2.1 is confirmed, not just a fallback. | M0-G §1, §7 |
| §1.2, §7.1 | "`/gsd-execute-phase N --plan K`" candidate for per-plan execution | No plan-level flag exists in 1.14.0. `--wave N` is the only sub-phase granularity. Orchestration unit is **wave**, not plan; drop pane-per-plan. | M0-G §3, §7 |
| — (new) | not mentioned | `.planning/state.json` — GSD's own atomic, versioned, frozen-key-order state contract with a `next` recommendation — is the **primary** read in `packages/core`; `STATE.md` markdown parsing becomes the fallback. | M0-G §2.3 |
| — (new) | not mentioned | `gsd-tools` JSON output over 50,000 chars is spilled to a temp file and returned as `@file:<path>` instead of inline (e.g. `history-digest`). `packages/core` must follow this indirection. | M0-G §2.6 |
| — (new) | not mentioned | `cli-skew-check` prints a shadow-install warning to **stderr** on every invocation when a project-local GSD install exists alongside a global one. Non-empty stderr from `gsd-tools` must not be treated as failure. | M0-G §2.1 |
| — (new) | not mentioned | The Herdr socket is connection-per-request (server closes after each response); only `events.subscribe`/wait-style calls stay open. The client must not be built as a multiplexed keep-alive connection. | M0-H §1.1 |
| — (new) | not mentioned | `pane.process_info.cmdline`/`argv` can contain live secrets (a captured example held an API key and a DB password). Never log or spool it; match harness identity on `foreground_processes[0].name`/`argv[0]` basename only. | M0-H §2 |
| — (new) | not mentioned | Token values over 80 chars are silently truncated by the server, not rejected. Clamp to 80 chars in `packages/core` before every `report_metadata` call. | M0-H §3.1, §4 |



### 13.1 Amendments after M4 (2026-09-16)

Recorded per §12.2 from `docs/spikes/M4-orchestration.md` and `docs/DECISIONS.md` (O1–O6).

| § | Original text (short quote) | Amended to | Source |
|---|---|---|---|
| §7.1 | four units: phase run, isolated phase run (`gsd-workspace` or worktree), plan/wave run, autonomous loop | **three** units: phase run (new pane), isolated phase run (worktree on the branch GSD itself would use), supervised autonomous run. Plan/wave runs and `gsd-workspace` isolation are dropped: waves are sequential by GSD's own gate and `/gsd-workspace --new` creates a new, unrelated project. | M4 G2–G4 |
| §7.1 | "Autonomous loop … the daemon re-prompting on `done` if the snapshot says more phases remain" | Never re-prompt a live idle session (GSD stopped it on purpose; its banner says how to resume). Only a **dead** session is re-launched, only with `autonomous.resume_on_exit = true`, within `max_resumes` / `max_wall_clock_min`, using GSD's own `--from <lowest incomplete>`. | M4 G5, O4 |
| §7.2 | run record fields | adds `repo`, `kind`, `createdPane`, `waitingFor` (`startup_input\|agent_blocked\|human_stop\|stalled`), `reason`, `sawWorking`, `resumes`, `warnings[]`, `target.worktree{path,branch,workspaceId}`; `prompts[]` and `exit` kept. Saves are serialised per run. | O3, O4 |
| §7.3 | "`orchestrate:stop` (sends `esc` twice via `agent.send_keys`, then `pane.close` after confirmation)" | Action ids use `-` (`orchestrate-stop`). Isolated runs call `worktree.remove` **first** (closing the last pane closes the workspace and orphans the checkout, H5); dirty worktrees are kept and reported unless `--discard`. Non-isolated runs close only the pane the plugin split. The dashboard asks y/N; the manifest action acts on the plugin's own pane directly. | M4 H5–H8 |
| §7.4 | "Concurrency cap `max_parallel`; new runs queue" and "Two runs may not target the same non-isolated `.planning`" | One active run per **repository**, always (STATE.md is a single-writer store; parallel phases are not modelled). `max_parallel` counts runs across different repositories. Nothing queues; a refused plan says why. | M4 G3 |
| §7.4 (new) | — | Plan-time guards: health ≠ ok, `## Needs Human` / `## Deferred Verification` / blockers, paused (only `resume-work`), roadmap complete, harness working/blocked in the project's pane; isolation additionally needs `.planning/STATE.md` tracked, `commit_docs ≠ false`, `branching_strategy ≠ milestone`, a non-reserved branch name. `use_worktrees`, `parallelization`, `mode`, `auto_advance` only warn. | O2 |
| §1.1 / §2.3.6 | `agent.start` "returns only once Herdr detects the agent interactive-ready" | It returns immediately with `launch_pending: true`; the daemon follows with one bounded `agent.wait`. A startup dialog (Claude Code folder trust) is `blocked` and the run waits for the user. | M4 H1–H3 |
| §3.1 | `config?: { parallelization, modelProfile, commitDocs }` | `GsdProjectConfig` adds `useWorktrees`, `branchingStrategy`, `phaseBranchTemplate`, `allowDefaultBranchCommits`, `autoAdvance`, `mode`; new `humanStops[]` from `## Needs Human` / `## Deferred Verification`; `gsd_status = blocked` while any exists; `ChangeKey` gains `human`. | O2 |
| §3.4 | `[orchestration]` keys | adds `harness`, `start_timeout_ms`, `split_direction`, `[orchestration.autonomous] resume_on_exit\|max_resumes\|max_wall_clock_min`; `isolation` is `worktree\|none`. | O1, O4 |
| §3.5 | control methods `orchestrate.plan\|start\|stop\|status` | plus `orchestrate.list`, `orchestrate.get`; event `run.changed`. `start` requires `confirm: true`. | — |
| §8 M4 | "Daemon restart mid-run re-attaches and re-arms waits" | re-attaches from `session.snapshot` and continues from `pane.updated` diffs (no long-lived waits exist). Verified by `verify:m4`. | O4 |
| §8 M5 | "Repo tagged `herdr-plugin`" | GitHub topic set on publish; `package.json` keywords mirror it; `verify:m5` checks the mirror and the README sections, and runs the real-Herdr e2e when a binary is present. | M5 |
| §1.1 / §13 (M0-H H2) | "Subscribe to `pane.updated` (fires on any `PaneInfo` change) and diff `agent_status` instead" | **Corrected:** live Claude Code transitions arrive only on the pane-scoped `pane.agent_status_changed {pane_id}` subscription; `pane.updated` carries a stale status. The daemon keeps a second subscription over every agent pane, rebuilt when the set changes, ignores `agent_status` from `pane.updated` for those panes, and the orchestrator waits for the stream before prompting and cross-checks `state_change_seq`. | M4 H10 |
| §3.1 / §13 (M0-G) | "Two more locks exist: `.planning/.lock` and `.planning/milestone.lock`. Widen the lock check to all three." | **Corrected:** `milestone.lock` is GSD's advisory, session-long, TTL-heartbeated phase claim (`milestone-lock.cjs`), not a write lock; reading through it is correct and treating it as a lock blanked a live workspace's tokens. Only `STATE.md.lock` and `.lock` gate reads. | O8 |
