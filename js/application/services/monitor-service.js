/*
 * Monitor application service.
 * STEP 21: exposes monitor analytics through an application boundary so the
 * feature facade does not call the analytics implementation directly.
 */
(function (root) {
  'use strict';

  const GSP = root.GSP || (root.GSP = {});

  function createMonitorService(deps) {
    const d = deps || {};
    const analytics = d.analytics;
    if (!analytics) throw new Error('Monitor service: analytics dependency is required');

    const service = {
      studentSubjectScore: function (db, student, subject) {
        return analytics.studentSubjectScore(db, student, subject);
      },
      computeTeacherMetrics: function (db, teacher) {
        return analytics.computeTeacherMetrics(db, teacher);
      },
      classMetrics: function (db) {
        return analytics.classMetrics(db);
      }
    };

    return Object.freeze(service);
  }

  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.createMonitorService = createMonitorService;
  // STEP 24: factory not on GSP root — use GSP.application.services.createMonitorService
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.createMonitorService = createMonitorService;
})(window);
