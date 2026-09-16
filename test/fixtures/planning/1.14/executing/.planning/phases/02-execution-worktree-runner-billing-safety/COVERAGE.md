# API Coverage — Claude Code CLI (headless surface) + MCP server surface

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

**Why a matrix and not a no-integration declaration.** The deterministic detector fired on this phase's
scope with signals `{verb:"wire", noun:"api"}` and `{verb:"integration", noun:"mcp"}`. Re-reading the phase
scope confirms both are real. Fleet's integration boundary is the **`claude` CLI invoked as a child process**
— not an HTTP API, but a genuine external contract with an enumerable capability surface (its flag set and
its `stream-json` event schema), against which this phase makes a real per-capability integrate/opt-out
decision in almost every case (D-01, D-03, D-09, D-10, D-11, D-12, D-15, D-16, D-32, D-34, D-36, D-37). The
**MCP server surface** (`--mcp-config` / `--strict-mcp-config` / `mcp__<server>__*` tool globs) is a second,
independent integration boundary introduced by AGENT-01…06. Declaring "no external API integration" here
would be dismissive of two surfaces the phase demonstrably integrates against.

Capability list sourced from `./.claude/CLAUDE.md` § A1 (the VERIFIED flag table) and § A2 (the
`stream-json` event schema), plus the MCP flags added by AGENT-02/D-34. Rows marked UNVERIFIED in § A1 are
not enumerated as capabilities — an unconfirmed flag is not a surface to decide about.

## Claude Code CLI — headless invocation surface

| capability | decision | reason |
|---|---|---|
| `-p` / `--print` | INTEGRATE | |
| `--output-format stream-json` | INTEGRATE | |
| `--verbose` | INTEGRATE | |
| `--input-format` | OPT-OUT | worker stdin is `ignore`; the prompt travels in argv, and Fleet never streams input into a session |
| `--allowedTools` | INTEGRATE | |
| `--disallowedTools` | INTEGRATE | |
| `--permission-mode` | INTEGRATE | |
| `--dangerously-skip-permissions` | OPT-OUT | equivalent to `bypassPermissions`, which D-09 rejects — it discards the safety the flag exists for |
| `--max-turns` | INTEGRATE | |
| `--max-budget-usd` | OPT-OUT | a dollar cap is meaningless under subscription-only billing; the scarce resource is the plan window, not dollars (REQUIREMENTS.md "Out of Scope") |
| `--resume` | INTEGRATE | |
| `--fork-session` | INTEGRATE | |
| `--continue` / `-c` | OPT-OUT | "most recent conversation in cwd" is ambiguous across Fleet's many worktrees; `--resume` with a stored session id is the deterministic form of the same capability |
| `--model` | INTEGRATE | |
| `--settings` (inline JSON) | INTEGRATE | |
| `--setting-sources` | INTEGRATE | |
| `--append-system-prompt` | OPT-OUT | no Fleet-side system-prompt policy exists in v1; adding one now would be an unreviewed instruction channel into every worker |
| `--add-dir` | OPT-OUT | scoped to Phase 3 (XPROJ-03, multi-repo references) — deliberately not a Phase 2 capability |
| `--include-partial-messages` | OPT-OUT | token-level deltas add volume without adding a state signal; stdout is observability only (D-14, RUN-05) |
| `--bare` | OPT-OUT | prohibited outright by D-03 — bare mode skips OAuth/keychain reads and authenticates only via `ANTHROPIC_API_KEY`/`apiKeyHelper`, which is the API-billing path this project exists to avoid |
| `--session-id` | OPT-OUT | Fleet's correlation key is its own task id in the hook URL (ARCHITECTURE.md §5); minting the session id Fleet-side would invite correlating on it, the anti-pattern §5 names |
| `--json-schema` | OPT-OUT | no structured-output contract in v1; the terminal `result` line already carries every field Fleet reads |
| `--include-hook-events` | OPT-OUT | D-15 — adopting it in Phase 2 would create a second source for transitions that hooks own in Phase 4 |
| `--forward-subagent-text` | OPT-OUT | subagent text is volume without a lifecycle signal; only `tool_use`/`tool_result` forwarding matters and that is already the default |
| `--plugin-dir` | OPT-OUT | D-37's pre-authorized contingency, not yet adopted — becomes INTEGRATE only if plan `02-18`'s capability gate finds skills absent under the pinned settings-source value |
| `--agents` | OPT-OUT | D-37's second ordered fallback, behind `--plugin-dir`; not adopted |
| `claude auth status` (subcommand) | INTEGRATE | |
| `claude --help` (permission-mode choice parse) | INTEGRATE | |
| `claude --version` | INTEGRATE | |

## `stream-json` event surface (§ A2)

| capability | decision | reason |
|---|---|---|
| `system` / `init` (incl. `apiKeySource`) | INTEGRATE | |
| `result` (terminal: `num_turns`, `subtype`, `session_id`) | INTEGRATE | |
| `system` / `api_retry` | INTEGRATE | |
| `rate_limit_event` (undocumented, observed by SPIKE-04) | INTEGRATE | |
| `assistant` / `user` | OPT-OUT | broadcast to the in-process bus but never persisted or interpreted — stdout is never the state-transition source (RUN-05, D-14) |
| `stream_event` (token deltas) | OPT-OUT | requires `--include-partial-messages`, which is opted out above |
| `system` / `plugin_install` | OPT-OUT | Fleet installs no plugins; a session that emits this is running configuration Fleet did not author |
| `hook_started` / `hook_progress` / `hook_response` | OPT-OUT | hook-driven status is Phase 4 (HOOK-01…09); these arrive with a configured `SessionStart`/`Setup` hook Fleet does not yet set |
| unknown / future `type` values | INTEGRATE | tolerated as forward-compatible no-ops rather than thrown on (D-14) — the CLI's stream-json schema is not a stable contract, and `rate_limit_event` already broke SDK consumers that assumed otherwise |

## MCP server surface

| capability | decision | reason |
|---|---|---|
| `--mcp-config` (inline JSON) | INTEGRATE | |
| `--strict-mcp-config` | INTEGRATE | |
| `mcp__<server>__*` tool globs in `--allowedTools` | INTEGRATE | |
| MCP server definitions authored in a registered repo's `.fleet.yml` | OPT-OUT | D-35/AGENT-03 — an MCP stdio definition is a `command:` to execute, and `.fleet.yml` is git-tracked content from repos Fleet does not own; a repo may only NAME a Fleet-side profile |
| `.mcp.json` written into the worktree | OPT-OUT | D-34 — repo-visible state Fleet would have to clean up, and discoverable by the agent it is meant to constrain; inline `--mcp-config` delivers the same set with neither drawback |
| ambient/inherited MCP configuration (user, project, or local scope) | OPT-OUT | `--strict-mcp-config` exists precisely to ignore these; admitting them would make the server set non-deterministic |
| MCP server health/status introspection beyond the `system/init` `mcp_servers` array | OPT-OUT | not needed yet — `system/init` already reports the resolved set and its status, which is what plan `02-18`'s gate reads |

---

_Baseline note: this is Fleet's FIRST integration against the Claude Code CLI. A second integration
against the same need (e.g. a container-backed runner, EXEC-01) starts from the same full-coverage
baseline as this one — the opt-outs above are not inherited silently._
