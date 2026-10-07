# STEP 26 — Grades Lock Service + UI Adapter

## الهدف
تعميق مسار الدرجات: فصل طفرات الأقفال عن الـ DOM في Application Service، وإضافة UI Adapter للدرجات، مع الإبقاء على واجهات GSP العامة.

## ما تم
- إضافة `js/application/services/grades-lock-service.js`:
  - `toggleGlobal` / `toggleTerm` / `toggleMonth` / `toggleIndividual`
  - فحص صلاحية admin + قراءة snapshot
- تحديث `toggleGlobalLock` / `toggleTermLock` / `toggleMonthLockDirect` / `toggleLock` لتفويض الخدمة عند توفرها (مع fallback قديم).
- إضافة `js/ui/grades-ui-adapter.js`.
- تحديث `grades-composition.js` لحقن خدمة الأقفال.
- تحديث `js/features/grades/index.js` ليعرض `lock` + `ui`.
- اختبارات وحدة لخدمة الأقفال (admin / non-admin / term blocks month).

## التوافق
- لا تغيير في نموذج البيانات.
- لا تغيير في RLS.
- سلوك الأزرار و`data-action` كما هو.

## الإصدار
`25.5.16`
