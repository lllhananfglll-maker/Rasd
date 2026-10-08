import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/application/ports/attendance-legacy-boundary.js', import.meta.url), 'utf8');

const required = [
  'loadDB', 'saveDB', 'ensureAttendance', 'gspTodayISO',
  'getMonthCalendarDays', 'getSubjectStudyDays', 'isAttendanceMonthLocked',
  'collectSchoolHolidaySet', 'recordKey', 'subjectDaysKey'
];

const context = { console };
context.window = context;
context.GSP = {};
for (const name of required) context[name] = (...args) => ({ name, args });
vm.runInNewContext(source, context);

const factory = context.GSP.application.ports.createAttendanceLegacyBoundary;
assert.equal(typeof factory, 'function');
const deps = factory();
for (const name of required) assert.equal(typeof deps[name], 'function', `${name} should be injected`);

const fallback = deps.classSectionKey('A', '1');
assert.equal(fallback, 'A§1');
assert.equal(deps.classSectionLabel('X'), 'X');
assert.equal(deps.escapeHtml('<x>'), '<x>');
assert.equal(Object.isFrozen(deps), true);

// GSP takes precedence over a same-named window capability.
let gspCalled = false;
context.GSP.loadDB = () => { gspCalled = true; return 'gsp'; };
const deps2 = factory();
assert.equal(deps2.loadDB(), 'gsp');
assert.equal(gspCalled, true);

console.log('Attendance legacy boundary: 6 passed / 0 failed');
