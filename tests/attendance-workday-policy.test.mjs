import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../js/domain/attendance/workday-policy.js', import.meta.url), 'utf8');
const sandbox = { globalThis: {} };
vm.runInNewContext(code, sandbox);
const policy = sandbox.globalThis.GSP.attendanceWorkdayPolicy;

assert.equal(policy.isSchoolWorkingDay({saturdayEnabled:false}, '2026-09-04'), false); // Friday
assert.equal(policy.isSchoolWorkingDay({saturdayEnabled:false}, '2026-09-05'), false); // Saturday
assert.equal(policy.isSchoolWorkingDay({saturdayEnabled:true}, '2026-09-05'), true);
assert.equal(policy.isSchoolWorkingDay({saturdayEnabled:false}, '2026-09-06'), true); // Sunday
assert.equal(policy.isSchoolWorkingDay({saturdayEnabled:false}, '2026-09-10'), true); // Thursday
assert.equal(policy.isSchoolWorkingDay({saturdayEnabled:false}, '2026-02-30'), false);
console.log('attendance workday policy tests passed');
