/**
 * Weekly recording helpers — grades keyed by (term, period/month, week).
 * Week count comes from recording periods (schoolInfo), not a fixed 4.
 */
(function (global) {
  'use strict';
  const GSP = global.GSP || (global.GSP = {});

  function getRecordingPeriodsSafe(term) {
    try {
      if (typeof global.getRecordingPeriods === 'function') return global.getRecordingPeriods(term) || [];
      if (typeof GSP.getRecordingPeriods === 'function') return GSP.getRecordingPeriods(term) || [];
    } catch (e) {}
    return [];
  }

  /** Number of recording weeks for a term+period (month index 1-based). */
  function getPeriodWeekCount(term, month) {
    const periods = getRecordingPeriodsSafe(term);
    const idx = Math.max(0, (Number(month) || 1) - 1);
    const p = periods[idx];
    if (p && p.weeks != null) {
      const w = parseInt(p.weeks, 10);
      if (Number.isFinite(w) && w >= 1) return Math.min(8, Math.max(1, w));
    }
    // Fallback: 4 weeks, minus excluded if available
    if (p && Array.isArray(p.excludedWeeks) && p.excludedWeeks.length) {
      return Math.max(1, 4 - p.excludedWeeks.length);
    }
    return 4;
  }

  function isPeriodLevelComponent(comp, componentName) {
    const name = (comp && comp.name) || componentName || '';
    if (comp && comp.isMonthlyGrade) return true;
    if (typeof global.isExamLikeComponent === 'function' && global.isExamLikeComponent(name)) return true;
    if (typeof global.isExamComponent === 'function' && global.isExamComponent(name)) return true;
    return false;
  }

  /**
   * Week dimension for storage:
   * - 0 = period-level (monthly exam / تقييم شهري) — one score per period
   * - 1..N = weekly score inside the period
   */
  function resolveGradeWeek(comp, componentName, explicitWeek) {
    if (isPeriodLevelComponent(comp, componentName)) return 0;
    const w = explicitWeek != null ? Number(explicitWeek) : getSelectedGradeWeek();
    if (!Number.isFinite(w) || w < 1) return 1;
    return Math.floor(w);
  }

  function getSelectedGradeWeek() {
    const el = global.document && global.document.getElementById('gradeWeekSelect');
    if (el && el.value) {
      const n = parseInt(el.value, 10);
      if (Number.isFinite(n) && n >= 1) return n;
    }
    return 1;
  }

  function getSelectedGradeTermMonth() {
    const termEl = global.document && global.document.getElementById('gradeTermSelect');
    const monthEl = global.document && global.document.getElementById('gradeMonthSelect');
    const term = (termEl && termEl.value) || 'first';
    const month = monthEl ? (parseInt(monthEl.value, 10) || 1) : 1;
    return { term, month };
  }

  /** Populate #gradeWeekSelect options from period week count. */
  function refreshGradeWeekSelect() {
    const sel = global.document && global.document.getElementById('gradeWeekSelect');
    if (!sel) return;
    const { term, month } = getSelectedGradeTermMonth();
    const count = getPeriodWeekCount(term, month);
    const prev = parseInt(sel.value, 10) || 1;
    const labels = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن'];
    let html = '';
    for (let i = 1; i <= count; i++) {
      const lab = labels[i] ? ('الأسبوع ' + labels[i]) : ('الأسبوع ' + i);
      html += '<option value="' + i + '">' + lab + '</option>';
    }
    sel.innerHTML = html;
    sel.value = String(Math.min(prev, count));
  }

  /** Canonical grade map key including week. Legacy rows without week → week 1 (or 0 if exam). */
  function gradeStorageKey(studentId, subjectName, term, month, componentIndex, week) {
    const w = week == null || week === '' ? 1 : Number(week);
    return String(studentId) + '|' + String(subjectName) + '|' + String(term) + '|' + String(month) + '|' + String(w) + '|' + String(componentIndex);
  }

  function normalizeGradeWeek(g, comp) {
    if (g && g.week != null && g.week !== '') return Number(g.week);
    if (comp && isPeriodLevelComponent(comp, comp.name)) return 0;
    return 1; // legacy monthly score → treat as week 1
  }

  function buildWeeklyGradesIndex(db) {
    const idx = new Map();
    (db.grades || []).forEach(g => {
      const w = g.week != null && g.week !== '' ? Number(g.week) : 1;
      idx.set(gradeStorageKey(g.studentId, g.subjectName, g.term, g.month, g.componentIndex, w), g);
      // Also index legacy key without week for read-compat during transition
      if (g.week == null || g.week === '') {
        idx.set(String(g.studentId) + '|' + String(g.subjectName) + '|' + String(g.term) + '|' + String(g.month) + '|' + String(g.componentIndex), g);
      }
    });
    return idx;
  }

  /**
   * Average weekly scores inside one period for a non-exam component.
   * Exam/period-level: single score (week 0 or legacy).
   */
  function collectPeriodComponentValues(idx, studentId, subjectName, term, month, componentIndex, weekCount, periodLevel) {
    const vals = [];
    if (periodLevel) {
      let g = idx.get(gradeStorageKey(studentId, subjectName, term, month, componentIndex, 0));
      if (!g) g = idx.get(studentId + '|' + subjectName + '|' + term + '|' + month + '|' + componentIndex);
      if (g && g.score !== '' && g.score != null) vals.push(g.score);
      return vals;
    }
    const n = weekCount || 4;
    for (let w = 1; w <= n; w++) {
      const g = idx.get(gradeStorageKey(studentId, subjectName, term, month, componentIndex, w));
      if (g && g.score !== '' && g.score != null) vals.push(g.score);
    }
    // Legacy single score without week
    if (!vals.length) {
      const legacy = idx.get(studentId + '|' + subjectName + '|' + term + '|' + month + '|' + componentIndex);
      if (legacy && legacy.score !== '' && legacy.score != null) vals.push(legacy.score);
    }
    return vals;
  }

  /** Attendance: weeks for current att term/month filter. */
  function refreshAttendanceWeekSelect() {
    const sel = global.document && global.document.getElementById('attWeekViewSelect');
    if (!sel) return;
    const termEl = global.document.getElementById('attTermSelect');
    const monthEl = global.document.getElementById('attMonthSelect');
    const term = (termEl && termEl.value) || 'first';
    const month = monthEl ? (parseInt(monthEl.value, 10) || 1) : 1;
    const count = getPeriodWeekCount(term, month);
    const prev = sel.value;
    const labels = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن'];
    let html = '';
    // No "all weeks" — attendance is week-scoped
    for (let i = 1; i <= count; i++) {
      const lab = labels[i] ? ('الأسبوع ' + labels[i]) : ('الأسبوع ' + i);
      html += '<option value="' + i + '">' + lab + '</option>';
    }
    sel.innerHTML = html;
    if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
    else sel.value = '1';
  }

  const api = {
    getPeriodWeekCount,
    isPeriodLevelComponent,
    resolveGradeWeek,
    getSelectedGradeWeek,
    refreshGradeWeekSelect,
    gradeStorageKey,
    normalizeGradeWeek,
    buildWeeklyGradesIndex,
    collectPeriodComponentValues,
    refreshAttendanceWeekSelect
  };

  GSP.weeklyPeriod = api;
  global.getPeriodWeekCount = getPeriodWeekCount;
  global.getSelectedGradeWeek = getSelectedGradeWeek;
  global.refreshGradeWeekSelect = refreshGradeWeekSelect;
  global.refreshAttendanceWeekSelect = refreshAttendanceWeekSelect;
  global.gradeStorageKey = gradeStorageKey;
})(typeof window !== 'undefined' ? window : globalThis);
