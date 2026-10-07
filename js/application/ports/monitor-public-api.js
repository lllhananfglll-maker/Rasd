/*
 * Monitor public API surface — STEP 24.
 * Declares supported GSP compatibility APIs for Monitor HTML/data-action
 * versus internal helpers that should not live on the GSP root.
 */
(function (root) {
  'use strict';

  const GSP = root.GSP || (root.GSP = {});

  const PUBLIC_NAMES = Object.freeze([
    // Navigation / shell
    'monNavigate',
    'applyMonitorShell',
    'renderMonitorShellDashboard',
    'renderMonitorDashCards',
    'updateDashboard',
    'applyRoleUI',
    // Auth / stages (monitor-related entry points used from HTML)
    'submitMonitorAuth',
    'openStageMonitorForm',
    'addOrUpdateStageMonitor',
    'cancelStageMonitorEdit',
    'printAllStageMonitorCards',
    // Teachers panel / feedback
    'renderMonitorTeachersPanel',
    'monToggleTeacherLists',
    'openMonitorTeacherCard',
    'printMonitorTeacherCard',
    'monTeacherFeedback',
    'monTeacherFeedbackFromButton',
    'printTeacherPointsReport',
    'toggleStageHonorBoard',
    // Grades guide
    'renderMonitorGradesGuide',
    'monJumpGrades',
    // Attendance / presence within monitor
    'isTeacherDailyAttendanceEnabled',
    'toggleTeacherDailyAttendance',
    'teacherCheckInToday',
    'refreshTeacherCheckInButton',
    'printTeacherAbsenceSheet',
    'printTeacherPresenceSheet',
    'printLiveClassAbsenceReport',
    'printStageQualityReport',
    // Superadmin tree
    'renderSuperadminStageTree',
    'switchToStageFromTree',
    // MDC detail
    'closeMdcDetail',
    'exportMdcDetail'
  ]);

  const INTERNAL_NAMES = Object.freeze([
    'resolveActiveTermMonth',
    'expectedPctByCalendarDays',
    'completionForTermMonth',
    'computeTeacherRankSnapshot',
    'createMonitorService'
  ]);

  const TRANSITIONAL_NAMES = Object.freeze([
    'monitorAnalytics',
    'allCompletion'
  ]);

  function listPublic() { return PUBLIC_NAMES.slice(); }
  function listInternal() { return INTERNAL_NAMES.slice(); }
  function listTransitional() { return TRANSITIONAL_NAMES.slice(); }
  function isPublic(name) { return PUBLIC_NAMES.indexOf(name) !== -1; }

  function auditPublicSurface(host) {
    const target = host || GSP;
    const missing = [];
    const present = [];
    PUBLIC_NAMES.forEach(function (name) {
      if (typeof target[name] === 'function') present.push(name);
      else missing.push(name);
    });
    return Object.freeze({
      ok: missing.length === 0,
      missing: Object.freeze(missing),
      present: Object.freeze(present)
    });
  }

  function auditLeakedInternals(host) {
    const target = host || GSP;
    const leaked = [];
    INTERNAL_NAMES.forEach(function (name) {
      if (typeof target[name] === 'function' || (target[name] && typeof target[name] === 'object')) {
        leaked.push(name);
      }
    });
    return Object.freeze(leaked);
  }

  const api = Object.freeze({
    PUBLIC_NAMES,
    INTERNAL_NAMES,
    TRANSITIONAL_NAMES,
    listPublic,
    listInternal,
    listTransitional,
    isPublic,
    auditPublicSurface,
    auditLeakedInternals
  });

  GSP.application = GSP.application || {};
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.monitorPublicApi = api;
})(window);
