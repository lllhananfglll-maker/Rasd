import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
function load(rel, extra={}) {
  const storage = new Map();
  const ctx = { console, localStorage: { getItem:k=>storage.get(k)||null, setItem:(k,v)=>storage.set(k,v), removeItem:k=>storage.delete(k) }, GSP:{}, ...extra };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx);
  return {ctx, storage};
}

const q = load('js/application/services/sync-queue.js');
const queue = q.ctx.GSP.application.services.syncQueue;
queue.enqueue(['root_meta','stage_A']);
queue.enqueue('stage_A');
assert.equal(JSON.stringify(queue.ids()), JSON.stringify(['root_meta','stage_A']));
queue.markAttempt('stage_A');
assert.equal(queue.peek().find(x=>x.id==='stage_A').attempts,1);
queue.remove('root_meta');
assert.equal(JSON.stringify(queue.ids()), JSON.stringify(['stage_A']));

const r = load('js/application/services/conflict-resolver.js');
const resolver = r.ctx.GSP.application.services.conflictResolver;
assert.equal(resolver.isRemoteNewer(null,'2026-09-05T10:00:00Z'), true);
assert.equal(resolver.isRemoteNewer('2026-09-05T10:00:00Z','2026-09-05T09:00:00Z'), false);
assert.equal(resolver.findFieldConflict(10,11,12).remote,11);
assert.equal(resolver.findFieldConflict(10,12,12),null);

const s = load('js/application/services/sync-status.js');
const status=s.ctx.GSP.application.services.syncStatus;
status.markSuccess(2);
assert.equal(status.get().pending,2);
assert.ok(status.get().lastSuccessAt);
status.markFailure(new Error('offline'),2);
assert.equal(status.get().state,'error');
assert.equal(status.get().failed,1);

console.log('Sync architecture STEP35: 13/13 passed');
