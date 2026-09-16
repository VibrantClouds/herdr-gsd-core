# Phase 1 Spike Findings

**Last updated:** 2026-07-26T16:14:44.742Z
**Most recently observed against:** `claude --version` = 2.1.220 (Claude Code)

This document is generated, never hand-maintained (D-09). Each section states plainly whether its answer was empirically observed in a run against the stated `claude --version`, or is inferred and unconfirmed (D-12, SPIKE-05).

---
<!-- gsd:spike-section:SPIKE-01 -->
## SPIKE-01

**Question:** How does `claude` signal a Claude subscription plan usage-limit hit?

**Confidence:** Detected but **unconfirmed** — inferred, not reproduced under a genuine encounter

**Observed against:** `claude --version` = 2.1.220 (Claude Code), at 2026-07-26T16:14:44.741Z

**Answer:**

SPIKE-01 is **detected but unconfirmed** — Phase 2 must not inherit this as settled.

D-10 is explicit: forcing a real plan-window exhaustion to observe this signal would burn the exact resource this project exists to conserve, so Phase 1 ships a detector plus an evidence trap instead of a verified fact.

`src/runner/rate-limit.ts` (promoted into production by plan 02-06) implements `classifyStreamEvent`/`classifyRun`, combining all four SAFE-05 candidate signals against the documented shapes in .claude/CLAUDE.md § A2/A5 (non-zero exit code; a `result` event with a non-`success` subtype; a `rate_limit`/`rate_limit_warning` classification on `system/api_retry` or `rate_limit_event` lines; a stderr substring match on limit wording as a last-resort fallback), biased toward suspicion on any single hit. This is unit-tested against hand-constructed fixtures (`src/spikes/fixtures/stream-events.ts`) — testable without the real CLI, since the documented shapes are known even though a genuine limit hit has not been observed.

`src/runner/evidence-trap.ts` (promoted into production by plan 02-06) — its `captureEvidence` — writes the complete, unredacted raw stdout/stderr buffers plus the version string to `<FLEET_HOME>/spike-evidence/` on any suspected limit, so the next genuine encounter — in real Phase 2+ use — captures ground truth for free instead of requiring a second deliberate run.

**Do not** treat this section, or the classifier it describes, as verified runtime behavior.

<!-- /gsd:spike-section:SPIKE-01 -->

---

<!-- gsd:spike-section:SPIKE-02 -->
## SPIKE-02

**Question:** What are the valid `--permission-mode` values accepted by the installed CLI?

**Confidence:** Empirically **observed** in this run

**Observed against:** `claude --version` = 2.1.220 (Claude Code), at 2026-07-26T16:14:38.074Z

**Answer:**

`--help` choices list: ["acceptEdits","auto","bypassPermissions","manual","dontAsk","plan"]

Matches known-good snapshot (["acceptEdits","auto","bypassPermissions","manual","dontAsk","plan"]): YES

Invalid-value rejection did not itself enumerate a choices list (exit code 1); the --help signal is the authoritative one for this run.

The literal string `"default"` is NOT among the accepted values — omitting the flag entirely is what "default" means, per CLAUDE.md § A1 vs the live --help output.

<details><summary>Raw evidence</summary>

```
--help (excerpt):
   "stream-json")
  --permission-mode <mode>              Permission mode to use for the session
                                        (choices: "acceptEdits", "auto",
                                        "bypassPermissions", "manual",
                                        "dontAsk", "plan")
  --plugin-dir <path

Invalid-value stderr:
error: option '--permission-mode <mode>' argument 'fleet-probe-invalid-value' is invalid. Allowed choices are acceptEdits, auto, bypassPermissions, manual, dontAsk, plan.

```

</details>

<!-- /gsd:spike-section:SPIKE-02 -->

---

<!-- gsd:spike-section:SPIKE-03 -->
## SPIKE-03

**Question:** Does a git-tracked .claude/settings.json scope to the worktree whose tree contains it, and does --settings inline JSON override it per invocation?

**Confidence:** Empirically **observed** in this run

**Observed against:** `claude --version` = 2.1.220 (Claude Code), at 2026-07-26T16:14:35.009Z

**Answer:**

Worktree A (tree contains .claude/settings.json with model=claude-haiku-4-5): observed system/init model = "claude-haiku-4-5"
Worktree B (tree does NOT contain .claude/settings.json — checked out from the pre-settings commit on its own branch): observed system/init model = "claude-opus-5[1m]"
Worktree A + inline --settings '{"model":"claude-opus-4-1"}': observed system/init model = "claude-opus-5"

Git-tracked settings.json scopes per-worktree (by tree content, not main-checkout resolution): YES
Inline --settings JSON overrides the committed settings.json for that invocation: YES

This confirms the git-tracked-settings.json half; CLAUDE.md § A3 (official docs) already establishes the separate .claude/settings.local.json half (gitignored, resolves through a worktree to the main checkout) — not re-verified here.

<details><summary>Raw evidence</summary>

```
Worktree A stdout (first 2000 chars):
{"type":"system","subtype":"init","cwd":"/tmp/fleet-spike-scratch-wK7mA4","session_id":"aa7a7d87-d444-43be-b2d7-bd435a7dfd16","tools":["Task","Bash","CronCreate","CronDelete","CronList","DesignSync","Edit","EnterWorktree","ExitWorktree","Monitor","NotebookEdit","PushNotification","Read","RemoteTrigger","ReportFindings","ScheduleWakeup","SendMessage","Skill","TaskCreate","TaskGet","TaskList","TaskOutput","TaskStop","TaskUpdate","ToolSearch","WebFetch","WebSearch","Workflow","Write"],"mcp_servers":[{"name":"postgres","status":"pending"},{"name":"tavily-remote-mcp","status":"pending"}],"model":"claude-haiku-4-5","permissionMode":"plan","slash_commands":["adr","api-contract","bootstrap-arch","build-init","catchup","create-readme","create-slides","debugging","design","dotnet","icoms","image-generating","init-project","managing-skills","memory-mgmt","migrate-helm","newrelic-dashboard","refactor","reflecting-on-session","review","review-pr","rfc-writing","roadmap-generating","service-map","software-requirements","spec-eval","spec-implement","suggest","tdd","team-build","tech-researching","test-orchestrating","understand","validate-build","create_readme","create_slides","migrate_helm","deep-research","design-sync","dataviz","update-config","verify","debug","code-review","simplify","batch","fewer-permission-prompts","doctor","loop","schedule","claude-api","run","run-skill-generator","agents","clear","color","compact","config","context","effort","fast","heapdump","init","mcp","model","__remote-workflow","workflow-launch-exec","reload-skills","rename","ultrareview","security-review","usage-credits","extra-usage","usage","insights","recap","goal","design-consent","design-revoke","team-onboarding"],"apiKeySource":"none","claude_code_version":"2.1.220","output_style":"default","agents":["claude","Explore","general-purpose","Plan","statusline-setup"],"skills":["adr","api-contract","bootstrap-arch","build-init","catchup","create-readme","create-slides","debugging","design","dotnet"

Worktree B stdout (first 2000 chars):
{"type":"system","subtype":"init","cwd":"/tmp/fleet-spike-worktree-b-DcmrEG/worktree-b","session_id":"3f03be23-212e-4b7a-b566-d18c7a1cf2a3","tools":["Task","Bash","CronCreate","CronDelete","CronList","DesignSync","Edit","EnterWorktree","ExitWorktree","Monitor","NotebookEdit","PushNotification","Read","RemoteTrigger","ReportFindings","ScheduleWakeup","SendMessage","Skill","TaskCreate","TaskGet","TaskList","TaskOutput","TaskStop","TaskUpdate","ToolSearch","WebFetch","WebSearch","Workflow","Write"],"mcp_servers":[{"name":"postgres","status":"pending"},{"name":"tavily-remote-mcp","status":"pending"}],"model":"claude-opus-5[1m]","permissionMode":"plan","slash_commands":["adr","api-contract","bootstrap-arch","build-init","catchup","create-readme","create-slides","debugging","design","dotnet","icoms","image-generating","init-project","managing-skills","memory-mgmt","migrate-helm","newrelic-dashboard","refactor","reflecting-on-session","review","review-pr","rfc-writing","roadmap-generating","service-map","software-requirements","spec-eval","spec-implement","suggest","tdd","team-build","tech-researching","test-orchestrating","understand","validate-build","create_readme","create_slides","migrate_helm","deep-research","design-sync","dataviz","update-config","verify","debug","code-review","simplify","batch","fewer-permission-prompts","doctor","loop","schedule","claude-api","run","run-skill-generator","agents","clear","color","compact","config","context","effort","fast","heapdump","init","mcp","model","__remote-workflow","workflow-launch-exec","reload-skills","rename","ultrareview","security-review","usage-credits","extra-usage","usage","insights","recap","goal","design-consent","design-revoke","team-onboarding"],"apiKeySource":"none","claude_code_version":"2.1.220","output_style":"default","agents":["claude","Explore","general-purpose","Plan","statusline-setup"],"skills":["adr","api-contract","bootstrap-arch","build-init","catchup","create-readme","create-slides","debugging","d

Inline-override stdout (first 2000 chars):
{"type":"system","subtype":"init","cwd":"/tmp/fleet-spike-scratch-wK7mA4","session_id":"11a7468d-0d6e-4474-bcf4-aab04c3d9e0c","tools":["Task","Bash","CronCreate","CronDelete","CronList","DesignSync","Edit","EnterWorktree","ExitWorktree","Monitor","NotebookEdit","PushNotification","Read","RemoteTrigger","ReportFindings","ScheduleWakeup","SendMessage","Skill","TaskCreate","TaskGet","TaskList","TaskOutput","TaskStop","TaskUpdate","ToolSearch","WebFetch","WebSearch","Workflow","Write"],"mcp_servers":[{"name":"postgres","status":"pending"},{"name":"tavily-remote-mcp","status":"pending"}],"model":"claude-opus-5","permissionMode":"plan","slash_commands":["adr","api-contract","bootstrap-arch","build-init","catchup","create-readme","create-slides","debugging","design","dotnet","icoms","image-generating","init-project","managing-skills","memory-mgmt","migrate-helm","newrelic-dashboard","refactor","reflecting-on-session","review","review-pr","rfc-writing","roadmap-generating","service-map","software-requirements","spec-eval","spec-implement","suggest","tdd","team-build","tech-researching","test-orchestrating","understand","validate-build","create_readme","create_slides","migrate_helm","deep-research","design-sync","dataviz","update-config","verify","debug","code-review","simplify","batch","fewer-permission-prompts","doctor","loop","schedule","claude-api","run","run-skill-generator","agents","clear","color","compact","config","context","effort","fast","heapdump","init","mcp","model","__remote-workflow","workflow-launch-exec","reload-skills","rename","ultrareview","security-review","usage-credits","extra-usage","usage","insights","recap","goal","design-consent","design-revoke","team-onboarding"],"apiKeySource":"none","claude_code_version":"2.1.220","output_style":"default","agents":["claude","Explore","general-purpose","Plan","statusline-setup"],"skills":["adr","api-contract","bootstrap-arch","build-init","catchup","create-readme","create-slides","debugging","design","dotnet","i
```

</details>

<!-- /gsd:spike-section:SPIKE-03 -->

---

<!-- gsd:spike-section:SPIKE-04 -->
## SPIKE-04

**Question:** Is `session_id` present on every stream-json event type, including system/init, assistant, user and the terminal result line?

**Confidence:** Empirically **observed** in this run

**Observed against:** `claude --version` = 2.1.220 (Claude Code), at 2026-07-26T16:14:37.611Z

**Answer:**

| Event type | Occurrence | session_id |
|---|---|---|
| `assistant` | #1 | present |
| `rate_limit_event` | #1 | present |
| `result` | #1 | present |
| `system/init` | #1 | present |
| `stream_event` | — | not observed |
| `system/api_retry` | — | not observed |
| `system/plugin_install` | — | not observed |
| `user` | — | not observed |

`claude --help` on this version exposes an `--include-hook-events` flag ("Include all hook lifecycle events in the output stream (only works with --output-format=stream-json)") not present in CLAUDE.md's existing § A1/A2 tables. This may make stdout-side session_id correlation more complete than the current hooks-only design assumes — flagged for Phase 2 (runner) and Phase 3 (hook receiver) to investigate, not resolved here.

<details><summary>Raw evidence</summary>

```
{"type":"system","subtype":"init","cwd":"/tmp/fleet-spike-scratch-ida8LT","session_id":"610f8cba-c05f-4645-9fa6-320608eaee98","tools":["Task","Bash","CronCreate","CronDelete","CronList","DesignSync","Edit","EnterWorktree","ExitWorktree","Monitor","NotebookEdit","PushNotification","Read","RemoteTrigger","ReportFindings","ScheduleWakeup","SendMessage","Skill","TaskCreate","TaskGet","TaskList","TaskOutput","TaskStop","TaskUpdate","ToolSearch","WebFetch","WebSearch","Workflow","Write"],"mcp_servers":[{"name":"postgres","status":"pending"},{"name":"tavily-remote-mcp","status":"pending"}],"model":"claude-opus-5[1m]","permissionMode":"auto","slash_commands":["adr","api-contract","bootstrap-arch","build-init","catchup","create-readme","create-slides","debugging","design","dotnet","icoms","image-generating","init-project","managing-skills","memory-mgmt","migrate-helm","newrelic-dashboard","refactor","reflecting-on-session","review","review-pr","rfc-writing","roadmap-generating","service-map","software-requirements","spec-eval","spec-implement","suggest","tdd","team-build","tech-researching","test-orchestrating","understand","validate-build","create_readme","create_slides","migrate_helm","deep-research","design-sync","dataviz","update-config","verify","debug","code-review","simplify","batch","fewer-permission-prompts","doctor","loop","schedule","claude-api","run","run-skill-generator","agents","clear","color","compact","config","context","effort","fast","heapdump","init","mcp","model","__remote-workflow","workflow-launch-exec","reload-skills","rename","ultrareview","security-review","usage-credits","extra-usage","usage","insights","recap","goal","design-consent","design-revoke","team-onboarding"],"apiKeySource":"none","claude_code_version":"2.1.220","output_style":"default","agents":["claude","Explore","general-purpose","Plan","statusline-setup"],"skills":["adr","api-contract","bootstrap-arch","build-init","catchup","create-readme","create-slides","debugging","design","dotnet","icoms","image-generating","init-project","managing-skills","memory-mgmt","migrate-helm","newrelic-dashboard","refactor","reflecting-on-session","review","review-pr","rfc-writing","roadmap-generating","service-map","software-requirements","spec-eval","spec-implement","suggest","tdd","team-build","tech-researching","test-orchestrating","understand","validate-build","deep-research","design-sync","dataviz","update-config","verify","debug","code-review","simplify","batch","fewer-permission-prompts","doctor","loop","schedule","claude-api","run","run-skill-generator"],"plugins":[],"capabilities":["interrupt_receipt_v1","interrupt_cancel_queued_v1","msg_lifecycle_v1"],"analytics_disabled":false,"product_feedback_disabled":false,"uuid":"36c0c5fc-3258-45d5-8c7a-b611b60a9cc8","memory_paths":{"auto":"/home/user/.claude/projects/-tmp-fleet-spike-scratch-ida8LT/memory/"},"fast_mode_state":"off","fast_mode_disabled_reason":"sdk_opt_in_required"}
{"type":"assistant","message":{"model":"claude-opus-5","id":"msg_011CdQy1JFNRykVSvyP73hUK","type":"message","role":"assistant","content":[{"type":"text","text":"Hi! What can I do for you?"}],"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":2,"cache_creation_input_tokens":8699,"cache_read_input_tokens":15273,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":8699},"output_tokens":5,"service_tier":"standard","inference_geo":"not_available"},"diagnostics":null,"context_management":null},"parent_tool_use_id":null,"session_id":"610f8cba-c05f-4645-9fa6-320608eaee98","uuid":"db7b615c-d944-42c8-a9b6-4bbd25c21040","timestamp":"2026-07-26T16:14:37.148Z","request_id":"req_011CdQy1GWhFXbLXRmN9VBK8"}
{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1785085800,"rateLimitType":"five_hour","overageStatus":"rejected","overageDisabledReason":"org_level_disabled","isUsingOverage":false},"uuid":"2b98ea09-0bb3-4b12-a84b-d0b5bbd75bdd","session_id":"610f8cba-c05f-4645-9fa6-320608eaee98"}
{"is_error":false,"duration_api_ms":1612,"num_turns":1,"stop_reason":"end_turn","session_id":"610f8cba-c05f-4645-9fa6-320608eaee98","total_cost_usd":0.0949615,"usage":{"input_tokens":2,"cache_creation_input_tokens":8699,"cache_read_input_tokens":15273,"output_tokens":13,"server_tool_use":{"web_search_requests":0,"web_fetch_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":8699,"ephemeral_5m_input_tokens":0},"inference_geo":"not_available","iterations":[{"input_tokens":2,"output_tokens":13,"cache_read_input_tokens":15273,"cache_creation_input_tokens":8699,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":8699},"type":"message"}],"speed":"standard"},"modelUsage":{"claude-opus-5[1m]":{"inputTokens":2,"outputTokens":13,"cacheReadInputTokens":15273,"cacheCreationInputTokens":8699,"webSearchRequests":0,"costUSD":0.0949615,"contextWindow":1000000,"maxOutputTokens":64000,"canonicalModel":"claude-opus-5","provider":"firstParty"}},"permission_denials":[],"terminal_reason":"completed","fast_mode_state":"off","fast_mode_disabled_reason":"sdk_opt_in_required","subtype":"success","api_error_status":null,"result":"Hi! What can I do for you?","ttft_ms":1621,"ttft_stream_ms":1056,"time_to_request_ms":41,"type":"result","duration_ms":1652,"uuid":"511c8d3b-fc4b-4001-b304-cec74643e1ea"}

```

</details>

<!-- /gsd:spike-section:SPIKE-04 -->

---

<!-- gsd:spike-section:SPIKE-05 -->
## SPIKE-05

**Question:** Are the spike findings recorded as durable notes Phase 2 can read before hardcoding a CLI flag value?

**Confidence:** Empirically **observed** in this run

**Observed against:** `claude --version` = 2.1.220 (Claude Code), at 2026-07-26T16:14:44.742Z

**Answer:**

This document is generated by `writeFindings` (src/spikes/findings-writer.ts), never hand-maintained, and carries the observed `claude --version` on every section (D-12).

Sections currently present: SPIKE-01, SPIKE-02, SPIKE-03, SPIKE-04.

A version-less or hand-written finding is not durable — every section above states plainly whether its answer was empirically observed in a run against the stated `claude --version`, or is inferred and unconfirmed, per SPIKE-05.

<!-- /gsd:spike-section:SPIKE-05 -->

---

<!-- gsd:spike-section:SPIKE-06 -->
## SPIKE-06

**Question:** Does `--model` accept the bare aliases "sonnet" and "haiku" against the installed CLI (RESEARCH.md Open Question 2 / Assumption A4)?

**Confidence:** Empirically **observed** in this run

**Observed against:** `claude --version` = 2.1.220 (Claude Code), at 2026-07-26T16:14:44.741Z

**Answer:**

CONFIRMED: both bare aliases `sonnet` and `haiku` are accepted by `--model` and each produces a `modelUsage` key naming the resolved model. Assumption A4 is now fact — `tasks.model`'s literal-string `sonnet` default is safe to pass through to `--model` unmodified; plan 02-08 does not need an alias-to-full-name adapter.

--model sonnet: ACCEPTED — modelUsage keys observed: ["claude-sonnet-5"]
--model haiku: ACCEPTED — modelUsage keys observed: ["claude-haiku-4-5-20251001"]

<!-- /gsd:spike-section:SPIKE-06 -->

---

## Re-run this suite

```bash
npm run spikes
```
