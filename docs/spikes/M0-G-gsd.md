# M0-G — GSD-Core verification spike

**Date:** 2026-09-15 · **Against:** `@opengsd/gsd-core` **1.14.0** (spec targets ≥1.8.0)
**Captures:** `captures/M0-G-{cli,hooks,commands,statusline,parsers}.txt`
**Fixtures:** `test/fixtures/planning/1.14/` (see its `README.md`)

Package source inspected: `~/.npm/_npx/a78857a30883db8e/node_modules/@opengsd/gsd-core/` (`$P` below).  
Upstream repo is **`open-gsd/gsd-core`** (hyphen), public.

> **Incident, disclosed.** Probing the CLI surface, this spike ran
> `gsd-tools state planned-phase --phase 2` against `~/Development/ProjectManager`
> believing it a read. **It is a write.** It rewrote `.planning/STATE.md` (frontmatter
> re-ordered, `current_phase` `02`→`2`, `total_phases` 3→6, `state_head` added, Current
> Position rewritten) and published a new `.planning/state.json`. Both were restored at
> once — `STATE.md` via `git checkout --` (byte-identical to HEAD, only mtime differs),
> `state.json` deleted (untracked, absent before). No other project was mutated.
> §2.6 lists the verified-safe read-only set so this cannot recur.

---

## Summary of decisions

| # | Question | DECISION |
|---|---|---|
| 1 | Third-party lifecycle-event subscription seam? | **NO.** Piggyback on harness hooks + watch `.planning/`. ADR-1239's `hook-bus` ships but is unwired. |
| 2 | JSON output from `gsd-tools`? | **YES — JSON is the default**, there is no `--json` flag. Plus `.planning/state.json`, GSD's own published state contract. |
| 3 | Execute one plan / one wave in isolation? | **WAVE yes** (`--wave N`), **PLAN no**. Orchestration granularity is wave, not plan. |
| 4 | Statusline intermediate data file? | **YES** — `$TMPDIR/claude-ctx-<session_id>.json`, context % only, non-atomic, unversioned. Usable as best-effort enrichment. |
| 5 | `gsd-phase-boundary.sh` marker on disk? | **NO.** Opt-in, writes nothing, stdout-only, and it is not a phase-boundary detector at all. |
| 6 | Codex / OpenCode adapter shape | Codex: `~/.codex/hooks.json`, **`SessionStart` only**. OpenCode: `<root>/plugins/gsd-core.js`; config-root CJS marker **retired**, plugin-dir marker still written. |
| 7 | Fixtures | 3 real + 1 synthetic captured with `expected/*.json`. **No `paused` fixture exists in the wild.** |

---

## 1. VERIFY-1 — is there a GSD event seam? **NO**

ADR-1239 is real (`docs/adr/1239-gsd-embeddable-orchestration-engine.md`, 435 lines,
Status Accepted 2026-06-14, byte-identical on `main` and `v1.14.0`) and the seams ship
as code — `$P/gsd-core/bin/lib/hook-bus.cjs`, `host-integration.cjs`,
`host-integration-sdk.cjs`, `capability-registry.cjs`, `state-io.cjs`. **They are not
wired.** Four independent blockers:

1. **`subscribe()` on the `host` bus is an empty function.** `hook-bus.cjs:69-73`
   — *"GSD's subscriptions are dispatched by a Phase-5 host binding … locally this
   is a seam until that binding lands."* `emit()` on the same bus **throws**
   (`:74-79`, *"no host emitter bound"*). Every CLI harness negotiates
   `hookBus: "host"`; only `trae` and `vscode` get the real `engine` bus, and no
   CLI install path constructs one. Live probe: `host emit THREW`, handler
   invocations `0`; `engine` bus handler invocations `1`.
2. **Nothing in the package emits or subscribes.** `grep -rn "\.emit(" $P` and
   `grep -rn "\.subscribe(" $P` both return nothing. The only `createHookBus`
   call site is `$P/vscode/host-binding.js:97`, never driven by GSD.
3. **The vocabulary contains zero GSD-domain events.** `PORTABLE_EVENT_FLOOR`
   (`host-integration.cjs:28`) = `SessionStart, PreToolUse, PostToolUse, Stop,
   SessionEnd`. `EXTENSION_EVENT_SURFACES` (`:630-682`) is explicit for opencode:
   *"carries NO WORKFLOW-PHASE EVENTS — the engine owns phase sequencing
   internally."* No `PhaseStart`, `PlanStart/Stop`, or `SubagentDispatch` name exists.
4. **The documented SDK entry does not resolve.** `docs/how-to/author-a-host-plugin.md`
   says `require('@opengsd/gsd-core/sdk')`; the tarball has no `exports` map and no
   `sdk/` dir → `MODULE_NOT_FOUND`. Only the deep path
   `@opengsd/gsd-core/gsd-core/bin/lib/host-integration-sdk.cjs` works. That SDK is also
   for the *wrong problem*: **embedding GSD into a new host**, not observing a GSD
   install running inside someone else's harness.

**`gsd-tools capability` is not an event seam either.** Third-party overlays load from
`$GSD_HOME/.gsd/capabilities/<id>/capability.json` and `<root>/.gsd/capabilities/<id>/`
(`capability-loader.cjs:12-13,246,257`), trust-gated by `external-descriptor-trust.cjs`.
A `capability.json` is **data only** (commands/skills/agents/install layout); no field
registers a callback against a lifecycle event — ADR-1239 on purpose: *"the primitive
vocabulary stays closed and first-party."*

### The good news: additive merge is provable

`runtime-hooks-surface.cjs:2012` `applySettingsJsonHooks` (bound at `bin/install.js:1285`)
**merges, never overwrites**: creates `settings.hooks.<Event>` only when absent
(`:2032-2037`), detects presence via `referencesHook(h, '<gsd-basename>')` and **pushes**
otherwise (`:2069,2093,2140,2161`); its timeout migration touches only GSD's own seven
basenames (`:2055-2068`). Uninstall (`install.js:9054-9083`) filters by
`isManagedHookCommand` and empties an event key only if GSD's own removal emptied it.
**Third-party entries survive `gsd update`.** `managed-hooks-registry.cjs` is not a merge
engine — a 28-entry filename array (`:18-49`) for staleness checks. There is **no
documented "user hook" escape hatch**; the contract is "GSD leaves what it doesn't own alone".

### `.planning/config.json` → `hooks.*` (complete; `gsd-core/bin/shared/config-schema.manifest.json:78-83`)

| key | type | default | meaning |
|---|---|---|---|
| `hooks.context_warnings` | bool | `true` | context-budget warnings |
| `hooks.context_warning_threshold` | number | `35` | % context **remaining** → WARNING (root config only) |
| `hooks.context_critical_threshold` | number | `25` | % remaining → CRITICAL (must be < warning) |
| `hooks.workflow_guard` | bool | `false` | opt-in `gsd-workflow-guard.js` |
| `hooks.commit_types` | array | — | extra allowed commit types for `gsd-validate-commit.sh` |
| `hooks.community` | bool | `false` | master opt-in for `gsd-phase-boundary.sh`, `gsd-session-state.sh`, `gsd-validate-commit.sh` |

All six are toggles on GSD's *own* staged hooks; none registers a third-party command.
Only the first three are documented (`references/planning-config.md:357-365`).
**→ §2.3 of the spec stands unchanged: adapters are additive harness-hook entries.**

---

## 2. VERIFY-2 — the `gsd-tools` surface

### 2.1 Resolution order (the plugin must replicate this)

From the preamble every GSD workflow emits (`gsd-core/workflows/execute-phase.md`,
`_GSD_SHIM_NAME="gsd-tools.cjs"`), in order, first hit wins:

```
1. $RUNTIME_DIR (default: git toplevel, else cwd) /gsd-core/bin/gsd-tools.cjs
2. <root>/.claude/gsd-core/bin/gsd-tools.cjs          ← project-local (SizeComparisonSite has this)
3. <root>/.codex/gsd-core/bin/gsd-tools.cjs
4. command -v gsd_run                                  ← PATH (npm "bin", incl. node_modules/.bin)
5. ${CLAUDE_CONFIG_DIR:-~/.claude}/gsd-core/bin/…      ← global (here: ~/.claude-gsd)
6. …then <root>/gsd-core/bin/ under, in order: HERMES_HOME:-~/.hermes, CURSOR_CONFIG_DIR:-~/.cursor,
   CODEX_HOME:-~/.codex, GEMINI_CONFIG_DIR:-~/.gemini, COPILOT_CONFIG_DIR:-~/.copilot,
   WINDSURF_CONFIG_DIR:-~/.codeium/windsurf, AUGMENT_CONFIG_DIR:-~/.augment, TRAE_CONFIG_DIR:-~/.trae,
   QWEN_CONFIG_DIR:-~/.qwen, CODEBUDDY_CONFIG_DIR:-~/.codebuddy, CLINE_CONFIG_DIR:-~/.cline,
   GROK_AGENTS_HOME:-~/.agents, ANTIGRAVITY_CONFIG_DIR:-~/.gemini/antigravity,
   OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-~/.config}/opencode, KILO_CONFIG_DIR:-…/kilo
7. $CLAUDE_ENV_FILE, $GSD_TOOLS
```

`gsd_run` (`gsd-core/bin/gsd_run`) is a POSIX-sh shim that resolves its own symlink and
`exec node "$dir/gsd-tools.cjs" "$@"`. **On this machine nothing is on `PATH`** —
`which gsd-tools` fails and the global install is `~/.claude-gsd/gsd-core/bin/` (a
`CLAUDE_CONFIG_DIR`-style root, not `~/.claude`). The plugin must walk this ladder
itself and pass `--project-dir` rather than relying on process cwd.

`cli-skew-check.cjs` prints `⚠ GSD: <path> may shadow project-local GSD.` **on stderr**
whenever the resolved CLI sits outside a project that has its own install — harmless,
so never treat non-empty stderr as failure.

### 2.2 JSON: it is the default, not a flag

**There is no `--json` flag and no `--version` flag.** Contradicts spec §1.2/§3.1.

```
$ gsd-tools --version
Error: Unknown flag: --version
gsd-tools does not accept version flags.

$ gsd-tools runtime-identity
{ "packageName": "@opengsd/gsd-core", "version": "1.14.0" }
```

Global flags (from `gsd-tools` with no args): `--raw` (suppress JSON post-processing
→ plain text), `--pick <field>` (dot/bracket extraction), `--cwd <path>`,
`--project-dir <path>` (**skips the ancestor walk-up entirely; requires `.planning/`**
— the right flag for the plugin), `--ws <name>`, `--json-errors`, `--exit-contract=v1|v2`.

Outputs verified against all four fixtures (`captures/M0-G-cli.txt`):

| command | shape |
|---|---|
| `state get` | `{"content": "<raw STATE.md incl. frontmatter>"}` — a *transport*, not a parse |
| `state get "<Section>"` | `{"<Section>": "<section body>"}` |
| `state-snapshot` | `{current_phase, current_phase_name, total_phases, current_plan, total_plans_in_phase, status, progress_percent, last_activity, last_activity_desc, decisions[], blockers[], paused_at, session:{last_date, stopped_at, resume_file}}` — **the closest match to `ProjectSnapshot.position`** |
| `phases list` | `{directories[], count, phase_scope}` |
| `progress` | `{milestone_version, milestone_name, phases[{number,name,plans,summaries,status}], total_plans, total_summaries, percent, phase_scope}` |
| `smart-entry --json` | `{situation, recommended, summary, signals{…}, actions[{id,label,command,recommended}]}` |
| `phase-plan-index <N>` | `{phase, plans[{id, wave, depends_on[], autonomous, objective, files_modified[], files_deleted[], agent_hint, task_count, has_summary, halted, blocked_by[]}], waves, incomplete[], runnable[]}` |
| `roadmap get-phase <N>` | `{found, phase_number, phase_name, goal, mode, success_criteria[], section}` |
| `history-digest` | `{phases:{<dir>:{name, provides[], affects[], patterns[]}}}` (large) |
| `state` (no subcommand) | full merged `{config:{…}, …}` — resolved config incl. defaults |
| `config-path` | bare path (text) |
| `runtime-identity` | `{packageName, version}` |

`percent` is deliberately `null` unless `phase_scope === "complete"` — a partial
phase window must not render a percentage (`commands.cjs:3044`). Expect `null` often.

### 2.3 **`.planning/state.json` — GSD's own published state contract (the headline find)**

`$P/gsd-core/bin/lib/state-contract.cjs` (#3227) publishes `<planning>/state.json` at
**11 step-boundary commands** (`state.*`, `phase.*`, `milestone.complete`) via an atomic
sibling-tmp+rename; never throws, never creates `.planning/` where none exists.

```json
{ "contract": "1.0.0", "flavor": "core", "milestone": "v1.0",
  "phases": [{"number":"1","name":"Foundation + Library","status":"complete"}, …],
  "next": { "command": "/gsd:progress --next",
            "label": "Advance to the next step (plan phase 4)",
            "reason": "Phase 4 of 8 — needs a plan" },
  "updated_at": "2026-09-16T01:45:41.473Z" }
```

- `CONTRACT_KEY_ORDER`/`PHASE_KEY_ORDER` are frozen and pinned by upstream tests.
- `PHASE_STATUS` is a frozen **three**-value vocabulary `complete|in_progress|pending`;
  everything else (`not started`, `deferred`, unknown) folds to `pending`, lossy by design.
- `next` comes from `smart-entry.cjs`'s `classifyProject`, so it is identical *by
  construction* to what `/gsd-next` recommends.
- **It can be absent** (published only at boundaries) — always fall back to `STATE.md`.

**→ Read `state.json` first; treat `STATE.md` as the fallback, not the reverse.**

### 2.4 Markdown fallback — GSD's own regexes

Full detail in `captures/M0-G-parsers.txt`. Essentials:

- Paths (`planning-workspace.cjs:331-338`): `STATE.md`, `ROADMAP.md`, `PROJECT.md`,
  `config.json`, `phases/`, `REQUIREMENTS.md`.
- **Field extraction** — `state-document.cjs:397` `stateExtractField`, in order:
  `/^[ \t]*\*\*<Field>:\*\*[ \t]*(.+)/im`, then `/^<Field>:[ \t]*(.+)/im`, then a
  `| Field | value |` table row. `stateFieldValue` (`:472`) owns the ladder
  frontmatter-string → frontmatter-number/bool → body field. Body `Phase:` must be
  sliced to `## Current Position` via `stateCurrentPositionSlice` (`:511`, h2 **or** h3).
- **Status** — `normalizeStateStatus` (`:711`): `pausedAt` non-empty ⇒ `paused`, else a
  **whole-value** match against `STATUS_EXACT_TOKENS` (`:637`) then
  `STATUS_ANCHORED_PATTERNS` (`:676`, e.g. `/^executing phase\s+\S+$/`,
  `/^phase\s+\S+\s+complete$/`, `/^complete\s*[✓✔✅☑]?$/`); anything else passes through
  verbatim. #4186 replaced substring matching for exactly this reason — **never substring-match**.
- **Blockers** — only an h2 `## Blockers` with `/^-\s+(.+)$/gm` items. Real projects
  write `### Blockers/Concerns` under `## Accumulated Context`, so GSD reports `[]`
  for all three fixtures. Known gap (see §7).
- **ROADMAP Progress table** — `phase-lifecycle.cjs:58`: scope to `/^##[ \t]+Progress\b/im`
  through the next `#`/`##`, then `findTableWithColumns(scoped, ['Phase','Plans Complete',
  'Status','Completed'])` — a header **superset**, order/count invariant. Counts read by
  column NAME; `totalPlans` = Σ denominators of `/(\d+)\s*\/\s*(\d+)/` in `Plans Complete`;
  sentinel phases (`0`, `999.x`) excluded. No table ⇒ `## Phases` checkbox fallback
  (`state-contract.cjs`, `- [x] **Phase N: Name**`).
- **Locks** — `STATE.md.lock` (`state.cjs:3399`, pid in body, stale locks stolen),
  `.planning/.lock` (`planning-workspace.cjs:362`), `.planning/milestone.lock`.

### 2.5 Phase / plan / artifact naming and how status is derived

- Phase dirs `.planning/phases/<N>-<slug>/`, parsed `/^(\d+(?:\.\d+)*)-?(.*)/`
  (`commands.cjs:3022`); the slug's `-` become spaces for display. Decimal phases
  (`2.1`) are legal; **never coerce a phase number to a JS number.** Sentinels
  (phase `0`, `999.x`) are excluded by `isSentinelPhaseId` — the fixtures show both
  zero-padded (`01`, `02`) and bare (`4`, `7`) spellings *in the same project family*.
- Plans `<phase>-<plan>-PLAN.md` (e.g. `02-14-PLAN.md`); nested `plans/` also supported
  (#3139). Predicate: ends `-PLAN.md` or is bare `PLAN.md` (`plan-scan.cjs:84,152`).
  Completion record = sibling `<phase>-<plan>-SUMMARY.md`.
- Other per-phase artifacts seen live: `NN-{CONTEXT,DISCUSSION-LOG,RESEARCH,PATTERNS,
  VALIDATION,VERIFICATION,UAT,SECURITY,SPIKE-FINDINGS}.md`.
- **GSD's own phase-status derivation** — `commands.cjs:118` `determinePhaseStatus(plans, summaries, phaseDir, default)`:

```
plans == 0                    → "Pending"    (caller's default)
0 < summaries < plans         → "In Progress"
summaries == 0 && plans > 0   → "Planned"
summaries >= plans → read the phase's VERIFICATION file's FRONTMATTER `status` key only:
      passed       → "Complete"
      human_needed → "Needs Review"
      gaps_found   → "Executed"
      anything else / no file → "Executed"
```

Note it reads **only** the frontmatter `status` (#1159) — a body string like
`previous_status: gaps_found` must not match. This yields a **five**-value vocabulary
(`Pending|Planned|In Progress|Executed|Needs Review|Complete`) that is neither the
spec's seven nor `state.json`'s three. See §7.

### 2.6 Read-only vs write — verified

**Safe (no disk write):** `state get`, `state load`, `state json`, `state-snapshot`,
`phases list`, `progress`, `history-digest`, `phase-plan-index <N>`,
`roadmap get-phase <N>`, `stats`, `smart-entry --json`, `runtime-identity`,
`config-path`, `config-get <key>`, `state` (no subcommand), `find-phase`.

**Writes** (publishes `state.json` and/or mutates `STATE.md`/`ROADMAP.md`) —
`publishStateContract` call sites are `state.cjs:905,4726,5052,5092,6128` and
`phase.cjs:1264,1373,1558,2136,3998` and `milestone.cjs:1161`, i.e.
`state advance-plan`, `state begin-phase`, **`state planned-phase`**,
`state milestone-switch`, `state complete-phase`, `state patch|update|record-metric|
update-progress|add-decision|record-session`, `phase add|add-batch|insert|remove|complete`,
`milestone complete`, `config-set`, `commit*`, `worktree create|cleanup-wave|record-agent`,
`scaffold`, `graphify build`.

Spec §4.2's drift check uses `state sync --verify`; **no `state sync` subcommand
exists in 1.14** — the read-only equivalents are `drift-guard` and `validate`.

---

## 3. VERIFY-3 — one plan, or one wave? **Wave only**

`/gsd-execute-phase <N> [--wave N] [--gaps-only] [--interactive] [--tdd]`.
Parsing is real, not prose: `workflows/execute-phase.md:89` extracts
`--wave ([^\s-]\S*)` into `WAVE_PARAM`, and `init-command-router.cjs:98` declares
`optionalValueFlags: ['wave']`.

There is **no** `--plan`, `--only <plan>`, `--from <plan>`, plan positional, or
"resume from plan N" in 1.14.0. `workflows/execute-plan.md` is a *subagent context
document*, not a command. `/gsd-autonomous`'s `--from/--to/--only` are **phase**-level.
The closest plan-level filter is `--gaps-only` (`gap_closure: true` plans, produced by
`/gsd-verify-work` on a UAT failure).

`--wave N` is a safe orchestration unit: it **refuses** if incomplete plans remain in a
lower wave (`execute-phase.md:329`), and after a partial wave skips phase verification,
leaves the phase incomplete, and prints `/gsd:execute-phase {phase} --wave {next}`
(`workflows/execute-phase/steps/partial-wave.md`).

**Plan/wave model.** `wave: N` and `depends_on: []` sit in PLAN frontmatter
(`templates/phase-prompt.md:19-20`) but are **advisory**: `phase-plan-index` recomputes
the wave by Kahn's algorithm over the `depends_on` DAG, warns on disagreement (#3427),
hard-errors on cycles. **No wave manifest file exists.** A plan with a SUMMARY is
skipped; SUMMARY `status: blocked` does not count as completion, `status: halted` does
but propagates `blocked_by` transitively. Within a wave, plans dispatch as parallel
`gsd-executor` subagents iff `config.parallelization`, downgraded to sequential on any
intra-wave `files_modified` overlap.

**Observable seam, no bus required:** `workflows/execute-phase.md` declares
`points: execute:pre, execute:wave:pre, execute:wave:post, execute:post`, and
execution emits literal assistant-text lines
`[checkpoint] phase N wave X/Y plan ID status (P/Q plans done)`.

**→ §7.4's fallback applies: orchestration parallelism is wave-level within a phase
and phase-level across worktrees. Pane-per-plan is not available.**

**Slash-command namespace:** the invoked name is **`/gsd-<cmd>`**. Sources carry
`name: gsd:<cmd>` and all GSD prose prints `/gsd:<cmd>`, but modern Claude Code installs
ship `skills/gsd-<cmd>/SKILL.md` and CONV-07 rewrites `gsd:`→`gsd-` (`install.js:1908-1909`;
`:1958-1962` deprecates the colon form). Full 72-command table in
`captures/M0-G-commands.txt`; the ones the rule table needs:

| command | role |
|---|---|
| `/gsd-next` | pure router: reads `smart-entry --json`, shows a menu, dispatches one command |
| `/gsd-progress` | `--next` advances; `--next --auto` chains plan→execute→verify; `--forensic` audits |
| `/gsd-discuss-phase N` → `/gsd-plan-phase N` → `/gsd-execute-phase N` → `/gsd-verify-work N` → `/gsd-ship N` | the spine |
| `/gsd-pause-work` / `/gsd-resume-work` | writes/consumes `.continue-here.md` + `HANDOFF.json` |
| `/gsd-autonomous --from N --to N --only N` | unattended phase loop; 3 failed retries ⇒ `## Needs Human` in STATE.md |
| `/gsd-workspace --new --strategy worktree\|clone` | isolated workspace under `~/gsd-workspaces/<name>/` with its own `.planning/` |

Genuinely read-only commands: `help`, `stats`, `audit-uat`, `workstreams`, the `ns-*`
stubs. **`/gsd-undo` is destructive** (`git revert`) despite declaring no Write tool.

---

## 4. VERIFY-4 — statusline intermediate data. **Exists, but treat as best-effort**

`$P/hooks/gsd-statusline.js:808-827`:

```js
const bridgePath = path.join(os.tmpdir(), `claude-ctx-${session}.json`);
fs.writeFileSync(bridgePath, bridgeData);
```

- **Path:** `<os.tmpdir()>/claude-ctx-<session_id>.json` → here `/tmp/claude-ctx-<uuid>.json`.
  Not `~/.claude`, not XDG, not `.planning/`. Seven live files at capture time.
- **Content (real, 116 B, mode 0644):**
  `{"session_id":"…","remaining_percentage":86,"used_pct":14,"timestamp":1789525613}`
  — **context % only**. No phase, no state, no token counts. `timestamp` is epoch
  *seconds*. `used_pct` is raw `100 - remaining_percentage`, deliberately *not* the
  buffer-normalised number the bar shows (#2451) — the two disagree by ~13 points.
- **Cadence:** every statusline render, unconditional — no throttle, TTL, or dirty check.
- **Per-session**, keyed by `session_id`. **Nothing keys it to a project** — a reader
  cannot map file → repo without correlating on the harness's own session id.
- **Hazards:** bare `writeFileSync` (truncate-then-write, no tmp+rename, no fsync) ⇒
  a reader can catch a short JSON; no reaper (files outlive their session
  indefinitely); no `version` field and the schema's semantics already changed once;
  freshness is a *consumer-side* convention (`STALE_SECONDS = 60`,
  `gsd-context-monitor.js:38`).
- Companions written by `gsd-context-monitor.js` in the same dir:
  `claude-ctx-<sid>-warned.json` and `claude-ctx-<sid>-compacted.json`. Neither existed live.
- **Side effect to know about:** at CRITICAL with a `.planning/STATE.md` present, the
  monitor fire-and-forgets `gsd-tools state record-session --stopped-at "context
  exhaustion at N% (date)"` — which **mutates STATE.md** (`gsd-context-monitor.js:460-479`).
  A `.planning` watcher will see a write that has nothing to do with phase progress.
- Version drift: `~/.claude-gsd/hooks/gsd-statusline.js` is 1.14.0;
  `SizeComparisonSite/.claude/hooks/gsd-statusline.js` is **1.9.1** and writes the
  *same* bridge path. That cross-version stability is the only evidence the schema is durable.

`statusline.*` config keys (`gsd-statusline.js:752-763,835`): `show_last_command`
(false), `context_position` (`end`), `state_format` (`full`), `show_git` (false),
`show_state_freshness` (false), `show_context_tokens` (false). **No project on this
machine sets any of them.**

**→ Keep `gsd_ctx` optional as §3.3 already says, sourced from this file, with a
60 s staleness cutoff, a `try/catch` JSON parse, and no project binding claimed.**

---

## 5. VERIFY-5 — `gsd-phase-boundary.sh`. **No marker, and a misnomer**

- **Wiring:** `PostToolUse`, matcher `Write|Edit`, timeout 5
  (`~/.claude-gsd/settings.json:61-70`). Absent from `$P/hooks/hooks.json` — it is an
  *installer*-written hook.
- **Gate:** no `.planning/config.json` ⇒ `exit 0`; `hooks.community !== true` ⇒ `exit 0`
  (`:12-17`). **No project on this machine sets `hooks.community`, so it is dead code here.**
- **Detection:** a path-string test only — `tool_input.path`, falling back to
  `tool_input.file_path` (#2752 decoy defence); `planning_modified=true` iff the path
  matches `*.planning/*`. **No phase-transition detection at all** — no STATE.md diff,
  no phase compare, no git check. It fires on *any* write under *any* `.planning/`.
- **Writes:** nothing — no marker, no sentinel, no temp file. **Exit code `0` on every path.**
- **Output:** one stdout `{"hookSpecificOutput":{"hookEventName":"PostToolUse",
  "additionalContext":".planning/ file modified: <path>…","planning_modified":true,
  "file_path":"<path>"}}`. Harness-only, nothing persisted.

`gsd-session-state.sh`: SessionStart, same `hooks.community` gate, reads STATE.md's
first 20 lines + `config.mode`, prints one `hookSpecificOutput` envelope, **writes nothing**.

**→ Neither is a usable third-party signal. The plugin's own `PostToolUse` adapter
entry replicates the entire useful behaviour of `gsd-phase-boundary.sh` in one line.**

### Where GSD actually puts runtime scratch (no XDG anywhere)

`XDG_STATE_HOME` / `XDG_CACHE_HOME` / `XDG_RUNTIME_DIR` have **zero hits** in the package.
`<tmpdir>/claude-ctx-<sid>[-warned|-compacted].json` (never reaped) ·
`<root>/.gsd/dispatch-isolation-sentinel.json` (10 min TTL) ·
`<tmpdir>/gsd/gsd-<epoch_ms>.json` (CLI output spill, reaped at 5 min) ·
`<tmpdir>/gsd-workstream-sessions/<sha1(realpath(.planning))[0:16]>/<sessionKey>` and
`<root>/.planning/active-workstream` (active workstream) ·
`~/.cache/gsd/gsd-update-check-opengsd-gsd-core.json` (hardcoded, not XDG) ·
`<root>/.planning/{STATE.md,state.json}` (durable state).

**`@file:<path>` matters:** any `gsd-tools` JSON over 50 000 chars is spilled to tmp
and the command prints a `@file:` reference instead (`io.cjs:27,194`). `history-digest`
will hit this. The plugin must handle the indirection.

---

## 6. Codex and OpenCode adapter shapes

**Codex → `~/.codex/hooks.json`** (`$CODEX_HOME` else `~/.codex`;
`install.js:3931,13923`), **not** `config.toml [[hooks]]`. GSD's own comment
(`install.js:1345-1348`): it keeps hooks in `hooks.json` and `config.toml` for feature
flags only, to avoid Codex's mixed-representation startup warning. Written schema
(`runtime-hooks-surface.cjs:926-936`):

```json
{ "hooks": { "SessionStart": [ { "hooks": [ {
    "type": "command",
    "command": "\"/abs/node\" \"/home/u/.codex/hooks/gsd-check-update.js\"",
    "commandWindows": "\"C:/Users/u/.codex/hooks/gsd-check-update.cmd\"" } ] } ] } }
```

`matcher`/`timeout` are emitted only when supplied; `commandWindows` + a `.cmd` shim
handle Windows (#772/#3426). Codex's own event vocabulary (`install.js:161-171`) is
`SubagentStart, Stop, PostToolUse, PreToolUse, PermissionRequest, PreCompact,
PostCompact, SubagentStop, UserPromptSubmit` — **Codex does have `SubagentStop`.** But
**GSD uses `SessionStart` only**: #2586 made install *unconditionally remove* every
extended-event registration on every run (`install.js:12538-12557`) and stop copying
`gsd-context-monitor.js` for Codex (`:12318-12329`). The compiled descriptor still
advertises `extendedHookEvents: [SubagentStop, Stop, PreCompact]` — **stale**.
Foreign-entry safety is good: symlink guard, throws on unparseable JSON rather than
clobbering, removes only `isManagedHookCommand(..., surface:'codex-hooks-json')` matches.

**OpenCode → `plugins/` (plural)**, file `gsd-core.js`
(`capability-registry.cjs:3061-3065`): global `~/.config/opencode/plugins/gsd-core.js`
(`OPENCODE_CONFIG_DIR`), local `<root>/.opencode/plugins/gsd-core.js`.
Kilo the same; pi uses `extensions/gsd.js`.

**CommonJS marker — config-root marker RETIRED, plugin-dir marker STILL WRITTEN.**
`installer-migrations/007-retire-config-root-commonjs-marker.cjs`
(`id: '2026-07-28-retire-config-root-commonjs-marker'`, `introducedIn: 1.8.0`,
`destructive: true`) removes `<configRoot>/package.json` **only when byte-exactly
`{"type":"commonjs"}`**, fail-closed otherwise. Current writes (`install-engine.cjs:1736`)
target `<opencodeRoot>/plugins/package.json` and `<configRoot>/hooks/package.json` — never
the config root, which is *"documented, user-writable territory for declaring local-plugin
npm dependencies"* (`commonjs-marker.cjs:23-27`). `ensureCommonJsMarker` writes `{flag:'wx'}`,
returns `written|unchanged|preserved-foreign|failed`, never throws.

**→ Spec §5.3's "do not add a second marker" is right, but the reason has moved:
the marker now lives in the *plugin dir*, and a foreign `plugins/package.json`
declaring `"type":"module"` will stop `gsd-core.js` loading. The adapter installer
must classify before writing, exactly as `commonjs-marker.cjs` does.**

Per-harness coverage **as implemented** (not as documented):

| harness | hooks surface | events actually wired |
|---|---|---|
| Claude Code | `settings.json` | `SessionStart, PreToolUse, PostToolUse, SubagentStop, Stop, PreCompact, FileChanged` — no `SubagentStart` |
| Codex | `~/.codex/hooks.json` | **`SessionStart` only** |
| OpenCode / Kilo | **none** | plugin bus → `tool.execute.before/after`, `session.created`, `session.idle`, `file.edited`, `experimental.session.compacting` |
| pi | none | `extensions/gsd.js` |
| Cursor | `cursor-hooks-json` | `sessionStart, preToolUse, postToolUse, stop, subagentStart, subagentStop` (marker key `"gsd-managed": true`) |
| Windsurf | `windsurf-hooks-json` | `pre_write_code, pre_run_command` |
| qwen / codebuddy / kimi | `settings.json` / `kimi-hooks-toml` | + `SubagentStart` |

---

## 7. Contradictions with `spec.md` (action required)

| § | Spec says | Reality (1.14.0) | Fix |
|---|---|---|---|
| §1.2, §3.1 | `gsd-tools <cmd> --json` | **No `--json` flag — JSON is the default.** `--raw` turns it *off*. | Drop `--json` everywhere; use `--project-dir` + `--pick`. |
| §2.3.6 | `gsd-tools --version` | Does not exist; errors out. | Use `gsd-tools runtime-identity` → `{packageName, version}`. |
| §1.2, §4.2 | `state sync --verify` | **No `state sync` subcommand.** | Use `drift-guard` / `validate` for the drift check. |
| §1.2 | `state get\|patch\|planned-phase` listed as the read surface | **`state planned-phase` is a WRITE** (it rewrote a real project during this spike). | Pin the read-only list from §2.6 into `packages/core` and assert it in tests. |
| §3.1, §3.3 | `continue-here.md` at `.planning/` root | The file is **`.continue-here.md`** (dot-prefixed) and normally lives in the *active phase dir* `.planning/phases/NN-slug/.continue-here.md`; root is for research-shaped work only. `/gsd-pause-work` also writes `.planning/HANDOFF.json`. | Glob `.planning/**/.continue-here.md` + check `HANDOFF.json`. |
| §3.1 | 7-value `PhaseStatus` | Three vocabularies coexist: `state.json` **3** (`complete\|in_progress\|pending`), `progress`/`determinePhaseStatus` **6** (`Pending\|Planned\|In Progress\|Executed\|Needs Review\|Complete`), `normalizeStateStatus` **7** project-level tokens. None is the spec's set. | Map explicitly; keep `blocked` as a plugin-derived value, not a GSD one. |
| §3.1 | `blockers: string[]` from STATE.md | GSD only parses an h2 `## Blockers`; real projects write `### Blockers/Concerns` under `## Accumulated Context`, so GSD reports `[]`. | Either match GSD (empty, faithful) or extend and document the divergence. |
| §3.1 | `STATE.md.lock` | Correct, but there are two more: `.planning/.lock` and `.planning/milestone.lock`. | Widen the lock check. |
| §4.3 | hand-rolled `gsd_next` rule table | GSD already ships the answer: `gsd-tools smart-entry --json` → `{situation, recommended, actions[].command}`, and `.planning/state.json.next`. Its situations are `no-project, paused, blocked, verify-failed, needs-first-phase, planning, executing, verify-pending, idle-stranded, complete, unknown`. | **Replace `rules.json` with `smart-entry`**, keep a hard-coded table only as the offline fallback. Note GSD recommends `/gsd:progress --next` for the forward-motion cases, not `execute-phase`/`verify-work` directly, and `discuss-phase` (not `new-project`) for an initialised-but-empty project. |
| §1.2 | statusline "phase/state and a context meter" is an enrichment source | The on-disk bridge carries **context % only** — no phase/state, no project binding, non-atomic, unversioned. | Keep `gsd_ctx`; do not source phase/state from it. |
| §1.2 | "ADR-1239 … hook-bus + stateIO seams" implied usable | Shipped but unwired: `subscribe()` empty, `emit()` throws, no producers, no GSD-domain events, `@opengsd/gsd-core/sdk` is `MODULE_NOT_FOUND`. | Keep §2.3's filesystem-primary design. File the two upstream asks in §8. |
| §1.2 | Codex `SessionStart, SubagentStart, Stop, PostToolUse` | GSD wires **`SessionStart` only**; the descriptor's extended list is stale and install actively strips those registrations. | Adapter must register its *own* Codex events; do not assume GSD's. |
| §5.3 | OpenCode plugin dir "pinned CJS by GSD's `package.json` marker" | The **config-root** marker was retired (migration 007); the marker now lives in `<root>/plugins/package.json`. | Classify-before-write; a foreign `"type":"module"` there breaks loading. |
| §7.4 | "`/gsd-execute-phase N --plan K`" candidate | No plan-level flag exists. `--wave N` does. | Orchestration unit = **wave**. Pane-per-plan is out. |
| — | (new) | `.planning/state.json` — GSD's own atomic, versioned state contract with a `next` recommendation — is not mentioned in the spec at all. | Make it the **primary** read in `packages/core`; `STATE.md` becomes the fallback. |
| — | (new) | `gsd-tools` JSON over 50 000 chars is spilled to `<tmpdir>/gsd/gsd-*.json` and returned as `@file:<path>`. | Handle the indirection. |
| — | (new) | `cli-skew-check` writes a warning to **stderr** on every invocation when a project-local install exists. | Do not treat non-empty stderr as failure. |

## 8. Upstream asks (small, concrete)
1. Add a `package.json` `exports` map with `"./sdk"` — the docs already promise
   `require('@opengsd/gsd-core/sdk')` and it 404s.
2. Land Phase 5 / #1682 host dispatch **and** a GSD-domain event vocabulary
   (`phase.enter/exit`, `plan.start/stop`, `wave.start/stop`, `subagent.dispatch`).
3. Document `.planning/state.json` as public (it already is in code: frozen key order,
   frozen status vocabulary, atomic publish) and publish it on more boundaries.
