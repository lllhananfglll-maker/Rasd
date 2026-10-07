(function(){
  'use strict';

  const DANGER_RATIO_DEFAULT = 0.50;
  const DANGER_RATIO_RELIGION = 0.70;
  const TOP_RATIO = 0.95;

  const esc = escapeHtml; // مصدر واحد لمنطق الهروب من HTML (راجع تعريف escapeHtml الرئيسي)
  function monTeacherFeedbackFromButton(event, teacherId, type) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  if (typeof monTeacherFeedback === 'function') monTeacherFeedback(teacherId, type);
}
GSP.monTeacherFeedbackFromButton = monTeacherFeedbackFromButton;

function todayISO(){
    return GSP.gspTodayISO();
  }
  function isReligionSubject(name){
    const n = String(name||'');
    const norm = (typeof normalizeArabic === 'function') ? normalizeArabic(n) :
      ((typeof normalizeArabicText === 'function') ? normalizeArabicText(n) : n);
    return /تربيه?\s*دين|دينيه|التربية الدينية|تربية اسلام|اسلاميه/.test(norm) || (/دين/.test(n) && /ترب/.test(n));
  }
  function ensureTeacherPresence(db){
    if (!db.teacherPresence || typeof db.teacherPresence !== 'object') db.teacherPresence = { records: {} };
    if (!db.teacherPresence.records) db.teacherPresence.records = {};
    return db.teacherPresence;
  }
  function presenceKey(teacherId, dateISO){ return String(teacherId)+'|'+String(dateISO); }

  function relevantComps(sub){
    return (sub.components||[]).filter(c => !c.isMonthlyGrade && c.type !== 'attendance');
  }


  function resolveActiveTermMonth(db){
    db = db || {};
    let term = null, month = null;
    try {
      const te = document.getElementById('gradeTermSelect');
      const me = document.getElementById('gradeMonthSelect');
      if (te && te.value) term = te.value;
      if (me && me.value) {
        const m = parseInt(me.value, 10);
        if (Number.isFinite(m) && m >= 1) month = m;
      }
    } catch(e){}
    const info = (db && db.schoolInfo) || {};
    if (!term) term = info.term || 'first';
    if (!month) month = 1;
    let labels = ['الشهر الأول', 'الشهر الثاني'];
    try {
      if (typeof getMonthLabels === 'function') labels = getMonthLabels(term) || labels;
      else if (info.months && info.months[term] && info.months[term].length) labels = info.months[term];
    } catch(e){}
    if (month > labels.length) month = labels.length;
    if (month < 1) month = 1;
    const label = labels[month - 1] || ('الشهر ' + month);
    const termLabel = term === 'second' ? 'الفصل الثاني' : 'الفصل الأول';
    return { term: term, month: month, label: label, termLabel: termLabel };
  }

  function expectedPctByCalendarDays(){
    const now = new Date();
    const day = now.getDate();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() || 30;
    return Math.min(100, Math.max(0, Math.round((day / dim) * 100)));
  }

  function completionForTermMonth(db, term, month){
    db = db || {};
    const students = db.students || [];
    const subjects = db.subjects || [];
    const grades = db.grades || [];
    const doneSet = new Set();
    grades.forEach(function(g){
      if (g.term === term && Number(g.month) === Number(month) &&
          g.score !== undefined && g.score !== null && g.score !== '') {
        doneSet.add(String(g.studentId) + '|' + g.subjectName + '|' + g.componentIndex);
      }
    });
    let expected = 0, done = 0;
    subjects.forEach(function(sub){
      const comps = (typeof relevantComps === 'function')
        ? relevantComps(sub)
        : (sub.components || []).filter(function(c){ return !c.isMonthlyGrade && c.type !== 'attendance'; });
      if (!comps.length) return;
      students.forEach(function(st){
        if (typeof canAccessStudentGrade === 'function' && !canAccessStudentGrade(sub.name, st)) return;
        comps.forEach(function(c){
          const ci = sub.components.indexOf(c);
          expected++;
          if (doneSet.has(String(st.id) + '|' + sub.name + '|' + ci)) done++;
        });
      });
    });
    const pct = expected ? Math.min(100, Math.round(done / expected * 100)) : (students.length ? 0 : 100);
    return { expected: expected, done: done, missing: Math.max(0, expected - done), pct: pct };
  }

  // STEP 24: pure helpers stay local — not part of GSP public surface
  // resolveActiveTermMonth, expectedPctByCalendarDays, completionForTermMonth


  /** يوم الأسبوع كفهرس جدول الحصص: 0 أحد … 4 خميس، 5 سبت */
  function jsDayToStudyIdx(jsDay){
    if (jsDay >= 0 && jsDay <= 4) return jsDay;
    if (jsDay === 6) return 5;
    return -1; // جمعة
  }

  function teacherHasClassToday(db, teacher, dateISO){
    const d = new Date(dateISO + 'T12:00:00');
    if (isNaN(d.getTime())) return true;
    const dayIdx = jsDayToStudyIdx(d.getDay());
    if (dayIdx < 0) return false;
    const att = db.attendance || {};
    const subjectDays = att.subjectDays || {};
    let anySchedule = false;
    (teacher.assignments||[]).forEach(a => {
      (a.classes||[]).forEach(cls => {
        const key = String(a.subjectName||'') + '||' + String(cls||'');
        const days = subjectDays[key];
        if (Array.isArray(days) && days.length) {
          anySchedule = true;
          if (days.map(Number).indexOf(dayIdx) >= 0) {
            teacher._hasToday = true;
          }
        }
      });
    });
    // إن لم يُضبط جدول أيام لأي مادة، نفترض أن كل أيام العمل متوقعة
    if (!anySchedule) return dayIdx >= 0 && dayIdx <= 4;
    return !!teacher._hasToday;
  }

  function formatTeacherAssignments(teacher){
    return (teacher.assignments||[]).map(a => {
      const cls = (a.classes||[]).map(c => typeof classSectionLabel==='function'?classSectionLabel(c):c).join('، ');
      return (a.subjectName||'') + (cls ? ' ('+cls+')' : '');
    }).filter(Boolean).join(' — ') || '—';
  }

  function classesWithoutAttendanceThisMonth(db){
    const att = db.attendance || { records:{}, subjectDays:{} };
    const records = att.records || {};
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(); // 0-based
    const touched = new Set();
    Object.keys(records).forEach(k => {
      // key: studentId|subject|term|month|date
      const parts = k.split('|');
      if (parts.length < 5) return;
      const dateISO = parts[4];
      const d = new Date(dateISO+'T12:00:00');
      if (isNaN(d.getTime())) return;
      if (d.getFullYear()===y && d.getMonth()===m) {
        // نجد فصل الطالب
        const st = (db.students||[]).find(s => String(s.id)===String(parts[0]));
        if (st) {
          const ck = (typeof classSectionKey==='function') ? classSectionKey(st.class, st.section) : (st.class||'');
          touched.add(ck + '||' + parts[1]);
        }
      }
    });
    // فصول×مواد متوقعة من المعلمين
    const expected = [];
    (db.teachers||[]).forEach(t => {
      (t.assignments||[]).forEach(a => {
        (a.classes||[]).forEach(c => {
          expected.push({ classKey:c, subject:a.subjectName, teacher:t.name });
        });
      });
    });
    // إن لم توجد سجلات حضور أصلاً هذا الشهر لكل الأزواج
    const missing = expected.filter(e => !touched.has(e.classKey+'||'+e.subject));
    // تجميع حسب الفصل
    const byClass = {};
    missing.forEach(e => {
      if (!byClass[e.classKey]) byClass[e.classKey] = [];
      byClass[e.classKey].push(e.subject);
    });
    return byClass;
  }

  function collectStageAnalytics(){
    const db = (typeof loadDB==='function') ? loadDB() : {students:[],teachers:[],subjects:[],grades:[],classes:[]};
    const students = db.students||[];
    const teachers = db.teachers||[];
    const subjects = db.subjects||[];
    const classes = db.classes||[];
    const presence = ensureTeacherPresence(db);
    const iso = todayISO();

    const expectedToday = [];
    const presentTeachers = [];
    const absentTeachers = [];
    teachers.forEach(t => {
      const expected = teacherHasClassToday(db, t, iso);
      const checked = !!presence.records[presenceKey(t.id, iso)];
      if (!expected) return; // إجازة أسبوعية / لا حصص اليوم
      expectedToday.push(t);
      if (checked) presentTeachers.push(t);
      else absentTeachers.push(t);
    });
    const teacherAttPct = expectedToday.length
      ? Math.round(presentTeachers.length/expectedToday.length*1000)/10
      : (teachers.length ? 0 : null);

    const classDist = {};
    classes.forEach(c => { classDist[c] = 0; });
    students.forEach(st => {
      const k = (typeof classSectionKey==='function') ? classSectionKey(st.class, st.section) : (st.class||'—');
      classDist[k] = (classDist[k]||0) + 1;
    });

    const teacherRows = teachers.map(t => {
      const m = GSP.monitorAnalytics.computeTeacherMetrics(db, t);
      const checkedIn = !!presence.records[presenceKey(t.id, iso)];
      const expected = teacherHasClassToday(db, Object.assign({}, t), iso);
      return { t, ...m, checkedIn, expectedToday: expected };
    }).sort((a,b) => b.pct - a.pct);

    let scoreSum = 0, maxSum = 0, topCount = 0, dangerCount = 0, evaluated = 0;
    const dangerStudents = [];
    const topStudents = [];
    students.forEach(st => {
      let stScore = 0, stMax = 0, stHas = false;
      subjects.forEach(sub => {
        if (typeof canAccessStudentGrade==='function' && !canAccessStudentGrade(sub.name, st)) return;
        const r = GSP.monitorAnalytics.studentSubjectScore(db, st, sub);
        if (r.maxSum > 0 && r.done > 0) {
          stScore += r.scoreSum; stMax += r.maxSum; stHas = true;
        }
      });
      if (stHas && stMax > 0) {
        evaluated++;
        scoreSum += stScore; maxSum += stMax;
        const ratio = stScore / stMax;
        if (ratio >= TOP_RATIO) { topCount++; topStudents.push({st, pct: Math.round(ratio*1000)/10}); }
        if (ratio < DANGER_RATIO_DEFAULT) { dangerCount++; dangerStudents.push({st, pct: Math.round(ratio*1000)/10}); }
      }
    });
    const avgPct = maxSum ? Math.round(scoreSum/maxSum*1000)/10 : null;

    let overallPct = 0, overallMissing = 0;
    if (typeof GSP.allCompletion === 'function') {
      const c = GSP.allCompletion();
      overallPct = c.pct; overallMissing = c.missing;
    }

    const clsMet = GSP.monitorAnalytics.classMetrics(db);
    const noAtt = classesWithoutAttendanceThisMonth(db);
    const noAttCount = Object.keys(noAtt).length;

    const alerts = [];
    if (!students.length) alerts.push({k:'danger', t:'لا توجد بيانات طلاب في المرحلة الحالية.'});
    if (overallMissing > 0) alerts.push({k:'warn', t:`تأخر رصد: حوالي ${overallMissing} خانة درجات غير مكتملة.`});
    const slowTeachers = teacherRows.filter(r => r.pct < 50 && r.expected > 0);
    if (slowTeachers.length) alerts.push({k:'warn', t:`${slowTeachers.length} معلم تحت 50% إنجاز رصد — يحتاج متابعة.`});
    if (absentTeachers.length) alerts.push({k:'danger', t:`${absentTeachers.length} معلم متوقع اليوم ولم يسجّل حضوره.`});
    if (noAttCount) alerts.push({k:'info', t:`${noAttCount} فصل بلا أي سجل مواظبة هذا الشهر لبعض المواد.`});
    if (dangerCount > 0) alerts.push({k:'danger', t:`${dangerCount} طالب تحت خط الخطر (&lt; 50% من المرصود).`});
    if (!alerts.length) alerts.push({k:'ok', t:'لا توجد تنبيهات رئيسية حالياً.'});

    const activeTM = resolveActiveTermMonth(db);
    const activeMonthComp = completionForTermMonth(db, activeTM.term, activeTM.month);
    const expectedPct = expectedPctByCalendarDays();
    const gapPct = activeMonthComp.pct - expectedPct;
    const activeMonthMeta = {
      term: activeTM.term,
      month: activeTM.month,
      label: activeTM.label,
      termLabel: activeTM.termLabel,
      actualPct: activeMonthComp.pct,
      expectedPct: expectedPct,
      gapPct: gapPct,
      missing: activeMonthComp.missing,
      done: activeMonthComp.done,
      expectedCells: activeMonthComp.expected,
      isComplete: activeMonthComp.pct >= 100 && activeMonthComp.expected > 0
    };

    return {
      db, students, teachers, subjects, classes, classDist, clsMet,
      teacherRows, teacherAttPct, presentTeachers, absentTeachers, expectedToday,
      overallPct, overallMissing, avgPct, topCount, dangerCount, evaluated,
      topStudents, dangerStudents, noAtt, noAttCount, alerts, iso,
      activeMonthMeta
    };
  }

  function donutSvg(segments, centerLabel, centerSub){
    const total = segments.reduce((s,x)=>s+Math.max(0,x.value),0) || 1;
    const R = 54, CX = 70, CY = 70, stroke = 16;
    let angle = -Math.PI/2;
    let paths = '';
    segments.forEach(seg => {
      const v = Math.max(0, seg.value);
      const sweep = (v/total)*Math.PI*2;
      const x1 = CX + R*Math.cos(angle), y1 = CY + R*Math.sin(angle);
      angle += sweep;
      const x2 = CX + R*Math.cos(angle), y2 = CY + R*Math.sin(angle);
      const large = sweep > Math.PI ? 1 : 0;
      if (v <= 0) return;
      paths += `<path d="M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${seg.color}" stroke-width="${stroke}"/>`;
    });
    return `<svg width="140" height="140" viewBox="0 0 140 140"><circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#e2e8f0" stroke-width="${stroke}"/>${paths}
      <text x="${CX}" y="${CY-4}" text-anchor="middle" font-size="16" font-weight="800" fill="#0f172a">${esc(centerLabel||'')}</text>
      <text x="${CX}" y="${CY+14}" text-anchor="middle" font-size="10" fill="#64748b">${esc(centerSub||'')}</text></svg>`;
  }

  function monClassDisplayLabel(keyOrLabel){
    if (keyOrLabel == null || keyOrLabel === '') return '—';
    const raw = String(keyOrLabel);
    const SECTION = { arabic: 'عربي', languages: 'لغات' };
    if (raw.indexOf('§') >= 0) {
      const i = raw.lastIndexOf('§');
      const cls = raw.slice(0, i), sec = raw.slice(i + 1);
      const secAr = SECTION[sec] || sec;
      return secAr ? (secAr + ' · ' + cls) : cls;
    }
    const m = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (m) return m[2] + ' · ' + m[1].trim();
    return raw;
  }
  function groupedBarsSvg(items){
    if (!items.length) return '<div class="mon-empty">لا بيانات</div>';
    const rows = items.map(it => {
      const lab = monClassDisplayLabel(it.label);
      const c = Math.max(0, Math.min(100, Number(it.completion) || 0));
      const a = Math.max(0, Math.min(100, Number(it.avg) || 0));
      return '<div style="display:grid;grid-template-columns:96px 1fr;gap:8px;align-items:center;margin-bottom:8px">'
        + '<div style="font-size:12px;font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+esc(lab)+'">'+esc(lab)+'</div>'
        + '<div><div style="display:flex;align-items:center;gap:6px;margin-bottom:3px"><div style="flex:1;height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden"><div style="height:100%;width:'+c+'%;background:#3b82f6;border-radius:99px"></div></div><span style="font-size:11px;font-weight:700;color:#1e40af;min-width:36px;text-align:left">'+c+'%</span></div>'
        + '<div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden"><div style="height:100%;width:'+a+'%;background:#22c55e;border-radius:99px"></div></div><span style="font-size:11px;font-weight:700;color:#166534;min-width:36px;text-align:left">'+(it.avg==null?'—':a+'%')+'</span></div></div></div>';
    }).join('');
    return '<div><div style="display:flex;gap:14px;font-size:11px;margin-bottom:10px;color:#64748b">'
      + '<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#3b82f6;margin-left:4px;vertical-align:middle"></i>اكتمال الرصد</span>'
      + '<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#22c55e;margin-left:4px;vertical-align:middle"></i>متوسط الدرجات</span>'
      + '</div><div style="max-height:220px;overflow-y:auto">'+rows+'</div></div>';
  }

  function pill(pct){
    if (pct >= 90) return 'ok';
    if (pct >= 60) return 'warn';
    return 'danger';
  }

  GSP.renderMonitorShellDashboard = function(){
    const root = document.getElementById('monDashboardRoot');
    if (!root || currentAccountType !== 'monitor') return;
    const a = collectStageAnalytics();
    const colors = ['#3b82f6','#22c55e','#f59e0b','#a855f7','#ef4444','#06b6d4','#84cc16'];
    const distSeg = Object.entries(a.classDist).map(([k,v],i) => ({
      value: v, color: colors[i%colors.length],
      label: monClassDisplayLabel(k)
    }));

    const teacherTable = a.teacherRows.slice(0,10).map(r => {
      let att;
      if (!r.expectedToday) att = '<span class="mon-pill info">لا حصص</span>';
      else if (r.checkedIn) att = '<span class="mon-pill ok">حاضر</span>';
      else att = '<span class="mon-pill danger">غائب</span>';
      return `<tr>
        <td>${esc(r.t.name||'')}</td>
        <td><span class="mon-pill ${pill(r.speedPct)}">${r.speedPct}%</span></td>
        <td><span class="mon-pill ${pill(r.accuracy)}">${r.accuracy}%</span></td>
        <td><span class="mon-pill ${pill(r.pct)}">${r.pct}%</span></td>
        <td>${att}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="5" class="mon-empty">لا يوجد معلمون</td></tr>`;

    const classTable = a.clsMet.map(c => `<tr>
      <td style="font-weight:700;white-space:nowrap">${esc(monClassDisplayLabel(c.key || c.label))}</td>
      <td>${c.students}</td>
      <td><span class="mon-pill ${pill(c.pct)}">${c.pct}%</span></td>
      <td>${c.avg==null?'—':c.avg+'%'}</td>
    </tr>`).join('') || `<tr><td colspan="4" class="mon-empty">لا فصول</td></tr>`;

    const alertsHtml = a.alerts.map(x =>
      `<div class="mon-alert-item ${x.k}">${x.t}</div>`
    ).join('');

    const am = a.activeMonthMeta || {};
    const gap = Number(am.gapPct);
    const gapTxt = !Number.isFinite(gap) ? '—' : (gap > 0 ? ('متقدم +' + gap + '%') : (gap < 0 ? ('متأخر ' + gap + '%') : 'على المسار'));
    const gapColor = gap >= 5 ? '#0b5e42' : (gap <= -10 ? '#b91c1c' : '#9a3412');
    const monthTitle = ((am.termLabel || '') + (am.label ? (' · ' + am.label) : '')).trim() || 'الشهر النشط';
    const completeBanner = (am.isComplete)
      ? `<div style="margin-bottom:12px;padding:12px 14px;border-radius:12px;border:1px solid #86efac;background:linear-gradient(180deg,#f0fdf4,#fff);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="font-weight:800;color:#166534;font-size:14px">🟢 اكتمل رصد الشهر النشط (${esc(monthTitle)}) — 100%</div>
          <div style="font-size:12px;color:#64748b">لا خانات متبقية لهذه الفترة</div>
        </div>`
      : `<div style="margin-bottom:12px;padding:10px 14px;border-radius:12px;border:1px solid #e2e8f0;background:#f8fafc;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;font-size:13px">
          <div style="font-weight:700;color:#0f172a">📅 ${esc(monthTitle)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:14px;color:#475569">
            <span>اكتمال: <b style="color:#0b5e42">${am.actualPct != null ? am.actualPct : a.overallPct}%</b></span>
            <span>متوقع حتى اليوم: <b style="color:#1d4ed8">${am.expectedPct != null ? am.expectedPct : 0}%</b></span>
            <span>الفجوة: <b style="color:${gapColor}">${gapTxt}</b></span>
            ${am.missing ? `<span style="color:#b45309">متبقٍ ≈ ${am.missing}</span>` : ''}
          </div>
        </div>`;

    root.innerHTML = `
      <div class="mon-page">
        ${completeBanner}
        <div class="mon-card" id="monTermTotalsPrintCard" style="margin-bottom:14px;border:1px solid #86efac;background:linear-gradient(180deg,#f0fdf4,#fff)">
          <h3 style="margin:0 0 8px;color:#166534">🖨️ طباعة كشف أعمال السنة</h3>
          <p style="margin:0 0 10px;font-size:12.5px;color:#64748b;line-height:1.7">كشف متتالٍ بمجاميع المواد (مسلسل · رقم الجلوس · الاسم) مع توقيع وكيل ومدير المرحلة.</p>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px">
            <label style="font-weight:700;font-size:13px;color:#334155">الصف</label>
            <select id="termTotalsGradeSelectMon" style="min-width:200px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff"></select>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button type="button" class="btn btn-primary btn-sm" data-action="printTermTotalsSheet" data-args='${gspArgs(['first'])}'>🖨️ طباعة الفصل الأول</button>
            <button type="button" class="btn btn-primary btn-sm" data-action="printTermTotalsSheet" data-args='${gspArgs(['second'])}'>🖨️ طباعة الفصل الثاني</button>
            <button type="button" class="btn btn-outline btn-sm" data-action="monNavigate" data-args='${gspArgs(['stats'])}'>📊 فتح التقارير</button>
          </div>
        </div>
        <div class="mon-kpi-row">
          <div class="mon-kpi accent-blue"><div class="lbl">👨‍🎓 الطلاب</div><div class="val">${a.students.length}</div><div class="note">المرحلة الحالية</div></div>
          <div class="mon-kpi"><div class="lbl">🧑‍🏫 المعلمون</div><div class="val">${a.teachers.length}</div><div class="note">المسجلون</div></div>
          <div class="mon-kpi"><div class="lbl">🏫 الفصول</div><div class="val">${a.classes.length}</div><div class="note">فصول / شعب</div></div>
          <div class="mon-kpi"><div class="lbl">📚 المواد</div><div class="val">${a.subjects.length}</div><div class="note">مقررات المرحلة</div></div>
          <div class="mon-kpi accent-green"><div class="lbl">📝 اكتمال الرصد</div><div class="val">${a.overallPct}%</div><div class="note">${a.overallMissing?('متبقٍ ≈ '+a.overallMissing):'مكتمل'}</div></div>
          <div class="mon-kpi accent-amber"><div class="lbl">حضور المعلمين اليوم</div><div class="val">${a.teacherAttPct==null?'—':a.teacherAttPct+'%'}</div><div class="note">${a.presentTeachers.length} حاضر / ${a.absentTeachers.length} غائب من ${a.expectedToday.length} متوقع</div></div>
        </div>

        <div class="mon-grid-3">
          <div class="mon-card">
            <h3>أداء المعلمين (سرعة ودقة) <button type="button" class="link" data-action="monNavigate" data-args='${gspArgs(['teachers'])}'>عرض</button></h3>
            <div style="overflow:auto;max-height:300px">
              <table class="mon-table">
                <thead><tr><th>المعلم</th><th>السرعة</th><th>الدقة</th><th>الإنجاز</th><th>اليوم</th></tr></thead>
                <tbody>${teacherTable}</tbody>
              </table>
            </div>
          </div>
          <div class="mon-card">
            <h3>توزيع الطلاب على الفصول</h3>
            <div class="mon-chart-wrap">
              ${donutSvg(distSeg, String(a.students.length), 'طالب')}
              <div class="mon-legend">${distSeg.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.label)} — <b>${s.value}</b></span>`).join('')||'—'}</div>
            </div>
          </div>
          <div class="mon-card">
            <h3>مقارنة الفصول (اكتمال ومتوسط)</h3>
            ${groupedBarsSvg(a.clsMet.map(c => ({label: c.key || c.label, completion:c.pct, avg:c.avg||0})))}
            <div style="overflow:auto;max-height:160px;margin-top:8px">
              <table class="mon-table"><thead><tr><th>الفصل</th><th>طلاب</th><th>اكتمال</th><th>متوسط</th></tr></thead>
              <tbody>${classTable}</tbody></table>
            </div>
          </div>
        </div>

        <div class="mon-grid-2">
          <div class="mon-card">
            <h3>تنبيهات وإشعارات</h3>
            ${alertsHtml}
            <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px">
              <button type="button" class="btn btn-danger btn-sm" data-action="printTeacherAbsenceSheet" data-args='${gspArgs([])}'>🖨️ كشف المعلمين الغائبين اليوم</button>
              <button type="button" class="btn btn-outline btn-sm" data-action="printStageQualityReport" data-args='${gspArgs([])}'>🖨️ تقرير جودة المرحلة</button>
              <button type="button" class="btn btn-outline btn-sm" data-action="monNavigate" data-args='${gspArgs(['grades'])}'>📝 الدرجات</button>
            </div>
          </div>
          <div class="mon-card">
            <h3>مؤشرات الجودة الأكاديمية</h3>
            <div class="mon-stat-row"><span>🎯 متوسط الدرجات المرصودة</span><strong>${a.avgPct==null?'—':a.avgPct+'%'}</strong></div>
            <div class="mon-stat-row"><span>⭐ متفوقون (≥ 95%)</span><strong>${a.topCount}</strong></div>
            <div class="mon-stat-row"><span>⚠️ تحت خط الخطر (&lt; 50%)</span><strong style="color:#b91c1c">${a.dangerCount}</strong></div>
            <div class="mon-stat-row"><span>📌 تم تقييمهم من المرصود</span><strong>${a.evaluated} / ${a.students.length}</strong></div>
            <div class="mon-stat-row"><span>📅 فصول بلا مواظبة هذا الشهر (جزئياً)</span><strong>${a.noAttCount}</strong></div>
            <div class="mon-empty" style="padding:8px;font-size:11px;text-align:right">
              الخطر: 50% عام · التربية الدينية 70% · المتفوقون 95%+
            </div>
          </div>
        </div>

        <div class="mon-card" id="monLiveAbsenceCard" style="margin-bottom:14px;border:1px solid #fdba74;background:linear-gradient(180deg,#fff7ed,#fff)">
          <h3 style="margin:0 0 8px;color:#9a3412">🖨️ تقرير غياب لحظي — الفصل / المرحلة</h3>
          <p style="margin:0 0 10px;font-size:12.5px;color:#64748b;line-height:1.7">
            ملخص أعلى التقرير (عدد الطلاب · حاضر · غائب · عذر) ثم جدول أسماء الطلاب وحالتهم من سجل المواظبة اليوم.
            اختر فصلاً محدداً أو «كل فصول المرحلة».
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">
            <div class="form-group" style="margin:0;min-width:160px">
              <label style="font-size:12px;font-weight:700;color:#9a3412">🏫 الفصل</label>
              <select id="monLiveAbsClass" style="width:100%;padding:6px 8px;border-radius:8px;border:1px solid #fdba74">
                <option value="">كل فصول المرحلة</option>
                ${(a.classes||[]).map(c => {
                  const lab = (typeof classSectionLabel === 'function') ? classSectionLabel(c) : c;
                  return `<option value="${esc(c)}">${esc(lab)}</option>`;
                }).join('')}
              </select>
            </div>
            <div class="form-group" style="margin:0;min-width:140px">
              <label style="font-size:12px;font-weight:700;color:#9a3412">📆 التاريخ</label>
              <input type="date" id="monLiveAbsDate" value="${esc(a.iso||todayISO())}" style="width:100%;padding:6px 8px;border-radius:8px;border:1px solid #fdba74">
            </div>
            <div class="form-group" style="margin:0;min-width:160px">
              <label style="font-size:12px;font-weight:700;color:#9a3412">📚 المادة (اختياري)</label>
              <select id="monLiveAbsSubject" style="width:100%;padding:6px 8px;border-radius:8px;border:1px solid #fdba74">
                <option value="">كل المواد المرصودة</option>
                ${(a.subjects||[]).map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('')}
              </select>
            </div>
            <button type="button" class="btn btn-primary btn-sm" style="background:#c2410c;border-color:#c2410c" data-action="printLiveClassAbsenceReport" data-args='${gspArgs([])}'>🖨️ طباعة التقرير اللحظي</button>
          </div>
        </div>

        <div class="mon-actions">
          <button type="button" class="mon-action-btn" data-action="monNavigate" data-args='${gspArgs(['students'])}'><span class="ic">👨‍🎓</span>الطلاب</button>
          <button type="button" class="mon-action-btn" data-action="monNavigate" data-args='${gspArgs(['teachers'])}'><span class="ic">🧑‍🏫</span>المعلمون</button>
          <button type="button" class="mon-action-btn" data-action="monNavigate" data-args='${gspArgs(['grades'])}'><span class="ic">📝</span>الدرجات</button>
          <button type="button" class="mon-action-btn" data-action="monNavigate" data-args='${gspArgs(['attendance'])}'><span class="ic">📅</span>المواظبة</button>
          <button type="button" class="mon-action-btn" data-action="monNavigate" data-args='${gspArgs(['stats'])}'><span class="ic">📊</span>التقارير</button>
          <button type="button" class="mon-action-btn" data-action="printTeacherAbsenceSheet" data-args='${gspArgs([])}'><span class="ic">🖨️</span>غائبو اليوم</button>
          <button type="button" class="mon-action-btn" data-action="printLiveClassAbsenceReport" data-args='${gspArgs([])}'><span class="ic">📋</span>غياب لحظي</button>
          <button type="button" class="mon-action-btn" data-action="openTodaySkipSuspectsModal" data-args='${gspArgs([])}'><span class="ic">⚠️</span>خارج الفصول</button>
          <button type="button" class="mon-action-btn" data-action="printStageQualityReport" data-args='${gspArgs([])}'><span class="ic">📋</span>تقرير الجودة</button>
        </div>
      </div>`;
    try { if (typeof _scheduleFillGrades === 'function') _scheduleFillGrades();
          else if (typeof populateExportGradeSelect === 'function') populateExportGradeSelect(); } catch (e) {}
  };

  GSP.monNavigate = function(tab){
    if (currentAccountType !== 'monitor') return;
    document.querySelectorAll('#monNav button').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-mon-tab') === tab);
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const el = (typeof getTabContentEl==='function') ? getTabContentEl(tab) :
      (document.getElementById('tab-'+tab) || document.getElementById(tab));
    if (el) el.classList.add('active');
    if (tab === 'dashboard') {
      try { renderMonitorShellDashboard(); } catch(e){ console.error(e); }
    }
    try {
      if (tab === 'students' && typeof loadStudentsUI==='function') loadStudentsUI();
      if (tab === 'teachers') {
        if (currentAccountType === 'monitor') {
          try { renderMonitorTeachersPanel(); } catch(e){ console.error(e); }
        } else if (typeof loadTeachersUI==='function') loadTeachersUI();
      }
      if (tab === 'grades') { try { if (typeof loadGradesUI==='function') loadGradesUI(); } catch(e){} try { renderMonitorGradesGuide(); } catch(e){} try { applyMonitorViewOnlyUI(); } catch(e){} }
      if (tab === 'attendance') { try { if (typeof loadAttendanceUI==='function') loadAttendanceUI(); } catch(e){} try { applyMonitorViewOnlyUI(); } catch(e){} }
      if (tab === 'stats' && typeof loadStatsUI==='function') loadStatsUI();
      if (tab === 'printcenter' && typeof loadPrintCenterUI==='function') loadPrintCenterUI();
    } catch(e){}
  };

  function mountMonitorChrome(){
    let shell = document.getElementById('monShell');
    if (!shell) return;
    const container = document.querySelector('.container');
    if (!container) return;
    if (shell.parentElement !== container) container.insertBefore(shell, container.firstChild);
    shell.style.display = 'block';
    const slot = document.getElementById('monMainSlot');
    if (slot) {
      ['dashboard','tab-students','tab-teachers','tab-grades','tab-attendance','tab-stats'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.parentElement !== slot) slot.appendChild(el);
      });
    }
    let dash = document.getElementById('dashboard');
    if (dash && !document.getElementById('monDashboardRoot')) {
      const root = document.createElement('div');
      root.id = 'monDashboardRoot';
      dash.insertBefore(root, dash.firstChild);
    }
  }

  function unmountMonitorChrome(){
    const shell = document.getElementById('monShell');
    if (shell) shell.style.display = 'none';
    document.body.classList.remove('monitor-shell-active');
    const container = document.querySelector('.container');
    const slot = document.getElementById('monMainSlot');
    if (container && slot) Array.from(slot.children).forEach(ch => container.appendChild(ch));
  }

  GSP.applyMonitorShell = function(){
    if (currentAccountType === 'monitor') {
      document.body.classList.add('monitor-shell-active');
      mountMonitorChrome();
      try {
        const db = loadDB();
        const info = db.schoolInfo || {};
        const nameEl = document.getElementById('monSchoolName');
        if (nameEl) nameEl.textContent = info.schoolName || 'المدرسة';
        const subEl = document.getElementById('monSchoolSub');
        if (subEl) subEl.textContent = (info.academicYear ? 'العام الدراسي '+info.academicYear : 'لوحة تحكم المرحلة');
        const userEl = document.getElementById('monUserName');
        if (userEl) userEl.textContent = (currentStageMonitor && currentStageMonitor.name) || 'مدير المرحلة';
        const stageEl = document.getElementById('monStageChip');
        if (stageEl && typeof getStageRecord==='function' && typeof stageDisplayLabel==='function') {
          const st = getStageRecord(currentStageId);
          stageEl.textContent = st ? stageDisplayLabel(st) : 'المرحلة الحالية';
        }
        const termEl = document.getElementById('monTermChip');
        if (termEl) {
          const term = (info.term === 'second') ? 'الفصل الدراسي الثاني' : 'الفصل الدراسي الأول';
          termEl.textContent = term + (info.academicYear ? ' · '+info.academicYear : '');
        }
        const brand = document.getElementById('monBrandTitle');
        if (brand && info.schoolName) brand.textContent = info.schoolName;
      } catch(e){}
      monNavigate('dashboard');
      try { applyMonitorViewOnlyUI(); } catch(e){}
    } else {
      unmountMonitorChrome();
    }
    try { renderSuperadminStageTree(); } catch(e){}
  };

  function isTeacherDailyAttendanceEnabled(db){
    db = db || loadDB();
    return db.teacherDailyAttendanceEnabled !== false;
  }
  GSP.isTeacherDailyAttendanceEnabled = isTeacherDailyAttendanceEnabled;
  GSP.toggleTeacherDailyAttendance = function(enabled){
    if (!(currentAccountType === 'monitor' || currentAccountType === 'superadmin' || currentAccountType === 'stageadmin')) return;
    const db = loadDB();
    db.teacherDailyAttendanceEnabled = !!enabled;
    saveDB(db);
    alert(enabled ? '✅ تم تفعيل الحضور اليومي (+25)' : '🔒 تم إيقاف الحضور اليومي');
    try { if (typeof renderMonitorTeachersPanel==='function') renderMonitorTeachersPanel(); } catch(e){}
    try { if (typeof refreshTeacherCheckInButton==='function') refreshTeacherCheckInButton(); } catch(e){}
  };
  const TEACHER_DAILY_ATT_POINTS = 25;
  GSP.teacherCheckInToday = function(){
    if (currentAccountType !== 'teacher' || !currentTeacher) {
      alert('تسجيل الحضور الصباحي متاح للمعلم فقط.');
      return;
    }
    const db = loadDB();
    if (!isTeacherDailyAttendanceEnabled(db)) {
      alert('الحضور اليومي موقوف في هذه المرحلة.');
      return;
    }
    const presence = ensureTeacherPresence(db);
    const iso = todayISO();
    const already = !!presence.records[presenceKey(currentTeacher.id, iso)];
    presence.records[presenceKey(currentTeacher.id, iso)] = true;
    let note = '';
    if (!already) {
      if (!db.teacherFeedback) db.teacherFeedback = { points: {}, log: [], basePoints: {} };
      if (!db.teacherFeedback.points) db.teacherFeedback.points = {};
      if (!Array.isArray(db.teacherFeedback.log)) db.teacherFeedback.log = [];
      const tid = String(currentTeacher.id);
      db.teacherFeedback.points[tid] = Number(db.teacherFeedback.points[tid]||0) + TEACHER_DAILY_ATT_POINTS;
      db.teacherFeedback.log.push({ teacherId: tid, type: 'daily_attendance', points: TEACHER_DAILY_ATT_POINTS, by: 'system', at: new Date().toISOString(), dateISO: iso });
      note = ' (+' + TEACHER_DAILY_ATT_POINTS + ' نقطة)';
    }
    saveDB(db);
    if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
    alert('✅ تم تسجيل حضورك اليوم ('+iso+').' + note);
    try { if (typeof updateDashboard==='function') updateDashboard(); } catch(e){}
    try { refreshTeacherCheckInButton(); } catch(e){}
  };

  GSP.refreshTeacherCheckInButton = function(){
    const slot = document.getElementById('teacherCheckInSlot');
    if (!slot) return;
    if (currentAccountType !== 'teacher' || !currentTeacher) {
      slot.style.display = 'none';
      return;
    }
    slot.style.display = 'block';
    const db = loadDB();
    const presence = ensureTeacherPresence(db);
    const iso = todayISO();
    const done = !!presence.records[presenceKey(currentTeacher.id, iso)];
    slot.innerHTML = done
      ? `<div class="success-box" style="margin:0">✅ تم تسجيل حضورك اليوم (${esc(iso)})</div>`
      : `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:12px 14px">
           <button type="button" class="btn btn-success" data-action="teacherCheckInToday" data-args='${gspArgs([])}'>✅ تسجيل حضوري اليوم</button>
           <span style="font-size:13px;color:#166534">يُحتسب حضورك في لوحة مدير المرحلة. من لا يسجّل يظهر في <b>كشف الغائبين</b>.</span>
         </div>`;
  };

  /** كشف المعلمين الغائبين اليوم + موادهم وفصولهم */
  GSP.printTeacherAbsenceSheet = function(){
    if (!(currentAccountType === 'monitor' || currentAccountType === 'superadmin' || currentAccountType === 'stageadmin')) {
      alert('طباعة كشف الغائبين متاحة للإدارة والمراقب.');
      return;
    }
    const db = loadDB();
    const presence = ensureTeacherPresence(db);
    const iso = todayISO();
    const info = db.schoolInfo || {};
    const absentees = [];
    (db.teachers||[]).forEach(t => {
      const expected = teacherHasClassToday(db, Object.assign({}, t), iso);
      const checked = !!presence.records[presenceKey(t.id, iso)];
      if (expected && !checked) absentees.push(t);
    });
    const hindi = (typeof toHindiDigits === 'function') ? toHindiDigits : (v => String(v));
    let rows = absentees.map((t,i) => {
      const assigns = formatTeacherAssignments(t);
      return `<tr>
        <td style="border:1px solid #94a3b8;padding:7px;text-align:center">${hindi(i+1)}</td>
        <td style="border:1px solid #94a3b8;padding:7px;text-align:right;font-weight:700">${esc(t.name||'')}</td>
        <td style="border:1px solid #94a3b8;padding:7px;text-align:right;font-size:11.5px;line-height:1.55">${esc(assigns)}</td>
      </tr>`;
    }).join('');
    const area = document.getElementById('printAttendanceArea') || document.getElementById('printGradeSheetArea');
    if (!area) { alert('تعذر تجهيز صفحة الطباعة'); return; }
    if (typeof clearInactivePrintAreas==='function') clearInactivePrintAreas(area.id);
    const stageLabel = (typeof getStageRecord==='function' && typeof stageDisplayLabel==='function' && currentStageId)
      ? stageDisplayLabel(getStageRecord(currentStageId)) : '';
    const printedBy = (typeof resolvePrintedByName === 'function') ? resolvePrintedByName() : 'المستخدم';
    const printDate = new Date().toLocaleDateString('ar-EG');
    const metaBarHtml = [
      `<span><strong>التاريخ:</strong> ${esc(iso)}</span>`,
      `<span><strong>عدد الغائبين:</strong> ${hindi(absentees.length)}</span>`
    ].join('');
    const letterhead = (typeof buildUnifiedLetterhead === 'function')
      ? buildUnifiedLetterhead({
          title: 'كشف المعلمين الغائبين — لتوزيع الحصص الاحتياطية',
          subtitleRight: stageLabel || '',
          subtitleLeft: '',
          printedBy,
          printDate,
          governorate: info.governorate || '',
          educationAdmin: info.educationAdmin || '',
          schoolName: info.schoolName || '',
          academicYear: info.academicYear || '',
          metaBarHtml
        })
      : '';
    const footer = (typeof buildUnifiedFooter === 'function')
      ? buildUnifiedFooter({ captions: ['مدير المرحلة', 'وكيل شئون الطلاب'] })
      : '';
    area.innerHTML = `<div class="grade-sheet-page detailed-sheet-page" style="padding:8mm;font-family:'Cairo',Tahoma,sans-serif;direction:rtl;color:#0f172a">
      ${letterhead}
      <div style="font-size:11.5px;color:#64748b;margin:2mm 0 4mm;line-height:1.7;text-align:center">
        يُسلَّم هذا الكشف لوكلاء المرحلة لتوزيع حصص المعلمين الاحتياطية على الفصول والمواد أدناه.
        (المعلمون المتوقع دوامهم اليوم حسب جدول الحصص ولم يسجّلوا حضورهم من النظام)
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;border:2px solid #3f7a57">
        <thead>
          <tr>
            <th style="border:1px solid #94a3b8;padding:8px;background:#3f7a57;color:#fff;width:12mm">م</th>
            <th style="border:1px solid #94a3b8;padding:8px;background:#3f7a57;color:#fff;width:45mm">اسم المعلم</th>
            <th style="border:1px solid #94a3b8;padding:8px;background:#3f7a57;color:#fff">المواد والفصول المطلوب تغطيتها احتياطياً</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="3" style="border:1px solid #94a3b8;text-align:center;padding:16px;color:#166534;font-weight:800">✅ لا يوجد معلمون غائبون اليوم</td></tr>'}</tbody>
      </table>
      <div style="margin-top:4mm;font-size:12px;color:#475569">عدد المعلمين الغائبين: <b>${hindi(absentees.length)}</b></div>
      ${footer}
    </div>`;
    if (typeof fitPrintPagesToA4 === 'function') fitPrintPagesToA4(area, '.grade-sheet-page, .detailed-sheet-page');
    const prev = document.title;
    document.title = 'كشف المعلمين الغائبين - '+iso;
    window.print();
    setTimeout(() => {
      document.title = prev;
      if (typeof clearAllPrintAreas==='function') clearAllPrintAreas();
    }, 800);
  };

  /**
   * يجمع حالة حضور/غياب طلاب فصل (أو كل المرحلة) لتاريخ معيّن من سجلات المواظبة.
   * - إن حُددت مادة: تُقرأ علامات تلك المادة فقط.
   * - وإلا: أي «غ» في أي مادة = غائب؛ أي «ع» = عذر؛ أي رصد آخر = حاضر؛ بلا رصد = لم يُرصد.
   */
  function collectLiveClassAbsence(db, classKey, dateISO, subjectName) {
    const att = (db && db.attendance && db.attendance.records) ? db.attendance.records : {};
    const students = (db.students || []).filter(s => {
      const k = (typeof classSectionKey === 'function') ? classSectionKey(s.class, s.section) : (s.class || '');
      if (classKey) return k === classKey;
      return true;
    }).slice().sort((a, b) => {
      const ka = (typeof classSectionKey === 'function') ? classSectionKey(a.class, a.section) : (a.class || '');
      const kb = (typeof classSectionKey === 'function') ? classSectionKey(b.class, b.section) : (b.class || '');
      if (ka !== kb) return String(ka).localeCompare(String(kb), 'ar');
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });

    const rows = students.map(s => {
      let status = 'unrecorded';
      const marks = [];
      Object.keys(att).forEach(key => {
        const parts = key.split('|');
        if (parts.length < 5) return;
        if (parts[0] !== String(s.id)) return;
        if (parts[4] !== dateISO) return;
        if (subjectName && parts[1] !== subjectName) return;
        marks.push(att[key]);
      });
      if (marks.length) {
        if (marks.some(m => m === 'غ')) status = 'absent';
        else if (marks.some(m => m === 'ع')) status = 'excuse';
        else status = 'present';
      }
      const clsKey = (typeof classSectionKey === 'function') ? classSectionKey(s.class, s.section) : (s.class || '');
      return {
        id: s.id,
        name: s.name || '',
        nationalId: s.nationalId || '',
        seat: s.seatNumber || s.seat || '',
        classKey: clsKey,
        classLabel: (typeof classSectionLabel === 'function') ? classSectionLabel(clsKey) : clsKey,
        status
      };
    });

    const present = rows.filter(r => r.status === 'present').length;
    const absent = rows.filter(r => r.status === 'absent').length;
    const excuse = rows.filter(r => r.status === 'excuse').length;
    const unrecorded = rows.filter(r => r.status === 'unrecorded').length;
    return { rows, total: rows.length, present, absent, excuse, unrecorded };
  }

  GSP.printLiveClassAbsenceReport = function() {
    if (!(currentAccountType === 'monitor' || currentAccountType === 'superadmin' || currentAccountType === 'stageadmin')) {
      alert('تقرير الغياب اللحظي متاح لمدير المرحلة والإدارة.');
      return;
    }
    const db = loadDB();
    const classKey = (document.getElementById('monLiveAbsClass') || {}).value || '';
    const dateISO = (document.getElementById('monLiveAbsDate') || {}).value || todayISO();
    const subjectName = (document.getElementById('monLiveAbsSubject') || {}).value || '';
    const data = collectLiveClassAbsence(db, classKey, dateISO, subjectName);
    const hindi = (typeof toHindiDigits === 'function') ? toHindiDigits : (v => String(v));
    const info = db.schoolInfo || {};
    const stageLabel = (typeof getStageRecord === 'function' && typeof stageDisplayLabel === 'function' && currentStageId)
      ? stageDisplayLabel(getStageRecord(currentStageId)) : '';
    const classLabel = classKey
      ? ((typeof classSectionLabel === 'function') ? classSectionLabel(classKey) : classKey)
      : 'كل فصول المرحلة';
    const subjectLabel = subjectName || 'كل المواد المرصودة';
    const printedBy = (typeof resolvePrintedByName === 'function') ? resolvePrintedByName() : 'المستخدم';
    const printDate = new Date().toLocaleDateString('ar-EG');

    const statusLabel = { present: 'حاضر', absent: 'غائب', excuse: 'عذر', unrecorded: 'لم يُرصد' };
    const statusStyle = {
      present: 'background:#ecfdf5;color:#065f46;font-weight:800',
      absent: 'background:#fef2f2;color:#991b1b;font-weight:800',
      excuse: 'background:#fff7ed;color:#9a3412;font-weight:800',
      unrecorded: 'background:#f8fafc;color:#64748b;font-weight:700'
    };

    let lastClass = null;
    const bodyRows = data.rows.map((r, i) => {
      let groupRow = '';
      if (!classKey && r.classLabel !== lastClass) {
        lastClass = r.classLabel;
        groupRow = `<tr><td colspan="5" style="border:1px solid #94a3b8;padding:6px 8px;background:#f1f5f9;font-weight:800;color:#0f172a">🏫 ${esc(r.classLabel || '—')}</td></tr>`;
      }
      return groupRow + `<tr>
        <td style="border:1px solid #94a3b8;padding:6px;text-align:center">${hindi(i + 1)}</td>
        <td style="border:1px solid #94a3b8;padding:6px;text-align:right;font-weight:700">${esc(r.name)}</td>
        <td style="border:1px solid #94a3b8;padding:6px;text-align:center;font-size:11px">${esc(r.seat || '—')}</td>
        <td style="border:1px solid #94a3b8;padding:6px;text-align:center;font-size:11px">${esc(r.nationalId || '—')}</td>
        <td style="border:1px solid #94a3b8;padding:6px;text-align:center;${statusStyle[r.status] || ''}">${statusLabel[r.status] || r.status}</td>
      </tr>`;
    }).join('');

    const area = document.getElementById('printAttendanceArea') || document.getElementById('printGradeSheetArea');
    if (!area) { alert('تعذر تجهيز صفحة الطباعة'); return; }
    if (typeof clearInactivePrintAreas === 'function') clearInactivePrintAreas(area.id);

    const metaBarHtml = [
      `<span><strong>المرحلة:</strong> ${esc(stageLabel || '—')}</span>`,
      `<span><strong>الفصل:</strong> ${esc(classLabel)}</span>`,
      `<span><strong>التاريخ:</strong> ${esc(dateISO)}</span>`,
      `<span><strong>المادة:</strong> ${esc(subjectLabel)}</span>`
    ].join('');

    const letterhead = (typeof buildUnifiedLetterhead === 'function')
      ? buildUnifiedLetterhead({
          title: 'تقرير غياب لحظي — حضور وغياب الطلاب',
          subtitleRight: stageLabel || '',
          subtitleLeft: classLabel,
          printedBy,
          printDate,
          governorate: info.governorate || '',
          educationAdmin: info.educationAdmin || '',
          schoolName: info.schoolName || '',
          academicYear: info.academicYear || '',
          metaBarHtml
        })
      : '';
    const footer = (typeof buildUnifiedFooter === 'function')
      ? buildUnifiedFooter({ captions: ['مدير المرحلة', 'وكيل شئون الطلاب'] })
      : '';

    const box = 'padding:3mm;border-radius:8px;border:1px solid #e2e8f0;background:#fff;text-align:center';
    area.innerHTML = `<div class="grade-sheet-page detailed-sheet-page" style="padding:8mm;font-family:'Cairo',Tahoma,sans-serif;direction:rtl;color:#0f172a">
      ${letterhead}
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:2.5mm;margin:3mm 0 5mm;font-size:12px">
        <div style="${box}"><div style="color:#64748b;font-size:11px">عدد الطلاب</div><div style="font-size:20px;font-weight:900">${hindi(data.total)}</div></div>
        <div style="${box};border-color:#86efac;background:#ecfdf5"><div style="color:#166534;font-size:11px">حاضر</div><div style="font-size:20px;font-weight:900;color:#065f46">${hindi(data.present)}</div></div>
        <div style="${box};border-color:#fca5a5;background:#fef2f2"><div style="color:#991b1b;font-size:11px">غائب</div><div style="font-size:20px;font-weight:900;color:#991b1b">${hindi(data.absent)}</div></div>
        <div style="${box};border-color:#fdba74;background:#fff7ed"><div style="color:#9a3412;font-size:11px">عذر</div><div style="font-size:20px;font-weight:900;color:#9a3412">${hindi(data.excuse)}</div></div>
        <div style="${box}"><div style="color:#64748b;font-size:11px">لم يُرصد</div><div style="font-size:20px;font-weight:900;color:#475569">${hindi(data.unrecorded)}</div></div>
      </div>
      <div style="font-size:11.5px;color:#64748b;margin:0 0 3mm;line-height:1.6;text-align:center">
        يُستخرج لحظياً من سجل المواظبة المحفوظ في النظام لتاريخ ${esc(dateISO)}.
        ${subjectName ? 'النطاق: مادة «' + esc(subjectName) + '» فقط.' : 'النطاق: أي رصد في أي مادة لنفس اليوم (غ في أي مادة = غائب).'}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;border:2px solid #3f7a57">
        <thead>
          <tr>
            <th style="border:1px solid #94a3b8;padding:7px;background:#3f7a57;color:#fff;width:10mm">م</th>
            <th style="border:1px solid #94a3b8;padding:7px;background:#3f7a57;color:#fff">اسم الطالب</th>
            <th style="border:1px solid #94a3b8;padding:7px;background:#3f7a57;color:#fff;width:18mm">جلوس</th>
            <th style="border:1px solid #94a3b8;padding:7px;background:#3f7a57;color:#fff;width:32mm">الرقم القومي</th>
            <th style="border:1px solid #94a3b8;padding:7px;background:#3f7a57;color:#fff;width:22mm">الحالة</th>
          </tr>
        </thead>
        <tbody>${bodyRows || '<tr><td colspan="5" style="border:1px solid #94a3b8;text-align:center;padding:16px;color:#64748b">لا يوجد طلاب في النطاق المحدد</td></tr>'}</tbody>
      </table>
      ${footer}
    </div>`;

    if (typeof fitPrintPagesToA4 === 'function') fitPrintPagesToA4(area, '.grade-sheet-page, .detailed-sheet-page');
    const prev = document.title;
    document.title = 'تقرير غياب لحظي - ' + classLabel + ' - ' + dateISO;
    window.print();
    setTimeout(() => {
      document.title = prev;
      if (typeof clearAllPrintAreas === 'function') clearAllPrintAreas();
    }, 800);
  };

  GSP.printStageQualityReport = function(){
    if (!(currentAccountType === 'monitor' || currentAccountType === 'superadmin' || currentAccountType === 'stageadmin')) {
      alert('تقرير الجودة متاح للإدارة والمراقب.');
      return;
    }
    const a = collectStageAnalytics();
    const info = (a.db.schoolInfo||{});
    const stageLabel = (typeof getStageRecord==='function' && typeof stageDisplayLabel==='function' && currentStageId)
      ? stageDisplayLabel(getStageRecord(currentStageId)) : '';
    const hindi = (typeof toHindiDigits === 'function') ? toHindiDigits : (v => String(v));
    const classRows = a.clsMet.map((c,i)=>`<tr>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:center">${hindi(i+1)}</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:right">${esc(c.label)}</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:center">${hindi(c.students)}</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:center">${hindi(c.pct)}%</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:center">${c.avg==null?'—':hindi(c.avg)+'%'}</td>
    </tr>`).join('');
    const teacherRows = a.teacherRows.map((r,i)=>`<tr>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:center">${hindi(i+1)}</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:right">${esc(r.t.name||'')}</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:center">${hindi(r.speedPct)}%</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:center">${hindi(r.accuracy)}%</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:center">${hindi(r.pct)}%</td>
      <td style="border:1px solid #94a3b8;padding:6px;text-align:center">${r.expectedToday?(r.checkedIn?'حاضر':'غائب'):'—'}</td>
    </tr>`).join('');
    const area = document.getElementById('printGradeSheetArea') || document.getElementById('printAttendanceArea');
    if (!area) return;
    if (typeof clearInactivePrintAreas==='function') clearInactivePrintAreas(area.id);
    const th = 'border:1px solid #94a3b8;padding:7px;background:#3f7a57;color:#fff;font-weight:800;text-align:center';
    const box = 'border:1px solid #e2e8f0;border-radius:8px;padding:3.5mm;text-align:center;background:#f8fafc';
    const printedBy = (typeof resolvePrintedByName === 'function') ? resolvePrintedByName() : 'المستخدم';
    const printDate = new Date().toLocaleDateString('ar-EG');
    const metaBarHtml = [
      `<span><strong>المرحلة:</strong> ${esc(stageLabel||'—')}</span>`,
      `<span><strong>تاريخ التقرير:</strong> ${esc(a.iso||printDate)}</span>`
    ].join('');
    const letterhead = (typeof buildUnifiedLetterhead === 'function')
      ? buildUnifiedLetterhead({
          title: 'تقرير مؤشرات الجودة — ' + (stageLabel || ''),
          subtitleRight: '',
          subtitleLeft: '',
          printedBy,
          printDate,
          governorate: info.governorate || '',
          educationAdmin: info.educationAdmin || '',
          schoolName: info.schoolName || '',
          academicYear: info.academicYear || '',
          metaBarHtml
        })
      : '';
    const footer = (typeof buildUnifiedFooter === 'function')
      ? buildUnifiedFooter({ captions: ['معدّ التقرير', 'مدير المرحلة'] })
      : '';
    const am = a.activeMonthMeta || {};
    const gapN = Number(am.gapPct);
    const gapColor = gapN >= 5 ? '#0b5e42' : (gapN <= -10 ? '#b91c1c' : '#b45309');
    const gapLabel = !Number.isFinite(gapN) ? '—' : (gapN > 0 ? ('متقدم +' + hindi(gapN) + '%') : (gapN < 0 ? ('متأخر ' + hindi(gapN) + '%') : 'على المسار'));
    const monthTitle = ((am.termLabel || '') + (am.label ? (' · ' + am.label) : '')).trim() || 'الشهر النشط';
    const amActual = am.actualPct != null ? am.actualPct : a.overallPct;
    const amExpected = am.expectedPct != null ? am.expectedPct : 0;
    area.innerHTML = `<div class="grade-sheet-page detailed-sheet-page" style="padding:8mm;font-family:'Cairo','Segoe UI',Tahoma,sans-serif;direction:rtl;color:#0f172a">
      ${letterhead}
      <div style="margin:0 0 3mm;padding:2.5mm 3mm;border-radius:8px;border:1px solid #bfdbfe;background:#eff6ff;font-size:11.5px;color:#1e3a5f;font-weight:700">📅 نطاق المقارنة: ${esc(monthTitle)} — المتوقع حسب أيام الشهر التقويمي المنقضية</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-bottom:5mm;font-size:12px">
        <div style="${box}"><div style="color:#64748b;font-size:11px">الطلاب</div><div style="font-size:18px;font-weight:900">${hindi(a.students.length)}</div></div>
        <div style="${box}"><div style="color:#64748b;font-size:11px">اكتمال الشهر النشط</div><div style="font-size:18px;font-weight:900;color:#0b5e42">${hindi(amActual)}%</div></div>
        <div style="${box}"><div style="color:#64748b;font-size:11px">المتوقع حتى اليوم</div><div style="font-size:18px;font-weight:900;color:#1d4ed8">${hindi(amExpected)}%</div></div>
        <div style="${box}"><div style="color:#64748b;font-size:11px">الفجوة عن المتوقع</div><div style="font-size:16px;font-weight:900;color:${gapColor}">${gapLabel}</div></div>
        <div style="${box}"><div style="color:#64748b;font-size:11px">متوسط الدرجات</div><div style="font-size:18px;font-weight:900">${a.avgPct==null?'—':hindi(a.avgPct)+'%'}</div></div>
        <div style="${box}"><div style="color:#64748b;font-size:11px">متفوقون ≥ 95%</div><div style="font-size:18px;font-weight:900;color:#2563eb">${hindi(a.topCount)}</div></div>
        <div style="${box}"><div style="color:#64748b;font-size:11px">تحت خط الخطر &lt; 50%</div><div style="font-size:18px;font-weight:900;color:#b91c1c">${hindi(a.dangerCount)}</div></div>
        <div style="${box}"><div style="color:#64748b;font-size:11px">غائبو المعلمين اليوم</div><div style="font-size:18px;font-weight:900;color:#b45309">${hindi(a.absentTeachers.length)}</div></div>
        <div style="${box}"><div style="color:#64748b;font-size:11px">اكتمال عام (كل الشهور)</div><div style="font-size:18px;font-weight:900;color:#475569">${hindi(a.overallPct)}%</div></div>
      </div>
      <div style="font-size:13px;font-weight:800;margin:2mm 0 2.5mm;color:#1e3a5f">مقارنة الفصول</div>
      <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:5mm;border:2px solid #3f7a57">
        <thead><tr>
          <th style="${th};width:10mm">م</th>
          <th style="${th}">الفصل</th>
          <th style="${th};width:18mm">طلاب</th>
          <th style="${th};width:24mm">اكتمال الرصد</th>
          <th style="${th};width:24mm">متوسط الدرجات</th>
        </tr></thead>
        <tbody>${classRows || '<tr><td colspan="5" style="border:1px solid #94a3b8;text-align:center;padding:10px">لا توجد فصول</td></tr>'}</tbody>
      </table>
      <div style="font-size:13px;font-weight:800;margin:2mm 0 2.5mm;color:#1e3a5f">أداء المعلمين</div>
      <table style="width:100%;border-collapse:collapse;font-size:11.5px;border:2px solid #3f7a57">
        <thead><tr>
          <th style="${th};width:10mm">م</th>
          <th style="${th}">المعلم</th>
          <th style="${th};width:18mm">السرعة</th>
          <th style="${th};width:18mm">الدقة</th>
          <th style="${th};width:18mm">الإنجاز</th>
          <th style="${th};width:22mm">حضور اليوم</th>
        </tr></thead>
        <tbody>${teacherRows || '<tr><td colspan="6" style="border:1px solid #94a3b8;text-align:center;padding:10px">لا يوجد معلمون</td></tr>'}</tbody>
      </table>
      <div style="margin-top:4mm;font-size:10.5px;color:#64748b;line-height:1.7">
        ملاحظات الحساب: خط الخطر العام 50% من المرصود · التربية الدينية 70% · المتفوقون 95% فأعلى ·
        السرعة = مقارنة الإنجاز بتقدم أيام الشهر · الدقة = نسبة الدرجات ضمن الحد الأقصى للمكوّن ·
        المتوقع للشهر النشط = نسبة الأيام المنقضية من الشهر التقويمي الحالي · الفجوة = اكتمال الشهر النشط − المتوقع.
      </div>
      ${footer}
    </div>`;
    if (typeof fitPrintPagesToA4 === 'function') fitPrintPagesToA4(area, '.grade-sheet-page, .detailed-sheet-page');
    const prev = document.title;
    document.title = 'تقرير جودة المرحلة';
    window.print();
    setTimeout(() => {
      document.title = prev;
      if (typeof clearAllPrintAreas==='function') clearAllPrintAreas();
    }, 800);
  };

  // توافق مع الاسم القديم
  GSP.printTeacherPresenceSheet = GSP.printTeacherAbsenceSheet;

  /** شجرة المراحل لرئيس الكنترول */
  GSP.renderSuperadminStageTree = function(){
    let panel = document.getElementById('superadminStageTreePanel');
    if (currentAccountType !== 'superadmin') {
      if (panel) panel.style.display = 'none';
      return;
    }
    const dash = document.getElementById('dashboard');
    if (!dash) return;
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'superadminStageTreePanel';
      panel.className = 'card';
      panel.style.cssText = 'margin-bottom:14px;border:1px solid #bfdbfe;background:linear-gradient(180deg,#fff,#f8fbff)';
      dash.insertBefore(panel, dash.firstChild);
    }
    panel.style.display = 'block';
    const root = (typeof getRootDB==='function') ? getRootDB() : {stages:[]};
    const stages = root.stages || [];
    let totalStudents = 0, totalTeachers = 0;
    let completeStages = 0;
    const rows = stages.map(st => {
      const data = st.data || {};
      const ns = (data.students||[]).length;
      const nt = (data.teachers||[]).length;
      const nc = (data.classes||[]).length;
      const nsub = (data.subjects||[]).length;
      totalStudents += ns; totalTeachers += nt;
      const label = typeof stageDisplayLabel==='function' ? stageDisplayLabel(st) : (st.name||st.id);
      const active = currentStageId === st.id;
      let monthPct = null, monthComplete = false, monthLabel = '';
      try {
        const tm = (typeof resolveActiveTermMonth === 'function') ? resolveActiveTermMonth(data) : { term: (data.schoolInfo&&data.schoolInfo.term)||'first', month: 1, label: 'الشهر النشط' };
        const comp = (typeof completionForTermMonth === 'function') ? completionForTermMonth(data, tm.term, tm.month) : null;
        if (comp) {
          monthPct = comp.pct;
          monthComplete = comp.pct >= 100 && comp.expected > 0;
          if (monthComplete) completeStages++;
        }
        monthLabel = tm.label || '';
      } catch(e){}
      const statusHtml = monthPct == null
        ? '<span style="font-size:11px;color:#94a3b8">—</span>'
        : (monthComplete
          ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:800">🟢 مكتمل 100%</span>`
          : `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:800">⏳ ${monthPct}%</span>`);
      return `<button type="button" data-action="switchToStageFromTree" data-args='${gspArgs(['esc(st.id)'])}'
        style="display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:right;
        padding:10px 12px;margin-bottom:6px;border-radius:10px;border:1px solid ${active?'#2563eb':'#e2e8f0'};
        background:${active?'#eff6ff':'#fff'};cursor:pointer;font:inherit">
        <span style="font-weight:800;color:#0f172a;min-width:0">🏛️ ${esc(label)}</span>
        <span style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end">
          ${statusHtml}
          <span style="font-size:12px;color:#64748b">${ns} طالب · ${nt} معلم · ${nc} فصل · ${nsub} مادة</span>
        </span>
      </button>`;
    }).join('') || '<div style="color:#94a3b8;padding:12px">لا توجد مراحل بعد.</div>';
    const summaryNote = stages.length
      ? ` · رصد الشهر النشط: <b style="color:${completeStages===stages.length?'#166534':'#92400e'}">${completeStages}</b> / ${stages.length} مرحلة مكتملة`
      : '';
    panel.innerHTML = `
      <h2 style="margin:0 0 8px;border:none;padding:0;font-size:16px">🌳 هيكل المراحل الدراسية</h2>
      <p style="margin:0 0 10px;font-size:12.5px;color:#64748b">إجمالي المدرسة: <b>${totalStudents}</b> طالب · <b>${totalTeachers}</b> معلم عبر <b>${stages.length}</b> مرحلة${summaryNote} — اضغط مرحلة للتبديل</p>
      ${rows}`;
  };

  GSP.switchToStageFromTree = function(stageId){
    if (currentAccountType !== 'superadmin') return;
    try {
      if (typeof switchStage === 'function') {
        const sel = document.getElementById('stageSwitchSelect');
        if (sel) { sel.value = stageId; switchStage(); }
        else {
          currentStageId = stageId;
          if (typeof saveSession==='function') saveSession({accountType:'superadmin', stageId});
          if (typeof applyRoleUI==='function') applyRoleUI();
          if (typeof updateDashboard==='function') updateDashboard();
        }
      } else {
        currentStageId = stageId;
        if (typeof applyRoleUI==='function') applyRoleUI();
      }
    } catch(e){ console.error(e); }
  };

  const oldApply = GSP.applyRoleUI;
  GSP.applyRoleUI = function(){
    if (typeof oldApply === 'function') oldApply.apply(this, arguments);
    try { applyMonitorShell(); } catch(e){ console.error('applyMonitorShell', e); }
    try { refreshTeacherCheckInButton(); } catch(e){}
  };
  const oldUpdate = GSP.updateDashboard;
  GSP.updateDashboard = function(){
    if (typeof oldUpdate === 'function') oldUpdate.apply(this, arguments);
    if (currentAccountType === 'monitor') {
      try { renderMonitorShellDashboard(); } catch(e){}
    }
    try { renderSuperadminStageTree(); } catch(e){}
    try { refreshTeacherCheckInButton(); } catch(e){}
  };


  /** تنبيهات موجّهة لمدير المرحلة في تبويب الدرجات */
  GSP.renderMonitorGradesGuide = function(){
    if (currentAccountType !== 'monitor') return;
    let box = document.getElementById('monGradesGuide');
    const tab = document.getElementById('tab-grades');
    if (!tab) return;
    if (!box) {
      box = document.createElement('div');
      box.id = 'monGradesGuide';
      box.className = 'card';
      box.style.cssText = 'border:1px solid #bfdbfe;background:linear-gradient(180deg,#eff6ff,#fff);margin-bottom:14px';
      const firstCard = tab.querySelector('.card');
      if (firstCard) tab.insertBefore(box, firstCard);
      else tab.appendChild(box);
    }
    const a = collectStageAnalytics();
    const lowCompletion = a.clsMet.filter(c => c.pct < 60).sort((x,y)=>x.pct-y.pct);
    const lowAvg = a.clsMet.filter(c => c.avg != null && c.avg < 50).sort((x,y)=>(x.avg||0)-(y.avg||0));
    const slowTeachers = a.teacherRows.filter(r => r.pct < 55 && r.expected > 0).slice(0,6);

    // مواد ضعيفة الاكتمال
    const db = a.db;
    const subjStats = [];
    (db.subjects||[]).forEach(sub => {
      let exp=0, done=0, score=0, max=0;
      (db.students||[]).forEach(st => {
        if (typeof canAccessStudentGrade==='function' && !canAccessStudentGrade(sub.name, st)) return;
        const r = GSP.monitorAnalytics.studentSubjectScore(db, st, sub);
        exp += r.expected; done += r.done; score += r.scoreSum; max += r.maxSum;
      });
      if (!exp) return;
      subjStats.push({
        name: sub.name,
        pct: Math.round(done/exp*100),
        avg: max ? Math.round(score/max*1000)/10 : null
      });
    });
    const weakSubjects = subjStats.filter(s => s.pct < 55 || (s.avg!=null && s.avg < 50)).sort((x,y)=>x.pct-y.pct).slice(0,6);

    function jumpToClass(classKey, subjectName){
      try {
        const cs = document.getElementById('gradeClassSelect') || document.querySelector('#tab-grades select[id*="lass"]');
        const ss = document.getElementById('gradeSubjectSelect') || document.querySelector('#tab-grades select[id*="ubject"]');
        // search common filter ids
        const classSel = document.getElementById('gradesClassFilter') || document.getElementById('gradeClassSelect') || document.querySelector('#gradesFilters select');
        // find selects in grades tab
        const selects = document.querySelectorAll('#tab-grades select');
        selects.forEach(sel => {
          const opts = [...sel.options].map(o => o.value);
          if (classKey && opts.includes(classKey)) sel.value = classKey;
          if (subjectName && opts.includes(subjectName)) sel.value = subjectName;
        });
        if (typeof loadGradesUI === 'function') loadGradesUI();
        else if (typeof renderGradesTable === 'function') renderGradesTable();
      } catch(e){ console.warn(e); }
    }
    GSP.monJumpGrades = function(classKey, subjectName){
      jumpToClass(classKey, subjectName);
    };

    const cards = [];
    lowCompletion.forEach(c => {
      cards.push(`<div class="mon-guide-card warn" data-action="monJumpGrades" data-args='${gspArgs(['esc(c.key)'])}'>
        <div class="g-title">⚠️ رصد منخفض — ${esc(c.label)}</div>
        <div class="g-note">اكتمال الرصد ${c.pct}% فقط · ${c.students} طالباً — اضغط لعرض درجات الفصل</div>
      </div>`);
    });
    lowAvg.forEach(c => {
      cards.push(`<div class="mon-guide-card danger" data-action="monJumpGrades" data-args='${gspArgs(['esc(c.key)'])}'>
        <div class="g-title">🔻 متوسط منخفض — ${esc(c.label)}</div>
        <div class="g-note">متوسط الدرجات المرصودة ${c.avg}% — يستحق مراجعة سريعة</div>
      </div>`);
    });
    weakSubjects.forEach(s => {
      cards.push(`<div class="mon-guide-card info" data-action="monJumpGrades" data-args='${gspArgs(['', 'esc(s.name)'])}'>
        <div class="g-title">📚 مادة تحتاج متابعة — ${esc(s.name)}</div>
        <div class="g-note">اكتمال ${s.pct}%${s.avg!=null?' · متوسط '+s.avg+'%':''}</div>
      </div>`);
    });
    slowTeachers.forEach(r => {
      cards.push(`<div class="mon-guide-card warn">
        <div class="g-title">🧑‍🏫 تأخّر رصد — ${esc(r.t.name||'')}</div>
        <div class="g-note">إنجاز الرصد ${r.pct}% · دقة ${r.accuracy}%</div>
      </div>`);
    });

    box.innerHTML = `
      <h3 style="margin:0 0 8px;border:none;padding:0;font-size:15px;color:#1e3a5f">🔎 أين تحتاج للاطلاع الآن؟</h3>
      <p style="margin:0 0 10px;font-size:12.5px;color:#64748b;line-height:1.7">تنبيهات تلقائية من بيانات المرحلة — اضغط البطاقة للانتقال لعرض درجات الفصل/المادة (بدون إمكانية الرصد).</p>
      <div class="mon-guide-grid">${cards.join('') || '<div class="mon-empty">🟢 لا توجد حالات بارزة تحتاج متابعة فورية.</div>'}</div>`;
  };

  function applyMonitorViewOnlyUI(){
    if (currentAccountType !== 'monitor') return;
    // تعطيل حقول الرصد صراحة
    document.querySelectorAll('#tab-grades .grade-input, #tab-attendance .att-mark, #attDaysCheckboxes input').forEach(el => {
      el.disabled = true;
      el.readOnly = true;
    });
    // إخفاء أزرار الحفظ إن وُجدت
    document.querySelectorAll('#tab-grades button, #tab-attendance button').forEach(btn => {
      const t = (btn.textContent||'') + (btn.getAttribute('onclick')||'');
      if (/حفظ|saveAllGrades|saveAttendance|قفل|toggleGlobalLock|كشف فارغ|printAttendanceSheet\(true\)|أيام الحصص|saveAttendanceSubjectDays/i.test(t)) {
        btn.style.display = 'none';
      }
    });
  }



  /* ========== لوحة معلمي المراقب ========== */
  function ensureTeacherFeedback(db){
    if (!db.teacherFeedback || typeof db.teacherFeedback !== 'object') {
      db.teacherFeedback = { points: {}, log: [], basePoints: {} };
    }
    if (!db.teacherFeedback.points) db.teacherFeedback.points = {};
    if (!db.teacherFeedback.basePoints) db.teacherFeedback.basePoints = {};
    if (!Array.isArray(db.teacherFeedback.log)) db.teacherFeedback.log = [];
    return db.teacherFeedback;
  }

  function teacherTotalPoints(fb, teacherId, teacher){
    const base = (teacher && teacher.assignedPeriods != null)
      ? (Number(teacher.assignedPeriods)||0) * 100
      : Number(fb.basePoints[teacherId]||0);
    // مزامنة basePoints إن وُجد assignedPeriods
    if (teacher && teacher.assignedPeriods != null) {
      fb.basePoints[teacherId] = (Number(teacher.assignedPeriods)||0) * 100;
    }
    const delta = Number(fb.points[teacherId]||0);
    return { total: base + delta, base, delta };
  }

  function countTeacherAbsenceDays(db, teacher, monthISOPrefix){
    // أيام الشهر الحالية (أو المحدد) بدون تسجيل حضور في أيام العمل
    const presence = ensureTeacherPresence(db);
    const now = new Date();
    let y, m;
    if (monthISOPrefix && /^\d{4}-\d{2}$/.test(monthISOPrefix)) {
      y = parseInt(monthISOPrefix.slice(0,4),10);
      m = parseInt(monthISOPrefix.slice(5,7),10) - 1;
    } else {
      y = now.getFullYear(); m = now.getMonth();
    }
    const daysInMonth = new Date(y, m+1, 0).getDate();
    const today = now.getFullYear()===y && now.getMonth()===m ? now.getDate() : daysInMonth;
    let abs = 0;
    for (let d=1; d<=today; d++) {
      const dt = new Date(y, m, d, 12, 0, 0);
      const js = dt.getDay();
      if (js === 5) continue; // جمعة
      const iso = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      const expected = teacherHasClassToday(db, Object.assign({}, teacher), iso);
      if (!expected) continue;
      if (!presence.records[presenceKey(teacher.id, iso)]) abs++;
    }
    return abs;
  }

  function teacherClassCount(teacher){
    const set = new Set();
    (teacher.assignments||[]).forEach(a => (a.classes||[]).forEach(c => set.add(c)));
    return set.size;
  }

  function teacherStudentCount(db, teacher){
    const classSet = new Set();
    (teacher.assignments||[]).forEach(a => (a.classes||[]).forEach(c => classSet.add(c)));
    let n = 0;
    (db.students||[]).forEach(st => {
      const k = (typeof classSectionKey==='function') ? classSectionKey(st.class, st.section) : (st.class||'');
      if (!classSet.has(k)) return;
      // إن وُجدت مادة واحدة على الأقل يمكنه الوصول إليها
      const subjects = (teacher.assignments||[]).map(a => a.subjectName);
      let ok = false;
      for (const sn of subjects) {
        if (typeof canAccessStudentGrade==='function') {
          if (canAccessStudentGrade(sn, st)) { ok = true; break; }
        } else { ok = true; break; }
      }
      if (ok) n++;
    });
    return n;
  }

  function teacherPeriodCount(db, teacher){
    // أولوية: العدد المسجّل من مسؤول الحاسب
    if (teacher && teacher.assignedPeriods != null && teacher.assignedPeriods !== '') {
      const n = parseInt(teacher.assignedPeriods, 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    // تقدير من أيام الدراسة المحفوظة
    const att = db.attendance || {};
    const subjectDays = att.subjectDays || {};
    let total = 0;
    (teacher.assignments||[]).forEach(a => {
      (a.classes||[]).forEach(cls => {
        const key = String(a.subjectName||'') + '||' + String(cls||'');
        const days = subjectDays[key];
        if (Array.isArray(days) && days.length) total += days.length;
        else total += 1;
      });
    });
    return total;
  }

  function teacherSubjectsLabel(teacher){
    const names = [...new Set((teacher.assignments||[]).map(a => a.subjectName).filter(Boolean))];
    return names.join(' · ') || '—';
  }

  function buildMonitorTeacherRows(db, filters){
    const fb = ensureTeacherFeedback(db);
    const teachers = (db.teachers||[]).slice();
    const metrics = teachers.map(t => {
      const m = GSP.monitorAnalytics.computeTeacherMetrics(db, t);
      return {
        t,
        subjects: teacherSubjectsLabel(t),
        classCount: teacherClassCount(t),
        studentCount: teacherStudentCount(db, t),
        periodCount: teacherPeriodCount(db, t),
        absenceDays: countTeacherAbsenceDays(db, t),
        speedPct: m.speedPct,
        accuracy: m.accuracy,
        completion: m.pct,
        ...(() => { const p = teacherTotalPoints(fb, t.id, t); return { points: p.total, basePoints: p.base, deltaPoints: p.delta }; })()
      };
    });
    // ترتيب للرتب
    const bySpeed = metrics.slice().sort((a,b) => b.speedPct - a.speedPct || a.t.name.localeCompare(b.t.name||'','ar'));
    const byAcc = metrics.slice().sort((a,b) => b.accuracy - a.accuracy || a.t.name.localeCompare(b.t.name||'','ar'));
    const speedRank = {}, accRank = {};
    bySpeed.forEach((r,i) => { speedRank[r.t.id] = i+1; });
    byAcc.forEach((r,i) => { accRank[r.t.id] = i+1; });
    metrics.forEach(r => {
      r.speedRank = speedRank[r.t.id];
      r.accRank = accRank[r.t.id];
    });

    let list = metrics;
    const q = (filters && filters.q || '').trim();
    const subj = (filters && filters.subject || '').trim();
    if (subj) {
      list = list.filter(r => (r.t.assignments||[]).some(a => a.subjectName === subj));
    }
    if (q) {
      const nq = (typeof normalizeArabic==='function') ? normalizeArabic(q) :
        ((typeof normalizeArabicText==='function') ? normalizeArabicText(q) : q);
      list = list.filter(r => {
        const name = String(r.t.name||'');
        const nn = (typeof normalizeArabic==='function') ? normalizeArabic(name) :
          ((typeof normalizeArabicText==='function') ? normalizeArabicText(name) : name);
        return nn.includes(nq) || name.includes(q);
      });
    }
    // نقاط أولاً ثم أبجدي
    list.sort((a,b) => {
      if (b.points !== a.points) return b.points - a.points;
      return String(a.t.name||'').localeCompare(String(b.t.name||''),'ar');
    });
    return { all: metrics, filtered: list, bySpeed, byAcc };
  }

  GSP.renderMonitorTeachersPanel = function(){
    if (currentAccountType !== 'monitor') return;
    const tab = document.getElementById('tab-teachers');
    if (!tab) return;
    let panel = document.getElementById('monTeachersPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'monTeachersPanel';
      panel.className = 'card';
      panel.style.cssText = 'border:none;background:transparent;box-shadow:none;padding:0;';
      tab.insertBefore(panel, tab.firstChild);
    }
    const db = loadDB();
    const filters = {
      q: (document.getElementById('monTSearch') && document.getElementById('monTSearch').value) || '',
      subject: (document.getElementById('monTSubject') && document.getElementById('monTSubject').value) || ''
    };
    const data = buildMonitorTeacherRows(db, filters);
    const subjOpts = (db.subjects||[]).map(s =>
      `<option value="${esc(s.name)}" ${filters.subject===s.name?'selected':''}>${esc(s.name)}</option>`
    ).join('');

    const top = data.all.slice().sort((a,b)=> b.points-a.points || a.t.name.localeCompare(b.t.name||'','ar')).slice(0,10);
    const bottom = data.all.slice().sort((a,b)=> a.points-b.points || a.t.name.localeCompare(b.t.name||'','ar')).slice(0,10);

    const listsOpen = panel.dataset.listsOpen === '1';
    const bestOl = top.map((r,i)=>`<li><span>${i+1}. ${esc(r.t.name||'')}</span><strong class="pts pos">${r.points} نقطة</strong></li>`).join('') || '<li>لا بيانات</li>';
    const worstOl = bottom.map((r,i)=>`<li><span>${i+1}. ${esc(r.t.name||'')}</span><strong class="pts neg">${r.points} نقطة</strong></li>`).join('') || '<li>لا بيانات</li>';

    const rows = data.filtered.map((r,i) => {
      const ptsCls = r.points > 0 ? 'pos' : (r.points < 0 ? 'neg' : '');
      const tid = esc(String(r.t.id||''));
      return `<tr>
        <td>${i+1}</td>
        <td style="font-weight:800">
          <button type="button" data-action="openMonitorTeacherCard" data-args='${gspArgs(['tid'])}'
            style="background:none;border:none;padding:0;margin:0;font:inherit;font-weight:800;color:#1d4ed8;cursor:pointer;text-decoration:underline;text-underline-offset:3px"
            title="عرض كارت المعلم وطباعته">${esc(r.t.name||'')}</button>
        </td>
        <td style="font-size:11.5px;max-width:160px">${esc(r.subjects)}</td>
        <td style="text-align:center">${r.classCount}</td>
        <td style="text-align:center">${r.studentCount}</td>
        <td style="text-align:center">${r.periodCount}</td>
        <td style="text-align:center">${r.absenceDays}</td>
        <td style="text-align:center"><span class="mon-pill ${pill(r.speedPct)}">#${r.speedRank}</span> <span style="color:#64748b;font-size:11px">${r.speedPct}%</span></td>
        <td style="text-align:center"><span class="mon-pill ${pill(r.accuracy)}">#${r.accRank}</span> <span style="color:#64748b;font-size:11px">${r.accuracy}%</span></td>
        <td>
          <div class="mon-t-like" style="flex-direction:column;align-items:flex-start;gap:6px">
            <div style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap">
              <button type="button" title="إعجاب (+10)" data-action="monTeacherFeedbackFromButton" data-with-event data-args='${gspArgs([r.t.id,"like"])}'>👍</button>
              <span class="pts ${ptsCls}" title="التقييم العام = رصيد الحصص + تقييم المراقب + حضور">${r.points}</span>
              <button type="button" title="عدم إعجاب (−10)" data-action="monTeacherFeedbackFromButton" data-with-event data-args='${gspArgs([r.t.id,"dislike"])}'>👎</button>
            </div>
            <div style="display:inline-flex;gap:5px;align-items:center;flex-wrap:wrap">
              <button type="button" class="mon-btn-exceptional" title="عمل استثنائي (+100)"
                data-action="monTeacherFeedbackFromButton" data-with-event data-args='${gspArgs([r.t.id,"exceptional"])}'>⭐ عمل استثنائي +100</button>
              <button type="button" class="mon-btn-severe" title="خطأ جسيم (−100)"
                data-action="monTeacherFeedbackFromButton" data-with-event data-args='${gspArgs([r.t.id,"severe"])}'>⚠ خطأ جسيم −100</button>
            </div>
            <span style="font-size:10.5px;color:#64748b">رصيد حصص: ${r.basePoints||0} · حركات: ${r.deltaPoints>0?'+':''}${r.deltaPoints||0}</span>
          </div>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="10" class="mon-empty">لا يوجد معلمون مطابقون للبحث</td></tr>`;

    panel.innerHTML = `
      <div style="margin-bottom:8px">
        <h2 style="margin:0 0 4px;border:none;padding:0;font-size:20px;font-weight:900;color:#0f172a">🧑‍🏫 متابعة المعلمين</h2>
        <p style="margin:0;font-size:13px;color:#64748b;line-height:1.7">إحصاء ومتابعة أداء معلمي المرحلة — بدون صلاحية إضافة أو تعديل بيانات المعلمين.</p>
      </div>

      <div class="mon-t-stats">
        <div class="mon-t-stat"><div class="lbl">المعلمون المسجّلون</div><div class="val">${data.all.length}</div></div>
        <div class="mon-t-stat"><div class="lbl">الفصول في المرحلة</div><div class="val">${(db.classes||[]).length}</div></div>
        <div class="mon-t-stat best" style="cursor:pointer" data-action="monToggleTeacherLists" data-args='${gspArgs([])}' title="عرض أفضل / أقل المعلمين">
          <div class="lbl">⭐ الأفضل (اضغط للعرض)</div><div class="val">${top[0] ? esc(top[0].t.name||'—') : '—'}</div>
        </div>
        <div class="mon-t-stat worst" style="cursor:pointer" data-action="monToggleTeacherLists" data-args='${gspArgs([])}' title="عرض أفضل / أقل المعلمين">
          <div class="lbl">📉 الأقل نقاطاً (اضغط)</div><div class="val">${bottom[0] ? esc(bottom[0].t.name||'—') : '—'}</div>
        </div>
      </div>

      <div class="mon-t-lists ${listsOpen?'open':''}" id="monTLists">
        <div class="mon-t-list-card best">
          <h4>⭐ أعلى المعلمين نقاطاً</h4>
          <ol>${bestOl}</ol>
        </div>
        <div class="mon-t-list-card worst">
          <h4>📉 أقل المعلمين نقاطاً</h4>
          <ol>${worstOl}</ol>
        </div>
      </div>

      <div id="monHonorBoardBar" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;padding:12px 14px;border-radius:12px;border:1px solid #c7d2fe;background:linear-gradient(180deg,#eef2ff,#fff)">
        <div style="min-width:0;flex:1">
          <div style="font-weight:800;color:#3730a3;font-size:14px">🏆 لوحة الشرف للمعلمين</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;line-height:1.6">شأن داخلي بالمرحلة: عند التفعيل يرى المعلمون أسماء المتصدرين.</div>
        </div>
        <label style="display:inline-flex;align-items:center;gap:8px;font-weight:700;color:#3730a3;cursor:pointer;white-space:nowrap">
          <input type="checkbox" id="monHonorBoardToggle" ${db.honorBoardEnabled ? 'checked' : ''} data-event-type="change" data-event-action="toggleStageHonorBoard" data-event-arg="checked" style="width:18px;height:18px;accent-color:#4f46e5">
          تفعيل لوحة الشرف
        </label>
      </div>
      <div id="monTeacherDailyAttBar" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;padding:12px 14px;border-radius:12px;border:1px solid #86efac;background:linear-gradient(180deg,#f0fdf4,#fff)">
        <div style="min-width:0;flex:1">
          <div style="font-weight:800;color:#166534;font-size:14px">✅ الحضور اليومي للمعلمين (+25 نقطة)</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">عند الإيقاف يُخفى الزر ولا تُضاف نقاط جديدة.</div>
        </div>
        <label style="display:inline-flex;align-items:center;gap:8px;font-weight:700;color:#166534;cursor:pointer">
          <input type="checkbox" id="monTeacherDailyAttToggle" ${db.teacherDailyAttendanceEnabled === false ? '' : 'checked'} data-event-type="change" data-event-action="toggleTeacherDailyAttendance" data-event-arg="checked" style="width:18px;height:18px;accent-color:#16a34a">
          تفعيل الحضور اليومي
        </label>
      </div>

      <div class="mon-t-filters">
        <div class="form-group">
          <label>📚 المادة</label>
          <select id="monTSubject" data-event-type="change" data-event-action="renderMonitorTeachersPanel">
            <option value="">كل المواد</option>
            ${subjOpts}
          </select>
        </div>
        <div class="form-group" style="flex:2">
          <label>🔍 بحث باسم المعلم</label>
          <input type="search" id="monTSearch" value="${esc(filters.q)}" placeholder="اكتب جزءاً من الاسم..." data-event-type="input" data-event-action="renderMonitorTeachersPanel">
        </div>
        <div class="form-group" style="flex:0;min-width:auto">
          <label>&nbsp;</label>
          <button type="button" class="btn btn-outline btn-sm" data-action="printTeacherPointsReport" data-args='${gspArgs([])}'>🖨️ تقرير النقاط الشهري (أعلى/أقل 10)</button>
        </div>
      </div>

      <div class="mon-t-toolbar">
        <span style="font-size:12.5px;color:#64748b">الترتيب: النقاط أولاً ثم الاسم · رصيد ابتدائي = عدد الحصص × 100 · 👍 = +10 · 👎 = −10 · الرتب من أداء الرصد</span>
      </div>

      <div class="mon-t-table-wrap">
        <table class="mon-t-table">
          <thead>
            <tr>
              <th>م</th>
              <th>اسم المعلم</th>
              <th>المواد</th>
              <th>فصوله</th>
              <th>طلابه</th>
              <th>حصصه/أسبوع</th>
              <th>أيام غيابه</th>
              <th>رتبة السرعة</th>
              <th>رتبة الدقة</th>
              <th>تقييم</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    // restore lists open state
    if (listsOpen) {
      const lists = document.getElementById('monTLists');
      if (lists) lists.classList.add('open');
      panel.dataset.listsOpen = '1';
    }
    // إبقاء التركيز على البحث إن كان المستخدم يكتب
    const searchEl = document.getElementById('monTSearch');
    if (searchEl && filters.q) {
      try {
        searchEl.focus();
        const len = searchEl.value.length;
        searchEl.setSelectionRange(len, len);
      } catch(e){}
    }
  };

  GSP.monToggleTeacherLists = function(){
    const panel = document.getElementById('monTeachersPanel');
    if (!panel) return;
    panel.dataset.listsOpen = panel.dataset.listsOpen === '1' ? '0' : '1';
    renderMonitorTeachersPanel();
  };


  const assignDenseRanks = (GSP_DOMAIN && GSP_DOMAIN.monitorRanking)
    ? GSP_DOMAIN.monitorRanking.assignDenseRanks
    : function(sortedRows){ return sortedRows; };
  GSP.toggleStageHonorBoard = function(enabled){
    if (!(currentAccountType === 'monitor' || currentAccountType === 'superadmin' || currentAccountType === 'stageadmin')) {
      alert('تفعيل لوحة الشرف متاح لمدير المرحلة.'); return;
    }
    try {
      const db = loadDB(); db.honorBoardEnabled = !!enabled; saveDB(db);
      if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
      alert(enabled ? '✅ تم تفعيل لوحة الشرف لهذه المرحلة.' : '🔒 تم إخفاء لوحة الشرف.');
      try { if (typeof renderMonitorTeachersPanel==='function') renderMonitorTeachersPanel(); } catch(e){}
    } catch(e){ alert('تعذر الحفظ'); }
  };
  function computeTeacherRankSnapshot(){
    try {
      const db = loadDB();
      const data = buildMonitorTeacherRows(db, {});
      const sorted = data.all.slice().sort((a,b)=>b.points-a.points||String(a.t.name||'').localeCompare(String(b.t.name||''),'ar'));
      assignDenseRanks(sorted);
      let my = null;
      if (typeof currentTeacher !== 'undefined' && currentTeacher)
        my = sorted.find(r => String(r.t.id) === String(currentTeacher.id)) || null;
      const honorBoardEnabled = !!db.honorBoardEnabled;
      return {
        total: sorted.length,
        myRank: my ? my.rank : null,
        myPoints: my ? my.points : null,
        myTied: my ? !!my.rankTied : false,
        myBase: my ? my.basePoints : null,
        myDelta: my ? my.deltaPoints : null,
        honorBoardEnabled,
        topList: honorBoardEnabled ? sorted.slice(0,10).map(r => ({
          name: r.t.name||'', points: r.points, rank: r.rank, rankTied: !!r.rankTied,
          isMe: !!(my && String(r.t.id)===String(my.t.id))
        })) : []
      };
    } catch(e){ return { total:0, myRank:null, myPoints:null, myTied:false, honorBoardEnabled:false, topList:[] }; }
  };
  GSP.openMonitorTeacherCard = function(teacherId){
    if (!(currentAccountType === 'monitor' || currentAccountType === 'superadmin' || currentAccountType === 'stageadmin')) {
      alert('كارت المعلم متاح لمدير المرحلة.'); return;
    }
    const db = loadDB();
    const data = buildMonitorTeacherRows(db, {});
    const sorted = data.all.slice().sort((a,b)=>b.points-a.points||String(a.t.name||'').localeCompare(String(b.t.name||''),'ar'));
    assignDenseRanks(sorted);
    const r = sorted.find(x => String(x.t.id) === String(teacherId));
    if (!r) { alert('لم يُعثر على المعلم.'); return; }
    const t = r.t;
    const assigns = (t.assignments||[]).map(a => {
      const cls = (a.classes||[]).map(c => (typeof classSectionLabel==='function'?classSectionLabel(c):c)).join('، ');
      return '<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-weight:700">'+esc(a.subjectName||'')+'</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">'+esc(cls||'—')+'</td></tr>';
    }).join('') || '<tr><td colspan="2" style="padding:8px;color:#94a3b8">لا إسنادات</td></tr>';
    const rankTxt = r.rank + (r.rankTied ? ' (مكرر)' : '');
    const info = db.schoolInfo || {};
    const stageLabel = (typeof getStageRecord==='function'&&typeof stageDisplayLabel==='function'&&currentStageId)?stageDisplayLabel(getStageRecord(currentStageId)):'';
    const hindi = (typeof toHindiDigits==='function')?toHindiDigits:v=>String(v);
    let classAttAvg = null;
    try {
      if (typeof averageTeacherClassesAttendance === 'function') classAttAvg = averageTeacherClassesAttendance(db, t);
    } catch(e){}
    const classAttTxt = classAttAvg == null ? '—' : (hindi(classAttAvg) + '%');
    const oldOv = document.getElementById('monTeacherCardOverlay'); if (oldOv) oldOv.remove();
    const overlay = document.createElement('div');
    overlay.id = 'monTeacherCardOverlay'; overlay.className = 'mg-modal-overlay';
    overlay.innerHTML = '<div class="mg-modal-box" style="max-width:640px"><div class="mg-modal-header ui-modal-header ui-type-info" style="display:flex;justify-content:space-between;align-items:center"><span>🪪 كارت المعلم</span><button type="button" class="btn btn-outline btn-sm" data-close>إغلاق</button></div><div class="mg-modal-body" style="padding:16px 18px"><div style="text-align:center;margin-bottom:12px"><div style="font-size:18px;font-weight:900">'+esc(t.name||'')+'</div><div style="font-size:12.5px;color:#64748b">'+esc(stageLabel)+' · '+esc(info.schoolName||'')+'</div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;font-size:12.5px"><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center"><div style="color:#64748b;font-size:11px">الفصول</div><div style="font-weight:800">'+hindi(r.classCount)+'</div></div><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center"><div style="color:#64748b;font-size:11px">الطلاب</div><div style="font-weight:800">'+hindi(r.studentCount)+'</div></div><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center"><div style="color:#64748b;font-size:11px">حصص/أسبوع</div><div style="font-weight:800">'+hindi(r.periodCount)+'</div></div><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:center"><div style="color:#64748b;font-size:11px">غياب</div><div style="font-weight:800;color:#b45309">'+hindi(r.absenceDays)+'</div></div><div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:10px;text-align:center"><div style="color:#065f46;font-size:11px">متوسط حضور فصوله</div><div style="font-weight:900;color:#047857">'+classAttTxt+'</div><div style="font-size:10px;color:#64748b;margin-top:2px">للعرض فقط</div></div><div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:10px;text-align:center"><div style="color:#4338ca;font-size:11px">الترتيب</div><div style="font-weight:900;color:#3730a3">'+rankTxt+' / '+hindi(sorted.length)+'</div></div><div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:10px;text-align:center"><div style="color:#6b21a8;font-size:11px">النقاط</div><div style="font-weight:900">'+hindi(r.points)+'</div></div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;font-size:12.5px"><div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px;text-align:center"><div style="color:#1e40af;font-size:11px">اكتمال</div><div style="font-weight:900">'+hindi(r.completion)+'%</div></div><div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px;text-align:center"><div style="color:#166534;font-size:11px">السرعة</div><div style="font-weight:900">'+hindi(r.speedPct)+'%</div></div><div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:10px;text-align:center"><div style="color:#92400e;font-size:11px">الدقة</div><div style="font-weight:900">'+hindi(r.accuracy)+'%</div></div></div><div style="font-size:12.5px;color:#475569;margin-bottom:10px">رصيد: <b>'+hindi(r.basePoints||0)+'</b> · حركات: <b>'+(r.deltaPoints>0?'+':'')+hindi(r.deltaPoints||0)+'</b> · المواد: <b>'+esc(r.subjects||'—')+'</b></div><div style="font-size:13px;font-weight:800;margin-bottom:6px">المواد والفصول</div><table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0"><thead><tr style="background:#f1f5f9"><th style="padding:7px 8px;text-align:right">المادة</th><th style="padding:7px 8px;text-align:right">الفصول</th></tr></thead><tbody>'+assigns+'</tbody></table></div><div class="mg-modal-footer"><button type="button" class="btn btn-outline" data-close>إغلاق</button><button type="button" class="btn btn-primary" id="monTeacherCardPrint">🖨️ طباعة</button></div></div>';
    document.body.appendChild(overlay);
    const close=function(){try{overlay.remove();}catch(e){}};
    overlay.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.querySelector('#monTeacherCardPrint').onclick=function(){printMonitorTeacherCard(teacherId);};
  };
  GSP.printMonitorTeacherCard = function(teacherId){
    if (!(currentAccountType === 'monitor' || currentAccountType === 'superadmin' || currentAccountType === 'stageadmin')) return;
    const db = loadDB();
    const data = buildMonitorTeacherRows(db, {});
    const sorted = data.all.slice().sort((a,b)=>b.points-a.points||String(a.t.name||'').localeCompare(String(b.t.name||''),'ar'));
    assignDenseRanks(sorted);
    const r = sorted.find(x => String(x.t.id) === String(teacherId));
    if (!r) return;
    const t = r.t; const info = db.schoolInfo||{};
    const stageLabel=(typeof getStageRecord==='function'&&typeof stageDisplayLabel==='function'&&currentStageId)?stageDisplayLabel(getStageRecord(currentStageId)):'';
    const hindi=(typeof toHindiDigits==='function')?toHindiDigits:v=>String(v);
    const rankTxt=hindi(r.rank)+(r.rankTied?' (مكرر)':'');
    let classAttAvg=null;
    try{ if(typeof averageTeacherClassesAttendance==='function') classAttAvg=averageTeacherClassesAttendance(db,t); }catch(e){}
    const classAttTxt=classAttAvg==null?'—':(hindi(classAttAvg)+'%');
    const assignsRows=(t.assignments||[]).map(function(a,i){
      const cls=(a.classes||[]).map(function(c){return (typeof classSectionLabel==='function'?classSectionLabel(c):c);}).join('، ');
      return '<tr><td style="border:1px solid #94a3b8;padding:6px;text-align:center">'+hindi(i+1)+'</td><td style="border:1px solid #94a3b8;padding:6px;text-align:right;font-weight:700">'+esc(a.subjectName||'')+'</td><td style="border:1px solid #94a3b8;padding:6px;text-align:right">'+esc(cls||'—')+'</td></tr>';
    }).join('')||'<tr><td colspan="3" style="border:1px solid #94a3b8;padding:10px;text-align:center">لا إسنادات</td></tr>';
    const th='border:1px solid #94a3b8;padding:7px;background:#3f7a57;color:#fff;font-weight:800;text-align:center';
    const box='border:1px solid #e2e8f0;border-radius:8px;padding:3mm;text-align:center;background:#f8fafc';
    const area=document.getElementById('printGradeSheetArea')||document.getElementById('printAttendanceArea');
    if(!area)return;
    if(typeof clearInactivePrintAreas==='function') clearInactivePrintAreas(area.id);
    const printedBy=(typeof resolvePrintedByName==='function')?resolvePrintedByName():'المستخدم';
    const printDate=new Date().toLocaleDateString('ar-EG');
    const letterhead=(typeof buildUnifiedLetterhead==='function')?buildUnifiedLetterhead({title:'كارت أداء المعلم',subtitleRight:stageLabel||'',subtitleLeft:'',printedBy,printDate,governorate:info.governorate||'',educationAdmin:info.educationAdmin||'',schoolName:info.schoolName||'',academicYear:info.academicYear||'',metaBarHtml:'<span><strong>المعلم:</strong> '+esc(t.name||'')+'</span>'}):'';
    const footer=(typeof buildUnifiedFooter==='function')?buildUnifiedFooter({captions:['معدّ التقرير','مدير المرحلة']}):'';
    area.innerHTML='<div class="grade-sheet-page detailed-sheet-page" style="padding:8mm;direction:rtl;font-family:Cairo,Tahoma,sans-serif">'+letterhead+'<div style="text-align:center;font-size:16px;font-weight:900;margin:2mm 0 4mm">'+esc(t.name||'')+'</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2.5mm;margin-bottom:4mm;font-size:11.5px"><div style="'+box+'"><div style="color:#64748b;font-size:10px">الفصول</div><div style="font-size:16px;font-weight:900">'+hindi(r.classCount)+'</div></div><div style="'+box+'"><div style="color:#64748b;font-size:10px">الطلاب</div><div style="font-size:16px;font-weight:900">'+hindi(r.studentCount)+'</div></div><div style="'+box+'"><div style="color:#64748b;font-size:10px">حصص</div><div style="font-size:16px;font-weight:900">'+hindi(r.periodCount)+'</div></div><div style="'+box+'"><div style="color:#64748b;font-size:10px">غياب</div><div style="font-size:16px;font-weight:900">'+hindi(r.absenceDays)+'</div></div><div style="'+box+'"><div style="color:#64748b;font-size:10px">متوسط حضور فصوله</div><div style="font-size:16px;font-weight:900">'+classAttTxt+'</div></div><div style="'+box+'"><div style="color:#64748b;font-size:10px">اكتمال</div><div style="font-size:16px;font-weight:900">'+hindi(r.completion)+'%</div></div><div style="'+box+'"><div style="color:#64748b;font-size:10px">الترتيب</div><div style="font-size:16px;font-weight:900">'+rankTxt+' / '+hindi(sorted.length)+'</div></div><div style="'+box+'"><div style="color:#64748b;font-size:10px">السرعة</div><div style="font-size:15px;font-weight:900">'+hindi(r.speedPct)+'%</div></div><div style="'+box+'"><div style="color:#64748b;font-size:10px">الدقة</div><div style="font-size:15px;font-weight:900">'+hindi(r.accuracy)+'%</div></div><div style="'+box+'"><div style="color:#64748b;font-size:10px">النقاط</div><div style="font-size:16px;font-weight:900">'+hindi(r.points)+'</div></div></div><table style="width:100%;border-collapse:collapse;font-size:12px;border:2px solid #3f7a57"><thead><tr><th style="'+th+'">م</th><th style="'+th+'">المادة</th><th style="'+th+'">الفصول</th></tr></thead><tbody>'+assignsRows+'</tbody></table>'+footer+'</div>';
    if(typeof fitPrintPagesToA4==='function') fitPrintPagesToA4(area,'.grade-sheet-page, .detailed-sheet-page');
    const prevTitle=document.title; document.title='كارت المعلم'; window.print();
    setTimeout(function(){document.title=prevTitle; if(typeof clearAllPrintAreas==='function') clearAllPrintAreas();},800);
  };

  GSP.monTeacherFeedback = async function(teacherId, type){
    if (currentAccountType !== 'monitor') {
      alert('التقييم متاح لمدير المرحلة فقط.');
      return;
    }
    const map = {
      like: { delta: 10, type: 'like' },
      dislike: { delta: -10, type: 'dislike' },
      exceptional: { delta: 100, type: 'exceptional' },
      severe: { delta: -100, type: 'severe' }
    };
    const conf = map[type] || map.like;
    if (type === 'exceptional' || type === 'severe') {
      const label = type === 'exceptional' ? '⭐ عمل استثنائي (+100)' : '⚠ خطأ جسيم (−100)';
      if (!(await showConfirm(label + '\n\nتأكيد التطبيق على المعلم؟'))) return;
    }
    const db = loadDB();
    const fb = ensureTeacherFeedback(db);
    fb.points[teacherId] = Number(fb.points[teacherId]||0) + conf.delta;
    const now = new Date();
    const monthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    fb.log.push({
      teacherId: String(teacherId),
      type: conf.type,
      points: conf.delta,
      by: (currentStageMonitor && (currentStageMonitor.name || currentStageMonitor.id)) || 'monitor',
      at: now.toISOString(),
      monthKey
    });
    if (fb.log.length > 5000) fb.log = fb.log.slice(-4000);
    saveDB(db);
    if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
    renderMonitorTeachersPanel();
  };

  GSP.printTeacherPointsReport = function(){
    if (!(currentAccountType === 'monitor' || currentAccountType === 'superadmin' || currentAccountType === 'stageadmin')) {
      alert('التقرير متاح للإدارة والمراقب.');
      return;
    }
    const db = loadDB();
    const data = buildMonitorTeacherRows(db, {});
    const top = data.all.slice().sort((a,b)=> b.points-a.points || a.t.name.localeCompare(b.t.name||'','ar')).slice(0,10);
    const bottom = data.all.slice().sort((a,b)=> a.points-b.points || a.t.name.localeCompare(b.t.name||'','ar')).slice(0,10);
    const info = db.schoolInfo || {};
    const iso = todayISO();
    const stageLabel = (typeof getStageRecord==='function' && typeof stageDisplayLabel==='function' && currentStageId)
      ? stageDisplayLabel(getStageRecord(currentStageId)) : '';
    const hindi = (typeof toHindiDigits === 'function') ? toHindiDigits : (v => String(v));
    const th = 'border:1px solid #94a3b8;padding:7px;background:#3f7a57;color:#fff;font-weight:800;text-align:center';
    const td = 'border:1px solid #94a3b8;padding:6px;text-align:right';
    const tdc = 'border:1px solid #94a3b8;padding:6px;text-align:center';
    function rowsOf(arr){
      return arr.map((r,i)=>`<tr>
        <td style="${tdc}">${hindi(i+1)}</td>
        <td style="${td};font-weight:700">${esc(r.t.name||'')}</td>
        <td style="${td};font-size:11px">${esc(r.subjects)}</td>
        <td style="${tdc}">${hindi(r.points)}</td>
        <td style="${tdc}">#${hindi(r.speedRank)}</td>
        <td style="${tdc}">#${hindi(r.accRank)}</td>
        <td style="${tdc}">${hindi(r.absenceDays)}</td>
      </tr>`).join('') || `<tr><td colspan="7" style="${tdc}">—</td></tr>`;
    }
    const area = document.getElementById('printGradeSheetArea') || document.getElementById('printAttendanceArea');
    if (!area) return;
    if (typeof clearInactivePrintAreas==='function') clearInactivePrintAreas(area.id);
    const printedBy = (typeof resolvePrintedByName === 'function') ? resolvePrintedByName() : 'المستخدم';
    const printDate = new Date().toLocaleDateString('ar-EG');
    const metaBarHtml = [
      `<span><strong>المرحلة:</strong> ${esc(stageLabel||'—')}</span>`,
      `<span><strong>التاريخ:</strong> ${esc(iso)}</span>`
    ].join('');
    const letterhead = (typeof buildUnifiedLetterhead === 'function')
      ? buildUnifiedLetterhead({
          title: 'تقرير نقاط تقييم المعلمين — ' + (stageLabel || ''),
          subtitleRight: '',
          subtitleLeft: '',
          printedBy,
          printDate,
          governorate: info.governorate || '',
          educationAdmin: info.educationAdmin || '',
          schoolName: info.schoolName || '',
          academicYear: info.academicYear || '',
          metaBarHtml
        })
      : '';
    const footer = (typeof buildUnifiedFooter === 'function')
      ? buildUnifiedFooter({ captions: ['معدّ التقرير', 'مدير المرحلة'] })
      : '';
    area.innerHTML = `<div class="grade-sheet-page detailed-sheet-page" style="padding:8mm;font-family:'Cairo',Tahoma,sans-serif;direction:rtl;color:#0f172a">
      ${letterhead}
      <div style="font-size:11px;color:#64748b;margin:0 0 3mm;text-align:center">أعلى 10 وأقل 10 حسب نقاط الإعجاب/عدم الإعجاب (👍 +10 · 👎 −10)</div>
      <div style="font-size:13px;font-weight:800;color:#0b5e42;margin-bottom:2mm">⭐ أعلى 10 معلمين نقاطاً</div>
      <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:6mm;border:2px solid #3f7a57">
        <thead><tr>
          <th style="${th}">م</th><th style="${th}">المعلم</th><th style="${th}">المواد</th>
          <th style="${th}">النقاط</th><th style="${th}">رتبة السرعة</th><th style="${th}">رتبة الدقة</th><th style="${th}">أيام الغياب</th>
        </tr></thead>
        <tbody>${rowsOf(top)}</tbody>
      </table>
      <div style="font-size:13px;font-weight:800;color:#b91c1c;margin-bottom:2mm">📉 أقل 10 معلمين نقاطاً</div>
      <table style="width:100%;border-collapse:collapse;font-size:11.5px;border:2px solid #3f7a57">
        <thead><tr>
          <th style="${th}">م</th><th style="${th}">المعلم</th><th style="${th}">المواد</th>
          <th style="${th}">النقاط</th><th style="${th}">رتبة السرعة</th><th style="${th}">رتبة الدقة</th><th style="${th}">أيام الغياب</th>
        </tr></thead>
        <tbody>${rowsOf(bottom)}</tbody>
      </table>
      ${footer}
    </div>`;
    if (typeof fitPrintPagesToA4 === 'function') fitPrintPagesToA4(area, '.grade-sheet-page, .detailed-sheet-page');
    const prev = document.title;
    document.title = 'تقرير نقاط المعلمين';
    window.print();
    setTimeout(() => {
      document.title = prev;
      if (typeof clearAllPrintAreas==='function') clearAllPrintAreas();
    }, 800);
  };

    document.addEventListener('DOMContentLoaded', function(){
    const dash = document.getElementById('dashboard');
    if (dash && !document.getElementById('teacherCheckInSlot')) {
      const slot = document.createElement('div');
      slot.id = 'teacherCheckInSlot';
      slot.style.cssText = 'display:none;margin-bottom:12px';
      dash.insertBefore(slot, dash.firstChild);
    }
  });
})();
