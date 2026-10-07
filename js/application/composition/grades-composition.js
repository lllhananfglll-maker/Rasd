/*
 * Grades composition root — STEP 25/26.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});
  const services = GSP.application && GSP.application.services;
  if (!services || typeof services.createGradesService !== 'function') {
    throw new Error('Grades composition: service factory unavailable');
  }
  if (!services.transaction && typeof services.createTransactionService === 'function') {
    services.transaction = services.createTransactionService({ audit: services.audit || null });
  }
  const gradeLogic = root.GSPGradeLogic || null;
  const repositories = GSP.infrastructure && GSP.infrastructure.repositories;
  const stageDataRepository = repositories && typeof repositories.createStageDataRepository === 'function'
    ? repositories.createStageDataRepository({ loadDB: GSP.getDB || root.getDB, saveDB: GSP.saveDB || root.saveDB })
    : null;
  const gradesRepository = repositories && stageDataRepository && typeof repositories.createGradesRepository === 'function'
    ? repositories.createGradesRepository({ stageData: stageDataRepository })
    : null;
  if (gradesRepository) repositories.grades = gradesRepository;
  GSP.application.grades = services.createGradesService({ gradeLogic: gradeLogic });

  if (typeof services.createGradesLockService === 'function') {
    const resolve = (name, fallback) => {
      if (typeof GSP[name] === 'function') return GSP[name];
      if (typeof root[name] === 'function') return root[name];
      return fallback;
    };
    const logic = gradeLogic || {};
    GSP.application.gradesLock = services.createGradesLockService({
      repository: gradesRepository,
      loadDB: resolve('loadDB'),
      saveDB: resolve('saveDB'),
      lockKey: logic.lockKey || resolve('lockKey', (c,s,t,m) => String(c)+'||'+String(s)+'||'+String(t)+'||'+String(m)),
      monthLockKey: logic.monthLockKey || resolve('monthLockKey', (t,m) => String(t)+'||'+String(m)),
      isTermLocked: logic.isTermLocked || resolve('isTermLocked', (db, term) => !!(db && db.termLocks && db.termLocks[term])),
      getRole: function () {
        try {
          if (typeof root.currentRole !== 'undefined') return root.currentRole;
          if (typeof GSP.getCurrentRole === 'function') return GSP.getCurrentRole();
        } catch (e) {}
        return null;
      },
      scheduleCloudPush: resolve('scheduleCloudPush', null)
    });
  }

  if (typeof services.createGradesBulkService === 'function') {
    const resolve = (name, fallback) => {
      if (typeof GSP[name] === 'function') return GSP[name];
      if (typeof root[name] === 'function') return root[name];
      return fallback;
    };
    const logic = gradeLogic || {};
    GSP.application.gradesBulk = services.createGradesBulkService({
      repository: gradesRepository,
      loadDB: resolve('loadDB'),
      saveDB: resolve('saveDB'),
      isGradeEntryLocked: (logic.isGradeEntryLocked || resolve('isGradeEntryLocked', function () { return false; })),
      canAccessGrade: resolve('canAccessGrade', function () { return true; }),
      canAccessStudentGrade: resolve('canAccessStudentGrade', function () { return true; }),
      classSectionKey: resolve('classSectionKey', function (c, s) { return (c || '') + (s ? '§' + s : ''); }),
      filterStudentsForTeacherLanguage: resolve('filterStudentsForTeacherLanguage', function (students) { return students; }),
      scheduleCloudPush: resolve('scheduleCloudPush', null),
      recordAudit: resolve('recordAudit', null),
      getActorName: function () {
        try {
          if (typeof root.currentUserLabel === 'function') return root.currentUserLabel();
        } catch (e) {}
        return '';
      },
      transaction: services.transaction || null,
      rollback: resolve('replaceCurrentStageDataInMemory', null)
    });
  }

  if (typeof services.createGradesSaveService === 'function') {
    const resolve = (name, fallback) => {
      if (typeof GSP[name] === 'function') return GSP[name];
      if (typeof root[name] === 'function') return root[name];
      return fallback;
    };
    const logic = gradeLogic || {};
    GSP.application.gradesSave = services.createGradesSaveService({
      repository: gradesRepository,
      loadDB: resolve('loadDB'),
      saveDB: resolve('saveDB'),
      isGradeEntryLocked: logic.isGradeEntryLocked || resolve('isGradeEntryLocked', function () { return false; }),
      parseStrictGradeInput: logic.parseStrictGradeInput || resolve('parseStrictGradeInput', function (raw) {
        return { ok: true, score: raw === '' ? null : raw, reason: '' };
      }),
      canAccessGrade: resolve('canAccessGrade', function () { return true; }),
      canAccessStudentGrade: resolve('canAccessStudentGrade', function () { return true; }),
      canEditGrades: function () { return !GSP.permissionMatrix || GSP.permissionMatrix.can('grades.edit'); },
      scheduleCloudPush: resolve('scheduleCloudPush', null),
      recordAudit: resolve('recordAudit', null),
      isAbsentMark: logic.isAbsentMark || resolve('isAbsentMark', function (v) { return v === 'غ'; }),
      getActorName: function () {
        try {
          if (typeof root.currentUserLabel === 'function') return root.currentUserLabel();
        } catch (e) {}
        return '';
      },
      transaction: services.transaction || null,
      rollback: resolve('replaceCurrentStageDataInMemory', null)
    });
  }

  if (typeof services.createGradesUIState === 'function') {
    GSP.application.gradesUIState = services.createGradesUIState({});
  }
})(window);


