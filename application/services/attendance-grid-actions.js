/*
 * Attendance grid actions. STEP 16: isolates bulk marking and persistence orchestration
 * from the legacy attendance controller. DOM rendering remains in the feature UI layer.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});

  function createAttendanceGridActions(deps) {
    const d = deps || {};
    const need = (name) => {
      if (typeof d[name] !== 'function') throw new Error('Attendance grid actions: missing dependency ' + name);
      return d[name];
    };
    const loadDB = need('loadDB');
    const ensureAttendance = need('ensureAttendance');
    const getFilterState = need('getFilterState');
    const isAttendanceMonthLocked = need('isAttendanceMonthLocked');
    const showConfirm = need('showConfirm');
    const notify = d.notify || { info: function () {}, success: function () {}, warning: function () {}, error: function () {}, reportWarning: function () {} };
    const getMonthCalendarDays = need('getMonthCalendarDays');
    const getSubjectStudyDays = need('getSubjectStudyDays');
    const getActiveDayIndices = need('getActiveDayIndices');
    const isColumnStudyDay = need('isColumnStudyDay');
    const saveDB = need('saveDB');
    const recordKey = need('recordKey');
    const deviceTodayISO = need('deviceTodayISO');
    const scheduleCloudPush = d.scheduleCloudPush;
    const notifyIfSkipSuspectsAfterSave = d.notifyIfSkipSuspectsAfterSave;
    const applySyncForFilter = d.applySyncForFilter;
    const getAccountType = need('getAccountType');
    const renderAttendanceGrid = d.renderAttendanceGrid;
    const transaction = d.transaction || null;
    const rollbackCurrentDB = typeof d.rollbackCurrentDB === 'function' ? d.rollbackCurrentDB : null;

    async function markDayAll(dateISO, mark) {
      if (!dateISO) return;
      const db = loadDB();
      const f = getFilterState();
      if (isAttendanceMonthLocked(db, f.term, f.month)) { notify.warning('🔒 هذا الشهر مقفول — لا يمكن التعديل.'); return; }
      let v = mark;
      if (v === '__clear__') v = '';
      if (v !== 'غ' && v !== 'ع' && v !== '') v = '';
      const inputs = Array.from(document.querySelectorAll('#attGridBody input.att-mark:not([disabled])')).filter(inp => inp.getAttribute('data-date') === dateISO);
      if (!inputs.length) { notify.warning('لا توجد خانات قابلة للرصد لهذا اليوم في الكشف الحالي.'); return; }
      const label = v === 'غ' ? 'غائب' : (v === 'ع' ? 'عذر' : 'حاضر (فارغ)');
      if (!(await showConfirm('تعيين «' + label + '» لجميع الطلاب في يوم ' + dateISO + '؟\n(' + inputs.length + ' طالباً)'))) return;
      inputs.forEach(inp => { inp.value = v; inp.classList.toggle('is-g', v === 'غ'); inp.classList.toggle('is-e', v === 'ع'); });
      if (typeof d.saveAttendanceGrid === 'function') d.saveAttendanceGrid();
    }

    function markSelectedDayAll(mark) {
      const sel = document.getElementById('attQuickDaySelect');
      if (!sel || !sel.value) { notify.warning('اختر يوماً من قائمة الرصد السريع أولاً.'); return; }
      markDayAll(sel.value, mark);
    }

    async function markWeekAll(weekIndex, mark) {
      const db = loadDB(); const f = getFilterState();
      if (isAttendanceMonthLocked(db, f.term, f.month)) { notify.warning('🔒 هذا الشهر مقفول — لا يمكن التعديل.'); return; }
      let v = mark; if (v !== 'غ' && v !== 'ع' && v !== '') v = '';
      const columns = getMonthCalendarDays(f.term, f.month);
      const att = ensureAttendance(db);
      const studyDays = getSubjectStudyDays(att, f.subjectName, f.classKey);
      const daysPerWeek = getActiveDayIndices(att).length || 5;
      const weekCols = columns.slice(weekIndex * daysPerWeek, (weekIndex + 1) * daysPerWeek).filter(c => c.hasDate && !c.isHoliday && isColumnStudyDay(c, studyDays));
      if (!weekCols.length) { notify.warning('لا أيام قابلة للرصد في هذا الأسبوع.'); return; }
      const label = v === 'غ' ? 'غائب' : (v === 'ع' ? 'عذر' : 'حاضر (فارغ)');
      if (!(await showConfirm('تعيين «' + label + '» لجميع الطلاب في كل أيام الأسبوع ' + (weekIndex + 1) + '؟\n(' + weekCols.length + ' يوماً)'))) return;
      weekCols.forEach(c => Array.from(document.querySelectorAll('#attGridBody input.att-mark:not([disabled])')).filter(inp => inp.getAttribute('data-date') === c.dateISO).forEach(inp => { inp.value=v; inp.classList.toggle('is-g',v==='غ'); inp.classList.toggle('is-e',v==='ع'); }));
      if (typeof d.saveAttendanceGrid === 'function') d.saveAttendanceGrid();
    }

    function saveGrid() {
      const liveDb = loadDB(); const f = getFilterState();
      if (isAttendanceMonthLocked(liveDb, f.term, f.month)) {
        const status=document.getElementById('attStatusMsg'); if(status){status.textContent='🔒 لا يمكن الحفظ — الشهر مقفول';status.style.color='#b91c1c';} return;
      }
      const apply = (db) => {
        const att = ensureAttendance(db);
        let n=0, markedAbsentToday=false; const today=deviceTodayISO();
        document.querySelectorAll('#attGridBody input.att-mark').forEach(inp=>{
          const sid=inp.getAttribute('data-sid'), date=inp.getAttribute('data-date');
          let v=(inp.value||'').trim(); if(v!=='غ'&&v!=='ع') v='';
          const k=recordKey(sid,f.subjectName,f.term,f.month,date);
          if(v){att.records[k]=v;n++;if(v==='غ'&&date===today)markedAbsentToday=true;} else delete att.records[k];
        });
        if(att.syncToGrades && getAccountType()==='superadmin' && typeof applySyncForFilter==='function') applySyncForFilter(db,f);
        return {n, markedAbsentToday};
      };
      let result;
      if (transaction && typeof transaction.executeSync === 'function') {
        const tx = transaction.executeSync({ label:'attendance.gridSave', load:loadDB, save:saveDB, rollback:rollbackCurrentDB, work:apply });
        result = tx.result || {n:0,markedAbsentToday:false};
      } else {
        result = apply(liveDb); saveDB(liveDb); if(typeof scheduleCloudPush==='function') scheduleCloudPush();
      }
      const status=document.getElementById('attStatusMsg'); if(status){status.textContent='✅ تم حفظ سجل الغياب'+(result.n?` (${result.n} علامة)`:'');status.style.color='#0b5e42';}
      if(typeof renderAttendanceGrid==='function') renderAttendanceGrid();
      if(result.markedAbsentToday && typeof notifyIfSkipSuspectsAfterSave==='function') notifyIfSkipSuspectsAfterSave({subjectName:f.subjectName,classKey:f.classKey});
    }

    return Object.freeze({ markDayAll, markSelectedDayAll, markWeekAll, saveGrid });
  }

  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.createAttendanceGridActions = createAttendanceGridActions;
  GSP.createAttendanceGridActions = createAttendanceGridActions;
})(window);
