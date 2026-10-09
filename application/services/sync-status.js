/** Centralized cloud-sync status and diagnostics state — STEP 35/36. */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const KEY = 'grade-system-sync-status-v1';
  let state = {
    state: 'idle', pending: 0, failed: 0, conflicts: 0,
    online: true, storageHealthy: true, retrying: false,
    nextRetryAt: null, lastAttemptAt: null, lastSuccessAt: null,
    lastErrorAt: null, lastError: null
  };
  const listeners = new Set();
  function load() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(KEY);
      if (raw) state = Object.assign(state, JSON.parse(raw));
    } catch (_) {}
  }
  function save() { try { root.localStorage && root.localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }
  function emit() { save(); listeners.forEach(fn => { try { fn(Object.assign({}, state)); } catch (_) {} }); }
  function update(patch) { state = Object.assign({}, state, patch || {}); emit(); return get(); }
  function get() { return Object.assign({}, state); }
  function subscribe(fn) { if (typeof fn !== 'function') return () => {}; listeners.add(fn); return () => listeners.delete(fn); }
  function markAttempt(pending, failed) { return update({ state:'syncing', pending: pending || 0, failed: failed || 0, retrying:false, lastAttemptAt:new Date().toISOString() }); }
  function markSuccess(pending, failed, nextRetryAt) {
    const p = Math.max(0, Number(pending) || 0);
    return update({ state: p ? 'pending' : 'synced', pending:p, failed:Math.max(0, Number(failed) || 0), nextRetryAt:nextRetryAt || null, retrying:false, lastSuccessAt:new Date().toISOString(), lastError:null, lastErrorAt:null });
  }
  function markFailure(error, pending, failed, nextRetryAt) {
    return update({ state:'error', pending:pending || 0, failed:Math.max(1, Number(failed) || 0), retrying:true, nextRetryAt:nextRetryAt || null, lastErrorAt:new Date().toISOString(), lastError:String(error && error.message || error || 'Unknown sync error') });
  }
  function markOffline(pending, failed, nextRetryAt) { return update({ state:'offline', online:false, pending:pending || 0, failed:failed || 0, nextRetryAt:nextRetryAt || null, retrying:false }); }
  function markOnline(pending, failed, nextRetryAt) { return update({ online:true, state:pending ? 'pending' : 'idle', pending:pending || 0, failed:failed || 0, nextRetryAt:nextRetryAt || null }); }
  function setPending(pending, failed, nextRetryAt) { return update({ pending:Math.max(0, Number(pending) || 0), failed:Math.max(0, Number(failed) || 0), nextRetryAt:nextRetryAt || null }); }
  function setConflicts(conflicts) { return update({ conflicts:Math.max(0, Number(conflicts) || 0) }); }
  function markRetryScheduled(nextRetryAt) { return update({ retrying:true, nextRetryAt:nextRetryAt || null }); }
  function clearRetry() { return update({ retrying:false, nextRetryAt:null }); }
  function setStorageHealth(healthy) { return update({ storageHealthy:!!healthy }); }
  load();
  const api = Object.freeze({ get, update, subscribe, markAttempt, markSyncing: () => update({state:'syncing',retrying:false,lastAttemptAt:new Date().toISOString()}), markSuccess, markFailure, markOffline, markOnline, setPending, setConflicts, markRetryScheduled, clearRetry, setStorageHealth });
  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.syncStatus = api;
  GSP.syncStatus = api;
})(window);
