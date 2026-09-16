# Screenshots referenced by the README

Drop PNGs here with these names; the README already links them.

| file | what to capture |
|---|---|
| `overview.png` | Herdr with two GSD workspaces in the sidebar showing `$gsd_phase · $gsd_status` tokens, dashboard pane open |
| `pane-tokens.png` | a pane row during `/gsd-execute-phase`: `$gsd_agent executor`, `$gsd_workers 2 active`, `$gsd_tool Bash pnpm test` (needs an adapter installed) |
| `dashboard.png` | the dashboard pane at 80×24: header, Phases, Plans, Blockers, Next, Runs, Activity, keys line |
| `orchestration-run.png` | a supervised run: the split pane with the harness working next to the project pane, dashboard `Runs` row `running /gsd-execute-phase N → w1:p2`, and the `GSD run done` notification if you catch it |

Optional extras: the y/N line after pressing `o` (`start claude in a new pane and send /gsd-execute-phase 3? y/N`), and the worktree workspace a `w` run creates.
