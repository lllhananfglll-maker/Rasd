/**
 * STEP 38 — Unified Audit Service.
 *
 * Keeps the existing Supabase audit_events contract intact. No schema or RLS
 * change is required: structured before/after/reason/context data is encoded
 * inside the existing `details` column. A small persistent local queue makes
 * audit capture resilient to offline periods and browser refreshes.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};

  const TABLE = 'audit_events';
  const QUEUE_KEY = 'gradeSystemPro-audit-queue-v1';
  const CACHE_KEY = 'gradeSystemPro-audit-cache-v1';
  const MAX_QUEUE = 300;
  const MAX_DETAIL = 18000;
  const MAX_FETCH = 500;

  const now = () => new Date().toISOString();
  const clone = value => {
    if (value == null) return value;
    try { if (typeof root.structuredClone === 'function') return root.structuredClone(value); } catch (_) {}
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return String(value); }
  };

  function currentActor() {
    let name = '', role = '';
    try { if (typeof root.currentUserLabel === 'function') name = root.currentUserLabel() || ''; } catch (_) {}
    try { role = root.currentAccountType || ''; } catch (_) {}
    return { name, role };
  }

  function currentLocation() {
    let stageId = null, stageName = null;
    try { stageId = root.currentStageId || null; } catch (_) {}
    try {
      if (typeof root.getStageRecord === 'function') {
        const stage = root.getStageRecord(stageId);
        stageName = stage && stage.name || null;
      }
    } catch (_) {}
    return { stageId, stageName };
  }

  function readQueue() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(QUEUE_KEY);
      const rows = raw ? JSON.parse(raw) : [];
      return Array.isArray(rows) ? rows.filter(Boolean).slice(-MAX_QUEUE) : [];
    } catch (_) { return []; }
  }
  function writeQueue(rows) {
    try { if (root.localStorage) root.localStorage.setItem(QUEUE_KEY, JSON.stringify(rows.slice(-MAX_QUEUE))); } catch (_) {}
  }
  function enqueue(row) {
    const rows = readQueue();
    rows.push(row);
    writeQueue(rows);
    return rows.length;
  }

  function safeDetail(value) {
    if (typeof value === 'string') return value.slice(0, MAX_DETAIL);
    try {
      const text = JSON.stringify(value, (key, val) => {
        if (typeof val === 'string' && val.length > 2000) return val.slice(0, 2000) + '…';
        if (Array.isArray(val) && val.length > 200) return val.slice(0, 200).concat(['…']);
        return val;
      });
      return text.slice(0, MAX_DETAIL);
    } catch (_) { return String(value || '').slice(0, MAX_DETAIL); }
  }

  function snapshotSummary(value) {
    if (value == null) return null;
    if (Array.isArray(value)) return { type: 'array', count: value.length };
    if (typeof value !== 'object') return value;
    const out = {};
    Object.keys(value).slice(0, 80).forEach(k => {
      const v = value[k];
      if (Array.isArray(v)) out[k] = { count: v.length };
      else if (v && typeof v === 'object') out[k] = { keys: Object.keys(v).length };
      else if (['string','number','boolean'].includes(typeof v) || v == null) out[k] = v;
    });
    return out;
  }

  function normalizeEvent(input, kind) {
    const e = input || {};
    const actor = currentActor();
    const location = currentLocation();
    const event = {
      eventId: e.eventId || ('audit_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)),
      timestamp: e.timestamp || now(),
      actor: Object.assign({}, actor, e.actor || {}),
      action: String(e.action || e.operation || 'عملية غير محددة').slice(0, 200),
      module: String(e.module || '').slice(0, 120),
      location: Object.assign({}, location, e.location || {}),
      record: e.record == null ? null : clone(e.record),
      before: e.before == null ? null : clone(e.before),
      after: e.after == null ? null : clone(e.after),
      reason: String(e.reason || '').slice(0, 1000),
      outcome: e.outcome || 'success',
      transactionId: e.transactionId || null,
      level: e.level || (e.outcome === 'failure' ? 'error' : 'info'),
      kind: kind || e.kind || 'operation',
      details: e.details == null ? '' : String(e.details).slice(0, 2000),
      appVersion: typeof root.APP_VERSION !== 'undefined' ? root.APP_VERSION : ''
    };
    return event;
  }

  function toRow(event) {
    const summary = {
      timestamp: event.timestamp,
      eventId: event.eventId,
      kind: event.kind,
      module: event.module,
      record: event.record,
      before: snapshotSummary(event.before),
      after: snapshotSummary(event.after),
      reason: event.reason,
      outcome: event.outcome,
      transactionId: event.transactionId,
      details: event.details
    };
    return {
      created_at: event.timestamp,
      actor_name: String(event.actor.name || 'غير مسجل').slice(0, 200),
      actor_role: String(event.actor.role || '').slice(0, 80),
      stage_id: event.location.stageId || null,
      stage_name: event.location.stageName || null,
      action: event.action,
      details: safeDetail(summary),
      level: event.level,
      app_version: String(event.appVersion || '').slice(0, 80)
    };
  }

  async function flush() {
    if (!isCloudReady()) return { ok: false, queued: readQueue().length, reason: 'offline' };
    const queue = readQueue();
    if (!queue.length) return { ok: true, flushed: 0, queued: 0 };
    try {
      const rows = queue.map(toRow);
      const { error } = await root.supabaseClient.from(TABLE).insert(rows);
      if (error) throw error;
      writeQueue([]);
      return { ok: true, flushed: rows.length, queued: 0 };
    } catch (error) {
      return { ok: false, queued: queue.length, reason: String(error && error.message || error) };
    }
  }

  function isCloudReady() {
    try { return !!root.cloudAvailable && !!root.supabaseClient && (!root.navigator || root.navigator.onLine !== false); }
    catch (_) { return false; }
  }

  function recordEvent(input) {
    const event = normalizeEvent(input, 'operation');
    const row = toRow(event);
    if (!isCloudReady()) { enqueue(event); return { ok: true, queued: true, eventId: event.eventId }; }
    try {
      Promise.resolve(root.supabaseClient.from(TABLE).insert([row])).then(({ error }) => {
        if (error) enqueue(event);
      }).catch(() => enqueue(event));
    } catch (_) { enqueue(event); }
    return { ok: true, queued: false, eventId: event.eventId };
  }

  function record(input) {
    const e = input || {};
    // Legacy callers provide action/details/level. Preserve the human-readable
    // detail while putting the structured contract in the same audit event.
    return recordEvent(e);
  }

  function recordChange(input) {
    const e = Object.assign({}, input || {}, {
      kind: 'change',
      before: input && input.before,
      after: input && input.after
    });
    return recordEvent(e);
  }

  async function fetch(limit) {
    if (!isCloudReady()) throw new Error('لا يوجد اتصال سحابي. تحقق من الإنترنت وإعدادات Supabase.');
    await flush();
    const lim = Math.min(Math.max(Number(limit) || 200, 10), MAX_FETCH);
    const { data, error } = await root.supabaseClient.from(TABLE)
      .select('id,created_at,actor_name,actor_role,stage_id,stage_name,action,details,level,app_version')
      .order('created_at', { ascending: false }).limit(lim);
    if (error) throw new Error(error.message || 'تعذر جلب السجل من السحابة');
    return (data || []).map(r => ({
      id: r.id, at: r.created_at, user: r.actor_name || '', accountType: r.actor_role || '',
      stageId: r.stage_id || '', stageName: r.stage_name || '', action: r.action || '',
      details: r.details || '', level: r.level || 'info', appVersion: r.app_version || ''
    }));
  }

  function pendingCount() { return readQueue().length; }
  function pending() { return readQueue(); }
  function clearQueue() { writeQueue([]); }

  // Browser lifecycle: retry audit records after refresh/return to the network.
  try {
    if (root.addEventListener) {
      root.addEventListener('online', () => { flush().catch(() => {}); });
      root.addEventListener('visibilitychange', () => {
        if (root.document && root.document.visibilityState === 'visible') flush().catch(() => {});
      });
    }
  } catch (_) {}

  const api = Object.freeze({
    table: TABLE, queueKey: QUEUE_KEY,
    record, recordEvent, recordChange, flush, fetch,
    pending, pendingCount, clearQueue,
    snapshotSummary, toRow
  });

  GSP.application.services.audit = api;
  GSP.auditService = api;
})(window);
