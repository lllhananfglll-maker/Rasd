/* Monitor UI adapter: isolates the feature facade from legacy controller globals. */
(function (root) {
  'use strict';

  function createMonitorUIAdapter(host) {
    const api = {
      mount: (...args) => host.mountMonitorChrome?.(...args),
      unmount: (...args) => host.unmountMonitorChrome?.(...args),
      collectStageAnalytics: (...args) => host.collectStageAnalytics?.(...args),
      buildTeacherRows: (...args) => host.buildMonitorTeacherRows?.(...args),
      applyViewOnlyUI: (...args) => host.applyMonitorViewOnlyUI?.(...args)
    };
    return Object.freeze(api);
  }

  const GSP = root.GSP || (root.GSP = {});
  GSP.application = GSP.application || {};
  GSP.application.ui = GSP.application.ui || {};
  GSP.application.ui.monitor = createMonitorUIAdapter(root);
  // STEP 24: factory under ports, not GSP root
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.createMonitorUIAdapter = createMonitorUIAdapter;
})(window);
