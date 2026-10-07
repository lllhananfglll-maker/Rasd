/**
 * Architecture registry bootstrap (classic script).
 * Previously used ES modules; converted to classic so the app works under
 * a simple HTTP server without mixed module/classic failures.
 * The real runtime still uses window.GSP + legacy IIFEs.
 */
(function (global) {
  'use strict';
  var registry = global.GSP_ARCH = global.GSP_ARCH || {};
  registry.domain = registry.domain || {};
  registry.services = registry.services || {};
  registry.repositories = registry.repositories || {};
  registry.ui = registry.ui || { layer: 'legacy-compatible' };
  registry.ready = true;
})(typeof window !== 'undefined' ? window : globalThis);
