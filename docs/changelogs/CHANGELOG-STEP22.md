# STEP 22 — Feature UI Adapter Boundaries

## الهدف
تقليل اعتماد طبقة Feature مباشرة على Legacy UI/Controller globals، مع الحفاظ على التوافق والسلوك الحالي.

## ما تم
- إضافة `js/ui/attendance-ui-adapter.js` كحد UI واحد لـ Attendance.
- إضافة `js/ui/monitor-ui-adapter.js` كحد UI واحد لـ Monitor.
- تحديث Attendance Feature Facade لاستخدام UI adapter بدل الوصول المباشر إلى legacy controller globals.
- تحديث Monitor Feature Facade بنفس الأسلوب.
- الحفاظ على الـ GSP legacy entry points الحالية وعدم حذف أي API عام.
- إضافة ملفات الـ adapters إلى ترتيب تحميل `index.html` بعد الـ legacy controllers وقبل feature facades.
- لم يتم تغيير Supabase RLS أو الصلاحيات الخلفية.

## التحقق
- سيتم تشغيل اختبارات المشروع وفحص syntax ومراجع السكربتات قبل إصدار الحزمة.
