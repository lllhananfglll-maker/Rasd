/**
 * core/grade-logic.js
 * منطق حساب الدرجات والأقفال — دوال نقية قابلة للاختبار.
 * المصدر الوحيد لهذا المنطق؛ يُصدَّر على window للتوافق مع باقي الـ SPA.
 */
(function (global) {
  'use strict';

  var ABSENT_MARK = 'غ';
  var INCOMPLETE_MARK = '__INCOMPLETE__';
  var EXAM_TERM_SITTINGS = 2;

  function normalizeArabicLocal(str) {
    return String(str == null ? '' : str)
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isAbsentMark(v) {
    return v === ABSENT_MARK;
  }

  function isIncompleteMark(v) {
    return v === INCOMPLETE_MARK;
  }

  function isExamComponent(name) {
    var n = normalizeArabicLocal(name || '');
    return /امتحان|اختبار|تقييم\s*شهري/.test(n);
  }

  function isExamLikeComponent(compOrName) {
    if (compOrName && typeof compOrName === 'object') {
      if (compOrName.isMonthlyGrade) return true;
      return isExamComponent(compOrName.name);
    }
    return isExamComponent(compOrName);
  }

  function isAttendanceComponent(name) {
    // بعد التطبيع: ة→ه لذا نبحث عن «نسبه» وليس «نسبة»
    return /نسبه|حضور|غياب/.test(normalizeArabicLocal(name));
  }

  function isAbsenceDaysComponent(name) {
    var n = normalizeArabicLocal(name);
    return /غياب/.test(n) && !/نسبه/.test(n);
  }

  /**
   * يجمع/يتوسط قيماً قد تحوي أرقاماً و/أو 'غ'.
   * يتجاهل الغياب من الحساب؛ النتيجة 'غ' فقط إذا كانت كل القيم غياباً.
   * @param {Array} rawVals
   * @param {'sum'|'average'} mode
   */
  function aggregateAbsentAwareValues(rawVals, mode) {
    if (!rawVals || !rawVals.length) return null;
    var numeric = rawVals.filter(function (v) { return !isAbsentMark(v); });
    if (!numeric.length) return ABSENT_MARK;
    var sum = numeric.reduce(function (a, b) { return a + b; }, 0);
    return mode === 'sum' ? sum : sum / numeric.length;
  }

  function lockKey(cls, subj, term, month) {
    return String(cls) + '||' + String(subj) + '||' + String(term) + '||' + String(month);
  }

  function monthLockKey(term, month) {
    return String(term) + '||' + String(month);
  }

  function isTermLocked(db, term) {
    return !!(db && db.termLocks && db.termLocks[term]);
  }

  /**
   * هل إدخال الدرجة مقفول لهذا الفصل/المادة/الفصل الدراسي/الشهر؟
   * الترتيب: قفل عام → قفل فصل دراسي → قفل شهر → قفل فردي
   */
  function isGradeEntryLocked(db, cls, subjectName, term, month) {
    if (!db) return false;
    if (db.globalLock) return true;
    if (isTermLocked(db, term)) return true;
    if (db.monthLocks && db.monthLocks[monthLockKey(term, month)]) return true;
    if (db.locks && db.locks[lockKey(cls, subjectName, term, month)]) return true;
    return false;
  }

  function toWesternDigits(str) {
    return String(str == null ? '' : str)
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
  }

  function isAbsentInputText(raw) {
    return normalizeArabicLocal(String(raw == null ? '' : raw)).trim() === 'غ';
  }

  /**
   * تحليل صارم لمدخل الدرجة: رقم أو غياب فقط.
   * @returns {{ ok: boolean, score: number|string|null, reason: string }}
   */
  function parseStrictGradeInput(raw, maxScore) {
    var original = String(raw == null ? '' : raw).trim();
    if (!original) return { ok: true, score: null, reason: '' };
    if (isAbsentInputText(original)) return { ok: true, score: ABSENT_MARK, reason: '' };
    var s = toWesternDigits(original).replace(/٫/g, '.').replace(/,/g, '.').replace(/\s+/g, '');
    if (/[a-zA-Z\u0600-\u06FF]/.test(s) && !isAbsentInputText(s)) {
      return { ok: false, score: null, reason: 'يُسمح فقط بالأرقام أو «غ»' };
    }
    if (/[^0-9.]/.test(s)) return { ok: false, score: null, reason: 'رموز غير مسموحة' };
    if ((s.match(/\./g) || []).length > 1) {
      return { ok: false, score: null, reason: 'أكثر من علامة عشرية واحدة (مثال: 9..5)' };
    }
    if (!(/^\d+(\.\d+)?$/.test(s) || /^\.\d+$/.test(s))) {
      return { ok: false, score: null, reason: 'صيغة غير صحيحة' };
    }
    var num = Number(s);
    if (!Number.isFinite(num) || num < 0) return { ok: false, score: null, reason: 'قيمة غير صالحة' };
    var max = (maxScore === undefined || maxScore === null || maxScore === '') ? null : Number(maxScore);
    if (max != null && Number.isFinite(max) && num > max) {
      return { ok: false, score: null, reason: 'تتجاوز الحد (' + max + ')' };
    }
    return { ok: true, score: num, reason: '' };
  }

  // تصدير
  var API = {
    ABSENT_MARK: ABSENT_MARK,
    INCOMPLETE_MARK: INCOMPLETE_MARK,
    EXAM_TERM_SITTINGS: EXAM_TERM_SITTINGS,
    isAbsentMark: isAbsentMark,
    isIncompleteMark: isIncompleteMark,
    isExamComponent: isExamComponent,
    isExamLikeComponent: isExamLikeComponent,
    isAttendanceComponent: isAttendanceComponent,
    isAbsenceDaysComponent: isAbsenceDaysComponent,
    aggregateAbsentAwareValues: aggregateAbsentAwareValues,
    lockKey: lockKey,
    monthLockKey: monthLockKey,
    isTermLocked: isTermLocked,
    isGradeEntryLocked: isGradeEntryLocked,
    toWesternDigits: toWesternDigits,
    isAbsentInputText: isAbsentInputText,
    parseStrictGradeInput: parseStrictGradeInput,
    normalizeArabicLocal: normalizeArabicLocal
  };

  // على window مع عدم الكتابة فوق نسخ أقدم إن وُجدت من app.js (أول تحميل يفوز)
  Object.keys(API).forEach(function (k) {
    if (typeof global[k] === 'undefined') global[k] = API[k];
  });
  global.GSPGradeLogic = API;
})(typeof window !== 'undefined' ? window : globalThis);

// تصدير ESM للاختبارات (Vitest)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof globalThis !== 'undefined' && globalThis.GSPGradeLogic) || {};
}
