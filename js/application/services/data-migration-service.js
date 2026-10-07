/**
 * STEP 43 — Data Migration / Backup / Restore
 *
 * Central application service for full-system backup, validation, migration,
 * and restore of the local root database (IndexedDB).
 *
 * Boundaries:
 * - Client-side / local storage only.
 * - No Supabase schema changes.
 * - No RLS changes.
 * - No backend permission changes.
 * - Does not store or expose service-role keys.
 *
 * The legacy UI helpers (downloadLocalBackup / restoreLocalBackup) remain as
 * thin adapters; this service owns the pure logic and safety checks.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const application = GSP.application = GSP.application || {};
  const services = application.services = application.services || {};

  const BACKUP_FORMAT = 'GradeSystemPro-Backup';
  const CURRENT_SCHEMA_VERSION = 2;
  const SUPPORTED_FORMATS = Object.freeze([BACKUP_FORMAT, 'GSP-Backup', 'grade-system-pro-backup']);

  function clone(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    const out = {};
    Object.keys(value).forEach((k) => { out[k] = clone(value[k]); });
    return out;
  }

  /** Lightweight deterministic fingerprint (not cryptographic). */
  function fingerprint(obj) {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function emptyStageData() {
    if (typeof GSP.emptyStageData === 'function') return GSP.emptyStageData();
    return {
      students: [], subjects: [], grades: [], classes: [], classGrade: {},
      metaByGrade: {}, locks: {}, meta: null, teachers: [], schoolInfo: null, attendance: null
    };
  }

  function isPlainObject(v) {
    return v != null && typeof v === 'object' && !Array.isArray(v);
  }

  function normalizeRoot(raw) {
    if (!isPlainObject(raw)) return null;
    const root = clone(raw);
    if (!Array.isArray(root.stages)) root.stages = [];
    root.stages = root.stages.filter((s) => s && typeof s === 'object');
    root.stages.forEach((st) => {
      if (!st.data || typeof st.data !== 'object') st.data = emptyStageData();
      const d = st.data;
      if (!Array.isArray(d.students)) d.students = [];
      if (!Array.isArray(d.subjects)) d.subjects = [];
      if (!Array.isArray(d.grades)) d.grades = [];
      if (!Array.isArray(d.classes)) d.classes = [];
      if (!Array.isArray(d.teachers)) d.teachers = [];
      if (!isPlainObject(d.classGrade)) d.classGrade = {};
      if (!isPlainObject(d.metaByGrade)) d.metaByGrade = {};
      if (!isPlainObject(d.locks)) d.locks = {};
    });
    if (!Array.isArray(root.stageAdmins)) root.stageAdmins = [];
    if (!Array.isArray(root.accounts)) root.accounts = root.accounts || [];
    if (root.schemaVersion == null) root.schemaVersion = 1;
    return root;
  }

  /**
   * Known local data migrations (idempotent where possible).
   * schemaVersion 1 → 2: ensure fixed-stage shape and section fields.
   */
  function migrateRoot(root, fromVersion) {
    const migrations = [];
    let version = Number(fromVersion) || 1;
    let data = normalizeRoot(root);
    if (!data) return { ok: false, error: 'بيانات الجذر غير صالحة للترحيل', data: null, migrations };

    if (version < 2) {
      // Ensure every stage has section / stageType when inferable.
      data.stages.forEach((st) => {
        if (!st.section && typeof GSP._inferSectionFromName === 'function') {
          st.section = GSP._inferSectionFromName(st.name) || st.section || null;
        }
        if (!st.stageType && typeof GSP._inferStageTypeFromName === 'function') {
          st.stageType = GSP._inferStageTypeFromName(st.name) || st.stageType || null;
        }
      });
      // Prefer ensureFixedStages if available (safe no-op when already correct).
      if (typeof GSP.ensureFixedStages === 'function') {
        try { GSP.ensureFixedStages(data); } catch (_) { /* non-fatal */ }
      }
      version = 2;
      migrations.push({ from: 1, to: 2, note: 'normalize stages + fixed-stage alignment' });
    }

    data.schemaVersion = Math.max(Number(data.schemaVersion) || 0, version, CURRENT_SCHEMA_VERSION);
    return { ok: true, data, migrations, schemaVersion: data.schemaVersion };
  }

  function validateBackupPayload(payload) {
    const errors = [];
    if (payload == null) {
      return { ok: false, errors: ['الملف فارغ'], root: null, meta: null };
    }

    let root = null;
    let meta = {
      format: null,
      appVersion: null,
      createdAt: null,
      schemaVersion: null,
      checksum: null,
      stageCount: 0
    };

    if (isPlainObject(payload) && (payload.data != null || payload.format != null)) {
      meta.format = payload.format || null;
      meta.appVersion = payload.appVersion || payload.version || null;
      meta.createdAt = payload.createdAt || payload.timestamp || null;
      meta.schemaVersion = payload.schemaVersion != null ? payload.schemaVersion : (payload.data && payload.data.schemaVersion);
      meta.checksum = payload.checksum || payload.fingerprint || null;
      root = payload.data != null ? payload.data : payload;
    } else if (isPlainObject(payload) && Array.isArray(payload.stages)) {
      // Raw root snapshot (legacy)
      root = payload;
      meta.format = 'raw-root';
    } else {
      errors.push('بنية ملف النسخة غير معروفة');
      return { ok: false, errors, root: null, meta };
    }

    if (meta.format && !SUPPORTED_FORMATS.includes(meta.format) && meta.format !== 'raw-root') {
      errors.push('صيغة النسخة غير مدعومة: ' + String(meta.format));
    }

    if (!isPlainObject(root)) {
      errors.push('حقل البيانات (data) مفقود أو غير صالح');
      return { ok: false, errors, root: null, meta };
    }

    if (!Array.isArray(root.stages)) {
      errors.push('الجذر لا يحتوي على مصفوفة مراحل (stages)');
    } else {
      meta.stageCount = root.stages.length;
      root.stages.forEach((st, i) => {
        if (!st || typeof st !== 'object') {
          errors.push('مرحلة غير صالحة عند الفهرس ' + i);
          return;
        }
        if (!st.id) errors.push('مرحلة بدون معرّف (id) عند الفهرس ' + i);
      });
    }

    if (meta.checksum && root) {
      const expected = fingerprint(root);
      if (String(meta.checksum) !== expected) {
        errors.push('بصمة التكامل (checksum) لا تطابق محتوى البيانات — قد يكون الملف تالفاً أو معدّلاً');
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      root: errors.length === 0 ? normalizeRoot(root) : root,
      meta
    };
  }

  function createBackupPayload(root, options) {
    const opts = options || {};
    const normalized = normalizeRoot(root);
    if (!normalized) {
      return { ok: false, error: 'لا توجد بيانات جذر لإنشاء النسخة', payload: null };
    }

    // Run migrations so backups always export the current schema.
    const migrated = migrateRoot(normalized, normalized.schemaVersion);
    const data = migrated.ok ? migrated.data : normalized;

    const payload = {
      format: BACKUP_FORMAT,
      appVersion: (GSP.APP_VERSION || (root.APP_VERSION) || 'unknown'),
      schemaVersion: data.schemaVersion || CURRENT_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      checksum: fingerprint(data),
      meta: {
        stageCount: (data.stages || []).length,
        studentCount: (data.stages || []).reduce((n, st) => n + (((st.data || {}).students) || []).length, 0),
        source: opts.source || 'local',
        note: opts.note || null
      },
      data
    };

    return { ok: true, payload, error: null };
  }

  function summarizeRoot(root) {
    if (!root || !Array.isArray(root.stages)) {
      return { stageCount: 0, studentCount: 0, teacherCount: 0, gradeCount: 0 };
    }
    let studentCount = 0;
    let teacherCount = 0;
    let gradeCount = 0;
    root.stages.forEach((st) => {
      const d = (st && st.data) || {};
      studentCount += (d.students || []).length;
      teacherCount += (d.teachers || []).length;
      gradeCount += (d.grades || []).length;
    });
    return {
      stageCount: root.stages.length,
      studentCount,
      teacherCount,
      gradeCount,
      schemaVersion: root.schemaVersion || null
    };
  }

  /**
   * High-level restore pipeline:
   * 1. Validate payload
   * 2. Migrate data to current schema
   * 3. Optionally write via injected storage boundary
   */
  async function restoreFromPayload(payload, options) {
    const opts = options || {};
    const validation = validateBackupPayload(payload);
    if (!validation.ok) {
      return {
        ok: false,
        error: validation.errors.join('; '),
        errors: validation.errors,
        meta: validation.meta,
        summary: null
      };
    }

    const fromVersion = validation.meta.schemaVersion != null
      ? validation.meta.schemaVersion
      : (validation.root && validation.root.schemaVersion) || 1;

    const migrated = migrateRoot(validation.root, fromVersion);
    if (!migrated.ok) {
      return {
        ok: false,
        error: migrated.error || 'فشل ترحيل البيانات',
        errors: [migrated.error],
        meta: validation.meta,
        summary: null
      };
    }

    const summary = summarizeRoot(migrated.data);

    if (opts.dryRun) {
      return {
        ok: true,
        dryRun: true,
        data: migrated.data,
        migrations: migrated.migrations,
        meta: validation.meta,
        summary,
        error: null
      };
    }

    // Persistence boundary — injectable for tests.
    const writer = opts.writeRoot || (typeof GSP.idbSet === 'function'
      ? async (root) => {
          const key = GSP.ROOT_DB_KEY || 'gradeSystemPro_DB';
          await GSP.idbSet(key, root);
          if (typeof GSP._rootDBCache !== 'undefined') {
            try { GSP._rootDBCache = root; } catch (_) { /* ignore */ }
          }
        }
      : null);

    if (!writer) {
      return {
        ok: false,
        error: 'لا تتوفر واجهة كتابة للتخزين (idbSet)',
        errors: ['missing write boundary'],
        meta: validation.meta,
        summary
      };
    }

    try {
      await writer(migrated.data);
    } catch (e) {
      return {
        ok: false,
        error: 'فشل حفظ البيانات المستعادة: ' + (e && e.message ? e.message : String(e)),
        errors: [String(e && e.message || e)],
        meta: validation.meta,
        summary
      };
    }

    return {
      ok: true,
      dryRun: false,
      data: migrated.data,
      migrations: migrated.migrations,
      meta: validation.meta,
      summary,
      error: null
    };
  }

  function createBackupFromCurrent(options) {
    let root = null;
    if (typeof GSP.getRootDB === 'function') {
      try { root = GSP.getRootDB(); } catch (_) { root = null; }
    }
    if (!root && typeof getRootDB === 'function') {
      try { root = getRootDB(); } catch (_) { root = null; }
    }
    if (!root) {
      return { ok: false, error: 'تعذر قراءة قاعدة البيانات المحلية', payload: null };
    }
    return createBackupPayload(root, options);
  }

  const api = Object.freeze({
    BACKUP_FORMAT,
    CURRENT_SCHEMA_VERSION,
    SUPPORTED_FORMATS,
    fingerprint,
    normalizeRoot,
    migrateRoot,
    validateBackupPayload,
    createBackupPayload,
    createBackupFromCurrent,
    restoreFromPayload,
    summarizeRoot
  });

  services.dataMigration = api;
  application.dataMigration = api;
  GSP.dataMigration = api;
})(typeof window !== 'undefined' ? window : globalThis);
