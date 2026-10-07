# نظام رصد درجات أعمال السنة — Pro

**Offline-first SPA** (Vanilla JS) · IndexedDB + مزامنة Supabase اختيارية

**الإصدار:** 26.0.0-dev · **الهوية:** أخضر رصد · **جاهزية:** تعدد مدارس (أساس)

> خطة إعادة الهيكلة: [`docs/REFACTOR-FULL-PLAN.md`](./docs/REFACTOR-FULL-PLAN.md)  
> نشر GitHub + Supabase مجاني: [`docs/DEPLOY-GITHUB-SUPABASE.md`](./docs/DEPLOY-GITHUB-SUPABASE.md)

---

## تشغيل سريع

### بدون تثبيت
```bash
python3 -m http.server 5173
# افتح http://localhost:5173
```

أو افتح `index.html` مباشرة في المتصفح.

### باستخدام Vite (موصى به للتطوير)
```bash
npm install
npm run dev       # خادم تطوير على :5173
npm run build     # مخرجات في dist/
npm run preview   # معاينة البناء
npm run check     # lint + test + build
```

---

## الاختبارات
```bash
npm test                  # Vitest
node tests/run-tests.mjs  # الاختبارات القديمة (legacy)
```

---

## البنية الرئيسية

```
js/
  core/          storage · utils · ui-modal · grade-logic · version
  auth/          supabase · session · login-ui
  features/      grades · attendance · monitor · import-export · cloud-sync · print
  app/           state وخدمات التطبيق
  domain/        منطق نقي (grades, attendance, monitor)
docs/
  changelogs/    تفاصيل كل خطوة تطوير
  SECURITY.md    وثائق الأمان وRLS
  ROADMAP-SECURITY.md
  PRODUCTION-CHECKLIST.md
tests/           اختبارات الوحدة
```

---

## الأمان (بعد Steps 46–49)

| البند | الحالة |
|------|--------|
| فصل `root_public` / `root_secure` | ✅ |
| RLS + سياسات stage-scoped | ✅ |
| دخول Superadmin عبر Supabase Auth | ✅ (المسار الأساسي) |
| إيقاف مزامنة هاش رئيس الكنترول | ✅ |
| حذف `root_meta` نهائياً | ✅ |

التفاصيل الكاملة في `docs/SECURITY.md` و`docs/ROADMAP-SECURITY.md`.

---

## ملاحظات مهمة

- النظام **Offline-first**: يعمل بدون إنترنت، والمزامنة السحابية اختيارية.
- PIN محلي لا يزال متاحاً كاحتياطي عند انقطاع الشبكة.
- CSP مفعّلة (مع `unsafe-inline` بسبب بعض الـ onclick — يُعالَج تدريجياً).
- الهيكل الحالي يعتمد على IIFE + `window.*`؛ يمكن التحويل التدريجي لوحدات ES لاحقاً.

---

## الإصدارات

انظر [`CHANGELOG.md`](./CHANGELOG.md) للتاريخ الكامل.
