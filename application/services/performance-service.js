/**
 * STEP 45 — Performance Optimization
 *
 * Client-side helpers for O(1) grade lookup, memoization, debounce/throttle,
 * cheap cloning, and cooperative chunking. Does not change persistence,
 * Supabase schema, RLS, or backend permissions.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const application = GSP.application = GSP.application || {};
  const services = application.services = application.services || {};

  const DEFAULT_DEBOUNCE_MS = 80;
  const DEFAULT_CHUNK = 250;

  function gradeKey(studentId, subjectName, term, month, componentIndex, week) {
    // week optional for backward compat; weekly keys include week segment
    if (week === undefined || week === null || week === '') {
      return String(studentId) + '|' + String(subjectName) + '|' + String(term) + '|' + String(month) + '|' + String(componentIndex);
    }
    return String(studentId) + '|' + String(subjectName) + '|' + String(term) + '|' + String(month) + '|' + String(week) + '|' + String(componentIndex);
  }

  function buildGradesIndex(db, options) {
    const opts = options || {};
    if (!db || typeof db !== 'object') return new Map();
    if (!opts.force && db._gradesIndex instanceof Map) return db._gradesIndex;
    const idx = new Map();
    (db.grades || []).forEach(function (g) {
      if (!g) return;
      const hasWeek = g.week != null && g.week !== '';
      if (hasWeek) {
        // Weekly records must remain distinct; do not overwrite a monthly/term key.
        idx.set(gradeKey(g.studentId, g.subjectName, g.term, g.month, g.componentIndex, Number(g.week)), g);
      } else {
        // Legacy/monthly record: keep the original key shape for existing callers.
        idx.set(gradeKey(g.studentId, g.subjectName, g.term, g.month, g.componentIndex), g);
      }
    });
    db._gradesIndex = idx;
    return idx;
  }

  function lookupGrade(indexOrDb, studentId, subjectName, term, month, componentIndex, week) {
    const idx = indexOrDb instanceof Map ? indexOrDb : buildGradesIndex(indexOrDb);
    if (week !== undefined && week !== null && week !== '') {
      const g = idx.get(gradeKey(studentId, subjectName, term, month, componentIndex, week));
      if (g) return g;
    }
    return idx.get(gradeKey(studentId, subjectName, term, month, componentIndex)) || null;
  }

  function rememberGrade(index, grade) {
    if (!(index instanceof Map) || !grade) return index;
    index.set(gradeKey(grade.studentId, grade.subjectName, grade.term, grade.month, grade.componentIndex), grade);
    return index;
  }

  function invalidateGradesIndex(db) {
    if (db && typeof db === 'object') db._gradesIndex = null;
  }

  function buildStudentClassIndex(students) {
    const idx = new Map();
    const list = students || [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s) continue;
      const key = String(s.class || '') + '\u00a7' + String(s.section || '');
      let bucket = idx.get(key);
      if (!bucket) { bucket = []; idx.set(key, bucket); }
      bucket.push(s);
    }
    return idx;
  }

  function studentsInClass(indexOrStudents, classKey) {
    if (indexOrStudents instanceof Map) return (indexOrStudents.get(classKey) || []).slice();
    const idx = buildStudentClassIndex(indexOrStudents);
    return (idx.get(classKey) || []).slice();
  }

  function cheapClone(value) {
    if (value == null || typeof value !== 'object') return value;
    if (typeof root.structuredClone === 'function') {
      try { return root.structuredClone(value); } catch (_) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function debounce(fn, wait, timers) {
    const delay = wait == null ? DEFAULT_DEBOUNCE_MS : Number(wait);
    const set = (timers && timers.set) || root.setTimeout;
    const clear = (timers && timers.clear) || root.clearTimeout;
    let handle = null;
    function wrapped() {
      const args = arguments;
      const self = this;
      if (handle != null) clear(handle);
      handle = set(function () {
        handle = null;
        fn.apply(self, args);
      }, delay);
    }
    wrapped.cancel = function () {
      if (handle != null) { clear(handle); handle = null; }
    };
    wrapped.flush = function () {
      if (handle == null) return;
      clear(handle);
      handle = null;
      fn.apply(this, arguments);
    };
    return wrapped;
  }

  function throttle(fn, wait, timers) {
    const delay = wait == null ? DEFAULT_DEBOUNCE_MS : Number(wait);
    const nowFn = (timers && timers.now) || (root.Date && root.Date.now ? function () { return root.Date.now(); } : function () { return Date.now(); });
    let last = -1e15;
    let pending = null;
    const set = (timers && timers.set) || root.setTimeout;
    const clear = (timers && timers.clear) || root.clearTimeout;
    function wrapped() {
      const args = arguments;
      const self = this;
      const t = nowFn();
      const remaining = delay - (t - last);
      if (remaining <= 0) {
        if (pending != null) { clear(pending); pending = null; }
        last = t;
        fn.apply(self, args);
      } else if (pending == null) {
        pending = set(function () {
          pending = null;
          last = nowFn();
          fn.apply(self, args);
        }, remaining);
      }
    }
    wrapped.cancel = function () {
      if (pending != null) { clear(pending); pending = null; }
    };
    return wrapped;
  }

  function createMemo(options) {
    const opts = options || {};
    const max = opts.max > 0 ? opts.max : 64;
    const store = new Map();
    let hits = 0;
    let misses = 0;
    function get(key, factory) {
      if (store.has(key)) {
        hits++;
        const entry = store.get(key);
        store.delete(key);
        store.set(key, entry);
        return entry;
      }
      misses++;
      const value = typeof factory === 'function' ? factory() : factory;
      store.set(key, value);
      if (store.size > max) {
        const first = store.keys().next().value;
        store.delete(first);
      }
      return value;
    }
    function has(key) { return store.has(key); }
    function invalidate(key) {
      if (key === undefined) store.clear();
      else store.delete(key);
    }
    function stats() {
      return { size: store.size, max, hits, misses };
    }
    return Object.freeze({ get, has, invalidate, stats, clear: invalidate });
  }

  function yieldToMain(delay) {
    const ms = delay == null ? 0 : Number(delay);
    return new Promise(function (resolve) {
      const ric = root.requestIdleCallback;
      if (typeof ric === 'function' && ms === 0) {
        ric(function () { resolve(); }, { timeout: 32 });
        return;
      }
      const set = root.setTimeout;
      set(resolve, ms);
    });
  }

  async function mapInChunks(list, mapper, options) {
    const opts = options || {};
    const size = opts.chunkSize > 0 ? opts.chunkSize : DEFAULT_CHUNK;
    const items = list || [];
    const out = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      out[i] = mapper(items[i], i, items);
      if ((i + 1) % size === 0 && i + 1 < items.length) {
        await yieldToMain(opts.yieldMs || 0);
      }
    }
    return out;
  }

  async function forEachInChunks(list, visitor, options) {
    await mapInChunks(list, function (item, i, arr) {
      visitor(item, i, arr);
      return null;
    }, options);
  }

  const marks = [];
  const MAX_MARKS = 40;

  function now() {
    const p = root.performance;
    if (p && typeof p.now === 'function') return p.now();
    return Date.now();
  }

  function mark(label) {
    const entry = { label: String(label || 'mark'), at: now() };
    marks.push(entry);
    if (marks.length > MAX_MARKS) marks.shift();
    return entry.at;
  }

  function measure(label, startAt) {
    const duration = now() - Number(startAt || 0);
    const entry = { label: String(label || 'measure'), duration: duration, at: now() };
    marks.push(entry);
    if (marks.length > MAX_MARKS) marks.shift();
    return duration;
  }

  function time(label, fn) {
    const start = now();
    const result = fn();
    measure(label, start);
    return result;
  }

  function recentMarks() {
    return marks.slice();
  }

  function clearMarks() {
    marks.length = 0;
  }

  const api = Object.freeze({
    DEFAULT_DEBOUNCE_MS,
    DEFAULT_CHUNK,
    gradeKey,
    buildGradesIndex,
    lookupGrade,
    rememberGrade,
    invalidateGradesIndex,
    buildStudentClassIndex,
    studentsInClass,
    cheapClone,
    debounce,
    throttle,
    createMemo,
    yieldToMain,
    mapInChunks,
    forEachInChunks,
    now,
    mark,
    measure,
    time,
    recentMarks,
    clearMarks
  });

  services.performance = api;
  application.performance = api;
  GSP.performance = api;
})(typeof window !== 'undefined' ? window : globalThis);
