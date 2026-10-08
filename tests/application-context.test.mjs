import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const ctx = { console };
ctx.window = ctx;
ctx.GSP = {
  GSPGradeLogic: { name: 'grades-domain' },
  attendanceCalendar: { name: 'calendar' },
  attendanceWorkdayPolicy: { name: 'workday' },
  monitorAnalytics: { name: 'monitor-analytics' },
  application: {
    services: { marker: 'services' },
    ports: { marker: 'ports' },
    ui: { attendance: { marker: 'attendance-ui' }, grades: { marker: 'grades-ui' }, monitor: { marker: 'monitor-ui' } },
    attendance: { marker: 'attendance' },
    grades: { marker: 'grades' },
    monitor: { marker: 'monitor' }
  },
  infrastructure: { repositories: { marker: 'repositories' } }
};

vm.runInNewContext(fs.readFileSync(path.join(root, 'js/application/composition/application-context.js'), 'utf8'), ctx);
const app = ctx.GSP.application;
assert.ok(app.context, 'context exists');
assert.equal(app.context.application.attendance.marker, 'attendance');
assert.equal(app.context.application.services.marker, 'services');
assert.equal(app.context.infrastructure.repositories.marker, 'repositories');
assert.equal(app.context.domain.monitorAnalytics.name, 'monitor-analytics');
assert.equal(Object.isFrozen(app.context), true, 'context frozen');
assert.equal(Object.isFrozen(app.context.application), true, 'application map frozen');
assert.equal(Object.isFrozen(app.context.domain), true, 'domain map frozen');

app.monitor = { marker: 'late-monitor' };
const refreshed = app.createContext();
assert.equal(refreshed.application.monitor.marker, 'late-monitor', 'context can be refreshed');
assert.equal(app.context.application.monitor.marker, 'monitor', 'original snapshot remains stable');

console.log('Application context: 8 passed / 0 failed');
