/* import-export.part03.js — generated from import-export.js; execution order is significant. */


async function processMainFile() {
  const status = document.getElementById('uploadStatus');
  const messages = document.getElementById('uploadMessages');
  const bar = document.getElementById('progressBar');
  messages.innerHTML = '';

  const importSection = document.getElementById('importSection').value;
  const importStage = document.getElementById('importStage').value;
  const importGrade = document.getElementById('importGrade').value;
  if (!importSection || !importStage || !importGrade) {
    status.textContent = '⚠️ يرجى اختيار القسم والمرحلة والصف أولاً قبل معالجة الملف';
    status.style.color = '#b91c1c';
    return;
  }

  // حاجز تنفيذ لمدير المرحلة (حتى لو عُدّلت القوائم من أدوات المطوّر)
  if (currentAccountType === 'stageadmin' && currentStageAdmin) {
    const allowedSections = getStageAdminAllowedImportSections();
    if (!allowedSections.includes(importSection)) {
      status.textContent = '⚠️ غير مصرح لك برفع ملفات لهذا القسم. النطاق مقصور على مرحلتك.';
      status.style.color = '#b91c1c';
      return;
    }
    const stageRec = typeof getStageRecord === 'function' ? getStageRecord(currentStageId) : null;
    if (stageRec && stageRec.section && importSection !== stageRec.section) {
      status.textContent = '⚠️ القسم المختار لا يطابق قسم المرحلة الحالية.';
      status.style.color = '#b91c1c';
      return;
    }
    const inferred = stageRec ? inferEducationalStageTypeFromName(stageRec.name) : null;
    if (inferred && importStage !== inferred) {
      status.textContent = '⚠️ لا يمكنك رفع ملفات لنوع مرحلة غير مرحلتك («' + (stageRec.name || '') + '»).';
      status.style.color = '#b91c1c';
      return;
    }
    const assigned = currentStageAdmin.stageIds || [];
    if (currentStageId && assigned.length && !assigned.includes(currentStageId)) {
      status.textContent = '⚠️ غير مصرح لك بالرفع في هذه المرحلة التنظيمية.';
      status.style.color = '#b91c1c';
      return;
    }
  }

  if (!uploadedWorkbook) { status.textContent = '⚠️ يرجى اختيار ملف أولاً'; return; }

  const sheetName = document.getElementById('sheetSelect').value || uploadedWorkbook.SheetNames[0];
  const term = document.getElementById('importTermSelect').value;
  const month = parseInt(document.getElementById('importMonthSelect').value, 10);

  bar.style.width = '30%';
  status.textContent = '🔄 جاري تحليل البيانات...';

  try {
    const transaction = (typeof GSP !== 'undefined' && GSP.application && GSP.application.services && GSP.application.services.transaction) || null;
    const clone = transaction && typeof transaction.clone === 'function' ? transaction.clone : (value => JSON.parse(JSON.stringify(value)));
    // STEP 37: import works on an isolated draft. Nothing reaches the live stage
    // until every transformation has completed successfully.
    const transactionSnapshot = clone(loadDB());
    const db = clone(transactionSnapshot);
    const result = parseWorkbookSheet(uploadedWorkbook, sheetName, term, importGrade, importSection, db.subjects);
    result.grades.forEach(g => { g.month = month; });

    // STEP 44: structured pre-commit validation of the parse result
    const importValidation = (typeof GSP !== 'undefined' && GSP.importValidation) || null;
    if (importValidation && typeof importValidation.validateParsedResult === 'function') {
      const parsedReport = importValidation.validateParsedResult(result, {
        term, month, grade: importGrade, section: importSection, stageId: currentStageId
      });
      if (!parsedReport.ok) {
        bar.style.width = '0%';
        status.textContent = '❌ فشل التحقق من صحة بيانات الملف — لم يتم تطبيق أي تغيير.';
        status.style.color = '#b91c1c';
        if (typeof importValidation.formatReportHtml === 'function') {
          messages.innerHTML = importValidation.formatReportHtml(parsedReport);
        } else {
          messages.innerHTML = '<div class="error-box">❌ ' +
            parsedReport.errors.map(e => e.message).join('؛ ') + '</div>';
        }
        return;
      }
      if (parsedReport.warningCount > 0 && typeof importValidation.formatReportHtml === 'function') {
        messages.innerHTML += importValidation.formatReportHtml({
          errors: [], warnings: parsedReport.warnings, infos: [], summary: null
        });
      }
    }

    bar.style.width = '70%';

    // دمج البيانات على مستوى كل (صف + قسم) على حدة: رفع ملف صف معيّن لقسم معيّن (مثلاً الصف الثاني
    // الإعدادي - القسم العربي) يستبدل فقط بيانات هذا الصف ولهذا القسم بالذات، ولا يمس إطلاقاً بيانات
    // نفس الصف في القسم الآخر، ولا بيانات باقي الصفوف المخزَّنة بالفعل في نفس المرحلة. هذا ضروري لأن
    // المرحلة الواحدة قد تضم عدة صفوف وقسمين معاً (عربي/لغات) في نفس الوقت.
    const oldStudentsThisGrade = (db.students || []).filter(s => s.grade === importGrade && s.section === importSection);
    const staleCandidateClasses = new Set(oldStudentsThisGrade.map(s => s.class));

    // مقارنة الكشف القديم بالكشف الجديد المستخرج من الملف: تمييز الطلاب المستمرين (بلا تغيير أو
    // بتعديل بعض الحقول)، الطلاب الجدد، والطلاب غير الموجودين في الملف الجديد (سيُحذفون مع درجاتهم).
    const rosterDiff = buildStudentRosterDiff(oldStudentsThisGrade, result.students);
    if (oldStudentsThisGrade.length > 0 && studentRosterDiffHasChanges(rosterDiff)) {
      const proceed = await showConfirm(buildStudentRosterDiffConfirmMessage(rosterDiff));
      if (!proceed) {
        bar.style.width = '0%';
        status.textContent = '⏸️ تم إلغاء التحديث، لم يتم تغيير أي بيانات.';
        status.style.color = '#64748b';
        return;
      }
    }

    // نقل الدرجات المرصودة سابقاً من المعرّف القديم إلى المعرّف الجديد لكل طالب تم التعرّف عليه عبر
    // المطابقة الاحتياطية (نفس الفصل ورقم الجلوس) رغم تغيّر رقمه القومي أو اسمه، حتى لا تُفقد درجاته.
    rosterDiff.idRemaps.forEach(({ oldId, newId }) => {
      (db.grades || []).forEach(g => { if (g.studentId === oldId) g.studentId = newId; });
    });
    // حذف كل درجات الطلاب غير الموجودين في الملف الجديد (في كل الفصول الدراسية والشهور، وليس فقط
    // الشهر الحالي)، لأنهم لم يعودوا ضمن كشف هذا الصف/القسم إطلاقاً.
    if (rosterDiff.removed.length) {
      const removedIds = new Set(rosterDiff.removed.map(s => s.id));
      db.grades = (db.grades || []).filter(g => !removedIds.has(g.studentId));
    }

    db.students = (db.students || []).filter(s => !(s.grade === importGrade && s.section === importSection)).concat(result.students);

    // المواد مشتركة عادة بين صفوف نفس المرحلة. المادة الجديدة كلياً تُضاف كتعريف رسمي أول مرة،
    // أما المادة الموجودة بالفعل فتحتفظ بترتيب وخصائص مكوناتها المحفوظة كما هي (لا تُستبدل)،
    // ويُضاف لها فقط أي مكوّن جديد فعلاً اكتُشف في هذا الملف (بنفس الترتيب المستخدم عند استخراج
    // الدرجات أعلاه حتى تبقى فهارس المكونات متوافقة).
    // يُسجَّل نطاق كل مادة (الصف والقسم الذي تنتمي إليه) في حقل appliesTo حتى تظهر المادة فقط
    // عند اختيار فصل من هذا الصف وهذا القسم في تبويبَي إدخال الدرجات وتخصيص المعلمين.
    db.subjects = db.subjects || [];
    const subjectsByName = new Map(db.subjects.map(s => [s.name, s]));
    const scopeKey = importGrade + '|' + importSection;
    result.subjects.forEach(s => {
      const existing = subjectsByName.get(s.name);
      if (!existing) {
        if (!s.appliesTo) s.appliesTo = [];
        if (!s.appliesTo.includes(scopeKey)) s.appliesTo.push(scopeKey);
        db.subjects.push(s);
        subjectsByName.set(s.name, s);
        return;
      }
      if (!existing.appliesTo) existing.appliesTo = [];
      if (!existing.appliesTo.includes(scopeKey)) existing.appliesTo.push(scopeKey);
      const existingCompNames = new Set(existing.components.map(c => c.name));
      s.components.forEach(c => { if (c.isNewComponent && !existingCompNames.has(c.name)) {
        const { isNewComponent, ...compToSave } = c;
        existing.components.push(compToSave); } });
    });

    // تحديث خريطة (فصل ← صف)، بمفتاح مركّب من اسم الفصل + القسم، لفصول هذا الصف ولهذا القسم فقط،
    // مع الإبقاء التام على فصول الصفوف والقسم الآخر كما هي (حتى لو تشابهت أسماء الفصول بينهما).
    db.classGrade = db.classGrade || {};
    const stillUsedClassKeys = new Set(db.students.map(s => classSectionKey(s.class, s.section)));
    staleCandidateClasses.forEach(c => { const k = classSectionKey(c, importSection); if (!stillUsedClassKeys.has(k)) delete db.classGrade[k]; });
    result.classes.forEach(c => { db.classGrade[classSectionKey(c, importSection)] = importGrade; });
    db.classes = [...new Set(Object.keys(db.classGrade))].sort();

    // دمج الدرجات المستخرجة من الملف عبر "تحديث/إضافة" (upsert) بدل المسح الكامل ثم الإضافة:
    // أي درجة موجودة في الملف الجديد لنفس الطالب/المادة/المكوّن/الفصل الدراسي/الشهر يتم تحديثها،
    // وأي درجة كانت مرصودة سابقاً (يدوياً أو من رفعة سابقة) ولم يوردها الملف الجديد (خانة فارغة)
    // تبقى كما هي دون مساس، حتى لا تُفقد أي درجة مرصودة فعلاً لأي طالب مستمر بسبب إعادة رفع الملف.
    db.grades = db.grades || [];
    result.grades.forEach(ng => {
      const existing = db.grades.find(g => g.studentId === ng.studentId && g.subjectName === ng.subjectName &&
        g.term === ng.term && g.month === ng.month && g.componentIndex === ng.componentIndex);
      if (existing) existing.score = ng.score;
      else db.grades.push(ng);
    });

    db.metaByGrade = db.metaByGrade || {};
    const gradeMetaKey = importGrade + '§' + importSection;
    db.metaByGrade[gradeMetaKey] = {
      fileName: uploadedFileName,
      sheetName: sheetName,
      headerIdx: result.headerIdx,
      maxRowIdx: result.maxRowIdx,
      colMap: result.colMap,
      term: term,
      month: month,
      grade: importGrade,
      section: importSection
    };
    // نسخة الملف الأصلي: تُرفَع كملف ثنائي حقيقي إلى Supabase Storage (تخزين سحابي منفصل عن قاعدة
    // البيانات)، ولا يُحفَظ في db.metaByGrade سوى مسار نصي صغير يشير إليها - فلا تُثقل localStorage
    // ولا عمود jsonb الرئيسي إطلاقاً. فشل هذا الرفع (مثلاً: لا يوجد اتصال، أو الـ bucket غير مُعَدّ
    // بعد) لا يوقف استيراد بيانات الطلاب والدرجات نفسها، فقط يعطّل ميزة "تنزيل الملف الأصلي" لاحقاً.
    const workbookStorageKeyVal = workbookStorageKey(currentStageId, gradeMetaKey);
    const uploadResult = await uploadWorkbookToCloud(workbookStorageKeyVal, uploadedWorkbook.__base64);
    if (uploadResult.ok) {
      db.metaByGrade[gradeMetaKey].workbookStoragePath = workbookStorageKeyVal;
      db.metaByGrade[gradeMetaKey].workbookStoredAt = new Date().toISOString();
    } else {
      messages.innerHTML +=
        `<div class="warning-box">⚠️ تم استيراد بيانات الطلاب والدرجات بنجاح، لكن تعذّر حفظ نسخة احتياطية من ملف Excel الأصلي في التخزين السحابي (${uploadResult.reason || 'خطأ غير معروف'}). لن تتأثر بيانات الطلاب/الدرجات بهذا إطلاقاً، لكن ميزة "تنزيل نسخة الملف الأصلي المحدَّثة" لن تعمل لهذا الصف حتى تُعاد معالجة الملف بنجاح مع اتصال سليم.</div>`;
    }
    db.meta = db.metaByGrade[gradeMetaKey]; // آخر ملف تم رفعه، يُستخدم كاسم افتراضي عند التصدير

    // تحديث بيانات المدرسة (القسم/الفصل الدراسي) بناءً على الاختيار قبل الرفع. لا يتم تثبيت "الصف"
    // كقيمة وحيدة للمرحلة كلها بعد الآن لأن المرحلة قد تضم أكثر من صف معاً؛ يُحفظ فقط كآخر صف تم رفعه.
    db.schoolInfo = Object.assign({}, db.schoolInfo || {}, {
      term: term,
      grade: importGrade,
      stageType: importStage,
      classLanguage: importSection
    });

    // STEP 44: validate merge plan (scope isolation) before durable commit
    if (importValidation && typeof importValidation.validateMergePlan === 'function') {
      const mergeReport = importValidation.validateMergePlan(transactionSnapshot, db, {
        grade: importGrade, section: importSection
      });
      if (!mergeReport.ok) {
        try {
          if (typeof GSP !== 'undefined' && typeof GSP.replaceCurrentStageDataInMemory === 'function') {
            GSP.replaceCurrentStageDataInMemory(transactionSnapshot);
          }
        } catch (rollbackError) { console.error('STEP 44 merge validation rollback failed:', rollbackError); }
        bar.style.width = '0%';
        status.textContent = '❌ فشل التحقق من خطة الدمج — تم إلغاء الاستيراد بالكامل.';
        status.style.color = '#b91c1c';
        if (typeof importValidation.formatReportHtml === 'function') {
          messages.innerHTML = importValidation.formatReportHtml(mergeReport);
        } else {
          messages.innerHTML = '<div class="error-box">❌ ' +
            mergeReport.errors.map(e => e.message).join('؛ ') + '</div>';
        }
        return;
      }
    }

    const committed = await Promise.resolve(saveDB(db));
    if (committed === false) {
      // Durable commit failed: restore the in-memory stage snapshot so the
      // failed import cannot leak partially-applied state into the current UI.
      try {
        if (typeof GSP !== 'undefined' && typeof GSP.replaceCurrentStageDataInMemory === 'function') {
          GSP.replaceCurrentStageDataInMemory(transactionSnapshot);
        }
      } catch (rollbackError) { console.error('STEP 37 import rollback failed:', rollbackError); }
      if (uploadResult && uploadResult.ok && typeof deleteWorkbooksFromCloud === 'function') {
        try { await deleteWorkbooksFromCloud([workbookStorageKeyVal]); } catch (_) {}
      }
      bar.style.width = '0%';
      status.textContent = '❌ فشل الحفظ النهائي — تم إلغاء الاستيراد بالكامل ولم يتم اعتماد التغييرات.';
      status.style.color = '#b91c1c';
      return;
    }
    bar.style.width = '100%';

    const gradesPresentCount = new Set(Object.values(db.classGrade)).size;
    status.textContent =
      `✅ تم معالجة الملف بنجاح: ${result.students.length} طالب، ${result.subjects.length} مادة، ${result.classes.length} فصل (لصف "${importGrade}"). إجمالي الصفوف المخزَّنة الآن في هذه المرحلة: ${gradesPresentCount}.`;
    try {
      recordAudit('رفع Excel', 'صف: ' + importGrade + ' | قسم: ' + importSection + ' | طلاب: ' + result.students.length + ' | مواد: ' + result.subjects.length + ' | ملف: ' + (uploadedFileName || ''));
    } catch (eAudit) {}
    status.style.color = '#0b5e42';

    const rosterDiffReportHtml = buildStudentRosterDiffReportHtml(rosterDiff);
    if (rosterDiffReportHtml) messages.innerHTML += rosterDiffReportHtml;

    if (result.duplicateSeats.length) {
      messages.innerHTML +=
        `<div class="warning-box">⚠️ تم العثور على أرقام جلوس مكررة داخل نفس الفصل لطلاب بلا رقم قومي: ${result.duplicateSeats.map(escapeHtml).join('، ')}. يرجى مراجعة هذه الصفوف؛ ملاحظة: تكرار رقم الجلوس بين فصول مختلفة في نفس المرحلة أمر طبيعي ولا يمثل مشكلة، حيث يعتمد النظام على الرقم القومي كمعرّف أساسي في قاعدة البيانات عند توفره.</div>`;
    }

    // يقتصر هذا التنبيه على رئيس الكنترول فقط: هو الوحيد المخوَّل برؤية بيانات (أسماء طلاب
    // وأسماء مراحل) تخص مراحل أخرى غير المرحلة الحالية. مدير المرحلة لا يجب أن يطّلع على أي شيء
    // عن مرحلة غير مسندة إليه، حتى في صورة تنبيه تكرار.
    const crossStageDuplicates = currentAccountType === 'superadmin' ?
      findCrossStageDuplicateNationalIds(result.students, currentStageId) : [];
    if (crossStageDuplicates.length) {
      const maxToShow = 15;
      const lines = crossStageDuplicates.slice(0, maxToShow).map(d =>
        `${escapeHtml(d.name)} (${escapeHtml(d.nationalId)}) — مسجَّل أيضاً في مرحلة "${escapeHtml(d.stageName)}"${d.otherName && d.otherName !== d.name ? ` باسم "${escapeHtml(d.otherName)}"` : ''}`);
      const more = crossStageDuplicates.length > maxToShow ?
        `<br>... و${crossStageDuplicates.length - maxToShow} حالة أخرى` : '';
      messages.innerHTML +=
        `<div class="warning-box">⚠️ تنبيه: الرقم القومي لـ ${crossStageDuplicates.length} طالب من هذا الملف مسجَّل أيضاً في مرحلة دراسية أخرى، يرجى التأكد من عدم تكرار تسجيل نفس الطالب في أكثر من مرحلة:<br>${lines.join('<br>')}${more}</div>`;
    }

    if (result.catalogWarnings && result.catalogWarnings.length) {
      const lines = result.catalogWarnings.map(w =>
        `${escapeHtml(w.subjectName)}: ${w.newComponents.map(escapeHtml).join('، ')}`);
      messages.innerHTML +=
        `<div class="warning-box">⚠️ تم اكتشاف مكوّنات جديدة لم تكن موجودة من قبل في تعريف هذه المواد (تمت إضافتها تلقائياً في نهاية قائمة مكونات كل مادة)، يُرجى مراجعتها من تبويب "المواد" للتأكد من صحتها (الدرجة العظمى، وهل هي "الدرجة الشهرية"):<br>${lines.join('<br>')}</div>`;
    }

    if (result.invalidGrades && result.invalidGrades.length) {
      const maxToShow = 15;
      const lines = result.invalidGrades.slice(0, maxToShow).map(g =>
        `${escapeHtml(g.name)} (${escapeHtml(g.seat)}) — ${escapeHtml(g.subjectName)} / ${escapeHtml(g.componentName)}: ${g.score} (الحد الأقصى ${g.maxScore})`);
      const more = result.invalidGrades.length > maxToShow ?
        `<br>... و${result.invalidGrades.length - maxToShow} حالة أخرى` : '';
      messages.innerHTML +=
        `<div class="error-box">🚫 تم تجاهل ${result.invalidGrades.length} درجة تتجاوز الحد الأقصى المسموح به (أو سالبة) ولم يتم استيرادها. يرجى تصحيحها في ملف الإكسيل وإعادة رفعه:<br>${lines.join('<br>')}${more}</div>`;
    }

    document.getElementById('fileSummary').innerHTML = `
      <div class="grid-3" style="margin-top:12px;">
        <div class="card stat-card"><div class="stat-num">${result.students.length}</div><div class="stat-label">طلاب</div></div>
        <div class="card stat-card"><div class="stat-num">${result.subjects.length}</div><div class="stat-label">مواد</div></div>
        <div class="card stat-card"><div class="stat-num">${result.classes.length}</div><div class="stat-label">فصول</div></div>
      </div>
      <div style="margin-top:8px; font-size:13px; color:#64748b;">الفصول: ${result.classes.join('، ')}</div>
    `;

    loadStudentsUI();
    loadSubjectsUI();
    updateFilters();
    loadStatsUI();
    if (typeof GSP !== 'undefined' && typeof GSP.renderMonthlyExportButtons === 'function') {
      GSP.renderMonthlyExportButtons();
    }
    updateSchoolInfoDisplay();
    setTimeout(() => { bar.style.width = '0%'; }, 800);

  } catch (err) {
    bar.style.width = '0%';
    if (err instanceof MissingColumnsError) {
      messages.innerHTML =
        `<div class="error-box">❌ الملف يفتقد الأعمدة التالية المطلوبة: <strong>${err.missing.join('، ')}</strong>. تأكد من وجود هذه الأعمدة في صف الرؤوس واختيار الورقة الصحيحة.</div>`;
      status.textContent = '❌ لم تتم المعالجة - أعمدة مفقودة';
    } else if (isQuotaError(err)) {
      messages.innerHTML =
        `<div class="error-box">❌ مساحة التخزين المتاحة في متصفحك ممتلئة تماماً ولم يمكن تحرير مساحة كافية تلقائياً. جرّب حذف بعض البيانات غير الضرورية (تبويب "إدارة المراحل") أو استخدم متصفحاً/جهازاً بمساحة تخزين أكبر، ثم أعد المحاولة. بياناتك الحالية لم تتأثر ولم يتم فقد أي شيء.</div>`;
      status.textContent = '❌ لم تتم المعالجة - مساحة التخزين ممتلئة';
    } else {
      messages.innerHTML = `<div class="error-box">❌ خطأ أثناء المعالجة: ${escapeHtml(err.message)}</div>`;
      status.textContent = '❌ خطأ أثناء المعالجة';
    }
    status.style.color = '#b91c1c';
    console.error(err);
  }
}



// ============================================================
//  EXPORT WORKER — تنفيذ العمليات الثقيلة (قراءة/بناء/كتابة ملفات Excel عبر مكتبة SheetJS) في
//  Web Worker منفصل عن الخيط الرئيسي (UI thread). هذا هو سبب "تجمّد" الصفحة السابق: XLSX.read()
//  لملف Excel أصلي كامل، ثم XLSX.write() له، كانتا تُنفَّذان بشكل متزامن (synchronous) على نفس
//  الخيط الذي يرسم الواجهة، فتتجمّد الصفحة تماماً طوال مدة التنفيذ - ويتضاعف الأمر عند "تنزيل كل
//  الصفوف دفعة واحدة" لأنها تتكرر لكل صف × كل فصل دراسي. بنقل هذا العمل إلى Worker تبقى الواجهة
//  متجاوبة دائماً، ويمكن تصدير عدة ملفات بالتوازي دون أي تجميد، وأسرع أيضاً لأن المتصفح يستغل
//  نواة معالج إضافية بدل حجز الخيط الوحيد المسؤول عن الرسم والتفاعل.
// ============================================================
let _exportWorker = null;


let _exportWorkerReqId = 0;


const _exportWorkerPending = new Map();
