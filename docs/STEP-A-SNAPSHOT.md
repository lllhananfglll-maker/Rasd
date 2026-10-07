# لقطة المرحلة A — 26.0.0-dev

**الأرشيف:** `rasd-pro-26.0.0-dev-stepA.zip`  
**تاريخ:** 2026-10-07

## محتوى هذه اللقطة
- هوية خضراء: `css/tokens.css` + استبدال الألوان الأساسية
- إعداد Supabase للمشروع الحالي + `schoolId` / `multiTenant`
- `js/domain/school/tenant-context.js`
- `js/domain/calendar/term-calendar.js`
- PWA: manifest / sw / pwa-register
- وثائق: REFACTOR-FULL-PLAN · DEPLOY-GITHUB-SUPABASE
- اختبارات: tenant-context · term-calendar

## نقطة الانطلاق للمرحلة B
1. فك الضغط
2. `npm install`
3. ابدأ بربط الروزنامة المركزية بواجهة بيانات المدرسة والغياب/الطباعة

## استثناءات الأرشيف
- `node_modules/` (ثبّتها محلياً)
- `.git/` · `dist/` · ملفات مؤقتة
