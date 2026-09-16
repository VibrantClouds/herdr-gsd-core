/**
 * Redaction allow-list unit tests (spec §5.4). This is the SOURCE-OF-TRUTH copy
 * of the module; the codex/opencode adapters get it verbatim via
 * `scripts/copy-shared.cjs`, and `copy-shared --check` guards the drift.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { MAX_AGENT_DETAIL, MAX_DETAIL, agentFromToolInput, isAgentTool, redactBash, redactDetail, relativePath, shellSplit } from './redact';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CWD = '/home/user/myproj';

test('shellSplit honours simple single and double quotes and backslash escapes', () => {
  assert.deepEqual(shellSplit(`curl -H 'Authorization: Bearer x' https://e.com`), ['curl', '-H', 'Authorization: Bearer x', 'https://e.com']);
  assert.deepEqual(shellSplit('a  "b c"   d'), ['a', 'b c', 'd']);
  assert.deepEqual(shellSplit('echo hello\\ world'), ['echo', 'hello world']);
  assert.deepEqual(shellSplit(''), []);
  assert.deepEqual(shellSplit('   '), []);
  assert.deepEqual(shellSplit("echo ''"), ['echo', '']);
});

test('bash detail keeps at most the first 3 argv tokens', () => {
  assert.equal(redactBash('git log --oneline -n 5 --graph'), 'git log --oneline');
  assert.equal(redactBash('ls'), 'ls');
});

test('tokens naming a credential are replaced by ***', () => {
  assert.equal(redactBash('curl -H "X-Api-Key: abc"'), 'curl -H ***');
  assert.equal(redactBash('foo --token abc'), 'foo *** ***', 'a flag naming a credential also redacts its value');
  assert.equal(redactBash('vault read secret/db'), 'vault read ***');
  assert.equal(redactBash('curl -u bearer hunter2'), 'curl -u ***');
});

test('Bearer redacts the following token as well', () => {
  assert.equal(redactBash('Bearer abcdefgh rest'), '*** *** rest');
});

test('credential-shaped tokens are replaced even without a naming hint', () => {
  assert.equal(redactBash('deploy sk-ABCDEFGHIJ now'), 'deploy *** now');
  assert.equal(redactBash('gh auth ghp_ABCDEFGHIJKLMNOP'), 'gh *** ***');
  assert.equal(redactBash('post xoxb-1234567890-abc x'), 'post *** x');
  assert.equal(redactBash(`check ${'a1b2c3d4'.repeat(4)} x`), 'check *** x');
});

test('NAME=value prefixes drop the value, keeping the variable name', () => {
  assert.equal(redactBash('API_KEY=sk-FAKE456 curl https://api.example.com/v1/upload'), 'API_KEY=*** curl https://api.example.com/v1/upload');
  assert.equal(redactBash('SECRET=x ./run.sh'), 'SECRET=*** ./run.sh');
  assert.equal(redactBash('NODE_ENV=production npm start'), 'NODE_ENV=production npm start');
  assert.equal(redactBash('FOO=sk-ABCDEFGHIJ npm start'), 'FOO=*** npm start');
});

test('file tool detail is project-relative and never leaks an outside path', () => {
  assert.equal(relativePath('/home/user/myproj/src/a.ts', CWD), 'src/a.ts');
  assert.equal(relativePath('src/a.ts', CWD), 'src/a.ts');
  assert.equal(relativePath('/etc/shadow', CWD), 'shadow');
  assert.equal(relativePath('/home/user/other/secrets/prod.env', CWD), 'prod.env');
  assert.equal(relativePath(CWD, CWD), 'myproj');
  assert.equal(relativePath('', CWD), '');
});

test('redactDetail dispatches per harness tool spelling', () => {
  assert.equal(redactDetail('Bash', { command: 'npm test' }, CWD), 'npm test');
  assert.equal(redactDetail('bash', { command: 'npm test' }, CWD), 'npm test');
  assert.equal(redactDetail('shell', { command: ['bash', '-lc', 'npm test'] }, CWD), 'bash -lc npm');
  assert.equal(redactDetail('Edit', { file_path: '/home/user/myproj/src/a.ts' }, CWD), 'src/a.ts');
  assert.equal(redactDetail('edit', { filePath: '/home/user/myproj/src/a.ts' }, CWD), 'src/a.ts');
  assert.equal(redactDetail('NotebookEdit', { notebook_path: '/home/user/myproj/nb.ipynb' }, CWD), 'nb.ipynb');
  assert.equal(redactDetail('Agent', { subagent_type: 'gsd-executor', prompt: 'secret plan' }, CWD), 'gsd-executor');
  assert.equal(redactDetail('Task', { description: 'Execute phase 03' }, CWD), 'Execute phase 03');
  assert.equal(redactDetail('WebFetch', { url: 'https://example.com?token=abc' }, CWD), 'WebFetch');
  assert.equal(redactDetail('Glob', undefined, CWD), 'Glob');
});

test('agent-tool helpers cover Agent and the legacy Task alias', () => {
  assert.ok(isAgentTool('Agent'));
  assert.ok(isAgentTool('task'));
  assert.ok(!isAgentTool('Bash'));
  assert.ok(!isAgentTool(undefined));
  assert.equal(agentFromToolInput({ subagent_type: 'gsd-verifier' }), 'gsd-verifier');
  assert.equal(agentFromToolInput({ agent_type: 'Explore' }), 'Explore');
  assert.equal(agentFromToolInput(undefined), undefined);
  assert.equal(agentFromToolInput({}), undefined);
  assert.equal(agentFromToolInput({ subagent_type: 'x'.repeat(200) })?.length, MAX_AGENT_DETAIL);
});

test('detail is capped at 200 chars', () => {
  const d = redactDetail('Bash', { command: `echo ${'y-'.repeat(500)}` }, CWD);
  assert.equal(d?.length, MAX_DETAIL);
});

test('agent description is capped at 60 chars', () => {
  const d = redactDetail('Agent', { description: 'z'.repeat(500) }, CWD);
  assert.equal(d?.length, MAX_AGENT_DETAIL);
});

test('no prompt, stdin or stdout ever reaches detail', () => {
  const d = redactDetail('Agent', { subagent_type: 'gsd-executor', prompt: 'TOP SECRET PROMPT' }, CWD);
  assert.ok(!(d ?? '').includes('TOP SECRET'));
});

test('every secret-bearing fixture across all 3 harnesses redacts cleanly', () => {
  const cases: ReadonlyArray<{ file: string; tool: (o: Record<string, unknown>) => string; input: (o: Record<string, unknown>) => unknown }> = [
    {
      file: 'claude-code/PreToolUse.bash-bearer-secret.json',
      tool: (o) => String(o.tool_name),
      input: (o) => o.tool_input,
    },
    {
      file: 'claude-code/PreToolUse.bash-apikey-env-prefix.json',
      tool: (o) => String(o.tool_name),
      input: (o) => o.tool_input,
    },
    { file: 'codex/PreToolUse.bash-bearer-secret.json', tool: (o) => String(o.tool_name), input: (o) => o.tool_input },
    { file: 'opencode/tool.execute.before.bash-bearer-secret.json', tool: (o) => String(o.tool), input: (o) => o.args },
  ];
  for (const c of cases) {
    const raw = readFileSync(path.join(REPO_ROOT, 'test', 'fixtures', 'hooks', c.file), 'utf8');
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const detail = redactDetail(c.tool(payload), c.input(payload), CWD) ?? '';
    for (const frag of ['sk-FAKE123', 'sk-FAKE456', 'FAKE123', 'FAKE456']) {
      assert.ok(!detail.includes(frag), `${c.file}: leaked ${frag} in "${detail}"`);
    }
    assert.ok(detail.includes('***'), `${c.file}: expected a redaction marker, got "${detail}"`);
  }
});

test('the shared modules are byte-identical across the three adapters', () => {
  for (const file of ['emit.ts', 'redact.ts', 'hookfile.ts']) {
    const src = readFileSync(path.join(REPO_ROOT, 'packages', 'adapters', 'claude-code', 'src', file), 'utf8');
    for (const pkg of ['codex', 'opencode']) {
      const copy = readFileSync(path.join(REPO_ROOT, 'packages', 'adapters', pkg, 'src', file), 'utf8');
      assert.ok(copy.endsWith(src), `${pkg}/src/${file} is out of date — run: node scripts/copy-shared.cjs`);
      assert.ok(copy.startsWith('// GENERATED FILE'), `${pkg}/src/${file} is missing the generated banner`);
    }
  }
});
