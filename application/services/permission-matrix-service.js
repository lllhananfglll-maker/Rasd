/**
 * STEP 41 — Role & Permission Matrix.
 *
 * Central, client-side authorization policy for the existing four account types.
 * This is intentionally NOT a replacement for Supabase RLS; it governs UI and
 * application behavior only and does not change backend permissions.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const application = GSP.application = GSP.application || {};
  const services = application.services = application.services || {};

  const PERMISSIONS = Object.freeze([
    'dashboard.view',
    'grades.view', 'grades.edit',
    'attendance.view', 'attendance.edit',
    'students.view', 'students.edit',
    'teachers.view', 'teachers.edit',
    'subjects.view', 'subjects.edit',
    'importExport.view', 'importExport.execute',
    'locks.view', 'locks.edit',
    'schoolInfo.view', 'schoolInfo.edit',
    'audit.view', 'audit.export',
    'conflicts.view', 'conflicts.resolve',
    'cloudSync.view', 'cloudSync.execute',
    'accounts.view', 'accounts.edit',
    'stages.manage', 'masterRoster.manage',
    'settings.manage'
  ]);

  const ALL = Object.freeze(PERMISSIONS.reduce((o, p) => { o[p] = true; return o; }, {}));
  const TEACHER = Object.freeze({
    'dashboard.view': true, 'grades.view': true, 'grades.edit': true,
    'attendance.view': true, 'attendance.edit': true
  });
  const MONITOR = Object.freeze({
    'dashboard.view': true, 'grades.view': true, 'attendance.view': true,
    'students.view': true, 'teachers.view': true, 'subjects.view': true,
    'importExport.view': true, 'locks.view': true, 'schoolInfo.view': false,
    'audit.view': true, 'conflicts.view': true, 'cloudSync.view': true
  });
  const SUPERADMIN = ALL;

  const ROLE_ALIASES = Object.freeze({ admin: 'superadmin', viewer: 'monitor' });

  const STAGE_PERMISSION_MAP = Object.freeze({
    subjects: ['subjects.view', 'subjects.edit'],
    students: ['students.view', 'students.edit'],
    teachers: ['teachers.view', 'teachers.edit'],
    importExport: ['importExport.view', 'importExport.execute'],
    locks: ['locks.view', 'locks.edit'],
    schoolInfo: ['schoolInfo.view', 'schoolInfo.edit']
  });

  function normalizeRole(role, accountType) {
    const raw = String(accountType || role || '').toLowerCase();
    return ROLE_ALIASES[raw] || raw || null;
  }

  function normalizeStagePermissions(raw) {
    const out = {};
    Object.keys(STAGE_PERMISSION_MAP).forEach(key => { out[key] = raw && raw[key] === true; });
    return out;
  }

  function permissionsFor(subject) {
    const role = normalizeRole(subject && subject.role, subject && subject.accountType);
    if (role === 'superadmin') return Object.assign({}, SUPERADMIN);
    if (role === 'teacher') return Object.assign({}, TEACHER);
    if (role === 'monitor') return Object.assign({}, MONITOR);
    if (role !== 'stageadmin') return {};

    const raw = normalizeStagePermissions(subject && subject.stagePermissions || subject && subject.permissions);
    const out = {
      'dashboard.view': true,
      'grades.view': true, 'grades.edit': true,
      'attendance.view': true, 'attendance.edit': true,
      'students.view': false, 'students.edit': false,
      'teachers.view': false, 'teachers.edit': false,
      'subjects.view': false, 'subjects.edit': false,
      'importExport.view': false, 'importExport.execute': false,
      'locks.view': false, 'locks.edit': false,
      'schoolInfo.view': false, 'schoolInfo.edit': false,
      'audit.view': true, 'audit.export': false,
      'conflicts.view': true, 'conflicts.resolve': false,
      'cloudSync.view': true, 'cloudSync.execute': false,
      'accounts.view': false, 'accounts.edit': false,
      'stages.manage': false, 'masterRoster.manage': false,
      'settings.manage': false
    };
    Object.keys(raw).forEach(k => {
      if (!raw[k]) return;
      (STAGE_PERMISSION_MAP[k] || []).forEach(p => { out[p] = true; });
    });
    return out;
  }

  function getContext(overrides) {
    // GSP.getAuthContext يقرأ المتغيرات الحية من state.js (موثوق أكثر من window.currentAccountType
    // عندما كانت مُعرَّفة بـ let ولا تُنشر على window).
    var auth = {};
    try {
      if (GSP && typeof GSP.getAuthContext === 'function') auth = GSP.getAuthContext() || {};
    } catch (e) { auth = {}; }
    const subject = Object.assign({
      accountType: auth.accountType || root.currentAccountType,
      role: auth.role || root.currentRole,
      stagePermissions: auth.stagePermissions || (root.currentStageAdmin && root.currentStageAdmin.permissions),
      stageId: auth.stageId || root.currentStageId,
      stageIds: auth.stageIds || (root.currentStageAdmin && root.currentStageAdmin.stageIds)
    }, overrides || {});
    return subject;
  }

  function can(permission, overrides) {
    const key = String(permission || '');
    if (!PERMISSIONS.includes(key)) return false;
    const ctx = getContext(overrides);
    // رئيس الكنترول: صلاحية كاملة دائماً
    if (normalizeRole(ctx.role, ctx.accountType) === 'superadmin') return true;
    return permissionsFor(ctx)[key] === true;
  }

  function canAny(list, overrides) {
    return Array.isArray(list) && list.some(p => can(p, overrides));
  }
  function canAll(list, overrides) {
    return Array.isArray(list) && list.every(p => can(p, overrides));
  }

  function requirePermission(permission, opts) {
    const options = opts || {};
    const ok = can(permission, options.context);
    if (ok) return { ok: true, permission, role: normalizeRole((options.context || {}).role || root.currentRole, (options.context || {}).accountType || root.currentAccountType) };
    const result = {
      ok: false,
      permission,
      code: 'FORBIDDEN',
      message: options.message || '⚠️ ليس لديك صلاحية لتنفيذ هذا الإجراء.',
      role: normalizeRole((options.context || {}).role || root.currentRole, (options.context || {}).accountType || root.currentAccountType)
    };
    if (options.notify !== false) {
      try { if (typeof root.alert === 'function') root.alert(result.message); } catch (e) {}
    }
    return result;
  }

  function getMatrix() {
    return {
      superadmin: Object.assign({}, SUPERADMIN),
      stageadmin: permissionsFor({ accountType: 'stageadmin', permissions: {} }),
      monitor: Object.assign({}, MONITOR),
      teacher: Object.assign({}, TEACHER)
    };
  }

  function describe() {
    return PERMISSIONS.slice();
  }

  const api = Object.freeze({
    permissions: PERMISSIONS,
    stagePermissionMap: STAGE_PERMISSION_MAP,
    normalizeRole,
    normalizeStagePermissions,
    permissionsFor,
    getContext,
    can,
    canAny,
    canAll,
    require: requirePermission,
    getMatrix,
    describe
  });

  services.permissions = api;
  application.permissions = api;
  GSP.permissionMatrix = api;
  GSP.can = can;
  GSP.requirePermission = requirePermission;
})(window);
