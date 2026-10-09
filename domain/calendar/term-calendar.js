/**
 * domain/calendar/term-calendar.js
 * روزنامة الفصل الدراسي — منطق نقي (بدون DOM).
 *
 * المصدر المركزي لأسابيع الشهور/الفترات:
 * - startDate: تاريخ بداية الأسبوع 1 (ISO YYYY-MM-DD)
 * - totalWeeks: عدد أسابيع الفصل
 * - months[]: { name, startWeek, endWeek, hasExam?, examAfterWeek? }
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const domain = GSP.domain = GSP.domain || {};
  const calendar = domain.calendar = domain.calendar || {};

  const CAL_KEY = 'termCalendar';
  const AR_WEEKS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن',
    'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر',
    'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون'];

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toISO(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseISO(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  function addDaysISO(iso, days) {
    const d = parseISO(iso);
    if (!d) return '';
    d.setDate(d.getDate() + Number(days || 0));
    return toISO(d);
  }

  function formatAr(iso) {
    const d = parseISO(iso);
    if (!d) return iso || '—';
    try {
      return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (_) {
      return iso;
    }
  }

  /** إعداد افتراضي للفصل الأول 2026/2027 */
  function defaultCalendar(term) {
    const isFirst = term !== 'second';
    return {
      startDate: isFirst ? '2026-09-13' : '2027-02-07',
      totalWeeks: isFirst ? 16 : 14,
      months: isFirst
        ? [
            { name: 'سبتمبر / أكتوبر', startWeek: 1, endWeek: 4, hasExam: false, examAfterWeek: 0 },
            { name: 'أكتوبر / نوفمبر', startWeek: 5, endWeek: 8, hasExam: true, examAfterWeek: 8 },
            { name: 'نوفمبر / ديسمبر', startWeek: 9, endWeek: 12, hasExam: true, examAfterWeek: 12 },
            { name: 'ديسمبر / يناير', startWeek: 13, endWeek: 16, hasExam: false, examAfterWeek: 0 }
          ]
        : [
            { name: 'فبراير / مارس', startWeek: 1, endWeek: 4, hasExam: false, examAfterWeek: 0 },
            { name: 'مارس / أبريل', startWeek: 5, endWeek: 8, hasExam: true, examAfterWeek: 8 },
            { name: 'أبريل / مايو', startWeek: 9, endWeek: 14, hasExam: true, examAfterWeek: 14 }
          ]
    };
  }

  function normalizeCalendar(raw, term) {
    const base = defaultCalendar(term);
    if (!raw || typeof raw !== 'object') return base;
    const totalWeeks = Math.max(1, Math.min(40, parseInt(raw.totalWeeks, 10) || base.totalWeeks));
    let months = Array.isArray(raw.months) ? raw.months.map(function (m, i) {
      const startWeek = Math.max(1, Math.min(totalWeeks, parseInt(m.startWeek, 10) || 1));
      let endWeek = Math.max(startWeek, Math.min(totalWeeks, parseInt(m.endWeek, 10) || startWeek));
      const hasExam = !!m.hasExam;
      let examAfterWeek = parseInt(m.examAfterWeek, 10) || 0;
      if (hasExam && !examAfterWeek) examAfterWeek = endWeek;
      if (examAfterWeek && (examAfterWeek < startWeek || examAfterWeek > endWeek)) examAfterWeek = endWeek;
      return {
        name: String(m.name || ('الفترة ' + (i + 1))),
        startWeek: startWeek,
        endWeek: endWeek,
        hasExam: hasExam,
        examAfterWeek: hasExam ? examAfterWeek : 0
      };
    }) : base.months.slice();
    if (!months.length) months = base.months.slice();
    // ضمان تغطية متصلة من 1 إلى totalWeeks
    months.sort(function (a, b) { return a.startWeek - b.startWeek; });
    months[0].startWeek = 1;
    for (let i = 1; i < months.length; i++) {
      months[i].startWeek = Math.max(months[i].startWeek, months[i - 1].endWeek + 1);
      months[i].endWeek = Math.max(months[i].startWeek, months[i].endWeek);
    }
    months[months.length - 1].endWeek = totalWeeks;
    return {
      startDate: raw.startDate && parseISO(raw.startDate) ? raw.startDate : base.startDate,
      totalWeeks: totalWeeks,
      months: months
    };
  }

  function weekStartISO(cal, globalWeek) {
    const w = Math.max(1, Number(globalWeek) || 1);
    return addDaysISO(cal.startDate, (w - 1) * 7);
  }

  function periodWeekCount(cal, monthIndex0) {
    const m = cal.months[monthIndex0];
    return m ? Math.max(0, m.endWeek - m.startWeek + 1) : 0;
  }

  function getRecordingPeriods(cal, term) {
    const prefix = (term === 'second') ? 's' : 'f';
    return (cal.months || []).map(function (m, i) {
      return {
        id: prefix + (i + 1),
        name: m.name || ('الشهر ' + (i + 1)),
        weeks: m.endWeek - m.startWeek + 1,
        week1: weekStartISO(cal, m.startWeek),
        hasExam: !!m.hasExam,
        examAfterWeek: Number(m.examAfterWeek) || m.endWeek || 0,
        startWeek: m.startWeek,
        endWeek: m.endWeek,
        enabled: true
      };
    });
  }

  calendar.CAL_KEY = CAL_KEY;
  calendar.AR_WEEKS = AR_WEEKS;
  calendar.toISO = toISO;
  calendar.parseISO = parseISO;
  calendar.addDaysISO = addDaysISO;
  calendar.formatAr = formatAr;
  calendar.defaultCalendar = defaultCalendar;
  calendar.normalizeCalendar = normalizeCalendar;
  calendar.weekStartISO = weekStartISO;
  calendar.periodWeekCount = periodWeekCount;
  calendar.getRecordingPeriods = getRecordingPeriods;

  GSP.termCalendar = calendar;
})(typeof window !== 'undefined' ? window : globalThis);
