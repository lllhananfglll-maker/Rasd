/** features/import-export.js — مدمج بالكامل (المرحلة C) — لا أجزاء part* متبقية */
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
      status.style.color = 'var(--rasd-brand)';
    } catch (err) {
      status.textContent = '❌ تعذر قراءة الملف: ' + err.message;
      status.style.color = 'var(--rasd-danger)';
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


// يبني مقارنة كاملة بين كشف الطلاب القديم (المحفوظ) والجديد (المستخرج من الملف المرفوع حديثاً)
// لنفس الصف والقسم. المطابقة الأساسية تتم بنفس معرّف الطالب الفعلي (id) المعتمد في قاعدة البيانات،
// وأي طالب لم يُطابَق بهذا المعرّف يُعاد فحصه بمطابقة احتياطية عبر (الفصل + رقم الجلوس) القديمين،
// لاكتشاف حالة "تصحيح الرقم القومي أو الاسم لنفس الطالب" بدل اعتبارها حذفاً وإضافة منفصلين.
function buildStudentRosterDiff(oldStudents, newStudents) {
  const oldById = new Map(oldStudents.map(s => [s.id, s]));
  const kept = [];
  const idRemaps = [];
  const matchedOldIds = new Set();
  const matchedNewIds = new Set();

  newStudents.forEach(ns => {
    const os = oldById.get(ns.id);
    if (os) {
      matchedOldIds.add(os.id);
      matchedNewIds.add(ns.id);
      const changed = diffStudentFields(os, ns);
      if (changed.length) kept.push({ oldS: os, newS: ns, changed });
    }
  });

  const remainingOld = oldStudents.filter(s => !matchedOldIds.has(s.id));
  const remainingNew = newStudents.filter(s => !matchedNewIds.has(s.id));
  const usedNewIds = new Set();
  remainingOld.forEach(os => {
    const match = remainingNew.find(ns => !usedNewIds.has(ns.id) && ns.class === os.class && ns.seat === os.seat);
    if (match) {
      usedNewIds.add(match.id);
      matchedOldIds.add(os.id);
      matchedNewIds.add(match.id);
      const changed = diffStudentFields(os, match);
      idRemaps.push({ oldId: os.id, newId: match.id, oldS: os, newS: match, changed });
    }
  });

  const removed = oldStudents.filter(s => !matchedOldIds.has(s.id));
  const added = newStudents.filter(s => !matchedNewIds.has(s.id));
  return { kept, idRemaps, removed, added };
}



function studentRosterDiffHasChanges(diff) {
  return diff.removed.length > 0 || diff.added.length > 0 || diff.idRemaps.length > 0 ||
    diff.kept.some(k => k.changed.length > 0);
}



// يبني رسالة تأكيد نصية (لصندوق confirm) تلخّص كل ما سيتغيّر، مقسَّماً حسب نوع التعديل، حتى
// يوافق مدير النظام على التحديث بوعي تام قبل تطبيقه (خصوصاً حذف الطلاب وما يرتبط بهم من درجات).
function buildStudentRosterDiffConfirmMessage(diff) {
  const lines = [];
  const fieldCounts = {};
  diff.kept.concat(diff.idRemaps).forEach(k => k.changed.forEach(f => { fieldCounts[f] = (fieldCounts[f] || 0) + 1; }));
  const changedFieldsList = Object.keys(fieldCounts);
  if (changedFieldsList.length) {
    lines.push('📝 تعديلات على بيانات طلاب مستمرين (بدون أي مساس بدرجاتهم المرصودة):');
    changedFieldsList.forEach(f => lines.push(`  • تعديل ${STUDENT_FIELD_LABELS[f] || f}: ${fieldCounts[f]} طالب`));
  }
  if (diff.idRemaps.length) {
    lines.push(`  • من بينهم ${diff.idRemaps.length} طالب تم التعرّف عليهم عبر نفس الفصل ورقم الجلوس رغم تغيّر الرقم القومي/الاسم، وستُنقل درجاتهم المرصودة سابقاً معهم تلقائياً.`);
  }
  if (diff.added.length) {
    const maxShow = 10;
    const names = diff.added.slice(0, maxShow).map(s => `${s.name} (${s.seat})`).join('، ');
    const more = diff.added.length > maxShow ? ` ...و${diff.added.length - maxShow} آخرين` : '';
    lines.push(`➕ إضافة ${diff.added.length} طالب جديد: ${names}${more}`);
  }
  if (diff.removed.length) {
    const maxShow = 10;
    const names = diff.removed.slice(0, maxShow).map(s => `${s.name} (${s.seat})`).join('، ');
    const more = diff.removed.length > maxShow ? ` ...و${diff.removed.length - maxShow} آخرين` : '';
    lines.push(`🗑️ حذف ${diff.removed.length} طالب غير موجودين في الملف الجديد (سيُحذف نهائياً كل درجاتهم في كل الفصول والشهور): ${names}${more}`);
  }
  if (!lines.length) lines.push('لا توجد أي تغييرات في بيانات الطلاب عن الملف السابق، فقط تحديث/إضافة درجات.');
  return `سيتم تحديث بيانات هذا الصف/القسم كالتالي:\n\n${lines.join('\n')}\n\nهل تريد المتابعة بتطبيق هذا التحديث؟`;
}



// يبني تقرير HTML دائم (يُعرض في منطقة الرسائل بعد المعالجة) لتوثيق كل تغيير تفصيلياً بحسب نوعه
function buildStudentRosterDiffReportHtml(diff) {
  if (!studentRosterDiffHasChanges(diff)) return '';
  const rows = [];
  diff.kept.concat(diff.idRemaps).forEach(k => {
    if (!k.changed.length) return;
    const details = k.changed.map(f => `${escapeHtml(STUDENT_FIELD_LABELS[f] || f)}: "${escapeHtml(k.oldS[f === 'secondLang' ? 'secondLanguage' : f] || '-')}" ← "${escapeHtml(k.newS[f === 'secondLang' ? 'secondLanguage' : f] || '-')}"`).join('، ');
    rows.push(`<li>✏️ ${escapeHtml(k.newS.name)} (${escapeHtml(k.newS.seat)}) — ${details}</li>`);
  });
  diff.added.forEach(s => rows.push(`<li>➕ إضافة: ${escapeHtml(s.name)} (${escapeHtml(s.seat)})</li>`));
  diff.removed.forEach(s => rows.push(`<li>🗑️ حذف (مع كل درجاته المرصودة): ${escapeHtml(s.name)} (${escapeHtml(s.seat)})</li>`));
  return `<div class="warning-box">📋 تفاصيل تحديث بيانات الطلاب لهذا الصف/القسم:<ul style="margin:6px 0 0 0; padding-inline-start:20px;">${rows.join('')}</ul></div>`;
}



// ============================================================
//  PROCESS UPLOAD
// ============================================================

function toggleUploadSection(sectionId, navBtn) {
  const sec = document.getElementById(sectionId);
  if (!sec) return;
  const willOpen = !sec.classList.contains('is-open');
  sec.classList.toggle('is-open', willOpen);
  const head = sec.querySelector('.up-section-head');
  if (head) head.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  document.querySelectorAll('#upNavBtns .up-nav-btn').forEach(b => {
    const active = b.getAttribute('data-up-target') === sectionId;
    b.classList.toggle('is-active', active && willOpen);
    b.classList.toggle('is-open', active && willOpen);
  });
  if (navBtn && willOpen) {
    try { sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  }
}


async function processMainFile() {
  const status = document.getElementById('uploadStatus');
  const messages = document.getElementById('uploadMessages');
  const bar = document.getElementById('progressBar');
  messages.innerHTML = '';

  const importSection = document.getElementById('importSection').value;
  const importStage = document.getElementById('importStage').value;
  const importGrade = document.getElementById('importGrade').value;
  if (!importSection || !importStage || !importGrade) {
    status.textContent = '⚠️ يرجى اختيار القسم والمرحلة والصف أولاً قبل معالجة الملف';
    status.style.color = 'var(--rasd-danger)';
    return;
  }

  // حاجز تنفيذ لمدير المرحلة (حتى لو عُدّلت القوائم من أدوات المطوّر)
  if (currentAccountType === 'stageadmin' && currentStageAdmin) {
    const allowedSections = getStageAdminAllowedImportSections();
    if (!allowedSections.includes(importSection)) {
      status.textContent = '⚠️ غير مصرح لك برفع ملفات لهذا القسم. النطاق مقصور على مرحلتك.';
      status.style.color = 'var(--rasd-danger)';
      return;
    }
    const stageRec = typeof getStageRecord === 'function' ? getStageRecord(currentStageId) : null;
    if (stageRec && stageRec.section && importSection !== stageRec.section) {
      status.textContent = '⚠️ القسم المختار لا يطابق قسم المرحلة الحالية.';
      status.style.color = 'var(--rasd-danger)';
      return;
    }
    const inferred = stageRec ? inferEducationalStageTypeFromName(stageRec.name) : null;
    if (inferred && importStage !== inferred) {
      status.textContent = '⚠️ لا يمكنك رفع ملفات لنوع مرحلة غير مرحلتك («' + (stageRec.name || '') + '»).';
      status.style.color = 'var(--rasd-danger)';
      return;
    }
    const assigned = currentStageAdmin.stageIds || [];
    if (currentStageId && assigned.length && !assigned.includes(currentStageId)) {
      status.textContent = '⚠️ غير مصرح لك بالرفع في هذه المرحلة التنظيمية.';
      status.style.color = 'var(--rasd-danger)';
      return;
    }
  }

  if (!uploadedWorkbook) { status.textContent = '⚠️ يرجى اختيار ملف أولاً'; return; }

  const sheetName = document.getElementById('sheetSelect').value || uploadedWorkbook.SheetNames[0];
  const term = document.getElementById('importTermSelect').value;
  const month = parseInt(document.getElementById('importMonthSelect').value, 10);

  bar.style.width = '30%';
  status.textContent = '🔄 جاري تحليل البيانات...';

  try {
    const transaction = (typeof GSP !== 'undefined' && GSP.application && GSP.application.services && GSP.application.services.transaction) || null;
    const clone = transaction && typeof transaction.clone === 'function' ? transaction.clone : (value => JSON.parse(JSON.stringify(value)));
    // STEP 37: import works on an isolated draft. Nothing reaches the live stage
    // until every transformation has completed successfully.
    const transactionSnapshot = clone(loadDB());
    const db = clone(transactionSnapshot);
    const result = parseWorkbookSheet(uploadedWorkbook, sheetName, term, importGrade, importSection, db.subjects);
    result.grades.forEach(g => { g.month = month; });

    // STEP 44: structured pre-commit validation of the parse result
    const importValidation = (typeof GSP !== 'undefined' && GSP.importValidation) || null;
    if (importValidation && typeof importValidation.validateParsedResult === 'function') {
      const parsedReport = importValidation.validateParsedResult(result, {
        term, month, grade: importGrade, section: importSection, stageId: currentStageId
      });
      if (!parsedReport.ok) {
        bar.style.width = '0%';
        status.textContent = '❌ فشل التحقق من صحة بيانات الملف — لم يتم تطبيق أي تغيير.';
        status.style.color = 'var(--rasd-danger)';
        if (typeof importValidation.formatReportHtml === 'function') {
          messages.innerHTML = importValidation.formatReportHtml(parsedReport);
        } else {
          messages.innerHTML = '<div class="error-box">❌ ' +
            parsedReport.errors.map(e => e.message).join('؛ ') + '</div>';
        }
        return;
      }
      if (parsedReport.warningCount > 0 && typeof importValidation.formatReportHtml === 'function') {
        messages.innerHTML += importValidation.formatReportHtml({
          errors: [], warnings: parsedReport.warnings, infos: [], summary: null
        });
      }
    }

    bar.style.width = '70%';

    // دمج البيانات على مستوى كل (صف + قسم) على حدة: رفع ملف صف معيّن لقسم معيّن (مثلاً الصف الثاني
    // الإعدادي - القسم العربي) يستبدل فقط بيانات هذا الصف ولهذا القسم بالذات، ولا يمس إطلاقاً بيانات
    // نفس الصف في القسم الآخر، ولا بيانات باقي الصفوف المخزَّنة بالفعل في نفس المرحلة. هذا ضروري لأن
    // المرحلة الواحدة قد تضم عدة صفوف وقسمين معاً (عربي/لغات) في نفس الوقت.
    const oldStudentsThisGrade = (db.students || []).filter(s => s.grade === importGrade && s.section === importSection);
    const staleCandidateClasses = new Set(oldStudentsThisGrade.map(s => s.class));

    // مقارنة الكشف القديم بالكشف الجديد المستخرج من الملف: تمييز الطلاب المستمرين (بلا تغيير أو
    // بتعديل بعض الحقول)، الطلاب الجدد، والطلاب غير الموجودين في الملف الجديد (سيُحذفون مع درجاتهم).
    const rosterDiff = buildStudentRosterDiff(oldStudentsThisGrade, result.students);
    if (oldStudentsThisGrade.length > 0 && studentRosterDiffHasChanges(rosterDiff)) {
      const proceed = await showConfirm(buildStudentRosterDiffConfirmMessage(rosterDiff));
      if (!proceed) {
        bar.style.width = '0%';
        status.textContent = '⏸️ تم إلغاء التحديث، لم يتم تغيير أي بيانات.';
        status.style.color = 'var(--rasd-text-muted)';
        return;
      }
    }

    // نقل الدرجات المرصودة سابقاً من المعرّف القديم إلى المعرّف الجديد لكل طالب تم التعرّف عليه عبر
    // المطابقة الاحتياطية (نفس الفصل ورقم الجلوس) رغم تغيّر رقمه القومي أو اسمه، حتى لا تُفقد درجاته.
    rosterDiff.idRemaps.forEach(({ oldId, newId }) => {
      (db.grades || []).forEach(g => { if (g.studentId === oldId) g.studentId = newId; });
    });
    // حذف كل درجات الطلاب غير الموجودين في الملف الجديد (في كل الفصول الدراسية والشهور، وليس فقط
    // الشهر الحالي)، لأنهم لم يعودوا ضمن كشف هذا الصف/القسم إطلاقاً.
    if (rosterDiff.removed.length) {
      const removedIds = new Set(rosterDiff.removed.map(s => s.id));
      db.grades = (db.grades || []).filter(g => !removedIds.has(g.studentId));
    }

    db.students = (db.students || []).filter(s => !(s.grade === importGrade && s.section === importSection)).concat(result.students);

    // المواد مشتركة عادة بين صفوف نفس المرحلة. المادة الجديدة كلياً تُضاف كتعريف رسمي أول مرة،
    // أما المادة الموجودة بالفعل فتحتفظ بترتيب وخصائص مكوناتها المحفوظة كما هي (لا تُستبدل)،
    // ويُضاف لها فقط أي مكوّن جديد فعلاً اكتُشف في هذا الملف (بنفس الترتيب المستخدم عند استخراج
    // الدرجات أعلاه حتى تبقى فهارس المكونات متوافقة).
    // يُسجَّل نطاق كل مادة (الصف والقسم الذي تنتمي إليه) في حقل appliesTo حتى تظهر المادة فقط
    // عند اختيار فصل من هذا الصف وهذا القسم في تبويبَي إدخال الدرجات وتخصيص المعلمين.
    db.subjects = db.subjects || [];
    const subjectsByName = new Map(db.subjects.map(s => [s.name, s]));
    const scopeKey = importGrade + '|' + importSection;
    result.subjects.forEach(s => {
      const existing = subjectsByName.get(s.name);
      if (!existing) {
        if (!s.appliesTo) s.appliesTo = [];
        if (!s.appliesTo.includes(scopeKey)) s.appliesTo.push(scopeKey);
        db.subjects.push(s);
        subjectsByName.set(s.name, s);
        return;
      }
      if (!existing.appliesTo) existing.appliesTo = [];
      if (!existing.appliesTo.includes(scopeKey)) existing.appliesTo.push(scopeKey);
      const existingCompNames = new Set(existing.components.map(c => c.name));
      s.components.forEach(c => { if (c.isNewComponent && !existingCompNames.has(c.name)) {
        const { isNewComponent, ...compToSave } = c;
        existing.components.push(compToSave); } });
    });

    // تحديث خريطة (فصل ← صف)، بمفتاح مركّب من اسم الفصل + القسم، لفصول هذا الصف ولهذا القسم فقط،
    // مع الإبقاء التام على فصول الصفوف والقسم الآخر كما هي (حتى لو تشابهت أسماء الفصول بينهما).
    db.classGrade = db.classGrade || {};
    const stillUsedClassKeys = new Set(db.students.map(s => classSectionKey(s.class, s.section)));
    staleCandidateClasses.forEach(c => { const k = classSectionKey(c, importSection); if (!stillUsedClassKeys.has(k)) delete db.classGrade[k]; });
    result.classes.forEach(c => { db.classGrade[classSectionKey(c, importSection)] = importGrade; });
    db.classes = [...new Set(Object.keys(db.classGrade))].sort();

    // دمج الدرجات المستخرجة من الملف عبر "تحديث/إضافة" (upsert) بدل المسح الكامل ثم الإضافة:
    // أي درجة موجودة في الملف الجديد لنفس الطالب/المادة/المكوّن/الفصل الدراسي/الشهر يتم تحديثها،
    // وأي درجة كانت مرصودة سابقاً (يدوياً أو من رفعة سابقة) ولم يوردها الملف الجديد (خانة فارغة)
    // تبقى كما هي دون مساس، حتى لا تُفقد أي درجة مرصودة فعلاً لأي طالب مستمر بسبب إعادة رفع الملف.
    db.grades = db.grades || [];
    result.grades.forEach(ng => {
      const existing = db.grades.find(g => g.studentId === ng.studentId && g.subjectName === ng.subjectName &&
        g.term === ng.term && g.month === ng.month && g.componentIndex === ng.componentIndex);
      if (existing) existing.score = ng.score;
      else db.grades.push(ng);
    });

    db.metaByGrade = db.metaByGrade || {};
    const gradeMetaKey = importGrade + '§' + importSection;
    db.metaByGrade[gradeMetaKey] = {
      fileName: uploadedFileName,
      sheetName: sheetName,
      headerIdx: result.headerIdx,
      maxRowIdx: result.maxRowIdx,
      colMap: result.colMap,
      term: term,
      month: month,
      grade: importGrade,
      section: importSection
    };
    // نسخة الملف الأصلي: تُرفَع كملف ثنائي حقيقي إلى Supabase Storage (تخزين سحابي منفصل عن قاعدة
    // البيانات)، ولا يُحفَظ في db.metaByGrade سوى مسار نصي صغير يشير إليها - فلا تُثقل localStorage
    // ولا عمود jsonb الرئيسي إطلاقاً. فشل هذا الرفع (مثلاً: لا يوجد اتصال، أو الـ bucket غير مُعَدّ
    // بعد) لا يوقف استيراد بيانات الطلاب والدرجات نفسها، فقط يعطّل ميزة "تنزيل الملف الأصلي" لاحقاً.
    const workbookStorageKeyVal = workbookStorageKey(currentStageId, gradeMetaKey);
    const uploadResult = await uploadWorkbookToCloud(workbookStorageKeyVal, uploadedWorkbook.__base64);
    if (uploadResult.ok) {
      db.metaByGrade[gradeMetaKey].workbookStoragePath = workbookStorageKeyVal;
      db.metaByGrade[gradeMetaKey].workbookStoredAt = new Date().toISOString();
    } else {
      messages.innerHTML +=
        `<div class="warning-box">⚠️ تم استيراد بيانات الطلاب والدرجات بنجاح، لكن تعذّر حفظ نسخة احتياطية من ملف Excel الأصلي في التخزين السحابي (${uploadResult.reason || 'خطأ غير معروف'}). لن تتأثر بيانات الطلاب/الدرجات بهذا إطلاقاً، لكن ميزة "تنزيل نسخة الملف الأصلي المحدَّثة" لن تعمل لهذا الصف حتى تُعاد معالجة الملف بنجاح مع اتصال سليم.</div>`;
    }
    db.meta = db.metaByGrade[gradeMetaKey]; // آخر ملف تم رفعه، يُستخدم كاسم افتراضي عند التصدير

    // تحديث بيانات المدرسة (القسم/الفصل الدراسي) بناءً على الاختيار قبل الرفع. لا يتم تثبيت "الصف"
    // كقيمة وحيدة للمرحلة كلها بعد الآن لأن المرحلة قد تضم أكثر من صف معاً؛ يُحفظ فقط كآخر صف تم رفعه.
    db.schoolInfo = Object.assign({}, db.schoolInfo || {}, {
      term: term,
      grade: importGrade,
      stageType: importStage,
      classLanguage: importSection
    });

    // STEP 44: validate merge plan (scope isolation) before durable commit
    if (importValidation && typeof importValidation.validateMergePlan === 'function') {
      const mergeReport = importValidation.validateMergePlan(transactionSnapshot, db, {
        grade: importGrade, section: importSection
      });
      if (!mergeReport.ok) {
        try {
          if (typeof GSP !== 'undefined' && typeof GSP.replaceCurrentStageDataInMemory === 'function') {
            GSP.replaceCurrentStageDataInMemory(transactionSnapshot);
          }
        } catch (rollbackError) { console.error('STEP 44 merge validation rollback failed:', rollbackError); }
        bar.style.width = '0%';
        status.textContent = '❌ فشل التحقق من خطة الدمج — تم إلغاء الاستيراد بالكامل.';
        status.style.color = 'var(--rasd-danger)';
        if (typeof importValidation.formatReportHtml === 'function') {
          messages.innerHTML = importValidation.formatReportHtml(mergeReport);
        } else {
          messages.innerHTML = '<div class="error-box">❌ ' +
            mergeReport.errors.map(e => e.message).join('؛ ') + '</div>';
        }
        return;
      }
    }

    const committed = await Promise.resolve(saveDB(db));
    if (committed === false) {
      // Durable commit failed: restore the in-memory stage snapshot so the
      // failed import cannot leak partially-applied state into the current UI.
      try {
        if (typeof GSP !== 'undefined' && typeof GSP.replaceCurrentStageDataInMemory === 'function') {
          GSP.replaceCurrentStageDataInMemory(transactionSnapshot);
        }
      } catch (rollbackError) { console.error('STEP 37 import rollback failed:', rollbackError); }
      if (uploadResult && uploadResult.ok && typeof deleteWorkbooksFromCloud === 'function') {
        try { await deleteWorkbooksFromCloud([workbookStorageKeyVal]); } catch (_) {}
      }
      bar.style.width = '0%';
      status.textContent = '❌ فشل الحفظ النهائي — تم إلغاء الاستيراد بالكامل ولم يتم اعتماد التغييرات.';
      status.style.color = 'var(--rasd-danger)';
      return;
    }
    bar.style.width = '100%';

    const gradesPresentCount = new Set(Object.values(db.classGrade)).size;
    status.textContent =
      `✅ تم معالجة الملف بنجاح: ${result.students.length} طالب، ${result.subjects.length} مادة، ${result.classes.length} فصل (لصف "${importGrade}"). إجمالي الصفوف المخزَّنة الآن في هذه المرحلة: ${gradesPresentCount}.`;
    try {
      recordAudit('رفع Excel', 'صف: ' + importGrade + ' | قسم: ' + importSection + ' | طلاب: ' + result.students.length + ' | مواد: ' + result.subjects.length + ' | ملف: ' + (uploadedFileName || ''));
    } catch (eAudit) {}
    status.style.color = 'var(--rasd-brand)';

    const rosterDiffReportHtml = buildStudentRosterDiffReportHtml(rosterDiff);
    if (rosterDiffReportHtml) messages.innerHTML += rosterDiffReportHtml;

    if (result.duplicateSeats.length) {
      messages.innerHTML +=
        `<div class="warning-box">⚠️ تم العثور على أرقام جلوس مكررة داخل نفس الفصل لطلاب بلا رقم قومي: ${result.duplicateSeats.map(escapeHtml).join('، ')}. يرجى مراجعة هذه الصفوف؛ ملاحظة: تكرار رقم الجلوس بين فصول مختلفة في نفس المرحلة أمر طبيعي ولا يمثل مشكلة، حيث يعتمد النظام على الرقم القومي كمعرّف أساسي في قاعدة البيانات عند توفره.</div>`;
    }

    // يقتصر هذا التنبيه على رئيس الكنترول فقط: هو الوحيد المخوَّل برؤية بيانات (أسماء طلاب
    // وأسماء مراحل) تخص مراحل أخرى غير المرحلة الحالية. مدير المرحلة لا يجب أن يطّلع على أي شيء
    // عن مرحلة غير مسندة إليه، حتى في صورة تنبيه تكرار.
    const crossStageDuplicates = currentAccountType === 'superadmin' ?
      findCrossStageDuplicateNationalIds(result.students, currentStageId) : [];
    if (crossStageDuplicates.length) {
      const maxToShow = 15;
      const lines = crossStageDuplicates.slice(0, maxToShow).map(d =>
        `${escapeHtml(d.name)} (${escapeHtml(d.nationalId)}) — مسجَّل أيضاً في مرحلة "${escapeHtml(d.stageName)}"${d.otherName && d.otherName !== d.name ? ` باسم "${escapeHtml(d.otherName)}"` : ''}`);
      const more = crossStageDuplicates.length > maxToShow ?
        `<br>... و${crossStageDuplicates.length - maxToShow} حالة أخرى` : '';
      messages.innerHTML +=
        `<div class="warning-box">⚠️ تنبيه: الرقم القومي لـ ${crossStageDuplicates.length} طالب من هذا الملف مسجَّل أيضاً في مرحلة دراسية أخرى، يرجى التأكد من عدم تكرار تسجيل نفس الطالب في أكثر من مرحلة:<br>${lines.join('<br>')}${more}</div>`;
    }

    if (result.catalogWarnings && result.catalogWarnings.length) {
      const lines = result.catalogWarnings.map(w =>
        `${escapeHtml(w.subjectName)}: ${w.newComponents.map(escapeHtml).join('، ')}`);
      messages.innerHTML +=
        `<div class="warning-box">⚠️ تم اكتشاف مكوّنات جديدة لم تكن موجودة من قبل في تعريف هذه المواد (تمت إضافتها تلقائياً في نهاية قائمة مكونات كل مادة)، يُرجى مراجعتها من تبويب "المواد" للتأكد من صحتها (الدرجة العظمى، وهل هي "الدرجة الشهرية"):<br>${lines.join('<br>')}</div>`;
    }

    if (result.invalidGrades && result.invalidGrades.length) {
      const maxToShow = 15;
      const lines = result.invalidGrades.slice(0, maxToShow).map(g =>
        `${escapeHtml(g.name)} (${escapeHtml(g.seat)}) — ${escapeHtml(g.subjectName)} / ${escapeHtml(g.componentName)}: ${g.score} (الحد الأقصى ${g.maxScore})`);
      const more = result.invalidGrades.length > maxToShow ?
        `<br>... و${result.invalidGrades.length - maxToShow} حالة أخرى` : '';
      messages.innerHTML +=
        `<div class="error-box">🚫 تم تجاهل ${result.invalidGrades.length} درجة تتجاوز الحد الأقصى المسموح به (أو سالبة) ولم يتم استيرادها. يرجى تصحيحها في ملف الإكسيل وإعادة رفعه:<br>${lines.join('<br>')}${more}</div>`;
    }

    document.getElementById('fileSummary').innerHTML = `
      <div class="grid-3" style="margin-top:12px;">
        <div class="card stat-card"><div class="stat-num">${result.students.length}</div><div class="stat-label">طلاب</div></div>
        <div class="card stat-card"><div class="stat-num">${result.subjects.length}</div><div class="stat-label">مواد</div></div>
        <div class="card stat-card"><div class="stat-num">${result.classes.length}</div><div class="stat-label">فصول</div></div>
      </div>
      <div style="margin-top:8px; font-size:13px; color:var(--rasd-text-muted);">الفصول: ${result.classes.join('، ')}</div>
    `;

    loadStudentsUI();
    loadSubjectsUI();
    updateFilters();
    loadStatsUI();
    if (typeof GSP !== 'undefined' && typeof GSP.renderMonthlyExportButtons === 'function') {
      GSP.renderMonthlyExportButtons();
    }
    updateSchoolInfoDisplay();
    setTimeout(() => { bar.style.width = '0%'; }, 800);

  } catch (err) {
    bar.style.width = '0%';
    if (err instanceof MissingColumnsError) {
      messages.innerHTML =
        `<div class="error-box">❌ الملف يفتقد الأعمدة التالية المطلوبة: <strong>${err.missing.join('، ')}</strong>. تأكد من وجود هذه الأعمدة في صف الرؤوس واختيار الورقة الصحيحة.</div>`;
      status.textContent = '❌ لم تتم المعالجة - أعمدة مفقودة';
    } else if (isQuotaError(err)) {
      messages.innerHTML =
        `<div class="error-box">❌ مساحة التخزين المتاحة في متصفحك ممتلئة تماماً ولم يمكن تحرير مساحة كافية تلقائياً. جرّب حذف بعض البيانات غير الضرورية (تبويب "إدارة المراحل") أو استخدم متصفحاً/جهازاً بمساحة تخزين أكبر، ثم أعد المحاولة. بياناتك الحالية لم تتأثر ولم يتم فقد أي شيء.</div>`;
      status.textContent = '❌ لم تتم المعالجة - مساحة التخزين ممتلئة';
    } else {
      messages.innerHTML = `<div class="error-box">❌ خطأ أثناء المعالجة: ${escapeHtml(err.message)}</div>`;
      status.textContent = '❌ خطأ أثناء المعالجة';
    }
    status.style.color = 'var(--rasd-danger)';
    console.error(err);
  }
}



// ============================================================
//  EXPORT WORKER — تنفيذ العمليات الثقيلة (قراءة/بناء/كتابة ملفات Excel عبر مكتبة SheetJS) في
//  Web Worker منفصل عن الخيط الرئيسي (UI thread). هذا هو سبب "تجمّد" الصفحة السابق: XLSX.read()
//  لملف Excel أصلي كامل، ثم XLSX.write() له، كانتا تُنفَّذان بشكل متزامن (synchronous) على نفس
//  الخيط الذي يرسم الواجهة، فتتجمّد الصفحة تماماً طوال مدة التنفيذ - ويتضاعف الأمر عند "تنزيل كل
//  الصفوف دفعة واحدة" لأنها تتكرر لكل صف × كل فصل دراسي. بنقل هذا العمل إلى Worker تبقى الواجهة
//  متجاوبة دائماً، ويمكن تصدير عدة ملفات بالتوازي دون أي تجميد، وأسرع أيضاً لأن المتصفح يستغل
//  نواة معالج إضافية بدل حجز الخيط الوحيد المسؤول عن الرسم والتفاعل.
// ============================================================
let _exportWorker = null;


let _exportWorkerReqId = 0;


const _exportWorkerPending = new Map();


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
