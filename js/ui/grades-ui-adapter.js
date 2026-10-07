/* Grades UI adapter — STEP 26: single UI-facing boundary for grades controllers. */
(function (root) {
  'use strict';

  function createGradesUIAdapter(host) {
    const GSP = host.GSP || {};
    const api = {
      loadUI: (...args) => host.loadGradesUI?.(...args) || GSP.loadGradesUI?.(...args),
      saveAll: (...args) => host.saveAllGrades?.(...args) || GSP.saveAllGrades?.(...args),
      renderLockCenter: (...args) => host.renderLockCenter?.(...args) || GSP.renderLockCenter?.(...args),
      updateGlobalLockUI: (...args) => host.updateGlobalLockUI?.(...args) || GSP.updateGlobalLockUI?.(...args),
      refreshClassOptions: (...args) => host.refreshGradeClassOptions?.(...args) || GSP.refreshGradeClassOptions?.(...args)
    };
    return Object.freeze(api);
  }

  const GSP = root.GSP || (root.GSP = {});
  GSP.application = GSP.application || {};
  GSP.application.ui = GSP.application.ui || {};
  GSP.application.ui.grades = createGradesUIAdapter(root);
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.createGradesUIAdapter = createGradesUIAdapter;
})(window);
