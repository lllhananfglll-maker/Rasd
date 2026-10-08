/**
 * STEP 44 — Import Validation & Recovery regression tests.
 * Pure Node (vm) harness; no browser, no XLSX, no IndexedDB.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../js/application/services/import-validation-service.js', import.meta.url),
  'utf8'
);

const context = { console, GSP: {} };
context.window = context;
vm.runInNewContext(source, context, { filename: 'import-validation-service.js' });

const api = context.GSP.importValidation;
let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed++;
}

assert(api && typeof api.validateParsedResult === 'function', 'API exported');
assert(api.SEVERITY.error === 'error', 'severity constants');

// --- empty / invalid parsed ---
{
  const r = api.validateParsedResult(null);
  assert(r.ok === false && r.canCommit === false, 'null parsed rejected');
  assert(r.errorCount >= 1, 'null has errors');
}

{
  const r = api.validateParsedResult({ students: [], grades: [], subjects: [] });
  assert(r.ok === false, 'empty roster rejected');
  assert(r.errors.some((e) => e.code === 'EMPTY_ROSTER'), 'EMPTY_ROSTER code');
}

// --- valid minimal parse result ---
const goodParsed = {
  students: [
    { id: 'ar::2::29801010101234', nationalId: '29801010101234', name: 'أحمد', grade: '2', section: 'arabic', class: '1' }
  ],
  grades: [
    { studentId: 'ar::2::29801010101234', subjectName: 'عربي', term: 'first', componentIndex: 0, score: 8 }
  ],
  subjects: [
    { name: 'عربي', components: [{ name: 'شفهي', maxScore: 10, colIndex: 5 }] }
  ],
  classes: ['1'],
  invalidGrades: [],
  duplicateSeats: [],
  catalogWarnings: []
};

{
  const r = api.validateParsedResult(goodParsed, { term: 'first', month: 3, grade: '2', section: 'arabic' });
  assert(r.ok === true, 'good parsed accepted');
  assert(r.summary.studentCount === 1, 'summary students');
  assert(r.summary.gradeCount === 1, 'summary grades');
  assert(r.summary.subjectCount === 1, 'summary subjects');
}

// --- duplicate national id ---
{
  const dup = {
    students: [
      { id: 'a', nationalId: '29801010101234', name: 'أ', grade: '2', section: 'arabic' },
      { id: 'b', nationalId: '29801010101234', name: 'ب', grade: '2', section: 'arabic' }
    ],
    grades: [],
    subjects: [{ name: 'م', components: [{ name: 'ك', maxScore: 10 }] }],
    classes: [],
    invalidGrades: [],
    duplicateSeats: []
  };
  const r = api.validateParsedResult(dup);
  assert(r.ok === false, 'dup national id rejected');
  assert(r.errors.some((e) => e.code === 'STUDENT_DUP_NATIONAL_ID'), 'DUP_NATIONAL_ID code');
}

// --- orphan grades ---
{
  const orphan = {
    students: [{ id: 's1', nationalId: '29801010101234', name: 'أ', grade: '2', section: 'arabic' }],
    grades: [{ studentId: 'missing', subjectName: 'عربي', componentIndex: 0, score: 5 }],
    subjects: [{ name: 'عربي', components: [{ name: 'ك', maxScore: 10 }] }],
    classes: [],
    invalidGrades: [],
    duplicateSeats: []
  };
  const r = api.validateParsedResult(orphan);
  assert(r.ok === false, 'orphan grades rejected');
  assert(r.errors.some((e) => e.code === 'ORPHAN_GRADES'), 'ORPHAN_GRADES code');
}

// --- score out of range is warning, not error ---
{
  const oor = {
    students: [{ id: 's1', nationalId: '29801010101234', name: 'أ', grade: '2', section: 'arabic' }],
    grades: [{ studentId: 's1', subjectName: 'عربي', componentIndex: 0, score: 99 }],
    subjects: [{ name: 'عربي', components: [{ name: 'ك', maxScore: 10 }] }],
    classes: [],
    invalidGrades: [],
    duplicateSeats: []
  };
  const r = api.validateParsedResult(oor);
  assert(r.ok === true, 'out-of-range is warning only');
  assert(r.warnings.some((w) => w.code === 'SCORE_OUT_OF_RANGE'), 'SCORE_OUT_OF_RANGE warning');
}

// --- national id format warning ---
{
  const badNid = {
    students: [{ id: 's1', nationalId: '123', name: 'أ', grade: '2', section: 'arabic' }],
    grades: [],
    subjects: [{ name: 'م', components: [{ name: 'ك', maxScore: 10 }] }],
    classes: [],
    invalidGrades: [],
    duplicateSeats: []
  };
  const r = api.validateParsedResult(badNid);
  assert(r.ok === true, 'bad nid format still ok');
  assert(r.warnings.some((w) => w.code === 'NATIONAL_ID_FORMAT'), 'NATIONAL_ID_FORMAT warning');
}

// --- merge plan: scope leak ---
{
  const live = {
    students: [
      { id: 'keep', name: 'قديم', grade: '1', section: 'arabic' },
      { id: 'replace', name: 'يُستبدل', grade: '2', section: 'arabic' }
    ],
    grades: [],
    subjects: []
  };
  const draftBad = {
    students: [
      { id: 'new', name: 'جديد', grade: '2', section: 'arabic' }
      // missing 'keep'
    ],
    grades: [],
    subjects: []
  };
  const r = api.validateMergePlan(live, draftBad, { grade: '2', section: 'arabic' });
  assert(r.ok === false, 'scope leak rejected');
  assert(r.errors.some((e) => e.code === 'SCOPE_LEAK_DELETE'), 'SCOPE_LEAK_DELETE code');
}

// --- merge plan: good scoped replace ---
{
  const live = {
    students: [
      { id: 'keep', name: 'قديم', grade: '1', section: 'arabic' },
      { id: 'old2', name: 'قديم2', grade: '2', section: 'arabic' }
    ],
    grades: [],
    subjects: []
  };
  const draft = {
    students: [
      { id: 'keep', name: 'قديم', grade: '1', section: 'arabic' },
      { id: 'new2', name: 'جديد', grade: '2', section: 'arabic' }
    ],
    grades: [],
    subjects: []
  };
  const r = api.validateMergePlan(live, draft, { grade: '2', section: 'arabic' });
  assert(r.ok === true, 'scoped replace accepted');
  assert(r.summary.lostOutsideCount === 0, 'no outside loss');
}

// --- merge plan missing scope ---
{
  const r = api.validateMergePlan({ students: [] }, { students: [] }, {});
  assert(r.ok === false, 'missing scope rejected');
}

// --- snapshot / restore ---
{
  const db = { students: [{ id: 's1' }], grades: [], subjects: [] };
  const snap = api.captureSnapshot(db, 'test-import');
  assert(snap.label === 'test-import', 'snapshot label');
  assert(snap.data.students[0].id === 's1', 'snapshot data');
  // mutation isolation
  db.students.push({ id: 's2' });
  assert(snap.data.students.length === 1, 'snapshot is isolated clone');

  let written = null;
  const result = await api.restoreSnapshot(snap, {
    writeStage: async (data) => { written = data; }
  });
  assert(result.ok === true, 'restore ok');
  assert(written.students.length === 1, 'restored data written');
  assert(result.summary.studentCount === 1, 'restore summary');
}

{
  const bad = await api.restoreSnapshot(null, { writeStage: async () => {} });
  assert(bad.ok === false, 'null snapshot restore fails');
}

// --- preflight combines ---
{
  const live = {
    students: [{ id: 'keep', name: 'ك', grade: '1', section: 'arabic' }],
    grades: [],
    subjects: []
  };
  const draft = {
    students: [
      { id: 'keep', name: 'ك', grade: '1', section: 'arabic' },
      { id: 'ar::2::29801010101234', nationalId: '29801010101234', name: 'أحمد', grade: '2', section: 'arabic' }
    ],
    grades: [],
    subjects: []
  };
  const r = api.preflight(goodParsed, { grade: '2', section: 'arabic', term: 'first', month: 1 }, live, draft);
  assert(r.ok === true, 'preflight ok for good data + safe merge');
}

// --- formatReportHtml ---
{
  const r = api.validateParsedResult({ students: [], grades: [], subjects: [] });
  const html = api.formatReportHtml(r);
  assert(typeof html === 'string' && html.includes('EMPTY_ROSTER'), 'html includes error code');
}

console.log(`STEP 44 import validation & recovery: ${passed}/${passed} PASS`);
