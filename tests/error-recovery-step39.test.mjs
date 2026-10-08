import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/application/services/error-recovery-service.js', import.meta.url), 'utf8');
function makeEnv() {
  const listeners = {};
  const auditEvents = [];
  const env = {
    GSP:{application:{services:{audit:{recordEvent:e=>{auditEvents.push(e);}}}}}, console,
    Date, Math,
    addEventListener:(name,fn)=>{listeners[name]=fn;},
    removeEventListener:(name,fn)=>{if(listeners[name]===fn) delete listeners[name];}
  };
  env.window=env;
  vm.runInNewContext(source, env);
  return {env, api:env.GSP.application.services.errorRecovery, auditEvents, listeners};
}

{
  const {api}=makeEnv();
  assert.equal(api.classify(new Error('Failed to fetch')), 'transient');
  assert.equal(api.classify(Object.assign(new Error('JWT expired'), {code:'401'})), 'auth');
  assert.equal(api.classify(new Error('Conflict: stale version')), 'conflict');
  assert.equal(api.classify(new Error('Invalid value')), 'validation');
  assert.equal(api.classify(new Error('IndexedDB quota exceeded')), 'storage');
}
{
  const {api}=makeEnv(); let retried=0;
  const out=api.recover(new Error('network timeout'), {operation:'grades.save'}, {retry:()=>retried++});
  assert.equal(out.kind,'transient'); assert.equal(out.action,'retry'); assert.equal(retried,1);
}
{
  const {api,auditEvents}=makeEnv();
  const a=api.report(new Error('save failed'), {operation:'grades.save',module:'grades',recordId:'s1'}, {now:10000});
  const b=api.report(new Error('save failed'), {operation:'grades.save',module:'grades',recordId:'s1'}, {now:11000});
  assert.equal(a.reported,true); assert.equal(b.reported,false); assert.equal(auditEvents.length,1);
}
{
  const {api,listeners}=makeEnv(); let calls=0;
  api.installGlobalHandlers({handlers:{}, logger:{error(){calls++;}}, now:1});
  listeners.error({error:new Error('unexpected')});
  assert.equal(calls,1);
  assert.equal(api.userMessage('storage').includes('محلياً'), true);
}
console.log('STEP 39 error recovery tests: 4/4 PASS');
