/* Attendance analytics feature — extracted from attendance-system.js (STEP 9). */
(function(){
  'use strict';
  const GSP = globalThis.GSP || (globalThis.GSP = {});
  const api = {};

  function computeClassAttendanceAgg(deps, db, att, classKey, term, month, weekFilter){
    const {
      getMonthCalendarDays, getSubjectStudyDays, computeStudentAttendanceScore,
      classSectionKey, canAccessStudentGrade, getMonthLabels, classSectionLabel,
      trendFromRates, loadDB, ensureAttendance, countStudyCalendarDays
    } = deps;
    const columns = getMonthCalendarDays(term, month);
    const classStudents = (db.students||[]).filter(st => {
      const key = (typeof classSectionKey === 'function') ? classSectionKey(st.class, st.section) : (st.class||'');
      return key === classKey;
    });
    if (!classStudents.length) return null;
    let expected = 0, absent = 0;
    (db.subjects || []).forEach(sub => {
      const studyDays = getSubjectStudyDays(att, sub.name, classKey);
      const relevantStudents = classStudents.filter(st => typeof canAccessStudentGrade !== 'function' || canAccessStudentGrade(sub.name, st));
      if (!relevantStudents.length) return;
      relevantStudents.forEach(st => {
        const calc = computeStudentAttendanceScore(att, st.id, sub.name, term, month, columns, studyDays, 10, weekFilter || null);
        expected += calc.expected; absent += calc.absent;
      });
    });
    if (!expected) return { students: classStudents.length, expected: 0, absent: 0, present: 0, rate: null };
    const present = expected - absent;
    return {
      students: classStudents.length,
      expected, absent, present,
      rate: Math.round((present / expected) * 1000) / 10
    };
  }

  function computeStageAttendanceRate(deps, db, att, term, month, weekFilter){
    const {
      getMonthCalendarDays, getSubjectStudyDays, computeStudentAttendanceScore,
      classSectionKey, canAccessStudentGrade, getMonthLabels, classSectionLabel,
      trendFromRates, loadDB, ensureAttendance, countStudyCalendarDays
    } = deps;
    let expected = 0, absent = 0;
    (db.classes || []).forEach(classKey => {
      const agg = computeClassAttendanceAgg(db, att, classKey, term, month, weekFilter);
      if (!agg || !agg.expected) return;
      expected += agg.expected; absent += agg.absent;
    });
    if (!expected) return null;
    return Math.round(((expected - absent) / expected) * 1000) / 10;
  }

  function resolvePreviousPeriod(deps, term, month, weekFilter){
    const {
      getMonthCalendarDays, getSubjectStudyDays, computeStudentAttendanceScore,
      classSectionKey, canAccessStudentGrade, getMonthLabels, classSectionLabel,
      trendFromRates, loadDB, ensureAttendance, countStudyCalendarDays
    } = deps;
    if (weekFilter) {
      if (weekFilter > 1) return { term, month, weekFilter: weekFilter - 1 };
      if (month > 1) return { term, month: month - 1, weekFilter: 4 };
      if (term === 'second') {
        const labels = (typeof getMonthLabels === 'function') ? getMonthLabels('first') : ['', ''];
        return { term: 'first', month: Math.max(1, labels.length || 2), weekFilter: 4 };
      }
      return null;
    }
    if (month > 1) return { term, month: month - 1, weekFilter: null };
    if (term === 'second') {
      const labels = (typeof getMonthLabels === 'function') ? getMonthLabels('first') : ['', ''];
      return { term: 'first', month: Math.max(1, labels.length || 2), weekFilter: null };
    }
    return null;
  }

  function buildAggregateRows(deps, term, month, weekFilter){
    const {
      getMonthCalendarDays, getSubjectStudyDays, computeStudentAttendanceScore,
      classSectionKey, canAccessStudentGrade, getMonthLabels, classSectionLabel,
      trendFromRates, loadDB, ensureAttendance, countStudyCalendarDays
    } = deps;
    const db = loadDB(); const att = ensureAttendance(db);
    const studyDayCount = countStudyCalendarDays(term, month, weekFilter || null);
    const prev = resolvePreviousPeriod(term, month, weekFilter || null);
    const rows = [];
    let totExpected = 0, totAbsent = 0, totPresent = 0, totStudents = 0;
    (db.classes || []).forEach(classKey => {
      const agg = computeClassAttendanceAgg(db, att, classKey, term, month, weekFilter || null);
      if (!agg || !agg.expected) return;
      let prevRate = null;
      if (prev) {
        const pAgg = computeClassAttendanceAgg(db, att, classKey, prev.term, prev.month, prev.weekFilter);
        if (pAgg && pAgg.expected) prevRate = pAgg.rate;
      }
      const trend = trendFromRates(agg.rate, prevRate);
      const classLabel = (typeof classSectionLabel === 'function') ? classSectionLabel(classKey) : classKey;
      rows.push({
        classKey, classLabel,
        students: agg.students,
        studyDays: studyDayCount,
        expected: agg.expected,
        absent: agg.absent,
        present: agg.present,
        rate: agg.rate,
        prevRate, trend
      });
      totExpected += agg.expected; totAbsent += agg.absent; totPresent += agg.present; totStudents += agg.students;
    });
    rows.sort((a,b) => (a.classLabel||'').localeCompare(b.classLabel||'','ar'));
    const rate = totExpected ? Math.round((totPresent / totExpected) * 1000) / 10 : null;
    let stagePrev = null;
    if (prev) stagePrev = computeStageAttendanceRate(db, att, prev.term, prev.month, prev.weekFilter);
    const stageTrend = trendFromRates(rate, stagePrev);
    return {
      rows,
      totals: {
        students: totStudents,
        studyDays: studyDayCount,
        expected: totExpected,
        absent: totAbsent,
        present: totPresent,
        rate,
        prevRate: stagePrev,
        trend: stageTrend
      },
      studyDays: studyDayCount,
      prev
    };
  }

  function buildAttendanceTrendSeries(deps, mode){
    const {
      getMonthCalendarDays, getSubjectStudyDays, computeStudentAttendanceScore,
      classSectionKey, canAccessStudentGrade, getMonthLabels, classSectionLabel,
      trendFromRates, loadDB, ensureAttendance, countStudyCalendarDays
    } = deps;
    const db = loadDB(); const att = ensureAttendance(db);
    const f = (typeof getFilterState === 'function') ? getFilterState() : { term: 'first', month: 1 };
    const term = f.term || 'first';
    const month = f.month || 1;
    const points = [];
    const weekNames = ['الأول','الثاني','الثالث','الرابع'];
    if (mode === 'weekly') {
      for (let w = 1; w <= 4; w++) {
        const rate = computeStageAttendanceRate(db, att, term, month, w);
        points.push({ label: 'أ' + w, fullLabel: 'الأسبوع ' + (weekNames[w-1]||w), rate });
      }
    } else if (mode === 'monthly') {
      const labels = (typeof getMonthLabels === 'function') ? getMonthLabels(term) : ['الشهر 1','الشهر 2'];
      for (let m = 1; m <= labels.length; m++) {
        const rate = computeStageAttendanceRate(db, att, term, m, null);
        points.push({ label: labels[m-1] || ('ش'+m), fullLabel: labels[m-1] || ('الشهر '+m), rate });
      }
    } else {
      // فصل دراسي: شهور الفصل كنقاط
      const labels = (typeof getMonthLabels === 'function') ? getMonthLabels(term) : ['الشهر 1','الشهر 2'];
      for (let m = 1; m <= labels.length; m++) {
        const rate = computeStageAttendanceRate(db, att, term, m, null);
        points.push({ label: labels[m-1] || ('ش'+m), fullLabel: labels[m-1] || ('الشهر '+m), rate });
      }
    }
    return { term, month, mode, points };
  }

  api.computeClassAttendanceAgg = (db, att, classKey, term, month, weekFilter, deps) => computeClassAttendanceAgg(deps, db, att, classKey, term, month, weekFilter);
  api.computeStageAttendanceRate = (db, att, term, month, weekFilter, deps) => computeStageAttendanceRate(deps, db, att, term, month, weekFilter);
  api.resolvePreviousPeriod = (term, month, weekFilter, deps) => resolvePreviousPeriod(deps, term, month, weekFilter);
  api.buildAggregateRows = (term, month, weekFilter, deps) => buildAggregateRows(deps, term, month, weekFilter);
  api.buildAttendanceTrendSeries = (mode, deps) => buildAttendanceTrendSeries(deps, mode);
  Object.freeze(api);
  GSP.attendanceAnalytics = api;
})();
