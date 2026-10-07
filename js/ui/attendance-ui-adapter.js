/* Attendance UI adapter: the single UI-facing boundary for legacy attendance controllers. */
(function (root) {
  'use strict';

  function createAttendanceUIAdapter(host) {
    const api = {
      loadAdminPanel: (...args) => host.loadAttendanceAdminPanel?.(...args),
      refreshClassOptions: (...args) => host.refreshAttendanceClassOptions?.(...args),
      renderTeacherDailyCards: (...args) => {
        const tda = host.GSP?.features?.attendance?.teacherDaily || host.GSP?.tdaTeacherDaily;
        return tda?.renderTeacherDailyCards?.(...args);
      },
      isMonthLocked: (...args) => host.isAttendanceMonthLocked?.(...args),
      teacherDaily: () => host.GSP?.features?.attendance?.teacherDaily || host.GSP?.tdaTeacherDaily || null,
      analytics: () => host.GSP?.features?.attendance?.analytics || host.GSP?.attendanceAnalytics || null,
      filters: () => host.GSP?.features?.attendance?.filters || host.GSP?.attendanceFilters || null
    };
    return Object.freeze(api);
  }

  const GSP = root.GSP || (root.GSP = {});
  GSP.application = GSP.application || {};
  GSP.application.ui = GSP.application.ui || {};
  GSP.application.ui.attendance = createAttendanceUIAdapter(root);
  // STEP 23: factory stays under ports, not GSP root
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.createAttendanceUIAdapter = createAttendanceUIAdapter;
})(window);
