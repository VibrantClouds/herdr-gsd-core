import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { BindingStore, findPlanningRoot, type Binding } from './bindings';

const b = (workspaceId: string, root: string, over: Partial<Binding> = {}): Binding => ({
  workspaceId,
  root,
  role: 'observer',
  via: 'pane_cwd',
  updatedAt: 1,
  ...over,
});

test('store: set/get/delete/roots/byRoot, save and reload with validation', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-bind-'));
  const file = path.join(d, 'state', 'bindings.json');
  const s = new BindingStore(file);
  assert.deepEqual(await s.load(), { dropped: [] });
  s.set(b('w1', '/a', { role: 'driver', driverPaneId: 'w1:p1' }));
  s.set(b('w2', '/a'));
  s.set(b('w3', '/b'));
  assert.deepEqual(s.roots().sort(), ['/a', '/b']);
  assert.equal(s.byRoot('/a').length, 2);
  assert.equal(s.get('w1')?.driverPaneId, 'w1:p1');
  assert.equal(s.delete('w3'), true);
  assert.equal(s.delete('w3'), false);
  await s.save();
  const s2 = new BindingStore(file);
  const r = await s2.load(async (p) => p.startsWith('/a'));
  assert.deepEqual(r.dropped, []);
  assert.equal(s2.all().length, 2);
  s2.set(b('w9', '/gone'));
  await s2.save();
  const s3 = new BindingStore(file);
  const r3 = await s3.load(async (p) => p.startsWith('/a'));
  assert.deepEqual(r3.dropped, ['w9']);
  assert.equal(s3.get('w9'), undefined);
});

test('store tolerates corrupt or odd files', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-bind-'));
  const file = path.join(d, 'bindings.json');
  await fs.writeFile(file, '{"bindings": [null, {"workspaceId": 1}, {"workspaceId":"w","root":"/r","role":"weird","via":"manual","updatedAt":0}]}');
  const s = new BindingStore(file);
  await s.load(async () => true);
  assert.equal(s.all().length, 1);
  assert.equal(s.get('w')?.role, 'observer');
  await fs.writeFile(file, '{"bindings": "no"}');
  const s2 = new BindingStore(file);
  await s2.load(async () => true);
  assert.equal(s2.all().length, 0);
  await fs.writeFile(file, 'garbage');
  const s3 = new BindingStore(file);
  await s3.load();
  assert.equal(s3.all().length, 0);
});

test('findPlanningRoot walks up to .git boundary', async () => {
  const have = new Set(['/repo/.git', '/repo/.planning/STATE.md', '/repo/sub/deep', '/mono/.git', '/mono/apps/x/.planning/PROJECT.md', '/other/.git']);
  const exists = async (p: string) => have.has(p);
  assert.equal(await findPlanningRoot('/repo/sub/deep', exists), '/repo');
  assert.equal(await findPlanningRoot('/repo', exists), '/repo');
  assert.equal(await findPlanningRoot('/mono/apps/x/src', exists), '/mono/apps/x');
  assert.equal(await findPlanningRoot('/mono/apps', exists), undefined);
  assert.equal(await findPlanningRoot('/other/src', exists), undefined);
  assert.equal(await findPlanningRoot('/nowhere/at/all', exists), undefined);
  assert.equal(await findPlanningRoot('/a/b/c/d/e/f/g/h/i/j/k/l/m/n', async () => false, 3), undefined);
});

test('findPlanningRoot on the real filesystem (fixture)', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd-bind-'));
  await fs.mkdir(path.join(d, '.planning'));
  await fs.writeFile(path.join(d, '.planning', 'PROJECT.md'), '# p');
  await fs.mkdir(path.join(d, 'src', 'x'), { recursive: true });
  assert.equal(await findPlanningRoot(path.join(d, 'src', 'x')), d);
});
