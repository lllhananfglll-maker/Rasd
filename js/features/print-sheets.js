/** features/print-sheets.js — مدمج بالكامل (المرحلة C) — لا أجزاء part* متبقية */
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
    box.innerHTML = '<div style="color:var(--rasd-text-subtle);font-size:13px">لا توجد فصول بعد.</div>';
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
    box.innerHTML = '<div style="color:var(--rasd-text-subtle);font-size:13px">لا توجد مواد بعد.</div>';
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


// طباعة كشف أعمال سنة متتالٍ: م / رقم الجلوس / الاسم / مجموع كل مادة
// صفحة A4 بهوية النظام الموحّدة، بحد أقصى 40 طالباً في الصفحة،
// وتذييل كل صفحة: وكيل المرحلة (يمين) + مدير المرحلة (يسار) مع خطوط توقيع حي.
async function printTermTotalsSheet(term) {
  try {
    if (!canAccessTermTotalsPrint()) {
      alert('طباعة كشف أعمال السنة متاحة لرئيس الكنترول ومسؤول الحاسب ومدير المرحلة فقط.');
      return;
    }
    const db = loadDB();
    if (!db.students.length || !db.subjects.length) {
      alert('لا توجد بيانات كافية للطباعة. يرجى رفع ملف ومعالجته أولاً.');
      return;
    }
    const sel = document.getElementById('termTotalsGradeSelectPc')
      || document.getElementById('termTotalsGradeSelectMon')
      || document.getElementById('termTotalsGradeSelect')
      || document.getElementById('exportGradeSelect');
    const gradeKey = sel ? sel.value : '';
    if (!gradeKey) {
      alert('يرجى اختيار الصف المطلوب من قائمة الصف أولاً.');
      return;
    }
    const meta = (db.metaByGrade || {})[gradeKey] || {};
    const grade = meta.grade || gradeKey || '';
    const section = meta.section || '';
    const info = db.schoolInfo || {};
    const termLabel = term === 'first' ? 'الفصل الدراسي الأول' : 'الفصل الدراسي الثاني';

    const subjects = (db.subjects || []).filter(subj => {
      if ((subj.name || '').trim() === 'نوع') return false;
      return subjectAppliesToGradeSection(subj, grade, section);
    });
    if (!subjects.length) {
      alert('لا توجد مواد مسجّلة لهذا الصف/القسم.');
      return;
    }

    const students = db.students
      .filter(s => !gradeKey || (s.grade === grade && s.section === section))
      .sort((a, b) => (parseInt(a.seat, 10) || 0) - (parseInt(b.seat, 10) || 0) || a.name.localeCompare(b.name, 'ar'));
    if (!students.length) {
      alert('لا يوجد طلاب لهذا الصف.');
      return;
    }

    {
      const controlMonths = getMonthLabels(term).map((_, i) => i + 1);
      const controlCells = [];
      subjects.forEach(subj => {
        const comps = (subj.components || []).map((c, ci) => ({ index: ci, name: c.name, type: c.type }))
          .filter(c => c.type !== 'attendance');
        if (!comps.length) return;
        controlCells.push(...buildCellsForCheck(students, subj.name, comps, term, controlMonths));
      });
      if (!(await confirmProceedDespiteMissingGrades(db, controlCells))) return;
    }

    const hindi = (typeof toHindiDigits === 'function') ? toHindiDigits : (v => String(v));
    const printedBy = (typeof resolvePrintedByName === 'function') ? resolvePrintedByName() : 'المستخدم';
    const printDate = new Date().toLocaleDateString('ar-EG');
    const SECTION_LABEL = { arabic: 'عربي', languages: 'لغات' };
    const sectionLabel = SECTION_LABEL[section] || section || '';
    const stageLabel = (typeof getStageRecord === 'function' && typeof stageDisplayLabel === 'function' && currentStageId)
      ? stageDisplayLabel(getStageRecord(currentStageId)) : '';

    // صفوف مضغوطة موحّدة الارتفاع لتسع 40 طالباً + ترويسة + تذييل في صفحة A4 واحدة
    const ROW_H = '4.55mm';
    const thStyle = 'border:1px solid #94a3b8;padding:0.7mm 0.4mm;background:#3f7a57;color:#fff;font-weight:800;text-align:center;font-size:8px;line-height:1.2;vertical-align:middle;';
    const tdStyle = 'border:1px solid #94a3b8;padding:0 0.4mm;text-align:center;font-size:9px;height:' + ROW_H + ';max-height:' + ROW_H + ';line-height:' + ROW_H + ';vertical-align:middle;overflow:hidden;';
    const tdName = 'border:1px solid #94a3b8;padding:0 1.2mm;text-align:right;font-size:9px;font-weight:600;height:' + ROW_H + ';max-height:' + ROW_H + ';line-height:' + ROW_H + ';vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

    function formatSubjectHeaderHtml(subj) {
      const maxT = (typeof subjectAcademicMaxTotal === 'function')
        ? subjectAcademicMaxTotal(subj)
        : (subj.components || []).filter(c => c.type !== 'attendance').reduce((s, c) => s + (Number(c.maxScore) || 0), 0);
      const raw = String(subj.exportName || subj.name || '').trim();
      const words = raw.split(/\s+/).filter(Boolean);
      let line1 = raw, line2 = '';
      if (words.length >= 2) {
        const mid = Math.ceil(words.length / 2);
        line1 = words.slice(0, mid).join(' ');
        line2 = words.slice(mid).join(' ');
      } else if (raw.length > 8) {
        const mid = Math.ceil(raw.length / 2);
        line1 = raw.slice(0, mid);
        line2 = raw.slice(mid);
      }
      return `<th style="${thStyle}">`
        + `<div style="font-weight:800">${escapeHtml(line1)}</div>`
        + (line2 ? `<div style="font-weight:800">${escapeHtml(line2)}</div>` : '')
        + `<div style="font-weight:600;font-size:7.5px;opacity:.95">(${hindi(maxT)})</div>`
        + `</th>`;
    }
    const subjectHeaders = subjects.map(formatSubjectHeaderHtml).join('');

    const PAGE_SIZE = 40;
    const pages = [];
    for (let start = 0; start < students.length; start += PAGE_SIZE) {
      pages.push(students.slice(start, start + PAGE_SIZE));
    }

    const metaBarHtml = [
      `<span><strong>الصف:</strong> ${escapeHtml(grade)}</span>`,
      sectionLabel ? `<span><strong>القسم:</strong> ${escapeHtml(sectionLabel)}</span>` : '',
      stageLabel ? `<span><strong>المرحلة:</strong> ${escapeHtml(stageLabel)}</span>` : '',
      `<span><strong>الفصل الدراسي:</strong> ${termLabel}</span>`,
      `<span><strong>عدد الطلاب:</strong> ${hindi(students.length)}</span>`
    ].filter(Boolean).join('');

    const letterhead = (typeof buildUnifiedLetterhead === 'function')
      ? buildUnifiedLetterhead({
          title: 'كشف أعمال السنة — مجاميع المواد',
          subtitleRight: termLabel,
          subtitleLeft: '',
          printedBy,
          printDate,
          governorate: info.governorate || '',
          educationAdmin: info.educationAdmin || '',
          schoolName: info.schoolName || '',
          academicYear: info.academicYear || '',
          metaBarHtml
        })
      : `<div style="text-align:center;font-weight:900;font-size:15px;margin-bottom:2mm">كشف أعمال السنة — مجاميع المواد</div>`;

    const footer = `<div class="tt-footer">
      <div class="gs-sign">
        <div class="gs-sign-caption">وكيل المرحلة</div>
        <div class="gs-line"></div>
      </div>
      <div class="gs-sign">
        <div class="gs-sign-caption">مدير المرحلة</div>
        <div class="gs-line"></div>
      </div>
    </div>`;

    function termTotalForPrint(studentId, subj) {
      let total = 0, any = false, hasNumeric = false;
      (subj.components || []).forEach((comp, ci) => {
        if (comp.type === 'attendance') return;
        const v = computeFinalComponentScore(db, studentId, subj.name, ci, term, comp.name, comp.maxScore);
        if (v === null || v === undefined || v === '') return;
        any = true;
        if (typeof isIncompleteMark === 'function' && isIncompleteMark(v)) return;
        if (typeof isAbsentMark === 'function' && isAbsentMark(v)) return;
        const n = Number(v);
        if (!isNaN(n)) { total += n; hasNumeric = true; }
      });
      if (!any) return null;
      if (!hasNumeric) return (typeof ABSENT_MARK !== 'undefined' ? ABSENT_MARK : 'غ');
      return Math.round(total * 100) / 100;
    }

    let pagesHtml = '';
    pages.forEach((chunk, pageIdx) => {
      const rowCells = [];
      for (let i = 0; i < PAGE_SIZE; i++) {
        const s = chunk[i];
        const serial = pageIdx * PAGE_SIZE + i + 1;
        if (!s) {
          rowCells.push(`<tr style="height:${ROW_H}">
            <td style="${tdStyle}">${hindi(serial)}</td>
            <td style="${tdStyle}"></td>
            <td style="${tdName}"></td>
            ${subjects.map(() => `<td style="${tdStyle}"></td>`).join('')}
          </tr>`);
          continue;
        }
        const cells = subjects.map(subj => {
          const total = termTotalForPrint(s.id, subj);
          let cell = '';
          if (total === null) cell = '';
          else if (typeof isAbsentMark === 'function' && isAbsentMark(total)) cell = (typeof ABSENT_MARK !== 'undefined' ? ABSENT_MARK : 'غ');
          else cell = hindi(total);
          return `<td style="${tdStyle}">${cell}</td>`;
        }).join('');
        rowCells.push(`<tr style="height:${ROW_H}">
          <td style="${tdStyle}">${hindi(serial)}</td>
          <td style="${tdStyle}">${escapeHtml(String(s.seat || ''))}</td>
          <td style="${tdName}" title="${escapeHtml(s.name || '')}">${escapeHtml(s.name || '')}</td>
          ${cells}
        </tr>`);
      }

      const pageNo = pages.length > 1
        ? `<div style="text-align:center;font-size:8.5px;color:var(--rasd-text-muted);margin:0 0 1mm">صفحة ${hindi(pageIdx + 1)} من ${hindi(pages.length)}</div>`
        : '';

      // فئة مخصّصة فقط — بدون grade-sheet-page/detailed-sheet-page لتجنّب تعارض page-break
      pagesHtml += `<div class="term-totals-print-page">
        <div style="transform-origin:top center">${letterhead}</div>
        ${pageNo}
        <table class="tt-table">
          <colgroup>
            <col style="width:6mm">
            <col style="width:12mm">
            <col style="width:48mm">
            ${subjects.map(() => '<col>').join('')}
          </colgroup>
          <thead>
            <tr>
              <th style="${thStyle}">م</th>
              <th style="${thStyle}">رقم<br>الجلوس</th>
              <th style="${thStyle}">اسم الطالب</th>
              ${subjectHeaders}
            </tr>
          </thead>
          <tbody>${rowCells.join('')}</tbody>
        </table>
        ${footer}
      </div>`;
    });

    const area = document.getElementById('printGradeSheetArea') || document.getElementById('printAttendanceArea');
    if (!area) { alert('تعذر العثور على منطقة الطباعة.'); return; }
    if (typeof clearInactivePrintAreas === 'function') clearInactivePrintAreas(area.id);
    area.innerHTML = pagesHtml;
    try { fitPrintPageFillHeight(area, '.term-totals-print-page'); } catch (e) { console.warn(e); }
    const prevTitle = document.title;
    document.title = 'كشف أعمال السنة — ' + (grade || '') + ' — ' + termLabel;
    window.print();
    setTimeout(() => {
      document.title = prevTitle;
      if (typeof clearAllPrintAreas === 'function') clearAllPrintAreas();
    }, 800);
  } catch (err) {
    console.error('printTermTotalsSheet error:', err);
    alert('حدث خطأ أثناء تجهيز الطباعة:\n' + ((err && err.message) || err));
  }
}





function toHindiDigits(value) {
  const map = { '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤', '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩' };
  return String(value).replace(/[0-9]/g, d => map[d]);
}



// ========== ضبط تلقائي حقيقي لطباعة كشوف الدرجات (قياس ثم تصغير) ==========
// الطريقة القديمة كانت تُقدّر حجم الخط والحشو فقط من عدد الطلاب (rowCount)، وثبت عملياً أن هذا
// التقدير غير كافٍ: عند زيادة عدد مكونات المادة (أعمدة كثيرة) يضيق كل عمود فيلتف اسم المكوّن
// لأكثر من سطر داخل رأس الجدول، فيطول صف الرأس بشكل لا علاقة له بعدد الطلاب إطلاقاً، وقد يفيض
// الكشف لصفحة ثانية شبه فارغة رغم أن rowCount كان ضمن حدود "آمنة" نظرياً. الحل هنا: نحقن الكشف
// فعلياً (خارج حدود الشاشة المرئية بموضع fixed بعيد) بأقصى حجم، نقيس ارتفاعه الفعلي المُصيَّر عبر
// getBoundingClientRect، وإن كان أطول من ارتفاع صفحة A4 القابل للطباعة نُصغّر حجم الخط/الحشو
// تدريجياً (بحد أقصى 6 محاولات) حتى يستقر داخل حدود الصفحة، ثم نطبع. هذا يضبط تلقائياً أي توليفة
// من عدد طلاب/عدد مكونات مهما بلغت، بدل الاعتماد على حدود ثابتة مبنية على حالة واحدة فقط.
function gsSizesForScale(k) {
  const kMin = 0.42;
  const kk = Math.max(kMin, Math.min(1, k));
  const t = (kk - kMin) / (1 - kMin);
  const lerp = (max, min) => min + (max - min) * t;
  const lerpPad = (maxPad, minPad) => {
    const maxParts = maxPad.split(' ').map(v => parseFloat(v));
    const minParts = minPad.split(' ').map(v => parseFloat(v));
    return `${(minParts[0] + (maxParts[0] - minParts[0]) * t).toFixed(2)}mm ${(minParts[1] + (maxParts[1] - minParts[1]) * t).toFixed(2)}mm`;
  };
  return {
    tableFontSize: lerp(11, 5.5),
    cellPad: lerpPad('2mm 1.5mm', '0.35mm 0.5mm'),
    headerScale: lerp(1, 0.5),
    metaFontSize: lerp(12, 7),
    metaPad: lerpPad('3mm 4mm', '0.7mm 1.8mm'),
    lineHeight: lerp(1.2, 0.92),
    metaLineHeight: lerp(1.9, 1.25),
    footerScale: lerp(1, 0.45)
  };
}



function gsStyleTextFor(sizes) {
  return `
    .gs-scope .grade-sheet-table { font-size: ${sizes.tableFontSize}px; line-height: ${sizes.lineHeight}; }
    .gs-scope .grade-sheet-table th, .gs-scope .grade-sheet-table td { padding: ${sizes.cellPad}; }
    .gs-scope .grade-sheet-header { padding-bottom: ${6 * sizes.headerScale}mm; margin-bottom: ${5 * sizes.headerScale}mm; }
    .gs-scope .gs-title { font-size: ${18 * sizes.headerScale}px; }
    .gs-scope .gs-subtitle { font-size: ${13 * sizes.headerScale}px; }
    .gs-scope .gs-top-row { font-size: ${11 * sizes.headerScale}px; }
    .gs-scope .grade-sheet-meta { font-size: ${sizes.metaFontSize}px; padding: ${sizes.metaPad}; margin-bottom: ${4 * sizes.headerScale}mm; line-height: ${sizes.metaLineHeight}; }
    .gs-scope .grade-sheet-footer { margin-top: ${10 * sizes.footerScale}mm; font-size: ${(9 + 3 * sizes.footerScale).toFixed(1)}px; }
    .gs-scope .grade-sheet-footer .gs-sign .gs-line { margin-top: ${16 * sizes.footerScale}mm; }
    .gs-scope .detailed-letterhead { margin-bottom: ${4 * sizes.headerScale}mm; }
    .gs-scope .detailed-letterhead-strip { font-size: ${Math.max(6, 9 * sizes.headerScale)}px; padding: ${1.4 * sizes.headerScale}mm 3.5mm; }
    .gs-scope .detailed-lh-title { font-size: ${15 * sizes.headerScale}px; }
    .gs-scope .detailed-lh-subtitle { font-size: ${10.5 * sizes.headerScale}px; }
    .gs-scope .detailed-lh-side { font-size: ${10 * sizes.headerScale}px; line-height: 1.7; }
    .gs-scope .detailed-lh-meta-bar { font-size: ${10.5 * sizes.headerScale}px; padding: ${2 * sizes.headerScale}mm 4mm; }
    .gs-scope .detailed-lh-logo { width: ${15 * sizes.headerScale}mm; height: ${15 * sizes.headerScale}mm; font-size: ${16 * sizes.headerScale}px; }
    .gs-scope .detailed-letterhead-body { padding: ${3 * sizes.headerScale}mm 4mm ${3.5 * sizes.headerScale}mm; gap: ${3 * sizes.headerScale}mm; }
    .gs-scope .detailed-sheet-footer { margin-top: ${8 * sizes.footerScale}mm; font-size: ${Math.max(7, 10 * sizes.footerScale)}px; }
    .gs-scope .detailed-sheet-footer .gs-line { margin-top: ${12 * sizes.footerScale}mm; }
    .gs-scope .grade-sheet-table td.gs-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0; }
    .gs-scope .grade-sheet-table td.gs-score, .gs-scope .grade-sheet-table td.serial-col {
      white-space: nowrap; overflow: hidden; text-overflow: clip; max-width: 0;
    }
  `;
}



// innerBodyHtml: عنصر <div class="grade-sheet-page gs-scope">...</div> فقط (بدون وسم style)
function autoFitAndPrintGradeSheet(innerBodyHtml) {
  const area = document.getElementById('printGradeSheetArea');
  if (typeof clearInactivePrintAreas === 'function') clearInactivePrintAreas('printGradeSheetArea');
  const MM_TO_PX = 96 / 25.4; // معامل تحويل mm إلى px القياسي في CSS، لمطابقة قياس المتصفح الفعلي
  const maxHeightPx = (297 - 20) * MM_TO_PX * 0.985; // A4 ناقص هامش 10mm أعلى وأسفل + هامش أمان 1.5%
  const printableWidthMm = 210 - 20; // A4 ناقص هامش 10mm يمين ويسار

  // نضع منطقة الطباعة بموضع fixed خارج حدود الشاشة المرئية (بدل display:none) حتى يتسنى قياس
  // ارتفاعها الفعلي المُصيَّر؛ display:none لا يعطي أي أبعاد عند القياس (offsetHeight = 0 دائماً).
  area.style.cssText = `position:fixed; left:-9999px; top:0; display:block; width:${printableWidthMm}mm; margin:0; padding:0;`;

  let k = 1;
  let sizes = gsSizesForScale(k);
  area.innerHTML = `<style id="gsAutoFitStyle">${gsStyleTextFor(sizes)}</style>${innerBodyHtml}`;
  const styleTag = document.getElementById('gsAutoFitStyle');
  const page = area.querySelector('.grade-sheet-page');

  if (page) {
    for (let i = 0; i < 6; i++) {
      const h = page.getBoundingClientRect().height;
      if (h <= maxHeightPx || k <= 0.34) break;
      const ratio = maxHeightPx / h;
      k = Math.max(0.34, k * ratio * 0.97);
      sizes = gsSizesForScale(k);
      styleTag.textContent = gsStyleTextFor(sizes);
    }
  }

  area.removeAttribute('style');
  setTimeout(() => {
    window.print();
    setTimeout(() => { if (typeof clearAllPrintAreas === 'function') clearAllPrintAreas(); }, 800);
  }, 50);
}




// ترويسة موحّدة للهوية البصرية (كشف شهري + تفصيلي + متوسط)
function buildUnifiedLetterhead(opts) {
  const {
    title, subtitleRight, subtitleLeft, printedBy, printDate,
    governorate, educationAdmin, schoolName, academicYear,
    metaBarHtml
  } = opts;
  return `
      <div class="detailed-letterhead">
        <div class="detailed-letterhead-strip">
          <span>تاريخ الطباعة: ${toHindiDigits(printDate)}</span>
          <span>طُبع بواسطة: ${escapeHtml(printedBy || '')}</span>
        </div>
        <div class="detailed-letterhead-body">
          <div class="detailed-lh-side detailed-lh-right">
            ${governorate ? `<div><strong>المحافظة:</strong> ${escapeHtml(governorate)}</div>` : ''}
            ${educationAdmin ? `<div>${escapeHtml(educationAdmin)}</div>` : ''}
          </div>
          <div class="detailed-lh-center">
            <div class="detailed-lh-title">${escapeHtml(title)}</div>
            <div class="detailed-lh-subtitle">${escapeHtml(schoolName || '')}</div>
          </div>
          <div class="detailed-lh-logo">🏫</div>
          <div class="detailed-lh-side detailed-lh-left">
            ${academicYear ? `<div><strong>العام الدراسي:</strong> <bdi dir="ltr">${toHindiDigits(academicYear)}</bdi>${subtitleRight ? ' — ' + escapeHtml(subtitleRight) : ''}</div>` : (subtitleRight ? `<div>${escapeHtml(subtitleRight)}</div>` : '')}
            ${subtitleLeft ? `<div>${escapeHtml(subtitleLeft)}</div>` : ''}
          </div>
        </div>
        <div class="detailed-lh-divider"></div>
        <div class="detailed-lh-meta-bar">${metaBarHtml || ''}</div>
      </div>`;
}



function buildUnifiedFooter(opts) {
  // opts اختياري: { captions: ['...', '...', '...'] } لتخصيص تسميات التوقيع حسب نوع المستند
  const caps = (opts && Array.isArray(opts.captions) && opts.captions.length)
    ? opts.captions
    : ['توقيع مدرس الفصل', 'توقيع وكيل المرحلة', 'توقيع مدير المرحلة'];
  const signs = caps.map(c =>
    `<div class="gs-sign"><div class="gs-sign-caption">${escapeHtml(c)}</div><div class="gs-line"></div></div>`
  ).join('');
  return `<div class="detailed-sheet-footer">${signs}</div>`;
}



// إتاحة الترويسة والفوتر الموحّدين لباقي دوال الطباعة
GSP.buildUnifiedLetterhead = buildUnifiedLetterhead;


GSP.buildUnifiedFooter = buildUnifiedFooter;


// toHindiDigits و escapeHtml يأتيان من core/utils.js — لا نعيد تعريفهما هنا

/** اسم من قام بالطباعة حسب نوع الحساب الحالي */
function resolvePrintedByName() {
  try {
    if (typeof currentAccountType !== 'undefined') {
      if (currentAccountType === 'superadmin') return 'رئيس الكنترول';
      if (currentAccountType === 'monitor') return (currentStageMonitor && currentStageMonitor.name) || 'مدير المرحلة';
      if (currentAccountType === 'stageadmin') return (currentStageAdmin && currentStageAdmin.name) || 'مسؤول الحاسب';
      if (currentAccountType === 'teacher') return (currentTeacher && currentTeacher.name) || 'المعلم';
    }
    if (typeof currentRole !== 'undefined' && currentRole === 'admin') return 'مدير النظام';
    if (typeof currentTeacher !== 'undefined' && currentTeacher) return currentTeacher.name || 'المعلم';
  } catch (e) {}
  return 'المستخدم';
}


GSP.resolvePrintedByName = resolvePrintedByName;


/** تصغير الصفحة المطبوعة لتسع في A4 واحدة إن لزم، مع منع الصفحات الفارغة/المقطوعة */
/**
 * يوزّع ارتفاع صفوف الطلاب على كامل ارتفاع صفحة A4 المتاحة
 * بحيث تملأ الصفحة: ترويسة + جدول (كل الطلاب) + تذييل التوقيعات بدون فراغ كبير أسفل الجدول.
 * إن زاد المحتوى عن الصفحة يُستخدم تصغير خفيف (zoom) كخط دفاع أخير.
 */
function fitPrintPageFillHeight(area, pageSelector) {
  if (!area) return;
  const MM_TO_PX = 96 / 25.4;
  // ارتفاع محتوى A4 داخل الهوامش الافتراضية تقريباً
  const PAGE_H = 277 * MM_TO_PX;
  const prev = area.getAttribute('style') || '';
  area.style.cssText = 'position:fixed;left:-9999px;top:0;display:block;width:190mm;margin:0;padding:0;background:#fff;';

  area.querySelectorAll(pageSelector).forEach(page => {
    page.style.zoom = '';
    page.style.height = '';
    page.style.maxHeight = '';
    page.style.overflow = 'hidden';
    page.style.boxSizing = 'border-box';
    page.style.display = 'flex';
    page.style.flexDirection = 'column';

    const table = page.querySelector('table.att-print-table, table.grade-sheet-table, table.tt-table, table.detailed-weekly-table');
    if (!table) return;

    // العناصر خارج الجدول (ترويسة + رقم صفحة + تذييل + ملاحظة)
    const kids = Array.from(page.children);
    let chromeH = 0;
    kids.forEach(ch => {
      if (ch === table) return;
      chromeH += ch.getBoundingClientRect().height;
    });
    // مسافة داخلية تقريبية
    const pad = 8;
    let avail = PAGE_H - chromeH - pad;
    if (avail < 80) avail = 80;

    table.style.width = '100%';
    table.style.flex = '1 1 auto';
    table.style.height = avail + 'px';
    table.style.tableLayout = 'fixed';

    const thead = table.tHead;
    const tbody = table.tBodies && table.tBodies[0];
    if (!tbody || !tbody.rows.length) return;

    let headH = thead ? thead.getBoundingClientRect().height : 0;
    // إن كان thead لم يُحسب جيداً قبل العرض
    if (headH < 4 && thead) {
      headH = thead.rows.length * 18;
    }
    const bodyAvail = Math.max(40, avail - headH);
    const n = tbody.rows.length;
    const rowH = Math.max(12, bodyAvail / n);

    Array.from(tbody.rows).forEach(tr => {
      tr.style.height = rowH + 'px';
      tr.style.maxHeight = rowH + 'px';
      Array.from(tr.cells).forEach(td => {
        td.style.height = rowH + 'px';
        td.style.maxHeight = rowH + 'px';
        td.style.paddingTop = '0';
        td.style.paddingBottom = '0';
        td.style.verticalAlign = 'middle';
        td.style.overflow = 'hidden';
        td.style.lineHeight = '1.15';
        td.style.fontSize = Math.max(8, Math.min(11, rowH * 0.55)) + 'px';
      });
    });

    // إن ظلّت الصفحة أطول من A4: تصغير خفيف
    page.style.height = PAGE_H + 'px';
    let h = page.getBoundingClientRect().height;
    // بعد flex قد يختلف القياس — أعد القياس بدون height ثابت أولاً
    page.style.height = '';
    h = page.getBoundingClientRect().height;
    if (h > PAGE_H && h > 0) {
      const scale = Math.max(0.72, (PAGE_H / h) * 0.98);
      page.style.zoom = String(scale);
    }
  });

  area.setAttribute('style', prev);
  area.style.cssText = prev || '';
}


GSP.fitPrintPageFillHeight = fitPrintPageFillHeight;



function fitPrintPagesToA4(area, pageSelector) {
  if (!area) return;
  const MM_TO_PX = 96 / 25.4;
  const maxH = (297 - 18) * MM_TO_PX;
  const prev = area.getAttribute('style') || '';
  area.style.cssText = 'position:fixed;left:-9999px;top:0;display:block;width:190mm;margin:0;padding:0;';
  area.querySelectorAll(pageSelector).forEach(page => {
    page.style.zoom = '';
    page.style.marginBottom = '0';
    page.style.pageBreakAfter = 'avoid';
    page.style.pageBreakInside = 'avoid';
    page.style.breakInside = 'avoid';
    page.querySelectorAll('table th, table td').forEach(cell => {
      if (!cell.dataset._fitPad) {
        cell.dataset._fitPad = '1';
        const cs = GSP.getComputedStyle(cell);
        const pv = parseFloat(cs.paddingTop) || 0;
        const ph = parseFloat(cs.paddingLeft) || 0;
        if (pv > 2) cell.style.paddingTop = cell.style.paddingBottom = Math.max(1, pv * 0.7) + 'px';
        if (ph > 2) cell.style.paddingLeft = cell.style.paddingRight = Math.max(1, ph * 0.75) + 'px';
      }
    });
    let h = page.getBoundingClientRect().height;
    if (h > maxH && h > 0) {
      const scale = Math.max(0.38, (maxH / h) * 0.96);
      page.style.zoom = String(scale);
      h = page.getBoundingClientRect().height;
      if (h > maxH) {
        page.style.zoom = String(Math.max(0.32, (maxH / h) * 0.95 * (parseFloat(page.style.zoom) || 1)));
      }
    }
  });
  area.setAttribute('style', prev);
  area.style.cssText = prev || '';
}


GSP.fitPrintPagesToA4 = fitPrintPagesToA4;



async function printGradeSheet() {
  const db = loadDB();
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  const month = parseInt(document.getElementById('gradeMonthSelect').value, 10);

  if (!subjectName || !cls) { alert('يرجى اختيار المادة والفصل أولاً من قائمة الفلاتر.'); return; }
  const subject = db.subjects.find(s => s.name === subjectName);
  if (!subject) { alert('المادة غير موجودة.'); return; }
  if (!canAccessGrade(subjectName, cls)) { alert('غير مصرح لك بطباعة كشف درجات هذه المادة/الفصل.'); return; }

  let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
  students = filterStudentsForTeacherLanguage(students, subjectName, cls);
  if (students.length === 0) { alert('لا يوجد طلاب في هذا الفصل.'); return; }
  students.sort((a, b) => a.gender !== b.gender ? (a.gender === 'F' ? -1 : 1) : a.name.localeCompare(b.name));

  // فحص قبل الطباعة: هل توجد خانات درجات لم تُرصد بعد لهذا الشهر/المادة/الفصل؟
  const printGradeCells = buildCellsForCheck(students, subjectName,
    subject.components.map((c, ci) => ({ index: ci, name: c.name })), term, [month]);
  if (!(await confirmProceedDespiteMissingGrades(db, printGradeCells))) return;

  const { cls: clsPlain, section: clsSection } = splitClassSectionKey(cls);
  const info = db.schoolInfo || {};
  const monthLabels = getMonthLabels(term);
  const monthLabel = monthLabels[month - 1] || `الشهر ${month}`;
  const termLabel = term === 'first' ? 'الفصل الدراسي الأول' : 'الفصل الدراسي الثاني';
  // اسم/أسماء المعلمين المسؤولين عن هذه المادة/الفصل (قد يكون أكثر من معلم واحد لمادة اللغة الثانية،
  // كل منهم مخصص للغة مختلفة)، يظهر دائماً بغض النظر عمن يقوم بالطباعة فعلياً
  const assignedTeachers = (db.teachers || []).filter(t => (t.assignments || []).some(a => a.subjectName ===
    subjectName && (a.classes || []).includes(cls)));
  const teacherName = assignedTeachers.length ?
    assignedTeachers.map(t => { const lt = teacherLanguageTypeForSubject(t, subjectName, cls);
      return lt ? `${escapeHtml(t.name)} (${escapeHtml(lt)})` : escapeHtml(t.name); }).join('، ') :
    (currentRole === 'teacher' && currentTeacher ? escapeHtml(currentTeacher.name) : '');
  // اسم/صفة من قام بالطباعة فعلياً الآن (مدير النظام أو المعلم الذي سجّل دخوله)
  const printedBy = currentRole === 'admin' ? 'مدير النظام' : escapeHtml((currentTeacher && currentTeacher.name) || 'المعلم');
  const principalName = info.principalName || '';
  const now = new Date();
  const printDate = now.toLocaleDateString('ar-EG');
  const printTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const metaParts = [];
  if (info.schoolName) metaParts.push(`<span><strong>المدرسة:</strong> ${escapeHtml(info.schoolName)}</span>`);
  if (info.governorate) metaParts.push(`<span><strong>المحافظة:</strong> ${escapeHtml(info.governorate)}</span>`);
  if (info.educationAdmin) metaParts.push(`<span><strong>الإدارة التعليمية:</strong> ${escapeHtml(info.educationAdmin)}</span>`);
  if (info.academicYear) metaParts.push(`<span><strong>العام الدراسي:</strong> ${toHindiDigits(info.academicYear)}</span>`);
  metaParts.push(`<span><strong>الفصل الدراسي:</strong> ${termLabel}</span>`);
  metaParts.push(`<span><strong>الشهر:</strong> ${monthLabel}</span>`);
  const classGradeLabelForPrint = (db.classGrade && db.classGrade[cls]) || info.grade || '';
  const entityLbl = getActiveStageEntityLabel() || stageEntityLabelFromParts(info.stageType, clsSection || info.classLanguage);
  if (entityLbl) metaParts.push(`<span><strong>المرحلة:</strong> ${escapeHtml(entityLbl)}</span>`);
  if (classGradeLabelForPrint) metaParts.push(`<span><strong>الصف:</strong> ${escapeHtml(classGradeLabelForPrint)}</span>`);
  metaParts.push(`<span><strong>الفصل/الشعبة:</strong> ${toHindiDigits(clsPlain)}</span>`);
  metaParts.push(`<span><strong>المادة:</strong> ${escapeHtml(subjectName)}</span>`);
  if (teacherName) metaParts.push(`<span><strong>المعلم:</strong> ${teacherName}</span>`);

  // أعمدة الجدول: تم الاستغناء عن الرقم القومي ورقم الجلوس بناءً على طلب المستخدم، وتم توسيع
  // عمود اسم الطالب (36% بدل 26%) ليتسع لمعظم الأسماء الرباعية/الخماسية الطويلة بسطر واحد بدل
  // الالتفاف لسطرين (وهو ما كان يُطيل الصف ويهدد ثبات الكشف في صفحة واحدة)، مع تقليص عمودي
  // "م" و"المجموع" قليلاً لتعويض المساحة، ويتم توزيع عرض أعمدة المكونات بالتساوي فيما تبقى
  // عبر colgroup + table-layout:fixed.
  const numColPct = 5;
  const sumColPct = 8;
  const nameColPct = 36;
  const compCount = subject.components.length;
  const compColPct = compCount > 0 ? ((100 - numColPct - sumColPct - nameColPct) / compCount) : 0;

  let colgroupHtml = `<col style="width:${numColPct}%">` + `<col style="width:${nameColPct}%">`;
  subject.components.forEach(() => { colgroupHtml += `<col style="width:${compColPct}%">`; });
  colgroupHtml += `<col style="width:${sumColPct}%">`;

  // رأس الجدول من صف واحد فقط (بدون rowspan/colspan): كل عمود مكوّن يعرض اسمه والدرجة العظمى
  // له في سطرين داخل نفس الخلية. تم التخلي عمداً عن الرأس السابق ذي المستويين (عنوان "مكونات
  // المادة" الممتد فوق الأعمدة عبر rowspan/colspan) لأنه كان السبب في خلل طباعة خطير: عند تكرار
  // المتصفح لرأس الجدول تلقائياً، كان يُخرج رأساً أول فارغاً تماماً من النصوص ثم رأساً ثانياً
  // مكرراً في منتصف الجدول، وتختفي بصرياً عدة صفوف بيانات (طلاب) رغم بقائها في نص ملف PDF.
  // صف رأس واحد بسيط يزيل هذا الخلل نهائياً بأي متصفح. جميع الأرقام (الدرجة العظمى هنا، ومسلسل
  // الطالب ودرجاته لاحقاً) تُعرض بالأرقام الهندية (٠١٢٣٤٥٦٧٨٩) في الكشف المطبوع فقط عبر toHindiDigits.
  let theadHtml = `<tr>
    <th class="serial-col">م</th>
    <th>اسم الطالب</th>`;
  subject.components.forEach(c => { theadHtml += `<th><span class="gs-comp-name">${escapeHtml(c.name)}</span><span class="gs-comp-max">(من ${c.maxScore === null || c.maxScore === undefined ? 'بدون حد' : toHindiDigits(c.maxScore)})</span></th>`; });
  theadHtml += `<th class="grand-total-col">المجموع</th></tr>`;

  let bodyHtml = '';
  students.forEach((s, idx) => {
    let sum = 0, hasAny = false, hasNumeric = false;
    let cellsHtml = '';
    subject.components.forEach((comp, ci) => {
      const existing = db.grades.find(g => g.studentId === s.id && g.subjectName === subjectName && g
        .term === term && g.month === month && g.componentIndex === ci);
      const val = existing ? existing.score : '';
      // مكوّن الحضور/الغياب يُعرض في عموده لكنه لا يُضاف لعمود "المجموع" الأكاديمي. وإذا كان الطالب
      // غائباً ("غ") في مكوّن ما تُستبعد "غ" من المجموع (لا تُحتسب صفراً) وتبقى ظاهرة في خانتها.
      if (existing && comp.type !== 'attendance') {
        hasAny = true;
        if (!isAbsentMark(existing.score)) { sum += existing.score; hasNumeric = true; }
      }
      cellsHtml += `<td class="gs-score">${val === '' ? '' : toHindiDigits(val)}</td>`;
    });
    const totalDisplay = !hasAny ? '' : (hasNumeric ? toHindiDigits(sum) : ABSENT_MARK);
    bodyHtml += `<tr>
      <td class="serial-col">${toHindiDigits(idx + 1)}</td>
      <td class="gs-name">${escapeHtml(s.name)}</td>
      ${cellsHtml}
      <td class="gs-score grand-total-col"><strong>${totalDisplay}</strong></td>
    </tr>`;
  });

  const metaBarHtml = [
    `<span>${formatClassSectionForPrint(classGradeLabelForPrint, clsSection, clsPlain)}</span>`,
    `<span><strong>المادة:</strong> ${escapeHtml(subjectName)}${teacherName ? ' — <strong>المعلم:</strong> ' + teacherName : ''}</span>`,
    `<span><strong>الشهر:</strong> ${monthLabel}</span>`
  ].join('');

  const pageHtml = `
    <div class="grade-sheet-page gs-scope">
      ${buildUnifiedLetterhead({
        title: 'كشف رصد درجات — ' + subjectName,
        subtitleRight: 'درجات (' + monthLabel + ')',
        subtitleLeft: termLabel,
        printedBy,
        printDate,
        governorate: info.governorate || '',
        educationAdmin: info.educationAdmin || '',
        schoolName: info.schoolName || '',
        academicYear: info.academicYear || '',
        metaBarHtml
      })}
      <table class="grade-sheet-table">
        <colgroup>${colgroupHtml}</colgroup>
        <thead>${theadHtml}</thead>
        <tbody>${bodyHtml}</tbody>
      </table>
      ${buildUnifiedFooter()}
    </div>`;

  autoFitAndPrintGradeSheet(pageHtml);
}



// ========== كشف رصد درجات تفصيلي (توزيع الدرجة على 4 أسابيع) ==========
// الدرجة التي رصدها المعلم تُفرَد على الأسابيع الأربعة بنفس القيمة حتى يكون متوسطها = الدرجة الأصلية.
// إن كانت "غ" تظهر "غ" في كل الأسابيع. المكوّنات الأسبوعية تُكرَّر؛ المواظبة والتقييم الشهري تظهر مرة واحدة.
function getWeek1DateISO(term, monthIndex0) {
  const db = loadDB();
  const w1 = (db.schoolInfo && db.schoolInfo.week1Dates) || {};
  const arr = w1[term] || [];
  return arr[monthIndex0] || '';
}



function formatWeekDateAr(isoDate) {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return toHindiDigits(isoDate);
    // YYYY/M/D بأرقام هندية
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return toHindiDigits(`${y}/${m}/${day}`);
  } catch (e) { return toHindiDigits(isoDate); }
}



function shiftISODateDays(isoDate, days) {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (e) { return ''; }
}



function getFourWeekDates(term, monthIndex0) {
  // دائماً 4 أسابيع للعرض؛ التظليل للكشف عن خارج نطاق الرصد
  const w1 = getWeek1DateISO(term, monthIndex0);
  if (!w1) return ['', '', '', ''];
  return [0, 1, 2, 3].map(i => shiftISODateDays(w1, i * 7));
}



function getPeriodWeekCount(term, monthIndex0) {
  try {
    const p = getRecordingPeriod(term, monthIndex0);
    const ex = normalizeExcludedWeeks(p);
    return Math.max(0, 4 - ex.length);
  } catch (e) {}
  return 4;
}



function periodHasMonthlyExam(term, monthIndex0) {
  try {
    const p = getRecordingPeriod(term, monthIndex0);
    if (p) return !!p.hasExam;
  } catch (e) {}
  return true;
}



// ضبط تلقائي ليتسع كشف الدرجات التفصيلي في صفحة A4 واحدة فقط مهما كان عدد الطلاب.
function dsSizesForScale(k) {
  const kMin = 0.38;
  const kk = Math.max(kMin, Math.min(1, k));
  const t = (kk - kMin) / (1 - kMin);
  const lerp = (max, min) => min + (max - min) * t;
  return {
    tableFontSize: lerp(8.8, 4.5),
    cellPadV: lerp(0.7, 0.12),
    cellPadH: lerp(0.2, 0.08),
    nameFontSize: lerp(8.4, 4.6),
    scoreFontSize: lerp(8.2, 4.4),
    serialFontSize: lerp(8, 4.5),
    compHeaderH: lerp(26, 12),
    vertFontSize: lerp(8.6, 5.2),
    weekFontSize: lerp(9.5, 5.5),
    dateFontSize: lerp(7.6, 4.8),
    maxFontSize: lerp(9, 5),
    letterheadScale: lerp(1, 0.55),
    footerScale: lerp(1, 0.4),
    footerMargin: lerp(8, 3),
    signLine: lerp(12, 5)
  };
}



function dsStyleTextFor(sizes) {
  return `
    .ds-scope .detailed-weekly-table { font-size: ${sizes.tableFontSize}px; }
    .ds-scope .detailed-weekly-table th,
    .ds-scope .detailed-weekly-table td {
      padding: ${sizes.cellPadV}mm ${sizes.cellPadH}mm;
    }
    .ds-scope .detailed-weekly-table td.gs-name {
      font-size: ${sizes.nameFontSize}px;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      max-width: 0;
    }
    .ds-scope .detailed-weekly-table td.gs-score {
      font-size: ${sizes.scoreFontSize}px;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: clip !important;
      max-width: 0;
    }
    .ds-scope .detailed-weekly-table td.serial-col,
    .ds-scope .detailed-weekly-table th.serial-col {
      font-size: ${sizes.serialFontSize}px;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: clip !important;
      max-width: 0;
    }
    .ds-scope .detailed-weekly-table thead tr.comp-row th { height: ${sizes.compHeaderH}mm; }
    .ds-scope .detailed-weekly-table thead .c-vert { font-size: ${sizes.vertFontSize}px; }
    .ds-scope .detailed-weekly-table thead tr.week-row th .w-name { font-size: ${sizes.weekFontSize}px; }
    .ds-scope .detailed-weekly-table thead tr.week-row th .w-date { font-size: ${sizes.dateFontSize}px; }
    .ds-scope .detailed-weekly-table thead tr.max-row th { font-size: ${sizes.maxFontSize}px; }
    .ds-scope .detailed-letterhead-strip { font-size: ${Math.max(6, 9 * sizes.letterheadScale)}px; padding: ${1.4 * sizes.letterheadScale}mm 3.5mm; }
    .ds-scope .detailed-lh-title { font-size: ${15 * sizes.letterheadScale}px; }
    .ds-scope .detailed-lh-subtitle { font-size: ${10.5 * sizes.letterheadScale}px; }
    .ds-scope .detailed-lh-side { font-size: ${10 * sizes.letterheadScale}px; line-height: 1.7; }
    .ds-scope .detailed-lh-meta-bar { font-size: ${10.5 * sizes.letterheadScale}px; padding: ${2 * sizes.letterheadScale}mm 4mm; }
    .ds-scope .detailed-lh-logo { width: ${15 * sizes.letterheadScale}mm; height: ${15 * sizes.letterheadScale}mm; font-size: ${16 * sizes.letterheadScale}px; }
    .ds-scope .detailed-letterhead-body { padding: ${3 * sizes.letterheadScale}mm 4mm ${3.5 * sizes.letterheadScale}mm; gap: ${3 * sizes.letterheadScale}mm; }
    .ds-scope .detailed-letterhead { margin-bottom: ${4 * sizes.letterheadScale}mm; }
    .ds-scope .detailed-sheet-footer { margin-top: ${sizes.footerMargin}mm; font-size: ${Math.max(7, 10 * sizes.footerScale)}px; }
    .ds-scope .detailed-sheet-footer .gs-line { margin-top: ${sizes.signLine}mm; }
    .ds-scope .detailed-sheet-footer .gs-sign { min-width: ${42 * sizes.footerScale}mm; }
  `;
}



function printDetailedAndFitOnePage(innerBodyHtml) {
  const area = document.getElementById('printGradeSheetArea');
  if (typeof clearInactivePrintAreas === 'function') clearInactivePrintAreas('printGradeSheetArea');
  const MM_TO_PX = 96 / 25.4;
  // هامش صفحة الطباعة 8mm كما في النموذج + هامش أمان
  const maxHeightPx = (297 - 16) * MM_TO_PX * 0.98;
  const printableWidthMm = 210 - 16;

  area.style.cssText = `position:fixed; left:-9999px; top:0; display:block; width:${printableWidthMm}mm; margin:0; padding:0;`;

  let k = 1;
  let sizes = dsSizesForScale(k);
  area.innerHTML = `<style id="dsAutoFitStyle">${dsStyleTextFor(sizes)}</style>${innerBodyHtml}`;
  const styleTag = document.getElementById('dsAutoFitStyle');
  const page = area.querySelector('.detailed-sheet-page');

  if (page) {
    for (let i = 0; i < 8; i++) {
      const h = page.getBoundingClientRect().height;
      if (h <= maxHeightPx || k <= 0.32) break;
      const ratio = maxHeightPx / h;
      k = Math.max(0.32, k * ratio * 0.96);
      sizes = dsSizesForScale(k);
      styleTag.textContent = dsStyleTextFor(sizes);
    }
  }

  area.removeAttribute('style');
  setTimeout(() => { window.print(); }, 50);
}



function gradingModeKey(term, month) { return String(term || 'first') + '|' + String(month || 1); }


function ensureStageSettings(db) {
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  if (!db.settings.gradingFormModeByMonth || typeof db.settings.gradingFormModeByMonth !== 'object')
    db.settings.gradingFormModeByMonth = {};
  return db.settings;
}


function getGradingFormMode(db, term, month) {
  const v = ensureStageSettings(db).gradingFormModeByMonth[gradingModeKey(term, month)];
  return (v === 'weekly_form') ? 'weekly_form' : 'monthly';
}

function countCompletedFormWeeks(term, month, asOfDate) {
  const asOf = asOfDate || new Date();
  const weekDates = (typeof getFourWeekDates === 'function') ? getFourWeekDates(term, month - 1) : [];
  let n = 0;
  for (let i = 0; i < 4; i++) {
    const wiso = weekDates[i];
    if (!wiso) { n = 4; break; }
    const start = new Date(wiso + 'T12:00:00');
    if (isNaN(start.getTime())) { n = 4; break; }
    if (asOf >= start) n = i + 1;
  }
  return Math.min(4, Math.max(1, n));
}


GSP.getGradingFormMode = getGradingFormMode;


GSP.setGradingFormMode = function(term, month, mode) {
  if (!(currentAccountType === 'monitor' || currentAccountType === 'superadmin')) return false;
  const db = loadDB();
  ensureStageSettings(db).gradingFormModeByMonth[gradingModeKey(term, month)] = (mode === 'weekly_form') ? 'weekly_form' : 'monthly';
  saveDB(db);
  return true;
};


async function printDetailedGradeSheet() {
  const db = loadDB();
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  const month = parseInt(document.getElementById('gradeMonthSelect').value, 10);

  if (!subjectName || !cls) { alert('يرجى اختيار المادة والفصل أولاً من قائمة الفلاتر.'); return; }
  const subject = db.subjects.find(s => s.name === subjectName);
  if (!subject) { alert('المادة غير موجودة.'); return; }
  if (!canAccessGrade(subjectName, cls)) { alert('غير مصرح لك بطباعة كشف درجات هذه المادة/الفصل.'); return; }

  let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
  students = filterStudentsForTeacherLanguage(students, subjectName, cls);
  if (students.length === 0) { alert('لا يوجد طلاب في هذا الفصل.'); return; }
  students.sort((a, b) => a.gender !== b.gender ? (a.gender === 'F' ? -1 : 1) : a.name.localeCompare(b.name));

  const printGradeCells = buildCellsForCheck(students, subjectName,
    subject.components.map((c, ci) => ({ index: ci, name: c.name })), term, [month]);
  if (!(await confirmProceedDespiteMissingGrades(db, printGradeCells))) return;

  const week1 = getWeek1DateISO(term, month - 1);
  if (!week1) {
    const go = await showConfirm('⚠️ لم يُحدَّد بعد «تاريخ الأسبوع الأول» لهذا الشهر في تبويب بيانات المدرسة.\n\nيمكنك المتابعة والطباعة بدون تواريخ، أو الإلغاء لتعيين التاريخ أولاً.\n\nهل تريد المتابعة؟');
    if (!go) return;
  }

  const weekDates = getFourWeekDates(term, month - 1);
  const weekCount = 4;
  const scopeWeeks = (typeof getPeriodWeekCount === 'function') ? getPeriodWeekCount(term, month - 1) : 4;
  const weekNames = ['الأسبوع 1', 'الأسبوع 2', 'الأسبوع 3', 'الأسبوع 4'];
  const periodExam = (typeof periodHasMonthlyExam === 'function') ? periodHasMonthlyExam(term, month - 1) : true;
  const weekOutCls = (wi) => (typeof isWeekExcluded === 'function' ? isWeekExcluded(term, month - 1, wi) : (wi >= scopeWeeks)) ? ' week-out-of-scope' : '';

  // تصنيف المكوّنات: أسبوعية الشكل (تُكرر الدرجة على أسابيع الفترة) + حضور + تقييم شهري
  const weeklyComps = []; // {comp, ci}
  let attendanceComp = null, monthlyComp = null;
  (subject.components || []).forEach((c, ci) => {
    if (c.type === 'attendance') attendanceComp = { comp: c, ci };
    else if (c.isMonthlyGrade) monthlyComp = { comp: c, ci };
    else weeklyComps.push({ comp: c, ci });
  });

  if (!periodExam) monthlyComp = null;
  if (!weeklyComps.length && !attendanceComp && !monthlyComp) {
    alert('لا توجد مكوّنات قابلة للعرض في هذه المادة.');
    return;
  }

  // مجموع العظمى للمكوّنات الأسبوعية الشكل (كل مكوّن له متوسط = درجته العظمى)
  const weekliesMaxSum = weeklyComps.reduce((s, x) => s + (Number(x.comp.maxScore) || 0), 0);
  const attMax = attendanceComp ? (Number(attendanceComp.comp.maxScore) || 0) : 0;
  const monMax = monthlyComp ? (Number(monthlyComp.comp.maxScore) || 0) : 0;
  const grandMax = weekliesMaxSum + attMax + monMax;

  // ===== تقسيم الأعمدة الجديد (شكل ورقي): لكل مكوّن → 4 أسابيع + متوسط =====
  // أعمدة: م + اسم + (4 أسابيع + متوسط) × N مكوّن + مواظبة؟ + تقييم شهري؟ + مجموع كلي
  const colsPerComp = 5; // 4 أسابيع + متوسط
  const extraCols = (attendanceComp ? 1 : 0) + (monthlyComp ? 1 : 0) + 1 /*grand*/;
  const totalDataCols = (weeklyComps.length * colsPerComp) + extraCols;
  const namePct = 18;
  const serialPct = 3.2;
  const restPct = 100 - namePct - serialPct;
  const colPct = totalDataCols > 0 ? (restPct / totalDataCols) : 3;

  let colgroupHtml = `<col style="width:${serialPct}%"><col style="width:${namePct}%">`;
  for (let i = 0; i < totalDataCols; i++) colgroupHtml += `<col style="width:${colPct}%">`;

  // صف 1: اسم المكوّن (colspan=5 لكل مكوّن أسبوعي الشكل)
  let compGroupRow = `<th rowspan="3" class="serial-col">م</th><th rowspan="3">اسم الطالب</th>`;
  weeklyComps.forEach((x, i) => {
    const sep = i === 0 ? 'week-sep-left' : '';
    compGroupRow += `<th colspan="5" class="${sep}">${escapeHtml(x.comp.name)}</th>`;
  });
  if (attendanceComp) {
    compGroupRow += `<th rowspan="2" class="attendance-col month-sep"><span class="c-vert">${escapeHtml(attendanceComp.comp.name)}</span></th>`;
  }
  if (monthlyComp) {
    compGroupRow += `<th rowspan="2" class="month-eval-col"><span class="c-vert">${escapeHtml(monthlyComp.comp.name)}</span></th>`;
  }
  compGroupRow += `<th rowspan="2" class="grand-total-col"><span class="c-vert">المجموع الكلي</span></th>`;

  // صف 2: أسابيع 1..4 + متوسط — نص رأسي (كلمة الأسبوع + التاريخ بين قوسين، والمتوسط)
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
    const mx = x.comp.maxScore == null ? '—' : toHindiDigits(x.comp.maxScore);
    for (let wi = 0; wi < weekCount; wi++) {
      const out = weekOutCls(wi);
      const sep = (i === 0 && wi === 0) ? (' class="week-sep-left' + out + '"') : (out ? (' class="' + out.trim() + '"') : '');
      maxRow += `<th${sep}>${(typeof isWeekExcluded === 'function' ? isWeekExcluded(term, month - 1, wi) : (wi >= scopeWeeks)) ? '—' : mx}</th>`;
    }
    maxRow += `<th class="avg-col">${mx}</th>`;
  });
  if (attendanceComp) {
    maxRow += `<th class="attendance-col month-sep">${attendanceComp.comp.maxScore == null ? '—' : toHindiDigits(attendanceComp.comp.maxScore)}</th>`;
  }
  if (monthlyComp) {
    maxRow += `<th class="month-eval-col">${monthlyComp.comp.maxScore == null ? '—' : toHindiDigits(monthlyComp.comp.maxScore)}</th>`;
  }
  maxRow += `<th class="grand-total-col">${toHindiDigits(grandMax)}</th>`;

  const theadHtml = `<tr class="week-row">${compGroupRow}</tr><tr class="comp-row">${weekRow}</tr><tr class="max-row">${maxRow}</tr>`;

  // جسم الجدول: الدرجة الشهرية للمكوّن تُكرر على الأسابيع الأربعة + المتوسط = نفس القيمة
  let bodyHtml = '';
  students.forEach((s, idx) => {
    const getScore = (ci) => {
      if (ci < 0) return '';
      const existing = db.grades.find(g => g.studentId === s.id && g.subjectName === subjectName && g.term === term && g.month === month && g.componentIndex === ci);
      return existing ? existing.score : '';
    };

    const formatScoreExact = (v) => {
      if (v === '' || v === undefined || v === null) return '';
      if (isAbsentMark(v)) return ABSENT_MARK;
      if (typeof v === 'number' && Number.isFinite(v)) {
        let str = String(parseFloat(v.toPrecision(12)));
        return toHindiDigits(str);
      }
      const n = Number(v);
      if (v !== '' && Number.isFinite(n) && String(v).trim() !== '' && !isAbsentMark(v)) {
        let str = String(parseFloat(n.toPrecision(12)));
        return toHindiDigits(str);
      }
      return toHindiDigits(v);
    };
    const cell = (v, cls) => {
      const extra = (cls ? cls + ' ' : '') + 'gs-score';
      return `<td class="${extra}">${formatScoreExact(v)}</td>`;
    };

    const weeklyScores = weeklyComps.map(x => getScore(x.ci));
    const attScore = attendanceComp ? getScore(attendanceComp.ci) : '';
    const monScore = monthlyComp ? getScore(monthlyComp.ci) : '';

    // المجموع الكلي = مجموع متوسطات المكوّنات الأسبوعية الشكل + حضور + شهري
    let grand = '';
    {
      const parts = weeklyScores.concat([attScore, monScore]);
      let hasAny = false, hasNum = false, sum = 0;
      parts.forEach(v => {
        if (v === '' || v === undefined || v === null) return;
        hasAny = true;
        if (!isAbsentMark(v)) { sum += Number(v) || 0; hasNum = true; }
      });
      if (hasAny) grand = hasNum ? sum : ABSENT_MARK;
    }

    const formMode = (typeof getGradingFormMode === 'function') ? getGradingFormMode(db, term, month) : 'monthly';
    const completedWeeks = (formMode === 'weekly_form' && typeof countCompletedFormWeeks === 'function') ? countCompletedFormWeeks(term, month, new Date()) : 4;
    let row = `<td class="serial-col">${toHindiDigits(idx + 1)}</td><td class="gs-name">${escapeHtml(s.name)}</td>`;
    weeklyScores.forEach((v, i) => {
      for (let wi = 0; wi < weekCount; wi++) {
        const show = (typeof isWeekExcluded === 'function' ? isWeekExcluded(term, month - 1, wi) : (wi >= scopeWeeks)) ? '' : ((v === '' || v === undefined || v === null) ? '' : (wi < completedWeeks ? v : ''));
        const cls = ((i === 0 && wi === 0) ? 'week-sep-left' : '') + weekOutCls(wi);
        row += cell(show, cls.trim());
      }
      row += cell(v, 'avg-col');
    });
    if (attendanceComp) row += cell(attScore, 'attendance-col month-sep');
    if (monthlyComp) row += cell(monScore, 'month-eval-col');
    row += cell(grand, 'grand-total-col');
    bodyHtml += `<tr>${row}</tr>`;
  });

  const { cls: clsPlain, section: clsSection } = splitClassSectionKey(cls);
  const info = db.schoolInfo || {};
  const monthLabels = getMonthLabels(term);
  const monthLabel = monthLabels[month - 1] || `الشهر ${month}`;
  const termLabel = term === 'first' ? 'الفصل الدراسي الأول' : 'الفصل الدراسي الثاني';
  const assignedTeachers = (db.teachers || []).filter(t => (t.assignments || []).some(a => a.subjectName === subjectName && (a.classes || []).includes(cls)));
  const teacherName = assignedTeachers.length ?
    assignedTeachers.map(t => { const lt = teacherLanguageTypeForSubject(t, subjectName, cls); return lt ? `${escapeHtml(t.name)} (${escapeHtml(lt)})` : escapeHtml(t.name); }).join('، ') :
    (currentRole === 'teacher' && currentTeacher ? escapeHtml(currentTeacher.name) : '');
  const printedBy = currentRole === 'admin' ? 'مدير النظام' : ((currentTeacher && currentTeacher.name) || 'المعلم');
  const now = new Date();
  const printDate = now.toLocaleDateString('ar-EG');
  const classGradeLabelForPrint = (db.classGrade && db.classGrade[cls]) || info.grade || '';
  const metaBarHtmlDet = [
    `<span>${formatClassSectionForPrint(classGradeLabelForPrint, clsSection, clsPlain)}</span>`,
    `<span><strong>المادة:</strong> ${escapeHtml(subjectName)}${teacherName ? ' — <strong>المعلم:</strong> ' + teacherName : ''}</span>`
  ].join('');
  const pageHtml = `
    <div class="detailed-sheet-page ds-scope">
      ${buildUnifiedLetterhead({
        title: 'كشف رصد درجات تفصيلي — ' + subjectName,
        subtitleRight: 'درجات (' + monthLabel + ')',
        subtitleLeft: termLabel,
        printedBy,
        printDate,
        governorate: info.governorate || '',
        educationAdmin: info.educationAdmin || '',
        schoolName: info.schoolName || '',
        academicYear: info.academicYear || '',
        metaBarHtml: metaBarHtmlDet
      })}
      <table class="detailed-weekly-table">
        <colgroup>${colgroupHtml}</colgroup>
        <thead>${theadHtml}</thead>
        <tbody>${bodyHtml}</tbody>
      </table>
      ${buildUnifiedFooter()}
    </div>`;

  printDetailedAndFitOnePage(pageHtml);
}



async function printTermAverageSheet() {
  const db = loadDB();
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  const twoMonthsOnlyEl = document.getElementById('printTwoMonthsOnly');
  const fullMonthLabels = getMonthLabels(term);
  const twoMonthsOnly = !!(twoMonthsOnlyEl && twoMonthsOnlyEl.checked && fullMonthLabels.length > 2);
  const monthCountOverride = twoMonthsOnly ? 2 : undefined;
  const usedMonthLabels = twoMonthsOnly ? fullMonthLabels.slice(0, 2) : fullMonthLabels;

  if (!subjectName || !cls) { alert('يرجى اختيار المادة والفصل أولاً من قائمة الفلاتر.'); return; }
  const subject = db.subjects.find(s => s.name === subjectName);
  if (!subject) { alert('المادة غير موجودة.'); return; }
  if (!canAccessGrade(subjectName, cls)) { alert('غير مصرح لك بطباعة كشف درجات هذه المادة/الفصل.'); return; }

  let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
  students = filterStudentsForTeacherLanguage(students, subjectName, cls);
  if (students.length === 0) { alert('لا يوجد طلاب في هذا الفصل.'); return; }
  students.sort((a, b) => a.gender !== b.gender ? (a.gender === 'F' ? -1 : 1) : a.name.localeCompare(b.name));

  // فحص النواقص على الشهور المحتسبة فعلياً (شهرين أو ثلاثة حسب الإعداد)
  const avgMonths = usedMonthLabels.map((_, i) => i + 1);
  const printAvgCells = [];
  students.forEach(s => {
    (subject.components || []).forEach((c, ci) => {
      const monthsNeeded = isExamLikeComponent(c) ? [1, 2] : avgMonths;
      monthsNeeded.forEach(month => {
        printAvgCells.push({ studentId: s.id, studentName: s.name, subjectName, componentIndex: ci, componentName: c.name, term, month });
      });
    });
  });
  if (!(await confirmProceedDespiteMissingGrades(db, printAvgCells))) return;

  const components = (subject.components || []).map((c, ci) => ({ comp: c, ci }));
  if (!components.length) { alert('لا توجد مكوّنات قابلة للعرض في هذه المادة.'); return; }

  // شكل ورقي:
  // - مكوّنات عادية: ش1 ش2 ش3 + متوسط (توزيع المتوسط على الثلاثة)
  // - امتحان/تقييم شهري: ش1 ش2 + متوسط فقط (بدون ش3 فارغ)
  const colCountFor = (x) => isExamLikeComponent(x.comp) ? 3 : 4;
  const totalDataCols = components.reduce((s, x) => s + colCountFor(x), 0) + 1; // + أعمال السنة
  const namePct = 16;
  const serialPct = 3.2;
  const restPct = 100 - namePct - serialPct;
  const colPct = restPct / totalDataCols;

  let colgroupHtml = `<col style="width:${serialPct}%"><col style="width:${namePct}%">`;
  for (let i = 0; i < totalDataCols; i++) colgroupHtml += `<col style="width:${colPct}%">`;

  let groupRow = `<th rowspan="3" class="serial-col">م</th><th rowspan="3">اسم الطالب</th>`;
  components.forEach((x, i) => {
    const sep = i === 0 ? 'week-sep-left' : '';
    const span = colCountFor(x);
    groupRow += `<th colspan="${span}" class="${sep}">${escapeHtml(x.comp.name)}</th>`;
  });
  groupRow += `<th rowspan="2" class="grand-total-col"><span class="c-vert">أعمال السنة</span></th>`;

  let subRow = '';
  components.forEach((x, i) => {
    const labs = isExamLikeComponent(x.comp) ? ['ش1', 'ش2', 'متوسط'] : ['ش1', 'ش2', 'ش3', 'متوسط'];
    labs.forEach((lab, li) => {
      const sep = (i === 0 && li === 0) ? ' class="week-sep-left"' : '';
      const clsAttr = lab === 'متوسط' ? ' class="avg-col"' : sep;
      subRow += `<th${clsAttr}><span class="c-vert">${lab}</span></th>`;
    });
  });

  let maxRow = '';
  components.forEach((x, i) => {
    const mx = x.comp.maxScore == null ? '—' : toHindiDigits(x.comp.maxScore);
    const n = colCountFor(x);
    for (let li = 0; li < n; li++) {
      const isAvg = li === n - 1;
      const sep = (i === 0 && li === 0) ? ' class="week-sep-left"' : '';
      const clsAttr = isAvg ? ' class="avg-col"' : sep;
      maxRow += `<th${clsAttr}>${mx}</th>`;
    }
  });
  const grandMax = components.reduce((s, x) => {
    if (x.comp.type === 'attendance') return s;
    return s + (Number(x.comp.maxScore) || 0);
  }, 0);
  maxRow += `<th class="grand-total-col">${toHindiDigits(grandMax)}</th>`;

  const theadHtml = `<tr class="week-row">${groupRow}</tr><tr class="comp-row">${subRow}</tr><tr class="max-row">${maxRow}</tr>`;

  const formatScoreExact = (v) => {
    if (v === '' || v === undefined || v === null) return '';
    if (isIncompleteMark(v)) return INCOMPLETE_LABEL;
    if (isAbsentMark(v)) return ABSENT_MARK;
    if (typeof v === 'number' && Number.isFinite(v)) {
      return toHindiDigits(String(parseFloat(v.toPrecision(12))));
    }
    const n = Number(v);
    if (Number.isFinite(n) && String(v).trim() !== '') {
      return toHindiDigits(String(parseFloat(n.toPrecision(12))));
    }
    return toHindiDigits(v);
  };
  const cell = (v, cls) => `<td class="${(cls ? cls + ' ' : '')}gs-score">${formatScoreExact(v)}</td>`;

  const gradesIdx = buildGradesIndex(db);
  let bodyHtml = '';
  students.forEach((s, idx) => {
    let total = 0, hasAny = false, hasNumeric = false, hasIncomplete = false;
    let row = `<td class="serial-col">${toHindiDigits(idx + 1)}</td><td class="gs-name">${escapeHtml(s.name)}</td>`;
    components.forEach((x, i) => {
      const finalScore = computeFinalComponentScore(db, s.id, subjectName, x.ci, term, x.comp.name, x.comp.maxScore, monthCountOverride);
      const examLike = isExamLikeComponent(x.comp);

      if (finalScore !== null && x.comp.type !== 'attendance') {
        hasAny = true;
        if (isIncompleteMark(finalScore)) hasIncomplete = true;
        else if (!isAbsentMark(finalScore)) { total += finalScore; hasNumeric = true; }
      }

      if (examLike) {
        const g1 = gradesIdx.get(s.id + '|' + subjectName + '|' + term + '|1|' + x.ci);
        const g2 = gradesIdx.get(s.id + '|' + subjectName + '|' + term + '|2|' + x.ci);
        let avgShow = '';
        if (finalScore === null) avgShow = '';
        else if (isIncompleteMark(finalScore)) avgShow = INCOMPLETE_MARK;
        else if (isAbsentMark(finalScore)) avgShow = ABSENT_MARK;
        else avgShow = Math.round(finalScore * 100) / 100;
        row += cell(g1 ? g1.score : '', i === 0 ? 'week-sep-left' : '');
        row += cell(g2 ? g2.score : '', '');
        row += cell(avgShow, 'avg-col');
      } else {
        let showVal = '';
        if (finalScore === null) showVal = '';
        else if (isIncompleteMark(finalScore)) showVal = INCOMPLETE_MARK;
        else if (isAbsentMark(finalScore)) showVal = ABSENT_MARK;
        else showVal = Math.round(finalScore * 100) / 100;
        row += cell(showVal, i === 0 ? 'week-sep-left' : '');
        row += cell(showVal, '');
        row += cell(showVal, '');
        row += cell(showVal, 'avg-col');
      }
    });
    const totalDisplay = !hasAny ? '' : (hasIncomplete ? INCOMPLETE_MARK : (hasNumeric ? (Math.round(total * 100) / 100) : ABSENT_MARK));
    row += cell(totalDisplay, 'grand-total-col');
    bodyHtml += `<tr>${row}</tr>`;
  });

  const { cls: clsPlain, section: clsSection } = splitClassSectionKey(cls);
  const info = db.schoolInfo || {};
  const termLabel = term === 'first' ? 'الفصل الدراسي الأول' : 'الفصل الدراسي الثاني';
  const termSheetTitle = term === 'second' ? 'متوسطات الفصل الدراسي الثاني' : 'متوسطات الفصل الدراسي الأول';
  // بدون أسماء الشهور في الترويسة — يكفي بيان عدد الأعمدة الشكلية
  const monthsSubtitle = 'ثلاث أشهر';
  const assignedTeachers = (db.teachers || []).filter(t => (t.assignments || []).some(a => a.subjectName === subjectName && (a.classes || []).includes(cls)));
  const teacherName = assignedTeachers.length ?
    assignedTeachers.map(t => { const lt = teacherLanguageTypeForSubject(t, subjectName, cls); return lt ? `${escapeHtml(t.name)} (${escapeHtml(lt)})` : escapeHtml(t.name); }).join('، ') :
    (currentRole === 'teacher' && currentTeacher ? escapeHtml(currentTeacher.name) : '');
  const printedBy = currentRole === 'admin' ? 'مدير النظام' : ((currentTeacher && currentTeacher.name) || 'المعلم');
  const now = new Date();
  const printDate = now.toLocaleDateString('ar-EG');
  const classGradeLabelForPrint = (db.classGrade && db.classGrade[cls]) || info.grade || '';
  const metaBarHtml = [
    `<span>${formatClassSectionForPrint(classGradeLabelForPrint, clsSection, clsPlain)}</span>`,
    `<span><strong>المادة:</strong> ${escapeHtml(subjectName)}${teacherName ? ' — <strong>المعلم:</strong> ' + teacherName : ''}</span>`
  ].join('');

  const pageHtml = `
    <div class="detailed-sheet-page ds-scope">
      ${buildUnifiedLetterhead({
        title: termSheetTitle + ' — ' + subjectName,
        subtitleRight: monthsSubtitle,
        subtitleLeft: termLabel,
        printedBy,
        printDate,
        governorate: info.governorate || '',
        educationAdmin: info.educationAdmin || '',
        schoolName: info.schoolName || '',
        academicYear: info.academicYear || '',
        metaBarHtml
      })}
      <table class="detailed-weekly-table">
        <colgroup>${colgroupHtml}</colgroup>
        <thead>${theadHtml}</thead>
        <tbody>${bodyHtml}</tbody>
      </table>
      ${buildUnifiedFooter()}
    </div>`;

  printDetailedAndFitOnePage(pageHtml);
}



// window exports
GSP.canAccessPrintCenter = canAccessPrintCenter;


GSP.loadPrintCenterUI = loadPrintCenterUI;


GSP.pcOnBlankTermChange = pcOnBlankTermChange;


GSP.pcOnAttTermChange = pcOnAttTermChange;


GSP.pcFillMonthSelect = pcFillMonthSelect;


GSP.pcRenderClassChecks = pcRenderClassChecks;


GSP.pcRenderSubjectChecks = pcRenderSubjectChecks;


GSP.pcToggleAll = pcToggleAll;


GSP.pcGetChecked = pcGetChecked;


GSP.pcResolveTeacherName = pcResolveTeacherName;


GSP.printBlankGradeSheetsBatch = printBlankGradeSheetsBatch;


GSP.printBlankAttendanceBatch = printBlankAttendanceBatch;


GSP.printAttendanceSheetBatchInternal = printAttendanceSheetBatchInternal;


GSP.canAccessTermTotalsPrint = canAccessTermTotalsPrint;


GSP.printTermTotalsSheet = printTermTotalsSheet;


GSP.toHindiDigits = toHindiDigits;


GSP.gsSizesForScale = gsSizesForScale;


GSP.gsStyleTextFor = gsStyleTextFor;


GSP.autoFitAndPrintGradeSheet = autoFitAndPrintGradeSheet;


GSP.buildUnifiedLetterhead = buildUnifiedLetterhead;


GSP.buildUnifiedFooter = buildUnifiedFooter;


GSP.resolvePrintedByName = resolvePrintedByName;


GSP.fitPrintPageFillHeight = fitPrintPageFillHeight;


GSP.fitPrintPagesToA4 = fitPrintPagesToA4;


GSP.printGradeSheet = printGradeSheet;


GSP.getWeek1DateISO = getWeek1DateISO;


GSP.formatWeekDateAr = formatWeekDateAr;


GSP.shiftISODateDays = shiftISODateDays;


GSP.getFourWeekDates = getFourWeekDates;


GSP.getPeriodWeekCount = getPeriodWeekCount;


GSP.periodHasMonthlyExam = periodHasMonthlyExam;


GSP.dsSizesForScale = dsSizesForScale;


GSP.dsStyleTextFor = dsStyleTextFor;


GSP.printDetailedAndFitOnePage = printDetailedAndFitOnePage;


GSP.gradingModeKey = gradingModeKey;


GSP.ensureStageSettings = ensureStageSettings;


GSP.getGradingFormMode = getGradingFormMode;


GSP.countCompletedFormWeeks = countCompletedFormWeeks;


GSP.printDetailedGradeSheet = printDetailedGradeSheet;


GSP.printTermAverageSheet = printTermAverageSheet;
