# STEP 23 — Reduce Attendance Global API Surface

## الهدف
الانتقال من عزل الـ Legacy إلى تقليل سطح الـ Global API نفسه: تحديد الـ APIs العامة اللازمة للتوافق، وإخفاء الداخلية تدريجياً دون كسر السلوك.

## ما تم
- إضافة `js/application/ports/attendance-public-api.js` كسجل رسمي لـ:
  - **Public** (data-action / التوافق)
  - **Internal** (يُفضّل عدم وجودها على `GSP` root)
  - **Transitional** (كائنات namespaced مؤقتة مثل `tdaTeacherDaily`)
- إيقاف تصدير المساعدات الداخلية من `teacher-daily.js` على جذر `GSP`:
  - `tdaDateAllowed`, `tdaPopulateFilters`, `tdaGetState`, `tdaSetBanner`, `tdaStatus`, `tdaUpdateFilterSummary`, `renderTeacherDailyCards`
- الإبقاء على واجهات Public المطلوبة للـ HTML: `tdaSetStudentMark`, `tdaMarkAll`, `tdaToggleFilters`, `onTdaFilterChange`, …
- إخفاء `GSP.attendanceRepository` من الجذر (يبقى تحت `GSP.infrastructure.repositories.attendance`)
- نقل `createAttendanceUIAdapter` إلى `GSP.application.ports` بدل جذر `GSP`
- تحديث `attendance-system.js` و UI adapter لاستهلاك `GSP.features.attendance.teacherDaily` مع fallback توافق
- اختبارات تدقيق للسطح العام وتسرب الـ internal APIs

## التوافق
- لم يُغيَّر نموذج بيانات الحضور
- لم يُمس Supabase RLS / Backend
- واجهات `data-action` في `index.html` تعمل كما هي عبر `GSP[fnName]`

## التحقق
- `node tests/run-tests.mjs`
- `node --check` على الملفات المعدّلة

## الإصدار
`25.5.13`
