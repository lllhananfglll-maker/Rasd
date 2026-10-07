(function(){
  'use strict';
  // Alias domain calendar helpers (defined in js/domain/attendance/attendance-calendar.js)
  const ATT_CAL = (typeof GSP_DOMAIN !== 'undefined' && GSP_DOMAIN.attendanceCalendar)
    ? GSP_DOMAIN.attendanceCalendar
    : (window.GSP_DOMAIN && window.GSP_DOMAIN.attendanceCalendar) || {};
  const DAY_LABELS = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','السبت'];
  const esc = escapeHtml; // مصدر واحد لمنطق الهروب من HTML (راجع تعريف escapeHtml الرئيسي)
  function attendanceNotify(level, message){
    const service = window.GSP && window.GSP.application && window.GSP.application.attendanceNotification;
    if(service && typeof service[level] === 'function') return service[level](message);
    if(typeof window.alert === 'function') return window.alert(String(message));
  }
  function attendanceReportError(context, error, userMessage){
    const service = window.GSP && window.GSP.application && window.GSP.application.attendanceNotification;
    if(service && typeof service.reportError === 'function') return service.reportError(context, error, userMessage);
    console.error(context || 'Attendance error', error);
    if(userMessage && typeof window.alert === 'function') window.alert(String(userMessage));
  }
  function excuseDaySkipStudentFromButton(button) {
  const sid = button && button.getAttribute('data-student-id');
  if (sid != null && typeof excuseDaySkipStudent === 'function') excuseDaySkipStudent(sid);
}
GSP.excuseDaySkipStudentFromButton = excuseDaySkipStudentFromButton;

function canManageAttReports(){
    return currentAccountType === 'superadmin' || currentAccountType === 'stageadmin' || currentAccountType === 'monitor';
  }
  function ensureAttendance(db){
    if (!db.attendance || typeof db.attendance !== 'object') {
      db.attendance = { records:{}, subjectDays:{}, holidays:[], saturdayEnabled:false, syncToGrades:false };
    }
    db.attendance.records = db.attendance.records || {};
    db.attendance.subjectDays = db.attendance.subjectDays || {};
    db.attendance.holidays = Array.isArray(db.attendance.holidays) ? db.attendance.holidays : [];
    if (typeof db.attendance.saturdayEnabled !== 'boolean') db.attendance.saturdayEnabled = false;
    if (typeof db.attendance.syncToGrades !== 'boolean') db.attendance.syncToGrades = false;
    return db.attendance;
  }
  function subjectDaysKey(subjectName, classKey){ return String(subjectName||'') + '||' + String(classKey||''); }
  function recordKey(studentId, subjectName, term, month, dateISO){ return [studentId, subjectName, term, month, dateISO].join('|'); }
  
  function deviceTodayISO(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function ensureDaySkipState(db){
    const today = deviceTodayISO();
    if (!db.daySkip || db.daySkip.date !== today) db.daySkip = { date: today, excused: {} };
    db.daySkip.excused = db.daySkip.excused || {};
    return db.daySkip;
  }
  function subjectAttendanceTakenForClass(att, subjectName, term, month, dateISO, classStudentIds){
    for (let i = 0; i < classStudentIds.length; i++) {
      const k = recordKey(classStudentIds[i], subjectName, term, month, dateISO);
      if (Object.prototype.hasOwnProperty.call(att.records, k)) return true;
    }
    return false;
  }
  function findPriorPresenceSubjects(db, student, absentSubject, term, month, dateISO){
    const att = ensureAttendance(db);
    const classKey = (typeof classSectionKey === 'function') ? classSectionKey(student.class, student.section) : (student.class || '');
    const classStudentIds = (db.students || []).filter(s => {
      const k = (typeof classSectionKey === 'function') ? classSectionKey(s.class, s.section) : (s.class || '');
      return k === classKey;
    }).map(s => s.id);
    const found = [];
    (db.subjects || []).forEach(sub => {
      if (!sub || sub.name === absentSubject) return;
      const k = recordKey(student.id, sub.name, term, month, dateISO);
      const v = att.records[k];
      if (v === 'غ') return;
      if (v === '✓' || v === 'ع' || v === 'ح') { found.push(sub.name); return; }
      if (subjectAttendanceTakenForClass(att, sub.name, term, month, dateISO, classStudentIds)) found.push(sub.name);
    });
    return found;
  }
  function collectTodaySkipSuspects(db, opts){
    opts = opts || {};
    const today = deviceTodayISO();
    const att = ensureAttendance(db);
    const daySkip = ensureDaySkipState(db);
    const suspects = []; const seen = new Set();
    Object.keys(att.records || {}).forEach(k => {
      const parts = k.split('|');
      if (parts.length < 5) return;
      const sid=parts[0], subjectName=parts[1], rTerm=parts[2], rMonth=parts[3], dateISO=parts[4];
      if (dateISO !== today || att.records[k] !== 'غ') return;
      if (opts.subjectName && subjectName !== opts.subjectName) return;
      const st = (db.students||[]).find(s => String(s.id)===String(sid));
      if (!st) return;
      const ck = (typeof classSectionKey==='function') ? classSectionKey(st.class, st.section) : (st.class||'');
      if (opts.classKey && ck !== opts.classKey) return;
      const prior = findPriorPresenceSubjects(db, st, subjectName, rTerm, Number(rMonth)||rMonth, dateISO);
      if (!prior.length) return;
      const key = String(sid)+'|'+subjectName;
      if (seen.has(key)) return; seen.add(key);
      suspects.push({
        studentId: st.id, name: st.name||'', seat: st.seat||'', classKey: ck,
        classLabel: (typeof classSectionLabel==='function') ? classSectionLabel(ck) : ck,
        absentSubject: subjectName, presentSubjects: prior,
        excused: !!daySkip.excused[String(st.id)], dateISO
      });
    });
    suspects.sort((a,b)=>(a.classLabel||'').localeCompare(b.classLabel||'','ar')||(a.name||'').localeCompare(b.name||'','ar'));
    return { dateISO: today, suspects };
  }
  GSP.excuseDaySkipStudent = function(studentId){
    const db = loadDB(); ensureDaySkipState(db).excused[String(studentId)] = true; saveDB(db);
    try { openTodaySkipSuspectsModal(); } catch(e){}
  };
  GSP.openTodaySkipSuspectsModal = function(filterOpts){
    const db = loadDB(); const data = collectTodaySkipSuspects(db, filterOpts||{});
    const list = data.suspects.filter(s => !s.excused);
    const old = document.getElementById('daySkipOverlay'); if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'daySkipOverlay'; overlay.className = 'mg-modal-overlay';
    const rows = list.map(s => {
      const sid = String(s.studentId).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      return '<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700">'+esc(s.name)+'</td>'
        +'<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center">'+esc(s.seat||'—')+'</td>'
        +'<td style="padding:8px;border-bottom:1px solid #e2e8f0">'+esc(s.classLabel)+'</td>'
        +'<td style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:12px">غ: <b>'+esc(s.absentSubject)+'</b><br><span style="color:#64748b">حضر: '+esc(s.presentSubjects.join('، '))+'</span></td>'
        +'<td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center"><button type="button" class="btn btn-outline btn-sm" data-action="excuseDaySkipStudentFromButton" data-with-element data-student-id="'+sid+'">إذن</button></td></tr>';
    }).join('') || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#64748b">لا يوجد طلاب مشتبه بهم بدون إذن حالياً.</td></tr>';
    overlay.innerHTML = '<div class="mg-modal-box" style="max-width:720px"><div class="mg-modal-header ui-modal-header ui-type-info" style="display:flex;justify-content:space-between;align-items:center"><span>⚠️ غياب بعد حضور سابق اليوم ('+esc(data.dateISO)+')</span><button type="button" class="btn btn-outline btn-sm" data-close>إغلاق</button></div><div class="mg-modal-body" style="padding:14px 16px"><p style="margin:0 0 10px;font-size:13px;color:#64748b;line-height:1.7">طلاب غابوا بعد حضور حصة أخرى اليوم. «إذن» يستبعد لبقية اليوم فقط.</p><div style="overflow:auto;max-height:360px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f1f5f9"><th style="padding:8px;text-align:right">الطالب</th><th style="padding:8px">جلوس</th><th style="padding:8px;text-align:right">الفصل</th><th style="padding:8px;text-align:right">التفاصيل</th><th style="padding:8px">إذن</th></tr></thead><tbody>'+rows+'</tbody></table></div></div><div class="mg-modal-footer"><button type="button" class="btn btn-outline" data-close>إغلاق</button><button type="button" class="btn btn-primary" id="daySkipPrintBtn">🖨️ طباعة بدون إذن ('+list.length+')</button></div></div>';
    document.body.appendChild(overlay);
    const close=function(){try{overlay.remove();}catch(e){}};
    overlay.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    const pb=overlay.querySelector('#daySkipPrintBtn'); if(pb) pb.onclick=function(){printTodaySkipSuspectsReport(filterOpts);};
  };
  GSP.printTodaySkipSuspectsReport = function(filterOpts){
    const db=loadDB(); const data=collectTodaySkipSuspects(db, filterOpts||{});
    const list=data.suspects.filter(s=>!s.excused);
    if(!list.length){attendanceNotify('warning','لا يوجد طلاب بدون إذن للطباعة.');return;}
    const info=db.schoolInfo||{};
    const stageLabel=(typeof getStageRecord==='function'&&typeof stageDisplayLabel==='function'&&currentStageId)?stageDisplayLabel(getStageRecord(currentStageId)):'';
    const hindi=(typeof toHindiDigits==='function')?toHindiDigits:v=>String(v);
    const th='border:1px solid #94a3b8;padding:6px;background:#3f7a57;color:#fff;font-weight:800;text-align:center;font-size:11px';
    const td='border:1px solid #94a3b8;padding:5px;text-align:right;font-size:11px';
    const tdc='border:1px solid #94a3b8;padding:5px;text-align:center;font-size:11px';
    const bodyRows=list.map((s,i)=>'<tr><td style="'+tdc+'">'+hindi(i+1)+'</td><td style="'+td+';font-weight:700">'+esc(s.name)+'</td><td style="'+tdc+'">'+esc(s.seat||'—')+'</td><td style="'+td+'">'+esc(s.classLabel)+'</td><td style="'+td+'">'+esc(s.absentSubject)+'</td><td style="'+td+'">'+esc(s.presentSubjects.join('، '))+'</td></tr>').join('');
    const area=document.getElementById('printAttendanceArea')||document.getElementById('printGradeSheetArea');
    if(!area)return;
    if(typeof clearInactivePrintAreas==='function') clearInactivePrintAreas(area.id);
    const printedBy=(typeof resolvePrintedByName==='function')?resolvePrintedByName():'المستخدم';
    const printDate=new Date().toLocaleDateString('ar-EG');
    const letterhead=(typeof buildUnifiedLetterhead==='function')?buildUnifiedLetterhead({title:'تقرير غياب بعد حضور سابق (بدون إذن)',subtitleRight:stageLabel||'',subtitleLeft:'',printedBy,printDate,governorate:info.governorate||'',educationAdmin:info.educationAdmin||'',schoolName:info.schoolName||'',academicYear:info.academicYear||'',metaBarHtml:'<span><strong>تاريخ الجهاز:</strong> '+esc(data.dateISO)+'</span><span><strong>عدد:</strong> '+hindi(list.length)+'</span>'}):'';
    const footer=(typeof buildUnifiedFooter==='function')?buildUnifiedFooter({captions:['المعلم / المراقب','مدير المرحلة']}):'';
    area.innerHTML='<div class="grade-sheet-page detailed-sheet-page" style="padding:8mm;direction:rtl;font-family:Cairo,Tahoma,sans-serif">'+letterhead+'<table style="width:100%;border-collapse:collapse;border:2px solid #3f7a57"><thead><tr><th style="'+th+'">م</th><th style="'+th+'">اسم الطالب</th><th style="'+th+'">جلوس</th><th style="'+th+'">الفصل</th><th style="'+th+'">مادة الغياب</th><th style="'+th+'">مواد حضر فيها</th></tr></thead><tbody>'+bodyRows+'</tbody></table>'+footer+'</div>';
    if(typeof fitPrintPagesToA4==='function') fitPrintPagesToA4(area,'.grade-sheet-page, .detailed-sheet-page');
    const prevTitle=document.title; document.title='غياب بعد حضور'; window.print();
    setTimeout(function(){document.title=prevTitle; if(typeof clearAllPrintAreas==='function') clearAllPrintAreas();},800);
  };
  GSP.notifyIfSkipSuspectsAfterSave = async function(filterOpts){
    try {
      const db=loadDB(); const list=collectTodaySkipSuspects(db, filterOpts||{}).suspects.filter(s=>!s.excused);
      if(!list.length) return;
      if(await showConfirm('⚠️ يحتمل تغيّب '+list.length+' طالب/ة بعد حضور حصة سابقة اليوم.\n\nعرض الأسماء؟'))
        openTodaySkipSuspectsModal(filterOpts||{});
    } catch(e){ attendanceReportError('attendance sync', e); }
  };
function roundToHalf(n){ if (!Number.isFinite(n)) return 0; return Math.round(n * 2) / 2; }
  function parseISO(iso){ if (!iso) return null; const d = new Date(iso + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; }
  function toISO(d){
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
    return y + '-' + m + '-' + day;
  }
  function getActiveDayIndices(att){ const days = [0,1,2,3,4]; if (att.saturdayEnabled) days.push(6); return days; }
  function collectSchoolHolidaySet(){
    // إجازات المدرسة: اتحاد إجازات كل المراحل (للتوافق مع نسخ قديمة حُفظت في مرحلة واحدة فقط)
    const set = new Set();
    try {
      const root = (typeof getRootDB === 'function') ? getRootDB() : null;
      if (root && Array.isArray(root.stages)) {
        root.stages.forEach(st => {
          const att = st && st.data && st.data.attendance;
          (att && Array.isArray(att.holidays) ? att.holidays : []).forEach(h => { if (h) set.add(String(h).trim()); });
        });
      }
    } catch (e) {}
    try {
      const att = ensureAttendance(loadDB());
      (att.holidays || []).forEach(h => { if (h) set.add(String(h).trim()); });
    } catch (e) {}
    return set;
  }
  function getMonthCalendarDays(term, month){
    const db = loadDB(); const att = ensureAttendance(db);
    const weekStarts = (typeof getFourWeekDates === 'function') ? getFourWeekDates(term, month - 1) : ['','','',''];
    const activeJsDays = getActiveDayIndices(att);
    const holidaySet = collectSchoolHolidaySet();
    const scopeWeeksCal = (typeof getPeriodWeekCount === 'function') ? getPeriodWeekCount(term, month - 1) : 4;
    const columns = [];
    for (let w = 0; w < 4; w++) {
      const base = parseISO(weekStarts[w]);
      if (!base) {
        activeJsDays.forEach((jsDay, di) => {
          columns.push({ week:w+1, dayIdx:di, jsDay, dateISO:'', label:DAY_LABELS[di]||'', dateLabel:'—', isHoliday:false, hasDate:false, outOfScope: (typeof isWeekExcluded === 'function') ? isWeekExcluded(term, month - 1, w) : (w >= scopeWeeksCal) });
        });
        continue;
      }
      const startJs = base.getDay();
      activeJsDays.forEach((jsDay, di) => {
        let delta = jsDay - startJs; if (delta < 0) delta += 7;
        const d = new Date(base); d.setDate(d.getDate() + delta);
        const iso = toISO(d);
        columns.push({
          week:w+1, dayIdx:di, jsDay, dateISO:iso, label:DAY_LABELS[di]||'',
          dateLabel:(typeof formatWeekDateAr==='function')?formatWeekDateAr(iso):iso,
          isHoliday:holidaySet.has(iso), hasDate:true, outOfScope: (typeof isWeekExcluded === 'function') ? isWeekExcluded(term, month - 1, w) : (w >= scopeWeeksCal)
        });
      });
    }
    return columns;
  }
  function getSubjectStudyDays(att, subjectName, classKey){
    let days = att.subjectDays[subjectDaysKey(subjectName, classKey)];
    if (!Array.isArray(days) || !days.length) days = [0,1,2,3,4];
    return days.map(Number).filter(n => n >= 0 && n <= 5);
  }
  const isColumnStudyDay = ATT_CAL.isColumnStudyDay;
  function findAttendanceComponent(subject){
    if (!subject || !Array.isArray(subject.components)) return null;
    for (let i = 0; i < subject.components.length; i++) {
      const c = subject.components[i]; const name = c.name || '';
      if (c.type === 'attendance') return { comp:c, index:i };
      const norm = (typeof normalizeArabic === 'function') ? normalizeArabic(name) : name;
      if (typeof isAttendanceComponent === 'function' && isAttendanceComponent(name) && !(typeof isAbsenceDaysComponent === 'function' && isAbsenceDaysComponent(name))) {
        if (c.maxScore != null && c.maxScore !== '') return { comp:c, index:i };
      }
      if (/مواظب|حضور/.test(norm) && c.maxScore != null && c.maxScore !== '') return { comp:c, index:i };
    }
    for (let i = 0; i < subject.components.length; i++) {
      const c = subject.components[i];
      const norm = (typeof normalizeArabic === 'function') ? normalizeArabic(c.name||'') : (c.name||'');
      if (c.maxScore != null && c.maxScore !== '' && /مواظب|حضور|غياب/.test(norm)) return { comp:c, index:i };
    }
    return null;
  }
  function dayHasAnyAttendanceRecord(att, subjectName, term, month, dateISO){
    if (!dateISO || !att || !att.records) return false;
    const suffix = '|' + String(subjectName) + '|' + String(term) + '|' + String(month) + '|' + String(dateISO);
    for (const k of Object.keys(att.records)) {
      if (k.endsWith(suffix) && att.records[k] != null && att.records[k] !== '') return true;
    }
    return false;
  }
  function computeStudentAttendanceScore(att, studentId, subjectName, term, month, columns, studyDays, maxScore, weekFilter){
    let expected = 0, absent = 0;
    columns.forEach(col => {
      if (weekFilter && col.week !== weekFilter) return;
      if (!col.hasDate || !isColumnStudyDay(col, studyDays) || col.isHoliday) return;
      if (!dayHasAnyAttendanceRecord(att, subjectName, term, month, col.dateISO)) return;
      expected++;
      if (att.records[recordKey(studentId, subjectName, term, month, col.dateISO)] === 'غ') absent++;
    });
    if (!expected || maxScore == null || maxScore === '') return { expected, absent, present: expected - absent, score: null, rate: null };
    const present = expected - absent;
    return { expected, absent, present, score: roundToHalf((present / expected) * Number(maxScore)), rate: Math.round((present / expected) * 1000) / 10 };
  }
  function attendanceFilterDeps(){
    return {
      loadDB,
      getMonthLabels: typeof getMonthLabels === 'function' ? getMonthLabels : null,
      currentAccountType, currentTeacher,
      refreshAttendanceClassOptions: function(){ return refreshAttendanceClassOptions(); },
      classSectionLabel: typeof classSectionLabel === 'function' ? classSectionLabel : null,
      esc, ensureAttendance, getSubjectStudyDays, DAY_LABELS
    };
  }
  function populateAttendanceFilters(){
    return GSP.attendanceFilters.populateAttendanceFilters(attendanceFilterDeps());
  }
  function refreshAttendanceClassOptions(){
    return GSP.attendanceFilters.refreshAttendanceClassOptions(attendanceFilterDeps());
  }
  function renderDayCheckboxes(){
    return GSP.attendanceFilters.renderDayCheckboxes(attendanceFilterDeps());
  }
  function renderHolidaysList(){
    const list = document.getElementById('attHolidaysList'); if (!list) return;
    const att = ensureAttendance(loadDB());
    if (!att.holidays.length) { list.innerHTML = '<span style="color:#94a3b8;font-size:13px;">لا توجد إجازات مسجّلة.</span>'; return; }
    list.innerHTML = att.holidays.slice().sort().map(iso =>
      `<span class="att-holiday-tag">${esc(iso)} <button type="button" title="حذف" data-action="removeAttendanceHoliday" data-args='${gspArgs(['esc(iso)'])}'>×</button></span>`
    ).join('');
  }
  function loadAttendanceAdminPanel(){
    const card = document.getElementById('attAdminSettingsCard');
    const reports = document.getElementById('attReportsCard');
    if (card) card.style.display = (currentAccountType === 'superadmin') ? 'block' : 'none';
    if (reports) reports.style.display = canManageAttReports() ? 'block' : 'none';
    if (reports && canManageAttReports()) {
      try { setTimeout(function(){ if (typeof refreshAttendanceTrendChart === 'function') refreshAttendanceTrendChart(); }, 50); } catch(e){}
    }
    if (currentAccountType === 'superadmin') {
      const att = ensureAttendance(loadDB());
      const sat = document.getElementById('attSaturdayEnabled');
      const sync = document.getElementById('attSyncToGrades');
      if (sat) sat.checked = !!att.saturdayEnabled;
      if (sync) sync.checked = !!att.syncToGrades;
      renderHolidaysList();
    }
    // شريط «حضور اليوم» للمعلم + افتراض أسبوع حالي على الموبايل
    try {
      const mobileBar = document.getElementById('attMobileDailyBar');
      if (mobileBar) {
        mobileBar.style.display = (currentAccountType === 'teacher') ? 'block' : 'none';
      }
      const weekSel = document.getElementById('attWeekViewSelect');
      if (weekSel && !weekSel.dataset.userPicked) {
        const isMobile = window.matchMedia && window.matchMedia('(max-width: 700px)').matches;
        if (isMobile && weekSel.value === 'all') weekSel.value = 'current';
      }
      if (weekSel && !weekSel.dataset.boundPick) {
        weekSel.dataset.boundPick = '1';
        weekSel.addEventListener('change', function(){ weekSel.dataset.userPicked = '1'; });
      }
    } catch (e) {}
  }
  GSP.saveAttendanceSchoolSettings = function(){
    if (currentAccountType !== 'superadmin') return;
    const saturdayEnabled = !!(document.getElementById('attSaturdayEnabled')||{}).checked;
    const syncToGrades = !!(document.getElementById('attSyncToGrades')||{}).checked;
    // السبت: إعداد مدرسي عام → كل المراحل
    if (!GSP.application.attendanceAdmin) throw new Error('Attendance admin service is unavailable');
    GSP.application.attendanceAdmin.saveSchoolSettings(saturdayEnabled, syncToGrades);
    // ترحيل درجة المواظبة: خاص بالمرحلة الحالية فقط (كل مرحلة تقرر تفعيله أو إلغاءه)
    const stageLabel = (typeof stageDisplayLabel === 'function' && typeof getStageRecord === 'function' && currentStageId)
      ? stageDisplayLabel(getStageRecord(currentStageId)) : 'المرحلة الحالية';
    const msg = document.getElementById('attSyncMsg');
    if (msg) {
      msg.textContent = syncToGrades
        ? ('✅ ترحيل المواظبة مفعّل لهذه المرحلة فقط: ' + stageLabel)
        : ('✅ ترحيل المواظبة متوقف لهذه المرحلة فقط: ' + stageLabel);
      msg.style.color = '#0b5e42';
    }
    renderDayCheckboxes();
    try { renderAttendanceGrid(); } catch (e) {}
    if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
  };
  GSP.addAttendanceHoliday = function(){
    if (currentAccountType !== 'superadmin') return;
    const inp = document.getElementById('attHolidayDateInput'); if (!inp || !inp.value) return;
    const iso = String(inp.value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    if (!GSP.application.attendanceAdmin) throw new Error('Attendance admin service is unavailable');
    const n = GSP.application.attendanceAdmin.addHoliday(iso);
    inp.value = '';
    renderHolidaysList();
    try { renderAttendanceGrid(); } catch (e) {}
    const msg = document.getElementById('attSyncMsg');
    if (msg) { msg.textContent = '✅ أُضيفت الإجازة ' + iso + ' لجميع المراحل (' + n + ')'; msg.style.color = '#0b5e42'; }
    if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
  };
  GSP.removeAttendanceHoliday = function(iso){
    if (currentAccountType !== 'superadmin') return;
    if (!GSP.application.attendanceAdmin) throw new Error('Attendance admin service is unavailable');
    GSP.application.attendanceAdmin.removeHoliday(iso);
    renderHolidaysList();
    try { renderAttendanceGrid(); } catch (e) {}
    if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
  };
  GSP.saveAttendanceSubjectDays = function(){
    const db = loadDB(); const att = ensureAttendance(db);
    const subjectName = document.getElementById('attSubjectSelect')?.value || '';
    const classKey = document.getElementById('attClassSelect')?.value || '';
    const m = document.getElementById('attScheduleMsg');
    if (!subjectName || !classKey) { if (m) { m.textContent = '⚠️ اختر المادة والفصل أولاً'; m.style.color = '#b91c1c'; } return; }
    const days = [];
    document.querySelectorAll('#attDaysCheckboxes input[data-day-idx]').forEach(inp => { if (inp.checked) days.push(parseInt(inp.getAttribute('data-day-idx'), 10)); });
    if (!days.length) { if (m) { m.textContent = '⚠️ اختر يوماً واحداً على الأقل'; m.style.color = '#b91c1c'; } return; }
    if (!GSP.application.attendanceAdmin) throw new Error('Attendance admin service is unavailable');
    GSP.application.attendanceAdmin.saveSubjectDays(subjectName, classKey, days);
    if (m) { m.textContent = '✅ تم حفظ أيام الحصص'; m.style.color = '#0b5e42'; }
    if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
    renderAttendanceGrid();
  };
  GSP.onAttendanceFilterChange = function(){ populateAttendanceFilters(); renderDayCheckboxes(); };
  function getFilterState(){
    const state = GSP.application && GSP.application.attendanceUIState;
    const current = state && state.grid ? state.grid.get() : null;
    const value = {
      term: document.getElementById('attTermSelect')?.value || 'first',
      month: parseInt(document.getElementById('attMonthSelect')?.value || '1', 10),
      subjectName: document.getElementById('attSubjectSelect')?.value || '',
      classKey: document.getElementById('attClassSelect')?.value || ''
    };
    if (state && state.grid) state.grid.set(value);
    return current ? { ...current, ...value } : value;
  }
  function isAttendanceMonthLocked(db, term, month){
    if (currentAccountType === 'superadmin' || currentRole === 'admin') return false;
    try {
      if (typeof isTermLocked === 'function' && isTermLocked(db, term)) return true;
      if (db.monthLocks && db.monthLocks[monthLockKey(term, month)]) return true;
      if (db.globalLock) return true;
    } catch (e) {}
    return false;
  }
  // STEP 16: bulk grid actions are provided by the injected application service.
  GSP.attMarkDayAll = function(dateISO, mark){ return GSP.application.attendanceGridActions.markDayAll(dateISO, mark); };
  GSP.attMarkSelectedDayAll = function(mark){ return GSP.application.attendanceGridActions.markSelectedDayAll(mark); };
  GSP.attMarkWeekAll = function(weekIndex, mark){ return GSP.application.attendanceGridActions.markWeekAll(weekIndex, mark); };
  GSP.saveAttendanceGrid = function(){ return GSP.application.attendanceGridActions.saveGrid(); };

  function attResolveWeekFilter(){
    // الرصد الأسبوعي: دائماً نعرض أسبوعاً محدداً (لا «كل الأسابيع»)
    if (typeof refreshAttendanceWeekSelect === 'function') {
      try { refreshAttendanceWeekSelect(); } catch (e) {}
    }
    const sel = document.getElementById('attWeekViewSelect');
    const state = GSP.application && GSP.application.attendanceUIState;
    const stored = state && state.grid ? state.grid.weekView() : '1';
    let v = sel ? sel.value : stored;
    if (!v || v === 'all') v = '1';
    if (v === 'current') {
      try {
        const today = new Date();
        const iso = today.toISOString().slice(0, 10);
        const f = getFilterState();
        const cols = getMonthCalendarDays(f.term, f.month) || [];
        const hit = cols.find(c => c.dateISO === iso);
        if (hit && hit.week) return hit.week;
        // أقرب يوم في الشهر الحالي
        const withDate = cols.filter(c => c.hasDate && c.week);
        if (!withDate.length) return 1;
        let best = withDate[0];
        withDate.forEach(c => {
          if (Math.abs((c.dateISO || '').localeCompare(iso)) < Math.abs((best.dateISO || '').localeCompare(iso))) best = c;
        });
        return best.week || 1;
      } catch (e) { return 1; }
    }
    const n = parseInt(v, 10);
    return (n >= 1 && n <= 4) ? n : null;
  }
  GSP.renderAttendanceGrid = function(){
    const db = loadDB(); const att = ensureAttendance(db); const f = getFilterState();
    const empty = document.getElementById('attGridEmpty');
    const table = document.getElementById('attGridTable');
    const head = document.getElementById('attGridHead');
    const body = document.getElementById('attGridBody');
    if (!f.subjectName || !f.classKey) {
      if (empty) { empty.style.display = 'block'; empty.textContent = 'اختر المادة والفصل ثم اضغط «عرض / تحديث الكشف».'; }
      if (table) table.style.display = 'none'; return;
    }
    const allColumns = getMonthCalendarDays(f.term, f.month);
    const weekFilter = attResolveWeekFilter();
    const columns = weekFilter
      ? allColumns.filter(c => Number(c.week) === Number(weekFilter))
      : allColumns;
    const studyDays = getSubjectStudyDays(att, f.subjectName, f.classKey);
    const students = (db.students||[]).filter(st => {
      const key = (typeof classSectionKey === 'function') ? classSectionKey(st.class, st.section) : (st.class||'');
      if (key !== f.classKey) return false;
      if (typeof canAccessStudentGrade === 'function' && !canAccessStudentGrade(f.subjectName, st)) return false;
      return true;
    });
    const subject = (db.subjects||[]).find(s => s.name === f.subjectName);
    const attComp = findAttendanceComponent(subject);
    const maxScore = attComp && attComp.comp ? Number(attComp.comp.maxScore) : 10;
    const locked = isAttendanceMonthLocked(db, f.term, f.month);
    const daysPerWeek = getActiveDayIndices(att).length;
    const attWeekCount = Math.max(1, Math.min(4, Math.ceil((columns.length || daysPerWeek) / Math.max(1, daysPerWeek))));
    const weekIndices = weekFilter ? [weekFilter - 1] : [0, 1, 2, 3];
    const weekNames = ['الأول','الثاني','الثالث','الرابع'];
    let headHtml = '<tr><th rowspan="3">م</th><th rowspan="3">اسم التلميذ</th>';
    weekIndices.forEach(wi => {
      headHtml += `<th colspan="${daysPerWeek}" class="att-week-head">الأسبوع ${weekNames[wi]}`
        + (locked ? '' : `<div class="att-week-actions">`
          + `<button type="button" title="حاضر لجميع أيام الأسبوع" data-action="attMarkWeekAll" data-args='${gspArgs([wi,''])}'>✓ الكل</button>`
          + `<button type="button" title="غائب لجميع أيام الأسبوع" data-action="attMarkWeekAll" data-args='${gspArgs([wi,'غ'])}'>غ الكل</button>`
          + `<button type="button" title="عذر لجميع أيام الأسبوع" data-action="attMarkWeekAll" data-args='${gspArgs([wi,'ع'])}'>ع الكل</button>`
          + `</div>`)
        + `</th>`;
    });
    headHtml += '<th rowspan="3">عدد مرات الغياب</th><th rowspan="3">درجة المواظبة</th></tr><tr>';
    weekIndices.forEach(() => { for (let di=0; di<daysPerWeek; di++) headHtml += `<th>${esc(DAY_LABELS[di]||'')}</th>`; });
    headHtml += '</tr><tr>';
    columns.forEach(col => {
      let actions = '';
      if (!locked && col.hasDate && isColumnStudyDay(col, studyDays) && !col.isHoliday) {
        const iso = esc(col.dateISO);
        actions = `<div class="att-col-actions">`
          + `<button type="button" class="att-q-p" title="حاضر للجميع" data-action="attMarkDayAll" data-args='${gspArgs(['iso',''])}'>✓</button>`
          + `<button type="button" class="att-q-g" title="غائب للجميع" data-action="attMarkDayAll" data-args='${gspArgs(['iso','غ'])}'>غ</button>`
          + `<button type="button" class="att-q-e" title="عذر للجميع" data-action="attMarkDayAll" data-args='${gspArgs(['iso','ع'])}'>ع</button>`
          + `</div>`;
      }
      headHtml += `<th style="font-size:10px;font-weight:500;">${esc(col.dateLabel)}${actions}</th>`;
    });
    headHtml += '</tr>'; head.innerHTML = headHtml;
    let bodyHtml = '';
    students.forEach((st, idx) => {
      // الدرجة وعدد الغياب دائماً على أساس الشهر كاملاً
      const calc = computeStudentAttendanceScore(att, st.id, f.subjectName, f.term, f.month, allColumns, studyDays, maxScore);
      bodyHtml += `<tr><td>${idx+1}</td><td class="att-name">${esc(st.name||'')}</td>`;
      columns.forEach(col => {
        if (!isColumnStudyDay(col, studyDays)) { bodyHtml += '<td class="att-off">—</td>'; return; }
        if (col.isHoliday) { bodyHtml += '<td class="att-holiday">إج</td>'; return; }
        if (!col.hasDate) { bodyHtml += '<td class="att-off">—</td>'; return; }
        const val = att.records[recordKey(st.id, f.subjectName, f.term, f.month, col.dateISO)] || '';
        const cls = val === 'غ' ? 'is-g' : (val === 'ع' ? 'is-e' : '');
        bodyHtml += `<td><input class="att-mark ${cls}" data-sid="${esc(String(st.id))}" data-date="${esc(col.dateISO)}" value="${esc(val)}" maxlength="1" ${locked?'disabled':''} data-event-type="keydown" data-event-action="handleAttendanceInputKeydown" data-event-with-event></td>`;
      });
      bodyHtml += `<td class="att-abs-count">${calc.absent}</td><td class="att-score">${calc.score == null ? '—' : calc.score}</td></tr>`;
    });
    body.innerHTML = bodyHtml || `<tr><td colspan="${2 + columns.length + 2}">لا يوجد طلاب في هذا الفصل.</td></tr>`;
    if (empty) empty.style.display = 'none'; if (table) table.style.display = 'table';
    body.querySelectorAll('input.att-mark').forEach(inp => {
      inp.addEventListener('input', function(){
        let v = (this.value || '').trim();
        if (v === 'g' || v === 'G') v = 'غ'; else if (v === 'e' || v === 'E') v = 'ع';
        if (v !== 'غ' && v !== 'ع' && v !== '') v = '';
        this.value = v; this.classList.toggle('is-g', v === 'غ'); this.classList.toggle('is-e', v === 'ع');
      });
    });
    // شريط الرصد السريع + قائمة الأيام القابلة للرصد (ضمن العرض الحالي)
    try {
      const qBar = document.getElementById('attQuickBar');
      const qSel = document.getElementById('attQuickDaySelect');
      if (qBar && qSel) {
        if (locked) { qBar.style.display = 'none'; }
        else {
          const opts = columns.filter(c => c.hasDate && !c.isHoliday && isColumnStudyDay(c, studyDays));
          qSel.innerHTML = opts.map(c => `<option value="${esc(c.dateISO)}">${esc(c.dateLabel)} — ${esc(DAY_LABELS[c.dayIdx]||c.label||'')}</option>`).join('')
            || '<option value="">— لا أيام متاحة —</option>';
          qBar.style.display = opts.length ? 'flex' : 'none';
        }
      }
    } catch (e) {}
    const status = document.getElementById('attStatusMsg');
    if (status) {
      const weekTxt = weekFilter ? ` — الأسبوع ${weekNames[weekFilter-1]} فقط` : '';
      status.textContent = locked ? '🔒 هذا الشهر مقفول — عرض فقط' : `عرض ${students.length} طالباً${weekTxt} — أيام الحصص: ${studyDays.map(i => DAY_LABELS[i]).join('، ')}`;
      status.style.color = locked ? '#b91c1c' : '#64748b';
    }
  };
  GSP.saveAttendanceGrid = function(){
    const db = loadDB(); const att = ensureAttendance(db); const f = getFilterState();
    if (isAttendanceMonthLocked(db, f.term, f.month)) {
      const status = document.getElementById('attStatusMsg');
      if (status) { status.textContent = '🔒 لا يمكن الحفظ — الشهر مقفول'; status.style.color = '#b91c1c'; }
      return;
    }
    let n = 0; let markedAbsentToday = false; const today = deviceTodayISO();
    document.querySelectorAll('#attGridBody input.att-mark').forEach(inp => {
      const sid = inp.getAttribute('data-sid'); const date = inp.getAttribute('data-date');
      let v = (inp.value || '').trim(); if (v !== 'غ' && v !== 'ع') v = '';
      const k = recordKey(sid, f.subjectName, f.term, f.month, date);
      if (v) { att.records[k] = v; n++; if (v === 'غ' && date === today) markedAbsentToday = true; }
      else delete att.records[k];
    });
    saveDB(db);
    if (att.syncToGrades && currentAccountType === 'superadmin') {
      try { applySyncForFilter(db, f); saveDB(db); } catch (e) { attendanceReportError('attendance sync', e); }
    }
    if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
    const status = document.getElementById('attStatusMsg');
    if (status) { status.textContent = '✅ تم حفظ سجل الغياب' + (n ? ` (${n} علامة)` : ''); status.style.color = '#0b5e42'; }
    renderAttendanceGrid();
    if (markedAbsentToday) notifyIfSkipSuspectsAfterSave({ subjectName: f.subjectName, classKey: f.classKey });
  };
  function applySyncForFilter(db, f){
    const att = ensureAttendance(db);
    const subject = (db.subjects||[]).find(s => s.name === f.subjectName);
    const attComp = findAttendanceComponent(subject); if (!attComp) return 0;
    const columns = getMonthCalendarDays(f.term, f.month);
    const studyDays = getSubjectStudyDays(att, f.subjectName, f.classKey);
    const maxScore = Number(attComp.comp.maxScore);
    const students = (db.students||[]).filter(st => {
      const key = (typeof classSectionKey === 'function') ? classSectionKey(st.class, st.section) : (st.class||'');
      return key === f.classKey;
    });
    let updated = 0;
    students.forEach(st => {
      const calc = computeStudentAttendanceScore(att, st.id, f.subjectName, f.term, f.month, columns, studyDays, maxScore);
      if (calc.score == null) return;
      const existing = (db.grades||[]).find(g => g.studentId === st.id && g.subjectName === f.subjectName && g.term === f.term && g.month === f.month && g.componentIndex === attComp.index);
      if (existing) existing.score = calc.score;
      else { db.grades = db.grades || []; db.grades.push({ studentId:st.id, subjectName:f.subjectName, term:f.term, month:f.month, componentIndex:attComp.index, score:calc.score }); }
      updated++;
    });
    return updated;
  }
  GSP.syncAttendanceScoresToGrades = function(){
    if (currentAccountType !== 'superadmin') {
      const msg = document.getElementById('attSyncMsg');
      if (msg) { msg.textContent = '🔒 الترحيل متاح لرئيس الكنترول فقط'; msg.style.color = '#b91c1c'; }
      return;
    }
    const db = loadDB(); const att = ensureAttendance(db);
    if (!att.syncToGrades) {
      const msg = document.getElementById('attSyncMsg');
      if (msg) { msg.textContent = '⚠️ فعّل خيار الترحيل أولاً'; msg.style.color = '#b91c1c'; }
      return;
    }
    const n = applySyncForFilter(db, getFilterState()); saveDB(db);
    if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
    const msg = document.getElementById('attSyncMsg');
    if (msg) { msg.textContent = `✅ تم ترحيل درجات المواظبة لـ ${n} طالباً`; msg.style.color = '#0b5e42'; }
    if (typeof loadGradesUI === 'function') try { loadGradesUI(); } catch(e) {}
  };
  /** عدد أيام الدراسة التقويمية (بعد خصم العطل ونهاية الأسبوع) — للعرض فقط */
  function countStudyCalendarDays(term, month, weekFilter){
    const columns = getMonthCalendarDays(term, month);
    const seen = new Set();
    columns.forEach(col => {
      if (weekFilter && Number(col.week) !== Number(weekFilter)) return;
      if (!col.hasDate || col.isHoliday || !col.dateISO) return;
      seen.add(col.dateISO);
    });
    return seen.size;
  }

  /** نسبة حضور مرحلة/فصل: مجموع الحضور ÷ مجموع المتوقع عبر كل المواد (داخلي) */
  function attendanceAnalyticsDeps(){
    return {
      getMonthCalendarDays, getSubjectStudyDays, computeStudentAttendanceScore,
      classSectionKey: typeof classSectionKey === 'function' ? classSectionKey : null,
      canAccessStudentGrade: typeof canAccessStudentGrade === 'function' ? canAccessStudentGrade : null,
      getMonthLabels: typeof getMonthLabels === 'function' ? getMonthLabels : null,
      classSectionLabel: typeof classSectionLabel === 'function' ? classSectionLabel : null,
      trendFromRates: ATT_CAL.trendFromRates, loadDB, ensureAttendance, countStudyCalendarDays
    };
  }
  function computeClassAttendanceAgg(db, att, classKey, term, month, weekFilter){
    return GSP.attendanceAnalytics.computeClassAttendanceAgg(db, att, classKey, term, month, weekFilter, attendanceAnalyticsDeps());
  }

  function computeStageAttendanceRate(db, att, term, month, weekFilter){
    return GSP.attendanceAnalytics.computeStageAttendanceRate(db, att, term, month, weekFilter, attendanceAnalyticsDeps());
  }

  function resolvePreviousPeriod(term, month, weekFilter){
    return GSP.attendanceAnalytics.resolvePreviousPeriod(term, month, weekFilter, attendanceAnalyticsDeps());
  }

  const trendFromRates = ATT_CAL.trendFromRates;

  function buildAggregateRows(term, month, weekFilter){
    return GSP.attendanceAnalytics.buildAggregateRows(term, month, weekFilter, attendanceAnalyticsDeps());
  }

  /** سلسلة نسب الحضور للمنحنى حسب نوع الفترة */
  function buildAttendanceTrendSeries(mode){
    return GSP.attendanceAnalytics.buildAttendanceTrendSeries(mode, attendanceAnalyticsDeps());
  }

  function renderAttendanceTrendChartSvg(series){
    const pts = (series && series.points) || [];
    const W = 520, H = 200, padL = 36, padR = 12, padT = 16, padB = 36;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const rates = pts.map(p => p.rate).filter(r => r != null);
    const minR = rates.length ? Math.max(0, Math.min(...rates) - 5) : 0;
    const maxR = rates.length ? Math.min(100, Math.max(...rates) + 5) : 100;
    const span = Math.max(1, maxR - minR);
    const n = Math.max(1, pts.length);
    function xAt(i){ return padL + (n === 1 ? plotW/2 : (i / (n - 1)) * plotW); }
    function yAt(r){ if (r == null) return null; return padT + plotH - ((r - minR) / span) * plotH; }
    let path = '';
    let circles = '';
    pts.forEach((p, i) => {
      const x = xAt(i), y = yAt(p.rate);
      if (y == null) return;
      path += (path ? ' L ' : 'M ') + x.toFixed(1) + ' ' + y.toFixed(1);
      circles += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#2563eb"/><text x="${x.toFixed(1)}" y="${(y-8).toFixed(1)}" text-anchor="middle" font-size="10" fill="#1e3a5f" font-weight="700">${p.rate != null ? p.rate + '%' : '—'}</text>`;
    });
    const labels = pts.map((p, i) => {
      const x = xAt(i);
      return `<text x="${x.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#475569">${esc(p.label)}</text>`;
    }).join('');
    const grid = [0, 0.25, 0.5, 0.75, 1].map(t => {
      const y = padT + plotH * (1 - t);
      const val = Math.round(minR + span * t);
      return `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/><text x="${padL-6}" y="${y+3}" text-anchor="end" font-size="10" fill="#94a3b8">${val}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:560px;display:block;margin:0 auto;background:#fff;border-radius:10px">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
      ${grid}
      ${path ? `<path d="${path}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>` : ''}
      ${circles}
      ${labels}
    </svg>`;
  }

  GSP.refreshAttendanceTrendChart = function(mode){
    const host = document.getElementById('attTrendChartHost');
    if (!host) return;
    if (!mode) {
      const sel = document.getElementById('attTrendModeSelect');
      mode = (sel && sel.value) || 'weekly';
    }
    try {
      const series = buildAttendanceTrendSeries(mode);
      const valid = series.points.filter(p => p.rate != null);
      const titleMap = { weekly: 'منحنى الحضور الأسبوعي (داخل الشهر الحالي)', monthly: 'منحنى الحضور الشهري (داخل الفصل الحالي)', term: 'منحنى الحضور على مدار الفصل الدراسي' };
      let summary = '';
      if (valid.length >= 2) {
        const first = valid[0].rate, last = valid[valid.length - 1].rate;
        const tr = trendFromRates(last, first);
        summary = `من ${first}% إلى ${last}% — <b style="color:${tr.code==='up'?'#166534':tr.code==='down'?'#b91c1c':'#475569'}">${tr.arrow} ${tr.label}</b>`;
      } else if (valid.length === 1) {
        summary = `نقطة واحدة مرصودة: ${valid[0].rate}%`;
      } else {
        summary = 'لا بيانات حضور كافية لرسم المنحنى في هذه الفترة.';
      }
      host.innerHTML = `
        <div style="font-weight:800;color:#1e3a5f;margin-bottom:6px;font-size:13.5px">${titleMap[mode]||'منحنى الحضور'}</div>
        <div style="font-size:12.5px;color:#64748b;margin-bottom:8px">${summary}</div>
        ${renderAttendanceTrendChartSvg(series)}
        <div style="font-size:11px;color:#94a3b8;margin-top:6px;line-height:1.6">يُحسب لحظياً من سجل المواظبة — بدون أرشيف إضافي. نسبة المرحلة = مجموع الحضور ÷ مجموع المتوقع عبر الفصول والمواد.</div>`;
    } catch (e) {
      attendanceReportError('attendance trend chart', e);
      host.innerHTML = '<div style="color:#b91c1c;font-size:13px">تعذّر رسم المنحنى.</div>';
    }
  };

  function averageTeacherClassesAttendance(db, teacher){
    const att = ensureAttendance(db);
    const f = (typeof getFilterState === 'function') ? getFilterState() : null;
    let term = 'first', month = 1;
    try {
      if (f && f.term) term = f.term;
      if (f && f.month) month = f.month;
      else {
        const info = db.schoolInfo || {};
        term = info.term || term;
      }
    } catch(e){}
    const classSet = new Set();
    (teacher.assignments || []).forEach(a => (a.classes || []).forEach(c => classSet.add(c)));
    if (!classSet.size) return null;
    let sum = 0, n = 0;
    classSet.forEach(ck => {
      const agg = computeClassAttendanceAgg(db, att, ck, term, month, null);
      if (agg && agg.rate != null) { sum += agg.rate; n++; }
    });
    if (!n) return null;
    return Math.round((sum / n) * 10) / 10;
  }
  GSP.averageTeacherClassesAttendance = averageTeacherClassesAttendance;

  GSP.printAttendanceAggregateReport = function(mode){
    if (!canManageAttReports()) { attendanceNotify('warning','تقارير الحصر متاحة لرئيس الكنترول ومدير المرحلة فقط.'); return; }
    const db = loadDB(); const f = getFilterState();
    const weekFilter = mode === 'weekly' ? parseInt(document.getElementById('attReportWeekSelect')?.value || '1', 10) : null;
    let data;
    if (mode === 'term') {
      data = GSP.application.attendanceReport.buildTermAggregate(db, f.term);
    } else {
      data = buildAggregateRows(f.term, f.month, weekFilter);
    }
    const info = db.schoolInfo || {};
    const monthLabels = (typeof getMonthLabels === 'function') ? getMonthLabels(f.term) : [];
    const monthName = monthLabels[f.month-1] || ('الشهر ' + f.month);
    const weekNames = ['','الأول','الثاني','الثالث','الرابع'];
    const title = mode === 'weekly'
      ? ('تقرير حصر الحضور الأسبوعي — الأسبوع ' + (weekNames[weekFilter]||weekFilter))
      : (mode === 'term' ? 'تقرير حصر الحضور — الفصل الدراسي' : 'تقرير حصر الحضور الشهري');
    const termLabel = f.term === 'first' ? 'الفصل الدراسي الأول' : 'الفصل الدراسي الثاني';
    const printedBy = (typeof resolvePrintedByName === 'function') ? resolvePrintedByName() : 'المستخدم';
    const printDate = new Date().toLocaleDateString('ar-EG');
    const hindi = (typeof toHindiDigits === 'function') ? toHindiDigits : (v => String(v));
    function trendCell(tr){
      if (!tr || tr.code === 'na') return '—';
      const col = tr.code === 'up' ? '#166534' : (tr.code === 'down' ? '#b91c1c' : '#475569');
      return '<span style="color:'+col+';font-weight:800">'+(tr.arrow||'')+' '+(tr.label||'')+'</span>';
    }
    let tableRows = data.rows.map((r,i) => '<tr>'
      + '<td>'+hindi(i+1)+'</td>'
      + '<td class="right">'+esc(r.classLabel)+'</td>'
      + '<td>'+hindi(r.students)+'</td>'
      + '<td>'+hindi(r.studyDays)+'</td>'
      + '<td><strong>'+(r.rate == null ? '—' : hindi(r.rate)+'%')+'</strong></td>'
      + '<td>'+trendCell(r.trend)+'</td>'
      + '</tr>').join('');
    if (!data.rows.length) tableRows = '<tr><td colspan="6">لا توجد بيانات حضور قابلة للحصر في هذه الفترة.</td></tr>';
    const t = data.totals;
    const totalRow = data.rows.length
      ? ('<tr class="total-row"><td colspan="2">إجمالي المرحلة</td><td>'+hindi(t.students)+'</td><td>'+hindi(t.studyDays)+'</td><td>'+(t.rate==null?'—':hindi(t.rate)+'%')+'</td><td>'+trendCell(t.trend)+'</td></tr>')
      : '';
    const metaBarHtml = [
      '<span><strong>الشهر:</strong> '+esc(monthName)+'</span>',
      '<span><strong>أيام الدراسة:</strong> '+hindi(data.studyDays||0)+'</span>',
      '<span>بدون أسماء طلاب (حصر حسب الفصل)</span>'
    ].join('');
    const letterhead = (typeof buildUnifiedLetterhead === 'function')
      ? buildUnifiedLetterhead({
          title: title,
          subtitleRight: monthName,
          subtitleLeft: termLabel,
          printedBy,
          printDate,
          governorate: info.governorate || '',
          educationAdmin: info.educationAdmin || '',
          schoolName: info.schoolName || '',
          academicYear: info.academicYear || '',
          metaBarHtml
        })
      : '<div class="att-print-header"><div class="att-print-title">'+esc(title)+'</div></div>';
    const footer = (typeof buildUnifiedFooter === 'function')
      ? buildUnifiedFooter({ captions: ['مسؤول المتابعة', 'وكيل شئون الطلاب', 'مدير المرحلة / مدير المدرسة'] })
      : '';
    const html = '<div class="att-print-page detailed-sheet-page">'
      + letterhead
      + '<table class="att-agg-table"><thead><tr>'
      + '<th style="width:8mm;">م</th><th>الفصل</th><th>عدد الطلاب</th><th>أيام الدراسة</th><th>نسبة الحضور</th><th>الاتجاه</th>'
      + '</tr></thead><tbody>'+tableRows+totalRow+'</tbody></table>'
      + footer
      + '<div style="text-align:center;font-size:10px;color:#64748b;margin-top:4mm;line-height:1.7">'
      + 'نسبة الحضور تُحسب من مجموع الحضور عبر المواد ÷ مجموع الأيام المتوقعة داخلياً (لا تُعرض). '
      + 'أيام الدراسة = أيام الفترة بعد خصم نهاية الأسبوع والإجازات. الاتجاه مقارنة بالفترة السابقة مباشرة. العذر يُحسب حضوراً.'
      + '</div></div>';
    const area = document.getElementById('printAttendanceArea'); if (!area) return;
    clearInactivePrintAreas('printAttendanceArea');
    area.innerHTML = html;
    if (typeof fitPrintPagesToA4 === 'function') fitPrintPagesToA4(area, '.att-print-page');
    const prevTitle = document.title; document.title = title; window.print();
    setTimeout(() => { document.title = prevTitle; clearAllPrintAreas(); }, 800);
    try { if (typeof refreshAttendanceTrendChart === 'function') refreshAttendanceTrendChart(mode === 'weekly' ? 'weekly' : (mode === 'term' ? 'term' : 'monthly')); } catch(e){}
  };

  // قبل أي طباعة: فرّغ مناطق الطباعة الأخرى حتى لا يُطبع كشف سابق (درجات/بطاقات) مع الكشف الحالي
  function clearInactivePrintAreas(activeId) {
    ['printCardsArea', 'printGradeSheetArea', 'printAttendanceArea'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id !== activeId) el.innerHTML = '';
    });
  }
  function clearAllPrintAreas() {
    ['printCardsArea', 'printGradeSheetArea', 'printAttendanceArea'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
  }
  GSP.clearInactivePrintAreas = clearInactivePrintAreas;
  GSP.clearAllPrintAreas = clearAllPrintAreas;

    // أمان عام: بعد إغلاق حوار الطباعة نفرّغ كل مناطق الطباعة حتى لا تختلط في الطباعة التالية
    if (typeof window !== 'undefined' && !GSP._printAreasAfterPrintBound) {
      GSP._printAreasAfterPrintBound = true;
      window.addEventListener('afterprint', function() {
        try { if (typeof clearAllPrintAreas === 'function') clearAllPrintAreas(); } catch (e) {}
      });
    }

  GSP.buildAttendanceSheetPagesHtml = function(db, att, f, blank){
    if (!f || !f.subjectName || !f.classKey) return '';
    const columns = getMonthCalendarDays(f.term, f.month);
    const studyDays = getSubjectStudyDays(att, f.subjectName, f.classKey);
    const students = (db.students||[]).filter(st => {
      const key = (typeof classSectionKey === 'function') ? classSectionKey(st.class, st.section) : (st.class||'');
      if (key !== f.classKey) return false;
      if (typeof canAccessStudentGrade === 'function' && !canAccessStudentGrade(f.subjectName, st)) return false;
      return true;
    });
    const subject = (db.subjects||[]).find(s => s.name === f.subjectName);
    const attComp = findAttendanceComponent(subject);
    const maxScore = attComp && attComp.comp ? Number(attComp.comp.maxScore) : 10;
    const info = db.schoolInfo || {};
    const monthLabels = (typeof getMonthLabels === 'function') ? getMonthLabels(f.term) : [];
    const monthName = monthLabels[f.month-1] || ('الشهر ' + f.month);
    const classLabel = (typeof classSectionLabel === 'function') ? classSectionLabel(f.classKey) : f.classKey;
    const daysPerWeek = getActiveDayIndices(att).length;
    const attWeekCount = 4;
    const scopeWeeksAtt = (typeof getPeriodWeekCount === 'function') ? getPeriodWeekCount(f.term, f.month - 1) : 4;
    let teacherName = (currentAccountType === 'teacher' && currentTeacher) ? (currentTeacher.name||'') : '';
    if (!teacherName) {
      try {
        const t = (db.teachers || []).find(tch => (tch.assignments || []).some(a =>
          a.subjectName === f.subjectName && (a.classes || []).includes(f.classKey)));
        if (t) teacherName = t.name || '';
      } catch (e) {}
    }
    const pages = [students];
    const escFn = (typeof esc === 'function') ? esc : (typeof escapeHtml === 'function' ? escapeHtml : (s => String(s||'')));
    const dayNamesShort = (typeof DAY_NAMES_SHORT !== 'undefined') ? DAY_NAMES_SHORT : ['أحد','إثن','ثلا','أرب','خمي','جمع','سبت'];

    return pages.map((pageStudents, pi) => {
      let thead = `<tr><th rowspan="3" class="att-fixed" style="width:7mm;">م</th><th rowspan="3" class="att-fixed" style="width:38mm;">اسم التلميذ</th>`;
      for (let w=1;w<=4;w++) thead += `<th colspan="${daysPerWeek}" class="att-week-${w}${((typeof isWeekExcluded==='function'?isWeekExcluded(f.term,f.month-1,w-1):(w>scopeWeeksAtt)))?' week-out-of-scope':''}">الأسبوع ${['الأول','الثاني','الثالث','الرابع'][w-1]}${((typeof isWeekExcluded==='function'?isWeekExcluded(f.term,f.month-1,w-1):(w>scopeWeeksAtt)))?' (خارج الرصد)':''}</th>`;
      thead += `<th rowspan="3" class="att-sum-abs"><span class="att-v">عدد أيام الغياب</span></th>`;
      thead += `<th rowspan="3" class="att-sum-rate"><span class="att-v">نسبة الحضور %</span></th>`;
      thead += `<th rowspan="3" class="att-sum-score"><span class="att-v">درجة المواظبة</span></th></tr><tr>`;
      for (let w=0;w<4;w++) for (let di=0;di<daysPerWeek;di++) {
        const col = columns[w * daysPerWeek + di];
        const dn = col ? (col.label || '') : '';
        thead += `<th class="att-day-${w+1}"><span class="att-v">${escFn(dn)}</span></th>`;
      }
      thead += `</tr><tr>`;
      for (let w=0;w<4;w++) for (let di=0;di<daysPerWeek;di++) {
        const col = columns[w * daysPerWeek + di];
        const dd = col ? (col.dateLabel || (col.dateISO ? String(col.dateISO).slice(-2) : '—')) : '—';
        thead += `<th class="att-day-${w+1}"><span class="att-v">${escFn(dd)}</span></th>`;
      }
      thead += `</tr>`;

      let tbody = '';
      const emptySums = '<td class="att-sum"></td><td class="att-rate"></td><td class="att-score-print"></td>';
      const rows = pageStudents.length ? pageStudents : [{}];
      rows.forEach((st, idx) => {
        const serial = idx + 1;
        if (!st.id) {
          tbody += `<tr><td>${serial}</td><td class="name"></td>`;
          columns.forEach(col => {
            if (!isColumnStudyDay(col, studyDays)) tbody += '<td class="off-day"></td>';
            else if (col.isHoliday) tbody += '<td class="holiday-day">إج</td>';
            else if (col.outOfScope) tbody += '<td class="week-out-of-scope"></td>';
            else tbody += '<td></td>';
          });
          tbody += emptySums + '</tr>'; return;
        }
        const calc = blank
          ? { absent: '', score: '', rate: '' }
          : computeStudentAttendanceScore(att, st.id, f.subjectName, f.term, f.month, columns, studyDays, maxScore);
        tbody += `<tr><td>${serial}</td><td class="name">${escFn(st.name||'')}</td>`;
        columns.forEach(col => {
          if (!isColumnStudyDay(col, studyDays)) { tbody += '<td class="off-day"></td>'; return; }
          if (col.isHoliday) { tbody += '<td class="holiday-day">إج</td>'; return; }
          if (col.outOfScope) { tbody += '<td class="week-out-of-scope"></td>'; return; }
          if (blank || !col.hasDate) { tbody += '<td></td>'; return; }
          const v = att.records[recordKey(st.id, f.subjectName, f.term, f.month, col.dateISO)] || '';
          let cellSym = '✓';
          if (v === 'غ') cellSym = 'غ';
          else if (v === 'ع') cellSym = 'ع';
          else if (v === '✓' || v === 'ح' || v === '') cellSym = '✓';
          tbody += `<td>${escFn(cellSym)}</td>`;
        });
        const absVal = blank ? '' : (calc.absent != null ? calc.absent : '');
        const rateVal = blank ? '' : (calc.rate == null || calc.rate === '' ? '' : calc.rate);
        const scoreVal = blank ? '' : (calc.score == null || calc.score === '' ? '' : calc.score);
        tbody += `<td class="att-sum">${absVal}</td><td class="att-rate">${rateVal}</td><td class="att-score-print">${scoreVal}</td></tr>`;
      });
      if (blank && pageStudents.length === 0) {
        for (let i=1;i<=40;i++) {
          tbody += `<tr><td>${i}</td><td class="name"></td>`;
          columns.forEach(col => {
            if (!isColumnStudyDay(col, studyDays)) tbody += '<td class="off-day"></td>';
            else if (col.isHoliday) tbody += '<td class="holiday-day">إج</td>';
            else if (col.outOfScope) tbody += '<td class="week-out-of-scope"></td>';
            else tbody += '<td></td>';
          });
          tbody += emptySums + '</tr>';
        }
      }
      const termLabelAtt = f.term === 'first' ? 'الفصل الدراسي الأول' : 'الفصل الدراسي الثاني';
      const printedByAtt = (typeof resolvePrintedByName === 'function') ? resolvePrintedByName() : (teacherName || 'المستخدم');
      const printDateAtt = new Date().toLocaleDateString('ar-EG');
      const stageLblAtt = (typeof getActiveStageEntityLabel === 'function' && getActiveStageEntityLabel()) ? getActiveStageEntityLabel() : '';
      const metaBarAtt = [
        `<span><strong>الفصل:</strong> ${escFn(classLabel)}</span>`,
        `<span><strong>المادة:</strong> ${escFn(f.subjectName)}${teacherName ? ' — <strong>المعلم:</strong> ' + escFn(teacherName) : ''}</span>`,
        `<span><strong>الشهر:</strong> ${escFn(monthName)}</span>`
      ].join('');
      const letterheadAtt = (typeof buildUnifiedLetterhead === 'function')
        ? buildUnifiedLetterhead({
            title: 'بيان المواظبة اليومى',
            subtitleRight: monthName,
            subtitleLeft: termLabelAtt,
            printedBy: printedByAtt,
            printDate: printDateAtt,
            governorate: info.governorate || '',
            educationAdmin: info.educationAdmin || '',
            schoolName: info.schoolName || '',
            academicYear: info.academicYear || '',
            metaBarHtml: metaBarAtt
          })
        : `<div class="att-print-header"><div class="att-print-title">بيان المواظبة اليومى</div>
            <div class="att-print-meta">${info.schoolName ? escFn(info.schoolName) + ' — ' : ''}${stageLblAtt ? escFn(stageLblAtt) + ' — ' : ''}العام الدراسي (${escFn(info.academicYear||'')}) — فصل (${escFn(classLabel)}) — المادة: ${escFn(f.subjectName)} — شهر ${escFn(monthName)} — ${termLabelAtt}</div></div>`;
      const footerAtt = (typeof buildUnifiedFooter === 'function')
        ? buildUnifiedFooter({ captions: [
            'معلم المادة' + (teacherName ? ': ' + teacherName : ''),
            'وكيل الصف',
            'مدير المرحلة'
          ] })
        : `<div class="att-print-footer"><div class="sign"><div>معلم المادة${teacherName ? ': '+escFn(teacherName) : ''}</div><div class="line"></div></div><div class="sign"><div>وكيل الصف</div><div class="line"></div></div><div class="sign"><div>مدير المرحلة</div><div class="line"></div></div></div>`;
      return `<div class="att-print-page detailed-sheet-page">
        ${letterheadAtt}
        <table class="att-print-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>
        ${footerAtt}
        <div style="text-align:center;font-size:10px;color:#64748b;margin-top:4mm;">رموز: ✓=حضور | غ=غياب | ع=عذر | إج=إجازة | المظلّل=ليس يوم حصة — نسبة الحضور = (حضور ÷ الأيام المتوقعة) × 100</div>
      </div>`;
    }).join('');
  };

  GSP.printAttendanceSheet = function(blank, filterOverride){
    const db = loadDB(); const att = ensureAttendance(db);
    const f = filterOverride || getFilterState();
    const area = document.getElementById('printAttendanceArea'); if (!area) return;
    if (!f.subjectName || !f.classKey) { attendanceNotify('warning','اختر المادة والفصل أولاً'); return; }
    clearInactivePrintAreas('printAttendanceArea');
    area.innerHTML = GSP.buildAttendanceSheetPagesHtml(db, att, f, !!blank);
    // توزيع ارتفاع الصفوف لملء الصفحة + التذييل بدون فراغات كبيرة
    try { fitPrintPageFillHeight(area, '.att-print-page'); } catch (e) { attendanceReportError('attendance print fit', e); }
    const prevTitle = document.title;
    document.title = 'بيان المواظبة اليومى';
    setTimeout(() => {
      window.print();
      setTimeout(() => { document.title = prevTitle; clearAllPrintAreas(); }, 800);
    }, 80);
  };


  // ===== Teacher Daily Attendance feature extracted in STEP 11 =====
  // ===== تصدير / استيراد حزمة المعلم (للنقل بين الأجهزة بدون نت) =====
  function tdaSafeFilePart(s){
    return String(s || '')
      .replace(/[\/\\:\*\?"<>\|]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'معلم';
  }
  function tdaStampForFile(){
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function collectTeacherScopeKeys(teacher){
    const subjectNames = new Set();
    const classKeys = new Set();
    const pairs = []; // subject||class
    (teacher.assignments || []).forEach(a => {
      if (!a || !a.subjectName) return;
      subjectNames.add(a.subjectName);
      (a.classes || []).forEach(c => {
        classKeys.add(c);
        pairs.push(a.subjectName + '||' + c);
      });
    });
    return { subjectNames, classKeys, pairs: new Set(pairs) };
  }
  function gradeBelongsToTeacher(g, teacher, studentsById){
    if (!g || !teacher) return false;
    const scope = collectTeacherScopeKeys(teacher);
    if (!scope.subjectNames.has(g.subjectName)) return false;
    const st = studentsById.get(String(g.studentId));
    if (!st) return scope.subjectNames.has(g.subjectName); // keep if subject matches when student missing
    const key = (typeof classSectionKey === 'function') ? classSectionKey(st.class, st.section) : (st.class || '');
    // if teacher has explicit class assignments for this subject, require class match
    const hasAnyClassForSubj = (teacher.assignments || []).some(a => a.subjectName === g.subjectName && (a.classes || []).length);
    if (hasAnyClassForSubj) {
      return (teacher.assignments || []).some(a => a.subjectName === g.subjectName && (a.classes || []).includes(key));
    }
    return true;
  }
  function attendanceRecordBelongsToTeacher(recKey, teacher){
    // key: studentId|subject|term|month|date
    const parts = String(recKey || '').split('|');
    if (parts.length < 2) return false;
    const subject = parts[1];
    const scope = collectTeacherScopeKeys(teacher);
    return scope.subjectNames.has(subject);
  }
  GSP.exportTeacherMyDataPackage = function(){
    if (currentAccountType !== 'teacher' || !currentTeacher) {
      attendanceNotify('warning','تصدير درجاتي متاح للمعلم فقط.');
      return;
    }
    try {
      const db = loadDB();
      const teacher = currentTeacher;
      const studentsById = new Map((db.students || []).map(s => [String(s.id), s]));
      const grades = (db.grades || []).filter(g => gradeBelongsToTeacher(g, teacher, studentsById));
      const att = (db.attendance && db.attendance.records) ? db.attendance.records : {};
      const attOut = {};
      Object.keys(att).forEach(k => {
        if (attendanceRecordBelongsToTeacher(k, teacher)) attOut[k] = att[k];
      });
      const subjectDays = {};
      const srcDays = (db.attendance && db.attendance.subjectDays) || {};
      const scope = collectTeacherScopeKeys(teacher);
      Object.keys(srcDays).forEach(k => {
        const subj = k.split('||')[0];
        if (scope.subjectNames.has(subj)) subjectDays[k] = srcDays[k];
      });

      const stamp = tdaStampForFile();
      const teacherPart = tdaSafeFilePart(teacher.name || teacher.id || 'معلم');
      const fileName = 'درجاتي-' + teacherPart + '-الكل-' + stamp + '.json';

      const payload = {
        format: 'GradeSystemPro-TeacherPackage',
        version: 1,
        appVersion: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''),
        exportedAt: new Date().toISOString(),
        stageId: (typeof currentStageId !== 'undefined' ? currentStageId : null),
        teacher: {
          id: teacher.id || null,
          name: teacher.name || '',
          assignments: teacher.assignments || []
        },
        grades: grades,
        attendanceRecords: attOut,
        subjectDays: subjectDays,
        meta: {
          gradesCount: grades.length,
          attendanceCount: Object.keys(attOut).length,
          fileNameSuggested: fileName
        }
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch(e) {} }, 1500);

      const msg =
        '✅ تم تنزيل ملف درجاتك بنجاح.\n\n' +
        'اسم الملف:\n' + fileName + '\n\n' +
        'عدد سجلات الدرجات: ' + grades.length + '\n' +
        'عدد سجلات الغياب: ' + Object.keys(attOut).length + '\n\n' +
        'ابحث في مجلد «التنزيلات» على هاتفك عن كلمة: درجاتي\n' +
        'ثم انقل الملف للجهاز المتصل بالنت واستورده من زر «استيراد درجاتي».';
      attendanceNotify('success', msg);
    } catch (e) {
      attendanceReportError('teacher package export', e, 'تعذر التصدير: ' + (e && e.message ? e.message : e));
    }
  };

  GSP.triggerImportTeacherMyDataPackage = function(){
    if (currentAccountType !== 'teacher' || !currentTeacher) {
      attendanceNotify('warning','استيراد درجاتي متاح للمعلم فقط.');
      return;
    }
    const inp = document.getElementById('teacherImportFileInput');
    if (!inp) { attendanceNotify('error','عنصر الاستيراد غير موجود.'); return; }
    inp.value = '';
    inp.click();
  };

  GSP.importTeacherMyDataPackage = function(ev){
    if (currentAccountType !== 'teacher' || !currentTeacher) {
      attendanceNotify('warning','استيراد درجاتي متاح للمعلم فقط.');
      return;
    }
    const file = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(){
      try {
        const raw = String(reader.result || '');
        const data = JSON.parse(raw);
        if (!data || data.format !== 'GradeSystemPro-TeacherPackage') {
          attendanceNotify('error','الملف ليس حزمة درجات معلم صالحة.');
          return;
        }
        const pkgTeacherId = data.teacher && data.teacher.id;
        const myId = currentTeacher.id;
        if (pkgTeacherId && myId && String(pkgTeacherId) !== String(myId)) {
          const ok = await showConfirm(
            'تحذير: الملف مُصدَّر لمعلم آخر (' + (data.teacher.name || pkgTeacherId) + ').\n' +
            'هل تريد المتابعة على مسؤوليتك؟\n(يُفضّل الاستيراد لنفس حساب المعلم فقط)'
          );
          if (!ok) return;
        }

        const db = loadDB();
        db.grades = db.grades || [];
        db.attendance = db.attendance || { records:{}, subjectDays:{}, holidays:[], saturdayEnabled:false, syncToGrades:false };
        db.attendance.records = db.attendance.records || {};
        db.attendance.subjectDays = db.attendance.subjectDays || {};

        const studentsById = new Map((db.students || []).map(s => [String(s.id), s]));
        const incomingGrades = Array.isArray(data.grades) ? data.grades : [];
        let gAdded = 0, gUpdated = 0, gSkipped = 0;
        incomingGrades.forEach(ng => {
          if (!ng || !gradeBelongsToTeacher(ng, currentTeacher, studentsById)) { gSkipped++; return; }
          const idx = db.grades.findIndex(g =>
            g.studentId === ng.studentId &&
            g.subjectName === ng.subjectName &&
            g.term === ng.term &&
            g.month === ng.month &&
            g.componentIndex === ng.componentIndex
          );
          if (idx >= 0) {
            db.grades[idx].score = ng.score;
            gUpdated++;
          } else {
            db.grades.push({
              studentId: ng.studentId,
              subjectName: ng.subjectName,
              term: ng.term,
              month: ng.month,
              componentIndex: ng.componentIndex,
              score: ng.score
            });
            gAdded++;
          }
        });

        const incomingAtt = data.attendanceRecords || {};
        let aCount = 0;
        Object.keys(incomingAtt).forEach(k => {
          if (!attendanceRecordBelongsToTeacher(k, currentTeacher)) return;
          db.attendance.records[k] = incomingAtt[k];
          aCount++;
        });

        const incomingDays = data.subjectDays || {};
        Object.keys(incomingDays).forEach(k => {
          const subj = k.split('||')[0];
          const scope = collectTeacherScopeKeys(currentTeacher);
          if (scope.subjectNames.has(subj)) db.attendance.subjectDays[k] = incomingDays[k];
        });

        saveDB(db);
        if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
        try { if (typeof loadGradesUI === 'function') loadGradesUI(); } catch(e) {}
        try { if (typeof updateDashboard === 'function') updateDashboard(); } catch(e) {}

        attendanceNotify('success',
          '✅ تم استيراد حزمة درجاتك.\n\n' +
          'درجات: إضافة ' + gAdded + ' / تحديث ' + gUpdated + (gSkipped ? (' / تخطي ' + gSkipped) : '') + '\n' +
          'سجلات غياب: ' + aCount + '\n\n' +
          'مع وجود الإنترنت ستُرفع للسحابة تلقائياً عبر المزامنة.'
        );
      } catch (e) {
        attendanceReportError('teacher package import', e, 'فشل قراءة الملف: ' + (e && e.message ? e.message : e));
      }
    };
    reader.onerror = function(){ attendanceNotify('error','تعذر قراءة الملف من الجهاز.'); };
    reader.readAsText(file, 'utf-8');
  };

  GSP.openTeacherDailyAttendance = function(){
    if (currentAccountType !== 'teacher' || !currentTeacher) {
      attendanceNotify('warning','تسجيل حضور اليوم متاح للمعلم فقط من لوحة التحكم.');
      return;
    }
    const modal = document.getElementById('teacherDailyAttModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.classList.add('tda-open');
    document.body.style.overflow = 'hidden';
    // على الموبايل: ابدأ بفلاتر مطوية لإظهار أكبر عدد بطاقات
    try {
      const toolbar = document.getElementById('tdaToolbar');
      if (toolbar) toolbar.classList.remove('filters-open');
      const btn = document.getElementById('tdaFilterSummary');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    } catch (e) {}
    const tda = (GSP.features && GSP.features.attendance && GSP.features.attendance.teacherDaily)
      || GSP.tdaTeacherDaily;
    tda?.tdaPopulateFilters?.();
    tda?.renderTeacherDailyCards?.();
    tda?.tdaUpdateFilterSummary?.();
    tda?.tdaStatus?.('', true);
  };
  GSP.closeTeacherDailyAttendance = function(){
    const modal = document.getElementById('teacherDailyAttModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
    document.body.classList.remove('tda-open');
    document.body.style.overflow = '';
    try { if (typeof updateDashboard === 'function') updateDashboard(); } catch(e) {}
    try { if (typeof activateTab === 'function') activateTab('dashboard'); } catch(e) {}
  };

  // عند حساب المواظبة: تجاهل الأيام قبل addedAt للطالب
  const _origCompute = computeStudentAttendanceScore;
  computeStudentAttendanceScore = function(att, studentId, subjectName, term, month, columns, studyDays, maxScore, weekFilter){
    const db = loadDB();
    const st = (db.students||[]).find(s => String(s.id) === String(studentId));
    const addedAt = st && st.addedAt;
    const filtered = addedAt ? columns.filter(c => !c.dateISO || c.dateISO >= addedAt) : columns;
    return _origCompute(att, studentId, subjectName, term, month, filtered, studyDays, maxScore, weekFilter);
  };
  // الغياب يخصم فقط على «غ» — ✓ و ع و الفارغ حضور
  // (المنطق الأصلي يفحص === 'غ' فقط فهو متوافق)


  GSP.loadAttendanceUI = function(){
    try {
      populateAttendanceFilters(); renderDayCheckboxes(); loadAttendanceAdminPanel();
      const termSel = document.getElementById('attTermSelect');
      if (termSel && !termSel._attBound) { termSel._attBound = true; termSel.addEventListener('change', function(){ populateAttendanceFilters(); renderDayCheckboxes(); }); }
      const subjSel = document.getElementById('attSubjectSelect');
      if (subjSel && !subjSel._attBound) { subjSel._attBound = true; subjSel.addEventListener('change', function(){ refreshAttendanceClassOptions(); renderDayCheckboxes(); }); }
      const classSel = document.getElementById('attClassSelect');
      if (classSel && !classSel._attBound) { classSel._attBound = true; classSel.addEventListener('change', function(){ renderDayCheckboxes(); }); }
    } catch (e) { attendanceReportError('loadAttendanceUI', e); }
  };

  // [إصلاح 2026-09-04] هذه الدوال الأربعة كانت معرَّفة هنا فقط داخل الـ IIFE الخاص بهذا الملف ولم
  // تكن مُصدَّرة على window إطلاقاً، رغم أن js/v20-smart-ux.js يستدعيها بفحص دفاعي
  // (typeof X === 'function') يفترض أنها قد تكون متاحة عالمياً. عمليًا كانت الشرطية دايماً false،
  // فكانت ميزة "لمحة الحضور الذكية" في تبويب الطلاب تعمل بصمت في وضع معطَّل (تُرجع null/[] دائماً)
  // بدل حساب نسبة الحضور الفعلية. التصدير هنا لا يغيّر أي سلوك قائم فعلاً، فقط يُفعِّل المسار
  // البديل المكتوب أصلاً في v20-smart-ux.js.
  GSP.collectSchoolHolidaySet = collectSchoolHolidaySet;
  GSP.recordKey = recordKey;
  GSP.parseISO = parseISO;
  GSP.toISO = toISO;
  GSP.ensureAttendance = ensureAttendance;
  GSP.getMonthCalendarDays = getMonthCalendarDays;
  GSP.getSubjectStudyDays = getSubjectStudyDays;
  // STEP 55 hotfix: expose the grid filter reader through the legacy capability boundary.
  // The function is intentionally kept private for implementation, but the composition
  // root needs a stable capability reference when creating attendance grid actions.
  GSP.getFilterState = getFilterState;
  GSP.computeStudentAttendanceScore = computeStudentAttendanceScore;
  // Required by attendance-legacy-boundary / composition
  GSP.isAttendanceMonthLocked = isAttendanceMonthLocked;
  GSP.subjectDaysKey = subjectDaysKey;
  GSP.deviceTodayISO = deviceTodayISO;
  GSP.countStudyCalendarDays = countStudyCalendarDays;
})();
