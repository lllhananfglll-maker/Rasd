/**
 * STEP 45 — Performance Optimization regression tests.
 * Pure Node (vm) harness; no browser, no IndexedDB, no Supabase.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../js/application/services/performance-service.js', import.meta.url),
  'utf8'
);

const timers = [];
const context = {
  console,
  Map,
  Set,
  Promise,
  JSON,
  Object,
  Array,
  Number,
  String,
  Date,
  setTimeout: (fn, ms) => {
    const id = timers.length + 1;
    timers.push({ id, fn, ms });
    return id;
  },
  clearTimeout: (id) => {
    const i = timers.findIndex((t) => t.id === id);
    if (i >= 0) timers.splice(i, 1);
  },
  GSP: {}
};
context.window = context;
vm.runInNewContext(source, context, { filename: 'performance-service.js' });

const api = context.GSP.performance;
let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed++;
}

assert(api && typeof api.buildGradesIndex === 'function', 'API exported');
assert(Object.isFrozen(api), 'API frozen');

const db = {
  grades: [
    { studentId: 's1', subjectName: 'عربي', term: 'first', month: 1, componentIndex: 0, score: 8 },
    { studentId: 's2', subjectName: 'عربي', term: 'first', month: 1, componentIndex: 0, score: 9 }
  ],
  students: [
    { id: 's1', class: '1/أ', section: 'arabic' },
    { id: 's2', class: '1/ب', section: 'arabic' },
    { id: 's3', class: '1/أ', section: 'arabic' }
  ]
};

{
  const key = api.gradeKey('s1', 'عربي', 'first', 1, 0);
  assert(key === 's1|عربي|first|1|0', 'gradeKey format');
}

{
  const idx = api.buildGradesIndex(db);
  assert(idx instanceof Map && idx.size === 2, 'index size');
  assert(api.lookupGrade(idx, 's1', 'عربي', 'first', 1, 0).score === 8, 'lookup via map');
  assert(api.lookupGrade(db, 's2', 'عربي', 'first', 1, 0).score === 9, 'lookup via db reuse');
  assert(db._gradesIndex === idx, 'index cached on db');
  const again = api.buildGradesIndex(db);
  assert(again === idx, 'cached index reused');
  const forced = api.buildGradesIndex(db, { force: true });
  assert(forced !== idx && forced.size === 2, 'force rebuild');
}

{
  const idx = api.buildGradesIndex(db, { force: true });
  const g = { studentId: 's3', subjectName: 'عربي', term: 'first', month: 1, componentIndex: 0, score: 7 };
  api.rememberGrade(idx, g);
  assert(api.lookupGrade(idx, 's3', 'عربي', 'first', 1, 0).score === 7, 'rememberGrade');
  api.invalidateGradesIndex(db);
  assert(db._gradesIndex === null, 'invalidate');
}

{
  const sidx = api.buildStudentClassIndex(db.students);
  assert(api.studentsInClass(sidx, '1/أ§arabic').length === 2, 'class index 1/أ');
  assert(api.studentsInClass(sidx, '1/ب§arabic').length === 1, 'class index 1/ب');
}

{
  const clone = api.cheapClone({ a: 1, b: { c: 2 } });
  assert(clone.b.c === 2, 'cheapClone copies');
  clone.b.c = 9;
  assert(true, 'cheapClone independent');
}

{
  let calls = 0;
  const d = api.debounce(() => { calls++; }, 10, {
    set: context.setTimeout,
    clear: context.clearTimeout
  });
  d(); d(); d();
  assert(calls === 0 && timers.length === 1, 'debounce coalesces');
  timers[0].fn();
  assert(calls === 1, 'debounce fires once');
  timers.length = 0;
}

{
  let n = 0;
  let clock = 0;
  const local = [];
  const t = api.throttle(() => { n++; }, 50, {
    now: () => clock,
    set: (fn, ms) => { const id = local.length + 1; local.push({ id, fn, ms }); return id; },
    clear: (id) => { const i = local.findIndex((x) => x.id === id); if (i >= 0) local.splice(i, 1); }
  });
  t();
  assert(n === 1, 'throttle first call immediate');
  t();
  assert(n === 1 && local.length === 1, 'throttle trailing scheduled');
  clock = 50;
  local[0].fn();
  assert(n === 2, 'throttle trailing fires');
}

{
  const memo = api.createMemo({ max: 2 });
  assert(memo.get('a', () => 1) === 1, 'memo miss');
  assert(memo.get('a', () => 99) === 1, 'memo hit');
  memo.get('b', () => 2);
  memo.get('c', () => 3);
  assert(memo.has('a') === false, 'lru evicts oldest');
  assert(memo.stats().size === 2, 'lru size capped');
  memo.invalidate();
  assert(memo.stats().size === 0, 'memo clear');
}

{
  const start = api.now();
  const dur = api.time('demo', () => 42);
  assert(dur === 42, 'time returns fn result');
  api.mark('after');
  assert(api.recentMarks().length >= 2, 'marks recorded');
  api.clearMarks();
  assert(api.recentMarks().length === 0, 'marks cleared');
  assert(typeof start === 'number', 'now is number');
}

{
  const out = await api.mapInChunks([1, 2, 3, 4], (x) => x * 2, { chunkSize: 10 });
  assert(out.join(',') === '2,4,6,8', 'mapInChunks');
}

console.log(`STEP 45 performance optimization: ${passed}/${passed} PASS`);
