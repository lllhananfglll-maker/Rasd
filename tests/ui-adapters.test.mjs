import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

function load(file, window) {
  const context = { window, console, document: {}, CSS: {}, globalThis: window };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const attendanceHost = {
  loadAttendanceAdminPanel: (...a) => ['admin', ...a],
  refreshAttendanceClassOptions: (...a) => ['class', ...a],
  isAttendanceMonthLocked: (...a) => ['lock', ...a],
  GSP: {
    tdaTeacherDaily: { renderTeacherDailyCards: (...a) => ['cards', ...a] },
    attendanceAnalytics: { x: 1 },
    attendanceFilters: { y: 2 }
  }
};
load(path.join(ROOT, 'js/ui/attendance-ui-adapter.js'), attendanceHost);
const a = attendanceHost.GSP.application.ui.attendance;
assert.deepEqual(a.loadAdminPanel(1), ['admin', 1]);
assert.deepEqual(a.refreshClassOptions(2), ['class', 2]);
assert.deepEqual(a.renderTeacherDailyCards(3), ['cards', 3]);
assert.deepEqual(a.isMonthLocked(4), ['lock', 4]);
assert.equal(a.analytics().x, 1);

const monitorHost = {
  mountMonitorChrome: (...a) => ['mount', ...a],
  unmountMonitorChrome: (...a) => ['unmount', ...a],
  collectStageAnalytics: (...a) => ['stage', ...a],
  buildMonitorTeacherRows: (...a) => ['rows', ...a],
  applyMonitorViewOnlyUI: (...a) => ['view', ...a],
  GSP: {}
};
load(path.join(ROOT, 'js/ui/monitor-ui-adapter.js'), monitorHost);
const m = monitorHost.GSP.application.ui.monitor;
assert.deepEqual(m.mount(1), ['mount', 1]);
assert.deepEqual(m.unmount(2), ['unmount', 2]);
assert.deepEqual(m.collectStageAnalytics(3), ['stage', 3]);
assert.deepEqual(m.buildTeacherRows(4), ['rows', 4]);
assert.deepEqual(m.applyViewOnlyUI(5), ['view', 5]);

console.log('UI adapters: 10/10 passed');
