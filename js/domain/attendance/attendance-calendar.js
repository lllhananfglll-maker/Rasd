(function (global) {
  'use strict';
  const api = Object.freeze({
    roundToHalf(n) { return Number.isFinite(n) ? Math.round(n * 2) / 2 : 0; },
    parseISO(iso) {
      if (!iso) return null;
      const d = new Date(iso + 'T00:00:00');
      return isNaN(d.getTime()) ? null : d;
    },
    toISO(d) {
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    },
    getActiveDayIndices(att) {
      const days = [0, 1, 2, 3, 4];
      if (att && att.saturdayEnabled) days.push(6);
      return days;
    },
    isColumnStudyDay(col, studyDayIdxList) {
      return !!col && Array.isArray(studyDayIdxList) && studyDayIdxList.indexOf(col.dayIdx) >= 0;
    },
    trendFromRates(current, previous) {
      if (current == null || previous == null) return { code: 'na', label: '—', arrow: '' };
      const gap = Math.round((current - previous) * 10) / 10;
      if (gap >= 1) return { code: 'up', label: 'ارتفاع', arrow: '↑', gap };
      if (gap <= -1) return { code: 'down', label: 'انخفاض', arrow: '↓', gap };
      return { code: 'flat', label: 'ثابت', arrow: '→', gap };
    }
  });
  global.GSP_DOMAIN = global.GSP_DOMAIN || {};
  global.GSP_DOMAIN.attendanceCalendar = api;

  // Bridge for composition / legacy boundary (classic scripts)
  global.GSP = global.GSP || {};
  global.GSP.attendanceCalendar = api;
  global.GSP.getActiveDayIndices = api.getActiveDayIndices;
  global.GSP.isColumnStudyDay = api.isColumnStudyDay;
  global.GSP.trendFromRates = api.trendFromRates;
})(typeof window !== 'undefined' ? window : globalThis);
