/*
 * Application context — STEP 32.
 *
 * Creates one stable dependency map after all composition roots and UI adapters
 * have been initialized. Features consume this context instead of repeatedly
 * traversing GSP.application / GSP.infrastructure.
 *
 * This is an additive boundary: the legacy GSP surface remains available for
 * HTML/data-action compatibility and is not removed in this step.
 */
(function (root) {
  'use strict';

  const GSP = root.GSP || (root.GSP = {});
  const application = GSP.application || (GSP.application = {});
  const infrastructure = GSP.infrastructure || (GSP.infrastructure = {});
  const ports = application.ports || {};
  const ui = application.ui || {};
  const services = application.services || {};
  const repositories = infrastructure.repositories || {};

  const freezeMap = (value) => Object.freeze(Object.assign({}, value || {}));

  function createApplicationContext() {
    const context = {
      domain: freezeMap({
        grades: GSP.GSPGradeLogic || null,
        attendanceCalendar: GSP.attendanceCalendar || null,
        attendanceWorkdayPolicy: GSP.attendanceWorkdayPolicy || null,
        monitorAnalytics: GSP.monitorAnalytics || null
      }),
      application: freezeMap({
        services,
        attendance: application.attendance || null,
        attendanceAdmin: application.attendanceAdmin || null,
        attendanceGrid: application.attendanceGridActions || null,
        attendanceReport: application.attendanceReport || null,
        attendanceUIState: application.attendanceUIState || null,
        attendanceNotification: application.attendanceNotification || null,
        grades: application.grades || null,
        gradesLock: application.gradesLock || null,
        gradesBulk: application.gradesBulk || null,
        gradesSave: application.gradesSave || null,
        gradesUIState: application.gradesUIState || null,
        monitor: application.monitor || null,
        transaction: services.transaction || null,
        audit: services.audit || null,
        permissions: services.permissions || null,
        configuration: services.configuration || null,
        dataMigration: services.dataMigration || null,
        importValidation: services.importValidation || null,
        performance: services.performance || null
      }),
      infrastructure: freezeMap({ repositories, database: infrastructure.database || {} }),
      ports: freezeMap(ports),
      ui: freezeMap(ui),
      features: freezeMap(GSP.features || {})
    };

    return Object.freeze(context);
  }

  const context = createApplicationContext();
  application.createContext = createApplicationContext;
  application.context = context;
})(window);
