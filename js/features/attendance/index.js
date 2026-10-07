/* Attendance feature facade: explicit feature boundary with a dedicated UI adapter.
 * STEP 23: prefer namespaced feature surface; keep GSP.tda* public actions only. */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});
  const context = (GSP.application && GSP.application.context) || {};
  const application = context.application || GSP.application || {};
  const ui = (context.ui && context.ui.attendance) || (application.ui && application.ui.attendance) || {};
  const prior = (GSP.features && GSP.features.attendance) || {};
  const api = {
    ui: Object.freeze({
      loadAdminPanel: (...args) => ui.loadAdminPanel && ui.loadAdminPanel(...args),
      refreshClassOptions: (...args) => ui.refreshClassOptions && ui.refreshClassOptions(...args),
      renderTeacherDailyCards: (...args) => ui.renderTeacherDailyCards && ui.renderTeacherDailyCards(...args),
      isMonthLocked: (...args) => ui.isMonthLocked && ui.isMonthLocked(...args)
    }),
    application: Object.freeze({
      attendance: application.attendance || null,
      admin: application.attendanceAdmin || null,
      grid: application.attendanceGridActions || null,
      report: application.attendanceReport || null,
      uiState: application.attendanceUIState || null,
      notification: application.attendanceNotification || null
    }),
    refreshClassOptions: (...args) => ui.refreshClassOptions && ui.refreshClassOptions(...args),
    renderTeacherDailyCards: (...args) => ui.renderTeacherDailyCards && ui.renderTeacherDailyCards(...args),
    loadAdminPanel: (...args) => ui.loadAdminPanel && ui.loadAdminPanel(...args),
    isMonthLocked: (...args) => ui.isMonthLocked && ui.isMonthLocked(...args),
    teacherDaily: prior.teacherDaily || GSP.tdaTeacherDaily || null,
    analytics: prior.analytics || GSP.attendanceAnalytics || null,
    filters: prior.filters || GSP.attendanceFilters || null
  };
  GSP.features = GSP.features || {};
  GSP.features.attendance = Object.freeze(api);
})(window);
