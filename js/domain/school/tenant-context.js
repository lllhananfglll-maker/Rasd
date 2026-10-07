/**
 * domain/school/tenant-context.js
 * سياق المدرسة (tenant) — منطق نقي بدون DOM.
 *
 * المرحلة الحالية: مدرسة واحدة (schoolId = 'default').
 * عند تفعيل multiTenant تُمرَّر schoolId من الجلسة/الإعداد.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const domain = GSP.domain = GSP.domain || {};
  const school = domain.school = domain.school || {};

  const DEFAULT_SCHOOL_ID = 'default';

  /**
   * @param {object} [cfg]
   * @returns {{ schoolId: string, multiTenant: boolean, storagePrefix: string }}
   */
  function createTenantContext(cfg) {
    const multiTenant = !!(cfg && cfg.multiTenant);
    let schoolId = String((cfg && cfg.schoolId) || DEFAULT_SCHOOL_ID).trim() || DEFAULT_SCHOOL_ID;
    // منع مفاتيح تخزين خطرة
    schoolId = schoolId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || DEFAULT_SCHOOL_ID;
    const storagePrefix = multiTenant
      ? ('gradeSystemPro:' + schoolId)
      : 'gradeSystemPro';
    return Object.freeze({
      schoolId: schoolId,
      multiTenant: multiTenant,
      storagePrefix: storagePrefix
    });
  }

  /**
   * يبني مفتاح تخزين محلي معزول حسب المدرسة عند تفعيل التعدد.
   * @param {string} baseKey
   * @param {{ schoolId?: string, multiTenant?: boolean, storagePrefix?: string }} tenant
   */
  function scopedStorageKey(baseKey, tenant) {
    const t = tenant || createTenantContext({});
    if (!t.multiTenant) return baseKey;
    return t.storagePrefix + ':' + String(baseKey || '');
  }

  /**
   * يضيف school_id إلى كائن بيانات قبل الرفع للسحابة.
   * @param {object} row
   * @param {string} schoolId
   */
  function attachSchoolId(row, schoolId) {
    if (!row || typeof row !== 'object') return row;
    const id = String(schoolId || DEFAULT_SCHOOL_ID);
    if (Array.isArray(row)) {
      return row.map(function (item) { return attachSchoolId(item, id); });
    }
    if (row.school_id == null && row.schoolId == null) {
      row.school_id = id;
    }
    return row;
  }

  /**
   * يصفّي صفوفاً حسب school_id (للمزامنة متعددة المدارس لاحقاً).
   */
  function filterBySchool(rows, schoolId) {
    if (!Array.isArray(rows)) return [];
    const id = String(schoolId || DEFAULT_SCHOOL_ID);
    return rows.filter(function (r) {
      if (!r || typeof r !== 'object') return false;
      const sid = r.school_id != null ? r.school_id : r.schoolId;
      return sid == null || String(sid) === id;
    });
  }

  school.createTenantContext = createTenantContext;
  school.scopedStorageKey = scopedStorageKey;
  school.attachSchoolId = attachSchoolId;
  school.filterBySchool = filterBySchool;
  school.DEFAULT_SCHOOL_ID = DEFAULT_SCHOOL_ID;

  // تصدير للاختبارات / الاستخدام العام عبر GSP
  GSP.createTenantContext = createTenantContext;
  GSP.scopedStorageKey = scopedStorageKey;
})(typeof window !== 'undefined' ? window : globalThis);
