import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../js/application/services/monitor-service.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(code, context);

const factory = context.window.GSP?.application?.services?.createMonitorService;
assert.equal(typeof factory, 'function');

const calls = [];
const analytics = {
  studentSubjectScore: (...args) => { calls.push(['student', args]); return 1; },
  computeTeacherMetrics: (...args) => { calls.push(['teacher', args]); return 2; },
  classMetrics: (...args) => { calls.push(['class', args]); return 3; }
};
const service = factory({ analytics });
const db = { id: 1 }, student = { id: 2 }, subject = { name: 'Math' }, teacher = { name: 'T' };
assert.equal(service.studentSubjectScore(db, student, subject), 1);
assert.equal(service.computeTeacherMetrics(db, teacher), 2);
assert.equal(service.classMetrics(db), 3);
assert.deepEqual(calls.map(x => x[0]), ['student', 'teacher', 'class']);
assert.equal(Object.isFrozen(service), true);
console.log('monitor-service.test.mjs: 6 passed');
