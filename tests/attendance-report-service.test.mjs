import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = { console, window: null };
sandbox.window = sandbox;
sandbox.GSP = {};
vm.runInNewContext(fs.readFileSync(new URL('../js/application/services/attendance-report-service.js', import.meta.url), 'utf8'), sandbox);

const service = sandbox.GSP.createAttendanceReportService({
  ensureAttendance: db => db.attendance,
  computeClassAttendanceAgg: (_db, _att, classKey) => ({ classKey, students: 2, expected: 10, absent: 2, present: 8, rate: 80 }),
  countStudyCalendarDays: () => 5,
  trendFromRates: (current, previous) => ({ code: previous == null ? 'na' : current > previous ? 'up' : current < previous ? 'down' : 'flat', arrow: '', label: '' }),
  getMonthLabels: () => ['1', '2'],
  classSectionLabel: k => 'Class ' + k,
  buildAggregateRows: () => ({ rows: [], totals: { students: 0, studyDays: 0, rate: null }, studyDays: 0 })
});
const result = service.buildTermAggregate({ attendance: {}, classes: ['A'] }, 'first');
if (result.rows.length !== 1 || result.rows[0].expected !== 20 || result.rows[0].present !== 16) process.exit(1);
console.log('attendance-report-service: PASS');
