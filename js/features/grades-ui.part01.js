/* grades-ui.part01.js — generated from grades-ui.js; execution order is significant. */
/** features/grades-ui.js */
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
    'يفوق التوقعات': '#1d4ed8', 'يلبي التوقعات': '#15803d',
    'يلبي التوقعات أحياناً': '#eab308', 'أقل من المتوقع': '#b91c1c'
  } : {
    'ممتاز': '#1d4ed8', 'جيد جداً': '#15803d', 'جيد': '#0d9488', 'مقبول': '#eab308', 'ضعيف': '#b91c1c'
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
