/** auth/cloud-auth.js — بريد سحابي، دخول، provision */
'use strict';

// ========== Supabase Auth ==========
var currentCloudProfile = null;
const CLOUD_LOGIN_DOMAIN = 'school.internal';

function teacherCloudEmail(teacherId) {
  return 't_' + String(teacherId).replace(/[^a-zA-Z0-9_-]/g, '_') + '@' + CLOUD_LOGIN_DOMAIN;
}
function stageAdminCloudEmail(adminId) {
  return 'sa_' + String(adminId).replace(/[^a-zA-Z0-9_-]/g, '_') + '@' + CLOUD_LOGIN_DOMAIN;
}
function stageMonitorCloudEmail(monitorId) {
  return 'mon_' + String(monitorId).replace(/[^a-zA-Z0-9_-]/g, '_') + '@' + CLOUD_LOGIN_DOMAIN;
}
// v2: FNV-like (حسابات قديمة). v3: SHA-256. الدخول يجرب المرشّحين جميعاً للتوافق.
function pinToCloudPasswordV2(pin) {
  const p = String(pin || '');
  if (p.length >= 12) return p;
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  const salt = 'GradeSystemPro::cloud-pw::v2::';
  const s = salt + p + '::' + p.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (h1 ^ c); h1 = Math.imul(h1, 0x01000193);
    h2 = (h2 + c * (i + 7)) >>> 0; h2 = Math.imul(h2, 0x85ebca6b);
  }
  const hex = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  return 'Gs_' + hex + '_' + p.length;
}

function pinToCloudPassword(pin) {
  return pinToCloudPasswordV2(pin);
}

async function pinToCloudPasswordAsync(pin) {
  const p = String(pin || '');
  if (p.length >= 12) return p;
  if (typeof sha256Hex === 'function') {
    const digest = await sha256Hex('GradeSystemPro::cloud-pw::v3::' + p + '::' + p.length);
    return 'Gs3_' + digest.slice(0, 32) + '_' + p.length;
  }
  return pinToCloudPasswordV2(p);
}

async function cloudPasswordCandidates(pin) {
  const p = String(pin || '');
  const list = [p];
  try { list.push(await pinToCloudPasswordAsync(p)); } catch (e) {}
  try { list.push(pinToCloudPasswordV2(p)); } catch (e) {}
  return Array.from(new Set(list.filter(Boolean)));
}

/**
 * يستدعي Edge Function "clever-responder" لإنشاء/تحديث حساب Auth + profiles
 * للمعلم أو مدير المرحلة تلقائياً دون فتح لوحة Supabase.
 * يشترط جلسة سحابية للمدير العام (أو مدير مرحلة للمعلمين داخل مراحله).
 */
async function provisionCloudAccount(opts) {
  if (!supabaseClient || !cloudAvailable) {
    return { skipped: true, error: 'لا يوجد اتصال سحابي' };
  }
  try {
    const { data: sessData } = await supabaseClient.auth.getSession();
    const token = sessData?.session?.access_token;
    if (!token) {
      return {
        skipped: true,
        error: 'لتفعيل الحساب السحابي تلقائياً: سجّل دخول المدير العام بالبريد السحابي أولاً (ليس الرقم السري المحلي فقط).'
      };
    }
    const res = await fetch(SUPABASE_URL + '/functions/v1/clever-responder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        apikey: SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        action: opts.action || 'upsert',
        role: opts.role,
        localId: opts.localId,
        fullName: opts.fullName || '',
        pin: opts.pin || '',
        stageIds: opts.stageIds || [],
        sections: opts.sections || [],
        teacherId: opts.teacherId || null,
        emailOverride: opts.emailOverride || null
      })
    });
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    if (!res.ok) {
      return { error: (body && body.error) || ('HTTP ' + res.status), status: res.status, body };
    }
    return body || { ok: true };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

function formatCloudProvisionNote(result, kindLabel) {
  if (!result) return '';
  if (result.skipped) {
    return '<div style="margin-top:8px;font-size:12.5px;color:#92400e;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;">⚠️ الحساب المحلي جاهز، لكن لم يُنشأ حساب سحابي: ' +
      (result.error || '') + '</div>';
  }
  if (result.error) {
    return '<div style="margin-top:8px;font-size:12.5px;color:#991b1b;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:8px 12px;">❌ تعذّر إنشاء/تحديث الحساب السحابي لـ' +
      kindLabel + ': ' + result.error +
      '<br><span style="color:#64748b">يمكنك إضافته لاحقاً يدوياً أو إعادة توليد الرقم السري بعد نشر Edge Function.</span></div>';
  }
  if (result.ok) {
    return '<div style="margin-top:8px;font-size:12.5px;color:#166534;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:8px 12px;">☁️ الحساب السحابي ' +
      (result.created ? 'أُنشئ' : 'حُدّث') + ' بنجاح' +
      (result.email ? ' — <code dir="ltr">' + result.email + '</code>' : '') + '</div>';
  }
  return '';
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => { if (settled) return; settled = true; resolve({ __timeout: true, error: (label || 'العملية') + ' تجاوزت الوقت' }); }, ms);
    Promise.resolve(promise).then(
      v => { if (settled) return; settled = true; clearTimeout(t); resolve(v); },
      e => { if (settled) return; settled = true; clearTimeout(t); resolve({ error: (e && e.message) || String(e) }); }
    );
  });
}
async function cloudSignIn(email, password) {
  if (!supabaseClient) return { error: 'لا يوجد اتصال سحابي' };
  try {
    const signRes = await withTimeout(supabaseClient.auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password: String(password || '')
    }), 10000, 'تسجيل الدخول السحابي');
    if (signRes && signRes.__timeout) return { error: signRes.error, timeout: true };
    const data = signRes && signRes.data, error = signRes && signRes.error;
    if (error) return { error: error.message || 'فشل تسجيل الدخول' };
    if (!data || !data.user) return { error: 'فشل تسجيل الدخول السحابي' };
    const profRes = await withTimeout(supabaseClient.from('profiles').select('*').eq('id', data.user.id).maybeSingle(), 8000, 'الملف');
    if (profRes && profRes.__timeout) { try { await supabaseClient.auth.signOut(); } catch (e) {} return { error: profRes.error, timeout: true }; }
    const profile = profRes && profRes.data, pErr = profRes && profRes.error;
    if (pErr) return { error: pErr.message || pErr };
    if (!profile || profile.is_active === false) { try { await supabaseClient.auth.signOut(); } catch (e) {} return { error: 'الحساب غير مفعّل' }; }
    currentCloudProfile = profile;
    return { user: data.user, profile, session: data.session };
  } catch (e) { return { error: (e && e.message) || 'تعذّر الاتصال' }; }
}

async function cloudSignOut() {
  currentCloudProfile = null;
  if (supabaseClient) { try { await supabaseClient.auth.signOut(); } catch (e) {} }
}

async function restoreCloudSession() {
  if (!supabaseClient) return null;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user || !session.user.id) return null;

    const profRes = await withTimeout(
      supabaseClient.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
      8000,
      'استعادة الملف السحابي'
    );
    if (profRes && profRes.__timeout) {
      console.warn('cloud profile restore timeout');
      return null;
    }
    const profile = profRes && profRes.data;
    if (profRes && profRes.error) {
      console.warn('cloud profile restore failed:', profRes.error);
      return null;
    }
    if (!profile || profile.is_active === false) {
      await cloudSignOut();
      return null;
    }
    if (!['superadmin', 'stageadmin', 'monitor', 'teacher'].includes(profile.role)) {
      await cloudSignOut();
      return null;
    }
    currentCloudProfile = profile;
    return { user: session.user, profile, session };
  } catch (e) { console.warn(e); return null; }
}

function applyCloudProfileLogin(profile) {
  const root = getRootDB();
  if (profile.role === 'superadmin') {
    currentAccountType = 'superadmin'; currentRole = 'admin';
    currentTeacher = null; currentStageAdmin = null;
    currentStageId = (root.stages && root.stages[0]) ? root.stages[0].id : null;
    saveSession({ accountType: 'superadmin', stageId: currentStageId, cloudAuth: true, profileId: profile.id });
  } else if (profile.role === 'stageadmin') {
    currentAccountType = 'stageadmin'; currentRole = 'admin'; currentTeacher = null;
    const stageIds = profile.stage_ids || [];
    currentStageAdmin = { id: profile.id, name: profile.full_name, stageIds, sections: profile.sections || [] };
    currentStageId = stageIds.find(id => (root.stages || []).some(s => s.id === id)) || stageIds[0] || null;
    saveSession({ accountType: 'stageadmin', stageId: currentStageId, stageAdminId: profile.id, cloudAuth: true, profileId: profile.id });
  } else if (profile.role === 'teacher') {
    currentAccountType = 'teacher'; currentRole = 'teacher'; currentStageAdmin = null;
    const stageIds = profile.stage_ids || [];
    currentStageId = stageIds[0] || null;
    let teacher = null;
    if (currentStageId && profile.teacher_id) {
      const stage = (root.stages || []).find(s => s.id === currentStageId);
      teacher = stage && (stage.data.teachers || []).find(t => t.id === profile.teacher_id);
    }
    currentTeacher = teacher || { id: profile.teacher_id || profile.id, name: profile.full_name, assignments: [] };
    saveSession({ accountType: 'teacher', stageId: currentStageId, teacherId: currentTeacher.id, cloudAuth: true, profileId: profile.id });
  } else return false;
  document.getElementById('authOverlay').style.display = 'none'; document.body.classList.remove('auth-open');
  applyRoleUI();
  recordAudit('تسجيل الدخول', 'دخول سحابي: ' + (profile.full_name || profile.role));
  Promise.resolve(enforceSystemClosureGateAsync()).catch(() => enforceSystemClosureGate());
  return true;
}


// window exports
GSP.teacherCloudEmail = teacherCloudEmail;
GSP.stageAdminCloudEmail = stageAdminCloudEmail;
GSP.stageMonitorCloudEmail = stageMonitorCloudEmail;
GSP.pinToCloudPassword = pinToCloudPassword;
GSP.pinToCloudPasswordV2 = pinToCloudPasswordV2;
GSP.pinToCloudPasswordAsync = pinToCloudPasswordAsync;
GSP.cloudPasswordCandidates = cloudPasswordCandidates;
GSP.provisionCloudAccount = provisionCloudAccount;
GSP.formatCloudProvisionNote = formatCloudProvisionNote;
GSP.withTimeout = withTimeout;
GSP.cloudSignIn = cloudSignIn;
GSP.cloudSignOut = cloudSignOut;
GSP.restoreCloudSession = restoreCloudSession;
GSP.applyCloudProfileLogin = applyCloudProfileLogin;

GSP.currentCloudProfile = currentCloudProfile;
GSP.CLOUD_LOGIN_DOMAIN = typeof CLOUD_LOGIN_DOMAIN !== 'undefined' ? CLOUD_LOGIN_DOMAIN : 'school.internal';
try {
  Object.defineProperty(window, 'currentCloudProfile', {
    get: function(){ return currentCloudProfile; },
    set: function(v){ currentCloudProfile = v; },
    configurable: true
  });
} catch (e) {
  // Already defined (e.g. script evaluated twice) — keep existing descriptor
  window.currentCloudProfile = currentCloudProfile;
}
