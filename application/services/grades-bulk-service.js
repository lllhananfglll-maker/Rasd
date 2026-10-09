/*
 * Grades bulk application service — STEP 27.
 * Validates and applies bulk full-mark fills / clears on the grades data model
 * without touching the DOM. UI controllers gather context and refresh the view.
 */
(function (root) {
  'use strict';
  const GSP = root.GSP || (root.GSP = {});

  function createGradesBulkService(deps) {
    const d = deps || {};
    const need = (name) => {
      if (typeof d[name] !== 'function') throw new Error('Grades bulk service: missing ' + name);
      return d[name];
    };
    const repository = d.repository || null;
    const loadDB = repository && typeof repository.load === 'function' ? () => repository.load() : need('loadDB');
    const saveDB = repository && typeof repository.save === 'function' ? (db, protectKeys) => repository.save(db, protectKeys) : need('saveDB');
    const isGradeEntryLocked = need('isGradeEntryLocked');
    const canAccessGrade = typeof d.canAccessGrade === 'function' ? d.canAccessGrade : () => true;
    const canAccessStudentGrade = typeof d.canAccessStudentGrade === 'function' ? d.canAccessStudentGrade : () => true;
    const classSectionKey = typeof d.classSectionKey === 'function' ? d.classSectionKey : (c, s) => (c || '') + (s ? '§' + s : '');
    const filterStudentsForTeacherLanguage = typeof d.filterStudentsForTeacherLanguage === 'function'
      ? d.filterStudentsForTeacherLanguage
      : (students) => students;
    const scheduleCloudPush = typeof d.scheduleCloudPush === 'function' ? d.scheduleCloudPush : null;
    const recordAudit = typeof d.recordAudit === 'function' ? d.recordAudit : null;
    const getActorName = typeof d.getActorName === 'function' ? d.getActorName : () => '';
    const transaction = d.transaction || null;
    const rollback = typeof d.rollback === 'function' ? d.rollback : null;

    function getFillableComponents(subject) {
      const list = (subject && subject.components) || [];
      return list
        .map((c, ci) => ({ c, ci }))
        .filter(({ c }) => !c.isMonthlyGrade && c.type !== 'attendance');
    }

    function hasMonthlyFlag(subject) {
      return ((subject && subject.components) || []).some((c) => c.isMonthlyGrade);
    }

    function resolveStudents(db, subjectName, cls) {
      let students = (db.students || []).filter((s) => classSectionKey(s.class, s.section) === cls);
      students = filterStudentsForTeacherLanguage(students, subjectName, cls);
      students = students.filter((s) => canAccessStudentGrade(subjectName, s));
      return students;
    }

    function planBulkFullMarks(ctx) {
      const subjectName = ctx.subjectName;
      const cls = ctx.cls;
      const term = ctx.term;
      const month = ctx.month;
      if (!subjectName || !cls) return { ok: false, reason: 'يرجى اختيار المادة والفصل أولاً.' };
      const db = loadDB();
      const subject = (db.subjects || []).find((s) => s.name === subjectName);
      if (!subject) return { ok: false, reason: 'المادة غير موجودة.' };
      if (!canAccessGrade(subjectName, cls)) {
        return { ok: false, reason: '🚫 غير مصرح لك بالوصول لهذه المادة أو الفصل.' };
      }
      if (isGradeEntryLocked(db, cls, subjectName, term, month)) {
        return { ok: false, reason: '🔒 إدخال الدرجات مقفول حالياً لهذا الفصل/المادة/الشهر، لا يمكن الرصد الجماعي.' };
      }
      const fillComponents = getFillableComponents(subject);
      if (!fillComponents.length) {
        return { ok: false, reason: 'لا توجد مكونات قابلة للرصد الجماعي (غير الدرجة الشهرية ومكونات الحضور).' };
      }
      if (!hasMonthlyFlag(subject)) {
        return {
          ok: false,
          reason: 'لا يوجد مكوّن محدَّد كـ"الدرجة الشهرية" لهذه المادة. حدِّده من تبويب المواد أولاً.'
        };
      }
      const students = resolveStudents(db, subjectName, cls);
      if (!students.length) return { ok: false, reason: 'لا يوجد طلاب مطابقين في هذا الفصل.' };
      return {
        ok: true,
        db,
        subject,
        subjectName,
        cls,
        term,
        month,
        fillComponents,
        students
      };
    }

    function commitBulkFullMarks(plan, options) {
      const opts = options || {};
      const skipExisting = opts.skipExisting !== false;
      const subjectName = plan.subjectName;
      const term = plan.term;
      const month = plan.month;
      const apply = (db) => {
        let filled = 0;
        let skippedExisting = 0;
        const nowIso = new Date().toISOString();
        const actor = getActorName();
        if (!db.grades) db.grades = [];
        const perf = (root.GSP && root.GSP.performance) || (GSP.performance) || null;
        const idx = perf && typeof perf.buildGradesIndex === 'function' ? perf.buildGradesIndex(db) : null;
        plan.students.forEach((stu) => {
          plan.fillComponents.forEach(({ c, ci }) => {
            const max = Number(c.maxScore);
            if (!Number.isFinite(max) || max <= 0) return;
            let existing;
            if (idx && perf && typeof perf.lookupGrade === 'function') {
              existing = perf.lookupGrade(idx, stu.id, subjectName, term, month, ci);
            } else {
              existing = db.grades.find(g => g.studentId === stu.id && g.subjectName === subjectName && g.term === term && g.month === month && g.componentIndex === ci);
            }
            if (existing && existing.score !== null && existing.score !== undefined && existing.score !== '') {
              if (skipExisting) { skippedExisting++; return; }
              existing.score = max; existing.updatedAt = nowIso; existing.updatedBy = actor;
              existing.editCount = (Number(existing.editCount) || 0) + 1; filled++; return;
            }
            if (existing) {
              existing.score = max; existing.updatedAt = nowIso; existing.updatedBy = actor; filled++;
            } else {
              db.grades.push({studentId: stu.id, subjectName, term, month, componentIndex: ci, score: max, createdAt: nowIso, updatedAt: nowIso, updatedBy: actor, editCount: 0});
              if (idx && perf && typeof perf.rememberGrade === 'function') {
                perf.rememberGrade(idx, db.grades[db.grades.length - 1]);
              }
              filled++;
            }
          });
        });
        return { filled, skippedExisting };
      };
      if (transaction && typeof transaction.executeSync === 'function') {
        const tx = transaction.executeSync({ label: 'grades.bulkFill', load: loadDB, save: saveDB, rollback, work: apply });
        const result = tx.result || {filled:0, skippedExisting:0};
        if (recordAudit) recordAudit('رصد جماعي', 'تعبئة درجة عظمى: ' + result.filled + ' خانة (تخطّي موجود: ' + result.skippedExisting + ') — ' + subjectName);
        return Object.assign({ok:true, persistence:tx.persistence, transaction:tx}, result);
      }
      const result = apply(plan.db); saveDB(plan.db); if (scheduleCloudPush) scheduleCloudPush();
      if (recordAudit) recordAudit('رصد جماعي', 'تعبئة درجة عظمى: ' + result.filled + ' خانة (تخطّي موجود: ' + result.skippedExisting + ') — ' + subjectName);
      return Object.assign({ok:true}, result);
    }

    function planBulkClear(ctx) {
      const subjectName = ctx.subjectName;
      const cls = ctx.cls;
      const term = ctx.term;
      const month = ctx.month;
      if (!subjectName || !cls) return { ok: false, reason: 'يرجى اختيار المادة والفصل أولاً.' };
      const db = loadDB();
      if (!canAccessGrade(subjectName, cls)) {
        return { ok: false, reason: '🚫 غير مصرح لك بالوصول لهذه المادة أو الفصل.' };
      }
      if (isGradeEntryLocked(db, cls, subjectName, term, month)) {
        return { ok: false, reason: '🔒 مقفول — لا يمكن المسح الجماعي.' };
      }
      const students = resolveStudents(db, subjectName, cls);
      if (!students.length) return { ok: false, reason: 'لا يوجد طلاب مطابقين.' };
      return { ok: true, db, subjectName, cls, term, month, students };
    }

    function commitBulkClear(plan) {
      const apply = (db) => {
        const ids = new Set(plan.students.map(s => String(s.id)));
        const before = (db.grades || []).length;
        db.grades = (db.grades || []).filter(g => {
          if (String(g.subjectName) !== String(plan.subjectName)) return true;
          if (g.term !== plan.term || g.month !== plan.month) return true;
          if (!ids.has(String(g.studentId))) return true;
          return false;
        });
        return before - db.grades.length;
      };
      if (transaction && typeof transaction.executeSync === 'function') {
        const tx = transaction.executeSync({ label: 'grades.bulkClear', load: loadDB, save: saveDB, rollback, work: apply });
        const removed = tx.result || 0;
        if (recordAudit) recordAudit('مسح جماعي', 'حذف ' + removed + ' درجة — ' + plan.subjectName);
        return {ok:true, removed, persistence:tx.persistence, transaction:tx};
      }
      const removed = apply(plan.db); saveDB(plan.db); if (scheduleCloudPush) scheduleCloudPush();
      if (recordAudit) recordAudit('مسح جماعي', 'حذف ' + removed + ' درجة — ' + plan.subjectName);
      return {ok:true, removed};
    }

    return Object.freeze({
      getFillableComponents,
      hasMonthlyFlag,
      planBulkFullMarks,
      commitBulkFullMarks,
      planBulkClear,
      commitBulkClear
    });
  }

  GSP.application = GSP.application || {};
  GSP.application.services = GSP.application.services || {};
  GSP.application.services.createGradesBulkService = createGradesBulkService;
  GSP.application.ports = GSP.application.ports || {};
  GSP.application.ports.createGradesBulkService = createGradesBulkService;
})(window);
