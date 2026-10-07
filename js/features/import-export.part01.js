/* import-export.part01.js — generated from import-export.js; execution order is significant. */
/** features/import-export.js */
'use strict';



function findHeaderRow(rows) {
  const keys = ['رقم الجلوس', 'اسم الطالب', 'اسم الطالبه', 'الرقم القومي', 'رقم قومي'].map(k => normalizeArabic(k));
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const rowStr = normalizeArabic((rows[i] || []).join(' '));
    if (keys.some(k => rowStr.includes(k))) return i;
  }
  return -1;
}



function detectColumns(headerRow) {
  const map = {};
  const normPatterns = {};
  Object.keys(COLUMN_PATTERNS).forEach(key => {
    normPatterns[key] = COLUMN_PATTERNS[key].map(p => normalizeArabic(p));
  });
  headerRow.forEach((cell, idx) => {
    const text = normalizeArabic(String(cell || '').trim());
    if (!text) return;
    for (const key of Object.keys(normPatterns)) {
      if (map[key] !== undefined) continue;
      if (key === 'examPeriod') {
        if (normPatterns[key].some(p => text === p)) map[key] = idx;
        continue;
      }
      if (normPatterns[key].some(p => text.includes(p))) map[key] = idx;
    }
  });
  return map;
}



// يتعرّف على عمود "اجتاز / لم يجتز" في صف الدرجة العظمى (بدلاً من رقم)، بأي شكل كتابة شائع
// (اجتاز/إجتاز، بمسافة أو سطر جديد بين الكلمتين)، حتى يُستورد هذا العمود تلقائياً كمكوّن
// من نوع "اجتاز/لم يجتز" بدل تجاهله لعدم وجود رقم صالح فيه.

function isPassFailMaxCell(raw) {
  const norm = normalizeArabic(String(raw || '')).replace(/\s+/g, ' ').trim();
  return /جتاز/.test(norm) && /يجتز/.test(norm);
}



function buildSubjects(headerRow, componentRow, maxRow, skipCols) {
  const subjects = [];
  let currentSubject = null;

  for (let j = 0; j < headerRow.length; j++) {
    if (skipCols.has(j)) { currentSubject = null; continue; }
    const headerCell = String(headerRow[j] || '').trim();
    const compCell = componentRow ? String(componentRow[j] || '').trim() : '';
    const maxValRaw = maxRow ? maxRow[j] : undefined;
    const maxScoreNum = parseFloat(maxValRaw);
    const hasMax = !!maxRow && maxValRaw !== undefined && maxValRaw !== '' && !isNaN(maxScoreNum);
    const isPassFail = !hasMax && !!maxRow && isPassFailMaxCell(maxValRaw);

    if (headerCell) {
      let subj = subjects.find(s => s.name === headerCell);
      if (!subj) { subj = { name: headerCell, exportName: headerCell, components: [] };
        subjects.push(subj); }
      currentSubject = subj;
      if (hasMax) {
        const compName = compCell || headerCell;
        subj.components.push({ name: compName, maxScore: maxScoreNum, colIndex: j, isMonthlyGrade: isExamComponent(compName) });
      } else if (isPassFail) {
        const compName = compCell || headerCell;
        subj.components.push({ name: compName, maxScore: DEFAULT_PASSFAIL_MAX_SCORE, colIndex: j, isMonthlyGrade: false, type: 'passfail' });
      }
    } else if (currentSubject && hasMax) {
      const compName = compCell || `${currentSubject.name} ${currentSubject.components.length + 1}`;
      currentSubject.components.push({ name: compName, maxScore: maxScoreNum, colIndex: j, isMonthlyGrade: isExamComponent(compName) });
    } else if (currentSubject && isPassFail) {
      const compName = compCell || `${currentSubject.name} ${currentSubject.components.length + 1}`;
      currentSubject.components.push({ name: compName, maxScore: DEFAULT_PASSFAIL_MAX_SCORE, colIndex: j, isMonthlyGrade: false, type: 'passfail' });
    }
  }

  subjects.forEach(s => {
    if (s.components.length === 0) {
      const idx = headerRow.findIndex(c => String(c || '').trim() === s.name);
      s.components.push({ name: s.name, maxScore: 100, colIndex: idx, isMonthlyGrade: isExamComponent(s.name) });
    }
  });

  return subjects.filter(s => s.components.some(c => c.colIndex !== undefined && c.colIndex >= 0));
}



// يطابق مادة مستوردة حديثاً مع تعريفها الرسمي المحفوظ مسبقاً (الكتالوج) بالاسم، بدلاً من استبدال
// الهيكل المحفوظ في كل مرة. أي مكوّن اسمه يطابق (بعد التطبيع) مكوّناً موجوداً في الكتالوج يأخذ نفس
// ترتيبه وخصائصه المحفوظة (الدرجة العظمى، وعلامة "الدرجة الشهرية")، فقط رقم العمود (colIndex) يُؤخذ
// من الملف الحالي. أي مكوّن جديد فعلاً (اسم لم يُشاهَد من قبل لهذه المادة) يُضاف في نهاية القائمة
// ويُعلَّم بـ isNewComponent حتى يعرضه الاستيراد كتنبيه بدلاً من إضافته صامتاً.
function reconcileWithCatalog(freshSubjects, existingSubjects) {
  const warnings = [];
  const catalogByName = new Map((existingSubjects || []).map(s => [s.name, s]));
  const reconciled = freshSubjects.map(freshSubj => {
    const existing = catalogByName.get(freshSubj.name);
    if (!existing) {
      // مادة جديدة كلياً: هذا أول رفع لها، فتصبح هي نفسها التعريف الرسمي
      return freshSubj;
    }
    const existingComps = existing.components || [];
    const matchedNames = new Set();
    const newComponents = [];
    const orderedComponents = existingComps.map(ec => {
      const match = freshSubj.components.find(fc => normalizeArabic(fc.name).trim() === normalizeArabic(ec.name).trim());
      if (match) { matchedNames.add(match.name);
        return { ...ec, colIndex: match.colIndex }; }
      return { ...ec, colIndex: undefined }; // مكوّن محفوظ لكن غير موجود في هذا الملف تحديداً (لا قيمة له هذه المرة)
    });
    freshSubj.components.forEach(fc => {
      if (!matchedNames.has(fc.name)) {
        newComponents.push({ ...fc, isNewComponent: true });
      }
    });
    if (newComponents.length) {
      warnings.push({ subjectName: freshSubj.name, newComponents: newComponents.map(c => c.name) });
    }
    return { name: existing.name, exportName: existing.exportName, components: orderedComponents.concat(newComponents) };
  });
  return { subjects: reconciled, warnings };
}




class MissingColumnsError extends Error {
  constructor(missing) { super('missing columns');
    this.missing = missing; }
}



function parseWorkbookSheet(wb, sheetName, term, grade, section, existingSubjects) {
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) throw new Error('الورقة المختارة لا تحتوي على بيانات كافية.');

  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) throw new Error(
    'لم يتم العثور على صف رؤوس الأعمدة. يجب أن يحتوي الملف على عمود "اسم الطالب" أو "رقم الجلوس".');

  const headerRow = rows[headerIdx];
  const colMap = detectColumns(headerRow);

  const missing = [];
  if (colMap.nationalId === undefined) missing.push('الرقم القومي');
  if (colMap.name === undefined) missing.push('اسم الطالب');
  if (missing.length) throw new MissingColumnsError(missing);

  let maxRowIdx = -1;
  const skipColsForMaxCheck = new Set(Object.values(colMap).filter(v => v !== undefined));
  for (let i = headerIdx + 1; i < Math.min(rows.length, headerIdx + 6); i++) {
    const row = rows[i];
    let total = 0,
      numeric = 0;
    row.forEach((v, idx) => {
      if (skipColsForMaxCheck.has(idx)) return;
      if (v !== '' && v !== undefined && v !== null) { total++; if (!isNaN(parseFloat(v)) || isPassFailMaxCell(v)) numeric++; }
    });
    if (total > 0 && numeric / total > 0.6) { maxRowIdx = i; break; }
  }

  const componentRow = (maxRowIdx !== -1 && maxRowIdx > headerIdx + 1) ? rows[maxRowIdx - 1] : null;

  const skipCols = new Set(Object.values(colMap).filter(v => v !== undefined));
  const subjects = buildSubjects(headerRow, componentRow, maxRowIdx !== -1 ? rows[maxRowIdx] : null, skipCols);
  const { subjects: reconciledSubjects, warnings: catalogWarnings } = reconcileWithCatalog(subjects, existingSubjects);
  const dataStartIdx = maxRowIdx !== -1 ? maxRowIdx + 1 : headerIdx + 1;

  const students = [];
  const classes = new Set();
  const grades = [];
  const invalidGrades = [];
  // تعقّب تكرار رقم الجلوس داخل نفس الفصل فقط (وليس عبر كل فصول المرحلة)، لأن رقم الجلوس
  // من الطبيعي أن يتكرر بين الفصول المختلفة (كل فصل يبدأ ترقيمه من جديد)، وهذا ليس تعارضاً حقيقياً.
  const seenSeatsByClass = new Map();
  const duplicateSeats = new Set();

  for (let r = dataStartIdx; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => String(c).trim() === '')) continue;

    const name = String(row[colMap.name] !== undefined ? row[colMap.name] : '').trim();
    const seat = String(row[colMap.seat] !== undefined ? row[colMap.seat] : '').trim();
    const nationalId = colMap.nationalId !== undefined ? String(row[colMap.nationalId] || '').trim() : '';
    if (!name || !nationalId) continue;

    const cls = colMap.class !== undefined ? (String(row[colMap.class] || '').trim() || 'عام') : 'عام';
    const secondLang = colMap.secondLang !== undefined ? String(row[colMap.secondLang] || '').trim() : '';

    // تنبيه تكرار رقم الجلوس يقتصر الآن على التكرار داخل نفس الفصل فقط، ولا يُعتبر خطأ حقيقياً
    // إذا كان لدى الطالب رقم قومي (لأن الرقم القومي هو المعرّف الفعلي المعتمد داخل قاعدة البيانات).
    const seatKey = cls + '::' + seat;
    if (!nationalId) {
      if (seenSeatsByClass.has(seatKey)) duplicateSeats.add(seat + ' (' + cls + ')');
      seenSeatsByClass.set(seatKey, true);
    }

    let gender = 'M';
    if (colMap.gender !== undefined) {
      const g = String(row[colMap.gender] || '').trim().toLowerCase();
      if (['f', 'female', 'أنثى', 'انثى', 'فتاة', 'بنت'].includes(g)) gender = 'F';
    }
    const idGender = genderFromNationalId(nationalId);
    if (idGender) gender = idGender;

    classes.add(cls);
    // معرّف فريد لكل طالب: يُبنى من القسم ثم الصف (grade) للحفاظ على الفصل التام بين بيانات
    // القسمين حتى لو تشابهت أسماء الصفوف والفصول بينهما، ثم من الرقم القومي إن وُجد لأنه
    // المعرّف الحقيقي والثابت لكل طالب. تعارض رقم الجلوس بين فصلين في نفس المرحلة يُتجاهل
    // تماماً في هذه الحالة لأن الرقم القومي هو الفيصل. فقط إذا غاب الرقم القومي يُستخدم الفصل
    // + رقم الجلوس معاً كبديل احتياطي (بدلاً من رقم الجلوس وحده) لتقليل احتمال التعارض.
    const studentId = (section || '') + '::' + (grade || '') + '::' + (nationalId || (cls + '::' + seat));
    students.push({ id: studentId, nationalId, seat, name, gender, class: cls, grade: grade || '', section: section || '', secondLanguage: secondLang, rowIndex: r });

    reconciledSubjects.forEach(subj => {
      subj.components.forEach((comp, ci) => {
        if (comp.colIndex === undefined || comp.colIndex < 0) return;
        const raw = row[comp.colIndex];
        if (raw === '' || raw === undefined || raw === null) return;
        const score = comp.type === 'passfail' ? parsePassFailScore(raw, comp.maxScore) : parseFloat(raw);
        if (score === null || isNaN(score)) return;
        // تحقق من أن الدرجة لا تتجاوز الحد الأقصى المخصص لهذا المكون (ولا تقل عن صفر)
        if (score < 0 || (comp.maxScore != null && score > comp.maxScore)) {
          invalidGrades.push({ seat, name, subjectName: subj.name, componentName: comp.name, score, maxScore: comp
            .maxScore });
          return;
        }
        grades.push({ studentId, subjectName: subj.name, term, componentIndex: ci, score });
      });
    });
  }

  return {
    headerIdx,
    maxRowIdx,
    dataStartIdx,
    colMap,
    subjects: reconciledSubjects,
    catalogWarnings,
    students,
    classes: [...classes].sort(),
    grades,
    invalidGrades,
    duplicateSeats: [...duplicateSeats]
  };
}



// ============================================================
//  FILE HANDLING
// ============================================================
document.getElementById('fileInput').addEventListener('change', function() {
  const file = this.files[0];
  const status = document.getElementById('uploadStatus');
  const messages = document.getElementById('uploadMessages');
  messages.innerHTML = '';
  document.getElementById('processBtn').disabled = true;
  document.getElementById('sheetRow').style.display = 'none';
  if (!file) return;

  uploadedFileName = file.name;
  status.textContent = '📖 جاري قراءة الملف...';

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const buffer = e.target.result;
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      uploadedWorkbook = wb;
      uploadedWorkbook.__base64 = arrayBufferToBase64(buffer);

      const sheetSelect = document.getElementById('sheetSelect');
      sheetSelect.innerHTML = '';
      wb.SheetNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sheetSelect.appendChild(opt);
      });

      let bestSheet = wb.SheetNames[0],
        bestScore = -1;
      wb.SheetNames.forEach(name => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
        const idx = findHeaderRow(rows);
        if (idx !== -1 && (bestScore === -1 || idx < bestScore)) { bestScore = idx;
          bestSheet = name; }
      });
      sheetSelect.value = bestSheet;

      document.getElementById('sheetRow').style.display = wb.SheetNames.length > 1 ? 'grid' : 'none';
      document.getElementById('processBtn').disabled = false;
      status.textContent = `📎 تم اختيار الملف: ${file.name} (${wb.SheetNames.length} ورقة)`;
      status.style.color = '#0b5e42';
    } catch (err) {
      status.textContent = '❌ تعذر قراءة الملف: ' + err.message;
      status.style.color = '#b91c1c';
    }
  };
  reader.onerror = function() { status.textContent = '❌ حدث خطأ أثناء قراءة الملف'; };
  reader.readAsArrayBuffer(file);
});



function onSheetChange() {}



function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}



// ============================================================
//  STAGE / GRADE SELECTION (before upload)
// ============================================================
// هيكل المدرسة: كل قسم (عربي/لغات) يحتوي على رياض أطفال (2 صف)، ابتدائي (6 صفوف)،
// إعدادي (3 صفوف)، ثانوي (3 صفوف)
const ORDINALS_AR = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];


const STAGE_GRADE_CONFIG = {
  kg: { count: 2, label: i => `KG${i + 1} (الصف ${ORDINALS_AR[i]} الروضة)` },
  primary: { count: 6, label: i => `الصف ${ORDINALS_AR[i]} الابتدائي` },
  prep: { count: 3, label: i => `الصف ${ORDINALS_AR[i]} الإعدادي` },
  secondary: { count: 3, label: i => `الصف ${ORDINALS_AR[i]} الثانوي` }
};



function onImportStageChange() {
  const stage = document.getElementById('importStage').value;
  const gradeSel = document.getElementById('importGrade');
  const cfg = STAGE_GRADE_CONFIG[stage];
  if (!cfg) {
    gradeSel.innerHTML = '<option value="">-- اختر المرحلة أولاً --</option>';
    return;
  }
  let opts = '<option value="">-- اختر الصف --</option>';
  for (let i = 0; i < cfg.count; i++) {
    const label = cfg.label(i);
    opts += `<option value="${label}">${label}</option>`;
  }
  gradeSel.innerHTML = opts;
}



// ============================================================
//  مقارنة كشف الطلاب عند إعادة رفع ملف لنفس الصف/القسم: يهدف هذا الجزء إلى التمييز بين
//  "طالب معدَّلة بياناته" و"طالب مُضاف حديثاً" و"طالب غير موجود في الملف الجديد (سيُحذف)"،
//  حتى لا تُفقد الدرجات المرصودة فعلياً لأي طالب مستمر، حتى لو صُحِّح رقمه القومي أو اسمه.
// ============================================================
const STUDENT_FIELD_LABELS = {
  nationalId: 'الرقم القومي', name: 'الاسم', class: 'الفصل', seat: 'رقم الجلوس',
  secondLang: 'اللغة الثانية', gender: 'النوع'
};



function diffStudentFields(os, ns) {
  const changed = [];
  if ((os.nationalId || '') !== (ns.nationalId || '')) changed.push('nationalId');
  if ((os.name || '') !== (ns.name || '')) changed.push('name');
  if ((os.class || '') !== (ns.class || '')) changed.push('class');
  if ((os.seat || '') !== (ns.seat || '')) changed.push('seat');
  if ((os.secondLanguage || '') !== (ns.secondLanguage || '')) changed.push('secondLang');
  if ((os.gender || '') !== (ns.gender || '')) changed.push('gender');
  return changed;
}
