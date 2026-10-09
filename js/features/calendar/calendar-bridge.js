/**
 * features/calendar/calendar-bridge.js
 * STEP 55 — إعادة كتابة كاملة لمصدر فترات الرصد / الروزنامة.
 *
 * المصدر الوحيد للحقيقة: schoolInfo.termCalendar[term]
 * عند كل حفظ:
 *   1) تُكتب في المرحلة الحالية (saveDB)
 *   2) تُنسَخ لكل المراحل (persistRootDB)
 *   3) تُشتق recordingPeriods / months / week1Dates للتوافق
 *
 * قواعد صارمة:
 * - القراءة لا تكتب أبداً على التخزين
 * - ensureCalendarSeeded يزرع الافتراضي مرة واحدة فقط إن لم يوجد شيء محفوظ
 * - لا يُستبدل محفوظ المستخدم بالافتراضي عند التحميل أو الخروج
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const cal = function () {
    return (GSP.domain && GSP.domain.calendar) || GSP.termCalendar || null;
  };

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

  function termKey(term) {
    return term === 'second' ? 'second' : 'first';
  }


  // ─── STEP 56: خزنة روزنامة مستقلة لا تُمسَح بالسحب السحابي ولا بتبديل المرحلة ───
  const CALENDAR_VAULT_LS = 'gsp_school_calendar_vault_v1';
  const CALENDAR_VAULT_IDB = 'gsp_school_calendar_vault_v1';

  function readCalendarVault() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(CALENDAR_VAULT_LS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && (parsed.first || parsed.second)) return parsed;
      }
    } catch (_) {}
    return null;
  }

  function writeCalendarVault(payload) {
    try {
      const data = {
        first: payload.first || null,
        second: payload.second || null,
        recordingPeriods: payload.recordingPeriods || null,
        updatedAt: new Date().toISOString()
      };
      if (root.localStorage) {
        root.localStorage.setItem(CALENDAR_VAULT_LS, JSON.stringify(data));
      }
      // نسخة في الجذر أيضاً
      try {
        if (typeof root.getRootDB === 'function' && typeof root.persistRootDB === 'function') {
          const rootDb = root.getRootDB();
          if (rootDb) {
            rootDb.schoolCalendarVault = data;
            // لا تشغّل scheduleCloudPush من هنا إن كنا داخل حفظ
            var prev = root.__gspSuppressCloudPush;
            root.__gspSuppressCloudPush = true;
            try { root.persistRootDB(rootDb); } finally { root.__gspSuppressCloudPush = prev; }
          }
        }
      } catch (_) {}
      return data;
    } catch (e) {
      console.warn('writeCalendarVault', e);
      return null;
    }
  }

  function snapshotVaultFromSchoolInfo(schoolInfo) {
    if (!schoolInfo) return null;
    const tc = schoolInfo.termCalendar || {};
    if (!tc.first && !tc.second) return null;
    return writeCalendarVault({
      first: tc.first || null,
      second: tc.second || null,
      recordingPeriods: schoolInfo.recordingPeriods || null
    });
  }

  /** تطبيق الخزنة على schoolInfo لأي مرحلة (بدون save) */
  function applyVaultToSchoolInfo(schoolInfo, vault) {
    if (!schoolInfo || !vault) return false;
    let changed = false;
    if (!schoolInfo.termCalendar) schoolInfo.termCalendar = {};
    ['first', 'second'].forEach(function (t) {
      if (vault[t] && vault[t].months && vault[t].months.length) {
        schoolInfo.termCalendar[t] = JSON.parse(JSON.stringify(vault[t]));
        applyLegacyMirrors(schoolInfo, t, schoolInfo.termCalendar[t]);
        changed = true;
      }
    });
    return changed;
  }

  /** استعادة الخزنة على كل المراحل + المرحلة الحالية */
  function restoreCalendarVaultToAllStages() {
    const vault = readCalendarVault();
    if (!vault) {
      // جرّب من الجذر
      try {
        const rootDb = typeof root.getRootDB === 'function' ? root.getRootDB() : null;
        if (rootDb && rootDb.schoolCalendarVault) {
          return restoreFromVaultObject(rootDb.schoolCalendarVault);
        }
      } catch (_) {}
      return false;
    }
    return restoreFromVaultObject(vault);
  }

  function restoreFromVaultObject(vault) {
    if (!vault) return false;
    let any = false;
    try {
      const db = loadDbSafe();
      if (db) {
        if (!db.schoolInfo) db.schoolInfo = {};
        if (applyVaultToSchoolInfo(db.schoolInfo, vault)) {
          saveDbSafe(db);
          any = true;
        }
      }
    } catch (_) {}
    try {
      if (typeof root.getRootDB === 'function' && typeof root.persistRootDB === 'function') {
        const rootDb = root.getRootDB();
        let n = 0;
        (rootDb.stages || []).forEach(function (st) {
          if (!st) return;
          if (!st.data) st.data = typeof root.emptyStageData === 'function' ? root.emptyStageData() : { schoolInfo: {} };
          if (!st.data.schoolInfo) st.data.schoolInfo = {};
          if (applyVaultToSchoolInfo(st.data.schoolInfo, vault)) n++;
        });
        if (n) {
          var prev = root.__gspSuppressCloudPush;
          root.__gspSuppressCloudPush = true;
          try { root.persistRootDB(rootDb); } finally { root.__gspSuppressCloudPush = prev; }
          any = true;
        }
      }
    } catch (e) { console.warn('restoreCalendarVaultToAllStages', e); }
    return any;
  }


  /** قراءة الروزنامة المحفوظة فقط — بدون كتابة */
  function readStoredCalendar(term) {
    const t = termKey(term);
    const db = loadDbSafe();
    if (!db || !db.schoolInfo || !db.schoolInfo.termCalendar) return null;
    const stored = db.schoolInfo.termCalendar[t];
    if (!stored || typeof stored !== 'object') return null;
    if (!stored.startDate && !(stored.months && stored.months.length)) return null;
    const c = cal();
    return c && c.normalizeCalendar ? c.normalizeCalendar(stored, t) : stored;
  }

  /** روزنامة للعرض/الحساب — محفوظ أو افتراضي (بدون كتابة) */
  function getCentralCalendar(term) {
    const t = termKey(term);
    const stored = readStoredCalendar(t);
    if (stored) return stored;
    const c = cal();
    if (c && c.defaultCalendar) return c.defaultCalendar(t);
    return {
      startDate: t === 'first' ? '2026-09-13' : '2027-02-07',
      totalWeeks: t === 'first' ? 16 : 14,
      months: [{ name: 'الفترة 1', startWeek: 1, endWeek: 4, hasExam: false, examAfterWeek: 0 }]
    };
  }

  /** اشتقاق البنية القديمة من الروزنامة (في الذاكرة على كائن schoolInfo فقط) */
  function applyLegacyMirrors(schoolInfo, term, normalized) {
    const c = cal();
    const t = termKey(term);
    const periods = (c && c.getRecordingPeriods)
      ? c.getRecordingPeriods(normalized, t)
      : (normalized.months || []).map(function (m, i) {
          const prefix = t === 'second' ? 's' : 'f';
          return {
            id: prefix + (i + 1),
            name: m.name || ('الفترة ' + (i + 1)),
            weeks: Math.max(0, (m.endWeek || 0) - (m.startWeek || 0) + 1),
            excludedWeeks: [],
            week1: c && c.weekStartISO ? c.weekStartISO(normalized, m.startWeek) : '',
            hasExam: !!m.hasExam,
            examAfterWeek: Number(m.examAfterWeek) || m.endWeek || 0,
            startWeek: m.startWeek,
            endWeek: m.endWeek,
            holidays: '',
            enabled: true
          };
        });

    if (!schoolInfo.termCalendar) schoolInfo.termCalendar = {};
    schoolInfo.termCalendar[t] = JSON.parse(JSON.stringify(normalized));

    if (!schoolInfo.recordingPeriods) schoolInfo.recordingPeriods = {};
    schoolInfo.recordingPeriods[t] = periods;

    if (!schoolInfo.week1Dates) schoolInfo.week1Dates = {};
    schoolInfo.week1Dates[t] = periods.map(function (p) { return p.week1 || ''; });

    if (!schoolInfo.months) schoolInfo.months = {};
    schoolInfo.months[t] = periods.map(function (p) { return p.name; });

    schoolInfo.calendarUpdatedAt = new Date().toISOString();
    return periods;
  }

  /**
   * حفظ روزنامة فصل واحد في المرحلة الحالية + كل المراحل.
   * هذا هو المسار الوحيد المسموح لكتابة termCalendar.
   */
  function saveCentralCalendar(term, raw) {
    const t = termKey(term);
    const c = cal();
    const normalized = c && c.normalizeCalendar ? c.normalizeCalendar(raw, t) : raw;
    const db = loadDbSafe();
    if (!db) return null;
    if (!db.schoolInfo) db.schoolInfo = {};
    applyLegacyMirrors(db.schoolInfo, t, normalized);
    saveDbSafe(db);

    // تعميم على كل المراحل
    try {
      if (typeof root.getRootDB === 'function' && typeof root.persistRootDB === 'function') {
        const rootDb = root.getRootDB();
        const currentId = root.currentStageId;
        let n = 0;
        (rootDb.stages || []).forEach(function (st) {
          if (!st) return;
          if (currentId && st.id === currentId) return; // الحالية حُفظت عبر saveDB
          if (!st.data) {
            st.data = typeof root.emptyStageData === 'function' ? root.emptyStageData() : { schoolInfo: {} };
          }
          if (!st.data.schoolInfo) st.data.schoolInfo = {};
          applyLegacyMirrors(st.data.schoolInfo, t, normalized);
          // انسخ أيضاً حقول المدرسة العامة إن وُجدت في الحالية
          try {
            const cur = db.schoolInfo || {};
            ['governorate', 'educationAdmin', 'schoolName', 'principalName', 'academicYear', 'term'].forEach(function (k) {
              if (cur[k] != null && cur[k] !== '') st.data.schoolInfo[k] = cur[k];
            });
          } catch (_) {}
          st.updatedAt = new Date().toISOString();
          n++;
        });
        if (n) root.persistRootDB(rootDb);
      }
    } catch (eProp) {
      console.warn('calendar propagate all stages', eProp);
    }
    // خزنة دائمة مستقلة عن السحابة وتبديل المرحلة
    try {
      const db2 = loadDbSafe();
      if (db2 && db2.schoolInfo) snapshotVaultFromSchoolInfo(db2.schoolInfo);
    } catch (_) {}
    return normalized;
  }

  /** بناء روزنامة من فترات الرصد ثم حفظها */
  function syncCalendarFromPeriods(dbOrNull, term, periodsList) {
    const t = termKey(term);
    const c = cal();
    const existing = readStoredCalendar(t);
    const normalized = c && c.calendarFromPeriods
      ? c.calendarFromPeriods(periodsList, t, existing)
      : getCentralCalendar(t);
    // إن مُرّر db نطبّق عليه مباشرة ثم saveCentralCalendar يعيد الحفظ والتعميم
    if (dbOrNull && dbOrNull.schoolInfo) {
      applyLegacyMirrors(dbOrNull.schoolInfo, t, normalized);
    }
    return saveCentralCalendar(t, normalized);
  }

  /**
   * بذر لمرة واحدة فقط: إن لم توجد روزنامة ولا فترات محفوظة.
   * لا يمس أي بيانات موجودة.
   */
  function ensureCalendarSeeded() {
    // أولاً: استعد من الخزنة إن وُجدت (أقوى من الافتراضي ومن سحابة قديمة)
    try { restoreCalendarVaultToAllStages(); } catch (_) {}
    const db = loadDbSafe();
    if (!db) return;
    if (!db.schoolInfo) db.schoolInfo = {};
    let changed = false;
    const c = cal();
    ['first', 'second'].forEach(function (term) {
      const hasCal = db.schoolInfo.termCalendar &&
        db.schoolInfo.termCalendar[term] &&
        (db.schoolInfo.termCalendar[term].startDate ||
          (db.schoolInfo.termCalendar[term].months && db.schoolInfo.termCalendar[term].months.length));
      const hasPeriods = db.schoolInfo.recordingPeriods &&
        Array.isArray(db.schoolInfo.recordingPeriods[term]) &&
        db.schoolInfo.recordingPeriods[term].length > 0;

      if (hasCal) {
        // مزامنة المرايا فقط إن كانت recordingPeriods فارغة
        if (!hasPeriods) {
          const normalized = c && c.normalizeCalendar
            ? c.normalizeCalendar(db.schoolInfo.termCalendar[term], term)
            : db.schoolInfo.termCalendar[term];
          applyLegacyMirrors(db.schoolInfo, term, normalized);
          changed = true;
        }
        return;
      }
      if (hasPeriods) {
        // فترات بلا روزنامة → ابنِ الروزنامة منها
        const normalized = c && c.calendarFromPeriods
          ? c.calendarFromPeriods(db.schoolInfo.recordingPeriods[term], term, null)
          : null;
        if (normalized) {
          applyLegacyMirrors(db.schoolInfo, term, normalized);
          changed = true;
        }
        return;
      }
      // لا شيء محفوظ → افتراضي لمرة واحدة
      const def = c && c.defaultCalendar ? c.defaultCalendar(term) : getCentralCalendar(term);
      applyLegacyMirrors(db.schoolInfo, term, def);
      changed = true;
    });
    if (changed) saveDbSafe(db);
  }

  function getRecordingPeriods(term) {
    const t = termKey(term);
    // 1) من الروزنامة المحفوظة
    const stored = readStoredCalendar(t);
    if (stored && stored.months && stored.months.length) {
      const c = cal();
      if (c && c.getRecordingPeriods) return c.getRecordingPeriods(stored, t);
    }
    // 2) من recordingPeriods المحفوظة
    try {
      const db = loadDbSafe();
      const list = db && db.schoolInfo && db.schoolInfo.recordingPeriods && db.schoolInfo.recordingPeriods[t];
      if (Array.isArray(list) && list.length) {
        return list.filter(function (p) { return p && p.enabled !== false; }).map(function (p, i) {
          const prefix = t === 'second' ? 's' : 'f';
          return {
            id: p.id || (prefix + (i + 1)),
            name: p.name || ('الفترة ' + (i + 1)),
            weeks: Math.max(0, Number(p.weeks) || 4),
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
    } catch (_) {}
    // 3) افتراضي للقراءة فقط
    return getCentralCalendar(t).months.map(function (m, i) {
      const prefix = t === 'second' ? 's' : 'f';
      const c = cal();
      return {
        id: prefix + (i + 1),
        name: m.name,
        weeks: m.endWeek - m.startWeek + 1,
        week1: c && c.weekStartISO ? c.weekStartISO(getCentralCalendar(t), m.startWeek) : '',
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
    const domain = cal();
    if (!m || !domain) return ['', '', '', ''];
    const out = [];
    for (let w = m.startWeek; w <= Math.min(c.totalWeeks, m.endWeek); w++) {
      out.push(domain.weekStartISO(c, w));
    }
    while (out.length < 4) out.push('');
    return out;
  }

  function getPeriodWeekStartDates(term, monthIndex0) {
    const c = getCentralCalendar(term);
    const m = c.months[monthIndex0];
    const domain = cal();
    if (!m || !domain) return [];
    const out = [];
    for (let w = m.startWeek; w <= Math.min(c.totalWeeks, m.endWeek); w++) {
      out.push({
        globalWeek: w,
        localWeek: w - m.startWeek + 1,
        startISO: domain.weekStartISO(c, w)
      });
    }
    return out;
  }

  function getPeriodWeekCountBridge(term, monthIndex0Or1) {
    const c = getCentralCalendar(term);
    let idx = Number(monthIndex0Or1);
    if (!Number.isFinite(idx)) idx = 0;
    // دعم 1-based
    if (idx >= 1 && idx <= (c.months || []).length && !c.months[idx] && c.months[idx - 1]) {
      idx = idx - 1;
    }
    if (idx >= 1 && idx <= (c.months || []).length && c.months[idx - 1] && !c.months[idx]) {
      // heuristic: caller used 1-based
      const m1 = c.months[idx - 1];
      return m1 ? Math.max(0, m1.endWeek - m1.startWeek + 1) : 0;
    }
    const m = c.months[idx];
    return m ? Math.max(0, m.endWeek - m.startWeek + 1) : 0;
  }

  function isWeekExcluded(/* term, monthIndex0, weekIndex0 */) {
    // الأسابيع خارج نطاق الفترة تُحسب خارج الرصد عبر getPeriodWeekStartDates
    return false;
  }

  function getMonthLabels(term) {
    return getRecordingPeriods(term).map(function (p) { return p.name || 'فترة'; });
  }

  function getWeek1DateISO(term, monthIndex0) {
    const dates = getFourWeekDates(term, monthIndex0);
    return dates[0] || '';
  }

  function buildMonthDayColumns(term, monthIndex0, activeJsDays, holidays) {
    const domain = cal();
    const columns = [];
    const weeks = getPeriodWeekStartDates(term, monthIndex0);
    const holidaySet = {};
    (holidays || []).forEach(function (h) {
      if (typeof h === 'string') holidaySet[h] = true;
      else if (h && h.date) holidaySet[h.date] = true;
    });
    const DAY_LABELS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
    if (!weeks.length) return columns;
    weeks.forEach(function (winfo) {
      if (!winfo.startISO || !domain) {
        (activeJsDays || [0, 1, 2, 3, 4]).forEach(function (_js, di) {
          columns.push({
            week: winfo.localWeek,
            globalWeek: winfo.globalWeek,
            dayIdx: di,
            jsDay: (activeJsDays || [])[di],
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
      const base = domain.parseISO(winfo.startISO);
      if (!base) return;
      const startJs = base.getDay();
      (activeJsDays || [0, 1, 2, 3, 4]).forEach(function (jsDay, di) {
        let delta = jsDay - startJs;
        if (delta < 0) delta += 7;
        const d = new Date(base.getTime());
        d.setDate(d.getDate() + delta);
        const iso = domain.toISO(d);
        columns.push({
          week: winfo.localWeek,
          globalWeek: winfo.globalWeek,
          dayIdx: di,
          jsDay: jsDay,
          dateISO: iso,
          label: DAY_LABELS[di] || '',
          dateLabel: domain.formatAr ? domain.formatAr(iso) : iso,
          isHoliday: !!holidaySet[iso],
          hasDate: true,
          outOfScope: false
        });
      });
    });
    return columns;
  }

  // توافق الاسم القديم
  function syncLegacyFromCalendar(db, term, c) {
    if (!db) return;
    if (!db.schoolInfo) db.schoolInfo = {};
    applyLegacyMirrors(db.schoolInfo, term, c);
  }

  // —— تصدير عالمي ——
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
  root.restoreCalendarVaultToAllStages = restoreCalendarVaultToAllStages;
  root.readCalendarVault = readCalendarVault;
  root.buildMonthDayColumns = buildMonthDayColumns;

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
    syncLegacyFromCalendar: syncLegacyFromCalendar,
    readStoredCalendar: readStoredCalendar,
    restoreCalendarVaultToAllStages: restoreCalendarVaultToAllStages,
    readCalendarVault: readCalendarVault,
    snapshotVaultFromSchoolInfo: snapshotVaultFromSchoolInfo
  };

  if (typeof root.document !== 'undefined') {
    root.document.addEventListener('DOMContentLoaded', function () {
      setTimeout(function () {
        try { ensureCalendarSeeded(); } catch (e) { console.warn('calendar seed', e); }
      }, 300);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
