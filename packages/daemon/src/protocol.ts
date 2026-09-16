import type { ActivityEvent, ChangeKey, ProjectSnapshot } from '@herdr-gsd/core';
import type { ActivityView } from './activity';
import type { Binding } from './bindings';
import type { RunRecord } from './orchestration/runs';

/**
 * gsdd control-socket protocol (spec §3.5). Transport: see control.ts
 * (NDJSON, `{id, method, params}` → `{id, ok, result}` / `{id, ok:false, error}`,
 * server push `{event, params}` after `subscribe`).
 *
 * Methods (params → result):
 *   ping                      {}                         → PingResult
 *   status                    {}                         → StatusResult
 *   projects.list             {}                         → ProjectSummary[]
 *   project.get               {root?, workspaceId?}      → ProjectDetail        (error not_found)
 *   project.rescan            {root?}                    → {rescanned: string[]}
 *   bindings.set              {workspaceId, root|null, role?} → Binding | null
 *   notify.test               {root?}                    → {shown, reason?}
 *   activity.recent           {root, limit?}             → ActivityEvent[]
 *   prompt.send               {root, text, confirm: true}→ PromptResult         (dashboard [enter], M3)
 *   orchestrate.plan          {root|workspaceId, unit, command?, phase?, from?, to?} → PlanResult   (M4)
 *   orchestrate.start         {…same, confirm: true}     → {run?, plan}
 *   orchestrate.stop          {runId | root|workspaceId, all?, discard?} → StopResult[]
 *   orchestrate.list          {root?, workspaceId?, active?} → RunRecord[]
 *   orchestrate.get           {runId}                    → RunRecord
 *   orchestrate.status        {notify?}                  → {active, runs}
 *   shutdown                  {}                         → {ok: true}
 *   subscribe                 {events: EventName[]}      → {subscribed}
 * Events:
 *   snapshot.changed          SnapshotChangedEvent
 *   activity                  ActivityPushEvent
 *   agent.status              AgentStatusEvent
 *   daemon.status             StatusResult
 *   run.changed               RunChangedEvent
 */
export const CONTROL_METHODS = ['ping', 'status', 'projects.list', 'project.get', 'project.rescan', 'bindings.set', 'notify.test', 'activity.recent', 'prompt.send', 'orchestrate.plan', 'orchestrate.start', 'orchestrate.stop', 'orchestrate.list', 'orchestrate.get', 'orchestrate.status', 'shutdown'] as const;
export type ControlMethod = (typeof CONTROL_METHODS)[number];

export const CONTROL_EVENTS = ['snapshot.changed', 'activity', 'agent.status', 'daemon.status', 'run.changed'] as const;
export type ControlEvent = (typeof CONTROL_EVENTS)[number];

export interface PingResult {
  pong: true;
  pid: number;
  version: string;
  uptimeMs: number;
}

export interface StatusResult {
  pid: number;
  version: string;
  startedAt: number;
  herdr: { socket: string; connected: boolean; version?: string; protocol?: number; missingMethods: string[] };
  gsdTools: { found: boolean; source?: string; version?: string };
  projects: number;
  bindings: Binding[];
  notifications: { shown: number; suppressed: number; dropped: number; retried: number };
  watchers: Array<{ root: string; mode: 'watch' | 'poll' | 'stopped' }>;
  lastError?: string;
  configWarnings: string[];
  viewApplied: boolean;
  runs?: { active: number; total: number };
}

export interface ProjectSummary {
  root: string;
  name?: string;
  health: ProjectSnapshot['health'];
  status: string;
  phase?: string;
  next?: string;
  workspaces: string[];
  driverPaneId?: string;
  driverAgentStatus?: string;
  /** id of the orchestration run active on this project, if any (M4) */
  activeRun?: string;
}

export interface ProjectDetail {
  root: string;
  snapshot: ProjectSnapshot;
  next?: string;
  status: string;
  activity?: ActivityView;
  recent: ActivityEvent[];
  bindings: Binding[];
  driverPaneId?: string;
  driverAgentStatus?: string;
  tokens: { workspace: Record<string, string | null>; pane?: Record<string, string | null> };
  /** newest first, at most 10 (M4) */
  runs?: RunRecord[];
  orchestration?: { enabled: boolean; harness: string };
}

export interface RunChangedEvent {
  run: RunRecord;
}

export interface SnapshotChangedEvent {
  root: string;
  keys: ChangeKey[];
  snapshot: ProjectSnapshot;
  next?: string;
  status: string;
}

export interface ActivityPushEvent {
  root: string;
  event: ActivityEvent;
  view: ActivityView;
}

export interface AgentStatusEvent {
  root: string;
  paneId: string;
  status: string;
  previous?: string;
}

export type PromptResult = { sent: true; paneId: string } | { sent: false; reason: 'agent_blocked' | 'no_driver' | 'confirm_required' | 'foreign_pane' | 'error'; message?: string };
