/*
 * Grades save application service — STEP 28.
 * Parses grade inputs and commits pending cells to the data model without DOM.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});

  function createGradesSaveService(deps) {
    const d = deps || {};
    const need = (name) => {
      if (typeof d[name] !== 'function') throw new Error('Grades save service: missing ' + name);
      return d[name];
    };
    const repository = d.repository || null;
    const loadDB = repository && typeof repository.load === 'function' ? () => repository.load() : need('loadDB');
    const saveDB = repository && typeof repository.save === 'function' ? (db, protectKeys) => repository.save(db, protectKeys) : need('saveDB');
    const isGradeEntryLocked = need('isGradeEntryLocked');
    const parseStrictGradeInput = need('parseStrictGradeInput');
    const canAccessGrade = typeof d.canAccessGrade === 'function' ? d.canAccessGrade : () => true;
    const canAccessStudentGrade = typeof d.canAccessStudentGrade === 'function' ? d.canAccessStudentGrade : () => true;
    const scheduleCloudPush = typeof d.scheduleCloudPush === 'function' ? d.scheduleCloudPush : null;
    const recordAudit = typeof d.recordAudit === 'function' ? d.recordAudit : null;
    const getActorName = typeof d.getActorName === 'function' ? d.getActorName : () => '';
    const isAbsentMark = typeof d.isAbsentMark === 'function' ? d.isAbsentMark : (v) => v === 'غ';
    const transaction = d.transaction || null;
    const rollback = typeof d.rollback === 'function' ? d.rollback : null;
    const canEditGrades = typeof d.canEditGrades === 'function' ? d.canEditGrades : () => true;

    function validateContext(ctx) {
      if (!canEditGrades()) return { ok: false, reason: '🚫 ليس لديك صلاحية لتعديل الدرجات.' };
      const subjectName = ctx.subjectName;
      const cls = ctx.cls;
      const term = ctx.term;
      const month = ctx.month;
      if (!subjectName) return { ok: false, reason: 'اختر المادة أولاً.' };
      const db = loadDB();
      const subject = (db.subjects || []).find((s) => s.name === subjectName);
      if (!subject) return { ok: false, reason: 'المادة غير موجودة.' };
      if (cls && !canAccessGrade(subjectName, cls)) {
        return { ok: false, reason: '🚫 غير مصرح لك بتعديل درجات هذا الفصل.' };
      }
      const lockCls = ctx.lockClass || cls;
      if (lockCls && isGradeEntryLocked(db, lockCls, subjectName, term, month)) {
        return { ok: false, reason: '🔒 إدخال الدرجات مقفول حالياً، لا يمكن الحفظ.' };
      }
      return { ok: true, db, subject, subjectName, cls, term, month , week: ctx.week };
    }

    /**
     * rawCells: [{ studentId, studentName, componentIndex, componentName, rawValue, maxScore }]
     */
    function buildPendingFromRaw(rawCells) {
      const pendingCells = [];
      const skippedDetails = [];
      let skipped = 0;
      (rawCells || []).forEach((cell) => {
        const raw = cell.rawValue;
        if (raw === '' || raw == null) return;
        const parsed = parseStrictGradeInput(raw, cell.maxScore);
        if (!parsed.ok) {
          skipped++;
          skippedDetails.push(
            (cell.studentName || cell.studentId) +
              ' — ' +
              (cell.componentName || '') +
              ': «' +
              raw +
              '» — ' +
              (parsed.reason || '')
          );
          return;
        }
        if (parsed.score === null) return;
        pendingCells.push({
          studentId: cell.studentId,
          studentName: cell.studentName || cell.studentId,
          componentIndex: cell.componentIndex,
          componentName: cell.componentName || '',
          newScore: parsed.score
        });
      });
      return { pendingCells, skipped, skippedDetails };
    }

    function commitPendingCells(ctx, pendingCells) {
      if (!canEditGrades()) return { ok: false, saved: 0, reason: '🚫 ليس لديك صلاحية لتعديل الدرجات.' };
      const subjectName = ctx.subjectName;
      const term = ctx.term;
      const month = ctx.month;
      const subject = ctx.subject;
      const defaultWeek = ctx.week != null ? Number(ctx.week) : 1;
      const apply = (db) => {
        if (!db.grades) db.grades = [];
        let saved = 0;
        const nowIso = new Date().toISOString();
        const actor = getActorName();
        const perf = (root.GSP && root.GSP.performance) || (GSP.performance) || null;
        if (db._gradesIndex) delete db._gradesIndex; // force rebuild with week keys
        const idx = perf && typeof perf.buildGradesIndex === 'function' ? perf.buildGradesIndex(db, { force: true }) : null;
        const wp = (root.GSP && root.GSP.weeklyPeriod) || null;
        (pendingCells || []).forEach((cell) => {
          const comp = subject && subject.components ? subject.components[cell.componentIndex] : null;
          const week = wp && typeof wp.resolveGradeWeek === 'function'
            ? wp.resolveGradeWeek(comp, cell.componentName, cell.week != null ? cell.week : defaultWeek)
            : (cell.week != null ? Number(cell.week) : defaultWeek);
          let existing = null;
          if (idx && perf && typeof perf.lookupGrade === 'function') {
            existing = perf.lookupGrade(idx, cell.studentId, subjectName, term, month, cell.componentIndex, week);
          } else {
            existing = db.grades.find(
              (g) =>
                g.studentId === cell.studentId &&
                g.subjectName === subjectName &&
                g.term === term &&
                g.month === month &&
                g.componentIndex === cell.componentIndex &&
                (Number(g.week != null ? g.week : 1) === Number(week) || (week === 0 && (g.week == null || Number(g.week) === 0)))
            );
          }
          if (existing) {
            const prev = existing.score;
            existing.score = cell.newScore;
            existing.week = week;
            existing.updatedAt = nowIso;
            existing.updatedBy = actor;
            if (String(prev) !== String(cell.newScore)) {
              existing.editCount = (Number(existing.editCount) || 0) + 1;
            }
          } else {
            db.grades.push({
              studentId: cell.studentId,
              subjectName,
              term,
              month,
              week,
              componentIndex: cell.componentIndex,
              score: cell.newScore,
              createdAt: nowIso,
              updatedAt: nowIso,
              updatedBy: actor,
              editCount: 0
            });
            if (idx && perf && typeof perf.rememberGrade === 'function') {
              perf.rememberGrade(idx, db.grades[db.grades.length - 1]);
            }
          }
          saved++;
        });
        if (db._gradesIndex) delete db._gradesIndex;
        return saved;
      };

      if (transaction && typeof transaction.executeSync === 'function') {
        const tx = transaction.executeSync({
          label: 'grades.save',
          load: loadDB,
          save: saveDB,
          rollback,
          work: apply
        });
        const saved = tx.result || 0;
        if (recordAudit && saved) {
          recordAudit('رصد درجات', 'تم حفظ ' + saved + ' درجة في مادة ' + subjectName + ' للفصل ' + term + ' والشهر ' + month);
        }
        return { ok: true, saved, persistence: tx.persistence, transaction: tx };
      }

      const db = ctx.db;
      const saved = apply(db);
      saveDB(db);
      if (scheduleCloudPush) scheduleCloudPush();
      if (recordAudit && saved) {
        recordAudit('رصد درجات', 'تم حفظ ' + saved + ' درجة في مادة ' + subjectName + ' للفصل ' + term + ' والشهر ' + month);
      }
      return { ok: true, saved };
    }

    function countAllAbsentStudents(subject, pendingCells) {
      const comps = ((subject && subject.components) || [])
        .map((c, ci) => ({ c, ci }))
        .filter(({ c }) => c && c.type !== 'attendance');
      const byStudent = new Map();
      (pendingCells || []).forEach((cell) => {
        if (!byStudent.has(cell.studentId)) byStudent.set(cell.studentId, []);
        byStudent.get(cell.studentId).push(cell);
      });
      const flagged = [];
      byStudent.forEach((cells, sid) => {
        const name = (cells[0] && cells[0].studentName) || sid;
        const scoreComps = comps.filter(({ ci }) => cells.some((c) => Number(c.componentIndex) === ci));
        if (scoreComps.length < comps.length) return;
        const allG = scoreComps.every(({ ci }) => {
          const cell = cells.find((c) => Number(c.componentIndex) === ci);
          return cell && isAbsentMark(cell.newScore);
        });
        if (allG) flagged.push(name);
      });
      return flagged;
    }

    return Object.freeze({
      validateContext,
      buildPendingFromRaw,
      commitPendingCells,
      countAllAbsentStudents
    });
  }

  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.createGradesSaveService = createGradesSaveService;
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.createGradesSaveService = createGradesSaveService;
})(window);
