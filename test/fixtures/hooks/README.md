# Hook/plugin payload fixtures

Captured for the M0-A verification spike (2026-09-15). See `docs/spikes/M0-A-hooks.md`
for full findings and decisions. None of these are *recorded* payloads (no live
harness session was instrumented to capture real stdin) — provenance is per-file below.
Where a row says "verified against raw docs HTML", that means the fixture was checked
against the plaintext-extracted, non-summarized `code.claude.com`/`opencode.ai` page
content (fetched 2026-09-15), not just a WebFetch AI summary of it — WebFetch's summarizer
model produced at least one confirmed-wrong claim during this spike (it named the
subagent-launching tool `TaskCreate`; the raw HTML shows the tool is named `Agent`), so
raw-HTML cross-checks are called out explicitly as the higher-confidence tier.

| File | Provenance |
|---|---|
| `claude-code/SessionStart.json` | verified against raw docs HTML (code.claude.com/docs/en/hooks); `source` enum (`startup`/`resume`/`clear`/`compact`/`fork`) confirmed |
| `claude-code/PreToolUse.bash-bearer-secret.json` | verified against raw docs HTML (exact example, same field names); `tool_input.command` shape also confirmed live in `hooks/gsd-secret-read-guard.js`; secret value is synthetic (`sk-FAKE123`) |
| `claude-code/PreToolUse.bash-apikey-env-prefix.json` | same as above; synthetic `API_KEY=sk-FAKE456` env-prefix form for redaction-regex testing (redaction spec strips leading `VAR=value` assignments before matching per §5.4 and per Claude's own `if`-pattern Bash-matching rule) |
| `claude-code/PreToolUse.agent-spawn.json` | verified against raw docs HTML: the subagent-spawning tool is named **`Agent`**, not `Task` (contradicts spec.md §5.1's assumption). `tool_input` fields `prompt`/`description`/`subagent_type`/`model` confirmed in the docs' own "Agent" tool-input table. Also cross-checked live: GSD's `hooks/hooks.json` already matches `"Agent\|Task"` in its PreToolUse/PostToolUse matchers (hedging both names) |
| `claude-code/PostToolUse.json` | verified against raw docs HTML for common fields; `tool_response` shape is illustrative (docs don't give a fixed schema for this since it's tool-specific) |
| `claude-code/SubagentStart.json` | verified against raw docs HTML **exact example**: fields are only `agent_id` + `agent_type` (no `description`/`prompt` on this event — those live on the *triggering* `PreToolUse` Agent-tool call, not on `SubagentStart` itself). `SubagentStart` existence also confirmed in the installed 2.1.273 binary strings (`executeSubagentStartHooks`) |
| `claude-code/SubagentStop.json` | verified against raw docs HTML: fields are `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path` (subagent's own nested transcript, distinct from the main `transcript_path`), `last_assistant_message` |
| `claude-code/Stop.json` | verified against raw docs HTML; docs also document optional `background_tasks`/`session_crons` arrays and `stop_hook_active`, omitted here as not needed for the spool writer |
| `claude-code/PreCompact.json` | verified against raw docs HTML **exact example**: `trigger` (`manual`/`auto`) + `custom_instructions` (`null` for `auto`, or the `/compact` argument text for `manual`) |
| `claude-code/UserPromptSubmit.json` | verified against raw docs HTML; fields are `prompt` only (no `custom_instructions` — that field belongs to `PreCompact`, corrected from an earlier draft of this fixture) |
| `claude-code/Notification.json` | verified against raw docs HTML example (`title`, `notification_type: "permission_prompt"`); `notification_type` has a large enum (`idle_prompt`, `auth_success`, `elicitation_*`, `agent_needs_input`, `agent_completed`, `quota_auto_resume_*`) — see spike doc |
| `codex/*.json` | **speculative** — Codex is not installed in this environment and no official per-event JSON field schema was found even via raw HTML (the docs redirect landed on `learn.chatgpt.com/docs/hooks`, whose WebFetch summary gave event names and a generic shape but no field-accurate examples). Event *names* are corroborated by `@opengsd/gsd-core`'s `CODEX_EXTENDED_HOOK_EVENTS` list (`SubagentStart`, `Stop`, `PostToolUse`, `PreToolUse`, `PermissionRequest`, `PreCompact`, `PostCompact`, `SubagentStop`, `UserPromptSubmit`, plus a dedicated `SessionStart` path) — a materially larger set than spec.md §5.2 assumed. Payload *field names* here are constructed by analogy to Claude Code's schema, which is GSD's own design assumption (GSD routes Codex hooks through the same `gsd-context-monitor.js` script Claude Code uses), not a confirmed Codex fact. Treat every field in `codex/*.json` as UNVERIFIED until checked against a real Codex install |
| `opencode/session.*.json` | event *names* recorded from real code and verified against raw docs HTML (opencode.ai/docs/plugins/, fetched 2026-09-15): full event list confirmed present there (`session.created`, `session.compacted`, `session.deleted`, `session.diff`, `session.error`, `session.idle`, `session.status`, `session.updated`, plus non-session events `command.executed`, `file.edited`, `file.watcher.updated`, `installation.updated`, `lsp.*`, `message.*`, `permission.asked`/`replied`, `server.connected`, `todo.updated`, `shell.env`, `tool.execute.before`/`after`, `tui.*`). `session.created`'s `properties.info.{id,directory}` shape confirmed live in GSD's `.opencode/plugins/gsd-core.js` (`event.properties?.info`, `info.directory`) and Herdr's own `~/.config/opencode/plugins/herdr-agent-state.js` (`info.id`, `info.parentID`). Other events' exact `properties` sub-fields beyond `sessionID` are UNVERIFIED (no formal per-event schema is published) |
| `opencode/tool.execute.before.*.json` / `tool.execute.after.json` | handler names and the two-argument `(input, output)` shape confirmed live in both installed plugins (`input.tool` lowercase name, `input.sessionID`/`callID`, `output.args`, `output.output`/`metadata`). This fixture flattens `input`+`output` into one JSON object for portability; a real handler receives them as two separate arguments — see spike doc §OpenCode for the exact signature |

Synthetic secrets used for redaction-regex tests (`sk-FAKE123`, `sk-FAKE456`) are
not real credentials.
