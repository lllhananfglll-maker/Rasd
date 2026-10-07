# STEP 24 — Reduce Monitor Global API Surface

## الهدف
تطبيق نفس أسلوب STEP 23 على مسار المراقبة: تحديد الـ APIs العامة اللازمة للتوافق، وإخفاء المساعدات الداخلية عن جذر `GSP` دون كسر السلوك.

## ما تم
- إضافة `js/application/ports/monitor-public-api.js` (Public / Internal / Transitional).
- إيقاف تصدير المساعدات النقية على جذر `GSP` من `monitor-shell.js`:
  - `resolveActiveTermMonth`
  - `expectedPctByCalendarDays`
  - `completionForTermMonth`
  - `computeTeacherRankSnapshot`
- نقل `createMonitorService` و `createMonitorUIAdapter` إلى `GSP.application.ports` بدل الجذر.
- الإبقاء على واجهات Public المستخدمة عبر `data-action` (`monNavigate`, طباعة التقارير، feedback، …).
- اختبارات تدقيق لسطح Monitor العام وتسرب الـ internal APIs.

## التوافق
- لا تغيير في نموذج البيانات.
- لا تغيير في Supabase RLS / Backend.
- سلوك شاشة المراقبة و`data-action` كما هو.

## التحقق
- `node tests/run-tests.mjs`
- `node --check` على الملفات المعدّلة

## الإصدار
`25.5.14`
