# STEP 30 — Grades UI State Service

## الهدف
فصل حالة فلاتر تبويب الدرجات (مادة / فصل / ترم / شهر) عن الاعتماد المباشر على قراءة DOM في مسارات الحفظ، على غرار Attendance UI State.

## ما تم
- إضافة `js/application/services/grades-ui-state.js`:
  - `get` / `set` / `reset` / `syncFromDom` / `isComplete`
  - تطبيع `term` و`month`
- حقن `GSP.application.gradesUIState` من composition.
- مزامنة الحالة من DOM داخل `saveAllGrades` و`saveStudentRow` قبل الحفظ.
- تعريض `uiState` عبر `GSP.features.grades`.
- اختبارات وحدة للحالة والتطبيع.

## التوافق
- لا تغيير في نموذج البيانات أو RLS.
- سلوك الرصد كما هو؛ الحالة طبقة إضافية فوق DOM الحالي.

## الإصدار
`25.5.20`
