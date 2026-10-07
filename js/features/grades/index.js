/* Grades feature facade — STEP 25/26. */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});
  const context = (GSP.application && GSP.application.context) || {};
  const application = context.application || GSP.application || {};
  const ui = (context.ui && context.ui.grades) || (application.ui && application.ui.grades) || {};
  const prior = (GSP.features && GSP.features.grades) || {};
  const api = {
    application: application.grades || null,
    lock: application.gradesLock || null,
    bulk: application.gradesBulk || null,
    save: application.gradesSave || null,
    uiState: application.gradesUIState || null,
    ui: Object.freeze({
      loadUI: (...args) => ui.loadUI && ui.loadUI(...args),
      saveAll: (...args) => ui.saveAll && ui.saveAll(...args),
      renderLockCenter: (...args) => ui.renderLockCenter && ui.renderLockCenter(...args),
      updateGlobalLockUI: (...args) => ui.updateGlobalLockUI && ui.updateGlobalLockUI(...args)
    }),
    helpers: prior.helpers || null,
    loadUI: function () { return typeof GSP.loadGradesUI === 'function' ? GSP.loadGradesUI.apply(null, arguments) : null; },
    saveAll: function () { return typeof GSP.saveAllGrades === 'function' ? GSP.saveAllGrades.apply(null, arguments) : null; },
    isEntryLocked: function (db, cls, subjectName, term, month) {
      if (application.grades && typeof application.grades.isGradeEntryLocked === 'function') {
        return application.grades.isGradeEntryLocked(db, cls, subjectName, term, month);
      }
      return false;
    }
  };
  GSP.features = GSP.features || {};
  GSP.features.grades = Object.freeze(Object.assign({}, prior, api));
})(window);
