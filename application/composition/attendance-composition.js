/*
 * Attendance composition root.
 * STEP 14: resolves legacy application capabilities once, then injects them
 * into infrastructure and application layers. Feature code no longer performs
 * global dependency discovery.
 */
(function (root) {
  'use strict';

  const GSP = root.GSP || (root.GSP = {});
  const infra = GSP.infrastructure && GSP.infrastructure.repositories;
  const services = GSP.application && GSP.application.services;
  if (!infra || typeof infra.createAttendanceRepository !== 'function') {
    throw new Error('Attendance composition: repository factory is unavailable');
  }
  if (!services || typeof services.createAttendanceService !== 'function') {
    throw new Error('Attendance composition: service factory is unavailable');
  }

  const ports = GSP.application && GSP.application.ports;
  if (!ports || typeof ports.createAttendanceLegacyBoundary !== 'function') {
    throw new Error('Attendance composition: legacy boundary is unavailable');
  }
  const legacy = ports.createAttendanceLegacyBoundary();
  const resolve = (name, fallback) => {
    if (Object.prototype.hasOwnProperty.call(legacy, name) && typeof legacy[name] === 'function') return legacy[name];
    if (typeof GSP[name] === 'function') return GSP[name];
    if (typeof root[name] === 'function') return root[name];
    const cal = GSP.attendanceCalendar || (root.GSP_DOMAIN && root.GSP_DOMAIN.attendanceCalendar);
    if (cal && typeof cal[name] === 'function') return cal[name];
    return fallback;
  };
  const requireFn = (name, fallback) => {
    const fn = resolve(name, fallback);
    if (typeof fn !== 'function') throw new Error('Attendance composition: missing dependency ' + name);
    return fn;
  };

  if (services && typeof services.createAttendanceNotificationService === 'function') {
    GSP.application.attendanceNotification = services.createAttendanceNotificationService({
      alert: typeof root.alert === 'function' ? root.alert.bind(root) : null,
      showConfirm: requireFn('showConfirm', function () { return Promise.resolve(false); }),
      logger: root.console
    });
  }

  if (!services.transaction && typeof services.createTransactionService === 'function') {
    services.transaction = services.createTransactionService({ audit: services.audit || null });
  }
  const repository = infra.createAttendanceRepository({
    loadDB: requireFn('loadDB'),
    saveDB: requireFn('saveDB'),
    ensureAttendance: requireFn('ensureAttendance')
  });
  const uiStateFactory = services && services.createAttendanceUIState;
  if (typeof uiStateFactory === 'function') {
    GSP.application.attendanceUIState = uiStateFactory();
  }

  const policy = GSP.attendanceWorkdayPolicy;
  if (!policy) throw new Error('Attendance composition: workday policy is unavailable');

  const deps = {
    repository,
    policy,
    todayISO: requireFn('gspTodayISO'),
    addDaysISO: (iso, days) => {
      const parseISO = requireFn('parseISO', iso2 => iso2 ? new Date(iso2 + 'T00:00:00') : null);
      const toISO = requireFn('toISO', d => d ? d.toISOString().slice(0,10) : '');
      const date = parseISO(iso);
      if (!date) return iso;
      date.setDate(date.getDate() + days);
      return toISO(date);
    },
    findTermMonthForDate: (iso) => {
      if (!iso) return null;
      const getMonthCalendarDays = requireFn('getMonthCalendarDays', () => []);
      const getMonthLabels = resolve('getMonthLabels', () => ['', '']);
      for (const term of ['first', 'second']) {
        let count = 2;
        try { count = getMonthLabels(term).length || 2; } catch (e) {}
        for (let month = 1; month <= count; month++) {
          const cols = getMonthCalendarDays(term, month);
          if (cols.some(c => c.dateISO === iso)) return { term, month };
        }
      }
      return null;
    },
    isAttendanceMonthLocked: requireFn('isAttendanceMonthLocked'),
    collectSchoolHolidaySet: requireFn('collectSchoolHolidaySet'),
    recordKey: requireFn('recordKey'),
    scheduleCloudPush: resolve('scheduleCloudPush'),
    currentTeacher: () => typeof GSP.getCurrentTeacher === 'function' ? GSP.getCurrentTeacher() : null,
    escapeHtml: resolve('escapeHtml', v => String(v ?? '')),
    classSectionKey: resolve('classSectionKey', (c, s) => (c || '') + '§' + (s || '')),
    classSectionLabel: resolve('classSectionLabel', k => k || ''),
    canAccessStudentGrade: resolve('canAccessStudentGrade', () => true),
    getMonthLabels: resolve('getMonthLabels', () => ['', '']),
    getMonthCalendarDays: requireFn('getMonthCalendarDays'),
    getSubjectStudyDays: requireFn('getSubjectStudyDays'),
    gspArgs: resolve('gspArgs', args => JSON.stringify(args)),
    parseISO: requireFn('parseISO', iso => iso ? new Date(iso + 'T00:00:00') : null),
    toISO: requireFn('toISO', d => d ? d.toISOString().slice(0,10) : ''),
    transaction: services.transaction || null,
    rollbackCurrentDB: resolve('replaceCurrentStageDataInMemory', null),
    canEditAttendance: function () { return !GSP.permissionMatrix || GSP.permissionMatrix.can('attendance.edit'); }
  };

  if (typeof services.createAttendanceAdminService === 'function') {
    const adminService = services.createAttendanceAdminService({
      repository,
      ensureAttendance: requireFn('ensureAttendance'),
      saveDB: requireFn('saveDB'),
      getRootDB: resolve('getRootDB'),
      saveRootDB: resolve('saveRootDB'),
      persistRootDB: resolve('persistRootDB'),
      emptyStageData: resolve('emptyStageData'),
      subjectDaysKey: requireFn('subjectDaysKey')
    });
    GSP.application.attendanceAdmin = adminService;
  }

  const gridActions = services.createAttendanceGridActions({
    loadDB: requireFn('loadDB'),
    saveDB: requireFn('saveDB'),
    ensureAttendance: requireFn('ensureAttendance'),
    getFilterState: resolve('getFilterState'),
    isAttendanceMonthLocked: requireFn('isAttendanceMonthLocked'),
    showConfirm: requireFn('showConfirm'),
    notify: GSP.application.attendanceNotification,
    getMonthCalendarDays: requireFn('getMonthCalendarDays'),
    getSubjectStudyDays: requireFn('getSubjectStudyDays'),
    getActiveDayIndices: requireFn('getActiveDayIndices'),
    isColumnStudyDay: requireFn('isColumnStudyDay'),
    recordKey: requireFn('recordKey'),
    deviceTodayISO: requireFn('deviceTodayISO'),
    scheduleCloudPush: resolve('scheduleCloudPush'),
    notifyIfSkipSuspectsAfterSave: resolve('notifyIfSkipSuspectsAfterSave'),
    applySyncForFilter: resolve('applySyncForFilter'),
    getAccountType: () => typeof root.currentAccountType !== 'undefined' ? root.currentAccountType : (typeof currentAccountType !== 'undefined' ? currentAccountType : ''),
    renderAttendanceGrid: resolve('renderAttendanceGrid'),
    transaction: services.transaction || null,
    rollbackCurrentDB: resolve('replaceCurrentStageDataInMemory', null)
  });
  GSP.application.attendanceGridActions = gridActions;
  if (typeof services.createAttendanceReportService === 'function') {
    GSP.application.attendanceReport = services.createAttendanceReportService({
      ensureAttendance: requireFn('ensureAttendance'),
      computeClassAttendanceAgg: (db, att, classKey, term, month, weekFilter) => GSP.attendanceAnalytics.computeClassAttendanceAgg(db, att, classKey, term, month, weekFilter, {
        getMonthCalendarDays: requireFn('getMonthCalendarDays'),
        getSubjectStudyDays: requireFn('getSubjectStudyDays'),
        computeStudentAttendanceScore: requireFn('computeStudentAttendanceScore'),
        classSectionKey: resolve('classSectionKey'),
        canAccessStudentGrade: resolve('canAccessStudentGrade'),
        getMonthLabels: resolve('getMonthLabels'),
        classSectionLabel: resolve('classSectionLabel'),
        trendFromRates: GSP.attendanceCalendar && GSP.attendanceCalendar.trendFromRates,
        loadDB: requireFn('loadDB'),
        ensureAttendance: requireFn('ensureAttendance'),
        countStudyCalendarDays: requireFn('countStudyCalendarDays')
      }),
      countStudyCalendarDays: requireFn('countStudyCalendarDays'),
      trendFromRates: GSP.attendanceCalendar && GSP.attendanceCalendar.trendFromRates,
      getMonthLabels: resolve('getMonthLabels', () => ['', '']),
      classSectionLabel: resolve('classSectionLabel', k => k || ''),
      buildAggregateRows: (term, month, weekFilter) => GSP.attendanceAnalytics.buildAggregateRows(term, month, weekFilter, {
        getMonthCalendarDays: requireFn('getMonthCalendarDays'),
        getSubjectStudyDays: requireFn('getSubjectStudyDays'),
        computeStudentAttendanceScore: requireFn('computeStudentAttendanceScore'),
        classSectionKey: resolve('classSectionKey'),
        canAccessStudentGrade: resolve('canAccessStudentGrade'),
        getMonthLabels: resolve('getMonthLabels'),
        classSectionLabel: resolve('classSectionLabel'),
        trendFromRates: GSP.attendanceCalendar && GSP.attendanceCalendar.trendFromRates,
        loadDB: requireFn('loadDB'), ensureAttendance: requireFn('ensureAttendance'), countStudyCalendarDays: requireFn('countStudyCalendarDays')
      })
    });
  }

  const service = services.createAttendanceService(deps);
  GSP.infrastructure.repositories.attendance = repository;
  // STEP 23: do not expose repository on GSP root — use GSP.infrastructure.repositories.attendance
  GSP.application.attendance = service;
  GSP.application.attendanceContext = Object.freeze(service.ui);
})(window);
