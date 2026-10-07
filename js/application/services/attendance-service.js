/*
 * Attendance application service factory.
 * STEP 14: all persistence/domain dependencies are injected. The service has
 * no fallback lookup into window/GSP and can therefore be tested in isolation.
 */
(function (root) {
  'use strict';

  const GSP = root.GSP || (root.GSP = {});

  function createAttendanceService(deps) {
    const d = deps || {};
    const repository = d.repository;
    const policy = d.policy;
    const transaction = d.transaction || null;
    const rollbackCurrentDB = typeof d.rollbackCurrentDB === 'function' ? d.rollbackCurrentDB : null;
    if (!repository) throw new Error('Attendance service: repository dependency is required');
    if (!policy) throw new Error('Attendance service: workday policy dependency is required');

    const service = {};

    service.getDatabase = function () { return repository.load(); };
    service.saveDatabase = function (db, protectKeys) { return repository.save(db, protectKeys); };
    service.getAttendanceState = function () { return repository.read(); };

    service.validateDate = function (iso) {
      if (!iso) return { ok:false, reason:'لا يوجد تاريخ' };
      const today = d.todayISO();
      if (iso > today) return { ok:false, reason:'لا يمكن تسجيل حضور لتاريخ في المستقبل' };
      const min = d.addDaysISO(today, -31);
      if (iso < min) return { ok:false, reason:'يُسمح بالتعديل خلال آخر 31 يوماً فقط' };
      const tm = d.findTermMonthForDate(iso);
      if (!tm) return { ok:false, reason:'التاريخ خارج نطاق الشهور المعرّفة. اضبط تواريخ الأسبوع الأول من بيانات المدرسة.' };
      const db = repository.load();
      if (d.isAttendanceMonthLocked(db, tm.term, tm.month)) {
        return { ok:false, reason:'الشهر مقفول — عرض فقط', locked:true, term:tm.term, month:tm.month };
      }
      const att = repository.ensure(db);
      const holidaySet = d.collectSchoolHolidaySet();
      if (holidaySet.has(iso)) {
        return { ok:false, reason:'هذا اليوم إجازة رسمية — لا يمكن تسجيل الحضور', holiday:true, term:tm.term, month:tm.month };
      }
      if (!policy.isSchoolWorkingDay(att, iso)) {
        return { ok:false, reason:policy.explainNonWorkingDay(att, iso), nonWorkingDay:true, term:tm.term, month:tm.month };
      }
      return { ok:true, term:tm.term, month:tm.month };
    };

    service.writeMark = function (studentId, subjectName, term, month, dateISO, mark) {
      const apply = (db) => {
        const att = repository.ensure(db);
        const key = d.recordKey(studentId, subjectName, term, month, dateISO);
        if (mark === 'present' || mark === '✓' || mark === 'ح') att.records[key] = '✓';
        else if (mark === 'absent' || mark === 'غ') att.records[key] = 'غ';
        else if (mark === 'excuse' || mark === 'ع') att.records[key] = 'ع';
        else delete att.records[key];
        return key;
      };
      if (transaction && typeof transaction.executeSync === 'function') {
        const tx = transaction.executeSync({
          label: 'attendance.writeMark',
          load: repository.load,
          save: repository.save,
          rollback: rollbackCurrentDB,
          work: apply
        });
        return { ok: true, key: tx.result, persistence: tx.persistence, transaction: tx };
      }
      const db = repository.load();
      const key = apply(db);
      repository.save(db);
      if (typeof d.scheduleCloudPush === 'function') d.scheduleCloudPush();
      return { ok: true, key };
    };

    service.writeMarks = function (marks, options) {
      const list = Array.isArray(marks) ? marks : [];
      const opts = options || {};
      const apply = (db) => {
        if (typeof opts.prepare === 'function') opts.prepare(db);
        const att = repository.ensure(db);
        list.forEach(item => {
          const key = d.recordKey(item.studentId, item.subjectName, item.term, item.month, item.dateISO);
          const mark = item.mark;
          if (mark === 'present' || mark === '✓' || mark === 'ح') att.records[key] = '✓';
          else if (mark === 'absent' || mark === 'غ') att.records[key] = 'غ';
          else if (mark === 'excuse' || mark === 'ع') att.records[key] = 'ع';
          else delete att.records[key];
        });
        return list.length;
      };
      if (transaction && typeof transaction.executeSync === 'function') {
        const tx = transaction.executeSync({ label: 'attendance.bulkWrite', load: repository.load, save: repository.save, rollback: rollbackCurrentDB, work: apply });
        return { ok:true, count:tx.result || 0, persistence:tx.persistence, transaction:tx };
      }
      const db = repository.load();
      const count = apply(db); repository.save(db);
      if (typeof d.scheduleCloudPush === 'function') d.scheduleCloudPush();
      return { ok:true, count };
    };

    // Read-only feature context: presentation code receives capabilities rather
    // than resolving legacy globals itself.
    service.ui = Object.freeze({
      todayISO: d.todayISO,
      currentTeacher: d.currentTeacher,
      escapeHtml: d.escapeHtml,
      classSectionKey: d.classSectionKey,
      classSectionLabel: d.classSectionLabel,
      canAccessStudentGrade: d.canAccessStudentGrade,
      getMonthLabels: d.getMonthLabels,
      getMonthCalendarDays: d.getMonthCalendarDays,
      getSubjectStudyDays: d.getSubjectStudyDays,
      isAttendanceMonthLocked: d.isAttendanceMonthLocked,
      collectSchoolHolidaySet: d.collectSchoolHolidaySet,
      gspArgs: d.gspArgs,
      parseISO: d.parseISO,
      toISO: d.toISO,
      scheduleCloudPush: d.scheduleCloudPush
    });

    return Object.freeze(service);
  }

  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.createAttendanceService = createAttendanceService;
  GSP.createAttendanceService = createAttendanceService;
})(window);
