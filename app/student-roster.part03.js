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
