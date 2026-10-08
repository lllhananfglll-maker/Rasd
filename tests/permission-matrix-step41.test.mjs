import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/application/services/permission-matrix-service.js', import.meta.url), 'utf8');
const context = {
  window: {},
  console,
  alert() {},
};
context.window = context;
vm.runInNewContext(source, context, { filename: 'permission-matrix-service.js' });
const api = context.GSP.permissionMatrix;
let passed = 0;
function assert(cond, msg) { if (!cond) throw new Error(msg); passed++; }

assert(api.can('grades.edit', { accountType: 'teacher' }), 'teacher should edit grades');
assert(!api.can('teachers.edit', { accountType: 'teacher' }), 'teacher must not edit teachers');
assert(api.can('grades.view', { accountType: 'monitor' }), 'monitor should view grades');
assert(!api.can('grades.edit', { accountType: 'monitor' }), 'monitor must not edit grades');
assert(api.can('grades.edit', { accountType: 'stageadmin', permissions: {} }), 'stage admin should retain grade editing');
assert(api.can('attendance.edit', { accountType: 'stageadmin', permissions: {} }), 'stage admin should retain attendance editing');
assert(api.can('subjects.edit', { accountType: 'stageadmin', permissions: { subjects: true } }), 'stage admin subject permission failed');
assert(!api.can('subjects.edit', { accountType: 'stageadmin', permissions: { subjects: false } }), 'stage admin denied permission leaked');
assert(api.can('students.edit', { accountType: 'stageadmin', permissions: { students: true } }), 'stage admin students permission failed');
assert(!api.can('schoolInfo.edit', { accountType: 'stageadmin', permissions: { schoolInfo: false } }), 'school info permission leaked');
assert(api.can('stages.manage', { accountType: 'superadmin' }), 'superadmin should manage stages');
assert(!api.can('stages.manage', { accountType: 'monitor' }), 'monitor should not manage stages');
assert(api.require('grades.edit', { context: { accountType: 'monitor' }, notify: false }).code === 'FORBIDDEN', 'require should deny');
assert(api.require('grades.edit', { context: { accountType: 'teacher' }, notify: false }).ok === true, 'require should allow');
assert(api.getMatrix().teacher['grades.edit'] === true, 'matrix teacher missing');
assert(api.getMatrix().monitor['grades.edit'] !== true, 'matrix monitor over-permitted');
assert(api.permissions.length >= 20, 'permission catalog unexpectedly small');
console.log(`STEP 41 permission matrix: ${passed}/${passed} PASS`);
