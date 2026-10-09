/**
 * features/calendar/calendar-ui.js
 * STEP 55 — واجهة تحرير الروزنامة المركزية (بيانات المدرسة).
 * الحفظ يمر حصراً عبر calendarBridge.saveCentralCalendar → كل المراحل.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});

  function bridge() {
    return GSP.calendarBridge || null;
  }

  function cal() {
    return (GSP.domain && GSP.domain.calendar) || GSP.termCalendar || null;
  }

  function currentTerm() {
    const el = document.getElementById('siCalendarTerm');
    return (el && el.value === 'second') ? 'second' : 'first';
  }

  function draftStore() {
    root._termCalendarDraft = root._termCalendarDraft || {};
    return root._termCalendarDraft;
  }

  function loadDraft(term) {
    const d = draftStore();
    if (d[term] && Array.isArray(d[term].months) && d[term].months.length) {
      return d[term];
    }
    const b = bridge();
    // فضّل المحفوظ الفعلي على الافتراضي
    let c = null;
    if (b && typeof b.readStoredCalendar === 'function') {
      c = b.readStoredCalendar(term);
    }
    if (!c && b && typeof b.getCentralCalendar === 'function') {
      c = b.getCentralCalendar(term);
    }
    if (!c && cal() && cal().defaultCalendar) {
      c = cal().defaultCalendar(term);
    }
    d[term] = JSON.parse(JSON.stringify(c || { startDate: '', totalWeeks: 16, months: [] }));
    return d[term];
  }

  function renderCalendar() {
    const box = document.getElementById('termCalendarEditor');
    if (!box) return;
    const term = currentTerm();
    const c = loadDraft(term);
    const startEl = document.getElementById('termCalStartDate');
    const weeksEl = document.getElementById('termCalTotalWeeks');
    if (startEl) startEl.value = c.startDate || '';
    if (weeksEl) weeksEl.value = String(c.totalWeeks || 16);

    const total = Math.max(1, Number(c.totalWeeks) || 16);
    const weekOpts = Array.from({ length: total }, function (_, i) {
      return '<option value="' + (i + 1) + '">الأسبوع ' + (i + 1) + '</option>';
    }).join('');

    let html = '';
    (c.months || []).forEach(function (m, i) {
      const name = String(m.name || '').replace(/"/g, '&quot;');
      html += '<div class="card" style="padding:12px;margin-bottom:10px;border:1px solid #bbf7d0;background:#fff" data-cal-i="' + i + '">';
      html += '<div style="display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:10px;align-items:end">';
      html += '<div class="form-group"><label>اسم الفترة ' + (i + 1) + '</label>';
      html += '<input data-cal-field="name" data-cal-i="' + i + '" value="' + name + '"></div>';
      html += '<div class="form-group"><label>من أسبوع</label><select data-cal-field="startWeek" data-cal-i="' + i + '">' + weekOpts + '</select></div>';
      html += '<div class="form-group"><label>إلى أسبوع</label><select data-cal-field="endWeek" data-cal-i="' + i + '">' + weekOpts + '</select></div>';
      html += '<div>' + (c.months.length > 1
        ? '<button type="button" class="btn btn-outline btn-sm" data-cal-remove="' + i + '">حذف</button>'
        : '') + '</div>';
      html += '</div>';
      html += '<label style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:13px">';
      html += '<input type="checkbox" data-cal-field="hasExam" data-cal-i="' + i + '"' + (m.hasExam ? ' checked' : '') + '> يوجد اختبار شهر</label>';
      html += '</div>';
    });
    box.innerHTML = html || '<p style="color:#64748b">لا توجد فترات — اضغط «إضافة فترة».</p>';

    (c.months || []).forEach(function (m, i) {
      const startSel = box.querySelector('select[data-cal-field="startWeek"][data-cal-i="' + i + '"]');
      const endSel = box.querySelector('select[data-cal-field="endWeek"][data-cal-i="' + i + '"]');
      if (startSel) startSel.value = String(m.startWeek || 1);
      if (endSel) endSel.value = String(m.endWeek || m.startWeek || 1);
    });

    box.querySelectorAll('[data-cal-field]').forEach(function (el) {
      el.addEventListener('change', onFieldChange);
      if (el.tagName === 'INPUT' && el.type === 'text') {
        el.addEventListener('input', onFieldChange);
      }
    });
    box.querySelectorAll('[data-cal-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const i = parseInt(btn.getAttribute('data-cal-remove'), 10);
        const term2 = currentTerm();
        const draft = loadDraft(term2);
        draft.months.splice(i, 1);
        renderCalendar();
      });
    });
  }

  function onFieldChange(e) {
    const el = e.target;
    const i = parseInt(el.getAttribute('data-cal-i'), 10);
    const field = el.getAttribute('data-cal-field');
    const term = currentTerm();
    const draft = loadDraft(term);
    if (!draft.months[i]) return;
    if (field === 'name') draft.months[i].name = el.value;
    else if (field === 'startWeek') draft.months[i].startWeek = parseInt(el.value, 10) || 1;
    else if (field === 'endWeek') draft.months[i].endWeek = parseInt(el.value, 10) || 1;
    else if (field === 'hasExam') {
      draft.months[i].hasExam = !!el.checked;
      draft.months[i].examAfterWeek = el.checked ? (draft.months[i].endWeek || 0) : 0;
    }
  }

  function readHeaderIntoDraft() {
    const term = currentTerm();
    const c = loadDraft(term);
    const startEl = document.getElementById('termCalStartDate');
    const weeksEl = document.getElementById('termCalTotalWeeks');
    if (startEl) c.startDate = startEl.value;
    if (weeksEl) {
      c.totalWeeks = Math.max(1, Math.min(40, parseInt(weeksEl.value, 10) || 16));
      (c.months || []).forEach(function (m) {
        m.startWeek = Math.min(m.startWeek, c.totalWeeks);
        m.endWeek = Math.min(m.endWeek, c.totalWeeks);
        if (m.endWeek < m.startWeek) m.endWeek = m.startWeek;
      });
    }
    draftStore()[term] = c;
    return c;
  }

  function saveCalendar() {
    const term = currentTerm();
    const c = readHeaderIntoDraft();
    const domainCal = cal();
    const normalized = domainCal && domainCal.normalizeCalendar
      ? domainCal.normalizeCalendar(c, term)
      : c;
    const b = bridge();
    if (b && b.saveCentralCalendar) {
      b.saveCentralCalendar(term, normalized);
    } else if (typeof root.saveCentralCalendar === 'function') {
      root.saveCentralCalendar(term, normalized);
    }
    draftStore()[term] = JSON.parse(JSON.stringify(normalized));
    // أعد مزامنة مسودة فترات الرصد في school-info
    try {
      if (root.GSP) root.GSP._siPeriodsDraft = null;
      if (typeof root.renderRecordingPeriodsEditor === 'function') root.renderRecordingPeriodsEditor();
      if (typeof root.populateMonthSelects === 'function') root.populateMonthSelects();
    } catch (_) {}

    const msg = document.getElementById('termCalendarMsg');
    if (msg) {
      msg.style.color = '#0b5e42';
      msg.textContent = '✅ تم حفظ الروزنامة محلياً (IndexedDB + خزنة دائمة). ستبقى بعد الخروج حتى لو فشلت مزامنة السحابة.';
    }
    // تأكيد كتابة الخزنة
    try {
      if (typeof snapshotVaultFromSchoolInfo !== 'function' && window.GSP && GSP.calendarBridge) {
        /* bridge handles it inside saveCentralCalendar */
      }
      var v = null;
      try { v = localStorage.getItem('gsp_school_calendar_vault_v1'); } catch (_) {}
      if (!v && msg) {
        msg.style.color = '#b45309';
        msg.textContent += ' — ⚠️ تعذّر كتابة الخزنة في localStorage (وضع خاص؟).';
      }
    } catch (_) {}
    try {
      if (typeof setConnBadge === 'function') setConnBadge('تم حفظ الروزنامة محلياً — بانتظار المزامنة');
      if (typeof forceFullCloudSync === 'function') {
        setTimeout(function () {
          forceFullCloudSync({ reason: 'after-calendar-save' }).then(function (r) {
            if (msg && r && r.ok) {
              msg.textContent = '✅ تم حفظ الروزنامة ومزامنتها مع السحابة (' + r.count + ' صف).';
            }
          });
        }, 500);
      } else if (typeof scheduleCloudPush === 'function') {
        scheduleCloudPush();
      }
    } catch (_) {}
    renderCalendar();
  }

  function addMonth() {
    const term = currentTerm();
    const c = readHeaderIntoDraft();
    const last = (c.months || [])[c.months.length - 1];
    const start = last ? (last.endWeek + 1) : 1;
    const end = Math.min((c.totalWeeks || 16), start + 3);
    if (start > (c.totalWeeks || 16)) {
      const msg = document.getElementById('termCalendarMsg');
      if (msg) { msg.style.color = '#b91c1c'; msg.textContent = '⚠️ لا يمكن إضافة فترة: تم استهلاك كل أسابيع الفصل.'; }
      return;
    }
    c.months.push({
      name: 'الفترة ' + (c.months.length + 1),
      startWeek: start,
      endWeek: Math.max(start, end),
      hasExam: false,
      examAfterWeek: 0
    });
    renderCalendar();
  }

  function onTermChange() {
    renderCalendar();
  }

  function bind() {
    const termSel = document.getElementById('siCalendarTerm');
    if (termSel && !termSel._calBound) {
      termSel.addEventListener('change', onTermChange);
      termSel._calBound = true;
    }
    const addBtn = document.getElementById('termCalAddMonthBtn');
    if (addBtn && !addBtn._calBound) {
      addBtn.addEventListener('click', function (e) { e.preventDefault(); addMonth(); });
      addBtn._calBound = true;
    }
    const saveBtn = document.getElementById('termCalSaveBtn');
    if (saveBtn && !saveBtn._calBound) {
      saveBtn.addEventListener('click', function (e) { e.preventDefault(); saveCalendar(); });
      saveBtn._calBound = true;
    }
    const startEl = document.getElementById('termCalStartDate');
    const weeksEl = document.getElementById('termCalTotalWeeks');
    if (startEl && !startEl._calBound) {
      startEl.addEventListener('change', function () { readHeaderIntoDraft(); });
      startEl._calBound = true;
    }
    if (weeksEl && !weeksEl._calBound) {
      weeksEl.addEventListener('change', function () { readHeaderIntoDraft(); renderCalendar(); });
      weeksEl._calBound = true;
    }
  }

  function initCalendarUI() {
    try {
      if (bridge() && bridge().ensureCalendarSeeded) bridge().ensureCalendarSeeded();
    } catch (_) {}
    // امسح المسودة لفرض القراءة من التخزين
    root._termCalendarDraft = {};
    bind();
    renderCalendar();
  }

  root.initCalendarUI = initCalendarUI;
  root.renderTermCalendarEditor = renderCalendar;
  root.saveTermCalendarUI = saveCalendar;

  if (typeof root.document !== 'undefined') {
    root.document.addEventListener('DOMContentLoaded', function () {
      setTimeout(function () {
        try { bind(); } catch (_) {}
      }, 400);
    });
    // عند فتح تبويب بيانات المدرسة
    root.document.addEventListener('click', function (e) {
      const tab = e.target && e.target.closest && e.target.closest('[data-tab="schoolinfo"], [data-tab="school"]');
      if (tab) setTimeout(initCalendarUI, 50);
    });
  }

  GSP.calendarUI = {
    init: initCalendarUI,
    render: renderCalendar,
    save: saveCalendar,
    addMonth: addMonth
  };
})(typeof window !== 'undefined' ? window : globalThis);
