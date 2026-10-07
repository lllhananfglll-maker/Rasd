/* auth-audit.part01.js — generated from auth-audit.js; execution order is significant. */
/**
 * js/app/auth-audit.js — الجزء 2/9 من app.js السابق (بعد التقسيم لتحسين قابلية الصيانة)
 * المحتوى: الوضع الداكن + شاشات الدخول (تُكمّل auth/login-ui.js) + سجل التدقيق + سجل الإصدارات
 * يعتمد على: نفس النطاق المشترك (window/global scope) الذي كان عليه app.js — يجب تحميله
 * بنفس ترتيب الأجزاء كما في index.html، لأن بعض الدوال هنا تُستدعى من دوال معرّفة في أجزاء لاحقة.
 */
'use strict';



    //  V24: DARK MODE
    // ============================================================
    function applyDarkModePreference() {
      const saved = localStorage.getItem('gradeSystemPro_theme');
      const theme = saved === 'dark' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      const btn = document.getElementById('darkModeToggleBtn');
      if (btn) btn.textContent = theme === 'dark' ? '☀️ الوضع النهاري' : '🌙 الوضع الليلي';
    }


    function toggleDarkMode() {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('gradeSystemPro_theme', next);
      applyDarkModePreference();
    }



    // ============================================================
    //  AUTH
    // ============================================================
    // → auth/login-ui.js

    function getTabContentEl(tabName) {
      return document.getElementById('tab-' + tabName) || document.getElementById(tabName);
    }



    function ensureTabActive(tabName) {
      const allowedBtn = document.querySelector('.tab[data-tab="' + tabName + '"]');
      if (allowedBtn) {
        allowedBtn.classList.add('active');
        // كان هذا الفحص يعتمد فقط على style.display المضمّن مباشرة؛ بعض أزرار التبويب أصبحت الآن
        // تُخفى عبر class="hidden" (بدل style="display:none;" المضمّن) لتقليل الاعتماد على unsafe-inline
        // في CSP، لذا لازم إزالة الكلاس هنا أيضاً وإلا يبقى الزر مخفياً بصرياً رغم "active".
        allowedBtn.classList.remove('hidden');
        if (allowedBtn.style.display === 'none') allowedBtn.style.display = 'inline-flex';
      }
      const el = getTabContentEl(tabName);
      if (el) el.classList.add('active');
      return !!el;
    }



    function getCurrentActiveTabName() {
      try {
        const activeBtn = document.querySelector('.tab.active');
        if (activeBtn && activeBtn.dataset && activeBtn.dataset.tab) return activeBtn.dataset.tab;
        const activeContent = document.querySelector('.tab-content.active');
        if (activeContent && activeContent.id) {
          const id = activeContent.id;
          if (id.indexOf('tab-') === 0) return id.slice(4);
          if (id === 'dashboard') return 'dashboard';
          return id;
        }
        const monBtn = document.querySelector('#monNav button.active, #monNav .mon-nav-btn.active, .mon-shell .mon-nav button.active');
        if (monBtn) {
          const t = monBtn.getAttribute('data-tab') || monBtn.getAttribute('data-mon-tab') || monBtn.dataset.tab;
          if (t) return t;
        }
      } catch (e) {}
      return null;
    }


    GSP.getCurrentActiveTabName = getCurrentActiveTabName;



    function activateTab(tabName) {
      const btn = document.querySelector(`.tab[data-tab="${tabName}"]`);
      if (btn && btn.style.display !== 'none') btn.click();
    }



    function currentUserLabel() {
      if (currentAccountType === 'teacher' && currentTeacher) return 'المعلم: ' + (currentTeacher.name || 'غير معروف');
      if (currentAccountType === 'stageadmin' && currentStageAdmin) return 'مسؤول الحاسب: ' + (currentStageAdmin.name || 'غير معروف');
      if (currentAccountType === 'monitor' && currentStageMonitor) return 'مدير المرحلة: ' + (currentStageMonitor.name || 'غير معروف');
      if (currentAccountType === 'superadmin') return 'رئيس الكنترول';
      return 'غير مسجل';
    }



    // ============================================================
    //  سجل دخول المدراء والعمليات — سحابي فقط (جدول audit_events)
    //  لا يُخزَّن رسمياً في IndexedDB. يُجلب عند الطلب لرئيس الكنترول.
    // ============================================================
    // STEP 38: unified Audit Service. The legacy recordAudit() surface below is
    // intentionally retained as a compatibility adapter; new code can use the
    // structured recordAuditEvent()/recordAuditChange() APIs without knowing
    // Supabase details.
    const AUDIT_TABLE = 'audit_events';
    const AUDIT_FETCH_LIMIT = 200;
    let _cloudAuditCache = [];

    function getAuditService() {
      try {
        return GSP.application && GSP.application.services && GSP.application.services.audit || null;
      } catch (e) { return null; }
    }

    function getAuditStore() { return _cloudAuditCache; }

    function buildLegacyAuditPayload(action, details, level) {
      return {
        action: String(action || '').slice(0, 200),
        details: String(details || '').slice(0, 2000),
        level: level || 'info'
      };
    }

    function recordAudit(action, details, level, metadata) {
      try {
        const service = getAuditService();
        if (service && typeof service.record === 'function') {
          return service.record(Object.assign(buildLegacyAuditPayload(action, details, level), metadata || {}));
        }
        // Very early bootstrap fallback: preserve the old behavior if the service
        // has not been composed yet. This is deliberately best-effort.
        const row = Object.assign({ created_at: new Date().toISOString(), actor_name: (typeof currentUserLabel === 'function' ? currentUserLabel() : 'غير مسجل'), actor_role: currentAccountType || '', stage_id: currentStageId || null, stage_name: null, app_version: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '') }, buildLegacyAuditPayload(action, details, level));
        if (typeof cloudAvailable !== 'undefined' && cloudAvailable && typeof supabaseClient !== 'undefined' && supabaseClient) {
          return Promise.resolve(supabaseClient.from(AUDIT_TABLE).insert([row]));
        }
      } catch (e) { console.warn('Audit log failed', e); }
      return null;
    }

    function recordAuditEvent(event) {
      const service = getAuditService();
      if (!service || typeof service.recordEvent !== 'function') return recordAudit(event && event.action, event && event.details, event && event.level, event);
      return service.recordEvent(event || {});
    }

    GSP.recordAuditEvent = recordAuditEvent;
    GSP.recordAuditChange = recordAuditChange;

    function recordAuditChange(change) {
      const service = getAuditService();
      if (!service || typeof service.recordChange !== 'function') return recordAudit(change && change.action, change && change.details, change && change.level, change);
      return service.recordChange(change || {});
    }

    async function fetchCloudAuditLog(limit) {
      const service = getAuditService();
      if (service && typeof service.fetch === 'function') {
        _cloudAuditCache = await service.fetch(limit || AUDIT_FETCH_LIMIT);
        return _cloudAuditCache;
      }
      throw new Error('خدمة سجل التدقيق غير متاحة حالياً');
    }

    function roleLabelAr(role) {
      if (role === 'superadmin') return 'رئيس الكنترول';
      if (role === 'stageadmin') return 'مسؤول الحاسب';
      if (role === 'monitor') return 'مدير المرحلة';
      if (role === 'teacher') return 'معلم';
      return role || '—';
    }



    function formatAuditDetails(raw) {
      try {
        const x = JSON.parse(String(raw || ''));
        const bits = [];
        if (x.kind) bits.push('النوع: ' + x.kind);
        if (x.module) bits.push('الوحدة: ' + x.module);
        if (x.outcome) bits.push('النتيجة: ' + (x.outcome === 'success' ? 'نجاح' : 'فشل'));
        if (x.reason) bits.push('السبب: ' + x.reason);
        if (x.record) bits.push('السجل: ' + JSON.stringify(x.record));
        if (x.before != null) bits.push('قبل: ' + JSON.stringify(x.before));
        if (x.after != null) bits.push('بعد: ' + JSON.stringify(x.after));
        if (x.transactionId) bits.push('Transaction: ' + x.transactionId);
        if (x.details) bits.push(String(x.details));
        return bits.join(' | ');
      } catch (_) { return String(raw || ''); }
    }

    async function renderAuditLog() {
      const body = document.getElementById('auditLogBody');
      const statusEl = document.getElementById('auditCloudStatus');
      if (!body) return;
      if (currentAccountType && currentAccountType !== 'superadmin') {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;">سجل دخول المدراء والعمليات متاح لرئيس الكنترول فقط.</td></tr>';
        if (statusEl) statusEl.textContent = '';
        return;
      }
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;">⏳ جارٍ الجلب من السحابة...</td></tr>';
      if (statusEl) { statusEl.textContent = '⏳ جارٍ التحميل...'; statusEl.style.color = '#64748b'; }
      try {
        const rows = await fetchCloudAuditLog(AUDIT_FETCH_LIMIT);
        if (!rows.length) {
          body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">لا توجد عمليات مسجّلة في السحابة بعد. تأكد من إنشاء جدول audit_events في Supabase.</td></tr>';
          if (statusEl) { statusEl.textContent = '✅ تم الاتصال — السجل فارغ'; statusEl.style.color = '#0b5e42'; }
          return;
        }
        body.innerHTML = rows.map(r => {
          const stageBit = r.stageName ? ` <span style="color:#64748b;font-size:12px;">(${escapeHtml(r.stageName)})</span>` : '';
          return `<tr>
            <td>${new Date(r.at).toLocaleString('ar-EG')}</td>
            <td>${escapeHtml(r.user)}${stageBit}</td>
            <td>${escapeHtml(roleLabelAr(r.accountType))}</td>
            <td>${escapeHtml(r.action)}</td>
            <td>${escapeHtml(formatAuditDetails(r.details))}</td>
          </tr>`;
        }).join('');
        if (statusEl) {
          statusEl.textContent = '✅ آخر ' + rows.length + ' حدثاً من السحابة' +
            ((getAuditService() && typeof getAuditService().pendingCount === 'function' && getAuditService().pendingCount()) ? ' — ⏳ ' + getAuditService().pendingCount() + ' بانتظار الرفع' : '');
          statusEl.style.color = '#0b5e42';
        }
      } catch (e) {
        body.innerHTML = '<tr><td colspan="5" style="color:#b91c1c;text-align:center;">❌ ' + escapeHtml(e.message || e) + '</td></tr>';
        if (statusEl) { statusEl.textContent = '❌ ' + (e.message || e); statusEl.style.color = '#b91c1c'; }
      }
    }





    // escapeHtml يأتي من core/utils.js (مصدر وحيد). نُبقي alias محلي للتوافق مع باقي كود app.js
    // الذي يستدعي escapeHtml مباشرة دون window.
    var escapeHtml = GSP.escapeHtml || function (value) {
      return String(value == null ? '' : value).replace(/[&<>'"]/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c];
      });
    };



    // مصدر واحد مشترك لمنطق كان مكرراً بنسخ متطابقة/شبه متطابقة داخل وحدات JS منفصلة
    // (v20-smart-ux, v24-teacher-analytics, attendance-system-js, monitor-shell-js).
    // أي وحدة محتاجة نفس المنطق تنادي هنا بدل ما تعيد كتابته محلياً، عشان يبقى التعديل في مكان واحد.
    function gspSafeDb() { try { return loadDB(); } catch (e) { return { students: [], teachers: [], subjects: [], grades: [], classes: [], classGrade: {} }; } }


    GSP.gspSafeDb = gspSafeDb;


    function gspRelevantGradeComponents(subject) { return (subject.components || []).filter(c => !c.isMonthlyGrade && c.type !== 'attendance'); }


    GSP.gspRelevantGradeComponents = gspRelevantGradeComponents;


    function gspTodayISO() { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }


    GSP.gspTodayISO = gspTodayISO;



    function downloadBlob(filename, content, type) {
      const blob = new Blob([content], {type}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    }



    function downloadLocalBackup() {
      // STEP 43: prefer data-migration service when available
      const dm = (typeof GSP !== 'undefined' && GSP.dataMigration) || null;
      let payload;
      if (dm && typeof dm.createBackupFromCurrent === 'function') {
        const result = dm.createBackupFromCurrent({ source: 'ui-security-tab' });
        if (!result.ok) {
          const el = document.getElementById('backupStatus');
          if (el) { el.textContent = '❌ ' + (result.error || 'تعذر إنشاء النسخة'); el.style.color = '#b91c1c'; }
          return;
        }
        payload = result.payload;
      } else {
        const root = getRootDB();
        payload = { format: 'GradeSystemPro-Backup', appVersion: APP_VERSION, createdAt: new Date().toISOString(), data: root };
      }
      downloadBlob(
        'GradeSystemPro_Backup_' + new Date().toISOString().slice(0, 10) + '.json',
        JSON.stringify(payload, null, 2),
        'application/json;charset=utf-8'
      );
      const el = document.getElementById('backupStatus');
      if (el) { el.textContent = '✅ تم إنشاء نسخة احتياطية كاملة من بيانات النظام.'; el.style.color = '#0b5e42'; }
      recordAudit('إنشاء نسخة احتياطية', 'تم تنزيل نسخة كاملة من بيانات النظام');
      renderAuditLog();
    }

    async function restoreLocalBackup(file) {
      if (!file) return;
      if (!(await showConfirm('⚠️ استعادة النسخة ستستبدل البيانات المحلية الحالية. تأكد من أن لديك نسخة احتياطية من الوضع الحالي. متابعة؟'))) return;
      const el = document.getElementById('backupStatus');
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const dm = (typeof GSP !== 'undefined' && GSP.dataMigration) || null;

        if (dm && typeof dm.restoreFromPayload === 'function') {
          const result = await dm.restoreFromPayload(payload, {
            writeRoot: async (root) => {
              await idbSet(ROOT_DB_KEY, root);
              _rootDBCache = root;
            }
          });
          if (!result.ok) throw new Error(result.error || 'فشل الاستعادة');
          const summary = result.summary
            ? ' (مراحل: ' + result.summary.stageCount + '، طلاب: ' + result.summary.studentCount + ')'
            : '';
          recordAudit('استعادة نسخة احتياطية', 'تم استعادة ملف: ' + file.name + summary, 'warning');
          if (el) {
            el.textContent = '✅ تمت الاستعادة بنجاح' + summary + '. سيتم إعادة تحميل النظام.';
            el.style.color = '#0b5e42';
          }
        } else {
          const root = payload.data || payload;
          if (!root || !Array.isArray(root.stages)) throw new Error('ملف النسخة غير صالح أو ليس من نظام Grade System Pro.');
          await idbSet(ROOT_DB_KEY, root);
          _rootDBCache = root;
          recordAudit('استعادة نسخة احتياطية', 'تم استعادة ملف: ' + file.name, 'warning');
          if (el) { el.textContent = '✅ تمت الاستعادة بنجاح. سيتم إعادة تحميل النظام.'; el.style.color = '#0b5e42'; }
        }
        setTimeout(() => location.reload(), 700);
      } catch (e) {
        if (el) { el.textContent = '❌ تعذر الاستعادة: ' + e.message; el.style.color = '#b91c1c'; }
      }
    }



    async function downloadAuditLog() {
      if (currentAccountType && currentAccountType !== 'superadmin') {
        alert('تصدير السجل متاح لرئيس الكنترول فقط.');
        return;
      }
      try {
        let rows = _cloudAuditCache;
        if (!rows.length) rows = await fetchCloudAuditLog(AUDIT_FETCH_LIMIT);
        if (!rows.length) { alert('لا توجد أحداث لتصديرها.'); return; }
        const aoa = [['التاريخ والوقت', 'المستخدم', 'الدور', 'المرحلة', 'العملية', 'التفاصيل', 'المستوى', 'إصدار التطبيق']];
        rows.forEach(r => {
          aoa.push([
            r.at ? new Date(r.at).toLocaleString('ar-EG') : '',
            r.user || '',
            roleLabelAr(r.accountType),
            r.stageName || '',
            r.action || '',
            r.details || '',
            r.level || '',
            r.appVersion || ''
          ]);
        });
        if (typeof XLSX !== 'undefined') {
          const ws = XLSX.utils.aoa_to_sheet(aoa);
          ws['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 50 }, { wch: 10 }, { wch: 12 }];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'سجل العمليات');
          XLSX.writeFile(wb, 'GradeSystemPro_Audit_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        } else {
          downloadBlob('GradeSystemPro_Audit_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
        }
      } catch (e) {
        alert('تعذر التصدير: ' + (e.message || e));
      }
    }



    // ============================================================
    //  V24: سجل الإصدارات (Versioning)
    //  ------------------------------------------------------------
    //  بالإضافة إلى النسخة الاحتياطية اليدوية (JSON يُنزَّل على الجهاز)، يحتفظ النظام بآخر 15 نسخة
    //  كاملة من قاعدة البيانات داخل IndexedDB نفسها (تلقائياً بعد كل مزامنة ناجحة مع السحابة، بحد
    //  أقصى نسخة تلقائية واحدة كل 20 دقيقة حتى لا تمتلئ المساحة، بالإضافة لنسخة يدوية عند الطلب)،
    //  بحيث يمكن الرجوع لأي منها فوراً من داخل التطبيق دون الحاجة لملف خارجي.
    // ============================================================
    const VERSIONS_KEY = 'gradeSystemPro_versions';


    const MAX_VERSIONS = 15;


    const AUTO_VERSION_MIN_GAP_MS = 20 * 60 * 1000;


    let _lastAutoVersionAt = 0;



    async function getVersionsList() {
      try { const v = await idbGet(VERSIONS_KEY); return Array.isArray(v) ? v : []; }
      catch (e) { return []; }
    }



    async function createVersionSnapshot(type) {
      try {
        const root = getRootDB();
        const clone = JSON.parse(JSON.stringify(root));
        const versions = await getVersionsList();
        versions.unshift({
          id: 'ver_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          at: new Date().toISOString(), type,
          stagesCount: (clone.stages || []).length,
          data: clone
        });
        while (versions.length > MAX_VERSIONS) versions.pop();
        await idbSet(VERSIONS_KEY, versions);
        return true;
      } catch (e) { console.warn('تعذّر حفظ نسخة إصدار:', e); return false; }
    }



    // تُستدعى تلقائياً بعد كل مزامنة ناجحة مع السحابة (مع تحديد وتيرتها)
    async function maybeAutoVersionSnapshot() {
      const now = Date.now();
      if (now - _lastAutoVersionAt < AUTO_VERSION_MIN_GAP_MS) return;
      _lastAutoVersionAt = now;
      await createVersionSnapshot('auto');
    }



    async function createManualVersionSnapshot() {
      const el = document.getElementById('versionsStatus');
      const ok = await createVersionSnapshot('manual');
      if (el) { el.textContent = ok ? '✅ تم حفظ نسخة إصدار جديدة يدوياً.' : '❌ تعذر حفظ النسخة.'; el.style.color = ok ? '#0b5e42' : '#b91c1c'; }
      if (ok) { recordAudit('حفظ إصدار', 'تم حفظ نسخة إصدار يدوية من كامل بيانات النظام'); renderAuditLog(); }
      renderVersionsList();
    }



    async function renderVersionsList() {
      const body = document.getElementById('versionsListBody');
      if (!body) return;
      const versions = await getVersionsList();
      if (!versions.length) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:16px">لا توجد إصدارات محفوظة بعد.</td></tr>'; return; }
      body.innerHTML = versions.map(v => `
        <tr>
          <td>${new Date(v.at).toLocaleString('ar-EG')}</td>
          <td>${v.type === 'auto' ? '🔄 تلقائية' : '📌 يدوية'}</td>
          <td>${v.stagesCount}</td>
          <td><button class="btn btn-outline btn-sm" data-action="restoreVersionSnapshot" data-args='${gspArgs(['v.id'])}'>♻️ استعادة هذا الإصدار</button></td>
        </tr>
      `).join('');
    }



    async function restoreVersionSnapshot(versionId) {
      const versions = await getVersionsList();
      const v = versions.find(x => x.id === versionId);
      if (!v) return;
      if (!(await showConfirm(`⚠️ سيتم استبدال كامل بيانات النظام الحالية بنسخة ${v.type === 'auto' ? 'تلقائية' : 'يدوية'} بتاريخ ${new Date(v.at).toLocaleString('ar-EG')}. يُفضّل أخذ نسخة احتياطية للوضع الحالي أولاً. متابعة؟`))) return;
      await idbSet(ROOT_DB_KEY, v.data);
      _rootDBCache = v.data;
      const el = document.getElementById('versionsStatus');
      if (el) { el.textContent = '✅ تمت الاستعادة. سيتم إعادة تحميل النظام.'; el.style.color = '#0b5e42'; }
      setTimeout(() => location.reload(), 700);
    }



    function toggleDashMoreMenu(ev) {
      if (ev) ev.stopPropagation();
      const m = document.getElementById('dashMoreMenu');
      if (m) m.classList.toggle('open');
    }


    function closeDashMoreMenu() {
      const m = document.getElementById('dashMoreMenu');
      if (m) m.classList.remove('open');
    }


    document.addEventListener('click', function(e) {
      const wrap = document.querySelector('.dash-more-wrap');
      if (wrap && !wrap.contains(e.target)) closeDashMoreMenu();
    });
