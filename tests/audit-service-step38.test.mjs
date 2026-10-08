import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/application/services/audit-service.js', import.meta.url), 'utf8');

function makeEnv(overrides = {}) {
  const store = new Map();
  const calls = [];
  const env = {
    GSP: { application: { services: {} } },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,String(v)) },
    navigator: { onLine: true },
    addEventListener() {},
    document: { visibilityState: 'hidden' },
    currentUserLabel: () => 'المعلم: أحمد',
    currentAccountType: 'teacher',
    currentStageId: 'stage_primary_ar',
    getStageRecord: () => ({ name: 'ابتدائي عربي' }),
    APP_VERSION: 'test',
    cloudAvailable: false,
    supabaseClient: { from() { throw new Error('offline'); } },
    Date,
    Math,
    JSON,
    structuredClone,
    console,
    ...overrides
  };
  if (env.cloudAvailable) {
    env.supabaseClient = {
      from(table) {
        calls.push({ table });
        return { insert: async rows => { calls.push({ rows }); return { error: null }; }, select(){return this;}, order(){return this;}, limit(){return Promise.resolve({data:[],error:null});} };
      }
    };
  }
  env.window = env;
  vm.runInNewContext(source, env);
  return { env, store, calls, api: env.GSP.application.services.audit };
}

{
  const { api } = makeEnv();
  const result = api.recordChange({ action:'grades.save', module:'grades', record:{id:'g1'}, before:{score:5}, after:{score:7}, reason:'تصحيح', outcome:'success' });
  assert.equal(result.ok, true);
  assert.equal(result.queued, true);
  assert.equal(api.pendingCount(), 1);
  const row = api.toRow({ eventId:'e1', timestamp:'2026-09-05T10:00:00.000Z', actor:{name:'A',role:'teacher'}, action:'grades.save', module:'grades', location:{stageId:'s1',stageName:'Stage'}, record:{id:'g1'}, before:{score:5}, after:{score:7}, reason:'تصحيح', outcome:'success', transactionId:'tx1', level:'info', details:'ok', appVersion:'1' });
  const detail = JSON.parse(row.details);
  assert.equal(detail.before.score, 5);
  assert.equal(detail.after.score, 7);
  assert.equal(detail.reason, 'تصحيح');
  assert.equal(detail.transactionId, 'tx1');
}

{
  const { api } = makeEnv({ cloudAvailable:true });
  api.record({ action:'login', details:'دخول' });
  await api.flush();
  assert.equal(api.pendingCount(), 0);
}

{
  const { api, env } = makeEnv({ cloudAvailable:false });
  api.record({ action:'save', details:'x' });
  assert.equal(api.pendingCount(), 1);
  env.cloudAvailable = true;
  env.supabaseClient = { from(){ return { insert: async () => ({error:null}) }; } };
  const out = await api.flush();
  assert.equal(out.ok, true);
  assert.equal(out.flushed, 1);
  assert.equal(api.pendingCount(), 0);
}

{
  const { api } = makeEnv();
  const big = Array.from({length: 500}, (_,i)=>({id:i, value:'x'.repeat(100)}));
  const row = api.toRow({eventId:'e',timestamp:new Date().toISOString(),actor:{},location:{},action:'bulk',module:'grades',record:null,before:big,after:big,reason:'',outcome:'success',level:'info',details:''});
  assert.ok(row.details.length <= 18000);
}

console.log('STEP 38 audit service tests: 4/4 PASS');

{
  const auditEvents = [];
  const audit = {
    snapshotSummary: value => ({seen: value && value.value}),
    recordChange: event => { auditEvents.push(event); return {ok:true}; }
  };
  const txSource = fs.readFileSync(new URL('../js/application/services/transaction-service.js', import.meta.url), 'utf8');
  const env = { GSP:{application:{services:{audit}}}, structuredClone, console };
  env.window = env;
  vm.runInNewContext(txSource, env);
  const tx = env.GSP.application.createTransactionService({audit});
  let live = { value: 1 };
  const result = tx.executeSync({label:'grades.save', load:()=>live, save:d=>{live=d;}, rollback:d=>{live=d;}, work:d=>{d.value=2; return 1;}});
  const committed = await result.persistence;
  assert.equal(committed.ok, true);
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].outcome, 'success');
  assert.equal(auditEvents[0].before.value, 1);
  assert.equal(auditEvents[0].after.value, 2);
}

console.log('STEP 38 transaction audit integration: 1/1 PASS');
