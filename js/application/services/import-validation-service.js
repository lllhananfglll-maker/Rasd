/**
 * STEP 44 — Import Validation & Recovery
 *
 * Pure application-layer validation of Excel-import parse results and
 * stage-merge plans, plus lightweight recovery helpers (snapshot / restore)
 * that compose with the existing transaction and data-migration services.
 *
 * Boundaries:
 * - No Supabase schema / RLS / backend permission changes.
 * - Does not parse XLSX itself (that stays in the feature layer).
 * - Does not write IndexedDB unless an injected writer is provided.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const application = GSP.application = GSP.application || {};
  const services = application.services = application.services || {};

  const SEVERITY = Object.freeze({ error: 'error', warning: 'warning', info: 'info' });

  function issue(severity, code, message, detail) {
    const item = { severity, code, message };
    if (detail != null) item.detail = detail;
    return item;
  }

  function isPlainObject(v) {
    return v != null && typeof v === 'object' && !Array.isArray(v);
  }

  function clone(value) {
    if (value == null || typeof value !== 'object') return value;
    if (typeof root.structuredClone === 'function') {
      try { return root.structuredClone(value); } catch (_) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * Validate a parseWorkbookSheet-style result before any merge/commit.
   * @param {object} parsed
   * @param {object} [context] optional { term, month, grade, section, stageId }
   */
  function validateParsedResult(parsed, context) {
    const issues = [];
    const ctx = context || {};

    if (!isPlainObject(parsed)) {
      issues.push(issue(SEVERITY.error, 'PARSED_INVALID', 'نتيجة التحليل غير صالحة'));
      return buildReport(issues, null);
    }

    if (!Array.isArray(parsed.students)) {
      issues.push(issue(SEVERITY.error, 'STUDENTS_MISSING', 'قائمة الطلاب مفقودة من نتيجة التحليل'));
    }
    if (!Array.isArray(parsed.grades)) {
      issues.push(issue(SEVERITY.error, 'GRADES_MISSING', 'قائمة الدرجات مفقودة من نتيجة التحليل'));
    }
    if (!Array.isArray(parsed.subjects)) {
      issues.push(issue(SEVERITY.error, 'SUBJECTS_MISSING', 'قائمة المواد مفقودة من نتيجة التحليل'));
    }

    const students = Array.isArray(parsed.students) ? parsed.students : [];
    const grades = Array.isArray(parsed.grades) ? parsed.grades : [];
    const subjects = Array.isArray(parsed.subjects) ? parsed.subjects : [];
    const invalidGrades = Array.isArray(parsed.invalidGrades) ? parsed.invalidGrades : [];
    const duplicateSeats = Array.isArray(parsed.duplicateSeats) ? parsed.duplicateSeats : [];
    const catalogWarnings = Array.isArray(parsed.catalogWarnings) ? parsed.catalogWarnings : [];

    if (students.length === 0) {
      issues.push(issue(SEVERITY.error, 'EMPTY_ROSTER', 'الملف لا يحتوي على أي طالب صالح للاستيراد'));
    }

    // Required student fields
    const seenIds = new Set();
    const seenNationalIds = new Map(); // nationalId -> student id
    students.forEach((s, idx) => {
      if (!s || typeof s !== 'object') {
        issues.push(issue(SEVERITY.error, 'STUDENT_INVALID', 'سجل طالب غير صالح', { index: idx }));
        return;
      }
      if (!s.id) {
        issues.push(issue(SEVERITY.error, 'STUDENT_NO_ID', 'طالب بدون معرّف', { index: idx, name: s.name }));
      } else if (seenIds.has(s.id)) {
        issues.push(issue(SEVERITY.error, 'STUDENT_DUP_ID', 'تكرار معرّف الطالب داخل الملف', { id: s.id, name: s.name }));
      } else {
        seenIds.add(s.id);
      }
      if (!s.name || !String(s.name).trim()) {
        issues.push(issue(SEVERITY.error, 'STUDENT_NO_NAME', 'طالب بدون اسم', { id: s.id, index: idx }));
      }
      if (!s.nationalId || !String(s.nationalId).trim()) {
        issues.push(issue(SEVERITY.warning, 'STUDENT_NO_NATIONAL_ID', 'طالب بدون رقم قومي — الاعتماد على فصل/جلوس فقط', {
          id: s.id, name: s.name
        }));
      } else {
        const nid = String(s.nationalId).trim();
        if (seenNationalIds.has(nid) && seenNationalIds.get(nid) !== s.id) {
          issues.push(issue(SEVERITY.error, 'STUDENT_DUP_NATIONAL_ID', 'تكرار الرقم القومي داخل الملف', {
            nationalId: nid, name: s.name
          }));
        } else {
          seenNationalIds.set(nid, s.id);
        }
        // Egyptian national id is typically 14 digits; soft warning only
        if (!/^\d{14}$/.test(nid)) {
          issues.push(issue(SEVERITY.warning, 'NATIONAL_ID_FORMAT', 'الرقم القومي ليس 14 رقماً', {
            nationalId: nid, name: s.name
          }));
        }
      }
      if (ctx.grade && s.grade && s.grade !== ctx.grade) {
        issues.push(issue(SEVERITY.warning, 'GRADE_MISMATCH', 'صف الطالب لا يطابق الصف المحدد للاستيراد', {
          name: s.name, studentGrade: s.grade, importGrade: ctx.grade
        }));
      }
      if (ctx.section && s.section && s.section !== ctx.section) {
        issues.push(issue(SEVERITY.warning, 'SECTION_MISMATCH', 'قسم الطالب لا يطابق القسم المحدد', {
          name: s.name, studentSection: s.section, importSection: ctx.section
        }));
      }
    });

    // Subjects / components
    subjects.forEach((subj, si) => {
      if (!subj || !subj.name) {
        issues.push(issue(SEVERITY.error, 'SUBJECT_NO_NAME', 'مادة بدون اسم', { index: si }));
        return;
      }
      const comps = Array.isArray(subj.components) ? subj.components : [];
      if (comps.length === 0) {
        issues.push(issue(SEVERITY.warning, 'SUBJECT_NO_COMPONENTS', 'مادة بدون مكوّنات', { subject: subj.name }));
      }
      comps.forEach((c, ci) => {
        if (!c || !c.name) {
          issues.push(issue(SEVERITY.warning, 'COMPONENT_NO_NAME', 'مكوّن بدون اسم', { subject: subj.name, index: ci }));
        }
        if (c.type !== 'passfail' && c.maxScore != null) {
          const max = Number(c.maxScore);
          if (!(max > 0) || !isFinite(max)) {
            issues.push(issue(SEVERITY.warning, 'COMPONENT_BAD_MAX', 'درجة عظمى غير صالحة', {
              subject: subj.name, component: c.name, maxScore: c.maxScore
            }));
          }
        }
      });
    });

    // Grades integrity
    const studentIdSet = new Set(students.map((s) => s && s.id).filter(Boolean));
    const subjectMax = new Map(); // subjectName||ci -> maxScore
    subjects.forEach((subj) => {
      (subj.components || []).forEach((c, ci) => {
        if (c && c.maxScore != null && c.type !== 'passfail') {
          subjectMax.set(subj.name + '||' + ci, Number(c.maxScore));
        }
      });
    });

    let outOfRange = 0;
    let orphanGrades = 0;
    grades.forEach((g) => {
      if (!g) return;
      if (g.studentId && !studentIdSet.has(g.studentId)) {
        orphanGrades++;
      }
      if (g.score != null && typeof g.score === 'number' && isFinite(g.score)) {
        const key = (g.subjectName || '') + '||' + (g.componentIndex != null ? g.componentIndex : '');
        const max = subjectMax.get(key);
        if (max != null && (g.score < 0 || g.score > max)) {
          outOfRange++;
        }
      }
    });
    if (orphanGrades > 0) {
      issues.push(issue(SEVERITY.error, 'ORPHAN_GRADES', 'درجات مرتبطة بطلاب غير موجودين في الكشف', { count: orphanGrades }));
    }
    if (outOfRange > 0) {
      issues.push(issue(SEVERITY.warning, 'SCORE_OUT_OF_RANGE', 'درجات خارج النطاق المسموح (0..الدرجة العظمى)', { count: outOfRange }));
    }
    if (invalidGrades.length > 0) {
      issues.push(issue(SEVERITY.warning, 'INVALID_GRADE_CELLS', 'خلايا درجات غير قابلة للتفسير تم تجاهلها', {
        count: invalidGrades.length
      }));
    }
    if (duplicateSeats.length > 0) {
      issues.push(issue(SEVERITY.warning, 'DUPLICATE_SEATS', 'تكرار رقم جلوس داخل نفس الفصل', {
        seats: duplicateSeats.slice(0, 20), count: duplicateSeats.length
      }));
    }
    catalogWarnings.forEach((w) => {
      issues.push(issue(SEVERITY.info, 'CATALOG_WARNING', 'تحذير مطابقة كتالوج المواد', w));
    });

    // Context soft checks
    if (ctx.month != null) {
      const m = Number(ctx.month);
      if (!(m >= 1 && m <= 12)) {
        issues.push(issue(SEVERITY.warning, 'MONTH_INVALID', 'رقم الشهر خارج النطاق 1–12', { month: ctx.month }));
      }
    }
    if (ctx.term && !['first', 'second', 'summer', 'الأول', 'الثاني'].includes(String(ctx.term))) {
      // tolerate Arabic labels already mapped elsewhere; only soft info
      issues.push(issue(SEVERITY.info, 'TERM_LABEL', 'قيمة الفصل الدراسي غير قياسية', { term: ctx.term }));
    }

    const summary = {
      studentCount: students.length,
      gradeCount: grades.length,
      subjectCount: subjects.length,
      classCount: Array.isArray(parsed.classes) ? parsed.classes.length : 0,
      invalidGradeCount: invalidGrades.length,
      duplicateSeatCount: duplicateSeats.length
    };

    return buildReport(issues, summary);
  }

  /**
   * Validate a proposed stage merge (pre-commit safety net).
   * Ensures grade/section scoped replacements will not wipe unrelated data
   * and that the draft still has a coherent shape.
   */
  function validateMergePlan(liveDb, draftDb, scope) {
    const issues = [];
    const sc = scope || {};
    const grade = sc.grade;
    const section = sc.section;

    if (!isPlainObject(liveDb) || !isPlainObject(draftDb)) {
      issues.push(issue(SEVERITY.error, 'DB_INVALID', 'قاعدة البيانات الحية أو المسودة غير صالحة'));
      return buildReport(issues, null);
    }

    if (!grade || !section) {
      issues.push(issue(SEVERITY.error, 'SCOPE_MISSING', 'نطاق الاستيراد (الصف/القسم) مفقود'));
      return buildReport(issues, null);
    }

    const liveStudents = Array.isArray(liveDb.students) ? liveDb.students : [];
    const draftStudents = Array.isArray(draftDb.students) ? draftDb.students : [];

    // Students outside scope must be preserved bit-for-bit by id set
    const liveOutside = liveStudents.filter((s) => !(s && s.grade === grade && s.section === section));
    const draftOutsideIds = new Set(
      draftStudents
        .filter((s) => !(s && s.grade === grade && s.section === section))
        .map((s) => s && s.id)
        .filter(Boolean)
    );

    const lostOutside = liveOutside.filter((s) => s && s.id && !draftOutsideIds.has(s.id));
    if (lostOutside.length > 0) {
      issues.push(issue(SEVERITY.error, 'SCOPE_LEAK_DELETE', 'المسودة تحذف طلاباً خارج نطاق الصف/القسم المستورد', {
        count: lostOutside.length,
        sample: lostOutside.slice(0, 5).map((s) => ({ id: s.id, name: s.name, grade: s.grade, section: s.section }))
      }));
    }

    // Draft must keep array containers
    ['students', 'subjects', 'grades', 'classes', 'teachers'].forEach((key) => {
      if (draftDb[key] != null && !Array.isArray(draftDb[key])) {
        issues.push(issue(SEVERITY.error, 'DRAFT_SHAPE', 'شكل المسودة تالف: ' + key + ' ليس مصفوفة'));
      }
    });

    const draftInScope = draftStudents.filter((s) => s && s.grade === grade && s.section === section);
    if (draftInScope.length === 0) {
      issues.push(issue(SEVERITY.warning, 'SCOPE_EMPTY_AFTER_MERGE', 'لا يوجد طلاب داخل نطاق الاستيراد بعد الدمج'));
    }

    const summary = {
      liveStudentCount: liveStudents.length,
      draftStudentCount: draftStudents.length,
      liveOutsideCount: liveOutside.length,
      draftInScopeCount: draftInScope.length,
      lostOutsideCount: lostOutside.length
    };

    return buildReport(issues, summary);
  }

  function buildReport(issues, summary) {
    const list = Array.isArray(issues) ? issues : [];
    const errors = list.filter((i) => i.severity === SEVERITY.error);
    const warnings = list.filter((i) => i.severity === SEVERITY.warning);
    const infos = list.filter((i) => i.severity === SEVERITY.info);
    return Object.freeze({
      ok: errors.length === 0,
      canCommit: errors.length === 0,
      errors,
      warnings,
      infos,
      issues: Object.freeze(list.slice()),
      summary: summary ? Object.freeze(summary) : null,
      errorCount: errors.length,
      warningCount: warnings.length
    });
  }

  /** Capture a deep snapshot of stage data for recovery. */
  function captureSnapshot(db, label) {
    return Object.freeze({
      label: label || 'import',
      capturedAt: new Date().toISOString(),
      data: clone(db)
    });
  }

  /**
   * Restore a previously captured snapshot via an injected writer.
   * Integrates with dataMigration fingerprint when available for integrity notes.
   */
  async function restoreSnapshot(snapshot, options) {
    const opts = options || {};
    if (!snapshot || !isPlainObject(snapshot.data)) {
      return { ok: false, error: 'لقطة الاستعادة غير صالحة' };
    }
    const writer = opts.writeStage || null;
    if (typeof writer !== 'function') {
      return { ok: false, error: 'لا تتوفر واجهة كتابة للاستعادة (writeStage)' };
    }
    try {
      await writer(clone(snapshot.data));
      return {
        ok: true,
        label: snapshot.label || null,
        capturedAt: snapshot.capturedAt || null,
        summary: summarizeStage(snapshot.data)
      };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  function summarizeStage(db) {
    if (!isPlainObject(db)) return { studentCount: 0, gradeCount: 0, subjectCount: 0 };
    return {
      studentCount: Array.isArray(db.students) ? db.students.length : 0,
      gradeCount: Array.isArray(db.grades) ? db.grades.length : 0,
      subjectCount: Array.isArray(db.subjects) ? db.subjects.length : 0,
      teacherCount: Array.isArray(db.teachers) ? db.teachers.length : 0
    };
  }

  /**
   * High-level preflight used by the UI layer:
   * 1) validate parsed result
   * 2) optionally validate merge plan when draft is provided
   * Returns a combined report; canCommit is false if any error exists.
   */
  function preflight(parsed, context, liveDb, draftDb) {
    const parsedReport = validateParsedResult(parsed, context);
    if (!draftDb || !liveDb) return parsedReport;

    const mergeReport = validateMergePlan(liveDb, draftDb, {
      grade: context && context.grade,
      section: context && context.section
    });

    const combinedIssues = parsedReport.issues.concat(mergeReport.issues);
    const summary = Object.assign({}, parsedReport.summary || {}, {
      merge: mergeReport.summary
    });
    return buildReport(combinedIssues, summary);
  }

  function formatReportHtml(report) {
    if (!report) return '';
    const lines = [];
    report.errors.forEach((e) => {
      lines.push('<div class="error-box">❌ [' + e.code + '] ' + escapeBasic(e.message) + formatDetail(e.detail) + '</div>');
    });
    report.warnings.forEach((w) => {
      lines.push('<div class="warning-box">⚠️ [' + w.code + '] ' + escapeBasic(w.message) + formatDetail(w.detail) + '</div>');
    });
    if (report.summary) {
      const s = report.summary;
      lines.push(
        '<div style="font-size:13px;color:#64748b;margin-top:6px;">ملخص: طلاب ' +
          (s.studentCount != null ? s.studentCount : '—') +
          ' · درجات ' + (s.gradeCount != null ? s.gradeCount : '—') +
          ' · مواد ' + (s.subjectCount != null ? s.subjectCount : '—') +
          (s.classCount != null ? ' · فصول ' + s.classCount : '') +
          '</div>'
      );
    }
    return lines.join('');
  }

  function escapeBasic(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDetail(detail) {
    if (detail == null) return '';
    try {
      if (typeof detail === 'object') {
        if (detail.count != null && Object.keys(detail).length === 1) return ' (' + detail.count + ')';
        if (detail.name) return ' — ' + escapeBasic(detail.name);
      }
      return '';
    } catch (_) {
      return '';
    }
  }

  const api = Object.freeze({
    SEVERITY,
    validateParsedResult,
    validateMergePlan,
    preflight,
    captureSnapshot,
    restoreSnapshot,
    summarizeStage,
    formatReportHtml,
    buildReport
  });

  services.importValidation = api;
  application.importValidation = api;
  GSP.importValidation = api;
})(typeof window !== 'undefined' ? window : globalThis);
