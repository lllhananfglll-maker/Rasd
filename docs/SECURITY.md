# أمان النظام — PIN، 2FA، RLS، النسخ الاحتياطي

## 0) CRITICAL: حماية هاش رئيس الكنترول (أيلول 2026)

### الثغرة
تسجيل دخول رئيس الكنترول يعتمد على مقارنة SHA-256 محلية لهاش كان مخزّنًا في صف `root_meta` المختلط داخل `grade_system_state` مع بيانات عامة (`stages`, `systemClosure`).

الـ RLS السابق كان يسمح لأي مستخدم `authenticated` بقراءة الصف كاملًا → أي معلم يقدر يجيب الهاش ويكسره offline → Privilege Escalation كامل.

### الحل المطبق (كود + RLS)

**فصل البيانات إلى صفين:**

| الصف | المحتوى | من يقرأ | من يكتب |
|------|---------|---------|---------|
| `root_public` | stages + systemClosure | أي مصادق | admin roles |
| `root_secure` | superAdminPasswordHash + stageAdmins + stageMonitors | **superadmin فقط** | **superadmin فقط** |
| `root_meta` (قديم) | الكل مختلط | superadmin فقط (ترحيل) | superadmin فقط |

**ملفات معدّلة:**
- `js/features/cloud-sync.js` — `buildRootPublic` / `buildRootSecure` / سحب ورفع منفصل
- `js/auth/login-ui.js` — `refreshSystemClosureFromCloud` و `pushSystemClosureToCloud` تستخدمان `root_public` فقط
- `docs/supabase-rls.sql` — سياسات SELECT/INSERT/UPDATE حسب الصف

### الترحيل
1. طبّق `docs/supabase-rls.sql` على Supabase
2. سجّل دخول كـ superadmin واعمل أي حفظ → يُنشأ `root_public` + `root_secure` تلقائيًا
3. (اختياري) احذف صف `root_meta` القديم بعد التأكد

### الحل المتوسط المدى (مستقبلاً)
رئيس الكنترول يستخدم Supabase Auth الحقيقي بدل هاش محلي — يلغي المخاطرة من جذورها.

---

## 1) تقوية PIN (مطبّق في الكود)

| الدور | الحد الأدنى |
|-------|-------------|
| معلم | 8 خانات |
| مسؤول حاسب / مدير مرحلة / رئيس كنترول (عند تغيير PIN) | **10 خانات** |

- رفض الأنماط الضعيفة (تكرار، تسلسل).
- **Step-up verification**: قبل حذف مدير مرحلة أو دمج مراحل مكررة يُطلب إعادة إدخال كلمة سر رئيس الكنترول.
- اشتقاق كلمة مرور السحابة: **v3 = SHA-256** عند الإنشاء؛ الدخول يجرب v3 + v2 + PIN الخام للتوافق.

### إلغاء تخزين الرقم السري كنص صريح (Step 51)
- لا يُحفظ حقل `pin` في IndexedDB ولا في المزامنة السحابية — **`pinHash` فقط**.
- عند التوليد/إعادة التوليد: يُعرض الرقم **مرة واحدة** مع زر «طباعة البطاقة الآن» من الذاكرة.
- تنظيف تلقائي لأي `pin` قديم عند التحميل والحفظ (`stripPlaintextPins`).
- إنشاء حسابات مسؤول الحاسب ومدير المرحلة: **حصرياً لرئيس الكنترول**.
- التغيير الذاتي لرقمهم: مسموح بعد إدخال الرقم الحالي + قوة عالية + عرض مرة واحدة.
- طباعة بطاقة لاحقاً تتطلب إعادة توليد رقم جديد (مقصود أمنياً).

### ما ليس 2FA كاملاً؟
التحقق الإضافي (step-up) يقلل مخاطر الجلسة المفتوحة، لكنه **ليس** TOTP/SMS.
لتفعيل 2FA حقيقي على حسابات الإدارة السحابية:

1. Supabase Dashboard → Authentication → Providers / MFA  
2. فعّل TOTP للمستخدمين الإداريين  
3. سجّل دخول المدير بالبريد السحابي + تطبيق المصادقة

لا يمكن فرض MFA من كود الواجهة وحده — يجب من جهة GoTrue/Supabase.

---

## 2) RLS (Row Level Security)

ملف جاهز للتنفيذ: `docs/supabase-rls.sql`

### خطوات التطبيق
1. افتح SQL Editor في مشروع Supabase
2. راجع أسماء الأعمدة في `profiles` (`id` vs `user_id`) وتأكد أن قيم `role` تشمل `'superadmin'`
3. نفّذ السكربت على بيئة تجريبية أولاً
4. سجّل دخول superadmin من الواجهة واحفظ مرة → ترحيل تلقائي لـ root_public / root_secure
5. اختبر من حساب **معلم**:
   ```sql
   SELECT * FROM grade_system_state WHERE id = 'root_secure';  -- 0 صفوف
   SELECT * FROM grade_system_state WHERE id = 'root_public';  -- صف بدون هاش
   ```
6. اختبر مزامنة مرحلة (`stage_*`) ورسالة systemClosure

---

## 3) النسخ الاحتياطي

### محلياً (من الواجهة)
رئيس الكنترول → نسخة احتياطية كاملة (JSON) واستعادة.

**توصية تشغيلية:** نسخة أسبوعية على الأقل قبل أي استيراد كبير أو نهاية شهر.

### على Supabase
1. Dashboard → Project Settings → Database  
2. فعّل **Point-in-Time Recovery (PITR)** إن كانت الخطة تدعمه  
3. أو جدول نسخ احتياطي يومي من لوحة المشروع / مزود الاستضافة  
4. اختبر الاستعادة على مشروع staging مرة كل فصل دراسي

### Storage
ملفات الإكسيل في bucket منفصل — تأكد من سياسات الـ bucket (لا public بدون مصادقة).

---

## 4) حدود المعدل (Rate limits)
- الواجهة فيها throttle محلي فقط (يمكن تجاوزه من DevTools).
- الحماية الحقيقية: **Auth → Rate Limits** في Supabase + Captcha اختياري.
