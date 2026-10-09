/*
 * Attendance notification/error boundary.
 * STEP 19: application code reports user-facing messages and diagnostics
 * through injected ports instead of calling browser globals directly.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});

  function createAttendanceNotificationService(deps) {
    const d = deps || {};
    const alertFn = typeof d.alert === 'function' ? d.alert : function () {};
    const confirmFn = typeof d.showConfirm === 'function' ? d.showConfirm : function () { return Promise.resolve(false); };
    const logger = d.logger || root.console || {};
    const recovery = d.recovery || (GSP.application && GSP.application.services && GSP.application.services.errorRecovery) || null;

    const callLog = (level, args) => {
      const fn = logger && typeof logger[level] === 'function' ? logger[level] : null;
      if (fn) fn.apply(logger, args);
    };

    function info(message) { alertFn(String(message)); }
    function success(message) { alertFn(String(message)); }
    function warning(message) { alertFn(String(message)); }
    function error(message) { alertFn(String(message)); }
    function confirm(message, type) { return Promise.resolve(confirmFn(message, type)); }

    function reportError(context, err, userMessage) {
      const detail = err && err.stack ? err.stack : err;
      if (recovery && typeof recovery.handle === 'function') {
        const result = recovery.handle(err, {operation: context || 'attendance', module: 'attendance', source: 'attendance'}, {audit: GSP.application.services.audit, logger});
        if (!userMessage && result && result.message) userMessage = result.message;
      }
      callLog('error', [context || 'Attendance error', detail]);
      if (userMessage) error(userMessage);
    }

    function reportWarning(context, err) {
      callLog('warn', [context || 'Attendance warning', err]);
    }

    return Object.freeze({ info, success, warning, error, confirm, reportError, reportWarning });
  }

  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.createAttendanceNotificationService = createAttendanceNotificationService;
  GSP.createAttendanceNotificationService = createAttendanceNotificationService;
})(window);
