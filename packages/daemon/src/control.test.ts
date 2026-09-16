import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as net from 'node:net';
import { promises as fs } from 'node:fs';
import { ControlServer, ControlClient, ControlError, controlCall } from './control';

async function sockPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-ctl-'));
  return path.join(dir, 'c.sock');
}

test('request/response, errors, unknown method, subscribe + broadcast', async () => {
  const p = await sockPath();
  const srv = new ControlServer(p);
  srv.register('ping', () => ({ pong: true }));
  srv.register('echo', (params) => params);
  srv.register('void', () => undefined);
  srv.register('boom', () => {
    throw new ControlError('nope', 'refused');
  });
  srv.register('crash', () => {
    throw new Error('generic');
  });
  await srv.listen();
  assert.deepEqual(srv.methods().sort(), ['boom', 'crash', 'echo', 'ping', 'void']);

  const c = new ControlClient(p);
  await c.connect();
  assert.equal(c.connected, true);
  assert.deepEqual(await c.request('ping'), { pong: true });
  assert.deepEqual(await c.request('echo', { a: 1 }), { a: 1 });
  assert.equal(await c.request('void'), null);
  await assert.rejects(c.request('boom'), (e: ControlError) => e.code === 'nope' && e.message === 'refused');
  await assert.rejects(c.request('crash'), (e: ControlError) => e.code === 'internal' && e.message === 'generic');
  await assert.rejects(c.request('nothing'), (e: ControlError) => e.code === 'unknown_method');

  const got: unknown[] = [];
  c.on('event', (name, params) => got.push([name, params]));
  await c.subscribe(['snapshot.changed']);
  srv.broadcast('snapshot.changed', { x: 1 });
  srv.broadcast('other', { y: 2 });
  srv.broadcast('other', { z: 3 }, true);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(got, [
    ['snapshot.changed', { x: 1 }],
    ['other', { z: 3 }],
  ]);
  assert.equal(srv.connectionCount(), 1);

  const oneShot = await controlCall(p, 'ping');
  assert.deepEqual(oneShot, { pong: true });

  c.close();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(srv.connectionCount(), 0);
  await srv.close();
  await assert.rejects(fs.access(p));
});

test('client rejects when not connected and on socket close; timeout', async () => {
  const p = await sockPath();
  const srv = new ControlServer(p);
  srv.register('slow', () => new Promise(() => undefined));
  await srv.listen();
  const c = new ControlClient(p, { timeoutMs: 50 });
  await assert.rejects(c.request('ping'), (e: ControlError) => e.code === 'not_connected');
  await c.connect();
  await assert.rejects(c.request('slow'), (e: ControlError) => e.code === 'timeout');
  const pending = c.request('slow');
  pending.catch(() => undefined);
  await srv.close();
  await assert.rejects(pending, /closed|ECONNRESET/);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(c.connected, false);
});

test('server tolerates garbage lines and wildcard subscriptions', async () => {
  const p = await sockPath();
  const srv = new ControlServer(p);
  srv.register('ping', () => 1);
  await srv.listen();
  const raw = net.createConnection(p);
  await new Promise((r) => raw.once('connect', r));
  let out = '';
  raw.setEncoding('utf8');
  raw.on('data', (d: string) => (out += d));
  raw.write('not json\n{"id":1}\n{"id":2,"method":"subscribe"}\n\n{"id":3,"method":"ping"}\n');
  await new Promise((r) => setTimeout(r, 50));
  srv.broadcast('anything', 7);
  await new Promise((r) => setTimeout(r, 30));
  const lines = out.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[0].error.code, 'bad_json');
  assert.equal(lines[1].error.code, 'bad_request');
  assert.deepEqual(lines[2].result, { subscribed: ['*'] });
  assert.equal(lines[3].result, 1);
  assert.deepEqual(lines[4], { event: 'anything', params: 7 });
  raw.destroy();
  await srv.close();
});

test('client ignores unparseable and unmatched frames', async () => {
  const p = await sockPath();
  const socks: net.Socket[] = [];
  const srv = net.createServer((s) => {
    socks.push(s);
    s.write('garbage\n{"id":999,"ok":true,"result":1}\n{"id":1,"ok":true,"result":"hi"}\n');
  });
  await new Promise<void>((r) => srv.listen(p, r));
  const c = new ControlClient(p);
  await c.connect();
  assert.equal(await c.request('x'), 'hi');
  c.close();
  for (const s of socks) s.destroy();
  await new Promise<void>((r) => srv.close(() => r()));
});

test('connect fails on missing socket', async () => {
  const c = new ControlClient('/nope/none.sock');
  await assert.rejects(c.connect());
});
