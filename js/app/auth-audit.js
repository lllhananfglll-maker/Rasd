/** app/auth-audit.js — مدمج (المرحلة C) */
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
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--rasd-text-muted);">سجل دخول المدراء والعمليات متاح لرئيس الكنترول فقط.</td></tr>';
        if (statusEl) statusEl.textContent = '';
        return;
      }
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--rasd-text-muted);">⏳ جارٍ الجلب من السحابة...</td></tr>';
      if (statusEl) { statusEl.textContent = '⏳ جارٍ التحميل...'; statusEl.style.color = 'var(--rasd-text-muted)'; }
      try {
        const rows = await fetchCloudAuditLog(AUDIT_FETCH_LIMIT);
        if (!rows.length) {
          body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--rasd-text-subtle);">لا توجد عمليات مسجّلة في السحابة بعد. تأكد من إنشاء جدول audit_events في Supabase.</td></tr>';
          if (statusEl) { statusEl.textContent = '✅ تم الاتصال — السجل فارغ'; statusEl.style.color = 'var(--rasd-brand)'; }
          return;
        }
        body.innerHTML = rows.map(r => {
          const stageBit = r.stageName ? ` <span style="color:var(--rasd-text-muted);font-size:12px;">(${escapeHtml(r.stageName)})</span>` : '';
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
          statusEl.style.color = 'var(--rasd-brand)';
        }
      } catch (e) {
        body.innerHTML = '<tr><td colspan="5" style="color:var(--rasd-danger);text-align:center;">❌ ' + escapeHtml(e.message || e) + '</td></tr>';
        if (statusEl) { statusEl.textContent = '❌ ' + (e.message || e); statusEl.style.color = 'var(--rasd-danger)'; }
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
          if (el) { el.textContent = '❌ ' + (result.error || 'تعذر إنشاء النسخة'); el.style.color = 'var(--rasd-danger)'; }
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
      if (el) { el.textContent = '✅ تم إنشاء نسخة احتياطية كاملة من بيانات النظام.'; el.style.color = 'var(--rasd-brand)'; }
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
            el.style.color = 'var(--rasd-brand)';
          }
        } else {
          const root = payload.data || payload;
          if (!root || !Array.isArray(root.stages)) throw new Error('ملف النسخة غير صالح أو ليس من نظام Grade System Pro.');
          await idbSet(ROOT_DB_KEY, root);
          _rootDBCache = root;
          recordAudit('استعادة نسخة احتياطية', 'تم استعادة ملف: ' + file.name, 'warning');
          if (el) { el.textContent = '✅ تمت الاستعادة بنجاح. سيتم إعادة تحميل النظام.'; el.style.color = 'var(--rasd-brand)'; }
        }
        setTimeout(() => location.reload(), 700);
      } catch (e) {
        if (el) { el.textContent = '❌ تعذر الاستعادة: ' + e.message; el.style.color = 'var(--rasd-danger)'; }
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
      if (el) { el.textContent = ok ? '✅ تم حفظ نسخة إصدار جديدة يدوياً.' : '❌ تعذر حفظ النسخة.'; el.style.color = ok ? 'var(--rasd-brand)' : 'var(--rasd-danger)'; }
      if (ok) { recordAudit('حفظ إصدار', 'تم حفظ نسخة إصدار يدوية من كامل بيانات النظام'); renderAuditLog(); }
      renderVersionsList();
    }



    async function renderVersionsList() {
      const body = document.getElementById('versionsListBody');
      if (!body) return;
      const versions = await getVersionsList();
      if (!versions.length) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--rasd-text-subtle);padding:16px">لا توجد إصدارات محفوظة بعد.</td></tr>'; return; }
      body.innerHTML = versions.map(v => `
        <tr>
          <td>${new Date(v.at).toLocaleString('ar-EG')}</td>
          <td>${v.type === 'auto' ? '🔄 تلقائية' : '📌 يدوية'}</td>
          <td>${v.stagesCount}</td>
          <td><button class="btn btn-outline btn-sm" data-action="restoreVersionSnapshot" data-args='${gspArgs([v.id])}'>♻️ استعادة هذا الإصدار</button></td>
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
      if (el) { el.textContent = '✅ تمت الاستعادة. سيتم إعادة تحميل النظام.'; el.style.color = 'var(--rasd-brand)'; }
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


    function updateDashboard() {
      const db = loadDB(); const students=db.students||[]; const teachers=db.teachers||[]; const grades=db.grades||[];
      // استخدم حساب الإكمال المُسرَّع (مع كاش) إن توفّر، بدل المرور الثلاثي طلاب×مواد×مكوّنات في كل تحديث
      let progress, missing;
      if (typeof GSP.allCompletion === 'function') {
        const c = GSP.allCompletion();
        progress = c.pct;
        missing = c.missing;
      } else {
        const expected = students.reduce((sum,st)=>sum + (db.subjects||[]).filter(sub=>canAccessStudentGrade(sub.name,st)).reduce((a,sub)=>a + (sub.components||[]).filter(c=>!c.isMonthlyGrade && c.type!=='attendance').length,0),0);
        progress = expected ? Math.min(100, Math.round(grades.length/expected*100)) : (students.length ? 0 : 100);
        missing = Math.max(0, expected - grades.length);
      }
      const ids = {dashStudents:students.length,dashTeachers:teachers.length,dashGrades:progress+'%',dashIssues:missing,dashGradesNote:missing ? `متبقٍ ${missing} درجة تقريباً` : 'لا توجد درجات متوقعة ناقصة',dashProgressText:progress+'%'};
      Object.entries(ids).forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.textContent=val;});
      const bar=document.getElementById('dashProgressBar');if(bar)bar.style.width=progress+'%';
      const greeting=document.getElementById('dashboardGreeting');if(greeting)greeting.textContent='👋 أهلاً بك، ' + currentUserLabel().replace(/^(المعلم: |مدير المرحلة: )/,'');
      const alerts=document.getElementById('dashAlerts');if(alerts){const arr=[]; if(!students.length)arr.push(['danger','🔴 لا توجد بيانات طلاب في المرحلة الحالية.','activateTab(\'upload\')','رفع ملف']); if(missing)arr.push(['warn',`🟡 توجد درجات متوقعة غير مكتملة: ${missing}`,'activateTab(\'grades\')','مراجعة']);
        // تعارضات الحضور تُحسب عند الطلب فقط لتفادي تجميد الواجهة مع كل تحديث لوحة التحكم
        if (currentAccountType !== 'teacher') {
          const cached = GSP.__attnConflictsCache;
          const cacheKey = (grades.length|0) + '|' + (students.length|0) + '|' + (currentStageId||'');
          if (cached && cached.key === cacheKey && cached.count > 0) {
            arr.push(['danger', `🔴 ${cached.count} طالب لديه "غ" في مادة ودرجات فعلية في مادة أخرى — يُحتمل خطأ رصد، راجع شئون الطلاب للتأكد من غيابه اليومي.`, 'openAttendanceConflictsModal()', 'مراجعة الحالات']);
          }
        }
        if(!arr.length)arr.push(['ok','🟢 ممتاز! لا توجد تنبيهات رئيسية حالياً.','','']); alerts.innerHTML=arr.map(x=>`<div class="alert-item ${x[0]}"><span>${x[1]}</span>${x[2]?`<button class="btn btn-outline btn-sm" data-action="activateTab" data-args='["grades"]'>${x[3]}</button>`:''}</div>`).join('');}
      try { if (typeof renderMonitorDashCards === 'function') renderMonitorDashCards(); } catch (eMdc) {}
    }



    // ==================== بطاقات مدير المرحلة التفاعلية ====================
    GSP.__mdcLastDetail = null;

 // { title, headers, rows } للتصدير

    function mdcEsc(v){ return typeof escapeHtml==='function' ? escapeHtml(v) : String(v??''); }


    function mdcHindi(n){ return typeof toHindiDigits==='function' ? toHindiDigits(n) : String(n); }


    function mdcEval(pct){
      if (pct>=95) return {t:'ممتاز',c:'good'};
      if (pct>=80) return {t:'جيد جداً',c:'good'};
      if (pct>=60) return {t:'مقبول',c:'warn'};
      if (pct>=30) return {t:'متأخر',c:'danger'};
      return {t:'لم يبدأ',c:'danger'};
    }


    function mdcGender(s){
      const g = (s.gender||'').toString().toUpperCase();
      if (g==='F' || g==='أنثى' || g==='بنت') return 'F';
      if (g==='M' || g==='ذكر' || g==='ولد') return 'M';
      return 'U';
    }


    function mdcTeacherCompletion(db, t){
      if (typeof completionForTeacher==='function') {
        const c = completionForTeacher(t);
        return { expected:c.expected||0, done:c.done||0, missing:c.missing||0, pct:c.pct||0 };
      }
      return { expected:0, done:0, missing:0, pct:0 };
    }


    function mdcTeacherEdits(db, t){
      // مجموع editCount على درجات طلابه في مواده المسندة
      let edits = 0, cells = 0;
      const subjSet = new Set((t.assignments||[]).map(a=>a.subjectName).filter(Boolean));
      const classSet = new Set();
      (t.assignments||[]).forEach(a => (a.classes||[]).forEach(c=>classSet.add(c)));
      const studentIds = new Set((db.students||[])
        .filter(s => classSet.has(classSectionKey(s.class,s.section)))
        .map(s=>s.id));
      (db.grades||[]).forEach(g => {
        if (!subjSet.has(g.subjectName) || !studentIds.has(g.studentId)) return;
        cells++;
        edits += Number(g.editCount)||0;
      });
      return { edits, cells };
    }


    function mdcTeacherStudentCount(db, t){
      const classSet = new Set();
      (t.assignments||[]).forEach(a => (a.classes||[]).forEach(c=>classSet.add(c)));
      let n = 0;
      (db.students||[]).forEach(s => {
        if (!classSet.has(classSectionKey(s.class,s.section))) return;
        // لغة ثانية
        let ok = true;
        (t.assignments||[]).forEach(a => {
          if (typeof filterStudentsForTeacherLanguage==='function') {
            // تبسيط: نعد الطالب إن كان في أي فصل مسند
          }
        });
        n++;
      });
      return n;
    }



    GSP.closeMdcDetail = function(){
      const d = document.getElementById('mdcDetail');
      if (d) d.style.display = 'none';
      document.querySelectorAll('.mdc-card.is-open').forEach(c => c.classList.remove('is-open'));
      GSP.__mdcLastDetail = null;
    };



    GSP.openMdcDetail = function(key){
      document.querySelectorAll('.mdc-card').forEach(c => c.classList.toggle('is-open', c.getAttribute('data-mdc')===key));
      const db = loadDB();
      const classF = document.getElementById('mdcFilterClass')?.value || '';
      const subjectF = document.getElementById('mdcFilterSubject')?.value || '';
      const teacherF = document.getElementById('mdcFilterTeacher')?.value || '';
      let title = '', headers = [], rows = [], extraHtml = '';

      if (key === 'stages') {
        title = 'المراحل تحت الإشراف';
        headers = ['#','اسم المرحلة','القسم'];
        const root = typeof getRootDB==='function' ? getRootDB() : {stages:[]};
        const ids = (currentAccountType==='monitor' && currentStageMonitor)
          ? (currentStageMonitor.stageIds||[])
          : (currentAccountType==='stageadmin' && currentStageAdmin)
            ? (currentStageAdmin.stageIds||[])
            : (root.stages||[]).map(s=>s.id);
        (root.stages||[]).filter(s => !ids.length || ids.includes(s.id)).forEach((s,i) => {
          const label = typeof stageDisplayLabel==='function' ? stageDisplayLabel(s) : (s.name||s.id);
          rows.push([i+1, label, s.section||s.entity||'—']);
        });
      } else if (key === 'students') {
        title = 'توزيع الطلاب (بنين / بنات حسب الصف)';
        headers = ['الصف','بنين','بنات','غير محدد','المجموع'];
        const byGrade = new Map();
        (db.students||[]).forEach(s => {
          if (classF && classSectionKey(s.class,s.section)!==classF) return;
          const g = (s.grade || s.class || '—').toString();
          if (!byGrade.has(g)) byGrade.set(g, {M:0,F:0,U:0});
          const b = byGrade.get(g);
          const gen = mdcGender(s);
          if (gen==='M') b.M++; else if (gen==='F') b.F++; else b.U++;
        });
        [...byGrade.entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'ar')).forEach(([g,b]) => {
          rows.push([g, b.M, b.F, b.U, b.M+b.F+b.U]);
        });
      } else if (key === 'classes') {
        title = 'الفصول حسب الصف';
        headers = ['الصف','عدد الفصول/الشعب','أسماء الفصول'];
        const byGrade = new Map();
        (db.classes||[]).forEach(ck => {
          const students = (db.students||[]).filter(s => classSectionKey(s.class,s.section)===ck);
          const grade = students[0]?.grade || (ck.split('|')[0]||ck);
          if (!byGrade.has(grade)) byGrade.set(grade, []);
          byGrade.get(grade).push(typeof classSectionLabel==='function'?classSectionLabel(ck):ck);
        });
        [...byGrade.entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'ar')).forEach(([g,list]) => {
          rows.push([g, list.length, list.join('، ')]);
        });
      } else if (key === 'density') {
        title = 'كثافة الفصول (عدد الطلاب لكل فصل)';
        headers = ['الفصل','عدد الطلاب','التقييم النسبي'];
        const sizes = (db.classes||[]).map(ck => {
          const n = (db.students||[]).filter(s => classSectionKey(s.class,s.section)===ck).length;
          return { ck, n, label: typeof classSectionLabel==='function'?classSectionLabel(ck):ck };
        }).filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
        const avg = sizes.length ? sizes.reduce((s,x)=>s+x.n,0)/sizes.length : 0;
        sizes.forEach(x => {
          const rel = avg ? (x.n/avg) : 1;
          const tag = rel>=1.25 ? 'مرتفعة' : rel<=0.75 ? 'منخفضة' : 'متوسطة';
          rows.push([x.label, x.n, tag + (avg?` (متوسط المرحلة ≈ ${Math.round(avg)})`:'')]);
        });
        if (sizes.length) {
          extraHtml = `<div style="margin-bottom:10px;font-size:13px;color:#475569">أعلى كثافة: <strong>${mdcEsc(sizes[0].label)}</strong> (${mdcHindi(sizes[0].n)}) · أقل كثافة: <strong>${mdcEsc(sizes[sizes.length-1].label)}</strong> (${mdcHindi(sizes[sizes.length-1].n)})</div>`;
        }
      } else if (key === 'subjects') {
        title = 'المواد / التخصصات';
        headers = ['المادة','معلمون مسندون','تخصيصات فصول','حصة من التخصيصات %','اكتمال الرصد'];
        const totalAssign = (db.teachers||[]).reduce((s,t)=>s+((t.assignments||[]).length),0) || 1;
        (db.subjects||[]).forEach(sub => {
          if (subjectF && sub.name!==subjectF) return;
          const teachers = (db.teachers||[]).filter(t => (t.assignments||[]).some(a=>a.subjectName===sub.name));
          const assignCount = (db.teachers||[]).reduce((s,t)=>s+((t.assignments||[]).filter(a=>a.subjectName===sub.name).length),0);
          const pctShare = Math.round(assignCount/totalAssign*100);
          // اكتمال تقريبي للمادة
          let exp=0,done=0;
          (db.students||[]).forEach(st => {
            if (typeof canAccessStudentGrade==='function' && !canAccessStudentGrade(sub.name,st)) return;
            (sub.components||[]).filter(c=>c.type!=='attendance'&&!c.isMonthlyGrade).forEach((c,ci)=>{
              exp++;
              if ((db.grades||[]).some(g=>g.studentId===st.id&&g.subjectName===sub.name&&g.componentIndex===(sub.components.indexOf(c))&&g.score!==''&&g.score!=null)) done++;
            });
          });
          const compPct = exp?Math.min(100,Math.round(done/exp*100)):0;
          rows.push([sub.name, teachers.length, assignCount, pctShare+'%', compPct+'%']);
        });
      } else if (key === 'teachers') {
        title = 'تفاصيل المعلمين ومؤشرات الأداء';
        headers = ['المعلم','المواد','الطلاب','اكتمال الرصد','متبقي','تعديلات بعد الحفظ','التقييم'];
        (db.teachers||[]).forEach(t => {
          if (teacherF && String(t.id)!==String(teacherF) && t.name!==teacherF) return;
          const c = mdcTeacherCompletion(db, t);
          const ed = mdcTeacherEdits(db, t);
          const stCount = mdcTeacherStudentCount(db, t);
          const subs = [...new Set((t.assignments||[]).map(a=>a.subjectName).filter(Boolean))].join('، ');
          const ev = mdcEval(c.pct);
          rows.push([t.name, subs||'—', stCount, c.pct+'%', c.missing, ed.edits, ev.t]);
        });
      } else if (key === 'coverage') {
        title = 'نسبة التغطية والتوزيع (معلم / طلاب)';
        headers = ['البند','القيمة'];
        const st = (db.students||[]).length;
        const tc = (db.teachers||[]).length;
        const ratio = tc ? Math.round(st/tc) : 0;
        rows.push(['إجمالي الطلاب', st]);
        rows.push(['إجمالي المعلمين', tc]);
        rows.push(['معلم لكل … طالب (تقريبي)', ratio || '—']);
        extraHtml = '<h4 style="margin:12px 0 8px;font-size:13px">توزيع المعلمين على المواد</h4>';
        const subRows = [];
        (db.subjects||[]).forEach(sub => {
          const n = (db.teachers||[]).filter(t => (t.assignments||[]).some(a=>a.subjectName===sub.name)).length;
          subRows.push(`<tr><td>${mdcEsc(sub.name)}</td><td>${mdcHindi(n)} معلم</td></tr>`);
        });
        extraHtml += `<table class="mdc-table"><thead><tr><th>المادة</th><th>المعلمون</th></tr></thead><tbody>${subRows.join('')||'<tr><td colspan="2">—</td></tr>'}</tbody></table>`;
        extraHtml += '<p style="font-size:12px;color:var(--rasd-text-muted);margin-top:8px">يُظهر أين يوجد تركيز أو نقص في إسناد المعلمين للمواد.</p>';
      } else if (key === 'progress') {
        title = 'حالة الكنترول والرصد الحالية';
        headers = ['المادة','الفصل','الاكتمال','الحالة'];
        (db.subjects||[]).forEach(sub => {
          if (subjectF && sub.name!==subjectF) return;
          (db.classes||[]).forEach(ck => {
            if (classF && ck!==classF) return;
            const students = (db.students||[]).filter(s => classSectionKey(s.class,s.section)===ck);
            if (!students.length) return;
            let exp=0, done=0;
            students.forEach(st => {
              if (typeof canAccessStudentGrade==='function' && !canAccessStudentGrade(sub.name,st)) return;
              (sub.components||[]).filter(c=>c.type!=='attendance'&&!c.isMonthlyGrade).forEach(c=>{
                exp++;
                const ci = sub.components.indexOf(c);
                if ((db.grades||[]).some(g=>g.studentId===st.id&&g.subjectName===sub.name&&g.componentIndex===ci&&g.score!==''&&g.score!=null)) done++;
              });
            });
            if (!exp) return;
            const pct = Math.min(100, Math.round(done/exp*100));
            const stt = pct>=100?'مكتمل':pct>=60?'قيد الرصد':'متأخر';
            rows.push([sub.name, typeof classSectionLabel==='function'?classSectionLabel(ck):ck, pct+'%', stt]);
          });
        });
        rows.sort((a,b)=>parseInt(a[2])-parseInt(b[2]));
      } else {
        title = 'تفاصيل';
      }

      GSP.__mdcLastDetail = { title, headers, rows };
      const body = document.getElementById('mdcDetailBody');
      const titleEl = document.getElementById('mdcDetailTitle');
      const box = document.getElementById('mdcDetail');
      if (titleEl) titleEl.textContent = title;
      if (body) {
        if (!rows.length && !extraHtml) {
          body.innerHTML = '<div class="mdc-empty">لا توجد بيانات لهذا المؤشر.</div>';
        } else {
          let html = extraHtml || '';
          if (headers.length && rows.length) {
            html += `<table class="mdc-table"><thead><tr>${headers.map(h=>`<th>${mdcEsc(h)}</th>`).join('')}</tr></thead><tbody>`;
            rows.forEach(r => {
              html += '<tr>' + r.map((cell, idx) => {
                let v = cell;
                // تلوين عمود التقييم/الحالة إن وُجد
                if (typeof cell==='string' && (cell==='ممتاز'||cell==='جيد جداً'||cell==='مكتمل')) v = `<span class="mdc-badge good">${mdcEsc(cell)}</span>`;
                else if (typeof cell==='string' && (cell==='مقبول'||cell==='قيد الرصد'||cell==='متوسطة')) v = `<span class="mdc-badge warn">${mdcEsc(cell)}</span>`;
                else if (typeof cell==='string' && (cell==='متأخر'||cell==='لم يبدأ'||cell==='مرتفعة'||String(cell).startsWith('متأخر'))) v = `<span class="mdc-badge danger">${mdcEsc(cell)}</span>`;
                else if (typeof cell==='string' && cell==='منخفضة') v = `<span class="mdc-badge info">${mdcEsc(cell)}</span>`;
                else v = mdcEsc(cell);
                return `<td>${v}</td>`;
              }).join('') + '</tr>';
            });
            html += '</tbody></table>';
          }
          body.innerHTML = html;
        }
      }
      if (box) { box.style.display = 'block'; box.scrollIntoView({behavior:'smooth', block:'nearest'}); }
    };



    GSP.exportMdcDetail = function(mode){
      const d = GSP.__mdcLastDetail;
      if (!d || !d.rows || !d.rows.length) { alert('لا توجد بيانات للتصدير.'); return; }
      if (mode === 'print') {
        const area = document.getElementById('printGradeSheetArea');
        if (!area) return;
        if (typeof clearInactivePrintAreas==='function') clearInactivePrintAreas('printGradeSheetArea');
        const table = `<table style="width:100%;border-collapse:collapse;font-size:12px;direction:rtl">
          <thead><tr>${d.headers.map(h=>`<th style="border:1px solid #333;padding:6px;background:#1e3a5f;color:#fff">${mdcEsc(h)}</th>`).join('')}</tr></thead>
          <tbody>${d.rows.map(r=>`<tr>${r.map(c=>`<td style="border:1px solid #999;padding:5px">${mdcEsc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;
        area.innerHTML = `<div style="padding:12mm;font-family:Cairo,Tahoma,sans-serif;direction:rtl"><h2 style="text-align:center">${mdcEsc(d.title)}</h2>${table}</div>`;
        const prev = document.title; document.title = d.title;
        setTimeout(()=>{ window.print(); setTimeout(()=>{ document.title=prev; if(typeof clearAllPrintAreas==='function')clearAllPrintAreas(); },600); },50);
        return;
      }
      // Excel CSV
      // [إصلاح أمني 2026-09-04] CSV Formula Injection: أي خلية نصية تبدأ بـ = أو + أو - أو @ (أو
      // Tab/CR) يمكن لبرنامج جداول (Excel/LibreOffice) أن يفسّرها كصيغة تُنفَّذ تلقائياً عند فتح
      // الملف، وليس كنص عادي - حتى لو كانت الخلية داخل علامتي تنصيص CSV (التنصيص يمنع كسر بنية
      // الأعمدة فقط، ولا علاقة له بمنع تفسير الصيغ). المصدر هنا بيانات فعلية (أسماء معلمين/طلاب/
      // فصول) قد يتحكم فيها مستخدم عادي (معلم يُدخل اسمه)، فيجب تحييد أي خلية تبدأ بأحد هذه الرموز
      // بإضافة علامة اقتباس مفردة ' في البداية (تمنع تفسيرها كصيغة مع إبقاء القيمة مقروءة للعين).
      const csvSafeCell = (v) => {
        let s = String(v == null ? '' : v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      };
      const lines = [d.headers.map(csvSafeCell).join(',')].concat(d.rows.map(r => r.map(csvSafeCell).join(',')));
      const blob = new Blob(['\ufeff'+lines.join('\n')], {type:'text/csv;charset=utf-8'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (d.title||'تفاصيل').replace(/\s+/g,'_') + '.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    };


    GSP.renderMonitorDashCards = function(){
      const wrap = document.getElementById('monitorDashCards');
      const defaultGrid = document.getElementById('defaultKpiGrid');
      if (!wrap) return;
      const show = currentAccountType === 'monitor' || currentAccountType === 'stageadmin' || currentAccountType === 'superadmin';
      if (!show || currentAccountType === 'teacher') {
        wrap.style.display = 'none';
        if (defaultGrid) defaultGrid.style.display = '';
        return;
      }
      // لمدير المرحلة: أخفِ الشبكة الافتراضية
      if (currentAccountType === 'monitor') {
        if (defaultGrid) defaultGrid.style.display = 'none';
        wrap.style.display = 'block';
      } else {
        // للإدارة: أظهر البطاقات التفاعلية إضافية تحت الشبكة
        if (defaultGrid) defaultGrid.style.display = '';
        wrap.style.display = 'block';
      }

      const db = loadDB();
      // فلاتر
      const fc = document.getElementById('mdcFilterClass');
      const fs = document.getElementById('mdcFilterSubject');
      const ft = document.getElementById('mdcFilterTeacher');
      if (fc && !fc._mdcFilled) {
        fc._mdcFilled = true;
      }
      if (fc) {
        const prev = fc.value;
        fc.innerHTML = '<option value="">كل الفصول</option>'+(db.classes||[]).map(c=>`<option value="${mdcEsc(c)}">${mdcEsc(typeof classSectionLabel==='function'?classSectionLabel(c):c)}</option>`).join('');
        if ([...fc.options].some(o=>o.value===prev)) fc.value = prev;
      }
      if (fs) {
        const prev = fs.value;
        fs.innerHTML = '<option value="">كل المواد</option>'+(db.subjects||[]).map(s=>`<option value="${mdcEsc(s.name)}">${mdcEsc(s.name)}</option>`).join('');
        if ([...fs.options].some(o=>o.value===prev)) fs.value = prev;
      }
      if (ft) {
        const prev = ft.value;
        ft.innerHTML = '<option value="">كل المعلمين</option>'+(db.teachers||[]).map(t=>`<option value="${mdcEsc(String(t.id))}">${mdcEsc(t.name)}</option>`).join('');
        if ([...ft.options].some(o=>o.value===prev)) ft.value = prev;
      }

      const students = db.students||[];
      const teachers = db.teachers||[];
      const classes = db.classes||[];
      const subjects = db.subjects||[];
      const root = typeof getRootDB==='function' ? getRootDB() : {stages:[]};
      let stageCount = 1;
      if (currentAccountType==='monitor' && currentStageMonitor)
        stageCount = (currentStageMonitor.stageIds||[]).length || 1;
      else if (currentAccountType==='stageadmin' && currentStageAdmin)
        stageCount = (currentStageAdmin.stageIds||[]).length || 1;
      else if (currentAccountType==='superadmin')
        stageCount = (root.stages||[]).length || 1;

      let progress = 0, missing = 0;
      if (typeof GSP.allCompletion==='function') {
        const c = GSP.allCompletion();
        progress = c.pct; missing = c.missing;
      } else {
        progress = parseInt(String(document.getElementById('dashGrades')?.textContent||'0'),10)||0;
        missing = parseInt(String(document.getElementById('dashIssues')?.textContent||'0'),10)||0;
      }

      const ratio = teachers.length ? Math.round(students.length / teachers.length) : 0;
      const sizes = classes.map(ck => (students.filter(s=>classSectionKey(s.class,s.section)===ck).length)).filter(n=>n>0);
      const avgDensity = sizes.length ? Math.round(sizes.reduce((a,b)=>a+b,0)/sizes.length) : 0;

      const grid = document.getElementById('mdcGrid');
      if (!grid) return;
      const cards = [
        { key:'stages', label:'🏛️ المراحل', value: stageCount, note:'اضغط لعرض الأسماء' },
        { key:'students', label:'👨‍🎓 الطلاب', value: students.length, note:'بنين / بنات حسب الصف' },
        { key:'classes', label:'🏫 الفصول', value: classes.length, note:'توزيع الشعب على الصفوف' },
        { key:'density', label:'📐 الكثافة', value: avgDensity, note:'متوسط طلاب/فصل · اضغط للتفاصيل' },
        { key:'subjects', label:'📚 المواد', value: subjects.length, note:'تخصصات وتوزيع المعلمين' },
        { key:'teachers', label:'🧑‍🏫 المعلمون', value: teachers.length, note:'أداء · تعديلات · اكتمال' },
        { key:'coverage', label:'⚖️ التغطية', value: ratio ? ('1:'+ratio) : '—', note:'معلم لكل عدد من الطلاب' },
        { key:'progress', label:'📝 حالة الرصد', value: progress+'%', note: missing?('متبقٍ '+missing):'الرصد مكتمل تقريباً', bar: progress }
      ];
      grid.innerHTML = cards.map(c => `
        <div class="mdc-card" data-mdc="${c.key}" data-action="openMdcDetail" data-args='${gspArgs(['c.key'])}'>
          <div class="mdc-label">${c.label}</div>
          <div class="mdc-value">${mdcHindi(c.value)}</div>
          <div class="mdc-note">${mdcEsc(c.note)}</div>
          ${c.bar!=null?`<div class="mdc-mini"><i style="width:${Math.min(100,c.bar)}%"></i></div>`:''}
        </div>`).join('');
    };



    function updateSecurityPanelsForRole() {
      const show = currentAccountType === 'superadmin';
      const sec = document.getElementById('v22SecurityCenter');
      const sup = document.getElementById('v23SupabasePanel');
      if (sec) sec.style.display = show ? '' : 'none';
      if (sup) sup.style.display = show ? '' : 'none';
      if (show && typeof v22CheckSecurity === 'function') {
        try { v22CheckSecurity(); } catch (e) {}
      }
    }



    function applyRoleUI() {
      try { document.body.classList.remove('role-monitor'); } catch (e) {}

      const status = document.getElementById('accountStatus');
      const tabBar = document.getElementById('tabBar');
      const stageSwitchWrap = document.getElementById('stageSwitchWrap');
      const stagesTabBtn = tabBar.querySelector('[data-tab="stagesmgmt"]');
      const masterRosterTabBtn = tabBar.querySelector('[data-tab="masterroster"]');
      const securityTabBtn = tabBar.querySelector('[data-tab="security"]');

      // إغلاق عام: لا تُعرض أي تبويبات لغير المدير العام
      if (currentAccountType && currentAccountType !== 'superadmin') {
        const closure = getSystemClosure();
        if (closure.enabled) {
          if (status) status.textContent = '🔒 النظام مغلق — ' + (currentAccountType === 'teacher' ? (currentTeacher && currentTeacher.name) || 'معلم' : currentAccountType === 'monitor' ? (currentStageMonitor && currentStageMonitor.name) || 'مدير المرحلة' : (currentStageAdmin && currentStageAdmin.name) || 'مسؤول الحاسب');
          if (stageSwitchWrap) stageSwitchWrap.style.display = 'none';
          tabBar.querySelectorAll('.tab').forEach(t => { t.style.display = 'none'; t.classList.remove('active'); });
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          const pinBtn = document.getElementById('changeMyPinBtn');
          if (pinBtn) pinBtn.style.display = 'none';
          enforceSystemClosureGate();
          return;
        }
      }

      tabBar.querySelectorAll('.tab').forEach(t => t.style.display = 'inline-flex');
      if (securityTabBtn) securityTabBtn.style.display = 'none';

      // تبويب "بيانات المدرسة" حصراً لرئيس الكنترول في كل أنحاء النظام (زر شريط التبويبات + اختصار
      // قائمة "المزيد" بلوحة التحكم). أي دور آخر (مسؤول حاسب/مدير مرحلة/معلم) لا يجب أن يراه أو
      // يصل إليه إطلاقاً، وليس فقط أن يُمنع من التعديل فيه.
      const schoolInfoTabBtn = tabBar.querySelector('[data-tab="schoolinfo"]');
      const dashMoreSchoolInfoBtn = document.getElementById('dashMoreSchoolInfoBtn');
      const isSuperadminNow = currentAccountType === 'superadmin';
      if (schoolInfoTabBtn) schoolInfoTabBtn.style.display = isSuperadminNow ? 'inline-flex' : 'none';
      if (dashMoreSchoolInfoBtn) dashMoreSchoolInfoBtn.style.display = isSuperadminNow ? '' : 'none';
      if (!isSuperadminNow && (
        (schoolInfoTabBtn && schoolInfoTabBtn.classList.contains('active')) ||
        document.getElementById('tab-schoolinfo')?.classList.contains('active')
      )) {
        if (schoolInfoTabBtn) schoolInfoTabBtn.classList.remove('active');
        const si = document.getElementById('tab-schoolinfo'); if (si) si.classList.remove('active');
        setTimeout(() => ensureTabActive('dashboard'), 0);
      }

      if (currentAccountType === 'superadmin') {
        const root = getRootDB();
        const _stRec = currentStageId ? (root.stages.find(s => s.id === currentStageId) || null) : null;
        const stageName = _stRec ? stageDisplayLabel(_stRec) : null;
        status.textContent = '🔑 مسجل الدخول كـ: رئيس الكنترول' + (stageName ? ` — يدير حالياً: ${stageName}` : '');
        stageSwitchWrap.style.display = root.stages.length ? 'flex' : 'none';
        populateStageSwitcher();
        document.getElementById('teachersTabStageFilterWrap').style.display = root.stages.length > 1 ? 'flex' : 'none';
        if (root.stages.length > 1) populateStageSwitcher(null, 'teachersTabStageSelect');
        stagesTabBtn.style.display = 'inline-flex';
        masterRosterTabBtn.style.display = 'inline-flex';
        if (securityTabBtn) securityTabBtn.style.display = 'inline-flex';
        document.getElementById('changeMyPinBtn').style.display = 'none';
        if (!currentStageId) {
          tabBar.querySelectorAll('.tab').forEach(t => {
            if (t.dataset.tab !== 'stagesmgmt' && t.dataset.tab !== 'masterroster' && t.dataset.tab !== 'dashboard') t.style.display = 'none';
          });
          tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          const dashBtn0 = tabBar.querySelector('[data-tab="dashboard"]');
          if (dashBtn0) dashBtn0.style.display = 'inline-flex';
          ensureTabActive('dashboard');
        }
      } else if (currentAccountType === 'stageadmin') {
        const root = getRootDB();
        const stage = root.stages.find(s => s.id === currentStageId);
        status.textContent =
          `💻 مسجل الدخول كـ: مسؤول الحاسب (${currentStageAdmin ? currentStageAdmin.name : ''}) — ${stage ? stageDisplayLabel(stage) : ''}`;
        const assignedStageIds = (currentStageAdmin && currentStageAdmin.stageIds) || [];
        stageSwitchWrap.style.display = assignedStageIds.length > 1 ? 'flex' : 'none';
        if (assignedStageIds.length > 1) populateStageSwitcher(assignedStageIds);
        document.getElementById('teachersTabStageFilterWrap').style.display = assignedStageIds.length > 1 ? 'flex' : 'none';
        if (assignedStageIds.length > 1) populateStageSwitcher(assignedStageIds, 'teachersTabStageSelect');
        stagesTabBtn.style.display = 'none';
        masterRosterTabBtn.style.display = 'none';
        document.getElementById('changeMyPinBtn').style.display = 'inline-flex';
        if (stagesTabBtn.classList.contains('active') || document.getElementById('tab-stagesmgmt')?.classList.contains('active')) {
          stagesTabBtn.classList.remove('active');
          const sm = document.getElementById('tab-stagesmgmt'); if (sm) sm.classList.remove('active');
          tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          const dashBtnA = tabBar.querySelector('[data-tab="dashboard"]');
          if (dashBtnA) dashBtnA.classList.add('active');
          ensureTabActive('dashboard');
        }
      } else if (currentAccountType === 'monitor') {
        const root = getRootDB();
        const stage = root.stages.find(s => s.id === currentStageId);
        status.textContent =
          `🏫 مسجل الدخول كـ: مدير المرحلة (${currentStageMonitor ? currentStageMonitor.name : ''}) — ${stage ? stageDisplayLabel(stage) : ''} — رقابة ومتابعة`;
        const assignedStageIds = (currentStageMonitor && currentStageMonitor.stageIds) || [];
        stageSwitchWrap.style.display = assignedStageIds.length > 1 ? 'flex' : 'none';
        if (assignedStageIds.length > 1) populateStageSwitcher(assignedStageIds);
        document.getElementById('changeMyPinBtn').style.display = 'inline-flex';
        if (stagesTabBtn) stagesTabBtn.style.display = 'none';
        if (masterRosterTabBtn) masterRosterTabBtn.style.display = 'none';
        // عرض فقط: لوحة / درجات / مواظبة / إحصائيات
        const monTabs = ['dashboard', 'students', 'teachers', 'grades', 'attendance', 'stats', 'printcenter'];
        // احفظ التبويب الحالي من الزر أو من محتوى .tab-content.active (مهم مع واجهة المراقب حيث يُخفى شريط التبويبات)
        const prevMonTab = (typeof getCurrentActiveTabName === 'function' ? getCurrentActiveTabName() : null)
          || ((document.querySelector('.tab.active') || {}).dataset || {}).tab || null;
        tabBar.querySelectorAll('.tab').forEach(t => {
          t.style.display = monTabs.includes(t.dataset.tab) ? 'inline-flex' : 'none';
          t.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const keepM = monTabs.includes(prevMonTab) ? prevMonTab : 'dashboard';
        ensureTabActive(keepM);
        document.body.classList.add('role-monitor');
        try {
          const qa = document.getElementById('quickActionsGrid');
          if (qa) qa.innerHTML = `
            <button type="button" class="qa-btn primary" data-action="activateTab" data-args='${gspArgs(['stats'])}'>📊 الإحصائيات</button>
            <button type="button" class="qa-btn" data-action="activateTab" data-args='${gspArgs(['grades'])}'>📝 عرض الدرجات</button>
            <button type="button" class="qa-btn" data-action="activateTab" data-args='${gspArgs(['attendance'])}'>📅 الغياب</button>
            <button type="button" class="qa-btn" data-action="openMdcDetail" data-args='${gspArgs(['progress'])}'>📝 حالة الرصد</button>`;
          const sub = document.getElementById('dashboardSubtitle');
          if (sub) sub.textContent = 'رقابة المرحلة — اضغط أي بطاقة لعرض التفاصيل والتصدير';
          setTimeout(function(){ if (typeof renderMonitorDashCards==='function') renderMonitorDashCards(); }, 80);
        } catch (eMon) {}
      } else if (currentAccountType === 'teacher') {
        document.body.classList.remove('role-monitor');
        status.textContent = `👤 مسجل الدخول كـ: ${currentTeacher.name} (${teacherSubjectNames(currentTeacher).join('، ')})`;
        stageSwitchWrap.style.display = 'none';
        document.getElementById('changeMyPinBtn').style.display = 'none';
        const teacherTabs = ['grades','dashboard','attendance','printcenter'];
        const prevTeacherTab = (typeof getCurrentActiveTabName === 'function' ? getCurrentActiveTabName() : null)
          || ((document.querySelector('.tab.active') || {}).dataset || {}).tab || null;
        tabBar.querySelectorAll('.tab').forEach(t => {
          t.style.display = teacherTabs.includes(t.dataset.tab) ? 'inline-flex' : 'none';
          t.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const keepT = teacherTabs.includes(prevTeacherTab) ? prevTeacherTab : 'dashboard';
        ensureTabActive(keepT);
      }

      // مركز الطباعة: رئيس كنترول / مسؤول حاسب / مدير مرحلة فقط (ليس المعلم)
      try {
        const pcBtn = tabBar.querySelector('[data-tab="printcenter"]');
        if (pcBtn) {
          const allowPc = currentAccountType === 'superadmin'
            || currentAccountType === 'stageadmin'
            || currentAccountType === 'monitor'
            || currentAccountType === 'teacher';
          pcBtn.style.display = allowPc ? 'inline-flex' : 'none';
        }
      } catch (e) {}

      const superAdminPassCard = document.getElementById('superAdminPassCard');
      if (superAdminPassCard) superAdminPassCard.style.display = currentAccountType === 'superadmin' ? 'block' : 'none';
      try { loadSystemClosureUI(); } catch (e) {}

      // كل دالة هنا مُغلَّفة بمحاولة/التقاط منفصلة: فشل دالة واحدة (بسبب بيانات غير متوقعة مثلاً)
      // لم يعد يوقف تنفيذ بقية الدوال، وهو ما كان يترك تبويبات أخرى (كالإحصائيات/المعلمين/بيانات
      // المدرسة) فارغة تماماً بلا سبب ظاهر كلما فشلت دالة سابقة لها في هذه القائمة بصمت.
      const safeCalls = [
        ['loadStudentsUI', loadStudentsUI], ['loadSubjectsUI', loadSubjectsUI], ['updateFilters', updateFilters],
        ['loadStatsUI', loadStatsUI], ['loadTeachersUI', loadTeachersUI], ['updateSchoolInfoDisplay', updateSchoolInfoDisplay],
        ['populateMonthSelects', populateMonthSelects], ['updateGlobalLockUI', updateGlobalLockUI],
        ['applyImportSectionRestriction', applyImportSectionRestriction],
        ['populateTeacherImportTargetSelectors', populateTeacherImportTargetSelectors],
        ['renderMonthlyExportButtons', function () {
          if (typeof GSP !== 'undefined' && typeof GSP.renderMonthlyExportButtons === 'function') {
            GSP.renderMonthlyExportButtons();
          }
        }],
        ['renderMasterStudentSearch', () => renderMasterStudentSearch('')],
      ];
      safeCalls.forEach(([name, fn]) => { try { fn(); } catch (e) { console.error(name + ' failed inside applyRoleUI:', e); } });
      if (currentAccountType === 'superadmin') { try { loadStagesMgmtUI(); } catch (e) { console.error('loadStagesMgmtUI failed:', e); } }
      try { updateSecurityPanelsForRole(); } catch (e) { console.error('updateSecurityPanelsForRole failed:', e); }
      try { enforceSystemClosureGate(); } catch (e) { console.error('enforceSystemClosureGate failed:', e); }
    }



    // يستنتج نوع المرحلة التعليمي (kg/primary/prep/secondary) من اسم المرحلة التنظيمية
    function inferEducationalStageTypeFromName(name) {
      const raw = String(name || '');
      const n = (typeof normalizeArabicText === 'function') ? normalizeArabicText(raw) : raw;
      if (/رياض|روضه|\bkg\b|kg/.test(n) || /رياض|روضة|KG/i.test(raw)) return 'kg';
      if (/ابتدائ/.test(n) || /ابتدائ/.test(raw)) return 'primary';
      if (/اعداد|إعداد/.test(raw) || /اعداد|اعدادي|إعدادي/.test(n)) return 'prep';
      if (/ثانو/.test(n) || /ثانو/.test(raw)) return 'secondary';
      return null;
    }



    function getStageAdminAllowedImportSections() {
      let allowed = ['arabic', 'languages'];
      if (currentAccountType === 'stageadmin' && currentStageAdmin && Array.isArray(currentStageAdmin.sections) &&
        currentStageAdmin.sections.length) {
        allowed = currentStageAdmin.sections.slice();
      }
      const stageRec = typeof getStageRecord === 'function' ? getStageRecord(currentStageId) : null;
      if (stageRec && stageRec.section) {
        const narrowed = allowed.filter(s => s === stageRec.section);
        allowed = narrowed.length ? narrowed : [stageRec.section];
      }
      return allowed;
    }



    // قوائم الاستيراد لمدير المرحلة: تُعاد بناؤها بالخيارات المسموحة فقط (لا مجرد disabled —
    // لأن بعض المتصفحات ما زالت تعرض الخيارات المعطّلة وتسمح باختيارها).
    function applyImportSectionRestriction() {
      const sectionSel = document.getElementById('importSection');
      const stageTypeSel = document.getElementById('importStage');
      const gradeSel = document.getElementById('importGrade');
      if (!sectionSel || !stageTypeSel) return;

      const SECTION_OPTS = [
        { value: 'arabic', label: 'عربي' },
        { value: 'languages', label: 'لغات' }
      ];
      const STAGE_OPTS = [
        { value: 'kg', label: 'رياض أطفال' },
        { value: 'primary', label: 'ابتدائي' },
        { value: 'prep', label: 'إعدادى' },
        { value: 'secondary', label: 'ثانوي' }
      ];

      // رئيس الكنترول: أعد كل الخيارات كاملة
      if (currentAccountType !== 'stageadmin' || !currentStageAdmin) {
        const curSec = sectionSel.value;
        const curStage = stageTypeSel.value;
        sectionSel.innerHTML = '<option value="">-- اختر القسم --</option>' +
          SECTION_OPTS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
        if (curSec) sectionSel.value = curSec;
        stageTypeSel.innerHTML = '<option value="">-- اختر المرحلة --</option>' +
          STAGE_OPTS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
        if (curStage) { stageTypeSel.value = curStage; if (typeof onImportStageChange === 'function') onImportStageChange(); }
        return;
      }

      // --- مدير مرحلة: قسم مسموح فقط ---
      const allowedSec = getStageAdminAllowedImportSections();
      const prevSec = sectionSel.value;
      sectionSel.innerHTML = '<option value="">-- اختر القسم --</option>' +
        SECTION_OPTS.filter(o => allowedSec.includes(o.value))
          .map(o => `<option value="${o.value}">${o.label}</option>`).join('');
      if (allowedSec.includes(prevSec)) sectionSel.value = prevSec;
      else if (allowedSec.length === 1) sectionSel.value = allowedSec[0];
      else sectionSel.value = '';

      // --- نوع المرحلة من اسم المرحلة التنظيمية ---
      const stageRec = typeof getStageRecord === 'function' ? getStageRecord(currentStageId) : null;
      const inferred = stageRec ? inferEducationalStageTypeFromName(stageRec.name) : null;
      if (inferred) {
        const only = STAGE_OPTS.filter(o => o.value === inferred);
        stageTypeSel.innerHTML = only.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
        stageTypeSel.value = inferred;
        if (typeof onImportStageChange === 'function') onImportStageChange();
      } else {
        // لا استنتاج موثوق: أبقِ القائمة كاملة لكن الرسالة توضح الاعتماد على التحقق عند المعالجة
        const curStage = stageTypeSel.value;
        stageTypeSel.innerHTML = '<option value="">-- اختر المرحلة --</option>' +
          STAGE_OPTS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
        if (curStage) stageTypeSel.value = curStage;
      }
    }
