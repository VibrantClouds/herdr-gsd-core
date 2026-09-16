# Phase 2: Execution — Worktree, Runner & Billing Safety - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-23
**Phase:** 2-Execution — Worktree, Runner & Billing Safety
**Areas discussed:** none — user delegated all areas to Claude

---

## How this session went

Four gray areas were identified and presented, and the user selected all four:
Credential & push isolation, Caps & model routing, Worktree lifecycle & disk, and
Queue/cancel/kill switch.

Before the first pair of questions was answered, the user interrupted with:

> "I've decided that I don't want to discuss anything, please use best practices for everything."

No question in any area received a user answer. Every decision D-01 through D-31 in
CONTEXT.md is therefore Claude's pick, made from best practice and grounded in Phase 1's
empirically observed spike findings plus `research/ARCHITECTURE.md`. Nothing in CONTEXT.md
represents a stated user preference.

---

## Areas presented (all selected, none answered)

| Area | Scope offered | Outcome |
|------|---------------|---------|
| Credential & push isolation | BILL-03 repo-settings neutralization; SAFE-06 push-credential removal | Selected, not discussed → D-01…D-08 |
| Caps & model routing | RUN-02/03 cap defaults, permission mode, allowedTools; SAFE-03 tier mapping | Selected, not discussed → D-09…D-17 |
| Worktree lifecycle & disk | WT-01/06/07 base ref, archive timing, dirty handling; SAFE-08 | Selected, not discussed → D-18…D-24 |
| Queue, cancel & kill switch | SAFE-01/02/04/05, TASK-03/06 | Selected, not discussed → D-25…D-31 |

## Questions that were drafted but never asked

Preserved because they name the forks that were resolved unilaterally — these are the
places most worth a second opinion if the user later reviews CONTEXT.md.

### Credential & push isolation

**BILL-03 — how should Fleet handle repo-provided `.claude/settings*.json`?**

| Option | Description | Chosen by Claude |
|--------|-------------|------------------|
| Pin `--setting-sources`, deliver via `--settings` | Exclude `project` and `local` sources entirely; everything Fleet needs travels inline. Strongest guarantee. Forces Phase 3's hook URLs into the inline blob. | ✓ (D-01) |
| Scan and hard-refuse on dangerous keys | Let repo settings load; refuse to provision if `apiKeyHelper`/`env`/`awsAuthRefresh` appear. Weakness: it is a denylist. | |
| Neutralize in-tree before spawn | Delete/overwrite settings files inside the worktree. Does nothing about the main-checkout `settings.local.json` path. | |

**SAFE-06 — how do push credentials get structurally removed?**

| Option | Description | Chosen by Claude |
|--------|-------------|------------------|
| Env-level starvation only | No SSH agent, no askpass, `GIT_TERMINAL_PROMPT=0`. Touches nothing in the user's repo. | partial |
| Env starvation + deny rule | Above plus `--disallowedTools "Bash(git push*)"`. Two independent non-instruction layers. | ✓ (D-05) |
| Env starvation + per-worktree pushurl poisoning | Above plus `git config --worktree remote.origin.pushurl`. Requires enabling `extensions.worktreeConfig` — a persistent mutation of a repo Fleet does not own. | rejected, cuts against PROJ-04 |

### Not reached

Questions for caps/model routing, worktree lifecycle, and queue semantics were never drafted
into presentable form before the user withdrew from the discussion. Their decisions were made
directly against ARCHITECTURE.md §3/§4 and the Phase 1 spike findings.

---

## Claude's Discretion

**All four areas.** The user delegated everything explicitly. CONTEXT.md's
`### Claude's Discretion` block enumerates the properties that must hold versus the
specific values open to revision — the values most likely to warrant an opinion later are
`--max-turns 40`, the 30-minute wall clock, the concurrency cap of 3, the 60s→60min backoff
curve, and D-10's unrestricted `Bash` in `--allowedTools`.

## Deferred Ideas

Recorded in CONTEXT.md `<deferred>`. None arose from user input this session — all were
carried forward from Phase 1's deferred list or surfaced by Claude while reading the spike
findings:

- `--include-hook-events` evaluation → Phase 3
- `fleet gc` branch pruning sweep → later phase
- Overage handling (`overageStatus` / `isUsingOverage` on `rate_limit_event`) → unscheduled
- Container runner backend → v2
- Orphaned-runner reconciliation → Phase 3
- SAFE-07 push / SAFE-09 protected paths → Phase 4
- Dashboard + SSE → Phase 5
- Deliberately burning a plan window to confirm SPIKE-01 → rejected again
