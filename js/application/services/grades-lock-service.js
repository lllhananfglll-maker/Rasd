/*
 * Grades lock application service — STEP 26.
 * Owns lock-state mutations (global / term / month / individual) without DOM.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});

  function createGradesLockService(deps) {
    const d = deps || {};
    const need = (name) => {
      if (typeof d[name] !== 'function') throw new Error('Grades lock service: missing ' + name);
      return d[name];
    };
    const repository = d.repository || null;
    const loadDB = repository && typeof repository.load === 'function' ? () => repository.load() : need('loadDB');
    const saveDB = repository && typeof repository.save === 'function' ? (db, protectKeys) => repository.save(db, protectKeys) : need('saveDB');
    const lockKey = need('lockKey');
    const monthLockKey = need('monthLockKey');
    const isTermLocked = need('isTermLocked');
    const getRole = typeof d.getRole === 'function' ? d.getRole : () => null;
    const scheduleCloudPush = typeof d.scheduleCloudPush === 'function' ? d.scheduleCloudPush : null;

    function assertAdmin() {
      const role = getRole();
      if (role !== 'admin') {
        return { ok: false, reason: 'صلاحية المدير فقط' };
      }
      return { ok: true };
    }

    function toggleGlobal() {
      const gate = assertAdmin();
      if (!gate.ok) return gate;
      const db = loadDB();
      db.globalLock = !db.globalLock;
      saveDB(db);
      if (scheduleCloudPush) scheduleCloudPush();
      return { ok: true, globalLock: !!db.globalLock };
    }

    function toggleTerm(term) {
      const gate = assertAdmin();
      if (!gate.ok) return gate;
      if (!term) return { ok: false, reason: 'فصل غير محدد' };
      const db = loadDB();
      db.termLocks = db.termLocks || {};
      db.termLocks[term] = !db.termLocks[term];
      saveDB(db);
      if (scheduleCloudPush) scheduleCloudPush();
      return { ok: true, term: term, locked: !!db.termLocks[term] };
    }

    function toggleMonth(term, month) {
      const gate = assertAdmin();
      if (!gate.ok) return gate;
      if (!term || month == null) return { ok: false, reason: 'شهر غير محدد' };
      const db = loadDB();
      if (isTermLocked(db, term)) {
        return { ok: false, reason: 'الفصل مقفول بالكامل', termLocked: true };
      }
      db.monthLocks = db.monthLocks || {};
      const key = monthLockKey(term, month);
      db.monthLocks[key] = !db.monthLocks[key];
      saveDB(db);
      if (scheduleCloudPush) scheduleCloudPush();
      return { ok: true, term: term, month: month, locked: !!db.monthLocks[key] };
    }

    function toggleIndividual(cls, subjectName, term, month) {
      const gate = assertAdmin();
      if (!gate.ok) return gate;
      if (!cls || !subjectName) return { ok: false, reason: 'مادة/فصل غير محدد' };
      const db = loadDB();
      const key = lockKey(cls, subjectName, term, month);
      db.locks = db.locks || {};
      db.locks[key] = !db.locks[key];
      saveDB(db);
      if (scheduleCloudPush) scheduleCloudPush();
      return { ok: true, key: key, locked: !!db.locks[key] };
    }

    function readLockSnapshot() {
      const db = loadDB();
      return {
        globalLock: !!db.globalLock,
        termLocks: Object.assign({}, db.termLocks || {}),
        monthLocks: Object.assign({}, db.monthLocks || {}),
        locks: Object.assign({}, db.locks || {})
      };
    }

    return Object.freeze({
      toggleGlobal,
      toggleTerm,
      toggleMonth,
      toggleIndividual,
      readLockSnapshot,
      assertAdmin
    });
  }

  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.createGradesLockService = createGradesLockService;
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.createGradesLockService = createGradesLockService;
})(window);
