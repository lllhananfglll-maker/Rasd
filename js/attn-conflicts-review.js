(function(){
  'use strict';
  const esc = escapeHtml; // مصدر واحد لمنطق الهروب من HTML (راجع تعريف escapeHtml الرئيسي)
  function termLabel(t){ return t==='first' ? 'الفصل الأول' : t==='second' ? 'الفصل الثاني' : (t||'—'); }
  function entryLabel(x){
    let m = x.month;
    try { const labels = getMonthLabels(x.term); if (labels && labels[x.month-1]) m = labels[x.month-1]; } catch(e){}
    return `${esc(x.subject)} — ${termLabel(x.term)} — ${esc(m)}`;
  }
  function openAttendanceConflictsModal(){
    const body = document.getElementById('attnConflictModalBody');
    if (!body) return;
    const conflicts = (typeof computeAttendanceConflicts === 'function') ? computeAttendanceConflicts() : [];
    try {
      const d = (typeof loadDB === 'function') ? loadDB() : {};
      GSP.__attnConflictsCache = {
        key: ((d.grades||[]).length|0) + '|' + ((d.students||[]).length|0) + '|' + (typeof currentStageId !== 'undefined' ? (currentStageId||'') : ''),
        count: conflicts.length
      };
    } catch (e) {}
    body.innerHTML = conflicts.length ? conflicts.map(c => `
      <div class="v20-item" style="align-items:flex-start;flex-direction:column;margin-bottom:10px">
        <div class="v20-item-main" style="width:100%">
          <div class="v20-item-title">${esc(c.student.name||'—')}
            <span style="font-size:12px;color:#64748b;font-weight:400">(الصف: ${esc(c.student.class||'—')} | القسم: ${c.student.section==='languages'?'لغات':'عربي'})</span>
          </div>
          <div class="v20-item-note" style="margin-top:8px">
            <div style="color:#991b1b;font-weight:600;margin-bottom:2px">🚫 مسجَّل "غ" في:</div>
            <div>${[...new Set(c.absent.map(entryLabel))].join('<br>')}</div>
            <div style="color:#166534;font-weight:600;margin:8px 0 2px">✅ وله درجة فعلية في:</div>
            <div>${[...new Set(c.present.map(entryLabel))].join('<br>')}</div>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" style="margin-top:10px" data-action="closeConflictsModalAndOpenStudent" data-args='[${JSON.stringify(c.student.id)}]'>فتح ملف الطالب</button>
      </div>`).join('') : '<div class="v20-empty">🎉 لا توجد تعارضات حضور/غياب حالياً.</div>';
    document.getElementById('attnConflictModal').style.display = 'flex';
  }
  function closeAttendanceConflictsModal(){ const m=document.getElementById('attnConflictModal'); if(m) m.style.display='none'; }
  GSP.openAttendanceConflictsModal = openAttendanceConflictsModal;
  GSP.closeAttendanceConflictsModal = closeAttendanceConflictsModal;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAttendanceConflictsModal(); });
})();
