import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Run records (spec §7.2, amended by spike M4 §3): one JSON file per run under
 * `$STATE_DIR/<socket-hash>/orchestration/`. They survive daemon restarts; on
 * resync the daemon re-attaches to the pane by id.
 */
export type RunUnit = 'phase' | 'phase-isolated' | 'autonomous';
export type RunStatus = 'planned' | 'starting' | 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';
export type WaitingFor = 'startup_input' | 'agent_blocked' | 'human_stop' | 'stalled';

export interface RunTarget {
  workspaceId: string;
  paneId: string;
  /** `agent.start` alias; follows the pane occupant */
  agentName: string;
  cwd: string;
  /** set for isolated runs: the checkout the plugin created (removal handle = workspaceId) */
  worktree?: { path: string; branch: string; workspaceId: string };
}

export interface RunRecord {
  v: 1;
  id: string;
  /** project root (the `.planning` the run was planned from) */
  project: string;
  /** git toplevel of `project`, used to serialise runs per repository */
  repo: string;
  unit: RunUnit;
  /** the GSD command sent, e.g. `/gsd-execute-phase 3` */
  command: string;
  harness: string;
  kind: string;
  target: RunTarget;
  /** the pane was split by the plugin (closed on stop); false when the run reused an existing pane */
  createdPane: boolean;
  startedAt: number;
  updatedAt: number;
  status: RunStatus;
  /** human-readable explanation for waiting / failed / cancelled / done */
  reason?: string;
  waitingFor?: WaitingFor;
  prompts: Array<{ ts: number; text: string }>;
  lastAgentStatus?: string;
  /** true once `working` was observed after the last prompt (stall detection) */
  sawWorking: boolean;
  /** Herdr's `state_change_seq` right after the last prompt: any advance means the agent reacted even if the event was missed */
  seqAtPrompt?: number;
  phaseAtStart?: string;
  resumes: number;
  warnings: string[];
  exit?: { at: number; reason: string };
}

export const ACTIVE_STATUSES: readonly RunStatus[] = ['planned', 'starting', 'running', 'waiting'];

export function isActive(run: RunRecord): boolean {
  return ACTIVE_STATUSES.includes(run.status);
}

export function newRunId(now: number): string {
  return `${new Date(now).toISOString().slice(0, 19).replace(/[-:T]/g, '')}-${randomBytes(3).toString('hex')}`;
}

export class RunStore {
  private runs = new Map<string, RunRecord>();

  constructor(readonly dir: string) {}

  async load(): Promise<{ loaded: number; corrupt: string[] }> {
    const corrupt: string[] = [];
    let names: string[] = [];
    try {
      names = (await fs.readdir(this.dir)).filter((n) => n.endsWith('.json'));
    } catch {
      return { loaded: 0, corrupt };
    }
    for (const n of names) {
      try {
        const raw = JSON.parse(await fs.readFile(path.join(this.dir, n), 'utf8')) as RunRecord;
        if (raw && raw.v === 1 && typeof raw.id === 'string' && raw.target && typeof raw.status === 'string') this.runs.set(raw.id, { ...raw, warnings: raw.warnings ?? [], prompts: raw.prompts ?? [], resumes: raw.resumes ?? 0, sawWorking: raw.sawWorking ?? false });
        else corrupt.push(n);
      } catch {
        corrupt.push(n);
      }
    }
    return { loaded: this.runs.size, corrupt };
  }

  private saving = new Map<string, Promise<void>>();
  private tmpSeq = 0;

  /** Atomic write; saves of the same run are serialised so concurrent event handlers never race on the temp file. */
  save(run: RunRecord): Promise<void> {
    this.runs.set(run.id, run);
    const snapshot = JSON.stringify(run, null, 2);
    const prev = this.saving.get(run.id) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        await fs.mkdir(this.dir, { recursive: true });
        const file = path.join(this.dir, `${run.id}.json`);
        const tmp = `${file}.${process.pid}.${++this.tmpSeq}.tmp`;
        await fs.writeFile(tmp, snapshot);
        await fs.rename(tmp, file);
      });
    this.saving.set(run.id, next);
    void next.finally(() => {
      if (this.saving.get(run.id) === next) this.saving.delete(run.id);
    });
    return next;
  }

  get(id: string): RunRecord | undefined {
    return this.runs.get(id);
  }

  all(): RunRecord[] {
    return [...this.runs.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  active(): RunRecord[] {
    return this.all().filter(isActive);
  }

  byProject(root: string): RunRecord[] {
    return this.all().filter((r) => r.project === root);
  }

  byPane(paneId: string): RunRecord | undefined {
    return this.active().find((r) => r.target.paneId === paneId);
  }

  /** Drop finished records older than `maxAgeMs`, keeping at most `keep` finished ones. */
  async prune(now: number, maxAgeMs = 7 * 86_400_000, keep = 50): Promise<number> {
    const finished = this.all().filter((r) => !isActive(r));
    const victims = finished.filter((r, i) => i >= keep || now - r.updatedAt > maxAgeMs);
    for (const v of victims) {
      this.runs.delete(v.id);
      await fs.unlink(path.join(this.dir, `${v.id}.json`)).catch(() => undefined);
    }
    return victims.length;
  }
}
