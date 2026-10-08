import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
function load(rel) {
  globalThis.GSP = globalThis.GSP || {};
  eval(readFileSync(join(__dirname, rel), 'utf8'));
}
load('../js/domain/grades/real-averages.js');
const { realAggregate, realAttendanceRate } = globalThis.GSP.domain.grades;

let failed = 0;
function assert(c, m) { if (!c) { console.error('FAIL', m); failed++; } else console.log('OK', m); }

const a = realAggregate([10, 20, '', null], {});
assert(a.count === 2 && a.value === 15, 'average only entered weeks');

const b = realAggregate([10, '', 20], { emptyAsZero: true });
assert(b.count === 3 && Math.abs(b.value - 10) < 0.01, 'emptyAsZero policy');

const c = realAggregate(['غ', 'غ'], {});
assert(c.value === 'غ', 'all absent');

const att = realAttendanceRate([
  { mark: 'present' },
  { mark: 'absent' },
  { mark: 'present' },
  { isHoliday: true, mark: 'absent' },
  { mark: 'excused' }
]);
assert(att.denom === 4 && Math.abs(att.rate - 0.75) < 0.01, 'attendance rate ignores holiday');

load('../js/domain/calendar/term-calendar.js');
const cal = globalThis.GSP.domain.calendar;
const tc = cal.defaultCalendar('first');
assert(cal.weekStartISO(tc, 1) === tc.startDate, 'week1 = start');
assert(cal.addDaysISO(tc.startDate, 7) === cal.weekStartISO(tc, 2), 'week2 +7');

console.log(failed ? failed + ' failed' : 'All passed');
process.exit(failed ? 1 : 0);
