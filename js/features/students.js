/** features/students.js — كتالوج الطلاب + القائمة الرئيسية */
'use strict';


var masterRosterPendingPlan = null;

// اسم الشيت لازم ينتهي بـ"عربى/عربي" أو "لغات"، والجزء اللي قبلها هو اسم المرحلة المطلوب مطابقته
// بالحرف لاسم مرحلة موجودة بالفعل في تبويب "إدارة المراحل".
function parseMasterRosterSheetName(sheetName) {
  const trimmed = String(sheetName || '').trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  let section = null;
  if (last === 'عربى' || last === 'عربي') section = 'arabic';
  else if (last === 'لغات') section = 'languages';
  else return null;
  return { stageName: parts.slice(0, -1).join(' '), section };
}

async function handleMasterRosterFile(evt) {
  const file = evt.target.files && evt.target.files[0];
  if (!file) return;
  document.getElementById('masterRosterFileName').textContent = file.name;
  const statusEl = document.getElementById('masterRosterStatus');
  const reviewEl = document.getElementById('masterRosterReview');
  reviewEl.style.display = 'none'; reviewEl.innerHTML = '';
  statusEl.innerHTML = '⏳ جارٍ قراءة الملف وتحليله...';
  evt.target.value = '';

  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const root = getRootDB();

    const unmatchedSheets = [];
    const stagePlans = [];
    const parsedByStage = new Map();

    wb.SheetNames.forEach(sheetName => {
      const parsedName = parseMasterRosterSheetName(sheetName);
      if (!parsedName) { unmatchedSheets.push({ sheetName, reason: 'اسم الشيت لا ينتهي بـ"عربى" أو "لغات"' }); return; }
      const stage = root.stages.find(s => s.name === parsedName.stageName && s.section === parsedName.section);
      if (!stage) {
        unmatchedSheets.push({ sheetName, reason: `لا توجد مرحلة باسم "${parsedName.stageName}" وقسم ${parsedName.section === 'arabic' ? 'عربي' : 'لغات'} — أنشئها أولاً من "إدارة المراحل" أو صحّح اسم الشيت` });
        return;
      }
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) { unmatchedSheets.push({ sheetName, reason: 'الشيت فارغ' }); return; }

      const newRoster = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.every(c => String(c).trim() === '')) continue;
        const nationalId = String(row[2] !== undefined ? row[2] : '').trim().replace(/[^0-9]/g, '');
        const name = String(row[3] !== undefined ? row[3] : '').trim();
        const grade = String(row[4] !== undefined ? row[4] : '').trim();
        const seat = String(row[1] !== undefined ? row[1] : '').trim();
        if (!nationalId || !name) continue;
        const gender = genderFromNationalId(nationalId) || 'M';
        const secondLanguage = row[7] !== undefined ? String(row[7]).trim() : '';
        const track = row[8] !== undefined ? String(row[8]).trim() : '';
        newRoster.push({ nationalId, name, grade, seat, gender, secondLanguage, section: track });
      }
      parsedByStage.set(stage.id, { stage, newRoster });
    });

    parsedByStage.forEach(({ stage, newRoster }) => {
      const currentStudents = (stage.data && stage.data.students) || [];
      const currentByNid = new Map();
      currentStudents.forEach(s => { if (s.nationalId) currentByNid.set(s.nationalId, s); });
      const newByNid = new Map();
      newRoster.forEach(s => newByNid.set(s.nationalId, s));

      const added = [], removed = [], changed = [];
      newRoster.forEach(ns => {
        const cur = currentByNid.get(ns.nationalId);
        if (!cur) { added.push(ns); return; }
        if ((cur.name || '').trim() !== ns.name.trim() || (cur.grade || '') !== (ns.grade || '')) {
          changed.push({ nationalId: ns.nationalId, oldName: cur.name, newName: ns.name, oldGrade: cur.grade, newGrade: ns.grade });
        }
      });
      currentStudents.forEach(cs => { if (cs.nationalId && !newByNid.has(cs.nationalId)) removed.push(cs); });

      stagePlans.push({
        stageId: stage.id, stageName: stage.name, sectionLabel: stage.section === 'arabic' ? 'عربي' : 'لغات',
        newRoster, added, removed, changed, transfers: [], transfersIn: [],
      });
    });

    // كشف النقل الداخلي: رقم قومي "محذوف" من مرحلة و"مضاف" لمرحلة أخرى في نفس الرفعة معاً
    const addedIndex = new Map();
    stagePlans.forEach((plan, pi) => plan.added.forEach(item => addedIndex.set(item.nationalId, { pi, item })));
    stagePlans.forEach((plan, pi) => {
      plan.removed = plan.removed.filter(rs => {
        const match = addedIndex.get(rs.nationalId);
        if (match && match.pi !== pi) {
          plan.transfers.push({ nationalId: rs.nationalId, name: rs.name, toStage: stagePlans[match.pi].stageName + ' - ' + stagePlans[match.pi].sectionLabel });
          stagePlans[match.pi].added = stagePlans[match.pi].added.filter(a => a.nationalId !== rs.nationalId);
          stagePlans[match.pi].transfersIn.push({ nationalId: rs.nationalId, name: match.item.name, fromStage: plan.stageName + ' - ' + plan.sectionLabel });
          return false;
        }
        return true;
      });
    });

    masterRosterPendingPlan = { stagePlans, unmatchedSheets };
    renderMasterRosterReview(masterRosterPendingPlan);
    statusEl.innerHTML = '✅ تم تحليل الملف. راجع كل التغييرات بالأسفل بعناية قبل التأكيد.';
  } catch (err) {
    console.error('master roster parse error:', err);
    statusEl.innerHTML = '❌ تعذّر قراءة الملف: ' + (err && err.message ? err.message : 'خطأ غير معروف');
  }
}

function renderMasterRosterReview(plan) {
  const el = document.getElementById('masterRosterReview');
  let html = '';

  if (plan.unmatchedSheets.length) {
    html += `<div class="error-box mb-16">🚫 شيتات لم يتم التعرف عليها ولن يتم التعامل معها إطلاقاً:<br>` +
      plan.unmatchedSheets.map(u => `• "${escHtml(u.sheetName)}" — ${escHtml(u.reason)}`).join('<br>') + `</div>`;
  }

  let totalChanges = 0;
  plan.stagePlans.forEach(sp => {
    totalChanges += sp.added.length + sp.removed.length + sp.transfers.length + sp.transfersIn.length + sp.changed.length;
    if (!sp.added.length && !sp.removed.length && !sp.transfers.length && !sp.transfersIn.length && !sp.changed.length) return;

    html += `<div class="card" style="background:#f8fafc; margin-bottom:12px;"><h3 style="margin-bottom:8px;">${escHtml(sp.stageName)} — ${sp.sectionLabel}</h3>`;
    if (sp.added.length) html += `<div style="color:#15803d; margin-bottom:6px;">➕ إضافة (${sp.added.length}): ${sp.added.slice(0, 20).map(s => escHtml(s.name)).join('، ')}${sp.added.length > 20 ? ' ...' : ''}</div>`;
    if (sp.removed.length) html += `<div style="color:#b91c1c; margin-bottom:6px;">➖ حذف نهائي مع كل درجاته المرصودة (${sp.removed.length}): ${sp.removed.slice(0, 20).map(s => escHtml(s.name)).join('، ')}${sp.removed.length > 20 ? ' ...' : ''}</div>`;
    if (sp.transfers.length) html += `<div style="color:#7c3aed; margin-bottom:6px;">🔄 نقل خارج هذه المرحلة (${sp.transfers.length}): ${sp.transfers.map(t => `${escHtml(t.name)} ← إلى ${escHtml(t.toStage)}`).join('، ')}</div>`;
    if (sp.transfersIn.length) html += `<div style="color:#7c3aed; margin-bottom:6px;">🔄 نقل داخل من مرحلة أخرى (${sp.transfersIn.length}): ${sp.transfersIn.map(t => `${escHtml(t.name)} ← من ${escHtml(t.fromStage)}`).join('، ')}</div>`;
    if (sp.changed.length) html += `<div style="color:#b45309; margin-bottom:6px;">✏️ تعديل بيانات (${sp.changed.length}): ${sp.changed.slice(0, 20).map(c => `${escHtml(c.oldName)}${c.oldName !== c.newName ? ' → ' + escHtml(c.newName) : ''}${c.oldGrade !== c.newGrade ? ' (الصف: ' + escHtml(c.oldGrade || '-') + ' ← ' + escHtml(c.newGrade || '-') + ')' : ''}`).join('، ')}${sp.changed.length > 20 ? ' ...' : ''}</div>`;
    html += `</div>`;
  });

  if (!totalChanges) {
    html += `<div class="warning-box">لا يوجد أي فرق بين الملف والبيانات الحالية في المراحل المطابقة.</div>`;
  } else {
    html += `<div class="flex gap-12 mt-16">
      <button class="btn btn-primary" data-action="applyMasterRosterPlan" data-args='${gspArgs([])}'>✅ تأكيد وتنفيذ كل التغييرات أعلاه</button>
      <button class="btn btn-outline" data-action="cancelMasterRosterPlan" data-args='${gspArgs([])}'>❌ إلغاء</button>
    </div>`;
  }
  el.innerHTML = html;
  el.style.display = 'block';
}

function cancelMasterRosterPlan() {
  masterRosterPendingPlan = null;
  document.getElementById('masterRosterReview').style.display = 'none';
  document.getElementById('masterRosterReview').innerHTML = '';
  document.getElementById('masterRosterStatus').innerHTML = 'تم الإلغاء، لم يتم تنفيذ أي تغيير.';
}

async function applyMasterRosterPlan() {
  if (!masterRosterPendingPlan) return;
  if (!(await showConfirm('⚠️ سيتم تنفيذ كل الإضافات/الحذوفات/التعديلات المعروضة الآن فعلياً على قاعدة بيانات المراحل، بما في ذلك حذف درجات الطلاب المنسحبين نهائياً. هل أنت متأكد؟'))) return;

  const root = getRootDB();
  masterRosterPendingPlan.stagePlans.forEach(sp => {
    const stage = root.stages.find(s => s.id === sp.stageId);
    if (!stage) return;
    if (!stage.data.students) stage.data.students = [];
    if (!stage.data.grades) stage.data.grades = [];

    const byNid = new Map();
    stage.data.students.forEach(s => { if (s.nationalId) byNid.set(s.nationalId, s); });

    sp.changed.forEach(c => {
      const s = byNid.get(c.nationalId);
      if (!s) return;
      const oldId = s.id;
      s.name = c.newName; s.grade = c.newGrade;
      const newId = (s.section || '') + '::' + (s.grade || '') + '::' + s.nationalId;
      if (newId !== oldId) {
        s.id = newId;
        stage.data.grades.forEach(g => { if (g.studentId === oldId) g.studentId = newId; });
      }
    });

    const incoming = [...sp.added, ...sp.transfersIn.map(t => sp.newRoster.find(n => n.nationalId === t.nationalId)).filter(Boolean)];
    incoming.forEach(ns => {
      if (byNid.has(ns.nationalId)) return;
      const studentId = (ns.section || '') + '::' + (ns.grade || '') + '::' + ns.nationalId;
      stage.data.students.push({
        id: studentId, nationalId: ns.nationalId, seat: ns.seat, name: ns.name, gender: ns.gender,
        class: 'عام', grade: ns.grade || '', section: ns.section || '', secondLanguage: ns.secondLanguage || '',
      });
    });

    const removedIds = new Set(sp.removed.map(s => s.nationalId));
    if (removedIds.size) {
      const removedStudentIds = new Set(stage.data.students.filter(s => removedIds.has(s.nationalId)).map(s => s.id));
      stage.data.students = stage.data.students.filter(s => !removedIds.has(s.nationalId));
      stage.data.grades = stage.data.grades.filter(g => !removedStudentIds.has(g.studentId));
    }

    // نقل خارج المرحلة: يُحذف من هنا فقط دون مسّ درجاته (تبقى محفوظة تاريخياً في حال احتيج
    // الرجوع إليها)، وسجله الجديد أُضيف بالفعل في المرحلة الهدف عبر transfersIn أعلاه.
    const transferOutIds = new Set(sp.transfers.map(t => t.nationalId));
    if (transferOutIds.size) stage.data.students = stage.data.students.filter(s => !transferOutIds.has(s.nationalId));

    // القائمة الرسمية المعتمدة لهذه المرحلة بعد التحديث — تُستخدم لاحقاً لفحص أي طالب يُضاف عبر
    // رفع ملف درجات برقم قومي غير معروف بها (زر "فحص تعارضات الرقم القومي" بالأسفل).
    stage.data.officialRosterNids = sp.newRoster.map(n => n.nationalId);
  });

  saveRootDB(root);
  masterRosterPendingPlan = null;
  document.getElementById('masterRosterReview').style.display = 'none';
  document.getElementById('masterRosterReview').innerHTML = '';
  document.getElementById('masterRosterStatus').innerHTML = '✅ تم تنفيذ كل التغييرات بنجاح.';
  try { loadStudentsUI(); } catch (e) {}
  renderMasterStudentSearch(document.getElementById('masterStudentSearchInput') ? document.getElementById('masterStudentSearchInput').value : '');
}

// يفحص كل طالب حالي في كل مرحلة لها قائمة رسمية معتمدة (officialRosterNids)، ويعلّم بعلامة
// تعارض أي طالب رقمه القومي غير موجود بها (غالباً وصل عبر رفع ملف درجات ولم يُراجَع بعد مقابل
// القاعدة الرسمية) — يُستخدم بعد كل جولة رفع درجات جديدة لاكتشاف أرقام قومية خاطئة أو غير معروفة.
function scanRosterConflicts() {
  const root = getRootDB();
  let flaggedCount = 0, clearedCount = 0, scannedStages = 0;
  root.stages.forEach(stage => {
    if (!stage.data || !Array.isArray(stage.data.officialRosterNids)) return;
    scannedStages++;
    const officialSet = new Set(stage.data.officialRosterNids);
    (stage.data.students || []).forEach(s => {
      const shouldFlag = !s.nationalId || !officialSet.has(s.nationalId);
      if (shouldFlag && !s.conflictFlag) { s.conflictFlag = 'رقم قومي غير موجود في القاعدة الرسمية المعتمدة'; flaggedCount++; }
      else if (!shouldFlag && s.conflictFlag) { delete s.conflictFlag; clearedCount++; }
    });
  });
  if (!scannedStages) { alert('لا توجد أي مرحلة تم رفع قاعدة بيانات رسمية لها بعد. ارفع ملف القاعدة أولاً.'); return; }
  saveRootDB(root);
  alert(`✅ تم الفحص: ${flaggedCount} طالب جديد عليه علامة تعارض، و${clearedCount} تم إلغاء علامته بعد أن أصبح مطابقاً للقاعدة.`);
  renderMasterStudentSearch(document.getElementById('masterStudentSearchInput') ? document.getElementById('masterStudentSearchInput').value : '');
}

function findAllStudentsFlat() {
  const root = getRootDB();
  const list = [];
  root.stages.forEach(stage => {
    (stage.data.students || []).forEach(s => list.push({ stageId: stage.id, stageLabel: stageDisplayLabel(stage), student: s }));
  });
  return list;
}

function renderMasterStudentSearch(query) {
  const body = document.getElementById('masterStudentSearchBody');
  if (!body) return;
  const q = String(query || '').trim();
  const qDigits = q.replace(/[^0-9]/g, '');
  const qText = q.toLowerCase();
  let list = findAllStudentsFlat();
  if (q) {
    list = list.filter(({ student: s }) => {
      const nidMatch = qDigits && s.nationalId && s.nationalId.includes(qDigits);
      const nameMatch = qText && s.name && s.name.toLowerCase().includes(qText);
      return nidMatch || nameMatch;
    });
  } else {
    list = list.filter(({ student: s }) => s.conflictFlag); // بدون بحث: اعرض التعارضات فقط افتراضياً
  }
  const shown = list.slice(0, 50);
  if (!shown.length) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:16px;">${q ? 'لا يوجد طالب مطابق' : 'لا توجد تعارضات حالياً — اكتب في مربع البحث لعرض أي طالب'}</td></tr>`;
    return;
  }
  body.innerHTML = shown.map(({ stageId, stageLabel, student: s }) => `
    <tr>
      <td dir="ltr">${escHtml(s.nationalId || '—')}</td>
      <td>${escHtml(s.name)}</td>
      <td>${escHtml(s.grade || '—')}</td>
      <td>${escHtml(stageLabel)}</td>
      <td>${s.conflictFlag ? '<span style="color:#b91c1c; font-weight:700;">⚠️ ' + escHtml(s.conflictFlag) + '</span>' : '—'}</td>
      <td><button class="btn btn-outline btn-sm" data-action="openMasterEditStudentModal" data-args='${gspArgs(['stageId','s.id'])}'>✏️ تعديل</button></td>
    </tr>`).join('');
}

async function openMasterEditStudentModal(stageId, studentId) {
  const root = getRootDB();
  const stage = root.stages.find(s => s.id === stageId);
  if (!stage) return;
  const s = (stage.data.students || []).find(x => x.id === studentId);
  if (!s) { alert('تعذّر العثور على الطالب'); return; }

  const newName = await showPrompt('اسم الطالب:', s.name);
  if (newName === null) return;
  const newNidRaw = await showPrompt('الرقم القومي (14 رقم):', s.nationalId || '');
  if (newNidRaw === null) return;
  const cleanNid = String(newNidRaw).trim().replace(/[^0-9]/g, '');
  if (cleanNid.length !== 14) { alert('⚠️ الرقم القومي يجب أن يكون 14 رقماً بالضبط — لم يتم الحفظ'); return; }
  const newGrade = await showPrompt('الصف:', s.grade || '');
  if (newGrade === null) return;

  if (cleanNid !== s.nationalId) {
    const collision = (stage.data.students || []).find(x => x.id !== s.id && x.nationalId === cleanNid);
    if (collision) {
      alert(`⚠️ تعذّر الحفظ: الرقم القومي "${cleanNid}" مسجَّل بالفعل لطالب آخر ("${collision.name}") في نفس المرحلة. راجع الحالتين يدوياً أولاً.`);
      return;
    }
  }

  const oldId = s.id;
  s.name = newName.trim();
  s.nationalId = cleanNid;
  s.grade = newGrade.trim();
  const newId = (s.section || '') + '::' + (s.grade || '') + '::' + s.nationalId;
  if (newId !== oldId) {
    s.id = newId;
    (stage.data.grades || []).forEach(g => { if (g.studentId === oldId) g.studentId = newId; });
  }
  delete s.conflictFlag;

  saveRootDB(root);
  alert('✅ تم حفظ التعديلات بنجاح');
  try { loadStudentsUI(); } catch (e) {}
  renderMasterStudentSearch(document.getElementById('masterStudentSearchInput').value);
}

// ============================================================
//  STAGES MANAGEMENT (رئيس الكنترول فقط)
// ============================================================


// ============================================================
//  STUDENTS TAB
// ============================================================
function loadStudentsUI() {
  const db = loadDB();
  const tbody = document.getElementById('studentsTableBody');
  const datalist = document.getElementById('secondLangDatalist');
  if (datalist) {
    const seen = new Map();
    (db.students || []).forEach(s => { const v = (s.secondLanguage || '').trim();
      if (!v) return;
      const key = normalizeArabicText(v);
      if (!seen.has(key)) seen.set(key, v); });
    datalist.innerHTML = Array.from(seen.values()).sort().map(v => `<option value="${escapeHtml(v)}">`).join('');
  }
  const filterClass = document.getElementById('studentClassFilter').value;
  const filterGender = document.getElementById('studentGenderFilter').value;
  const search = document.getElementById('studentSearch').value.trim().toLowerCase();

  let filtered = db.students;
  if (currentRole === 'teacher' && currentTeacher) { const tClasses = teacherAllClasses(currentTeacher);
    filtered = filtered.filter(s => tClasses.includes(classSectionKey(s.class, s.section))); }
  if (filterClass) filtered = filtered.filter(s => classSectionKey(s.class, s.section) === filterClass);
  if (filterGender) filtered = filtered.filter(s => s.gender === filterGender);
  if (search) filtered = filtered.filter(s =>
    s.name.toLowerCase().includes(search) ||
    (s.seat || '').includes(search) ||
    (canViewNationalId() && (s.nationalId || '').includes(search))
  );

  const canEdit = currentRole === 'admin';
  const canOpenCard = (currentRole === 'admin' || currentRole === 'viewer' || currentRole === 'teacher') && typeof v20OpenStudent === 'function';
  const showNid = canViewNationalId();
  // تحديث رأس الجدول حسب صلاحية الرقم القومي
  try {
    const theadRow = document.querySelector('#tab-students thead tr');
    if (theadRow) {
      theadRow.innerHTML = showNid
        ? '<th>#</th><th>الرقم القومي</th><th>رقم الجلوس</th><th>اسم الطالب</th><th>النوع</th><th>الفصل</th><th>اللغة الثانية</th>'
        : '<th>#</th><th>رقم الجلوس</th><th>اسم الطالب</th><th>النوع</th><th>الفصل</th><th>اللغة الثانية</th>';
    }
    const searchInp = document.getElementById('studentSearch');
    if (searchInp) {
      searchInp.placeholder = showNid
        ? '🔍 بحث بالاسم أو رقم الجلوس أو الرقم القومي...'
        : '🔍 بحث بالاسم أو رقم الجلوس...';
    }
  } catch (e) {}
  tbody.innerHTML = '';
  filtered.forEach((s, idx) => {
    const row = document.createElement('tr');
    const genderLabel = s.gender === 'F' ? 'أنثى' : 'ذكر';
    const badgeClass = s.gender === 'F' ? 'badge-f' : 'badge-m';
    const classOptionsForStudent = db.classes
      .filter(c => splitClassSectionKey(c).section === s.section)
      .map(c => splitClassSectionKey(c).cls);
    if (!classOptionsForStudent.includes(s.class)) classOptionsForStudent.push(s.class);
    const classCell = canEdit
      ? `<select data-event-type="change" data-event-action="updateStudentField" data-event-static='${gspArgs([s.id,"class"])}' data-event-arg="value" style="padding:3px 5px; border:1px solid #cbd5e1; border-radius:4px;">
          ${classOptionsForStudent.map(c => `<option value="${escapeHtml(c)}" ${c === s.class ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
         </select>`
      : `${escapeHtml(s.class)}`;
    const langDotColor = getLangColor(s.secondLanguage).bg;
    const secondLangCell = canEdit
      ? `<div class="flex items-center gap-12" style="gap:6px;">
          <span style="width:10px; height:10px; border-radius:50%; flex-shrink:0; background:${langDotColor}; border:1px solid #94a3b8;"></span>
          <input type="text" list="secondLangDatalist" value="${escapeHtml(s.secondLanguage || '')}"
            data-event-type="change" data-event-action="updateStudentField" data-event-static='${gspArgs([s.id,"secondLanguage"])}' data-event-arg="value"
            placeholder="-" style="width:120px; padding:3px 5px; border:1px solid #cbd5e1; border-radius:4px;" />
         </div>`
      : (s.secondLanguage ? langBadgeHtml(s.secondLanguage) : '-');
    const nameCell = canOpenCard
      ? `<a href="javascript:void(0)" data-action="v20OpenStudent" data-args='${gspArgs([escapeHtml(JSON.stringify(s.id))])}' title="عرض بطاقة الطالب: الدرجات ونسبة الحضور" style="color:#1e3a5f; font-weight:700; text-decoration:underline; cursor:pointer;">${escapeHtml(s.name)}</a>`
      : escapeHtml(s.name);
    const nidCell = showNid ? `<td>${escapeHtml(s.nationalId || '-')}</td>` : '';
    row.innerHTML = `
      <td>${idx + 1}</td>
      ${nidCell}
      <td><strong>${escapeHtml(s.seat)}</strong></td>
      <td>${nameCell}</td>
      <td><span class="badge ${badgeClass}">${genderLabel}</span></td>
      <td>${classCell}</td>
      <td>${secondLangCell}</td>
    `;
    tbody.appendChild(row);
  });
  document.getElementById('studentsCount').textContent = `إجمالي: ${filtered.length} طالب` +
    (canEdit ? ' - يمكنك تعديل الفصل واللغة الثانية مباشرة من الجدول' : '') +
    (canOpenCard ? ' - اضغط على اسم الطالب لعرض بطاقته' : '');
}

function updateStudentField(id, field, value) {
  if (currentRole !== 'admin') return;
  const db = loadDB();
  const student = db.students.find(s => s.id === id);
  if (!student) return;
  student[field] = value;
  saveDB(db);
  loadStudentsUI();
  updateFilters();
  if (typeof loadStatsUI === 'function') loadStatsUI();
}

function filterStudents() { loadStudentsUI(); }

// ============================================================

// window exports
GSP.parseMasterRosterSheetName = parseMasterRosterSheetName;
GSP.handleMasterRosterFile = handleMasterRosterFile;
GSP.renderMasterRosterReview = renderMasterRosterReview;
GSP.cancelMasterRosterPlan = cancelMasterRosterPlan;
GSP.applyMasterRosterPlan = applyMasterRosterPlan;
GSP.scanRosterConflicts = scanRosterConflicts;
GSP.findAllStudentsFlat = findAllStudentsFlat;
GSP.renderMasterStudentSearch = renderMasterStudentSearch;
GSP.openMasterEditStudentModal = openMasterEditStudentModal;
GSP.loadStudentsUI = loadStudentsUI;
GSP.updateStudentField = updateStudentField;
GSP.filterStudents = filterStudents;

try {
  Object.defineProperty(window,'masterRosterPendingPlan',{get:function(){return masterRosterPendingPlan;},set:function(v){masterRosterPendingPlan=v;},configurable:true});
} catch (e) {
  // Already defined — ignore
}
