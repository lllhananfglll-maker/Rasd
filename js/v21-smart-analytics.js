(function(){
  'use strict';
  const esc = escapeHtml; // مصدر واحد لمنطق الهروب من HTML (راجع تعريف escapeHtml الرئيسي)
  function d(){try{return loadDB();}catch(e){return {students:[],teachers:[],subjects:[],grades:[],classes:[],schoolInfo:{}};}}
  function relevant(sub){return (sub.components||[]).filter(c=>!c.isMonthlyGrade&&c.type!=='attendance');}
  function gradeVals(grades,studentId,subject,term){return grades.filter(g=>g.studentId===studentId&&g.subjectName===subject&&g.term===term&&g.score!==''&&g.score!=null).map(g=>Number(g.score)).filter(Number.isFinite);}
  function renderV21Analytics(){
    const block=document.getElementById('v21AnalyticsBlock'); if(!block)return;
    const statsTab=document.getElementById('tab-stats');
    const statsActive=statsTab && statsTab.classList.contains('active');
    if(currentAccountType==='teacher' || !statsActive){block.style.display='none';return;}
    block.style.display='block';
    const db=d(), term=(document.getElementById('statsTermSelect')?.value)||'first';
    const students=db.students||[], teachers=db.teachers||[], subjects=db.subjects||[], grades=(db.grades||[]).filter(g=>g.term===term), classes=db.classes||[];
    const months=(typeof getMonthLabels==='function'?getMonthLabels(term):[])||[];
    const totalExpected=students.reduce((sum,st)=>sum+subjects.filter(sub=>canAccessStudentGrade(sub.name,st)).reduce((a,sub)=>a+relevant(sub).length,0),0);
    const totalDone=grades.filter(g=>g.score!==''&&g.score!=null).length;
    const completion=totalExpected?Math.min(100,Math.round(totalDone/totalExpected*100)):(students.length?0:100);
    const missingStudents=students.filter(s=>!grades.some(g=>g.studentId===s.id));
    const filledStudents=students.length-missingStudents.length;
    const completeSubjects=subjects.filter(sub=>{const comps=relevant(sub);if(!comps.length)return false;return students.every(st=>comps.every(c=>grades.some(g=>g.studentId===st.id&&g.subjectName===sub.name&&g.componentIndex===sub.components.indexOf(c)&&g.score!==''&&g.score!=null)));}).length;
    document.getElementById('v21Kpis').innerHTML=`<div class="v21-kpi"><b>${completion}%</b><span>اكتمال الرصد</span></div><div class="v21-kpi"><b>${teachers.length}</b><span>عدد المعلمين</span></div><div class="v21-kpi"><b>${filledStudents}</b><span>طلاب لديهم درجات</span></div><div class="v21-kpi"><b>${completeSubjects}/${subjects.length}</b><span>مواد مكتملة</span></div>`;

    const insights=[];
    if(!students.length) insights.push(['danger','📥 لا توجد بيانات طلاب','ابدأ برفع ملف الطلاب قبل بناء التحليلات.']);
    if(completion<50 && totalExpected) insights.push(['danger',`🔴 اكتمال الرصد ${completion}% فقط`,`هناك فجوة كبيرة في إدخال الدرجات وتستحق المتابعة الآن.`]);
    else if(completion<90 && totalExpected) insights.push(['warn',`🟡 تبقى ${100-completion}% للوصول إلى الاكتمال`,`يمكن استخدام قائمة المعلمين أدناه لتحديد الأولوية.`]);
    else if(totalExpected) insights.push(['good','🟢 مستوى الإنجاز مرتفع',`وصل اكتمال الرصد إلى ${completion}%. استمر في مراجعة الحالات المتبقية.`]);
    const teacherRows=teachers.map(t=>({t,c:typeof completionForTeacher==='function'?completionForTeacher(t):{pct:0,missing:0}})).sort((a,b)=>a.c.pct-b.c.pct);
    const lagging=teacherRows.filter(x=>x.c.missing>0).slice(0,3);
    lagging.forEach(x=>insights.push(['info',`👨‍🏫 ${x.t.name} — ${x.c.pct}% مكتمل`,`متبقٍ ${x.c.missing} خانة رصد تقريباً.`]));
    if(missingStudents.length) insights.push(['warn',`👨‍🎓 ${missingStudents.length} طالب بلا درجات في ${term==='first'?'الفصل الأول':'الفصل الثاني'}`,`راجعهم للتأكد من أن عدم وجود الدرجات مقصود وليس نتيجة نقص في الاستيراد أو الرصد.`]);
    document.getElementById('v21Insights').innerHTML=insights.length?insights.map(x=>`<div class="v21-insight"><span class="v21-badge v21-${x[0]}">${x[0]==='danger'?'عاجل':x[0]==='warn'?'متابعة':x[0]==='good'?'جيد':'معلومة'}</span><div><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></div></div>`).join(''):'<div class="v21-empty">لا توجد ملاحظات تحليلية حالياً.</div>';

    document.getElementById('v21TeacherAnalytics').innerHTML=teacherRows.length?teacherRows.slice(0,10).map(x=>`<div class="v21-row"><div style="flex:1"><div class="v21-name">${esc(x.t.name)}</div><div class="v21-bar"><i style="width:${x.c.pct}%"></i></div><div class="v21-note">${x.c.pct}% مكتمل${x.c.missing?` — ${x.c.missing} متبقٍ`:''}</div></div><span class="v21-badge ${x.c.pct>=90?'v21-good':x.c.pct>=50?'v21-warn':'v21-danger'}">${x.c.pct}%</span></div>`).join(''):'<div class="v21-empty">لا يوجد معلمون مسجلون.</div>';

    const subjectRows=subjects.map(sub=>{
      const comps=relevant(sub), max=comps.reduce((a,c)=>a+Number(c.maxScore||0),0); const vals=[];
      students.forEach(st=>{const gs=gradeVals(grades,st.id,sub.name,term);if(gs.length) vals.push(gs.reduce((a,v)=>a+v,0));});
      const avg=vals.length?vals.reduce((a,v)=>a+v,0)/vals.length:null; const pct=max&&avg!=null?Math.round(avg/max*100):null;
      return {name:sub.name,avg,pct,count:vals.length,max};
    }).filter(x=>x.count>0).sort((a,b)=>(a.pct??-1)-(b.pct??-1));
    document.getElementById('v21SubjectAnalytics').innerHTML=subjectRows.length?`<table class="v21-table"><thead><tr><th>المادة</th><th>الطلاب</th><th>المتوسط</th><th>نسبة من الحد الأقصى</th></tr></thead><tbody>${subjectRows.slice(0,12).map(x=>`<tr><td>${esc(x.name)}</td><td>${x.count}</td><td>${x.avg!=null?x.avg.toFixed(1):'—'}</td><td>${x.pct!=null?`<span class="v21-badge ${x.pct>=75?'v21-good':x.pct>=50?'v21-warn':'v21-danger'}">${x.pct}%</span>`:'—'}</td></tr>`).join('')}</tbody></table>`:'<div class="v21-empty">لا توجد درجات كافية لتحليل المواد.</div>';

    const classRows=classes.map(cls=>{
      const ss=students.filter(s=>classSectionKey(s.class,s.section)===cls); const gs=grades.filter(g=>ss.some(s=>s.id===g.studentId)); const vals=gs.map(g=>Number(g.score)).filter(Number.isFinite); return {cls,count:ss.length,grades:gs.length,avg:vals.length?vals.reduce((a,v)=>a+v,0)/vals.length:0};
    }).filter(x=>x.count).sort((a,b)=>b.avg-a.avg);
    document.getElementById('v21ClassAnalytics').innerHTML=classRows.length?`<table class="v21-table"><thead><tr><th>الفصل</th><th>الطلاب</th><th>سجلات الدرجات</th><th>متوسط الدرجات المدخلة</th></tr></thead><tbody>${classRows.slice(0,12).map(x=>`<tr><td>${esc(classSectionLabel(x.cls))}</td><td>${x.count}</td><td>${x.grades}</td><td>${x.grades?x.avg.toFixed(1):'—'}</td></tr>`).join('')}</tbody></table>`:'<div class="v21-empty">لا توجد فصول تحتوي على بيانات قابلة للمقارنة.</div>';

    const studentRows=students.map(st=>{
      const gs=grades.filter(g=>g.studentId===st.id&&g.score!==''&&g.score!=null); const subs=new Set(gs.map(g=>g.subjectName)); const possible=subjects.reduce((a,s)=>a+relevant(s).length,0); const pct=possible?Math.round(gs.length/possible*100):0; return {st,count:gs.length,pct,subs:subs.size};
    }).filter(x=>x.count===0||x.pct<50).sort((a,b)=>a.pct-b.pct);
    document.getElementById('v21StudentAnalytics').innerHTML=studentRows.length?`<table class="v21-table"><thead><tr><th>الطالب</th><th>الفصل</th><th>المكونات المرصودة</th><th>نسبة الاكتمال التقريبية</th><th></th></tr></thead><tbody>${studentRows.slice(0,30).map(x=>`<tr><td>${esc(x.st.name)}</td><td>${esc(classSectionLabel(classSectionKey(x.st.class,x.st.section)))}</td><td>${x.count}</td><td><span class="v21-badge ${x.pct===0?'v21-danger':'v21-warn'}">${x.pct}%</span></td><td><button class="btn btn-outline btn-sm" data-action="v20OpenStudent" data-args='${gspArgs([x.st.id])}'>فتح الملف</button></td></tr>`).join('')}</tbody></table>${studentRows.length>30?`<div class="v21-note" style="margin-top:8px">يتم عرض أول 30 حالة فقط. استخدم البحث الشامل للوصول إلى باقي الطلاب.</div>`:''}`:'<div class="v21-empty">🎉 لا توجد حالات واضحة تحتاج إلى مراجعة بناءً على اكتمال الدرجات.</div>';
  }
  GSP.switchV21Tab=function(tab){
    document.querySelectorAll('#v21Pills .v21-pill').forEach(b=>b.classList.toggle('active', b.getAttribute('data-v21-tab')===tab));
    document.querySelectorAll('.v21-tab-panel').forEach(p=>p.classList.toggle('active', p.id==='v21Panel-'+tab));
  };
  GSP.renderV21Analytics=renderV21Analytics;
  const oldStats=GSP.loadStatsUI;
  GSP.loadStatsUI=function(){if(typeof oldStats==='function')oldStats.apply(this,arguments);setTimeout(renderV21Analytics,50);};
  // لا تُعرض اللوحة تلقائياً إلا عند فتح تبويب التقارير (عبر loadStatsUI)
})();
