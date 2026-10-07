# Step 5 — Vite Foundations

**Version:** 25.5.1-vite

## ما تم
- `vite.config.js` محدّث ومتوافق مع ESM (`import.meta.url`)
- `base: './'` لدعم النشر من مجلد فرعي أو file://
- `.gitignore` لـ node_modules و dist
- `README.md` بتعليمات واضحة
- السكربتات: `dev` / `build` / `preview` / `serve` / `test`

## التشغيل محلياً
```bash
npm install
npm run dev
```

بيئة الـ sandbox هنا تواجه أخطاء I/O مع npm؛ التثبيت يعمل على جهازك المحلي بشكل طبيعي.

التطبيق **يعمل بدون Vite** كما كان (python server أو فتح index.html).
