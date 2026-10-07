# STEP 32 — Application Context & Dependency Composition

## الهدف
إنشاء نقطة موحدة لتجميع مكونات الـ Application بعد اكتمال Composition Roots، بحيث تستطيع طبقات الـ Feature استهلاك dependencies من Context ثابت بدل تكرار الوصول إلى `GSP.application` و`GSP.infrastructure`.

## ما تم
- إضافة `js/application/composition/application-context.js`.
- إنشاء `GSP.application.context` كـ immutable application context.
- تنظيم السياق إلى:
  - `domain`
  - `application`
  - `infrastructure`
  - `ports`
  - `ui`
  - `features`
- إضافة `GSP.application.createContext()` لإعادة بناء snapshot عند الحاجة أثناء التطوير/الترحيل.
- تحديث Facades الخاصة بـ Grades وAttendance وMonitor لاستخدام الـ Context أولًا مع fallback توافق Legacy.
- لم يتم حذف أو تغيير أي Public GSP API مستخدم بواسطة HTML/data-action.
- لم يتم تغيير نموذج البيانات أو IndexedDB.
- لم يتم تعديل Supabase RLS أو الصلاحيات الخلفية.

## الاختبارات
- تمت إضافة اختبارات Context مستقلة للتحقق من:
  - تجميع الخدمات والـ repositories.
  - ثبات/freeze السياق.
  - أولوية Context داخل Feature Facades.
  - استمرار fallback إلى Legacy عند غياب Context.

## الإصدار
`25.5.22`
