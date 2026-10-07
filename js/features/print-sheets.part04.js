/* print-sheets.part04.js — generated from print-sheets.js; execution order is significant. */

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
