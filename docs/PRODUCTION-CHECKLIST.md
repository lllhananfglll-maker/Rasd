# قائمة تحقق الإنتاج — Grade System Pro 25.6.0

استخدم هذه القائمة قبل أي نشر أو تسليم نهائي.

## 1. الإصدار والتوثيق
- [ ] رقم الإصدار موحّد في `package.json` و `js/core/version.js` و `README.md`
- [ ] `CHANGELOG.md` محدّث ويعكس آخر التغييرات
- [ ] ملفات `CHANGELOG-STEP*.md` موجودة فقط داخل `docs/changelogs/`

## 2. الأمان وقاعدة البيانات (Supabase)
- [ ] تم تنفيذ `docs/step53-bootstrap.sql` في مشروع Supabase الجديد
- [ ] تم تنفيذ `docs/step53-verification.sql` بنجاح
- [ ] ملفات RLS القديمة (`supabase-rls.sql` / Step 47) لا تُعاد فوق Bootstrap الجديد إلا عند تنفيذ migration مقصود
- [ ] تم تنفيذ `docs/step48-clear-cloud-hash.sql` فقط إذا كانت هناك بيانات legacy تحتاج ذلك
- [ ] صف `root_meta` غير موجود (أو محذوف)
- [ ] صفوف `root_public` و `root_secure` موجودة وتعمل
- [ ] حساب Superadmin يعمل عبر Supabase Auth
- [ ] اختبار من حساب معلم: لا يمكن قراءة `root_secure`
- [ ] اختبار stage-scoped: المعلم يرى فقط مراحله

## 3. الوظائف الأساسية
- [ ] الدخول المحلي (PIN) يعمل offline
- [ ] الدخول السحابي (Superadmin) يعمل
- [ ] رصد الدرجات + الحفظ المحلي
- [ ] المزامنة السحابية (pull / push)
- [ ] الحضور والغياب
- [ ] التصدير / الاستيراد
- [ ] الطباعة
- [ ] النسخ الاحتياطي المحلي (JSON) والاستعادة

## 4. الجودة
- [ ] `npm run check` ينجح (lint + test + build)
- [ ] لا توجد أخطاء ظاهرة في Console أثناء الاستخدام العادي
- [ ] البناء (`npm run build`) ينتج مجلد `dist/` صالح

## 5. النشر
- [ ] رفع الملفات إلى الاستضافة (أو استخدام `dist/`)
- [ ] التأكد من أن متغيرات Supabase (URL + anon key) صحيحة في بيئة الإنتاج
- [ ] اختبار نهائي من جهاز مختلف / متصفح مختلف

## 6. ما بعد النشر (اختياري)
- [ ] تفعيل MFA (TOTP) لحسابات الإدارة من لوحة Supabase
- [ ] إنشاء حسابات المعلمين السحابية وملء `profiles.stage_ids`
- [ ] إعداد `audit_log` إذا لزم

---

**آخر تحديث:** 2026-09-06 (Step 50)

## 7. STEP 53 — New Supabase Project Bootstrap
- [ ] `docs/step53-bootstrap.sql` executed successfully in the NEW project
- [ ] `docs/step53-verification.sql` returns all required tables/functions/policies
- [ ] `workbook-originals` exists and is private
- [ ] Superadmin Auth user exists and has `profiles.role = 'superadmin'`
- [ ] Teacher/StageAdmin/Monitor profiles have correct JSONB `stage_ids`
- [ ] Teacher cannot read `root_secure`
- [ ] Stage-scoped user cannot read another stage row
- [ ] Workbook upload/download/delete tested
- [ ] Audit insert + admin read tested
- [ ] Clean-browser login + cloud sync tested
