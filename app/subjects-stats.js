/**
 * js/app/subjects-stats.js — الجزء 6/9 من app.js السابق (بعد التقسيم لتحسين قابلية الصيانة)
 * المحتوى: تبويب المواد + تبويب الإحصائيات
 * يعتمد على: نفس النطاق المشترك (window/global scope) الذي كان عليه app.js — يجب تحميله
 * بنفس ترتيب الأجزاء كما في index.html، لأن بعض الدوال هنا تُستدعى من دوال معرّفة في أجزاء لاحقة.
 */
'use strict';

    function loadSubjectsUI() {
      const db = loadDB();
      const container = document.getElementById('subjectsContainer');
      container.innerHTML = '';
      let subjects = db.subjects || [];
      if (currentRole === 'teacher' && currentTeacher) { const tSubjects = teacherSubjectNames(currentTeacher);
        subjects = subjects.filter(s => tSubjects.includes(s.name)); }
      if (subjects.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8; text-align:center;">لا توجد مواد مسجلة بعد. ارفع ملف Excel أولاً، أو أضف مادة يدوياً.</p>';
        document.getElementById('subjectsCount').textContent = '';
        return;
      }
      const isAdmin = (currentAccountType === 'superadmin') || (currentAccountType === 'stageadmin' && typeof stageAdminHasPermission === 'function' && stageAdminHasPermission('subjects'));
      subjects.forEach((sub) => {
        const realIdx = db.subjects.indexOf(sub);
        const div = document.createElement('div');
        div.className = 'subject-grade-group';
        let compsHtml = '';
        (sub.components || []).forEach((comp, ci) => {
          compsHtml += `
            <div class="component-item" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span>${escapeHtml(comp.name)} <span style="color:#94a3b8; font-size:12px;">(${compMaxLabel(comp)})</span>${comp.type === 'passfail' ? ' <span style="color:#0b5e42; font-size:11px; background:#dcfce7; padding:1px 6px; border-radius:4px;">اجتاز/لم يجتز</span>' : ''}</span>
              <label style="font-size:11px; color:${comp.isMonthlyGrade ? '#0b5e42' : '#94a3b8'}; display:flex; align-items:center; gap:3px; cursor:${isAdmin ? 'pointer' : 'default'};">
                <input type="checkbox" ${comp.isMonthlyGrade ? 'checked' : ''} ${isAdmin ? '' : 'disabled'}
                  data-event-type="change" data-event-action="toggleMonthlyComponent" data-event-arg="checked" data-args='${gspArgs([realIdx,ci])}'> 🧮 الدرجة الشهرية (للتصدير)
              </label>
              ${isAdmin ? `
                <button class="btn btn-outline btn-sm" style="padding:2px 8px;" data-action="editComponent" data-args='${gspArgs([realIdx,ci])}'>✏️</button>
                <button class="btn btn-danger btn-sm" style="padding:2px 8px;" data-action="deleteComponent" data-args='${gspArgs([realIdx,ci])}'>🗑️</button>
              ` : ''}
            </div>`;
        });
        div.innerHTML = `
          <div class="flex justify-between items-center flex-wrap gap-12">
            <div>
              <h4>${escapeHtml(sub.name)}</h4>
              <div style="font-size:12px; color:#64748b;">اسم التصدير لنظام الكنترول: <b>${escapeHtml(sub.exportName || sub.name)}</b></div>
            </div>
            <div class="flex gap-12 items-center">
              <span style="font-size:12px; color:#64748b;">${(sub.components || []).length} مكون</span>
              ${isAdmin ? `
                <button class="btn btn-outline btn-sm" data-action="editSubjectMeta" data-args='${gspArgs([realIdx])}'>✏️ تعديل المادة</button>
                <button class="btn btn-outline btn-sm" data-action="addComponent" data-args='${gspArgs([realIdx])}'>➕ مكوّن</button>
                <button class="btn btn-danger btn-sm" data-action="deleteSubject" data-args='${gspArgs([realIdx])}'>🗑️ حذف المادة</button>
              ` : ''}
            </div>
          </div>
          <div class="component-row mt-16">${compsHtml || '<span style="color:#94a3b8; font-size:13px;">لا توجد مكونات بعد</span>'}</div>
        `;
        container.appendChild(div);
      });
      document.getElementById('subjectsCount').textContent = `إجمالي: ${subjects.length} مادة`;
      updateSubjectDropdowns();
    }

    // ==== إدارة يدوية للمواد والمكونات (كتالوج ثابت مستقل عن رفع الإكسيل) ====

    async function addSubjectManual() {
     try {
      const db = loadDB();
      const name = ((await showPrompt('اسم المادة:', '')) || '').trim();
      if (!name) return;
      if ((db.subjects || []).some(s => s.name === name)) { alert('توجد مادة بهذا الاسم بالفعل.'); return; }
      const exportName = ((await showPrompt('اسم مختصر للتصدير لنظام الكنترول (اختياري، اتركه فارغاً لاستخدام نفس الاسم):', '')) || '').trim();
      db.subjects = db.subjects || [];
      db.subjects.push({ name, exportName: exportName || name, components: [] });
      saveDB(db);
      loadSubjectsUI();
    
     } catch (e) {
       console.error('addSubjectManual failed:', e);
       alert('⚠️ حدث خطأ أثناء إضافة المادة.\n' + (e && e.message ? e.message : e));
     }
    }

    async function editSubjectMeta(subIdx) {
     try {
      const db = loadDB();
      const sub = db.subjects[subIdx];
      if (!sub) return;
      const newName = ((await showPrompt('اسم المادة:', sub.name)) || '').trim();
      if (!newName) return;
      const newExportName = ((await showPrompt('اسم التصدير لنظام الكنترول:', sub.exportName || sub.name)) || '').trim();
      if (newName !== sub.name) {
        // تحديث اسم المادة يتطلب تحديث كل الدرجات والتعيينات المرتبطة به حتى لا تنقطع الصلة بالبيانات المحفوظة
        (db.grades || []).forEach(g => { if (g.subjectName === sub.name) g.subjectName = newName; });
        (db.teachers || []).forEach(t => (t.assignments || []).forEach(a => { if (a.subjectName === sub.name) a.subjectName = newName; }));
      }
      sub.name = newName;
      sub.exportName = newExportName || newName;
      saveDB(db);
      loadSubjectsUI();
    
     } catch (e) {
       console.error('editSubjectMeta failed:', e);
       alert('⚠️ حدث خطأ أثناء تعديل بيانات المادة.\n' + (e && e.message ? e.message : e));
     }
    }

    async function deleteSubject(subIdx) {
     try {
      const db = loadDB();
      const sub = db.subjects[subIdx];
      if (!sub) return;
      if (!(await showConfirm(`سيتم حذف مادة "${sub.name}" نهائياً مع كل الدرجات المسجلة لها. هل أنت متأكد؟`))) return;
      db.subjects.splice(subIdx, 1);
      db.grades = (db.grades || []).filter(g => g.subjectName !== sub.name);
      saveDB(db);
      loadSubjectsUI();
     } catch (e) {
       console.error('deleteSubject failed:', e);
       alert('⚠️ حدث خطأ أثناء حذف المادة. يُنصح بمراجعة قائمة المواد والدرجات.\n' + (e && e.message ? e.message : e));
     }
    }

    async function addComponent(subIdx) {
     try {
      const db = loadDB();
      const sub = db.subjects[subIdx];
      if (!sub) return;
      const name = ((await showPrompt('اسم المكوّن:', '')) || '').trim();
      if (!name) return;
      sub.components = sub.components || [];
      // مكوّن حضور/غياب (نسبة الحضور، نسبة الغياب، عدد أيام الغياب...): يُكتشف تلقائياً من الاسم
      // ولا يحتاج درجة عظمى ولا سؤال عن "الدرجة الشهرية" - بصمت تماماً.
      if (isAttendanceComponent(name)) {
        sub.components.push({ name, maxScore: null, isMonthlyGrade: false, type: 'attendance' });
        saveDB(db);
        loadSubjectsUI();
        return;
      }
      const isPassFail = await showConfirm('هل هذا المكوّن من نوع "اجتاز / لم يجتز" بدلاً من درجة رقمية عادية؟ (موافق = نعم، اجتاز/لم يجتز)');
      const maxScoreRaw = await showPrompt(isPassFail ? 'الدرجة التي تُحتسب عند "اجتياز" الطالب لهذا المكوّن:' : 'الدرجة العظمى للمكوّن:', '10');
      if (maxScoreRaw === null) return;
      const maxScore = parseFloat(maxScoreRaw || '');
      if (isNaN(maxScore) || maxScore <= 0) { alert('يرجى إدخال درجة عظمى صحيحة.'); return; }
      const isMonthlyGrade = await showConfirm('هل هذا المكوّن هو "الدرجة الشهرية" التي تُصدَّر لنظام رفع النتائج؟ (موافق = نعم)');
      sub.components.push({ name, maxScore, isMonthlyGrade, type: isPassFail ? 'passfail' : 'score' });
      saveDB(db);
      loadSubjectsUI();
    
     } catch (e) {
       console.error('addComponent failed:', e);
       alert('⚠️ حدث خطأ أثناء إضافة المكوّن.\n' + (e && e.message ? e.message : e));
     }
    }

    async function editComponent(subIdx, compIdx) {
     try {
      const db = loadDB();
      const comp = db.subjects[subIdx] && db.subjects[subIdx].components[compIdx];
      if (!comp) return;
      const newName = ((await showPrompt('اسم المكوّن:', comp.name)) || '').trim();
      if (!newName) return;
      if (isAttendanceComponent(newName)) {
        comp.name = newName;
        comp.maxScore = null;
        comp.isMonthlyGrade = false;
        comp.type = 'attendance';
        saveDB(db);
        loadSubjectsUI();
        return;
      }
      const isPassFail = await showConfirm('هل هذا المكوّن من نوع "اجتاز / لم يجتز" بدلاً من درجة رقمية عادية؟ (موافق = نعم، اجتاز/لم يجتز - إلغاء = درجة رقمية عادية)');
      const newMaxRaw = await showPrompt(isPassFail ? 'الدرجة التي تُحتسب عند "اجتياز" الطالب لهذا المكوّن:' : 'الدرجة العظمى:', String(comp.maxScore ?? '10'));
      if (newMaxRaw === null) return;
      const newMax = parseFloat(newMaxRaw || '');
      if (isNaN(newMax) || newMax <= 0) { alert('يرجى إدخال درجة عظمى صحيحة.'); return; }
      comp.name = newName;
      comp.maxScore = newMax;
      comp.type = isPassFail ? 'passfail' : 'score';
      saveDB(db);
      loadSubjectsUI();
    
     } catch (e) {
       console.error('editComponent failed:', e);
       alert('⚠️ حدث خطأ أثناء تعديل المكوّن.\n' + (e && e.message ? e.message : e));
     }
    }

    function toggleMonthlyComponent(subIdx, compIdx, checked) {
      const db = loadDB();
      const sub = db.subjects[subIdx];
      if (!sub) return;
      // لا يصح أن يكون أكثر من مكوّن واحد "درجة شهرية" في نفس المادة، لأن التصدير الشهري يعرض رقماً واحداً فقط لكل مادة
      if (checked) sub.components.forEach((c, i) => { c.isMonthlyGrade = (i === compIdx); });
      else sub.components[compIdx].isMonthlyGrade = false;
      saveDB(db);
      loadSubjectsUI();
    }

    async function deleteComponent(subIdx, compIdx) {
     try {
      const db = loadDB();
      const sub = db.subjects[subIdx];
      if (!sub) return;
      const comp = sub.components[compIdx];
      if (!(await showConfirm(`سيتم حذف مكوّن "${comp.name}" نهائياً مع كل الدرجات المسجلة له. هل أنت متأكد؟`))) return;
      sub.components.splice(compIdx, 1);
      db.grades = (db.grades || []).filter(g => !(g.subjectName === sub.name && g.componentIndex === compIdx));
      // إعادة ترقيم فهارس المكونات الأكبر من المكوّن المحذوف حتى تبقى متوافقة مع مصفوفة المكونات بعد الحذف
      (db.grades || []).forEach(g => { if (g.subjectName === sub.name && g.componentIndex > compIdx) g.componentIndex--; });
      saveDB(db);
      loadSubjectsUI();
     } catch (e) {
       console.error('deleteComponent failed:', e);
       alert('⚠️ حدث خطأ أثناء حذف المكوّن. يُنصح بمراجعة درجات هذه المادة.\n' + (e && e.message ? e.message : e));
     }
    }

    // → features/grades-ui.js

    function showFinalResults() {
      const db = loadDB();
      const subjectName = document.getElementById('gradeSubjectSelect').value;
      const cls = document.getElementById('gradeClassSelect').value;
      const term = document.getElementById('gradeTermSelect').value;

      if (!subjectName || !cls) { alert('يرجى اختيار المادة والفصل أولاً'); return; }
      const subject = db.subjects.find(s => s.name === subjectName);
      if (!subject) return;
      if (!canAccessGrade(subjectName, cls)) { alert('🚫 غير مصرح لك بالوصول لهذه المادة أو الفصل'); return; }

      let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
      students = filterStudentsForTeacherLanguage(students, subjectName, cls);
      students.sort((a, b) => a.gender !== b.gender ? (a.gender === 'F' ? -1 : 1) : a.name.localeCompare(b.name));

      const monthLabels = getMonthLabels(term);
      const monthCount = monthLabels.length;

      // شريط معلومات واضح: المادة، الفصل الدراسي، الفصل (الشعبة)
      const infoBar = document.getElementById('finalResultsInfoBar');
      infoBar.innerHTML = `
        <span class="badge badge-subject">📘 المادة: ${escapeHtml(subjectName)}</span>
        <span class="grade-term-badge">📅 الفصل الدراسي ${term === 'first' ? 'الأول' : 'الثاني'}</span>
        <span class="badge" style="background:#e2e8f0; color:#1e293b;">🏫 الفصل: ${classSectionLabel(cls)}</span>
      `;

      // صف رؤوس مجمّع: اسم المكون يمتد فوق أعمدة كل شهر + عمود المحصلة
      const groupRow = document.getElementById('finalResultsGroupRow');
      const headerRow = document.getElementById('finalResultsHeaderRow');
      groupRow.innerHTML = '<th rowspan="2">#</th><th rowspan="2">رقم الجلوس</th><th rowspan="2">اسم الطالب</th>';
      headerRow.innerHTML = '';

      subject.components.forEach(c => {
        groupRow.innerHTML +=
          `<th colspan="${monthCount + 1}">${escapeHtml(c.name)} (${compMaxLabel(c)})${isExamComponent(c.name) ? ' 🧮' : ''}</th>`;
        for (let m = 1; m <= monthCount; m++) {
          headerRow.innerHTML += `<th>${monthLabels[m - 1]}</th>`;
        }
        let finalColLabel = 'المتوسط';
        if (isExamComponent(c.name)) finalColLabel = getAutoExamAggregationMode(c.maxScore) === 'average' ? 'المتوسط' : 'الإجمالي';
        else if (isAbsenceDaysComponent(c.name)) finalColLabel = 'الإجمالي';
        headerRow.innerHTML += `<th>${finalColLabel}</th>`;
      });
      groupRow.innerHTML += '<th rowspan="2">المجموع الكلي</th>';

      const tbody = document.getElementById('finalResultsTableBody');
      tbody.innerHTML = '';
      students.forEach((s, idx) => {
        let total = 0,
          anyValue = false,
          hasNumeric = false,
          hasIncomplete = false,
          cellsHtml = '';
        subject.components.forEach((comp, ci) => {
          for (let m = 1; m <= monthCount; m++) {
            const g = db.grades.find(g => g.studentId === s.id && g.subjectName === subjectName && g.term === term &&
              g.month === m && g.componentIndex === ci);
            cellsHtml += `<td>${g ? g.score : '-'}</td>`;
          }
          const finalScore = computeFinalComponentScore(db, s.id, subjectName, ci, term, comp.name, comp.maxScore);
          // مكوّن الحضور/الغياب يُعرض في عموده لكنه لا يدخل ضمن "المجموع الكلي" الأكاديمي؛ "غ" (غياب
          // طوال الفصل في هذا المكوّن) تُستبعد من المجموع (لا تُحتسب صفراً) وتبقى ظاهرة في عمود المكوّن؛
          // ومكوّن لم يكتمل رصد كل شهوره بعد يجعل "المجموع الكلي" "غير مكتمل" بدل مجموع جزئي مضلِّل.
          if (finalScore !== null && comp.type !== 'attendance') {
            anyValue = true;
            if (isIncompleteMark(finalScore)) hasIncomplete = true;
            else if (!isAbsentMark(finalScore)) { total += finalScore; hasNumeric = true; }
          }
          const finalDisplay = finalScore === null ? '-' : (isIncompleteMark(finalScore) ? INCOMPLETE_LABEL : (isAbsentMark(finalScore) ? ABSENT_MARK : (Math.round(finalScore * 100) / 100)));
          cellsHtml += `<td><strong>${finalDisplay}</strong></td>`;
        });
        const totalDisplay = !anyValue ? '-' : (hasIncomplete ? INCOMPLETE_LABEL : (hasNumeric ? (Math.round(total * 100) / 100) : ABSENT_MARK));
        const row = document.createElement('tr');
        row.innerHTML =
          `<td>${idx + 1}</td><td><strong>${escapeHtml(s.seat)}</strong></td><td>${escapeHtml(s.name)}</td>${cellsHtml}<td><strong>${totalDisplay}</strong></td>`;
        tbody.appendChild(row);
      });

      document.getElementById('finalResultsArea').style.display = 'block';
      const status = document.getElementById('gradesStatus');
      status.textContent = `✅ تم عرض النتيجة النهائية لـ ${students.length} طالب`;
      status.style.color = '#0b5e42';
    }

    // ============================================================
    //  STATS TAB
    // ============================================================
    function loadStatsUI() {
     try {
      const db = loadDB();
      db.students = db.students || []; db.classes = db.classes || []; db.subjects = db.subjects || [];
      db.grades = db.grades || [];
      db.subjects.forEach(s => { if (!Array.isArray(s.components)) s.components = []; });
      try { if (typeof populateExportGradeSelect === 'function') populateExportGradeSelect(); } catch (e) {}
      const term = document.getElementById('statsTermSelect').value;
      const cards = document.getElementById('statsCards');

      const totalStudents = db.students.length;
      const totalClasses = db.classes.length;
      const totalSubjects = db.subjects.length;
      const totalComponents = db.subjects.reduce((sum, s) => sum + s.components.length, 0);
      const numMonths = getMonthLabels(term).length;

      if (numMonths === 0) {
        cards.innerHTML = '<div style="color:#b45309;background:#fef9c3;border:1px solid #fcd34d;border-radius:8px;padding:12px 18px;font-size:13px;">⚠️ لم يتم تحديد شهور الفصل الدراسي بعد. يرجى إدخالها في صفحة <strong>بيانات المدرسة</strong> أولاً حتى تظهر الإحصائيات بشكل صحيح.</div>';
        return;
      }

      const totalSlots = totalStudents * totalComponents * numMonths;
      const filledSlots = db.grades.filter(g => g.term === term).length;
      const pct = totalSlots > 0 ? Math.min(100, Math.round((filledSlots / totalSlots) * 100)) : 0;

      cards.innerHTML = `
        <div class="card stat-card"><div class="stat-num">${totalStudents}</div><div class="stat-label">طلاب</div></div>
        <div class="card stat-card"><div class="stat-num">${totalClasses}</div><div class="stat-label">فصول</div></div>
        <div class="card stat-card"><div class="stat-num">${totalSubjects}</div><div class="stat-label">مواد</div></div>
        <div class="card stat-card"><div class="stat-num">${pct}%</div><div class="stat-label">نسبة إدخال الدرجات</div></div>
      `;

      const langDistDiv = document.getElementById('langDistribution');
      if (langDistDiv) {
        const byLangAll = new Map();
        db.students.forEach(s => { const v = (s.secondLanguage || '').trim();
          const key = v ? normalizeArabicText(v) : '__none__';
          if (!byLangAll.has(key)) byLangAll.set(key, { label: v || 'غير محدد', count: 0 });
          byLangAll.get(key).count++; });
        langDistDiv.innerHTML = Array.from(byLangAll.values()).sort((a, b) => b.count - a.count).map(e =>
          `<div class="card" style="padding:10px 16px; margin:0; flex:1; min-width:120px; text-align:center;">
             <div>${langBadgeHtml(e.label)}</div>
             <div style="font-size:22px; font-weight:700; margin-top:6px;">${e.count}</div>
           </div>`).join('') || '<div style="color:#94a3b8; font-size:13px;">لا يوجد طلاب بعد.</div>';
      }

      const compDiv = document.getElementById('subjectCompletion');
      compDiv.innerHTML = '';
      db.subjects.forEach(subj => {
        if (!subj.components || subj.components.length === 0) {
          const row = document.createElement('div');
          row.style.marginBottom = '10px';
          row.innerHTML = `<div class="flex justify-between" style="color:#94a3b8;font-size:13px;"><span>${escapeHtml(subj.name)}</span><span>لا توجد مكونات</span></div>`;
          compDiv.appendChild(row);
          return;
        }
        const isSecondLang = subjectIsSecondLang(subj.name);
        const slots = totalStudents * subj.components.length * numMonths;
        const filled = db.grades.filter(g => g.term === term && g.subjectName === subj.name).length;
        const p = slots > 0 ? Math.min(100, Math.round((filled / slots) * 100)) : 0;
        const row = document.createElement('div');
        row.style.marginBottom = '10px';
        row.innerHTML = `
          <div class="flex justify-between"><span>${escapeHtml(subj.name)}</span><span>${p}%</span></div>
          <div class="bar-outer"><div class="bar-inner" style="width:${p}%;"></div></div>
        `;
        compDiv.appendChild(row);

        // لمادة اللغة الثانية تحديداً: نسبة اكتمال منفصلة لكل نوع لغة (فرنسي/الماني...) على حدة،
        // حتى يتابع مدير النظام كل معلم لغة على حدة بدل رقم إجمالي واحد قد يخفي تأخر لغة بعينها
        if (isSecondLang) {
          const byLang = new Map(); // normalized -> { label, students:[] }
          db.students.forEach(s => { const v = (s.secondLanguage || '').trim();
            if (!v) return;
            const key = normalizeArabicText(v);
            if (!byLang.has(key)) byLang.set(key, { label: v, students: [] });
            byLang.get(key).students.push(s); });
          const sub = document.createElement('div');
          sub.style.cssText = 'margin:4px 0 16px; padding:10px 14px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;';
          if (byLang.size === 0) {
            sub.innerHTML = `<div style="font-size:12px; color:#94a3b8;">لا توجد بيانات لغة ثانية مسجَّلة للطلاب بعد.</div>`;
          } else {
            sub.innerHTML = Array.from(byLang.values()).sort((a, b) => a.label.localeCompare(b.label)).map(entry => {
              const lslots = entry.students.length * subj.components.length * numMonths;
              const lfilled = db.grades.filter(g => g.term === term && g.subjectName === subj.name &&
                entry.students.some(s => s.id === g.studentId)).length;
              const lp = lslots > 0 ? Math.min(100, Math.round((lfilled / lslots) * 100)) : 0;
              return `<div style="margin-bottom:6px;">
                <div class="flex justify-between items-center" style="font-size:13px;">
                  <span>${langBadgeHtml(entry.label)} <span style="color:#64748b;">(${entry.students.length} طالب)</span></span>
                  <span>${lp}%</span>
                </div>
                <div class="bar-outer" style="height:6px;"><div class="bar-inner" style="width:${lp}%; background:${getLangColor(entry.label).fg};"></div></div>
              </div>`;
            }).join('');
          }
          compDiv.appendChild(sub);
        }
      });

      const missingDiv = document.getElementById('missingStudents');
      const studentsWithNoGrades = db.students.filter(s => !db.grades.some(g => g.term === term && g.studentId === s.id));
      missingDiv.textContent = studentsWithNoGrades.length ?
        `${studentsWithNoGrades.length} طالب: ${studentsWithNoGrades.map(s => s.name).slice(0, 30).join('، ')}${studentsWithNoGrades.length > 30 ? ' ...' : ''}` :
        'لا يوجد - جميع الطلاب لديهم درجة واحدة على الأقل';

      populateStatsClassOptions();
      updateStatsSubjectOptions();
      const legendDiv = document.getElementById('statsTierLegend');
      if (legendDiv) legendDiv.innerHTML = buildTierLegendHtml((db.schoolInfo && db.schoolInfo.stageType) || '');
      renderPerformanceCharts();
     } catch (e) {
       console.error('loadStatsUI error:', e);
       const cards = document.getElementById('statsCards');
       if (cards) cards.innerHTML = '<div style="color:#b91c1c; font-size:13px;">⚠️ حدث خطأ أثناء تحميل الإحصائيات. جرّب إعادة تحميل الصفحة، وإن استمرت المشكلة أرسل نص الخطأ من Console للدعم الفني.</div>';
     }
    }

    // فصول وموادّ "أداء الفصل" - مستقلة عن قوائم تبويب رصد الدرجات، لأن تبويب الإحصائيات متاح
    // للإداريين فقط (المعلم مقيَّد بتبويب الرصد وحده) فلا داعي لتصفية حسب تخصيص معلم هنا.
    function populateStatsClassOptions() {
      const db = loadDB();
      const sel = document.getElementById('statsClassSelect');
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">-- اختر فصلاً --</option>';
      (db.classes || []).forEach(c => { const o = document.createElement('option');
        o.value = c;
        o.textContent = classSectionLabel(c);
        sel.appendChild(o); });
      if (cur && db.classes.includes(cur)) sel.value = cur;
    }
    function updateStatsSubjectOptions() {
      const db = loadDB();
      const clsSel = document.getElementById('statsClassSelect');
      const subjSel = document.getElementById('statsSubjectSelect');
      if (!clsSel || !subjSel) return;
      const cls = clsSel.value;
      const cur = subjSel.value;
      subjSel.innerHTML = '<option value="">-- اختر مادة --</option>';
      const subjects = cls ? db.subjects.filter(s => subjectAppliesToClass(s, cls, db)) : db.subjects;
      subjects.forEach(s => { const o = document.createElement('option');
        o.value = s.name;
        o.textContent = s.name;
        subjSel.appendChild(o); });
      if (cur && subjects.some(s => s.name === cur)) subjSel.value = cur;
    }
    function onStatsClassChange() {
      updateStatsSubjectOptions();
      renderPerformanceCharts();
    }

    // يرسم مخططَين: (١) متوسط أداء الفصل شهرياً لهذه المادة عبر شهور الفصل الدراسي، و(٢) توزيع
    // الطلاب حسب فئة الأداء الوصفية (بناءً على مجموع الفصل الدراسي الكامل - subjectTermTotal).
    function renderPerformanceCharts() {
      const area = document.getElementById('performanceChartsArea');
      if (!area) return;
      const db = loadDB();
      const term = document.getElementById('statsTermSelect').value;
      const cls = document.getElementById('statsClassSelect').value;
      const subjectName = document.getElementById('statsSubjectSelect').value;
      if (!cls || !subjectName) { area.innerHTML = '<div style="color:#94a3b8; font-size:13px;">اختر فصلاً ومادة أعلاه لعرض مخططات الأداء.</div>'; return; }
      const subject = db.subjects.find(s => s.name === subjectName);
      if (!subject) { area.innerHTML = ''; return; }
      const stageType = (db.schoolInfo && db.schoolInfo.stageType) || '';

      let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
      students = filterStudentsForTeacherLanguage(students, subjectName, cls);
      if (!students.length) { area.innerHTML = '<div style="color:#94a3b8; font-size:13px;">لا يوجد طلاب في هذا الفصل.</div>'; return; }

      // توزيع الطلاب حسب فئة الأداء (مجموع الفصل الدراسي الكامل)
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

      // متوسط أداء الفصل شهرياً (٪) عبر شهور الفصل الدراسي المحدَّد
      const monthLabels = getMonthLabels(term);
      const monthlyAverages = monthLabels.map((label, idx) => {
        const month = idx + 1;
        let sumPct = 0, cnt = 0;
        students.forEach(s => {
          let sum = 0, max = 0;
          subject.components.forEach((comp, ci) => {
            if (comp.type === 'attendance') return;
            const g = db.grades.find(gg => gg.studentId === s.id && gg.subjectName === subjectName &&
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
        <div class="grid-2" style="align-items:start; gap:20px;">
          <div>
            <div style="font-weight:700; color:#334155; margin-bottom:8px; text-align:center;">📈 متوسط أداء الفصل شهرياً - ${escapeHtml(subjectName)}</div>
            <div style="display:flex; justify-content:center;">${buildBarChartSvg(monthlyAverages)}</div>
          </div>
          <div>
            <div style="font-weight:700; color:#334155; margin-bottom:8px; text-align:center;">🥯 توزيع الطلاب حسب المستوى (${counted} من ${students.length} طالب لهم مجموع فصل مكتمل)</div>
            <div style="display:flex; justify-content:center;">${buildDonutChartSvg(donutSegments)}</div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:10px;">
              ${donutSegments.map(seg => `<span style="display:inline-flex; align-items:center; gap:5px; font-size:12px; color:#334155;"><span style="width:10px;height:10px;border-radius:50%;background:${seg.color};display:inline-block;"></span>${seg.label} (${seg.value})</span>`).join('')}
            </div>
          </div>
        </div>`;
    }

    // ============================================================
