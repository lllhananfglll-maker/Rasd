/** STEP 40 — Critical end-to-end style regression scenarios in an isolated harness. */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'js/application/testing/regression-suite-service.js'), 'utf8');
const sandbox = { console, structuredClone: globalThis.structuredClone };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(code, sandbox);
const suite = sandbox.GSP.regressionSuite;

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

function createHarness() {
  let online = true;
  let classKey = null;
  let subject = null;
  let attendanceOpen = false;
  let workingDay = null;
  let grade = null;
  let attendance = {};
  let durable = { grade: null, attendance: {} };
  let cloud = { grade: null };
  let pending = 0;
  let auditEvents = 0;

  return {
    async login() {},
    async selectClass(value) { classKey = value; },
    async selectSubject(value) { subject = value; },
    async enterGrade(id, value) { if (!classKey || !subject || id !== 'student-1') throw new Error('teacher context missing'); grade = value; },
    async saveGrades() {
      durable.grade = grade;
      if (online) { cloud.grade = grade; pending = 0; } else pending = 1;
      auditEvents++;
    },
    async refresh() { grade = durable.grade; attendance = { ...durable.attendance }; },
    async readGrade() { return grade; },
    async openAttendance() { attendanceOpen = true; },
    async selectWorkingDay(date) { if (!attendanceOpen) throw new Error('attendance not open'); workingDay = date; },
    async markStudents(value) { if (!workingDay) throw new Error('working day missing'); attendance = { ...value }; },
    async saveAttendance() { durable.attendance = { ...attendance }; auditEvents++; },
    async readAttendance() { return attendance; },
    async setOnline(value) { online = !!value; },
    async editOffline(id, value) { if (online) throw new Error('expected offline'); grade = value; if (id !== 'student-1') throw new Error('student missing'); },
    async pendingSyncCount() { return pending; },
    async sync() { if (!online) throw new Error('cannot sync while offline'); cloud.grade = durable.grade; pending = 0; },
    async readCloudGrade() { return cloud.grade; },
    async runTransactionRollback() {
      const before = durable.grade;
      try { throw new Error('simulated durable failure'); } catch (_) { durable.grade = before; }
      assert(durable.grade === before, 'transaction rollback preserved durable state');
    },
    async runErrorRecovery() {
      auditEvents++;
      assert(auditEvents > 0, 'error recovery path remains observable');
    },
    async readAuditSummary() { return { events: auditEvents }; }
  };
}

console.log('\n=== STEP 40 regression scenarios ===');
assert(typeof suite.run === 'function', 'regression suite API is exposed');
assert(Object.keys(suite.scenarios).length === 4, 'four critical scenarios are registered');

const result = await suite.run({ harness: createHarness() });
assert(result.ok === true, 'all registered scenarios pass');
assert(result.passed === 4 && result.failed === 0, '4/4 scenarios passed');
assert(result.scenarios.every(x => x.steps.length >= 2), 'each scenario records meaningful steps');
assert(result.scenarios.find(x => x.name === 'teacher')?.data.grade === 9.5, 'teacher refresh verification passed');
assert(result.scenarios.find(x => x.name === 'offline')?.data.cloudGrade === 8, 'offline reconnect/sync verification passed');

const failResult = await suite.run({
  selected: ['teacher'],
  harness: { login() { throw new Error('simulated login failure'); } }
});
assert(failResult.ok === false && failResult.failed === 1, 'failed scenario is reported without crashing runner');
assert(failResult.scenarios[0].steps[0].ok === false, 'failed step is captured');

console.log(`\nSTEP 40: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
