(function(){
  'use strict';
  const V20 = { searchTimer:null };
  const esc = escapeHtml; // مصدر واحد لمنطق الهروب من HTML (راجع تعريف escapeHtml الرئيسي)
  function db(){ return GSP.gspSafeDb(); }
  function activeStudents(){ return db().students||[]; }
  function relevantComponents(subject){ return GSP.gspRelevantGradeComponents(subject); }
  function gradeKey(g){ return [g.studentId,g.subjectName,g.term,g.month,g.componentIndex].join('|'); }
  // كاش إكمال الرصد — يُبطَل تلقائياً من saveDB عبر GSP.invalidateCompletionCache
  let _compCache = { key: '', doneKeys: null, byTeacherId: null, all: null };
  function invalidateCompletionCache(){ _compCache = { key: '', doneKeys: null, byTeacherId: null, all: null }; GSP.__attnConflictsCache = null; }
  GSP.invalidateCompletionCache = invalidateCompletionCache;
  function buildDoneGradeKeys(grades){
    const set = new Set();
    (grades || []).forEach(g => {
      if (g.score !== undefined && g.score !== null && g.score !== '')
        set.add(String(g.studentId) + '|' + g.subjectName + '|' + g.componentIndex);
    });
    return set;
  }
  function completionCacheKey(d){
    return [currentStageId || '', (d.students||[]).length, (d.teachers||[]).length, (d.subjects||[]).length, (d.grades||[]).length].join('|');
  }
  function ensureCompCache(d){
    const key = completionCacheKey(d);
    if (_compCache.key !== key) {
      _compCache = { key, doneKeys: buildDoneGradeKeys(d.grades), byTeacherId: Object.create(null), all: null };
    }
    return _compCache;
  }
  function completionForTeacher(t){
    const d = db();
    const cache = ensureCompCache(d);
    const tid = t && (t.id || t.name) || '';
    if (tid && cache.byTeacherId[tid]) return cache.byTeacherId[tid];
    const subjects = d.subjects || [], students = d.students || [];
    const doneKeys = cache.doneKeys;
    let expected = 0, done = 0;
    (t.assignments || []).forEach(a => {
      const sub = subjects.find(s => s.name === a.subjectName);
      if (!sub) return;
      const comps = relevantComponents(sub);
      if (!comps.length) return;
      const clsSet = new Set(a.classes || []);
      const clsStudents = students.filter(st => clsSet.has(classSectionKey(st.class, st.section)) && canAccessStudentGrade(a.subjectName, st));
      const n = clsStudents.length;
      if (!n) return;
      comps.forEach(c => {
        const ci = sub.components.indexOf(c);
        expected += n;
        const prefix = '|' + sub.name + '|' + ci;
        for (let i = 0; i < n; i++) {
          if (doneKeys.has(String(clsStudents[i].id) + prefix)) done++;
        }
      });
    });
    const result = { expected, done, pct: expected ? Math.min(100, Math.round(done / expected * 100)) : 100, missing: Math.max(0, expected - done) };
    if (tid) cache.byTeacherId[tid] = result;
    return result;
  }
  function allCompletion(){
    const d = db();
    const cache = ensureCompCache(d);
    if (cache.all) return cache.all;
    const teachers = d.teachers || [];
    let result;
    if (currentAccountType === 'teacher' && currentTeacher) {
      result = completionForTeacher(currentTeacher);
    } else {
      let expected = 0, done = 0;
      teachers.forEach(t => { const c = completionForTeacher(t); expected += c.expected; done += c.done; });
      result = { expected, done, pct: expected ? Math.min(100, Math.round(done / expected * 100)) : ((d.students || []).length ? 0 : 100), missing: Math.max(0, expected - done) };
    }
    cache.all = result;
    return result;
  }
  GSP.completionForTeacher = completionForTeacher;
  GSP.allCompletion = allCompletion;
  function buildV20(){
    // البحث والمهام مدمجة في هيكل لوحة التحكم — ربط الأحداث مرة واحدة فقط
    if (GSP._v20SearchBound) return;
    const input=document.getElementById('v20GlobalSearchInline');
    if (input) {
      input.addEventListener('input',()=>v20Search(input.value));
      input.addEventListener('keydown',e=>{if(e.key==='Escape'){input.value='';v20HideResults();}});
      GSP._v20SearchBound = true;
    }
  }
  function v20FocusSearch(){ const i=document.getElementById('v20GlobalSearchInline'); if(i){activateTab('dashboard');setTimeout(()=>{i.focus();i.select();},80);} }
  GSP.v20FocusSearch=v20FocusSearch;
  function v20HideResults(){const r=document.getElementById('v20SearchResultsInline');if(r)r.style.display='none';}
  function v20Search(q){
    const r=document.getElementById('v20SearchResultsInline'); if(!r)return; q=String(q||'').trim().toLowerCase(); if(!q){v20HideResults();return;}
    const d=db(), out=[];
    (d.students||[]).filter(s=>{
      if (!(currentRole!=='teacher' || (d.subjects||[]).some(sub=>canAccessStudentGrade(sub.name,s)))) return false;
      const nameOk = (s.name||'').toLowerCase().includes(q);
      const seatOk = (s.seat||'').includes(q);
      const nidOk = (typeof canViewNationalId==='function' ? canViewNationalId() : currentAccountType!=='teacher') && (s.nationalId||'').includes(q);
      return nameOk || seatOk || nidOk;
    }).slice(0,12).forEach(s=>{
      const canSeeNid = (typeof canViewNationalId==='function') ? canViewNationalId() : (currentAccountType!=='teacher');
      const note = `${s.class||''}${s.section?' — '+(s.section==='languages'?'لغات':'عربي'):''}` + (canSeeNid ? ` | ${s.nationalId||'بدون رقم قومي'}` : (s.seat ? ` | جلوس ${s.seat}` : ''));
      out.push({type:'student',title:'👨‍🎓 '+s.name,note,action:()=>v20OpenStudent(s.id)});
    });
    if(currentRole!=='teacher'){
      (d.teachers||[]).filter(t=>(t.name||'').toLowerCase().includes(q)).slice(0,8).forEach(t=>out.push({type:'teacher',title:'🧑‍🏫 '+t.name,note:(t.assignments||[]).map(a=>a.subjectName).join('، ')||'بدون تخصيص',action:()=>activateTab('teachers')}));
      (d.subjects||[]).filter(s=>(s.name||'').toLowerCase().includes(q)).slice(0,8).forEach(s=>out.push({type:'subject',title:'📚 '+s.name,note:`${(s.components||[]).length} مكوّن`,action:()=>activateTab('subjects')}));
    }
    if(!out.length){r.innerHTML='<div class="v20-empty">لا توجد نتائج مطابقة.</div>';r.style.display='block';return;}
    r.innerHTML=out.map((x,i)=>`<div class="v20-result" data-v20-result="${i}"><div class="v20-item-title">${esc(x.title)}</div><div class="v20-item-note">${esc(x.note)}</div></div>`).join('');
    out.forEach((x,i)=>r.querySelector(`[data-v20-result="${i}"]`).onclick=()=>{x.action();v20HideResults();}); r.style.display='block';
  }
  GSP.v20Search=v20Search;
  GSP.v20OpenStudentSearch=function(){v20FocusSearch();};
  function tasks(){
    const d=db(), arr=[];
    if(!(d.students||[]).length) arr.push({kind:'danger',title:'رفع بيانات الطلاب',note:'لا توجد بيانات طلاب في المرحلة الحالية.',btn:'رفع الملف',go:()=>activateTab('upload')});
    const c=allCompletion();
    if(c.missing>0) arr.push({kind:'warn',title:'استكمال الدرجات',note:`متبقٍ تقريباً ${c.missing} خانة رصد.`,btn:'مراجعة',go:()=>activateTab('grades')});
    if(currentAccountType!=='teacher'){
      (d.teachers||[]).map(t=>({t,c:completionForTeacher(t)})).filter(x=>x.c.missing>0).sort((a,b)=>b.c.missing-a.c.missing).slice(0,4).forEach(x=>arr.push({kind:x.c.pct<50?'danger':'warn',title:`متابعة ${x.t.name}`,note:`اكتمال ${x.c.pct}% — متبقٍ ${x.c.missing}`,btn:'عرض المعلمين',go:()=>activateTab('teachers')}));
    }
    return arr.slice(0,7);
  }
  function renderV20(){
    buildV20();
    const c=allCompletion(), d=db();
    const alerts=document.getElementById('v20Alerts'), taskEl=document.getElementById('v20Tasks'), team=document.getElementById('v20TeamSummary'), prog=document.getElementById('v20TeacherProgress');
    if(alerts){ const a=[]; if(c.missing)a.push({k:'warn',t:`🟡 توجد ${c.missing} خانة درجات تحتاج إلى استكمال`,n:`نسبة الإنجاز الحالية ${c.pct}%`,b:'مراجعة',go:()=>activateTab('grades')}); const conflicts=(d.students||[]).filter(s=>s.conflictFlag).length; if(conflicts)a.push({k:'danger',t:`🔴 ${conflicts} طالب يحتاج مراجعة بيانات`,n:'يوجد تعارض في بيانات القاعدة الرسمية.',b:'مراجعة',go:()=>{if(currentAccountType==='superadmin')activateTab('masterroster');}}); if(!a.length)a.push({k:'ok',t:'🟢 كل شيء تحت السيطرة',n:'لا توجد تنبيهات رئيسية حالياً.',b:'',go:null}); alerts.innerHTML=a.map(x=>`<div class="v20-item"><div class="v20-item-main"><div class="v20-item-title">${x.t}</div><div class="v20-item-note">${x.n}</div></div>${x.b?`<button class="btn btn-outline btn-sm">${x.b}</button>`:''}</div>`).join(''); a.forEach((x,i)=>{if(x.go&&alerts.children[i]){const b=alerts.children[i].querySelector('button');if(b)b.onclick=x.go;}}); }
    if(taskEl){const ts=tasks();taskEl.innerHTML=ts.length?ts.map((x,i)=>`<div class="v20-item"><div class="v20-item-main"><div class="v20-item-title"><span class="v20-pill v20-${x.kind}">${x.kind==='danger'?'عاجل':'مهمة'}</span> ${esc(x.title)}</div><div class="v20-item-note">${esc(x.note)}</div></div><button class="btn btn-outline btn-sm" data-task="${i}">${x.btn}</button></div>`).join(''):'<div class="v20-empty">🎉 لا توجد مهام معلقة. أحسنت!</div>'; ts.forEach((x,i)=>{const b=taskEl.querySelector(`[data-task="${i}"]`);if(b)b.onclick=x.go;});}
    if(team){team.innerHTML=`<div class="v20-mini-grid"><div class="v20-mini"><b>${c.pct}%</b>إنجاز</div><div class="v20-mini"><b>${(d.students||[]).length}</b>طلاب</div><div class="v20-mini"><b>${(d.teachers||[]).length}</b>معلمين</div></div>`;}
    if(prog){if(currentAccountType==='teacher'){prog.innerHTML=`<div class="v20-item"><div class="v20-item-main"><div class="v20-item-title">${esc(currentTeacher?.name||'المعلم')}</div><div class="v20-progress"><span style="width:${c.pct}%"></span></div><div class="v20-item-note">${c.pct}% مكتمل — ${c.missing} متبقٍ</div></div><span class="v20-pill ${c.pct===100?'v20-ok':'v20-info'}">${c.pct===100?'مكتمل':'قيد العمل'}</span></div>`;}else{const rows=(d.teachers||[]).map(t=>({t,c:completionForTeacher(t)})).sort((a,b)=>a.c.pct-b.c.pct).slice(0,8);prog.innerHTML=rows.length?rows.map(x=>`<div class="v20-item"><div class="v20-item-main"><div class="v20-item-title">${esc(x.t.name)}</div><div class="v20-progress"><span style="width:${x.c.pct}%"></span></div><div class="v20-item-note">${x.c.pct}% — ${x.c.missing?`متبقٍ ${x.c.missing}`:'مكتمل'}</div></div><span class="v20-pill ${x.c.pct===100?'v20-ok':x.c.pct<50?'v20-danger':'v20-warn'}">${x.c.pct}%</span></div>`).join(''):'<div class="v20-empty">لا يوجد معلمون مسجلون بعد.</div>';}}
  }
  // يحسب نسبة الحضور الإجمالية لطالب معيّن عبر كل شهور الفصلين الدراسيين، لمجموعة مواد معطاة
  // (مادة واحدة/مواد المعلم فقط لبطاقة المعلم = نسبة حضور خاصة بمادته، أو كل المواد المتاحة لبطاقة
  // مدير المرحلة/الإدارة = نسبة حضور عامة). يعيد rate=null إن لم توجد بيانات حضور مسجَّلة بعد.
  function v20ComputeStudentAttendance(studentId, subjectNames){
    try {
      const d = db(); const att = (typeof ensureAttendance === 'function') ? ensureAttendance(d) : null;
      const student = (d.students||[]).find(x=>x.id===studentId);
      if (!att || !student || !subjectNames || !subjectNames.length) return { expected:0, absent:0, present:0, rate:null };
      const classKey = (typeof classSectionKey === 'function') ? classSectionKey(student.class, student.section) : (student.class||'');
      let expected = 0, absent = 0;
      ['first','second'].forEach(term => {
        const labels = (typeof getMonthLabels === 'function') ? getMonthLabels(term) : ['الشهر الأول','الشهر الثاني'];
        labels.forEach((_, mi) => {
          const month = mi + 1;
          const columns = (typeof getMonthCalendarDays === 'function') ? getMonthCalendarDays(term, month) : [];
          if (!columns.length) return;
          subjectNames.forEach(subjectName => {
            const studyDays = (typeof getSubjectStudyDays === 'function') ? getSubjectStudyDays(att, subjectName, classKey) : [0,1,2,3,4];
            const calc = computeStudentAttendanceScore(att, studentId, subjectName, term, month, columns, studyDays, 10);
            expected += calc.expected; absent += calc.absent;
          });
        });
      });
      const present = expected - absent;
      return { expected, absent, present, rate: expected ? Math.round((present/expected)*1000)/10 : null };
    } catch(e) { return { expected:0, absent:0, present:0, rate:null }; }
  }
  GSP.v20ComputeStudentAttendance = v20ComputeStudentAttendance;

  function v20OpenStudent(id){
    const s=(db().students||[]).find(x=>x.id===id); if(!s)return;
    const d=db(), subs=d.subjects||[];
    const allowedList = subs.filter(sub => currentRole!=='teacher' || canAccessStudentGrade(sub.name, s));
    const allowed = new Set(allowedList.map(sub => sub.name));
    const grades = (d.grades||[]).filter(g => g.studentId===id && allowed.has(g.subjectName));
    const classLabel = (s.class||'—') + (s.section ? (s.section==='languages'?' (لغات)':' (عربي)') : '');
    document.getElementById('v20StudentModalTitle').textContent = '👨‍🎓 ' + (s.name||'الطالب');
    const canSeeNid = (typeof canViewNationalId === 'function') ? canViewNationalId() : (currentAccountType !== 'teacher');
    document.getElementById('v20StudentModalSub').textContent = canSeeNid
      ? `الصف: ${s.class||'—'} | القسم: ${s.section==='languages'?'لغات':'عربي'} | رقم الجلوس: ${s.seat||'—'} | الرقم القومي: ${s.nationalId||'—'}`
      : `الصف: ${s.class||'—'} | القسم: ${s.section==='languages'?'لغات':'عربي'} | رقم الجلوس: ${s.seat||'—'}`;

    // تجميع الدرجات حسب المادة
    const bySub = {};
    grades.forEach(g => (bySub[g.subjectName] ??= []).push(g));

    // تفاصيل كل مادة مسموح بها (مرصودة + غير مرصودة)
    let overallScore = 0, overallMax = 0, subjectsWithGrades = 0, subjectsEmpty = 0;
    const subjectRows = [];
    allowedList.forEach(sub => {
      const name = sub.name;
      const list = bySub[name] || [];
      const vals = list.filter(x => x.score !== '' && x.score != null);
      // مكوّنات أكاديمية فقط (بدون حضور وبدون الدرجة الشهرية المكررة إن وُجدت)
      const comps = (sub.components || []).filter(c => c.type !== 'attendance' && !c.isMonthlyGrade);
      const maxPossible = comps.reduce((a, c) => a + (Number(c.maxScore) || 0), 0);
      // مجموع الدرجات الرقمية فقط (استبعاد غ)
      let total = 0, numericCount = 0, absentCount = 0;
      vals.forEach(x => {
        const isAbs = (typeof isAbsentMark === 'function') ? isAbsentMark(x.score) : (x.score === 'غ');
        if (isAbs) { absentCount++; return; }
        const n = Number(x.score);
        if (Number.isFinite(n)) { total += n; numericCount++; }
      });
      const hasAny = vals.length > 0;
      if (hasAny) subjectsWithGrades++; else subjectsEmpty++;
      let pct = null;
      if (hasAny && maxPossible > 0 && numericCount > 0) {
        // نسبة من الحد الأقصى للمكوّنات الأكاديمية للمادة (تقريبي عند الرصد الجزئي)
        pct = Math.round((total / maxPossible) * 1000) / 10;
        overallScore += total;
        overallMax += maxPossible;
      }
      let statusLabel = 'لم تُرصد';
      let statusColor = '#94a3b8';
      if (hasAny) {
        if (pct == null) { statusLabel = 'مرصود جزئياً'; statusColor = '#64748b'; }
        else if (pct >= 95) { statusLabel = 'متفوق'; statusColor = '#2563eb'; }
        else if (pct < 50) { statusLabel = 'خط خطر'; statusColor = '#b91c1c'; }
        else if (pct < 70) { statusLabel = 'يحتاج متابعة'; statusColor = '#b45309'; }
        else { statusLabel = 'جيد'; statusColor = '#0b5e42'; }
      }
      const totalCell = !hasAny ? '—' : (numericCount ? `${total}${maxPossible ? ' / ' + maxPossible : ''}` : (absentCount ? 'غ' : '—'));
      const pctCell = pct == null ? '—' : (pct + '%');
      subjectRows.push({
        name, recorded: vals.length, totalCell, pctCell, statusLabel, statusColor, hasAny, pct
      });
    });
    // ترتيب: المواد المرصودة أولاً ثم الأبجدية
    subjectRows.sort((a, b) => (b.hasAny - a.hasAny) || a.name.localeCompare(b.name, 'ar'));

    const overallPct = overallMax > 0 ? Math.round((overallScore / overallMax) * 1000) / 10 : null;
    let overallBadge = '';
    if (overallPct != null) {
      let lab = 'جيد', col = '#0b5e42', bg = '#ecfdf5';
      if (overallPct >= 95) { lab = 'متفوق'; col = '#1e40af'; bg = '#eff6ff'; }
      else if (overallPct < 50) { lab = 'تحت خط الخطر'; col = '#991b1b'; bg = '#fef2f2'; }
      else if (overallPct < 70) { lab = 'يحتاج متابعة'; col = '#9a3412'; bg = '#fff7ed'; }
      overallBadge = `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:800;color:${col};background:${bg};border:1px solid ${col}33">${overallPct}% · ${lab}</span>`;
    } else {
      overallBadge = `<span style="display:inline-flex;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;color:#64748b;background:#f1f5f9">لا تقييم بعد</span>`;
    }

    // المواظبة
    const attSubjects = Array.from(allowed);
    const attSummary = v20ComputeStudentAttendance(id, attSubjects);
    const attLabel = currentRole === 'teacher' ? 'نسبة الحضور (مادتك)' : 'نسبة الحضور العامة';
    let attValue = '—';
    let attNote = 'لم يُسجَّل حضور بعد';
    if (attSummary.rate != null) {
      attValue = attSummary.rate + '%';
      attNote = `حضور ${attSummary.present} · غياب ${attSummary.absent} · متوقع ${attSummary.expected}`;
    }

    // تنبيهات
    const alerts = [];
    if (currentAccountType !== 'teacher' && typeof computeAttendanceConflicts === 'function') {
      const conf = computeAttendanceConflicts().find(c => c.student.id === id);
      if (conf) {
        const subsList = [...new Set(conf.absent.map(x => x.subject))].join('، ');
        alerts.push({ k: 'danger', t: `تعارض حضور: "غ" في (${esc(subsList)}) مع درجات فعلية في مادة أخرى — راجع شئون الطلاب قبل اعتماد الدرجات.` });
      }
    }
    if (overallPct != null && overallPct < 50) {
      alerts.push({ k: 'danger', t: `الطالب تحت خط الخطر (${overallPct}% من المرصود). يستحق متابعة أكاديمية.` });
    } else if (overallPct != null && overallPct >= 95) {
      alerts.push({ k: 'ok', t: `أداء متفوق (${overallPct}%). مرشّح للتكريم.` });
    }
    if (attSummary.rate == null) {
      alerts.push({ k: 'warn', t: 'نسبة الحضور غير متاحة — لم يُسجَّل حضور لهذا الطالب بعد.' });
    } else if (attSummary.rate < 85) {
      alerts.push({ k: 'warn', t: `مواظبة منخفضة (${attSummary.rate}%) — غياب ${attSummary.absent} من ${attSummary.expected} يوماً متوقعاً.` });
    }
    if (subjectsWithGrades === 0) {
      alerts.push({ k: 'warn', t: 'لا توجد أي درجات مرصودة لهذا الطالب بعد.' });
    } else if (subjectsEmpty > 0 && subjectsWithGrades < allowedList.length) {
      alerts.push({ k: 'info', t: `رُصدت ${subjectsWithGrades} مادة فقط من ${allowedList.length} — ${subjectsEmpty} مادة بلا رصد.` });
    }

    const alertHtml = alerts.length
      ? `<div style="margin-bottom:14px;display:flex;flex-direction:column;gap:8px">${alerts.map(a => {
          const styles = {
            danger: 'background:#fef2f2;border:1px solid #fecaca;color:#991b1b',
            warn: 'background:#fff7ed;border:1px solid #fed7aa;color:#9a3412',
            ok: 'background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46',
            info: 'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af'
          };
          return `<div style="padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.7;${styles[a.k]||styles.info}">${a.t}</div>`;
        }).join('')}</div>`
      : '';

    const tableRows = subjectRows.map(r => `<tr style="${r.hasAny?'':'opacity:.72'}">
      <td style="font-weight:700">${esc(r.name)}</td>
      <td style="text-align:center">${r.recorded || '—'}</td>
      <td style="text-align:center;font-weight:700">${r.totalCell}</td>
      <td style="text-align:center;font-weight:800">${r.pctCell}</td>
      <td style="text-align:center"><span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11.5px;font-weight:800;color:#fff;background:${r.statusColor}">${r.statusLabel}</span></td>
    </tr>`).join('');

    const bodyHtml = `
      ${alertHtml}
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px">
        <div style="font-size:13px;color:#64748b">الأداء العام من المرصود</div>
        ${overallBadge}
      </div>
      <div class="v20-mini-grid">
        <div class="v20-mini"><b>${overallPct != null ? overallPct + '%' : '—'}</b>أداء عام</div>
        <div class="v20-mini"><b>${subjectsWithGrades}/${allowedList.length}</b>مواد مرصودة</div>
        <div class="v20-mini"><b>${attValue}</b>${esc(attLabel)}</div>
        <div class="v20-mini"><b>${esc(s.secondLanguage || '—')}</b>لغة ثانية</div>
      </div>
      <div style="margin-top:8px;font-size:12px;color:#64748b;line-height:1.6">${esc(attNote)} · سجلات درجات: ${grades.length}</div>
      <div style="margin-top:18px">
        <h3 style="margin:0 0 10px;font-size:15px">📚 تفصيل المواد</h3>
        ${subjectRows.length
          ? `<div style="overflow:auto"><table class="v20-table"><thead><tr>
              <th>المادة</th><th>مكوّنات مرصودة</th><th>الإجمالي</th><th>النسبة</th><th>الحالة</th>
            </tr></thead><tbody>${tableRows}</tbody></table></div>`
          : '<div class="v20-empty">لا توجد مواد متاحة لهذا الحساب.</div>'}
      </div>`;

    document.getElementById('v20StudentModalBody').innerHTML = bodyHtml;
    document.getElementById('v20StudentModal').style.display = 'flex';
  }
  GSP.v20OpenStudent=v20OpenStudent; GSP.closeV20Student=function(){document.getElementById('v20StudentModal').style.display='none';};
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();v20FocusSearch();} if(e.key==='Escape')GSP.closeV20Student();});
  let _v20RenderTimer = null;
  function scheduleRenderV20(){
    clearTimeout(_v20RenderTimer);
    _v20RenderTimer = setTimeout(renderV20, 180);
  }
  const oldUpdate=GSP.updateDashboard; GSP.updateDashboard=function(){ if(typeof oldUpdate==='function') oldUpdate.apply(this,arguments); scheduleRenderV20(); };
  const oldApply=GSP.applyRoleUI; GSP.applyRoleUI=function(){ if(typeof oldApply==='function') oldApply.apply(this,arguments); scheduleRenderV20(); };
  setTimeout(()=>{if(typeof GSP.updateDashboard==='function')GSP.updateDashboard();},1200);
})();
