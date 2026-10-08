/**
 * features/calendar/calendar-ui.js
 * واجهة تحرير الروزنامة المركزية داخل تبويب بيانات المدرسة.
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
    return (el && el.value) || 'first';
  }

  function draftStore() {
    root._termCalendarDraft = root._termCalendarDraft || {};
    return root._termCalendarDraft;
  }

  function loadDraft(term) {
    const b = bridge();
    const d = draftStore();
    if (d[term] && d[term].months) return d[term];
    const c = b ? b.getCentralCalendar(term) : (cal() && cal().defaultCalendar(term));
    d[term] = JSON.parse(JSON.stringify(c));
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

    const weekOpts = Array.from({ length: Math.max(1, Number(c.totalWeeks) || 16) }, function (_, i) {
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
      html += '<div>' + (c.months.length > 2
        ? '<button type="button" class="btn btn-outline btn-sm" data-cal-remove="' + i + '">حذف</button>'
        : '') + '</div></div>';
      html += '<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-weight:700">';
      html += '<input type="checkbox" data-cal-field="hasExam" data-cal-i="' + i + '"' + (m.hasExam ? ' checked' : '') + '> يوجد اختبار شهر</label>';
      html += '</div>';
    });
    box.innerHTML = html;

    (c.months || []).forEach(function (m, i) {
      const rootEl = box.querySelector('[data-cal-i="' + i + '"]');
      if (!rootEl) return;
      const s = rootEl.querySelector('select[data-cal-field="startWeek"]');
      const e = rootEl.querySelector('select[data-cal-field="endWeek"]');
      if (s) s.value = String(m.startWeek || 1);
      if (e) e.value = String(m.endWeek || 1);
    });

    box.querySelectorAll('input,select').forEach(function (el) {
      el.addEventListener('change', onFieldChange);
    });
    box.querySelectorAll('[data-cal-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const i = parseInt(btn.getAttribute('data-cal-remove'), 10);
        const term = currentTerm();
        const c = loadDraft(term);
        if (c.months.length <= 2) return;
        c.months.splice(i, 1);
        draftStore()[term] = c;
        renderCalendar();
      });
    });
  }

  function onFieldChange(ev) {
    const el = ev.target;
    const i = parseInt(el.getAttribute('data-cal-i'), 10);
    const field = el.getAttribute('data-cal-field');
    if (!field || !Number.isFinite(i)) return;
    const term = currentTerm();
    const c = loadDraft(term);
    const m = c.months[i];
    if (!m) return;
    if (field === 'name') m.name = el.value;
    else if (field === 'hasExam') {
      m.hasExam = !!el.checked;
      if (m.hasExam && !m.examAfterWeek) m.examAfterWeek = m.endWeek;
    } else {
      const n = Math.max(1, Math.min(c.totalWeeks, parseInt(el.value, 10) || 1));
      m[field] = n;
      if (m.endWeek < m.startWeek) {
        if (field === 'startWeek') m.endWeek = m.startWeek;
        else m.startWeek = m.endWeek;
      }
    }
    draftStore()[term] = c;
    renderCalendar();
  }

  function onBaseChange() {
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
    renderCalendar();
  }

  function saveCalendar() {
    const term = currentTerm();
    const c = loadDraft(term);
    const b = bridge();
    const domainCal = cal();
    const normalized = domainCal && domainCal.normalizeCalendar
      ? domainCal.normalizeCalendar(c, term)
      : c;
    if (b && b.saveCentralCalendar) b.saveCentralCalendar(term, normalized);
    draftStore()[term] = normalized;
    const msg = document.getElementById('termCalendarMsg');
    if (msg) msg.textContent = '✅ تم حفظ الروزنامة المركزية. الرصد والغياب والطباعة تستخدم هذه التواريخ.';
    try {
      if (typeof root.renderRecordingPeriodsEditor === 'function') root.renderRecordingPeriodsEditor();
    } catch (e) {}
    try {
      if (typeof root.refreshGradeWeekSelect === 'function') root.refreshGradeWeekSelect();
    } catch (e) {}
    try {
      if (typeof root.refreshAttendanceWeekSelect === 'function') root.refreshAttendanceWeekSelect();
    } catch (e) {}
    renderCalendar();
  }

  function addMonth() {
    const term = currentTerm();
    const c = loadDraft(term);
    const last = c.months[c.months.length - 1];
    const sw = Math.min(c.totalWeeks, (last ? last.endWeek + 1 : 1));
    c.months.push({
      name: 'الفترة ' + (c.months.length + 1),
      startWeek: sw,
      endWeek: c.totalWeeks,
      hasExam: false,
      examAfterWeek: 0
    });
    draftStore()[term] = c;
    renderCalendar();
  }

  function bind() {
    const termSel = document.getElementById('siCalendarTerm');
    if (termSel && !termSel.dataset.bound) {
      termSel.dataset.bound = '1';
      termSel.addEventListener('change', function () { renderCalendar(); });
    }
    const startEl = document.getElementById('termCalStartDate');
    const weeksEl = document.getElementById('termCalTotalWeeks');
    if (startEl && !startEl.dataset.bound) {
      startEl.dataset.bound = '1';
      startEl.addEventListener('change', onBaseChange);
    }
    if (weeksEl && !weeksEl.dataset.bound) {
      weeksEl.dataset.bound = '1';
      weeksEl.addEventListener('change', onBaseChange);
    }
    const addBtn = document.getElementById('termCalAddMonthBtn');
    const saveBtn = document.getElementById('termCalSaveBtn');
    if (addBtn && !addBtn.dataset.bound) {
      addBtn.dataset.bound = '1';
      addBtn.addEventListener('click', addMonth);
    }
    if (saveBtn && !saveBtn.dataset.bound) {
      saveBtn.dataset.bound = '1';
      saveBtn.addEventListener('click', saveCalendar);
    }
  }

  function init() {
    bind();
    try {
      if (bridge() && bridge().ensureCalendarSeeded) bridge().ensureCalendarSeeded();
    } catch (e) {}
    renderCalendar();
  }

  GSP.calendarUI = { render: renderCalendar, init: init, save: saveCalendar };
  root.renderTermCalendarUI = renderCalendar;

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(init, 300);
  });

  // عند فتح تبويب بيانات المدرسة
  const prev = root.activateTab;
  if (typeof prev === 'function' && !root._calUiTabHook) {
    root._calUiTabHook = true;
    root.activateTab = function (name) {
      const r = prev.apply(this, arguments);
      if (name === 'schoolinfo' || name === 'school' || name === 'schoolInfo') {
        setTimeout(init, 50);
      }
      return r;
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
