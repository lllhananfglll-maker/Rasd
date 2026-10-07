/*
 * Teacher Daily Attendance feature.
 * STEP 11: moves the teacher-facing daily attendance workflow out of
 * attendance-system.js while keeping the existing GSP API stable.
 */
(function (root) {
  'use strict';

  const GSP = root.GSP || (root.GSP = {});
  // STEP 14: the feature receives its capabilities from the composition root.
  const attendanceService = GSP.application && GSP.application.attendance;
  const ctx = GSP.application && GSP.application.attendanceContext;
  if (!attendanceService || !ctx) throw new Error('Teacher Daily Attendance: attendance application is not composed');

  const esc = ctx.escapeHtml;
  const currentTeacher = ctx.currentTeacher;
  const loadDB = () => attendanceService.getDatabase();
  const saveDB = (...args) => attendanceService.saveDatabase(...args);
  const ensureAttendance = (db) => attendanceService.getAttendanceState().attendance || db.attendance;
  const recordKey = ctx.recordKey;
  const parseISO = ctx.parseISO;
  const toISO = ctx.toISO;
  const classSectionKey = ctx.classSectionKey;
  const classSectionLabel = ctx.classSectionLabel;
  const canAccessStudentGrade = ctx.canAccessStudentGrade;
  const scheduleCloudPush = ctx.scheduleCloudPush;
  const getMonthCalendarDays = ctx.getMonthCalendarDays;
  const getSubjectStudyDays = ctx.getSubjectStudyDays;
  const isAttendanceMonthLocked = ctx.isAttendanceMonthLocked;
  const collectSchoolHolidaySet = ctx.collectSchoolHolidaySet;
  const getMonthLabels = ctx.getMonthLabels;
  const gspArgs = ctx.gspArgs;

function todayISO(){
  return ctx.todayISO();
}
function addDaysISO(iso, days){
  const d = parseISO(iso); if (!d) return iso;
  d.setDate(d.getDate() + days);
  return toISO(d);
}
function findTermMonthForDate(iso){
  if (!iso) return null;
  for (const term of ['first','second']) {
    let n = 2;
    try { n = ((typeof getMonthLabels === 'function') ? getMonthLabels(term) : ['','']).length || 2; } catch(e){}
    for (let m = 1; m <= n; m++) {
      const cols = getMonthCalendarDays(term, m);
      if (cols.some(c => c.dateISO === iso)) return { term, month: m };
    }
  }
  return null;
}
function isDateInSubjectSchedule(att, subjectName, classKey, iso){
  const d = parseISO(iso); if (!d) return true;
  const studyDays = getSubjectStudyDays(att, subjectName, classKey);
  // map JS getDay to dayIdx in DAY_LABELS: 0 Sun..4 Thu, 6 Sat -> idx 5
  const js = d.getDay();
  let dayIdx = -1;
  if (js >= 0 && js <= 4) dayIdx = js;
  else if (js === 6) dayIdx = 5;
  if (dayIdx < 0) return false; // Friday
  return studyDays.indexOf(dayIdx) >= 0;
}
function tdaDateAllowed(iso){
  const service = GSP.application && GSP.application.attendance;
  if (service && typeof service.validateDate === 'function') {
    return service.validateDate(iso);
  }
  return { ok:false, reason:'خدمة الحضور غير متاحة حالياً' };
}
function tdaEnsureStudentAddedAt(st, iso){
  // إذا أُضيف الطالب حديثاً بلا تاريخ، ثبّت يوم ظهوره الأول في الرصد
  if (!st.addedAt && iso) {
    st.addedAt = iso;
    return true;
  }
  return false;
}
function tdaPopulateFilters(){
  const db = loadDB();
  const subjSel = document.getElementById('tdaSubjectSelect');
  const classSel = document.getElementById('tdaClassSelect');
  const dateInp = document.getElementById('tdaDateInput');
  if (!subjSel || !classSel || !dateInp) return;
  if (!dateInp.value) dateInp.value = todayISO();
  dateInp.max = todayISO();
  dateInp.min = addDaysISO(todayISO(), -31);

  let subjects = db.subjects || [];
  const teacher = currentTeacher();
  if (teacher) {
    const names = new Set((teacher.assignments||[]).map(a => a.subjectName));
    subjects = subjects.filter(s => names.has(s.name));
  }
  const prevS = subjSel.value;
  subjSel.innerHTML = subjects.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('') || '<option value="">— لا توجد مواد —</option>';
  if (prevS && subjects.some(s => s.name === prevS)) subjSel.value = prevS;

  const subjectName = subjSel.value;
  let classes = [];
  if (teacher && subjectName) {
    (teacher.assignments||[]).forEach(a => {
      if (a.subjectName === subjectName) (a.classes||[]).forEach(c => { if (classes.indexOf(c) < 0) classes.push(c); });
    });
  } else {
    classes = db.classes || [];
  }
  const prevC = classSel.value;
  classSel.innerHTML = classes.map(c => {
    const label = (typeof classSectionLabel === 'function') ? classSectionLabel(c) : c;
    return `<option value="${esc(c)}">${esc(label)}</option>`;
  }).join('') || '<option value="">— لا توجد فصول —</option>';
  if (prevC && classes.indexOf(prevC) >= 0) classSel.value = prevC;
}
function tdaGetState(){
  const state = GSP.application && GSP.application.attendanceUIState;
  const value = {
    subjectName: document.getElementById('tdaSubjectSelect')?.value || '',
    classKey: document.getElementById('tdaClassSelect')?.value || '',
    dateISO: document.getElementById('tdaDateInput')?.value || todayISO()
  };
  if (state && state.teacherDaily) state.teacherDaily.set(value);
  return value;
}
function tdaSetBanner(type, msg){
  const el = document.getElementById('tdaBanner');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
  el.style.display = 'block';
  el.className = 'tda-banner ' + (type || 'info');
  el.textContent = msg;
}
function tdaStatus(msg, ok){
  const el = document.getElementById('tdaSaveStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = ok === false ? '#b91c1c' : '#0b5e42';
}
function tdaMarkSymbol(val){
  if (val === 'غ') return 'غ';
  if (val === 'ع') return 'ع';
  return '✓'; // present default
}
function tdaWriteMark(studentId, subjectName, term, month, dateISO, mark){
  const service = GSP.application && GSP.application.attendance;
  if (!service || typeof service.writeMark !== 'function') return false;
  service.writeMark(studentId, subjectName, term, month, dateISO, mark);
  return true;
}
function tdaReadMark(att, studentId, subjectName, term, month, dateISO){
  const v = att.records[recordKey(studentId, subjectName, term, month, dateISO)] || '';
  if (v === 'غ') return 'absent';
  if (v === 'ع') return 'excuse';
  return 'present';
}
GSP.tdaSetStudentMark = function(studentId, mark){
  const st = tdaGetState();
  const gate = tdaDateAllowed(st.dateISO);
  if (!gate.ok && !gate.locked) { tdaStatus(gate.reason, false); return; }
  if (gate.locked || gate.holiday) { tdaStatus(gate.reason, false); return; }
  if (!st.subjectName || !st.classKey) return;
  tdaWriteMark(studentId, st.subjectName, gate.term, gate.month, st.dateISO, mark);
  tdaStatus('✓ تم الحفظ تلقائياً', true);
  renderTeacherDailyCards();
};
GSP.tdaMarkAll = function(mark){
  const st = tdaGetState();
  const gate = tdaDateAllowed(st.dateISO);
  if (!gate.ok) { tdaStatus(gate.reason || 'تعذر الحفظ', false); return; }
  const db = loadDB();
  const students = (db.students||[]).filter(s => {
    const key = (typeof classSectionKey === 'function') ? classSectionKey(s.class, s.section) : (s.class||'');
    if (key !== st.classKey) return false;
    if (typeof canAccessStudentGrade === 'function' && !canAccessStudentGrade(st.subjectName, s)) return false;
    return true;
  });
  const service = GSP.application && GSP.application.attendance;
  const marks = students.map(s => ({
    studentId: s.id,
    subjectName: st.subjectName,
    term: gate.term,
    month: gate.month,
    dateISO: st.dateISO,
    mark
  }));
  // STEP 37: all selected students are committed as one attendance transaction.
  // Metadata changes are prepared on the same local draft before the single save.
  let writeResult = null;
  if (service && typeof service.writeMarks === 'function') {
    writeResult = service.writeMarks(marks, {
      prepare: draft => {
        students.forEach(s => {
          const target = (draft.students || []).find(x => String(x.id) === String(s.id));
          if (target) tdaEnsureStudentAddedAt(target, st.dateISO);
        });
      }
    });
  } else {
    students.forEach(s => tdaWriteMark(s.id, st.subjectName, gate.term, gate.month, st.dateISO, mark));
  }
  tdaStatus('✓ تم تعيين الكل والحفظ تلقائياً', true);
  renderTeacherDailyCards();
};
function renderTeacherDailyCards(){
  const wrap = document.getElementById('tdaCards');
  const bulk = document.getElementById('tdaBulkBar');
  if (!wrap) return;
  const st = tdaGetState();
  const db = loadDB();
  const att = attendanceService.getAttendanceState().attendance;
  const info = db.schoolInfo || {};
  const gate = tdaDateAllowed(st.dateISO);
  const classLabel = (typeof classSectionLabel === 'function') ? classSectionLabel(st.classKey) : st.classKey;
  const teacher = currentTeacher();
  const teacherName = teacher ? (teacher.name || '') : '';
  const subEl = document.getElementById('tdaSubtitle');
  if (subEl) {
    subEl.textContent = [
      info.schoolName || '',
      teacherName ? ('المعلم: ' + teacherName) : '',
      st.subjectName ? ('المادة: ' + st.subjectName) : '',
      classLabel ? ('الفصل: ' + classLabel) : '',
      st.dateISO ? ('التاريخ: ' + st.dateISO) : ''
    ].filter(Boolean).join(' | ');
  }

  if (!st.subjectName || !st.classKey) {
    tdaSetBanner('info', 'اختر المادة والفصل لعرض طلاب اليوم.');
    if (bulk) bulk.style.display = 'none';
    wrap.innerHTML = '<div class="tda-empty">اختر المادة والفصل والتاريخ.</div>';
    return;
  }

  // جدول المادة يظل تنبيهًا فقط؛ أما أيام العمل المدرسية فهي شرط إلزامي في gate.
  if (gate.ok || gate.locked) {
    const onSchedule = isDateInSubjectSchedule(att, st.subjectName, st.classKey, st.dateISO);
    if (!onSchedule && !gate.holiday) {
      tdaSetBanner('warn', 'تنبيه: هذا اليوم قد لا يكون من أيام حصص المادة حسب الجدول المحفوظ — يمكنك التسجيل لأن الجدول قد يتغير خلال الشهر.');
    } else if (gate.ok) {
      tdaSetBanner('', '');
    }
  }
  if (!gate.ok) {
    tdaSetBanner(gate.holiday || gate.locked ? 'danger' : 'danger', gate.reason);
  }

  const canEdit = !!gate.ok;
  if (bulk) bulk.style.display = canEdit ? 'flex' : 'none';

  const term = gate.term, month = gate.month;
  const students = (db.students||[]).filter(s => {
    const key = (typeof classSectionKey === 'function') ? classSectionKey(s.class, s.section) : (s.class||'');
    if (key !== st.classKey) return false;
    if (typeof canAccessStudentGrade === 'function' && !canAccessStudentGrade(st.subjectName, s)) return false;
    // إخفاء الطالب في أيام قبل تاريخ إضافته إن وُجد
    if (s.addedAt && st.dateISO && st.dateISO < s.addedAt) return false;
    return true;
  });

  if (!students.length) {
    wrap.innerHTML = '<div class="tda-empty">لا يوجد طلاب في هذا الفصل ضمن نطاق صلاحيتك.</div>';
    return;
  }

  let metaDirty = false;
  wrap.innerHTML = students.map((s, idx) => {
    // أول ظهور: ثبّت addedAt إن لم يكن
    if (canEdit && !s.addedAt) { /* لا نفرض addedAt تلقائياً لكل الطلاب القدامى */ }
    const mark = (term && month) ? tdaReadMark(att, s.id, st.subjectName, term, month, st.dateISO) : 'present';
    const cardCls = mark === 'absent' ? 'is-g' : (mark === 'excuse' ? 'is-e' : 'is-p');
    const dis = canEdit ? '' : 'disabled';
    const sid = JSON.stringify(String(s.id));
    return `<div class="tda-card ${cardCls}">
      <div class="tda-card-name">${idx+1}. ${esc(s.name||'')}</div>
      <div class="tda-card-meta">${esc(s.seat ? ('جلوس: '+s.seat) : '')}</div>
      <div class="tda-card-actions">
        <button type="button" class="${mark==='present'?'active-p':''}" ${dis} data-action="tdaSetStudentMark" data-args='${gspArgs([sid,"present"])}'>✓ حاضر</button>
        <button type="button" class="${mark==='absent'?'active-g':''}" ${dis} data-action="tdaSetStudentMark" data-args='${gspArgs([sid,"absent"])}'>غ غائب</button>
        <button type="button" class="${mark==='excuse'?'active-e':''}" ${dis} data-action="tdaSetStudentMark" data-args='${gspArgs([sid,"excuse"])}'>ع عذر</button>
      </div>
    </div>`;
  }).join('');
}
function tdaUpdateFilterSummary(){
  const textEl = document.getElementById('tdaFilterSummaryText');
  const chev = document.getElementById('tdaFilterChevron');
  const toolbar = document.getElementById('tdaToolbar');
  if (!textEl) return;
  const st = tdaGetState();
  const classLabel = (st.classKey && typeof classSectionLabel === 'function')
    ? classSectionLabel(st.classKey) : (st.classKey || '—');
  let dateLabel = st.dateISO || '—';
  try {
    if (st.dateISO) {
      const [y, m, d] = st.dateISO.split('-');
      if (y && m && d) dateLabel = d + '/' + m + '/' + y;
    }
  } catch (e) {}
  const parts = [
    st.subjectName || 'بدون مادة',
    classLabel,
    dateLabel
  ];
  textEl.textContent = parts.join(' · ');
  if (chev && toolbar) {
    const open = toolbar.classList.contains('filters-open');
    chev.textContent = open ? '▲ إخفاء' : '▼ تعديل';
  }
}
GSP.tdaToggleFilters = function(){
  const toolbar = document.getElementById('tdaToolbar');
  const btn = document.getElementById('tdaFilterSummary');
  if (!toolbar) return;
  const state = GSP.application && GSP.application.attendanceUIState;
  const open = state && state.teacherFilters ? state.teacherFilters.toggle() : toolbar.classList.contains('filters-open') === false;
  toolbar.classList.toggle('filters-open', open);
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  tdaUpdateFilterSummary();
};
GSP.onTdaFilterChange = function(){
  tdaPopulateFilters();
  renderTeacherDailyCards();
  tdaUpdateFilterSummary();
  // بعد اختيار الفلاتر على الموبايل: اطوِ اللوحة لإظهار البطاقات
  try {
    if (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) {
      const toolbar = document.getElementById('tdaToolbar');
      if (toolbar && toolbar.classList.contains('filters-open')) {
        toolbar.classList.remove('filters-open');
        const state = GSP.application && GSP.application.attendanceUIState;
        if (state && state.teacherFilters) state.teacherFilters.setOpen(false);
        const btn = document.getElementById('tdaFilterSummary');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        tdaUpdateFilterSummary();
      }
    }
  } catch (e) {}
};


  const api = {
    todayISO, addDaysISO, findTermMonthForDate, isDateInSubjectSchedule, tdaDateAllowed,
    tdaEnsureStudentAddedAt, tdaPopulateFilters, tdaGetState, tdaSetBanner, tdaStatus,
    tdaMarkSymbol, tdaWriteMark, tdaReadMark, renderTeacherDailyCards, tdaUpdateFilterSummary
  };

  // STEP 23: public compatibility surface only on GSP root.
  // Internal helpers stay on GSP.tdaTeacherDaily / GSP.features.attendance.teacherDaily.
  GSP.tdaTeacherDaily = api;
  GSP.tdaSetStudentMark = function(studentId, mark){
    const st = tdaGetState();
    const gate = tdaDateAllowed(st.dateISO);
    if (!gate.ok) { tdaStatus(gate.reason, false); return; }
    if (!st.subjectName || !st.classKey) return;
    tdaWriteMark(studentId, st.subjectName, gate.term, gate.month, st.dateISO, mark);
    tdaStatus('✓ تم الحفظ تلقائياً', true);
    renderTeacherDailyCards();
  };
  GSP.tdaMarkAll = function(mark){
    const st = tdaGetState();
    const gate = tdaDateAllowed(st.dateISO);
    if (!gate.ok) { tdaStatus(gate.reason || 'تعذر الحفظ', false); return; }
    const db = loadDB();
    const students = (db.students||[]).filter(s => {
      const key = classSectionKey(s.class, s.section);
      if (key !== st.classKey) return false;
      if (!canAccessStudentGrade(st.subjectName, s)) return false;
      return true;
    });
    let changedMeta = false;
    students.forEach(s => {
      if (tdaEnsureStudentAddedAt(s, st.dateISO)) changedMeta = true;
      tdaWriteMark(s.id, st.subjectName, gate.term, gate.month, st.dateISO, mark);
    });
    if (changedMeta) saveDB(db);
    tdaStatus('✓ تم تعيين الكل والحفظ تلقائياً', true);
    renderTeacherDailyCards();
  };
  GSP.tdaToggleFilters = function(){
    const toolbar = document.getElementById('tdaToolbar');
    const btn = document.getElementById('tdaFilterSummary');
    if (!toolbar) return;
    const state = GSP.application && GSP.application.attendanceUIState;
    const open = state && state.teacherFilters ? state.teacherFilters.toggle() : toolbar.classList.contains('filters-open') === false;
    toolbar.classList.toggle('filters-open', open);
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    tdaUpdateFilterSummary();
  };
  GSP.onTdaFilterChange = function(){
    tdaPopulateFilters();
    renderTeacherDailyCards();
    tdaUpdateFilterSummary();
    try {
      if (root.matchMedia && root.matchMedia('(max-width: 700px)').matches) {
        const toolbar = document.getElementById('tdaToolbar');
        if (toolbar && toolbar.classList.contains('filters-open')) {
          toolbar.classList.remove('filters-open');
          const btn = document.getElementById('tdaFilterSummary');
          if (btn) btn.setAttribute('aria-expanded', 'false');
          tdaUpdateFilterSummary();
        }
      }
    } catch (e) {}
  };
  GSP.features = GSP.features || {};
  GSP.features.attendance = GSP.features.attendance || {};
  GSP.features.attendance.teacherDaily = Object.freeze(api);
})(window);
