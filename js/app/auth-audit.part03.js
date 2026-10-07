/* auth-audit.part03.js — generated from auth-audit.js; execution order is significant. */


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
