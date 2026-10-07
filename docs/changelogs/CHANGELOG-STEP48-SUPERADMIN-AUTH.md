# CHANGELOG — Step 48: Superadmin عبر Supabase Auth

## الهدف
تقليل الاعتماد على هاش SHA-256 المخزّن/المزامَن، وجعل الدخول الأساسي لرئيس الكنترول عبر Auth.

## تغييرات الكود
1. `buildRootSecure` — لم يعد يرفع `superAdminPasswordHash` للسحابة (دائمًا null في الرفع).
2. `applyRemoteRootMeta` — لا يستورد الهاش من السحابة فوق المحلي (إلا ملء محلي فارغ من legacy).
3. `submitAdminAuth` — مع بريد + اتصال: مسار سحابي فقط؛ المحلي احتياطي بدون بريد / دون اتصال.

## SQL مرافق
`docs/step48-clear-cloud-hash.sql` — يحذف مفتاح الهاش من `root_secure` و `root_meta` إن وُجد.

## الاستخدام
- الدخول الموصى به: بريد `a.shafaie@hotmail.com` + كلمة سر حساب Auth في Supabase.
- المحلي (PIN المخزّن محليًا): احتياطي عند انقطاع الشبكة.

## ما لم يُحذف بعد
- الهاش المحلي على الجهاز (لطوارئ offline).
- يمكن لاحقًا إلغاء المحلي بالكامل بعد التأكد من Auth + MFA.
