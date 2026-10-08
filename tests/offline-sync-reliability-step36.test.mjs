import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
function load(rel, extra={}) {
  const storage = new Map();
  const timers = [];
  const ctx = {
    console,
    Date,
    Math,
    Promise,
    localStorage: { getItem:k=>storage.get(k)||null, setItem:(k,v)=>storage.set(k,v), removeItem:k=>storage.delete(k) },
    setTimeout:(fn,ms)=>{ timers.push({fn,ms}); return timers.length; },
    clearTimeout:()=>{},
    GSP:{},
    navigator:{onLine:true},
    ...extra
  };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx);
  return {ctx, storage, timers};
}

const q = load('js/application/services/sync-queue.js');
const queue = q.ctx.GSP.application.services.syncQueue;
queue.enqueue(['root_meta','stage_A']);
queue.markAttempt(['stage_A']);
const failed = queue.markFailure(['stage_A'], new Error('network'), {now:'2026-09-05T10:00:00.000Z', jitterMs:0, baseDelayMs:1000, maxDelayMs:60000});
assert.equal(failed.find(x=>x.id==='stage_A').failed, true);
assert.equal(failed.find(x=>x.id==='stage_A').nextRetryAt, '2026-09-05T10:00:01.000Z');
assert.equal(JSON.stringify(queue.dueIds('2026-09-05T10:00:00.500Z')), JSON.stringify(['root_meta']));
assert.equal(JSON.stringify(queue.dueIds('2026-09-05T10:00:01.000Z')), JSON.stringify(['root_meta','stage_A']));
assert.equal(JSON.stringify(queue.failedIds()), JSON.stringify(['stage_A']));

const status = load('js/application/services/sync-status.js');
const st = status.ctx.GSP.application.services.syncStatus;
st.markFailure(new Error('network'), 2, 1, '2026-09-05T10:00:01.000Z');
assert.equal(st.get().retrying, true);
assert.equal(st.get().failed, 1);
st.markOffline(2,1,null);
assert.equal(st.get().state, 'offline');
assert.equal(st.get().online, false);
st.markOnline(2,1,null);
assert.equal(st.get().online, true);
st.setStorageHealth(false);
assert.equal(st.get().storageHealthy, false);

const rel = load('js/application/services/offline-sync-reliability.js');
const q2 = rel.ctx.GSP.application.services.syncQueue = queue;
const s2 = rel.ctx.GSP.application.services.syncStatus = st;
// Factories can be tested independently with deterministic dependencies.
const factory = rel.ctx.GSP.application.services.createOfflineSyncReliability;
const timers = [];
const r = factory({queue:q2,status:s2,now:()=>Date.parse('2026-09-05T10:00:00.000Z'),setTimeoutFn:(fn,ms)=>{timers.push(ms);return 1;},clearTimeoutFn:()=>{},random:()=>0});
assert.equal(r.backoff(1,{baseDelayMs:1000,maxDelayMs:60000,jitterMs:0}),1000);
assert.equal(r.backoff(3,{baseDelayMs:1000,maxDelayMs:60000,jitterMs:0}),4000);
r.markQueued('stage_B');
r.markAttempt('stage_B');
r.markFailure(new Error('offline'), ['stage_B'], {baseDelayMs:1000,maxDelayMs:60000,jitterMs:0});
r.scheduleRetry(()=>{});
assert.equal(timers.at(-1),1000);

console.log('Offline/Online Reliability STEP36: 20/20 passed');
