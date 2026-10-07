# خطة إعادة الهيكلة الكاملة — رصد Pro

**الإصدار المستهدف:** 26.0.0  
**الهوية البصرية:** أخضر رصد (`#0b5e42` / `#064e3b` / `#16a34a`)  
**نموذج التشغيل الحالي:** مشروع Supabase مجاني واحد + نشر عبر GitHub (GitHub Pages / Vercel مجاني)  
**المستقبل:** تعدد مدارس (multi-tenant) جاهز للترقية لاستضافة تجارية

---

## 1) المبادئ

| مبدأ | التفصيل |
|------|---------|
| Offline-first | IndexedDB محلياً؛ المزامنة اختيارية |
| فصل الطبقات | `domain` منطق نقي · `application` حالات استخدام · `infrastructure` تخزين/سحابة · `features`/`ui` واجهة |
| مدرسة واحدة الآن | `schoolId` ثابت في الإعداد؛ البنية تدعم لاحقاً عدة مدارس بدون إعادة كتابة المنطق |
| هوية خضراء | كل الألوان الأساسية عبر CSS variables — لا ألوان ثابتة متناثرة |
| اختبارات | كل طبقة domain + خدمات حرجة لها اختبارات Vitest |
| تنظيف تدريجي | كل خطوة تُشغَّل (`npm run check`) ولا تكسر السلوك |

---

## 2) هيكل الملفات المستهدف

```
grade-sys-pro-v2/
├── index.html                 # هيكل الصفحة فقط + تحميل الوحدات
├── manifest.webmanifest
├── sw.js
├── pwa-register.js
├── package.json
├── vite.config.js
├── css/
│   ├── tokens.css             # ★ متغيرات الهوية (أخضر رصد)
│   ├── base.css               # تخطيط عام (يستورد tokens)
│   ├── attendance.css
│   ├── monitor-shell.css
│   ├── teacher-daily-attendance.css
│   ├── print.css              # أنماط الطباعة
│   └── pwa.css
├── icons/
│   ├── rasd-icon-192.png
│   └── rasd-icon-512.png
├── js/
│   ├── core/                  # وقت التشغيل، تخزين، أدوات، إصدار
│   ├── auth/                  # جلسة، دخول، Supabase client
│   ├── domain/                # منطق نقي بلا DOM
│   │   ├── grades/
│   │   ├── attendance/
│   │   ├── calendar/          # ★ روزنامة مركزية
│   │   ├── monitor/
│   │   └── school/            # ★ سياق المدرسة / tenant
│   ├── application/           # خدمات + composition
│   ├── infrastructure/        # مستودعات، adapters
│   ├── features/              # وحدات الميزات (UI + تنسيق)
│   ├── ui/                    # adapters واجهة
│   └── app/                   # state، init، school-info
├── tests/
└── docs/
```

---

## 3) مراحل التنفيذ

### المرحلة A — الأساس (هذه الدفعة)
- [x] وثيقة الخطة
- [ ] `css/tokens.css` — هوية خضراء كاملة
- [ ] ربط `base.css` بالمتغيرات
- [ ] تحديث `configuration-service` لمشروع Supabase الحالي + `schoolId`
- [ ] `domain/school/tenant-context.js` — سياق المدرسة
- [ ] رفع الإصدار إلى 26.0.0-dev
- [ ] PWA ملفات في الجذر

### المرحلة B — الروزنامة والغياب
- نقل منطق الروزنامة المركزية من الـ monolith → `domain/calendar` + `features/calendar`
- ربط الغياب الأسبوعي والطباعة بالروزنامة
- اختبارات domain للتقويم

### المرحلة C — تنظيف الواجهة
- دمج أجزاء `grades-ui.part0x` و`print-sheets.part0x` و`import-export.part0x`
- تحويل باقي `onclick` → `data-action`
- إزالة تكرار الألوان لصالح tokens

### المرحلة D — تعدد المدارس (جاهزية)
- عمود/`school_id` في نماذج البيانات المحلية والسحابية
- RLS سياسات حسب `school_id` (عند الترقية)
- شاشة اختيار المدرسة لـ platform admin فقط

### المرحلة E — النشر
- README: GitHub + Vercel/Pages + Supabase free
- PRODUCTION-CHECKLIST محدّث
- دليل لاحق للاستضافة التجارية متعددة المدارس

---

## 4) نموذج البيانات للمدرسة (tenant)

```js
// domain/school/tenant-context.js (مفهوم)
{
  schoolId: 'default',           // الآن ثابت؛ لاحقاً من الجلسة
  schoolName: '...',
  stageIds: ['primary', ...],
  features: { cloudSync: true, pwa: true }
}
```

- التخزين المحلي: مفتاح IndexedDB يمكن أن يصبح `gradeSystemPro:{schoolId}` عند تفعيل multi-tenant.
- السحابة: كل صف في الجداول يحمل `school_id`؛ RLS: `school_id = auth.jwt() -> school_id`.

---

## 5) قواعد المساهمة أثناء إعادة الهيكلة

1. لا تضف منطقاً جديداً داخل `index.html` — فقط markup وربط سكربتات.
2. أي قاعدة أعمال (درجات، غياب، تقويم) → `js/domain/`.
3. أي استدعاء Supabase/IndexedDB → `js/infrastructure/` أو خدمات application موجودة.
4. الألوان من `var(--rasd-*)` فقط.
5. بعد كل مجموعة ملفات: `npm run test` إن أمكن.

---

## 6) ما لن نفعله الآن

- لا شراء استضافة مدفوعة في هذه المرحلة.
- لا تقسيم قاعدة بيانات لكل مدرسة على Supabase free (مشروع واحد كافٍ للتجربة).
- لا إعادة كتابة الإطار إلى React/Vue — الإبقاء على Vanilla + طبقات نظيفة.
