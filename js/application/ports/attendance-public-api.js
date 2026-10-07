/*
 * Attendance public API surface — STEP 23.
 * Declares which GSP top-level functions remain the supported compatibility
 * surface for HTML data-action / data-event-action and external callers.
 * Internal helpers must live under GSP.features.attendance or GSP.application.*
 * and must not be re-exported on the GSP root unless listed here.
 */
(function (root) {
  'use strict';

  const GSP = root.GSP || (root.GSP = {});

  /** Supported public compatibility APIs for Attendance (HTML + external). */
  const PUBLIC_NAMES = Object.freeze([
    // Teacher Daily (data-action / data-event-action)
    'tdaSetStudentMark',
    'tdaMarkAll',
    'tdaToggleFilters',
    'onTdaFilterChange',
    'openTeacherDailyAttendance',
    'closeTeacherDailyAttendance',
    // Attendance grid & filters
    'renderAttendanceGrid',
    'saveAttendanceGrid',
    'onAttendanceFilterChange',
    'attMarkDayAll',
    'attMarkSelectedDayAll',
    'attMarkWeekAll',
    // Admin / school settings
    'saveAttendanceSchoolSettings',
    'addAttendanceHoliday',
    'removeAttendanceHoliday',
    'saveAttendanceSubjectDays',
    // Reports / sync / print
    'printAttendanceAggregateReport',
    'printAttendanceSheet',
    'refreshAttendanceTrendChart',
    'syncAttendanceScoresToGrades',
    // Skip suspects / conflicts
    'excuseDaySkipStudent',
    'openTodaySkipSuspectsModal',
    'printTodaySkipSuspectsReport',
    'notifyIfSkipSuspectsAfterSave',
    'closeAttendanceConflictsModal'
  ]);

  /** Transitional namespaced objects still on GSP root (prefer GSP.features.*). */
  const TRANSITIONAL_NAMES = Object.freeze([
    'tdaTeacherDaily',
    'attendanceAnalytics',
    'attendanceFilters',
    'attendanceWorkdayPolicy'
  ]);

  /** Intentionally internal — must not be required on GSP root after STEP 23. */
  const INTERNAL_NAMES = Object.freeze([
    'tdaDateAllowed',
    'tdaPopulateFilters',
    'tdaGetState',
    'tdaSetBanner',
    'tdaStatus',
    'tdaUpdateFilterSummary',
    'renderTeacherDailyCards',
    'attendanceRepository',
    'createAttendanceUIAdapter'
  ]);

  function listPublic() {
    return PUBLIC_NAMES.slice();
  }

  function listInternal() {
    return INTERNAL_NAMES.slice();
  }

  function listTransitional() {
    return TRANSITIONAL_NAMES.slice();
  }

  function isPublic(name) {
    return PUBLIC_NAMES.indexOf(name) !== -1;
  }

  /**
   * Returns { ok, missing, present } for the public surface currently on GSP.
   * Does not throw — safe to call during boot for diagnostics/tests.
   */
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

  /**
   * Returns internal names that are still exposed on GSP root (candidates to hide).
   */
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
    listPublic,
    listInternal,
    listTransitional,
    TRANSITIONAL_NAMES,
    isPublic,
    auditPublicSurface,
    auditLeakedInternals
  });

  GSP.application = GSP.application || {};
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.attendancePublicApi = api;
})(window);
