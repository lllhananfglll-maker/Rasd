// STEP 51-FIX: الملف ده كان مكتوب ضد واجهة قديمة (قبل الفصل لـ DI الحقيقي في STEP 14)
// كان بيفترض إن تحميل السكربت بيحط instance جاهز على GSP.application.attendance مباشرة،
// وإن validateDate/writeMark بتاخد "deps" كـ argument زيادة عند كل استدعاء. الواجهة
// الفعلية دلوقتي (راجع js/application/services/attendance-service.js): السكربت بيسجّل
// factory function بس (createAttendanceService)، والاعتماديات بتتحقن مرة واحدة وقت
// الإنشاء مش عند كل نداء. الفشل القديم كان بسبب استدعاء الاختبار للواجهة القديمة، مش بسبب
// عطل حقيقي في كود الإنتاج (اللي شغال صح فعليًا عبر attendance-composition.js).
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.GSP = {};
const db = { attendance: { records: {} } };
let saved = null;
const repository = {
  load: () => db,
  save: x => { saved = x; },
  ensure: x => x.attendance
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/application/services/attendance-service.js'), 'utf8'), sandbox);

const deps = {
  repository,
  policy: { isSchoolWorkingDay: () => true, explainNonWorkingDay: () => 'غير مسموح' },
  todayISO: () => '2026-09-10',
  addDaysISO: (iso, n) => (n === -31 ? '2026-08-10' : iso),
  findTermMonthForDate: () => ({ term: 'first', month: 1 }),
  isAttendanceMonthLocked: () => false,
  collectSchoolHolidaySet: () => new Set(),
  recordKey: (...x) => x.join('|'),
  scheduleCloudPush: () => {}
};
const service = sandbox.GSP.application.services.createAttendanceService(deps);

let passed = 0, failed = 0;
function assert(ok, msg) { if (ok) passed++; else { failed++; console.error('  ✗', msg); } }

assert(service.validateDate('2026-09-11').ok === false, 'future date rejected');
assert(service.validateDate('2026-08-09').ok === false, 'older than 31 days rejected');
assert(service.validateDate('2026-09-10').ok === true, 'valid date accepted without workday policy');

service.writeMark('s1', 'Math', 'first', 1, '2026-09-10', 'absent');
assert(db.attendance.records['s1|Math|first|1|2026-09-10'] === 'غ', 'absent persisted');
assert(saved === db, 'repository.save called with the mutated db');

console.log(`attendance-service.test.mjs: ${passed} passed / ${failed} failed`);
if (failed > 0) throw new Error(`attendance-service.test.mjs: ${failed} assertion(s) failed`);
