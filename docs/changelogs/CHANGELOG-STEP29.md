# STEP 29 — saveStudentRow via Grades Save Service

## الهدف
توحيد مسار حفظ صف طالب واحد مع `saveAllGrades` عبر نفس Application Service، لتقليل تكرار منطق parse/commit.

## ما تم
- `saveStudentRow` يفوّض إلى `GSP.application.gradesSave`:
  - التحقق من صلاحية الطالب
  - `validateContext` مع `lockClass`
  - `buildPendingFromRaw` من حقول الصف
  - التحذيرات/التعارضات في الواجهة كما هي
  - `commitPendingCells` للحفظ
- الإبقاء على مسار Legacy كامل كـ fallback.
- تفضيل `lockClass` عند فحص القفل داخل خدمة الحفظ.
- اختبار مسار صف واحد.

## التوافق
- لا تغيير في نموذج البيانات أو RLS.
- واجهة `GSP.saveStudentRow` كما هي.

## الإصدار
`25.5.19`
