/**
 * STEP 36 — Offline/Online Sync Reliability service.
 * Coordinates retry/backoff metadata without owning local data or Supabase access.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const services = GSP.application = GSP.application || {};
  services.services = services.services || {};

  const DEFAULTS = Object.freeze({ baseDelayMs: 1500, maxDelayMs: 60000, jitterMs: 250 });

  function createOfflineSyncReliability({ queue, status, now, setTimeoutFn, clearTimeoutFn, random } = {}) {
    if (!queue) throw new Error('Offline sync reliability: queue is required');
    if (!status) throw new Error('Offline sync reliability: status is required');
    const clock = typeof now === 'function' ? now : () => Date.now();
    const later = typeof setTimeoutFn === 'function' ? setTimeoutFn : root.setTimeout.bind(root);
    const cancel = typeof clearTimeoutFn === 'function' ? clearTimeoutFn : root.clearTimeout.bind(root);
    const rng = typeof random === 'function' ? random : Math.random;
    let retryTimer = null;

    function backoff(attempts, options = {}) {
      const base = Number(options.baseDelayMs || DEFAULTS.baseDelayMs);
      const max = Number(options.maxDelayMs || DEFAULTS.maxDelayMs);
      const jitter = Number(options.jitterMs == null ? DEFAULTS.jitterMs : options.jitterMs);
      const n = Math.max(1, Number(attempts) || 1);
      const exponential = Math.min(max, base * Math.pow(2, n - 1));
      return Math.min(max, exponential + Math.floor(Math.max(0, jitter) * rng()));
    }

    function pendingCount() { return typeof queue.count === 'function' ? queue.count() : queue.ids().length; }
    function failedCount() { return typeof queue.failedCount === 'function' ? queue.failedCount() : 0; }
    function snapshot() {
      const items = typeof queue.peek === 'function' ? queue.peek() : [];
      const next = items.filter(x => x.nextRetryAt).map(x => Date.parse(x.nextRetryAt)).filter(Number.isFinite).sort((a,b) => a-b)[0];
      return { pending: pendingCount(), failed: failedCount(), nextRetryAt: next ? new Date(next).toISOString() : null };
    }
    function syncStatus() {
      const s = snapshot();
      if (typeof status.setPending === 'function') status.setPending(s.pending, s.failed, s.nextRetryAt);
      return s;
    }
    function markQueued(ids) {
      const out = queue.enqueue(ids);
      syncStatus();
      return out;
    }
    function markAttempt(ids) {
      const out = queue.markAttempt(ids);
      if (typeof status.markAttempt === 'function') status.markAttempt(pendingCount(), failedCount());
      else syncStatus();
      return out;
    }
    function markFailure(error, ids, options = {}) {
      const targets = ids || queue.ids();
      const out = queue.markFailure(targets, error, {
        now: clock(),
        delayMs: options.delayMs,
        baseDelayMs: options.baseDelayMs || DEFAULTS.baseDelayMs,
        maxDelayMs: options.maxDelayMs || DEFAULTS.maxDelayMs,
        jitterMs: options.jitterMs == null ? DEFAULTS.jitterMs : options.jitterMs,
        random: rng
      });
      const s = snapshot();
      if (typeof status.markFailure === 'function') status.markFailure(error, s.pending, s.failed, s.nextRetryAt);
      return out;
    }
    function markSuccess(ids) {
      const out = queue.remove(ids);
      const s = snapshot();
      if (typeof status.markSuccess === 'function') status.markSuccess(s.pending, s.failed, s.nextRetryAt);
      else syncStatus();
      return out;
    }
    function markOffline() {
      const s = syncStatus();
      if (typeof status.markOffline === 'function') status.markOffline(s.pending, s.failed, s.nextRetryAt);
      return status.get();
    }
    function markOnline() {
      const s = syncStatus();
      if (typeof status.markOnline === 'function') status.markOnline(s.pending, s.failed, s.nextRetryAt);
      return status.get();
    }
    function dueIds(at = clock()) {
      return typeof queue.dueIds === 'function' ? queue.dueIds(at) : queue.ids();
    }
    function cancelRetry() {
      if (retryTimer != null) { cancel(retryTimer); retryTimer = null; }
    }
    function scheduleRetry(callback, at = clock()) {
      if (typeof callback !== 'function') return null;
      cancelRetry();
      const items = queue.peek();
      const timestamps = items.map(x => Date.parse(x.nextRetryAt || '')).filter(Number.isFinite);
      const next = timestamps.length ? Math.min(...timestamps) : at;
      const delay = Math.max(0, next - at);
      retryTimer = later(() => { retryTimer = null; callback(); }, delay);
      if (typeof status.markRetryScheduled === 'function') status.markRetryScheduled(next ? new Date(next).toISOString() : null);
      return delay;
    }
    function retryNow(callback) {
      cancelRetry();
      if (typeof queue.resetFailures === 'function') queue.resetFailures();
      if (typeof status.clearRetry === 'function') status.clearRetry();
      if (typeof callback === 'function') return callback();
      return syncStatus();
    }

    syncStatus();
    return Object.freeze({ backoff, snapshot, markQueued, markAttempt, markFailure, markSuccess, markOffline, markOnline, dueIds, scheduleRetry, cancelRetry, retryNow });
  }

  services.services.createOfflineSyncReliability = createOfflineSyncReliability;
  services.ports = services.ports || {};
  services.ports.createOfflineSyncReliability = createOfflineSyncReliability;
})(window);
