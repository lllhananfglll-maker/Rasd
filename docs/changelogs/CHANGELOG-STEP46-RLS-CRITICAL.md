# CHANGELOG — Step 46: RLS Critical Fix (Super Admin Hash Protection)

## التاريخ
2026-09-05

## المشكلة الحرجة
- تسجيل دخول رئيس الكنترول يعتمد على مقارنة SHA-256 محلية لهاش مخزّن في صف `root_meta`.
- سياسة RLS السابقة: `USING (true)` لأي مستخدم `authenticated`.
- أي معلم مصادق يقدر يقرأ الهاش ويكسره offline → Privilege Escalation كامل.

## التعديلات في هذه النسخة
1. **docs/supabase-rls.sql** — إعادة كتابة كاملة:
   - دوال مساعدة: `is_superadmin()` و `is_admin_role()`
   - SELECT على `root_meta` → superadmin فقط
   - صفوف `stage_*` تبقى للمصادقين
   - INSERT/UPDATE على `root_meta` مقصورة على superadmin
   - حماية كاملة ضد anon

2. **docs/SECURITY.md** — إضافة قسم CRITICAL يوثّق الثغرة والحل الفوري والحل المتوسط المدى.

## ملاحظات
- الكود نفسه لم يتغير بعد (لم نفصل systemClosure بعد).
- بعد تطبيق الـ SQL على Supabase، `refreshSystemClosureFromCloud()` ستفشل للمعلمين — يحتاج حل لاحق (فصل صف system_status).
- هذه نسخة "قبل الإصلاحات المقبلة" قابلة للتشغيل محليًا.

## التشغيل
```bash
npm install
npm run dev
```
