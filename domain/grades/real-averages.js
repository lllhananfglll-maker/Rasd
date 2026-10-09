/**
 * domain/grades/real-averages.js
 * متوسطات حقيقية: فقط القيم المدخلة فعلياً تدخل المقام.
 * لا تُحوَّل الخانات الفارغة إلى صفر إلا بسياسة صريحة.
 */
'use strict';
(function (root) {
  const GSP = root.GSP || (root.GSP = {});
  const domain = GSP.domain = GSP.domain || {};
  const grades = domain.grades = domain.grades || {};

  const ABSENT = 'غ';

  function isAbsent(v) {
    return v === ABSENT || v === 'غائب' || String(v).trim() === 'غ';
  }

  function toNumber(v) {
    if (v == null || v === '') return null;
    if (isAbsent(v)) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * @param {Array} values - درجات أسابيع/خانات (قد تتضمن null/''/غ)
   * @param {{ emptyAsZero?: boolean, mode?: 'average'|'sum' }} [opts]
   * @returns {{ value: number|string|null, count: number, sum: number }}
   */
  function realAggregate(values, opts) {
    opts = opts || {};
    const mode = opts.mode === 'sum' ? 'sum' : 'average';
    const emptyAsZero = opts.emptyAsZero === true;
    const nums = [];
    let absentOnly = true;
    (values || []).forEach(function (v) {
      if (v == null || v === '') {
        if (emptyAsZero) nums.push(0);
        return;
      }
      if (isAbsent(v)) {
        absentOnly = absentOnly && true;
        return;
      }
      absentOnly = false;
      const n = toNumber(v);
      if (n != null) nums.push(n);
    });
    if (!nums.length) {
      return { value: absentOnly && (values || []).some(isAbsent) ? ABSENT : null, count: 0, sum: 0 };
    }
    const sum = nums.reduce(function (a, b) { return a + b; }, 0);
    const value = mode === 'sum' ? sum : (sum / nums.length);
    return { value: value, count: nums.length, sum: sum };
  }

  /**
   * نسبة مواظبة حقيقية من سجلات يومية.
   * @param {Array<{mark:string,isHoliday?:boolean,isStudyDay?:boolean}>} days
   */
  function realAttendanceRate(days) {
    let present = 0, absent = 0, excused = 0;
    (days || []).forEach(function (d) {
      if (!d || d.isHoliday || d.isStudyDay === false) return;
      const m = String(d.mark || '').toLowerCase();
      if (m === 'present' || m === 'ح' || m === 'حضور') present++;
      else if (m === 'absent' || m === 'غ' || m === 'غياب') absent++;
      else if (m === 'excused' || m === 'ع' || m === 'مستأذن') excused++;
      else if (m === 'late' || m === 'ت') present++; // تأخير يُحسب حضوراً مع ملاحظة
    });
    const denom = present + absent + excused;
    if (!denom) return { rate: null, present: 0, absent: 0, excused: 0, denom: 0 };
    return {
      rate: (present + excused) / denom,
      present: present,
      absent: absent,
      excused: excused,
      denom: denom
    };
  }

  grades.realAggregate = realAggregate;
  grades.realAttendanceRate = realAttendanceRate;
  GSP.realAggregate = realAggregate;
  GSP.realAttendanceRate = realAttendanceRate;
})(typeof window !== 'undefined' ? window : globalThis);
