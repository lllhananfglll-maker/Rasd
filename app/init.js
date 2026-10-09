/**
 * js/app/init.js — الجزء 9/9 من app.js السابق (بعد التقسيم لتحسين قابلية الصيانة)
 * المحتوى: السحب والإفلات + التبويبات + التهيئة الابتدائية init()
 * يعتمد على: نفس النطاق المشترك (window/global scope) الذي كان عليه app.js — يجب تحميله
 * بنفس ترتيب الأجزاء كما في index.html، لأن بعض الدوال هنا تُستدعى من دوال معرّفة في أجزاء لاحقة.
 */
'use strict';

    //  DRAG & DROP / TABS / INIT
    // ============================================================
    document.getElementById('uploadArea').addEventListener('dragover', e => {
      e.preventDefault();
      document.getElementById('uploadArea').style.borderColor = '#1e3a5f';
      document.getElementById('uploadArea').style.background = '#f1f5f9';
    });
    document.getElementById('uploadArea').addEventListener('dragleave', () => {
      document.getElementById('uploadArea').style.borderColor = '#94a3b8';
      document.getElementById('uploadArea').style.background = '#f8fafc';
    });
    document.getElementById('uploadArea').addEventListener('drop', e => {
      e.preventDefault();
      document.getElementById('uploadArea').style.borderColor = '#94a3b8';
      document.getElementById('uploadArea').style.background = '#f8fafc';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        document.getElementById('fileInput').files = files;
        document.getElementById('fileInput').dispatchEvent(new Event('change'));
      }
    });

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', function() {
        // أزل أي طبقة نافذة عالقة قد تحجب النقر عن التبويبات
        try {
          ['stalePushModalOverlay','missingGradesModalOverlay','gradeConflictModalOverlay','uiModalOverlay'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.style.setProperty('display', 'none', 'important');
            el.classList.add('hidden');
          });
        } catch (eHide) {}

        if (currentRole === 'teacher' && !['grades','dashboard','attendance','printcenter'].includes(this.dataset.tab)) {
          console.warn('tab blocked for teacher:', this.dataset.tab);
          return;
        }
        if (this.dataset.tab === 'stagesmgmt' && currentAccountType !== 'superadmin') {
          console.warn('tab stagesmgmt requires superadmin');
          return;
        }
        if (this.dataset.tab === 'masterroster' && currentAccountType !== 'superadmin') {
          console.warn('tab masterroster requires superadmin');
          return;
        }
        const tabPermission = ({students:'students.view', subjects:'subjects.view', grades:'grades.view', attendance:'attendance.view', teachers:'teachers.view', schoolinfo:'schoolInfo.view', upload:'importExport.view', security:'audit.view'})[this.dataset.tab];
        if (tabPermission && typeof GSP !== 'undefined' && GSP.permissionMatrix && !GSP.permissionMatrix.can(tabPermission)) {
          console.warn('tab blocked by permission:', this.dataset.tab, tabPermission, 'role=', currentAccountType);
          try {
            if (typeof showAlert === 'function') showAlert('⚠️ ليس لديك صلاحية لفتح هذا التبويب.', 'warning');
            else if (typeof alert === 'function') alert('⚠️ ليس لديك صلاحية لفتح هذا التبويب.');
          } catch (ePerm) {}
          return;
        }
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        // بعض تبويبات المحتوى استثناءً لا تتبع نمط التسمية "tab-الاسم" (مثل dashboard و security
        // اللذين معرّفهما نفس اسم التبويب مباشرة)، فنجرّب المعرّف بالنمط المعتاد أولاً ثم المعرّف
        // المباشر كبديل، بدل الاعتماد على نمط واحد فقط قد يُرجع null ويوقف باقي الكود هنا بالخطأ.
        const tabContentEl = document.getElementById('tab-' + this.dataset.tab) || document.getElementById(this.dataset.tab);
        if (tabContentEl) tabContentEl.classList.add('active');
        else console.warn('tab content element not found for', this.dataset.tab);
        try {
          if (this.dataset.tab === 'upload') applyImportSectionRestriction();
          if (this.dataset.tab === 'students') loadStudentsUI();
          if (this.dataset.tab === 'subjects') loadSubjectsUI();
          if (this.dataset.tab === 'grades') { updateSubjectDropdowns();
            updateGlobalLockUI();
            updateFilters(); }
          if (this.dataset.tab === 'stats') loadStatsUI();
          if (this.dataset.tab === 'teachers') loadTeachersUI();
          if (this.dataset.tab === 'schoolinfo') loadSchoolInfoFormUI();
          if (this.dataset.tab === 'dashboard') updateDashboard();
          if (this.dataset.tab === 'security') { renderAuditLog(); renderConflictLog(); renderVersionsList(); }
          if (this.dataset.tab === 'stagesmgmt') loadStagesMgmtUI();
          if (this.dataset.tab === 'masterroster') renderMasterStudentSearch('');
          if (this.dataset.tab === 'attendance') loadAttendanceUI();
          if (this.dataset.tab === 'printcenter') loadPrintCenterUI();
        } catch (e) {
          console.error('tab load failed for ' + this.dataset.tab + ':', e);
        }
      });
    });

    // ============================================================
    //  INIT
    // ============================================================
    async function init() {
      applyDarkModePreference();
      setConnBadge();

      try {
        const cloudSess = await restoreCloudSession();
        if (cloudSess && cloudSess.profile) {
          if (isOnline) { try { await pullAllStagesFromCloud(); } catch (e) { console.warn(e); } }
          applyCloudProfileLogin(cloudSess.profile);
          const dbCloud = getDB();
          updateSchoolInfoDisplay();
          populateMonthSelects();
          if (typeof GSP !== 'undefined' && typeof GSP.renderMonthlyExportButtons === 'function') {
            GSP.renderMonthlyExportButtons();
          }
          const md = document.getElementById('monthlyDivideModeSelect');
          if (md) md.value = getMonthlyDivideMode();
          if (dbCloud.schoolInfo) {
            const info = dbCloud.schoolInfo;
            if (info.classLanguage) document.getElementById('importSection').value = info.classLanguage;
            if (info.stageType) {
              document.getElementById('importStage').value = info.stageType;
              onImportStageChange();
              if (info.grade) document.getElementById('importGrade').value = info.grade;
            }
            if (info.term) document.getElementById('importTermSelect').value = info.term;
          }
          applyImportSectionRestriction();
          updateDashboard();
          return;
        }
      } catch (e) { console.warn('cloud restore', e); }

      if (isOnline) {
        try { await pullAllStagesFromCloud(); } catch (e) { console.warn('pull before login (RLS may block anon):', e); }
      }

      const session = loadSession();
      const root = getRootDB();
      if (session && session.accountType === 'superadmin') {
        currentAccountType = 'superadmin';
        currentRole = 'admin';
        currentTeacher = null;
        currentStageAdmin = null;
        currentStageId = (session.stageId && root.stages.find(s => s.id === session.stageId)) ?
          session.stageId : ((root.stages[0] && root.stages[0].id) || null);
        document.getElementById('authOverlay').style.display = 'none'; document.body.classList.remove('auth-open');
        applyRoleUI();
        recordAudit('تسجيل الدخول','تم تسجيل الدخول كرئيس الكنترول');
      } else if (session && session.accountType === 'stageadmin') {
        const admin = root.stageAdmins.find(a => a.id === session.stageAdminId);
        const validStageIds = admin ? (admin.stageIds || []).filter(id => root.stages.some(s => s.id === id)) : [];
        if (admin && validStageIds.length) {
          currentAccountType = 'stageadmin';
          currentRole = 'admin';
          currentTeacher = null;
          currentStageAdmin = admin;
          currentStageMonitor = null;
          currentStageId = validStageIds.includes(session.stageId) ? session.stageId : validStageIds[0];
          document.getElementById('authOverlay').style.display = 'none'; document.body.classList.remove('auth-open');
          applyRoleUI();
          Promise.resolve(enforceSystemClosureGateAsync()).catch(() => enforceSystemClosureGate());
          recordAudit('استعادة الجلسة','تم استعادة جلسة مسؤول الحاسب');
        } else { clearSession();
          showAuthMode('admin'); }
      } else if (session && session.accountType === 'monitor') {
        const mon = (root.stageMonitors || []).find(a => a.id === session.stageMonitorId);
        const validStageIds = mon ? (mon.stageIds || []).filter(id => root.stages.some(s => s.id === id)) : [];
        if (mon && validStageIds.length) {
          currentAccountType = 'monitor';
          currentRole = 'viewer';
          currentTeacher = null;
          currentStageAdmin = null;
          currentStageMonitor = mon;
          currentStageId = validStageIds.includes(session.stageId) ? session.stageId : validStageIds[0];
          document.getElementById('authOverlay').style.display = 'none'; document.body.classList.remove('auth-open');
          applyRoleUI();
          Promise.resolve(enforceSystemClosureGateAsync()).catch(() => enforceSystemClosureGate());
          recordAudit('استعادة الجلسة','تم استعادة جلسة مدير المرحلة');
        } else { clearSession(); showAuthMode('admin'); }
      } else if (session && session.accountType === 'teacher') {
        const stage = root.stages.find(s => s.id === session.stageId);
        const teacher = stage && (stage.data.teachers || []).find(t => t.id === session.teacherId);
        if (teacher) {
          currentAccountType = 'teacher';
          currentRole = 'teacher';
          currentStageAdmin = null;
          currentStageId = session.stageId;
          currentTeacher = teacher;
          document.getElementById('authOverlay').style.display = 'none'; document.body.classList.remove('auth-open');
          applyRoleUI();
          Promise.resolve(enforceSystemClosureGateAsync()).catch(() => enforceSystemClosureGate());
          recordAudit('استعادة الجلسة','تم استعادة جلسة المعلم');
        } else { clearSession();
          showAuthMode('admin'); }
      } else {
        showAuthMode('admin');
      }

      // بيانات المرحلة الحالية (إن وُجدت) بعد استعادة الجلسة أعلاه
      const db = getDB();
      updateSchoolInfoDisplay();
      populateMonthSelects();
      if (typeof GSP !== 'undefined' && typeof GSP.renderMonthlyExportButtons === 'function') {
        GSP.renderMonthlyExportButtons();
      }

      // استعادة آخر اختيار محفوظ لطريقة تصدير الدرجة الشهرية للشهر المنفرد (درجة الاختبارات
      // الشهرية بين شهور الفصل أصبحت تُحسب تلقائياً بالكامل - انظر getAutoExamAggregationMode)
      const monthlyDivideModeSel = document.getElementById('monthlyDivideModeSelect');
      if (monthlyDivideModeSel) monthlyDivideModeSel.value = getMonthlyDivideMode();

      // استعادة آخر اختيار للقسم/المرحلة/الصف/الفصل الدراسي في شاشة رفع الملف
      if (db.schoolInfo) {
        const info = db.schoolInfo;
        if (info.classLanguage) document.getElementById('importSection').value = info.classLanguage;
        if (info.stageType) {
          document.getElementById('importStage').value = info.stageType;
          onImportStageChange();
          if (info.grade) document.getElementById('importGrade').value = info.grade;
        }
        if (info.term) document.getElementById('importTermSelect').value = info.term;
      }
      applyImportSectionRestriction();

      if (db.students && db.students.length > 0) {
        const gradesPresent = [...new Set(Object.values(db.classGrade || {}))].filter(Boolean);
        document.getElementById('uploadStatus').textContent =
          `✅ تم تحميل بيانات سابقة: ${db.students.length} طالب، ${db.subjects.length} مادة، ${gradesPresent.length} صف (${gradesPresent.join('، ')})`;
        document.getElementById('uploadStatus').style.color = '#0b5e42';
        if (db.metaByGrade && Object.keys(db.metaByGrade).length) {
          document.getElementById('uploadMessages').innerHTML =
            '<div class="success-box">💾 توجد نسخ محفوظة من ملفات Excel الأصلية يمكن تنزيلها محدثة (اختر الصف أولاً من القائمة بجانب زرَّي "الفصل الأول/الثاني")، بالإضافة لأزرار التصدير الشهري والسنوي التي تغطي كل الصفوف معاً، دون الحاجة لإعادة رفع أي ملف.</div>';
        }
      } else {
        document.getElementById('uploadStatus').textContent = currentStageId ? '📂 قم برفع ملف Excel للبدء' :
          '🏛️ يرجى إضافة مرحلة دراسية أولاً من تبويب "إدارة المراحل"، ثم رفع ملف Excel لها.';
      }
      updateDashboard();
      recordAudit('فتح النظام','تم تشغيل النسخة ' + APP_VERSION);
    }
    (async function bootstrap() {
      await loadRootDBIntoCache();
      try {
        const root0 = getRootDB();
        if (ensureFixedStages(root0)) persistRootDB(root0);
      } catch (e) { console.warn('ensureFixedStages', e); }
      init();
    })();
  
