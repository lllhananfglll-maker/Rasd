/**
 * js/app/ui-shortcuts.js — دوال صغيرة مسمّاة بديلة عن تعبيرات onclick المركّبة
 * (نداءات متعددة بفاصلة منقوطة، أو setTimeout/DOM مباشر داخل onclick="...").
 * كل دالة هنا بديل 1:1 لسطر onclick كان مكتوباً كتعبير JS كامل داخل HTML.
 * تُستدعى الآن عبر data-action من نظام core/dom-actions.js.
 */
'use strict';

// بديل: onclick="activateTab('X');closeDashMoreMenu()"
function gotoTabAndCloseMenu(tabName) {
  if (typeof activateTab === 'function') activateTab(tabName);
  if (typeof closeDashMoreMenu === 'function') closeDashMoreMenu();
}
GSP.gotoTabAndCloseMenu = gotoTabAndCloseMenu;

// بديل: onclick="activateTab('grades'); setTimeout(function(){ ... scrollIntoView ... }, 200);"
function scrollToSystemClosurePanel() {
  if (typeof activateTab === 'function') activateTab('grades');
  setTimeout(function () {
    const p = document.getElementById('systemClosurePanel');
    if (p) p.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 200);
}
GSP.scrollToSystemClosurePanel = scrollToSystemClosurePanel;

// بديل: onclick="document.getElementById('someInput').click()" (فتح منتقي ملف مخفي)
function triggerFileInput(inputId) {
  const input = document.getElementById(inputId);
  if (input) input.click();
}
GSP.triggerFileInput = triggerFileInput;

// بديل: onclick="closeAttendanceConflictsModal();setTimeout(()=>v20OpenStudent(id),150)"
function closeConflictsModalAndOpenStudent(studentId) {
  if (typeof closeAttendanceConflictsModal === 'function') closeAttendanceConflictsModal();
  setTimeout(function () {
    if (typeof v20OpenStudent === 'function') v20OpenStudent(studentId);
  }, 150);
}
GSP.closeConflictsModalAndOpenStudent = closeConflictsModalAndOpenStudent;

function handleGradeTermChange(){ if(typeof populateMonthSelects==='function')populateMonthSelects(); if(typeof refreshGradeWeekSelect==='function')refreshGradeWeekSelect(); if(typeof syncGradesFiltersToUIState==='function')syncGradesFiltersToUIState(); if(typeof loadGradesUI==='function')loadGradesUI(); }
GSP.handleGradeTermChange=handleGradeTermChange;
function handleGradePeriodChange(){ if(typeof refreshGradeWeekSelect==='function')refreshGradeWeekSelect(); if(typeof syncGradesFiltersToUIState==='function')syncGradesFiltersToUIState(); if(typeof loadGradesUI==='function')loadGradesUI(); }
GSP.handleGradePeriodChange=handleGradePeriodChange;
function handleNewTeacherSubjectChange(){ if(typeof toggleTeacherLangTypeField==='function')toggleTeacherLangTypeField(); if(typeof updateTeacherClassesForSubject==='function')updateTeacherClassesForSubject(); }
GSP.handleNewTeacherSubjectChange=handleNewTeacherSubjectChange;
function handleNewTeacherLangChange(){ if(typeof handleLangTypeSelectChange==='function')handleLangTypeSelectChange(); if(typeof updateTeacherMatchPreview==='function')updateTeacherMatchPreview(); }
GSP.handleNewTeacherLangChange=handleNewTeacherLangChange;

function handleGradeInputInput(input){
  if(typeof validateGradeInput==='function') validateGradeInput(input);
  const cell=input && input.closest ? input.closest('td') : null;
  if(cell) cell.classList.toggle('grade-cell-missing', input.value === '');
}
GSP.handleGradeInputInput=handleGradeInputInput;
