/** features/cloud-sync.js */
'use strict';

// ============================================================
//  CLOUD SYNC (Supabase) — يعمل النظام محلياً دائماً أولاً (localStorage) لضمان السرعة والعمل
//  بدون إنترنت بالكامل، ثم يزامن أي تغيير مع Supabase في الخلفية عند توفر الاتصال، ويسحب أحدث
//  نسخة من السحابة عند فتح التطبيق وكل فترة قصيرة أثناء الاستخدام، ليتمكن مدير النظام ومديرو
//  المراحل والمعلمون من العمل من أي جهاز متصل بالإنترنت وتظل بياناتهم متزامنة فيما بينهم.
//  ⚠️ ملاحظة أمان مهمة: هذه المزامنة "أحدث نسخة تفوز" (last write wins) على مستوى قاعدة البيانات
//  كاملة، وليست دمجاً حقلاً بحقل. إن قام شخصان بحفظ تعديلين مختلفين في نفس اللحظة تقريباً، فإن آخر
//  عملية حفظ تصل للسحابة هي التي تبقى. هذا مناسب للاستخدام المعتاد (معلم يدخل درجاته، ثم آخر بعده)
//  لكن لا يصلح كنظام تعاون لحظي حقيقي لعدة أشخاص يعدّلون نفس السجل بالضبط في نفس الثانية.
// ============================================================
// → auth/supabase-config.js

// → auth/cloud-auth.js

var isOnline = navigator.onLine;
var cloudSyncTimer = null;
var cloudPushInFlight = false;
var cloudPushPending = false;

function getCloudSyncService() {
  try {
    const port = GSP.application && GSP.application.ports && GSP.application.ports.cloudSync;
    if (port && typeof port.resolve === 'function') return port.resolve();
  } catch (e) {}
  return null;
}
function getCloudSyncGateway() {
  const service = getCloudSyncService();
  return service || null;
}

function getSyncStatusService() {
  try { return GSP.application && GSP.application.services && GSP.application.services.syncStatus || null; } catch (e) { return null; }
}
function getSyncQueueService() {
  try { return GSP.application && GSP.application.services && GSP.application.services.syncQueue || null; } catch (e) { return null; }
}
function getSyncReliabilityService() {
  try {
    const service = getCloudSyncService();
    return service && service.reliability ? service.reliability : null;
  } catch (e) { return null; }
}
function updateSyncPendingStatus() {
  const service = getCloudSyncService();
  const status = getSyncStatusService();
  const queue = getSyncQueueService();
  try {
    const st = status && typeof status.get === 'function' ? status.get() : (service && typeof service.status === 'function' ? service.status() : null);
    const badge = document.getElementById('connStatusBadge');
    if (!badge || !st) return;
    const pending = Number(st.pending || (queue ? queue.ids().length : 0));
    const failed = Number(st.failed || (queue && typeof queue.failedCount === 'function' ? queue.failedCount() : 0));
    const last = st.lastSuccessAt ? new Date(st.lastSuccessAt).toLocaleTimeString('ar-EG') : 'لا توجد';
    badge.title = 'المزامنة: معلّق ' + pending + ' | فاشل ' + failed + ' | آخر مزامنة ناجحة: ' + last;
    badge.setAttribute('data-sync-pending', String(pending));
    badge.setAttribute('data-sync-failed', String(failed));
    badge.setAttribute('aria-label', badge.title);
  } catch (e) {}
}


let cloudSessionState = { checked: false, authenticated: false, email: '', reason: '' };
let cloudSessionCheckPromise = null;

async function ensureCloudSession(options = {}) {
  if (!cloudAvailable) {
    cloudSessionState = { checked: true, authenticated: false, email: '', reason: 'cloud-unavailable' };
    return false;
  }
  if (!isOnline) {
    cloudSessionState = { checked: true, authenticated: false, email: '', reason: 'offline' };
    return false;
  }
  if (cloudSessionState.authenticated && !options.force) return true;
  if (cloudSessionCheckPromise && !options.force) return cloudSessionCheckPromise;
  cloudSessionCheckPromise = (async () => {
    try {
      const client = GSP.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
      if (!client || !client.auth || typeof client.auth.getSession !== 'function') {
        cloudSessionState = { checked: true, authenticated: false, email: '', reason: 'auth-client-unavailable' };
        return false;
      }
      const result = await client.auth.getSession();
      const session = result && result.data && result.data.session;
      const authenticated = !!(session && session.access_token && session.user);
      cloudSessionState = {
        checked: true,
        authenticated,
        email: authenticated ? (session.user.email || '') : '',
        reason: authenticated ? '' : 'not-authenticated'
      };
      return authenticated;
    } catch (e) {
      cloudSessionState = { checked: true, authenticated: false, email: '', reason: e && e.message ? e.message : String(e) };
      return false;
    } finally {
      cloudSessionCheckPromise = null;
    }
  })();
  return cloudSessionCheckPromise;
}

function setConnBadge(text, kind) {
  const badge = document.getElementById('connStatusBadge');
  if (!badge) return;
  if (!cloudAvailable) {
    badge.textContent = '⚪ وضع محلي فقط — عميل Supabase غير متاح';
    badge.style.background = '#64748b';
    return;
  }
  if (!isOnline) {
    badge.textContent = '🔴 غير متصل بالإنترنت — يعمل النظام محلياً حالياً';
    badge.style.background = '#b91c1c';
    return;
  }
  if (cloudSessionState.checked && !cloudSessionState.authenticated) {
    badge.textContent = '🟠 الإنترنت متاح — يلزم تسجيل الدخول السحابي للمزامنة';
    badge.style.background = '#c2410c';
    return;
  }
  if (kind === 'syncing') { badge.textContent = '🔄 جارٍ المزامنة مع السحابة...';
    badge.style.background = '#1e3a5f'; return; }
  if (kind === 'error') { badge.textContent = '🟠 متصل — لكن حدث خطأ أثناء آخر مزامنة، سيُعاد المحاولة';
    badge.style.background = '#c2410c'; return; }
  badge.textContent = '🟢 متصل بالإنترنت' + (text ? ' — ' + text : ' — البيانات متزامنة');
  badge.style.background = '#0b5e42';
}

function updateOnlineStatus() {
  isOnline = !!navigator.onLine;
  const status = getSyncStatusService();
  const queue = getSyncQueueService();
  const reliability = getSyncReliabilityService();
  if (!isOnline) {
    if (reliability) reliability.markOffline();
    else if (status) status.markOffline(queue ? queue.ids().length : 0);
    setConnBadge();
  } else {
    if (reliability) reliability.markOnline();
    else if (status && typeof status.markOnline === 'function') status.markOnline(queue ? queue.ids().length : 0, queue && queue.failedCount ? queue.failedCount() : 0);
    setConnBadge();
    ensureCloudSession().then(authenticated => {
      if (!authenticated) { updateSyncPendingStatus(); return; }
      if (cloudPushPending || (queue && queue.ids().length)) {
        if (reliability) reliability.retryNow(() => scheduleCloudPush());
        else scheduleCloudPush();
      }
      pullFromCloud(true);
    });
  }
  updateSyncPendingStatus();
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ─────────────────────────────────────────────────────────────────────────
//  مزامنة محسَّنة: كل مرحلة بصف مستقل بدل صف واحد للكل
//  root_public  ← بيانات عامة قابلة للقراءة لأي مصادق (stages + systemClosure)
//  root_secure  ← بيانات حساسة لـ superadmin فقط (hash + stageAdmins + stageMonitors)
//  root_meta    ← الصيغة القديمة (مختلطة) — قراءة فقط للترحيل التلقائي
//  stage_<id>   ← بيانات مرحلة واحدة فقط (~8 MB بدل 143 MB لكل push)
//  الصيغة القديمة (صف 'main') مدعومة للقراءة فقط للترحيل التلقائي.
// ─────────────────────────────────────────────────────────────────────────

const ROOT_PUBLIC_ID = 'root_public';
const ROOT_SECURE_ID = 'root_secure';
const ROOT_META_LEGACY_ID = 'root_meta';

/** بيانات عامة: قائمة المراحل + إغلاق النظام — أي مصادق يقدر يقرأها */
function buildRootPublic(root) {
  return {
    stages: (root.stages || []).map(({ id, name, section }) => ({ id, name, section })),
    systemClosure: root.systemClosure || { enabled: false, message: '', updatedAt: null },
    lastUpdated: root.lastUpdated || null
  };
}

/** بيانات حساسة: مديرو المراحل + المراقبون — superadmin فقط
 *  Step 48: لا نرفع superAdminPasswordHash للسحابة — الدخول الأساسي عبر Supabase Auth.
 *  الهاش يبقى محليًا فقط كطوارئ عند انقطاع الاتصال.
 */
function buildRootSecure(root) {
  // لا تُرفع أرقام سرية كنص صريح — الهاش فقط
  const cleanAdmins = (root.stageAdmins || []).map(a => {
    const c = Object.assign({}, a);
    delete c.pin;
    return c;
  });
  const cleanMonitors = (root.stageMonitors || []).map(a => {
    const c = Object.assign({}, a);
    delete c.pin;
    return c;
  });
  return {
    stageAdmins: cleanAdmins,
    stageMonitors: cleanMonitors,
    superAdminPasswordHash: null,
    lastUpdated: root.lastUpdated || null
  };
}

/** توافق عكسي: يبني الكائن المختلط القديم (للترحيل أو أدوات قديمة) */
function buildRootMeta(root) {
  return Object.assign({}, buildRootPublic(root), buildRootSecure(root));
}

/**
 * يدمج صفوف السحابة في الكائن المحلي.
 * يدعم: root_public + root_secure (الجديد) أو root_meta المختلط (القديم).
 */
function applyRemoteRootMeta(root, publicData, secureData, legacyData) {
  const src = legacyData || {};
  const pub = publicData || {};
  const sec = secureData || {};

  // stages + systemClosure من public أو legacy
  const stagesSrc = pub.stages || src.stages;
  if (stagesSrc) {
    stagesSrc.forEach(rs => {
      const local = root.stages.find(s => s.id === rs.id);
      if (local) {
        local.name = rs.name;
        if (rs.section !== undefined) local.section = rs.section;
      } else {
        root.stages.push({ id: rs.id, name: rs.name, section: rs.section, data: emptyStageData() });
      }
    });
  }
  if (pub.systemClosure) root.systemClosure = pub.systemClosure;
  else if (src.systemClosure) root.systemClosure = src.systemClosure;

  // الحساس من secure أو legacy (يتوفر فقط لـ superadmin بعد RLS)
  if (sec.stageAdmins) root.stageAdmins = sec.stageAdmins;
  else if (src.stageAdmins) root.stageAdmins = src.stageAdmins;
  if (sec.stageMonitors) root.stageMonitors = sec.stageMonitors;
  else if (src.stageMonitors) root.stageMonitors = src.stageMonitors;
  // Step 48: لا نستورد الهاش من السحابة (قد يكون null عمدًا). الإبقاء على الهاش المحلي للطوارئ فقط.
  // إن وُجد هاش قديم غير فارغ في legacy أثناء الترحيل فقط نملأ المحلي إن كان فارغًا.
  if (!root.superAdminPasswordHash && src.superAdminPasswordHash) {
    root.superAdminPasswordHash = src.superAdminPasswordHash;
  }

  const lu = pub.lastUpdated || sec.lastUpdated || src.lastUpdated;
  if (lu) root.lastUpdated = lu;
}

// يجلب صفاً واحداً من grade_system_state بمعرّفه
async function cloudFetchRow(rowId) {
  if (!cloudAvailable || !isOnline) return null;
  if (!(await ensureCloudSession())) {
    setConnBadge();
    return null;
  }
  try {
    const service = getCloudSyncGateway();
    if (!service) return null;
    const { data, error } = await service.fetchRow(rowId);
    if (error) { console.error('Supabase fetch error [' + rowId + ']:', error); return null; }
    return data;
  } catch (e) { console.error('Supabase fetch exception [' + rowId + ']:', e); return null; }
}

// ============================================================
//  V24: كشف تعارضات الدرجات (Conflict Detection) بدل الاعتماد الصامت على "آخر نسخة تفوز"
//  ------------------------------------------------------------
//  قبل حفظ أي درجات، وإن كان الجهاز متصلاً بالإنترنت، نجلب أحدث نسخة من بيانات المرحلة من
//  السحابة (وليس من الذاكرة المحلية فقط) ونقارن قيمة كل خانة على وشك الحفظ بما هو موجود فعلياً
//  على السحابة الآن. إن كانت القيمة السحابية تختلف عن القيمة التي بدأ منها المستخدم (أي أن شخصاً
//  آخر عدّلها من جهاز آخر بعد أن حمّل هذا المستخدم الصفحة) وتختلف أيضاً عن القيمة الجديدة المُدخلة
//  الآن، فهذا تعارض حقيقي على مستوى الخانة الواحدة (Field-level)، وليس مجرد استبدال أعمى للسجل
//  بالكامل. يُسجَّل كل تعارض في root.conflictLog (نفس فلسفة سجل المراجعة) ويُعرض على المستخدم
//  ليختار بوعي بدلاً من أن يختفي تعديل أحدهما بصمت.
// ============================================================
function getConflictStore() {
  const root = getRootDB();
  if (!Array.isArray(root.conflictLog)) root.conflictLog = [];
  return root.conflictLog;
}

function recordConflict(entry) {
  try {
    const root = getRootDB();
    if (!Array.isArray(root.conflictLog)) root.conflictLog = [];
    root.conflictLog.unshift(Object.assign({
      id: 'conflict_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      at: new Date().toISOString(),
      user: currentUserLabel(),
      stageId: currentStageId || ''
    }, entry));
    root.conflictLog = root.conflictLog.slice(0, 300);
    persistRootDB(root);
  } catch (e) { console.warn('Conflict log failed', e); }
}

function renderConflictLog() {
  const body = document.getElementById('conflictLogBody');
  if (!body) return;
  const rows = getConflictStore();
  if (!rows.length) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:16px">لا توجد تعارضات مسجّلة</td></tr>'; return; }
  const esc = (typeof escapeHtml === 'function')
    ? escapeHtml
    : (typeof escHtml === 'function' ? escHtml : function (s) {
        return String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      });
  body.innerHTML = rows.slice(0, 100).map(r => `
    <tr>
      <td>${new Date(r.at).toLocaleString('ar-EG')}</td>
      <td>${esc(r.user || '')}</td>
      <td>${esc(r.studentName || '')}</td>
      <td>${esc((r.subjectName||'') + (r.componentName ? ' / ' + r.componentName : ''))}</td>
      <td>${r.remoteScore === null || r.remoteScore === undefined ? '—' : r.remoteScore}</td>
      <td>${r.newScore === null || r.newScore === undefined ? '—' : r.newScore}</td>
      <td>${r.resolution === 'kept-mine' ? '✅ تم اعتماد قيمتي' : (r.resolution === 'took-remote' ? '☁️ تم أخذ قيمة السحابة' : '—')}</td>
    </tr>
  `).join('');
}

// يعرض نافذة مخصصة لتعارضات الدرجات (بدل confirm) ويُرجع Promise<boolean>
var _gradeConflictModalPending = null;
var _gradeConflictModalSettle = null;

function hideGradeConflictModal() {
  const overlay = document.getElementById('gradeConflictModalOverlay');
  if (!overlay) return;
  overlay.style.setProperty('display', 'none', 'important');
  overlay.classList.add('hidden');
  const keepBtn = document.getElementById('gradeConflictModalKeepMineBtn');
  const cancelBtn = document.getElementById('gradeConflictModalCancelBtn');
  if (keepBtn) keepBtn.disabled = false;
  if (cancelBtn) cancelBtn.disabled = false;
}

function showGradeConflictModal(conflicts, subjectName) {
  if (_gradeConflictModalPending) return _gradeConflictModalPending;

  _gradeConflictModalPending = new Promise(resolve => {
    const overlay = document.getElementById('gradeConflictModalOverlay');
    const body = document.getElementById('gradeConflictModalBody');
    const keepBtn = document.getElementById('gradeConflictModalKeepMineBtn');
    const cancelBtn = document.getElementById('gradeConflictModalCancelBtn');
    if (!overlay || !body || !keepBtn || !cancelBtn) {
      console.warn('showGradeConflictModal: elements missing — defaulting to keep-mine');
      _gradeConflictModalPending = null;
      _gradeConflictModalSettle = null;
      resolve(true);
      return;
    }

    // escapeHtml هو المصدر الوحيد؛ escHtml قد لا يكون عاماً
    const esc = (typeof escapeHtml === 'function')
      ? escapeHtml
      : (typeof escHtml === 'function' ? escHtml : function (s) {
          return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        });

    const list = Array.isArray(conflicts) ? conflicts : [];
    const rows = list.map(c => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${esc(c.studentName || '')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${esc(c.componentName || '')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#0b5e42;font-weight:700;">${c.newScore === null || c.newScore === undefined ? '—' : esc(String(c.newScore))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#b91c1c;font-weight:700;">${c.remoteScore === null || c.remoteScore === undefined ? 'غير مسجّلة' : esc(String(c.remoteScore))}</td>
      </tr>`).join('');

    body.innerHTML = `
      <p style="margin-bottom:10px;color:#0f172a;">تم تعديل <strong>${list.length}</strong> خانة من جهاز/مستخدم آخر بعد أن فتحت هذه الصفحة (المادة: <strong>${esc(subjectName || '')}</strong>).</p>
      <div style="max-height:280px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#0f172a;">
          <thead><tr>
            <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e2e8f0;">الطالب</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e2e8f0;">المكوّن</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e2e8f0;">قيمتك</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:1px solid #e2e8f0;">قيمة السحابة</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#64748b;">لا توجد تفاصيل إضافية</td></tr>'}</tbody>
        </table>
      </div>
      <p style="margin-top:12px;font-size:12px;color:#64748b;line-height:1.8;">اختر بوعي: «اعتماد قيمي» يستبدل قيم الطرف الآخر على السحابة. «اعتماد نسخة السحابة» يلغي حفظك الحالي ويعيد تحميل القيم الحديثة.</p>`;

    overlay.classList.remove('hidden');
    overlay.style.setProperty('display', 'flex', 'important');
    keepBtn.disabled = false;
    cancelBtn.disabled = false;

    var settled = false;
    function cleanup(result) {
      if (settled) return;
      settled = true;
      keepBtn.disabled = true;
      cancelBtn.disabled = true;
      hideGradeConflictModal();
      try {
        keepBtn.removeEventListener('click', onKeep);
        cancelBtn.removeEventListener('click', onCancel);
        keepBtn.onclick = null;
        cancelBtn.onclick = null;
      } catch (e) {}
      _gradeConflictModalSettle = null;
      _gradeConflictModalPending = null;
      resolve(result);
    }
    _gradeConflictModalSettle = cleanup;

    function onKeep(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      cleanup(true);
    }
    function onCancel(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      cleanup(false);
    }
    keepBtn.addEventListener('click', onKeep, { once: true });
    cancelBtn.addEventListener('click', onCancel, { once: true });
    keepBtn.onclick = onKeep;
    cancelBtn.onclick = onCancel;
  });
  return _gradeConflictModalPending;
}
GSP.hideGradeConflictModal = hideGradeConflictModal;
GSP.gspGradeConflictKeepMine = function () {
  if (typeof _gradeConflictModalSettle === 'function') _gradeConflictModalSettle(true);
  else try { hideGradeConflictModal(); } catch (e) {}
};
GSP.gspGradeConflictTakeRemote = function () {
  if (typeof _gradeConflictModalSettle === 'function') _gradeConflictModalSettle(false);
  else try { hideGradeConflictModal(); } catch (e) {}
};

// يقارن مجموعة خانات درجات على وشك الحفظ بأحدث نسخة سحابية فعلية.
// pendingCells: [{ studentId, studentName, componentIndex, componentName, newScore }]
async function detectAndResolveGradeConflicts(db, subjectName, term, month, pendingCells) {
  if (!cloudAvailable || !isOnline || !currentStageId || !pendingCells.length) return true;
  let stageRow;
  try { stageRow = await cloudFetchRow('stage_' + currentStageId); }
  catch (e) { return true; }
  if (!stageRow || !stageRow.data || !Array.isArray(stageRow.data.grades)) return true;
  const remoteGrades = stageRow.data.grades;

  const conflicts = [];
  pendingCells.forEach(cell => {
    const remote = remoteGrades.find(g => g.studentId === cell.studentId && g.subjectName === subjectName &&
      g.term === term && g.month === month && g.componentIndex === cell.componentIndex);
    const remoteScore = remote ? remote.score : null;
    const localBaseline = (db.grades.find(g => g.studentId === cell.studentId && g.subjectName === subjectName &&
      g.term === term && g.month === month && g.componentIndex === cell.componentIndex) || {}).score;
    const localBaselineNorm = localBaseline === undefined ? null : localBaseline;
    const resolver = (getCloudSyncService() && getCloudSyncService().conflictResolver) ||
      (GSP.application && GSP.application.services && GSP.application.services.conflictResolver);
    const conflict = resolver && typeof resolver.findFieldConflict === 'function'
      ? resolver.findFieldConflict(localBaselineNorm, remoteScore, cell.newScore)
      : (remoteScore !== localBaselineNorm && remoteScore !== cell.newScore ? { baseline: localBaselineNorm, remote: remoteScore, proposed: cell.newScore } : null);
    if (conflict) conflicts.push(Object.assign({ remoteScore, localBaseline: localBaselineNorm }, cell));
  });

  if (!conflicts.length) return true;
  const syncService = getCloudSyncService();
  if (syncService && typeof syncService.recordConflictCount === 'function') syncService.recordConflictCount(conflicts.length);

  const proceed = await showGradeConflictModal(conflicts, subjectName);

  conflicts.forEach(c => recordConflict({
    studentName: c.studentName, subjectName, componentName: c.componentName,
    remoteScore: c.remoteScore, newScore: c.newScore,
    resolution: proceed ? 'kept-mine' : 'took-remote'
  }));
  renderConflictLog();

  if (!proceed) {
    const root = getRootDB();
    const st = root.stages.find(s => s.id === currentStageId);
    if (st) { st.data = stageRow.data; st.updatedAt = stageRow.updated_at; persistRootDB(root); }
    if (typeof loadGradesUI === 'function') loadGradesUI();
    else if (typeof updateFilters === 'function') updateFilters();
    return false;
  }
  return true;
}

// نافذة: السحابة أحدث من النسخة المحلية قبل الرفع
// إخفاء فوري عند أي اختيار + منع فتح متزامن
var _stalePushModalPending = null;
var _stalePushModalSettle = null; // دالة إغلاق النافذة وحلّ الـ Promise

function hideStalePushModal() {
  const overlay = document.getElementById('stalePushModalOverlay');
  if (!overlay) return;
  overlay.style.setProperty('display', 'none', 'important');
  overlay.classList.add('hidden');
  const pullBtn = document.getElementById('stalePushModalPullBtn');
  const forceBtn = document.getElementById('stalePushModalForceBtn');
  if (pullBtn) { pullBtn.disabled = false; pullBtn.style.pointerEvents = ''; }
  if (forceBtn) { forceBtn.disabled = false; forceBtn.style.pointerEvents = ''; }
}

function showStalePushModal() {
  // إن كانت النافذة مفتوحة بالفعل بانتظار اختيار، أعد نفس الـ Promise
  if (_stalePushModalPending) return _stalePushModalPending;

  _stalePushModalPending = new Promise(resolve => {
    const overlay = document.getElementById('stalePushModalOverlay');
    const pullBtn = document.getElementById('stalePushModalPullBtn');
    const forceBtn = document.getElementById('stalePushModalForceBtn');
    if (!overlay || !pullBtn || !forceBtn) {
      console.warn('showStalePushModal: elements missing — defaulting to force');
      _stalePushModalPending = null;
      _stalePushModalSettle = null;
      resolve('force');
      return;
    }
    overlay.classList.remove('hidden');
    overlay.style.setProperty('display', 'flex', 'important');
    pullBtn.disabled = false;
    forceBtn.disabled = false;

    var settled = false;
    function cleanup(result) {
      if (settled) return;
      settled = true;
      pullBtn.disabled = true;
      forceBtn.disabled = true;
      hideStalePushModal();
      try {
        pullBtn.removeEventListener('click', onPull);
        forceBtn.removeEventListener('click', onForce);
        pullBtn.onclick = null;
        forceBtn.onclick = null;
      } catch (e) {}
      _stalePushModalSettle = null;
      _stalePushModalPending = null;
      resolve(result);
    }
    _stalePushModalSettle = cleanup;

    function onPull(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      cleanup('pull');
    }
    function onForce(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      cleanup('force');
    }
    pullBtn.addEventListener('click', onPull, { once: true });
    forceBtn.addEventListener('click', onForce, { once: true });
    pullBtn.onclick = onPull;
    forceBtn.onclick = onForce;
  });
  return _stalePushModalPending;
}
GSP.hideStalePushModal = hideStalePushModal;

// مسارات data-action: تستدعي settle مباشرة — بدون dispatchEvent (كان يسبب Maximum call stack)
GSP.gspStalePushPull = function () {
  if (typeof _stalePushModalSettle === 'function') {
    _stalePushModalSettle('pull');
  } else {
    try { hideStalePushModal(); } catch (e) {}
  }
};
GSP.gspStalePushForce = function () {
  if (typeof _stalePushModalSettle === 'function') {
    _stalePushModalSettle('force');
  } else {
    try { hideStalePushModal(); } catch (e) {}
  }
};

// يُحدِّث مراجع الجلسة الحالية بعد أي تغيير في بيانات الجذر
function _refreshSessionRefs() {
  if (!currentAccountType) return;
  if (currentAccountType === 'teacher' && currentTeacher) {
    const st = getStageRecord(currentStageId);
    const t = st && (st.data.teachers || []).find(x => x.id === currentTeacher.id);
    if (t) currentTeacher = t;
  } else if (currentAccountType === 'stageadmin' && currentStageAdmin) {
    const r = getRootDB();
    const a = r.stageAdmins.find(x => x.id === currentStageAdmin.id);
    if (a) {
      currentStageAdmin = a;
      const valid = (a.stageIds || []).filter(id => r.stages.some(s => s.id === id));
      if (!valid.includes(currentStageId)) currentStageId = valid[0] || null;
    }
  }
}

// يسحب root_meta + بيانات المرحلة الحالية فقط ويدمجهما في الكائن المحلي.
// عند تبديل المرحلة يُستدعى مباشرةً لجلب بيانات المرحلة الجديدة.
/** تحديث خفيف بعد سحب سحابي دون إعادة ضبط التبويب النشط (يمنع القفز المفاجئ بين التبويبات) */
function softRefreshAfterCloudPull() {
  try {
    const prev = (typeof getCurrentActiveTabName === 'function') ? getCurrentActiveTabName() : null;
    if (typeof updateDashboard === 'function') updateDashboard();
    if (typeof updateSchoolInfoDisplay === 'function') updateSchoolInfoDisplay();
    if (typeof updateGlobalLockUI === 'function') updateGlobalLockUI();
    // لا نستدعي applyRoleUI هنا — يعيد بناء التبويبات وقد يُسقط المستخدم من تبويب الدرجات/الحضور
    if (prev === 'attendance' && typeof loadAttendanceUI === 'function') {
      try { loadAttendanceUI(); } catch (e) {}
    }
    if (prev === 'grades' && typeof loadGradesUI === 'function') {
      try { loadGradesUI(); } catch (e) {}
    }
    if (prev === 'teachers' && typeof loadTeachersUI === 'function') {
      try { loadTeachersUI(); } catch (e) {}
    }
    if (prev === 'stats' && typeof loadStatsUI === 'function') {
      try { loadStatsUI(); } catch (e) {}
    }
    if (currentAccountType === 'monitor' && typeof renderMonitorShellDashboard === 'function') {
      try { renderMonitorShellDashboard(); } catch (e) {}
    }
    if (currentAccountType === 'superadmin' && typeof renderSuperadminStageTree === 'function') {
      try { renderSuperadminStageTree(); } catch (e) {}
    }
  } catch (e) {
    console.warn('softRefreshAfterCloudPull', e);
    applyRoleUI();
  }
}
GSP.softRefreshAfterCloudPull = softRefreshAfterCloudPull;

async function pullFromCloud(refreshUi) {
  if (!cloudAvailable || !isOnline) return false;
  if (!(await ensureCloudSession())) { setConnBadge(); return false; }

  // جلب الصف العام + الحساس بالتوازي (الحساس قد يفشل لغير superadmin بعد RLS — هذا متوقع)
  const [publicRow, secureRow, legacyMetaRow] = await Promise.all([
    cloudFetchRow(ROOT_PUBLIC_ID),
    cloudFetchRow(ROOT_SECURE_ID),
    cloudFetchRow(ROOT_META_LEGACY_ID)
  ]);

  const hasSplit = (publicRow && publicRow.data) || (secureRow && secureRow.data);
  const hasLegacy = legacyMetaRow && legacyMetaRow.data;

  // ── الصيغة القديمة جدًا (صف 'main'): ترحيل تلقائي ──
  if (!hasSplit && !hasLegacy) {
    const mainRow = await cloudFetchRow('main');
    if (!mainRow || !mainRow.data) { setConnBadge(); return; }
    const localUpdated = _rootDBCache ? _rootDBCache.lastUpdated : null;
    if (!localUpdated || (mainRow.updated_at && new Date(mainRow.updated_at) > new Date(localUpdated))) {
      persistRootDB(mainRow.data);
      setConnBadge('تم تحميل البيانات — ستُحدَّث إلى الصيغة الجديدة عند الحفظ التالي');
      if (refreshUi && currentAccountType) {
        _refreshSessionRefs();
        try { softRefreshAfterCloudPull(); } catch (e) { applyRoleUI(); }
      }
    } else { setConnBadge(); }
    return;
  }

  // ── دمج root_public / root_secure أو legacy root_meta + بيانات المرحلة الحالية ──
  const root = getRootDB();
  let changed = false;

  const localMetaUpdated = root.lastUpdated;
  const remoteTs = (publicRow && publicRow.updated_at) ||
    (secureRow && secureRow.updated_at) ||
    (legacyMetaRow && legacyMetaRow.updated_at);
  const remoteMetaIsNewer = !localMetaUpdated ||
    (remoteTs && new Date(remoteTs) > new Date(localMetaUpdated));

  if (remoteMetaIsNewer) {
    applyRemoteRootMeta(
      root,
      publicRow && publicRow.data,
      secureRow && secureRow.data,
      hasLegacy && !hasSplit ? legacyMetaRow.data : null
    );
    changed = true;
  }

  if (currentStageId) {
    const stageRow = await cloudFetchRow('stage_' + currentStageId);
    if (stageRow && stageRow.data) {
      const st = root.stages.find(s => s.id === currentStageId);
      const localStageUpdated = st && st.updatedAt;
      const remoteStageIsNewer = !localStageUpdated ||
        (stageRow.updated_at && new Date(stageRow.updated_at) > new Date(localStageUpdated));
      if (remoteStageIsNewer) {
        if (st) { st.data = stageRow.data; st.updatedAt = stageRow.updated_at; }
        changed = true;
      } else if (st && st.data && stageRow.data) {
        const remote = stageRow.data; let merged = false;
        if (remote.monthLocks && typeof remote.monthLocks === 'object') {
          st.data.monthLocks = Object.assign({}, st.data.monthLocks || {}, remote.monthLocks); merged = true;
        }
        if (remote.termLocks && typeof remote.termLocks === 'object') {
          st.data.termLocks = Object.assign({}, st.data.termLocks || {}, remote.termLocks); merged = true;
        }
        if (remote.globalLock === true) { st.data.globalLock = true; merged = true; }
        if (remote.schoolInfo && typeof remote.schoolInfo === 'object') {
          st.data.schoolInfo = st.data.schoolInfo || {};
          if (remote.schoolInfo.week1Dates) { st.data.schoolInfo.week1Dates = remote.schoolInfo.week1Dates; merged = true; }
          if (remote.schoolInfo.months) { st.data.schoolInfo.months = remote.schoolInfo.months; merged = true; }
          ['governorate','educationAdmin','schoolName','principalName','academicYear'].forEach(k => {
            if (remote.schoolInfo[k] != null && remote.schoolInfo[k] !== '') { st.data.schoolInfo[k] = remote.schoolInfo[k]; merged = true; }
          });
        }
        if (remote.attendance && typeof remote.attendance === 'object') {
          st.data.attendance = st.data.attendance || {};
          if (Array.isArray(remote.attendance.holidays)) { st.data.attendance.holidays = remote.attendance.holidays.slice(); merged = true; }
          if (typeof remote.attendance.saturdayEnabled === 'boolean') { st.data.attendance.saturdayEnabled = remote.attendance.saturdayEnabled; merged = true; }
        }
        if (remote.settings && typeof remote.settings === 'object') {
          st.data.settings = Object.assign({}, st.data.settings || {}, remote.settings); merged = true;
        }
        if (typeof remote.honorBoardEnabled === 'boolean') { st.data.honorBoardEnabled = remote.honorBoardEnabled; merged = true; }
        if (typeof remote.teacherDailyAttendanceEnabled === 'boolean') { st.data.teacherDailyAttendanceEnabled = remote.teacherDailyAttendanceEnabled; merged = true; }
        if (merged) changed = true;
      }
    }
  }

  if (changed) {
    persistRootDB(root);
    setConnBadge('تم تحميل أحدث تعديلات من جهاز آخر');
    if (refreshUi && currentAccountType) {
      _refreshSessionRefs();
      try { softRefreshAfterCloudPull(); } catch (e) { applyRoleUI(); }
    }
  } else { setConnBadge(); }
}

// يسحب كل المراحل من السحابة بالتوازي — يُستخدم عند تسجيل الدخول لضمان اكتمال البيانات محلياً
async function pullAllStagesFromCloud() {
  if (!cloudAvailable || !isOnline) return false;
  if (!(await ensureCloudSession())) { setConnBadge(); return false; }

  const [publicRow, secureRow, legacyMetaRow] = await Promise.all([
    cloudFetchRow(ROOT_PUBLIC_ID),
    cloudFetchRow(ROOT_SECURE_ID),
    cloudFetchRow(ROOT_META_LEGACY_ID)
  ]);

  const hasSplit = (publicRow && publicRow.data) || (secureRow && secureRow.data);
  const hasLegacy = legacyMetaRow && legacyMetaRow.data;

  if (!hasSplit && !hasLegacy) {
    // لا توجد بيانات بصيغة جديدة بعد — جرّب الصيغة القديمة
    await pullFromCloud(false);
    return;
  }

  const root = getRootDB();
  const pubData = (publicRow && publicRow.data) || null;
  const secData = (secureRow && secureRow.data) || null;
  const legData = (hasLegacy && !hasSplit) ? legacyMetaRow.data : null;

  applyRemoteRootMeta(root, pubData, secData, legData);

  const stagesList = (pubData && pubData.stages) || (legData && legData.stages) || [];
  const stageIds = stagesList.map(s => s.id);

  const stageRows = await Promise.all(stageIds.map(id => cloudFetchRow('stage_' + id)));
  stageIds.forEach((id, i) => {
    const row = stageRows[i];
    const name = (stagesList[i] || {}).name || id;
    const local = root.stages.find(s => s.id === id);
    if (local) {
      local.name = name;
      if (row && row.data) { local.data = row.data; local.updatedAt = row.updated_at; }
    } else {
      root.stages.push({
        id,
        name,
        data: (row && row.data) ? row.data : emptyStageData(),
        updatedAt: row ? row.updated_at : null
      });
    }
  });
  persistRootDB(root);
  setConnBadge('تم تحميل بيانات جميع المراحل من السحابة (' + stageIds.length + ' مراحل)');
}

function scheduleCloudPush() {
  if (!cloudAvailable) return;
  cloudPushPending = true;
  ensureCloudSession().then(ok => { if (!ok) { updateSyncPendingStatus(); setConnBadge(); } });
  const service = getCloudSyncService();
  const queue = getSyncQueueService();
  // Queue only references to local records; the local DB remains the source of truth.
  const queueIds = [currentStageId ? 'stage_' + currentStageId : null].filter(Boolean);
  if (currentAccountType === 'superadmin' || currentAccountType === 'stageadmin' || currentAccountType === 'monitor') {
    queueIds.push(ROOT_PUBLIC_ID);
  }
  if (currentAccountType === 'superadmin') queueIds.push(ROOT_SECURE_ID);
  if (service && typeof service.enqueue === 'function') service.enqueue(queueIds);
  else if (queue) queue.enqueue(queueIds);
  if (!isOnline) { setConnBadge(); updateSyncPendingStatus(); return; }
  if (typeof GSP.isLocalPersistenceHealthy === 'function' && !GSP.isLocalPersistenceHealthy()) {
    setConnBadge('الحفظ المحلي لم يكتمل — ستُؤجَّل المزامنة لحماية البيانات');
    updateSyncPendingStatus();
    return;
  }
  clearTimeout(cloudSyncTimer);
  const waitForLocalSave = typeof GSP.whenLocalPersistenceSettled === 'function' ? GSP.whenLocalPersistenceSettled() : Promise.resolve(true);
  cloudSyncTimer = setTimeout(() => {
    Promise.resolve(waitForLocalSave).then(ok => { if (ok !== false) runCloudPush(); });
  }, 1200);
  updateSyncPendingStatus();
}

// يرفع فقط: root_meta + بيانات المرحلة الحالية (بدل الكل)
// قبل الرفع: إن كانت السحابة أحدث من النسخة المحلية يُعرض تنبيه (سحب الأحدث أو فرض الرفع)
async function runCloudPush() {
  if (!cloudAvailable || !isOnline) return false;
  if (!(await ensureCloudSession())) { setConnBadge(); return false; }
  if (typeof GSP.isLocalPersistenceHealthy === 'function' && !GSP.isLocalPersistenceHealthy()) {
    setConnBadge('الحفظ المحلي لم يكتمل — لن تتم المزامنة حتى ينجح الحفظ');
    return;
  }
  if (cloudPushInFlight) { cloudPushPending = true; return; }
  cloudPushInFlight = true;
  cloudPushPending = false;
  const syncService = getCloudSyncService();
  const syncQueue = getSyncQueueService();
  const syncStatus = getSyncStatusService();
  const reliability = getSyncReliabilityService();
  // Do not hammer Supabase after a transient failure; retry only when the backoff expires.
  if (reliability && syncQueue && syncQueue.ids().length) {
    const due = reliability.dueIds();
    if (!due.length) {
      if (syncStatus) updateSyncPendingStatus();
      reliability.scheduleRetry(runCloudPush);
      cloudPushInFlight = false;
      return;
    }
  }
  if (syncStatus) syncStatus.markSyncing();
  if (syncQueue) syncQueue.markAttempt(syncQueue.ids());
  setConnBadge(null, 'syncing');
  try {
    const root = _rootDBCache;
    if (root) {
      // فحص تعارض زمني على مستوى المرحلة قبل الكتابة فوق السحابة
      if (currentStageId) {
        const st = root.stages.find(s => s.id === currentStageId);
        const localUpdated = st && st.updatedAt;
        if (localUpdated) {
          let stageRow = null;
          try { stageRow = await cloudFetchRow('stage_' + currentStageId); } catch (e) { /* تجاهل */ }
          // تهدئة: بعد حل تعارض مؤخراً لا نعيد فتح النافذة فوراً (تجنب حلقة إعادة الظهور)
          var staleCooldownUntil = (typeof window.__gspStaleCooldownUntil === 'number') ? window.__gspStaleCooldownUntil : 0;
          if (Date.now() < staleCooldownUntil) {
            // خلال فترة التهدئة نتابع الرفع دون سؤال مجدداً
          } else if (stageRow && stageRow.updated_at && new Date(stageRow.updated_at) > new Date(localUpdated)) {
            // السحابة أحدث — اسأل المستخدم
            cloudPushInFlight = false;
            setConnBadge('تنبيه: توجد نسخة أحدث على السحابة');
            const choice = await showStalePushModal();
            // تأكيد إخفاء النافذة بعد الاختيار
            try { hideStalePushModal(); } catch (e) {}
            // امنع إعادة فتح النافذة لمدة 15 ثانية بعد أي اختيار
            window.__gspStaleCooldownUntil = Date.now() + 15000;
            if (choice === 'pull') {
              await pullFromCloud(true);
              // بعد السحب: اجعل updatedAt المحلي مطابقاً للسحابة حتى لا يُعاد كشف التعارض
              try {
                const rootAfter = getRootDB();
                const stAfter = rootAfter && rootAfter.stages && rootAfter.stages.find(s => s.id === currentStageId);
                if (stAfter && stageRow && stageRow.updated_at) {
                  stAfter.updatedAt = stageRow.updated_at;
                  if (typeof persistRootDB === 'function') persistRootDB(rootAfter);
                }
              } catch (e) {}
              setConnBadge('تم تحميل النسخة الأحدث — راجع بياناتك ثم احفظ مجدداً إن لزم');
              if (cloudPushPending) setTimeout(runCloudPush, 1500);
              return;
            }
            // choice === 'force' → نكمل الرفع
            cloudPushInFlight = true;
            setConnBadge(null, 'syncing');
          }
        }
      }

      const now = new Date().toISOString();
      // فصل البيانات العامة عن الحساسة في صفين مستقلين
      // root_public: superadmin / stageadmin / monitor (RLS: is_admin_role)
      // root_secure: superadmin فقط
      const rows = [];
      if (currentAccountType === 'superadmin' || currentAccountType === 'stageadmin' || currentAccountType === 'monitor') {
        rows.push({ id: ROOT_PUBLIC_ID, data: buildRootPublic(root), updated_at: now });
      }
      if (currentAccountType === 'superadmin') {
        rows.push({ id: ROOT_SECURE_ID, data: buildRootSecure(root), updated_at: now });
      }
      let dirtyIds = (typeof consumeDirtyStageIds === 'function') ? consumeDirtyStageIds() : [];
      try {
        if (_rootDBCache && _rootDBCache._cloudDirtyStageIds) {
          Object.keys(_rootDBCache._cloudDirtyStageIds).forEach(id => {
            if (id && dirtyIds.indexOf(String(id)) < 0) dirtyIds.push(String(id));
          });
          _rootDBCache._cloudDirtyStageIds = {};
        }
      } catch (e) {}
      if (currentStageId && dirtyIds.indexOf(String(currentStageId)) < 0) dirtyIds.push(String(currentStageId));
      if (currentAccountType === 'superadmin' || currentAccountType === 'stageadmin') {
        (root.stages || []).forEach(s => {
          if (s && s.id && dirtyIds.indexOf(String(s.id)) < 0) dirtyIds.push(String(s.id));
        });
      }
      if (!dirtyIds.length && currentStageId) dirtyIds.push(String(currentStageId));
      // Recovery after refresh: merge persistent queue references with this run's dirty records.
      const queuedIds = syncService && typeof syncService.pendingIds === 'function' ? syncService.pendingIds() : (syncQueue ? syncQueue.ids() : []);
      queuedIds.forEach(id => {
        if (id === ROOT_PUBLIC_ID || id === ROOT_SECURE_ID || id === ROOT_META_LEGACY_ID || id === 'root_meta') return;
        if (String(id).startsWith('stage_')) { const sid = String(id).slice(6); if (dirtyIds.indexOf(sid) < 0) dirtyIds.push(sid); }
      });
      const seenPush = Object.create(null);
      dirtyIds.forEach(sid => {
        if (!sid || seenPush[sid]) return;
        seenPush[sid] = true;
        const st = (root.stages || []).find(s => String(s.id) === String(sid));
        if (!st || !st.data) return;
        rows.push({ id: 'stage_' + sid, data: st.data, updated_at: now });
        st.updatedAt = now;
      });
      root.lastUpdated = now;
      const service = getCloudSyncGateway();
      if (!service) throw new Error('Cloud sync service is not available');
      const { error } = await service.upsertRows(rows);
      if (error) {
        console.error('Supabase push error:', error);
        if (syncService && typeof syncService.recordFailure === 'function') syncService.recordFailure(error, rows.map(r => r.id));
        setConnBadge(null, 'error');
        if (reliability) reliability.scheduleRetry(runCloudPush);
      }
      else {
        persistRootDB(root);
        if (syncService && typeof syncService.complete === 'function') syncService.complete(rows.map(r => r.id));
        else if (syncQueue) syncQueue.remove(rows.map(r => r.id));
        if (syncService && typeof syncService.recordSuccess === 'function') syncService.recordSuccess();
        setConnBadge('تمت المزامنة ' + new Date().toLocaleTimeString('ar-EG'));
        maybeAutoVersionSnapshot();
      }
    }
  } catch (e) {
    console.error('Supabase push exception:', e);
    if (syncService && typeof syncService.recordFailure === 'function') syncService.recordFailure(e, (syncQueue && syncQueue.ids) ? syncQueue.ids() : []);
    setConnBadge(null, 'error');
    if (reliability) reliability.scheduleRetry(runCloudPush);
  }
  cloudPushInFlight = false;
  updateSyncPendingStatus();
  if (cloudPushPending || (syncQueue && syncQueue.ids().length)) {
    if (reliability) reliability.scheduleRetry(runCloudPush);
    else setTimeout(runCloudPush, 1000);
  }
}

// فحص دوري خفيف كل 25 ثانية — يجلب root_meta + المرحلة الحالية فقط
setInterval(() => { if (isOnline && !cloudPushInFlight) pullFromCloud(true); }, 25000);

// ============================================================
//  رفع/تنزيل/حذف نسخ ملفات Excel الأصلية من Supabase Storage
//  (انظر شرح WORKBOOK_STORAGE_BUCKET بالأعلى لسبب هذا الأسلوب)
// ============================================================

// يحوّل أي نص (قد يحتوي حروفاً عربية أو رموزاً خاصة مثل §) إلى نص ASCII آمن تماماً بترميز
// Base64Url (يحتوي فقط على أحرف/أرقام إنجليزية و - و _)، بدون أي حرف غير إنجليزي أو رمز % كما كان
// الحال مع encodeURIComponent - وهو ما كان يجعل Supabase Storage يرفض المسار برسالة "Invalid key"
// لأن اسم الصف بالعربية (وفاصل § بينه وبين القسم) يظل ظاهراً في المسار الفعلي الذي يفحصه الخادم.
function safeStorageToken(str) {
  const utf8Binary = unescape(encodeURIComponent(str));
  return btoa(utf8Binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// مسار ثابت وآمن تماماً (ASCII فقط) لكل ملف: معرّف المرحلة/الصف+القسم مُرمَّزين بترميز آمن يصلح
// كمسار في Supabase Storage مهما كانت الأحرف المستخدمة في اسم المرحلة أو الصف (عربي أو غيره).
function workbookStorageKey(stageId, gradeMetaKey) {
  return safeStorageToken(stageId) + '/' + safeStorageToken(gradeMetaKey) + '.xlsx';
}

// يرفع نسخة الملف الأصلي (بصيغته الثنائية الحقيقية xlsx، وليس كنص Base64) إلى Supabase Storage.
// ترجع {ok:true} عند النجاح، أو {ok:false, reason} عند الفشل (مثلاً: لا يوجد اتصال، أو الـ bucket
// غير موجود بعد على حساب Supabase) - وفي كل الأحوال لا يوقف هذا الفشل عملية استيراد البيانات نفسها.
async function uploadWorkbookToCloud(storageKey, base64) {
  if (!cloudAvailable) return { ok: false, reason: 'لا يوجد اتصال بقاعدة البيانات السحابية' };
  if (!(await ensureCloudSession())) return { ok: false, reason: 'يجب تسجيل الدخول السحابي قبل رفع النسخة' };
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const service = getCloudSyncGateway();
    if (!service) return { ok: false, reason: 'خدمة المزامنة السحابية غير متاحة' };
    const { error } = await service.uploadWorkbook(storageKey, blob, {
      upsert: true,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    if (error) { console.error('تعذّر رفع نسخة الملف الأصلي إلى Supabase Storage:', error);
      return { ok: false, reason: error.message }; }
    return { ok: true };
  } catch (e) { console.error('استثناء أثناء رفع نسخة الملف الأصلي:', e);
    return { ok: false, reason: e.message }; }
}

// يُنزّل نسخة محفوظة سابقاً من Supabase Storage ويرجعها كنص Base64 (ليتوافق مع ما يتوقعه Worker
// بناء ملف Excel المُحدَّث - انظر exportGradeOriginalFormat). يرجع null عند الفشل أو عدم الوجود.
async function downloadWorkbookFromCloud(storageKey) {
  if (!cloudAvailable) return null;
  if (!(await ensureCloudSession())) return null;
  try {
    const service = getCloudSyncGateway();
    if (!service) return null;
    const { data, error } = await service.downloadWorkbook(storageKey);
    if (error || !data) { console.error('تعذّر تنزيل نسخة الملف الأصلي من Supabase Storage:', error);
      return null; }
    const buffer = await data.arrayBuffer();
    return arrayBufferToBase64(buffer);
  } catch (e) { console.error('استثناء أثناء تنزيل نسخة الملف الأصلي:', e);
    return null; }
}

// حذف نسخة (أو عدة نسخ) من Supabase Storage - يُستخدم عند حذف مرحلة كاملة لتنظيف الملفات اليتيمة.
// لا يوقف تنفيذ الكود عند الفشل (best-effort فقط).
async function deleteWorkbooksFromCloud(storageKeys) {
  if (!cloudAvailable || !storageKeys.length) return;
  try { const service = getCloudSyncGateway();
    if (!service) return;
    await service.removeWorkbooks(storageKeys); }
  catch (e) { console.error('تعذّر حذف بعض نسخ الملفات الأصلية من Supabase Storage:', e); }
}

// ============================================================
//  تنظيف السحابة: صفوف مراحل يتيمة + ملفات Excel يتيمة
//  متاح لرئيس الكنترول فقط. يقارن السحابة بما هو موجود محلياً.
// ============================================================
function collectActiveWorkbookPaths(root) {
  const paths = new Set();
  (root.stages || []).forEach(st => {
    const metaByGrade = (st.data && st.data.metaByGrade) || {};
    Object.keys(metaByGrade).forEach(k => {
      const p = metaByGrade[k] && metaByGrade[k].workbookStoragePath;
      if (p) paths.add(p);
    });
    const meta = st.data && st.data.meta;
    if (meta && meta.workbookStoragePath) paths.add(meta.workbookStoragePath);
  });
  return paths;
}

function collectValidCloudRowIds(root) {
  const ids = new Set([ROOT_PUBLIC_ID, ROOT_SECURE_ID]); // root_meta legacy removed Step 49
  (root.stages || []).forEach(st => { if (st && st.id) ids.add('stage_' + st.id); });
  // الإبقاء على صفوف الصيغة القديمة (root_meta / main) إن وُجدت حتى لا نكسر ترحيلاً قديماً عرضاً — لا تُحذف تلقائياً
  return ids;
}

async function listAllCloudRowIds() {
  if (!cloudAvailable) return [];
  try {
    const service = getCloudSyncGateway();
    if (!service) return [];
    const { data, error } = await service.listRowIds();
    if (error) { console.error('list cloud rows error:', error); return []; }
    return (data || []).map(r => r.id).filter(Boolean);
  } catch (e) {
    console.error('list cloud rows exception:', e);
    return [];
  }
}

async function listAllStorageObjectPaths() {
  if (!cloudAvailable) return [];
  const paths = [];
  try {
    const service = getCloudSyncGateway();
    if (!service) return [];
    const { data: top, error } = await service.listStorage('', { limit: 1000, offset: 0 });
    if (error) { console.error('list storage root error:', error); return []; }
    for (const item of (top || [])) {
      if (!item || !item.name) continue;
      // مجلد (لا امتداد أو metadata تشير لمجلد) — ندرج محتوياته
      const isFolder = !item.name.includes('.') || item.id == null;
      if (isFolder && !item.name.toLowerCase().endsWith('.xlsx')) {
        const { data: files, error: e2 } = await service.listStorage(item.name, { limit: 1000, offset: 0 });
        if (e2) { console.error('list storage folder error:', e2); continue; }
        (files || []).forEach(f => {
          if (f && f.name && !f.name.endsWith('/')) paths.push(item.name + '/' + f.name);
        });
      } else {
        paths.push(item.name);
      }
    }
  } catch (e) {
    console.error('list storage exception:', e);
  }
  return paths;
}

async function analyzeCloudOrphans() {
  const root = getRootDB();
  const validRows = collectValidCloudRowIds(root);
  const activeFiles = collectActiveWorkbookPaths(root);
  const allRows = await listAllCloudRowIds();
  const allFiles = await listAllStorageObjectPaths();
  const orphanRows = allRows.filter(id => {
    if (validRows.has(id)) return false;
    // نحذف فقط صفوف المراحل اليتيمة — نترك أي معرفات أخرى غير معروفة بحذر باستثناء stage_
    return String(id).startsWith('stage_');
  });
  const orphanFiles = allFiles.filter(p => p && !activeFiles.has(p));
  return {
    orphanRows,
    orphanFiles,
    totalRows: allRows.length,
    totalFiles: allFiles.length,
    activeStages: (root.stages || []).length,
    activeFiles: activeFiles.size
  };
}

async function previewCloudCleanup() {
  const msg = document.getElementById('cloudCleanupMsg');
  if (currentAccountType !== 'superadmin') {
    if (msg) { msg.style.color = '#b91c1c'; msg.textContent = '🔒 متاح لرئيس الكنترول فقط.'; }
    return;
  }
  if (!cloudAvailable || !isOnline) {
    if (msg) { msg.style.color = '#b91c1c'; msg.textContent = '⚠️ يلزم اتصال بالإنترنت وتهيئة Supabase.'; }
    return;
  }
  if (msg) { msg.style.color = '#64748b'; msg.textContent = '⏳ جاري فحص السحابة...'; }
  try {
    const r = await analyzeCloudOrphans();
    const lines = [
      `📊 المراحل المحلية النشطة: ${r.activeStages}`,
      `📁 ملفات Excel المرتبطة حالياً: ${r.activeFiles}`,
      `🗄️ إجمالي صفوف الجدول السحابي: ${r.totalRows}`,
      `📦 إجمالي ملفات Storage: ${r.totalFiles}`,
      '',
      r.orphanRows.length
        ? `🗑️ صفوف مراحل يتيمة ستُحذف (${r.orphanRows.length}):
` + r.orphanRows.map(id => '  • ' + id).join('\n')
        : '✅ لا توجد صفوف مراحل يتيمة.',
      '',
      r.orphanFiles.length
        ? `🗑️ ملفات Excel يتيمة ستُحذف (${r.orphanFiles.length}):\n` + r.orphanFiles.slice(0, 40).map(p => '  • ' + p).join('\n') + (r.orphanFiles.length > 40 ? `\n  … و${r.orphanFiles.length - 40} ملفاً آخر` : '')
        : '✅ لا توجد ملفات Excel يتيمة.'
    ];
    // fix accidental double-escaped newlines from construction above
    const textOut = lines.join('\n').replace(/\\n/g, '\n');
    if (msg) {
      msg.style.color = (r.orphanRows.length || r.orphanFiles.length) ? '#9a3412' : '#0b5e42';
      msg.textContent = textOut;
    }
  } catch (e) {
    if (msg) { msg.style.color = '#b91c1c'; msg.textContent = '❌ فشل الفحص: ' + (e.message || e); }
  }
}

async function cleanupCloudStorage() {
  const msg = document.getElementById('cloudCleanupMsg');
  const btn = document.getElementById('cloudCleanupBtn');
  if (currentAccountType !== 'superadmin') {
    if (msg) { msg.style.color = '#b91c1c'; msg.textContent = '🔒 متاح لرئيس الكنترول فقط.'; }
    return;
  }
  if (!cloudAvailable || !isOnline) {
    if (msg) { msg.style.color = '#b91c1c'; msg.textContent = '⚠️ يلزم اتصال بالإنترنت وتهيئة Supabase.'; }
    return;
  }
  if (msg) { msg.style.color = '#64748b'; msg.textContent = '⏳ جاري فحص ما يمكن حذفه...'; }
  if (btn) btn.disabled = true;
  try {
    const r = await analyzeCloudOrphans();
    if (!r.orphanRows.length && !r.orphanFiles.length) {
      if (msg) { msg.style.color = '#0b5e42'; msg.textContent = '✅ السحابة نظيفة — لا توجد بيانات يتيمة للحذف.'; }
      return;
    }
    const summary = `سيتم حذف:\n` +
      (r.orphanRows.length ? `• ${r.orphanRows.length} صف مرحلة يتيم من الجدول\n` : '') +
      (r.orphanFiles.length ? `• ${r.orphanFiles.length} ملف Excel يتيم من Storage\n` : '') +
      `\nلن تُمس المراحل والبيانات النشطة. هل تريد المتابعة؟`;
    if (!(await showConfirm(summary.replace(/\n/g, '\n')))) {
      if (msg) { msg.style.color = '#64748b'; msg.textContent = 'تم إلغاء التنظيف.'; }
      return;
    }
    if (msg) msg.textContent = '⏳ جاري التنظيف...';

    let deletedRows = 0, deletedFiles = 0;
    const rowErrors = [];
    for (const id of r.orphanRows) {
      try {
        const service = getCloudSyncGateway();
        if (!service) throw new Error('Cloud sync service is not available');
        const { error } = await service.deleteRow(id);
        if (error) rowErrors.push(id + ': ' + error.message);
        else deletedRows++;
      } catch (e) {
        rowErrors.push(id + ': ' + (e.message || e));
      }
    }
    if (r.orphanFiles.length) {
      // الحذف على دفعات لتجنب حدود API
      const chunk = 50;
      for (let i = 0; i < r.orphanFiles.length; i += chunk) {
        const part = r.orphanFiles.slice(i, i + chunk);
        try {
          const service = getCloudSyncGateway();
          if (!service) throw new Error('Cloud sync service is not available');
          const { error } = await service.removeWorkbooks(part);
          if (!error) deletedFiles += part.length;
          else console.error('storage remove error:', error);
        } catch (e) {
          console.error('storage remove exception:', e);
        }
      }
    }

    if (typeof recordAudit === 'function') {
      recordAudit('تنظيف السحابة', `صفوف: ${deletedRows}/${r.orphanRows.length} — ملفات: ${deletedFiles}/${r.orphanFiles.length}`);
    }

    let out = `✅ اكتمل التنظيف.\n• صفوف محذوفة: ${deletedRows}`;
    if (r.orphanRows.length) out += ` من ${r.orphanRows.length}`;
    out += `\n• ملفات محذوفة: ${deletedFiles}`;
    if (r.orphanFiles.length) out += ` من ${r.orphanFiles.length}`;
    if (rowErrors.length) out += `\n⚠️ أخطاء صفوف:\n` + rowErrors.slice(0, 8).join('\n');
    if (msg) { msg.style.color = rowErrors.length ? '#9a3412' : '#0b5e42'; msg.textContent = out.replace(/\n/g, '\n'); }
  } catch (e) {
    if (msg) { msg.style.color = '#b91c1c'; msg.textContent = '❌ فشل التنظيف: ' + (e.message || e); }
  } finally {
    if (btn) btn.disabled = false;
  }
}
GSP.previewCloudCleanup = previewCloudCleanup;
GSP.cleanupCloudStorage = cleanupCloudStorage;


// window exports
GSP.setConnBadge = setConnBadge;
GSP.updateOnlineStatus = updateOnlineStatus;
GSP.buildRootMeta = buildRootMeta;
GSP.buildRootPublic = buildRootPublic;
GSP.buildRootSecure = buildRootSecure;
GSP.ROOT_PUBLIC_ID = ROOT_PUBLIC_ID;
GSP.ROOT_SECURE_ID = ROOT_SECURE_ID;
GSP.cloudFetchRow = cloudFetchRow;
GSP.getConflictStore = getConflictStore;
GSP.recordConflict = recordConflict;
GSP.renderConflictLog = renderConflictLog;
GSP.showGradeConflictModal = showGradeConflictModal;
GSP.detectAndResolveGradeConflicts = detectAndResolveGradeConflicts;
GSP.showStalePushModal = showStalePushModal;
GSP._refreshSessionRefs = _refreshSessionRefs;
GSP.softRefreshAfterCloudPull = softRefreshAfterCloudPull;
GSP.pullFromCloud = pullFromCloud;
GSP.pullAllStagesFromCloud = pullAllStagesFromCloud;
GSP.scheduleCloudPush = scheduleCloudPush;
GSP.runCloudPush = runCloudPush;
GSP.getSyncStatus = function(){ const s=getSyncStatusService(); return s ? s.get() : null; };
GSP.getSyncQueue = function(){ const q=getSyncQueueService(); return q ? q.peek() : []; };
GSP.getSyncDiagnostics = function(){ const s=getSyncStatusService(); const q=getSyncQueueService(); return { status:s ? s.get() : null, queue:q ? q.peek() : [], localPersistenceHealthy: typeof GSP.isLocalPersistenceHealthy === 'function' ? GSP.isLocalPersistenceHealthy() : true }; };
GSP.getCloudSessionState = function(){ return Object.assign({}, cloudSessionState); };
GSP.ensureCloudSession = ensureCloudSession;
GSP.retryCloudSync = function(){ const r=getSyncReliabilityService(); if (r) return r.retryNow(function(){ scheduleCloudPush(); }); scheduleCloudPush(); };
GSP.safeStorageToken = safeStorageToken;
GSP.workbookStorageKey = workbookStorageKey;
GSP.uploadWorkbookToCloud = uploadWorkbookToCloud;
GSP.downloadWorkbookFromCloud = downloadWorkbookFromCloud;
GSP.deleteWorkbooksFromCloud = deleteWorkbooksFromCloud;
GSP.collectActiveWorkbookPaths = collectActiveWorkbookPaths;
GSP.collectValidCloudRowIds = collectValidCloudRowIds;
GSP.listAllCloudRowIds = listAllCloudRowIds;
GSP.listAllStorageObjectPaths = listAllStorageObjectPaths;
GSP.analyzeCloudOrphans = analyzeCloudOrphans;
GSP.previewCloudCleanup = previewCloudCleanup;
GSP.cleanupCloudStorage = cleanupCloudStorage;

// STEP 36: the connection badge doubles as a safe manual retry affordance.
try {
  const badge = document.getElementById('connStatusBadge');
  if (badge) {
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', function () {
      const st = getSyncStatusService();
      if (st && (st.get().state === 'error' || st.get().pending > 0)) GSP.retryCloudSync();
    });
  }
} catch (e) {}

try {
  Object.defineProperty(window,'isOnline',{get:function(){return isOnline;},set:function(v){isOnline=v;},configurable:true});
  Object.defineProperty(window,'cloudPushPending',{get:function(){return cloudPushPending;},set:function(v){cloudPushPending=v;},configurable:true});
} catch (e) {
  // Already defined (script re-evaluated) — keep existing
}

try {
  GSP.application = GSP.application || {};
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.cloudSyncFeature = Object.freeze({
    getService: getCloudSyncService
  });
} catch (e) {}
