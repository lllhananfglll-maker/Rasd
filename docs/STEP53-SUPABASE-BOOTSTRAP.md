# STEP 53 — Supabase New Project Bootstrap & Verification

## الهدف
تهيئة مشروع Supabase الجديد بالكامل قبل نشر Grade System Pro، مع منع تكرار مشكلة أن الواجهة تتصل بالمشروع بينما الجداول أو RLS أو Storage غير مهيأة.

## المشروع المستهدف
- Supabase URL: `https://gxeqnmrakbrtychnfmvg.supabase.co`
- Client credential: `sb_publishable_...` الموجود في إعدادات التطبيق
- Storage bucket: `workbook-originals`

## ما الذي ينفذه Step 53؟
1. إنشاء/تأكيد جداول `grade_system_state`, `profiles`, `audit_events`.
2. تفعيل RLS.
3. إنشاء دوال صلاحيات آمنة تعتمد على `auth.uid()`.
4. فصل صلاحيات `root_public` و`root_secure`.
5. ربط صفوف `stage_*` بـ `profiles.stage_ids`.
6. ضبط `audit_events` للكتابة للمستخدم المصادق والقراءة للإدارة فقط.
7. إنشاء Storage bucket خاص `workbook-originals`.
8. تقييد Storage حسب المرحلة بدلاً من فتح bucket لكل المستخدمين المصادقين.
9. توحيد `stage_ids` على JSONB array بما يتوافق مع مولد SQL الموجود في التطبيق.
10. إضافة استعلامات تحقق بعد التنفيذ.

## طريقة التنفيذ
### 1. افتح Supabase
Supabase Dashboard → SQL Editor → New query.

### 2. نفّذ
`docs/step53-bootstrap.sql`

### 3. تحقق
نفّذ `docs/step53-verification.sql`.

### 4. أنشئ المستخدمين
من Authentication → Users أنشئ حساب Superadmin أولاً، ثم أنشئ صفه في `profiles` باستخدام UUID الحقيقي للمستخدم.

مثال:
```sql
INSERT INTO public.profiles
  (id, role, full_name, email, stage_ids, is_active)
VALUES
  ('AUTH-USER-UUID', 'superadmin', 'رئيس الكنترول', 'admin@example.com', '[]'::jsonb, true)
ON CONFLICT (id) DO UPDATE
SET role='superadmin', is_active=true;
```

لا تضع كلمة المرور في SQL أو داخل المشروع.

## اختبار القبول
### Superadmin
- تسجيل الدخول عبر Supabase Auth ينجح.
- قراءة `root_public` تنجح.
- قراءة `root_secure` تنجح.
- إنشاء/تحديث `stage_*` ينجح.
- رفع/تنزيل/حذف workbook ينجح.
- قراءة `audit_events` تنجح.

### Teacher / Stage Admin / Monitor
- تسجيل الدخول عبر Supabase Auth ينجح.
- يرى فقط المراحل الموجودة في `profiles.stage_ids`.
- لا يستطيع قراءة `root_secure`.
- لا يستطيع قراءة أو تعديل مرحلة أخرى.
- لا يستطيع قراءة سجل التدقيق الكامل.
- يستطيع إنشاء audit event.

### Anonymous
- لا يستطيع قراءة `grade_system_state`.
- لا يستطيع الوصول إلى `profiles` أو `audit_events` أو Storage.

## نقطة مهمة تم اكتشافها أثناء إعداد Step 53
كان هناك تعارض بين Step 47 ومولد `profiles` الموجود في النظام: مولد الحسابات يتعامل مع `stage_ids` كـ JSONB، بينما دالة Step 47 القديمة كانت تفترض إمكانية تحويلها مباشرة إلى `text[]`. Step 53 يوحّد العقد على JSONB ويستخدم عامل `?` لاختبار وجود stage ID داخل المصفوفة.

كما تم توحيد fallback الخاص بـ Storage bucket مع إعداد `workbook-originals` بدلاً من fallback قديم باسم `grade-system-workbooks`.

## ممنوع
- لا تستخدم Direct Connection String داخل `index.html` أو JavaScript.
- لا تضع كلمة مرور PostgreSQL في Vercel client-side variables.
- لا تجعل `workbook-originals` public.
- لا تمنح `authenticated` سياسة عامة لقراءة كل `grade_system_state`.

## معيار النجاح النهائي
Step 53 ناجح فقط إذا نجحت استعلامات التحقق، ثم نجحت اختبارات الدخول والمراحل وStorage والمزامنة من متصفح نظيف.
