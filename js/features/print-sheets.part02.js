/* print-sheets.part02.js — generated from print-sheets.js; execution order is significant. */


// طباعة كشف أعمال سنة متتالٍ: م / رقم الجلوس / الاسم / مجموع كل مادة
// صفحة A4 بهوية النظام الموحّدة، بحد أقصى 40 طالباً في الصفحة،
// وتذييل كل صفحة: وكيل المرحلة (يمين) + مدير المرحلة (يسار) مع خطوط توقيع حي.
async function printTermTotalsSheet(term) {
  try {
    if (!canAccessTermTotalsPrint()) {
      alert('طباعة كشف أعمال السنة متاحة لرئيس الكنترول ومسؤول الحاسب ومدير المرحلة فقط.');
      return;
    }
    const db = loadDB();
    if (!db.students.length || !db.subjects.length) {
      alert('لا توجد بيانات كافية للطباعة. يرجى رفع ملف ومعالجته أولاً.');
      return;
    }
    const sel = document.getElementById('termTotalsGradeSelectPc')
      || document.getElementById('termTotalsGradeSelectMon')
      || document.getElementById('termTotalsGradeSelect')
      || document.getElementById('exportGradeSelect');
    const gradeKey = sel ? sel.value : '';
    if (!gradeKey) {
      alert('يرجى اختيار الصف المطلوب من قائمة الصف أولاً.');
      return;
    }
    const meta = (db.metaByGrade || {})[gradeKey] || {};
    const grade = meta.grade || gradeKey || '';
    const section = meta.section || '';
    const info = db.schoolInfo || {};
    const termLabel = term === 'first' ? 'الفصل الدراسي الأول' : 'الفصل الدراسي الثاني';

    const subjects = (db.subjects || []).filter(subj => {
      if ((subj.name || '').trim() === 'نوع') return false;
      return subjectAppliesToGradeSection(subj, grade, section);
    });
    if (!subjects.length) {
      alert('لا توجد مواد مسجّلة لهذا الصف/القسم.');
      return;
    }

    const students = db.students
      .filter(s => !gradeKey || (s.grade === grade && s.section === section))
      .sort((a, b) => (parseInt(a.seat, 10) || 0) - (parseInt(b.seat, 10) || 0) || a.name.localeCompare(b.name, 'ar'));
    if (!students.length) {
      alert('لا يوجد طلاب لهذا الصف.');
      return;
    }

    {
      const controlMonths = getMonthLabels(term).map((_, i) => i + 1);
      const controlCells = [];
      subjects.forEach(subj => {
        const comps = (subj.components || []).map((c, ci) => ({ index: ci, name: c.name, type: c.type }))
          .filter(c => c.type !== 'attendance');
        if (!comps.length) return;
        controlCells.push(...buildCellsForCheck(students, subj.name, comps, term, controlMonths));
      });
      if (!(await confirmProceedDespiteMissingGrades(db, controlCells))) return;
    }

    const hindi = (typeof toHindiDigits === 'function') ? toHindiDigits : (v => String(v));
    const printedBy = (typeof resolvePrintedByName === 'function') ? resolvePrintedByName() : 'المستخدم';
    const printDate = new Date().toLocaleDateString('ar-EG');
    const SECTION_LABEL = { arabic: 'عربي', languages: 'لغات' };
    const sectionLabel = SECTION_LABEL[section] || section || '';
    const stageLabel = (typeof getStageRecord === 'function' && typeof stageDisplayLabel === 'function' && currentStageId)
      ? stageDisplayLabel(getStageRecord(currentStageId)) : '';

    // صفوف مضغوطة موحّدة الارتفاع لتسع 40 طالباً + ترويسة + تذييل في صفحة A4 واحدة
    const ROW_H = '4.55mm';
    const thStyle = 'border:1px solid #94a3b8;padding:0.7mm 0.4mm;background:#3f7a57;color:#fff;font-weight:800;text-align:center;font-size:8px;line-height:1.2;vertical-align:middle;';
    const tdStyle = 'border:1px solid #94a3b8;padding:0 0.4mm;text-align:center;font-size:9px;height:' + ROW_H + ';max-height:' + ROW_H + ';line-height:' + ROW_H + ';vertical-align:middle;overflow:hidden;';
    const tdName = 'border:1px solid #94a3b8;padding:0 1.2mm;text-align:right;font-size:9px;font-weight:600;height:' + ROW_H + ';max-height:' + ROW_H + ';line-height:' + ROW_H + ';vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

    function formatSubjectHeaderHtml(subj) {
      const maxT = (typeof subjectAcademicMaxTotal === 'function')
        ? subjectAcademicMaxTotal(subj)
        : (subj.components || []).filter(c => c.type !== 'attendance').reduce((s, c) => s + (Number(c.maxScore) || 0), 0);
      const raw = String(subj.exportName || subj.name || '').trim();
      const words = raw.split(/\s+/).filter(Boolean);
      let line1 = raw, line2 = '';
      if (words.length >= 2) {
        const mid = Math.ceil(words.length / 2);
        line1 = words.slice(0, mid).join(' ');
        line2 = words.slice(mid).join(' ');
      } else if (raw.length > 8) {
        const mid = Math.ceil(raw.length / 2);
        line1 = raw.slice(0, mid);
        line2 = raw.slice(mid);
      }
      return `<th style="${thStyle}">`
        + `<div style="font-weight:800">${escapeHtml(line1)}</div>`
        + (line2 ? `<div style="font-weight:800">${escapeHtml(line2)}</div>` : '')
        + `<div style="font-weight:600;font-size:7.5px;opacity:.95">(${hindi(maxT)})</div>`
        + `</th>`;
    }
    const subjectHeaders = subjects.map(formatSubjectHeaderHtml).join('');

    const PAGE_SIZE = 40;
    const pages = [];
    for (let start = 0; start < students.length; start += PAGE_SIZE) {
      pages.push(students.slice(start, start + PAGE_SIZE));
    }

    const metaBarHtml = [
      `<span><strong>الصف:</strong> ${escapeHtml(grade)}</span>`,
      sectionLabel ? `<span><strong>القسم:</strong> ${escapeHtml(sectionLabel)}</span>` : '',
      stageLabel ? `<span><strong>المرحلة:</strong> ${escapeHtml(stageLabel)}</span>` : '',
      `<span><strong>الفصل الدراسي:</strong> ${termLabel}</span>`,
      `<span><strong>عدد الطلاب:</strong> ${hindi(students.length)}</span>`
    ].filter(Boolean).join('');

    const letterhead = (typeof buildUnifiedLetterhead === 'function')
      ? buildUnifiedLetterhead({
          title: 'كشف أعمال السنة — مجاميع المواد',
          subtitleRight: termLabel,
          subtitleLeft: '',
          printedBy,
          printDate,
          governorate: info.governorate || '',
          educationAdmin: info.educationAdmin || '',
          schoolName: info.schoolName || '',
          academicYear: info.academicYear || '',
          metaBarHtml
        })
      : `<div style="text-align:center;font-weight:900;font-size:15px;margin-bottom:2mm">كشف أعمال السنة — مجاميع المواد</div>`;

    const footer = `<div class="tt-footer">
      <div class="gs-sign">
        <div class="gs-sign-caption">وكيل المرحلة</div>
        <div class="gs-line"></div>
      </div>
      <div class="gs-sign">
        <div class="gs-sign-caption">مدير المرحلة</div>
        <div class="gs-line"></div>
      </div>
    </div>`;

    function termTotalForPrint(studentId, subj) {
      let total = 0, any = false, hasNumeric = false;
      (subj.components || []).forEach((comp, ci) => {
        if (comp.type === 'attendance') return;
        const v = computeFinalComponentScore(db, studentId, subj.name, ci, term, comp.name, comp.maxScore);
        if (v === null || v === undefined || v === '') return;
        any = true;
        if (typeof isIncompleteMark === 'function' && isIncompleteMark(v)) return;
        if (typeof isAbsentMark === 'function' && isAbsentMark(v)) return;
        const n = Number(v);
        if (!isNaN(n)) { total += n; hasNumeric = true; }
      });
      if (!any) return null;
      if (!hasNumeric) return (typeof ABSENT_MARK !== 'undefined' ? ABSENT_MARK : 'غ');
      return Math.round(total * 100) / 100;
    }

    let pagesHtml = '';
    pages.forEach((chunk, pageIdx) => {
      const rowCells = [];
      for (let i = 0; i < PAGE_SIZE; i++) {
        const s = chunk[i];
        const serial = pageIdx * PAGE_SIZE + i + 1;
        if (!s) {
          rowCells.push(`<tr style="height:${ROW_H}">
            <td style="${tdStyle}">${hindi(serial)}</td>
            <td style="${tdStyle}"></td>
            <td style="${tdName}"></td>
            ${subjects.map(() => `<td style="${tdStyle}"></td>`).join('')}
          </tr>`);
          continue;
        }
        const cells = subjects.map(subj => {
          const total = termTotalForPrint(s.id, subj);
          let cell = '';
          if (total === null) cell = '';
          else if (typeof isAbsentMark === 'function' && isAbsentMark(total)) cell = (typeof ABSENT_MARK !== 'undefined' ? ABSENT_MARK : 'غ');
          else cell = hindi(total);
          return `<td style="${tdStyle}">${cell}</td>`;
        }).join('');
        rowCells.push(`<tr style="height:${ROW_H}">
          <td style="${tdStyle}">${hindi(serial)}</td>
          <td style="${tdStyle}">${escapeHtml(String(s.seat || ''))}</td>
          <td style="${tdName}" title="${escapeHtml(s.name || '')}">${escapeHtml(s.name || '')}</td>
          ${cells}
        </tr>`);
      }

      const pageNo = pages.length > 1
        ? `<div style="text-align:center;font-size:8.5px;color:#64748b;margin:0 0 1mm">صفحة ${hindi(pageIdx + 1)} من ${hindi(pages.length)}</div>`
        : '';

      // فئة مخصّصة فقط — بدون grade-sheet-page/detailed-sheet-page لتجنّب تعارض page-break
      pagesHtml += `<div class="term-totals-print-page">
        <div style="transform-origin:top center">${letterhead}</div>
        ${pageNo}
        <table class="tt-table">
          <colgroup>
            <col style="width:6mm">
            <col style="width:12mm">
            <col style="width:48mm">
            ${subjects.map(() => '<col>').join('')}
          </colgroup>
          <thead>
            <tr>
              <th style="${thStyle}">م</th>
              <th style="${thStyle}">رقم<br>الجلوس</th>
              <th style="${thStyle}">اسم الطالب</th>
              ${subjectHeaders}
            </tr>
          </thead>
          <tbody>${rowCells.join('')}</tbody>
        </table>
        ${footer}
      </div>`;
    });

    const area = document.getElementById('printGradeSheetArea') || document.getElementById('printAttendanceArea');
    if (!area) { alert('تعذر العثور على منطقة الطباعة.'); return; }
    if (typeof clearInactivePrintAreas === 'function') clearInactivePrintAreas(area.id);
    area.innerHTML = pagesHtml;
    try { fitPrintPageFillHeight(area, '.term-totals-print-page'); } catch (e) { console.warn(e); }
    const prevTitle = document.title;
    document.title = 'كشف أعمال السنة — ' + (grade || '') + ' — ' + termLabel;
    window.print();
    setTimeout(() => {
      document.title = prevTitle;
      if (typeof clearAllPrintAreas === 'function') clearAllPrintAreas();
    }, 800);
  } catch (err) {
    console.error('printTermTotalsSheet error:', err);
    alert('حدث خطأ أثناء تجهيز الطباعة:\n' + ((err && err.message) || err));
  }
}





function toHindiDigits(value) {
  const map = { '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤', '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩' };
  return String(value).replace(/[0-9]/g, d => map[d]);
}



// ========== ضبط تلقائي حقيقي لطباعة كشوف الدرجات (قياس ثم تصغير) ==========
// الطريقة القديمة كانت تُقدّر حجم الخط والحشو فقط من عدد الطلاب (rowCount)، وثبت عملياً أن هذا
// التقدير غير كافٍ: عند زيادة عدد مكونات المادة (أعمدة كثيرة) يضيق كل عمود فيلتف اسم المكوّن
// لأكثر من سطر داخل رأس الجدول، فيطول صف الرأس بشكل لا علاقة له بعدد الطلاب إطلاقاً، وقد يفيض
// الكشف لصفحة ثانية شبه فارغة رغم أن rowCount كان ضمن حدود "آمنة" نظرياً. الحل هنا: نحقن الكشف
// فعلياً (خارج حدود الشاشة المرئية بموضع fixed بعيد) بأقصى حجم، نقيس ارتفاعه الفعلي المُصيَّر عبر
// getBoundingClientRect، وإن كان أطول من ارتفاع صفحة A4 القابل للطباعة نُصغّر حجم الخط/الحشو
// تدريجياً (بحد أقصى 6 محاولات) حتى يستقر داخل حدود الصفحة، ثم نطبع. هذا يضبط تلقائياً أي توليفة
// من عدد طلاب/عدد مكونات مهما بلغت، بدل الاعتماد على حدود ثابتة مبنية على حالة واحدة فقط.
function gsSizesForScale(k) {
  const kMin = 0.42;
  const kk = Math.max(kMin, Math.min(1, k));
  const t = (kk - kMin) / (1 - kMin);
  const lerp = (max, min) => min + (max - min) * t;
  const lerpPad = (maxPad, minPad) => {
    const maxParts = maxPad.split(' ').map(v => parseFloat(v));
    const minParts = minPad.split(' ').map(v => parseFloat(v));
    return `${(minParts[0] + (maxParts[0] - minParts[0]) * t).toFixed(2)}mm ${(minParts[1] + (maxParts[1] - minParts[1]) * t).toFixed(2)}mm`;
  };
  return {
    tableFontSize: lerp(11, 5.5),
    cellPad: lerpPad('2mm 1.5mm', '0.35mm 0.5mm'),
    headerScale: lerp(1, 0.5),
    metaFontSize: lerp(12, 7),
    metaPad: lerpPad('3mm 4mm', '0.7mm 1.8mm'),
    lineHeight: lerp(1.2, 0.92),
    metaLineHeight: lerp(1.9, 1.25),
    footerScale: lerp(1, 0.45)
  };
}



function gsStyleTextFor(sizes) {
  return `
    .gs-scope .grade-sheet-table { font-size: ${sizes.tableFontSize}px; line-height: ${sizes.lineHeight}; }
    .gs-scope .grade-sheet-table th, .gs-scope .grade-sheet-table td { padding: ${sizes.cellPad}; }
    .gs-scope .grade-sheet-header { padding-bottom: ${6 * sizes.headerScale}mm; margin-bottom: ${5 * sizes.headerScale}mm; }
    .gs-scope .gs-title { font-size: ${18 * sizes.headerScale}px; }
    .gs-scope .gs-subtitle { font-size: ${13 * sizes.headerScale}px; }
    .gs-scope .gs-top-row { font-size: ${11 * sizes.headerScale}px; }
    .gs-scope .grade-sheet-meta { font-size: ${sizes.metaFontSize}px; padding: ${sizes.metaPad}; margin-bottom: ${4 * sizes.headerScale}mm; line-height: ${sizes.metaLineHeight}; }
    .gs-scope .grade-sheet-footer { margin-top: ${10 * sizes.footerScale}mm; font-size: ${(9 + 3 * sizes.footerScale).toFixed(1)}px; }
    .gs-scope .grade-sheet-footer .gs-sign .gs-line { margin-top: ${16 * sizes.footerScale}mm; }
    .gs-scope .detailed-letterhead { margin-bottom: ${4 * sizes.headerScale}mm; }
    .gs-scope .detailed-letterhead-strip { font-size: ${Math.max(6, 9 * sizes.headerScale)}px; padding: ${1.4 * sizes.headerScale}mm 3.5mm; }
    .gs-scope .detailed-lh-title { font-size: ${15 * sizes.headerScale}px; }
    .gs-scope .detailed-lh-subtitle { font-size: ${10.5 * sizes.headerScale}px; }
    .gs-scope .detailed-lh-side { font-size: ${10 * sizes.headerScale}px; line-height: 1.7; }
    .gs-scope .detailed-lh-meta-bar { font-size: ${10.5 * sizes.headerScale}px; padding: ${2 * sizes.headerScale}mm 4mm; }
    .gs-scope .detailed-lh-logo { width: ${15 * sizes.headerScale}mm; height: ${15 * sizes.headerScale}mm; font-size: ${16 * sizes.headerScale}px; }
    .gs-scope .detailed-letterhead-body { padding: ${3 * sizes.headerScale}mm 4mm ${3.5 * sizes.headerScale}mm; gap: ${3 * sizes.headerScale}mm; }
    .gs-scope .detailed-sheet-footer { margin-top: ${8 * sizes.footerScale}mm; font-size: ${Math.max(7, 10 * sizes.footerScale)}px; }
    .gs-scope .detailed-sheet-footer .gs-line { margin-top: ${12 * sizes.footerScale}mm; }
    .gs-scope .grade-sheet-table td.gs-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0; }
    .gs-scope .grade-sheet-table td.gs-score, .gs-scope .grade-sheet-table td.serial-col {
      white-space: nowrap; overflow: hidden; text-overflow: clip; max-width: 0;
    }
  `;
}



// innerBodyHtml: عنصر <div class="grade-sheet-page gs-scope">...</div> فقط (بدون وسم style)
function autoFitAndPrintGradeSheet(innerBodyHtml) {
  const area = document.getElementById('printGradeSheetArea');
  if (typeof clearInactivePrintAreas === 'function') clearInactivePrintAreas('printGradeSheetArea');
  const MM_TO_PX = 96 / 25.4; // معامل تحويل mm إلى px القياسي في CSS، لمطابقة قياس المتصفح الفعلي
  const maxHeightPx = (297 - 20) * MM_TO_PX * 0.985; // A4 ناقص هامش 10mm أعلى وأسفل + هامش أمان 1.5%
  const printableWidthMm = 210 - 20; // A4 ناقص هامش 10mm يمين ويسار

  // نضع منطقة الطباعة بموضع fixed خارج حدود الشاشة المرئية (بدل display:none) حتى يتسنى قياس
  // ارتفاعها الفعلي المُصيَّر؛ display:none لا يعطي أي أبعاد عند القياس (offsetHeight = 0 دائماً).
  area.style.cssText = `position:fixed; left:-9999px; top:0; display:block; width:${printableWidthMm}mm; margin:0; padding:0;`;

  let k = 1;
  let sizes = gsSizesForScale(k);
  area.innerHTML = `<style id="gsAutoFitStyle">${gsStyleTextFor(sizes)}</style>${innerBodyHtml}`;
  const styleTag = document.getElementById('gsAutoFitStyle');
  const page = area.querySelector('.grade-sheet-page');

  if (page) {
    for (let i = 0; i < 6; i++) {
      const h = page.getBoundingClientRect().height;
      if (h <= maxHeightPx || k <= 0.34) break;
      const ratio = maxHeightPx / h;
      k = Math.max(0.34, k * ratio * 0.97);
      sizes = gsSizesForScale(k);
      styleTag.textContent = gsStyleTextFor(sizes);
    }
  }

  area.removeAttribute('style');
  setTimeout(() => {
    window.print();
    setTimeout(() => { if (typeof clearAllPrintAreas === 'function') clearAllPrintAreas(); }, 800);
  }, 50);
}




// ترويسة موحّدة للهوية البصرية (كشف شهري + تفصيلي + متوسط)
function buildUnifiedLetterhead(opts) {
  const {
    title, subtitleRight, subtitleLeft, printedBy, printDate,
    governorate, educationAdmin, schoolName, academicYear,
    metaBarHtml
  } = opts;
  return `
      <div class="detailed-letterhead">
        <div class="detailed-letterhead-strip">
          <span>تاريخ الطباعة: ${toHindiDigits(printDate)}</span>
          <span>طُبع بواسطة: ${escapeHtml(printedBy || '')}</span>
        </div>
        <div class="detailed-letterhead-body">
          <div class="detailed-lh-side detailed-lh-right">
            ${governorate ? `<div><strong>المحافظة:</strong> ${escapeHtml(governorate)}</div>` : ''}
            ${educationAdmin ? `<div>${escapeHtml(educationAdmin)}</div>` : ''}
          </div>
          <div class="detailed-lh-center">
            <div class="detailed-lh-title">${escapeHtml(title)}</div>
            <div class="detailed-lh-subtitle">${escapeHtml(schoolName || '')}</div>
          </div>
          <div class="detailed-lh-logo">🏫</div>
          <div class="detailed-lh-side detailed-lh-left">
            ${academicYear ? `<div><strong>العام الدراسي:</strong> <bdi dir="ltr">${toHindiDigits(academicYear)}</bdi>${subtitleRight ? ' — ' + escapeHtml(subtitleRight) : ''}</div>` : (subtitleRight ? `<div>${escapeHtml(subtitleRight)}</div>` : '')}
            ${subtitleLeft ? `<div>${escapeHtml(subtitleLeft)}</div>` : ''}
          </div>
        </div>
        <div class="detailed-lh-divider"></div>
        <div class="detailed-lh-meta-bar">${metaBarHtml || ''}</div>
      </div>`;
}



function buildUnifiedFooter(opts) {
  // opts اختياري: { captions: ['...', '...', '...'] } لتخصيص تسميات التوقيع حسب نوع المستند
  const caps = (opts && Array.isArray(opts.captions) && opts.captions.length)
    ? opts.captions
    : ['توقيع مدرس الفصل', 'توقيع وكيل المرحلة', 'توقيع مدير المرحلة'];
  const signs = caps.map(c =>
    `<div class="gs-sign"><div class="gs-sign-caption">${escapeHtml(c)}</div><div class="gs-line"></div></div>`
  ).join('');
  return `<div class="detailed-sheet-footer">${signs}</div>`;
}



// إتاحة الترويسة والفوتر الموحّدين لباقي دوال الطباعة
GSP.buildUnifiedLetterhead = buildUnifiedLetterhead;


GSP.buildUnifiedFooter = buildUnifiedFooter;


// toHindiDigits و escapeHtml يأتيان من core/utils.js — لا نعيد تعريفهما هنا

/** اسم من قام بالطباعة حسب نوع الحساب الحالي */
function resolvePrintedByName() {
  try {
    if (typeof currentAccountType !== 'undefined') {
      if (currentAccountType === 'superadmin') return 'رئيس الكنترول';
      if (currentAccountType === 'monitor') return (currentStageMonitor && currentStageMonitor.name) || 'مدير المرحلة';
      if (currentAccountType === 'stageadmin') return (currentStageAdmin && currentStageAdmin.name) || 'مسؤول الحاسب';
      if (currentAccountType === 'teacher') return (currentTeacher && currentTeacher.name) || 'المعلم';
    }
    if (typeof currentRole !== 'undefined' && currentRole === 'admin') return 'مدير النظام';
    if (typeof currentTeacher !== 'undefined' && currentTeacher) return currentTeacher.name || 'المعلم';
  } catch (e) {}
  return 'المستخدم';
}


GSP.resolvePrintedByName = resolvePrintedByName;
