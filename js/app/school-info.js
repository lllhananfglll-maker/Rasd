/**
 * js/app/school-info.js — الجزء 7/9 من app.js السابق (بعد التقسيم لتحسين قابلية الصيانة)
 * المحتوى: بيانات المدرسة/المرحلة
 * يعتمد على: نفس النطاق المشترك (window/global scope) الذي كان عليه app.js — يجب تحميله
 * بنفس ترتيب الأجزاء كما في index.html، لأن بعض الدوال هنا تُستدعى من دوال معرّفة في أجزاء لاحقة.
 */
'use strict';

    //  SCHOOL INFO
    // ============================================================
    const STAGE_TYPE_LABELS = { kg: 'رياض أطفال', primary: 'ابتدائي', prep: 'إعدادى', secondary: 'ثانوي' };
    const CLASS_LANG_LABELS = { arabic: 'عربي', languages: 'لغات' };
    // الاسم الرسمي للكيان (مرحلة + قسم) كما في المراحل الثمانية الثابتة
    function stageEntityLabelFromParts(stageType, section) {
      const t = STAGE_TYPE_LABELS[stageType] || '';
      const s = CLASS_LANG_LABELS[section] || '';
      if (t && s) return t + ' ' + s;
      return t || s || '';
    }
    function getActiveStageEntityLabel() {
      try {
        if (typeof currentStageId !== 'undefined' && currentStageId && typeof getStageRecord === 'function') {
          const st = getStageRecord(currentStageId);
          if (st) {
            if (typeof stageDisplayLabel === 'function') return stageDisplayLabel(st);
            if (st.name) return st.name;
          }
        }
        const db = typeof loadDB === 'function' ? loadDB() : null;
        const info = (db && db.schoolInfo) || {};
        return stageEntityLabelFromParts(info.stageType, info.classLanguage);
      } catch (e) { return ''; }
    }
    function formatClassSectionForPrint(classGradeLabel, clsSection, clsPlain) {
      const stageLbl = getActiveStageEntityLabel();
      const sec = clsSection ? (CLASS_LANG_LABELS[clsSection] || '') : '';
      // إن وُجدت تسمية الكيان الثابت نستخدمها بدل تكرار «القسم العربي/لغات» بصيغة قديمة
      const gradePart = classGradeLabel ? escapeHtml(classGradeLabel) : '';
      const stagePart = stageLbl ? escapeHtml(stageLbl) : (sec ? escapeHtml(sec) : '');
      const classPart = clsPlain != null && clsPlain !== '' ? ('فصل/شعبة ' + toHindiDigits(clsPlain)) : '';
      const bits = [];
      if (stagePart) bits.push(stagePart);
      if (gradePart) bits.push(gradePart);
      if (classPart) bits.push(classPart);
      return bits.length ? bits.join(' — ') : (classPart || '');
    }

    // "نوع الصف" لم يعد له حقل إدخال يدوي في تبويب بيانات المدرسة (تم حذفه لأنه أصبح مكرَّراً مع
    // بيانات المرحلة نفسها)، فيُستنتَج تلقائياً من اسم المرحلة الحالية عبر مطابقة كلمات مفتاحية شائعة.
    // إن لم يُطابَق أي منها، تُحفَظ القيمة السابقة كما هي (بدل مسحها) حفاظاً على التوافق مع بيانات قديمة.
    function guessStageTypeFromName(name, previous) {
      const n = String(name || '');
      if (/روضة|تمهيدي|KG/i.test(n)) return 'kg';
      if (/ابتدائ/.test(n)) return 'primary';
      if (/اعداد|إعداد/.test(n)) return 'prep';
      if (/ثانو/.test(n)) return 'secondary';
      return previous || '';
    }

    // [إصلاح 2026-09-04] هذه الدالة كانت تُستدعى في saveSchoolInfo() أدناه بدون أن تكون معرَّفة
    // في أي مكان بالمشروع — أي حفظ لبيانات المدرسة مع تفعيل شهر ثالث + "حذف التقييم الشهري" كان
    // سيتسبب في ReferenceError فوري (عطل كامل لعملية الحفظ). تزيل مكوّنات الامتحان/التقييم الشهري
    // (isExamLikeComponent من core/grade-logic.js) من كل مواد المرحلة الحالية، وتُرجع عدد المكوّنات
    // المحذوفة. ملاحظة: لا تحذف أي درجات مُدخَلة فعلاً لهذه المكوّنات من db.grades - فقط تعريف
    // المكوّن نفسه من db.subjects؛ الدرجات القديمة تبقى "يتيمة" غير مرئية في واجهة الرصد (سلوك
    // متوافق مع باقي المشروع الذي لا يحذف سجلات الدرجات التاريخية تلقائياً عند تعديل تعريف مادة).
    function removeExamLikeComponentsFromDB(db) {
      let removed = 0;
      (db.subjects || []).forEach(subject => {
        const before = (subject.components || []).length;
        subject.components = (subject.components || []).filter(c => !isExamLikeComponent(c));
        removed += before - subject.components.length;
      });
      return removed;
    }

    function saveSchoolInfo() {
      const msg = document.getElementById('schoolInfoMsg');
      try {
        if (currentAccountType !== 'superadmin') {
          msg.textContent = '🔒 تعديل بيانات المدرسة متاح لرئيس الكنترول فقط.';
          msg.style.color = '#b91c1c';
          return;
        }
        if (!currentStageId) {
          msg.textContent = '⚠️ يرجى اختيار مرحلة دراسية أولاً قبل حفظ بيانات المدرسة';
          msg.style.color = '#b91c1c';
          return;
        }
        const db = loadDB();
        const prevInfo = db.schoolInfo || {};
        const root = getRootDB();
        const stageRec = root.stages.find(s => s.id === currentStageId);
        db.schoolInfo = {
          governorate: document.getElementById('siGovernorate').value,
          educationAdmin: document.getElementById('siEducationAdmin').value.trim(),
          schoolName: document.getElementById('siSchoolName').value.trim(),
          principalName: document.getElementById('siPrincipalName').value.trim(),
          academicYear: document.getElementById('siAcademicYear').value.trim(),
          term: document.getElementById('siTerm').value,
          grade: prevInfo.grade || '',
          stageType: guessStageTypeFromName(stageRec && stageRec.name, prevInfo.stageType),
          classLanguage: (stageRec && stageRec.section) || prevInfo.classLanguage || '',
          recordingPeriods: (function() {
            const draft = (typeof ensureSiPeriodsDraft === 'function') ? ensureSiPeriodsDraft() : (GSP._siPeriodsDraft || null);
            if (draft) {
              return {
                first: (draft.first || []).map(p => {
                  const ex = normalizeExcludedWeeks(p);
                  return {
                    id: p.id, name: (p.name || '').trim(),
                    weeks: Math.max(0, 4 - ex.length),
                    excludedWeeks: ex,
                    week1: p.week1 || '', hasExam: !!p.hasExam, holidays: p.holidays || '', enabled: p.enabled !== false
                  };
                }),
                second: (draft.second || []).map(p => {
                  const ex = normalizeExcludedWeeks(p);
                  return {
                    id: p.id, name: (p.name || '').trim(),
                    weeks: Math.max(0, 4 - ex.length),
                    excludedWeeks: ex,
                    week1: p.week1 || '', hasExam: !!p.hasExam, holidays: p.holidays || '', enabled: p.enabled !== false
                  };
                })
              };
            }
            return (typeof defaultRecordingPeriods === 'function') ? defaultRecordingPeriods() : { first: [], second: [] };
          })(),
          months: (function() {
            const draft = GSP._siPeriodsDraft || { first: [], second: [] };
            return periodsToMonthsAndWeek1(draft).months;
          })(),
          week1Dates: (function() {
            const draft = GSP._siPeriodsDraft || { first: [], second: [] };
            return periodsToMonthsAndWeek1(draft).week1Dates;
          })()
        };

        // عند تفعيل شهر ثالث مع اختيار «حذف التقييم الشهري»: إزالة مكوّنات الامتحان من مواد هذه المرحلة
        let examRemoved = 0;
        const wantRemoveF = document.getElementById('siMonthF3Enabled').checked && document.getElementById('siRemoveExamF3') && document.getElementById('siRemoveExamF3').checked;
        const wantRemoveS = document.getElementById('siMonthS3Enabled').checked && document.getElementById('siRemoveExamS3') && document.getElementById('siRemoveExamS3').checked;
        if (wantRemoveF || wantRemoveS) {
          examRemoved = removeExamLikeComponentsFromDB(db);
          try {
            document.getElementById('siRemoveExamF3').checked = false;
            document.getElementById('siRemoveExamS3').checked = false;
          } catch (e) {}
        }

        saveDB(db);
        if (examRemoved > 0) {
          try { loadSubjectsUI(); } catch (e) {}
          try { if (typeof loadGradesUI === 'function') loadGradesUI(); } catch (e) {}
        }

        // تطبيق الحقول المشتركة (تواريخ الأسبوع الأول + أسماء الشهور + بيانات المدرسة العامة)
        // على كل المراحل دفعة واحدة حتى لا تظهر رسالة «لم يُحدَّد تاريخ الأسبوع الأول» في مرحلة أخرى.
        // توحيد ضبط الفترات + الأسماء + التواريخ + بيانات المدرسة على كل المراحل
        const shared = {
          governorate: db.schoolInfo.governorate,
          educationAdmin: db.schoolInfo.educationAdmin,
          schoolName: db.schoolInfo.schoolName,
          principalName: db.schoolInfo.principalName,
          academicYear: db.schoolInfo.academicYear,
          months: db.schoolInfo.months,
          week1Dates: db.schoolInfo.week1Dates,
          recordingPeriods: db.schoolInfo.recordingPeriods
        };
        let propagated = 0;
        (root.stages || []).forEach(st => {
          if (!st || st.id === currentStageId) return;
          if (!st.data) st.data = emptyStageData();
          const prev = st.data.schoolInfo || {};
          st.data.schoolInfo = Object.assign({}, prev, shared, {
            grade: prev.grade || '',
            stageType: prev.stageType || guessStageTypeFromName(st.name, prev.stageType),
            classLanguage: st.section || prev.classLanguage || '',
            term: prev.term || db.schoolInfo.term
          });
          propagated++;
        });
        if (propagated) persistRootDB(root);
        if (typeof scheduleCloudPush === 'function') scheduleCloudPush();

        msg.textContent = (propagated
          ? ('✅ تم حفظ بيانات المدرسة وضبط الفترات على جميع المراحل (' + (propagated + 1) + ' مرحلة) — توحيد الطباعة والرصد')
          : '✅ تم حفظ بيانات المدرسة وضبط الفترات بنجاح') + (examRemoved ? (' — تم حذف ' + examRemoved + ' مكوّن تقييم شهري/امتحان من المواد') : '');
        msg.style.color = '#0b5e42';
        updateSchoolInfoDisplay();
        populateMonthSelects();
        renderMonthlyExportButtons();
      } catch (e) {
        console.error('saveSchoolInfo error:', e);
        msg.textContent = '❌ حدث خطأ أثناء الحفظ: ' + e.message;
        msg.style.color = '#b91c1c';
      }
    }

    function defaultRecordingPeriods() {
      return {
        first: [
          { id: 'f1', name: 'سبتمبر', weeks: 2, excludedWeeks: [3, 4], week1: '', hasExam: false, holidays: '', enabled: true },
          { id: 'f2', name: 'أكتوبر', weeks: 4, excludedWeeks: [], week1: '', hasExam: true, holidays: '', enabled: true },
          { id: 'f3', name: 'نوفمبر', weeks: 4, excludedWeeks: [], week1: '', hasExam: true, holidays: '', enabled: true },
          { id: 'f4', name: 'ديسمبر', weeks: 4, excludedWeeks: [], week1: '', hasExam: false, holidays: '', enabled: true }
        ],
        second: [
          { id: 's1', name: 'فبراير', weeks: 3, excludedWeeks: [4], week1: '', hasExam: false, holidays: '', enabled: true },
          { id: 's2', name: 'مارس', weeks: 4, excludedWeeks: [], week1: '', hasExam: true, holidays: '', enabled: true },
          { id: 's3', name: 'أبريل', weeks: 4, excludedWeeks: [], week1: '', hasExam: true, holidays: '', enabled: true },
          { id: 's4', name: 'مايو', weeks: 2, excludedWeeks: [3, 4], week1: '', hasExam: false, holidays: '', enabled: true }
        ]
      };
    }

    function normalizeExcludedWeeks(p) {
      if (!p) return [];
      let ex = p.excludedWeeks;
      if (!Array.isArray(ex)) {
        const w = parseInt(p.weeks, 10);
        if (w >= 1 && w < 4) {
          ex = [];
          for (let i = w + 1; i <= 4; i++) ex.push(i);
        } else {
          ex = [];
        }
      }
      return ex.map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 4)
        .filter((n, i, a) => a.indexOf(n) === i).sort((a, b) => a - b);
    }

    function isWeekExcluded(term, monthIndex0, weekIndex0) {
      try {
        const p = getRecordingPeriod(term, monthIndex0);
        return normalizeExcludedWeeks(p).indexOf(weekIndex0 + 1) >= 0;
      } catch (e) { return false; }
    }

    function migrateMonthsToPeriods(info) {
      const d = defaultRecordingPeriods();
      if (!info) return d;
      if (info.recordingPeriods && (info.recordingPeriods.first || info.recordingPeriods.second)) {
        const out = { first: [], second: [] };
        ['first', 'second'].forEach(term => {
          const arr = info.recordingPeriods[term];
          if (Array.isArray(arr) && arr.length) {
            out[term] = arr.map((p, i) => {
              const base = {
                id: p.id || (term[0] + (i + 1)),
                name: (p.name || '').trim() || ('الفترة ' + (i + 1)),
                weeks: Math.max(1, Math.min(4, parseInt(p.weeks, 10) || 4)),
                week1: p.week1 || '',
                hasExam: !!p.hasExam,
                holidays: typeof p.holidays === 'string' ? p.holidays : (Array.isArray(p.holidays) ? p.holidays.join('\n') : ''),
                enabled: p.enabled !== false,
                excludedWeeks: Array.isArray(p.excludedWeeks) ? p.excludedWeeks.slice() : undefined
              };
              base.excludedWeeks = normalizeExcludedWeeks(base);
              base.weeks = Math.max(0, 4 - base.excludedWeeks.length);
              return base;
            });
          } else out[term] = JSON.parse(JSON.stringify(d[term]));
        });
        return out;
      }
      const months = info.months || {};
      const w1 = info.week1Dates || {};
      ['first', 'second'].forEach(term => {
        const names = months[term] || [];
        const dates = w1[term] || [];
        if (names.length) {
          d[term] = names.map((name, i) => ({
            id: term[0] + (i + 1),
            name: name || ('الشهر ' + (i + 1)),
            weeks: 4,
            week1: dates[i] || '',
            hasExam: i < 2,
            holidays: '',
            enabled: true
          }));
        }
      });
      return d;
    }

    function getRecordingPeriods(term) {
      const db = loadDB();
      const all = migrateMonthsToPeriods(db.schoolInfo || {});
      const list = (all[term] || []).filter(p => p && p.enabled !== false);
      return list.length ? list : (defaultRecordingPeriods()[term] || []);
    }

    function getRecordingPeriod(term, monthIndex0) {
      return getRecordingPeriods(term)[monthIndex0] || null;
    }

    function periodsToMonthsAndWeek1(periodsMap) {
      const months = { first: [], second: [] };
      const week1Dates = { first: [], second: [] };
      ['first', 'second'].forEach(term => {
        (periodsMap[term] || []).filter(p => p && p.enabled !== false).forEach(p => {
          months[term].push((p.name || '').trim() || 'فترة');
          week1Dates[term].push(p.week1 || '');
        });
      });
      if (!months.first.length) months.first = ['الشهر الأول', 'الشهر الثاني'];
      if (!months.second.length) months.second = ['الشهر الأول', 'الشهر الثاني'];
      return { months, week1Dates };
    }

    GSP._siPeriodsDraft = null;

    function ensureSiPeriodsDraft() {
      if (!GSP._siPeriodsDraft) {
        GSP._siPeriodsDraft = migrateMonthsToPeriods((loadDB().schoolInfo) || {});
      }
      return GSP._siPeriodsDraft;
    }

    function renderRecordingPeriodsEditor() {
      const box = document.getElementById('siPeriodsEditor');
      if (!box) return;
      const term = (document.getElementById('siPeriodsTerm') || {}).value || 'first';
      const draft = ensureSiPeriodsDraft();
      if (!draft[term]) draft[term] = [];
      const list = draft[term];
      const canEdit = currentAccountType === 'superadmin';
      if (!list.length) {
        box.innerHTML = '<div style="color:#94a3b8;font-size:13px">لا توجد فترات. اضغط «إضافة فترة رصد».</div>';
        return;
      }
      box.innerHTML = list.map((p, idx) => {
        const dis = canEdit ? '' : 'disabled';
        return `<div class="card" style="padding:12px;border:1px solid #e2e8f0;background:#f8fafc">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong style="color:#1e3a5f">الفترة ${idx + 1}</strong>
            ${canEdit ? `<button type="button" class="btn btn-outline btn-sm" data-action="removeRecordingPeriod" data-args='${gspArgs([idx])}' style="color:#b91c1c">🗑️ حذف</button>` : ''}
          </div>
          <div class="grid-3">
            <div class="form-group">
              <label>اسم الفترة</label>
              <input type="text" ${dis} value="${escapeHtml(p.name || '')}" data-event-type="change" data-event-action="updateRecordingPeriodField" data-event-static='${gspArgs([idx,"name"])}' data-event-arg="value" placeholder="مثال: أكتوبر">
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label style="font-weight:700">أسابيع خارج الرصد (تُظلَّل في الكشوف وتُستبعد من الحساب)</label>
              <div style="display:flex;flex-wrap:wrap;gap:12px 18px;margin-top:6px">
                ${[1,2,3,4].map(n => {
                  const ex = normalizeExcludedWeeks(p);
                  const checked = ex.indexOf(n) >= 0 ? 'checked' : '';
                  return `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600">
                    <input type="checkbox" ${dis} ${checked} data-event-type="change" data-event-action="toggleExcludedWeek" data-event-static='${gspArgs([idx,n])}' data-event-arg="checked">
                    الأسبوع ${n}
                  </label>`;
                }).join('')}
              </div>
              <div style="font-size:12px;color:#64748b;margin-top:4px">اتركها فارغة إن كانت الأسابيع الأربعة كلها داخل الرصد. يمكن استبعاد أي أسبوع من البداية أو الوسط أو النهاية.</div>
            </div>
            <div class="form-group">
              <label>تاريخ بداية الأسبوع الأول</label>
              <input type="date" ${dis} value="${escapeHtml(p.week1 || '')}" data-event-type="change" data-event-action="updateRecordingPeriodField" data-event-static='${gspArgs([idx,"week1"])}' data-event-arg="value">
            </div>
            <div class="form-group" style="display:flex;align-items:center;gap:8px;padding-top:22px">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600">
                <input type="checkbox" ${dis} ${p.hasExam?'checked':''} data-event-type="change" data-event-action="updateRecordingPeriodField" data-event-static='${gspArgs([idx,"hasExam"])}' data-event-arg="checked">
                تنتهي بامتحان شهر؟
              </label>
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label>إجازات الفترة (تاريخ في كل سطر YYYY-MM-DD)</label>
              <textarea ${dis} rows="2" style="width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-size:13px"
                data-event-type="change" data-event-action="updateRecordingPeriodField" data-event-static='${gspArgs([idx,"holidays"])}' data-event-arg="value"
                placeholder="2026-10-06">${escapeHtml(p.holidays || '')}</textarea>
            </div>
          </div>
        </div>`;
      }).join('');
    }

    function updateRecordingPeriodField(idx, field, value) {
      const term = (document.getElementById('siPeriodsTerm') || {}).value || 'first';
      const draft = ensureSiPeriodsDraft();
      if (!draft[term] || !draft[term][idx]) return;
      if (field === 'weeks') value = Math.max(0, Math.min(4, parseInt(value, 10) || 4));
      draft[term][idx][field] = value;
    }

    function toggleExcludedWeek(idx, weekNum, checked) {
      const term = (document.getElementById('siPeriodsTerm') || {}).value || 'first';
      const draft = ensureSiPeriodsDraft();
      if (!draft[term] || !draft[term][idx]) return;
      let ex = normalizeExcludedWeeks(draft[term][idx]);
      const n = parseInt(weekNum, 10);
      if (checked) {
        if (ex.indexOf(n) < 0) ex.push(n);
      } else {
        ex = ex.filter(x => x !== n);
      }
      ex.sort((a, b) => a - b);
      draft[term][idx].excludedWeeks = ex;
      draft[term][idx].weeks = Math.max(0, 4 - ex.length);
    }

    function addRecordingPeriod() {
      if (currentAccountType !== 'superadmin') return;
      const term = (document.getElementById('siPeriodsTerm') || {}).value || 'first';
      const draft = ensureSiPeriodsDraft();
      if (!draft[term]) draft[term] = [];
      if (draft[term].length >= 8) { alert('الحد الأقصى 8 فترات لكل فصل.'); return; }
      draft[term].push({ id: term[0] + Date.now(), name: 'فترة ' + (draft[term].length + 1), weeks: 4, week1: '', hasExam: false, holidays: '', enabled: true });
      renderRecordingPeriodsEditor();
    }

    async function removeRecordingPeriod(idx) {
      if (currentAccountType !== 'superadmin') return;
      if (!(await showConfirm('حذف هذه الفترة من المسودة؟'))) return;
      const term = (document.getElementById('siPeriodsTerm') || {}).value || 'first';
      const draft = ensureSiPeriodsDraft();
      if (!draft[term]) return;
      draft[term].splice(idx, 1);
      renderRecordingPeriodsEditor();
    }

    async function resetRecordingPeriodsDefaults() {
      if (currentAccountType !== 'superadmin') return;
      if (!(await showConfirm('استعادة الفترات الافتراضية؟ لن تُحفظ حتى تضغط حفظ.'))) return;
      GSP._siPeriodsDraft = defaultRecordingPeriods();
      renderRecordingPeriodsEditor();
    }

    function getMonthLabels(term) {
      try {
        const periods = getRecordingPeriods(term);
        if (periods && periods.length) return periods.map(p => p.name || 'فترة');
      } catch (e) {}
      const db = loadDB();
      const months = db.schoolInfo && db.schoolInfo.months;
      if (months && months[term] && months[term].length) return months[term];
      return ['الشهر الأول', 'الشهر الثاني'];
    }

    function populateMonthSelects() {
      const pairs = {
        importMonthSelect: 'importTermSelect',
        gradeMonthSelect: 'gradeTermSelect'
      };
      Object.keys(pairs).forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const termEl = document.getElementById(pairs[id]);
        const term = termEl ? termEl.value : 'first';
        const labels = getMonthLabels(term);
        const curVal = sel.value;
        sel.innerHTML = labels.map((lbl, i) => `<option value="${i + 1}">${lbl}</option>`).join('');
        if (curVal && parseInt(curVal, 10) <= labels.length) sel.value = curVal;
      });
    }

    function toggleThirdMonth(term) {
      const wrapId = term === 'first' ? 'siMonthF3Wrap' : 'siMonthS3Wrap';
      const checkId = term === 'first' ? 'siMonthF3Enabled' : 'siMonthS3Enabled';
      const wrap = document.getElementById(wrapId);
      const checked = document.getElementById(checkId).checked;
      wrap.style.display = checked ? 'grid' : 'none';
    }

    function loadSchoolInfoFormUI() {
     try {
      const db = loadDB();
      const info = db.schoolInfo || {};
      document.getElementById('siGovernorate').value = info.governorate || '';
      document.getElementById('siEducationAdmin').value = info.educationAdmin || '';
      document.getElementById('siSchoolName').value = info.schoolName || '';
      document.getElementById('siPrincipalName').value = info.principalName || '';
      document.getElementById('siAcademicYear').value = info.academicYear || '';
      document.getElementById('siTerm').value = info.term || 'first';
      try {
        GSP._siPeriodsDraft = migrateMonthsToPeriods(info);
        const pt = document.getElementById('siPeriodsTerm');
        if (pt) pt.value = info.term === 'second' ? 'second' : 'first';
        renderRecordingPeriodsEditor();
      } catch (e) { console.warn('periods editor', e); }
      // تعديل بيانات المدرسة أصبح حصراً على رئيس الكنترول (بما أن حقلَي "نوع الصف" و"القسم"
      // صاراً يُستنتَجان تلقائياً من المرحلة الحالية، ولم يعد هناك داعٍ يُذكر لتعديل مدير المرحلة
      // لبقية البيانات المشتركة). مدير المرحلة يظل يرى القيم الحالية للاطّلاع فقط دون تعديلها.
      const isSuperAdmin = currentAccountType === 'superadmin';
      document.querySelectorAll('#schoolInfoFormCard input, #schoolInfoFormCard select').forEach(el => { el.disabled = !isSuperAdmin; });
      const saveBtn = document.getElementById('saveSchoolInfoBtn'); if (saveBtn) saveBtn.style.display = isSuperAdmin ? 'inline-flex' : 'none';
      const restrictNote = document.getElementById('schoolInfoRestrictNote'); if (restrictNote) restrictNote.style.display = isSuperAdmin ? 'none' : 'block';
     } catch (e) {
       console.error('loadSchoolInfoFormUI error:', e);
       const msg = document.getElementById('schoolInfoMsg');
       if (msg) { msg.style.color = '#b91c1c'; msg.textContent = '⚠️ حدث خطأ أثناء تحميل بيانات المدرسة. جرّب إعادة تحميل الصفحة، وإن استمرت المشكلة أرسل نص الخطأ من Console للدعم الفني.'; }
     }
    }

    function updateSchoolInfoDisplay() {
     try {
      const db = loadDB();
      const info = db.schoolInfo;
      const el = document.getElementById('schoolInfoDisplay');
      if (!el) return;
      if (!info || (!info.schoolName && !info.governorate && !info.grade)) { el.innerHTML = ''; return; }
      const parts = [];
      if (info.schoolName) parts.push(`🏫 ${info.schoolName}`);
      if (info.governorate) parts.push(`📍 محافظة ${info.governorate}`);
      if (info.educationAdmin) parts.push(`🏢 ${info.educationAdmin}`);
      if (info.academicYear) parts.push(`📅 ${info.academicYear}`);
      if (info.term) parts.push(`الفصل ${info.term === 'first' ? 'الأول' : 'الثاني'}`);
      if (info.grade) parts.push(`🎓 ${info.grade}`);
      {
        const ent = (typeof getActiveStageEntityLabel === 'function' && getActiveStageEntityLabel())
          || stageEntityLabelFromParts(info.stageType, info.classLanguage);
        if (ent) parts.push(`🏛️ ${ent}`);
      }
      el.innerHTML = parts.filter(Boolean).join(' &nbsp;|&nbsp; ');
     } catch (e) { console.error('updateSchoolInfoDisplay error:', e); }
    }

    // ============================================================
