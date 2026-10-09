/*
 * Grades application service — STEP 25.
 * Thin boundary over pure grade logic (locks / parse / aggregate).
 * UI controllers keep persistence and DOM; this service centralizes pure rules access.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});

  function createGradesService(deps) {
    const d = deps || {};
    const logic = d.gradeLogic || root.GSPGradeLogic || {};

    function need(fn, name) {
      if (typeof fn !== 'function') throw new Error('Grades service: missing ' + name);
      return fn;
    }

    const lockKey = need(logic.lockKey || d.lockKey, 'lockKey');
    const monthLockKey = need(logic.monthLockKey || d.monthLockKey, 'monthLockKey');
    const isTermLocked = need(logic.isTermLocked || d.isTermLocked, 'isTermLocked');
    const isGradeEntryLocked = need(logic.isGradeEntryLocked || d.isGradeEntryLocked, 'isGradeEntryLocked');
    const parseStrictGradeInput = need(logic.parseStrictGradeInput || d.parseStrictGradeInput, 'parseStrictGradeInput');
    const aggregateAbsentAwareValues = logic.aggregateAbsentAwareValues || d.aggregateAbsentAwareValues;

    const service = {
      lockKey: function (cls, subj, term, month) { return lockKey(cls, subj, term, month); },
      monthLockKey: function (term, month) { return monthLockKey(term, month); },
      isTermLocked: function (db, term) { return isTermLocked(db, term); },
      isGradeEntryLocked: function (db, cls, subjectName, term, month) {
        return isGradeEntryLocked(db, cls, subjectName, term, month);
      },
      parseStrictGradeInput: function (raw, maxScore) {
        return parseStrictGradeInput(raw, maxScore);
      },
      aggregateAbsentAwareValues: function (values, mode) {
        if (typeof aggregateAbsentAwareValues !== 'function') return null;
        return aggregateAbsentAwareValues(values, mode);
      },
      absentsMark: function () {
        return logic.ABSENT_MARK || 'غ';
      }
    };

    return Object.freeze(service);
  }

  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.createGradesService = createGradesService;
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.createGradesService = createGradesService;
})(window);
