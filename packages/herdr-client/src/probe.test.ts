import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { HerdrClient, LogLevel } from './client';
import { parseMethodCatalogue, probeMethods } from './probe';

/** Loaded at runtime: see the note in `client.test.ts`. */
interface FakeLike {
  socketPath: string;
  unknownMethodMessage?: (method: string) => string;
  close(): Promise<void>;
}
const { FakeHerdr } = require('@herdr-gsd/fake-herdr') as { FakeHerdr: { start(o?: { socketPath?: string }): Promise<FakeLike> } };

async function startFake(): Promise<FakeLike> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'herdr-probe-'));
  return FakeHerdr.start({ socketPath: path.join(dir, 'herdr.sock') });
}

const REAL_MESSAGE =
  'invalid request: unknown variant `gsd.probe_unknown_method`, expected one of `ping`, `server.stop`, `session.snapshot`, ' +
  '`workspace.list`, `pane.report_metadata`, `plugin.pane.close` at line 1 column 52';

test('parseMethodCatalogue extracts the backtick-quoted method list', () => {
  const methods = parseMethodCatalogue(REAL_MESSAGE);
  assert.deepEqual(methods, ['ping', 'server.stop', 'session.snapshot', 'workspace.list', 'pane.report_metadata', 'plugin.pane.close']);
  assert.ok(!methods?.includes('gsd.probe_unknown_method'), 'the probe method itself is dropped');
});

test('parseMethodCatalogue gives up on messages it does not recognise', () => {
  assert.equal(parseMethodCatalogue('invalid request: something else entirely'), undefined);
  assert.equal(parseMethodCatalogue('invalid request: unknown variant `gsd.probe_unknown_method`'), undefined);
});

test('probeMethods reports version, protocol and which required methods exist', async () => {
  const fake = await startFake();
  try {
    const client = new HerdrClient({ socketPath: fake.socketPath, source: 'plugin:herdr-gsd-core', timeoutMs: 2000 });
    const result = await probeMethods(client, ['ping', 'session.snapshot', 'pane.report_metadata', 'pane.report_agent', 'layout.apply']);
    assert.equal(result.version, '0.9.0');
    assert.equal(result.protocol, 22);
    assert.deepEqual(result.present, ['ping', 'session.snapshot', 'pane.report_metadata']);
    assert.deepEqual(result.missing, ['pane.report_agent', 'layout.apply']);
    assert.ok((result.catalogue?.length ?? 0) > 10);
  } finally {
    await fake.close();
  }
});

test('probeMethods falls back to "everything present" and warns when the message is unparseable', async () => {
  const fake = await startFake();
  try {
    fake.unknownMethodMessage = () => 'invalid request: nothing useful here';
    const client = new HerdrClient({ socketPath: fake.socketPath, source: 'plugin:herdr-gsd-core', timeoutMs: 2000 });
    const warnings: string[] = [];
    const log = (level: LogLevel, message: string): void => {
      if (level === 'warn') warnings.push(message);
    };
    const result = await probeMethods(client, ['ping', 'not.a.method'], log);
    assert.deepEqual(result.present, ['ping', 'not.a.method']);
    assert.deepEqual(result.missing, []);
    assert.equal(result.catalogue, undefined);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /could not parse/);
  } finally {
    await fake.close();
  }
});
