/* Monitor feature facade: explicit feature boundary with a dedicated UI adapter. */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});
  const context = (GSP.application && GSP.application.context) || {};
  const application = context.application || GSP.application || {};
  const ui = context.ui?.monitor || application.ui?.monitor || {};
  const monitorService = application.monitor || null;
  const analytics = context.domain?.monitorAnalytics || GSP.monitorAnalytics || {};
  const api = {
    ui: Object.freeze({
      mount: (...args) => ui.mount?.(...args),
      unmount: (...args) => ui.unmount?.(...args),
      collectStageAnalytics: (...args) => ui.collectStageAnalytics?.(...args),
      buildTeacherRows: (...args) => ui.buildTeacherRows?.(...args),
      applyViewOnlyUI: (...args) => ui.applyViewOnlyUI?.(...args)
    }),
    mount: (...args) => ui.mount?.(...args),
    unmount: (...args) => ui.unmount?.(...args),
    collectStageAnalytics: (...args) => ui.collectStageAnalytics?.(...args),
    studentSubjectScore: (...args) => monitorService?.studentSubjectScore?.(...args),
    computeTeacherMetrics: (...args) => monitorService?.computeTeacherMetrics?.(...args),
    classMetrics: (...args) => monitorService?.classMetrics?.(...args),
    buildTeacherRows: (...args) => ui.buildTeacherRows?.(...args),
    applyViewOnlyUI: (...args) => ui.applyViewOnlyUI?.(...args),
    application: monitorService,
    analytics: Object.freeze({ ...analytics })
  };
  GSP.features = GSP.features || {};
  GSP.features.monitor = Object.freeze(api);
})(window);
