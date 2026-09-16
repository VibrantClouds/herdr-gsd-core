# M4 spike — orchestration feasibility (2026-09-15)

**Question the owner asked:** is orchestration (spec §7) worth building at all? "Orchestration done
poorly is not worth doing", and it must not conflict with, or be awkward against, the way GSD is
normally used. It must also respect the different states and configurations a GSD project can be in
(e.g. worktrees disabled in `.planning/config.json`).

**Method.** (1) Read GSD-Core 1.14.0's own workflows and libraries for worktrees, branching,
sequencing, autonomous mode and human-stop markers (read-only; no `gsd-tools` invoked).
(2) Exercise every never-before-called Herdr method the design needs against a **scratch** Herdr
server (`herdr --session gsd-spike server`, headless) with a throwaway git repo seeded from the
`executing` fixture, and a real Claude Code 2.1.273 binary. Raw captures (paths/ids scrubbed) are in
`captures/M4-*.json`.

> Incident note: the first helper script defaulted to `$HERDR_SOCKET_PATH`, which inside the owner's
> Claude Code pane is the **live** server. One workspace (`w4 spike-main`) was created on the live
> session and closed within seconds; nothing else was touched. The helper now hardcodes the scratch
> socket. Recorded so nobody repeats it.

---

## 1. GSD-Core facts that decide the design

| # | Fact | Where | Consequence |
|---|---|---|---|
| G1 | GSD's own worktrees are **per executor, per plan, inside one wave**: branch `worktree-<agent-id>` / `agent-*`, path `<root>/.claude/worktrees/<agent-id>`; enabled by `workflow.use_worktrees` (default **true**). `execute-phase` **FATALs** if the orchestrator's own branch matches `^((worktree-)?agent-\|worktree-wf_)`. | `workflows/execute-phase/steps/executor-isolation-dispatch.md:291-297`, `bin/lib/worktree-safety.cjs:26`, `references/planning-config.md:41`, `execute-phase.md:426-428` | A plugin worktree is a second, disjoint layer. Never name a branch `agent-*`/`worktree-*`. `use_worktrees=false` only changes what GSD does *inside* the run; it does not forbid the plugin's outer worktree, but the run record must carry it as a warning-free fact (no parallel executors expected). |
| G2 | `/gsd-workspace --new` creates a **new, empty, independent** `.planning/` under `~/gsd-workspaces/<name>/` and tells you to run `/gsd-new-project`. | `workflows/new-workspace.md:1-3,168,186-190` | Wrong primitive for "run phase N of this roadmap". Spec's `isolation = "gsd-workspace"` is **dropped**. |
| G3 | No N-1 gate on `execute-phase`/`plan-phase`; sequencing lives in `/gsd-progress --next` (Route 0: lowest incomplete phase). `depends_on` is plan-level only. `STATE.md ## Current Position` is a **single slot**; the milestone lock is advisory, warn-only. GSD's sanctioned parallel unit is a **workstream** (`--ws`), not parallel phases. | `workflows/next.md:92-147`, `bin/lib/milestone-lock.cjs:5-12,156-162`, `references/workstream-flag.md:3-27` | **Parallel phases of one roadmap are not offered.** At most one active run per repository. The plugin sends GSD's own recommended command, so GSD's routing stays in charge. |
| G4 | `--wave N` refuses if a lower wave is incomplete. | M0-G §3 | Wave-by-wave "orchestration" adds nothing over `execute-phase N`; **dropped**. |
| G5 | `/gsd-autonomous` loops phases, re-reads STATE after each, stops on `--to`, blockers, or 3 failed retries (writes `## Needs Human`), and its stop banner says `Resume with: /gsd-autonomous --from N`. Re-invoking in a fresh session is safe and resumptive. No token budget exists (`--max-cycles` is a convergence bound). | `workflows/autonomous.md:145-170,590,596-608,765,778` | A supervisor pane is legitimate: notify on `blocked`, and (opt-in) re-launch a *dead* session with GSD's own resume command. Never re-prompt a *live* idle session — GSD stopped for a reason. |
| G6 | Human-stop markers in STATE.md: `## Needs Human`, `## Deferred Verification`, non-empty `### Blockers/Concerns` (h2 or h3). | `autonomous.md:472,765`, `bin/lib/state.cjs:1334-1365` | Parsed in `packages/core`; any of them refuses a new run and marks a supervised run `waiting`. |
| G7 | `.planning/` is committed by default (`commit_docs: true`, auto-false when gitignored). | `references/planning-config.md:8,31,102` | An isolated worktree only contains `.planning/` if it is tracked; the planner checks `git ls-files .planning/STATE.md` and refuses isolation otherwise. |
| G8 | `git.branching_strategy: none\|phase\|milestone`; with `phase`, the branch is `git.phase_branch_template` (`gsd/phase-{phase}-{slug}`, zero-padded) and **"if `$BRANCH_NAME` already exists locally, reuse it as-is"**. With `none`, `protected-branch.md` runs (`git.allow_default_branch_commits`). | `execute-phase.md:268-303`, `planning-config.md:34-38,168-215` | Isolated runs use GSD's own template when strategy is `phase`, so GSD finds itself already on its branch. With `none`, the plugin prefix (`gsd/`) is used and the worktree branch sidesteps the default-branch guard. `milestone` strategy → isolation refused (GSD wants one milestone branch). |
| G9 | A branch ahead of `origin/HEAD` makes GSD "auto-degrade to sequential" executor dispatch under Claude Code (`⚠ Worktree base mismatch`). | `planning-config.md:41,434`, `execute-phase.md:136` | Isolated runs carry the warning `intra-phase parallelism may degrade on this branch` when `use_worktrees && parallelization`. Informational only. |
| G10 | GSD says nothing about Claude Code folder trust or permission modes. | repo-wide grep | Trust is the plugin's problem (see H3). |

## 2. Herdr facts (live, scratch session)

| # | Fact | Capture |
|---|---|---|
| H1 | `agent.start` returns **immediately** with `launch_pending: true, agent_status: "unknown"` (0.12 s), despite `timeout_ms`. It does **not** block until interactive-ready as the skill text implies. | `M4-04-agent-start.json` |
| H2 | `agent.wait {until:[idle,done,blocked]}` returns as soon as the status matches; Claude Code's folder-trust dialog is classified **`blocked`** ~5 s after launch. `launch_pending` stays `true` while blocked. | `M4-05`, `M4-06` |
| H3 | Claude Code shows the **"Is this a project you trust?"** dialog in a fresh worktree under Herdr's default location (`~/.herdr/worktrees/<repo>/<branch>`), because trust is per directory in `~/.claude.json`. Trust **is inherited from a trusted ancestor**: the same repo checked out under an already-trusted directory started straight to `idle`. `agent.send_keys ["down","enter"]` accepts the dialog; the agent then reaches `idle` with an `agent_session` UUID. | `M4-08`, `M4-09` |
| H4 | `agent.prompt` with `wait` returned `agent_prompted{agent{agent_status:"done", interactive_ready:true}}` in 2.3 s for a trivial prompt. | `M4-10` |
| H5 | `pane.close` on the only pane **closes the workspace** and kills every foreground process (no orphans, verified by pid), **but then `worktree.remove {workspace_id}` fails with `workspace_not_found`** and the git worktree stays on disk. | `M4-11`, `M4-12` |
| H6 | `worktree.remove {force:false}` on a **clean** worktree whose pane still runs Claude Code succeeds, closes the workspace, kills the processes (no orphans) and deletes the checkout. | `M4-13` |
| H7 | An orphaned checkout is recoverable: `worktree.open {path}` → new workspace id → `worktree.remove`. | `M4-14`, `M4-15` |
| H8 | Dirty worktree, `force:false` → error **`dirty_worktree_requires_force`** (message is git's own); `force:true` removes it. | `M4-17`, `M4-18` |
| H9 | `worktree.create {branch:"gsd/phase-3"}` places the checkout at `~/.herdr/worktrees/<repo_name>/gsd-phase-3` (slash → dash); `path` overrides. Herdr creates the branch from the current HEAD. | `M4-02`, `M4-09` |

## 3. Decision

**Build M4, reduced to the units that fit GSD, and M5.** Concretely:

Kept (fits GSD's normal use):
1. **Phase run** (`orchestrate:phase`) — new pane in the bound workspace, `agent.start` the configured
   harness, `agent.wait` until idle, `agent.prompt` GSD's own recommended command (`gsd_next`, or an
   explicit one). This is what a user does by hand; GSD's routing stays authoritative.
2. **Isolated phase run** (`orchestrate:phase-isolated`) — `worktree.create` on the branch GSD itself
   would use (`phase` strategy) or `<prefix>phase-NN-slug` (`none` strategy), then (1) in the
   worktree's root pane. Maps onto GSD's own "phase branch, user merges" model.
3. **Autonomous run** (`orchestrate:autonomous`) — a supervised pane running `/gsd-autonomous
   [--from N] [--to M]`; the daemon re-arms `agent.wait`, notifies on `blocked`, and, only when
   opted in, re-launches a **dead** session with GSD's own resume command within a budget.
4. **Stop / status**, persisted run records, re-attach on daemon restart.

Dropped (conflicts with GSD or adds nothing): parallel phases of one roadmap (G3), wave-level runs
(G4), `gsd-workspace` isolation (G2), pane-per-plan (M0-G).

Project-state guards, evaluated at plan time and again before each prompt (owner requirement):
`health ≠ ok` / locked / no phases → refuse; paused → only `resume-work` is offered; `## Needs Human`,
`## Deferred Verification`, non-empty blockers → refuse; another active run on the same repo →
refuse (serialisation, G3); isolation additionally requires `.planning/STATE.md` tracked in git
(G7), `branching_strategy ≠ milestone` (G8) and a clean run of `worktree.create`. `use_worktrees`
and `parallelization` only annotate the run (G1, G9). `mode`/`human_verify_mode` are not gated: an
interactive project simply produces more `blocked` states, which the run reports.

Herdr-side rules baked in: never assume `agent.start` blocks (H1); `agent.wait` after start and treat
an early `blocked` as "startup needs input" with a notification naming the pane (H2/H3); stop order
for isolated runs is `worktree.remove` **first**, never `pane.close` (H5/H6); dirty worktrees are kept
and reported, never force-removed without an explicit `--discard` (H8); leftover checkouts are
recovered via `worktree.open` (H7).

Trust dialog: documented, not automated. The recommended one-time setup is to open Claude Code once
in `~/.herdr/worktrees` and accept, since trust inherits (H3); the plugin never edits `~/.claude.json`.

## 4. Amendments to spec.md (recorded in §13)

- §7.1 units → the three kept above; "Plan/wave run" and `isolation = "gsd-workspace"` removed.
- §7.3 `orchestrate:stop` → interrupt, then `worktree.remove` (isolated) or `pane.close`; dirty
  worktrees kept.
- §7.4 concurrency → one active run per repository, `max_parallel` across repositories.
- §3.4 `[orchestration]` gains `harness`, `start_timeout_ms`, `[orchestration.autonomous]`
  `resume_on_exit` (default false), `max_resumes`, `max_wall_clock_min`.
- §2.3 principle 6: `agent.start`/`agent.prompt`/`agent.wait`/`worktree.*` move from "schema only" to
  live-tested in `docs/COMPAT.md`.

## 5. Addendum (2026-09-16, after the first live run): status events

| # | Fact | Capture |
|---|---|---|
| H10 | **`pane.updated` does not carry agent-status transitions for Claude Code.** A raw probe subscribed to `pane.updated`, `pane.agent_detected` and the pane-scoped `pane.agent_status_changed {pane_id}` while starting Claude Code, answering the trust dialog and sending `/gsd-help`: the transitions `blocked → idle → working → idle` arrived **only** on the pane-scoped subscription (dotted envelope `{"event":"pane.agent_status_changed","data":{pane_id, workspace_id, agent_status, agent}}`); the single `pane_updated` frame carried a stale `blocked`. `agent.get.state_change_seq` advanced 7 → 9 across the turn. | probe transcript in this section |

```
+1.1s pane_agent_detected            claude
+4.4s pane.agent_status_changed blocked claude
+4.7s pane_updated              blocked claude   (stale: the status stream already said idle)
+4.7s pane.agent_status_changed idle    claude
+5.3s pane.agent_status_changed working claude
+18.3s pane.agent_status_changed idle   claude
```

**Consequence.** M0-H's H2 decision ("subscribe once to `pane.updated` and diff `agent_status`") was
wrong for live transitions; it only ever saw statuses that happened to ride along with another
`PaneInfo` change. The daemon now keeps a second, pane-scoped subscription covering every pane that
hosts an agent, rebuilt (debounced) whenever that set changes, and ignores the `agent_status` field
of `pane.updated` for those panes. The orchestrator waits for the stream to be live right after
`agent.start` before it prompts, and additionally records `state_change_seq` at prompt time so a
missed event can never turn a reacting run into a false `stalled`. The fake Herdr gained
`statusViaPaneUpdated = false` to reproduce the real behaviour; the orchestrator tests run in that
mode. This also fixes the M1 `blocked` notification path, which depended on the same wrong
assumption.
