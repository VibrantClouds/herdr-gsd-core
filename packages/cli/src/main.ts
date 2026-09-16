#!/usr/bin/env node
/**
 * `herdr-gsd` — short-lived argv entrypoints used by herdr-plugin.toml
 * (spec §2.2). Talks to gsdd over the control socket; never touches the Herdr
 * socket directly except to show an error notification (spec §12.6 prefers
 * HERDR_BIN_PATH for that).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { daemonPaths, pluginEnv, ensureDaemon, stopDaemon, controlCall, ControlError, type EnsureResult, runDaemon, DAEMON_VERSION } from '@herdr-gsd/daemon';

interface Ctx {
  env: ReturnType<typeof pluginEnv>;
  paths: ReturnType<typeof daemonPaths>;
  json: boolean;
}

function usage(): string {
  return `usage: herdr-gsd <command>
  daemon ensure|run|restart|stop|status
  status                       daemon + project summary
  project list|rescan [root]   list bound projects / force a rescan
  notify test                  send a test notification through gsdd
  event                        handle a Herdr plugin event (HERDR_PLUGIN_EVENT_JSON)
  adapter install|uninstall|doctor <claude-code|codex|opencode|all> [--global|--local <dir>]
  config init|path|show        create the commented default config.toml if missing / print its path / show the effective config
  dashboard open               open the dashboard pane (via herdr plugin pane open); the manifest action "dashboard" wraps this
  orchestrate plan|phase|isolated|autonomous [--root <dir>] [--command "<gsd cmd>"] [--phase N] [--from N] [--to N] [--dry-run]
  orchestrate stop [--run <id>|--all] [--discard]     stop the run(s) of the current workspace/project
  orchestrate list|status [--root <dir>]              runs (status also shows a notification)
options: --json`;
}

function out(ctx: Ctx, human: string, data?: unknown): void {
  if (ctx.json && data !== undefined) process.stdout.write(JSON.stringify(data) + '\n');
  else process.stdout.write(human + '\n');
}

function daemonArgv(): string[] {
  return [process.execPath, __filename, 'daemon', 'run'];
}

async function ensure(ctx: Ctx): Promise<EnsureResult> {
  fs.mkdirSync(ctx.paths.dir, { recursive: true });
  return ensureDaemon({
    pidFile: ctx.paths.pidFile,
    controlSocket: ctx.paths.controlSocket,
    disabledMarker: ctx.paths.disabledMarker,
    spawnArgv: daemonArgv(),
    env: process.env,
    cwd: ctx.env.pluginRoot,
  });
}

/** Best-effort error surfacing via `herdr notification show` (spec §2.3.5). */
function notifyError(ctx: Ctx, title: string, body: string): void {
  try {
    spawnSync(ctx.env.herdrBin, ['notification', 'show', '--title', title.slice(0, 80), '--body', body.slice(0, 240), '--sound', 'none'], { stdio: 'ignore', timeout: 3000 });
  } catch {
    /* ignore */
  }
}

async function call<T = unknown>(ctx: Ctx, method: string, params?: unknown, timeoutMs = 10_000): Promise<T> {
  const r = await ensure(ctx);
  if (r.status === 'disabled' || r.status === 'failed') {
    const msg = `gsdd ${r.status}: ${r.reason}`;
    notifyError(ctx, 'GSD plugin: daemon unavailable', `${r.reason}. See: herdr plugin log list --plugin ${ctx.env.pluginId}`);
    throw new Error(msg);
  }
  return controlCall<T>(ctx.paths.controlSocket, method, params, timeoutMs);
}

async function cmdDaemon(ctx: Ctx, sub: string | undefined): Promise<number> {
  switch (sub) {
    case 'ensure': {
      const r = await ensure(ctx);
      out(ctx, `gsdd ${r.status}${'pid' in r && r.pid ? ` (pid ${r.pid})` : ''}${'reason' in r ? `: ${r.reason}` : ''}`, r);
      if (r.status === 'disabled' || r.status === 'failed') {
        notifyError(ctx, 'GSD plugin: daemon unavailable', `${r.reason}. See: herdr plugin log list --plugin ${ctx.env.pluginId}`);
        return 1;
      }
      return 0;
    }
    case 'run': {
      const d = await runDaemon();
      await d.whenStopped;
      return 0;
    }
    case 'stop': {
      const ok = await stopDaemon({ pidFile: ctx.paths.pidFile, controlSocket: ctx.paths.controlSocket });
      out(ctx, ok ? 'gsdd stopped' : 'gsdd did not stop', { stopped: ok });
      return ok ? 0 : 1;
    }
    case 'restart': {
      await stopDaemon({ pidFile: ctx.paths.pidFile, controlSocket: ctx.paths.controlSocket });
      try {
        fs.unlinkSync(ctx.paths.disabledMarker);
      } catch {
        /* none */
      }
      const r = await ensure(ctx);
      out(ctx, `gsdd ${r.status}`, r);
      return r.status === 'started' || r.status === 'running' ? 0 : 1;
    }
    case 'status': {
      try {
        const s = await controlCall(ctx.paths.controlSocket, 'status', undefined, 3000);
        out(ctx, JSON.stringify(s, null, 2), s);
        return 0;
      } catch (e) {
        const disabled = fs.existsSync(ctx.paths.disabledMarker);
        out(ctx, disabled ? `gsdd disabled: ${fs.readFileSync(ctx.paths.disabledMarker, 'utf8').split('\n')[0]}` : `gsdd not running (${(e as Error).message})`, { running: false, disabled });
        return 1;
      }
    }
    default:
      process.stderr.write(usage() + '\n');
      return 2;
  }
}

function pickRoot(ctx: Ctx, explicit?: string): string | undefined {
  if (explicit) return path.resolve(explicit);
  return undefined;
}

async function main(argv: string[]): Promise<number> {
  const json = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');
  const env = pluginEnv();
  const ctx: Ctx = { env, paths: daemonPaths(env.stateDir, env.herdrSocket), json };
  const [cmd, sub, ...rest] = args;
  try {
    switch (cmd) {
      case 'daemon':
        return await cmdDaemon(ctx, sub);
      case 'status': {
        const s = await call(ctx, 'status');
        out(ctx, JSON.stringify(s, null, 2), s);
        return 0;
      }
      case 'project': {
        if (sub === 'rescan') {
          const r = await call(ctx, 'project.rescan', { root: pickRoot(ctx, rest[0]), workspaceId: env.workspaceId }, 60_000);
          out(ctx, `rescanned: ${JSON.stringify(r)}`, r);
          return 0;
        }
        const list = await call(ctx, 'projects.list');
        out(ctx, JSON.stringify(list, null, 2), list);
        return 0;
      }
      case 'notify': {
        const r = await call(ctx, 'notify.test', { workspaceId: env.workspaceId });
        out(ctx, `notification: ${JSON.stringify(r)}`, r);
        return 0;
      }
      case 'event': {
        let evt: unknown = undefined;
        try {
          evt = process.env.HERDR_PLUGIN_EVENT_JSON ? JSON.parse(process.env.HERDR_PLUGIN_EVENT_JSON) : undefined;
        } catch {
          /* malformed */
        }
        const r = await call(ctx, 'project.rescan', { event: evt, workspaceId: env.workspaceId }, 60_000);
        out(ctx, `event handled: ${JSON.stringify(r)}`, r);
        return 0;
      }
      case 'adapter':
        return await cmdAdapter(ctx, sub, rest);
      case 'orchestrate':
        return await cmdOrchestrate(ctx, sub, rest);
      case 'config':
        return await cmdConfig(ctx, sub);
      case 'dashboard': {
        // Herdr keys bind to plugin *actions*, not panes (plugins.mdx "Keybindings"), so this
        // action makes the dashboard pane bindable: [[keys.command]] type = "plugin_action" command = "herdr-gsd-core.dashboard"
        const r = spawnSync(env.herdrBin, ['plugin', 'pane', 'open', '--plugin', env.pluginId, '--entrypoint', 'dashboard'], { encoding: 'utf8', timeout: 10_000 });
        const line = (r.stdout || '').trim().split('\n').find((l) => l.startsWith('{'));
        out(ctx, r.status === 0 ? `dashboard opened${line ? ': ' + line.slice(0, 200) : ''}` : `could not open the dashboard: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`, { ok: r.status === 0, output: line });
        return r.status === 0 ? 0 : 1;
      }
      case 'version':
      case '--version':
        out(ctx, DAEMON_VERSION, { version: DAEMON_VERSION });
        return 0;
      default:
        process.stderr.write(usage() + '\n');
        return 2;
    }
  } catch (e) {
    const msg = e instanceof ControlError ? `${e.code}: ${e.message}` : (e as Error).message;
    process.stderr.write(`herdr-gsd: ${msg}\n`);
    return 1;
  }
}

/**
 * `config init|path|show`. The daemon writes the commented default file on its first
 * start; `init` does the same on demand (never overwrites), `path` prints where it is,
 * `show` prints the effective config with any warnings. `init` and `path` also raise a
 * Herdr notification so the manifest action `config` can be used from the action palette.
 */
async function cmdConfig(ctx: Ctx, sub: string | undefined): Promise<number> {
  const file = path.join(ctx.env.configDir, 'config.toml');
  const { DEFAULT_CONFIG_TOML, loadConfig } = await import('@herdr-gsd/core');
  switch (sub ?? 'init') {
    case 'init':
    case 'path': {
      let created = false;
      if (!fs.existsSync(file)) {
        fs.mkdirSync(ctx.env.configDir, { recursive: true });
        fs.writeFileSync(file, DEFAULT_CONFIG_TOML, { flag: 'wx' });
        created = true;
      }
      const cli = path.join(ctx.env.pluginRoot, 'bin', 'herdr-gsd');
      out(ctx, `${created ? 'wrote' : 'config'}: ${file}\nedit it, then run the "GSD: restart daemon" action\nCLI: ${cli}`, { file, created, cli });
      if (!ctx.json) notifyError(ctx, created ? 'GSD plugin: config.toml created' : 'GSD plugin: config.toml', `${file} — edit, then "GSD: restart daemon". CLI: ${cli}`);
      return 0;
    }
    case 'show': {
      const loaded = await loadConfig(file);
      const text = [`file: ${file}${loaded.missing ? ' (missing: defaults in effect; run config init)' : ''}`, ...loaded.warnings.map((w) => `warning: ${w}`), JSON.stringify(loaded.config, null, 2)].join('\n');
      out(ctx, text, { file, missing: loaded.missing, warnings: loaded.warnings, config: loaded.config });
      return loaded.warnings.length ? 1 : 0;
    }
    default:
      process.stderr.write(usage() + '\n');
      return 2;
  }
}

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

interface RunLike {
  id: string;
  unit: string;
  status: string;
  waitingFor?: string;
  command: string;
  reason?: string;
  warnings: string[];
  target: { paneId: string; workspaceId: string; worktree?: { path: string; branch: string } };
}
interface PlanLike {
  ok: boolean;
  reasons: string[];
  warnings: string[];
  command?: string;
  branch?: string;
  kind?: string;
}

function describe(r: RunLike): string {
  const where = r.target.worktree ? `${r.target.worktree.branch} @ ${r.target.worktree.path}` : r.target.paneId || '(no pane)';
  const state = r.status + (r.waitingFor ? '/' + r.waitingFor : '');
  return `${r.id}  ${r.unit.padEnd(14)} ${state.padEnd(22)} ${r.command}  → ${where}${r.reason ? `\n    ${r.reason}` : ''}`;
}

function bullets(items: string[], label: string): string {
  return items.length ? `\n  ${label}:\n  - ${items.join('\n  - ')}` : '';
}

/** M4 actions (spec §7.3): every one goes through gsdd; the daemon plans and refuses with sentences. */
async function cmdOrchestrate(ctx: Ctx, sub: string | undefined, rest: string[]): Promise<number> {
  const root = pickRoot(ctx, flag(rest, '--root'));
  const scope = { root, workspaceId: root ? undefined : ctx.env.workspaceId };
  const unitOf: Record<string, string> = { phase: 'phase', isolated: 'phase-isolated', 'phase-isolated': 'phase-isolated', autonomous: 'autonomous' };
  switch (sub) {
    case 'plan':
    case 'phase':
    case 'isolated':
    case 'phase-isolated':
    case 'autonomous': {
      const unit = sub === 'plan' ? (unitOf[flag(rest, '--unit') ?? 'phase'] ?? 'phase') : unitOf[sub]!;
      const spec = { ...scope, unit, command: flag(rest, '--command'), phase: flag(rest, '--phase'), from: flag(rest, '--from'), to: flag(rest, '--to') };
      if (sub === 'plan' || rest.includes('--dry-run')) {
        const plan = await call<PlanLike>(ctx, 'orchestrate.plan', spec, 30_000);
        out(ctx, plan.ok ? `ok: would send ${plan.command} (${plan.kind}${plan.branch ? `, branch ${plan.branch}` : ''})${bullets(plan.warnings, 'warnings')}` : `refused:${bullets(plan.reasons, 'reasons')}`, plan);
        return plan.ok ? 0 : 1;
      }
      const r = await call<{ run?: RunLike; plan: PlanLike }>(ctx, 'orchestrate.start', { ...spec, confirm: true }, 120_000);
      if (!r.run) {
        out(ctx, `refused:${bullets(r.plan.reasons, 'reasons')}`, r);
        notifyError(ctx, 'GSD orchestrate: refused', r.plan.reasons[0] ?? 'see herdr-gsd orchestrate plan');
        return 1;
      }
      out(ctx, `started ${describe(r.run)}${bullets(r.run.warnings, 'warnings')}`, r);
      return r.run.status === 'failed' ? 1 : 0;
    }
    case 'stop': {
      const runId = flag(rest, '--run');
      const r = await call<Array<{ stopped: boolean; reason?: string; run?: RunLike }>>(ctx, 'orchestrate.stop', { ...(runId ? { runId } : scope), all: rest.includes('--all'), discard: rest.includes('--discard') }, 120_000);
      out(ctx, r.map((x) => (x.stopped && x.run ? `stopped ${describe(x.run)}` : `not stopped: ${x.reason ?? 'unknown'}`)).join('\n'), r);
      return r.every((x) => x.stopped) ? 0 : 1;
    }
    case 'list': {
      const r = await call<RunLike[]>(ctx, 'orchestrate.list', scope);
      out(ctx, r.length ? r.map(describe).join('\n') : 'no runs', r);
      return 0;
    }
    case 'status': {
      const r = await call<{ active: number; runs: RunLike[] }>(ctx, 'orchestrate.status', { notify: !ctx.json });
      out(ctx, r.active ? r.runs.map(describe).join('\n') : 'no active runs', r);
      return 0;
    }
    default:
      process.stderr.write(usage() + '\n');
      return 2;
  }
}

interface AdapterModule {
  install(opts: AdapterOpts): Promise<AdapterResult>;
  uninstall(opts: AdapterOpts): Promise<AdapterResult>;
  doctor(opts: AdapterOpts): Promise<{ ok: boolean; findings: Array<{ level: string; message: string }> }>;
}
interface AdapterOpts {
  scope: 'global' | 'local';
  dir?: string;
  pluginRoot: string;
  spoolDir: string;
  /** process env plus `[harness.<name>.env]` from config.toml for keys the process lacks (e.g. CLAUDE_CONFIG_DIR) */
  env: NodeJS.ProcessEnv;
}
interface AdapterResult {
  file?: string;
  changed?: boolean;
  message?: string;
  [k: string]: unknown;
}

const ADAPTERS = ['claude-code', 'codex', 'opencode'] as const;

/**
 * `adapter install|uninstall|doctor <harness|all>`. The harness config root comes from the
 * process env (CLAUDE_CONFIG_DIR, CODEX_HOME, OPENCODE_CONFIG_DIR) and, when the process lacks
 * it, from `[harness.<name>.env]` in config.toml — so the manifest actions, which run under
 * Herdr's environment rather than your shell's, still install into the root GSD uses.
 */
async function cmdAdapter(ctx: Ctx, sub: string | undefined, rest: string[]): Promise<number> {
  const which = rest[0];
  if (!sub || !which || !(which === 'all' || (ADAPTERS as readonly string[]).includes(which))) {
    process.stderr.write(usage() + '\n');
    return 2;
  }
  if (which === 'all') {
    let worst = 0;
    for (const h of ADAPTERS) worst = Math.max(worst, await cmdAdapter(ctx, sub, [h, ...rest.slice(1)]));
    return worst;
  }
  const harness = which;
  const { loadConfig } = await import('@herdr-gsd/core');
  const cfg = (await loadConfig(path.join(ctx.env.configDir, 'config.toml'))).config;
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(cfg.harness[harness]?.env ?? {})) if (env[k] === undefined || env[k] === '') env[k] = v;
  const localIdx = rest.indexOf('--local');
  const opts: AdapterOpts = {
    scope: localIdx >= 0 ? 'local' : 'global',
    dir: localIdx >= 0 ? path.resolve(rest[localIdx + 1] ?? process.cwd()) : undefined,
    pluginRoot: ctx.env.pluginRoot,
    spoolDir: ctx.paths.spoolDir,
    env,
  };
  const modPath = path.join(ctx.env.pluginRoot, 'packages', 'adapters', harness, 'dist', 'index.js');
  if (!fs.existsSync(modPath)) {
    process.stderr.write(`adapter not built: ${modPath} (run npm run build)\n`);
    return 1;
  }
  const mod = require(modPath) as AdapterModule;
  fs.mkdirSync(opts.spoolDir, { recursive: true });
  switch (sub) {
    case 'install': {
      const r = await mod.install(opts);
      out(ctx, `${harness}: installed${r.file ? ` → ${r.file}` : ''}${r.message ? ` (${r.message})` : ''}`, r);
      if (!ctx.json) notifyError(ctx, `GSD adapter installed: ${harness}`, `${r.file ?? ''} — start a new ${harness} session to see pane tokens`);
      return 0;
    }
    case 'uninstall': {
      const r = await mod.uninstall(opts);
      out(ctx, `${harness}: uninstalled${r.file ? ` ← ${r.file}` : ''}${r.message ? ` (${r.message})` : ''}`, r);
      return 0;
    }
    case 'doctor': {
      const r = await mod.doctor(opts);
      out(ctx, r.findings.map((f) => `${f.level.padEnd(5)} ${f.message}`).join('\n') + `\n${harness}: ${r.ok ? 'ok' : 'problems found'}`, r);
      if (!ctx.json) {
        const first = r.findings.find((f) => f.level === 'error') ?? r.findings.find((f) => f.level === 'warn');
        notifyError(ctx, `GSD adapter ${harness}: ${r.ok ? 'ok' : 'not ready'}`, first ? first.message : 'installed and healthy');
      }
      return r.ok ? 0 : 1;
    }
    default:
      process.stderr.write(usage() + '\n');
      return 2;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`herdr-gsd: ${(e as Error).stack ?? e}\n`);
      process.exit(1);
    },
  );
}

export { main };
