/**
 * js/app/state.js — الجزء 1/9 من app.js السابق (بعد التقسيم لتحسين قابلية الصيانة)
 * المحتوى: STATE + مساعدات تخصيصات المعلمين (Teacher Assignments Helpers)
 * يعتمد على: نفس النطاق المشترك (window/global scope) الذي كان عليه app.js — يجب تحميله
 * بنفس ترتيب الأجزاء كما في index.html، لأن بعض الدوال هنا تُستدعى من دوال معرّفة في أجزاء لاحقة.
 */
'use strict';
// تصدير دليل المعلمين للحسابات السحابية: GSP.exportSystemDirectoryExcel()
if (typeof APP_VERSION === 'undefined') GSP.APP_VERSION = '25.3.0';
var APP_VERSION = GSP.APP_VERSION;

    // ============================================================
    //  STATE
    // ============================================================
    // نفس مفتاح التخزين القديم عمداً، حتى يتم ترحيل بيانات أي مستخدم قديم تلقائياً لبنية المراحل الجديدة
    // (راجع دالة getRootDB أدناه) بدون فقدان أي بيانات سابقة.
    // ROOT_DB_KEY → core/storage.js
    var uploadedWorkbook = null;
    var uploadedFileName = '';

    // V24: لم تعد هناك كلمة سر افتراضية مكتوبة في الكود. عند أول تشغيل للنظام (عدم وجود
    // superAdminPasswordHash محفوظ) تظهر شاشة "إعداد أولي" تطلب من مدير النظام اختيار كلمة سره
    // الخاصة بنفسه، ويُحفظ فقط الـ hash الخاص بها (SHA-256) — لا يوجد أي نص واضح لكلمة السر في
    // الكود أو في قاعدة البيانات. راجع ensureSuperAdminPasswordHash() وshowAuthMode('admin').

    // currentRole يبقى 'admin' لأي مستخدم يملك صلاحيات كاملة داخل المرحلة الحالية (رئيس الكنترول
    // أثناء إدارته لمرحلة، أو مدير مرحلة)، أو 'teacher' للمعلم — بهذا تستمر كل فحوصات الصلاحيات
    // الموجودة في الكود (currentRole === 'admin') في العمل دون تعديل. currentAccountType يميّز الحساب
    // فعلياً: 'superadmin' | 'stageadmin' | 'teacher'، ويُستخدم فقط للتحكم في واجهة إدارة المراحل
    // ومحوّل المرحلة الحالية.
    // ملاحظة: var وليس let — حتى تُنشر على window ويستطيع permission-matrix / أي وحدة تقرأ
    // root.currentAccountType رؤيتها (let على مستوى السكربت لا يُنشئ خاصية على window).
    var currentRole = null;
    var currentAccountType = null;
    var currentTeacher = null;
    var currentStageAdmin = null;
    var currentStageMonitor = null;
    var currentStageId = null;
    // تخصيصات المعلم الجاري إضافته/تعديله حالياً في نموذج تبويب "المعلمين" (مادة + فصول لكل تخصيص)،
    // يُبنى تدريجياً بالضغط على "➕ إضافة هذا التخصيص" قبل الحفظ النهائي للمعلم.
    var teacherAssignmentsDraft = [];

    // Read-only bridge for feature modules; keeps session state ownership here.
    GSP.getCurrentTeacher = function(){ return currentTeacher; };
    GSP.getAuthContext = function () {
      return {
        accountType: currentAccountType,
        role: currentRole,
        stagePermissions: currentStageAdmin && currentStageAdmin.permissions,
        stageId: currentStageId,
        stageIds: currentStageAdmin && currentStageAdmin.stageIds
      };
    };

    // → core/storage.js


    // → features/cloud-sync.js

    // ============================================================
    //  TEACHER ASSIGNMENTS HELPERS (مادة/فصول متعددة لكل معلم)
    // ============================================================
    function teacherSubjectNames(t) { return [...new Set((t.assignments || []).map(a => a.subjectName))]; }

    // مفتاح مركّب فريد للفصل الدراسي الفعلي (اسم الفصل + القسم)، يُستخدم لتمييز فصلين بنفس الاسم
    // الظاهري في قسمين مختلفين (كأن يوجد "١/١" في القسم العربي و"١/١" في قسم اللغات معاً)، حتى لا
    // تختلط بيانات الطلاب أو درجاتهم أو صلاحيات المعلمين بينهما رغم تطابق الاسم.
    function classSectionKey(cls, section) { return (cls || '') + '§' + (section || ''); }
    function splitClassSectionKey(key) {
      const i = (key || '').lastIndexOf('§');
      if (i === -1) return { cls: key || '', section: '' };
      return { cls: key.slice(0, i), section: key.slice(i + 1) };
    }
    function classSectionLabel(key) {
      const SECTION_SHORT = { arabic: 'عربي', languages: 'لغات' };
      const i = (key || '').lastIndexOf('§');
      if (i === -1) return key || '';
      const cls = key.slice(0, i), sec = key.slice(i + 1);
      return SECTION_SHORT[sec] ? `${cls} (${SECTION_SHORT[sec]})` : cls;
    }

    function teacherClassesForSubject(t, subjectName) {
      const set = new Set();
      (t.assignments || []).filter(a => a.subjectName === subjectName).forEach(a => (a.classes || []).forEach(c => set
        .add(c)));
      return [...set];
    }

    function teacherAllClasses(t) {
      const set = new Set();
      (t.assignments || []).forEach(a => (a.classes || []).forEach(c => set.add(c)));
      return [...set];
    }

    // يرجع نوع اللغة الأجنبية المسجَّل لهذا المعلم لهذه المادة تحديداً (وإن مُرِّر فصل، يقتصر البحث
    // على التخصيص الذي يشمل هذا الفصل، تحسباً لمعلم يدرّس نفس مادة اللغة الثانية بلغتين مختلفتين
    // لفصلين مختلفين).
    function teacherLanguageTypeForSubject(t, subjectName, cls) {
      const match = (t.assignments || []).find(a => a.subjectName === subjectName && a.languageType &&
        (!cls || (a.classes || []).includes(cls)));
      return match ? match.languageType : '';
    }

    // → auth/session.js

    function canAccessGrade(subjectName, cls) {
      if (currentRole === 'admin' || currentAccountType === 'monitor') return true;
      if (currentRole === 'teacher' && currentTeacher) {
        return (currentTeacher.assignments || []).some(a => a.subjectName === subjectName && (a.classes || [])
          .includes(cls));
      }
      return false;
    }

    // ⚠️ [تنظيف 2026-09-04] normalizeArabicText / langValuesMatch / subjectIsSecondLang /
    // getLangColor / langBadgeHtml كانت مُعرَّفة هنا بشكل مطابق تماماً لتعريفها في core/utils.js
    // (نفس المنطق حرفياً). بما أن core/utils.js يُحمَّل قبل app.js، كانت هذه النسخة هنا تُعيد تعريف
    // نفس الأسماء على window وتُلغي (تُظلّل) نسخة core/utils.js فعلياً، فتصبح نسخة utils.js كوداً
    // ميتاً غير مُستخدَم أبداً رغم وجودها. تم حذف هذا التكرار والإبقاء على core/utils.js كمصدر
    // وحيد للحقيقة لهذه الدوال (يُصدّرها بالفعل على window). لا تغيير في أي سلوك — الدوال الآن
    // تُستدعى من نفس المصدر التنفيذي كما كانت تماماً، فقط بدون نسخة ميتة مكررة يجب صيانتها يدوياً
    // في مكانين كلما تغيّر منطق تطبيع النص العربي أو ألوان اللغات.

    // تصفية قائمة طلاب فصل معيّن بحيث لا يرى معلم اللغة الثانية (عند تسجيل الدرجات) إلا الطلاب
    // الذين تطابق لغتهم الثانية المسجَّلة نوع اللغة المخصص له. لا يؤثر هذا على مدير النظام
    // ولا على أي مادة أخرى غير اللغة الثانية.
    function filterStudentsForTeacherLanguage(students, subjectName, cls) {
      if (currentRole === 'teacher' && currentTeacher && subjectIsSecondLang(subjectName)) {
        const languageType = teacherLanguageTypeForSubject(currentTeacher, subjectName, cls);
        if (languageType) return students.filter(s => langValuesMatch(s.secondLanguage, languageType));
      }
      return students;
    }

    // فحص صلاحية الوصول لدرجة طالب بعينه: يضيف فوق فحص المادة/الفصل المعتاد فحص تطابق نوع اللغة
    // الثانية للمعلم المسجَّل دخوله مع اللغة الثانية المسجَّلة لهذا الطالب تحديداً.
    function canAccessStudentGrade(subjectName, student) {
      if (!student) return false;
      const key = classSectionKey(student.class, student.section);
      if (!canAccessGrade(subjectName, key)) return false;
      if (currentRole === 'teacher' && currentTeacher && subjectIsSecondLang(subjectName)) {
        const languageType = teacherLanguageTypeForSubject(currentTeacher, subjectName, key);
        if (languageType) return langValuesMatch(student.secondLanguage, languageType);
      }
      return true;
    }

    // الرقم القومي: لرئيس الكنترول ومسؤول الحاسب ومدير المرحلة فقط — لا يُعرض للمعلم أبداً
    function canViewNationalId() {
      return currentAccountType === 'superadmin'
        || currentAccountType === 'stageadmin'
        || currentAccountType === 'monitor';
    }
    GSP.canViewNationalId = canViewNationalId;

    function toggleTeacherLangTypeField() {
      const subjectName = document.getElementById('newTeacherSubject').value;
      const wrap = document.getElementById('newTeacherLangTypeWrap');
      if (!wrap) return;
      if (subjectIsSecondLang(subjectName)) {
        wrap.style.display = 'block';
        populateLangTypeOptions();
      } else {
        wrap.style.display = 'none';
        document.getElementById('newTeacherLangType').value = '';
        document.getElementById('newTeacherLangTypeCustom').value = '';
        document.getElementById('newTeacherLangTypeCustom').style.display = 'none';
      }
    }

    // يملأ قائمة الاختيار بأنواع اللغات المسجَّلة فعلاً لدى الطلاب (فرنسي/الماني...)، ليختار مدير
    // النظام منها مباشرة بدلاً من كتابتها يدوياً. selectedValue تُستخدم عند فتح نموذج التعديل
    // لتحديد القيمة الحالية للمعلم مسبقاً (حتى لو لم تعد ضمن القيم الحالية للطلاب).
    function populateLangTypeOptions(selectedValue) {
      const db = loadDB();
      const seen = new Map(); // normalized -> أول صيغة كتابية ظهرت بها (لتفادي تكرار نفس اللغة بصيغتين مختلفتين)
      (db.students || []).forEach(s => { const v = (s.secondLanguage || '').trim();
        if (!v) return;
        const key = normalizeArabicText(v);
        if (!seen.has(key)) seen.set(key, v); });
      const sorted = Array.from(seen.values()).sort();
      const sel = document.getElementById('newTeacherLangType');
      const custom = document.getElementById('newTeacherLangTypeCustom');
      if (!sel) return;
      sel.innerHTML = '<option value="">-- اختر اللغة --</option>' +
        sorted.map(v => `<option value="${v}">${v}</option>`).join('') +
        '<option value="__custom__">✏️ إدخال يدوي (لغة غير مدرجة)</option>';
      if (selectedValue && sorted.includes(selectedValue)) {
        sel.value = selectedValue;
        custom.style.display = 'none';
        custom.value = '';
      } else if (selectedValue) {
        sel.value = '__custom__';
        custom.style.display = 'block';
        custom.value = selectedValue;
      } else {
        sel.value = '';
        custom.style.display = 'none';
        custom.value = '';
      }
    }

    function handleLangTypeSelectChange() {
      const sel = document.getElementById('newTeacherLangType');
      const custom = document.getElementById('newTeacherLangTypeCustom');
      if (sel.value === '__custom__') { custom.style.display = 'block';
        custom.focus(); } else { custom.style.display = 'none';
        custom.value = ''; }
    }

    function getSelectedLanguageType() {
      const sel = document.getElementById('newTeacherLangType');
      if (!sel) return '';
      if (sel.value === '__custom__') return document.getElementById('newTeacherLangTypeCustom').value.trim();
      return sel.value;
    }

    // معاينة حيّة أثناء إضافة/تعديل معلم: توضح لمدير النظام فوراً (قبل الحفظ) كم عدد الطلاب الذين
    // سيراهم هذا المعلم فعلياً بناءً على الفصول ونوع اللغة المختارَين، لضمان أن الفلترة صحيحة قبل
    // اعتماد بيانات المعلم. هذا يمنع اكتشاف خطأ في تحديد اللغة بعد فوات الأوان.
    function updateTeacherMatchPreview() {
      const box = document.getElementById('teacherMatchPreview');
      if (!box) return;
      const subjectName = document.getElementById('newTeacherSubject').value;
      const classChecks = document.querySelectorAll('#newTeacherClasses input[type=checkbox]:checked');
      const classes = Array.from(classChecks).map(c => c.value);
      if (!subjectName || classes.length === 0) { box.style.display = 'none';
        return; }

      const db = loadDB();
      const isSecondLang = subjectIsSecondLang(subjectName);
      const classStudents = (db.students || []).filter(s => classes.includes(classSectionKey(s.class, s.section)));

      if (!isSecondLang) {
        box.style.display = 'block';
        box.innerHTML = `<div class="success-box">👁️ سيرى هذا المعلم <strong>${classStudents.length}</strong> طالب في الفصول المختارة (لا يوجد قيد لغة على هذه المادة).</div>`;
        return;
      }

      const languageType = getSelectedLanguageType();
      if (!languageType) {
        box.style.display = 'block';
        box.innerHTML = `<div class="warning-box">⚠️ حدد نوع اللغة أولاً لمعرفة عدد الطلاب المطابقين. إجمالي طلاب الفصول المختارة: ${classStudents.length}.</div>`;
        return;
      }
      const matched = classStudents.filter(s => langValuesMatch(s.secondLanguage, languageType));
      box.style.display = 'block';
      if (matched.length === 0) {
        box.innerHTML = `<div class="warning-box">🚫 لا يوجد أي طالب في الفصول المختارة تطابق لغته الثانية القيمة "${escapeHtml(languageType)}" (من إجمالي ${classStudents.length} طالب). تأكد أن هذه القيمة مطابقة تماماً لما هو مسجَّل في بيانات الطلاب (تبويب "الطلاب")، وإلا فلن يرى هذا المعلم أي طالب عند رصد الدرجات.</div>`;
      } else {
        box.innerHTML = `<div class="success-box">👁️ سيرى هذا المعلم ${langBadgeHtml(languageType)} <strong>${matched.length}</strong> طالب من إجمالي ${classStudents.length} في الفصول المختارة.</div>`;
      }
    }

    // يقرأ حقول "المادة/الفصول/نوع اللغة" الحالية أعلى النموذج (التخصيص الذي يبنيه المدير حالياً
    // قبل إضافته إلى قائمة تخصيصات المعلم).
    function getCurrentAssignmentFields() {
      const subjectName = document.getElementById('newTeacherSubject').value;
      const classChecks = document.querySelectorAll('#newTeacherClasses input[type=checkbox]:checked');
      const classes = Array.from(classChecks).map(c => c.value);
      const isSecondLang = subjectIsSecondLang(subjectName);
      const languageType = isSecondLang ? getSelectedLanguageType() : '';
      return { subjectName, classes, isSecondLang, languageType };
    }

    function clearCurrentAssignmentFields() {
      document.getElementById('newTeacherSubject').value = '';
      toggleTeacherLangTypeField();
      document.querySelectorAll('#newTeacherClasses input[type=checkbox]').forEach(c => c.checked = false);
      updateTeacherClassesForSubject(); // يُعيد إظهار كل الفصول بعد مسح اختيار المادة
    }

    // عند اختيار مادة في نموذج تخصيص المعلم، تُخفى الفصول التي لا تنتمي إلى نطاق هذه المادة
    // (بناءً على حقل appliesTo المُعيَّن عند استيراد ملف الإكسيل)، ويُلغى تحديد أي فصل مخفي كان
    // محدداً سابقاً. إذا لم تكن للمادة قيود نطاق (appliesTo فارغ = مادة عامة) تظهر جميع الفصول.
    function updateTeacherClassesForSubject() {
      const db = loadDB();
      const subjectName = document.getElementById('newTeacherSubject') &&
                          document.getElementById('newTeacherSubject').value;
      const subj = subjectName ? (db.subjects || []).find(s => s.name === subjectName) : null;

      // تصفية تسميات الفصول (كل label يحمل checkbox)
      const labels = document.querySelectorAll('#newTeacherClasses label');
      labels.forEach(label => {
        const cb = label.querySelector('input[type="checkbox"]');
        if (!cb) return;
        const cls = cb.value;
        const visible = !subj || subjectAppliesToClass(subj, cls, db);
        label.style.display = visible ? '' : 'none';
        if (!visible) cb.checked = false;
      });

      // إخفاء عناوين الصفوف التي لا يوجد تحتها أي فصل مرئي
      const classBox = document.getElementById('newTeacherClasses');
      if (classBox) {
        Array.from(classBox.children).forEach(el => {
          // العناوين هي عناصر div وليست label
          if (el.tagName !== 'DIV') return;
          let sibling = el.nextElementSibling;
          let hasVisible = false;
          while (sibling && sibling.tagName === 'LABEL') {
            if (sibling.style.display !== 'none') { hasVisible = true; break; }
            sibling = sibling.nextElementSibling;
          }
          el.style.display = hasVisible ? '' : 'none';
        });
      }

      updateTeacherMatchPreview();
    }

    // يضيف تخصيص (مادة + فصولها) إلى قائمة تخصيصات المعلم الجاري إعداده، دون حفظ المعلم بعد.
    // يسمح هذا لنفس المعلم أن يُسنَد له أكثر من مادة، وأن تختلف الفصول من مادة لأخرى
    // (مثال: يدرّس مادة واحدة لفصل، ومادتين لفصل آخر).
    function addAssignmentToDraft() {
      const msg = document.getElementById('teacherFormMsg');
      const { subjectName, classes, isSecondLang, languageType } = getCurrentAssignmentFields();
      if (!subjectName) { msg.textContent = '⚠️ يرجى اختيار المادة أولاً';
        msg.style.color = '#b91c1c'; return; }
      if (classes.length === 0) { msg.textContent = '⚠️ يرجى اختيار فصل واحد على الأقل';
        msg.style.color = '#b91c1c'; return; }
      if (isSecondLang && !languageType) {
        msg.textContent = '⚠️ يرجى تحديد نوع اللغة الأجنبية لهذا التخصيص';
        msg.style.color = '#b91c1c'; return;
      }
      // إن وُجد تخصيص سابق بنفس المادة ونفس نوع اللغة، يتم دمج الفصول الجديدة معه بدل تكراره
      const existing = teacherAssignmentsDraft.find(a => a.subjectName === subjectName && (a.languageType || '') === (
        languageType || ''));
      if (existing) {
        classes.forEach(c => { if (!existing.classes.includes(c)) existing.classes.push(c); });
      } else {
        teacherAssignmentsDraft.push({ subjectName, classes, languageType });
      }
      clearCurrentAssignmentFields();
      renderTeacherAssignmentsDraft();
      msg.textContent =
        '✅ تمت إضافة التخصيص. يمكنك اختيار مادة أخرى وإضافتها أيضاً، أو الضغط على زر الحفظ أسفل الصفحة لإنهاء إضافة هذا المعلم.';
      msg.style.color = '#0b5e42';
    }

    function removeAssignmentFromDraft(index) {
      teacherAssignmentsDraft.splice(index, 1);
      renderTeacherAssignmentsDraft();
    }

    function renderTeacherAssignmentsDraft() {
      const wrap = document.getElementById('teacherAssignmentsDraftWrap');
      const list = document.getElementById('teacherAssignmentsDraftList');
      if (!wrap || !list) return;
      if (!teacherAssignmentsDraft.length) { wrap.style.display = 'none';
        list.innerHTML = ''; return; }
      wrap.style.display = 'block';
      list.innerHTML = teacherAssignmentsDraft.map((a, idx) => `
        <div class="flex justify-between items-center" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; margin-bottom:8px;">
          <div>
            <span class="badge badge-subject">${escapeHtml(a.subjectName)}</span>
            ${a.languageType ? ' ' + langBadgeHtml(a.languageType) : ''}
            <span style="margin-right:8px; color:#334155; font-size:13px;">🏫 ${(a.classes || []).map(c => escapeHtml(typeof classSectionLabel === 'function' ? classSectionLabel(c) : c)).join('، ')}</span>
          </div>
          <button type="button" class="btn btn-danger btn-sm" data-action="removeAssignmentFromDraft" data-args='${gspArgs([idx])}'>🗑️ حذف</button>
        </div>
      `).join('');
    }

    // ============================================================
