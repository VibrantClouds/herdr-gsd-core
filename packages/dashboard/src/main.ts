import { DashboardApp } from './app';
import { DashboardClient } from './client';
import { renderFrame } from './render';

/**
 * Pane entrypoint (`[[panes]] command = ["node", "packages/dashboard/dist/main.js"]`).
 *
 *   --socket <path>   control socket override (default: derived from the plugin env)
 *   --once            render a single frame to stdout and exit (smoke checks / tests)
 *   --no-color        disable ANSI colour
 *   --timeout <ms>    how long `--once` waits for the first snapshot (default 1500)
 */
export interface Args {
  socket?: string;
  once: boolean;
  colors: boolean;
  timeoutMs: number;
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env, isTty = !!process.stdout.isTTY): Args {
  const args: Args = { once: false, colors: isTty && !env.NO_COLOR, timeoutMs: 1500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--socket') args.socket = argv[++i];
    else if (a.startsWith('--socket=')) args.socket = a.slice('--socket='.length);
    else if (a === '--once') args.once = true;
    else if (a === '--no-color' || a === '--no-colour') args.colors = false;
    else if (a === '--color' || a === '--colour') args.colors = true;
    else if (a === '--timeout') args.timeoutMs = Number(argv[++i]) || args.timeoutMs;
    else if (a.startsWith('--timeout=')) args.timeoutMs = Number(a.slice('--timeout='.length)) || args.timeoutMs;
  }
  return args;
}

/** Resolve once the client has projects, or when `timeoutMs` elapses. */
async function waitForData(client: DashboardClient, timeoutMs: number): Promise<void> {
  if (client.connected && client.projects.length) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      off();
      resolve();
    };
    const off = client.onChange(() => {
      if (client.connected && client.projects.length) done();
    });
    const timer = setTimeout(done, timeoutMs);
  });
}

export async function main(argv: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const args = parseArgs(argv, env);
  const client = new DashboardClient({ socketPath: args.socket, env });

  if (args.once) {
    await client.start();
    await waitForData(client, args.timeoutMs);
    const size = { cols: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 };
    const rows = renderFrame(
      { connected: client.connected, projects: client.projects, selected: 0, lastUpdateAt: client.lastUpdateAt, now: Date.now() },
      size,
      { colors: args.colors },
    );
    process.stdout.write(rows.join('\n') + '\n');
    client.stop();
    return 0;
  }

  const app = new DashboardApp({ client, colors: args.colors });
  await app.start();
  return 0;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  void main(argv).then(
    (code) => {
      // `--once` exits naturally once the client's timers are cleared, so stdout flushes
      if (code) process.exit(code);
    },
    (err: unknown) => {
      process.stderr.write(`gsd dashboard: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      process.exit(1);
    },
  );
}
