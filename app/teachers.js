/**
 * js/app/teachers.js — الجزء 8/9 من app.js السابق (بعد التقسيم لتحسين قابلية الصيانة)
 * المحتوى: تبويب المعلمين + استيراد المعلمين من إكسيل + طباعة بطاقات الهوية
 * يعتمد على: نفس النطاق المشترك (window/global scope) الذي كان عليه app.js — يجب تحميله
 * بنفس ترتيب الأجزاء كما في index.html، لأن بعض الدوال هنا تُستدعى من دوال معرّفة في أجزاء لاحقة.
 */
'use strict';

    //  TEACHERS TAB
    // ============================================================
    async function addOrUpdateTeacher() {
     try {
      const db = loadDB();
      const name = document.getElementById('newTeacherName').value.trim();
      const msg = document.getElementById('teacherFormMsg');
      const editingId = document.getElementById('editingTeacherId').value;

      if (!name) { msg.textContent = '⚠️ يرجى إدخال اسم المعلم';
        msg.style.color = '#b91c1c'; return; }

      // إن كانت هناك مادة/فصول مختارة في الحقول أعلاه ولم يتم الضغط على "➕ إضافة هذا التخصيص" بعد،
      // نُضيفها تلقائياً كتخصيص أخير قبل الحفظ، تسهيلاً على من يضيف معلماً بتخصيص واحد فقط.
      const pending = getCurrentAssignmentFields();
      if (pending.subjectName || pending.classes.length) {
        if (!pending.subjectName) { msg.textContent = '⚠️ يرجى اختيار المادة';
          msg.style.color = '#b91c1c'; return; }
        if (pending.classes.length === 0) { msg.textContent = '⚠️ يرجى اختيار فصل واحد على الأقل';
          msg.style.color = '#b91c1c'; return; }
        if (pending.isSecondLang && !pending.languageType) {
          msg.textContent = '⚠️ يرجى تحديد نوع اللغة الأجنبية التي يدرّسها هذا المعلم (فرنسي/الماني...)';
          msg.style.color = '#b91c1c'; return;
        }
        const existing = teacherAssignmentsDraft.find(a => a.subjectName === pending.subjectName && (a.languageType ||
            '') === (pending.languageType || ''));
        if (existing) {
          pending.classes.forEach(c => { if (!existing.classes.includes(c)) existing.classes.push(c); });
        } else {
          teacherAssignmentsDraft.push({ subjectName: pending.subjectName, classes: pending.classes, languageType: pending
              .languageType });
        }
      }

      if (teacherAssignmentsDraft.length === 0) {
        msg.textContent = '⚠️ يرجى إضافة تخصيص واحد على الأقل (مادة + فصل) لهذا المعلم';
        msg.style.color = '#b91c1c'; return;
      }

      const assignments = teacherAssignmentsDraft.map(a => ({ subjectName: a.subjectName, classes: [...a.classes],
        languageType: a.languageType || '' }));

      db.teachers = db.teachers || [];

      if (editingId) {
        const t = db.teachers.find(x => x.id === editingId);
        if (!t) { msg.textContent = '⚠️ المعلم غير موجود (ربما تم حذفه من قبل).';
          msg.style.color = '#b91c1c'; cancelTeacherEdit(); loadTeachersUI(); return; }
        t.name = name;
        t.assignments = assignments;
        {
          const periodsRaw = document.getElementById('newTeacherPeriods');
          const periods = periodsRaw ? Math.max(0, parseInt(periodsRaw.value, 10) || 0) : (t.assignedPeriods || 0);
          t.assignedPeriods = periods;
          if (!db.teacherFeedback || typeof db.teacherFeedback !== 'object') db.teacherFeedback = { points: {}, log: [], basePoints: {} };
          if (!db.teacherFeedback.basePoints) db.teacherFeedback.basePoints = {};
          if (!db.teacherFeedback.points) db.teacherFeedback.points = {};
          if (!Array.isArray(db.teacherFeedback.log)) db.teacherFeedback.log = [];
          db.teacherFeedback.basePoints[t.id] = periods * 100;
        }
        if (t.section === undefined || t.section === null || t.section === '') {
          t.section = (db.schoolInfo && db.schoolInfo.classLanguage) || '';
        }
        saveDB(db);
        msg.textContent = `✅ تم تحديث بيانات المعلم "${name}" بنجاح.`;
        msg.style.color = '#0b5e42';
        // لا يُعاد إرسال كلمة السر السحابية عند تعديل الاسم فقط — الرقم لم يعد مخزّناً كنص صريح
        cancelTeacherEdit();
        loadTeachersUI();
        return;
      }

      const pin = generateRandomPin(DEFAULT_PIN_LENGTH);
      const pinHash = await sha256Hex(pin);
      const defaultSection = (db.schoolInfo && db.schoolInfo.classLanguage) || '';
      const newTeacherId = 't_' + Date.now();
      const periodsRaw = document.getElementById('newTeacherPeriods');
      const periods = periodsRaw ? Math.max(0, parseInt(periodsRaw.value, 10) || 0) : 0;
      // يُحفظ pinHash فقط — الرقم الصريح يبقى في الذاكرة للعرض/الطباعة مرة واحدة
      db.teachers.push({ id: newTeacherId, name, assignments, section: defaultSection, pinHash, assignedPeriods: periods });
      if (!db.teacherFeedback || typeof db.teacherFeedback !== 'object') db.teacherFeedback = { points: {}, log: [], basePoints: {} };
      if (!db.teacherFeedback.basePoints) db.teacherFeedback.basePoints = {};
      if (!db.teacherFeedback.points) db.teacherFeedback.points = {};
      if (!Array.isArray(db.teacherFeedback.log)) db.teacherFeedback.log = [];
      db.teacherFeedback.basePoints[newTeacherId] = periods * 100;
      saveDB(db);

      document.getElementById('newTeacherName').value = '';
      const perEl2 = document.getElementById('newTeacherPeriods');
      if (perEl2) perEl2.value = '';
      teacherAssignmentsDraft = [];
      clearCurrentAssignmentFields();
      renderTeacherAssignmentsDraft();

      msg.style.color = '#0b5e42';
      const basePts = periods * 100;
      const printHint = ' <button type="button" class="btn btn-primary btn-sm" style="margin-right:8px;" data-action="printTeacherCardWithPin" data-args=\'' + (typeof gspArgs === 'function' ? gspArgs([newTeacherId, pin]) : JSON.stringify([newTeacherId, pin])) + '\'>🖨️ طباعة البطاقة الآن</button>';
      msg.innerHTML = formatPinOnceHtml(pin, name, printHint) + (periods ? (' — رصيد جودة ابتدائي: <b>' + basePts + '</b> نقطة (' + periods + ' حصة × 100)') : '');
      const cloudRes = await provisionCloudAccount({
        role: 'teacher', localId: newTeacherId, fullName: name, pin,
        stageIds: currentStageId ? [currentStageId] : [],
        teacherId: newTeacherId
      });
      msg.innerHTML += formatCloudProvisionNote(cloudRes, 'المعلم');
      loadTeachersUI();
    
     } catch (e) {
       console.error('addOrUpdateTeacher failed:', e);
       alert('⚠️ حدث خطأ أثناء حفظ بيانات المعلم.\n' + (e && e.message ? e.message : e));
     }
    }

    // يفتح النموذج أعلاه في وضع "تعديل" ويملؤه ببيانات المعلم الحالية: الاسم، وكل تخصيصاته
    // (مادة+فصول+لغة) تُعرض في قائمة التخصيصات القابلة للحذف/الإضافة قبل الحفظ.
    function startEditTeacher(id) {
      const db = loadDB();
      const t = (db.teachers || []).find(x => x.id === id);
      if (!t) return;
      document.getElementById('editingTeacherId').value = t.id;
      document.getElementById('newTeacherName').value = t.name;
      const perEl = document.getElementById('newTeacherPeriods');
      if (perEl) perEl.value = (t.assignedPeriods != null ? t.assignedPeriods : '');
      teacherAssignmentsDraft = (t.assignments || []).map(a => ({ subjectName: a.subjectName, classes: [...(a.classes ||
          [])], languageType: a.languageType || '' }));
      clearCurrentAssignmentFields();
      renderTeacherAssignmentsDraft();
      document.getElementById('teacherSubmitBtn').textContent = '💾 حفظ التعديل';
      document.getElementById('teacherCancelEditBtn').style.display = 'inline-flex';
      const msg = document.getElementById('teacherFormMsg');
      msg.textContent =
        `✏️ جارٍ تعديل بيانات المعلم: ${t.name} — يمكنك حذف أي تخصيص من القائمة أدناه، أو إضافة مادة/فصول جديدة، ثم اضغط "💾 حفظ التعديل".`;
      msg.style.color = '#1e3a5f';
      document.getElementById('newTeacherName').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function cancelTeacherEdit() {
      document.getElementById('editingTeacherId').value = '';
      document.getElementById('newTeacherName').value = '';
      const perEl = document.getElementById('newTeacherPeriods');
      if (perEl) perEl.value = '';
      teacherAssignmentsDraft = [];
      clearCurrentAssignmentFields();
      renderTeacherAssignmentsDraft();
      document.getElementById('teacherSubmitBtn').textContent = '➕ إضافة معلم';
      document.getElementById('teacherCancelEditBtn').style.display = 'none';
      document.getElementById('teacherFormMsg').textContent = '';
    }

    async function regenerateTeacherPin(id) {
     try {
      if (!(await showConfirm('هل تريد توليد رقم سري جديد لهذا المعلم؟ سيصبح الرقم السري القديم غير صالح للدخول فوراً.'))) return;
      const db = loadDB();
      const t = (db.teachers || []).find(x => x.id === id);
      if (!t) return;
      const pin = generateRandomPin(DEFAULT_PIN_LENGTH);
      delete t.pin;
      t.pinHash = await sha256Hex(pin);
      saveDB(db);
      loadTeachersUI();
      const msg = document.getElementById('teacherFormMsg');
      msg.style.color = '#0b5e42';
      const printHint = ' <button type="button" class="btn btn-primary btn-sm" style="margin-right:8px;" data-action="printTeacherCardWithPin" data-args=\'' + (typeof gspArgs === 'function' ? gspArgs([t.id, pin]) : JSON.stringify([t.id, pin])) + '\'>🖨️ طباعة البطاقة الآن</button>';
      msg.innerHTML = formatPinOnceHtml(pin, t.name, printHint);
      const cloudRes = await provisionCloudAccount({
        action: 'update_password', role: 'teacher', localId: t.id,
        fullName: t.name, pin, stageIds: currentStageId ? [currentStageId] : [], teacherId: t.id
      });
      msg.innerHTML += formatCloudProvisionNote(cloudRes, 'المعلم');
    
     } catch (e) {
       console.error('regenerateTeacherPin failed:', e);
       alert('⚠️ حدث خطأ أثناء توليد رقم سري جديد للمعلم.\n' + (e && e.message ? e.message : e));
     }
    }

    async function editTeacherPinManually(id) {
     try {
      const db = loadDB();
      const t = (db.teachers || []).find(x => x.id === id);
      if (!t) return;
      const input = await showPrompt(`أدخل رقماً سرياً جديداً لـ "${t.name}" (${MIN_PIN_LENGTH} خانات على الأقل):`, '');
      if (input === null) return;
      const newPin = input.trim();
      const msg = document.getElementById('teacherFormMsg');
      const pinCheck = validatePinStrength(newPin, { role: 'teacher' });
      if (!pinCheck.valid) {
        msg.textContent = pinCheck.reason;
        msg.style.color = '#b91c1c';
        return;
      }
      delete t.pin;
      t.pinHash = await sha256Hex(newPin);
      saveDB(db);
      loadTeachersUI();
      msg.style.color = '#0b5e42';
      const printHint = ' <button type="button" class="btn btn-primary btn-sm" style="margin-right:8px;" data-action="printTeacherCardWithPin" data-args=\'' + (typeof gspArgs === 'function' ? gspArgs([t.id, newPin]) : JSON.stringify([t.id, newPin])) + '\'>🖨️ طباعة البطاقة الآن</button>';
      msg.innerHTML = formatPinOnceHtml(newPin, t.name, printHint);
      const cloudRes = await provisionCloudAccount({
        action: 'update_password', role: 'teacher', localId: t.id,
        fullName: t.name, pin: newPin, stageIds: currentStageId ? [currentStageId] : [], teacherId: t.id
      });
      msg.innerHTML += formatCloudProvisionNote(cloudRes, 'المعلم');
    
     } catch (e) {
       console.error('editTeacherPinManually failed:', e);
       alert('⚠️ حدث خطأ أثناء تعديل الرقم السري للمعلم.\n' + (e && e.message ? e.message : e));
     }
    }

    // كل معلم قد يكون له أكثر من تخصيص (مادة + فصولها)، لذا يُصدَّر كل تخصيص في صف مستقل بنفس معرّف
    // واسم المعلم، حتى يتضح بجلاء في ملف الإكسل أن هذا المعلم يدرّس هذه المادة لهذه الفصول تحديداً،
    // وقد تكون له أسطر أخرى بمواد/فصول مختلفة تماماً.
    function exportTeachersExcel() {
      const db = loadDB();
      const teachers = db.teachers || [];
      if (!teachers.length) { alert('لا يوجد معلمون لتصديرهم.');
        return; }
      const classList = db.classes || [];
      // لا يُصدَّر الرقم السري — لم يعد مخزّناً كنص صريح لأسباب أمنية
      const header = ['المعرف', 'الاسم', 'المادة', 'نوع اللغة', ...classList.map(c => classSectionLabel(c))];
      const aoa = [header];
      teachers.forEach(t => {
        const assignments = (t.assignments && t.assignments.length) ? t.assignments : [{ subjectName: '', classes: [],
          languageType: '' }];
        assignments.forEach(a => {
          const row = [t.id, t.name, a.subjectName, a.languageType || ''];
          classList.forEach(c => row.push((a.classes || []).includes(c) ? '✔' : ''));
          aoa.push(row);
        });
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 14 }, { wch: 25 }, { wch: 20 }, { wch: 14 }, ...classList.map(() => ({ wch: 10 }))];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'المعلمون');
      const schoolName = (db.schoolInfo && db.schoolInfo.schoolName) || 'بيانات_المعلمين';
      downloadWorkbook(wb, `${schoolName}_بيانات_المعلمين.xlsx`);
    }

    // ============================================================
    //  TEACHERS IMPORT (add / update from uploaded Excel file)
    // ============================================================
    function parseTeachersWorkbook(wb, db) {
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows.length) throw new Error('الملف فارغ');
      const header = rows[0].map(h => String(h).trim());
      const idIdx = header.indexOf('المعرف');
      const nameIdx = header.indexOf('الاسم');
      const subjectIdx = header.indexOf('المادة');
      const langTypeIdx = header.indexOf('نوع اللغة');
      const pinIdx = header.indexOf('الرقم السري');
      if (nameIdx === -1 || subjectIdx === -1) {
        throw new Error('الملف لا يحتوي على عمودي "الاسم" و "المادة" المطلوبين. تأكد من استخدام نفس تنسيق ملف التصدير.');
      }
      const classColIdx = {};
      (db.classes || []).forEach(c => { const idx = header.indexOf(classSectionLabel(c));
        if (idx !== -1) classColIdx[c] = idx; });

      return rows.slice(1)
        .filter(r => r.some(v => String(v).trim() !== ''))
        .map(r => ({
          id: idIdx !== -1 ? String(r[idIdx] || '').trim() : '',
          name: String(r[nameIdx] || '').trim(),
          subjectName: String(r[subjectIdx] || '').trim(),
          languageType: langTypeIdx !== -1 ? String(r[langTypeIdx] || '').trim() : '',
          pin: pinIdx !== -1 ? String(r[pinIdx] || '').trim() : '',
          classes: Object.keys(classColIdx).filter(c => String(r[classColIdx[c]] || '').trim() !== ''),
        }));
    }

    // يملأ قائمتَي "المرحلة" و"القسم" في لوحة رفع ملف المعلمين، مقصورتين على المراحل/الأقسام
    // المسموح بها للحساب الحالي: كل المراحل والأقسام لرئيس الكنترول، أو فقط المراحل/الأقسام
    // المسندة فعلياً لمدير المرحلة الحالي (فيسجَّل معلموه دائماً في مرحلته هو فقط).
    function populateTeacherImportTargetSelectors() {
      const stageSel = document.getElementById('teacherImportStageSelect');
      const sectionSel = document.getElementById('teacherImportSectionSelect');
      if (!stageSel || !sectionSel) return;
      const root = getRootDB();
      let allowedStageIds = root.stages.map(s => s.id);
      let allowedSections = ['arabic', 'languages'];
      if (currentAccountType === 'stageadmin' && currentStageAdmin) {
        allowedStageIds = (currentStageAdmin.stageIds || []).filter(id => root.stages.some(s => s.id === id));
        if (Array.isArray(currentStageAdmin.sections) && currentStageAdmin.sections.length) {
          allowedSections = currentStageAdmin.sections;
        }
      }
      const stages = root.stages.filter(s => allowedStageIds.includes(s.id));
      const curStageVal = stageSel.value;
      stageSel.innerHTML = (stages.length ? '<option value="">-- اختر مرحلة --</option>' : '<option value="">لا توجد مراحل متاحة</option>') +
        stages.map(s => `<option value="${s.id}">${escapeHtml(stageDisplayLabel(s))}</option>`).join('');
      if (stages.some(s => s.id === curStageVal)) stageSel.value = curStageVal;
      else if (allowedStageIds.includes(currentStageId)) stageSel.value = currentStageId;

      const sectionLabels = { arabic: 'عربي', languages: 'لغات' };
      const curSectionVal = sectionSel.value;
      sectionSel.innerHTML = '<option value="">-- اختر قسم --</option>' +
        allowedSections.map(sc => `<option value="${sc}">${sectionLabels[sc] || sc}</option>`).join('');
      if (allowedSections.includes(curSectionVal)) sectionSel.value = curSectionVal;
      else if (allowedSections.length === 1) sectionSel.value = allowedSections[0];
    }

    function handleTeacherImportClick() {
      const input = document.getElementById('teacherImportFile');
      const msg = document.getElementById('teacherImportMsg');
      if (!input.files || !input.files[0]) {
        msg.style.color = '#b91c1c';
        msg.textContent = '⚠️ يرجى اختيار ملف أولاً';
        return;
      }
      importTeachersFromExcel(input.files[0]);
    }

    async function importTeachersFromExcel(file) {
      const msg = document.getElementById('teacherImportMsg');
      msg.style.color = '#334155';
      msg.textContent = '⏳ جاري معالجة الملف...';

      const targetStageId = document.getElementById('teacherImportStageSelect').value;
      const targetSection = document.getElementById('teacherImportSectionSelect').value;
      if (!targetStageId) { msg.style.color = '#b91c1c';
        msg.textContent = '⚠️ يرجى اختيار المرحلة التي سيتم تسكين هؤلاء المعلمين بها أولاً'; return; }
      if (!targetSection) { msg.style.color = '#b91c1c';
        msg.textContent = '⚠️ يرجى اختيار القسم (عربي/لغات) الذي سيتم تسكين هؤلاء المعلمين به أولاً'; return; }
      // تحقق أمان إضافي بجانب تقييد القائمة نفسها: يمنع مدير المرحلة من تسكين معلمين في مرحلة أو
      // قسم غير مسندين له فعلياً، حتى لو تم التلاعب بالقائمة المنسدلة في المتصفح.
      if (currentAccountType === 'stageadmin' && currentStageAdmin) {
        const allowedStageIds = currentStageAdmin.stageIds || [];
        const allowedSections = currentStageAdmin.sections || [];
        if (!allowedStageIds.includes(targetStageId) || !allowedSections.includes(targetSection)) {
          msg.style.color = '#b91c1c';
          msg.textContent = '⚠️ غير مصرح لك بتسكين معلمين في هذه المرحلة أو هذا القسم.';
          return;
        }
      }

      const rootCheck = getRootDB();
      const targetStageRecord = rootCheck.stages.find(s => s.id === targetStageId);
      if (!targetStageRecord) { msg.style.color = '#b91c1c';
        msg.textContent = '⚠️ المرحلة المختارة لم تعد موجودة.'; return; }
      const targetStageName = targetStageRecord.name;

      // نُبدّل مؤقتاً "المرحلة الحالية" إلى المرحلة الهدف حتى تعمل getDB/loadDB/saveDB المعتادة على
      // بيانات هذه المرحلة تحديداً (وليس بالضرورة المرحلة المعروضة حالياً في الشاشة)، ثم نُعيدها كما
      // كانت بعد الانتهاء مباشرة حتى لا يتأثر عرض الشاشة الحالي بشكل غير متوقع.
      const previousStageId = currentStageId;
      currentStageId = targetStageId;
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const db = loadDB();
        db.teachers = db.teachers || [];
        const rows = parseTeachersWorkbook(wb, db);
        if (!rows.length) {
          msg.style.color = '#b91c1c';
          msg.textContent = '⚠️ لم يتم العثور على بيانات صالحة في الملف';
          return;
        }

        const validSubjects = (db.subjects || []).map(s => s.name);
        const validClasses = db.classes || [];
        let updated = 0, added = 0, skipped = 0;
        const errors = [];
        // [تحديث أمان 2026-09-04] كان الرقم السري القادم من عمود "الرقم السري" في ملف الإكسل يُطبَّق
        // مباشرة على المعلم بدون أي فحص قوة — وهو ثغرة كانت تُلغي عملياً فحص validatePinStrength()
        // المضاف على كل نقاط الإدخال اليدوي؛ كفى أن يستورد مسؤول ملف إكسل بعمود "الرقم السري" فيه
        // قيمة مثل "11111111" لتُقبل كما هي. pinIssues يجمع كل الحالات المرفوضة لعرضها في ملخص
        // الاستيراد، دون فشل الاستيراد بالكامل أو تجاهل المعلم نفسه (فقط رقمه السري المرفوض تحديداً).
        const pinIssues = [];

        // كل صف صالح يمثل تخصيصاً واحداً (مادة + فصولها) وليس معلماً كاملاً؛ نجمع أولاً الصفوف
        // الصالحة في مجموعات حسب المعلم (بعمود "المعرف" إن وُجد، وإلا بالاسم) قبل الحفظ، بحيث يخرج
        // كل معلم بكل تخصيصاته من كل صفوفه في هذا الملف.
        const groups = []; // { id, name, pin, assignments: [] }
        const groupIndexByKey = new Map();

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const rowNum = i + 2;
          if (!r.name) { errors.push(`الصف ${rowNum}: الاسم مفقود`);
            skipped++;
            continue; }
          if (!r.subjectName || !validSubjects.includes(r.subjectName)) {
            errors.push(`الصف ${rowNum} (${escapeHtml(r.name)}): المادة "${escapeHtml(r.subjectName || '-')}" غير معروفة`);
            skipped++;
            continue;
          }
          const classes = r.classes.filter(c => validClasses.includes(c));
          if (classes.length === 0) {
            errors.push(`الصف ${rowNum} (${escapeHtml(r.name)}): لا توجد فصول محددة صحيحة`);
            skipped++;
            continue;
          }
          if (subjectIsSecondLang(r.subjectName) && !r.languageType) {
            errors.push(`الصف ${rowNum} (${escapeHtml(r.name)}): مادة لغة ثانية تتطلب تحديد "نوع اللغة" (فرنسي/الماني...)`);
            skipped++;
            continue;
          }
          const languageType = subjectIsSecondLang(r.subjectName) ? r.languageType : '';

          const key = r.id ? ('id:' + r.id) : ('name:' + r.name);
          let gi = groupIndexByKey.get(key);
          if (gi === undefined) {
            gi = groups.length;
            groups.push({ id: r.id || '', name: r.name, pin: r.pin || '', assignments: [] });
            groupIndexByKey.set(key, gi);
          }
          const group = groups[gi];
          if (r.pin) group.pin = r.pin;
          const existingAssignment = group.assignments.find(a => a.subjectName === r.subjectName && (a.languageType ||
              '') === (languageType || ''));
          if (existingAssignment) {
            classes.forEach(c => { if (!existingAssignment.classes.includes(c)) existingAssignment.classes.push(c); });
          } else {
            group.assignments.push({ subjectName: r.subjectName, classes, languageType });
          }
        }

        for (let i = 0; i < groups.length; i++) {
          const g = groups[i];
          const existing = g.id ? db.teachers.find(t => t.id === g.id) : null;

          // فحص قوة الرقم السري القادم من الملف (إن وُجد) قبل تطبيقه على أي معلم، جديداً كان أو
          // قائماً بالفعل. رقم سري ضعيف أو قصير في الملف يُتجاهَل هو فقط (وليس المعلم كله)، ويُبلَّغ
          // عنه في ملخص الاستيراد؛ المعلم الجديد يحصل بدلاً منه على رقم عشوائي آمن تلقائياً كالمعتاد.
          let pinToApply = '';
          if (g.pin) {
            const pinCheck = validatePinStrength(g.pin);
            if (pinCheck.valid) {
              pinToApply = g.pin;
            } else {
              pinIssues.push(`${g.name}: الرقم السري الموجود في الملف رُفض (${pinCheck.reason}) — ` +
                (existing ? 'احتفظ المعلم برقمه السري الحالي.' : 'تم توليد رقم سري عشوائي آمن بدلاً منه.'));
            }
          }

          if (existing) {
            existing.name = g.name;
            existing.assignments = g.assignments;
            existing.section = targetSection;
            if (pinToApply) {
              delete existing.pin;
              existing.pinHash = await sha256Hex(pinToApply);
            }
            updated++;
          } else {
            const pin = pinToApply || generateRandomPin(DEFAULT_PIN_LENGTH);
            const pinHash = await sha256Hex(pin);
            // لا يُحفظ pin كنص صريح — الهاش فقط. لطباعة البطاقة أعد توليد الرقم من الواجهة.
            db.teachers.push({
              id: 't_' + Date.now() + '_' + i, name: g.name, assignments: g.assignments, section: targetSection,
              pinHash,
            });
            added++;
          }
        }

        saveDB(db);
        if (targetStageId === previousStageId) loadTeachersUI();
        document.getElementById('teacherImportFile').value = '';

        const sectionLabel = targetSection === 'arabic' ? 'القسم العربي' : 'قسم اللغات';
        let summary = `✅ تم تحديث ${updated} معلم، وإضافة ${added} معلم جديد في مرحلة "${targetStageName}" (${sectionLabel})` +
          (skipped ? `، وتم تجاهل ${skipped} صف بسبب أخطاء` : '') + '.';
        if (errors.length) {
          summary += '<br><span style="color:#b91c1c;">' + errors.slice(0, 10).join('<br>') +
            (errors.length > 10 ? '<br>...' : '') + '</span>';
        }
        if (pinIssues.length) {
          summary += '<br><span style="color:#b45309;">⚠️ ' + pinIssues.slice(0, 10).join('<br>⚠️ ') +
            (pinIssues.length > 10 ? '<br>...' : '') + '</span>';
        }
        msg.innerHTML = summary;
        msg.style.color = (updated + added) > 0 ? '#0b5e42' : '#b91c1c';
      } catch (err) {
        msg.style.color = '#b91c1c';
        msg.textContent = '❌ خطأ أثناء معالجة الملف: ' + err.message;
        console.error(err);
      } finally {
        currentStageId = previousStageId;
      }
    }

    // ============================================================
    //  TEACHER ID CARDS PRINTING (A4 - 4 cards per page)
    // ============================================================
    function buildTeacherCardHtml(t, schoolName, stageName, issueDateText) {
      const assignmentsHtml = (t.assignments || []).map(a =>
        `<div>${escapeHtml(a.subjectName)}${a.languageType ? ` (${escapeHtml(a.languageType)})` : ''}: ${(a.classes || []).map(c => escapeHtml(typeof classSectionLabel === 'function' ? classSectionLabel(c) : c)).join('، ')}</div>`
      ).join('');
      const sectionLabel = (typeof CLASS_LANG_LABELS !== 'undefined' && t.section)
        ? (CLASS_LANG_LABELS[t.section] || '') : (t.section === 'arabic' ? 'عربي' : (t.section === 'languages' ? 'لغات' : ''));
      const stageHasSection = stageName && sectionLabel && String(stageName).indexOf(sectionLabel) >= 0;
      const pinValue = t.pin || '-----';
      return `
        <div class="id-card">
          <div class="id-card-header">
            <span class="id-card-title">🏫 بطاقة دخول معلم</span>
            <span class="id-card-school">${escapeHtml(schoolName || '')}</span>
          </div>
          <div class="id-card-row"><strong>الاسم:</strong> ${escapeHtml(t.name)}</div>
          <div class="id-card-row"><strong>المرحلة:</strong> ${escapeHtml(stageName || '-')}</div>
          ${sectionLabel && !stageHasSection ? `<div class="id-card-row"><strong>القسم:</strong> ${sectionLabel}</div>` : ''}
          <div class="id-card-row id-card-assignments"><strong>المواد والفصول:</strong>${assignmentsHtml}</div>
          <div class="id-card-row"><strong>تاريخ الإصدار:</strong> ${issueDateText}</div>
          <div class="id-card-pin">
            <span class="pin-label">الرقم السري</span>
            <span class="pin-value">${escapeHtml(pinValue)}</span>
          </div>
        </div>
      `;
    }

    function renderAndPrintCards(teachers) {
      if (!teachers.length) { alert('لا يوجد معلمون لطباعة بطاقاتهم.'); return; }
      const db = loadDB();
      const schoolName = (db.schoolInfo && db.schoolInfo.schoolName) || '';
      const stageRecord = getStageRecord(currentStageId);
      const stageName = stageRecord ? stageRecord.name : '';
      const issueDateText = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
      const perPage = 4;
      let pagesHtml = '';
      for (let i = 0; i < teachers.length; i += perPage) {
        const chunk = teachers.slice(i, i + perPage);
        const cardsHtml = chunk.map(t => buildTeacherCardHtml(t, schoolName, stageName, issueDateText)).join('');
        pagesHtml += `<div class="card-page"><div class="id-card-grid">${cardsHtml}</div></div>`;
      }
      const area = document.getElementById('printCardsArea');
      area.innerHTML = pagesHtml;
      setTimeout(() => { window.print(); }, 50);
    }

    function printAllTeacherCards() {
      alert('لأسباب أمنية لم يعد الرقم السري مخزّناً كنص صريح.\nلطباعة بطاقة معلم: اضغط «🔄 رقم جديد» ثم «🖨️ طباعة البطاقة الآن» فوراً بعد ظهور الرقم.');
    }

    function printSingleTeacherCard(id) {
      alert('لأسباب أمنية لم يعد الرقم السري مخزّناً كنص صريح.\nاضغط «🔄 رقم جديد» ثم «🖨️ طباعة البطاقة الآن» فوراً بعد ظهور الرقم.');
    }

    /** طباعة بطاقة معلم برقم سري ممرَّر من الذاكرة فقط (لا يُقرأ من التخزين). */
    function printTeacherCardWithPin(id, pin) {
      const db = loadDB();
      const t = (db.teachers || []).find(x => x.id === id);
      if (!t) { alert('المعلم غير موجود.'); return; }
      if (!pin) { alert('لا يوجد رقم سري للطباعة. ولّد رقماً جديداً أولاً.'); return; }
      renderAndPrintCards([Object.assign({}, t, { pin: String(pin) })]);
    }
    GSP.printTeacherCardWithPin = printTeacherCardWithPin;

    async function deleteTeacher(id) {
     try {
      if (!(await showConfirm('هل تريد حذف هذا المعلم؟'))) return;
      const db = loadDB();
      db.teachers = db.teachers.filter(t => t.id !== id);
      saveDB(db);
      if (document.getElementById('editingTeacherId').value === id) cancelTeacherEdit();
      loadTeachersUI();
     } catch (e) {
       console.error('deleteTeacher failed:', e);
       alert('⚠️ حدث خطأ أثناء حذف المعلم.\n' + (e && e.message ? e.message : e));
     }
    }

    function loadTeachersUI() {
      if (currentRole !== 'admin') return;
     try {
      const db = loadDB();
      db.subjects = db.subjects || []; db.classes = db.classes || []; db.teachers = db.teachers || [];

      const subjSel = document.getElementById('newTeacherSubject');
      const curVal = subjSel.value;
      subjSel.innerHTML = '<option value="">-- اختر مادة --</option>';
      db.subjects.forEach(s => { const o = document.createElement('option');
        o.value = s.name;
        o.textContent = s.name;
        subjSel.appendChild(o); });
      if (curVal) subjSel.value = curVal;
      toggleTeacherLangTypeField();

      const classBox = document.getElementById('newTeacherClasses');
      classBox.innerHTML = '';
      // تجميع الفصول حسب الصف الدراسي الذي تتبعه (قد تضم المرحلة الواحدة الآن الصفوف الثلاثة معاً)،
      // حتى يختار مدير النظام فصول المعلم بوضوح من بين الصفوف المتاحة فعلياً لهذه المرحلة.
      const classGrade = db.classGrade || {};
      const byGrade = new Map();
      db.classes.forEach(c => {
        const g = classGrade[c] || 'غير محدد';
        if (!byGrade.has(g)) byGrade.set(g, []);
        byGrade.get(g).push(c);
      });
      byGrade.forEach((classesOfGrade, g) => {
        const heading = document.createElement('div');
        heading.style.cssText = 'width:100%; font-weight:700; font-size:13px; color:#1e3a5f; margin:8px 0 4px; padding-top:4px; border-top:1px solid #e2e8f0;';
        heading.textContent = `🎓 ${g}`;
        classBox.appendChild(heading);
        classesOfGrade.forEach(c => {
          const label = document.createElement('label');
          label.innerHTML = `<input type="checkbox" value="${escapeHtml(c)}" data-event-type="change" data-event-action="updateTeacherMatchPreview"> ${escapeHtml(classSectionLabel(c))}`;
          classBox.appendChild(label);
        });
      });
      // تصفية الفصول بناءً على المادة المختارة حالياً (إن وُجدت)، ثم تحديث معاينة المطابقة
      updateTeacherClassesForSubject();

      const tbody = document.getElementById('teachersTableBody');
      tbody.innerHTML = '';
      const sectionFilterEl = document.getElementById('teachersTabSectionFilter');
      const sectionFilter = sectionFilterEl ? sectionFilterEl.value : '';
      (db.teachers || []).filter(t => !sectionFilter || t.section === sectionFilter).forEach((t, idx) => {
        const row = document.createElement('tr');
        const assignmentsHtml = (t.assignments || []).map(a =>
          `<div style="margin-bottom:4px;"><span class="badge badge-subject">${escapeHtml(a.subjectName)}</span>${a.languageType ? ' ' + langBadgeHtml(a.languageType) : ''} <span style="color:#64748b; font-size:12px;">🏫 ${(a.classes || []).map(c => escapeHtml(typeof classSectionLabel === 'function' ? classSectionLabel(c) : c)).join('، ')}</span></div>`
        ).join('') || '<span style="color:#b91c1c;">⚠️ بدون تخصيص</span>';
        const sectionLabel = t.section === 'arabic' ? 'عربي' : t.section === 'languages' ? 'لغات' : '';
        row.innerHTML = `
          <td class="col-index">${idx + 1}</td>
          <td class="col-name" data-label="الاسم">${escapeHtml(t.name)}${sectionLabel ? ` <span class="badge" style="background:#334155; color:#fff; font-size:11px;">🗂️ ${sectionLabel}</span>` : ''}${(t.assignedPeriods!=null && t.assignedPeriods!=='') ? ` <span class="badge" style="background:#0b5e42; color:#fff; font-size:11px;" title="رصيد جودة ابتدائي = الحصص × 100">📚 ${Number(t.assignedPeriods)||0} حصة · ${(Number(t.assignedPeriods)||0)*100} نقطة</span>` : ''}</td>
          <td class="col-info" data-label="المواد والفصول">${assignmentsHtml}</td>
          <td class="col-pin" data-label="الرقم السري">${maskedPinHtml()}</td>
          <td class="col-actions" data-label="إجراء">
            <div class="flex gap-12" style="gap:6px;">
              <button class="btn btn-outline btn-sm" data-action="startEditTeacher" data-args='${gspArgs(['t.id'])}'>✏️ تعديل</button>
              <button class="btn btn-outline btn-sm" data-action="printSingleTeacherCard" data-args='${gspArgs(['t.id'])}'>🖨️ طباعة</button>
              <button class="btn btn-outline btn-sm" data-action="regenerateTeacherPin" data-args='${gspArgs(['t.id'])}'>🔄 رقم جديد</button>
              <button class="btn btn-outline btn-sm" data-action="editTeacherPinManually" data-args='${gspArgs(['t.id'])}'>✏️ تعديل يدوي</button>
              <button class="btn btn-danger btn-sm" data-action="deleteTeacher" data-args='${gspArgs(['t.id'])}'>🗑️ حذف</button>
            </div>
          </td>
        `;
        tbody.appendChild(row);
      });
      renderTeacherAssignmentsDraft();
     } catch (e) {
       console.error('loadTeachersUI error:', e);
       const tbody = document.getElementById('teachersTableBody');
       if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="color:#b91c1c; font-size:13px; text-align:center; padding:16px;">⚠️ حدث خطأ أثناء تحميل بيانات المعلمين. جرّب إعادة تحميل الصفحة، وإن استمرت المشكلة أرسل نص الخطأ من Console للدعم الفني.</td></tr>';
     }
    }

    // ============================================================
