/**
 * STEP 39 — Error Recovery Service.
 * Centralizes error normalization, classification, safe recovery decisions,
 * diagnostics, and deduplicated reporting without changing backend/RLS rules.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const application = GSP.application = GSP.application || {};
  const services = application.services = application.services || {};

  const MAX_CONTEXT = 40;
  const MAX_MESSAGE = 1200;
  const recent = new Map();

  function text(value) {
    return String(value == null ? '' : value);
  }

  function normalize(error, context) {
    const isErrorLike = !!error && (Object.prototype.toString.call(error) === '[object Error]' || typeof error.message === 'string');
    const err = isErrorLike ? error : new Error(text(error || 'Unknown error'));
    const ctx = Object.assign({}, context || {});
    const message = text(err.message || err).slice(0, MAX_MESSAGE);
    const code = text(err.code || err.status || '').slice(0, 120);
    const name = text(err.name || 'Error').slice(0, 120);
    const stack = text(err.stack || '').slice(0, 4000);
    return {
      name, code, message, stack,
      operation: text(ctx.operation || ctx.label || '').slice(0, MAX_CONTEXT),
      module: text(ctx.module || '').slice(0, MAX_CONTEXT),
      recordId: ctx.recordId == null ? null : text(ctx.recordId).slice(0, 160),
      phase: text(ctx.phase || '').slice(0, MAX_CONTEXT),
      source: text(ctx.source || '').slice(0, MAX_CONTEXT),
      timestamp: new Date().toISOString()
    };
  }

  function classify(info) {
    const s = (info.name + ' ' + info.code + ' ' + info.message).toLowerCase();
    if (/abort|cancel/.test(s)) return 'cancelled';
    if (/401|403|auth|jwt|token|session|permission|unauthori/.test(s)) return 'auth';
    if (/conflict|409|version|stale|duplicate/.test(s)) return 'conflict';
    if (/validation|invalid|missing|required|400|422/.test(s)) return 'validation';
    if (/indexeddb|quota|storage|localstorage|transaction inactive/.test(s)) return 'storage';
    if (/network|fetch|offline|timeout|timed out|5\d\d|connection|failed to fetch|load failed/.test(s)) return 'transient';
    return 'unknown';
  }

  function fingerprint(info, kind) {
    return [kind, info.operation, info.module, info.recordId, info.code, info.message].join('|').slice(0, 900);
  }

  function shouldReport(info, kind, nowMs) {
    const key = fingerprint(info, kind);
    const now = Number(nowMs || Date.now());
    const previous = recent.get(key);
    if (previous != null && now - previous < 2500) return false;
    recent.set(key, now);
    if (recent.size > 200) {
      for (const [k, t] of recent) if (now - t > 60000) recent.delete(k);
    }
    return true;
  }

  function userMessage(kind) {
    return {
      transient: 'تعذر إتمام العملية بسبب الاتصال. تم الاحتفاظ بالعملية وسيُعاد المحاولة تلقائياً.',
      storage: 'تعذر حفظ البيانات محلياً بأمان. لم يتم اعتبار العملية مكتملة.',
      conflict: 'حدث تعارض في البيانات. تم إيقاف التحديث حتى تتم مراجعته.',
      auth: 'انتهت صلاحية الجلسة أو لا توجد صلاحية كافية لتنفيذ العملية.',
      validation: 'البيانات المدخلة غير صالحة أو غير مكتملة.',
      cancelled: 'تم إلغاء العملية.',
      unknown: 'حدث خطأ غير متوقع. تم تسجيل التفاصيل ويمكن استكمال المحاولة بأمان.'
    }[kind] || 'حدث خطأ غير متوقع.';
  }

  function recover(error, context, handlers) {
    const info = normalize(error, context);
    const kind = classify(info);
    const h = handlers || {};
    let action = 'none';
    try {
      if (kind === 'transient' && typeof h.retry === 'function') { h.retry(info); action = 'retry'; }
      else if (kind === 'auth' && typeof h.reauthenticate === 'function') { h.reauthenticate(info); action = 'reauthenticate'; }
      else if (kind === 'conflict' && typeof h.resolveConflict === 'function') { h.resolveConflict(info); action = 'resolve-conflict'; }
      else if (kind === 'storage' && typeof h.restoreStorage === 'function') { h.restoreStorage(info); action = 'restore-storage'; }
    } catch (recoveryError) {
      action = 'recovery-failed';
      if (typeof h.logger === 'object' && typeof h.logger.error === 'function') h.logger.error('Recovery action failed', recoveryError);
    }
    return { ok: kind !== 'unknown', kind, action, info, message: userMessage(kind) };
  }

  function report(error, context, options) {
    const info = normalize(error, context);
    const kind = classify(info);
    const opts = options || {};
    const result = { kind, info, message: userMessage(kind), reported: false };
    if (!shouldReport(info, kind, opts.now)) return result;

    result.reported = true;
    const audit = opts.audit || services.audit;
    if (audit && typeof audit.recordEvent === 'function') {
      try {
        audit.recordEvent({
          action: 'error.recovery', module: info.module || 'system',
          record: info.recordId ? { id: info.recordId } : null,
          reason: info.message, outcome: 'failure', level: 'error',
          details: JSON.stringify({ operation: info.operation, phase: info.phase, source: info.source, kind, recoveryAction: opts.recoveryAction || 'none' })
        });
      } catch (_) {}
    }
    const logger = opts.logger || root.console;
    if (logger && typeof logger.error === 'function') logger.error('[ErrorRecovery]', info, kind);
    return result;
  }

  function handle(error, context, options) {
    const opts = options || {};
    const recovery = recover(error, context, opts.handlers || {});
    const reported = report(error, context, Object.assign({}, opts, { recoveryAction: recovery.action }));
    return Object.assign(recovery, { reported: reported.reported });
  }

  function installGlobalHandlers(options) {
    const opts = options || {};
    if (!root.addEventListener) return () => {};
    const onError = event => {
      try { handle(event && event.error || event && event.message || 'Unknown error', {source:'window', operation:'global.error'}, opts); } catch (_) {}
    };
    const onRejection = event => {
      try { handle(event && event.reason || 'Unhandled promise rejection', {source:'promise', operation:'global.unhandledrejection'}, opts); } catch (_) {}
    };
    root.addEventListener('error', onError);
    root.addEventListener('unhandledrejection', onRejection);
    return () => {
      try { root.removeEventListener('error', onError); root.removeEventListener('unhandledrejection', onRejection); } catch (_) {}
    };
  }

  const api = Object.freeze({ normalize, classify, fingerprint, recover, report, handle, installGlobalHandlers, userMessage });
  services.errorRecovery = api;
  GSP.errorRecovery = api;
})(window);
