/*
 * Attendance report application service. STEP 17: keeps report aggregation
 * independent from DOM/printing while preserving the existing data model.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});

  function createAttendanceReportService(deps) {
    const d = deps || {};
    const need = (name) => {
      if (typeof d[name] !== 'function') throw new Error('Attendance report service: missing dependency ' + name);
      return d[name];
    };
    const computeClassAttendanceAgg = need('computeClassAttendanceAgg');
    const countStudyCalendarDays = need('countStudyCalendarDays');
    const trendFromRates = need('trendFromRates');
    const getMonthLabels = need('getMonthLabels');
    const classSectionLabel = need('classSectionLabel');

    function buildTermAggregate(db, term) {
      const att = d.ensureAttendance(db);
      const labels = getMonthLabels(term) || ['الشهر 1', 'الشهر 2'];
      const byClass = {};
      let studyDays = 0;
      for (let m = 1; m <= labels.length; m += 1) {
        studyDays += countStudyCalendarDays(term, m, null);
        (db.classes || []).forEach((classKey) => {
          const agg = computeClassAttendanceAgg(db, att, classKey, term, m, null);
          if (!agg || !agg.expected) return;
          if (!byClass[classKey]) {
            byClass[classKey] = {
              classKey,
              classLabel: classSectionLabel(classKey) || classKey,
              students: agg.students,
              expected: 0,
              absent: 0,
              present: 0,
            };
          }
          byClass[classKey].expected += agg.expected;
          byClass[classKey].absent += agg.absent;
          byClass[classKey].present += agg.present;
          byClass[classKey].students = Math.max(byClass[classKey].students, agg.students);
        });
      }
      const mid = Math.max(1, Math.ceil(labels.length / 2));
      const rows = Object.values(byClass).map((r) => {
        const rate = r.expected ? Math.round((r.present / r.expected) * 1000) / 10 : null;
        let prevRate = null;
        let trend = trendFromRates(rate, prevRate);
        if (labels.length >= 2) {
          let e1 = 0, a1 = 0, e2 = 0, a2 = 0;
          for (let m = 1; m <= labels.length; m += 1) {
            const agg = computeClassAttendanceAgg(db, att, r.classKey, term, m, null);
            if (!agg || !agg.expected) continue;
            if (m <= mid) { e1 += agg.expected; a1 += agg.absent; }
            else { e2 += agg.expected; a2 += agg.absent; }
          }
          const r1 = e1 ? Math.round(((e1 - a1) / e1) * 1000) / 10 : null;
          const r2 = e2 ? Math.round(((e2 - a2) / e2) * 1000) / 10 : null;
          prevRate = r1;
          trend = (r1 != null && r2 != null) ? trendFromRates(r2, r1) : trendFromRates(rate, prevRate);
        }
        return Object.assign({}, r, { studyDays, rate, prevRate, trend });
      }).sort((a, b) => (a.classLabel || '').localeCompare(b.classLabel || '', 'ar'));
      let totE = 0, totA = 0, totP = 0, totS = 0;
      rows.forEach((r) => { totE += r.expected; totA += r.absent; totP += r.present; totS += r.students; });
      const rate = totE ? Math.round((totP / totE) * 1000) / 10 : null;
      return { rows, totals: { students: totS, studyDays, expected: totE, absent: totA, present: totP, rate, trend: trendFromRates(rate, null) }, studyDays };
    }

    function buildAggregateReport(mode, db, filter, weekFilter) {
      if (mode === 'term') return buildTermAggregate(db, filter.term);
      return d.buildAggregateRows(filter.term, filter.month, weekFilter);
    }

    return Object.freeze({ buildTermAggregate, buildAggregateReport });
  }

  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.createAttendanceReportService = createAttendanceReportService;
  GSP.createAttendanceReportService = createAttendanceReportService;
})(window);
