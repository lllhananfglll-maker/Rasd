/*
 * Grades public API surface — STEP 25.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});

  const PUBLIC_NAMES = Object.freeze([
    'loadGradesUI',
    'syncGradesFiltersToUIState',
    'saveAllGrades',
    'saveStudentRow',
    'toggleLock',
    'toggleGlobalLock',
    'toggleTermLock',
    'toggleMonthLockDirect',
    'renderLockCenter',
    'updateGlobalLockUI',
    'bulkFillFullMarks',
    'bulkFillMonthlyExamMarks',
    'bulkClearClassGrades',
    'bulkFillComponent',
    'bulkClearComponent',
    'onGradeClassSelectChange',
    'onGradeSubjectSelectChange',
    'refreshGradeClassOptions',
    'updateSubjectDropdowns',
    'setMonthlyDivideMode',
    'getMonthlyDivideMode',
    'toggleMissingGradesReport',
    'renderMissingGradesReport',
    'showMissingGradesModal',
    'confirmProceedDespiteMissingGrades',
    'toggleGradesTabPerformancePanel',
    'renderGradesTabPerformancePanel',
    'validateGradeInput',
    'updateInvalidGradesBanner',
    'handleGradeInputKeydown',
    'warnIfAllComponentsAbsent',
    'markGradeInputAbsentFromButton',
    'printAbsenceConflictReport',
    'renderAbsenceConflictPanel'
  ]);

  const INTERNAL_NAMES = Object.freeze([
    'lockKey',
    'monthLockKey',
    'isTermLocked',
    'isGradeEntryLocked',
    'computeFinalComponentScore',
    'buildCellsForCheck',
    'scanMissingGradeCells',
    'buildMissingGradesModalHtml',
    'subjectTermTotal',
    'tierColorMap',
    'gradeTierOrder',
    'getGradeTier',
    'buildTierLegendHtml',
    'subjectAcademicMaxTotal',
    'computeSubjectTermPercentage',
    'classScopeKey',
    'subjectAppliesToClass',
    'subjectAppliesToGradeSection',
    'updateFilters'
  ]);

  const TRANSITIONAL_NAMES = Object.freeze([
    'GSPGradeLogic',
    'computeAttendanceConflicts',
    'classifyStudentAbsenceConsensus'
  ]);

  function listPublic() { return PUBLIC_NAMES.slice(); }
  function listInternal() { return INTERNAL_NAMES.slice(); }
  function listTransitional() { return TRANSITIONAL_NAMES.slice(); }
  function isPublic(name) { return PUBLIC_NAMES.indexOf(name) !== -1; }

  function auditPublicSurface(host) {
    const target = host || GSP;
    const missing = [], present = [];
    PUBLIC_NAMES.forEach(function (name) {
      if (typeof target[name] === 'function') present.push(name);
      else missing.push(name);
    });
    return Object.freeze({ ok: missing.length === 0, missing: Object.freeze(missing), present: Object.freeze(present) });
  }

  function auditLeakedInternals(host) {
    const target = host || GSP;
    const leaked = [];
    INTERNAL_NAMES.forEach(function (name) {
      if (typeof target[name] === 'function' || (target[name] && typeof target[name] === 'object')) leaked.push(name);
    });
    return Object.freeze(leaked);
  }

  GSP.application = GSP.application || {};
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.gradesPublicApi = Object.freeze({
    PUBLIC_NAMES, INTERNAL_NAMES, TRANSITIONAL_NAMES,
    listPublic, listInternal, listTransitional, isPublic,
    auditPublicSurface, auditLeakedInternals
  });
})(window);
