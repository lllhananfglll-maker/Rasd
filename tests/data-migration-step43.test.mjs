/**
 * STEP 43 — Data Migration / Backup / Restore regression tests.
 * Pure Node (vm) harness; no browser, no Supabase, no IndexedDB.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../js/application/services/data-migration-service.js', import.meta.url),
  'utf8'
);

const context = {
  console,
  GSP: {
    APP_VERSION: '25.5.26-step43',
    emptyStageData: () => ({
      students: [], subjects: [], grades: [], classes: [], classGrade: {},
      metaByGrade: {}, locks: {}, meta: null, teachers: [], schoolInfo: null, attendance: null
    })
  }
};
context.window = context;
vm.runInNewContext(source, context, { filename: 'data-migration-service.js' });

const api = context.GSP.dataMigration;
let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  passed++;
}

assert(api && typeof api.createBackupPayload === 'function', 'API exported');
assert(api.BACKUP_FORMAT === 'GradeSystemPro-Backup', 'format constant');
assert(api.CURRENT_SCHEMA_VERSION === 2, 'schema version');

// --- empty / invalid ---
{
  const bad = api.validateBackupPayload(null);
  assert(bad.ok === false, 'null payload rejected');
  assert(api.validateBackupPayload({}).ok === false, 'empty object rejected');
  assert(api.validateBackupPayload({ format: 'other', data: {} }).ok === false, 'unsupported format rejected');
}

// --- valid minimal root ---
const sampleRoot = {
  schemaVersion: 1,
  stages: [
    {
      id: 'stage_primary_ar',
      name: 'ابتدائي عربي',
      data: {
        students: [{ id: 's1', name: 'أحمد' }],
        subjects: [],
        grades: [{ id: 'g1' }],
        classes: [],
        teachers: [{ id: 't1' }],
        classGrade: {},
        metaByGrade: {},
        locks: {}
      }
    }
  ],
  stageAdmins: [],
  accounts: []
};

{
  const v = api.validateBackupPayload({ format: 'GradeSystemPro-Backup', data: sampleRoot });
  assert(v.ok === true, 'valid structured backup accepted');
  assert(v.meta.stageCount === 1, 'stage count meta');
}

{
  // raw root (legacy)
  const v = api.validateBackupPayload(sampleRoot);
  assert(v.ok === true, 'raw root accepted');
  assert(v.meta.format === 'raw-root', 'raw-root format label');
}

// --- create backup ---
{
  const created = api.createBackupPayload(sampleRoot, { source: 'test' });
  assert(created.ok === true, 'createBackupPayload ok');
  assert(created.payload.format === 'GradeSystemPro-Backup', 'payload format');
  assert(created.payload.checksum, 'checksum present');
  assert(created.payload.schemaVersion >= 2, 'backup upgraded schema');
  assert(created.payload.meta.studentCount === 1, 'student count in meta');
  assert(created.payload.meta.stageCount === 1, 'stage count in meta');

  // checksum must validate
  const v = api.validateBackupPayload(created.payload);
  assert(v.ok === true, 'created backup validates');

  // tamper detection
  const tampered = JSON.parse(JSON.stringify(created.payload));
  tampered.data.stages[0].data.students.push({ id: 'x' });
  const tv = api.validateBackupPayload(tampered);
  assert(tv.ok === false, 'tampered checksum rejected');
}

// --- migrate ---
{
  const m = api.migrateRoot(sampleRoot, 1);
  assert(m.ok === true, 'migrate ok');
  assert(m.schemaVersion >= 2, 'migrated to >=2');
  assert(Array.isArray(m.migrations) && m.migrations.length >= 1, 'migration recorded');
}

// --- summarize ---
{
  const s = api.summarizeRoot(sampleRoot);
  assert(s.stageCount === 1, 'summarize stages');
  assert(s.studentCount === 1, 'summarize students');
  assert(s.teacherCount === 1, 'summarize teachers');
  assert(s.gradeCount === 1, 'summarize grades');
}

// --- restore dry-run + write ---
{
  const created = api.createBackupPayload(sampleRoot);
  let written = null;
  const result = await api.restoreFromPayload(created.payload, {
    dryRun: true
  });
  assert(result.ok === true, 'dry-run restore ok');
  assert(result.dryRun === true, 'dry-run flag');
  assert(result.summary.studentCount === 1, 'dry-run summary');

  const result2 = await api.restoreFromPayload(created.payload, {
    writeRoot: async (root) => { written = root; }
  });
  assert(result2.ok === true, 'write restore ok');
  assert(written && written.stages && written.stages.length === 1, 'root written');
  assert(written.schemaVersion >= 2, 'written schema upgraded');
}

// --- reject bad stage ---
{
  const badRoot = { stages: [{ name: 'no-id' }] };
  const v = api.validateBackupPayload({ format: 'GradeSystemPro-Backup', data: badRoot });
  assert(v.ok === false, 'stage without id rejected');
}

// --- fingerprint stability ---
{
  const a = api.fingerprint({ x: 1, y: [2] });
  const b = api.fingerprint({ x: 1, y: [2] });
  assert(a === b && typeof a === 'string' && a.length === 8, 'fingerprint stable 8-hex');
}

console.log(`STEP 43 data migration / backup / restore: ${passed}/${passed} PASS`);
