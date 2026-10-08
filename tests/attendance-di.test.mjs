import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sandbox = { console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.GSP = {};
vm.runInNewContext(code('js/domain/attendance/workday-policy.js'), sandbox);
vm.runInNewContext(code('js/infrastructure/repositories/attendance-repository.js'), sandbox);
vm.runInNewContext(code('js/application/services/attendance-service.js'), sandbox);

const db = { attendance: { records: {}, saturdayEnabled: false } };
const calls = [];
const repo = sandbox.GSP.createAttendanceRepository({
  loadDB: () => { calls.push('load'); return db; },
  saveDB: value => { calls.push('save'); return value; },
  ensureAttendance: value => value.attendance
});
const service = sandbox.GSP.createAttendanceService({
  repository: repo,
  policy: sandbox.GSP.attendanceWorkdayPolicy,
  todayISO: () => '2026-09-10',
  addDaysISO: (iso, days) => days === -31 ? '2026-08-10' : iso,
  findTermMonthForDate: () => ({ term: 'first', month: 1 }),
  isAttendanceMonthLocked: () => false,
  collectSchoolHolidaySet: () => new Set(),
  recordKey: (...args) => args.join('|'),
  scheduleCloudPush: () => {}
});

if (service.getDatabase() !== db) throw new Error('DI service did not use injected repository');
const gate = service.validateDate('2026-09-10');
if (!gate.ok) throw new Error('Valid working day was rejected');
service.writeMark('S1', 'Math', 'first', 1, '2026-09-10', 'absent');
if (db.attendance.records['S1|Math|first|1|2026-09-10'] !== 'غ') throw new Error('Injected repository did not persist attendance mark');
if (!calls.includes('save')) throw new Error('Repository save was not called');
console.log('attendance DI smoke test passed ✓');
