/*
 * Stage data repository — STEP 34.
 * Provides named repository boundaries over the existing stage-scoped storage contract.
 * The legacy storage implementation remains the compatibility adapter for now.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});

  function createStageDataRepository(deps) {
    const d = deps || {};
    if (typeof d.loadDB !== 'function') throw new Error('Stage data repository: loadDB is required');
    if (typeof d.saveDB !== 'function') throw new Error('Stage data repository: saveDB is required');

    const load = () => d.loadDB();
    const save = (db, protectKeys) => d.saveDB(db, protectKeys);
    const list = (db, key) => Array.isArray((db || {})[key]) ? (db || {})[key] : [];
    const getById = (items, id) => (items || []).find(item => String(item && item.id) === String(id)) || null;

    return Object.freeze({
      load,
      save,
      students(db) { return list(db || load(), 'students'); },
      teachers(db) { return list(db || load(), 'teachers'); },
      grades(db) { return list(db || load(), 'grades'); },
      subjects(db) { return list(db || load(), 'subjects'); },
      classes(db) { return list(db || load(), 'classes'); },
      getStudent(id, db) { return getById(this.students(db), id); },
      getTeacher(id, db) { return getById(this.teachers(db), id); },
      getGrade(id, db) { return getById(this.grades(db), id); },
      getSubject(id, db) { return getById(this.subjects(db), id); },
      getClass(id, db) { return getById(this.classes(db), id); }
    });
  }

  GSP.infrastructure = GSP.infrastructure || {};
  GSP.infrastructure.repositories = GSP.infrastructure.repositories || {};
  GSP.infrastructure.repositories.createStageDataRepository = createStageDataRepository;
  GSP.createStageDataRepository = createStageDataRepository;
})(window);
