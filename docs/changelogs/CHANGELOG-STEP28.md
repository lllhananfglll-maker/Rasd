# STEP 28 — Grades Save Application Service

## الهدف
فصل تحليل مدخلات الدرجات وحفظ الخلايا المعلّقة عن DOM في Application Service، مع إبقاء التأكيدات وتعارضات الدرجات في طبقة الواجهة.

## ما تم
- إضافة `js/application/services/grades-save-service.js`:
  - `validateContext` (صلاحية + قفل)
  - `buildPendingFromRaw` (parseStrict + تخطي غير الصالح)
  - `commitPendingCells` (كتابة grades + audit + حفظ)
  - `countAllAbsentStudents` (مساعد للتحذير)
- `saveAllGrades` يفوّض للخدمة عند توفرها (جمع المدخلات من DOM ثم الحفظ عبر الخدمة).
- حقن `GSP.application.gradesSave` من composition.
- اختبارات وحدة للتحقق والتحليل والحفظ والقفل.

## التوافق
- لا تغيير في نموذج البيانات أو RLS.
- رسائل الحالة والتحذيرات كما هي.

## الإصدار
`25.5.18`
