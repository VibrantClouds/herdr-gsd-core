# M0-A — Harness hook payload / installer format verification spike

Scope: pin down hook payload schemas and installer file formats for Claude Code, Codex,
and OpenCode (spec.md §3.2 `ActivityEvent`, §5 Harness adapters), plus how a hook can
locate its Herdr pane. Claude Code 2.1.273 is installed locally; Codex is **not**
installed; OpenCode is installed (`@opencode-ai/plugin@0.15.18`, config at
`~/.config/opencode/`). Cross-checked throughout against GSD-Core's own installer
(`@opengsd/gsd-core`, npx cache `~/.npm/_npx/a78857a30883db8e/`) since it already solves
this exact multi-harness hook-installation problem in production.

Fixtures: `test/fixtures/hooks/<harness>/<event>.json`, provenance table in
`test/fixtures/hooks/README.md`. Every item below ends with a **DECISION** for spec.md.

---

## 1. Claude Code — hook event catalogue

Verified against the raw (de-styled, non-summarized) HTML of `code.claude.com/docs/en/hooks`
(fetched 2026-09-15; `docs.claude.com/en/docs/claude-code/hooks` 301-redirects there).
**Caution:** WebFetch's own AI-summary of this page independently produced one confirmed
wrong claim (it named the subagent tool `TaskCreate`); raw HTML was pulled and grepped to
get ground truth, and everything below is sourced from that raw text, not the summary.

Full event list (36 events, three cadences — per-session, per-turn, per-tool-call):
`SessionStart`, `Setup`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`,
`PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`,
`PostToolBatch`, `Notification`, `MessageDisplay`, **`SubagentStart`**, `SubagentStop`,
`TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`,
`InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`,
`WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch`,
`PostModelSwitch`, `Elicitation`, `ElicitationResult`, `SessionEnd`.

**`SubagentStart` exists** — spec.md §3.3's `gsd_workers` row assumed it did not
("Claude Code shows `?` until SubagentStart exists"). It fires "when Claude spawns a
subagent with the Agent tool, when Claude resumes a subagent, and each time an in-process
agent team teammate handles a new message." Matcher = agent type name (built-in:
`general-purpose`/`Explore`/`Plan`; custom: the agent's frontmatter `name`; plugin-scoped:
`my-plugin:reviewer`, anchor with `^...$` since the colon forces regex-path matching).

**DECISION:** spec.md §3.3/§3.5 `gsd_workers` degradation note is stale. Claude Code CAN
report exact open-subagent-span counts via `SubagentStart`+`SubagentStop` pairing, same as
Codex/OpenCode. Update §3.3 to drop the "Claude Code shows `?`" caveat and §5.5's
degradation matrix row from "inferred (Task → SubagentStop)" to "exact (SubagentStart →
SubagentStop pairing)". `TaskCreated`/`TaskCompleted` are a **separate** feature (todo/task
list tracking, e.g. for agent teams) — do not confuse with subagent spawn.

### 1.1 The subagent tool is named `Agent`, not `Task`

**Contradicts spec.md §5.1's explicit VERIFY assumption.** The docs' tool-input reference
table has a heading literally "`Agent` — Spawns a subagent" with fields:

| field | type | example |
|---|---|---|
| `prompt` | string | `"Find all API endpoints"` |
| `description` | string | `"Find API endpoints"` |
| `subagent_type` | string | `"Explore"` |
| `model` | string (optional) | `"sonnet"` |

`Task` still exists as a *different* tool family (`TaskCreate`/`TaskUpdate`, the
todo-list feature), which is presumably why spec.md's author conflated the two names.
Confirmed independently: GSD's own `hooks/hooks.json` already matches
`"Agent|Task"` on every `PreToolUse`/`PostToolUse` entry that used to say just `Task`
(hedging both names across GSD's supported Claude Code version range), and
`hooks/gsd-agent-isolation-guard.js` checks `tool_name !== 'Agent' && tool_name !== 'Task'`.

**DECISION:** spec.md §5.1 matcher must be `Bash|Edit|Write|MultiEdit|Agent|Task` (not
just `...|Task`), and `subagent.start` inference must key off `tool_name == "Agent"`
primarily, `"Task"` as a legacy/back-compat fallback. `tool_input` on that PreToolUse call
DOES carry `subagent_type`/`description`/`prompt` (answers spec's other VERIFY question) —
map `subagent_type` → `ActivityEvent.agent`.

### 1.2 Per-event stdin JSON (fields beyond the common set)

Common fields on every event (via stdin for `command` hooks, POST body for `http` hooks):
`session_id`, `prompt_id` (UUID, absent until first prompt, needs ≥2.1.196),
`transcript_path`, `cwd`, `scratchpad_dir` (needs ≥2.1.257), `permission_mode`
(`default`/`plan`/`acceptEdits`/`auto`/`dontAsk`/`bypassPermissions`), `effort.level`,
`hook_event_name`; plus `agent_id`/`agent_type` when running with `--agent` or inside a
subagent call.

| Event | Extra fields (exact, raw-HTML-verified) |
|---|---|
| `SessionStart` | `source`: `startup`\|`resume`\|`clear`\|`compact`\|`fork`. Only event that can carry `model` |
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id` |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_response`, `tool_use_id` |
| `SubagentStart` | `agent_id`, `agent_type` **only** — no `description`/`prompt` on this event (those live on the triggering `PreToolUse` Agent call, not here) |
| `SubagentStop` | `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path` (nested `subagents/` folder, distinct from top-level `transcript_path`), `last_assistant_message` |
| `Stop` | `stop_hook_active`, `last_assistant_message`, `background_tasks[]`, `session_crons[]` |
| `PreCompact` | `trigger`: `manual`\|`auto`; `custom_instructions` (the `/compact` argument text, or `null`) |
| `UserPromptSubmit` | `prompt` only |
| `Notification` | `title`, `notification_type` (large enum: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, `elicitation_url_dialog`, `elicitation_complete`, `elicitation_response`, `agent_needs_input`, `agent_completed`, `quota_auto_resume_fired`\|`stale`\|`disabled`) |

Exact fixtures for all 9 (plus 3 PreToolUse variants) at `test/fixtures/hooks/claude-code/`.

**DECISION:** the hook script (§5.1) reads `session_id`, `cwd`, `hook_event_name`,
`tool_name`, `tool_input` — spec's field list is correct; add `agent_id`/`agent_type`
too (needed for `ActivityEvent.agent` on SubagentStart/Stop, not just `tool_input.subagent_type`).

### 1.3 settings.json hooks schema

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash|Edit|Write|MultiEdit|Agent|Task",
        "hooks": [ { "type": "command", "command": "node .../hook.cjs pre", "timeout": 5 } ] }
    ]
  }
}
```

`hooks[].type` is one of 5 kinds: `command`, `http`, `mcp_tool`, `prompt`, `agent`.
**`timeout` is in seconds**, not ms (spec.md §5.1's "timeout 2 s" is already in the right
unit). Per-type defaults: 600s (`command`/`http`/`mcp_tool`), 30s (`prompt`), 60s (`agent`);
Claude Code itself lowers the default to 30s for `UserPromptSubmit`/`PreModelSwitch`/
`PostModelSwitch` and 10s for `MessageDisplay`. Other per-entry fields: `if` (one
permission-rule string to gate the hook, tool events only), `statusMessage`, `once`
(skill-frontmatter hooks only, ignored in settings files).

Malformed **individual entries** (bad permission rule, unknown hook event name) are
skipped, not fatal to the whole file — but nothing in the docs addresses whether an
**unrecognized key inside a hook-entry object** (e.g. spec.md §5.1's proposed
`"_herdr_gsd_core": "managed"` marker) is tolerated or stripped. The 2.1.273 binary
confirms Zod is bundled (`unrecognized_keys`, `.strict()`/`.passthrough()`/default-`.strip()`
all present) but doesn't let us attribute a specific `.strict()` call to the hook-entry
schema.

**Signal from GSD, with one caveat.** For Claude Code's settings.json, GSD identifies its
own managed hook entries by **substring-matching the `command` string**
(`isManagedHookCommand(h.command, {surface: 'settings-json'})`, e.g. matching
`gsd-context-monitor.js`), filtering at the individual `hooks[]` array-entry level — no
JSON marker key. Caveat: GSD isn't fully consistent — its **Cursor** `hooks.json`
installer *does* stamp a literal extra key on each entry
(`GSD_CURSOR_HOOK_MARKER = 'gsd-managed'`, checked via `entry['gsd-managed']`), so "extra
key as ownership marker" is validated GSD practice on at least one similarly-informal
schema; Claude Code's settings.json specifically just gets the more conservative
treatment. Given at least one runtime (§2, Codex) hard-rejects unknown keys, substring
matching is still the safer default to copy everywhere.

**DECISION:** drop spec.md §5.1's `"_herdr_gsd_core": "managed"` JSON-key marker. Adopt
GSD's approach instead: identify herdr-owned hook entries by a distinctive, greppable
substring in the `command` string itself (e.g. the literal path segment
`packages/adapters/claude-code/dist/hook.cjs`), matched and filtered per-`hooks[]`-entry
on uninstall, exactly like GSD's `isManagedHookCommand`. This sidesteps the
unknown-key-tolerance question entirely and is portable to Codex's stricter schema.

### 1.4 `CLAUDE_CONFIG_DIR`, env vars, subagent env

`CLAUDE_CONFIG_DIR` **is honored**: redirects `~/.claude` (settings, session history,
plugins) elsewhere; on Windows `~/.claude` means `%USERPROFILE%\.claude`. Hook scripts
inherit the parent environment plus: `CLAUDE_PROJECT_DIR` (session-start project root,
stable across worktree entry — also set for stdio MCP servers/plugin LSP servers, but note
`cwd` in the payload *does* follow into a worktree while `CLAUDE_PROJECT_DIR` stays put),
`CLAUDE_PLUGIN_ROOT` (plugin's own dir, for plugin-bundled hooks), `CLAUDE_PLUGIN_DATA`
(persistent-across-update plugin data dir), `CLAUDE_EFFORT`, `CLAUDE_CODE_REMOTE`,
`CLAUDE_CODE_BRIDGE_SESSION_ID` (≥2.1.199), `CLAUDE_PLUGIN_OPTION_<KEY>`. `OTEL_*`
exporter vars are always stripped from hook subprocess env; more can be stripped via
`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`.

**DECISION:** installer should honor `CLAUDE_CONFIG_DIR` when resolving where to write
`settings.json` (matches spec.md §5.1's "or CLAUDE_CONFIG_DIR" already — confirmed
correct). Hook scripts should prefer `${CLAUDE_PROJECT_DIR}` over `cwd` for locating
`.planning/`, since `cwd` moves into worktrees but the ActivityEvent's `cwd` field should
still record the as-seen worktree cwd per spec's own §3.2 semantics — record both if cheap.

---

## 2. Codex — **not installed**, lower-confidence findings

`developers.openai.com/codex/hooks` 308-redirects to `learn.chatgpt.com/docs/hooks`;
WebFetch's summary of that page gave event names and a generic shape but no
field-accurate stdin examples, and this spike had no live Codex install to verify against.
Ground truth instead comes from **GSD's own Codex installer code**
(`bin/install.js` + `gsd-core/bin/lib/runtime-hooks-surface.cjs`), which already ships a
production Codex hook integration:

- **Config surface: `hooks.json`, not `config.toml`.** Comment in `install.js`:
  *"Codex accepts hook config from hooks.json and config.toml. To avoid the startup
  warning for mixed representations in the same layer, GSD now stores the managed
  SessionStart hook in hooks.json and keeps config.toml for feature flags / agent
  metadata only."* Shape: `{ "hooks": { "<Event>": [ { "matcher": "...", "hooks": [
  { "type": "command", "command": "...", "commandWindows": "...", "timeout": N } ] } ] } }`
  — structurally identical to Claude Code's settings.json shape. `commandWindows` is a
  Codex-specific field Claude Code doesn't have (`HookHandlerConfig` in
  `codex-rs/config/src/hook_config.rs`; Codex dispatches `commandWindows` on Windows,
  `command` elsewhere).
- **Codex's hooks.json is strict**: a legacy top-level `{"<Event>": [...]}` shape (event
  key not nested under `"hooks"`) is rejected — GSD's code explicitly lifts any top-level
  event array into the nested `hooks` table "since Codex deny_unknown_fields rejects
  [top-level event keys]." This is a stronger unknown-key rejection posture than Claude
  Code's "skip the bad entry" behavior (§1.3) — reinforces the DECISION there to avoid
  extra marker keys anywhere in a Codex-adjacent hook entry too.
- **Self-correction**: `CODEX_EXTENDED_HOOK_EVENTS` (`SubagentStart`, `Stop`,
  `PostToolUse`, `PreToolUse`, `PermissionRequest`, `PreCompact`, `PostCompact`,
  `SubagentStop`, `UserPromptSubmit`) looks like an active registration list but the real
  call site (`install.js` ~line 12538, `#2586`) **unconditionally removes** any hooks.json
  entry for every event in it: *"every one of these events was a guaranteed silent no-op,
  since the metrics bridge file [gsd-context-monitor.js] reads is only ever written by
  Claude's own statusline hook."* **GSD currently wires up only `SessionStart`** for
  Codex. This doesn't mean the other events are fictional — GSD's own comment cites
  `codex-rs/hooks/src/schema.rs` confirming Codex's hook payload schema exists and simply
  lacks a context/token field, which is why *that specific* hook was useless there.
  herdr-gsd-core's need (tool activity + subagent spans, not context %) differs, so those
  events remain a reasonable target — with **zero live GSD precedent** to copy for them.
- **Feature gate**: `[features] hooks = true` (legacy alias `codex_hooks`, migrated
  forward). **Config root**: `$CODEX_HOME` (else `--config-dir`, else `~/.codex`) — same
  pattern as Claude's `CLAUDE_CONFIG_DIR`.
- **Version gates found in GSD source** (not the "≥0.137" spec.md guessed): `[agents.gsd-*]`
  struct tables need Codex ≥0.120.0; `[[hooks.<Event>]]` namespaced array-of-tables shape
  needs ≥0.124.0 (flat `[[hooks]]` rejected there); the `hooks` feature-flag namespace
  needs ≥0.130.0. No install of Codex was available to confirm which version first shipped
  the *hooks.json* surface itself — treat "≥0.130" as the working floor and re-verify once
  Codex is installed.

**DECISION:** adopt `~/.codex/hooks.json` (nested `{"hooks": {...}}` form) as the install
target for `SessionStart`, matching GSD's current live choice, not `config.toml`. For the
tool/subagent events herdr-gsd-core actually needs (`PreToolUse`, `PostToolUse`,
`SubagentStart`, `SubagentStop`, `Stop`) there is no current GSD precedent to copy — GSD
removed its own registration of these as a dead end for its unrelated context-monitor use
case, not because the events don't work. Register them anyway (our use case is tool
activity/subagent spans, which doesn't need a context-usage field), gated on `codex
--version` ≥ 0.130, with `adapter doctor` checking the `[features] hooks` flag is `true`.
Payload field names in `test/fixtures/hooks/codex/*.json` are speculative (Claude-schema-
by-analogy) and MUST be re-verified against a real Codex session before the adapter ships —
this, plus confirming these non-SessionStart events actually fire and carry usable fields,
is the single biggest open risk item from this spike (M0-B follow-up: install real Codex,
attach a diagnostic hook, capture one real payload per event).

---

## 3. OpenCode — plugin module shape

Verified against raw HTML of `opencode.ai/docs/plugins/` (fetched 2026-09-15) and two
independent **real, installed** plugins on this machine: GSD's own
`~/.npm/_npx/.../@opengsd/gsd-core/.opencode/plugins/gsd-core.js` (CommonJS) and Herdr's
own `~/.config/opencode/plugins/herdr-agent-state.js` (**ESM** — `import`/`export`,
despite living in a directory whose `package.json` declares no `"type"` field, i.e.
defaults to CommonJS under plain Node resolution rules). Both are loaded successfully by
the same running OpenCode instance. Installed version: `@opencode-ai/plugin@0.15.18`
(`~/.config/opencode/package.json`).

**Correction to an earlier WebFetch-summary pass in this spike**: the plugin directory is
`plugins/` (**plural**), confirmed in raw HTML at 8 separate example paths
(`~/.config/opencode/plugins/`, `.opencode/plugins/...`) and matching the live installed
layout. An initial WebFetch summary said `plugin/` (singular) — wrong, discard it.

- **Plugin directories & load order**: project `.opencode/plugins/`, global
  `~/.config/opencode/plugins/` (auto-loaded at startup, both JS and TS files); or via npm
  package name in `opencode.json`'s `"plugin": [...]` array (installed with `bun install`
  into `~/.cache/opencode/node_modules/`). Load order: global config → project config →
  global plugin dir → project plugin dir; all hooks from all sources run in sequence.
- **Module shape**: `export const Plugin = async ({ project, client, $, directory,
  worktree }) => { return { /* event handlers */ } }`. `$` is **Bun's shell API** — OpenCode
  runs on Bun, which is *why* a `.js` file can use ESM `import`/`export` regardless of an
  ambient `package.json` `"type"` field: Bun's loader sniffs module format per-file rather
  than following Node's strict resolution. **GSD's CJS `package.json` marker
  (`{"type":"commonjs"}`, via `commonjs-marker.cjs`) is not actually needed to load a
  plugin file** — it exists only because GSD's plugin *spawns hook scripts as separate
  `node <script>.js` child processes*, and those go through strict Node resolution. A
  plugin doing all its work in-process (no subprocess spawn) needs no marker — confirmed
  by Herdr's own plugin having none and using ESM freely.
- **Full event list** (raw-HTML-confirmed): `command.executed`; `file.edited`,
  `file.watcher.updated`; `installation.updated`; `lsp.client.diagnostics`, `lsp.updated`;
  `message.part.removed`, `message.part.updated`, `message.removed`, `message.updated`;
  `permission.asked`, `permission.replied`; `server.connected`; `session.created`,
  `session.compacted`, `session.deleted`, `session.diff`, `session.error`, `session.idle`,
  `session.status`, `session.updated`; `todo.updated`; `shell.env`; `tool.execute.after`,
  `tool.execute.before`; `tui.prompt.append`, `tui.command.execute`, `tui.toast.show`.
  Spec.md §5.3's `session.created`, `tool.execute.before/after`, `session.idle` subset is
  correct and sufficient for M2; no correction needed there.
- **Payload shapes actually observed in the two live plugins**:
  - `event: async ({ event })` — `event.type` (string), `event.properties` (object).
    `session.created`: `event.properties.info.{id, directory, parentID}` (note:
    `directory`, not `cwd`; `parentID` present for a child/sub-session). Other events
    carry `event.properties.sessionID` directly (no formal published schema per-event
    beyond this).
  - `tool.execute.before: async (input, output)` — **two arguments**, not one merged
    object: `input.tool` (lowercase tool name: `read`/`write`/`edit`/`bash`/`webfetch`/
    `websearch`/`task`), `output.args` (mutable tool-call arguments — GSD rewrites paths
    here, and the doc's own `.env`-protection example does
    `output.args.filePath.includes(".env")`).
  - `tool.execute.after: async (input, output)` — args have **moved to `input.args`**
    (not `output.args` as in `.before`); `output.output` (string tool result),
    `output.metadata`.
  - `shell.env: async (input, output)` — `input.cwd`; `output.env` (mutable env object to
    inject into shell executions).
  - **Blocking**: `throw new Error("reason")` from `tool.execute.before` aborts the tool
    call — confirmed identically in the official `.env`-protection doc example and in
    GSD's `handleHookResult` (`throw new Error(reason)`). There is no separate "decision"
    JSON return value like Claude Code's — a thrown error is the only block mechanism.

**DECISION:** ship `plugins/herdr-gsd-core.js` (note: correct dir name `plugins/`, plural)
as a **standalone ESM file that does its own in-process spool writing** — no subprocess
spawn needed, so no CJS marker required and no risk of colliding with GSD's own
`{"type":"commonjs"}` marker in a shared `hooks/` dir (spec.md §5.3's "do not add a second
marker" caveat becomes moot if we skip the CJS marker file entirely, since we're not
writing GSD-adjacent files at all — herdr-gsd-core ships its own single plugin file, not a
`hooks/` directory of its own). Confirmed coexistence pattern from live evidence: multiple
independently-authored plugin files (GSD's CJS, Herdr's ESM) already sit side-by-side in
the same `plugins/` directory without conflict — no additional isolation needed.

---

## 4. Fixtures

`test/fixtures/hooks/{claude-code,codex,opencode}/*.json`, one file per representative
event plus redaction-test variants (`PreToolUse.bash-bearer-secret.json` with a fake
`Authorization: Bearer sk-FAKE123`, and `PreToolUse.bash-apikey-env-prefix.json` with a
fake `API_KEY=sk-FAKE456 curl ...` leading-env-assignment form — both harnesses' Bash
variants exercise spec.md §5.4's redaction allow-list: first-3-argv-token scan with
`/(key|token|secret|password|bearer)/i` → `***`, after stripping leading `VAR=value`
assignments per Claude's own documented Bash-matching rule). Per-file provenance
(raw-HTML-verified vs. GSD-cross-checked vs. speculative-by-analogy) is in
`test/fixtures/hooks/README.md` — read that table before trusting any Codex fixture.

**DECISION:** redaction unit tests should run against all 3 harnesses' secret fixtures
with one shared regex/allow-list implementation (spec.md §5.4 doesn't distinguish by
harness, and none of the 3 adapters' `tool_input.command` shapes differ in a way that
matters to the redaction step — all put the shell command string at the same JSON path
once each adapter's translation layer normalizes `tool_name`/`tool_input`).

---

## 5. Finding the Herdr pane from inside a hook process

Confirmed **empirically**, not just from docs: this very Claude Code session is itself
running inside a Herdr pane, and `HERDR_PANE_ID` is present in its own environment and
every ancestor process up to the Herdr server itself:

```
$ env | grep -i herdr
HERDR_BIN_PATH=/home/vibrantclouds/.local/bin/herdr
HERDR_ENV=1
HERDR_PANE_ID=w3:p1
HERDR_SOCKET_PATH=/home/vibrantclouds/.config/herdr/herdr.sock
HERDR_TAB_ID=w3:t1
HERDR_WORKSPACE_ID=w3
```

Process chain, walked via `/proc/<pid>/stat` + `/proc/<pid>/environ` (own-uid processes
only — `/proc/<pid>/environ` for other users' processes is permission-denied, as expected):

```
systemd(4874, no HERDR_* — pre-launch)
  → herdr(22873, HERDR_STARTUP_CWD only — this IS the Herdr server process, no PANE_ID: it doesn't run inside its own pane)
    → zsh(121643, HERDR_ENV=1 + HERDR_PANE_ID=w3:p1 + ... — the pane shell, vars injected HERE)
      → claude(136977, inherits all HERDR_* vars — this session)
```

This matches `socket-api.mdx`/`plugins.mdx` documentation exactly: *"Herdr injects
`HERDR_SOCKET_PATH`, `HERDR_BIN_PATH`, `HERDR_ENV=1`, `HERDR_WORKSPACE_ID`,
`HERDR_TAB_ID`, and `HERDR_PANE_ID` into managed pane processes. Herdr-managed variables
are authoritative when they conflict with caller-provided env."* (`socket-api.mdx:302`).
One documented exception: a **popup** pane's process does NOT receive `HERDR_PANE_ID`
(popups have no pane ID at all — `plugins.mdx:321`, `socket-api.mdx:645`) — irrelevant to
our case since harness processes never run inside popups.

`~/.config/opencode/plugins/herdr-agent-state.js` (Herdr's own plugin) is itself proof this
is the intended, supported discovery mechanism: it gates its entire behavior on
`process.env.HERDR_ENV === "1" && HERDR_SOCKET_PATH && HERDR_PANE_ID` being present, and
uses `HERDR_SOCKET_PATH`+`HERDR_PANE_ID` directly to open a raw NDJSON socket connection
(`net.createConnection`, `\\.\pipe\<path>` prefix on win32) and call
`pane.report_agent`/`pane.report_agent_session`.

**DECISION:** spec.md §3.2's pane-mapping precedence (1) `HERDR_PANE_ID` env var is
correct and is the primary, highest-confidence path — a harness hook process that
inherits its parent shell's environment (true for all 3 harnesses: Claude Code, Codex,
and OpenCode's plugin process all run as descendants of the pane shell or the pane's own
process) will see `HERDR_PANE_ID` directly with **no extra plumbing required** — it does
not need the installer to explicitly "emit `\"$HERDR_PANE_ID\"` into the event" as §3.2
describes; the env var is already there for the reading. Keep (2) process-ancestor-pid
match and (3) cwd match as fallbacks only for the case where Herdr is not the launcher
(e.g. harness started from a bare terminal, or from inside a nested `tmux`/`screen` the
user manages themselves outside Herdr) — in that case `HERDR_PANE_ID` is simply absent
and the fallback chain applies as spec'd.

---

## Summary of contradictions found vs. spec.md

1. **§5.1**: subagent tool is `Agent`, not `Task` (spec's own explicit VERIFY item).
   `Task` still exists as a distinct todo-tracking tool family — don't conflate.
2. **§3.3/§5.5**: `SubagentStart` **exists** in Claude Code 2.1.273 — the "Claude Code
   shows `?` for `gsd_workers`" caveat is stale; exact span counting is possible.
3. **§5.1**: proposed `"_herdr_gsd_core": "managed"` marker has no confirmed safety
   guarantee; GSD mostly favors command-substring matching instead — recommend the same.
4. **§5.2**: config surface for what GSD actually writes is `hooks.json`, not
   `config.toml` — but GSD today only wires `SessionStart` there; it *removed* its own
   registration of the other 9 events (`SubagentStart`/`Stop`/`PostToolUse`/etc.) as a
   no-op for its context-monitor use case, so there is no live precedent for the
   tool/subagent events herdr-gsd-core needs. Version floor evidence points to ~0.130, not
   the guessed "≥0.137" (unconfirmed either way — Codex not installed).
5. **§5.3**: plugin directory is `plugins/` (plural) — minor, but exact-match matters for
   an installer. CJS marker concern is likely moot for a plugin that doesn't spawn Node
   subprocesses (OpenCode runs on Bun, which loads ESM `.js` files without a `"type"`
   marker).
6. **§3.2**: `HERDR_PANE_ID` precedence is confirmed correct and *simpler* than spec
   implies — it's already in the hook process's inherited environment with no adapter
   plumbing needed, for any harness launched inside a Herdr pane.
