/* import-export.part04.js — generated from import-export.js; execution order is significant. */


function getExportWorker() {
  if (_exportWorker) return _exportWorker;
  const workerSrc = `
    importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    onmessage = function(e) {
      const { id, type, payload } = e.data;
      try {
        let buffer;
        if (type === 'buildOriginal') {
          const wb = XLSX.read(payload.workbookBase64, { type: 'base64' });
          const ws = wb.Sheets[payload.sheetName];
          (payload.writes || []).forEach(function(w) {
            const addr = XLSX.utils.encode_cell({ r: w[0], c: w[1] });
            if (!ws[addr]) ws[addr] = { t: 'n', v: w[2] };
            else { ws[addr].v = w[2]; ws[addr].t = 'n'; delete ws[addr].f; }
          });
          buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        } else if (type === 'buildFromAoa') {
          const ws = XLSX.utils.aoa_to_sheet(payload.aoa);
          if (payload.merges) ws['!merges'] = payload.merges;
          if (payload.cols) ws['!cols'] = payload.cols;
          const wb = XLSX.utils.book_new();
          if (payload.rtl) wb.Workbook = { Views: [{ RTL: true }] };
          XLSX.utils.book_append_sheet(wb, ws, payload.sheetName || 'Sheet1');
          buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        } else {
          throw new Error('نوع عملية غير معروف: ' + type);
        }
        postMessage({ id, ok: true, buffer: buffer }, [buffer]);
      } catch (err) {
        postMessage({ id, ok: false, error: (err && err.message) || String(err) });
      }
    };
  `;
  const blob = new Blob([workerSrc], { type: 'application/javascript' });
  _exportWorker = new Worker(URL.createObjectURL(blob));
  _exportWorker.onmessage = (e) => {
    const { id, ok, buffer, error } = e.data;
    const pending = _exportWorkerPending.get(id);
    if (!pending) return;
    _exportWorkerPending.delete(id);
    if (ok) pending.resolve(buffer); else pending.reject(new Error(error));
  };
  _exportWorker.onerror = (e) => {
    // خطأ عام في الـ Worker نفسه (نادر) - نرفض كل الطلبات المعلَّقة حتى لا تظل الواجهة منتظرة للأبد
    _exportWorkerPending.forEach(p => p.reject(new Error(e.message || 'خطأ غير متوقع أثناء التصدير')));
    _exportWorkerPending.clear();
  };
  return _exportWorker;
}



// يشغّل عملية بناء/كتابة ملف إكسيل داخل الـ Worker ويرجع Promise يُحل إلى ArrayBuffer لبيانات
// ملف xlsx الجاهز للتنزيل، دون حجز الخيط الرئيسي أثناء التنفيذ.
function runExportJob(type, payload) {
  return new Promise((resolve, reject) => {
    try {
      const worker = getExportWorker();
      const id = ++_exportWorkerReqId;
      _exportWorkerPending.set(id, { resolve, reject });
      worker.postMessage({ id, type, payload });
    } catch (err) { reject(err); }
  });
}



// ============================================================
//  EXPORT / BACKUP / CLEAR
// ============================================================
function downloadWorkbook(wb, filename) {
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadArrayBuffer(wbout, filename);
}



// ينزّل بيانات ملف xlsx جاهزة (ArrayBuffer) قادمة من الـ Worker مباشرة، بدون أي معالجة إضافية
// على الخيط الرئيسي.
function downloadArrayBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}



// ------------------------------------------------------------
// شريط تقدّم بسيط وعائم أثناء التصدير، حتى يعرف المستخدم أن النظام يعمل فعلاً (وليس متجمداً)
// خصوصاً عند تصدير عدة ملفات دفعة واحدة.
// ------------------------------------------------------------
let _exportProgressEl = null;


function showExportProgress(text) {
  if (!_exportProgressEl) {
    _exportProgressEl = document.createElement('div');
    _exportProgressEl.style.cssText =
      'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); z-index:9999; ' +
      'background:#0f172a; color:#fff; padding:12px 22px; border-radius:10px; font-size:14px; ' +
      'box-shadow:0 6px 20px rgba(0,0,0,.25); display:flex; align-items:center; gap:10px;';
    const spinner = document.createElement('span');
    spinner.style.cssText =
      'width:14px; height:14px; border-radius:50%; border:2px solid rgba(255,255,255,.35); ' +
      'border-top-color:#fff; display:inline-block; animation:exportSpin .8s linear infinite;';
    if (!document.getElementById('exportSpinKeyframes')) {
      const style = document.createElement('style');
      style.id = 'exportSpinKeyframes';
      style.textContent = '@keyframes exportSpin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }
    const label = document.createElement('span');
    label.id = 'exportProgressLabel';
    _exportProgressEl.appendChild(spinner);
    _exportProgressEl.appendChild(label);
    document.body.appendChild(_exportProgressEl);
  }
  document.getElementById('exportProgressLabel').textContent = text;
  _exportProgressEl.style.display = 'flex';
}


function hideExportProgress() {
  if (_exportProgressEl) _exportProgressEl.style.display = 'none';
}



// يبني وسمًا (مقطع اسم ملف) يحتوي على اسم الصف والقسم (عربي/لغات) لإضافته لاسم ملف التصدير
function buildGradeSectionFileTag(db) {
  const info = db.schoolInfo || {};
  const CLASS_SECTION_SHORT = { arabic: 'عربي', languages: 'لغات' };
  const gradesPresent = [...new Set(Object.values(db.classGrade || {}))].filter(Boolean);
  const gradeLabel = gradesPresent.length ? gradesPresent.join('_') : (info.grade || '').trim();
  const sectionShort = CLASS_SECTION_SHORT[info.classLanguage] || '';
  let tag = gradeLabel;
  if (sectionShort) tag += (tag ? '_' : '') + sectionShort;
  return tag.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
}



// يبني وينزّل نسخة الإكسل الأصلية المحدَّثة بدرجات فصل دراسي معيّن، لصفٍ واحد بعينه.
// مفصولة عن exportToExcel لإتاحة استدعائها لكل صف على حدة عند "تنزيل كل الصفوف دفعة واحدة".
// العملية الثقيلة فعلياً (قراءة/كتابة ملف Excel كامل) تُنفَّذ في Worker منفصل (انظر runExportJob)
// حتى لا تتجمّد الصفحة، بينما حساب الدرجات نفسه (سريع وممنهج بفضل الفهرس المخزَّن مؤقتاً في
// buildGradesIndex) يبقى هنا على الخيط الرئيسي.
// ترجع Promise<true> لو نجح التنزيل، أو Promise<false> لو لا توجد نسخة محفوظة لهذا الصف.
async function exportGradeOriginalFormat(db, term, gradeKey) {
  const meta = (db.metaByGrade || {})[gradeKey];
  if (!meta || !meta.workbookStoragePath) return false;
  const workbookBase64 = await downloadWorkbookFromCloud(meta.workbookStoragePath);
  if (!workbookBase64) return false;
  const grade = meta.grade || gradeKey;
  const section = meta.section || '';

  // نجهّز فقط قائمة (صف، عمود، قيمة) التي يجب كتابتها، ونرسلها للـ Worker ليقوم هو بفتح
  // الملف الأصلي وتعديلها وإعادة كتابته - بدون أي عملية XLSX ثقيلة هنا على الخيط الرئيسي.
  const writes = [];
  db.students.filter(s => s.grade === grade && s.section === section).forEach(s => {
    db.subjects.forEach(subj => {
      subj.components.forEach((comp, ci) => {
        if (comp.colIndex === undefined || comp.colIndex < 0) return;
        const finalScore = computeFinalComponentScore(db, s.id, subj.name, ci, term, comp.name, comp.maxScore);
        if (finalScore === null) return;
        // لا نكتب علامة __INCOMPLETE__ داخل ملف الإكسيل — تُترك الخانة فارغة أو الرقم المحسوب
        if (typeof isIncompleteMark === 'function' && isIncompleteMark(finalScore)) return;
        writes.push([s.rowIndex, comp.colIndex, finalScore]);
      });
    });
  });

  const buffer = await runExportJob('buildOriginal', {
    workbookBase64: workbookBase64,
    sheetName: meta.sheetName,
    writes,
  });

  const base = (meta.fileName || 'grades').replace(/\.[^/.]+$/, '');
  const termSuffix = term === 'first' ? '_الفصل_الأول' : '_الفصل_الثاني';
  const SECTION_SHORT = { arabic: 'عربي', languages: 'لغات' };
  let gradeTag = (grade || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
  if (SECTION_SHORT[section]) gradeTag += (gradeTag ? '_' : '') + SECTION_SHORT[section];
  downloadArrayBuffer(buffer, base + (gradeTag ? '_' + gradeTag : '') + termSuffix + '.xlsx');
  return true;
}



async function exportToExcel(term, evt) {
  const db = loadDB();
  const sel = document.getElementById('exportGradeSelect');
  const grade = sel ? sel.value : '';
  if (!grade) { alert('يرجى اختيار الصف المطلوب تنزيل نسخته أولاً من القائمة.'); return; }
  const btn = evt && evt.target;
  if (btn) btn.disabled = true;
  showExportProgress('📤 جارٍ تجهيز ملف الإكسيل...');
  try {
    const ok = await exportGradeOriginalFormat(db, term, grade);
    if (!ok) alert('لا توجد نسخة من ملف Excel محفوظة لهذا الصف بعد (أو تعذّر تنزيلها من التخزين السحابي - تحقق من الاتصال بالإنترنت). يرجى رفع ملفه ومعالجته أولاً.');
  } catch (err) {
    console.error(err);
    alert('حدث خطأ أثناء تصدير الملف. حاول مرة أخرى.');
  } finally {
    hideExportProgress();
    if (btn) btn.disabled = false;
  }
}



// "تنزيل كل الصفوف دفعة واحدة": يمرّ تلقائياً على كل صف محفوظ في db.metaByGrade
// (بدل اختيار كل صف يدوياً من القائمة) ويصدّر لكل صف ملفه الأصلي المحدَّث بنفس اسمه،
// لكلا الفصلين الدراسيين (الأول والثاني)، بدون أي تدخل إضافي من المستخدم.
// كل ملف يُبنى في الـ Worker (بالتوازي مع تجهيز الملف التالي)، والتنزيلات الفعلية فقط
// (a.click) تُطلَق بفاصل زمني بسيط بينها لأن المتصفحات تمنع إطلاق عدة تنزيلات في نفس اللحظة.
async function exportAllGradesOriginalFormat(evt) {
  const db = loadDB();
  const grades = Object.keys(db.metaByGrade || {});
  if (!grades.length) {
    alert('لا توجد أي نسخ محفوظة من ملفات Excel بعد. يرجى رفع ملف كل صف ومعالجته أولاً.');
    return;
  }
  const jobs = [];
  grades.forEach(grade => {
    ['first', 'second'].forEach(term => {
      const meta = (db.metaByGrade || {})[grade];
      if (meta && meta.workbookStoragePath) jobs.push({ grade, term });
    });
  });
  if (!jobs.length) {
    alert('لا توجد أي نسخ محفوظة من ملفات Excel بعد. يرجى رفع ملف كل صف ومعالجته أولاً.');
    return;
  }
  const btn = evt && evt.target;
  if (btn) btn.disabled = true;
  const SECTION_LABELS = { arabic: 'عربي', languages: 'لغات' };
  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const jm = (db.metaByGrade || {})[job.grade] || {};
      const jobLabel = jm.grade ? `${jm.grade} - ${SECTION_LABELS[jm.section] || jm.section || ''}` : job.grade;
      showExportProgress(`📦 جارٍ تصدير الملف ${i + 1} من ${jobs.length} (${jobLabel})...`);
      try {
        await exportGradeOriginalFormat(db, job.term, job.grade);
      } catch (err) {
        console.error('تعذّر تصدير ملف الصف ' + job.grade + ':', err);
      }
      // فاصل بسيط بين كل تنزيل والذي يليه فقط (وليس بين حسابات الملفات نفسها) حتى لا يمنع
      // المتصفح ظهور نافذة التنزيل الثانية بسبب إطلاق تنزيلات متعددة في نفس اللحظة.
      if (i < jobs.length - 1) await new Promise(r => setTimeout(r, 250));
    }
  } finally {
    hideExportProgress();
    if (btn) btn.disabled = false;
  }
}



// تصدير ملف إكسيل مستقل لكل شهر، بنفس ترتيب ورؤوس أعمدة الملف الأصلي الذي تم رفعه،
// مع كتابة درجات هذا الشهر تحديداً (بدون أي تجميع أو متوسط مع شهور أخرى)
// ترتيب أعمدة كشف الرصد الشهري الرسمي:
// الرقم القومي، نتيجة (فترة الامتحان)، الصف (الصف+المرحلة+القسم)، اسم الطالب، رقم الجلوس،
// حالة النتيجة، ثم عمود لكل مادة (وعمود خاص "تحديد اللغة الثانية" قبل أول مادة لغة ثانية إن وُجدت)
function buildMonthlyExportAoa(db, term, month, gradeKey) {
  const monthLabels = getMonthLabels(term);
  const monthLabel = monthLabels[month - 1] || `الشهر ${month}`;
  const academicYear = (db.schoolInfo && db.schoolInfo.academicYear) || '';
  const isLastMonthOfYear = term === 'second' && month === monthLabels.length;
  const examPeriodText = isLastMonthOfYear ?
    (academicYear ? `آخر العام (${academicYear})` : 'آخر العام') :
    (academicYear ? `اختبار شهر ${monthLabel} (${academicYear})` : `اختبار شهر ${monthLabel}`);

  const meta = (db.metaByGrade || {})[gradeKey] || {};
  const grade = meta.grade || gradeKey || '';
  const section = meta.section || '';
  const CLASS_SECTION_SHORT = { arabic: 'عربي', languages: 'لغات' };
  const sectionShort = CLASS_SECTION_SHORT[section] || '';
  // "الصف" يُحدَّد لكل طالب على حدة (عبر خريطة الفصل←الصف أو حقل الصف الخاص بالطالب) بدل قيمة
  // واحدة ثابتة للمرحلة كلها، لأن المرحلة الواحدة أصبحت قد تضم الصفوف الثلاثة معاً في نفس الملف.
  function classTextForStudent(s) {
    const gradeLabel = ((db.classGrade && db.classGrade[classSectionKey(s.class, s.section)]) || s.grade || grade || '').trim();
    return sectionShort ? `${gradeLabel} (${sectionShort})` : gradeLabel;
  }

  const header = ['الرقم القومي', 'نتيجة', 'الصف', 'اسم الطالب', 'رقم الجلوس', 'حالة النتيجة'];
  let secondLangMarkerAdded = false;
  const subjectCols = []; // { type: 'secondLangText' } أو { type: 'subject', subject, comps }
  (db.subjects || []).forEach(subj => {
    if ((subj.name || '').trim() === 'نوع') return; // استبعاد عمود "نوع" من كشف الرصد الشهري بناءً على طلب المستخدم
    if (!subjectAppliesToGradeSection(subj, grade, section)) return;
    if (!secondLangMarkerAdded && subjectIsSecondLang(subj.name)) {
      subjectCols.push({ type: 'secondLangText' });
      secondLangMarkerAdded = true;
    }
    // ننقل درجة "الاختبار/التقييم الشهري" المحدَّدة صراحةً لهذه المادة من تبويب "المواد"
    // (خاصية isMonthlyGrade)، وليس أي تخمين من اسم المكوّن - لأن بعض المراحل (كالابتدائي)
    // تُسمّي هذا المكوّن "التقييم الشهري" وهو اسم لا يحتوي كلمة "امتحان/اختبار"، فلو اعتمدنا على
    // اسم المكوّن فقط سيقع الاستيراد خطأً في جمع كل مكونات المادة معاً بدل المكوّن الشهري وحده.
    const monthlyIdx = (subj.components || []).findIndex(c => c.isMonthlyGrade);
    const useComps = monthlyIdx !== -1 ? [{ comp: subj.components[monthlyIdx], ci: monthlyIdx }] : [];
    subjectCols.push({ type: 'subject', subject: subj, comps: useComps });
  });

  const students = db.students.filter(s => !gradeKey || (s.grade === grade && s.section === section))
    .sort((a, b) => a.class !== b.class ? a.class.localeCompare(b.class) :
    (a.gender !== b.gender ? (a.gender === 'F' ? -1 : 1) : a.name.localeCompare(b.name)));

  const gradesIdx = buildGradesIndex(db);
  // هل تُصدَّر الدرجة الشهرية المرصودة لهذا الشهر كما هي، أم مقسومة على اثنين (حسب اختيار
  // المستخدم من "monthlyDivideModeSelect")؟
  const divideByTwo = getMonthlyDivideMode() === 'half';
  // بناء رؤوس أعمدة المواد بعد معرفة وضع القسمة حتى تتطابق الدرجة العظمى في الرأس مع القيم المصدَّرة
  subjectCols.forEach(col => {
    if (col.type === 'secondLangText') {
      header.push('تحديد اللغة الثانية');
      return;
    }
    const totalMax = col.comps.reduce((sum, { comp }) => sum + (Number(comp.maxScore) || 0), 0);
    const displayMax = divideByTwo
      ? Math.round((totalMax / 2) * 100) / 100
      : totalMax;
    header.push(`${col.subject.exportName || col.subject.name} (${displayMax})`);
  });
  const aoa = [header];
  students.forEach(s => {
    const row = [s.nationalId || '', examPeriodText, classTextForStudent(s), s.name, s.seat, 'متاح'];
    subjectCols.forEach(col => {
      if (col.type === 'secondLangText') { row.push(s.secondLanguage || ''); return; }
      let sum = 0, hasAny = false, hasNumeric = false;
      col.comps.forEach(({ comp, ci }) => {
        const g = gradesIdx.get(s.id + '|' + col.subject.name + '|' + term + '|' + month + '|' + ci);
        if (g) {
          hasAny = true;
          if (!isAbsentMark(g.score)) { sum += g.score; hasNumeric = true; }
        }
      });
      if (!hasAny) { row.push(''); return; }
      if (!hasNumeric) { row.push(ABSENT_MARK); return; }
      row.push(divideByTwo ? Math.round((sum / 2) * 100) / 100 : sum);
    });
    aoa.push(row);
  });
  return { aoa, monthLabel };
}



async function exportMonthlyExcel(term, month, evt) {
  try {
    const db = loadDB();
    if (!db.students.length || !db.subjects.length) {
      alert('لا توجد بيانات كافية للتصدير. يرجى رفع ملف ومعالجته أولاً.');
      return;
    }
    const sel = document.getElementById('exportGradeSelect');
    const gradeKey = sel ? sel.value : '';
    if (!gradeKey) { alert('يرجى اختيار الصف المطلوب تصدير درجاته أولاً من القائمة.'); return; }

    const subjectsMissingMonthlyFlag = (db.subjects || []).filter(s => !(s.components || []).some(c => c.isMonthlyGrade));
    if (subjectsMissingMonthlyFlag.length) {
      const proceed = await showConfirm(
        `⚠️ المواد التالية ليس لها مكوّن محدَّد كـ"الدرجة الشهرية" (سيُصدَّر لها عمود فارغ في هذا الملف):\n${subjectsMissingMonthlyFlag.map(s => s.name).join('، ')}\n\nيمكنك تحديد المكوّن الصحيح لكل مادة من تبويب "المواد" ثم إعادة التصدير. هل تريد المتابعة والتصدير الآن رغم ذلك؟`);
      if (!proceed) return;
    }

    // فحص قبل التصدير: هل توجد خانات "درجة شهرية" لم تُرصد بعد لهذا الصف/الشهر؟ (نفس المكوّن
    // الوحيد بالضبط الذي يُصدَّر فعلياً لكل مادة هنا - وليس كل مكونات المادة).
    {
      const gk = (db.metaByGrade || {})[gradeKey] || {};
      const monthlyGrade = gk.grade || gradeKey || '';
      const monthlySection = gk.section || '';
      const monthlyStudents = db.students.filter(s => !gradeKey || (s.grade === monthlyGrade && s.section === monthlySection));
      const monthlyCells = [];
      (db.subjects || []).forEach(subj => {
        if ((subj.name || '').trim() === 'نوع') return;
        if (!subjectAppliesToGradeSection(subj, monthlyGrade, monthlySection)) return;
        const monthlyIdx = (subj.components || []).findIndex(c => c.isMonthlyGrade);
        if (monthlyIdx === -1) return;
        monthlyCells.push(...buildCellsForCheck(monthlyStudents, subj.name,
          [{ index: monthlyIdx, name: subj.components[monthlyIdx].name }], term, [month]));
      });
      if (!(await confirmProceedDespiteMissingGrades(db, monthlyCells))) return;
    }

    const { aoa, monthLabel } = buildMonthlyExportAoa(db, term, month, gradeKey);
    if (aoa.length <= 1) { alert('لا يوجد طلاب لهذا الصف بعد. يرجى رفع ملفه ومعالجته أولاً.'); return; }
    const cols = aoa[0].map((_, ci) => {
      let maxLen = 8;
      aoa.forEach(r => { const v = r[ci]; if (v !== undefined && v !== null && v !== '') maxLen = Math.max(maxLen, String(v).length); });
      return { wch: Math.min(30, maxLen + 2) };
    });

    const meta = (db.metaByGrade || {})[gradeKey] || {};
    const base = meta.fileName ? meta.fileName.replace(/\.[^/.]+$/, '') : 'كشف_رصد_الدرجات';
    const termLabel = term === 'first' ? 'الفصل_الأول' : 'الفصل_الثاني';
    const safeMonthLabel = monthLabel.replace(/[\\/:*?"<>|]/g, '_');
    const SECTION_SHORT = { arabic: 'عربي', languages: 'لغات' };
    let gradeTag = (meta.grade || gradeKey).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
    if (SECTION_SHORT[meta.section]) gradeTag += '_' + SECTION_SHORT[meta.section];

    const btn = evt && evt.target;
    if (btn) btn.disabled = true;
    showExportProgress('📤 جارٍ تجهيز ملف الإكسيل...');
    try {
      const sheetNameSafe = `كشف رصد ${monthLabel}`.slice(0, 31);
      const buffer = await runExportJob('buildFromAoa', { aoa, cols, rtl: true, sheetName: sheetNameSafe });
      downloadArrayBuffer(buffer, `${base}_${gradeTag}_${termLabel}_${safeMonthLabel}.xlsx`);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء تصدير الملف. حاول مرة أخرى.\n' + ((err && err.message) || err));
    } finally {
      hideExportProgress();
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    console.error('exportMonthlyExcel error:', err);
    hideExportProgress();
    alert('حدث خطأ غير متوقع أثناء تجهيز التصدير:\n' + ((err && err.message) || err));
  }
}



// كشف "أعمال السنة" لنظام الكنترول: عمود واحد فقط لكل مادة يحمل المجموع الكلي المُجمَّع لهذا
// الفصل (وليس تفصيل المكونات)، بأسماء تصدير مختصرة (exportName) ومرتّب برقم الجلوس، تماماً
// كما يتوقعه شيت "كشف اعمال سنة" في ملف الكنترول.
function buildTermExportAoa(db, term, gradeKey) {
  const meta = (db.metaByGrade || {})[gradeKey] || {};
  const grade = meta.grade || gradeKey || '';
  const section = meta.section || '';

  const header = ['رقم الجلوس', 'اسم الطالب'];
  let secondLangMarkerAdded = false;
  const subjectCols = []; // { type: 'secondLangText' } أو { type: 'subject', subject }
  // مواد هذا الصف/القسم فقط (حسب appliesTo المسجّل عند رفع الملف الأصلي) حتى لا تظهر مواد صفوف أخرى
  (db.subjects || []).forEach(subj => {
    if ((subj.name || '').trim() === 'نوع') return;
    if (!subjectAppliesToGradeSection(subj, grade, section)) return;
    if (!secondLangMarkerAdded && subjectIsSecondLang(subj.name)) {
      header.push('تحديد اللغة الثانية');
      subjectCols.push({ type: 'secondLangText' });
      secondLangMarkerAdded = true;
    }
    const totalMax = (subj.components || []).reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0);
    header.push(`${subj.exportName || subj.name} (${totalMax})`);
    subjectCols.push({ type: 'subject', subject: subj });
  });

  const students = db.students.filter(s => !gradeKey || (s.grade === grade && s.section === section))
    .sort((a, b) => (parseInt(a.seat, 10) || 0) - (parseInt(b.seat, 10) || 0) || a.name.localeCompare(b.name));

  const aoa = [header];
  students.forEach(s => {
    const row = [s.seat || '', s.name];
    subjectCols.forEach(col => {
      if (col.type === 'secondLangText') { row.push(s.secondLanguage || ''); return; }
      const total = subjectTermTotal(db, s.id, col.subject.name, term, col.subject);
      row.push(total === null ? '' : (isIncompleteMark(total) ? INCOMPLETE_LABEL : total));
    });
    aoa.push(row);
  });
  return { aoa };
}



async function exportTermControlExcel(term, evt) {
  try {
    const db = loadDB();
    if (!db.students.length || !db.subjects.length) {
      alert('لا توجد بيانات كافية للتصدير. يرجى رفع ملف ومعالجته أولاً.');
      return;
    }
    const sel = document.getElementById('exportGradeSelect');
    const gradeKey = sel ? sel.value : '';
    if (!gradeKey) { alert('يرجى اختيار الصف المطلوب تصدير كشف أعماله أولاً من القائمة.'); return; }

    const subjectsMissingExportName = (db.subjects || []).filter(s => !s.exportName || s.exportName === s.name);
    if (subjectsMissingExportName.length) {
      const proceed = await showConfirm(
        `⚠️ المواد التالية ليس لها اسم تصدير مختصر مخصص (سيُستخدم اسمها الكامل كما هو، وقد لا يطابق اسم العمود المتوقع في ملف الكنترول):\n${subjectsMissingExportName.map(s => s.name).join('، ')}\n\nيمكنك تحديد اسم تصدير لكل مادة من تبويب "المواد" ثم إعادة التصدير. هل تريد المتابعة الآن رغم ذلك؟`);
      if (!proceed) return;
    }

    // فحص قبل التصدير: هل توجد خانات درجات لم تُرصد بعد في أي شهر من شهور الفصل لهذا الصف؟
    // (نفس المكونات الأكاديمية المُحتسبة فعلاً ضمن مجموع كل مادة هنا - باستثناء مكونات
    // الحضور/الغياب التي لا تدخل أصلاً في هذا المجموع، تماماً كمنطق subjectTermTotal).
    {
      const gk = (db.metaByGrade || {})[gradeKey] || {};
      const controlGrade = gk.grade || gradeKey || '';
      const controlSection = gk.section || '';
      const controlStudents = db.students.filter(s => !gradeKey || (s.grade === controlGrade && s.section === controlSection));
      const controlMonths = getMonthLabels(term).map((_, i) => i + 1);
      const controlCells = [];
      (db.subjects || []).forEach(subj => {
        if ((subj.name || '').trim() === 'نوع') return;
        if (!subjectAppliesToGradeSection(subj, controlGrade, controlSection)) return;
        const comps = (subj.components || []).map((c, ci) => ({ index: ci, name: c.name, type: c.type }))
          .filter(c => c.type !== 'attendance');
        if (!comps.length) return;
        controlCells.push(...buildCellsForCheck(controlStudents, subj.name, comps, term, controlMonths));
      });
      if (!(await confirmProceedDespiteMissingGrades(db, controlCells))) return;
    }

    const { aoa } = buildTermExportAoa(db, term, gradeKey);
    if (aoa.length <= 1) { alert('لا يوجد طلاب لهذا الصف بعد. يرجى رفع ملفه ومعالجته أولاً.'); return; }
    const cols = aoa[0].map((_, ci) => {
      let maxLen = 8;
      aoa.forEach(r => { const v = r[ci]; if (v !== undefined && v !== null && v !== '') maxLen = Math.max(maxLen, String(v).length); });
      return { wch: Math.min(30, maxLen + 2) };
    });

    const meta = (db.metaByGrade || {})[gradeKey] || {};
    const termLabel = term === 'first' ? 'الفصل_الأول' : 'الفصل_الثاني';
    const SECTION_SHORT = { arabic: 'عربي', languages: 'لغات' };
    let gradeTag = (meta.grade || gradeKey).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
    if (SECTION_SHORT[meta.section]) gradeTag += '_' + SECTION_SHORT[meta.section];

    const btn = evt && evt.target;
    if (btn) btn.disabled = true;
    showExportProgress('📤 جارٍ تجهيز كشف أعمال السنة...');
    try {
      const sheetNameSafe = 'كشف اعمال سنة'.slice(0, 31);
      const buffer = await runExportJob('buildFromAoa', { aoa, cols, rtl: true, sheetName: sheetNameSafe });
      downloadArrayBuffer(buffer, `كشف_اعمال_السنة_${gradeTag}_${termLabel}.xlsx`);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء تصدير الملف. حاول مرة أخرى.\n' + ((err && err.message) || err));
    } finally {
      hideExportProgress();
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    console.error('exportTermControlExcel error:', err);
    hideExportProgress();
    alert('حدث خطأ غير متوقع أثناء تجهيز التصدير:\n' + ((err && err.message) || err));
  }
}



// بناء زر تصدير مستقل لكل شهر من شهور الفصلين، حسب الأسماء التي حددها مدير النظام في بيانات المدرسة



function renderMonthlyExportButtons() {
  const container = document.getElementById('monthlyExportButtons');
  if (!container) return;
  const db = loadDB();
  if (!db.students.length || !db.subjects.length) { container.innerHTML = ''; return; }

  let html = '';
  [{ key: 'first', label: 'الفصل الأول' }, { key: 'second', label: 'الفصل الثاني' }].forEach(t => {
    const labels = getMonthLabels(t.key);
    labels.forEach((lbl, i) => {
      html += `<button class="btn btn-success btn-sm" data-action="exportMonthlyExcel" data-with-event data-args='${gspArgs([t.key, i + 1])}'>📥 ${lbl} (${t.label})</button>`;
    });
  });
  container.innerHTML = html;
  populateExportGradeSelect();
}



// يملأ قائمة "اختر الصف" المستخدَمة عند تنزيل نسخة الإكسل الأصلية المحدَّثة (زرَّا الفصل الأول/الثاني)،
// لأن كل صف من الصفوف الثلاثة قد رُفع من ملف Excel أصلي مختلف الشكل، فلا يمكن دمجهم في تنزيل واحد.
function populateExportGradeSelect() {
  const db = loadDB();
  let keys = Object.keys(db.metaByGrade || {});
  const SECTION_LABELS = { arabic: 'عربي', languages: 'لغات' };
  // إن لم تُبنَ metaByGrade بعد: نشتق الصفوف من بيانات الطلاب
  if (!keys.length && db.students && db.students.length) {
    const seen = new Set();
    (db.students || []).forEach(s => {
      const g = s.grade || '';
      const sec = s.section || '';
      if (!g) return;
      const k = g + '|' + sec;
      if (seen.has(k)) return;
      seen.add(k);
      db.metaByGrade = db.metaByGrade || {};
      if (!db.metaByGrade[k]) db.metaByGrade[k] = { grade: g, section: sec };
    });
    keys = Object.keys(db.metaByGrade || {});
  }
  function fillGradeSel(sel) {
    if (!sel) return;
    const cur = sel.value;
    if (!keys.length) {
      sel.innerHTML = '<option value="">-- لا يوجد ملف مرفوع بعد --</option>';
      return;
    }
    sel.innerHTML = keys.map(k => {
      const m = (db.metaByGrade || {})[k] || {};
      const label = m.grade ? `${m.grade} (${SECTION_LABELS[m.section] || m.section || '-'})` : k;
      return `<option value="${String(k).replace(/"/g, '&quot;')}">${escapeHtml(label)}</option>`;
    }).join('');
    if (cur && keys.includes(cur)) sel.value = cur;
    else if (keys.length && !sel.value) sel.selectedIndex = 0;
  }
  fillGradeSel(document.getElementById('exportGradeSelect'));
  fillGradeSel(document.getElementById('termTotalsGradeSelect'));
  fillGradeSel(document.getElementById('termTotalsGradeSelectPc'));
  fillGradeSel(document.getElementById('termTotalsGradeSelectMon'));
}




// window exports
GSP.findHeaderRow = findHeaderRow;


GSP.detectColumns = detectColumns;


GSP.isPassFailMaxCell = isPassFailMaxCell;


GSP.buildSubjects = buildSubjects;


GSP.reconcileWithCatalog = reconcileWithCatalog;


GSP.parseWorkbookSheet = parseWorkbookSheet;


GSP.onSheetChange = onSheetChange;


GSP.arrayBufferToBase64 = arrayBufferToBase64;


GSP.onImportStageChange = onImportStageChange;


GSP.diffStudentFields = diffStudentFields;


GSP.buildStudentRosterDiff = buildStudentRosterDiff;


GSP.studentRosterDiffHasChanges = studentRosterDiffHasChanges;


GSP.buildStudentRosterDiffConfirmMessage = buildStudentRosterDiffConfirmMessage;


GSP.buildStudentRosterDiffReportHtml = buildStudentRosterDiffReportHtml;


GSP.toggleUploadSection = toggleUploadSection;


GSP.processMainFile = processMainFile;


GSP.getExportWorker = getExportWorker;


GSP.runExportJob = runExportJob;


GSP.downloadWorkbook = downloadWorkbook;


GSP.downloadArrayBuffer = downloadArrayBuffer;


GSP.showExportProgress = showExportProgress;


GSP.hideExportProgress = hideExportProgress;


GSP.buildGradeSectionFileTag = buildGradeSectionFileTag;


GSP.exportGradeOriginalFormat = exportGradeOriginalFormat;


GSP.exportToExcel = exportToExcel;


GSP.exportAllGradesOriginalFormat = exportAllGradesOriginalFormat;


GSP.buildMonthlyExportAoa = buildMonthlyExportAoa;


GSP.exportMonthlyExcel = exportMonthlyExcel;


GSP.buildTermExportAoa = buildTermExportAoa;


GSP.exportTermControlExcel = exportTermControlExcel;


GSP.renderMonthlyExportButtons = renderMonthlyExportButtons;


GSP.populateExportGradeSelect = populateExportGradeSelect;


GSP.MissingColumnsError = MissingColumnsError;


// بعد تعريف الدالة وتعيينها على GSP: إعادة رسم أزرار التصدير الشهري إن كانت واجهة التهيئة
// قد نُفِّذت مبكراً (init.js يُحمَّل قبل هذا الملف بسبب ترتيب السكربتات).
try {
  if (typeof renderMonthlyExportButtons === 'function') {
    renderMonthlyExportButtons();
  }
} catch (e) {
  console.warn('renderMonthlyExportButtons late-init', e);
}
