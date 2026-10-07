/* print-sheets.part03.js — generated from print-sheets.js; execution order is significant. */


/** تصغير الصفحة المطبوعة لتسع في A4 واحدة إن لزم، مع منع الصفحات الفارغة/المقطوعة */
/**
 * يوزّع ارتفاع صفوف الطلاب على كامل ارتفاع صفحة A4 المتاحة
 * بحيث تملأ الصفحة: ترويسة + جدول (كل الطلاب) + تذييل التوقيعات بدون فراغ كبير أسفل الجدول.
 * إن زاد المحتوى عن الصفحة يُستخدم تصغير خفيف (zoom) كخط دفاع أخير.
 */
function fitPrintPageFillHeight(area, pageSelector) {
  if (!area) return;
  const MM_TO_PX = 96 / 25.4;
  // ارتفاع محتوى A4 داخل الهوامش الافتراضية تقريباً
  const PAGE_H = 277 * MM_TO_PX;
  const prev = area.getAttribute('style') || '';
  area.style.cssText = 'position:fixed;left:-9999px;top:0;display:block;width:190mm;margin:0;padding:0;background:#fff;';

  area.querySelectorAll(pageSelector).forEach(page => {
    page.style.zoom = '';
    page.style.height = '';
    page.style.maxHeight = '';
    page.style.overflow = 'hidden';
    page.style.boxSizing = 'border-box';
    page.style.display = 'flex';
    page.style.flexDirection = 'column';

    const table = page.querySelector('table.att-print-table, table.grade-sheet-table, table.tt-table, table.detailed-weekly-table');
    if (!table) return;

    // العناصر خارج الجدول (ترويسة + رقم صفحة + تذييل + ملاحظة)
    const kids = Array.from(page.children);
    let chromeH = 0;
    kids.forEach(ch => {
      if (ch === table) return;
      chromeH += ch.getBoundingClientRect().height;
    });
    // مسافة داخلية تقريبية
    const pad = 8;
    let avail = PAGE_H - chromeH - pad;
    if (avail < 80) avail = 80;

    table.style.width = '100%';
    table.style.flex = '1 1 auto';
    table.style.height = avail + 'px';
    table.style.tableLayout = 'fixed';

    const thead = table.tHead;
    const tbody = table.tBodies && table.tBodies[0];
    if (!tbody || !tbody.rows.length) return;

    let headH = thead ? thead.getBoundingClientRect().height : 0;
    // إن كان thead لم يُحسب جيداً قبل العرض
    if (headH < 4 && thead) {
      headH = thead.rows.length * 18;
    }
    const bodyAvail = Math.max(40, avail - headH);
    const n = tbody.rows.length;
    const rowH = Math.max(12, bodyAvail / n);

    Array.from(tbody.rows).forEach(tr => {
      tr.style.height = rowH + 'px';
      tr.style.maxHeight = rowH + 'px';
      Array.from(tr.cells).forEach(td => {
        td.style.height = rowH + 'px';
        td.style.maxHeight = rowH + 'px';
        td.style.paddingTop = '0';
        td.style.paddingBottom = '0';
        td.style.verticalAlign = 'middle';
        td.style.overflow = 'hidden';
        td.style.lineHeight = '1.15';
        td.style.fontSize = Math.max(8, Math.min(11, rowH * 0.55)) + 'px';
      });
    });

    // إن ظلّت الصفحة أطول من A4: تصغير خفيف
    page.style.height = PAGE_H + 'px';
    let h = page.getBoundingClientRect().height;
    // بعد flex قد يختلف القياس — أعد القياس بدون height ثابت أولاً
    page.style.height = '';
    h = page.getBoundingClientRect().height;
    if (h > PAGE_H && h > 0) {
      const scale = Math.max(0.72, (PAGE_H / h) * 0.98);
      page.style.zoom = String(scale);
    }
  });

  area.setAttribute('style', prev);
  area.style.cssText = prev || '';
}


GSP.fitPrintPageFillHeight = fitPrintPageFillHeight;



function fitPrintPagesToA4(area, pageSelector) {
  if (!area) return;
  const MM_TO_PX = 96 / 25.4;
  const maxH = (297 - 18) * MM_TO_PX;
  const prev = area.getAttribute('style') || '';
  area.style.cssText = 'position:fixed;left:-9999px;top:0;display:block;width:190mm;margin:0;padding:0;';
  area.querySelectorAll(pageSelector).forEach(page => {
    page.style.zoom = '';
    page.style.marginBottom = '0';
    page.style.pageBreakAfter = 'avoid';
    page.style.pageBreakInside = 'avoid';
    page.style.breakInside = 'avoid';
    page.querySelectorAll('table th, table td').forEach(cell => {
      if (!cell.dataset._fitPad) {
        cell.dataset._fitPad = '1';
        const cs = GSP.getComputedStyle(cell);
        const pv = parseFloat(cs.paddingTop) || 0;
        const ph = parseFloat(cs.paddingLeft) || 0;
        if (pv > 2) cell.style.paddingTop = cell.style.paddingBottom = Math.max(1, pv * 0.7) + 'px';
        if (ph > 2) cell.style.paddingLeft = cell.style.paddingRight = Math.max(1, ph * 0.75) + 'px';
      }
    });
    let h = page.getBoundingClientRect().height;
    if (h > maxH && h > 0) {
      const scale = Math.max(0.38, (maxH / h) * 0.96);
      page.style.zoom = String(scale);
      h = page.getBoundingClientRect().height;
      if (h > maxH) {
        page.style.zoom = String(Math.max(0.32, (maxH / h) * 0.95 * (parseFloat(page.style.zoom) || 1)));
      }
    }
  });
  area.setAttribute('style', prev);
  area.style.cssText = prev || '';
}


GSP.fitPrintPagesToA4 = fitPrintPagesToA4;



async function printGradeSheet() {
  const db = loadDB();
  const subjectName = document.getElementById('gradeSubjectSelect').value;
  const cls = document.getElementById('gradeClassSelect').value;
  const term = document.getElementById('gradeTermSelect').value;
  const month = parseInt(document.getElementById('gradeMonthSelect').value, 10);

  if (!subjectName || !cls) { alert('يرجى اختيار المادة والفصل أولاً من قائمة الفلاتر.'); return; }
  const subject = db.subjects.find(s => s.name === subjectName);
  if (!subject) { alert('المادة غير موجودة.'); return; }
  if (!canAccessGrade(subjectName, cls)) { alert('غير مصرح لك بطباعة كشف درجات هذه المادة/الفصل.'); return; }

  let students = db.students.filter(s => classSectionKey(s.class, s.section) === cls);
  students = filterStudentsForTeacherLanguage(students, subjectName, cls);
  if (students.length === 0) { alert('لا يوجد طلاب في هذا الفصل.'); return; }
  students.sort((a, b) => a.gender !== b.gender ? (a.gender === 'F' ? -1 : 1) : a.name.localeCompare(b.name));

  // فحص قبل الطباعة: هل توجد خانات درجات لم تُرصد بعد لهذا الشهر/المادة/الفصل؟
  const printGradeCells = buildCellsForCheck(students, subjectName,
    subject.components.map((c, ci) => ({ index: ci, name: c.name })), term, [month]);
  if (!(await confirmProceedDespiteMissingGrades(db, printGradeCells))) return;

  const { cls: clsPlain, section: clsSection } = splitClassSectionKey(cls);
  const info = db.schoolInfo || {};
  const monthLabels = getMonthLabels(term);
  const monthLabel = monthLabels[month - 1] || `الشهر ${month}`;
  const termLabel = term === 'first' ? 'الفصل الدراسي الأول' : 'الفصل الدراسي الثاني';
  // اسم/أسماء المعلمين المسؤولين عن هذه المادة/الفصل (قد يكون أكثر من معلم واحد لمادة اللغة الثانية،
  // كل منهم مخصص للغة مختلفة)، يظهر دائماً بغض النظر عمن يقوم بالطباعة فعلياً
  const assignedTeachers = (db.teachers || []).filter(t => (t.assignments || []).some(a => a.subjectName ===
    subjectName && (a.classes || []).includes(cls)));
  const teacherName = assignedTeachers.length ?
    assignedTeachers.map(t => { const lt = teacherLanguageTypeForSubject(t, subjectName, cls);
      return lt ? `${escapeHtml(t.name)} (${escapeHtml(lt)})` : escapeHtml(t.name); }).join('، ') :
    (currentRole === 'teacher' && currentTeacher ? escapeHtml(currentTeacher.name) : '');
  // اسم/صفة من قام بالطباعة فعلياً الآن (مدير النظام أو المعلم الذي سجّل دخوله)
  const printedBy = currentRole === 'admin' ? 'مدير النظام' : escapeHtml((currentTeacher && currentTeacher.name) || 'المعلم');
  const principalName = info.principalName || '';
  const now = new Date();
  const printDate = now.toLocaleDateString('ar-EG');
  const printTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const metaParts = [];
  if (info.schoolName) metaParts.push(`<span><strong>المدرسة:</strong> ${escapeHtml(info.schoolName)}</span>`);
  if (info.governorate) metaParts.push(`<span><strong>المحافظة:</strong> ${escapeHtml(info.governorate)}</span>`);
  if (info.educationAdmin) metaParts.push(`<span><strong>الإدارة التعليمية:</strong> ${escapeHtml(info.educationAdmin)}</span>`);
  if (info.academicYear) metaParts.push(`<span><strong>العام الدراسي:</strong> ${toHindiDigits(info.academicYear)}</span>`);
  metaParts.push(`<span><strong>الفصل الدراسي:</strong> ${termLabel}</span>`);
  metaParts.push(`<span><strong>الشهر:</strong> ${monthLabel}</span>`);
  const classGradeLabelForPrint = (db.classGrade && db.classGrade[cls]) || info.grade || '';
  const entityLbl = getActiveStageEntityLabel() || stageEntityLabelFromParts(info.stageType, clsSection || info.classLanguage);
  if (entityLbl) metaParts.push(`<span><strong>المرحلة:</strong> ${escapeHtml(entityLbl)}</span>`);
  if (classGradeLabelForPrint) metaParts.push(`<span><strong>الصف:</strong> ${escapeHtml(classGradeLabelForPrint)}</span>`);
  metaParts.push(`<span><strong>الفصل/الشعبة:</strong> ${toHindiDigits(clsPlain)}</span>`);
  metaParts.push(`<span><strong>المادة:</strong> ${escapeHtml(subjectName)}</span>`);
  if (teacherName) metaParts.push(`<span><strong>المعلم:</strong> ${teacherName}</span>`);

  // أعمدة الجدول: تم الاستغناء عن الرقم القومي ورقم الجلوس بناءً على طلب المستخدم، وتم توسيع
  // عمود اسم الطالب (36% بدل 26%) ليتسع لمعظم الأسماء الرباعية/الخماسية الطويلة بسطر واحد بدل
  // الالتفاف لسطرين (وهو ما كان يُطيل الصف ويهدد ثبات الكشف في صفحة واحدة)، مع تقليص عمودي
  // "م" و"المجموع" قليلاً لتعويض المساحة، ويتم توزيع عرض أعمدة المكونات بالتساوي فيما تبقى
  // عبر colgroup + table-layout:fixed.
  const numColPct = 5;
  const sumColPct = 8;
  const nameColPct = 36;
  const compCount = subject.components.length;
  const compColPct = compCount > 0 ? ((100 - numColPct - sumColPct - nameColPct) / compCount) : 0;

  let colgroupHtml = `<col style="width:${numColPct}%">` + `<col style="width:${nameColPct}%">`;
  subject.components.forEach(() => { colgroupHtml += `<col style="width:${compColPct}%">`; });
  colgroupHtml += `<col style="width:${sumColPct}%">`;

  // رأس الجدول من صف واحد فقط (بدون rowspan/colspan): كل عمود مكوّن يعرض اسمه والدرجة العظمى
  // له في سطرين داخل نفس الخلية. تم التخلي عمداً عن الرأس السابق ذي المستويين (عنوان "مكونات
  // المادة" الممتد فوق الأعمدة عبر rowspan/colspan) لأنه كان السبب في خلل طباعة خطير: عند تكرار
  // المتصفح لرأس الجدول تلقائياً، كان يُخرج رأساً أول فارغاً تماماً من النصوص ثم رأساً ثانياً
  // مكرراً في منتصف الجدول، وتختفي بصرياً عدة صفوف بيانات (طلاب) رغم بقائها في نص ملف PDF.
  // صف رأس واحد بسيط يزيل هذا الخلل نهائياً بأي متصفح. جميع الأرقام (الدرجة العظمى هنا، ومسلسل
  // الطالب ودرجاته لاحقاً) تُعرض بالأرقام الهندية (٠١٢٣٤٥٦٧٨٩) في الكشف المطبوع فقط عبر toHindiDigits.
  let theadHtml = `<tr>
    <th class="serial-col">م</th>
    <th>اسم الطالب</th>`;
  subject.components.forEach(c => { theadHtml += `<th><span class="gs-comp-name">${escapeHtml(c.name)}</span><span class="gs-comp-max">(من ${c.maxScore === null || c.maxScore === undefined ? 'بدون حد' : toHindiDigits(c.maxScore)})</span></th>`; });
  theadHtml += `<th class="grand-total-col">المجموع</th></tr>`;

  let bodyHtml = '';
  students.forEach((s, idx) => {
    let sum = 0, hasAny = false, hasNumeric = false;
    let cellsHtml = '';
    subject.components.forEach((comp, ci) => {
      const existing = db.grades.find(g => g.studentId === s.id && g.subjectName === subjectName && g
        .term === term && g.month === month && g.componentIndex === ci);
      const val = existing ? existing.score : '';
      // مكوّن الحضور/الغياب يُعرض في عموده لكنه لا يُضاف لعمود "المجموع" الأكاديمي. وإذا كان الطالب
      // غائباً ("غ") في مكوّن ما تُستبعد "غ" من المجموع (لا تُحتسب صفراً) وتبقى ظاهرة في خانتها.
      if (existing && comp.type !== 'attendance') {
        hasAny = true;
        if (!isAbsentMark(existing.score)) { sum += existing.score; hasNumeric = true; }
      }
      cellsHtml += `<td class="gs-score">${val === '' ? '' : toHindiDigits(val)}</td>`;
    });
    const totalDisplay = !hasAny ? '' : (hasNumeric ? toHindiDigits(sum) : ABSENT_MARK);
    bodyHtml += `<tr>
      <td class="serial-col">${toHindiDigits(idx + 1)}</td>
      <td class="gs-name">${escapeHtml(s.name)}</td>
      ${cellsHtml}
      <td class="gs-score grand-total-col"><strong>${totalDisplay}</strong></td>
    </tr>`;
  });

  const metaBarHtml = [
    `<span>${formatClassSectionForPrint(classGradeLabelForPrint, clsSection, clsPlain)}</span>`,
    `<span><strong>المادة:</strong> ${escapeHtml(subjectName)}${teacherName ? ' — <strong>المعلم:</strong> ' + teacherName : ''}</span>`,
    `<span><strong>الشهر:</strong> ${monthLabel}</span>`
  ].join('');

  const pageHtml = `
    <div class="grade-sheet-page gs-scope">
      ${buildUnifiedLetterhead({
        title: 'كشف رصد درجات — ' + subjectName,
        subtitleRight: 'درجات (' + monthLabel + ')',
        subtitleLeft: termLabel,
        printedBy,
        printDate,
        governorate: info.governorate || '',
        educationAdmin: info.educationAdmin || '',
        schoolName: info.schoolName || '',
        academicYear: info.academicYear || '',
        metaBarHtml
      })}
      <table class="grade-sheet-table">
        <colgroup>${colgroupHtml}</colgroup>
        <thead>${theadHtml}</thead>
        <tbody>${bodyHtml}</tbody>
      </table>
      ${buildUnifiedFooter()}
    </div>`;

  autoFitAndPrintGradeSheet(pageHtml);
}



// ========== كشف رصد درجات تفصيلي (توزيع الدرجة على 4 أسابيع) ==========
// الدرجة التي رصدها المعلم تُفرَد على الأسابيع الأربعة بنفس القيمة حتى يكون متوسطها = الدرجة الأصلية.
// إن كانت "غ" تظهر "غ" في كل الأسابيع. المكوّنات الأسبوعية تُكرَّر؛ المواظبة والتقييم الشهري تظهر مرة واحدة.
function getWeek1DateISO(term, monthIndex0) {
  const db = loadDB();
  const w1 = (db.schoolInfo && db.schoolInfo.week1Dates) || {};
  const arr = w1[term] || [];
  return arr[monthIndex0] || '';
}



function formatWeekDateAr(isoDate) {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return toHindiDigits(isoDate);
    // YYYY/M/D بأرقام هندية
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return toHindiDigits(`${y}/${m}/${day}`);
  } catch (e) { return toHindiDigits(isoDate); }
}



function shiftISODateDays(isoDate, days) {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (e) { return ''; }
}



function getFourWeekDates(term, monthIndex0) {
  // دائماً 4 أسابيع للعرض؛ التظليل للكشف عن خارج نطاق الرصد
  const w1 = getWeek1DateISO(term, monthIndex0);
  if (!w1) return ['', '', '', ''];
  return [0, 1, 2, 3].map(i => shiftISODateDays(w1, i * 7));
}



function getPeriodWeekCount(term, monthIndex0) {
  try {
    const p = getRecordingPeriod(term, monthIndex0);
    const ex = normalizeExcludedWeeks(p);
    return Math.max(0, 4 - ex.length);
  } catch (e) {}
  return 4;
}



function periodHasMonthlyExam(term, monthIndex0) {
  try {
    const p = getRecordingPeriod(term, monthIndex0);
    if (p) return !!p.hasExam;
  } catch (e) {}
  return true;
}



// ضبط تلقائي ليتسع كشف الدرجات التفصيلي في صفحة A4 واحدة فقط مهما كان عدد الطلاب.
function dsSizesForScale(k) {
  const kMin = 0.38;
  const kk = Math.max(kMin, Math.min(1, k));
  const t = (kk - kMin) / (1 - kMin);
  const lerp = (max, min) => min + (max - min) * t;
  return {
    tableFontSize: lerp(8.8, 4.5),
    cellPadV: lerp(0.7, 0.12),
    cellPadH: lerp(0.2, 0.08),
    nameFontSize: lerp(8.4, 4.6),
    scoreFontSize: lerp(8.2, 4.4),
    serialFontSize: lerp(8, 4.5),
    compHeaderH: lerp(26, 12),
    vertFontSize: lerp(8.6, 5.2),
    weekFontSize: lerp(9.5, 5.5),
    dateFontSize: lerp(7.6, 4.8),
    maxFontSize: lerp(9, 5),
    letterheadScale: lerp(1, 0.55),
    footerScale: lerp(1, 0.4),
    footerMargin: lerp(8, 3),
    signLine: lerp(12, 5)
  };
}



function dsStyleTextFor(sizes) {
  return `
    .ds-scope .detailed-weekly-table { font-size: ${sizes.tableFontSize}px; }
    .ds-scope .detailed-weekly-table th,
    .ds-scope .detailed-weekly-table td {
      padding: ${sizes.cellPadV}mm ${sizes.cellPadH}mm;
    }
    .ds-scope .detailed-weekly-table td.gs-name {
      font-size: ${sizes.nameFontSize}px;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      max-width: 0;
    }
    .ds-scope .detailed-weekly-table td.gs-score {
      font-size: ${sizes.scoreFontSize}px;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: clip !important;
      max-width: 0;
    }
    .ds-scope .detailed-weekly-table td.serial-col,
    .ds-scope .detailed-weekly-table th.serial-col {
      font-size: ${sizes.serialFontSize}px;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: clip !important;
      max-width: 0;
    }
    .ds-scope .detailed-weekly-table thead tr.comp-row th { height: ${sizes.compHeaderH}mm; }
    .ds-scope .detailed-weekly-table thead .c-vert { font-size: ${sizes.vertFontSize}px; }
    .ds-scope .detailed-weekly-table thead tr.week-row th .w-name { font-size: ${sizes.weekFontSize}px; }
    .ds-scope .detailed-weekly-table thead tr.week-row th .w-date { font-size: ${sizes.dateFontSize}px; }
    .ds-scope .detailed-weekly-table thead tr.max-row th { font-size: ${sizes.maxFontSize}px; }
    .ds-scope .detailed-letterhead-strip { font-size: ${Math.max(6, 9 * sizes.letterheadScale)}px; padding: ${1.4 * sizes.letterheadScale}mm 3.5mm; }
    .ds-scope .detailed-lh-title { font-size: ${15 * sizes.letterheadScale}px; }
    .ds-scope .detailed-lh-subtitle { font-size: ${10.5 * sizes.letterheadScale}px; }
    .ds-scope .detailed-lh-side { font-size: ${10 * sizes.letterheadScale}px; line-height: 1.7; }
    .ds-scope .detailed-lh-meta-bar { font-size: ${10.5 * sizes.letterheadScale}px; padding: ${2 * sizes.letterheadScale}mm 4mm; }
    .ds-scope .detailed-lh-logo { width: ${15 * sizes.letterheadScale}mm; height: ${15 * sizes.letterheadScale}mm; font-size: ${16 * sizes.letterheadScale}px; }
    .ds-scope .detailed-letterhead-body { padding: ${3 * sizes.letterheadScale}mm 4mm ${3.5 * sizes.letterheadScale}mm; gap: ${3 * sizes.letterheadScale}mm; }
    .ds-scope .detailed-letterhead { margin-bottom: ${4 * sizes.letterheadScale}mm; }
    .ds-scope .detailed-sheet-footer { margin-top: ${sizes.footerMargin}mm; font-size: ${Math.max(7, 10 * sizes.footerScale)}px; }
    .ds-scope .detailed-sheet-footer .gs-line { margin-top: ${sizes.signLine}mm; }
    .ds-scope .detailed-sheet-footer .gs-sign { min-width: ${42 * sizes.footerScale}mm; }
  `;
}



function printDetailedAndFitOnePage(innerBodyHtml) {
  const area = document.getElementById('printGradeSheetArea');
  if (typeof clearInactivePrintAreas === 'function') clearInactivePrintAreas('printGradeSheetArea');
  const MM_TO_PX = 96 / 25.4;
  // هامش صفحة الطباعة 8mm كما في النموذج + هامش أمان
  const maxHeightPx = (297 - 16) * MM_TO_PX * 0.98;
  const printableWidthMm = 210 - 16;

  area.style.cssText = `position:fixed; left:-9999px; top:0; display:block; width:${printableWidthMm}mm; margin:0; padding:0;`;

  let k = 1;
  let sizes = dsSizesForScale(k);
  area.innerHTML = `<style id="dsAutoFitStyle">${dsStyleTextFor(sizes)}</style>${innerBodyHtml}`;
  const styleTag = document.getElementById('dsAutoFitStyle');
  const page = area.querySelector('.detailed-sheet-page');

  if (page) {
    for (let i = 0; i < 8; i++) {
      const h = page.getBoundingClientRect().height;
      if (h <= maxHeightPx || k <= 0.32) break;
      const ratio = maxHeightPx / h;
      k = Math.max(0.32, k * ratio * 0.96);
      sizes = dsSizesForScale(k);
      styleTag.textContent = dsStyleTextFor(sizes);
    }
  }

  area.removeAttribute('style');
  setTimeout(() => { window.print(); }, 50);
}



function gradingModeKey(term, month) { return String(term || 'first') + '|' + String(month || 1); }


function ensureStageSettings(db) {
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  if (!db.settings.gradingFormModeByMonth || typeof db.settings.gradingFormModeByMonth !== 'object')
    db.settings.gradingFormModeByMonth = {};
  return db.settings;
}


function getGradingFormMode(db, term, month) {
  const v = ensureStageSettings(db).gradingFormModeByMonth[gradingModeKey(term, month)];
  return (v === 'weekly_form') ? 'weekly_form' : 'monthly';
}
