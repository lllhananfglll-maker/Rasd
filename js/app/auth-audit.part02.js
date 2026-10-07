/* auth-audit.part02.js — generated from auth-audit.js; execution order is significant. */


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
        extraHtml += '<p style="font-size:12px;color:#64748b;margin-top:8px">يُظهر أين يوجد تركيز أو نقص في إسناد المعلمين للمواد.</p>';
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
