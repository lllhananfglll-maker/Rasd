# إصلاح Failed to fetch (الدخول السحابي)

## السبب
1. **CSP** في `index.html` كانت تسمح فقط بمشروع Supabase القديم → المتصفح يحجب الطلب.
2. **عميل Supabase** لم يُربط من مكتبة CDN (`window.supabase` → `GSP.supabase`).
3. المفتاح يُفضَّل بصيغة **anon JWT** مع `@supabase/supabase-js@2` من CDN.

## ما تم إصلاحه
- `connect-src` → مشروع `wbanrokgolirwzuzafws` + `*.supabase.co`
- `js/auth/supabase-config.js` يقرأ `supabase` من CDN
- مفتاح anon JWT في الإعداد الافتراضي

## بعد الرفع إلى GitHub
1. `git add -A && git commit -m "fix: CSP + Supabase client bind" && git push`
2. انتظر دقيقة ثم حدّث الصفحة بقوة: Ctrl+Shift+R
3. إن فشل الدخول بـ «بيانات غير صحيحة»: أنشئ المستخدم من لوحة Supabase → Authentication → Users
4. للتجربة offline: اترك البريد فارغاً واستخدم الرقم السري المحلي فقط
