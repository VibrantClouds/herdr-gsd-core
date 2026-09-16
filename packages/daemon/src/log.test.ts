import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Logger } from './log';

test('writes levels above threshold, formats data, rotates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-log-'));
  const file = path.join(dir, 'log', 'gsdd.log');
  const log = new Logger({ file, level: 'info', maxBytes: 200, keep: 3, now: () => new Date(0) });
  log.debug('hidden');
  log.info('hello', { a: 1 });
  log.warn('warned', new Error('bad'));
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  log.error('circ', circular);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!text.includes('hidden'));
  assert.ok(text.includes('1970-01-01T00:00:00.000Z info  hello {"a":1}'));
  assert.ok(text.includes('warn  warned Error: bad'));
  assert.ok(text.includes('[unserializable]'));
  for (let i = 0; i < 20; i++) log.info('x'.repeat(50));
  assert.ok(fs.existsSync(`${file}.1`));
  assert.ok(fs.existsSync(`${file}.2`));
  assert.ok(!fs.existsSync(`${file}.3`));
  const child = log.child('sub');
  child.info('from child');
  assert.ok(fs.readFileSync(file, 'utf8').includes('[sub] from child'));
});

test('no file: only stderr mirror, never throws', () => {
  const log = new Logger({ stderr: false });
  log.info('nothing');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-log-'));
  fs.writeFileSync(path.join(dir, 'notadir'), '');
  const bad = new Logger({ file: path.join(dir, 'notadir', 'x.log') });
  bad.error('still fine');
});

test('picks up existing file size', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-log-'));
  const file = path.join(dir, 'a.log');
  fs.writeFileSync(file, 'x'.repeat(150));
  const log = new Logger({ file, maxBytes: 160 });
  log.info('rotate me please');
  assert.ok(fs.existsSync(`${file}.1`));
});
