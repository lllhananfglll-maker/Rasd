/** app/student-roster.js — مدمج (المرحلة C) */
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
/* student-roster.part02.js — generated from student-roster.js; execution order is significant. */


    
    function openStageMonitorForm() {
      switchStagesInnerTab('monitors');
      const d = document.getElementById('stageMonitorFormDetails');
      if (d) d.open = true;
      const name = document.getElementById('newStageMonitorName');
      if (name) { name.focus(); name.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }


    function getCheckedStageMonitorStageIds() {
      return Array.from(document.querySelectorAll('#newStageMonitorStagesBox .stageMonitorStageChk:checked')).map(el => el.value);
    }


    function cancelStageMonitorEdit() {
      const e = document.getElementById('editingStageMonitorId'); if (e) e.value = '';
      const n = document.getElementById('newStageMonitorName'); if (n) n.value = '';
      document.querySelectorAll('#newStageMonitorStagesBox .stageMonitorStageChk').forEach(c => { c.checked = false; });
      const d = document.getElementById('stageMonitorFormDetails'); if (d) d.open = false;
      const m = document.getElementById('stageMonitorFormMsg'); if (m) m.textContent = '';
    }


    async function addOrUpdateStageMonitor() {
     try {
      if (currentAccountType !== 'superadmin') return;
      const root = getRootDB();
      if (!root.stageMonitors) root.stageMonitors = [];
      const name = ((document.getElementById('newStageMonitorName') || {}).value || '').trim();
      const stageIds = getCheckedStageMonitorStageIds();
      const msg = document.getElementById('stageMonitorFormMsg');
      const editingId = ((document.getElementById('editingStageMonitorId') || {}).value || '');
      if (msg) msg.style.color = '#b91c1c';
      if (!name) { if (msg) msg.textContent = '⚠️ أدخل الاسم'; return; }
      if (!stageIds.length) { if (msg) msg.textContent = '⚠️ اختر مرحلة واحدة على الأقل'; return; }
      if (editingId) {
        const a = root.stageMonitors.find(x => x.id === editingId);
        if (!a) { if (msg) msg.textContent = '⚠️ الحساب غير موجود'; return; }
        a.name = name; a.stageIds = stageIds;
        saveRootDB(root);
        if (msg) { msg.style.color = '#0b5e42'; msg.textContent = '✅ تم التحديث'; }
        cancelStageMonitorEdit(); loadStagesMgmtUI(); return;
      }
      const pin = generateRandomPin(DEFAULT_PIN_LENGTH);
      const pinHash = await sha256Hex(pin);
      const newId = 'mon_' + Date.now();
      root.stageMonitors.push({ id: newId, name, stageIds, pinHash });
      saveRootDB(root);
      if (msg) {
        msg.style.color = '#0b5e42';
        const printHint = ' <button type="button" class="btn btn-primary btn-sm" style="margin-right:8px;" data-action="printStageMonitorCardWithPin" data-args=\'' + (typeof gspArgs === 'function' ? gspArgs([newId, pin]) : JSON.stringify([newId, pin])) + '\'>🖨️ طباعة البطاقة الآن</button>';
        msg.innerHTML = formatPinOnceHtml(pin, name, printHint);
      }
      document.getElementById('newStageMonitorName').value = '';
      loadStagesMgmtUI();
    
     } catch (e) {
       console.error('addOrUpdateStageMonitor failed:', e);
       alert('⚠️ حدث خطأ أثناء حفظ بيانات مدير المرحلة.\n' + (e && e.message ? e.message : e));
     }
    }


    function startEditStageMonitor(id) {
      const root = getRootDB();
      const a = (root.stageMonitors || []).find(x => x.id === id);
      if (!a) return;
      document.getElementById('editingStageMonitorId').value = a.id;
      document.getElementById('newStageMonitorName').value = a.name;
      loadStagesMgmtUI();
      const set = new Set(a.stageIds || []);
      document.querySelectorAll('#newStageMonitorStagesBox .stageMonitorStageChk').forEach(chk => {
        chk.checked = set.has(chk.value);
      });
      const d = document.getElementById('stageMonitorFormDetails');
      if (d) d.open = true;
      switchStagesInnerTab('monitors');
    }


    async function resetStageMonitorPin(id) {
     try {
      if (currentAccountType !== 'superadmin') return;
      if (!(await showConfirm('إنشاء رقم سري جديد؟'))) return;
      const root = getRootDB();
      const a = (root.stageMonitors || []).find(x => x.id === id);
      if (!a) return;
      const pin = generateRandomPin(DEFAULT_PIN_LENGTH);
      delete a.pin;
      a.pinHash = await sha256Hex(pin);
      saveRootDB(root);
      if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
      loadStagesMgmtUI();
      const msg = document.getElementById('stageMonitorFormMsg');
      if (msg) {
        msg.style.color = '#0b5e42';
        const printHint = ' <button type="button" class="btn btn-primary btn-sm" style="margin-right:8px;" data-action="printStageMonitorCardWithPin" data-args=\'' + (typeof gspArgs === 'function' ? gspArgs([a.id, pin]) : JSON.stringify([a.id, pin])) + '\'>🖨️ طباعة البطاقة الآن</button>';
        msg.innerHTML = formatPinOnceHtml(pin, a.name, printHint);
      }
    
     } catch (e) {
       console.error('resetStageMonitorPin failed:', e);
       alert('⚠️ حدث خطأ أثناء إعادة تعيين الرقم السري لمدير المرحلة.\n' + (e && e.message ? e.message : e));
     }
    }



    async function editStageMonitorPinManually(id) {
     try {
      if (currentAccountType !== 'superadmin') return;
      const root = getRootDB();
      const a = (root.stageMonitors || []).find(x => x.id === id);
      if (!a) return;
      const adminMin = (typeof ADMIN_MIN_PIN_LENGTH !== 'undefined') ? ADMIN_MIN_PIN_LENGTH : MIN_PIN_LENGTH;
      const pin = await showPrompt('أدخل رقماً سرياً جديداً لـ ' + a.name + ' (' + adminMin + ' خانات على الأقل):', '');
      if (pin === null) return;
      const trimmed = pin.trim();
      const pinCheck = validatePinStrength(trimmed, { role: 'monitor' });
      if (!pinCheck.valid) { alert(pinCheck.reason); return; }
      delete a.pin;
      a.pinHash = await sha256Hex(trimmed);
      saveRootDB(root);
      if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
      loadStagesMgmtUI();
      const msg = document.getElementById('stageMonitorFormMsg');
      if (msg) {
        msg.style.color = '#0b5e42';
        const printHint = ' <button type="button" class="btn btn-primary btn-sm" style="margin-right:8px;" data-action="printStageMonitorCardWithPin" data-args=\'' + (typeof gspArgs === 'function' ? gspArgs([a.id, trimmed]) : JSON.stringify([a.id, trimmed])) + '\'>🖨️ طباعة البطاقة الآن</button>';
        msg.innerHTML = formatPinOnceHtml(trimmed, a.name, printHint);
      }
    
     } catch (e) {
       console.error('editStageMonitorPinManually failed:', e);
       alert('⚠️ حدث خطأ أثناء تعديل الرقم السري لمدير المرحلة.\n' + (e && e.message ? e.message : e));
     }
    }


    GSP.editStageMonitorPinManually = editStageMonitorPinManually;


    async function deleteStageMonitor(id) {
     try {
      if (currentAccountType !== 'superadmin') return;
      const root = getRootDB();
      const a = (root.stageMonitors || []).find(x => x.id === id);
      if (!a) return;
      if (!(await showConfirm('حذف مدير المرحلة «' + a.name + '»؟'))) return;
      if (typeof requireAdminStepUp === 'function' && root.superAdminPasswordHash) {
        const okStep = await requireAdminStepUp(root.superAdminPasswordHash, 'أدخل كلمة سر رئيس الكنترول لتأكيد الحذف:');
        if (!okStep) return;
      }
      root.stageMonitors = (root.stageMonitors || []).filter(x => x.id !== id);
      saveRootDB(root);
      loadStagesMgmtUI();
     } catch (e) {
       console.error('deleteStageMonitor failed:', e);
       alert('⚠️ حدث خطأ أثناء حذف مدير المرحلة.\n' + (e && e.message ? e.message : e));
     }
    }


    GSP.openStageMonitorForm = openStageMonitorForm;


    GSP.addOrUpdateStageMonitor = addOrUpdateStageMonitor;


    GSP.startEditStageMonitor = startEditStageMonitor;


    GSP.resetStageMonitorPin = resetStageMonitorPin;


    GSP.deleteStageMonitor = deleteStageMonitor;


    GSP.cancelStageMonitorEdit = cancelStageMonitorEdit;



    GSP.exportSystemDirectoryExcel = function() {
      if (currentAccountType !== 'superadmin') {
        alert('التصدير متاح لرئيس الكنترول فقط.');
        return;
      }
      if (typeof XLSX === 'undefined') {
        alert('مكتبة Excel غير محمّلة.');
        return;
      }
      const root = getRootDB();
      const rows = [];
      rows.push({
        'نوع الحساب': 'رئيس الكنترول',
        'الاسم': 'رئيس الكنترول',
        'المعرّف الداخلي': 'superadmin',
        'المرحلة / المراحل': 'كل المراحل',
        'البريد المقترح للسحابة': '',
        'ملاحظات': 'حساب رئيسي — يُدار يدوياً على Supabase'
      });
      (root.stageAdmins || []).forEach(a => {
        const stages = (a.stageIds || []).map(id => {
          const st = root.stages.find(s => s.id === id);
          return st ? stageDisplayLabel(st) : id;
        }).join(' | ');
        rows.push({
          'نوع الحساب': 'مسؤول الحاسب',
          'الاسم': a.name || '',
          'المعرّف الداخلي': a.id || '',
          'معرّفات المراحل (stage_ids)': (a.stageIds || []).join(','),
          'المرحلة / المراحل': stages,
          'البريد المقترح للسحابة': (typeof stageAdminCloudEmail === 'function' ? stageAdminCloudEmail(a.id) : ('sa_' + String(a.id).replace(/[^a-zA-Z0-9_-]/g, '_') + '@' + (CLOUD_LOGIN_DOMAIN || 'school.internal'))),
          'profiles.role': 'stageadmin',
          'ملاحظات': 'تشغيل المرحلة'
        });
      });
      (root.stageMonitors || []).forEach(a => {
        const stages = (a.stageIds || []).map(id => {
          const st = root.stages.find(s => s.id === id);
          return st ? stageDisplayLabel(st) : id;
        }).join(' | ');
        rows.push({
          'نوع الحساب': 'مدير المرحلة',
          'الاسم': a.name || '',
          'المعرّف الداخلي': a.id || '',
          'معرّفات المراحل (stage_ids)': (a.stageIds || []).join(','),
          'المرحلة / المراحل': stages,
          'البريد المقترح للسحابة': (typeof stageMonitorCloudEmail === 'function' ? stageMonitorCloudEmail(a.id) : ('mon_' + String(a.id).replace(/[^a-zA-Z0-9_-]/g, '_') + '@' + (CLOUD_LOGIN_DOMAIN || 'school.internal'))),
          'profiles.role': 'monitor',
          'ملاحظات': 'عرض ومتابعة فقط'
        });
      });
      (root.stages || []).forEach(st => {
        ((st.data && st.data.teachers) || []).forEach(t => {
          rows.push({
            'نوع الحساب': 'معلم',
            'الاسم': t.name || '',
            'المعرّف الداخلي': t.id || '',
            'معرّفات المراحل (stage_ids)': st.id || '',
            'المرحلة / المراحل': stageDisplayLabel(st),
            'البريد المقترح للسحابة': (typeof teacherCloudEmail === 'function') ? teacherCloudEmail(t.id) : '',
            'profiles.role': 'teacher',
            'ملاحظات': ((t.assignments || []).map(a => a.subjectName).filter(Boolean).join('، ')) || ''
          });
        });
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'دليل الحسابات');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, 'دليل-حسابات-المنظومة-' + stamp + '.xlsx');
      try { recordAudit('تصدير دليل الحسابات', 'عدد الصفوف: ' + rows.length); } catch (e) {}
      alert('✅ تم تنزيل ملف Excel بدليل الحسابات (' + rows.length + ' صف) بدون أرقام سرية.');
    };




    function switchStagesInnerTab(tab) {
      document.querySelectorAll('#stagesInnerPills .stages-pill').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-stages-tab') === tab);
      });
      document.querySelectorAll('.stages-inner-panel').forEach(p => {
        p.classList.toggle('active', p.id === 'stagesPanel-' + tab);
      });
    }


    function openStageForm() {
      switchStagesInnerTab('stages');
      alert('المراحل الدراسية ثابتة (ثماني كيانات) ولا يمكن إضافة مرحلة جديدة.');
    }


    function openStageAdminForm() {
      switchStagesInnerTab('admins');
      const d = document.getElementById('stageAdminFormDetails');
      if (d) d.open = true;
      const name = document.getElementById('newStageAdminName');
      if (name) { name.focus(); name.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }


    function toggleStageMoreMenu(ev, id) {
      if (ev) ev.stopPropagation();
      document.querySelectorAll('.stage-more-menu.open').forEach(m => {
        if (m.id !== id) m.classList.remove('open');
      });
      const m = document.getElementById(id);
      if (m) m.classList.toggle('open');
    }


    function closeAllStageMoreMenus() {
      document.querySelectorAll('.stage-more-menu.open').forEach(m => m.classList.remove('open'));
    }


    if (!GSP._stageMoreMenuBound) {
      document.addEventListener('click', closeAllStageMoreMenus);
      GSP._stageMoreMenuBound = true;
    }
/* student-roster.part03.js — generated from student-roster.js; execution order is significant. */


    function stageAdminActionFromButton(button, action, id) {
  if (action === 'print') printSingleStageAdminCard(id);
  else if (action === 'regenerate') regenerateStageAdminPin(id);
  else if (action === 'editpin') editStageAdminPinManually(id);
  else if (action === 'delete') deleteStageAdmin(id);
  closeAllStageMoreMenus();
}
GSP.stageAdminActionFromButton = stageAdminActionFromButton;

function toggleStageMoreMenuFromButton(event, menuId) {
  return toggleStageMoreMenu(event, menuId);
}
GSP.toggleStageMoreMenuFromButton = toggleStageMoreMenuFromButton;

function loadStagesMgmtUI() {
      if (currentAccountType !== 'superadmin') return;
      const root = getRootDB();
      populateTeacherImportTargetSelectors();

      // مؤشرات الملخص
      let totalStudents = 0;
      (root.stages || []).forEach(s => { totalStudents += ((s.data || {}).students || []).length; });
      const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setTxt('kpiStagesCount', (root.stages || []).length);
      setTxt('kpiStageAdminsCount', (root.stageAdmins || []).length);
      setTxt('kpiStageMonitorsCount', (root.stageMonitors || []).length);
      setTxt('kpiStagesStudents', totalStudents);
      const cur = currentStageId ? (root.stages || []).find(s => s.id === currentStageId) : null;
      setTxt('kpiCurrentStage', cur ? stageDisplayLabel(cur) : '—');

      const tbody = document.getElementById('stagesTableBody');
      if (tbody) {
        tbody.innerHTML = root.stages.map((s, idx) => {
          const d = s.data || emptyStageData();
          const adminCount = root.stageAdmins.filter(a => (a.stageIds || []).includes(s.id)).length;
          const sec = (s.section === 'languages')
            ? '<span class="stage-sec-badge stage-sec-lang">لغات</span>'
            : '<span class="stage-sec-badge stage-sec-ar">عربي</span>';
          const isCur = s.id === currentStageId
            ? ' <span class="badge" style="background:#0b5e42; color:#fff;">الحالية</span>'
            : '';
          return `
            <tr>
              <td>${idx + 1}</td>
              <td>${sec}${escapeHtml(stageDisplayLabel(s))}${isCur}</td>
              <td>${(d.students || []).length}</td>
              <td>${(d.teachers || []).length}</td>
              <td>${adminCount}</td>
              <td>
                <div class="stage-actions">
                  <button class="btn btn-outline btn-sm" data-action="switchToStage" data-args='${gspArgs(['s.id'])}'>📂 إدارة</button>
                  ${!(typeof FIXED_STAGE_IDS !== 'undefined' && FIXED_STAGE_IDS.has(s.id)) ? `<button class="btn btn-danger btn-sm" data-action="deleteStage" data-args='${gspArgs([s.id])}'>🗑️ حذف مكرر</button>` : ''}
                </div>
              </td>
            </tr>`;
        }).join('') || '<tr><td colspan="6" style="color:#64748b;">لا توجد مراحل بعد. اضغط «إضافة مرحلة» للبدء.</td></tr>';
      }

      const stagesBox = document.getElementById('newStageAdminStagesBox');
      if (stagesBox) {
        const previouslyChecked = new Set(
          Array.from(stagesBox.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value)
        );
        if (!root.stages.length) {
          stagesBox.innerHTML = '<span style="color:#94a3b8; font-size:13px;">لا توجد مراحل بعد</span>';
        } else {
          stagesBox.innerHTML = root.stages.map(s => `
            <label style="display:flex; align-items:center; gap:6px; font-weight:400; font-size:14px; padding:4px 0;">
              <input type="checkbox" class="stageAdminStageChk" value="${s.id}" ${previouslyChecked.has(s.id) ? 'checked' : ''}> ${escapeHtml(stageDisplayLabel(s))}
            </label>
          `).join('');
        }
      }

      const sectionLabels = { arabic: 'عربي', languages: 'لغات' };
      const atbody = document.getElementById('stageAdminsTableBody');
      if (atbody) {
        atbody.innerHTML = root.stageAdmins.map((a, idx) => {
          const stageNames = (a.stageIds || []).map(id => {
            const st = root.stages.find(s => s.id === id);
            return st ? escapeHtml(stageDisplayLabel(st)) : null;
          }).filter(Boolean);
          const stagesText = stageNames.length ? stageNames.join('، ') :
            '<span style="color:#b91c1c;">⚠️ لا توجد مرحلة صالحة</span>';
          const sectionsText = (a.sections || []).map(sc => sectionLabels[sc] || sc).join('، ') || '-';
          return `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHtml(a.name)}</td>
              <td>${stagesText}<br><span style="font-size:12px; color:#64748b;">🗂️ ${sectionsText}</span></td>
              <td>${maskedPinHtml()}</td>
              <td>
                <div class="stage-actions">
                  <button class="btn btn-outline btn-sm" data-action="startEditStageAdmin" data-args='${gspArgs(['a.id'])}'>✏️ تعديل</button>
                  <div class="stage-more-wrap">
                    <button type="button" class="btn btn-outline btn-sm" data-action="toggleStageMoreMenuFromButton" data-with-event data-args='${gspArgs([`adminMore_${a.id}`])}'>⋯</button>
                    <div class="stage-more-menu" id="adminMore_${a.id}">
                      <button type="button" data-action="stageAdminActionFromButton" data-with-element data-args='${gspArgs(["print", a.id])}'>🖨️ طباعة البطاقة</button>
                      <button type="button" data-action="stageAdminActionFromButton" data-with-element data-args='${gspArgs(["regenerate", a.id])}'>🔄 رقم سري جديد</button>
                      <button type="button" data-action="stageAdminActionFromButton" data-with-element data-args='${gspArgs(["editpin", a.id])}'>✏️ تعديل الرقم يدوياً</button>
                      <button type="button" class="danger" data-action="stageAdminActionFromButton" data-with-element data-args='${gspArgs(["delete", a.id])}'>🗑️ حذف</button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>`;
        }).join('') || '<tr><td colspan="5" style="color:#64748b;">لا يوجد مسؤولو حاسب بعد.</td></tr>';
      }

      const monStagesBox = document.getElementById('newStageMonitorStagesBox');
      if (monStagesBox) {
        const previouslyCheckedM = new Set(
          Array.from(monStagesBox.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value)
        );
        if (!root.stages.length) {
          monStagesBox.innerHTML = '<span style="color:#94a3b8; font-size:13px;">لا توجد مراحل بعد</span>';
        } else {
          monStagesBox.innerHTML = root.stages.map(s => `
            <label style="display:flex; align-items:center; gap:6px; font-weight:400; font-size:14px; padding:4px 0;">
              <input type="checkbox" class="stageMonitorStageChk" value="${s.id}" ${previouslyCheckedM.has(s.id) ? 'checked' : ''}> ${escapeHtml(stageDisplayLabel(s))}
            </label>
          `).join('');
        }
      }
      const mtbody = document.getElementById('stageMonitorsTableBody');
      if (mtbody) {
        const mons = root.stageMonitors || [];
        mtbody.innerHTML = mons.map((a, idx) => {
          const stageNames = (a.stageIds || []).map(id => {
            const st = root.stages.find(s => s.id === id);
            return st ? escapeHtml(stageDisplayLabel(st)) : null;
          }).filter(Boolean);
          const stagesText = stageNames.length ? stageNames.join('، ') :
            '<span style="color:#b91c1c;">⚠️ لا توجد مرحلة صالحة</span>';
          return `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHtml(a.name)}</td>
              <td>${stagesText}</td>
              <td>${maskedPinHtml()}</td>
              <td>
                <div class="stage-actions">
                  <button class="btn btn-outline btn-sm" data-action="printSingleStageMonitorCard" data-args='${gspArgs(['a.id'])}'>🖨️ طباعة البطاقة</button>
                  <button class="btn btn-outline btn-sm" data-action="startEditStageMonitor" data-args='${gspArgs(['a.id'])}'>✏️ تعديل</button>
                  <button class="btn btn-outline btn-sm" data-action="resetStageMonitorPin" data-args='${gspArgs(['a.id'])}'>🔑 رقم سري جديد</button>
                  <button class="btn btn-outline btn-sm" data-action="editStageMonitorPinManually" data-args='${gspArgs(['a.id'])}'>✏️ تعديل الرقم يدوياً</button>
                  <button class="btn btn-danger btn-sm" data-action="deleteStageMonitor" data-args='${gspArgs(['a.id'])}'>🗑️</button>
                </div>
              </td>
            </tr>`;
        }).join('') || '<tr><td colspan="5" style="color:#64748b;">لا يوجد مديرو مرحلة بعد.</td></tr>';
      }
    }



    function getCheckedStageAdminStageIds() {
      return Array.from(document.querySelectorAll('#newStageAdminStagesBox .stageAdminStageChk:checked')).map(el => el.value);
    }



    function defaultStageAdminPermissions(){return{subjects:true,students:true,teachers:true,importExport:true,locks:true,schoolInfo:true};}


    function normalizeStageAdminPermissions(raw){const d=defaultStageAdminPermissions();if(raw&&typeof raw==='object')['subjects','students','teachers','importExport','locks','schoolInfo'].forEach(k=>{if(typeof raw[k]==='boolean')d[k]=raw[k];});return d;}


    function getCheckedStageAdminPermissions(){return{subjects:!!(document.getElementById('saPermSubjects')||{}).checked,students:!!(document.getElementById('saPermStudents')||{}).checked,teachers:!!(document.getElementById('saPermTeachers')||{}).checked,importExport:!!(document.getElementById('saPermImportExport')||{}).checked,locks:!!(document.getElementById('saPermLocks')||{}).checked,schoolInfo:!!(document.getElementById('saPermSchoolInfo')||{}).checked};}


    function setStageAdminPermissionsForm(p){p=normalizeStageAdminPermissions(p);const m={subjects:'saPermSubjects',students:'saPermStudents',teachers:'saPermTeachers',importExport:'saPermImportExport',locks:'saPermLocks',schoolInfo:'saPermSchoolInfo'};Object.keys(m).forEach(k=>{const el=document.getElementById(m[k]);if(el)el.checked=!!p[k];});}


    function stageAdminHasPermission(key){if(typeof GSP!=='undefined'&&GSP.permissionMatrix&&typeof GSP.permissionMatrix.can==='function'){return GSP.permissionMatrix.can(key==='subjects'?'subjects.view':key==='students'?'students.view':key==='teachers'?'teachers.view':key==='importExport'?'importExport.view':key==='locks'?'locks.view':key==='schoolInfo'?'schoolInfo.view':key);}if(currentAccountType==='superadmin')return true;if(currentAccountType!=='stageadmin')return false;return!!normalizeStageAdminPermissions(currentStageAdmin&&currentStageAdmin.permissions)[key];}


    GSP.stageAdminHasPermission=stageAdminHasPermission;


    function formatStageAdminPermsBrief(a){const p=normalizeStageAdminPermissions(a&&a.permissions);const L=[];if(p.subjects)L.push('مواد');if(p.students)L.push('طلاب');if(p.teachers)L.push('معلمون');if(p.importExport)L.push('استيراد');if(p.locks)L.push('أقفال');if(p.schoolInfo)L.push('بيانات');return L.length?L.join(' · '):'عرض فقط';}


    function getCheckedStageAdminSections() {
      const sections = [];
      if (document.getElementById('newStageAdminSectionArabic').checked) sections.push('arabic');
      if (document.getElementById('newStageAdminSectionLanguages').checked) sections.push('languages');
      return sections;
    }



    async function addOrUpdateStageAdmin() {
     try {
      if (currentAccountType !== 'superadmin') {
        alert('إنشاء وتعديل حسابات مسؤولي الحاسب متاح لرئيس الكنترول فقط.');
        return;
      }
      const root = getRootDB();
      const name = document.getElementById('newStageAdminName').value.trim();
      const stageIds = getCheckedStageAdminStageIds();
      const sections = getCheckedStageAdminSections();
      const msg = document.getElementById('stageAdminFormMsg');
      const editingId = document.getElementById('editingStageAdminId').value;
      msg.style.color = '#b91c1c';
      if (!name) { msg.textContent = '⚠️ يرجى إدخال اسم مسؤول الحاسب'; return; }
      if (!stageIds.length) { msg.textContent = '⚠️ يرجى اختيار مرحلة واحدة على الأقل يديرها'; return; }
      if (!sections.length) { msg.textContent = '⚠️ يرجى اختيار قسم واحد على الأقل مسموح به'; return; }

      if (editingId) {
        const a = root.stageAdmins.find(x => x.id === editingId);
        if (!a) { msg.textContent = '⚠️ الحساب غير موجود (ربما تم حذفه من قبل).';
          cancelStageAdminEdit(); loadStagesMgmtUI(); return; }
        a.name = name;
        a.stageIds = stageIds;
        a.sections = sections;
        a.permissions = getCheckedStageAdminPermissions();
        delete a.pin;
        saveRootDB(root);
        msg.style.color = '#0b5e42';
        msg.textContent = `✅ تم تحديث بيانات مسؤول الحاسب "${name}" بنجاح.`;
        cancelStageAdminEdit();
        loadStagesMgmtUI();
        return;
      }

      const pin = generateRandomPin(DEFAULT_PIN_LENGTH);
      const pinHash = await sha256Hex(pin);
      const newId = 'sa_' + Date.now();
      root.stageAdmins.push({ id: newId, name, stageIds, sections, permissions: getCheckedStageAdminPermissions(), pinHash });
      saveRootDB(root);
      document.getElementById('newStageAdminName').value = '';
      msg.style.color = '#0b5e42';
      const printHint = ' <button type="button" class="btn btn-primary btn-sm" style="margin-right:8px;" data-action="printStageAdminCardWithPin" data-args=\'' + (typeof gspArgs === 'function' ? gspArgs([newId, pin]) : JSON.stringify([newId, pin])) + '\'>🖨️ طباعة البطاقة الآن</button>';
      msg.innerHTML = formatPinOnceHtml(pin, name, printHint);
      const cloudRes = await provisionCloudAccount({
        role: 'stageadmin', localId: newId, fullName: name, pin,
        stageIds, sections
      });
      msg.innerHTML += formatCloudProvisionNote(cloudRes, 'مسؤول الحاسب');
      loadStagesMgmtUI();
    
     } catch (e) {
       console.error('addOrUpdateStageAdmin failed:', e);
       alert('⚠️ حدث خطأ أثناء حفظ بيانات مسؤول الحاسب.\n' + (e && e.message ? e.message : e));
     }
    }



    function startEditStageAdmin(id) {
      const root = getRootDB();
      const a = root.stageAdmins.find(x => x.id === id);
      if (!a) return;
      document.getElementById('editingStageAdminId').value = a.id;
      document.getElementById('newStageAdminName').value = a.name;
      loadStagesMgmtUI();
      const stageIds = new Set(a.stageIds || []);
      document.querySelectorAll('#newStageAdminStagesBox .stageAdminStageChk').forEach(chk => {
        chk.checked = stageIds.has(chk.value);
      });
      const sections = new Set(a.sections || []);
      document.getElementById('newStageAdminSectionArabic').checked = sections.has('arabic');
      document.getElementById('newStageAdminSectionLanguages').checked = sections.has('languages');
      setStageAdminPermissionsForm(a.permissions);
      document.getElementById('stageAdminSubmitBtn').textContent = '💾 حفظ التعديل';
      document.getElementById('stageAdminCancelEditBtn').style.display = 'inline-flex';
      document.getElementById('newStageAdminName').scrollIntoView({ behavior: 'smooth', block: 'center' });
      openStageAdminForm();
    }



    function cancelStageAdminEdit() {
      const _fd = document.getElementById('stageAdminFormDetails'); if (_fd) _fd.open = false;
      document.getElementById('editingStageAdminId').value = '';
      document.getElementById('newStageAdminName').value = '';
      document.querySelectorAll('#newStageAdminStagesBox .stageAdminStageChk').forEach(chk => { chk.checked = false; });
      document.getElementById('newStageAdminSectionArabic').checked = true;
      document.getElementById('newStageAdminSectionLanguages').checked = true;
      document.getElementById('stageAdminSubmitBtn').textContent = '➕ إضافة مسؤول حاسب';
      document.getElementById('stageAdminCancelEditBtn').style.display = 'none';
      document.getElementById('stageAdminFormMsg').textContent = '';
    }



    async function regenerateStageAdminPin(id) {
     try {
      if (currentAccountType !== 'superadmin') return;
      if (!(await showConfirm('هل تريد توليد رقم سري جديد لمسؤول الحاسب هذا؟ سيصبح الرقم السري القديم غير صالح للدخول فوراً.'))) return;
      const root = getRootDB();
      const a = root.stageAdmins.find(x => x.id === id);
      if (!a) return;
      const pin = generateRandomPin(DEFAULT_PIN_LENGTH);
      delete a.pin;
      a.pinHash = await sha256Hex(pin);
      saveRootDB(root);
      loadStagesMgmtUI();
      const msg = document.getElementById('stageAdminFormMsg');
      msg.style.color = '#0b5e42';
      const printHint = ' <button type="button" class="btn btn-primary btn-sm" style="margin-right:8px;" data-action="printStageAdminCardWithPin" data-args=\'' + (typeof gspArgs === 'function' ? gspArgs([a.id, pin]) : JSON.stringify([a.id, pin])) + '\'>🖨️ طباعة البطاقة الآن</button>';
      msg.innerHTML = formatPinOnceHtml(pin, a.name, printHint);
      const cloudRes = await provisionCloudAccount({
        action: 'update_password', role: 'stageadmin', localId: a.id,
        fullName: a.name, pin, stageIds: a.stageIds || [], sections: a.sections || []
      });
      msg.innerHTML += formatCloudProvisionNote(cloudRes, 'مسؤول الحاسب');
    
     } catch (e) {
       console.error('regenerateStageAdminPin failed:', e);
       alert('⚠️ حدث خطأ أثناء توليد رقم سري جديد لمسؤول الحاسب.\n' + (e && e.message ? e.message : e));
     }
    }



    async function editStageAdminPinManually(id) {
     try {
      if (currentAccountType !== 'superadmin') return;
      const root = getRootDB();
      const a = root.stageAdmins.find(x => x.id === id);
      if (!a) return;
      const adminMin = (typeof ADMIN_MIN_PIN_LENGTH !== 'undefined') ? ADMIN_MIN_PIN_LENGTH : MIN_PIN_LENGTH;
      const pin = await showPrompt(`أدخل رقماً سرياً جديداً لـ ${a.name} (${adminMin} خانات على الأقل):`, '');
      if (pin === null) return;
      const trimmed = pin.trim();
      const pinCheck = validatePinStrength(trimmed, { role: 'stageadmin' });
      if (!pinCheck.valid) { alert(pinCheck.reason); return; }
      delete a.pin;
      a.pinHash = await sha256Hex(trimmed);
      saveRootDB(root);
      loadStagesMgmtUI();
      const msg = document.getElementById('stageAdminFormMsg');
      msg.style.color = '#0b5e42';
      const printHint = ' <button type="button" class="btn btn-primary btn-sm" style="margin-right:8px;" data-action="printStageAdminCardWithPin" data-args=\'' + (typeof gspArgs === 'function' ? gspArgs([a.id, trimmed]) : JSON.stringify([a.id, trimmed])) + '\'>🖨️ طباعة البطاقة الآن</button>';
      msg.innerHTML = formatPinOnceHtml(trimmed, a.name, printHint);
      const cloudRes = await provisionCloudAccount({
        action: 'update_password', role: 'stageadmin', localId: a.id,
        fullName: a.name, pin: trimmed, stageIds: a.stageIds || [], sections: a.sections || []
      });
      msg.innerHTML += formatCloudProvisionNote(cloudRes, 'مسؤول الحاسب');
    
     } catch (e) {
       console.error('editStageAdminPinManually failed:', e);
       alert('⚠️ حدث خطأ أثناء تعديل الرقم السري لمسؤول الحاسب.\n' + (e && e.message ? e.message : e));
     }
    }



    async function deleteStageAdmin(id) {
     try {
      if (!(await showConfirm('هل تريد حذف حساب مدير المرحلة هذا؟'))) return;
      const root = getRootDB();
      const a = root.stageAdmins.find(x => x.id === id);
      root.stageAdmins = root.stageAdmins.filter(x => x.id !== id);
      saveRootDB(root);
      if (a) {
        await provisionCloudAccount({
          action: 'deactivate', role: 'stageadmin', localId: a.id,
          fullName: a.name || '', pin: '00000000',
          stageIds: a.stageIds || [], sections: a.sections || []
        });
      }
      if (document.getElementById('editingStageAdminId').value === id) cancelStageAdminEdit();
      loadStagesMgmtUI();
     } catch (e) {
       console.error('deleteStageAdmin failed:', e);
       alert('⚠️ حدث خطأ أثناء حذف حساب مدير المرحلة. قد يكون الحساب أُزيل محلياً لكن فشل إلغاؤه سحابياً — راجع القائمة.\n' + (e && e.message ? e.message : e));
     }
    }



    function buildStageAdminCardHtml(a, stageName, schoolName) {
      return `
        <div class="id-card">
          <div class="id-card-header">
            <span class="id-card-title">💻 بطاقة دخول مسؤول الحاسب</span>
            <span class="id-card-school">${escapeHtml(schoolName || '')}</span>
          </div>
          <div class="id-card-row"><strong>الاسم:</strong> ${escapeHtml(a.name)}</div>
          <div class="id-card-row"><strong>المرحلة:</strong> ${escapeHtml(stageName || '-')}</div>
          <div class="id-card-row" style="font-size:13px;color:#0b5e42;"><strong>الصلاحيات:</strong> تشغيل وإدارة المرحلة (طلاب، معلمون، رصد، إعدادات)</div>
          <div class="id-card-pin">
            <span class="pin-label">الرقم السري</span>
            <span class="pin-value">${a.pin || '-----'}</span>
          </div>
        </div>
      `;
    }



    function buildStageMonitorCardHtml(a, stageName, schoolName) {
      return `
        <div class="id-card">
          <div class="id-card-header">
            <span class="id-card-title">🏫 بطاقة دخول مدير مرحلة</span>
            <span class="id-card-school">${escapeHtml(schoolName || '')}</span>
          </div>
          <div class="id-card-row"><strong>الاسم:</strong> ${escapeHtml(a.name)}</div>
          <div class="id-card-row"><strong>المرحلة:</strong> ${escapeHtml(stageName || '-')}</div>
          <div class="id-card-row" style="font-size:13px;color:#9a3412;"><strong>الصلاحيات:</strong> عرض ومتابعة وطباعة فقط — بدون رصد أو تعديل</div>
          <div class="id-card-pin">
            <span class="pin-label">الرقم السري</span>
            <span class="pin-value">${a.pin || '-----'}</span>
          </div>
        </div>
      `;
    }



    function renderAndPrintRoleCards(people, role) {
      const isMonitor = role === 'monitor';
      if (!people.length) {
        alert(isMonitor ? 'لا يوجد مديرو مرحلة لطباعة بطاقاتهم.' : 'لا يوجد مسؤولو حاسب لطباعة بطاقاتهم.');
        return;
      }
      const root = getRootDB();
      const perPage = 4;
      let pagesHtml = '';
      const build = isMonitor ? buildStageMonitorCardHtml : buildStageAdminCardHtml;
      for (let i = 0; i < people.length; i += perPage) {
        const chunk = people.slice(i, i + perPage);
        const cardsHtml = chunk.map(a => {
          const stages = (a.stageIds || []).map(id => root.stages.find(s => s.id === id)).filter(Boolean);
          const stageNamesText = stages.map(s => stageDisplayLabel(s)).filter(Boolean).join(' · ');
          const firstStage = stages[0];
          const schoolName = (firstStage && firstStage.data && firstStage.data.schoolInfo && firstStage.data.schoolInfo.schoolName) || '';
          return build(a, stageNamesText, schoolName);
        }).join('');
        pagesHtml += `<div class="card-page"><div class="id-card-grid">${cardsHtml}</div></div>`;
      }
      if (typeof clearInactivePrintAreas === 'function') clearInactivePrintAreas('printCardsArea');
      document.getElementById('printCardsArea').innerHTML = pagesHtml;
      setTimeout(() => {
        window.print();
        setTimeout(() => { if (typeof clearAllPrintAreas === 'function') clearAllPrintAreas(); }, 800);
      }, 50);
    }



    function renderAndPrintStageAdminCards(admins) {
      renderAndPrintRoleCards(admins, 'stageadmin');
    }



    function printAllStageAdminCards() {
      alert('لأسباب أمنية لم يعد الرقم السري مخزّناً كنص صريح.\nلطباعة البطاقة: ولّد رقماً جديداً ثم اضغط «🖨️ طباعة البطاقة الآن» فوراً.');
    }

    function printSingleStageAdminCard(id) {
      alert('لأسباب أمنية لم يعد الرقم السري مخزّناً كنص صريح.\nولّد رقماً جديداً ثم اضغط «🖨️ طباعة البطاقة الآن» فوراً.');
    }

    function printAllStageMonitorCards() {
      alert('لأسباب أمنية لم يعد الرقم السري مخزّناً كنص صريح.\nلطباعة البطاقة: ولّد رقماً جديداً ثم اضغط «🖨️ طباعة البطاقة الآن» فوراً.');
    }

    function printSingleStageMonitorCard(id) {
      alert('لأسباب أمنية لم يعد الرقم السري مخزّناً كنص صريح.\nولّد رقماً جديداً ثم اضغط «🖨️ طباعة البطاقة الآن» فوراً.');
    }

    function printStageAdminCardWithPin(id, pin) {
      const root = getRootDB();
      const a = (root.stageAdmins || []).find(x => x.id === id);
      if (!a) { alert('الحساب غير موجود.'); return; }
      if (!pin) { alert('لا يوجد رقم سري للطباعة.'); return; }
      renderAndPrintRoleCards([Object.assign({}, a, { pin: String(pin) })], 'stageadmin');
    }
    function printStageMonitorCardWithPin(id, pin) {
      const root = getRootDB();
      const a = (root.stageMonitors || []).find(x => x.id === id);
      if (!a) { alert('الحساب غير موجود.'); return; }
      if (!pin) { alert('لا يوجد رقم سري للطباعة.'); return; }
      renderAndPrintRoleCards([Object.assign({}, a, { pin: String(pin) })], 'monitor');
    }

    GSP.printAllStageMonitorCards = printAllStageMonitorCards;
    GSP.printSingleStageMonitorCard = printSingleStageMonitorCard;
    GSP.printStageAdminCardWithPin = printStageAdminCardWithPin;
    GSP.printStageMonitorCardWithPin = printStageMonitorCardWithPin;
