# STEP 20 — Attendance Legacy Capability Boundary

## الهدف
إنشاء حد معماري واضح بين طبقات النظام الحديثة وبين الـ Legacy Global APIs، بحيث تكون عملية اكتشاف الاعتماديات القديمة محصورة في Composition Root بدلاً من تكرار `window/GSP` resolution داخل الطبقات المختلفة.

## ما تم تنفيذه
- إضافة `js/application/ports/attendance-legacy-boundary.js` كـ Capability Boundary لنظام الحضور.
- نقل عملية `resolve/requireFn` الخاصة بالاعتماديات القديمة إلى نقطة واحدة.
- جعل Composition Root يستهلك Capability Object مجمداً بدلاً من البحث المباشر المتكرر عن الاعتماديات.
- الحفاظ على أولوية `GSP` الحالية ثم fallback إلى `window` للحفاظ على التوافق.
- عدم تغيير نموذج البيانات أو IndexedDB أو Supabase أو RLS.
- عدم تغيير سلوك المستخدم أو واجهات النظام المقصودة.
- إضافة اختبار مستقل للـ Legacy Boundary وحقن الاعتماديات وFrozen Capability Object.

## التحقق
- Custom test suite: **67 passed / 0 failed**.
- Standalone boundary test: **6 passed / 0 failed**.
- JavaScript syntax checks: **all passed**.
- Local script references: **all resolved**.
