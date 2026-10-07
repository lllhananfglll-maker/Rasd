/* grades-ui.part02.js — generated from grades-ui.js; execution order is significant. */


function toggleTermLock(term) {
 try {
  const lockSvc = (typeof GSP !== 'undefined' && GSP.application && GSP.application.gradesLock) || null;
  if (lockSvc && typeof lockSvc.toggleTerm === 'function') {
    const result = lockSvc.toggleTerm(term);
    if (!result.ok) return;
    renderLockCenter();
    loadGradesUI();
    return;
  }
  if (currentRole !== 'admin') return;
  const db = loadDB();
  db.termLocks = db.termLocks || {};
  db.termLocks[term] = !db.termLocks[term];
  saveDB(db);
  renderLockCenter();
  loadGradesUI();

 } catch (e) {
   console.error('toggleTermLock failed:', e);
   alert('⚠️ حدث خطأ أثناء تغيير حالة قفل الفصل الدراسي.\n' + (e && e.message ? e.message : e));
 }
}



function toggleMonthLockDirect(term, month) {
 try {
  const lockSvc = (typeof GSP !== 'undefined' && GSP.application && GSP.application.gradesLock) || null;
  if (lockSvc && typeof lockSvc.toggleMonth === 'function') {
    const result = lockSvc.toggleMonth(term, month);
    if (!result.ok) return;
    renderLockCenter();
    loadGradesUI();
    return;
  }
  if (currentRole !== 'admin') return;
  const db = loadDB();
  if (isTermLocked(db, term)) return;
  db.monthLocks = db.monthLocks || {};
  const key = monthLockKey(term, month);
  db.monthLocks[key] = !db.monthLocks[key];
  saveDB(db);
  renderLockCenter();
  loadGradesUI();

 } catch (e) {
   console.error('toggleMonthLockDirect failed:', e);
   alert('⚠️ حدث خطأ أثناء تغيير حالة قفل الشهر.\n' + (e && e.message ? e.message : e));
 }
}



function renderLockCenter() {
  const container = document.getElementById('lockCenterGrid');
  if (!container) return;
  const db = loadDB();
  const terms = [{ key: 'first', label: '📘 الفصل الدراسي الأول' }, { key: 'second', label: '📗 الفصل الدراسي الثاني' }];
  container.innerHTML = terms.map(t => {
    const labels = getMonthLabels(t.key);
    const termLocked = isTermLocked(db, t.key);
    const monthsHtml = labels.map((lbl, i) => {
      const m = i + 1;
      const monthLocked = !!(db.monthLocks && db.monthLocks[monthLockKey(t.key, m)]);
      const effectivelyLocked = monthLocked || termLocked;
      return `
        <div class="lock-month-chip ${effectivelyLocked ? 'is-locked' : 'is-open'}">
          <span>📆 ${lbl}</span>
          <span class="chip-status">${effectivelyLocked ? '🔒 مقفول' : '🔓 مفتوح'}</span>
          <button class="btn btn-sm ${monthLocked ? 'btn-success' : 'btn-outline'}"
            ${termLocked ? 'disabled title="مقفول ضمن قفل الفصل الدراسي بالكامل"' : ''}
            data-action="toggleMonthLockDirect" data-args='${gspArgs(['t.key', m])}'>
            ${monthLocked ? '🔓 فتح' : '🔒 قفل'}
          </button>
        </div>`;
    }).join('');
    return `
      <div class="lock-term-card">
        <div class="lock-term-header">
          <span class="lock-term-title">${t.label}</span>
          <button class="btn btn-sm ${termLocked ? 'btn-success' : 'btn-danger'}" data-action="toggleTermLock" data-args='${gspArgs(['t.key'])}'>
            ${termLocked ? '🔓 فتح كامل الفصل الدراسي' : '🔒 قفل كامل الفصل الدراسي (كل الشهور دفعة واحدة)'}
          </button>
        </div>
        <div class="lock-month-row">${monthsHtml}</div>
      </div>`;
  }).join('');
}



function updateGlobalLockUI() {
  const panel = document.getElementById('globalLockPanel');
  if (panel) panel.style.display = currentRole === 'admin' ? 'block' : 'none';
  const closurePanel = document.getElementById('systemClosurePanel');
  if (closurePanel) closurePanel.style.display = currentAccountType === 'superadmin' ? 'block' : 'none';
  try { loadSystemClosureUI(); } catch (e) {}
  if (!panel || currentRole !== 'admin') return;
  const db = loadDB();
  const locked = !!db.globalLock;
  const badge = document.getElementById('globalLockStatusBadge');
  if (badge) {
    badge.textContent = locked ? '🔒 مقفول لجميع المعلمين' : '🔓 مفتوح للجميع';
    badge.style.background = locked ? '#b91c1c' : '#0b5e42';
    badge.style.color = '#fff';
  }
  const btn = document.getElementById('globalLockToggleBtn');
  if (btn) {
    btn.textContent = locked ? '🔓 فتح إدخال الدرجات لجميع الفصول' : '🔒 قفل إدخال الدرجات لجميع الفصول';
    btn.className = locked ? 'btn btn-success btn-sm' : 'btn btn-danger btn-sm';
  }
  renderLockCenter();
}



function toggleLock() {
 try {
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  const month = parseInt(document.getElementById('gradeMonthSelect').value, 10);
  if (!subjectName || !cls) return;
  const lockSvc = (typeof GSP !== 'undefined' && GSP.application && GSP.application.gradesLock) || null;
  if (lockSvc && typeof lockSvc.toggleIndividual === 'function') {
    const result = lockSvc.toggleIndividual(cls, subjectName, term, month);
    if (!result.ok) return;
    loadGradesUI();
    return;
  }
  if (currentRole !== 'admin') return;
  const db = loadDB();
  const key = lockKey(cls, subjectName, term, month);
  db.locks = db.locks || {};
  db.locks[key] = !db.locks[key];
  saveDB(db);
  loadGradesUI();

 } catch (e) {
   console.error('toggleLock failed:', e);
   alert('⚠️ حدث خطأ أثناء تغيير حالة القفل.\n' + (e && e.message ? e.message : e));
 }
}



// ============================================================
//  تنقل بلوحة المفاتيح بين خانات الرصد (بدون الحاجة لتحريك الفأرة إطلاقاً)
// ============================================================
// Tab يظل يعمل تلقائياً (متصفح) وينتقل "صفاً بصف" (كل مكونات الطالب ثم الطالب التالي). لكن
// أغلب المعلمين يرصدون "عموداً بعمود" (نفس المكوّن لكل الطلاب أولاً، زي شيت إكسيل) وهذا ما لم
// يكن ممكناً بدون ماوس - فأضفنا تنقلاً بالأسهم زي Excel/Google Sheets:
// ↓ أو Enter: نفس المكوّن للطالب التالي (تنقل عمودي - الأكثر استخداماً). ↑: للطالب السابق.
// → / ←: للمكوّن التالي/السابق لنفس الطالب، ولا يتدخل إلا لو المؤشر عند بداية/نهاية النص
// المكتوب حتى لا يتعارض مع تحريك المؤشر أثناء تعديل رقم بالفعل.
function handleGradeInputKeydown(e) {
  const key = e.key;
  if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Enter') return;
  const input = e.target;
  const td = input.closest('td');
  const tr = td && td.closest('tr');
  if (!tr) return;

  if ((key === 'ArrowLeft' || key === 'ArrowRight') && input.tagName === 'INPUT') {
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    if (key === 'ArrowLeft' && !atStart) return;
    if (key === 'ArrowRight' && !atEnd) return;
  }

  const rowInputs = Array.from(tr.querySelectorAll('.grade-input'));
  const colIndex = rowInputs.indexOf(input);
  let targetRow = tr, targetCol = colIndex;
  if (key === 'ArrowDown' || key === 'Enter') targetRow = tr.nextElementSibling;
  else if (key === 'ArrowUp') targetRow = tr.previousElementSibling;
  else if (key === 'ArrowRight') targetCol = colIndex + 1;
  else if (key === 'ArrowLeft') targetCol = colIndex - 1;
  if (!targetRow) return;

  const targetInputs = Array.from(targetRow.querySelectorAll('.grade-input'));
  const targetInput = targetInputs[targetCol];
  if (!targetInput) return;

  e.preventDefault();
  targetInput.focus();
  if (targetInput.tagName === 'INPUT' && typeof targetInput.select === 'function') targetInput.select();
}
