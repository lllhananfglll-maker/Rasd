/* Attendance filter/presentation feature — extracted in STEP 9. */
(function(){
  'use strict';
  const GSP = globalThis.GSP || (globalThis.GSP = {});
  const api = {};

  function populateAttendanceFilters(deps, ){
    const {loadDB, getMonthLabels, currentAccountType, currentTeacher, refreshAttendanceClassOptions,
      classSectionLabel, esc, ensureAttendance, getSubjectStudyDays, DAY_LABELS} = deps;
    const db = loadDB();
    const termSel = document.getElementById('attTermSelect');
    const monthSel = document.getElementById('attMonthSelect');
    const subjSel = document.getElementById('attSubjectSelect');
    const classSel = document.getElementById('attClassSelect');
    if (!termSel || !monthSel || !subjSel || !classSel) return;
    const term = termSel.value || 'first';
    const labels = (typeof getMonthLabels === 'function') ? getMonthLabels(term) : ['الشهر الأول','الشهر الثاني'];
    const prevM = monthSel.value;
    monthSel.innerHTML = labels.map((lbl,i) => `<option value="${i+1}">${esc(lbl)}</option>`).join('');
    if (prevM && parseInt(prevM,10) <= labels.length) monthSel.value = prevM;
    let subjects = db.subjects || [];
    if (currentAccountType === 'teacher' && currentTeacher) {
      const names = new Set((currentTeacher.assignments||[]).map(a => a.subjectName));
      subjects = subjects.filter(s => names.has(s.name));
    }
    const prevS = subjSel.value;
    subjSel.innerHTML = subjects.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('') || '<option value="">— لا توجد مواد —</option>';
    if (prevS && subjects.some(s => s.name === prevS)) subjSel.value = prevS;
    refreshAttendanceClassOptions();
  }

  function refreshAttendanceClassOptions(deps, ){
    const {loadDB, getMonthLabels, currentAccountType, currentTeacher, refreshAttendanceClassOptions,
      classSectionLabel, esc, ensureAttendance, getSubjectStudyDays, DAY_LABELS} = deps;
    const db = loadDB();
    const subjSel = document.getElementById('attSubjectSelect');
    const classSel = document.getElementById('attClassSelect');
    if (!classSel) return;
    const subjectName = subjSel ? subjSel.value : '';
    let classes = db.classes || [];
    if (currentAccountType === 'teacher' && currentTeacher && subjectName) {
      const allowed = new Set();
      (currentTeacher.assignments||[]).forEach(a => { if (a.subjectName === subjectName) (a.classes||[]).forEach(c => allowed.add(c)); });
      classes = classes.filter(c => allowed.has(c));
    }
    const prev = classSel.value;
    classSel.innerHTML = classes.map(c => {
      const label = (typeof classSectionLabel === 'function') ? classSectionLabel(c) : c;
      return `<option value="${esc(c)}">${esc(label)}</option>`;
    }).join('') || '<option value="">— لا توجد فصول —</option>';
    if (prev && classes.includes(prev)) classSel.value = prev;
  }

  function renderDayCheckboxes(deps, ){
    const {loadDB, getMonthLabels, currentAccountType, currentTeacher, refreshAttendanceClassOptions,
      classSectionLabel, esc, ensureAttendance, getSubjectStudyDays, DAY_LABELS} = deps;
    const wrap = document.getElementById('attDaysCheckboxes'); if (!wrap) return;
    const db = loadDB(); const att = ensureAttendance(db);
    const subjectName = document.getElementById('attSubjectSelect')?.value || '';
    const classKey = document.getElementById('attClassSelect')?.value || '';
    const selected = new Set(getSubjectStudyDays(att, subjectName, classKey));
    const maxDay = att.saturdayEnabled ? 5 : 4;
    let html = '';
    for (let i = 0; i <= maxDay; i++) html += `<label class="att-day-chip"><input type="checkbox" data-day-idx="${i}" ${selected.has(i)?'checked':''}> ${DAY_LABELS[i]}</label>`;
    wrap.innerHTML = html;
  }

  api.populateAttendanceFilters = (deps) => populateAttendanceFilters(deps);
  api.refreshAttendanceClassOptions = (deps) => refreshAttendanceClassOptions(deps);
  api.renderDayCheckboxes = (deps) => renderDayCheckboxes(deps);
  Object.freeze(api);
  GSP.attendanceFilters = api;
})();
