# هيكل المشروع — نظام رصد درجات أعمال السنة Pro

الإصدار: **25.3.0**

## المصادقة `js/auth/`

| ملف | الدور |
|-----|--------|
| `supabase-config.js` | URL/مفتاح/عميل Supabase |
| `cloud-auth.js` | بريد المعلم، PIN→كلمة مرور، provision، cloudSignIn |
| `session.js` | جلسة محلية، PIN، ثروتل فشل الدخول، sha256 |
| `login-ui.js` | شاشات الدخول + logout |

## تصدير المعلمين لإنشاء الحسابات (SQL)

من حساب **رئيس الكنترول** استدعِ:

```js
exportSystemDirectoryExcel()
```

يصدّر Excel يتضمن أسماء المعلمين ومعرّفاتهم والبريد السحابي المقترح (`teacherCloudEmail`) لاستخدامه في كتابة SQL لإنشاء الحسابات.

## ترتيب التحميل

core → **auth** → app → features → v20… → attendance → monitor-shell

## STEP 11 feature boundary
- `js/features/attendance/teacher-daily.js` owns teacher-facing daily attendance workflow.
- `js/domain/attendance/workday-policy.js` owns the pure school-workday policy.
- `js/app/state.js` remains the owner of session state and exposes a read-only teacher getter to features.

- `js/application/services/offline-sync-reliability.js` — STEP 36 offline/online retry and recovery orchestration.
