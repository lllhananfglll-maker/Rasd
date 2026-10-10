/** features/grades-ui.js — مدمج بالكامل (المرحلة C) — لا أجزاء part* متبقية */
'use strict';




function getMonthlyDivideMode() {
  const v = localStorage.getItem(MONTHLY_DIVIDE_MODE_KEY);
  return v === 'half' ? 'half' : 'asis'; // 'asis' هو الافتراضي (يطابق السلوك السابق)
}


function setMonthlyDivideMode(mode) {
  localStorage.setItem(MONTHLY_DIVIDE_MODE_KEY, mode === 'half' ? 'half' : 'asis');
}



// يحسب الدرجة النهائية لمكوّن ما في فصل دراسي كامل، بتجميع درجاته عبر شهور الفصل (شهرين أو
// ثلاثة) حسب نوع المكوّن - بصمت تماماً دون أي اختيار يدوي من المستخدم:
// - مكوّن "الدرجة الشهرية" (الامتحانات): جمع أو متوسط الشهور تلقائياً حسب الدرجة العظمى المسجَّلة
//   فعلياً له (انظر getAutoExamAggregationMode).
// - مكوّن "عدد أيام الغياب": مجموع الشهور (تراكمي).
// - أي مكوّن آخر (بما في ذلك "نسبة الحضور/الغياب"): متوسط الشهور التي رُصدت درجاتها فعلياً.
function computeFinalComponentScore(db, studentId, subjectName, componentIndex, term, componentName, componentMaxScore, monthCountOverride) {
  // تجميع عبر فترات الفصل؛ داخل كل فترة: متوسط الأسابيع المرصودة (للمكوّنات الأسبوعية).
  // مكوّنات الامتحان/التقييم الشهري: درجة واحدة لكل فترة (week=0) ثم متوسط الفترات.
  const termMonthCount = monthCountOverride || getMonthLabels(term).length;
  const examLike = isExamLikeComponent(componentName);
  const monthCount = examLike ? EXAM_TERM_SITTINGS : termMonthCount;
  const idx = buildGradesIndex(db);
  const wp = (typeof GSP !== 'undefined' && GSP.weeklyPeriod) ? GSP.weeklyPeriod : null;
  const vals = [];
  for (let m = 1; m <= monthCount; m++) {
    const weekCount = (typeof getPeriodWeekCount === 'function') ? getPeriodWeekCount(term, m) : 4;
    if (wp && typeof wp.collectPeriodComponentValues === 'function') {
      const periodVals = wp.collectPeriodComponentValues(idx, studentId, subjectName, term, m, componentIndex, weekCount, examLike || isExamComponent(componentName));
      if (periodVals.length) {
        // داخل الفترة: متوسط الأسابيع (أو القيمة الوحيدة للامتحان)
        const periodScore = aggregateAbsentAwareValues(periodVals, 'average');
        if (periodScore !== null && periodScore !== undefined && periodScore !== '') vals.push(periodScore);
      }
    } else {
      const g = idx.get(studentId + '|' + subjectName + '|' + term + '|' + m + '|' + componentIndex);
      if (g && g.score !== '' && g.score !== null && g.score !== undefined) vals.push(g.score);
    }
  }
  if (vals.length === 0) return null;
  if (examLike || isExamComponent(componentName)) {
    return aggregateAbsentAwareValues(vals, 'average');
  }
  if (isAbsenceDaysComponent(componentName)) {
    return aggregateAbsentAwareValues(vals, 'sum');
  }
  return aggregateAbsentAwareValues(vals, 'average');
}

function handleGradePeriodChange() {
  if (typeof refreshGradeWeekSelect === 'function') refreshGradeWeekSelect();
  if (typeof loadGradesUI === 'function') loadGradesUI();
}
GSP.handleGradePeriodChange = handleGradePeriodChange;




// ============================================================
//  فحص "الخانات الفارغة" (درجات لم تُرصد بعد) قبل الطباعة/التصدير
// ============================================================
// يبني قائمة "خانات" (طالب × مادة × مكوّن × فصل دراسي × شهر) يجب التأكد أن كل واحدة منها
// مرصودة فعلاً (رقم أو "غ") قبل تنفيذ عملية طباعة/تصدير. كل نقطة استدعاء (طباعة كشف شهر،
// طباعة متوسط، تصدير...) تبني قائمتها الخاصة حسب نطاقها بالضبط (مادة واحدة أو كل المواد،
// شهر واحد أو كل شهور الفصل).
function buildCellsForCheck(students, subjectName, componentEntries, term, months) {
  const cells = [];
  students.forEach(s => {
    months.forEach(month => {
      componentEntries.forEach(ce => {
        cells.push({ studentId: s.id, studentName: s.name, subjectName, componentIndex: ce.index, componentName: ce.name, term, month });
      });
    });
  });
  return cells;
}



// يفحص قائمة الخانات المطلوبة ويُرجع فقط ما لم يُرصد له أي درجة إطلاقاً (لا رقم ولا "غ") -
// الصفر و"غ" رصد فعلي مقصود من المعلم فلا يُحتسبان خانة فارغة.
function scanMissingGradeCells(db, cells) {
  const idx = buildGradesIndex(db);
  const missing = [];
  cells.forEach(c => {
    const g = idx.get(c.studentId + '|' + c.subjectName + '|' + c.term + '|' + c.month + '|' + c.componentIndex);
    if (!g || g.score === '' || g.score === null || g.score === undefined) missing.push(c);
  });
  return missing;
}



// يبني نص تحذير واضح يوضح عدد الخانات الفارغة، وأسماء الطلاب المتأثرين (حتى حد أقصى من
// الأسطر حتى لا تصبح الرسالة غير قابلة للقراءة)، والمكوّن/الشهر الناقص لكل حالة.
// يبني محتوى HTML لجدول الخانات الناقصة داخل النافذة المخصصة (بدل نص طويل داخل confirm()).
function buildMissingGradesModalHtml(missing, opts) {
  opts = opts || {};
  const maxRows = opts.maxLines || 40;
  const rowsHtml = missing.slice(0, maxRows).map(m => {
    const monthLabels = getMonthLabels(m.term);
    const monthLabel = monthLabels[m.month - 1] || `الشهر ${m.month}`;
    return `<tr><td>${escapeHtml(m.studentName)}</td><td>${escapeHtml(m.subjectName)}</td><td>${escapeHtml(m.componentName)}</td><td>${monthLabel}</td></tr>`;
  }).join('');
  const moreNote = missing.length > maxRows ?
    `<div style="margin-top:8px; color:#78350f;">... و${missing.length - maxRows} خانة أخرى لم تُعرض هنا.</div>` : '';
  return `
    <div style="margin-bottom:10px;"><strong>يوجد ${missing.length} خانة درجة لم تُرصد بعد</strong> (فارغة تماماً - وليست "غ" أو صفر):</div>
    <table>
      <thead><tr><th>الطالب</th><th>المادة</th><th>المكوّن</th><th>الشهر</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    ${moreNote}
    <div style="margin-top:14px; color:#78350f;">يُفضَّل الرجوع وإكمال رصد هذه الخانات أولاً (أو تسجيلها "غ" إن كان الطالب غائباً حتى لا تبقى فارغة سهواً).</div>`;
}



// يعرض نافذة تأكيد مخصصة (وليست confirm() الافتراضية من المتصفح) تحجب الصفحة بالكامل وتنتظر
// قراراً صريحاً من المستخدم (متابعة/إلغاء). تُرجع Promise<boolean>: true = متابعة، false = إلغاء.
var _missingGradesModalPending = null;
var _missingGradesModalSettle = null;

function hideMissingGradesModal() {
  const overlay = document.getElementById('missingGradesModalOverlay');
  if (!overlay) return;
  overlay.style.setProperty('display', 'none', 'important');
  overlay.classList.add('hidden');
  const proceedBtn = document.getElementById('missingGradesModalProceedBtn');
  const cancelBtn = document.getElementById('missingGradesModalCancelBtn');
  if (proceedBtn) proceedBtn.disabled = false;
  if (cancelBtn) cancelBtn.disabled = false;
}

function showMissingGradesModal(missing, opts) {
  if (_missingGradesModalPending) return _missingGradesModalPending;

  _missingGradesModalPending = new Promise(resolve => {
    const overlay = document.getElementById('missingGradesModalOverlay');
    const body = document.getElementById('missingGradesModalBody');
    const proceedBtn = document.getElementById('missingGradesModalProceedBtn');
    const cancelBtn = document.getElementById('missingGradesModalCancelBtn');
    if (!overlay || !body || !proceedBtn || !cancelBtn) {
      console.warn('showMissingGradesModal: elements missing — defaulting to cancel');
      _missingGradesModalPending = null;
      _missingGradesModalSettle = null;
      resolve(false);
      return;
    }
    body.innerHTML = buildMissingGradesModalHtml(missing, opts);
    overlay.classList.remove('hidden');
    overlay.style.setProperty('display', 'flex', 'important');
    proceedBtn.disabled = false;
    cancelBtn.disabled = false;

    var settled = false;
    function cleanup(result) {
      if (settled) return;
      settled = true;
      proceedBtn.disabled = true;
      cancelBtn.disabled = true;
      hideMissingGradesModal();
      try {
        proceedBtn.removeEventListener('click', onProceed);
        cancelBtn.removeEventListener('click', onCancel);
        proceedBtn.onclick = null;
        cancelBtn.onclick = null;
      } catch (e) {}
      _missingGradesModalSettle = null;
      _missingGradesModalPending = null;
      resolve(result);
    }
    _missingGradesModalSettle = cleanup;

    function onProceed(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      cleanup(true);
    }
    function onCancel(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      cleanup(false);
    }
    // مستمعات مباشرة + onclick كمسار احتياطي (أوثق من data-action)
    proceedBtn.addEventListener('click', onProceed, { once: true });
    cancelBtn.addEventListener('click', onCancel, { once: true });
    proceedBtn.onclick = onProceed;
    cancelBtn.onclick = onCancel;
  });
  return _missingGradesModalPending;
}

// مسارات data-action (بدون dispatchEvent لتجنب التكرار اللانهائي)
if (typeof GSP !== 'undefined') {
  GSP.hideMissingGradesModal = hideMissingGradesModal;
  GSP.gspMissingGradesProceed = function () {
    if (typeof _missingGradesModalSettle === 'function') _missingGradesModalSettle(true);
    else try { hideMissingGradesModal(); } catch (e) {}
  };
  GSP.gspMissingGradesCancel = function () {
    if (typeof _missingGradesModalSettle === 'function') _missingGradesModalSettle(false);
    else try { hideMissingGradesModal(); } catch (e) {}
  };
}



// الحاجز العام: يُستدعى (بـ await) قبل أي طباعة/تصدير متعلق بالدرجات. يفحص الخانات المطلوبة،
// ولو وجد نواقص يعرض النافذة المخصصة أعلاه وينتظر قرار المستخدم، ولو لم يوجد أي نقص يُكمل
// بصمت فوراً دون أي إزعاج للمستخدم. يُرجع Promise<boolean>: true للمتابعة، false للإلغاء.
async function confirmProceedDespiteMissingGrades(db, cells, opts) {
  const missing = scanMissingGradeCells(db, cells);
  if (!missing.length) return true;
  return await showMissingGradesModal(missing, opts);
}



// → features/import-export.js

// → features/print-sheets.js

// → features/import-export.js

function subjectTermTotal(db, studentId, subjectName, term, subject) {
  let total = 0,
    any = false,
    hasNumeric = false,
    hasIncomplete = false;
  // مكونات الحضور/الغياب (بدون درجة عظمى) لا تُحتسب ضمن المجموع الأكاديمي للمادة - هي بيانات
  // منفصلة (نسبة/عدد أيام) وليست جزءاً من درجات أعمال السنة.
  subject.components.forEach((comp, ci) => {
    if (comp.type === 'attendance') return;
    const v = computeFinalComponentScore(db, studentId, subjectName, ci, term, comp.name, comp.maxScore);
    if (v !== null) {
      any = true;
      // مكوّن لم تُرصَد له كل شهور الفصل بعد ("غير مكتمل"): يجعل مجموع المادة كله "غير مكتمل"،
      // حتى لا يظهر مجموع نهائي مضلِّل قبل اكتمال رصد كل المكونات.
      if (isIncompleteMark(v)) { hasIncomplete = true;
        return; }
      // مكوّن غاب فيه الطالب طوال الفصل بأكمله ("غ" نهائياً): يُستبعد من المجموع الكلي، لا يُحتسب صفراً
      if (!isAbsentMark(v)) { total += v;
        hasNumeric = true; }
    }
  });
  if (!any) return null;
  if (hasIncomplete) return INCOMPLETE_MARK;
  return hasNumeric ? total : ABSENT_MARK;
}



// ============================================================
//  نظام "الدرجة الوصفية" (Tier) - حسب نوع المرحلة (info.stageType)
// ============================================================
// المرحلة الابتدائية (عربي ولغات معاً): أربع فئات وصفية (يفوق التوقعات/يلبي التوقعات/يلبي
// التوقعات أحياناً/أقل من المتوقع) بدل نظام "ممتاز/جيد جداً" التقليدي.
// أي مرحلة أخرى (إعدادي/ثانوي/KG): يبقى نظام "ممتاز/جيد جداً/جيد/مقبول/ضعيف" كما هو دون تغيير.
function tierColorMap(stageType) {
  return stageType === 'primary' ? {
    'يفوق التوقعات': 'var(--rasd-brand-dark)', 'يلبي التوقعات': '#15803d',
    'يلبي التوقعات أحياناً': '#eab308', 'أقل من المتوقع': 'var(--rasd-danger)'
  } : {
    'ممتاز': 'var(--rasd-brand-dark)', 'جيد جداً': '#15803d', 'جيد': '#0d9488', 'مقبول': '#eab308', 'ضعيف': 'var(--rasd-danger)'
  };
}


function gradeTierOrder(stageType) {
  return stageType === 'primary' ?
    ['يفوق التوقعات', 'يلبي التوقعات', 'يلبي التوقعات أحياناً', 'أقل من المتوقع'] :
    ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'ضعيف'];
}


function getGradeTier(percentage, stageType) {
  if (percentage === null || percentage === undefined || isNaN(percentage)) return null;
  const p = Math.max(0, Math.min(100, percentage));
  const colors = tierColorMap(stageType);
  let label;
  if (stageType === 'primary') {
    label = p >= 85 ? 'يفوق التوقعات' : p >= 65 ? 'يلبي التوقعات' : p >= 50 ? 'يلبي التوقعات أحياناً' : 'أقل من المتوقع';
  } else {
    label = p >= 90 ? 'ممتاز' : p >= 80 ? 'جيد جداً' : p >= 65 ? 'جيد' : p >= 50 ? 'مقبول' : 'ضعيف';
  }
  return { label, color: colors[label], percentage: p };
}


function buildTierLegendHtml(stageType) {
  const colors = tierColorMap(stageType);
  const order = gradeTierOrder(stageType);
  const ranges = stageType === 'primary' ? {
    'يفوق التوقعات': '85% إلى 100%', 'يلبي التوقعات': '65% إلى أقل من 85%',
    'يلبي التوقعات أحياناً': '50% إلى أقل من 65%', 'أقل من المتوقع': '1% إلى أقل من 50%'
  } : {
    'ممتاز': '90% إلى 100%', 'جيد جداً': '80% إلى أقل من 90%', 'جيد': '65% إلى أقل من 80%',
    'مقبول': '50% إلى أقل من 65%', 'ضعيف': 'أقل من 50%'
  };
  return `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
    ${order.map(label => `<div style="flex:1; min-width:130px; text-align:center; border-radius:6px; overflow:hidden; border:1px solid #e2e8f0;">
      <div style="background:#f8fafc; font-size:11.5px; font-weight:700; padding:5px; color:#334155;">${label}</div>
      <div style="background:${colors[label]}; color:#fff; font-size:11.5px; font-weight:700; padding:6px;">${ranges[label]}</div>
    </div>`).join('')}
  </div>`;
}



// إجمالي الدرجة العظمى الأكاديمية للمادة (يستثني مكونات الحضور/الغياب - بنفس منطق subjectTermTotal)
function subjectAcademicMaxTotal(subject) {
  return (subject.components || []).filter(c => c.type !== 'attendance')
    .reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0);
}


// النسبة المئوية لمجموع مادة معينة لطالب عبر فصل دراسي كامل - تُبنى فوق subjectTermTotal
// الموجودة بالفعل، فتحترم تلقائياً نفس منطق "غير مكتمل"/"غ" المتّبع في باقي النظام.
function computeSubjectTermPercentage(db, studentId, subjectName, term, subject) {
  const total = subjectTermTotal(db, studentId, subjectName, term, subject);
  if (total === null || total === INCOMPLETE_MARK || total === ABSENT_MARK) return null;
  const maxTotal = subjectAcademicMaxTotal(subject);
  if (!maxTotal) return null;
  return (Number(total) / maxTotal) * 100;
}



// ============================================================
//  رسوم بيانية SVG خفيفة (بدون أي مكتبة خارجية - ملف واحد مكتفٍ بذاته)
// ============================================================
function updateFilters() {
  const db = loadDB();
  const availableClasses = (currentRole === 'teacher' && currentTeacher) ? teacherAllClasses(currentTeacher) : db
    .classes;

  const classFilter = document.getElementById('studentClassFilter');
  const currentVal = classFilter.value;
  classFilter.innerHTML = '<option value="">جميع الفصول</option>';
  availableClasses.forEach(c => { const o = document.createElement('option');
    o.value = c;
    o.textContent = classSectionLabel(c);
    classFilter.appendChild(o); });
  if (currentVal) classFilter.value = currentVal;

  loadStudentsUI();
}



// يبني قائمة "اختر فصل" في تبويب الدرجات بناءً على المادة المختارة حالياً: لو مسجّل الدخول معلم،
// تقتصر الفصول على فصول هذا المعلم لهذه المادة تحديداً (فقد تختلف فصوله من مادة لأخرى)، أما المدير
// فيرى كل فصول المدرسة دائماً.
// يُرجع مفتاح نطاق الصف/القسم لفصل معيّن (بنفس صيغة مفاتيح SUBJECT_CATALOG: "اسم الصف|القسم")
// بالاعتماد على db.classGrade وقسم الفصل المُشفَّر داخل مفتاحه (بعد رمز §).
function classScopeKey(cls, db) {
  const grade = (db.classGrade || {})[cls] || '';
  const section = (cls || '').split('§')[1] || '';
  return grade + '|' + section;
}



// هل تنطبق مادة معيّنة على نطاق فصل معيّن؟ المواد التي لا تحمل appliesTo (مواد أُضيفت يدوياً من
// قِبل الإدارة قبل هذا التحديث، أو بلا نطاق محدد) تُعتبر عامة وتنطبق على كل الفصول، حفاظاً على
// التوافق مع البيانات القديمة.
function subjectAppliesToClass(subj, cls, db) {
  if (!subj || !subj.appliesTo || !subj.appliesTo.length) return true;
  return subj.appliesTo.includes(classScopeKey(cls, db));
}



// هل تنطبق المادة على صف+قسم معيّنين (مفتاح appliesTo بصيغة "اسم الصف|القسم")؟
// المواد بلا appliesTo تُعتبر عامة (توافق مع البيانات القديمة).
function subjectAppliesToGradeSection(subj, grade, section) {
  if (!subj || !subj.appliesTo || !subj.appliesTo.length) return true;
  const scopeKey = String(grade || '') + '|' + String(section || '');
  return subj.appliesTo.includes(scopeKey);
}




// يبني قائمة "اختر فصل" في تبويب الدرجات بناءً على المادة المختارة حالياً: لو مسجّل الدخول معلم،
// تقتصر الفصول على فصول هذا المعلم لهذه المادة تحديداً (فقد تختلف فصوله من مادة لأخرى)، أما المدير
// فيرى كل فصول المدرسة. في الحالتين، تُستبعَد أيضاً أي فصول لا تنتمي أصلاً لصف/قسم هذه المادة
// (حسب appliesTo المسجَّل من كتالوج المواد)، حتى لا يظهر فصل لا يدرس هذه المادة إطلاقاً.
function refreshGradeClassOptions() {
  const db = loadDB();
  const gradeClass = document.getElementById('gradeClassSelect');
  const gcVal = gradeClass.value;
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  let availableClasses;
  if (currentRole === 'teacher' && currentTeacher) {
    availableClasses = subjectName ? teacherClassesForSubject(currentTeacher, subjectName) : teacherAllClasses(
      currentTeacher);
  } else {
    availableClasses = db.classes;
  }
  if (subjectName) {
    const subj = db.subjects.find(s => s.name === subjectName);
    availableClasses = availableClasses.filter(c => subjectAppliesToClass(subj, c, db));
  }
  gradeClass.innerHTML = '<option value="">-- اختر فصل --</option>';
  availableClasses.forEach(c => { const o = document.createElement('option');
    o.value = c;
    o.textContent = classSectionLabel(c);
    gradeClass.appendChild(o); });
  if (gcVal && availableClasses.includes(gcVal)) gradeClass.value = gcVal;
}




/** STEP 31: push current grades filter DOM values into application UI state. */
function syncGradesFiltersToUIState() {
  try {
    const uiState = (typeof GSP !== 'undefined' && GSP.application && GSP.application.gradesUIState) || null;
    if (!uiState || typeof uiState.syncFromDom !== 'function') return null;
    const subjectEl = document.getElementById('gradeSubjectSelect');
    const classEl = document.getElementById('gradeClassSelect');
    const termEl = document.getElementById('gradeTermSelect');
    const monthEl = document.getElementById('gradeMonthSelect');
    return uiState.syncFromDom({
      subjectName: subjectEl ? subjectEl.value : '',
      classKey: classEl ? classEl.value : '',
      term: termEl ? termEl.value : 'first',
      month: monthEl ? parseInt(monthEl.value, 10) : 1
    });
  } catch (e) {
    return null;
  }
}
GSP.syncGradesFiltersToUIState = syncGradesFiltersToUIState;

function onGradeSubjectSelectChange() {
  refreshGradeClassOptions();
  syncGradesFiltersToUIState();
  loadGradesUI();
}



// عند تغيير الفصل المختار، تُعاد تصفية قائمة المواد لتقتصر على مواد صف/قسم هذا الفصل تحديداً
// (بدل عرض كل مواد المرحلة مختلطة)، حتى تنعكس مباشرة فكرة "المواد تُحدَّد حسب الصف والقسم".
function onGradeClassSelectChange() {
  updateSubjectDropdowns();
  syncGradesFiltersToUIState();
  loadGradesUI();
}



function updateSubjectDropdowns() {
  const db = loadDB();
  const gradeSubj = document.getElementById('gradeSubjectSelect');
  const gsVal = gradeSubj.value;
  const gradeClassEl = document.getElementById('gradeClassSelect');
  const currentClassVal = gradeClassEl ? gradeClassEl.value : '';
  const scopeFilter = s => !currentClassVal || subjectAppliesToClass(s, currentClassVal, db);
  gradeSubj.innerHTML = '<option value="">-- اختر مادة --</option>';
  if (currentRole === 'teacher' && currentTeacher) {
    const subjNames = teacherSubjectNames(currentTeacher);
    const filtered = db.subjects.filter(su => subjNames.includes(su.name) && scopeFilter(su));
    filtered.forEach(s => { const o = document.createElement('option');
      o.value = s.name;
      o.textContent = s.name;
      gradeSubj.appendChild(o); });
    // معلم بمادة واحدة فقط (ضمن النطاق الحالي): القائمة تبقى معطّلة كما كان سابقاً. معلم بأكثر
    // من مادة: يختار بينها.
    gradeSubj.disabled = filtered.length <= 1;
    if (gsVal && filtered.some(s => s.name === gsVal)) gradeSubj.value = gsVal;
    else if (filtered.length) gradeSubj.value = filtered[0].name;
  } else {
    gradeSubj.disabled = false;
    db.subjects.filter(scopeFilter).forEach(s => { const o = document.createElement('option');
      o.value = s.name;
      o.textContent = s.name;
      gradeSubj.appendChild(o); });
    if (gsVal) gradeSubj.value = gsVal;
  }
  refreshGradeClassOptions();
}



// ============================================================
//  GRADES TAB
// ============================================================
function lockKey(cls, subj, term, month) { return `${cls}||${subj}||${term}||${month}`; }


function monthLockKey(term, month) { return `${term}||${month}`; }


function isTermLocked(db, term) { return !!(db.termLocks && db.termLocks[term]); }



function isGradeEntryLocked(db, cls, subjectName, term, month) {
  if (currentRole === 'admin') return false;
  const globalLocked = !!db.globalLock;
  const termLocked = isTermLocked(db, term);
  const monthLocked = !!(db.monthLocks && db.monthLocks[monthLockKey(term, month)]);
  const individualLocked = !!(db.locks && db.locks[lockKey(cls, subjectName, term, month)]);
  return globalLocked || termLocked || monthLocked || individualLocked;
}



function toggleGlobalLock() {
 try {
  const lockSvc = (typeof GSP !== 'undefined' && GSP.application && GSP.application.gradesLock) || null;
  if (lockSvc && typeof lockSvc.toggleGlobal === 'function') {
    const result = lockSvc.toggleGlobal();
    if (!result.ok) return;
    updateGlobalLockUI();
    loadGradesUI();
    return;
  }
  if (currentRole !== 'admin') return;
  const db = loadDB();
  db.globalLock = !db.globalLock;
  saveDB(db);
  updateGlobalLockUI();
  loadGradesUI();

 } catch (e) {
   console.error('toggleGlobalLock failed:', e);
   alert('⚠️ حدث خطأ أثناء تغيير حالة القفل العام.\n' + (e && e.message ? e.message : e));
 }
}


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
    badge.style.background = locked ? 'var(--rasd-danger)' : 'var(--rasd-brand)';
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
  termBadge.style.background = term === 'first' ? 'var(--rasd-brand)' : '#b45309';
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
    document.getElementById('gradesStatus').style.color = 'var(--rasd-danger)';
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
      <td class="col-action" data-label="إجراء"><button class="btn btn-primary btn-sm" ${isLocked ? 'disabled' : ''} data-action="saveStudentRow" data-args='${gspArgs([s.id])}'>💾 حفظ</button></td>
    `;
    fragment.appendChild(row);
  });
  tbody.appendChild(fragment);

  const missingBadge = missingCount > 0 ?
    ` — ⚠️ يوجد ${missingCount} خانة لم تُرصد بعد لهذا الشهر (مظللة بالأحمر أدناه)` : ' — ✅ كل الخانات مرصودة لهذا الشهر';
  document.getElementById('gradesStatus').textContent =
    `تم تحميل ${students.length} طالب - ${monthLabels[month - 1] || ''} (🧮 = مكون امتحان، يُجمع بين الشهور المُدخلة بدل حساب المتوسط)${missingBadge}`;
  document.getElementById('gradesStatus').style.color = missingCount > 0 ? '#b45309' : 'var(--rasd-brand)';
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


function renderGradesTabPerformancePanel() {
  const area = document.getElementById('gradesTabPerformancePanel');
  if (!area) return;
  const db = loadDB();
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  if (!subjectName || !cls) { area.innerHTML = ''; return; }
  const subject = db.subjects.find(s => s.name === subjectName);
  if (!subject) { area.innerHTML = ''; return; }
  const stageType = (db.schoolInfo && db.schoolInfo.stageType) || '';

  let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
  students = filterStudentsForTeacherLanguage(students, subjectName, cls);
  if (!students.length) { area.innerHTML = '<div style="color:var(--rasd-text-subtle); font-size:13px;">لا يوجد طلاب في هذا الفصل.</div>'; return; }

  const tierOrder = gradeTierOrder(stageType);
  const colors = tierColorMap(stageType);
  const counts = {};
  tierOrder.forEach(l => counts[l] = 0);
  let counted = 0;
  students.forEach(s => {
    const pct = computeSubjectTermPercentage(db, s.id, subjectName, term, subject);
    if (pct === null) return;
    const tier = getGradeTier(pct, stageType);
    if (!tier) return;
    counts[tier.label]++;
    counted++;
  });
  const donutSegments = tierOrder.map(label => ({ label, value: counts[label], color: colors[label] }));

  const monthLabels = getMonthLabels(term);
  const monthlyAverages = monthLabels.map((label, idx) => {
    const month = idx + 1;
    let sumPct = 0, cnt = 0;
    students.forEach(s => {
      let sum = 0, max = 0;
      subject.components.forEach((comp, ci) => {
        if (comp.type === 'attendance') return;
        const g = (typeof GSP !== 'undefined' && GSP.performance && typeof GSP.performance.lookupGrade === 'function')
          ? GSP.performance.lookupGrade(db, s.id, subjectName, term, month, ci)
          : db.grades.find(gg => gg.studentId === s.id && gg.subjectName === subjectName &&
            gg.term === term && gg.month === month && gg.componentIndex === ci);
        const val = g ? g.score : '';
        if (val === '' || isAbsentMark(val)) return;
        const num = Number(val);
        if (!isNaN(num)) { sum += num;
          max += Number(comp.maxScore) || 0; }
      });
      if (max > 0) { sumPct += (sum / max) * 100;
        cnt++; }
    });
    return { label, value: cnt ? sumPct / cnt : 0, hasData: cnt > 0 };
  });

  area.innerHTML = `
    <div class="card" style="background:#f8fafc;">
      <div style="font-weight:700; color:#334155; margin-bottom:8px;">📊 أداء فصل "${classSectionLabel(cls)}" - مادة "${escapeHtml(subjectName)}"</div>
      ${buildTierLegendHtml(stageType)}
      <div class="grid-2" style="align-items:start; gap:20px;">
        <div>
          <div style="font-weight:700; color:#334155; margin-bottom:8px; text-align:center; font-size:13px;">📈 متوسط الأداء الشهري</div>
          <div style="display:flex; justify-content:center;">${buildBarChartSvg(monthlyAverages)}</div>
        </div>
        <div>
          <div style="font-weight:700; color:#334155; margin-bottom:8px; text-align:center; font-size:13px;">🥯 توزيع الطلاب حسب المستوى (${counted} من ${students.length} - مجموع الفصل الدراسي الكامل)</div>
          <div style="display:flex; justify-content:center;">${buildDonutChartSvg(donutSegments)}</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:10px;">
            ${donutSegments.map(seg => `<span style="display:inline-flex; align-items:center; gap:5px; font-size:12px; color:#334155;"><span style="width:10px;height:10px;border-radius:50%;background:${seg.color};display:inline-block;"></span>${seg.label} (${seg.value})</span>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
}


// الدرجات المطبوع فقط، دون التأثير على الأرقام المستخدمة داخلياً في حسابات النظام.
// → features/print-sheets.js



function validateGradeInput(input) {
  const parsed = parseStrictGradeInput(input.value, input.dataset.max);
  if (input.value !== '' && !parsed.ok) input.classList.add('invalid');
  else input.classList.remove('invalid');
  updateInvalidGradesBanner();
}



// تنبيه ظاهر أعلى جدول الرصد بعدد الدرجات التي تتجاوز الحد أو غير صالحة — يُحدَّث لحظياً
function updateInvalidGradesBanner() {
  const banner = document.getElementById('gradesInvalidBanner');
  if (!banner) return;
  const invalids = document.querySelectorAll('#gradesTableBody .grade-input.invalid');
  const n = invalids.length;
  if (!n) {
    banner.style.display = 'none';
    banner.textContent = '';
    return;
  }
  banner.style.display = 'block';
  banner.innerHTML = '🚫 يوجد <strong>' + n + '</strong> درجة تتجاوز الحد الأقصى أو غير صالحة (خلفية حمراء غامقة ورقم أبيض). صحّحها قبل الحفظ.';
}



// يرصد الدرجة النهائية (الدرجة العظمى) تلقائياً لكل طلاب الفصل المختار في كل مكونات المادة
// ما عدا المكوّن المحدَّد كـ"الدرجة الشهرية"، دون المساس بأي درجة مُدخَلة بالفعل لأي طالب - تسهيلاً
// على المعلمين، حيث يحصل معظم الطلاب على الدرجة النهائية في هذه المكونات فعلياً، ويبقى فقط تعديل
// الاستثناءات القليلة يدوياً بعد الرصد الجماعي، ثم إدخال درجة الشهر (المتفاوتة) لكل طالب كالمعتاد.
async function bulkFillFullMarks() {
 try {
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  const month = parseInt(document.getElementById('gradeMonthSelect').value, 10);
  const bulkSvc = (typeof GSP !== 'undefined' && GSP.application && GSP.application.gradesBulk) || null;
  if (bulkSvc && typeof bulkSvc.planBulkFullMarks === 'function' && typeof bulkSvc.commitBulkFullMarks === 'function') {
    const plan = bulkSvc.planBulkFullMarks({ subjectName, cls, term, month });
    if (!plan.ok) { alert(plan.reason || 'تعذر الرصد الجماعي'); return; }
    const compNames = plan.fillComponents.map(({ c }) => c.name + ' (' + (c.maxScore != null ? c.maxScore : '') + ')').join('، ');
    const classLabel = (typeof classSectionLabel === 'function') ? classSectionLabel(cls) : cls;
    if (!(await showConfirm('سيتم رصد الدرجة النهائية (الدرجة العظمى) في المكونات التالية لكل طلاب فصل "' + classLabel + '" في مادة "' + subjectName + '" لهذا الشهر:\n' + compNames + '\n\nلن يتم لمس أي درجة مُدخَلة بالفعل. عدد الطلاب: ' + plan.students.length + '. متابعة؟'))) return;
    const result = bulkSvc.commitBulkFullMarks(plan, { skipExisting: true });
    const status = document.getElementById('gradesStatus');
    if (status) {
      status.textContent = '✅ تم رصد ' + result.filled + ' خانة (تخطي موجود: ' + result.skippedExisting + ')';
      status.style.color = 'var(--rasd-brand)';
    }
    loadGradesUI();
    return;
  }
  const db = loadDB();
  if (!subjectName || !cls) { alert('يرجى اختيار المادة والفصل أولاً.'); return; }
  const subject = db.subjects.find(s => s.name === subjectName);
  if (!subject) return;
  if (!canAccessGrade(subjectName, cls)) { alert('🚫 غير مصرح لك بالوصول لهذه المادة أو الفصل.'); return; }
  if (isGradeEntryLocked(db, cls, subjectName, term, month)) { alert('🔒 إدخال الدرجات مقفول حالياً لهذا الفصل/المادة/الشهر، لا يمكن الرصد الجماعي.'); return; }

  // مكونات الحضور/الغياب (بدون درجة عظمى) تُستبعد أيضاً من الرصد الجماعي للدرجة النهائية، لأنه
  // لا يوجد لها أصلاً "درجة عظمى" لرصدها.
  const fillComponents = (subject.components || []).map((c, ci) => ({ c, ci })).filter(({ c }) => !c.isMonthlyGrade && c.type !== 'attendance');
  if (!fillComponents.length) { alert('لا توجد مكونات في هذه المادة غير "الدرجة الشهرية" ومكونات الحضور/الغياب لرصدها بالكامل.'); return; }
  const hasMonthlyFlag = (subject.components || []).some(c => c.isMonthlyGrade);
  if (!hasMonthlyFlag) {
    alert(`⚠️ مادة "${subjectName}" ليس لها أي مكوّن محدَّد كـ"الدرجة الشهرية" بعد، فلن يستطيع النظام تمييزه عن باقي المكونات وسيتم رصد الدرجة الكاملة في كل المكونات بالخطأ (بما فيها الشهرية نفسها).\n\nيرجى الذهاب أولاً لتبويب "المواد" وتحديد المكوّن الصحيح (مثلاً "التقييم الشهري" أو "الاختبارات الشهرية") كـ"الدرجة الشهرية" لهذه المادة، ثم إعادة المحاولة.`);
    return;
  }

  let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
  students = filterStudentsForTeacherLanguage(students, subjectName, cls);
  students = students.filter(s => canAccessStudentGrade(subjectName, s));
  if (!students.length) { alert('لا يوجد طلاب مطابقين في هذا الفصل.'); return; }

  const compNames = fillComponents.map(({ c }) => `${c.name} (${compMaxLabel(c)})`).join('، ');
  if (!(await showConfirm(`سيتم رصد الدرجة النهائية (الدرجة العظمى) في المكونات التالية لكل طلاب فصل "${classSectionLabel(cls)}" في مادة "${subjectName}" لهذا الشهر:\n${compNames}\n\nلن يتم لمس أي درجة مُدخَلة بالفعل لأي طالب (تبقى كما هي)، ولن يتم لمس "الدرجة الشهرية" إطلاقاً. عدد الطلاب: ${students.length}. متابعة؟`))) return;

  let filled = 0,
    skippedExisting = 0;
  students.forEach(s => {
    fillComponents.forEach(({ c, ci }) => {
      const existing = db.grades.find(g => g.studentId === s.id && g.subjectName === subjectName && g.term === term && g.month === month && g.componentIndex === ci);
      if (existing) { skippedExisting++;
        return; }
      db.grades.push({ studentId: s.id, subjectName, term, month, componentIndex: ci, score: c.maxScore });
      filled++;
    });
  });
  saveDB(db);
  loadGradesUI();
  const status = document.getElementById('gradesStatus');
  status.textContent = `✅ تم رصد الدرجة النهائية تلقائياً في ${filled} خانة، وتم ترك ${skippedExisting} خانة كانت مُدخَلة مسبقاً كما هي`;
  status.style.color = 'var(--rasd-brand)';

 } catch (e) {
   console.error('bulkFillFullMarks failed:', e);
   alert('⚠️ حدث خطأ أثناء تعبئة الدرجة الكاملة الجماعية — راجع الدرجات فوراً فقد تكون العملية توقفت في نص الطريق.\n' + (e && e.message ? e.message : e));
 }
}


GSP.bulkFillFullMarks = bulkFillFullMarks;



// يرصد الدرجة العظمى في مكوّن الاختبار/الامتحان/التقييم الشهري فقط (isMonthlyGrade أو اسم امتحاني)
async function bulkFillMonthlyExamMarks() {
 try {
  const db = loadDB();
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  const month = parseInt(document.getElementById('gradeMonthSelect').value, 10);
  if (!subjectName || !cls) { alert('يرجى اختيار المادة والفصل أولاً.'); return; }
  const subject = db.subjects.find(s => s.name === subjectName);
  if (!subject) return;
  if (!canAccessGrade(subjectName, cls)) { alert('🚫 غير مصرح لك بالوصول لهذه المادة أو الفصل.'); return; }
  if (isGradeEntryLocked(db, cls, subjectName, term, month)) { alert('🔒 إدخال الدرجات مقفول حالياً لهذا الفصل/المادة/الشهر، لا يمكن الرصد الجماعي.'); return; }

  const fillComponents = (subject.components || []).map((c, ci) => ({ c, ci })).filter(({ c }) => {
    if (c.type === 'attendance' || c.type === 'passfail') return false;
    if (c.isMonthlyGrade) return true;
    return (typeof isExamComponent === 'function') && isExamComponent(c.name);
  });
  if (!fillComponents.length) {
    alert('لا يوجد في هذه المادة مكوّن محدَّد كـ«الدرجة الشهرية» أو باسم اختبار/امتحان/تقييم شهري.\n\nمن تبويب «المواد» حدّد المكوّن المناسب كدرجة شهرية ثم أعد المحاولة.');
    return;
  }

  let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
  students = filterStudentsForTeacherLanguage(students, subjectName, cls);
  students = students.filter(s => canAccessStudentGrade(subjectName, s));
  if (!students.length) { alert('لا يوجد طلاب مطابقين في هذا الفصل.'); return; }

  const compNames = fillComponents.map(({ c }) => `${c.name} (${compMaxLabel(c)})`).join('، ');
  if (!(await showConfirm(`سيتم رصد الدرجة النهائية (الدرجة العظمى) في مكوّن الاختبار/التقييم الشهري التالي لكل طلاب فصل "${classSectionLabel(cls)}" في مادة "${subjectName}" لهذا الشهر:\n${compNames}\n\nلن يتم لمس أي درجة مُدخَلة بالفعل. عدد الطلاب: ${students.length}. متابعة؟`))) return;

  let filled = 0, skippedExisting = 0;
  students.forEach(s => {
    fillComponents.forEach(({ c, ci }) => {
      const existing = db.grades.find(g => g.studentId === s.id && g.subjectName === subjectName && g.term === term && g.month === month && g.componentIndex === ci);
      if (existing) { skippedExisting++; return; }
      db.grades.push({ studentId: s.id, subjectName, term, month, componentIndex: ci, score: c.maxScore });
      filled++;
    });
  });
  saveDB(db);
  loadGradesUI();
  const status = document.getElementById('gradesStatus');
  if (status) {
    status.textContent = `✅ تم رصد درجة الاختبار/التقييم الشهري في ${filled} خانة، وتُرك ${skippedExisting} مُدخَلة مسبقاً`;
    status.style.color = 'var(--rasd-brand)';
  }

 } catch (e) {
   console.error('bulkFillMonthlyExamMarks failed:', e);
   alert('⚠️ حدث خطأ أثناء تعبئة درجات الامتحان الشهري الجماعية — راجع الدرجات فوراً.\n' + (e && e.message ? e.message : e));
 }
}


GSP.bulkFillMonthlyExamMarks = bulkFillMonthlyExamMarks;



// يمسح كل الدرجات المسجلة لهذه المادة ولهذا الفصل ولهذا الشهر تحديداً فقط (بغض النظر عن مصدرها -
// رصد جماعي أو إدخال يدوي)، لأخذها بالمرة الجديدة الصحيحة بعد تصحيح خاصية "الدرجة الشهرية" مثلاً.
async function bulkClearClassGrades() {
 try {
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  const month = parseInt(document.getElementById('gradeMonthSelect').value, 10);
  const bulkSvc = (typeof GSP !== 'undefined' && GSP.application && GSP.application.gradesBulk) || null;
  if (bulkSvc && typeof bulkSvc.planBulkClear === 'function' && typeof bulkSvc.commitBulkClear === 'function') {
    const plan = bulkSvc.planBulkClear({ subjectName, cls, term, month });
    if (!plan.ok) { alert(plan.reason || 'تعذر المسح الجماعي'); return; }
    const ids = new Set(plan.students.map(s => String(s.id)));
    const toDeleteCount = (plan.db.grades || []).filter(g => g.subjectName === subjectName && g.term === term && g.month === month && ids.has(String(g.studentId))).length;
    if (!toDeleteCount) { alert('لا توجد درجات مسجلة لهذه المادة/الفصل/الشهر لمسحها.'); return; }
    const classLabel = (typeof classSectionLabel === 'function') ? classSectionLabel(cls) : cls;
    if (!(await showConfirm('⚠️ سيتم حذف ' + toDeleteCount + ' درجة نهائياً لمادة "' + subjectName + '" في فصل "' + classLabel + '" لهذا الشهر. لا يمكن التراجع. متابعة؟'))) return;
    const result = bulkSvc.commitBulkClear(plan);
    loadGradesUI();
    const status = document.getElementById('gradesStatus');
    if (status) {
      status.textContent = '🧹 تم حذف ' + result.removed + ' درجة لهذا الفصل/المادة/الشهر';
      status.style.color = 'var(--rasd-text-muted)';
    }
    return;
  }
  const db = loadDB();
  if (!subjectName || !cls) { alert('يرجى اختيار المادة والفصل أولاً.'); return; }
  if (!canAccessGrade(subjectName, cls)) { alert('🚫 غير مصرح لك بالوصول لهذه المادة أو الفصل.'); return; }
  if (isGradeEntryLocked(db, cls, subjectName, term, month)) { alert('🔒 إدخال الدرجات مقفول حالياً لهذا الفصل/المادة/الشهر، لا يمكن المسح.'); return; }

  let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
  students = filterStudentsForTeacherLanguage(students, subjectName, cls);
  const studentIds = new Set(students.filter(s => canAccessStudentGrade(subjectName, s)).map(s => s.id));

  const toDeleteCount = (db.grades || []).filter(g => g.subjectName === subjectName && g.term === term && g.month === month && studentIds.has(g.studentId)).length;
  if (!toDeleteCount) { alert('لا توجد درجات مسجلة لهذه المادة/الفصل/الشهر لمسحها.'); return; }
  if (!(await showConfirm(`⚠️ سيتم حذف ${toDeleteCount} درجة نهائياً لمادة "${subjectName}" في فصل "${classSectionLabel(cls)}" لهذا الشهر (كل المكونات، بما فيها الدرجة الشهرية إن وُجدت). لا يمكن التراجع عن هذا. متابعة؟`))) return;

  db.grades = (db.grades || []).filter(g => !(g.subjectName === subjectName && g.term === term && g.month === month && studentIds.has(g.studentId)));
  saveDB(db);
  loadGradesUI();
  const status = document.getElementById('gradesStatus');
  status.textContent = `🧹 تم حذف ${toDeleteCount} درجة لهذا الفصل/المادة/الشهر`;
  status.style.color = 'var(--rasd-text-muted)';

 } catch (e) {
   console.error('bulkClearClassGrades failed:', e);
   alert('⚠️ حدث خطأ أثناء مسح درجات الفصل الجماعي — راجع الدرجات فوراً فقد تكون العملية توقفت في نص الطريق.\n' + (e && e.message ? e.message : e));
 }
}



// نسخة "لكل مكوّن على حدة" من الرصد الجماعي والمسح الجماعي، بحيث يمكن لمدير النظام أو المعلم
// التحكم في كل عمود من أعمدة المادة بشكل مستقل (بما في ذلك مكوّن "الدرجة الشهرية" نفسه إن احتاج).
async function bulkFillComponent(ci) {
 try {
  const db = loadDB();
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  const month = parseInt(document.getElementById('gradeMonthSelect').value, 10);
  if (!subjectName || !cls) return;
  const subject = db.subjects.find(s => s.name === subjectName);
  const comp = subject && subject.components[ci];
  if (!comp) return;
  if (!canAccessGrade(subjectName, cls)) { alert('🚫 غير مصرح لك بالوصول لهذه المادة أو الفصل.'); return; }
  if (isGradeEntryLocked(db, cls, subjectName, term, month)) { alert('🔒 إدخال الدرجات مقفول حالياً، لا يمكن الرصد الجماعي.'); return; }
  if (comp.type === 'attendance') { alert('لا يوجد لهذا المكوّن درجة عظمى (مكوّن حضور/غياب)، فلا يمكن رصد "الدرجة النهائية" له تلقائياً.'); return; }

  let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
  students = filterStudentsForTeacherLanguage(students, subjectName, cls);
  students = students.filter(s => canAccessStudentGrade(subjectName, s));
  if (!students.length) { alert('لا يوجد طلاب مطابقين في هذا الفصل.'); return; }

  const isPF = comp.type === 'passfail';
  const confirmMsg = isPF ?
    `سيتم رصد "اجتاز" لكل طلاب فصل "${classSectionLabel(cls)}" (${students.length} طالب) في مكوّن "${comp.name}" لهذا الشهر.\n\nلن يتم لمس أي طالب مُحدَّد مسبقاً (اجتاز أو لم يجتز) في هذا المكوّن. متابعة؟` :
    `سيتم رصد الدرجة النهائية (${comp.maxScore}) في مكوّن "${comp.name}" فقط لكل طلاب فصل "${classSectionLabel(cls)}" (${students.length} طالب) لهذا الشهر.\n\nلن يتم لمس أي درجة مُدخَلة بالفعل في هذا المكوّن. متابعة؟`;
  if (!(await showConfirm(confirmMsg))) return;

  let filled = 0,
    skippedExisting = 0;
  students.forEach(s => {
    const existing = db.grades.find(g => g.studentId === s.id && g.subjectName === subjectName && g.term === term && g.month === month && g.componentIndex === ci);
    if (existing) { skippedExisting++;
      return; }
    db.grades.push({ studentId: s.id, subjectName, term, month, componentIndex: ci, score: comp.maxScore });
    filled++;
  });
  saveDB(db);
  loadGradesUI();
  const status = document.getElementById('gradesStatus');
  status.textContent = isPF ?
    `✅ تم رصد "اجتاز" في "${comp.name}" لـ${filled} طالب، وتُرك ${skippedExisting} كانوا مُحدَّدين مسبقاً كما هم` :
    `✅ تم رصد الدرجة النهائية في "${comp.name}" لـ${filled} طالب، وتُرك ${skippedExisting} كانوا مُدخَلين مسبقاً كما هم`;
  status.style.color = 'var(--rasd-brand)';

 } catch (e) {
   console.error('bulkFillComponent failed:', e);
   alert('⚠️ حدث خطأ أثناء تعبئة درجات المكوّن الجماعية — راجع الدرجات فوراً.\n' + (e && e.message ? e.message : e));
 }
}



async function bulkClearComponent(ci) {
 try {
  const db = loadDB();
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  const month = parseInt(document.getElementById('gradeMonthSelect').value, 10);
  if (!subjectName || !cls) return;
  const subject = db.subjects.find(s => s.name === subjectName);
  const comp = subject && subject.components[ci];
  if (!comp) return;
  if (!canAccessGrade(subjectName, cls)) { alert('🚫 غير مصرح لك بالوصول لهذه المادة أو الفصل.'); return; }
  if (isGradeEntryLocked(db, cls, subjectName, term, month)) { alert('🔒 إدخال الدرجات مقفول حالياً، لا يمكن المسح.'); return; }

  let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
  students = filterStudentsForTeacherLanguage(students, subjectName, cls);
  const studentIds = new Set(students.filter(s => canAccessStudentGrade(subjectName, s)).map(s => s.id));

  const toDeleteCount = (db.grades || []).filter(g => g.subjectName === subjectName && g.term === term && g.month === month && g.componentIndex === ci && studentIds.has(g.studentId)).length;
  if (!toDeleteCount) { alert(`لا توجد درجات مسجلة في مكوّن "${comp.name}" لمسحها.`); return; }
  if (!(await showConfirm(`⚠️ سيتم حذف ${toDeleteCount} درجة نهائياً من مكوّن "${comp.name}" فقط لفصل "${classSectionLabel(cls)}" لهذا الشهر. لا يمكن التراجع عن هذا. متابعة؟`))) return;

  db.grades = (db.grades || []).filter(g => !(g.subjectName === subjectName && g.term === term && g.month === month && g.componentIndex === ci && studentIds.has(g.studentId)));
  saveDB(db);
  loadGradesUI();
  const status = document.getElementById('gradesStatus');
  status.textContent = `🧹 تم حذف ${toDeleteCount} درجة من مكوّن "${comp.name}"`;
  status.style.color = 'var(--rasd-text-muted)';

 } catch (e) {
   console.error('bulkClearComponent failed:', e);
   alert('⚠️ حدث خطأ أثناء مسح درجات المكوّن الجماعية — راجع الدرجات فوراً.\n' + (e && e.message ? e.message : e));
 }
}




async function warnIfAllComponentsAbsent(subject, pendingCells) {
  if (!subject || !pendingCells || !pendingCells.length) return true;
  const comps = (subject.components || []).map((c, ci) => ({ c, ci })).filter(x => x.c && x.c.type !== 'attendance' && x.c.type !== 'passfail');
  if (comps.length < 2) return true;
  const byStudent = new Map();
  pendingCells.forEach(cell => {
    if (!byStudent.has(cell.studentId)) byStudent.set(cell.studentId, []);
    byStudent.get(cell.studentId).push(cell);
  });
  const flagged = [];
  byStudent.forEach((cells, sid) => {
    const name = (cells[0] && cells[0].studentName) || sid;
    // كل المكوّنات الرقمية الظاهرة في الحفظ = غ
    const scoreComps = comps.filter(({ ci }) => cells.some(c => Number(c.componentIndex) === ci));
    if (scoreComps.length < comps.length) return; // لم تُملأ كل المكوّنات في هذه الدفعة
    const allG = scoreComps.every(({ ci }) => {
      const cell = cells.find(c => Number(c.componentIndex) === ci);
      return cell && (typeof isAbsentMark === 'function' ? isAbsentMark(cell.newScore) : cell.newScore === 'غ');
    });
    if (allG) flagged.push(name);
  });
  if (!flagged.length) return true;
  const shown = flagged.slice(0, 12).join('\n• ');
  const more = flagged.length > 12 ? '\n... و' + (flagged.length - 12) + ' آخرين' : '';
  const msg = '⚠️ رُصد «غ» في كل مكوّنات المادة للطلاب التاليين:\n• ' + shown + more
    + '\n\nالغياب الكامل لكل المكوّنات يعني غياباً عن أعمال المادة. هل أنت متأكد من الحفظ؟';
  return await showConfirm(msg);
}



async function saveStudentRow(studentId) {
  // week from UI (weekly recording)

 try {
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = (document.getElementById('gradeClassSelect') || {}).value || '';
  const term = document.getElementById('gradeTermSelect').value;
  const month = parseInt(document.getElementById('gradeMonthSelect').value, 10);
  try {
    const uiState = (typeof GSP !== 'undefined' && GSP.application && GSP.application.gradesUIState) || null;
    if (uiState && typeof uiState.syncFromDom === 'function') {
      uiState.syncFromDom({ subjectName, classKey: cls, term, month });
    }
  } catch (e) {}
  const saveSvc = (typeof GSP !== 'undefined' && GSP.application && GSP.application.gradesSave) || null;
  const db0 = loadDB();
  const student = (db0.students || []).find(s => String(s.id) === String(studentId));
  if (!student || (typeof canAccessStudentGrade === 'function' && !canAccessStudentGrade(subjectName, student))) {
    const statusEl = document.getElementById('gradesStatus');
    if (statusEl) { statusEl.textContent = '🚫 غير مصرح لك بتعديل درجات هذا الطالب'; statusEl.style.color = 'var(--rasd-danger)'; }
    return;
  }
  const lockClass = (typeof classSectionKey === 'function')
    ? classSectionKey(student.class, student.section)
    : (student.class || cls);

  if (saveSvc && typeof saveSvc.validateContext === 'function') {
    const weekSel = document.getElementById('gradeWeekSelect');
    const week = weekSel ? (parseInt(weekSel.value, 10) || 1) : 1;
    const ctx = saveSvc.validateContext({
      subjectName,
      cls: cls || lockClass,
      lockClass: lockClass,
      term,
      month,
      week
    });
    if (!ctx.ok) {
      const statusEl = document.getElementById('gradesStatus');
      if (statusEl) { statusEl.textContent = ctx.reason || 'تعذر الحفظ'; statusEl.style.color = 'var(--rasd-danger)'; }
      return;
    }
    const subject = ctx.subject;
    const rawCells = [];
    document.querySelectorAll('.grade-input[data-student="' + studentId + '"]').forEach(inp => {
      if (!inp || inp.disabled) return;
      const ci = parseInt(inp.dataset.comp, 10);
      const max = parseFloat(inp.dataset.max);
      const comp = subject.components && subject.components[ci];
      rawCells.push({
        studentId,
        studentName: student.name,
        componentIndex: ci,
        componentName: comp ? comp.name : '',
        rawValue: inp.value,
        maxScore: max
      });
    });
    const built = saveSvc.buildPendingFromRaw(rawCells);
    if (!(await warnIfAllComponentsAbsent(subject, built.pendingCells))) return;
    const proceed = await detectAndResolveGradeConflicts(ctx.db, subjectName, term, month, built.pendingCells);
    if (!proceed) return;
    const result = saveSvc.commitPendingCells(ctx, built.pendingCells);
    const status = document.getElementById('gradesStatus');
    if (status) {
      status.textContent = built.skipped
        ? ('✅ تم حفظ ' + result.saved + ' درجة، وتم تجاهل ' + built.skipped + ' قيمة غير صحيحة (تحقق من الحد الأقصى أو القيم السالبة)')
        : ('✅ تم حفظ ' + result.saved + ' درجة');
      status.style.color = built.skipped ? '#b45309' : 'var(--rasd-brand)';
    }
    if (built.skipped) alert('⚠️ لم يتم حفظ ' + built.skipped + ' درجة لأنها تتجاوز الحد الأقصى المسموح به أو سالبة:\n' + built.skippedDetails.join('\n'));
    return;
  }

  // Legacy fallback
  const db = db0;
  const subject = db.subjects.find(s => s.name === subjectName);
  if (!subject) return;
  if (isGradeEntryLocked(db, student.class, subjectName, term, month)) {
    document.getElementById('gradesStatus').textContent = '🔒 إدخال الدرجات مقفول حالياً، لا يمكن الحفظ';
    document.getElementById('gradesStatus').style.color = 'var(--rasd-danger)';
    return;
  }

  let skipped = 0;
  const skippedDetails = [];
  const pendingCells = [];
  const inputs = document.querySelectorAll('.grade-input[data-student="' + studentId + '"]');
  inputs.forEach(inp => {
    const ci = parseInt(inp.dataset.comp);
    const max = parseFloat(inp.dataset.max);
    if (inp.value === '') return;
    const parsed = parseStrictGradeInput(inp.value, max);
    if (!parsed.ok) { skipped++; skippedDetails.push((subject.components[ci] ? subject.components[ci].name : '') + ': «' + inp.value + '» — ' + parsed.reason); return; }
    const score = parsed.score; if (score === null) return;
    pendingCells.push({ studentId, studentName: student.name, componentIndex: ci,
      componentName: subject.components[ci] ? subject.components[ci].name : '', newScore: score });
  });

  if (!(await warnIfAllComponentsAbsent(subject, pendingCells))) return;
  const proceed = await detectAndResolveGradeConflicts(db, subjectName, term, month, pendingCells);
  if (!proceed) return;

  let saved = 0;
  const nowIso = new Date().toISOString();
  const actorName = (typeof currentUserLabel === 'function') ? currentUserLabel() : '';
  const weekSel2 = document.getElementById('gradeWeekSelect');
  const uiWeek = weekSel2 ? (parseInt(weekSel2.value, 10) || 1) : 1;
  const wp = (typeof GSP !== 'undefined' && GSP.weeklyPeriod) ? GSP.weeklyPeriod : null;
  pendingCells.forEach(cell => {
    const comp = subject.components && subject.components[cell.componentIndex];
    const week = wp && typeof wp.resolveGradeWeek === 'function'
      ? wp.resolveGradeWeek(comp, cell.componentName, uiWeek)
      : uiWeek;
    let existing = db.grades.find(g => g.studentId === cell.studentId && g.subjectName === subjectName && g.term ===
      term && g.month === month && g.componentIndex === cell.componentIndex &&
      (Number(g.week != null ? g.week : 1) === Number(week) || (week === 0 && (g.week == null || Number(g.week) === 0))));
    if (existing) {
      const prev = existing.score;
      existing.score = cell.newScore;
      existing.week = week;
      existing.updatedAt = nowIso;
      existing.updatedBy = actorName;
      if (String(prev) !== String(cell.newScore)) existing.editCount = (Number(existing.editCount) || 0) + 1;
    } else {
      db.grades.push({
        studentId: cell.studentId, subjectName, term, month, week,
        componentIndex: cell.componentIndex, score: cell.newScore,
        createdAt: nowIso, updatedAt: nowIso, updatedBy: actorName, editCount: 0
      });
    }
    saved++;
  });
  recordAudit('رصد درجات', 'تم حفظ ' + saved + ' درجة في مادة ' + subjectName + ' للفصل ' + term + ' والشهر ' + month);
  saveDB(db);
  const status = document.getElementById('gradesStatus');
  status.textContent = skipped ?
    ('✅ تم حفظ ' + saved + ' درجة، وتم تجاهل ' + skipped + ' قيمة غير صحيحة (تحقق من الحد الأقصى أو القيم السالبة)') :
    ('✅ تم حفظ ' + saved + ' درجة');
  status.style.color = skipped ? '#b45309' : 'var(--rasd-brand)';
  if (skipped) alert('⚠️ لم يتم حفظ ' + skipped + ' درجة لأنها تتجاوز الحد الأقصى المسموح به أو سالبة:\n' + skippedDetails.join('\n'));

 } catch (e) {
   console.error('saveStudentRow failed:', e);
   alert('⚠️ حدث خطأ أثناء حفظ درجات هذا الطالب.\n' + (e && e.message ? e.message : e));
 }
}



async function saveAllGrades() {
 try {
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  const month = parseInt(document.getElementById('gradeMonthSelect').value, 10);
  try {
    const uiState = (typeof GSP !== 'undefined' && GSP.application && GSP.application.gradesUIState) || null;
    if (uiState && typeof uiState.syncFromDom === 'function') {
      uiState.syncFromDom({ subjectName, classKey: cls, term, month });
    }
  } catch (e) {}
  const saveSvc = (typeof GSP !== 'undefined' && GSP.application && GSP.application.gradesSave) || null;
  if (saveSvc && typeof saveSvc.validateContext === 'function') {
    const ctx = saveSvc.validateContext({ subjectName, cls, term, month });
    if (!ctx.ok) {
      const statusEl = document.getElementById('gradesStatus');
      if (statusEl) { statusEl.textContent = ctx.reason || 'تعذر الحفظ'; statusEl.style.color = 'var(--rasd-danger)'; }
      return;
    }
    const db = ctx.db;
    const subject = ctx.subject;
    const rawCells = [];
    document.querySelectorAll('#gradesTableBody .grade-input, .grade-input').forEach(inp => {
      if (!inp || inp.disabled) return;
      const studentId = inp.dataset.student;
      if (!studentId) return;
      const stu = (db.students || []).find(s => String(s.id) === String(studentId));
      if (stu && typeof canAccessStudentGrade === 'function' && !canAccessStudentGrade(subjectName, stu)) return;
      const ci = parseInt(inp.dataset.comp, 10);
      const max = parseFloat(inp.dataset.max);
      const comp = subject.components && subject.components[ci];
      rawCells.push({
        studentId,
        studentName: stu ? stu.name : studentId,
        componentIndex: ci,
        componentName: comp ? comp.name : '',
        rawValue: inp.value,
        maxScore: max
      });
    });
    const built = saveSvc.buildPendingFromRaw(rawCells);
    if (!(await warnIfAllComponentsAbsent(subject, built.pendingCells))) return;
    const proceed = await detectAndResolveGradeConflicts(db, subjectName, term, month, built.pendingCells);
    if (!proceed) return;
    const result = saveSvc.commitPendingCells(ctx, built.pendingCells);
    const status = document.getElementById('gradesStatus');
    if (status) {
      status.textContent = built.skipped
        ? ('✅ تم حفظ ' + result.saved + ' درجة، وتم تجاهل ' + built.skipped + ' قيمة غير صحيحة')
        : ('✅ تم حفظ ' + result.saved + ' درجة (الفصل ' + (term === 'first' ? 'الأول' : 'الثاني') + ')');
      status.style.color = built.skipped ? '#b45309' : 'var(--rasd-brand)';
    }
    if (built.skipped) {
      const maxToShow = 15;
      const shown = built.skippedDetails.slice(0, maxToShow).join('\n');
      const more = built.skippedDetails.length > maxToShow ? ('\n... و' + (built.skippedDetails.length - maxToShow) + ' حالة أخرى') : '';
      alert('⚠️ لم يتم حفظ ' + built.skipped + ' درجة لأنها تتجاوز الحد الأقصى المسموح به أو سالبة:\n' + shown + more);
    }
    return;
  }
  const db = loadDB();
  const subject = db.subjects.find(s => s.name === subjectName);
  if (!subject) return;
  if (!canAccessGrade(subjectName, cls)) {
    document.getElementById('gradesStatus').textContent = '🚫 غير مصرح لك بتعديل درجات هذا الفصل';
    document.getElementById('gradesStatus').style.color = 'var(--rasd-danger)';
    return;
  }
  if (isGradeEntryLocked(db, cls, subjectName, term, month)) {
    document.getElementById('gradesStatus').textContent = '🔒 إدخال الدرجات مقفول حالياً، لا يمكن الحفظ';
    document.getElementById('gradesStatus').style.color = 'var(--rasd-danger)';
    return;
  }

  // تأكيد واضح إن وُجدت درجات حمراء (تتجاوز الحد) قبل الحفظ
  document.querySelectorAll('#gradesTableBody .grade-input').forEach(inp => validateGradeInput(inp));
  updateInvalidGradesBanner();
  const invalidCount = document.querySelectorAll('#gradesTableBody .grade-input.invalid').length;
  if (invalidCount > 0) {
    const go = await showConfirm(
      '🚫 يوجد ' + invalidCount + ' درجة تتجاوز الحد الأقصى أو غير صالحة (مظللة بالأحمر الغامق).\n\n' +
      'الدرجات الخاطئة لن تُحفظ. هل تريد المتابعة بحفظ الدرجات الصحيحة فقط؟'
    );
    if (!go) {
      document.getElementById('gradesStatus').textContent = '⏸️ تم إلغاء الحفظ — صحّح الدرجات الحمراء أولاً';
      document.getElementById('gradesStatus').style.color = 'var(--rasd-danger)';
      return;
    }
  }

  const inputs = document.querySelectorAll('.grade-input');
  let skipped = 0;
  const skippedDetails = [];
  const pendingCells = [];
  inputs.forEach(inp => {
    if (inp.value === '') return;
    const studentId = inp.dataset.student;
    const compIndex = parseInt(inp.dataset.comp);
    const max = parseFloat(inp.dataset.max);
    const stu = db.students.find(s => s.id === studentId);
    if (!canAccessStudentGrade(subjectName, stu)) { skipped++;
      skippedDetails.push(`${stu ? stu.name : studentId}: 🚫 غير مصرح لك بتعديل درجات هذا الطالب (لغة ثانية مختلفة)`);
      return; }
    const parsed = parseStrictGradeInput(inp.value, max);
    if (!parsed.ok) { skipped++; const comp = subject.components[compIndex];
      skippedDetails.push(`${stu ? stu.name : studentId} — ${comp ? comp.name : ''}: «${inp.value}» — ${parsed.reason}`); return; }
    const score = parsed.score; if (score === null) return;
    pendingCells.push({ studentId, studentName: stu ? stu.name : studentId, componentIndex: compIndex,
      componentName: subject.components[compIndex] ? subject.components[compIndex].name : '', newScore: score });
  });

  if (!(await warnIfAllComponentsAbsent(subject, pendingCells))) return;
  const proceed = await detectAndResolveGradeConflicts(db, subjectName, term, month, pendingCells);
  if (!proceed) return;

  let saved = 0;
  const nowIso2 = new Date().toISOString();
  const actorName2 = (typeof currentUserLabel === 'function') ? currentUserLabel() : '';
  pendingCells.forEach(cell => {
    let existing = db.grades.find(g => g.studentId === cell.studentId && g.subjectName === subjectName && g.term ===
      term && g.month === month && g.componentIndex === cell.componentIndex);
    if (existing) {
      const prev = existing.score;
      existing.score = cell.newScore;
      existing.updatedAt = nowIso2;
      existing.updatedBy = actorName2;
      if (String(prev) !== String(cell.newScore)) existing.editCount = (Number(existing.editCount) || 0) + 1;
    } else {
      db.grades.push({
        studentId: cell.studentId, subjectName, term, month,
        componentIndex: cell.componentIndex, score: cell.newScore,
        createdAt: nowIso2, updatedAt: nowIso2, updatedBy: actorName2, editCount: 0
      });
    }
    saved++;
  });
  recordAudit('رصد درجات', `تم حفظ ${saved} درجة في مادة ${subjectName} للفصل ${term} والشهر ${month}`);
  saveDB(db);
  const status = document.getElementById('gradesStatus');
  status.textContent = skipped ?
    `✅ تم حفظ ${saved} درجة، وتم تجاهل ${skipped} قيمة غير صحيحة` :
    `✅ تم حفظ ${saved} درجة (الفصل ${term === 'first' ? 'الأول' : 'الثاني'})`;
  status.style.color = skipped ? '#b45309' : 'var(--rasd-brand)';
  if (skipped) {
    const maxToShow = 15;
    const shown = skippedDetails.slice(0, maxToShow).join('\n');
    const more = skippedDetails.length > maxToShow ? `\n... و${skippedDetails.length - maxToShow} حالة أخرى` : '';
    alert(`⚠️ لم يتم حفظ ${skipped} درجة لأنها تتجاوز الحد الأقصى المسموح به أو سالبة:\n${shown}${more}`);
  }

 } catch (e) {
   console.error('saveAllGrades failed:', e);
   alert('⚠️ حدث خطأ أثناء حفظ جميع الدرجات — راجع البيانات فوراً فقد تكون العملية توقفت في نص الطريق.\n' + (e && e.message ? e.message : e));
 }
}




// window exports
GSP.getMonthlyDivideMode = getMonthlyDivideMode;


GSP.setMonthlyDivideMode = setMonthlyDivideMode;


GSP.showMissingGradesModal = showMissingGradesModal;
if (typeof hideMissingGradesModal === 'function') {
  GSP.hideMissingGradesModal = hideMissingGradesModal;
}
// تأكيد تسجيل مسارات الأزرار على GSP (يُستخدم من data-action إن وُجد)
GSP.gspMissingGradesProceed = function () {
  if (typeof _missingGradesModalSettle === 'function') _missingGradesModalSettle(true);
  else if (typeof hideMissingGradesModal === 'function') hideMissingGradesModal();
};
GSP.gspMissingGradesCancel = function () {
  if (typeof _missingGradesModalSettle === 'function') _missingGradesModalSettle(false);
  else if (typeof hideMissingGradesModal === 'function') hideMissingGradesModal();
};


GSP.confirmProceedDespiteMissingGrades = confirmProceedDespiteMissingGrades;


GSP.refreshGradeClassOptions = refreshGradeClassOptions;


GSP.onGradeSubjectSelectChange = onGradeSubjectSelectChange;


GSP.onGradeClassSelectChange = onGradeClassSelectChange;


GSP.updateSubjectDropdowns = updateSubjectDropdowns;


GSP.toggleGlobalLock = toggleGlobalLock;


GSP.toggleTermLock = toggleTermLock;


GSP.toggleMonthLockDirect = toggleMonthLockDirect;


GSP.renderLockCenter = renderLockCenter;


GSP.updateGlobalLockUI = updateGlobalLockUI;


GSP.toggleLock = toggleLock;


GSP.handleGradeInputKeydown = handleGradeInputKeydown;


GSP.loadGradesUI = loadGradesUI;

GSP.onGradeSearchInput = (function () {
  let debounced = null;
  return function onGradeSearchInput() {
    const perf = (typeof GSP !== 'undefined' && GSP.performance) || null;
    if (perf && typeof perf.debounce === 'function') {
      if (!debounced) debounced = perf.debounce(loadGradesUI, 80);
      debounced();
      return;
    }
    loadGradesUI();
  };
})();


GSP.toggleMissingGradesReport = toggleMissingGradesReport;


GSP.renderMissingGradesReport = renderMissingGradesReport;


GSP.toggleGradesTabPerformancePanel = toggleGradesTabPerformancePanel;


GSP.renderGradesTabPerformancePanel = renderGradesTabPerformancePanel;


GSP.validateGradeInput = validateGradeInput;


GSP.updateInvalidGradesBanner = updateInvalidGradesBanner;


GSP.bulkFillFullMarks = bulkFillFullMarks;


GSP.bulkFillMonthlyExamMarks = bulkFillMonthlyExamMarks;


GSP.bulkClearClassGrades = bulkClearClassGrades;


GSP.bulkFillComponent = bulkFillComponent;


GSP.bulkClearComponent = bulkClearComponent;


GSP.warnIfAllComponentsAbsent = warnIfAllComponentsAbsent;


GSP.saveStudentRow = saveStudentRow;


GSP.saveAllGrades = saveAllGrades;


// STEP 25: namespaced feature surface for internal helpers (not on GSP root)
(function (g) {
  const GSP = g.GSP || (g.GSP = {});
  GSP.features = GSP.features || {};
  const helpers = {
    computeFinalComponentScore: typeof computeFinalComponentScore === 'function' ? computeFinalComponentScore : null,
    buildCellsForCheck: typeof buildCellsForCheck === 'function' ? buildCellsForCheck : null,
    scanMissingGradeCells: typeof scanMissingGradeCells === 'function' ? scanMissingGradeCells : null,
    subjectTermTotal: typeof subjectTermTotal === 'function' ? subjectTermTotal : null,
    getGradeTier: typeof getGradeTier === 'function' ? getGradeTier : null,
    classScopeKey: typeof classScopeKey === 'function' ? classScopeKey : null,
    subjectAppliesToClass: typeof subjectAppliesToClass === 'function' ? subjectAppliesToClass : null,
    subjectAppliesToGradeSection: typeof subjectAppliesToGradeSection === 'function' ? subjectAppliesToGradeSection : null,
    lockKey: typeof lockKey === 'function' ? lockKey : null,
    monthLockKey: typeof monthLockKey === 'function' ? monthLockKey : null,
    isTermLocked: typeof isTermLocked === 'function' ? isTermLocked : null,
    isGradeEntryLocked: typeof isGradeEntryLocked === 'function' ? isGradeEntryLocked : null
  };
  GSP.features.grades = Object.freeze(Object.assign({}, GSP.features.grades || {}, { helpers: Object.freeze(helpers) }));
})(window);
