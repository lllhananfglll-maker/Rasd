/* import-export.part02.js — generated from import-export.js; execution order is significant. */


// يبني مقارنة كاملة بين كشف الطلاب القديم (المحفوظ) والجديد (المستخرج من الملف المرفوع حديثاً)
// لنفس الصف والقسم. المطابقة الأساسية تتم بنفس معرّف الطالب الفعلي (id) المعتمد في قاعدة البيانات،
// وأي طالب لم يُطابَق بهذا المعرّف يُعاد فحصه بمطابقة احتياطية عبر (الفصل + رقم الجلوس) القديمين،
// لاكتشاف حالة "تصحيح الرقم القومي أو الاسم لنفس الطالب" بدل اعتبارها حذفاً وإضافة منفصلين.
function buildStudentRosterDiff(oldStudents, newStudents) {
  const oldById = new Map(oldStudents.map(s => [s.id, s]));
  const kept = [];
  const idRemaps = [];
  const matchedOldIds = new Set();
  const matchedNewIds = new Set();

  newStudents.forEach(ns => {
    const os = oldById.get(ns.id);
    if (os) {
      matchedOldIds.add(os.id);
      matchedNewIds.add(ns.id);
      const changed = diffStudentFields(os, ns);
      if (changed.length) kept.push({ oldS: os, newS: ns, changed });
    }
  });

  const remainingOld = oldStudents.filter(s => !matchedOldIds.has(s.id));
  const remainingNew = newStudents.filter(s => !matchedNewIds.has(s.id));
  const usedNewIds = new Set();
  remainingOld.forEach(os => {
    const match = remainingNew.find(ns => !usedNewIds.has(ns.id) && ns.class === os.class && ns.seat === os.seat);
    if (match) {
      usedNewIds.add(match.id);
      matchedOldIds.add(os.id);
      matchedNewIds.add(match.id);
      const changed = diffStudentFields(os, match);
      idRemaps.push({ oldId: os.id, newId: match.id, oldS: os, newS: match, changed });
    }
  });

  const removed = oldStudents.filter(s => !matchedOldIds.has(s.id));
  const added = newStudents.filter(s => !matchedNewIds.has(s.id));
  return { kept, idRemaps, removed, added };
}



function studentRosterDiffHasChanges(diff) {
  return diff.removed.length > 0 || diff.added.length > 0 || diff.idRemaps.length > 0 ||
    diff.kept.some(k => k.changed.length > 0);
}



// يبني رسالة تأكيد نصية (لصندوق confirm) تلخّص كل ما سيتغيّر، مقسَّماً حسب نوع التعديل، حتى
// يوافق مدير النظام على التحديث بوعي تام قبل تطبيقه (خصوصاً حذف الطلاب وما يرتبط بهم من درجات).
function buildStudentRosterDiffConfirmMessage(diff) {
  const lines = [];
  const fieldCounts = {};
  diff.kept.concat(diff.idRemaps).forEach(k => k.changed.forEach(f => { fieldCounts[f] = (fieldCounts[f] || 0) + 1; }));
  const changedFieldsList = Object.keys(fieldCounts);
  if (changedFieldsList.length) {
    lines.push('📝 تعديلات على بيانات طلاب مستمرين (بدون أي مساس بدرجاتهم المرصودة):');
    changedFieldsList.forEach(f => lines.push(`  • تعديل ${STUDENT_FIELD_LABELS[f] || f}: ${fieldCounts[f]} طالب`));
  }
  if (diff.idRemaps.length) {
    lines.push(`  • من بينهم ${diff.idRemaps.length} طالب تم التعرّف عليهم عبر نفس الفصل ورقم الجلوس رغم تغيّر الرقم القومي/الاسم، وستُنقل درجاتهم المرصودة سابقاً معهم تلقائياً.`);
  }
  if (diff.added.length) {
    const maxShow = 10;
    const names = diff.added.slice(0, maxShow).map(s => `${s.name} (${s.seat})`).join('، ');
    const more = diff.added.length > maxShow ? ` ...و${diff.added.length - maxShow} آخرين` : '';
    lines.push(`➕ إضافة ${diff.added.length} طالب جديد: ${names}${more}`);
  }
  if (diff.removed.length) {
    const maxShow = 10;
    const names = diff.removed.slice(0, maxShow).map(s => `${s.name} (${s.seat})`).join('، ');
    const more = diff.removed.length > maxShow ? ` ...و${diff.removed.length - maxShow} آخرين` : '';
    lines.push(`🗑️ حذف ${diff.removed.length} طالب غير موجودين في الملف الجديد (سيُحذف نهائياً كل درجاتهم في كل الفصول والشهور): ${names}${more}`);
  }
  if (!lines.length) lines.push('لا توجد أي تغييرات في بيانات الطلاب عن الملف السابق، فقط تحديث/إضافة درجات.');
  return `سيتم تحديث بيانات هذا الصف/القسم كالتالي:\n\n${lines.join('\n')}\n\nهل تريد المتابعة بتطبيق هذا التحديث؟`;
}



// يبني تقرير HTML دائم (يُعرض في منطقة الرسائل بعد المعالجة) لتوثيق كل تغيير تفصيلياً بحسب نوعه
function buildStudentRosterDiffReportHtml(diff) {
  if (!studentRosterDiffHasChanges(diff)) return '';
  const rows = [];
  diff.kept.concat(diff.idRemaps).forEach(k => {
    if (!k.changed.length) return;
    const details = k.changed.map(f => `${escapeHtml(STUDENT_FIELD_LABELS[f] || f)}: "${escapeHtml(k.oldS[f === 'secondLang' ? 'secondLanguage' : f] || '-')}" ← "${escapeHtml(k.newS[f === 'secondLang' ? 'secondLanguage' : f] || '-')}"`).join('، ');
    rows.push(`<li>✏️ ${escapeHtml(k.newS.name)} (${escapeHtml(k.newS.seat)}) — ${details}</li>`);
  });
  diff.added.forEach(s => rows.push(`<li>➕ إضافة: ${escapeHtml(s.name)} (${escapeHtml(s.seat)})</li>`));
  diff.removed.forEach(s => rows.push(`<li>🗑️ حذف (مع كل درجاته المرصودة): ${escapeHtml(s.name)} (${escapeHtml(s.seat)})</li>`));
  return `<div class="warning-box">📋 تفاصيل تحديث بيانات الطلاب لهذا الصف/القسم:<ul style="margin:6px 0 0 0; padding-inline-start:20px;">${rows.join('')}</ul></div>`;
}



// ============================================================
//  PROCESS UPLOAD
// ============================================================

function toggleUploadSection(sectionId, navBtn) {
  const sec = document.getElementById(sectionId);
  if (!sec) return;
  const willOpen = !sec.classList.contains('is-open');
  sec.classList.toggle('is-open', willOpen);
  const head = sec.querySelector('.up-section-head');
  if (head) head.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  document.querySelectorAll('#upNavBtns .up-nav-btn').forEach(b => {
    const active = b.getAttribute('data-up-target') === sectionId;
    b.classList.toggle('is-active', active && willOpen);
    b.classList.toggle('is-open', active && willOpen);
  });
  if (navBtn && willOpen) {
    try { sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  }
}
