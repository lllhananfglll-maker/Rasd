/* student-roster.part01.js — generated from student-roster.js; execution order is significant. */
/**
 * js/app/students.js — الجزء 3/9 من app.js السابق (بعد التقسيم لتحسين قابلية الصيانة)
 * المحتوى: قاعدة بيانات الطلاب الرسمية (Master Student Roster) — رئيس الكنترول
 * يعتمد على: نفس النطاق المشترك (window/global scope) الذي كان عليه app.js — يجب تحميله
 * بنفس ترتيب الأجزاء كما في index.html، لأن بعض الدوال هنا تُستدعى من دوال معرّفة في أجزاء لاحقة.
 */
'use strict';



    //  MASTER STUDENT ROSTER (قاعدة بيانات الطلاب الرسمية - رئيس الكنترول فقط)
    //  ------------------------------------------------------------
    //  رفع ملف إكسيل شامل (شيت واحد لكل مرحلة×قسم) يمثل القائمة الرسمية المعتمدة من مكتب الإحصاء،
    //  ومقارنتها ببيانات كل مرحلة الحالية قبل أي تنفيذ فعلي. لا يُحذف/يُضاف/يُعدَّل أي طالب إلا بعد
    //  مراجعة صريحة وتأكيد من رئيس الكنترول لكل التغييرات المعروضة دفعة واحدة.
    // ============================================================
    // ملاحظة: escHtml أصبحت تفويضاً مباشراً لـ escapeHtml (المصدر الوحيد لمنطق الهروب من HTML)
    // بدل تكرار نفس التعبير النمطي. أي تعديل مستقبلي على قواعد الهروب يكفي إجراؤه في escapeHtml فقط.
    function escHtml(str) {
      return escapeHtml(str);
    }


    // → features/students.js (Master Roster)

    function generateStageId() { return 'stage_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }



    // يبحث عن أرقام قومية لطلاب الملف المرفوع حالياً (في المرحلة الحالية) تظهر أيضاً لدى طالب في أي
    // مرحلة دراسية أخرى، لتنبيه مدير المرحلة إلى احتمال تسجيل نفس الطالب بالخطأ في أكثر من مرحلة.
    function findCrossStageDuplicateNationalIds(students, excludeStageId) {
      const root = getRootDB();
      const results = [];
      const idsMap = new Map();
      (students || []).forEach(s => { if (s.nationalId) idsMap.set(s.nationalId, s.name); });
      if (!idsMap.size) return results;
      root.stages.forEach(st => {
        if (st.id === excludeStageId) return;
        const otherStudents = (st.data && st.data.students) || [];
        otherStudents.forEach(os => {
          if (os.nationalId && idsMap.has(os.nationalId)) {
            results.push({ nationalId: os.nationalId, name: idsMap.get(os.nationalId), otherName: os.name, stageName: st.name });
          }
        });
      });
      return results;
    }



    // allowedStageIds اختيارية: عند تمريرها (لمدير مرحلة له أكثر من مرحلة) يقتصر المحوّل على هذه
    // المراحل فقط، بدل عرض كل مراحل المدرسة كما يحدث لرئيس الكنترول. selectId اختيارية أيضاً
    // لدعم أكثر من قائمة تبديل مرحلة في نفس الصفحة (المحوّل العلوي وقائمة تبويب المعلمين).
    // يُعيد اسم المرحلة متضمناً شارة القسم (عربي/لغات) إن كان محدداً. المراحل القديمة
    // بلا section تُعرض باسمها فقط (توافق خلفي مع البيانات السابقة).
    function stageDisplayLabel(s) {
      if (!s) return '';
      if (typeof FIXED_STAGE_IDS !== 'undefined' && FIXED_STAGE_IDS.has(s.id)) return s.name;
      if (!s.section) return s.name;
      const sec = (typeof CLASS_LANG_LABELS !== 'undefined' && CLASS_LANG_LABELS[s.section])
        || (s.section === 'arabic' ? 'عربي' : s.section === 'languages' ? 'لغات' : s.section);
      if (sec && String(s.name).indexOf(sec) >= 0) return s.name;
      return s.name + ' — ' + sec;
    }



    function populateStageSwitcher(allowedStageIds, selectId) {
      const root = getRootDB();
      const sel = document.getElementById(selectId || 'stageSwitchSelect');
      if (!sel) return;
      const stages = allowedStageIds ? root.stages.filter(s => allowedStageIds.includes(s.id)) : root.stages;
      sel.innerHTML = stages.map(s => `<option value="${s.id}">${escapeHtml(stageDisplayLabel(s))}</option>`).join('');
      if (currentStageId) sel.value = currentStageId;
    }



    function switchStage() {
     try {
      const sel = document.getElementById('stageSwitchSelect');
      const newId = sel.value;
      if (currentAccountType === 'stageadmin') {
        const assignedStageIds = (currentStageAdmin && currentStageAdmin.stageIds) || [];
        if (!assignedStageIds.includes(newId)) return; // منع التبديل لمرحلة غير مسندة لهذا المدير
        currentStageId = newId;
        saveSession({ accountType: 'stageadmin', stageId: currentStageId, stageAdminId: currentStageAdmin.id });
      } else if (currentAccountType === 'monitor') {
        const assignedStageIds = (currentStageMonitor && currentStageMonitor.stageIds) || [];
        if (!assignedStageIds.includes(newId)) return;
        currentStageId = newId;
        saveSession({ accountType: 'monitor', stageId: currentStageId, stageMonitorId: currentStageMonitor.id });
      } else {
        currentStageId = newId;
        saveSession({ accountType: 'superadmin', stageId: currentStageId });
      }
      if (typeof GSP.invalidateCompletionCache === 'function') GSP.invalidateCompletionCache();
      applyRoleUI();
      if (isOnline) pullFromCloud(true); // جلب بيانات المرحلة الجديدة فور التبديل
    
     } catch (e) {
       console.error('switchStage failed:', e);
       alert('⚠️ حدث خطأ أثناء التبديل بين المراحل.\n' + (e && e.message ? e.message : e));
     }
    }



    // نفس منطق switchStage لكن مصدرها قائمة "المرحلة" الموجودة داخل تبويب المعلمين نفسه، حتى يقدر
    // رئيس الكنترول (أو مدير المرحلة الذي يدير أكثر من مرحلة) التنقل بين المراحل للتعامل مع
    // معلمي كل مرحلة على حدة دون مغادرة تبويب المعلمين.
    function switchStageFromTeachersTab() {
     try {
      const sel = document.getElementById('teachersTabStageSelect');
      if (!sel) return;
      const newId = sel.value;
      if (!newId || newId === currentStageId) return;
      if (currentAccountType === 'stageadmin') {
        const assignedStageIds = (currentStageAdmin && currentStageAdmin.stageIds) || [];
        if (!assignedStageIds.includes(newId)) return;
        currentStageId = newId;
        saveSession({ accountType: 'stageadmin', stageId: currentStageId, stageAdminId: currentStageAdmin.id });
      } else {
        currentStageId = newId;
        saveSession({ accountType: 'superadmin', stageId: currentStageId });
      }
      if (typeof GSP.invalidateCompletionCache === 'function') GSP.invalidateCompletionCache();
      applyRoleUI();
      if (isOnline) pullFromCloud(true); // جلب بيانات المرحلة الجديدة فور التبديل
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.tab[data-tab="teachers"]').classList.add('active');
      document.getElementById('tab-teachers').classList.add('active');
    
     } catch (e) {
       console.error('switchStageFromTeachersTab failed:', e);
       alert('⚠️ حدث خطأ أثناء التبديل بين المراحل.\n' + (e && e.message ? e.message : e));
     }
    }



    // يسمح لمسؤول الحاسب أو مدير المرحلة المسجّل دخوله حالياً بتغيير رقمه السري بنفسه
    // (بعد تأكيد رقمه الحالي). رئيس الكنترول يبقى قادراً على التعديل/التوليد في أي وقت.
    async function changeMyStageAdminPin() {
      const isAdmin = currentAccountType === 'stageadmin' && currentStageAdmin;
      const isMonitor = currentAccountType === 'monitor' && currentStageMonitor;
      if (!isAdmin && !isMonitor) return;
      const oldPin = await showPrompt('لتأكيد هويتك، أدخل رقمك السري الحالي:', '', 'warning');
      if (oldPin === null) return;
      const root = getRootDB();
      let a = null;
      if (isAdmin) {
        a = (root.stageAdmins || []).find(x => x.id === currentStageAdmin.id);
      } else {
        a = (root.stageMonitors || []).find(x => x.id === currentStageMonitor.id);
      }
      if (!a) { alert('⚠️ تعذّر العثور على حسابك.'); return; }
      const oldHash = await sha256Hex(oldPin.trim());
      if (oldHash !== a.pinHash) { alert('❌ الرقم السري الحالي غير صحيح.'); return; }
      const adminMin = (typeof ADMIN_MIN_PIN_LENGTH !== 'undefined') ? ADMIN_MIN_PIN_LENGTH : MIN_PIN_LENGTH;
      const roleForPin = isMonitor ? 'monitor' : 'stageadmin';
      const newPin = await showPrompt('أدخل رقمك السري الجديد (' + adminMin + ' خانات على الأقل للأدوار الإدارية):', '', 'info');
      if (newPin === null) return;
      const trimmedNew = newPin.trim();
      const pinCheck = validatePinStrength(trimmedNew, { role: roleForPin });
      if (!pinCheck.valid) { alert(pinCheck.reason); return; }
      const confirmPin = await showPrompt('أعد إدخال الرقم السري الجديد للتأكيد:', '', 'info');
      if (confirmPin === null) return;
      if (confirmPin.trim() !== trimmedNew) { alert('⚠️ الرقمان اللذان أدخلتهما غير متطابقين.'); return; }
      delete a.pin;
      a.pinHash = await sha256Hex(trimmedNew);
      saveRootDB(root);
      if (isAdmin) currentStageAdmin = a;
      else currentStageMonitor = a;
      if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
      try { recordAudit('تغيير كلمة السر', (isMonitor ? 'مدير مرحلة: ' : 'مسؤول حاسب: ') + (a.name || '')); } catch (e) {}
      const onceMsg = (typeof formatPinOnceHtml === 'function')
        ? formatPinOnceHtml(trimmedNew, a.name)
        : ('✅ تم تغيير الرقم السري. الرقم الجديد: ' + trimmedNew);
      alert('✅ تم تغيير رقمك السري بنجاح.\nالرقم الجديد (احفظه الآن — لن يُعرض لاحقاً): ' + trimmedNew);
    }


    GSP.changeMyStageAdminPin = changeMyStageAdminPin;



    // ينقل رئيس الكنترول إلى إدارة مرحلة معينة (من جدول المراحل) ويفتح له تبويب رفع الملف مباشرة
    function switchToStage(id) {
     try {
      currentStageId = id;
      saveSession({ accountType: 'superadmin', stageId: id });
      applyRoleUI();
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.tab[data-tab="upload"]').classList.add('active');
      document.getElementById('tab-upload').classList.add('active');
    
     } catch (e) {
       console.error('switchToStage failed:', e);
       alert('⚠️ حدث خطأ أثناء التبديل إلى هذه المرحلة.\n' + (e && e.message ? e.message : e));
     }
    }



    // قفل بسيط يمنع تنفيذ الدالة أكثر من مرة في نفس اللحظة (نقرة مزدوجة على الزرار، أو ضغط Enter
    // متكرر أثناء بطء الشبكة) — بدون هذا القفل كانت كل نقرة زائدة تُنشئ مرحلة مكررة جديدة بنفس
    // الاسم (بمعرّف id مختلف)، تظهر لاحقاً في الجدول فارغة تماماً (0 مديرين، 0 معلمين، 0 طلاب)
    // لأنها لم تُرفَق ببيانات ولم يُسنَد لها مدير أبداً.
    let _stageFormSubmitting = false;



    function addOrUpdateStage() {
      if (_stageFormSubmitting) return;
      _stageFormSubmitting = true;
      const submitBtn = document.getElementById('stageSubmitBtn');
      if (submitBtn) submitBtn.disabled = true;
      try {
        _doAddOrUpdateStage();
      } finally {
        _stageFormSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    }



    function _doAddOrUpdateStage() {
     try {
      const root = getRootDB();
      const name = document.getElementById('newStageName').value.trim();
      const msg = document.getElementById('stageFormMsg');
      const editingId = document.getElementById('editingStageId').value;
      const sectionEl = document.querySelector('input[name="newStageSection"]:checked');
      const section = sectionEl ? sectionEl.value : '';
      msg.style.color = '#b91c1c';
      msg.textContent = '⚠️ المراحل الدراسية ثابتة (ثماني كيانات أساسية) ولا يمكن إضافتها أو تعديل أسمائها من الواجهة.';
      return;
      if (!name) { msg.textContent = '⚠️ يرجى إدخال اسم المرحلة'; return; }

      if (editingId) {
        const st = root.stages.find(s => s.id === editingId);
        if (!st) { msg.textContent = '⚠️ المرحلة غير موجودة (ربما تم حذفها من قبل).';
          cancelStageEdit(); loadStagesMgmtUI(); return; }
        // امنع تحديث الاسم/القسم ليصبحا مطابقين تماماً لمرحلة أخرى موجودة بالفعل (غير هذه).
        const dupOnEdit = root.stages.find(s => s.id !== editingId && s.name.trim() === name &&
          (section ? s.section === section : true));
        if (dupOnEdit) {
          msg.textContent = `⚠️ توجد مرحلة أخرى بنفس الاسم والقسم بالفعل ("${stageDisplayLabel(dupOnEdit)}"). لا يمكن أن تتطابق مرحلتان تماماً.`;
          return;
        }
        st.name = name;
        if (section) st.section = section;
        saveRootDB(root);
        msg.style.color = '#0b5e42';
        msg.textContent = `✅ تم تحديث المرحلة إلى "${stageDisplayLabel(st)}".`;
        cancelStageEdit();
        loadStagesMgmtUI();
        if (currentStageId === editingId) applyRoleUI();
        return;
      }

      if (!section) { msg.textContent = '⚠️ يرجى تحديد القسم (القسم العربي أو قسم اللغات)'; return; }

      // منع إنشاء مرحلة جديدة باسم وقسم مطابقين تماماً لمرحلة موجودة بالفعل — هذا هو الفحص الذي
      // كان غائباً وسبب ظهور مراحل مكررة فارغة (بدون مدير) عند أي نقرة مزدوجة على الزرار.
      const dup = root.stages.find(s => s.name.trim() === name && s.section === section);
      if (dup) {
        msg.textContent = `⚠️ توجد مرحلة بهذا الاسم وهذا القسم بالفعل ("${stageDisplayLabel(dup)}"). عدّل المرحلة الموجودة بدلاً من إنشاء واحدة جديدة، أو غيّر الاسم.`;
        return;
      }

      const id = generateStageId();
      root.stages.push({ id, name, section, data: emptyStageData() });
      saveRootDB(root);
      document.getElementById('newStageName').value = '';
      document.querySelectorAll('input[name="newStageSection"]').forEach(r => r.checked = false);
      msg.style.color = '#0b5e42';
      msg.textContent = `✅ تمت إضافة "${stageDisplayLabel({ name, section })}".`;
      if (!currentStageId) { currentStageId = id;
        saveSession({ accountType: 'superadmin', stageId: id }); }
      loadStagesMgmtUI();
      applyRoleUI();
    
     } catch (e) {
       console.error('_doAddOrUpdateStage failed:', e);
       alert('⚠️ حدث خطأ أثناء حفظ بيانات المرحلة.\n' + (e && e.message ? e.message : e));
     }
    }




    function startEditStage(id) {
      alert('⚠️ تعديل أسماء المراحل معطّل — الكيانات الثمانية ثابتة.');
      return;
      const root = getRootDB();
      const st = root.stages.find(s => s.id === id);
      if (!st) return;
      document.getElementById('editingStageId').value = st.id;
      document.getElementById('newStageName').value = st.name;
      // استعادة اختيار القسم
      document.querySelectorAll('input[name="newStageSection"]').forEach(r => r.checked = false);
      if (st.section) {
        const r = document.querySelector(`input[name="newStageSection"][value="${st.section}"]`);
        if (r) r.checked = true;
      }
      document.getElementById('stageSubmitBtn').textContent = '💾 حفظ التعديل';
      document.getElementById('stageCancelEditBtn').style.display = 'inline-flex';
      document.getElementById('newStageName').scrollIntoView({ behavior: 'smooth', block: 'center' });
      openStageForm();
    }



    function cancelStageEdit() {
      const _fd = document.getElementById('stageFormDetails'); if (_fd) _fd.open = false;
      document.getElementById('editingStageId').value = '';
      document.getElementById('newStageName').value = '';
      document.querySelectorAll('input[name="newStageSection"]').forEach(r => r.checked = false);
      document.getElementById('stageSubmitBtn').textContent = '➕ إضافة مرحلة';
      document.getElementById('stageCancelEditBtn').style.display = 'none';
      document.getElementById('stageFormMsg').textContent = '';
    }



    async function deleteStage(id) {
      // الكيانات الثمانية لا تُحذف — يُسمح فقط بحذف المراحل القديمة/المكررة غير الثابتة
      if (typeof FIXED_STAGE_IDS !== 'undefined' && FIXED_STAGE_IDS.has(id)) {
        alert('⚠️ لا يمكن حذف المراحل الأساسية الثابتة. استخدم «تنظيف المكررات» لدمج البيانات القديمة.');
        return;
      }
      const root = getRootDB();
      const st = root.stages.find(s => s.id === id);
      if (!st) return;
      if (!(await showConfirm(
          `⚠️ سيتم حذف "${stageDisplayLabel(st)}" نهائياً بكل بياناتها (الطلاب، الدرجات، المواد، المعلمون) وكل حسابات مديري هذه المرحلة. هل أنت متأكد؟`
        ))) return;
      root.stages = root.stages.filter(s => s.id !== id);
      root.stageAdmins.forEach(a => { a.stageIds = (a.stageIds || []).filter(sid => sid !== id); });
      root.stageAdmins = root.stageAdmins.filter(a => a.stageIds.length > 0);
      saveRootDB(root);
      // تنظيف نسخ الملفات الأصلية المحفوظة في Supabase Storage لهذه المرحلة المحذوفة (لم تعد مستخدَمة).
      // best-effort: لا يوقف حذف المرحلة نفسه لو تعذّر الحذف من التخزين السحابي لأي سبب.
      const orphanedKeys = Object.keys((st.data && st.data.metaByGrade) || {})
        .map(k => (st.data.metaByGrade[k] || {}).workbookStoragePath)
        .filter(Boolean);
      if (orphanedKeys.length) deleteWorkbooksFromCloud(orphanedKeys);
      // حذف صف المرحلة من جدول السحابة حتى لا يبقى يتيماً
      if (cloudAvailable && isOnline) {
        try {
          await supabaseClient.from('grade_system_state').delete().eq('id', 'stage_' + id);
        } catch (e) { console.error('تعذّر حذف صف المرحلة من السحابة:', e); }
      }
      if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
      if (currentStageId === id) {
        currentStageId = root.stages.length ? root.stages[0].id : null;
        saveSession({ accountType: 'superadmin', stageId: currentStageId });
      }
      loadStagesMgmtUI();
      applyRoleUI();
    }
