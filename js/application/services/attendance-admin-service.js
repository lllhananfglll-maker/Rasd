/*
 * Attendance administration application service.
 * STEP 15: keeps attendance settings/holiday/subject-schedule mutations out of
 * the UI controller while preserving the existing storage model.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});

  function createAttendanceAdminService(deps) {
    const d = deps || {};
    if (!d.repository) throw new Error('Attendance admin service: repository is required');
    if (typeof d.ensureAttendance !== 'function') throw new Error('Attendance admin service: ensureAttendance is required');
    if (typeof d.saveRootDB !== 'function' && typeof d.persistRootDB !== 'function') {
      if (typeof d.saveDB !== 'function') throw new Error('Attendance admin service: persistence capability is required');
    }

    function applyToAllStages(mutator) {
      const rootDB = typeof d.getRootDB === 'function' ? d.getRootDB() : null;
      if (!rootDB || !Array.isArray(rootDB.stages)) {
        const db = d.repository.load();
        const att = d.repository.ensure(db);
        mutator(att, db);
        d.repository.save(db);
        return 1;
      }
      let count = 0;
      rootDB.stages.forEach(st => {
        if (!st.data) st.data = typeof d.emptyStageData === 'function' ? d.emptyStageData() : {};
        const att = d.ensureAttendance(st.data);
        mutator(att, st.data);
        count++;
      });
      if (typeof d.saveRootDB === 'function') d.saveRootDB(rootDB);
      else if (typeof d.persistRootDB === 'function') d.persistRootDB(rootDB);
      return count;
    }

    return Object.freeze({
      applyToAllStages,
      saveSchoolSettings(saturdayEnabled, syncToGrades) {
        applyToAllStages(att => { att.saturdayEnabled = !!saturdayEnabled; });
        const db = d.repository.load();
        const att = d.repository.ensure(db);
        att.syncToGrades = !!syncToGrades;
        d.repository.save(db);
      },
      addHoliday(iso) {
        return applyToAllStages(att => {
          if (!att.holidays.includes(iso)) att.holidays.push(iso);
          att.holidays.sort();
        });
      },
      removeHoliday(iso) {
        return applyToAllStages(att => {
          att.holidays = (att.holidays || []).filter(h => h !== iso);
        });
      },
      saveSubjectDays(subjectName, classKey, days) {
        const db = d.repository.load();
        const att = d.repository.ensure(db);
        const key = d.subjectDaysKey(subjectName, classKey);
        att.subjectDays[key] = days.slice();
        d.repository.save(db);
      }
    });
  }

  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.createAttendanceAdminService = createAttendanceAdminService;
  GSP.createAttendanceAdminService = createAttendanceAdminService;
})(window);
