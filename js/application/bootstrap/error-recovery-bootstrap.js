/** STEP 39 bootstrap: install global error/rejection recovery boundary. */
'use strict';
(function (root) {
  const service = root.GSP && root.GSP.application && root.GSP.application.services && root.GSP.application.services.errorRecovery;
  if (!service || typeof service.installGlobalHandlers !== 'function') return;
  service.installGlobalHandlers({ audit: root.GSP.application.services.audit, logger: root.console });
})(window);
