# CHANGELOG — Step 47: Stage-scoped RLS

## الأهمية
تمنع أي حساب مصادق من قراءة/تعديل بيانات مراحل لا تخصه عبر `grade_system_state` حيث `id like 'stage_%'`.

## التغيير
- ملف جديد: `docs/supabase-rls-step47-stages.sql`
- دالة `can_access_stage_row(row_id)`
- SELECT/INSERT/UPDATE على `stage_*` مربوطة بـ `profiles.stage_ids` (+ superadmin كامل)

## ملاحظة تشغيلية
- حسابات المعلمين السحابية غير مُنشأة بعد → `stage_ids` فارغة للمعلمين → لن يقرأوا stages من السحابة حتى يُنشأ الحساب ويُملأ `stage_ids`.
- رئيس الكنترول (superadmin) غير متأثر.
- مسؤولو الحاسب / مديرو المراحل يعملون إذا كان `profiles.stage_ids` مملوءًا.

## التطبيق
1. نفّذ `docs/supabase-rls-step47-stages.sql` في SQL Editor
2. تأكد: `SELECT policyname FROM pg_policies WHERE tablename = 'grade_system_state'`
3. اختبر مزامنة من superadmin
