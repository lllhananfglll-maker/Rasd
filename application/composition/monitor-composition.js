/*
 * Monitor composition root.
 * STEP 21: composes the Monitor application service from the feature's pure
 * analytics dependency. UI/controller callbacks remain outside the service.
 */
(function (root) {
  'use strict';

  const GSP = root.GSP || (root.GSP = {});
  const services = GSP.application && GSP.application.services;
  const analytics = GSP.monitorAnalytics;
  if (!services || typeof services.createMonitorService !== 'function') {
    throw new Error('Monitor composition: service factory is unavailable');
  }
  if (!analytics) throw new Error('Monitor composition: analytics are unavailable');

  GSP.application.monitor = services.createMonitorService({ analytics });
})(window);
