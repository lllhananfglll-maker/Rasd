/*
 * Grades UI state service — STEP 30.
 * Holds grades-tab filter state (subject / class / term / month) without DOM.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});

  function createGradesUIState(initial) {
    const seed = initial || {};
    const filters = {
      subjectName: String(seed.subjectName || ''),
      classKey: String(seed.classKey || ''),
      term: String(seed.term || 'first'),
      month: Number(seed.month || 1)
    };
    if (!Number.isFinite(filters.month) || filters.month < 1) filters.month = 1;
    if (filters.term !== 'first' && filters.term !== 'second') filters.term = 'first';

    function snapshot() {
      return {
        subjectName: filters.subjectName,
        classKey: filters.classKey,
        term: filters.term,
        month: filters.month
      };
    }

    function normalizeMonth(m) {
      const n = Number(m);
      if (!Number.isFinite(n) || n < 1) return 1;
      return Math.floor(n);
    }

    function normalizeTerm(t) {
      return t === 'second' ? 'second' : 'first';
    }

    return Object.freeze({
      get: snapshot,
      set: function (patch) {
        const p = patch || {};
        if (p.subjectName !== undefined) filters.subjectName = String(p.subjectName || '');
        if (p.classKey !== undefined) filters.classKey = String(p.classKey || '');
        if (p.term !== undefined) filters.term = normalizeTerm(p.term);
        if (p.month !== undefined) filters.month = normalizeMonth(p.month);
        return snapshot();
      },
      reset: function () {
        filters.subjectName = '';
        filters.classKey = '';
        filters.term = 'first';
        filters.month = 1;
        return snapshot();
      },
      /** Sync from plain DOM values object (UI → state). */
      syncFromDom: function (dom) {
        const d = dom || {};
        return this.set({
          subjectName: d.subjectName,
          classKey: d.classKey,
          term: d.term,
          month: d.month
        });
      },
      isComplete: function () {
        return !!(filters.subjectName && filters.classKey && filters.term && filters.month);
      }
    });
  }

  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.createGradesUIState = createGradesUIState;
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.createGradesUIState = createGradesUIState;
})(window);
