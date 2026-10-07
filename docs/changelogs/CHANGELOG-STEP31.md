# STEP 31 — Sync Grades Filters to UI State on Change

## الهدف
جعل `gradesUIState` يتحدث مع كل تغيير للفلاتر (مادة / فصل / ترم / شهر)، وليس فقط عند الحفظ.

## ما تم
- إضافة `syncGradesFiltersToUIState()` و`GSP.syncGradesFiltersToUIState`.
- استدعاؤها من:
  - `onGradeSubjectSelectChange`
  - `onGradeClassSelectChange`
  - `loadGradesUI` (يشمل تغيّر الشهر عبر `data-event-action="loadGradesUI"`)
  - `handleGradeTermChange`
- إدراج الاسم في سجل Public API للدرجات.
- اختبارات لمسار مزامنة تغييرات الفلاتر.

## التوافق
- لا تغيير في نموذج البيانات أو RLS.
- سلوك تحميل جدول الدرجات كما هو.

## الإصدار
`25.5.21`
