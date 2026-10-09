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
