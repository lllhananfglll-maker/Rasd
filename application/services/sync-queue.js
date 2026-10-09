/** Persistent cloud-sync change queue — STEP 35/36. Stores references, not payloads. */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const KEY = 'grade-system-sync-queue-v1';
  const MAX = 500;
  const now = () => new Date().toISOString();

  function read() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(KEY);
      const value = raw ? JSON.parse(raw) : [];
      return Array.isArray(value) ? value.filter(x => x && x.id).map(normalize) : [];
    } catch (_) { return []; }
  }
  function normalize(item) {
    const out = Object.assign({}, item);
    out.id = String(out.id);
    out.attempts = Math.max(0, Number(out.attempts) || 0);
    out.failed = !!out.failed;
    return out;
  }
  function write(items) {
    try {
      if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX)));
    } catch (_) { /* queue is best effort; local DB remains authoritative */ }
  }
  function enqueue(ids) {
    const incoming = Array.isArray(ids) ? ids : [ids];
    const items = read();
    const byId = new Map(items.map(x => [String(x.id), x]));
    incoming.filter(Boolean).forEach(id => {
      const key = String(id);
      const old = byId.get(key);
      byId.set(key, Object.assign({}, old || {}, {
        id: key,
        firstQueuedAt: old ? old.firstQueuedAt : now(),
        lastQueuedAt: now(),
        // A new local change is a new opportunity; clear only the retry delay,
        // while preserving attempts for diagnostics.
        failed: false,
        nextRetryAt: null,
        lastError: null
      }));
    });
    const out = Array.from(byId.values()).slice(-MAX);
    write(out);
    return out;
  }
  function peek() { return read(); }
  function ids() { return read().map(x => x.id); }
  function count() { return read().length; }
  function failedIds() { return read().filter(x => x.failed).map(x => x.id); }
  function failedCount() { return read().filter(x => x.failed).length; }
  function dueIds(at = Date.now()) {
    const t = typeof at === 'number' ? at : Date.parse(at);
    return read().filter(x => !x.nextRetryAt || !Number.isFinite(t) || Date.parse(x.nextRetryAt) <= t).map(x => x.id);
  }
  function remove(idsToRemove) {
    const set = new Set((Array.isArray(idsToRemove) ? idsToRemove : [idsToRemove]).filter(Boolean).map(String));
    const out = read().filter(x => !set.has(String(x.id)));
    write(out);
    return out;
  }
  function markAttempt(idsToMark) {
    const set = new Set((Array.isArray(idsToMark) ? idsToMark : [idsToMark]).filter(Boolean).map(String));
    const out = read().map(x => set.has(String(x.id)) ? Object.assign({}, x, {
      attempts: (x.attempts || 0) + 1,
      lastAttemptAt: now(),
      failed: false,
      nextRetryAt: null
    }) : x);
    write(out);
    return out;
  }
  function markFailure(idsToMark, error, options = {}) {
    const set = new Set((Array.isArray(idsToMark) ? idsToMark : [idsToMark]).filter(Boolean).map(String));
    const at = options.now || now();
    const atMs = typeof at === 'number' ? at : Date.parse(at);
    const base = Number(options.baseDelayMs) || 1500;
    const max = Number(options.maxDelayMs) || 60000;
    const jitter = Math.max(0, Number(options.jitterMs) || 0);
    const rng = typeof options.random === 'function' ? options.random : Math.random;
    const fixedDelay = Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : null;
    const isoNow = typeof at === 'number' ? new Date(at).toISOString() : at;
    const out = read().map(x => {
      if (!set.has(String(x.id))) return x;
      const attempts = Math.max(1, Number(x.attempts) || 1);
      const delay = fixedDelay != null ? fixedDelay : Math.min(max, base * Math.pow(2, attempts - 1)) + Math.floor(jitter * rng());
      return Object.assign({}, x, {
        failed: true,
        lastErrorAt: isoNow,
        lastError: String(error && error.message || error || 'Unknown sync error'),
        nextRetryAt: new Date((Number.isFinite(atMs) ? atMs : Date.now()) + Math.max(0, delay)).toISOString()
      });
    });
    write(out);
    return out;
  }
  function resetFailures(idsToReset) {
    const targets = idsToReset == null ? null : new Set((Array.isArray(idsToReset) ? idsToReset : [idsToReset]).filter(Boolean).map(String));
    const out = read().map(x => !targets || targets.has(String(x.id)) ? Object.assign({}, x, { failed:false, nextRetryAt:null, lastError:null }) : x);
    write(out);
    return out;
  }
  function clear() { write([]); }

  const api = Object.freeze({ enqueue, peek, ids, count, failedIds, failedCount, dueIds, remove, markAttempt, markFailure, resetFailures, clear, key: KEY, max: MAX });
  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.syncQueue = api;
  GSP.syncQueue = api;
})(window);
