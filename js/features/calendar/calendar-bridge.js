/**
 * features/calendar/calendar-bridge.js
 * جسر الروزنامة المركزية → واجهات الرصد والغياب والطباعة.
 *
 * المصدر: domain/calendar/term-calendar.js
 * التخزين: schoolInfo.termCalendar[term] داخل قاعدة المرحلة
 *
 * قواعد المنتج (PRODUCT-RULES-REAL-DATA):
 * - أسابيع حقيقية من الروزنامة (تواريخ + أرقام أسابيع الفصل)
 * - الغياب اليومي بمفتاح dateISO
 * - لا أسابيع وهمية ثابتة بمعزل عن التقويم
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const cal = (GSP.domain && GSP.domain.calendar) || GSP.termCalendar || null;

  function loadDbSafe() {
    try {
      if (typeof root.loadDB === 'function') return root.loadDB();
    } catch (e) {}
    return null;
  }

  function saveDbSafe(db) {
    try {
      if (typeof root.saveDB === 'function') return root.saveDB(db);
    } catch (e) {}
    return false;
  }

  function getCentralCalendar(term) {
    const t = term === 'second' ? 'second' : 'first';
    const db = loadDbSafe();
    const stored = db && db.schoolInfo && db.schoolInfo.termCalendar && db.schoolInfo.termCalendar[t];
    if (cal && typeof cal.normalizeCalendar === 'function') {
      return cal.normalizeCalendar(stored || null, t);
    }
    // fallback minimal
    return {
      startDate: t === 'first' ? '2026-09-13' : '2027-02-07',
      totalWeeks: t === 'first' ? 16 : 14,
      months: [{ name: 'الفترة 1', startWeek: 1, endWeek: 4, hasExam: false, examAfterWeek: 0 }]
    };
  }

  function saveCentralCalendar(term, raw) {
    const t = term === 'second' ? 'second' : 'first';
    const db = loadDbSafe();
    if (!db) return null;
    if (!db.schoolInfo) db.schoolInfo = {};
    if (!db.schoolInfo.termCalendar) db.schoolInfo.termCalendar = {};
    const normalized = cal && cal.normalizeCalendar
      ? cal.normalizeCalendar(raw, t)
      : raw;
    db.schoolInfo.termCalendar[t] = normalized;
    // مزامنة البنية القديمة للتوافق
    syncLegacyFromCalendar(db, t, normalized);
    saveDbSafe(db);
    return normalized;
  }

  function syncLegacyFromCalendar(db, term, c) {
    if (!db.schoolInfo) db.schoolInfo = {};
    const periods = (c.months || []).map(function (m, i) {
      const prefix = term === 'second' ? 's' : 'f';
      const week1 = cal && cal.weekStartISO
        ? cal.weekStartISO(c, m.startWeek)
        : '';
      return {
        id: prefix + (i + 1),
        name: m.name || ('الفترة ' + (i + 1)),
        weeks: Math.max(0, (m.endWeek || 0) - (m.startWeek || 0) + 1),
        excludedWeeks: [],
        week1: week1,
        hasExam: !!m.hasExam,
        examAfterWeek: Number(m.examAfterWeek) || m.endWeek || 0,
        startWeek: m.startWeek,
        endWeek: m.endWeek,
        holidays: '',
        enabled: true
      };
    });
    if (!db.schoolInfo.recordingPeriods) db.schoolInfo.recordingPeriods = {};
    db.schoolInfo.recordingPeriods[term] = periods;

    if (!db.schoolInfo.week1Dates) db.schoolInfo.week1Dates = {};
    if (!db.schoolInfo.week1Dates[term]) db.schoolInfo.week1Dates[term] = {};
    periods.forEach(function (p, i) {
      db.schoolInfo.week1Dates[term][i] = p.week1 || '';
    });

    if (!db.schoolInfo.months) db.schoolInfo.months = {};
    db.schoolInfo.months[term] = periods.map(function (p) { return p.name; });
  }

  /**
   * STEP 54: بناء الروزنامة المركزية من فترات الرصد المحفوظة (الاتجاه العكسي).
   * يحفظ أسماء الفترات والتواريخ وامتحان الشهر بشكل دائم في termCalendar
   * حتى لا تُستبدل بالافتراضي عند إعادة التحميل أو تسجيل الخروج.
   */
  function syncCalendarFromPeriods(db, term, periodsList) {
    if (!db.schoolInfo) db.schoolInfo = {};
    if (!db.schoolInfo.termCalendar) db.schoolInfo.termCalendar = {};
    const list = Array.isArray(periodsList) ? periodsList.filter(function (p) { return p && p.enabled !== false; }) : [];
    if (!list.length) return null;

    const existing = db.schoolInfo.termCalendar[term] || {};
    let cursor = 1;
    const months = list.map(function (p, i) {
      let startWeek = Number(p.startWeek);
      let endWeek = Number(p.endWeek);
      const weeks = Math.max(1, Number(p.weeks) || 4);
      if (!Number.isFinite(startWeek) || startWeek < 1) startWeek = cursor;
      if (!Number.isFinite(endWeek) || endWeek < startWeek) endWeek = startWeek + weeks - 1;
      cursor = endWeek + 1;
      return {
        name: (p.name || '').trim() || ('الفترة ' + (i + 1)),
        startWeek: startWeek,
        endWeek: endWeek,
        hasExam: !!p.hasExam,
        examAfterWeek: p.hasExam ? (Number(p.examAfterWeek) || endWeek) : 0
      };
    });

    const firstWeek1 = (list[0] && list[0].week1) || existing.startDate || '';
    const totalWeeks = months.length ? months[months.length - 1].endWeek : (existing.totalWeeks || 16);
    const raw = {
      startDate: firstWeek1 || existing.startDate || (term === 'second' ? '2027-02-07' : '2026-09-13'),
      totalWeeks: Math.max(totalWeeks, months.length ? months[months.length - 1].endWeek : 1),
      months: months
    };
    const normalized = cal && cal.normalizeCalendar ? cal.normalizeCalendar(raw, term) : raw;
    db.schoolInfo.termCalendar[term] = normalized;
    // حدّث البنية القديمة من الروزنامة المحدَّثة (مع الحفاظ على holidays/excluded من المسودة إن وُجدت)
    syncLegacyFromCalendar(db, term, normalized);
    if (db.schoolInfo.recordingPeriods && db.schoolInfo.recordingPeriods[term]) {
      db.schoolInfo.recordingPeriods[term] = db.schoolInfo.recordingPeriods[term].map(function (rp, i) {
        const src = list[i] || {};
        return Object.assign({}, rp, {
          holidays: src.holidays != null ? src.holidays : (rp.holidays || ''),
          excludedWeeks: Array.isArray(src.excludedWeeks) ? src.excludedWeeks.slice() : (rp.excludedWeeks || []),
          enabled: src.enabled !== false
        });
      });
    }
    return normalized;
  }

  function ensureCalendarSeeded() {
    const db = loadDbSafe();
    if (!db) return;
    if (!db.schoolInfo) db.schoolInfo = {};
    let changed = false;
    ['first', 'second'].forEach(function (term) {
      const hasCal = db.schoolInfo.termCalendar && db.schoolInfo.termCalendar[term]
        && db.schoolInfo.termCalendar[term].startDate;
      const existingPeriods = db.schoolInfo.recordingPeriods && db.schoolInfo.recordingPeriods[term];
      const hasPeriods = Array.isArray(existingPeriods) && existingPeriods.length > 0;

      if (!hasCal && hasPeriods) {
        // فترات محفوظة بدون روزنامة → ابنِ الروزنامة منها (لا تستخدم الافتراضي)
        syncCalendarFromPeriods(db, term, existingPeriods);
        changed = true;
      } else if (!hasCal) {
        const def = cal && cal.defaultCalendar ? cal.defaultCalendar(term) : getCentralCalendar(term);
        if (!db.schoolInfo.termCalendar) db.schoolInfo.termCalendar = {};
        db.schoolInfo.termCalendar[term] = def;
        syncLegacyFromCalendar(db, term, def);
        changed = true;
      } else if (!hasPeriods) {
        // روزنامة موجودة وperiods فارغة فقط → املأ periods من الروزنامة
        const c = getCentralCalendar(term);
        syncLegacyFromCalendar(db, term, c);
        changed = true;
      }
      // إن وُجدت الروزنامة والفترات معاً: لا تعِد الكتابة — احفظ ما أدخله المستخدم
    });
    if (changed) saveDbSafe(db);
  }

  function getRecordingPeriods(term) {
    const t = term === 'second' ? 'second' : 'first';
    // STEP 54: فضّل الفترات المحفوظة صراحة إن وُجدت (ثبات بعد الخروج/إعادة التحميل)
    try {
      const db = loadDbSafe();
      const stored = db && db.schoolInfo && db.schoolInfo.recordingPeriods && db.schoolInfo.recordingPeriods[t];
      if (Array.isArray(stored) && stored.length) {
        const enabled = stored.filter(function (p) { return p && p.enabled !== false; });
        if (enabled.length) {
          return enabled.map(function (p, i) {
            const prefix = t === 'second' ? 's' : 'f';
            const weeks = Math.max(0, Number(p.weeks) || (p.endWeek && p.startWeek ? (p.endWeek - p.startWeek + 1) : 4));
            return {
              id: p.id || (prefix + (i + 1)),
              name: p.name || ('الفترة ' + (i + 1)),
              weeks: weeks,
              excludedWeeks: Array.isArray(p.excludedWeeks) ? p.excludedWeeks.slice() : [],
              week1: p.week1 || '',
              hasExam: !!p.hasExam,
              examAfterWeek: Number(p.examAfterWeek) || 0,
              startWeek: p.startWeek,
              endWeek: p.endWeek,
              holidays: p.holidays || '',
              enabled: true
            };
          });
        }
      }
    } catch (e) { /* fall through */ }

    const c = getCentralCalendar(t);
    if (cal && typeof cal.getRecordingPeriods === 'function') {
      return cal.getRecordingPeriods(c, t);
    }
    return (c.months || []).map(function (m, i) {
      const prefix = t === 'second' ? 's' : 'f';
      return {
        id: prefix + (i + 1),
        name: m.name,
        weeks: m.endWeek - m.startWeek + 1,
        week1: cal ? cal.weekStartISO(c, m.startWeek) : '',
        hasExam: !!m.hasExam,
        examAfterWeek: Number(m.examAfterWeek) || 0,
        startWeek: m.startWeek,
        endWeek: m.endWeek,
        enabled: true
      };
    });
  }

  function getFourWeekDates(term, monthIndex0) {
    const c = getCentralCalendar(term);
    const m = c.months[monthIndex0];
    if (!m || !cal) return ['', '', '', ''];
    const out = [];
    for (let w = m.startWeek; w <= Math.min(c.totalWeeks, m.endWeek); w++) {
      out.push(cal.weekStartISO(c, w));
    }
    // للتوافق مع كود يتوقع حتى 4؛ إن زاد العدد يُرجَع كاملاً
    while (out.length < 4) out.push('');
    return out;
  }

  /** كل تواريخ بداية الأسابيع الفعلية للفترة (قد تكون أكثر أو أقل من 4) */
  function getPeriodWeekStartDates(term, monthIndex0) {
    const c = getCentralCalendar(term);
    const m = c.months[monthIndex0];
    if (!m || !cal) return [];
    const out = [];
    for (let w = m.startWeek; w <= Math.min(c.totalWeeks, m.endWeek); w++) {
      out.push({
        globalWeek: w,
        localWeek: w - m.startWeek + 1,
        startISO: cal.weekStartISO(c, w)
      });
    }
    return out;
  }

  function getPeriodWeekCountBridge(term, monthIndex0Or1) {
    // بعض الاستدعاءات 0-based وبعضها 1-based عبر weekly-period
    const c = getCentralCalendar(term);
    let idx = Number(monthIndex0Or1);
    if (!Number.isFinite(idx)) idx = 0;
    // إن كان 1..N وليس 0.. نعتبره 1-based
    if (idx >= 1 && idx <= (c.months || []).length && (c.months[idx] == null || idx === (c.months || []).length)) {
      // heuristic: weekly-period passes month 1-based
    }
    // weekly-period.getPeriodWeekCount(term, month) uses 1-based month
    // attendance uses month-1 for 0-based
    // ندعم الاثنين: إن كان idx ضمن 0..len-1 استخدمه، وإلا idx-1
    let m = c.months[idx];
    if (!m && idx >= 1) m = c.months[idx - 1];
    if (!m) return 0;
    return Math.max(0, m.endWeek - m.startWeek + 1);
  }

  function isWeekExcluded(term, monthIndex0, weekIndex0) {
    const c = getCentralCalendar(term);
    const m = c.months[monthIndex0];
    if (!m) return true;
    const globalWeek = m.startWeek + weekIndex0;
    return globalWeek > m.endWeek || globalWeek > c.totalWeeks;
  }

  function getMonthLabels(term) {
    return getRecordingPeriods(term).map(function (p) { return p.name || 'فترة'; });
  }

  function getWeek1DateISO(term, monthIndex0) {
    const dates = getPeriodWeekStartDates(term, monthIndex0);
    return dates.length ? dates[0].startISO : '';
  }

  /**
   * أعمدة الأيام الحقيقية لفترة الرصد (للغياب الأسبوعي/اليومي).
   * ليست محدودة بـ 4 أسابيع — تتبع عدد أسابيع الفترة في الروزنامة.
   */
  function buildMonthDayColumns(term, month1Based, options) {
    const opts = options || {};
    const monthIndex0 = Math.max(0, (Number(month1Based) || 1) - 1);
    const c = getCentralCalendar(term);
    const m = c.months[monthIndex0];
    const weeks = getPeriodWeekStartDates(term, monthIndex0);
    const activeJsDays = opts.activeJsDays || [0, 1, 2, 3, 4];
    const holidaySet = opts.holidaySet || new Set();
    const DAY_LABELS = opts.dayLabels || ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];
    const columns = [];
    if (!m || !cal) return columns;

    weeks.forEach(function (winfo) {
      const base = cal.parseISO(winfo.startISO);
      if (!base) {
        activeJsDays.forEach(function (jsDay, di) {
          columns.push({
            week: winfo.localWeek,
            globalWeek: winfo.globalWeek,
            dayIdx: di,
            jsDay: jsDay,
            dateISO: '',
            label: DAY_LABELS[di] || '',
            dateLabel: '—',
            isHoliday: false,
            hasDate: false,
            outOfScope: false
          });
        });
        return;
      }
      const startJs = base.getDay();
      activeJsDays.forEach(function (jsDay, di) {
        let delta = jsDay - startJs;
        if (delta < 0) delta += 7;
        const d = new Date(base.getTime());
        d.setDate(d.getDate() + delta);
        const iso = cal.toISO(d);
        columns.push({
          week: winfo.localWeek,
          globalWeek: winfo.globalWeek,
          dayIdx: di,
          jsDay: jsDay,
          dateISO: iso,
          label: DAY_LABELS[di] || '',
          dateLabel: cal.formatAr ? cal.formatAr(iso) : iso,
          isHoliday: holidaySet.has(iso),
          hasDate: true,
          outOfScope: false
        });
      });
    });
    return columns;
  }

  // —— تصدير عالمي (للتوافق مع attendance-system / grades / print) ——
  root.getCentralCalendar = getCentralCalendar;
  root.getRecordingPeriods = getRecordingPeriods;
  root.getFourWeekDates = getFourWeekDates;
  root.getPeriodWeekStartDates = getPeriodWeekStartDates;
  root.isWeekExcluded = isWeekExcluded;
  root.getMonthLabels = getMonthLabels;
  root.getWeek1DateISO = getWeek1DateISO;
  root.saveCentralCalendar = saveCentralCalendar;
  root.ensureCalendarSeeded = ensureCalendarSeeded;
  root.syncCalendarFromPeriods = syncCalendarFromPeriods;
  root.buildMonthDayColumns = buildMonthDayColumns;

  // لا نستبدل getPeriodWeekCount إن weekly-period عرّفه؛ نوفّر GSP
  GSP.getCentralCalendar = getCentralCalendar;
  GSP.getRecordingPeriods = getRecordingPeriods;
  GSP.getFourWeekDates = getFourWeekDates;
  GSP.calendarBridge = {
    getCentralCalendar: getCentralCalendar,
    saveCentralCalendar: saveCentralCalendar,
    ensureCalendarSeeded: ensureCalendarSeeded,
    syncCalendarFromPeriods: syncCalendarFromPeriods,
    getRecordingPeriods: getRecordingPeriods,
    getFourWeekDates: getFourWeekDates,
    getPeriodWeekStartDates: getPeriodWeekStartDates,
    getPeriodWeekCount: getPeriodWeekCountBridge,
    isWeekExcluded: isWeekExcluded,
    getMonthLabels: getMonthLabels,
    buildMonthDayColumns: buildMonthDayColumns,
    syncLegacyFromCalendar: syncLegacyFromCalendar
  };

  // بذر الروزنامة عند التحميل
  if (typeof root.document !== 'undefined') {
    root.document.addEventListener('DOMContentLoaded', function () {
      setTimeout(function () {
        try { ensureCalendarSeeded(); } catch (e) { console.warn('calendar seed', e); }
      }, 200);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
