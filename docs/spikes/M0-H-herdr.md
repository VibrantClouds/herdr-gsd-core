# M0-H — Herdr 0.9.0 socket API verification spike

Server: Herdr `0.9.0`, protocol `22`, socket `~/.config/herdr/herdr.sock`.
Live session at capture time: `w1` CharacterDossier (claude, working), `w2` SizeComparisonSite (claude, working, focused), `w3` gsd-core-herdr (claude, blocked).
Raw captures: `docs/spikes/captures/M0-H-*.json`. Method catalogue (104 methods) is in `M0-H-envelope-and-errors.json`.

Every item below ends with a **DECISION** for `spec.md`.

---

## 1. Envelope, errors, event streaming

### 1.1 Request / response envelope

```json
--> {"id":"req_0","method":"ping","params":{}}
<-- {"id":"req_0","result":{"type":"pong","version":"0.9.0","protocol":22,
     "capabilities":{"live_handoff":true,"detached_server_daemon":true,
     "endpoint_protocol_generation":1,"surface_interest":true,"health_check":true}}}
```

**The server closes the connection after it answers one request.** Pipelining a second
request on the same socket fails with `EPIPE`. Only `events.subscribe` (and the
streaming/wait methods) keep the connection open. This is not stated in `socket-api.mdx`.

Every `result` is a tagged union on `result.type` (65 variants; see
`M0-H-schema-params.json`). Void methods return `{"type":"ok"}`.

**DECISION:** the daemon's Herdr client must be *connection-per-request* plus one
long-lived subscription connection. Do not build a multiplexing client keyed on `id`.
Add to spec §2.2 (components) and §1.1.

### 1.2 Error shape

```json
{"id":"req_1","error":{"code":"not_found","message":"pane not found"}}
```

**Deserialization failures return `id: ""`, not the request id:**

```json
--> {"id":"req_1","method":"no.such_method","params":{}}
<-- {"id":"","error":{"code":"invalid_request","message":"invalid request: unknown variant `no.such_method`, expected one of `ping`, `server.stop`, ... `plugin.pane.close`"}}
```

There is no `unknown_method` code — an unknown method is `invalid_request`, and the
message enumerates every supported method (this is how the full 104-method catalogue in
the captures was obtained, and is a cheap capability probe for §2.3 principle 6).

Codes observed live (full probes in `M0-H-envelope-and-errors.json`): `invalid_request`
(unknown method / bad enum / missing field), `invalid_params` (`notification title is empty`),
`workspace_not_found`, `pane_not_found`, `tab_not_found`, `agent_not_found`,
`invalid_metadata_token` (key not `[A-Za-z0-9_-]{1,32}`), `invalid_metadata_source`
(source outside `[A-Za-z0-9:._-]{1,80}`), `invalid_metadata_ttl` (`ttl_ms` outside
`1..=86400000`), `plugin_not_found` (`agent.view.set` with `source="plugin:<id>"` for an
unlinked plugin).

In the binary/docs but not reproduced here: `agent_blocked`, `agent_not_ready`,
`agent_not_running`, `agent_not_idle`, `agent_prompt_stalled`, `agent_launch_pending`,
`agent_target_ambiguous`, `unsupported_agent_kind`, `invalid_agent_name`, `timeout`,
`ui_busy` (modal/popup busy — `plugin.pane.open` only), `platform_unsupported`,
`dirty_worktree_requires_force`, `worktree_operation_in_progress`, `not_linked_worktree`,
`confirmation_required`, `stale_content`, `not_implemented`.

> **`rate_limited` and `busy` are NOT error codes.** They are `reason` values in a
> *successful* `notification.show` response. See §3.5.

**DECISION:** spec §4.4's "respect Herdr's `rate_limited`/`busy` results" must be
implemented against `result.reason`, not `error.code`. Fix the wording in spec §1.1,
which lists them alongside `agent_blocked`/`ui_busy` as if they were error codes.

### 1.3 `events.subscribe`

```json
--> {"id":"sub_1","method":"events.subscribe","params":{"subscriptions":[
      {"type":"workspace.metadata_updated"},{"type":"pane.updated"},
      {"type":"pane.agent_status_changed","pane_id":"w2:p1"}]}}
<-- {"id":"sub_1","result":{"type":"subscription_started"}}
<-- {"event":"workspace_metadata_updated","data":{"type":"workspace_metadata_updated","workspace":{...}}}
```

- Subscribe with **dotted** names; pushed frames carry **snake_case** `event` +
  `data.type` (they duplicate each other). `EventKind` has 26 values.
- Pushed frames have **no `id`** — demultiplex on `event`, not on the request id.
- **No replay.** Lifecycle subscriptions start at accept time.
- Filtering is per-subscription-entry only. Three entry types are **pane-scoped and
  require `pane_id`**: `pane.agent_status_changed` (optional `agent_status` narrowing),
  `pane.output_matched`, `pane.scroll_changed`. Everything else takes no filter at all.
- Those three pane-scoped events use a *different* envelope
  (`subscription_event`: `{"event":"pane.agent_status_changed","data":{...}}`, dotted name).

**DECISION — this is the biggest gap vs. spec §1.1.** There is **no global
`pane.agent_status_changed` stream**. To track semantic status across the session the
daemon must either (a) subscribe per pane and re-subscribe on every `pane.created` /
`pane.moved` (pane ids are workspace-qualified and change on move), or (b) subscribe to
`pane.updated` — which fires on any `PaneInfo` change including `agent_status` and carries
the full `PaneInfo` — and diff. **(b) is recommended**: one subscription, no churn,
and it is what §4.4's blocked-notification rule actually needs. Update spec §1.1 and §4.4.

---

## 2. Live JSON shapes

Full captures: `M0-H-session-snapshot.json`, `M0-H-lists.json`, `M0-H-get-and-process-info.json`.

**`session.snapshot`** top-level keys: `version, protocol, focused_workspace_id,
focused_tab_id, focused_pane_id, workspaces[], tabs[], panes[], layouts[], agents[]`.
It is **flat** — panes are not nested under tabs/workspaces; join on ids.

**`workspace.list` / `workspace.get` entry (`WorkspaceInfo`):**

```json
{"workspace_id":"w3","number":3,"label":"gsd-core-herdr","focused":false,
 "pane_count":1,"tab_count":1,"active_tab_id":"w3:t1","agent_status":"blocked"}
```

Optional: `tokens` (≤32 keys), `worktree{repo_key, repo_name, repo_root, checkout_path,
is_linked_worktree}`. **There is no `cwd` on a workspace, anywhere in the API.**

**DECISION — contradicts spec §4.1.1** ("for each workspace, resolve `cwd`"). Derive the
workspace root from its panes: root pane `cwd`, falling back to `foreground_cwd`; for
worktree workspaces use `workspace.worktree.checkout_path`/`repo_root`, which is exact.

**`pane.list` / `pane.get` entry (`PaneInfo`):**

```json
{"pane_id":"w3:p1","terminal_id":"term_65b901fb2382d3","workspace_id":"w3","tab_id":"w3:t1",
 "focused":false,"cwd":"/home/…/gsd-core-herdr","foreground_cwd":"/home/…/gsd-core-herdr",
 "agent":"claude","terminal_title":"✳ Implement spec.md","terminal_title_stripped":"Implement spec.md",
 "agent_status":"blocked",
 "agent_session":{"source":"herdr:claude","agent":"claude","kind":"id","value":"31aa6407-…"},
 "scroll":{"offset_from_bottom":0,"max_offset_from_bottom":0,"viewport_rows":67},"revision":4}
```

Carries **yes** to all of `cwd`, `foreground_cwd`, `terminal_title`,
`terminal_title_stripped`, `tokens`, plus `title`/`display_agent`/`state_labels` (the
plugin-reported presentation fields, omitted when unset), `label`, `agent_session`.
Only `pane_id, terminal_id, workspace_id, tab_id, focused, agent_status, revision` are required.
For Claude Code, `agent_session.value` is the **Claude Code session UUID** — the same id
Claude Code uses for its transcript/session files.

**DECISION:** use `agent_session.value` (kind `id`, source `herdr:claude`) as the join key
between a Herdr pane and a GSD `ActivityEvent` from a Claude Code hook — far more reliable
than pid/cwd matching, and absent from the spec. Add to §3.2 / §4.1.3.

**`agent.list` / `agent.get` entry (`AgentInfo`):**

```json
{"terminal_id":"term_65b901fb2382d3","agent":"claude","terminal_title":"✳ Implement spec.md",
 "terminal_title_stripped":"Implement spec.md","agent_status":"blocked","agent_session":{…},
 "workspace_id":"w3","tab_id":"w3:t1","pane_id":"w3:p1","focused":false,
 "state_change_seq":91,"cwd":"…","foreground_cwd":"…","revision":4}
```

`agent_status` ∈ `idle|working|blocked|done|unknown`. `state_change_seq` is monotonic and
**shared across all agents** (observed 76 / 90 / 91). `tokens` (pane tokens) surface here too.
Other optionals: `name` (the `agent.rename` alias), `interactive_ready`, `launch_pending`,
`screen_detection_skipped`, `title`, `display_agent`, `state_labels`.
**There is no `attention` field** — `attention` exists only as an `agent.view.set` *sort* field.
`agent.get` takes `{"target":"<pane_id>|<agent name>"}`; a bare agent *kind* (`"claude"`) is
rejected with `agent_not_found`.

**DECISION:** §3.3's sort `[attention desc, …]` is valid, but the daemon cannot read
attention. Where §4.4/§6 want "needs attention", derive it from `agent_status ∈ {blocked, done}`.

**`pane.process_info`:** `{pane_id, shell_pid, foreground_process_group_id,
foreground_processes:[{pid, name, argv[], cmdline, cwd}]}`. `foreground_processes` is the
**whole process group**, including MCP server children; `name` is the 15-char comm
(`"npm exec @model"`); `cmdline`/`argv` are full and **leak secrets** (the live capture
contained an API key and a DB password — redacted in the saved capture).

**DECISION:** harness detection (§4.1.3) must match `foreground_processes[0].name` /
basename of `argv[0]` only, and the daemon must never log or spool `cmdline`. Add
`pane.process_info` output to the §5.4 redaction rules.

**`worktree.list`:** `{source:{repo_key, repo_name, repo_root, source_checkout_path,
source_workspace_id}, worktrees:[{path, branch, is_bare, is_detached, is_prunable,
is_linked_worktree, open_workspace_id, label}]}`. It is **repo-scoped**, taking
`{workspace_id | cwd}`, not global. `open_workspace_id` is null when not open.

**DECISION:** §4.1.2 must call `worktree.list` once per bound repo root, not once globally.

**`plugin.list` / `plugin.action.list` / `plugin.log.list`:** all empty here
(`{"type":"plugin_list","plugins":[]}`). `InstalledPluginInfo` = `{plugin_id, name, version,
description?, manifest_path, plugin_root, enabled, min_herdr_version, platforms?, source{…},
build[], startup[], actions[], events[], panes[], link_handlers[], warnings[]}`.

**DECISION:** §4.5's "plugin.list no longer shows it enabled" heartbeat is implementable.
Also read `warnings[]` on startup and surface it as `gsd_err` (§2.3 principle 5) — that is
where Herdr reports unknown `[[events]] on` names and missing manifest files.

---

## 3. Parameter shapes (from schema, protocol 22)

Full JSON Schema excerpts: `M0-H-schema-params.json`.

### 3.1 `pane.report_metadata` / `workspace.report_metadata`

```
pane.report_metadata      pane_id*, source*, seq?, tokens?, ttl_ms?,
                          title?, display_agent?, state_labels?{idle|working|blocked|done|unknown: str},
                          clear_title?=false, clear_display_agent?=false, clear_state_labels?=false,
                          agent?            (guard: only apply if authoritative agent label matches)
                          applies_to_source? (guard: only apply if lifecycle authority source matches)
workspace.report_metadata workspace_id*, source*, tokens* (REQUIRED here), seq?, ttl_ms?

source   ≤80 chars, [A-Za-z0-9:._-]
tokens   {"<[A-Za-z0-9_-]{1,32}>": string|null}, ≤16 keys per report, ≤32 retained per resource
ttl_ms   1..=86400000, applies to exactly the keys named in THIS report
```

**TTL is per-report (`ttl_ms`), not a per-key field inside `tokens`.** Clear a token with
JSON `null` **or** `""` (both verified live, §4). Presentation fields clear via the
`clear_*` booleans, not `null`. Guards (`agent`, `applies_to_source`) do **not** apply to
token patches — token reporters own their own clearing and TTL refresh.

**DECISION:** spec §1.1's "`tokens{}` with per-key TTL" is misleading — it is per-report.
Because §3.3's pane tokens mix TTLs (90 s for `gsd_agent`/`gsd_workers`, 15 s for
`gsd_tool`), they must be **separate `pane.report_metadata` calls** with different `ttl_ms`
and their own `seq`. Update §3.3.

### 3.2 `agent.view.set` / `agent.view.clear`

```
set:   {source*, label?, filter?, sort?:[{field, order?:"asc"|"desc"}]}
clear: {source?}  ->  {"type":"agent_view","active":false}
filter ops: all{filters[]} | any{filters[]} | not{filter} | eq{field,value} | in{field,values[]} | exists{field}
field:  status | workspace_id | tab_id | pane_id | agent | seen | state_change_seq   OR  {"token":"<name>"}
value:  string | bool | uint64 | {"context":"current_workspace_id"|"current_tab_id"}
sort:   workspace_order | tab_order | pane_order | attention | status | agent | seen | state_change_seq
        OR {"token":"<name>"}
```

**`exists` on a token field IS supported** — this answers the §1.1 VERIFY item. The exact
filter in spec §3.3 is schema-valid. Live probe:

```json
--> agent.view.set {"source":"plugin:herdr-gsd-core","label":"gsd","filter":{"op":"exists","field":{"token":"gsd_phase"}}}
<-- {"code":"plugin_not_found","message":"plugin not found"}
```

**DECISION:** a `plugin:` source is rejected until the plugin is linked and enabled, so the
positive path is untestable before M1 — but this *proves* §3.3's "must be re-applied from
`[[startup]]`". A malformed field is rejected at deserialization
(`data did not match any variant of untagged enum AgentViewField`), so a view is never
partially applied. Keep `views.enabled = false` by default as specified.

### 3.3 `agent.start` / `agent.prompt` / `agent.wait` / `agent.send_keys`

```
agent.start     {name*, kind*, pane_id*, args?: string[], timeout_ms?} -> {type:"agent_started", agent, argv[]}
agent.prompt    {target*, text*, wait?:{until?: AgentStatus[], timeout_ms?}}
agent.wait      {target*, until?: AgentStatus[], timeout_ms?}
agent.send_keys {target*, keys*: string[]}      agent.rename {target*, name?}
agent.read      {target*, source*: visible|recent|recent_unwrapped|detection, lines?, format?, strip_ansi?}
agent.explain   {target*}
```

`kind` = the supported agent identity **and** its canonical executable that Herdr launches
and then detects: `pi, claude, codex, gemini, cursor, devin, agy, cline, omp, mastracode,
opencode, copilot, kimi, kiro, droid, amp, grok, hermes, kilo, qodercli, qwen, maki, muse`.
`integration.list` returns the same target names plus install state — live, only `claude`
and `opencode` are `available:true, state:"current"`.
`name` must match `[a-z][a-z0-9_-]{0,31}` and be unique among live agents. `args` are passed
after `--`. `timeout_ms` must be `>3000` and `≤300000` (default 30 000).

**`target` is a pane id (`w1:p2`) or a live agent *name* alias — never an agent kind, never a
terminal id.** Verified: `agent.get{"target":"claude"}` → `agent_not_found`.

**`agent.start` requires an existing pane already at its shell prompt**; it never creates or
splits layout. Orchestration order is `workspace.create`/`pane.split` → `agent.start` →
`agent.prompt`. It returns only once Herdr detects the agent interactive-ready, or
`agent_not_ready` if detection reports `blocked` during startup.

`agent.prompt` returns `agent_blocked` **without sending input** if the target is already
blocked; with `wait`, if the agent was not already working and no `working|blocked` is seen
within 5 s of submission it returns `agent_prompt_stalled`. Default `until` for both
prompt-wait and `agent.wait` is `[idle, done, blocked]`; `agent.wait` returns immediately if
the status already matches. A timeout does **not** prove no input was sent.

**DECISION:** add to §7.4 — after any `agent.prompt` timeout or `agent_prompt_stalled`, the
daemon must `agent.read` before retrying, never blind-retry. §7.1's autonomous loop must use
`wait.until = ["blocked","done","idle"]`, since Claude Code settles to `idle`/`done` and
`done` only means "idle and not yet seen".

### 3.4 `notification.show`

```
{title* (≤80 after normalization), body? (≤240), sound?: none|done|request,
 position?: top-left|top-right|bottom-left|bottom-right}
-> {"type":"notification_show","shown":true,"reason":"shown"}
reason ∈ shown | disabled | rate_limited | no_foreground_client | busy
```

Live: `{"title":"GSD M0-H probe","body":"…","sound":"none"}` → `shown:true, reason:"shown"`.
`{"title":"   "}` → `error invalid_params: notification title is empty`.
`position` applies only when `ui.toast.delivery = "herdr"`.

### 3.5 Layout / worktree / pane orchestration

| method | params (`*` = required) | result |
|---|---|---|
| `workspace.create` | `cwd?, env?, label?, focus?=false, source_workspace_id?` | `workspace_created{workspace, tab, root_pane}` |
| `pane.split` | `direction*: right\|down, target_pane_id?, workspace_id?, cwd?, env?, ratio?, focus?=false, right_click?: herdr\|pane` | `pane_split{pane}` |
| `worktree.create` | `workspace_id?\|cwd?, branch?, base?, path?, label?, focus?=false, trust_repository?` | `worktree_created{workspace, tab, root_pane, worktree}` |
| `worktree.open` | `workspace_id?\|cwd?, branch?\|path?, label?, focus?, trust_repository?` | `worktree_opened{…, already_open}` |
| `worktree.remove` | `workspace_id*, force?=false, trust_repository?` | `worktree_removed{workspace_id, path, forced}` |
| `worktree.list` | `workspace_id?\|cwd?, trust_repository?` | `worktree_list{source, worktrees[]}` |
| `pane.send_text` | `pane_id*, text*` | `ok` |
| `pane.close` | `pane_id*` | `ok` |
| `pane.read` | `pane_id*, source*: visible\|recent\|recent_unwrapped\|detection, lines?, format?, strip_ansi?` | `pane_read{read}` |

`pane.split` has **no `left`/`up`** direction. `worktree.remove` is addressed by
**`workspace_id`, not by path** — only a worktree Herdr has open can be removed.

**DECISION:** §7.4's "never remove a worktree the plugin did not create" is enforceable by
storing the `workspace_id` returned by `worktree.create` in the run record (§7.2). §7.1 can
drop the `pane.split` step — `worktree.create` already returns a ready `root_pane`.
`worktree.create|remove` and `agent.prompt|wait` are handled asynchronously by the app
runtime and can return `worktree_operation_in_progress` / `stale_worktree_operation`, so
§7.4's `max_parallel` queue must serialize per repo.

---

## 4. LIVE TEST — token round-trip

Full request/response/event log: `M0-H-metadata-livetest.json`.
Target: focused workspace `w2`, focused pane `w2:p1`. Source `plugin:herdr-gsd-core`.

| # | request | response | observed state |
|---|---|---|---|
| 1 | `workspace.report_metadata {workspace_id:"w2", source:"plugin:herdr-gsd-core", seq:1, tokens:{gsd_probe:"hello"}}` | `{"type":"ok"}` | `tokens:{"gsd_probe":"hello"}` in `workspace.get`, `workspace.list`, **and** `session.snapshot.workspaces[]` |
| 2 | same `seq:1`, value `"SHOULD_BE_IGNORED"` | `{"type":"ok"}` | **unchanged** (`"hello"`) — accepted by the API, ignored by state, **no event emitted** |
| 3 | `seq:0`, value `"LOWER_SEQ"` | `{"type":"ok"}` | **unchanged** |
| 4 | `seq:2`, value `"hello2"` | `{"type":"ok"}` | `"hello2"` |
| 5 | `seq:3`, `tokens:{"bad name":"x"}` | `error invalid_metadata_token` | — |
| 6 | `seq:4`, `tokens:{gsd_long:"A"×120}` | `{"type":"ok"}` | stored **silently truncated to 80 chars** |
| 7 | `seq:5`, `tokens:{gsd_probe:null, gsd_long:null}` | `{"type":"ok"}` | `tokens` key **absent entirely** from `WorkspaceInfo` |
| 8 | `pane.report_metadata {pane_id:"w2:p1", …, seq:1, tokens:{gsd_probe:"pane-hello"}, ttl_ms:4000}` | `{"type":"ok"}` | present in `pane.get`, `pane.list` **and `agent.get`** |
| 9 | (wait 5 s) | — | token gone, `revision` bumped 6→7 |
| 10 | `seq:2` set, then `seq:3` `{gsd_probe:null}` | `{"type":"ok"}` | set, then removed |
| 11 | `seq:4` `{gsd_probe:"x"}`, `seq:5` `{gsd_probe:""}` | `{"type":"ok"}` | **empty string also clears** |
| 12 | cleanup `seq:6` null on both | `{"type":"ok"}` | workspace and pane back to no `tokens` — **session left clean** |

Events received on the concurrent `events.subscribe` connection:

```json
{"id":"sub_1","result":{"type":"subscription_started"}}
+201ms  {"event":"workspace_metadata_updated","data":{"type":"workspace_metadata_updated",
         "workspace":{"workspace_id":"w2",…,"tokens":{"gsd_probe":"hello"}}}}
+1804ms {"event":"workspace_metadata_updated", … "tokens":{"gsd_probe":"hello2"}}
+2205ms {"event":"workspace_metadata_updated", … "tokens":{"gsd_long":"AAA…(80)","gsd_probe":"hello2"}}
+2506ms {"event":"workspace_metadata_updated", … (no "tokens" key)}
+2807ms {"event":"pane_updated","data":{"type":"pane_updated","pane":{…"revision":6…}}}
+6716ms {"event":"pane_updated", … "revision":7}     <- TTL expiry
```

Findings:
1. **seq ≤ last accepted is silently ignored and returns `ok`.** No error, no event. A
   restarted daemon that resets `seq` to 1 will have *all* of its reports dropped until the
   previous high-water mark is passed — and Herdr does not expose that mark.
2. Workspace token changes emit `workspace_metadata_updated` with the full `WorkspaceInfo`.
   **Pane token changes emit `pane_updated` (full `PaneInfo`), not a metadata-specific event.**
   TTL expiry also emits `pane_updated`.
3. Both `null` and `""` clear a key. When no tokens remain, `tokens` is omitted, not `{}`.
4. Over-long values are truncated, not rejected — no error to detect it by.
5. Pane tokens are visible on `PaneInfo` **and** `AgentInfo`; workspace tokens only on `WorkspaceInfo`.
6. **`workspace.report_metadata` / `pane.report_metadata` are NOT plugin-gated** — unlike
   `agent.view.set`, they accepted `source:"plugin:herdr-gsd-core"` with no such plugin linked.

**DECISION — spec §2.3 principle 3 needs a fix.** "monotonically increasing `seq` per
(resource, source)" is not restart-safe: tokens are not restored after a server restart but
the *seq high-water mark per source* is only reset when the resource is destroyed. Use a
**wall-clock-derived seq** (`Date.now()` ms, or `Date.now()*1000 + counter`) persisted in
`seq.json`, which is monotonic across daemon restarts by construction. Also record the
32-distinct-sources-per-resource lifetime cap: use exactly **one** source string for the
whole plugin, never `plugin:<id>:<subsystem>`.
**Also:** clamp all token values to 80 chars in `packages/core` before reporting, since the
server truncates silently (§3.3's `gsd_next` = `verify-work 3` is fine, but a project name
in `gsd_phase` is not).

---

## 5. Event catalogue

`EventKind` (26 values, snake_case on the wire; dotted in `events.subscribe` and plugin
`[[events]] on`). Full payload schemas: `M0-H-events-catalogue.json`.

| event | payload fields |
|---|---|
| `workspace_created` / `workspace_updated` / `workspace_metadata_updated` | `workspace: WorkspaceInfo` |
| `workspace_closed` | `workspace_id`, `workspace?` (final snapshot) |
| `workspace_renamed` | `workspace_id`, `label` |
| `workspace_moved` | `workspace_id`, `insert_index`, `workspaces[]` |
| `workspace_reordered` | `workspace_ids[]`, `before_workspace_id?`, `workspaces[]` |
| `workspace_focused` | `workspace_id` |
| `worktree_created` | `workspace: WorkspaceInfo`, `worktree: WorktreeInfo` |
| `worktree_opened` | `workspace`, `worktree`, `already_open` |
| `worktree_removed` | `workspace_id`, `worktree`, `forced`, `workspace?` |
| `tab_created` | `tab: TabInfo` |
| `tab_closed` | `tab_id`, `workspace_id` |
| `tab_renamed` | `tab_id`, `workspace_id`, `label` |
| `tab_moved` | `tab_id`, `workspace_id`, `insert_index`, `tabs[]` |
| `tab_focused` | `tab_id`, `workspace_id` |
| `pane_created` / `pane_updated` | `pane: PaneInfo` |
| `pane_closed` / `pane_exited` / `pane_focused` | `pane_id`, `workspace_id` |
| `pane_moved` | `pane: PaneInfo`, `previous_pane_id`, `previous_tab_id`, `previous_workspace_id`, `closed_tab_id?`, `closed_workspace_id?`, `created_tab?`, `created_workspace?` |
| `pane_output_changed` | `pane_id`, `workspace_id`, `revision` |
| `pane_agent_detected` | `pane_id`, `workspace_id`, `agent?`, `final_status?`, `released?` |
| `pane_agent_status_changed` | `pane_id`, `workspace_id`, `agent_status`, `agent?`, `title?`, `display_agent?`, `state_labels?` |
| `layout_updated` | `layout: PaneLayoutSnapshot` |

Notes:
- **`pane_output_changed` exists in `EventKind` but has no `events.subscribe` entry.**
  It is reachable only via `events.wait` and plugin `[[events]] on = "pane.output_changed"`.
- There are **no plugin-lifecycle events** (`plugin.enabled/disabled/unlinked`). §4.5's
  30 s `plugin.list` heartbeat is therefore mandatory, not a fallback.
- `workspace.metadata_updated` is documented as **not** invoking plugin event hooks
  (prevents a token-report feedback loop).
- `events.wait` (one-shot) accepts a narrower `EventMatch` set with per-event filters:
  `workspace_updated/closed/renamed/moved/focused(workspace_id)`, `tab_*(tab_id)`,
  `pane_closed/focused/moved/exited(pane_id)`, `pane_output_changed(pane_id, min_revision?)`,
  `pane_agent_detected(pane_id, agent?)`, `pane_agent_status_changed(pane_id, agent_status)`,
  plus `workspace_created(workspace_id?)`, `tab_created`, `pane_created`.

**DECISION:** §4.1's trigger list ("`workspace.created|updated|closed` / `worktree.*`") is
correct but incomplete — add `pane.created`, `pane.updated`, `pane.closed`, `pane.moved`
(pane ids are re-keyed by a move) and `workspace.renamed`.

---

## 6. Plugin manifest `[[events]] on`

`plugins.mdx` documents one example (`on = "worktree.created"`) and no valid-name list;
`PluginManifestEventHook` is `{on: string, command: string[], platforms?: []}` with `on`
untyped. The Herdr binary's string table contains exactly one contiguous dotted-name table,
matching `EventKind` 1:1 (26 entries, followed by an `unknown` fallback variant):

```
workspace.created workspace.updated workspace.metadata_updated workspace.closed
workspace.renamed workspace.moved workspace.reordered workspace.focused
worktree.created worktree.opened worktree.removed
tab.created tab.closed tab.renamed tab.moved tab.focused
pane.created pane.closed pane.updated pane.focused pane.moved pane.output_changed
pane.exited pane.agent_detected pane.agent_status_changed layout.updated
```

An unrecognized `on` deserializes to `unknown` and is **non-fatal**:
`InstalledPluginInfo.warnings` is documented as *"Warnings collected at link time or on
registry load (e.g. unknown event names, missing manifest file). Non-fatal — the entry is
kept and surfaced by `plugin.list`."*

`HERDR_PLUGIN_EVENT_JSON` is **not documented**. Event hooks get `HERDR_PLUGIN_EVENT` plus
`HERDR_PLUGIN_EVENT_JSON`; startup hooks get `HERDR_PLUGIN_EVENT=startup` and no JSON. The
only serialized event shape in the API is `EventEnvelope = {event: EventKind, data: EventData}`,
so that is the near-certain payload.

**DECISION:** parse `HERDR_PLUGIN_EVENT_JSON` defensively as `{event, data}` and fall back
to a full `session.snapshot` resync when it cannot be read. Verify empirically in M1 by
linking the plugin and reading `plugin.list[].warnings`; that check belongs in
`npm run verify:m1`. Prefer the daemon's long-lived `events.subscribe` connection over
`[[events]]` hooks for anything hot — each hook is a process spawn and the binary has a
`plugin_command_limit_reached` error.

---

## 7. Agent detection, status semantics, "integration"

Status enum: `idle | working | blocked | done | unknown`.

- `idle` and `done` **both** mean ready for input. `done` = idle **and not yet seen**;
  `pane focus` / `agent focus` mark seen, reads do not. Each TUI client tracks "seen"
  independently, so a client's Done badge can differ from `agent.list`.
- `blocked` = Herdr matched a *visible* approval/question/permission UI in the bottom-buffer
  screen snapshot. Detection is deliberately strict: an unrecognized prompt falls back to
  `idle` with reason `default_known_agent_idle_fallback`.
- `unknown` = an agent is present but unclassifiable. **It does not mean done.**

"Integration" has two distinct roles (`agents.mdx`):

| role | meaning | agents |
|---|---|---|
| **state and session** | complete lifecycle hooks; the integration becomes the sole status authority and Herdr **disables screen detection** for that pane (`screen_detection_skipped`) | Pi, OMP, Kimi, OpenCode, Kilo, MastraCode |
| **session** only | native session identity for restore, **not** lifecycle; Herdr still screen-detects | **Claude Code, Codex**, Copilot, Devin, Cursor, Droid, Grok, Hermes, Qoder, Qwen, Antigravity |

Live `integration.list`: `claude` and `opencode` `available:true, state:"current"`; the other
15 targets `not_installed`.

**DECISION — refines spec §1.1's last bullet, which is right but understates the cost.** For
**Claude Code and Codex, `agent_status` is screen-scraped, always** — even with the official
integration installed, which only supplies `agent_session`. Consequences:
- §4.4's `blocked` rule inherits the strict-blocked false negative: a GSD "waiting for UAT"
  prompt Herdr's manifest does not recognize shows as `idle` and no notification fires. **Do
  not make `blocked` the only trigger** — gate the §4.4 notification on the filesystem
  snapshot (`gsd_status`, new `*-UAT.md`) and use `agent_status == blocked` only as
  corroboration. Update §4.4 and the §5.5 degradation matrix.
- §2.3 principle 1 remains sound. `agent.explain {target}` is the supported way to debug a
  wrong state — add it to `herdr-gsd adapter doctor` (§5).
- OpenCode is the only harness in the GSD matrix that gives Herdr true semantic state.

---

## Open items for M1

- Positive `agent.view.set` path is untested (`plugin_not_found` until linked) — first
  `verify:m1` check.
- `HERDR_PLUGIN_EVENT_JSON` shape unconfirmed — capture one at link time.
- `rate_limited` / `busy` notification reasons not reproduced (would need to spam the user).
- `agent.start` / `agent.prompt` / `pane.split` / `worktree.*` not exercised (live user
  session); M4 must spike these in a scratch session (`herdr --session gsd-spike`).
