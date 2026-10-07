/* grades-ui.part03.js — generated from grades-ui.js; execution order is significant. */


function markGradeInputAbsentFromButton(button) {
  const input = button && button.parentElement ? button.parentElement.querySelector('.grade-input') : null;
  if (typeof markGradeInputAbsent === 'function') markGradeInputAbsent(input);
}
GSP.markGradeInputAbsentFromButton = markGradeInputAbsentFromButton;

function loadGradesUI() {
  if (typeof syncGradesFiltersToUIState === 'function') syncGradesFiltersToUIState();
  if (typeof refreshGradeWeekSelect === 'function') refreshGradeWeekSelect();
  document.getElementById('finalResultsArea').style.display = 'none';
  const db = loadDB();
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  const month = parseInt(document.getElementById('gradeMonthSelect').value, 10);
  const weekEl = document.getElementById('gradeWeekSelect');
  const week = weekEl ? (parseInt(weekEl.value, 10) || 1) : 1;
  const search = document.getElementById('gradeSearch').value.trim().toLowerCase();

  // تحديث شارات الفصل والشهر والأسبوع
  const termBadge = document.getElementById('gradeTermBadge');
  termBadge.textContent = `الفصل ${term === 'first' ? 'الأول' : 'الثاني'}`;
  termBadge.style.background = term === 'first' ? '#0b5e42' : '#b45309';
  const monthLabels = getMonthLabels(term);
  document.getElementById('gradeMonthBadge').textContent = monthLabels[month - 1] || `الشهر ${month}`;
  const weekBadge = document.getElementById('gradeWeekBadge');
  if (weekBadge) {
    const wLabels = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن'];
    weekBadge.textContent = 'الأسبوع ' + (wLabels[week] || week);
  }

  // هل الشهر/الفترة المختارة مخصص لها "اختبار شهري" أصلاً؟ (يُضبط من بيانات المدرسة > فترات الرصد).
  // إن لم يكن مخصصاً، لا يجوز إظهار خانة رصد الاختبار الشهري للمعلم أصلاً حتى لا تظهر خانة لا معنى
  // لها ولا يُظن خطأً أنها إلزامية (نفس المنطق المُطبَّق فعلاً في كشوف الطباعة الأسبوعية/الشهرية).
  const periodExamNow = (typeof periodHasMonthlyExam === 'function') ? periodHasMonthlyExam(term, month - 1) : true;

  if (!subjectName || !cls) {
    document.getElementById('gradeEntryArea').style.display = 'none';
    document.getElementById('gradesStatus').textContent = '⚠️ يرجى اختيار المادة والفصل';
    return;
  }
  const subject = db.subjects.find(s => s.name === subjectName);
  if (!subject) {
    document.getElementById('gradeEntryArea').style.display = 'none';
    document.getElementById('gradesStatus').textContent = '❌ المادة غير موجودة';
    return;
  }
  if (!canAccessGrade(subjectName, cls)) {
    document.getElementById('gradeEntryArea').style.display = 'none';
    document.getElementById('gradesStatus').textContent = '🚫 غير مصرح لك بالوصول لهذه المادة أو الفصل';
    document.getElementById('gradesStatus').style.color = '#b91c1c';
    return;
  }
  let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
  students = filterStudentsForTeacherLanguage(students, subjectName, cls);
  if (search) students = students.filter(s => s.name.toLowerCase().includes(search) || (s.seat || '').includes(search));
  if (students.length === 0) {
    document.getElementById('gradeEntryArea').style.display = 'none';
    document.getElementById('gradesStatus').textContent = '⚠️ لا يوجد طلاب مطابقين';
    return;
  }

  document.getElementById('gradeEntryArea').style.display = 'block';
  document.getElementById('gradeSubjectDisplay').textContent = subjectName;
  document.getElementById('gradeClassDisplay').textContent = classSectionLabel(cls);

  const individualLocked = !!(db.locks && db.locks[lockKey(cls, subjectName, term, month)]);
  const globalLocked = !!db.globalLock;
  const termLocked = isTermLocked(db, term);
  const monthLocked = !!(db.monthLocks && db.monthLocks[monthLockKey(term, month)]);
  const isLocked = currentRole === 'teacher' ? (globalLocked || termLocked || monthLocked || individualLocked) :
    individualLocked;

  const lockBtn = document.getElementById('lockBtn');
  lockBtn.style.display = currentRole === 'admin' ? 'inline-flex' : 'none';
  lockBtn.textContent = individualLocked ? '🔓 فتح القفل' : '🔒 قفل هذا الفصل';

  const lockedNote = document.getElementById('lockedNote');
  lockedNote.style.display = isLocked ? 'block' : 'none';
  if (currentRole === 'teacher' && globalLocked) {
    lockedNote.textContent = '🔒 إدخال الدرجات مقفول حالياً لجميع الفصول من قبل مدير النظام. تواصل مع الإدارة.';
  } else if (currentRole === 'teacher' && termLocked) {
    lockedNote.textContent =
      `🔒 إدخال الدرجات مقفول حالياً للفصل الدراسي ${term === 'first' ? 'الأول' : 'الثاني'} بالكامل من قبل مدير النظام.`;
  } else if (currentRole === 'teacher' && monthLocked) {
    const monthLabels = getMonthLabels(term);
    lockedNote.textContent =
      `🔒 إدخال الدرجات مقفول حالياً لشهر "${monthLabels[month - 1] || month}" في كل الفصول والمواد من قبل مدير النظام.`;
  } else if (isLocked) {
    lockedNote.textContent = '🔒 هذا الفصل مقفول للتعديل حالياً. تواصل مع مدير النظام لفتحه.';
  }

  // عند إدخال درجات مادة "اللغة الثانية" يتم إظهار عمود إضافي يوضح لغة كل طالب المُسجَّلة
  // حتى يستطيع معلم اللغة الثانية معرفة لغة كل طالب بوضوح أثناء الرصد
  const isSecondLangSubject = subjectIsSecondLang(subjectName);

  const headerRow = document.getElementById('gradesHeaderRow');
  // الرقم القومي لغير المعلم فقط؛ رقم الجلوس يظهر للجميع
  headerRow.innerHTML = canViewNationalId()
    ? '<th class="col-index">#</th><th class="col-id">الرقم القومي</th><th class="col-id">رقم الجلوس</th><th class="col-name">اسم الطالب</th>'
    : '<th class="col-index">#</th><th class="col-id">رقم الجلوس</th><th class="col-name">اسم الطالب</th>';
  if (isSecondLangSubject) headerRow.innerHTML += '<th class="col-lang">اللغة الثانية</th>';
  subject.components.forEach((c, ci) => {
    if (c.isMonthlyGrade && !periodExamNow) return; // لا اختبار شهري لهذه الفترة — إخفاء العمود
    const isPF = c.type === 'passfail';
    headerRow.innerHTML +=
      `<th class="col-grade">
        <div>${escapeHtml(c.name)} ${isPF ? '(اجتاز/لم يجتز)' : `(${compMaxLabel(c)})`}${c.isMonthlyGrade ? ' 🧮' : ''}</div>
        <div class="flex gap-4 items-center justify-center" style="margin-top:4px;">
          <button class="btn btn-outline btn-sm" style="padding:1px 6px; font-size:11px;" data-action="bulkFillComponent" data-args='${gspArgs([ci])}' title="${isPF ? 'رصد اجتاز لكل الطلاب في هذا المكوّن' : 'رصد الدرجة النهائية لكل الطلاب في هذا المكوّن فقط'}">${isPF ? '✅ اجتاز الكل' : '✅'}</button>
          <button class="btn btn-danger btn-sm" style="padding:1px 6px; font-size:11px;" data-action="bulkClearComponent" data-args='${gspArgs([ci])}' title="مسح كل درجات هذا المكوّن فقط">🧹</button>
        </div>
      </th>`; });
  headerRow.innerHTML += '<th class="col-action">إجراء</th>';

  students.sort((a, b) => a.gender !== b.gender ? (a.gender === 'F' ? -1 : 1) : a.name.localeCompare(b.name));

  const tbody = document.getElementById('gradesTableBody');
  tbody.innerHTML = '';
  const gradesIdx = (typeof GSP !== 'undefined' && GSP.performance && typeof GSP.performance.buildGradesIndex === 'function')
    ? GSP.performance.buildGradesIndex(db)
    : (typeof buildGradesIndex === 'function' ? buildGradesIndex(db) : null);
  const lookup = (sid, ci) => {
    const comp = subject.components && subject.components[ci];
    const wp = (typeof GSP !== 'undefined' && GSP.weeklyPeriod) ? GSP.weeklyPeriod : null;
    const useWeek = wp && typeof wp.resolveGradeWeek === 'function' ? wp.resolveGradeWeek(comp, comp && comp.name, week) : week;
    if (gradesIdx && typeof GSP !== 'undefined' && GSP.performance && typeof GSP.performance.lookupGrade === 'function') {
      return GSP.performance.lookupGrade(gradesIdx, sid, subjectName, term, month, ci, useWeek);
    }
    if (gradesIdx && typeof gradesIdx.get === 'function') {
      return gradesIdx.get(sid + '|' + subjectName + '|' + term + '|' + month + '|' + useWeek + '|' + ci)
        || gradesIdx.get(sid + '|' + subjectName + '|' + term + '|' + month + '|' + ci)
        || null;
    }
    return db.grades.find(g => g.studentId === sid && g.subjectName === subjectName && g.term === term && g.month === month && g.componentIndex === ci && (g.week == null || Number(g.week) === Number(useWeek) || (useWeek === 0 && Number(g.week) === 0))) || null;
  };
  // عداد "الخانات الفارغة" (لم تُرصد بعد إطلاقاً - لا رقم ولا "غ") في هذا الشهر تحديداً، حتى
  // يشوفه المعلم لحظياً وهو لسه في شاشة الرصد، بدل ما يكتشفه متأخراً وقت الطباعة/التصدير.
  let missingCount = 0;
  const stageType = (db.schoolInfo && db.schoolInfo.stageType) || '';
  const fragment = document.createDocumentFragment();
  students.forEach((s, idx) => {
    let cellsHtml = '';
    // نقطة لونية سريعة بجانب اسم الطالب تعكس مستوى أدائه في هذا الشهر تحديداً (بناءً على ما
    // رُصد فعلياً حتى الآن فقط)، حتى يكتشف المعلم الطلاب المتعثرين بنظرة واحدة أثناء الرصد.
    let enteredSum = 0, enteredMax = 0;
    subject.components.forEach((comp, ci) => {
      if (comp.type === 'attendance') return;
      if (comp.isMonthlyGrade && !periodExamNow) return; // لا اختبار شهري لهذه الفترة
      const existing0 = lookup(s.id, ci);
      const val0 = existing0 ? existing0.score : '';
      if (val0 === '' || isAbsentMark(val0)) return;
      const num0 = Number(val0);
      if (!isNaN(num0)) { enteredSum += num0;
        enteredMax += Number(comp.maxScore) || 0; }
    });
    const tier = enteredMax > 0 ? getGradeTier((enteredSum / enteredMax) * 100, stageType) : null;
    subject.components.forEach((comp, ci) => {
      if (comp.isMonthlyGrade && !periodExamNow) return; // لا اختبار شهري لهذه الفترة — لا نعرض خانة إدخال ولا نحتسبها ضمن "الناقص"
      const existing = lookup(s.id, ci);
      const val = existing ? existing.score : '';
      const isMissing = val === '';
      if (isMissing) missingCount++;
      const missingTdClass = isMissing ? ' grade-cell-missing' : '';
      if (comp.type === 'passfail') {
        const isAbsentVal = isAbsentMark(val);
        const isPass = val !== '' && !isAbsentVal && Number(val) >= comp.maxScore;
        const isFail = val !== '' && !isAbsentVal && Number(val) < comp.maxScore;
        cellsHtml += `<td class="col-grade${missingTdClass}" data-label="${escapeHtml(comp.name)} (اجتاز/لم يجتز)" title="${isMissing ? 'لم تُرصد بعد' : ''}"><select class="grade-input"
          data-student="${s.id}" data-comp="${ci}" data-max="${comp.maxScore}"
          ${isLocked ? 'disabled' : ''}
          data-event-type="change" data-event-action="saveStudentRow" data-event-static='${gspArgs([s.id])}'
          data-event-type="keydown" data-event-action="handleGradeInputKeydown" data-event-with-event
          style="width:110px; padding:4px 6px; border:1px solid #cbd5e1; border-radius:4px;">
          <option value="" ${val === '' ? 'selected' : ''}>-- لم يُحدَّد --</option>
          <option value="${comp.maxScore}" ${isPass ? 'selected' : ''}>✅ اجتاز</option>
          <option value="0" ${isFail ? 'selected' : ''}>❌ لم يجتز</option>
          <option value="${ABSENT_MARK}" ${isAbsentVal ? 'selected' : ''}>🚫 غ (غياب)</option>
        </select></td>`;
      } else {
        const hasMax = comp.maxScore !== null && comp.maxScore !== undefined && comp.maxScore !== '';
        // النوع "text" بدل "number" حتى يستطيع المعلم كتابة "غ" (غياب) بدل الدرجة الرقمية أيضاً؛
        // validateGradeInput تتحقق من صحة القيمة (رقم ضمن الحد الأقصى، أو "غ" فقط) أثناء الكتابة.
        cellsHtml += `<td class="col-grade${missingTdClass}" data-label="${escapeHtml(comp.name)} (${compMaxLabel(comp)})" title="${isMissing ? 'لم تُرصد بعد' : ''}"><div style="display:flex;align-items:center;gap:4px;justify-content:center">
          <input type="text" inputmode="decimal" class="grade-input"
          data-student="${s.id}" data-comp="${ci}" data-max="${hasMax ? comp.maxScore : ''}"
          value="${val}" ${isLocked ? 'disabled' : ''}
          placeholder="أو غ"
          data-event-type="input" data-event-action="handleGradeInputInput" data-event-arg="element"
          data-event-type="keydown" data-event-action="handleGradeInputKeydown" data-event-with-event
          style="width:64px; min-width:0; padding:4px 6px; border:1px solid #cbd5e1; border-radius:4px;" />
          ${isLocked ? '' : '<button type="button" class="btn-absent-g" tabindex="-1" title="رصد غياب غ" data-action="markGradeInputAbsentFromButton" data-with-element>غ</button>'}
          </div></td>`;
      }
    });
    const row = document.createElement('tr');
    const nidCellHtml = canViewNationalId()
      ? `<td class="col-id" data-label="الرقم القومي">${escapeHtml(s.nationalId || '-')}</td>`
      : '';
    const seatCellHtml = `<td class="col-id" data-label="رقم الجلوس"><strong>${escapeHtml(s.seat)}</strong></td>`;
    const secondLangCellHtml = isSecondLangSubject ? `<td class="col-lang" data-label="اللغة الثانية">${langBadgeHtml(s.secondLanguage)}</td>` : '';
    const tierDotHtml = tier ?
      `<span class="tier-dot" style="background:${tier.color};" title="${tier.label} (${Math.round(tier.percentage)}% من درجات هذا الشهر المرصودة حتى الآن)"></span>` : '';
    row.innerHTML = `
      <td class="col-index">${idx + 1}</td>
      ${nidCellHtml}${seatCellHtml}
      <td class="col-name"><span class="idx-badge">${idx + 1}</span>${escapeHtml(s.name)}${tierDotHtml}</td>
      ${secondLangCellHtml}
      ${cellsHtml}
      <td class="col-action" data-label="إجراء"><button class="btn btn-primary btn-sm" ${isLocked ? 'disabled' : ''} data-action="saveStudentRow" data-args='${gspArgs(['s.id'])}'>💾 حفظ</button></td>
    `;
    fragment.appendChild(row);
  });
  tbody.appendChild(fragment);

  const missingBadge = missingCount > 0 ?
    ` — ⚠️ يوجد ${missingCount} خانة لم تُرصد بعد لهذا الشهر (مظللة بالأحمر أدناه)` : ' — ✅ كل الخانات مرصودة لهذا الشهر';
  document.getElementById('gradesStatus').textContent =
    `تم تحميل ${students.length} طالب - ${monthLabels[month - 1] || ''} (🧮 = مكون امتحان، يُجمع بين الشهور المُدخلة بدل حساب المتوسط)${missingBadge}`;
  document.getElementById('gradesStatus').style.color = missingCount > 0 ? '#b45309' : '#0b5e42';
  // تمييز فوري لأي درجات محفوظة مسبقاً تتجاوز الحد + تحديث شريط التنبيه أعلى الجدول
  document.querySelectorAll('#gradesTableBody .grade-input').forEach(inp => validateGradeInput(inp));
  updateInvalidGradesBanner();
  // إعادة رسم تقرير الدرجات الناقصة ولوحة الأداء تلقائياً لو كانا ظاهرين بالفعل (حتى يتحدَّثا
  // مع أي تغيير مادة/فصل/شهر بدل ما يفضلا عارضين بيانات قديمة).
  const reportArea = document.getElementById('missingGradesReportArea');
  if (reportArea && reportArea.style.display !== 'none') renderMissingGradesReport();
  const perfPanel = document.getElementById('gradesTabPerformancePanel');
  if (perfPanel && perfPanel.style.display !== 'none') renderGradesTabPerformancePanel();

  try {
    const panel = document.getElementById('absenceConflictPanel');
    if (panel) {
      const canSee = (currentAccountType === 'superadmin' || currentAccountType === 'stageadmin' || currentAccountType === 'monitor');
      panel.style.display = canSee ? 'block' : 'none';
      if (canSee && typeof renderAbsenceConflictPanel === 'function') renderAbsenceConflictPanel();
    }
  } catch (e) {}
}



// تقرير "الدرجات الناقصة" - متاح للمراجعة في أي وقت (وليس فقط كتحذير عابر وقت الطباعة/التصدير)،
// يغطي المادة والفصل الدراسي المختارين حالياً عبر كل شهور الفصل الدراسي دفعة واحدة، حتى يستطيع
// المعلم أو المدير متابعة اكتمال الرصد أولاً بأول دون انتظار محاولة طباعة أو تصدير.
function toggleMissingGradesReport() {
  const area = document.getElementById('missingGradesReportArea');
  if (!area) return;
  if (area.style.display === 'none') { renderMissingGradesReport();
    area.style.display = 'block'; } else { area.style.display = 'none'; }
}



function renderMissingGradesReport() {
  const area = document.getElementById('missingGradesReportArea');
  if (!area) return;
  const db = loadDB();
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  if (!subjectName || !cls) { area.innerHTML = ''; return; }
  const subject = db.subjects.find(s => s.name === subjectName);
  if (!subject) { area.innerHTML = ''; return; }

  let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
  students = filterStudentsForTeacherLanguage(students, subjectName, cls);
  const months = getMonthLabels(term).map((_, i) => i + 1);
  const cells = buildCellsForCheck(students, subjectName,
    subject.components.map((c, ci) => ({ index: ci, name: c.name })), term, months);
  const missing = scanMissingGradeCells(db, cells);

  if (!missing.length) {
    area.innerHTML = `<div class="success-box">✅ لا توجد خانات ناقصة: كل درجات مادة "${escapeHtml(subjectName)}" لفصل "${classSectionLabel(cls)}" مرصودة بالكامل عبر كل شهور الفصل الدراسي.</div>`;
    return;
  }
  const monthLabels = getMonthLabels(term);
  const rowsHtml = missing.map(m =>
    `<tr><td>${escapeHtml(m.studentName)}</td><td>${escapeHtml(m.componentName)}</td><td>${monthLabels[m.month - 1] || m.month}</td></tr>`
  ).join('');
  area.innerHTML = `
    <div class="card" style="background:#fff7ed; border:1px solid #fdba74;">
      <div style="font-weight:700; color:#9a3412; margin-bottom:8px;">⚠️ ${missing.length} خانة لم تُرصد بعد - مادة "${escapeHtml(subjectName)}" - فصل "${classSectionLabel(cls)}" - ${term === 'first' ? 'الفصل الأول' : 'الفصل الثاني'}</div>
      <div class="table-wrap" style="max-height:320px; overflow:auto;">
        <table>
          <thead><tr><th>الطالب</th><th>المكوّن</th><th>الشهر</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>`;
}



// لوحة "أداء هذا الفصل" - نفس فكرة مخططات تبويب الإحصائيات (متوسط شهري + توزيع مستويات)، لكن
// مصغَّرة وموضوعة داخل تبويب "رصد الدرجات" نفسه لأن المعلم مقيَّد بهذا التبويب فقط ولا يصل
// لتبويب الإحصائيات - فبدونها كان المعلم محرومًا تمامًا من رؤية أداء فصله بصريًا. تعتمد تلقائيًا
// على نفس المادة/الفصل/الفصل الدراسي المختارين أعلاه، دون أي قوائم اختيار إضافية.
function toggleGradesTabPerformancePanel() {
  const area = document.getElementById('gradesTabPerformancePanel');
  if (!area) return;
  if (area.style.display === 'none') { renderGradesTabPerformancePanel();
    area.style.display = 'block'; } else { area.style.display = 'none'; }
}
