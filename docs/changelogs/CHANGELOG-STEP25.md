# STEP 25 — Grades Application Boundary + Public API Surface

## الهدف
بدء مسار الدرجات بنفس أسلوب الحضور/المراقبة: Application Service خفيف + سجل Public/Internal API، مع إخفاء المساعدات النقية عن جذر `GSP` دون كسر السلوك.

## ما تم
- إضافة `js/application/ports/grades-public-api.js` (Public / Internal / Transitional).
- إضافة `js/application/services/grades-service.js` يغلّف قواعد الأقفال والتحليل النقية عبر `GSPGradeLogic`.
- إضافة `js/application/composition/grades-composition.js`.
- إضافة `js/features/grades/index.js` كواجهة Feature.
- إيقاف تصدير المساعدات النقية من `grades-ui.part04.js` على جذر `GSP` (مثل `lockKey`, `isGradeEntryLocked`, `getGradeTier`, …) مع الإبقاء عليها تحت `GSP.features.grades.helpers`.
- الإبقاء على Public APIs المطلوبة لـ `data-action` (`loadGradesUI`, `saveAllGrades`, الأقفال، التعبئة الجماعية، …).

## التوافق
- لا تغيير في نموذج بيانات الدرجات.
- لا تغيير في Supabase RLS / Backend.
- واجهات HTML `data-action` تعمل كما هي.

## التحقق
- `node tests/run-tests.mjs`
- `node --check` على الملفات الجديدة/المعدّلة

## الإصدار
`25.5.15`
