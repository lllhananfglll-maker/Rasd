/* Pure attendance workday policy. No DOM or persistence dependencies. */
(function(){
  'use strict';
  const GSP = globalThis.GSP || (globalThis.GSP = {});

  function toDayIndex(dateISO){
    if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO))) return -1;
    const [y,m,d] = String(dateISO).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return -1;
    const jsDay = dt.getDay();
    if (jsDay >= 0 && jsDay <= 4) return jsDay; // الأحد → الخميس
    if (jsDay === 6) return 5; // السبت
    return -1; // الجمعة
  }

  function activeWorkdayIndices(att){
    const days = [0,1,2,3,4];
    if (att && att.saturdayEnabled === true) days.push(5);
    return days;
  }

  function isSchoolWorkingDay(att, dateISO){
    const idx = toDayIndex(dateISO);
    return idx >= 0 && activeWorkdayIndices(att).includes(idx);
  }

  function explainNonWorkingDay(att, dateISO){
    const idx = toDayIndex(dateISO);
    if (idx < 0) return 'التاريخ غير صالح أو يوم الجمعة — لا يمكن تسجيل الحضور.';
    if (idx === 5 && !(att && att.saturdayEnabled === true)) {
      return 'يوم السبت غير مُفعّل ضمن أيام العمل — لا يمكن تسجيل الحضور.';
    }
    return 'هذا التاريخ ليس ضمن أيام العمل — لا يمكن تسجيل الحضور.';
  }

  GSP.attendanceWorkdayPolicy = Object.freeze({
    toDayIndex,
    activeWorkdayIndices,
    isSchoolWorkingDay,
    explainNonWorkingDay
  });
})();
