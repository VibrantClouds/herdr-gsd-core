import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/**
 * workspace_id ↔ project root ↔ role (spec §4.1.4), persisted to bindings.json
 * and validated (root still exists) on load.
 */
export type Role = 'driver' | 'observer';

export interface Binding {
  workspaceId: string;
  root: string;
  role: Role;
  /** pane id that hosts the harness process, when known */
  driverPaneId?: string;
  /** how the root was found */
  via: 'pane_cwd' | 'worktree' | 'manual' | 'event';
  updatedAt: number;
}

export class BindingStore {
  private map = new Map<string, Binding>();

  constructor(private readonly file: string) {}

  async load(exists: (p: string) => Promise<boolean> = defaultExists): Promise<{ dropped: string[] }> {
    const dropped: string[] = [];
    let raw: Binding[] = [];
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8')) as { bindings?: Binding[] };
      raw = Array.isArray(parsed.bindings) ? parsed.bindings : [];
    } catch {
      raw = [];
    }
    for (const b of raw) {
      if (!b || typeof b.workspaceId !== 'string' || typeof b.root !== 'string') continue;
      if (!(await exists(path.join(b.root, '.planning')))) {
        dropped.push(b.workspaceId);
        continue;
      }
      this.map.set(b.workspaceId, { ...b, role: b.role === 'driver' ? 'driver' : 'observer' });
    }
    return { dropped };
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ bindings: [...this.map.values()] }, null, 2));
    await fs.rename(tmp, this.file);
  }

  set(b: Binding): void {
    this.map.set(b.workspaceId, b);
  }

  get(workspaceId: string): Binding | undefined {
    return this.map.get(workspaceId);
  }

  delete(workspaceId: string): boolean {
    return this.map.delete(workspaceId);
  }

  all(): Binding[] {
    return [...this.map.values()];
  }

  /** Every distinct project root currently bound. */
  roots(): string[] {
    return [...new Set(this.all().map((b) => b.root))];
  }

  byRoot(root: string): Binding[] {
    return this.all().filter((b) => b.root === root);
  }
}

async function defaultExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk up from `cwd` to the git toplevel (or filesystem root) looking for a
 * `.planning/` that contains STATE.md or PROJECT.md (spec §4.1.1). Stops at the
 * first `.git` boundary found *after* a `.planning` check, so a project nested
 * in a monorepo binds to its own `.planning`.
 */
export async function findPlanningRoot(cwd: string, exists: (p: string) => Promise<boolean> = defaultExists, maxDepth = 12): Promise<string | undefined> {
  let dir = path.resolve(cwd);
  for (let i = 0; i < maxDepth; i++) {
    const planning = path.join(dir, '.planning');
    if ((await exists(path.join(planning, 'STATE.md'))) || (await exists(path.join(planning, 'PROJECT.md')))) return dir;
    if (await exists(path.join(dir, '.git'))) return undefined;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}
