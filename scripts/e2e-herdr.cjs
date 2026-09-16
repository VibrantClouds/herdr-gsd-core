#!/usr/bin/env node
/*
 * End-to-end against a REAL Herdr server (spec §10 "E2E (CI)", M5):
 *   1. start `herdr --session <name> server` headless
 *   2. seed a git repo from the `executing` fixture and open it as a workspace
 *   3. run this plugin's daemon against that session (own config + state dirs, orchestration enabled)
 *   4. assert via `herdr api snapshot` that `$gsd_phase $gsd_step $gsd_status $gsd_next` appear
 *   5. plan a phase run and an isolated run through the control socket (no harness is started)
 *   6. with E2E_RUN=1 and a real harness on PATH: start a phase run, watch it, stop it
 *   7. stop the daemon and the session, remove the temp dirs
 *
 * Never touches the default session: everything is scoped to `--session` and to
 * a temp state/config dir, so the owner's linked plugin and daemon are untouched.
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SESSION = process.env.E2E_SESSION || `gsd-e2e-${process.pid}`;
const HERDR = process.env.HERDR_BIN || 'herdr';
const NODE = process.execPath;
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS || 30_000);

function log(msg) {
  process.stdout.write(`[e2e] ${msg}\n`);
}
function fail(msg) {
  process.stderr.write(`[e2e] FAIL ${msg}\n`);
  process.exitCode = 1;
  throw new Error(msg);
}
function herdr(args, opts = {}) {
  const r = spawnSync(HERDR, ['--session', SESSION, ...args], { encoding: 'utf8', timeout: 20_000, ...opts });
  if (r.error) throw r.error;
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function herdrJson(args) {
  const r = herdr(args);
  if (r.code !== 0) throw new Error(`herdr ${args.join(' ')} exited ${r.code}: ${r.stderr}`);
  const line = r.stdout.trim().split('\n').find((l) => l.startsWith('{'));
  return line ? JSON.parse(line) : undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** One NDJSON request on the session socket (the CLI prints some results as plain text, not JSON). */
function socketCall(socketPath, method, params) {
  return new Promise((resolve, reject) => {
    const net = require('node:net');
    const sock = net.createConnection(socketPath);
    let buf = '';
    const t = setTimeout(() => { sock.destroy(); reject(new Error(`${method} timed out`)); }, 10_000);
    sock.on('connect', () => sock.write(JSON.stringify({ id: 'e2e', method, params }) + '\n'));
    sock.on('data', (d) => { buf += d; const nl = buf.indexOf('\n'); if (nl >= 0) { clearTimeout(t); sock.end(); try { resolve(JSON.parse(buf.slice(0, nl))); } catch (e) { reject(e); } } });
    sock.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}
async function waitFor(label, fn, ms = TIMEOUT_MS) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try {
      v = await fn();
    } catch {
      v = undefined;
    }
    if (v) return v;
    if (Date.now() - t0 > ms) fail(`timeout waiting for ${label}`);
    await sleep(250);
  }
}

async function main() {
  const which = spawnSync(HERDR, ['--version'], { encoding: 'utf8' });
  if (which.error || which.status !== 0) fail(`herdr binary not usable (${HERDR})`);
  log(`herdr ${which.stdout.trim()} · session ${SESSION}`);

  // E2E_REPO_DIR lets a live run (E2E_RUN=1) put the repo under a directory Claude Code already trusts,
  // since folder trust is inherited from ancestors (docs/spikes/M4-orchestration.md H3).
  const parent = process.env.E2E_REPO_DIR ? path.resolve(process.env.E2E_REPO_DIR) : os.tmpdir();
  fs.mkdirSync(parent, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(parent, 'gsd-e2e-'));
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  fs.cpSync(path.join(ROOT, 'test', 'fixtures', 'planning', '1.14', 'executing', '.planning'), path.join(repo, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'README.md'), '# e2e fixture\n');
  const git = (a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'e2e', GIT_AUTHOR_EMAIL: 'e2e@example.com', GIT_COMMITTER_NAME: 'e2e', GIT_COMMITTER_EMAIL: 'e2e@example.com' } });
  git(['init', '-q', '-b', 'main']);
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'fixture']);

  const sessionDir = path.join(os.homedir(), '.config', 'herdr', 'sessions', SESSION);
  const socket = path.join(sessionDir, 'herdr.sock');
  const server = spawn(HERDR, ['--session', SESSION, 'server'], { stdio: ['ignore', 'pipe', 'pipe'], detached: false });
  let serverOut = '';
  server.stdout.on('data', (d) => (serverOut += d));
  server.stderr.on('data', (d) => (serverOut += d));
  let daemon;
  const stateDir = path.join(tmp, 'state');
  const configDir = path.join(tmp, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  // E2E_HARNESS_ENV="KEY=VALUE,KEY2=VALUE2" → [harness.claude-code.env] (e.g. CLAUDE_CONFIG_DIR for a GSD-specific root)
  const harnessEnv = (process.env.E2E_HARNESS_ENV || '').split(',').filter(Boolean).map((kv) => kv.split('='));
  const envToml = harnessEnv.length ? `[harness.claude-code.env]\n${harnessEnv.map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join('\n')}\n` : '';
  fs.writeFileSync(path.join(configDir, 'config.toml'), `[orchestration]\nenabled = true\nstart_timeout_ms = 90000\n[notify]\nsound = "none"\n${envToml}`);
  const env = { ...process.env, HERDR_SOCKET_PATH: socket, HERDR_BIN_PATH: HERDR, HERDR_PLUGIN_ID: 'herdr-gsd-core', HERDR_PLUGIN_ROOT: ROOT, HERDR_PLUGIN_STATE_DIR: stateDir, HERDR_PLUGIN_CONFIG_DIR: configDir };
  delete env.HERDR_WORKSPACE_ID;
  delete env.HERDR_PANE_ID;
  const cli = (args, timeout = 30_000) => {
    const r = spawnSync(NODE, [path.join(ROOT, 'packages', 'cli', 'dist', 'main.js'), ...args, '--json'], { encoding: 'utf8', env, timeout, cwd: ROOT });
    if (r.error) throw r.error;
    const line = (r.stdout || '').trim().split('\n').filter(Boolean).at(-1);
    return { code: r.status, json: line && line.startsWith('{') || (line && line.startsWith('[')) ? JSON.parse(line) : undefined, raw: (r.stdout || '') + (r.stderr || '') };
  };

  try {
    await waitFor('server socket', () => fs.existsSync(socket) && herdr(['api', 'snapshot']).code === 0);
    log('server up');
    const ws = herdrJson(['workspace', 'create', '--cwd', repo, '--label', 'e2e', '--no-focus']);
    const wsId = ws.result.workspace.workspace_id;
    log(`workspace ${wsId} at ${repo}`);

    daemon = spawn(NODE, [path.join(ROOT, 'packages', 'cli', 'dist', 'main.js'), 'daemon', 'run'], { env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let daemonOut = '';
    daemon.stdout.on('data', (d) => (daemonOut += d));
    daemon.stderr.on('data', (d) => (daemonOut += d));
    daemon.on('exit', (code) => log(`daemon exited ${code}`));
    // never let a CLI call race the daemon's own start-up (it would spawn a second instance)
    await waitFor('daemon control socket', () => {
      const r = cli(['daemon', 'status'], 5_000);
      return r.json && r.json.pid ? r.json : undefined;
    });
    log(`daemon pid ${cli(['daemon', 'status'], 5_000).json.pid}`);

    // M1 acceptance for real: tokens on the workspace
    const t0 = Date.now();
    const tokens = await waitFor('workspace tokens', () => {
      const snap = herdrJson(['api', 'snapshot']);
      const w = snap?.result?.snapshot?.workspaces?.find((x) => x.workspace_id === wsId);
      return w?.tokens?.gsd_phase && w.tokens.gsd_status && w.tokens.gsd_next ? w.tokens : undefined;
    });
    log(`tokens after ${Date.now() - t0} ms: ${JSON.stringify(tokens)}`);
    for (const k of ['gsd_phase', 'gsd_step', 'gsd_status', 'gsd_next']) if (!tokens[k]) fail(`missing token ${k}`);
    if (tokens.gsd_err) fail(`gsd_err set: ${tokens.gsd_err}`);

    // STATE change → tokens update
    const state = path.join(repo, '.planning', 'STATE.md');
    fs.writeFileSync(state, fs.readFileSync(state, 'utf8') + '\n## Needs Human\n| 02 | needs_human | e2e marker |\n');
    const blocked = await waitFor('gsd_status blocked after Needs Human', () => {
      const w = herdrJson(['api', 'snapshot']).result.snapshot.workspaces.find((x) => x.workspace_id === wsId);
      return w?.tokens?.gsd_status === 'blocked' ? w.tokens : undefined;
    });
    log(`Needs Human → ${blocked.gsd_status}`);
    const refused = cli(['orchestrate', 'plan', '--root', repo]);
    if (refused.json?.ok !== false || !refused.json.reasons.some((r) => r.includes('Needs Human'))) fail(`plan should refuse on Needs Human: ${refused.raw}`);
    log('plan refused while Needs Human is present');
    git(['checkout', '--', '.planning/STATE.md']);
    await waitFor('gsd_status back', () => {
      const w = herdrJson(['api', 'snapshot']).result.snapshot.workspaces.find((x) => x.workspace_id === wsId);
      return w?.tokens?.gsd_status && w.tokens.gsd_status !== 'blocked' ? true : undefined;
    });

    // M4 planning through the control socket (no harness started). The daemon's snapshot converges a
    // moment after the file revert (filesystem pass first, gsd-tools enrichment pass later), so poll.
    const plan = await waitFor('phase plan ok', () => {
      const r = cli(['orchestrate', 'plan', '--root', repo]);
      return r.json?.ok ? r : undefined;
    });
    log(`phase plan ok: ${plan.json.command} (${plan.json.kind})`);
    const iso = cli(['orchestrate', 'plan', '--unit', 'phase-isolated', '--root', repo]);
    if (!iso.json?.ok) fail(`isolated plan refused: ${iso.raw}`);
    if (!/^gsd\/phase-\d\d-/.test(iso.json.branch || '')) fail(`unexpected branch ${iso.json.branch}`);
    log(`isolated plan ok: branch ${iso.json.branch}`);
    const bad = cli(['orchestrate', 'plan', '--root', repo, '--command', 'rm -rf /']);
    if (bad.json?.ok !== false) fail('non-GSD command must be refused');

    if (process.env.E2E_RUN === '1') {
      const kind = plan.json.kind;
      const found = spawnSync('sh', ['-c', `command -v ${kind}`], { encoding: 'utf8' });
      if (found.status !== 0) fail(`E2E_RUN=1 but ${kind} is not on PATH`);
      const started = cli(['orchestrate', 'phase', '--root', repo, '--command', process.env.E2E_COMMAND || 'help'], 150_000);
      if (!started.json?.run) fail(`run refused: ${started.raw}`);
      const runId = started.json.run.id;
      log(`run ${runId} ${started.json.run.status} in pane ${started.json.run.target.paneId}${started.json.run.reason ? ` (${started.json.run.reason})` : ''}`);
      const screen = async (paneId) => {
        const r = await socketCall(socket, 'pane.read', { pane_id: paneId, source: 'visible', strip_ansi: true }).catch(() => undefined);
        return String(r?.result?.read?.text || '').trim().split('\n').filter((l) => l.trim()).slice(-8).join('\n');
      };
      let answeredTrust = false;
      const settled = await waitFor(
        'run to settle',
        async () => {
          const r = cli(['orchestrate', 'list', '--root', repo]).json?.find((x) => x.id === runId);
          if (!r) return undefined;
          if (r.status === 'waiting' && r.waitingFor === 'startup_input' && !answeredTrust) {
            const text = await screen(r.target.paneId);
            log(`startup input requested; screen:\n${text}`);
            if (process.env.E2E_ANSWER_TRUST === '1' && /trust this folder/i.test(text)) {
              // our own throwaway repo: accept the dialog the way a user would (spike M4 H3)
              herdr(['agent', 'send-keys', r.target.paneId, 'down', 'enter']);
              answeredTrust = true;
              log('answered the folder-trust dialog');
              return undefined;
            }
            return r;
          }
          if (r.status === 'waiting' && r.waitingFor === 'startup_input') return undefined; // answered; wait for the prompt path
          return ['done', 'waiting', 'failed', 'cancelled'].includes(r.status) ? r : undefined;
        },
        Number(process.env.E2E_RUN_TIMEOUT_MS || 180_000),
      );
      log(`run settled: ${settled.status}${settled.waitingFor ? '/' + settled.waitingFor : ''} — ${settled.reason || ''}`);
      if (settled.status === 'failed') fail(`run failed: ${settled.reason}`);
      if (settled.waitingFor === 'startup_input') log('harness never reached idle (set E2E_ANSWER_TRUST=1 to accept a trust dialog on this throwaway repo)');
      else if (settled.prompts.length !== 1) fail(`expected exactly one prompt, got ${settled.prompts.length}`);
      if (settled.waitingFor === 'stalled') log(`stalled (the harness did not react to ${settled.command}); screen:\n${await screen(settled.target.paneId)}`);
      if (settled.status === 'done') log(`done; screen:\n${await screen(settled.target.paneId)}`);
      const agents = herdrJson(['agent', 'list']).result.agents;
      if (!agents.some((a) => a.pane_id === settled.target.paneId && a.agent === kind)) fail(`no ${kind} agent detected in run pane ${settled.target.paneId}`);
      const stop = cli(['orchestrate', 'stop', '--run', runId], 60_000);
      log(`stop: ${JSON.stringify(stop.json?.[0]?.run?.reason || stop.json?.[0])}`);
      const panes = herdrJson(['api', 'snapshot']).result.snapshot.panes;
      if (settled.status !== 'done' && panes.some((p) => p.pane_id === settled.target.paneId)) fail('run pane still open after stop');
    }
    log('OK');
  } finally {
    try {
      cli(['daemon', 'stop'], 10_000);
    } catch {
      /* ignore */
    }
    if (daemon && daemon.exitCode === null) daemon.kill('SIGTERM');
    const stop = spawnSync(HERDR, ['session', 'stop', SESSION], { encoding: 'utf8', timeout: 20_000 });
    if (stop.status !== 0) server.kill('SIGTERM');
    await sleep(500);
    spawnSync(HERDR, ['session', 'delete', SESSION], { encoding: 'utf8', timeout: 10_000 });
    if (process.exitCode) {
      process.stderr.write(`--- herdr server output (tail)\n${serverOut.slice(-1500)}\n`);
      try {
        const logs = fs.readdirSync(stateDir, { recursive: true }).filter((f) => String(f).endsWith('gsdd.log'));
        for (const f of logs) process.stderr.write(`--- ${f} (tail)\n${fs.readFileSync(path.join(stateDir, String(f)), 'utf8').split('\n').slice(-40).join('\n')}\n`);
      } catch {
        /* no logs */
      }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  process.stderr.write(`[e2e] ${e.stack || e}\n`);
  process.exit(1);
});
