/** auth/login-ui.js — شاشات الدخول + logout */
'use strict';

async function showAuthMode(mode) {
  const adminNeedsSetup = mode === 'admin' && await needsAdminSetup();
  document.getElementById('authAdminSetupPane').style.display = (mode === 'admin' && adminNeedsSetup) ? 'block' : 'none';
  // STEP 54: cloud Auth must remain available even when the local offline
  // password has never been configured. The first Superadmin is provisioned
  // in Supabase Auth + public.profiles, so hiding this pane would dead-lock
  // a fresh production installation.
  document.getElementById('authAdminPane').style.display =
    (mode === 'admin' && (!adminNeedsSetup || cloudAvailable)) ? 'block' : 'none';
  document.getElementById('authStageAdminPane').style.display = mode === 'stageadmin' ? 'block' : 'none';
  document.getElementById('authTeacherPane').style.display = mode === 'teacher' ? 'block' : 'none';
  const monPane = document.getElementById('authMonitorPane');
  if (monPane) monPane.style.display = mode === 'monitor' ? 'block' : 'none';
  document.getElementById('authTabAdminBtn').className = 'btn ' + (mode === 'admin' ? 'btn-primary' : 'btn-outline');
  document.getElementById('authTabStageAdminBtn').className = 'btn ' + (mode === 'stageadmin' ? 'btn-primary' : 'btn-outline');
  document.getElementById('authTabTeacherBtn').className = 'btn ' + (mode === 'teacher' ? 'btn-primary' : 'btn-outline');
  const monBtn = document.getElementById('authTabMonitorBtn');
  if (monBtn) monBtn.className = 'btn ' + (mode === 'monitor' ? 'btn-primary' : 'btn-outline');
  if (mode === 'admin') {
    document.getElementById('adminAuthMsg').textContent = '';
    document.getElementById('adminPinInput').value = '';
    const setupMsg = document.getElementById('adminSetupMsg'); if (setupMsg) setupMsg.textContent = '';
  } else if (mode === 'stageadmin') {
    populateStageAdminLoginSelect();
    document.getElementById('stageAdminAuthMsg').textContent = '';
    document.getElementById('stageAdminPinInput').value = '';
  } else if (mode === 'monitor') {
    populateMonitorLoginSelect();
    const m = document.getElementById('monitorAuthMsg'); if (m) m.textContent = '';
    const p = document.getElementById('monitorPinInput'); if (p) p.value = '';
  } else {
    populateTeacherLoginStageSelect();
    const teacherSel = document.getElementById('teacherLoginSelect');
    teacherSel.innerHTML = '<option value="">-- اختر المرحلة والقسم أولاً --</option>';
    teacherSel.disabled = true;
    document.getElementById('teacherAuthMsg').textContent = '';
    document.getElementById('teacherPinInput').value = '';
  }
}

// الخطوة الأولى في دخول المعلم: قائمة المراحل/الأقسام التي بها معلمون فقط (بدون أسماء المعلمين بعد).
function populateTeacherLoginStageSelect() {
  const root = getRootDB();
  const sel = document.getElementById('teacherLoginStageSelect');
  sel.innerHTML = '<option value="">-- اختر المرحلة والقسم --</option>';
  root.stages.forEach(st => {
    const teachers = (st.data && st.data.teachers) || [];
    if (!teachers.length) return;
    const o = document.createElement('option');
    o.value = st.id;
    o.textContent = stageDisplayLabel(st);
    sel.appendChild(o);
  });
}

// الخطوة الثانية: بعد اختيار المرحلة والقسم، تُعرض أسماء معلمي هذه المرحلة/القسم فقط.
function onTeacherLoginStageChange() {
  const root = getRootDB();
  const stageId = document.getElementById('teacherLoginStageSelect').value;
  const sel = document.getElementById('teacherLoginSelect');
  if (!stageId) {
    sel.innerHTML = '<option value="">-- اختر المرحلة والقسم أولاً --</option>';
    sel.disabled = true;
    return;
  }
  const st = root.stages.find(s => s.id === stageId);
  const teachers = (st && st.data && st.data.teachers) || [];
  sel.innerHTML = '<option value="">-- اختر معلم --</option>';
  teachers.forEach(t => { const o = document.createElement('option');
    o.value = stageId + '::' + t.id;
    o.textContent = t.name;
    sel.appendChild(o); });
  sel.disabled = false;
}

function populateStageAdminLoginSelect() {
  const root = getRootDB();
  const sel = document.getElementById('stageAdminLoginSelect');
  sel.innerHTML = '<option value="">-- اختر اسمك --</option>';
  (root.stageAdmins || []).forEach(a => {
    const stageNames = (a.stageIds || []).map(id => {
      const st = root.stages.find(s => s.id === id);
      return st ? stageDisplayLabel(st) : null;
    }).filter(Boolean);
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.name + (stageNames.length ? ` — ${stageNames.join('، ')}` : '');
    sel.appendChild(o);
  });
}
function populateMonitorLoginSelect() {
  const root = getRootDB();
  const sel = document.getElementById('monitorLoginSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- اختر اسمك --</option>';
  (root.stageMonitors || []).forEach(a => {
    const stageNames = (a.stageIds || []).map(id => {
      const st = root.stages.find(s => s.id === id);
      return st ? stageDisplayLabel(st) : null;
    }).filter(Boolean);
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.name + (stageNames.length ? ` — ${stageNames.join('، ')}` : '');
    sel.appendChild(o);
  });
}
async function submitMonitorAuth() {
  const msg = document.getElementById('monitorAuthMsg');
  msg.style.color = '#b91c1c';
  const id = document.getElementById('monitorLoginSelect').value;
  const pin = document.getElementById('monitorPinInput').value;
  if (!id) { msg.textContent = '⚠️ اختر اسمك'; return; }
  if (!pin) { msg.textContent = '⚠️ أدخل الرقم السري'; return; }
  const root = getRootDB();
  const mon = (root.stageMonitors || []).find(a => a.id === id);
  if (!mon) { msg.textContent = '❌ الحساب غير موجود'; return; }
  const hash = await sha256Hex(pin);
  if (hash !== mon.pinHash) {
    msg.textContent = '❌ بيانات الدخول غير صحيحة.';
    return;
  }
  const validStageIds = (mon.stageIds || []).filter(sid => root.stages.some(s => s.id === sid));
  if (!validStageIds.length) { msg.textContent = '❌ لا توجد مرحلة صالحة مرتبطة بحسابك.'; return; }
  currentAccountType = 'monitor';
  currentRole = 'viewer';
  currentTeacher = null;
  currentStageAdmin = null;
  currentStageMonitor = mon;
  currentStageId = validStageIds[0];
  saveSession({ accountType: 'monitor', stageId: currentStageId, stageMonitorId: mon.id });
  try { recordAudit('تسجيل الدخول', 'دخول مدير مرحلة: ' + (mon.name || id)); } catch (e) {}
  document.getElementById('authOverlay').style.display = 'none'; document.body.classList.remove('auth-open');
  applyRoleUI();
  Promise.resolve(enforceSystemClosureGateAsync()).catch(() => enforceSystemClosureGate());
}
GSP.submitMonitorAuth = submitMonitorAuth;

// V24: لم تعد هذه الدالة تضبط كلمة سر افتراضية من تلقاء نفسها. هي فقط تُخبرنا هل ما زال
// النظام بحاجة إلى إعداد أولي (true) أو أن كلمة السر مضبوطة بالفعل (false).
async function needsAdminSetup() {
  const root = getRootDB();
  return !root.superAdminPasswordHash;
}

// يُستخدم في أماكن أخرى من الكود كانت تعتمد على وجود hash دائماً (مثل تغيير كلمة السر)؛
// إن لم توجد كلمة سر بعد فهذا يعني أن الإعداد الأولي لم يكتمل، ولا شيء يُفعل هنا تلقائياً.
async function ensureSuperAdminPasswordHash() { /* V24: لا يوجد إعداد تلقائي بعد الآن */ }

async function submitAdminSetup() {
 try {
  const msg = document.getElementById('adminSetupMsg');
  msg.style.color = '#b91c1c';
  const p1 = document.getElementById('adminSetupPass1').value;
  const p2 = document.getElementById('adminSetupPass2').value;
  if (!p1 || !p2) { msg.textContent = '⚠️ يرجى تعبئة الحقلين'; return; }
  if (p1.length < 8) { msg.textContent = '⚠️ كلمة السر يجب ألا تقل عن 8 خانات (استخدم أرقاماً وحروفاً إن أمكن)'; return; }
  if (p1 !== p2) { msg.textContent = '❌ كلمتا السر غير متطابقتين'; return; }
  const root = getRootDB();
  root.superAdminPasswordHash = await sha256Hex(p1);
  saveRootDB(root);
  recordAudit('إعداد أولي', 'تم ضبط كلمة سر رئيس الكنترول لأول مرة', 'warning');
  document.getElementById('adminSetupPass1').value = '';
  document.getElementById('adminSetupPass2').value = '';
  loginAsSuperAdmin();

 } catch (e) {
   console.error('submitAdminSetup failed:', e);
   alert('⚠️ حدث خطأ أثناء إعداد حساب رئيس الكنترول.\n' + (e && e.message ? e.message : e));
 }
}

async function submitAdminAuth() {
  const msg = document.getElementById('adminAuthMsg');
  msg.style.color = '#b91c1c';
  const throttle = checkAuthThrottle('admin');
  if (throttle.blocked) { msg.textContent = formatWaitMessage(throttle.waitMs, throttle.attempts); return; }
  const emailEl = document.getElementById('adminEmailInput');
  const email = emailEl ? emailEl.value.trim() : '';
  const pin = document.getElementById('adminPinInput').value;
  const online = (typeof isOnline !== 'undefined') ? isOnline : (typeof navigator !== 'undefined' && navigator.onLine);
  // Step 48: المسار الأساسي = Supabase Auth (بريد + كلمة سر الحساب السحابي)
  if (email && pin && cloudAvailable && online) {
    msg.textContent = '⏳ جارٍ التحقق من الحساب السحابي...';
    msg.style.color = '#334155';
    const result = await cloudSignIn(email, pin);
    if (!result.error && result.profile) {
      // STEP 54: the رئيس الكنترول entry point accepts Superadmin only.
      // Stageadmin has its own login surface and must not inherit root access.
      if (result.profile.role !== 'superadmin') {
        await cloudSignOut();
        msg.style.color = '#b91c1c';
        msg.textContent = '❌ هذا الحساب ليس حساب رئيس الكنترول.';
        return;
      }
      clearAuthFailState('admin');
      try { await pullAllStagesFromCloud(); } catch (e) { console.warn(e); }
      applyCloudProfileLogin(result.profile);
      return;
    }
    msg.style.color = '#b91c1c';
    msg.textContent = '❌ الدخول السحابي: ' + (result.error || 'فشل') +
      (online ? ' — للدخول المحلي الاحتياطي اترك حقل البريد فارغًا (بدون اتصال يُفضّل).' : '');
    // لا نكمل للمحلي تلقائيًا عند فشل سحابي مع وجود بريد (حتى لا يختلط المساران)
    return;
  }
  // بدون بريد + متصل: نوجّه لاستخدام الحساب السحابي
  if (!email && pin && cloudAvailable && online) {
    msg.style.color = '#92400e';
    msg.textContent = 'ℹ️ يُفضّل الدخول ببريد رئيس الكنترول السحابي. للوضع الاحتياطي المحلي اترك البريد فارغًا وأنت دون اتصال، أو تابع محليًا أدناه.';
    // نسمح بالمحلي كاحتياطي حتى لا نحبس المستخدم
  }
  if (await needsAdminSetup()) {
    msg.textContent = '⚠️ لم يتم ضبط كلمة سر محلية — استخدم الإعداد الأولي أو الدخول السحابي بالبريد.';
    return;
  }
  const root = getRootDB();
  const hash = await sha256Hex(pin);
  if (hash === root.superAdminPasswordHash) {
    clearAuthFailState('admin');
    loginAsSuperAdmin();
  } else {
    const fail = registerAuthFailure('admin');
    msg.textContent = '❌ بيانات الدخول غير صحيحة. ' + (fail.attempts >= 3 ? formatWaitMessage(fail.waitMs, fail.attempts) : '');
  }
}

async function changeAdminPassword() {
 try {
  const root = getRootDB();
  const oldPass = document.getElementById('changeAdminOldPass').value;
  const newPass = document.getElementById('changeAdminNewPass').value;
  const newPass2 = document.getElementById('changeAdminNewPass2').value;
  const msg = document.getElementById('changeAdminPassMsg');
  msg.style.color = '#b91c1c';

  if (!oldPass || !newPass || !newPass2) { msg.textContent = '⚠️ يرجى تعبئة جميع الحقول';
    return; }
  if (!root.superAdminPasswordHash) { msg.textContent = '⚠️ لم يتم ضبط كلمة سر بعد — استخدم شاشة الإعداد الأولي';
    return; }
  const oldHash = await sha256Hex(oldPass);
  if (oldHash !== root.superAdminPasswordHash) { msg.textContent = '❌ كلمة السر الحالية غير صحيحة';
    return; }
  if (newPass.length < 8) { msg.textContent = '⚠️ كلمة السر الجديدة يجب ألا تقل عن 8 خانات';
    return; }
  if (newPass !== newPass2) { msg.textContent = '❌ كلمة السر الجديدة غير متطابقة في الحقلين';
    return; }

  root.superAdminPasswordHash = await sha256Hex(newPass);
  saveRootDB(root);
  document.getElementById('changeAdminOldPass').value = '';
  document.getElementById('changeAdminNewPass').value = '';
  document.getElementById('changeAdminNewPass2').value = '';
  msg.style.color = '#0b5e42';
  msg.textContent = '✅ تم تغيير كلمة سر رئيس الكنترول بنجاح. استخدم كلمة السر الجديدة عند الدخول القادم.';

 } catch (e) {
   console.error('changeAdminPassword failed:', e);
   alert('⚠️ حدث خطأ أثناء تغيير كلمة السر.\n' + (e && e.message ? e.message : e));
 }
}

async function submitTeacherAuth() {
  const val = document.getElementById('teacherLoginSelect').value;
  const pin = document.getElementById('teacherPinInput').value.trim();
  const msg = document.getElementById('teacherAuthMsg');
  if (!val) { msg.textContent = '⚠️ يرجى اختيار اسمك'; return; }
  const throttle = checkAuthThrottle('teacher:' + val);
  if (throttle.blocked) { msg.textContent = formatWaitMessage(throttle.waitMs, throttle.attempts); return; }
  const [stageId, teacherId] = val.split('::');
  const root = getRootDB();
  const stage = root.stages.find(s => s.id === stageId);
  const teacher = stage && (stage.data.teachers || []).find(t => t.id === teacherId);
  if (!teacher) { msg.textContent = '❌ بيانات الدخول غير صحيحة'; return; }

  // محاولة سحابية إن وُجد حساب للمعلم
  if (pin && cloudAvailable) {
    const emails = [teacherCloudEmail(teacherId)];
    if (teacher.cloudEmail) emails.unshift(String(teacher.cloudEmail).trim().toLowerCase());
    for (const em of emails) {
      const tryPass = (typeof cloudPasswordCandidates === 'function')
        ? await cloudPasswordCandidates(pin)
        : [pin, pinToCloudPassword(pin)];
      for (const pw of tryPass) {
        const result = await cloudSignIn(em, pw);
        if (!result.error && result.profile && result.profile.role === 'teacher') {
          clearAuthFailState('teacher:' + val);
          if (isOnline) { try { await pullAllStagesFromCloud(); } catch (e) {} }
          // ربط المرحلة المختارة إن لم تكن في profile
          if (!result.profile.stage_ids || !result.profile.stage_ids.length) {
            result.profile.stage_ids = [stageId];
          }
          if (!result.profile.teacher_id) result.profile.teacher_id = teacherId;
          applyCloudProfileLogin(result.profile);
          // تأكيد المرحلة/المعلم المختارين من الواجهة
          currentStageId = stageId;
          currentTeacher = teacher;
          return;
        }
        if (result.error) { try { await cloudSignOut(); } catch (e) {} }
      }
    }
  }

  const hash = await sha256Hex(pin);
  if (hash !== teacher.pinHash) {
    const fail = registerAuthFailure('teacher:' + val);
    msg.textContent = '❌ بيانات الدخول غير صحيحة. ' + (fail.attempts >= 3 ? formatWaitMessage(fail.waitMs, fail.attempts) : '');
    return;
  }
  clearAuthFailState('teacher:' + val);
  currentAccountType = 'teacher';
  currentRole = 'teacher';
  currentStageId = stageId;
  currentTeacher = teacher;
  currentStageAdmin = null;
  saveSession({ accountType: 'teacher', stageId, teacherId: teacher.id });
  try { recordAudit('تسجيل الدخول', 'دخول معلم: ' + (teacher.name || val)); } catch (e) {}
  document.getElementById('authOverlay').style.display = 'none'; document.body.classList.remove('auth-open');
  applyRoleUI();
  Promise.resolve(enforceSystemClosureGateAsync()).catch(() => enforceSystemClosureGate());
}

async function submitStageAdminAuth() {
  const root = getRootDB();
  const id = document.getElementById('stageAdminLoginSelect').value;
  const pin = document.getElementById('stageAdminPinInput').value.trim();
  const msg = document.getElementById('stageAdminAuthMsg');
  if (!id) { msg.textContent = '⚠️ يرجى اختيار اسمك'; return; }
  const throttle = checkAuthThrottle('stageadmin:' + id);
  if (throttle.blocked) { msg.textContent = formatWaitMessage(throttle.waitMs, throttle.attempts); return; }
  const admin = root.stageAdmins.find(a => a.id === id);
  if (!admin) { msg.textContent = '❌ بيانات الدخول غير صحيحة'; return; }

  if (pin && cloudAvailable) {
    const emails = [stageAdminCloudEmail(id)];
    if (admin.cloudEmail) emails.unshift(String(admin.cloudEmail).trim().toLowerCase());
    for (const em of emails) {
      const tryPass = (typeof cloudPasswordCandidates === 'function')
        ? await cloudPasswordCandidates(pin)
        : [pin, pinToCloudPassword(pin)];
      for (const pw of tryPass) {
        const result = await cloudSignIn(em, pw);
        if (!result.error && result.profile && result.profile.role === 'stageadmin') {
          clearAuthFailState('stageadmin:' + id);
          if (isOnline) { try { await pullAllStagesFromCloud(); } catch (e) {} }
          if (!result.profile.stage_ids || !result.profile.stage_ids.length) {
            result.profile.stage_ids = admin.stageIds || [];
          }
          applyCloudProfileLogin(result.profile);
          return;
        }
        if (result.error) { try { await cloudSignOut(); } catch (e) {} }
      }
    }
  }

  const hash = await sha256Hex(pin);
  if (hash !== admin.pinHash) {
    const fail = registerAuthFailure('stageadmin:' + id);
    msg.textContent = '❌ بيانات الدخول غير صحيحة. ' + (fail.attempts >= 3 ? formatWaitMessage(fail.waitMs, fail.attempts) : '');
    return;
  }
  const validStageIds = (admin.stageIds || []).filter(sid => root.stages.some(s => s.id === sid));
  if (!validStageIds.length) { msg.textContent = '❌ لا توجد مرحلة صالحة مرتبطة بحسابك. تواصل مع رئيس الكنترول.'; return; }
  clearAuthFailState('stageadmin:' + id);
  currentAccountType = 'stageadmin';
  currentRole = 'admin';
  currentTeacher = null;
  currentStageAdmin = admin;
  currentStageId = validStageIds[0];
  saveSession({ accountType: 'stageadmin', stageId: currentStageId, stageAdminId: admin.id });
  try { recordAudit('تسجيل الدخول', 'دخول مسؤول حاسب: ' + (admin.name || id)); } catch (e) {}
  document.getElementById('authOverlay').style.display = 'none'; document.body.classList.remove('auth-open');
  applyRoleUI();
  Promise.resolve(enforceSystemClosureGateAsync()).catch(() => enforceSystemClosureGate());
}


function getSystemClosure() {
  const root = getRootDB();
  const c = root.systemClosure || {};
  return {
    enabled: !!c.enabled,
    message: String(c.message || '').trim() || 'النظام مغلق مؤقتاً بقرار من رئيس الكنترول.',
    updatedAt: c.updatedAt || null,
    updatedBy: c.updatedBy || ''
  };
}

function setSystemClosurePreset(msg) {
  const el = document.getElementById('systemClosureMessage');
  if (el) el.value = msg || '';
}

function updateSystemClosureBadge() {
  const badge = document.getElementById('systemClosureStatusBadge');
  if (!badge) return;
  const c = getSystemClosure();
  if (c.enabled) {
    badge.textContent = 'الحالة: مغلق 🔒';
    badge.style.background = '#b91c1c';
    badge.style.color = '#fff';
  } else {
    badge.textContent = 'الحالة: مفتوح 🔓';
    badge.style.background = '#0b5e42';
    badge.style.color = '#fff';
  }
}

function loadSystemClosureUI() {
  const isSuper = currentAccountType === 'superadmin';
  const panel = document.getElementById('systemClosurePanel');
  const card = document.getElementById('systemClosureCard');
  if (panel) panel.style.display = isSuper ? 'block' : 'none';
  if (card) card.style.display = isSuper ? 'block' : 'none';
  if (!isSuper) return;
  const c = getSystemClosure();
  const en = document.getElementById('systemClosureEnabled');
  const msg = document.getElementById('systemClosureMessage');
  if (en) en.checked = !!c.enabled;
  if (msg) msg.value = c.message || '';
  updateSystemClosureBadge();
}

function openSystemNow() {
  const en = document.getElementById('systemClosureEnabled');
  if (en) en.checked = false;
  saveSystemClosure();
}

function saveSystemClosure() {
  try {
    if (currentAccountType !== 'superadmin') {
      alert('هذه الميزة لرئيس الكنترول فقط.');
      return;
    }
    const root = getRootDB();
    if (!root) {
      alert('تعذّر الوصول لقاعدة البيانات المحلية.');
      return;
    }
    const enEl = document.getElementById('systemClosureEnabled');
    const msgEl = document.getElementById('systemClosureMessage');
    const status = document.getElementById('systemClosureMsg');
    const enabled = !!(enEl && enEl.checked);
    const message = String((msgEl && msgEl.value) || '').trim();
    if (enabled && !message) {
      if (status) { status.style.color = '#b91c1c'; status.textContent = '⚠️ اكتب رسالة تظهر للمستخدمين عند الإغلاق.'; }
      else alert('اكتب رسالة تظهر للمستخدمين عند الإغلاق.');
      return;
    }
    root.systemClosure = {
      enabled: enabled,
      message: message || 'النظام مغلق مؤقتاً بقرار من رئيس الكنترول.',
      updatedAt: new Date().toISOString(),
      updatedBy: 'رئيس الكنترول'
    };
    saveRootDB(root);
    updateSystemClosureBadge();
    if (status) {
      status.style.color = '#334155';
      status.textContent = '⏳ تم الحفظ محلياً — جارٍ المزامنة مع السحابة...';
    }
    Promise.resolve(pushSystemClosureToCloud())
      .then(function(r) {
        if (status) {
          if (r && r.ok) {
            status.style.color = '#0b5e42';
            status.textContent = enabled
              ? '✅ تم تفعيل الإغلاق العام ومزامنته مع السحابة.'
              : '✅ تم فتح النظام ومزامنته مع السحابة.';
          } else {
            status.style.color = '#b45309';
            status.textContent = '⚠️ حُفظ محلياً لكن فشلت مزامنة السحابة' +
              (r && r.reason ? (': ' + r.reason) : '') +
              ' — أعد المحاولة بعد التأكد من الاتصال.';
          }
        }
        try { scheduleCloudPush(); } catch (e1) {}
      })
      .catch(function(err) {
        if (status) {
          status.style.color = '#b45309';
          status.textContent = '⚠️ حُفظ محلياً. خطأ مزامنة: ' + (err && err.message ? err.message : String(err));
        }
      });
    try { recordAudit(enabled ? 'إغلاق عام للنظام' : 'فتح النظام', message || ''); } catch (e2) {}
    hideSystemClosedScreen();
    loadSystemClosureUI();
  } catch (err) {
    console.error('saveSystemClosure', err);
    alert('فشل حفظ الإغلاق: ' + (err && err.message ? err.message : String(err)));
  }
}

GSP.saveSystemClosure = saveSystemClosure;
GSP.openSystemNow = openSystemNow;
GSP.setSystemClosurePreset = setSystemClosurePreset;
GSP.loadSystemClosureUI = loadSystemClosureUI;

function showSystemClosedScreen(message, metaText) {
  const overlay = document.getElementById('systemClosedOverlay');
  const msgEl = document.getElementById('systemClosedMessage');
  const metaEl = document.getElementById('systemClosedMeta');
  if (msgEl) msgEl.textContent = message || 'النظام مغلق مؤقتاً.';
  if (metaEl) metaEl.textContent = metaText || '';
  if (overlay) {
    overlay.classList.add('is-visible');
    overlay.style.display = 'flex';
  }
  try {
    document.body.classList.add('system-closed-active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const bar = document.getElementById('tabBar');
    if (bar) { bar.style.visibility = 'hidden'; bar.style.display = 'none'; }
    const acc = document.querySelector('.account-bar');
    if (acc) acc.style.display = 'none';
  } catch (e) {}
}

function hideSystemClosedScreen() {
  const overlay = document.getElementById('systemClosedOverlay');
  if (overlay) {
    overlay.classList.remove('is-visible');
    overlay.style.display = 'none';
  }
  try {
    document.body.classList.remove('system-closed-active');
    const bar = document.getElementById('tabBar');
    if (bar) { bar.style.visibility = ''; bar.style.display = ''; }
    const acc = document.querySelector('.account-bar');
    if (acc) acc.style.display = '';
    // إن لم يكن أي تبويب نشطاً بعد الإخفاء، أعد تفعيل لوحة التحكم حتى لا تبقى الشاشة فارغة
    const anyActive = document.querySelector('.tab-content.active');
    if (!anyActive && typeof ensureTabActive === 'function') {
      ensureTabActive('dashboard');
    }
  } catch (e) {}
}

async function refreshSystemClosureFromCloud() {
  if (!cloudAvailable || !navigator.onLine) return;
  try {
    // يقرأ من الصف العام فقط (لا يحتوي هاش ولا بيانات حساسة)
    const publicId = (typeof GSP !== 'undefined' && GSP.ROOT_PUBLIC_ID) ? GSP.ROOT_PUBLIC_ID : 'root_public';
    let row = await cloudFetchRow(publicId);
    // توافق عكسي: إن لم يوجد root_public بعد، جرّب root_meta القديم
    if (!row || !row.data) {
      row = await cloudFetchRow('root_meta');
    }
    if (row && row.data && row.data.systemClosure) {
      const root = getRootDB();
      root.systemClosure = row.data.systemClosure;
      persistRootDB(root);
    }
  } catch (e) { console.warn('refreshSystemClosureFromCloud', e); }
}

async function pushSystemClosureToCloud() {
  if (!cloudAvailable || !navigator.onLine) return { ok: false, reason: 'offline' };
  try {
    const root = getRootDB();
    const now = new Date().toISOString();
    root.lastUpdated = now;
    const publicId = (typeof GSP !== 'undefined' && GSP.ROOT_PUBLIC_ID) ? GSP.ROOT_PUBLIC_ID : 'root_public';
    const buildPublic = (typeof buildRootPublic === 'function')
      ? buildRootPublic
      : (typeof GSP !== 'undefined' && typeof GSP.buildRootPublic === 'function')
        ? GSP.buildRootPublic
        : null;
    // نرفع الصف العام فقط — لا نلمس root_secure ولا نرسل الهاش
    const payload = buildPublic
      ? buildPublic(root)
      : {
          stages: (root.stages || []).map(({ id, name, section }) => ({ id, name, section })),
          systemClosure: root.systemClosure || { enabled: false, message: '', updatedAt: null },
          lastUpdated: now
        };
    const { error } = await supabaseClient.from('grade_system_state').upsert([
      { id: publicId, data: payload, updated_at: now }
    ]);
    if (error) return { ok: false, reason: error.message };
    persistRootDB(root);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message || String(e) };
  }
}

/** بعد نجاح الدخول: يمنع غير المدير العام عند تفعيل الإغلاق العام */
function enforceSystemClosureGate() {
  if (!currentAccountType || currentAccountType === 'superadmin') {
    hideSystemClosedScreen();
    loadSystemClosureUI();
    return true;
  }
  const c = getSystemClosure();
  if (!c.enabled) {
    hideSystemClosedScreen();
    return true;
  }
  let meta = '';
  if (c.updatedAt) {
    try { meta = 'آخر تحديث: ' + new Date(c.updatedAt).toLocaleString('ar-EG'); } catch (e) { meta = ''; }
  }
  showSystemClosedScreen(c.message, meta);
  return false;
}

async function enforceSystemClosureGateAsync() {
  try { await refreshSystemClosureFromCloud(); } catch (e) {}
  return enforceSystemClosureGate();
}

function loginAsSuperAdmin() {
 try {
  const root = getRootDB();
  currentAccountType = 'superadmin';
  currentRole = 'admin';
  currentTeacher = null;
  currentStageAdmin = null;
  currentStageMonitor = null;
  currentStageId = root.stages.length ? root.stages[0].id : null;
  saveSession({ accountType: 'superadmin', stageId: currentStageId });
  document.getElementById('authOverlay').style.display = 'none'; document.body.classList.remove('auth-open');
  applyRoleUI();
  enforceSystemClosureGate();

 } catch (e) {
   console.error('loginAsSuperAdmin failed:', e);
   alert('⚠️ حدث خطأ أثناء تسجيل دخول رئيس الكنترول.\n' + (e && e.message ? e.message : e));
 }
}

async function logout() {
  recordAudit('تسجيل الخروج','تم تسجيل خروج المستخدم');
  currentRole = null;
  currentAccountType = null;
  currentTeacher = null;
  currentStageAdmin = null;
  currentStageMonitor = null;
  currentStageId = null;
  currentCloudProfile = null;
  clearSession();
  try { await cloudSignOut(); } catch (e) {}
  try { updateSecurityPanelsForRole(); } catch (e) {}
  hideSystemClosedScreen();
  document.getElementById('authOverlay').style.display = 'flex'; document.body.classList.add('auth-open');
  showAuthMode('admin');
}



// window exports
GSP.showAuthMode = showAuthMode;
GSP.populateTeacherLoginStageSelect = populateTeacherLoginStageSelect;
GSP.onTeacherLoginStageChange = onTeacherLoginStageChange;
GSP.populateStageAdminLoginSelect = populateStageAdminLoginSelect;
GSP.populateMonitorLoginSelect = populateMonitorLoginSelect;
GSP.submitMonitorAuth = submitMonitorAuth;
GSP.needsAdminSetup = needsAdminSetup;
GSP.ensureSuperAdminPasswordHash = ensureSuperAdminPasswordHash;
GSP.submitAdminSetup = submitAdminSetup;
GSP.submitAdminAuth = submitAdminAuth;
GSP.changeAdminPassword = changeAdminPassword;
GSP.submitTeacherAuth = submitTeacherAuth;
GSP.submitStageAdminAuth = submitStageAdminAuth;
GSP.getSystemClosure = getSystemClosure;
GSP.setSystemClosurePreset = setSystemClosurePreset;
GSP.updateSystemClosureBadge = updateSystemClosureBadge;
GSP.loadSystemClosureUI = loadSystemClosureUI;
GSP.openSystemNow = openSystemNow;
GSP.saveSystemClosure = saveSystemClosure;
GSP.showSystemClosedScreen = showSystemClosedScreen;
GSP.hideSystemClosedScreen = hideSystemClosedScreen;
GSP.refreshSystemClosureFromCloud = refreshSystemClosureFromCloud;
GSP.pushSystemClosureToCloud = pushSystemClosureToCloud;
GSP.enforceSystemClosureGate = enforceSystemClosureGate;
GSP.enforceSystemClosureGateAsync = enforceSystemClosureGateAsync;
GSP.loginAsSuperAdmin = loginAsSuperAdmin;
GSP.logout = logout;
