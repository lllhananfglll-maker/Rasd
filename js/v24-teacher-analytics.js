(function(){
  'use strict';
  const esc = escapeHtml; // مصدر واحد لمنطق الهروب من HTML (راجع تعريف escapeHtml الرئيسي)
  function db(){ return GSP.gspSafeDb(); }
  function relevantComponents(subject){ return GSP.gspRelevantGradeComponents(subject); }

  const TEACHER_ACTIONS_HTML = `
    <button type="button" class="qa-btn primary" data-action="openTeacherDailyAttendance" data-args='${gspArgs([])}'>📅 تسجيل حضور اليوم</button>
    <button type="button" class="qa-btn" data-action="activateTab" data-args='${gspArgs(['grades'])}'>📝 إدخال الدرجات</button>
    <button type="button" class="qa-btn" data-action="activateTab" data-args='${gspArgs(['attendance'])}'>📋 كشف المواظبة الشهري</button>
    <button type="button" class="qa-btn" data-action="exportTeacherMyDataPackage" data-args='${gspArgs([])}'>📤 تصدير درجاتي</button>
    <button type="button" class="qa-btn" data-action="triggerImportTeacherMyDataPackage" data-args='${gspArgs([])}'>📥 استيراد درجاتي</button>
    <button type="button" class="qa-btn" data-action="v20FocusSearch">🔎 البحث عن طالب</button>
    <input type="file" id="teacherImportFileInput" accept=".json,application/json" style="display:none" data-event-type="change" data-event-action="importTeacherMyDataPackage" data-event-with-event>
  `;
  let _originalActionsHtml = null;

  // يستبدل "الإجراءات السريعة" في أعلى لوحة التحكم بإجراءات يستطيع المعلم فعلياً استخدامها (بقية
  // الأزرار الأصلية تشير لتبويبات ممنوع عليه الدخول إليها أصلاً، فتبدو معطّلة بلا سبب ظاهر له).
  function applyQuickActionsForRole(){
    const grid = document.getElementById('quickActionsGrid');
    if (!grid) return;
    if (_originalActionsHtml === null) _originalActionsHtml = grid.innerHTML;
    grid.innerHTML = (currentAccountType === 'teacher') ? TEACHER_ACTIONS_HTML : _originalActionsHtml;
  }

  function buildTeacherBlock(){
    if (document.getElementById('v24TeacherBlock')) return;
    const mount = document.getElementById('v24TeacherMount') || document.getElementById('dashDetailsBody') || document.getElementById('dashboard');
    if (!mount) return;
    const wrap = document.createElement('div');
    wrap.id = 'v24TeacherBlock';
    wrap.style.display = 'none';
    wrap.innerHTML = `
      <div class="kpi-grid" id="v24ExtraKpiGrid" style="margin-top:12px"></div>
      <div class="v20-grid" style="margin-top:12px">
        <div class="v20-card"><h3>📊 نسبة الإكمال لكل فصل</h3><div id="v24ClassBarChart" style="display:flex;justify-content:center"></div></div>
        <div class="v20-card"><h3>🧩 الدرجات المرصودة مقابل الناقصة</h3><div id="v24DonutChart" style="display:flex;justify-content:center"></div></div>
      </div>
      <div class="v20-grid" style="margin-top:12px" id="v24ClassCardsWrap"></div>
      <div class="v20-grid" style="margin-top:12px">
        <div class="v20-card"><h3>📚 موادّي وفصولي — نسبة الإكمال</h3><div id="v24SubjectTable"></div></div>
        <div class="v20-card"><h3>👨‍🎓 طلاب بلا درجات في موادّي</h3><div id="v24MissingList" class="v20-list"></div></div>
      </div>`;
    mount.appendChild(wrap);
  }

  function applyTeacherKpiLabels(){
    const map = {
      kpiLabelStudents: '👨‍🎓 طلابي', kpiNoteStudents: 'في فصولك المسندة إليك',
      kpiLabelTeachers: '📚 فصولي', kpiNoteTeachers: 'الفصول التي تدرّسها',
      kpiLabelIssues: '⚠️ يحتاج مراجعة', kpiNoteIssues: 'طلاب بلا أي درجة مسجَّلة',
    };
    Object.entries(map).forEach(([id, txt]) => { const el = document.getElementById(id); if (el) el.textContent = txt; });
  }

  function renderTeacherAnalytics(){
    applyQuickActionsForRole();
    buildTeacherBlock();
    const block = document.getElementById('v24TeacherBlock');
    if (!block) return;
    if (currentAccountType !== 'teacher' || !currentTeacher) { block.style.display = 'none'; return; }
    block.style.display = 'block';
    applyTeacherKpiLabels();

    const d = db(), subjects = d.subjects||[], students = d.students||[], grades = d.grades||[];
    const rows = [];
    const missingStudents = [];
    const classAgg = new Map(); // key -> { studentIds:Set, done, expected, scoreSum, maxSum, subjects:Set }
    let totalScoreSum = 0, totalMaxSum = 0, totalDone = 0, totalExpected = 0;

    (currentTeacher.assignments||[]).forEach(a=>{
      const sub = subjects.find(s=>s.name===a.subjectName);
      if (!sub) return;
      const comps = relevantComponents(sub);
      (a.classes||[]).forEach(key=>{
        const clsStudents = students.filter(st=>classSectionKey(st.class,st.section)===key && canAccessStudentGrade(a.subjectName,st));
        const expected = clsStudents.length * comps.length;
        let done = 0, scoreSum = 0, maxSum = 0;
        if (!classAgg.has(key)) classAgg.set(key, { studentIds:new Set(), done:0, expected:0, scoreSum:0, maxSum:0, subjects:new Set() });
        const agg = classAgg.get(key);
        agg.subjects.add(a.subjectName);
        clsStudents.forEach(st=>{
          agg.studentIds.add(st.id);
          let hasAny = false;
          comps.forEach(c=>{
            const ci = sub.components.indexOf(c);
            const g = grades.find(g=>g.studentId===st.id && g.subjectName===sub.name && g.componentIndex===ci && g.score!==undefined && g.score!=='');
            if (g) {
              done++; hasAny = true;
              const sc = parseFloat(g.score) || 0, mx = Number(c.maxScore) || 0;
              scoreSum += sc; maxSum += mx;
            }
          });
          if (!hasAny) missingStudents.push({ st, subject: a.subjectName, key });
        });
        const pct = expected ? Math.round(done/expected*100) : 100;
        rows.push({ subject: a.subjectName, cls: key, count: clsStudents.length, pct });
        agg.done += done; agg.expected += expected; agg.scoreSum += scoreSum; agg.maxSum += maxSum;
        totalScoreSum += scoreSum; totalMaxSum += maxSum; totalDone += done; totalExpected += expected;
      });
    });

    const uniqueStudentIds = new Set(); classAgg.forEach(agg => agg.studentIds.forEach(id => uniqueStudentIds.add(id)));
    const classCount = classAgg.size;
    const overallPct = totalExpected ? Math.round(totalDone/totalExpected*100) : (uniqueStudentIds.size ? 0 : 100);
    const overallAvgGrade = totalMaxSum ? Math.round(totalScoreSum/totalMaxSum*100) : null;

    // ── كروت المؤشرات العلوية (تُعاد كتابتها فوق قيم updateDashboard العامة) ──
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText('dashStudents', uniqueStudentIds.size);
    setText('dashTeachers', classCount);
    setText('dashGrades', overallPct + '%');
    setText('dashGradesNote', 'نسبة الإكمال في فصولك');
    setText('dashIssues', missingStudents.length);
    const bar = document.getElementById('dashProgressBar'); if (bar) bar.style.width = overallPct + '%';
    setText('dashProgressText', overallPct + '%');

    // ── كرت إضافي: معدل الدرجات العام ──
    const extraGrid = document.getElementById('v24ExtraKpiGrid');
    if (extraGrid) {
      extraGrid.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">🎯 معدل الدرجات</div><div class="kpi-value">${overallAvgGrade===null?'—':overallAvgGrade+'%'}</div><div class="kpi-note">من إجمالي الدرجات المسجَّلة</div></div>
        <div class="kpi-card"><div class="kpi-label">📖 عدد المواد</div><div class="kpi-value">${teacherSubjectNames(currentTeacher).length}</div><div class="kpi-note">المواد المسندة إليك</div></div>`;
    }

    // ── مخطط أعمدة: نسبة الإكمال لكل فصل ──
    const barChartEl = document.getElementById('v24ClassBarChart');
    if (barChartEl) {
      const bars = [...classAgg.entries()].map(([key, agg]) => ({
        label: classSectionLabel(key), hasData: agg.expected > 0,
        value: agg.expected ? Math.round(agg.done/agg.expected*100) : 100,
      }));
      barChartEl.innerHTML = bars.length ? buildBarChartSvg(bars) : '<div class="v20-empty">لا توجد فصول مسندة إليك بعد.</div>';
    }

    // ── مخطط دائري: درجات مرصودة مقابل ناقصة ──
    const donutEl = document.getElementById('v24DonutChart');
    if (donutEl) {
      const seg = [
        { value: totalDone, color: '#15803d', label: 'مرصودة' },
        { value: Math.max(0, totalExpected - totalDone), color: '#e2e8f0', label: 'ناقصة' },
      ];
      donutEl.innerHTML = buildDonutChartSvg(seg);
    }

    // ── كروت الفصول (فصل بفصل): عدد الطلاب، نسبة الإكمال، معدل الدرجات ──
    const classCardsWrap = document.getElementById('v24ClassCardsWrap');
    if (classCardsWrap) {
      const cards = [...classAgg.entries()].map(([key, agg]) => {
        const pct = agg.expected ? Math.round(agg.done/agg.expected*100) : 100;
        const avgGrade = agg.maxSum ? Math.round(agg.scoreSum/agg.maxSum*100) : null;
        const pillClass = pct===100 ? 'v20-ok' : pct<50 ? 'v20-danger' : 'v20-warn';
        return `<div class="v20-card">
          <h3>🏷️ ${esc(classSectionLabel(key))}</h3>
          <div style="font-size:13px;color:#64748b;margin-bottom:6px;">${esc([...agg.subjects].join('، '))}</div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>👨‍🎓 عدد الطلاب</span><strong>${agg.studentIds.size}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>🎯 معدل الدرجات</span><strong>${avgGrade===null?'—':avgGrade+'%'}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin:8px 0 4px;"><span>نسبة الإكمال</span><span class="v20-pill ${pillClass}">${pct}%</span></div>
          <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
        </div>`;
      }).join('');
      classCardsWrap.innerHTML = cards || '<div class="v20-card"><div class="v20-empty">لا توجد فصول مسندة إليك بعد.</div></div>';
    }

    const tableEl = document.getElementById('v24SubjectTable');
    if (tableEl) {
      tableEl.innerHTML = rows.length ?
        `<table class="v20-table"><thead><tr><th>المادة</th><th>الفصل</th><th>الطلاب</th><th>نسبة الإكمال</th></tr></thead><tbody>${
          rows.map(r=>`<tr><td>${esc(r.subject)}</td><td>${esc(classSectionLabel(r.cls))}</td><td>${r.count}</td><td><span class="v20-pill ${r.pct===100?'v20-ok':r.pct<50?'v20-danger':'v20-warn'}">${r.pct}%</span></td></tr>`).join('')
        }</tbody></table>` :
        '<div class="v20-empty">لا توجد فصول أو مواد مسندة إليك بعد.</div>';
    }

    const missingEl = document.getElementById('v24MissingList');
    if (missingEl) {
      const shown = missingStudents.slice(0, 20);
      missingEl.innerHTML = shown.length ?
        shown.map(x=>`<div class="v20-item"><div class="v20-item-main"><div class="v20-item-title">${esc(x.st.name)}</div><div class="v20-item-note">${esc(x.subject)} — ${esc(classSectionLabel(x.key))}</div></div><button class="btn btn-outline btn-sm" data-action="v20OpenStudent" data-args='${gspArgs([esc(JSON.stringify(x.st.id))])}'>فتح الملف</button></div>`).join('') +
        (missingStudents.length > 20 ? `<div style="font-size:12px;color:#64748b;margin-top:8px;text-align:center">يتم عرض أول 20 حالة فقط من إجمالي ${missingStudents.length}.</div>` : '') :
        '<div class="v20-empty">🎉 لا يوجد طلاب بلا درجات في موادك حالياً.</div>';
    }

    // ── تنبيهات مخصّصة للمعلم بدل التنبيهات العامة للمرحلة ──
    const alertsEl = document.getElementById('dashAlerts');
    if (alertsEl) {
      const arr = [];
      if (!classAgg.size) arr.push(['danger','🔴 لا توجد فصول أو مواد مسندة إليك بعد. راجع مدير المرحلة.','','']);
      if (missingStudents.length) arr.push(['warn', `🟡 يوجد ${missingStudents.length} طالب بلا أي درجة مسجَّلة في موادّك.`, "activateTab('grades')", 'رصد الدرجات']);
      if (!arr.length) arr.push(['ok', '🟢 ممتاز! رصدت درجات كل طلابك في كل فصولك.', '', '']);
      alertsEl.innerHTML = arr.map(x=>`<div class="alert-item ${x[0]}"><span>${x[1]}</span>${x[2]?`<button class="btn btn-outline btn-sm" data-action="activateTab" data-args='["grades"]'>${x[3]}</button>`:''}</div>`).join('');
    }
  }

  GSP.renderV24TeacherAnalytics = renderTeacherAnalytics;
  let _v24Timer = null;
  function scheduleV24(){ clearTimeout(_v24Timer); _v24Timer = setTimeout(renderTeacherAnalytics, 220); }
  const oldUpdate = GSP.updateDashboard;
  GSP.updateDashboard = function(){ if (typeof oldUpdate === 'function') oldUpdate.apply(this, arguments); scheduleV24(); };
  const oldApply = GSP.applyRoleUI;
  GSP.applyRoleUI = function(){ if (typeof oldApply === 'function') oldApply.apply(this, arguments); scheduleV24(); };
  setTimeout(renderTeacherAnalytics, 1500);
})();
