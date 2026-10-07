# STEP 27 — Grades Bulk Application Service

## الهدف
فصل منطق الرصد/المسح الجماعي للدرجات عن الـ DOM في Application Service قابل للاختبار، مع الإبقاء على واجهات GSP وسلوك التأكيد للمستخدم.

## ما تم
- إضافة `js/application/services/grades-bulk-service.js`:
  - `planBulkFullMarks` / `commitBulkFullMarks`
  - `planBulkClear` / `commitBulkClear`
  - استبعاد الدرجة الشهرية ومكونات الحضور من التعبئة الكاملة
- `bulkFillFullMarks` و `bulkClearClassGrades` يفوّضان للخدمة عند توفرها (مع fallback).
- حقن الخدمة من `grades-composition.js` كـ `GSP.application.gradesBulk`.
- اختبارات وحدة للخطة والتنفيذ والتخطي والمنع عند القفل.
- يتضمن إصلاح نافذة Teacher Daily (`.tda-overlay.hidden`).

## التوافق
- لا تغيير في نموذج البيانات.
- لا تغيير في RLS.
- رسائل التأكيد وواجهة المستخدم كما هي.

## الإصدار
`25.5.17`
