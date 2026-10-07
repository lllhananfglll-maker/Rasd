/*
 * Attendance UI state service.
 * STEP 18: keeps attendance filter/teacher-daily state out of DOM/controller
 * code. It is deliberately framework-free and preserves the existing values.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});

  function createAttendanceUIState(initial) {
    const seed = initial || {};
    const teacherDaily = {
      subjectName: String(seed.teacherDaily?.subjectName || ''),
      classKey: String(seed.teacherDaily?.classKey || ''),
      dateISO: String(seed.teacherDaily?.dateISO || '')
    };
    const grid = {
      term: String(seed.grid?.term || 'first'),
      month: Number(seed.grid?.month || 1),
      subjectName: String(seed.grid?.subjectName || ''),
      classKey: String(seed.grid?.classKey || ''),
      weekView: String(seed.grid?.weekView || 'all')
    };
    let teacherFiltersOpen = false;

    return Object.freeze({
      teacherDaily: Object.freeze({
        get() { return { ...teacherDaily }; },
        set(patch) { Object.assign(teacherDaily, patch || {}); return { ...teacherDaily }; },
        reset() { teacherDaily.subjectName = ''; teacherDaily.classKey = ''; teacherDaily.dateISO = ''; return { ...teacherDaily }; }
      }),
      grid: Object.freeze({
        get() { return { ...grid }; },
        set(patch) { Object.assign(grid, patch || {}); if (!Number.isFinite(grid.month) || grid.month < 1) grid.month = 1; return { ...grid }; },
        weekView() { return grid.weekView; }
      }),
      teacherFilters: Object.freeze({
        isOpen() { return teacherFiltersOpen; },
        toggle() { teacherFiltersOpen = !teacherFiltersOpen; return teacherFiltersOpen; },
        setOpen(value) { teacherFiltersOpen = !!value; return teacherFiltersOpen; }
      })
    });
  }

  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.createAttendanceUIState = createAttendanceUIState;
  GSP.createAttendanceUIState = createAttendanceUIState;
})(window);
