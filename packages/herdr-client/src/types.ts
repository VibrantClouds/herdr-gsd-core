/**
 * Wire types for the Herdr 0.9.0 socket API (protocol 22).
 *
 * Ground truth, in order of authority:
 *   1. `docs/spikes/captures/M0-H-*.json`  — live request/response captures.
 *   2. `docs/spikes/herdr-0.9.0-api-schema.json` — `herdr api schema --json`.
 *   3. `docs/spikes/M0-H-herdr.md` — the spike write-up.
 *
 * Fields that only appear in the schema and were never observed in a live
 * capture are marked with an `unverified` doc comment. Field names are snake_case
 * because they are the wire shape: no renaming happens in this package.
 */

/* -------------------------------------------------------------------------- */
/* Envelope                                                                    */
/* -------------------------------------------------------------------------- */

export interface HerdrRequest<P = unknown> {
  id: string;
  method: string;
  params: P;
}

export interface HerdrSuccess<R = unknown> {
  id: string;
  result: R;
}

export interface HerdrErrorBody {
  code: string;
  message: string;
}

/** Deserialization failures carry `id: ""`, not the request id (spike §1.2). */
export interface HerdrErrorResponse {
  id: string;
  error: HerdrErrorBody;
}

export type HerdrResponse<R = unknown> = HerdrSuccess<R> | HerdrErrorResponse;

/** Void methods answer `{"type":"ok"}`. */
export interface OkResult {
  type: 'ok';
}

/* -------------------------------------------------------------------------- */
/* Limits and patterns (spike §3.1, §3.4, §4)                                  */
/* -------------------------------------------------------------------------- */

/** Metadata token key: `[A-Za-z0-9_-]{1,32}`. */
export const TOKEN_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
/** Metadata source: `[A-Za-z0-9:._-]{1,80}`. */
export const METADATA_SOURCE_PATTERN = /^[A-Za-z0-9:._-]{1,80}$/;
/** Max token keys accepted in a single report. */
export const MAX_TOKEN_KEYS_PER_REPORT = 16;
/** Max tokens retained per resource (server-side; informational). */
export const MAX_TOKENS_PER_RESOURCE = 32;
/** Values longer than this are silently truncated by the server. */
export const TOKEN_VALUE_MAX_LENGTH = 80;
export const TTL_MS_MIN = 1;
export const TTL_MS_MAX = 86_400_000;
export const NOTIFICATION_TITLE_MAX_LENGTH = 80;
export const NOTIFICATION_BODY_MAX_LENGTH = 240;

/* -------------------------------------------------------------------------- */
/* Scalars                                                                     */
/* -------------------------------------------------------------------------- */

export type AgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';
/**
 * `agent.start.kind` — the fixed set of executables Herdr 0.9.0 launches and
 * detects (spike M0-H §3.3). A harness `command[0]` must map onto one of these.
 */
export const HERDR_AGENT_KINDS = [
  'pi', 'claude', 'codex', 'gemini', 'cursor', 'devin', 'agy', 'cline', 'omp', 'mastracode', 'opencode', 'copilot',
  'kimi', 'kiro', 'droid', 'amp', 'grok', 'hermes', 'kilo', 'qodercli', 'qwen', 'maki', 'muse',
] as const;
export type HerdrAgentKind = (typeof HERDR_AGENT_KINDS)[number];
/** `agent.start.name` / `agent.rename` alias pattern. */
export const AGENT_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
export type ReadSource = 'visible' | 'recent' | 'recent_unwrapped' | 'detection';
export type ReadFormat = 'text' | 'ansi';
/** `pane.split` has no `left`/`up`. */
export type SplitDirection = 'right' | 'down';
export type PaneRightClickTarget = 'herdr' | 'pane';
export type NotificationSound = 'none' | 'done' | 'request';
export type ToastPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
/** `rate_limited`/`busy` are *reasons*, not error codes (spike §1.2). */
export type NotificationShowReason = 'shown' | 'disabled' | 'rate_limited' | 'no_foreground_client' | 'busy';
export type AgentSessionRefKind = 'id' | 'path';

/** `{key: value}`; `null` **and** `""` both clear a key (spike §4, steps 7/11). */
export type MetadataTokens = Record<string, string | null>;
/** Tokens as they come back on an info object (never null, key absent when cleared). */
export type Tokens = Record<string, string>;
/** `{idle|working|blocked|done|unknown: label}` — plugin-supplied status labels. */
export type StateLabels = Partial<Record<AgentStatus, string>>;

/* -------------------------------------------------------------------------- */
/* Info objects                                                                */
/* -------------------------------------------------------------------------- */

export interface ServerCapabilities {
  live_handoff: boolean;
  detached_server_daemon?: boolean;
  endpoint_protocol_generation?: number | null;
  health_check?: boolean;
  surface_interest?: boolean;
}

export interface PingResult {
  type: 'pong';
  version: string;
  protocol: number;
  capabilities?: ServerCapabilities;
}

/** Worktree provenance carried on a workspace. */
export interface WorkspaceWorktreeInfo {
  repo_key: string;
  repo_name: string;
  repo_root: string;
  /** Exact checkout path of this workspace — use instead of a workspace `cwd`, which does not exist. */
  checkout_path: string;
  is_linked_worktree: boolean;
}

export interface WorkspaceInfo {
  workspace_id: string;
  number: number;
  label: string;
  focused: boolean;
  pane_count: number;
  tab_count: number;
  active_tab_id: string;
  agent_status: AgentStatus;
  /** Present only while at least one token is set; absent (not `{}`) when empty. */
  tokens?: Tokens;
  /** unverified — schema-only; no worktree workspace existed in the live capture. */
  worktree?: WorkspaceWorktreeInfo | null;
}

export interface TabInfo {
  tab_id: string;
  workspace_id: string;
  number: number;
  label: string;
  focused: boolean;
  pane_count: number;
  agent_status: AgentStatus;
}

export interface PaneScrollInfo {
  offset_from_bottom: number;
  max_offset_from_bottom: number;
  viewport_rows: number;
}

/**
 * Session identity reported by a harness integration. For Claude Code,
 * `kind:"id"`, `source:"herdr:claude"` and `value` is the Claude Code session
 * UUID — the join key between a Herdr pane and a GSD `ActivityEvent`.
 */
export interface AgentSessionInfo {
  source: string;
  agent: string;
  kind: AgentSessionRefKind;
  value: string;
}

export interface PaneInfo {
  pane_id: string;
  terminal_id: string;
  workspace_id: string;
  tab_id: string;
  focused: boolean;
  agent_status: AgentStatus;
  revision: number;
  cwd?: string | null;
  foreground_cwd?: string | null;
  /** Agent *kind* (`claude`, `codex`, …) — never a name alias. */
  agent?: string | null;
  agent_session?: AgentSessionInfo | null;
  terminal_title?: string | null;
  terminal_title_stripped?: string | null;
  scroll?: PaneScrollInfo | null;
  tokens?: Tokens;
  /** Plugin-reported presentation title (`pane.report_metadata.title`). unverified — never set live. */
  title?: string | null;
  /** Plugin-reported agent label. unverified — never set live. */
  display_agent?: string | null;
  /** Plugin-reported per-status labels. unverified — never set live. */
  state_labels?: StateLabels;
  /** unverified — schema-only; user pane label. */
  label?: string | null;
}

export interface AgentInfo {
  terminal_id: string;
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  focused: boolean;
  agent_status: AgentStatus;
  revision: number;
  /** Agent kind. */
  agent?: string | null;
  agent_session?: AgentSessionInfo | null;
  terminal_title?: string | null;
  terminal_title_stripped?: string | null;
  cwd?: string | null;
  foreground_cwd?: string | null;
  /** Monotonic and **shared across all agents** in the session. */
  state_change_seq?: number;
  /** Pane tokens surface here too. */
  tokens?: Tokens;
  /** `agent.rename` alias, `[a-z][a-z0-9_-]{0,31}`. unverified — no renamed agent live. */
  name?: string | null;
  /** unverified — schema-only. */
  interactive_ready?: boolean;
  /** unverified — schema-only. */
  launch_pending?: boolean;
  /** True when an integration owns lifecycle state. unverified — schema-only. */
  screen_detection_skipped?: boolean;
  /** unverified — schema-only. */
  title?: string | null;
  /** unverified — schema-only. */
  display_agent?: string | null;
  /** unverified — schema-only. */
  state_labels?: StateLabels;
}

/** One foreground process. `cmdline`/`argv` leak secrets — never log or spool them. */
export interface ProcessInfo {
  pid: number;
  /** 15-char `comm`, e.g. `"npm exec @model"`. */
  name: string;
  argv?: string[] | null;
  cmdline?: string | null;
  cwd?: string | null;
  /** unverified — schema-only. */
  argv0?: string | null;
}

export interface PaneProcessInfo {
  pane_id: string;
  shell_pid?: number | null;
  foreground_process_group_id?: number | null;
  /** The whole foreground process group, including MCP server children. */
  foreground_processes?: ProcessInfo[];
  /** unverified — schema-only. */
  tty?: string | null;
}

export interface PaneLayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PaneLayoutPane {
  pane_id: string;
  focused: boolean;
  rect: PaneLayoutRect;
}

export interface PaneLayoutSplit {
  id: string;
  direction: SplitDirection;
  ratio: number;
  rect: PaneLayoutRect;
}

export interface PaneLayoutSnapshot {
  workspace_id: string;
  tab_id: string;
  zoomed: boolean;
  area: PaneLayoutRect;
  focused_pane_id: string;
  panes: PaneLayoutPane[];
  splits: PaneLayoutSplit[];
}

/** Flat: panes are not nested under tabs/workspaces — join on ids. */
export interface SessionSnapshot {
  version: string;
  protocol: number;
  focused_workspace_id?: string | null;
  focused_tab_id?: string | null;
  focused_pane_id?: string | null;
  workspaces: WorkspaceInfo[];
  tabs: TabInfo[];
  panes: PaneInfo[];
  layouts: PaneLayoutSnapshot[];
  agents: AgentInfo[];
}

export interface WorktreeInfo {
  path: string;
  branch?: string | null;
  is_bare: boolean;
  is_detached: boolean;
  is_prunable: boolean;
  is_linked_worktree: boolean;
  /** null when the worktree is not open in Herdr. */
  open_workspace_id?: string | null;
  label: string;
}

export interface WorktreeSourceInfo {
  repo_key: string;
  repo_name: string;
  repo_root: string;
  source_checkout_path: string;
  source_workspace_id?: string | null;
}

export interface PluginSourceInfo {
  kind: string;
  [key: string]: unknown;
}

/** `plugin.list` entry (`InstalledPluginInfo`). All live captures were empty. */
export interface PluginInfo {
  plugin_id: string;
  name: string;
  version: string;
  manifest_path: string;
  plugin_root: string;
  enabled: boolean;
  description?: string | null;
  min_herdr_version?: string;
  platforms?: string[] | null;
  /** unverified — schema-only. */
  source?: PluginSourceInfo;
  /** unverified — schema-only manifest echoes. */
  build?: unknown[];
  startup?: unknown[];
  actions?: unknown[];
  events?: unknown[];
  panes?: unknown[];
  link_handlers?: unknown[];
  /** Link-time warnings (unknown `[[events]] on` names, missing files). Surface as `gsd_err`. */
  warnings?: string[];
}

export interface PaneReadResult {
  pane_id: string;
  workspace_id: string;
  tab_id: string;
  source: ReadSource;
  format: ReadFormat;
  text: string;
  revision: number;
  truncated: boolean;
}

/* -------------------------------------------------------------------------- */
/* Result shapes (tagged on `result.type`)                                     */
/* -------------------------------------------------------------------------- */

export interface SessionSnapshotResult {
  type: 'session_snapshot';
  snapshot: SessionSnapshot;
}
export interface WorkspaceListResult {
  type: 'workspace_list';
  workspaces: WorkspaceInfo[];
}
export interface WorkspaceInfoResult {
  type: 'workspace_info';
  workspace: WorkspaceInfo;
}
export interface TabListResult {
  type: 'tab_list';
  tabs: TabInfo[];
}
export interface TabInfoResult {
  type: 'tab_info';
  tab: TabInfo;
}
export interface PaneListResult {
  type: 'pane_list';
  panes: PaneInfo[];
}
export interface PaneInfoResult {
  type: 'pane_info';
  pane: PaneInfo;
}
export interface PaneProcessInfoResult {
  type: 'pane_process_info';
  process_info: PaneProcessInfo;
}
export interface PaneReadResultEnvelope {
  type: 'pane_read';
  read: PaneReadResult;
}
export interface PaneSplitResult {
  type: 'pane_split';
  pane: PaneInfo;
}
export interface AgentListResult {
  type: 'agent_list';
  agents: AgentInfo[];
}
export interface AgentInfoResult {
  type: 'agent_info';
  agent: AgentInfo;
}
/** unverified — `agent.start` was not exercised against a live session. */
export interface AgentStartedResult {
  type: 'agent_started';
  agent: AgentInfo;
  argv: string[];
}
/** unverified — `agent.prompt` was not exercised against a live session. */
export interface AgentPromptedResult {
  type: 'agent_prompted';
  agent: AgentInfo;
}
export interface AgentViewResult {
  type: 'agent_view';
  active: boolean;
  label?: string | null;
  source?: string | null;
}
export interface WorktreeListResult {
  type: 'worktree_list';
  source: WorktreeSourceInfo;
  worktrees: WorktreeInfo[];
}
/** unverified — `worktree.create` was not exercised against a live session. */
export interface WorktreeCreatedResult {
  type: 'worktree_created';
  workspace: WorkspaceInfo;
  tab: TabInfo;
  root_pane: PaneInfo;
  worktree: WorktreeInfo;
}
/** unverified — `worktree.open` was not exercised against a live session. */
export interface WorktreeOpenedResult {
  type: 'worktree_opened';
  workspace: WorkspaceInfo;
  tab: TabInfo;
  root_pane: PaneInfo;
  worktree: WorktreeInfo;
  already_open: boolean;
}
/** unverified — `worktree.remove` was not exercised against a live session. */
export interface WorktreeRemovedResult {
  type: 'worktree_removed';
  workspace_id: string;
  path: string;
  forced: boolean;
}
/** unverified — `workspace.create` was not exercised against a live session. */
export interface WorkspaceCreatedResult {
  type: 'workspace_created';
  workspace: WorkspaceInfo;
  tab: TabInfo;
  root_pane: PaneInfo;
}
export interface NotificationShowResult {
  type: 'notification_show';
  shown: boolean;
  reason: NotificationShowReason;
}
export interface PluginListResult {
  type: 'plugin_list';
  plugins: PluginInfo[];
}
export interface SubscriptionStartedResult {
  type: 'subscription_started';
}

/* -------------------------------------------------------------------------- */
/* Params                                                                      */
/* -------------------------------------------------------------------------- */

export interface EmptyParams {
  [key: string]: never;
}

export interface WorkspaceTargetParams {
  workspace_id: string;
}
export interface PaneTargetParams {
  pane_id: string;
}
export interface TabTargetParams {
  tab_id: string;
}
/** `target` is a pane id (`w1:p2`) or a live agent *name* — never an agent kind. */
export interface AgentTargetParams {
  target: string;
}
export interface PaneListParams {
  workspace_id?: string | null;
}
export interface PluginListParams {
  plugin_id?: string | null;
}
export interface PaneProcessInfoParams {
  pane_id?: string | null;
}

/**
 * `ttl_ms` is **per report**, not per key: it applies to exactly the keys named
 * in this report. Mixed TTLs therefore need separate calls with their own seq.
 */
export interface PaneReportMetadataParams {
  pane_id: string;
  source: string;
  seq?: number | null;
  tokens?: MetadataTokens;
  ttl_ms?: number | null;
  title?: string | null;
  display_agent?: string | null;
  state_labels?: StateLabels;
  clear_title?: boolean;
  clear_display_agent?: boolean;
  clear_state_labels?: boolean;
  /** Guard: apply only if the authoritative agent label matches. Does not gate token patches. */
  agent?: string | null;
  /** Guard: apply only if the lifecycle authority source matches. Does not gate token patches. */
  applies_to_source?: string | null;
}

export interface WorkspaceReportMetadataParams {
  workspace_id: string;
  source: string;
  /** Required here, unlike on panes. */
  tokens: MetadataTokens;
  seq?: number | null;
  ttl_ms?: number | null;
}

export type AgentViewBuiltinField = 'status' | 'workspace_id' | 'tab_id' | 'pane_id' | 'agent' | 'seen' | 'state_change_seq';
export type AgentViewField = AgentViewBuiltinField | { token: string };
export type AgentViewContext = 'current_workspace_id' | 'current_tab_id';
export type AgentViewValue = string | boolean | number | { context: AgentViewContext };
export type AgentViewFilter =
  | { op: 'all'; filters: AgentViewFilter[] }
  | { op: 'any'; filters: AgentViewFilter[] }
  | { op: 'not'; filter: AgentViewFilter }
  | { op: 'eq'; field: AgentViewField; value: AgentViewValue }
  | { op: 'in'; field: AgentViewField; values: AgentViewValue[] }
  | { op: 'exists'; field: AgentViewField };
export type AgentViewBuiltinSortField =
  | 'workspace_order'
  | 'tab_order'
  | 'pane_order'
  | 'attention'
  | 'status'
  | 'agent'
  | 'seen'
  | 'state_change_seq';
export type AgentViewSortField = AgentViewBuiltinSortField | { token: string };
export interface AgentViewSort {
  field: AgentViewSortField;
  order?: 'asc' | 'desc';
}
export interface AgentViewSetParams {
  source: string;
  label?: string | null;
  filter?: AgentViewFilter | null;
  sort?: AgentViewSort[];
}
export interface AgentViewClearParams {
  source?: string | null;
}

export interface NotificationShowParams {
  title: string;
  body?: string | null;
  sound?: NotificationSound;
  /** Applies only when `ui.toast.delivery = "herdr"`. */
  position?: ToastPosition | null;
}

export interface AgentPromptWaitOptions {
  /** Default `[idle, done, blocked]`. */
  until?: AgentStatus[];
  /** `>3000` and `<=300000`; default 30000. */
  timeout_ms?: number | null;
}
export interface AgentPromptParams {
  target: string;
  text: string;
  wait?: AgentPromptWaitOptions | null;
}
export interface AgentWaitParams {
  target: string;
  until?: AgentStatus[];
  timeout_ms?: number | null;
}
export interface AgentSendKeysParams {
  target: string;
  keys: string[];
}
export interface AgentStartParams {
  /** `[a-z][a-z0-9_-]{0,31}`, unique among live agents. */
  name: string;
  /** Supported agent identity + canonical executable (`claude`, `codex`, …). */
  kind: string;
  /** Must already exist and be at its shell prompt; `agent.start` never creates layout. */
  pane_id: string;
  /** Passed after `--`. */
  args?: string[];
  timeout_ms?: number | null;
}
export interface AgentReadParams {
  target: string;
  source: ReadSource;
  lines?: number | null;
  format?: ReadFormat;
  strip_ansi?: boolean;
}
export interface AgentRenameParams {
  target: string;
  name?: string | null;
}

export interface PaneSplitParams {
  direction: SplitDirection;
  target_pane_id?: string | null;
  workspace_id?: string | null;
  cwd?: string | null;
  env?: Record<string, string>;
  ratio?: number | null;
  focus?: boolean;
  right_click?: PaneRightClickTarget;
}
export interface PaneSendTextParams {
  pane_id: string;
  text: string;
}
export interface PaneReadParams {
  pane_id: string;
  source: ReadSource;
  lines?: number | null;
  format?: ReadFormat;
  strip_ansi?: boolean;
}

export interface WorkspaceCreateParams {
  cwd?: string | null;
  env?: Record<string, string>;
  label?: string | null;
  focus?: boolean;
  source_workspace_id?: string | null;
}
/** Repo-scoped: takes `workspace_id` **or** `cwd`, never global. */
export interface WorktreeListParams {
  workspace_id?: string | null;
  cwd?: string | null;
  trust_repository?: boolean;
}
export interface WorktreeCreateParams {
  workspace_id?: string | null;
  cwd?: string | null;
  branch?: string | null;
  base?: string | null;
  path?: string | null;
  label?: string | null;
  focus?: boolean;
  trust_repository?: boolean;
}
export interface WorktreeOpenParams {
  workspace_id?: string | null;
  cwd?: string | null;
  branch?: string | null;
  path?: string | null;
  label?: string | null;
  focus?: boolean;
  trust_repository?: boolean;
}
/** Addressed by `workspace_id`, not by path: only a worktree Herdr has open can be removed. */
export interface WorktreeRemoveParams {
  workspace_id: string;
  force?: boolean;
  trust_repository?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Subscriptions                                                               */
/* -------------------------------------------------------------------------- */

export type OutputMatch = { type: 'substring'; value: string } | { type: 'regex'; value: string };

/** Subscribe with **dotted** names; pushed frames use snake_case. */
export type SubscriptionSpec =
  | { type: 'workspace.created' }
  | { type: 'workspace.updated' }
  | { type: 'workspace.metadata_updated' }
  | { type: 'workspace.renamed' }
  | { type: 'workspace.moved' }
  | { type: 'workspace.reordered' }
  | { type: 'workspace.closed' }
  | { type: 'workspace.focused' }
  | { type: 'worktree.created' }
  | { type: 'worktree.opened' }
  | { type: 'worktree.removed' }
  | { type: 'tab.created' }
  | { type: 'tab.closed' }
  | { type: 'tab.focused' }
  | { type: 'tab.renamed' }
  | { type: 'tab.moved' }
  | { type: 'pane.created' }
  | { type: 'pane.closed' }
  | { type: 'pane.updated' }
  | { type: 'pane.focused' }
  | { type: 'pane.moved' }
  | { type: 'pane.exited' }
  | { type: 'pane.agent_detected' }
  | { type: 'layout.updated' }
  /* pane-scoped: `pane_id` is required and these push a different envelope */
  | { type: 'pane.agent_status_changed'; pane_id: string; agent_status?: AgentStatus | null }
  | { type: 'pane.scroll_changed'; pane_id: string }
  | {
      type: 'pane.output_matched';
      pane_id: string;
      source: ReadSource;
      match: OutputMatch;
      lines?: number | null;
      strip_ansi?: boolean;
    };

export interface EventsSubscribeParams {
  subscriptions: SubscriptionSpec[];
}

/** `pane.output_changed` is in `EventKind` but has no `events.subscribe` entry. */
export type EventKind =
  | 'workspace_created'
  | 'workspace_updated'
  | 'workspace_metadata_updated'
  | 'workspace_closed'
  | 'workspace_renamed'
  | 'workspace_moved'
  | 'workspace_reordered'
  | 'workspace_focused'
  | 'worktree_created'
  | 'worktree_opened'
  | 'worktree_removed'
  | 'tab_created'
  | 'tab_closed'
  | 'tab_renamed'
  | 'tab_moved'
  | 'tab_focused'
  | 'pane_created'
  | 'pane_closed'
  | 'pane_updated'
  | 'pane_focused'
  | 'pane_moved'
  | 'pane_output_changed'
  | 'pane_exited'
  | 'pane_agent_detected'
  | 'pane_agent_status_changed'
  | 'layout_updated';

/* `data` duplicates `event` in `data.type`. */
export type EventData =
  | { type: 'workspace_created'; workspace: WorkspaceInfo }
  | { type: 'workspace_updated'; workspace: WorkspaceInfo }
  | { type: 'workspace_metadata_updated'; workspace: WorkspaceInfo }
  | { type: 'workspace_closed'; workspace_id: string; workspace?: WorkspaceInfo | null }
  | { type: 'workspace_renamed'; workspace_id: string; label: string }
  | { type: 'workspace_moved'; workspace_id: string; insert_index: number; workspaces: WorkspaceInfo[] }
  | { type: 'workspace_reordered'; workspace_ids: string[]; before_workspace_id?: string | null; workspaces: WorkspaceInfo[] }
  | { type: 'workspace_focused'; workspace_id: string }
  | { type: 'worktree_created'; workspace: WorkspaceInfo; worktree: WorktreeInfo }
  | { type: 'worktree_opened'; workspace: WorkspaceInfo; worktree: WorktreeInfo; already_open: boolean }
  | { type: 'worktree_removed'; workspace_id: string; worktree: WorktreeInfo; forced: boolean; workspace?: WorkspaceInfo | null }
  | { type: 'tab_created'; tab: TabInfo }
  | { type: 'tab_closed'; tab_id: string; workspace_id: string }
  | { type: 'tab_renamed'; tab_id: string; workspace_id: string; label: string }
  | { type: 'tab_moved'; tab_id: string; workspace_id: string; insert_index: number; tabs: TabInfo[] }
  | { type: 'tab_focused'; tab_id: string; workspace_id: string }
  | { type: 'pane_created'; pane: PaneInfo }
  | { type: 'pane_updated'; pane: PaneInfo }
  | { type: 'pane_closed'; pane_id: string; workspace_id: string }
  | { type: 'pane_exited'; pane_id: string; workspace_id: string }
  | { type: 'pane_focused'; pane_id: string; workspace_id: string }
  | {
      type: 'pane_moved';
      pane: PaneInfo;
      previous_pane_id: string;
      previous_tab_id: string;
      previous_workspace_id: string;
      closed_tab_id?: string | null;
      closed_workspace_id?: string | null;
      created_tab?: TabInfo | null;
      created_workspace?: WorkspaceInfo | null;
    }
  /** Reachable only via `events.wait` / plugin `[[events]]`, not `events.subscribe`. */
  | { type: 'pane_output_changed'; pane_id: string; workspace_id: string; revision: number }
  | { type: 'pane_agent_detected'; pane_id: string; workspace_id: string; agent?: string | null; final_status?: AgentStatus | null; released?: boolean }
  | {
      type: 'pane_agent_status_changed';
      pane_id: string;
      workspace_id: string;
      agent_status: AgentStatus;
      agent?: string | null;
      title?: string | null;
      display_agent?: string | null;
      state_labels?: StateLabels;
    }
  | { type: 'layout_updated'; layout: PaneLayoutSnapshot };

/** Pushed lifecycle frame. No `id` — demultiplex on `event`. */
export interface EventEnvelope {
  event: EventKind;
  data: EventData;
}

/** Pane-scoped subscription frames use dotted names and an untagged `data`. */
export interface PaneAgentStatusChangedEvent {
  pane_id: string;
  workspace_id: string;
  agent_status: AgentStatus;
  agent?: string | null;
  title?: string | null;
  display_agent?: string | null;
  state_labels?: StateLabels;
}
export interface PaneScrollChangedEvent {
  pane_id: string;
  workspace_id: string;
  scroll: PaneScrollInfo;
}
export interface PaneOutputMatchedEvent {
  pane_id: string;
  matched_line: string;
  read: PaneReadResult;
}
export type SubscriptionEventEnvelope =
  | { event: 'pane.agent_status_changed'; data: PaneAgentStatusChangedEvent }
  | { event: 'pane.scroll_changed'; data: PaneScrollChangedEvent }
  | { event: 'pane.output_matched'; data: PaneOutputMatchedEvent };

/** Anything pushed down a subscription connection. */
export type AnyEventEnvelope = EventEnvelope | SubscriptionEventEnvelope;

/** True for the snake_case lifecycle envelope (as opposed to a pane-scoped one). */
export function isLifecycleEvent(env: AnyEventEnvelope): env is EventEnvelope {
  return !env.event.includes('.');
}
