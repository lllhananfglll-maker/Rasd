import fs from 'node:fs';
import assert from 'node:assert/strict';
for (const file of ['js/features/attendance/index.js','js/features/monitor/index.js']) {
  const s = fs.readFileSync(file, 'utf8');
  assert.match(s, /GSP\.features/);
  assert.match(s, /Object\.freeze/);
}
console.log('Feature boundary smoke tests passed');
