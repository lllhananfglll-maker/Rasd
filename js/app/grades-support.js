/**
 * js/app/grades-support.js — الجزء 5/9 من app.js السابق (بعد التقسيم لتحسين قابلية الصيانة)
 * المحتوى: تعارضات الحضور/الغياب + دعم حالة (غير مكتمل)
 * يعتمد على: نفس النطاق المشترك (window/global scope) الذي كان عليه app.js — يجب تحميله
 * بنفس ترتيب الأجزاء كما في index.html، لأن بعض الدوال هنا تُستدعى من دوال معرّفة في أجزاء لاحقة.
 */
'use strict';

    //  رصد "تعارضات الحضور والغياب": طالب مُسجَّل "غ" في مكوّن واحد على الأقل (أي مادة/فصل/شهر)
    //  وله في نفس الوقت درجة رقمية فعلية في مكوّن آخر - سواء في مادة مختلفة، فصل دراسي مختلف، أو
    //  حتى شهر مختلف من نفس المادة. هذا مؤشر خطأ محتمل في الرصد: إما معلم رصد "غ" لطالب دون تأكد
    //  فعلي من غيابه (كسلاً)، أو تشابه أسماء بين طلاب أدى لخلط. يُستثنى مكوّنات الحضور/الغياب نفسها
    //  (type==='attendance') لأنها تقيس نسبة/عدد أيام كرقم إحصائي، وليست درجة أعمال سنة فعلية.
    // ============================================================
    function computeAttendanceConflicts() {
      const d = loadDB();
      const grades = d.grades || [];
      const subjects = d.subjects || [];
      const students = d.students || [];
      const subByName = {}; subjects.forEach(s => subByName[s.name] = s);
      const byStudent = new Map();
      grades.forEach(g => {
        if (g.score === undefined || g.score === null || g.score === '') return;
        const sub = subByName[g.subjectName];
        const comp = sub && sub.components ? sub.components[g.componentIndex] : null;
        if (comp && comp.type === 'attendance') return;
        const entry = { subject: g.subjectName, term: g.term, month: g.month };
        if (!byStudent.has(g.studentId)) byStudent.set(g.studentId, { absent: [], present: [] });
        const rec = byStudent.get(g.studentId);
        if (isAbsentMark(g.score)) rec.absent.push(entry);
        else if (Number.isFinite(parseFloat(g.score))) rec.present.push(entry);
      });
      const conflicts = [];
      byStudent.forEach((rec, sid) => {
        if (rec.absent.length && rec.present.length) {
          const st = students.find(s => s.id === sid);
          if (st) conflicts.push({ student: st, absent: rec.absent, present: rec.present });
        }
      });
      return conflicts;
    }
    GSP.computeAttendanceConflicts = computeAttendanceConflicts;

    function classifyStudentAbsenceConsensus(db, term, month) {
      db = db || loadDB();
      const grades = db.grades || [];
      const subjects = (db.subjects || []).filter(s => s && (s.name || '').trim() !== 'نوع');
      const students = db.students || [];
      const termStr = String(term || 'first');
      const monthNum = Number(month) || 1;
      const results = [];
      const gradeIdx = new Map();
      grades.forEach(g => {
        const k = g.studentId + '|' + g.subjectName + '|' + String(g.term) + '|' + Number(g.month) + '|' + Number(g.componentIndex);
        gradeIdx.set(k, g);
      });

      students.forEach(st => {
        const subjectStatus = [];
        subjects.forEach(sub => {
          const comps = (sub.components || []).map((c, ci) => ({ c, ci })).filter(x => x.c && x.c.type !== 'attendance');
          if (!comps.length) return;
          let hasAbs = false, hasNum = false, hasAny = false, allRecordedAbsent = true, anyMissing = false;
          comps.forEach(({ ci }) => {
            const g = gradeIdx.get(st.id + '|' + sub.name + '|' + termStr + '|' + monthNum + '|' + ci);
            if (!g || g.score === '' || g.score === null || g.score === undefined) { anyMissing = true; allRecordedAbsent = false; return; }
            hasAny = true;
            if (isAbsentMark(g.score)) hasAbs = true;
            else if (Number.isFinite(Number(g.score))) { hasNum = true; allRecordedAbsent = false; }
          });
          let status = 'empty';
          if (hasAny) {
            if (hasAbs && !hasNum && !anyMissing) status = 'all_absent';
            else if (hasNum && !hasAbs) status = 'has_numeric';
            else if (hasNum && hasAbs) status = 'mixed';
            else if (hasAbs && anyMissing) status = 'mixed';
            else status = 'mixed';
          }
          subjectStatus.push({ subjectName: sub.name, status });
        });

        const recorded = subjectStatus.filter(s => s.status !== 'empty');
        if (!recorded.length) return;
        const absSubjects = recorded.filter(s => s.status === 'all_absent');
        const numSubjects = recorded.filter(s => s.status === 'has_numeric' || s.status === 'mixed');
        const emptyCount = subjectStatus.filter(s => s.status === 'empty').length;

        if (absSubjects.length && numSubjects.length) {
          results.push({ student: st, kind: 'conflict', term: termStr, month: monthNum,
            absentSubjects: absSubjects.map(s => s.subjectName),
            numericSubjects: numSubjects.map(s => s.subjectName), emptyCount });
        } else if (absSubjects.length && !numSubjects.length && emptyCount === 0) {
          results.push({ student: st, kind: 'agreed_absent', term: termStr, month: monthNum,
            absentSubjects: absSubjects.map(s => s.subjectName), numericSubjects: [], emptyCount: 0 });
        } else if (absSubjects.length && !numSubjects.length && emptyCount > 0) {
          results.push({ student: st, kind: 'incomplete', term: termStr, month: monthNum,
            absentSubjects: absSubjects.map(s => s.subjectName), numericSubjects: [], emptyCount });
        }
      });
      return results;
    }
    GSP.classifyStudentAbsenceConsensus = classifyStudentAbsenceConsensus;

    function printAbsenceConflictReport() {
      const db = loadDB();
      const termSel = document.getElementById('termSelect') || document.getElementById('gradesTermSelect');
      const monthSel = document.getElementById('monthSelect') || document.getElementById('gradesMonthSelect');
      const term = termSel ? termSel.value : 'first';
      const month = monthSel ? Number(monthSel.value) || 1 : 1;
      const list = classifyStudentAbsenceConsensus(db, term, month).filter(r => r.kind === 'conflict');
      const stageName = (db.schoolInfo && (db.schoolInfo.stageName || db.schoolInfo.schoolName)) || '';
      const monthLabels = (typeof getMonthLabels === 'function') ? getMonthLabels(term) : [];
      const monthLabel = monthLabels[month - 1] || ('الشهر ' + month);
      const termLabel = term === 'second' ? 'الفصل الثاني' : 'الفصل الأول';
      const info = db.schoolInfo || {};
      if (!list.length) {
        alert('لا يوجد طلاب عليهم خلاف درجات (غ / درجات رقمية) في ' + monthLabel + ' — ' + termLabel + '.');
        return;
      }
      const rows = list.map((r, i) => {
        const st = r.student || {};
        return '<tr>'
          + '<td style="border:1px solid #94a3b8;padding:6px;text-align:center">' + (i + 1) + '</td>'
          + '<td style="border:1px solid #94a3b8;padding:6px;text-align:right">' + escapeHtml(st.name || '') + '</td>'
          + '<td style="border:1px solid #94a3b8;padding:6px;text-align:center">' + escapeHtml(st.seat || '') + '</td>'
          + '<td style="border:1px solid #94a3b8;padding:6px;text-align:center">' + escapeHtml(st.class || '') + '</td>'
          + '<td style="border:1px solid #94a3b8;padding:6px;text-align:right;font-size:11px;color:#b91c1c">' + escapeHtml((r.absentSubjects || []).join('، ')) + '</td>'
          + '<td style="border:1px solid #94a3b8;padding:6px;text-align:right;font-size:11px;color:#1d4ed8">' + escapeHtml((r.numericSubjects || []).join('، ')) + '</td>'
          + '</tr>';
      }).join('');
      let area = document.getElementById('printArea');
      if (!area) {
        area = document.createElement('div');
        area.id = 'printArea';
        area.style.display = 'none';
        document.body.appendChild(area);
      }
      area.innerHTML = '<div class="grade-sheet-page" style="padding:8mm;font-family:Cairo,Tahoma,sans-serif;direction:rtl;color:#0f172a">'
        + '<div style="text-align:center;margin-bottom:10px">'
        + '<div style="font-size:16px;font-weight:800">تقرير خلاف رصد الغياب والدرجات</div>'
        + '<div style="font-size:13px;margin-top:4px;font-weight:700">' + escapeHtml(stageName) + '</div>'
        + '<div style="font-size:12px;color:#475569;margin-top:4px">' + escapeHtml(info.schoolName || '') + ' — ' + escapeHtml(termLabel) + ' — ' + escapeHtml(monthLabel) + '</div>'
        + '<div style="font-size:11px;color:#64748b;margin-top:4px">لرئيس الكنترول ومدير المرحلة — للمتابعة</div></div>'
        + '<p style="font-size:12px;line-height:1.7;margin:8px 0 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 10px">'
        + 'الطلاب أدناه رُصد لهم <strong>غياب (غ)</strong> في بعض المواد و<strong>درجات رقمية</strong> في مواد أخرى خلال نفس الشهر. يُرجى متابعة الحالة مع المعلمين.</p>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#fee2e2">'
        + '<th style="border:1px solid #94a3b8;padding:6px;width:36px">م</th>'
        + '<th style="border:1px solid #94a3b8;padding:6px">اسم الطالب</th>'
        + '<th style="border:1px solid #94a3b8;padding:6px;width:56px">جلوس</th>'
        + '<th style="border:1px solid #94a3b8;padding:6px;width:48px">فصل</th>'
        + '<th style="border:1px solid #94a3b8;padding:6px">مواد رُصدت غ كامل</th>'
        + '<th style="border:1px solid #94a3b8;padding:6px">مواد برصد رقمي / مختلط</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table>'
        + '<div style="margin-top:14px;font-size:11px;color:#64748b">عدد الطلاب: ' + list.length + ' — تاريخ الطباعة: ' + new Date().toLocaleDateString('ar-EG') + '</div></div>';
      area.style.display = 'block';
      try { if (typeof fitPrintPagesToA4 === 'function') fitPrintPagesToA4(area, '.grade-sheet-page'); } catch (e) {}
      window.print();
      setTimeout(function() { area.style.display = 'none'; }, 500);
    }
    GSP.printAbsenceConflictReport = printAbsenceConflictReport;

    function renderAbsenceConflictPanel() {
      const host = document.getElementById('absenceConflictPanel');
      if (!host) return;
      const termSel = document.getElementById('termSelect') || document.getElementById('gradesTermSelect');
      const monthSel = document.getElementById('monthSelect') || document.getElementById('gradesMonthSelect');
      const term = termSel ? termSel.value : 'first';
      const month = monthSel ? Number(monthSel.value) || 1 : 1;
      const all = classifyStudentAbsenceConsensus(loadDB(), term, month);
      const conflicts = all.filter(r => r.kind === 'conflict');
      const agreed = all.filter(r => r.kind === 'agreed_absent');
      if (!conflicts.length && !agreed.length) {
        host.innerHTML = '<div style="padding:10px;color:#64748b;font-size:13px">لا توجد خلافات غياب/درجات لهذا الشهر.</div>';
        return;
      }
      host.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px">'
        + '<div style="font-weight:800;color:#991b1b;font-size:14px">⚠️ خلافات رصد الغياب (' + conflicts.length + ') · متفق غياب (' + agreed.length + ')</div>'
        + '<button type="button" class="btn btn-outline btn-sm" data-action="printAbsenceConflictReport">🖨️ طباعة تقرير الخلافات</button></div>'
        + (conflicts.length
          ? ('<div style="font-size:12px;color:#7f1d1d;margin-bottom:6px">طلاب عليهم خلاف — للمتابعة:</div><ul style="margin:0;padding-right:18px;font-size:12.5px;line-height:1.7">'
            + conflicts.slice(0, 40).map(r => '<li><strong>' + escapeHtml((r.student && r.student.name) || '') + '</strong> — غ: '
              + escapeHtml((r.absentSubjects || []).join('، ')) + ' | درجات: '
              + escapeHtml((r.numericSubjects || []).join('، ')) + '</li>').join('')
            + '</ul>')
          : '');
    }
    GSP.renderAbsenceConflictPanel = renderAbsenceConflictPanel;


    // ============================================================
    //  دعم "غير مكتمل": لا تُحسب/تُعرض نتيجة نهائية لمكوّن أو مادة إلا بعد رصد كل شهور الفصل
    //  الدراسي لهذا الطالب (سواء بدرجة رقمية أو بعلامة "غ")، حتى لا تظهر نتيجة مضلِّلة كأنها
    //  نهائية بينما لا يزال أحد الشهور بلا رصد إطلاقاً (خانة فارغة لم تُدخَل بعد).
    // ============================================================
    // INCOMPLETE_MARK/isIncompleteMark: من core/grade-logic.js (أُزيلت النسخة المكررة هنا).
    const INCOMPLETE_LABEL = 'غير مكتمل';

    // القاعدة الرسمية: متوسط ما رُصد من جلسات الاختبار الشهري / شهور المكوّن دائماً.
    // أُلغي الجمع حسب العظمى (10/15/20/30) حتى يبقى الشهري ضمن سقف أعمال السنة (مثل 30 من 70).
    // قاعدة موحّدة: متوسط ما رُصد دائماً (أُلغي الجمع حسب العظمى 10/15/20/30)
    // المعلم يرصد درجة الشهر كما هي؛ نهاية الفصل = متوسط الجلسات/الشهور المرصودة.
    function getAutoExamAggregationMode(maxScore) {
      return 'average';
    }

    // يبني فهرساً (Map) لمصفوفة الدرجات مرة واحدة فقط لكل db، بدل البحث الخطي (find) المتكرر
    // في db.grades آلاف المرات أثناء التصدير - وهو ما كان يُجمّد الصفحة مع أعداد الطلاب/المواد الكبيرة.
    // يُخزَّن الفهرس مؤقتاً على كائن db نفسه (db._gradesIndex) لأن loadDB() يُعيد بناء db من جديد
    // في كل استدعاء، فلا خطر من بيانات قديمة عالقة بين عمليات تصدير مختلفة.
    function buildGradesIndex(db) {
      const perf = (typeof GSP !== 'undefined' && GSP.performance) || null;
      if (perf && typeof perf.buildGradesIndex === 'function') return perf.buildGradesIndex(db);
      if (db._gradesIndex instanceof Map) return db._gradesIndex;
      const idx = new Map();
      (db.grades || []).forEach(g => {
        const w = (g.week != null && g.week !== '') ? Number(g.week) : 1;
        idx.set(g.studentId + '|' + g.subjectName + '|' + g.term + '|' + g.month + '|' + w + '|' + g.componentIndex, g);
        idx.set(g.studentId + '|' + g.subjectName + '|' + g.term + '|' + g.month + '|' + g.componentIndex, g);
      });
      db._gradesIndex = idx;
      return idx;
    }

    // إعداد "الدرجة الشهرية المصدَّرة" عند تصدير شهر منفرد على حدة: هل تُصدَّر الدرجة المرصودة
    // كما هي ('asis')، أم مقسومة على اثنين ('half')؟ يُحفَظ أيضاً في localStorage.
    const MONTHLY_DIVIDE_MODE_KEY = 'monthlyExamDivideMode';
    // → features/grades-ui.js (حسابات)

    function buildDonutChartSvg(segments) {
      const size = 180, stroke = 26, r = (size - stroke) / 2, cx = size / 2, cy = size / 2;
      const circumference = 2 * Math.PI * r;
      const total = segments.reduce((s, x) => s + x.value, 0);
      let offset = 0;
      const paths = segments.filter(s => s.value > 0).map(seg => {
        const frac = total > 0 ? seg.value / total : 0;
        const dash = frac * circumference;
        const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${stroke}"
          stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
        offset += dash;
        return circle;
      }).join('');
      const centerText = total > 0 ?
        `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="22" font-weight="700" fill="#1e293b">${total}</text>
         <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="11" fill="#64748b">طالب</text>` :
        `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="12" fill="#94a3b8">لا توجد بيانات</text>`;
      return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paths}${centerText}</svg>`;
    }
    function buildBarChartSvg(bars) {
      const w = 460, h = 200, padL = 32, padB = 30, padT = 16, padR = 10;
      const innerW = w - padL - padR, innerH = h - padT - padB;
      const barGap = 14;
      const barW = bars.length ? (innerW - barGap * (bars.length - 1)) / bars.length : 0;
      const gridLines = [0, 25, 50, 75, 100].map(v => {
        const y = padT + innerH - (v / 100) * innerH;
        return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
          <text x="${padL - 6}" y="${y + 4}" font-size="9" fill="#94a3b8" text-anchor="end">${v}</text>`;
      }).join('');
      const barsHtml = bars.map((b, i) => {
        const bh = Math.max(0, (Math.min(100, b.value) / 100) * innerH);
        const x = padL + i * (barW + barGap);
        const y = padT + innerH - bh;
        const color = b.value >= 65 ? '#15803d' : (b.value >= 50 ? '#eab308' : '#b91c1c');
        return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${color}" rx="3"></rect>
          <text x="${x + barW / 2}" y="${padT + innerH + 14}" font-size="10" fill="#475569" text-anchor="middle">${b.label}</text>
          ${b.hasData ? `<text x="${x + barW / 2}" y="${y - 4}" font-size="10" fill="#1e293b" text-anchor="middle" font-weight="600">${Math.round(b.value)}%</text>` : ''}`;
      }).join('');
      return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${gridLines}${barsHtml}</svg>`;
    }

    async function exportCombinedYearExcel(evt) {
      const db = loadDB();
      if (!db.students.length || !db.subjects.length) {
        alert('لا توجد بيانات كافية للتصدير. يرجى رفع ملف ومعالجته أولاً.');
        return;
      }

      const students = [...db.students].sort((a, b) =>
        a.class !== b.class ? a.class.localeCompare(b.class) :
        (a.gender !== b.gender ? (a.gender === 'F' ? -1 : 1) : a.name.localeCompare(b.name)));

      // فحص قبل التصدير: هذا هو التصدير الأشمل (كل الطلاب، كل المواد، الفصلين الدراسيين معاً)،
      // لذا الفحص هنا يغطي كل خانة أكاديمية (باستثناء مكونات الحضور/الغياب) في كل شهور الفصلين.
      {
        const combinedCells = [];
        ['first', 'second'].forEach(t => {
          const tMonths = getMonthLabels(t).map((_, i) => i + 1);
          db.subjects.forEach(subj => {
            const comps = (subj.components || []).map((c, ci) => ({ index: ci, name: c.name, type: c.type }))
              .filter(c => c.type !== 'attendance');
            if (!comps.length) return;
            combinedCells.push(...buildCellsForCheck(students, subj.name, comps, t, tMonths));
          });
        });
        if (!(await confirmProceedDespiteMissingGrades(db, combinedCells, { maxLines: 25 }))) return;
      }

      const groupRow = ['#', 'الرقم القومي', 'رقم الجلوس', 'اسم الطالب', 'الفصل'];
      const subRow = ['', '', '', '', ''];
      const merges = [];
      for (let c = 0; c < 5; c++) merges.push({ s: { r: 0, c }, e: { r: 1, c } });

      let colIndex = 5;
      db.subjects.forEach(subj => {
        const compCount = subj.components.length;
        subj.components.forEach(comp => { subRow.push(`${comp.name} (${compMaxLabel(comp)})`); });
        subRow.push('مجموع الفصل الأول');
        subj.components.forEach(comp => { subRow.push(`${comp.name} (${compMaxLabel(comp)})`); });
        subRow.push('مجموع الفصل الثاني');
        subRow.push('الدرجة النهائية للسنة (متوسط الفصلين)');

        const totalColsForSubject = compCount + 1 + compCount + 1 + 1;
        groupRow.push(subj.name);
        for (let i = 1; i < totalColsForSubject; i++) groupRow.push('');
        merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + totalColsForSubject - 1 } });
        colIndex += totalColsForSubject;
      });

      const aoa = [groupRow, subRow];
      students.forEach((s, idx) => {
        const row = [idx + 1, s.nationalId || '', s.seat, s.name, s.class];
        db.subjects.forEach(subj => {
          subj.components.forEach((comp, ci) => {
            const v = computeFinalComponentScore(db, s.id, subj.name, ci, 'first', comp.name, comp.maxScore);
            row.push(v === null ? '' : (isIncompleteMark(v) ? INCOMPLETE_LABEL : (isAbsentMark(v) ? ABSENT_MARK : Math.round(v * 100) / 100)));
          });
          const t1Total = subjectTermTotal(db, s.id, subj.name, 'first', subj);
          row.push(t1Total === null ? '' : (isIncompleteMark(t1Total) ? INCOMPLETE_LABEL : (isAbsentMark(t1Total) ? ABSENT_MARK : Math.round(t1Total * 100) / 100)));

          subj.components.forEach((comp, ci) => {
            const v = computeFinalComponentScore(db, s.id, subj.name, ci, 'second', comp.name, comp.maxScore);
            row.push(v === null ? '' : (isIncompleteMark(v) ? INCOMPLETE_LABEL : (isAbsentMark(v) ? ABSENT_MARK : Math.round(v * 100) / 100)));
          });
          const t2Total = subjectTermTotal(db, s.id, subj.name, 'second', subj);
          row.push(t2Total === null ? '' : (isIncompleteMark(t2Total) ? INCOMPLETE_LABEL : (isAbsentMark(t2Total) ? ABSENT_MARK : Math.round(t2Total * 100) / 100)));

          // الدرجة النهائية للسنة = متوسط نتيجة الفصلين (فقط عندما يكون كلاهما رقماً فعلياً)؛ إن كان
          // أحد الفصلين "غير مكتمل" فالسنة كلها "غير مكتمل"، وإن كان أحدهما بلا أي رقم (كله "غ") تبقى
          // النتيجة السنوية على الفصل الآخر إن كان رقماً، وإلا "غ".
          const t1Numeric = typeof t1Total === 'number';
          const t2Numeric = typeof t2Total === 'number';
          let finalVal = '';
          if (t1Numeric && t2Numeric) finalVal = Math.round(((t1Total + t2Total) / 2) * 100) / 100;
          else if (t1Numeric) finalVal = Math.round(t1Total * 100) / 100;
          else if (t2Numeric) finalVal = Math.round(t2Total * 100) / 100;
          else if (isIncompleteMark(t1Total) || isIncompleteMark(t2Total)) finalVal = INCOMPLETE_LABEL;
          else if (isAbsentMark(t1Total) || isAbsentMark(t2Total)) finalVal = ABSENT_MARK;
          row.push(finalVal);
        });
        aoa.push(row);
      });

      const base = (db.meta && db.meta.fileName ? db.meta.fileName : 'grades').replace(/\.[^/.]+$/, '');
      const gradeTag = buildGradeSectionFileTag(db);

      const btn = evt && evt.target;
      if (btn) btn.disabled = true;
      showExportProgress('📤 جارٍ تجهيز ملف الإكسيل...');
      try {
        const buffer = await runExportJob('buildFromAoa', { aoa, merges, sheetName: 'الفصلين معاً' });
        downloadArrayBuffer(buffer, base + (gradeTag ? '_' + gradeTag : '') + '_الفصلين_معا_سنوي.xlsx');
      } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء تصدير الملف. حاول مرة أخرى.');
      } finally {
        hideExportProgress();
        if (btn) btn.disabled = false;
      }
    }

    // ملاحظة: تم حذف downloadBackup()/restoreBackup() القديمتين (كانتا تعملان على مرحلة واحدة فقط عبر
    // loadDB/saveDB) لصالح downloadLocalBackup()/restoreLocalBackup() الأحدث في تبويب الأمان، واللتين
    // تعملان على كامل قاعدة البيانات عبر getRootDB/saveRootDB. وجود النظامين معاً كان يسبب التباساً
    // خطيراً: زر قديم بعنوان "نسخة" لا ينسخ فعلياً كل بيانات النظام كما قد يظن المستخدم.

    // يحذف بيانات صف/قسم واحد بعينه فقط (الطلاب، درجاتهم في الفصلين، خريطة فصوله، وملف الإكسيل
    // الأصلي المرفوع له)، دون التأثير على أي صف آخر أو على كتالوج المواد المشترك بين صفوف نفس المرحلة.
    async function deleteGradeData() {
     try {
      if (currentRole !== 'admin') { alert('هذه الميزة متاحة لمدير النظام فقط.'); return; }
      const sel = document.getElementById('exportGradeSelect');
      const gradeKey = sel ? sel.value : '';
      if (!gradeKey) { alert('يرجى اختيار الصف المطلوب حذف بياناته أولاً من القائمة.'); return; }

      const db = loadDB();
      const meta = (db.metaByGrade || {})[gradeKey] || {};
      const grade = meta.grade || '';
      const section = meta.section || '';
      const studentsToDelete = db.students.filter(s => s.grade === grade && s.section === section);
      if (!studentsToDelete.length) { alert('لا توجد بيانات محفوظة لهذا الصف.'); return; }

      const SECTION_LABEL = { arabic: 'عربي', languages: 'لغات' };
      const label = `${grade} (${SECTION_LABEL[section] || section})`;
      if (!(await showConfirm(`⚠️ سيتم حذف بيانات "${label}" نهائياً: ${studentsToDelete.length} طالب وكل درجاتهم في الفصلين، وملف الإكسيل الأصلي المرفوع لهذا الصف. لن يتأثر أي صف آخر ولا المواد المشتركة بينهم. هل أنت متأكد؟`))) return;
      if (!(await showConfirm('تأكيد أخير: هذا الإجراء لا يمكن التراجع عنه. متابعة الحذف؟'))) return;

      const idPrefix = section + '::' + grade + '::';
      db.students = db.students.filter(s => !(s.grade === grade && s.section === section));
      db.grades = (db.grades || []).filter(g => !(typeof g.studentId === 'string' && g.studentId.startsWith(idPrefix)));

      db.classGrade = db.classGrade || {};
      Object.keys(db.classGrade).forEach(k => {
        const parts = splitClassSectionKey(k);
        if (parts.section === section && db.classGrade[k] === grade) delete db.classGrade[k];
      });
      db.classes = [...new Set(Object.keys(db.classGrade))].sort();

      const storagePath = meta.workbookStoragePath;
      delete db.metaByGrade[gradeKey];
      if (db.meta && db.meta.grade === grade && db.meta.section === section) {
        const remainingKeys = Object.keys(db.metaByGrade || {});
        db.meta = remainingKeys.length ? db.metaByGrade[remainingKeys[remainingKeys.length - 1]] : null;
      }

      saveDB(db);
      if (storagePath) { await deleteWorkbooksFromCloud([storagePath]); }

      uploadedWorkbook = null;
      uploadedFileName = '';
      loadStudentsUI();
      loadSubjectsUI();
      if (typeof GSP !== 'undefined' && typeof GSP.renderMonthlyExportButtons === 'function') {
        GSP.renderMonthlyExportButtons();
      }
      document.getElementById('uploadStatus').textContent = `🗑️ تم حذف بيانات "${label}" بنجاح`;
      document.getElementById('uploadStatus').style.color = '#64748b';
     } catch (e) {
       console.error('deleteGradeData failed:', e);
       alert('⚠️ حدث خطأ أثناء حذف بيانات الصف. قد تكون العملية توقفت في منتصفها — يُنصح بمراجعة البيانات فوراً قبل المتابعة.\n' + (e && e.message ? e.message : e));
     }
    }

    async function clearAllData() {
     try {
      if (!currentStageId) return;
      if (!(await showConfirm('⚠️ هل أنت متأكد من مسح جميع بيانات هذه المرحلة (الطلاب، الدرجات، المواد، الملف المرفوع)؟ لن يتأثر المعلمون ولا بيانات المدرسة ولا باقي المراحل الأخرى.'))) return;
      const root = getRootDB();
      const st = root.stages.find(s => s.id === currentStageId);
      if (st) {
        // حذف ملفات Excel المرتبطة بهذه المرحلة من Storage قبل تفريغ البيانات
        const orphanedKeys = Object.keys((st.data && st.data.metaByGrade) || {})
          .map(k => (st.data.metaByGrade[k] || {}).workbookStoragePath)
          .filter(Boolean);
        if (st.data && st.data.meta && st.data.meta.workbookStoragePath) orphanedKeys.push(st.data.meta.workbookStoragePath);
        if (orphanedKeys.length) await deleteWorkbooksFromCloud([...new Set(orphanedKeys)]);
        st.data.students = []; st.data.subjects = []; st.data.grades = []; st.data.classes = [];
        st.data.locks = {}; st.data.meta = null; st.data.metaByGrade = {}; st.data.classGrade = {};
        saveRootDB(root);
      }
      uploadedWorkbook = null;
      uploadedFileName = '';
      document.getElementById('studentsTableBody').innerHTML = '';
      document.getElementById('subjectsContainer').innerHTML = '';
      document.getElementById('gradesTableBody').innerHTML = '';
      document.getElementById('gradeEntryArea').style.display = 'none';
      document.getElementById('fileSummary').innerHTML = '';
      document.getElementById('uploadMessages').innerHTML = '';
      document.getElementById('uploadStatus').textContent = '🗑️ تم مسح جميع البيانات';
      document.getElementById('uploadStatus').style.color = '#64748b';
      document.getElementById('studentsCount').textContent = '';
      document.getElementById('subjectsCount').textContent = '';
      document.getElementById('processBtn').disabled = true;
      document.getElementById('sheetRow').style.display = 'none';
      updateFilters();
      loadStatsUI();
      if (typeof GSP !== 'undefined' && typeof GSP.renderMonthlyExportButtons === 'function') {
        GSP.renderMonthlyExportButtons();
      }
     } catch (e) {
       console.error('clearAllData failed:', e);
       alert('⚠️ حدث خطأ أثناء مسح بيانات المرحلة. قد تكون العملية توقفت في منتصفها — يُنصح بمراجعة البيانات فوراً.\n' + (e && e.message ? e.message : e));
     }
    }
    // → features/students.js (تبويب الطلاب)

    //  SUBJECTS TAB
    // ============================================================
