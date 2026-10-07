/* grades-ui.part04.js — generated from grades-ui.js; execution order is significant. */


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
  if (!students.length) { area.innerHTML = '<div style="color:#94a3b8; font-size:13px;">لا يوجد طلاب في هذا الفصل.</div>'; return; }

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
      status.style.color = '#0b5e42';
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
  status.style.color = '#0b5e42';

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
    status.style.color = '#0b5e42';
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
      status.style.color = '#64748b';
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
  status.style.color = '#64748b';

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
  status.style.color = '#0b5e42';

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
  status.style.color = '#64748b';

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
    if (statusEl) { statusEl.textContent = '🚫 غير مصرح لك بتعديل درجات هذا الطالب'; statusEl.style.color = '#b91c1c'; }
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
      if (statusEl) { statusEl.textContent = ctx.reason || 'تعذر الحفظ'; statusEl.style.color = '#b91c1c'; }
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
      status.style.color = built.skipped ? '#b45309' : '#0b5e42';
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
    document.getElementById('gradesStatus').style.color = '#b91c1c';
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
  status.style.color = skipped ? '#b45309' : '#0b5e42';
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
      if (statusEl) { statusEl.textContent = ctx.reason || 'تعذر الحفظ'; statusEl.style.color = '#b91c1c'; }
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
      status.style.color = built.skipped ? '#b45309' : '#0b5e42';
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
    document.getElementById('gradesStatus').style.color = '#b91c1c';
    return;
  }
  if (isGradeEntryLocked(db, cls, subjectName, term, month)) {
    document.getElementById('gradesStatus').textContent = '🔒 إدخال الدرجات مقفول حالياً، لا يمكن الحفظ';
    document.getElementById('gradesStatus').style.color = '#b91c1c';
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
      document.getElementById('gradesStatus').style.color = '#b91c1c';
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
  status.style.color = skipped ? '#b45309' : '#0b5e42';
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
