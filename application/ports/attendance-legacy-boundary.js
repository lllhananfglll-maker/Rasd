/*
 * Attendance legacy capability boundary.
 * STEP 20: the Composition Root is the only place that resolves legacy
 * window/GSP capabilities. Application services receive capabilities through
 * dependency injection and do not need to discover browser globals themselves.
 */
(function (root) {
  'use strict';

  const GSP = root.GSP || (root.GSP = {});

  function resolve(name, fallback) {
    if (typeof GSP[name] === 'function') return GSP[name];
    if (typeof root[name] === 'function') return root[name];
    return fallback;
  }

  function requireFn(name, fallback) {
    const fn = resolve(name, fallback);
    if (typeof fn !== 'function') {
      throw new Error('Attendance legacy boundary: missing dependency ' + name);
    }
    return fn;
  }

  function createAttendanceLegacyBoundary() {
    const deps = {
      loadDB: requireFn('loadDB'),
      saveDB: requireFn('saveDB'),
      ensureAttendance: requireFn('ensureAttendance'),
      gspTodayISO: requireFn('gspTodayISO'),
      getMonthCalendarDays: requireFn('getMonthCalendarDays'),
      getMonthLabels: resolve('getMonthLabels', () => ['', '']),
      getSubjectStudyDays: requireFn('getSubjectStudyDays'),
      isAttendanceMonthLocked: requireFn('isAttendanceMonthLocked'),
      collectSchoolHolidaySet: requireFn('collectSchoolHolidaySet'),
      recordKey: requireFn('recordKey'),
      subjectDaysKey: requireFn('subjectDaysKey'),
      trendFromRates: resolve('trendFromRates'),
      countStudyCalendarDays: resolve('countStudyCalendarDays'),
      deviceTodayISO: resolve('deviceTodayISO'),
      getRootDB: resolve('getRootDB'),
      saveRootDB: resolve('saveRootDB'),
      persistRootDB: resolve('persistRootDB'),
      emptyStageData: resolve('emptyStageData'),
      scheduleCloudPush: resolve('scheduleCloudPush'),
      notifyIfSkipSuspectsAfterSave: resolve('notifyIfSkipSuspectsAfterSave'),
      applySyncForFilter: resolve('applySyncForFilter'),
      renderAttendanceGrid: resolve('renderAttendanceGrid'),
      // Robust fallback: the legacy controller normally exports getFilterState,
      // but the composition root must remain usable even if that export is late.
      getFilterState: resolve('getFilterState', function () {
        const state = GSP.application && GSP.application.attendanceUIState;
        const current = state && state.grid ? state.grid.get() : null;
        const value = {
          term: document.getElementById('attTermSelect')?.value || 'first',
          month: parseInt(document.getElementById('attMonthSelect')?.value || '1', 10),
          subjectName: document.getElementById('attSubjectSelect')?.value || '',
          classKey: document.getElementById('attClassSelect')?.value || ''
        };
        if (state && state.grid) state.grid.set(value);
        return current ? Object.assign({}, current, value) : value;
      }),
      getCurrentTeacher: resolve('getCurrentTeacher', () => null),
      escapeHtml: resolve('escapeHtml', value => String(value ?? '')),
      classSectionKey: resolve('classSectionKey', (c, s) => (c || '') + '§' + (s || '')),
      classSectionLabel: resolve('classSectionLabel', key => key || ''),
      canAccessStudentGrade: resolve('canAccessStudentGrade', () => true),
      computeStudentAttendanceScore: resolve('computeStudentAttendanceScore'),
      showConfirm: resolve('showConfirm', () => Promise.resolve(false)),
      gspArgs: resolve('gspArgs', args => JSON.stringify(args)),
      parseISO: requireFn('parseISO', iso => iso ? new Date(iso + 'T00:00:00') : null),
      toISO: requireFn('toISO', date => date ? date.toISOString().slice(0, 10) : ''),
      findTermMonthForDate: resolve('findTermMonthForDate')
    };

    return Object.freeze(deps);
  }

  GSP.application = GSP.application || {};
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.createAttendanceLegacyBoundary = createAttendanceLegacyBoundary;
  GSP.createAttendanceLegacyBoundary = createAttendanceLegacyBoundary;
})(window);
