import { execFile } from 'node:child_process';

/**
 * The few git facts the planner needs (spike M4 G7): whether `.planning/STATE.md`
 * is tracked (else a worktree cannot see it) and the repository toplevel (runs are
 * serialised per repository, not per checkout). Read-only; injectable for tests.
 */
export type GitExec = (args: string[], cwd: string) => Promise<{ code: number; stdout: string }>;

export const nodeGitExec: GitExec = (args, cwd) =>
  new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 5000, maxBuffer: 1 << 20 }, (err, stdout) => {
      const code = err ? ((err as NodeJS.ErrnoException & { code?: number | string }).code === 'ENOENT' ? 127 : ((err as { code?: number }).code ?? 1)) : 0;
      resolve({ code: typeof code === 'number' ? code : 1, stdout: String(stdout ?? '') });
    });
  });

export interface GitFacts {
  /** false when `git` is missing or `root` is not inside a work tree */
  isRepo: boolean;
  toplevel?: string;
  branch?: string;
  planningTracked: boolean;
}

export async function gitFacts(root: string, exec: GitExec = nodeGitExec): Promise<GitFacts> {
  const top = await exec(['rev-parse', '--show-toplevel'], root);
  if (top.code !== 0) return { isRepo: false, planningTracked: false };
  const toplevel = top.stdout.trim();
  const branch = await exec(['rev-parse', '--abbrev-ref', 'HEAD'], root);
  const tracked = await exec(['ls-files', '--error-unmatch', '.planning/STATE.md'], root);
  return { isRepo: true, toplevel, branch: branch.code === 0 ? branch.stdout.trim() : undefined, planningTracked: tracked.code === 0 };
}
