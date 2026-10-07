/*
 * Attendance repository factory.
 * STEP 14: dependencies are injected at composition time. The repository
 * remains compatible with the legacy IndexedDB-backed loadDB/saveDB API.
 */
(function (root) {
  'use strict';

  const GSP = root.GSP || (root.GSP = {});

  function createAttendanceRepository(deps) {
    const { loadDB, saveDB, ensureAttendance } = deps || {};
    if (typeof loadDB !== 'function') throw new Error('Attendance repository: loadDB dependency is required');
    if (typeof saveDB !== 'function') throw new Error('Attendance repository: saveDB dependency is required');
    if (typeof ensureAttendance !== 'function') throw new Error('Attendance repository: ensureAttendance dependency is required');

    const repository = {
      load() { return loadDB(); },
      save(db, protectKeys) { saveDB(db, protectKeys); return db; },
      ensure(db) { return ensureAttendance(db); },
      read() {
        const db = loadDB();
        return { db, attendance: ensureAttendance(db) };
      },
      write(db, protectKeys) { saveDB(db, protectKeys); return db; }
    };

    return Object.freeze(repository);
  }

  GSP.infrastructure = GSP.infrastructure || {};
  GSP.infrastructure.repositories = GSP.infrastructure.repositories || {};
  GSP.infrastructure.repositories.createAttendanceRepository = createAttendanceRepository;
  // Compatibility: composition will assign the concrete repository here.
  GSP.createAttendanceRepository = createAttendanceRepository;
})(window);
