/**
 * STEP 42 — Configuration Management.
 *
 * Centralizes non-secret runtime configuration and user-local settings.
 * Secrets are deliberately excluded from this service. Supabase publishable
 * credentials are public client configuration and remain replaceable at deploy time.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const application = GSP.application = GSP.application || {};
  const services = application.services = application.services || {};

  const STORAGE_KEY = 'gradeSystemPro-config-v1';
  const VERSION = '26.0.0-dev';
  const DEFAULTS = Object.freeze({
    appName: 'رصد — نظام رصد درجات أعمال السنة',
    appShortName: 'رصد',
    appVersion: VERSION,
    locale: 'ar-EG',
    direction: 'rtl',
    timezone: 'Africa/Cairo',
    environment: '',
    /* مشروع Supabase الحالي (مجاني) — يُستبدل لاحقاً عبر GSP_RUNTIME_CONFIG عند النشر */
    supabaseUrl: 'https://wbanrokgolirwzuzafws.supabase.co',
    supabasePublishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiYW5yb2tnb2xpcnd6dXphZndzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzODk5NzgsImV4cCI6MjEwNjk2NTk3OH0.jqjilVaSjMGVOJIpM46E4xWFxMuEF0EFAkrkyR-JTMA',
    workbookStorageBucket: 'workbook-originals',
    /* تعدد المدارس: حالياً مدرسة واحدة افتراضية؛ البنية جاهزة للتوسعة */
    schoolId: 'default',
    multiTenant: false,
    sync: Object.freeze({ enabled: true, retryBaseMs: 1200, retryMaxMs: 30000 }),
    ui: Object.freeze({ compactTables: false, rememberFilters: true, theme: 'rasd-green' })
  });

  const LOCAL_KEYS = new Set(['locale', 'direction', 'timezone', 'ui']);
  const RUNTIME_KEYS = new Set([
    'appName', 'appShortName', 'appVersion', 'environment',
    'supabaseUrl', 'supabasePublishableKey', 'workbookStorageBucket',
    'schoolId', 'multiTenant', 'sync'
  ]);

  function clone(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    const out = {};
    Object.keys(value).forEach(k => { out[k] = clone(value[k]); });
    return out;
  }

  function safeParse(raw) {
    try { return raw ? JSON.parse(raw) : {}; } catch (_) { return {}; }
  }

  function detectEnvironment() {
    const host = String(root.location && root.location.hostname || '').toLowerCase();
    if (!host) return 'unknown';
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return 'development';
    return 'production';
  }

  function readLocal() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      const parsed = safeParse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) { return {}; }
  }

  function writeLocal(value) {
    try {
      if (!root.localStorage) return false;
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      return true;
    } catch (_) { return false; }
  }

  function normalizeSync(value) {
    const src = value && typeof value === 'object' ? value : {};
    const retryBaseMs = Number(src.retryBaseMs);
    const retryMaxMs = Number(src.retryMaxMs);
    return {
      enabled: src.enabled !== false,
      retryBaseMs: Number.isFinite(retryBaseMs) && retryBaseMs >= 100 ? Math.min(retryBaseMs, 60000) : DEFAULTS.sync.retryBaseMs,
      retryMaxMs: Number.isFinite(retryMaxMs) && retryMaxMs >= 1000 ? Math.min(Math.max(retryMaxMs, retryBaseMs || 0), 300000) : DEFAULTS.sync.retryMaxMs
    };
  }

  function normalizeUi(value) {
    const src = value && typeof value === 'object' ? value : {};
    return {
      compactTables: src.compactTables === true,
      rememberFilters: src.rememberFilters !== false,
      theme: src.theme === 'dark' ? 'dark' : 'rasd-green'
    };
  }

  function validate(input) {
    const value = input || {};
    const errors = [];
    if (value.supabaseUrl && !/^https:\/\/[^\s]+$/i.test(String(value.supabaseUrl))) errors.push('supabaseUrl');
    if (value.supabasePublishableKey) {
      const k = String(value.supabasePublishableKey);
      const okPub = /^sb_publishable_[A-Za-z0-9_-]+$/.test(k);
      const okJwt = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k);
      if (!okPub && !okJwt) errors.push('supabasePublishableKey');
    }
    if (value.direction && !['rtl', 'ltr'].includes(value.direction)) errors.push('direction');
    if (value.locale && typeof value.locale !== 'string') errors.push('locale');
    if (value.timezone && typeof value.timezone !== 'string') errors.push('timezone');
    if (value.workbookStorageBucket && !/^[a-z0-9][a-z0-9._-]{1,61}$/.test(String(value.workbookStorageBucket))) errors.push('workbookStorageBucket');
    if (value.schoolId != null && !/^[a-zA-Z0-9_-]{1,64}$/.test(String(value.schoolId))) errors.push('schoolId');
    return { ok: errors.length === 0, errors };
  }

  const runtime = (root.GSP_RUNTIME_CONFIG && typeof root.GSP_RUNTIME_CONFIG === 'object') ? root.GSP_RUNTIME_CONFIG : {};
  const local = readLocal();
  const merged = Object.assign({}, clone(DEFAULTS));
  merged.sync = normalizeSync(Object.assign({}, DEFAULTS.sync, runtime.sync || {}));
  merged.ui = normalizeUi(Object.assign({}, DEFAULTS.ui, local.ui || {}));

  RUNTIME_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(runtime, key)) merged[key] = clone(runtime[key]);
  });
  LOCAL_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(local, key)) merged[key] = clone(local[key]);
  });
  if (!merged.environment) merged.environment = detectEnvironment();
  merged.sync = normalizeSync(merged.sync);
  merged.ui = normalizeUi(merged.ui);

  const validation = validate(merged);
  if (!validation.ok) {
    console.warn('⚠️ Configuration validation failed:', validation.errors);
  }

  function get(key, fallback) {
    if (!key) return clone(merged);
    const value = merged[key];
    return value === undefined ? fallback : clone(value);
  }

  function snapshot() {
    return clone(merged);
  }

  function setLocal(key, value) {
    if (!LOCAL_KEYS.has(key)) return { ok: false, code: 'NOT_LOCAL_SETTING' };
    const candidate = Object.assign({}, merged, { [key]: clone(value) });
    if (key === 'ui') candidate.ui = normalizeUi(value);
    const check = validate(candidate);
    if (!check.ok) return { ok: false, code: 'INVALID_CONFIGURATION', errors: check.errors };
    const persisted = Object.assign({}, readLocal(), { [key]: clone(candidate[key]) });
    if (!writeLocal(persisted)) return { ok: false, code: 'STORAGE_UNAVAILABLE' };
    merged[key] = clone(candidate[key]);
    return { ok: true, value: clone(merged[key]) };
  }

  function resetLocal() {
    const current = readLocal();
    LOCAL_KEYS.forEach(key => { delete current[key]; merged[key] = clone(DEFAULTS[key]); });
    merged.environment = merged.environment || detectEnvironment();
    const ok = writeLocal(current);
    return { ok, value: snapshot() };
  }

  function isCloudConfigured() {
    const _key = String(merged.supabasePublishableKey || '');
    const _keyOk = /^sb_publishable_[A-Za-z0-9_-]+$/.test(_key) || /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(_key);
    return /^https:\/\/[^\s]+$/i.test(String(merged.supabaseUrl || '')) && _keyOk;
  }

  function describe() {
    return {
      appName: merged.appName,
      appVersion: merged.appVersion,
      environment: merged.environment,
      locale: merged.locale,
      direction: merged.direction,
      timezone: merged.timezone,
      cloudConfigured: isCloudConfigured(),
      storageBucketConfigured: !!merged.workbookStorageBucket
    };
  }

  const api = Object.freeze({
    key: STORAGE_KEY,
    defaults: Object.freeze(clone(DEFAULTS)),
    get,
    snapshot,
    setLocal,
    resetLocal,
    validate,
    isCloudConfigured,
    describe
  });

  services.configuration = api;
  application.configuration = api;
  GSP.configuration = api;
})(window);
