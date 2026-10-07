/* print-sheets.part01.js — generated from print-sheets.js; execution order is significant. */
/** features/print-sheets.js */
'use strict';



// ============================================================
//  مركز الطباعة — كشوف فارغة + أعمال سنة + مواظبة فارغة
// ============================================================
function canAccessPrintCenter() {
  return currentAccountType === 'superadmin'
    || currentAccountType === 'stageadmin'
    || currentAccountType === 'monitor'
    || currentAccountType === 'teacher';
}



function loadPrintCenterUI() {
  if (!canAccessPrintCenter()) return;
  const role = currentAccountType || '';
  document.querySelectorAll('#tab-printcenter .pc-sec').forEach(sec => {
    const roles = (sec.getAttribute('data-pc-roles') || '').split(',').map(s => s.trim()).filter(Boolean);
    sec.style.display = (!roles.length || roles.includes(role)) ? '' : 'none';
  });
  try { populateExportGradeSelect(); } catch (e) {}
  try { pcFillMonthSelect('pcBlankTerm', 'pcBlankMonth'); } catch (e) {}
  try { pcFillMonthSelect('pcAttTerm', 'pcAttMonth'); } catch (e) {}
  try { pcRenderClassChecks('pcClassList'); } catch (e) {}
  try { pcRenderClassChecks('pcAttClassList'); } catch (e) {}
  try { pcRenderSubjectChecks('pcSubjectList'); } catch (e) {}
  try { pcRenderSubjectChecks('pcAttSubjectList'); } catch (e) {}
}



function pcOnBlankTermChange() { pcFillMonthSelect('pcBlankTerm', 'pcBlankMonth'); }


function pcOnAttTermChange() { pcFillMonthSelect('pcAttTerm', 'pcAttMonth'); }



function pcFillMonthSelect(termId, monthId) {
  const termEl = document.getElementById(termId);
  const monthEl = document.getElementById(monthId);
  if (!termEl || !monthEl) return;
  const term = termEl.value || 'first';
  const labels = (typeof getMonthLabels === 'function') ? getMonthLabels(term) : ['الشهر 1', 'الشهر 2'];
  const cur = monthEl.value;
  monthEl.innerHTML = labels.map((lbl, i) =>
    `<option value="${i + 1}">${escapeHtml(lbl)}</option>`
  ).join('');
  if (cur && Number(cur) <= labels.length) monthEl.value = cur;
}



function pcRenderClassChecks(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const db = loadDB();
  const classes = (db.classes || []).slice().sort((a, b) => String(a).localeCompare(String(b), 'ar'));
  if (!classes.length) {
    box.innerHTML = '<div style="color:#94a3b8;font-size:13px">لا توجد فصول بعد.</div>';
    return;
  }
  box.innerHTML = classes.map(cls => {
    const label = (typeof classSectionLabel === 'function') ? classSectionLabel(cls) : cls;
    const id = containerId + '_' + String(cls).replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
    return `<label style="display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:13px;cursor:pointer">
      <input type="checkbox" class="pc-check" data-class="${escapeHtml(String(cls))}" id="${id}">
      <span>${escapeHtml(label)}</span>
    </label>`;
  }).join('');
}



function pcRenderSubjectChecks(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const db = loadDB();
  const subjects = (db.subjects || []).filter(s => (s.name || '').trim() && (s.name || '').trim() !== 'نوع');
  if (!subjects.length) {
    box.innerHTML = '<div style="color:#94a3b8;font-size:13px">لا توجد مواد بعد.</div>';
    return;
  }
  box.innerHTML = subjects.map((s, i) => {
    const id = containerId + '_s' + i;
    return `<label style="display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:13px;cursor:pointer">
      <input type="checkbox" class="pc-check" data-subject="${escapeHtml(s.name)}" id="${id}">
      <span>${escapeHtml(s.name)}</span>
    </label>`;
  }).join('');
}



function pcToggleAll(containerId, checked) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.querySelectorAll('input.pc-check').forEach(ch => { ch.checked = !!checked; });
}



function pcGetChecked(containerId, attr) {
  const box = document.getElementById(containerId);
  if (!box) return [];
  return [...box.querySelectorAll('input.pc-check:checked')].map(ch => ch.getAttribute(attr)).filter(Boolean);
}



function pcResolveTeacherName(db, subjectName, classKey) {
  const teachers = (db.teachers || []).filter(t =>
    (t.assignments || []).some(a => a.subjectName === subjectName && (a.classes || []).includes(classKey))
  );
  if (teachers.length) return teachers.map(t => t.name || '').filter(Boolean).join('، ');
  return '';
}



// طباعة كشوف رصد فارغة: كل مجموعة (فصل × مادة) = صفحة واحدة بكل طلاب الفصل
async function printBlankGradeSheetsBatch() {
  if (!canAccessPrintCenter()) {
    alert('مركز الطباعة متاح للإدارة ومدير المرحلة فقط.');
    return;
  }
  const db = loadDB();
  const classes = pcGetChecked('pcClassList', 'data-class');
  const subjectNames = pcGetChecked('pcSubjectList', 'data-subject');
  const term = (document.getElementById('pcBlankTerm') || {}).value || 'first';
  const month = parseInt((document.getElementById('pcBlankMonth') || {}).value || '1', 10);
  if (!classes.length || !subjectNames.length) {
    alert('يرجى تحديد فصل واحد على الأقل ومادة واحدة على الأقل.');
    return;
  }
  const jobs = [];
  classes.forEach(cls => {
    subjectNames.forEach(sn => {
      const subj = (db.subjects || []).find(s => s.name === sn);
      if (!subj) return;
      // إن وُجد appliesTo للمادة نتحقق أن الفصل ضمن نطاقها
      if (typeof subjectAppliesToClass === 'function' && !subjectAppliesToClass(subj, cls, db)) return;
      jobs.push({ cls, subj });
    });
  });
  if (!jobs.length) {
    alert('لا توجد توليفات صالحة من الفصول والمواد المحددة.');
    return;
  }
  if (jobs.length > 30) {
    if (!(await showConfirm('سيتم طباعة ' + jobs.length + ' كشف رصد (شكل أسابيع + امتحان الشهر). هل تريد المتابعة؟'))) return;
  }

  const info = db.schoolInfo || {};
  const termLabel = term === 'first' ? 'الفصل الدراسي الأول' : 'الفصل الدراسي الثاني';
  const monthLabels = (typeof getMonthLabels === 'function') ? getMonthLabels(term) : [];
  const monthLabel = monthLabels[month - 1] || ('الشهر ' + month);
  const printedBy = (typeof resolvePrintedByName === 'function') ? resolvePrintedByName() : 'المستخدم';
  const printDate = new Date().toLocaleDateString('ar-EG');
  const hindi = (typeof toHindiDigits === 'function') ? toHindiDigits : (v => String(v));
  const weekDates = (typeof getFourWeekDates === 'function') ? getFourWeekDates(term, month - 1) : ['','','',''];
  const weekCount = 4;
  const scopeWeeks = (typeof getPeriodWeekCount === 'function') ? getPeriodWeekCount(term, month - 1) : 4;
  const weekNames = ['الأسبوع 1', 'الأسبوع 2', 'الأسبوع 3', 'الأسبوع 4'];
  const periodExam = (typeof periodHasMonthlyExam === 'function') ? periodHasMonthlyExam(term, month - 1) : true;
  const weekOutCls = (wi) => (typeof isWeekExcluded === 'function' ? isWeekExcluded(term, month - 1, wi) : (wi >= scopeWeeks)) ? ' week-out-of-scope' : '';
  const formatWeekDateAr = (typeof GSP.formatWeekDateAr === 'function') ? GSP.formatWeekDateAr
    : (typeof formatWeekDateAr === 'function') ? formatWeekDateAr
    : function(d) {
        if (!d) return '';
        try {
          if (typeof d === 'string' && d.length >= 10) {
            const parts = d.slice(0, 10).split('-');
            if (parts.length === 3) return hindi(parts[2]) + '/' + hindi(parts[1]);
          }
          const dt = new Date(d);
          if (!isNaN(dt)) return hindi(dt.getDate()) + '/' + hindi(dt.getMonth() + 1);
        } catch (e) {}
        return '';
      };

  let pagesHtml = '';
  jobs.forEach(job => {
    const cls = job.cls;
    const subject = job.subj;
    const subjectName = subject.name;
    const classLabel = (typeof classSectionLabel === 'function') ? classSectionLabel(cls) : cls;
    let students = (db.students || []).filter(s => {
      const key = (typeof classSectionKey === 'function') ? classSectionKey(s.class, s.section) : (s.class || '');
      return key === cls;
    });
    students.sort((a, b) =>
      (a.gender !== b.gender ? (a.gender === 'F' ? -1 : 1) : 0)
      || (parseInt(a.seat, 10) || 0) - (parseInt(b.seat, 10) || 0)
      || String(a.name || '').localeCompare(String(b.name || ''), 'ar')
    );

    // تصنيف المكوّنات ككشف الرصد التفصيلي: أسبوعية + مواظبة + تقييم/امتحان شهري
    const weeklyComps = [];
    let attendanceComp = null, monthlyComp = null;
    (subject.components || []).forEach((comp, ci) => {
      if (comp.type === 'attendance') attendanceComp = { comp, ci };
      else if (comp.isMonthlyGrade) monthlyComp = { comp, ci };
      else weeklyComps.push({ comp, ci });
    });
    // إن لم تُصنَّف أي مكوّنات أسبوعية ولا شهري، نعرض كل المكوّنات غير الحضور كأسبوعية
    if (!weeklyComps.length && !monthlyComp) {
      (subject.components || []).forEach((comp, ci) => {
        if (comp.type === 'attendance') return;
        weeklyComps.push({ comp, ci });
      });
    }
    if (!periodExam) monthlyComp = null;

    const weekliesMaxSum = weeklyComps.reduce((s, x) => s + (Number(x.comp.maxScore) || 0), 0);
    const attMax = attendanceComp ? (Number(attendanceComp.comp.maxScore) || 0) : 0;
    const monMax = monthlyComp ? (Number(monthlyComp.comp.maxScore) || 0) : 0;
    const grandMax = weekliesMaxSum + attMax + monMax;

    // اسم معلم المادة/الفصل
    let teacherName = '';
    try {
      const t = (db.teachers || []).find(tch => (tch.assignments || []).some(a =>
        a.subjectName === subjectName && (a.classes || []).includes(cls)));
      if (t) teacherName = t.name || '';
    } catch (e) {}

    const colsPerComp = 5; // 4 أسابيع + متوسط
    const extraCols = (attendanceComp ? 1 : 0) + (monthlyComp ? 1 : 0) + 1;
    const totalDataCols = (weeklyComps.length * colsPerComp) + extraCols;
    const namePct = 16;
    const serialPct = 3;
    const seatPct = 5;
    const restPct = 100 - namePct - serialPct - seatPct;
    const colPct = totalDataCols > 0 ? (restPct / totalDataCols) : 3;

    let colgroupHtml = `<col style="width:${serialPct}%"><col style="width:${seatPct}%"><col style="width:${namePct}%">`;
    for (let i = 0; i < totalDataCols; i++) colgroupHtml += `<col style="width:${colPct}%">`;

    // صف 1: أسماء المكوّنات
    let compGroupRow = `<th rowspan="3" class="serial-col">م</th><th rowspan="3">رقم الجلوس</th><th rowspan="3">اسم الطالب</th>`;
    weeklyComps.forEach((x, i) => {
      const sep = i === 0 ? 'week-sep-left' : '';
      compGroupRow += `<th colspan="5" class="${sep}">${escapeHtml(x.comp.name)}</th>`;
    });
    if (attendanceComp) {
      compGroupRow += `<th rowspan="2" class="attendance-col month-sep"><span class="c-vert">${escapeHtml(attendanceComp.comp.name)}</span></th>`;
    }
    if (monthlyComp) {
      compGroupRow += `<th rowspan="2" class="month-eval-col"><span class="c-vert">${escapeHtml(monthlyComp.comp.name || 'امتحان الشهر')}</span></th>`;
    }
    compGroupRow += `<th rowspan="2" class="grand-total-col"><span class="c-vert">المجموع الكلي</span></th>`;

    // صف 2: أسابيع + متوسط
    let weekRow = '';
    weeklyComps.forEach((x, i) => {
      weekNames.forEach((wn, wi) => {
        const out = weekOutCls(wi);
        const sep = (i === 0 && wi === 0) ? (' class="week-sep-left' + out + '"') : (out ? (' class="' + out.trim() + '"') : '');
        const dateStr = formatWeekDateAr(weekDates[wi]);
        const label = ((typeof isWeekExcluded === 'function' ? isWeekExcluded(term, month - 1, wi) : (wi >= scopeWeeks)) ? (wn + ' — خارج الرصد') : (dateStr ? (wn + ' (' + dateStr + ')') : wn));
        weekRow += `<th${sep}><span class="c-vert">${escapeHtml(label)}</span></th>`;
      });
      weekRow += `<th class="avg-col"><span class="c-vert">المتوسط</span></th>`;
    });

    // صف 3: الدرجات العظمى
    let maxRow = '';
    weeklyComps.forEach((x, i) => {
      const mx = x.comp.maxScore == null ? '—' : hindi(x.comp.maxScore);
      for (let wi = 0; wi < weekCount; wi++) {
        const out = weekOutCls(wi);
        const sep = (i === 0 && wi === 0) ? (' class="week-sep-left' + out + '"') : (out ? (' class="' + out.trim() + '"') : '');
        maxRow += `<th${sep}>${(typeof isWeekExcluded === 'function' ? isWeekExcluded(term, month - 1, wi) : (wi >= scopeWeeks)) ? '—' : mx}</th>`;
      }
      maxRow += `<th class="avg-col">${mx}</th>`;
    });
    if (attendanceComp) {
      maxRow += `<th class="attendance-col month-sep">${attendanceComp.comp.maxScore == null ? '—' : hindi(attendanceComp.comp.maxScore)}</th>`;
    }
    if (monthlyComp) {
      maxRow += `<th class="month-eval-col">${monthlyComp.comp.maxScore == null ? '—' : hindi(monthlyComp.comp.maxScore)}</th>`;
    }
    maxRow += `<th class="grand-total-col">${hindi(grandMax)}</th>`;

    const theadHtml = `<tr class="week-row">${compGroupRow}</tr><tr class="comp-row">${weekRow}</tr><tr class="max-row">${maxRow}</tr>`;

    // جسم فارغ للتعبئة اليدوية
    const emptyCell = '<td class="blank-cell"></td>';
    let bodyHtml = '';
    const list = students.length ? students : [{ name: '', seat: '' }];
    list.forEach((s, idx) => {
      let row = `<tr>`;
      row += `<td class="serial-col">${hindi(idx + 1)}</td>`;
      row += `<td>${escapeHtml(String(s.seat || ''))}</td>`;
      row += `<td class="name-col">${escapeHtml(s.name || '')}</td>`;
      weeklyComps.forEach(() => {
        for (let wi = 0; wi < weekCount; wi++) row += (typeof isWeekExcluded === 'function' ? isWeekExcluded(term, month - 1, wi) : (wi >= scopeWeeks)) ? '<td class="blank-cell week-out-of-scope"></td>' : emptyCell;
        row += emptyCell; // متوسط
      });
      if (attendanceComp) row += emptyCell;
      if (monthlyComp) row += emptyCell;
      row += emptyCell; // مجموع كلي
      row += `</tr>`;
      bodyHtml += row;
    });

    const metaBarHtml = [
      `<span><strong>المادة:</strong> ${escapeHtml(subjectName)}</span>`,
      `<span><strong>الفصل:</strong> ${escapeHtml(classLabel)}</span>`,
      `<span><strong>${termLabel}</strong> — ${escapeHtml(monthLabel)}</span>`,
      teacherName ? `<span><strong>المعلم:</strong> ${escapeHtml(teacherName)}</span>` : ''
    ].filter(Boolean).join('');

    const letterhead = (typeof buildUnifiedLetterhead === 'function')
      ? buildUnifiedLetterhead({
          title: 'كشف رصد درجات — أسابيع + امتحان الشهر',
          subtitleRight: termLabel,
          subtitleLeft: monthLabel,
          printedBy, printDate,
          governorate: info.governorate || '',
          educationAdmin: info.educationAdmin || '',
          schoolName: info.schoolName || '',
          academicYear: info.academicYear || '',
          metaBarHtml
        })
      : `<div style="text-align:center;font-weight:900;margin-bottom:3mm">كشف رصد درجات</div>`;

    const footer = (typeof buildUnifiedFooter === 'function')
      ? buildUnifiedFooter({ captions: [
          'معلم المادة' + (teacherName ? ': ' + teacherName : ''),
          'وكيل المرحلة',
          'مدير المرحلة'
        ] })
      : '';

    pagesHtml += `<div class="grade-sheet-page detailed-sheet-page blank-weekly-sheet" style="page-break-after:always;padding:5mm 6mm;direction:rtl;box-sizing:border-box">
      ${letterhead}
      <table class="grade-sheet-table detailed-weekly-table" style="width:100%;border-collapse:collapse;border:2px solid #3f7a57;table-layout:fixed;font-size:9px">
        <colgroup>${colgroupHtml}</colgroup>
        <thead>${theadHtml}</thead>
        <tbody>${bodyHtml}</tbody>
      </table>
      ${footer}
    </div>`;
  });

  const area = document.getElementById('printGradeSheetArea') || document.getElementById('printAttendanceArea');
  if (!area) { alert('تعذر العثور على منطقة الطباعة.'); return; }
  if (typeof clearInactivePrintAreas === 'function') clearInactivePrintAreas(area.id);
  area.innerHTML = pagesHtml;
  try { fitPrintPageFillHeight(area, '.grade-sheet-page, .detailed-sheet-page, .blank-weekly-sheet'); } catch (e) { console.warn(e); }
  const prev = document.title;
  document.title = 'كشف رصد درجات — أسابيع وامتحان الشهر';
  window.print();
  setTimeout(() => {
    document.title = prev;
    if (typeof clearAllPrintAreas === 'function') clearAllPrintAreas();
  }, 800);
}



async function printBlankAttendanceBatch() {
  if (!canAccessPrintCenter()) {
    alert('مركز الطباعة متاح للإدارة ومدير المرحلة فقط.');
    return;
  }
  const classes = pcGetChecked('pcAttClassList', 'data-class');
  const subjectNames = pcGetChecked('pcAttSubjectList', 'data-subject');
  const term = (document.getElementById('pcAttTerm') || {}).value || 'first';
  const month = parseInt((document.getElementById('pcAttMonth') || {}).value || '1', 10);
  if (!classes.length || !subjectNames.length) {
    alert('يرجى تحديد فصل واحد على الأقل ومادة واحدة على الأقل.');
    return;
  }
  const jobs = [];
  classes.forEach(cls => subjectNames.forEach(sn => jobs.push({ cls, sn })));
  if (jobs.length > 40) {
    if (!(await showConfirm('سيتم طباعة ' + jobs.length + ' كشف مواظبة. متابعة؟'))) return;
  }
  // بناء كل الصفحات في منطقة الطباعة دفعة واحدة عبر استدعاء منطق داخلي
  if (typeof printAttendanceSheetBatchInternal === 'function') {
    printAttendanceSheetBatchInternal(jobs, term, month, true);
    return;
  }
  printAttendanceSheetBatchInternal(jobs, term, month, true);
}



// بناء دفعة كشوف مواظبة (فارغة أو بالبيانات) دون الاعتماد على فلاتر تبويب الحضور
// تظليل أيام خارج التدريس إن ضبط المعلم أيام الدراسة للمادة/الفصل؛ وإلا بدون تظليل إضافي
function printAttendanceSheetBatchInternal(jobs, term, month, blank) {
  const db = loadDB();
  const att = (typeof ensureAttendance === 'function') ? ensureAttendance(db) : (db.attendance || {});
  const area = document.getElementById('printAttendanceArea');
  if (!area) { alert('تعذر العثور على منطقة الطباعة.'); return; }
  if (typeof clearInactivePrintAreas === 'function') clearInactivePrintAreas('printAttendanceArea');

  let pagesHtml = '';
  jobs.forEach(job => {
    const f = {
      term: term,
      month: month,
      subjectName: job.sn,
      classKey: job.cls
    };
    pagesHtml += GSP.buildAttendanceSheetPagesHtml(db, att, f, !!blank);
  });
  if (!pagesHtml) {
    alert('لا توجد صفحات للطباعة.');
    return;
  }
  area.innerHTML = pagesHtml;
  try { fitPrintPageFillHeight(area, '.att-print-page'); } catch (e) { console.warn(e); }
  const prev = document.title;
  document.title = 'بيان المواظبة اليومى';
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.title = prev;
      if (typeof clearAllPrintAreas === 'function') clearAllPrintAreas();
    }, 800);
  }, 80);
}


GSP.printAttendanceSheetBatchInternal = printAttendanceSheetBatchInternal;





// صلاحية طباعة/تصدير كشوف أعمال السنة الكنترولية: رئيس الكنترول، مسؤول الحاسب، مدير المرحلة
function canAccessTermTotalsPrint() {
  return currentAccountType === 'superadmin'
    || currentAccountType === 'stageadmin'
    || currentAccountType === 'monitor';
}
