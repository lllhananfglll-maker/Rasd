/* Grades repository — STEP 34. */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});
  function createGradesRepository(deps) {
    if (!deps || !deps.stageData) throw new Error('Grades repository: stageData repository is required');
    const stageData = deps.stageData;
    return Object.freeze({
      load: () => stageData.load(),
      save: (db, protectKeys) => stageData.save(db, protectKeys),
      list: (db) => stageData.grades(db),
      find: (predicate, db) => stageData.grades(db).find(predicate) || null
    });
  }
  GSP.infrastructure = GSP.infrastructure || {};
  GSP.infrastructure.repositories = GSP.infrastructure.repositories || {};
  GSP.infrastructure.repositories.createGradesRepository = createGradesRepository;
  GSP.createGradesRepository = createGradesRepository;
})(window);
