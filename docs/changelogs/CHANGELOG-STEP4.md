# Step 4 — Unit Tests for Critical Logic + Bug Fix

**Version:** 25.5.0-tests  
**Date:** 2026-09-04

## ما تم تنفيذه (الأفضل تجارياً الآن)

### 1. استخراج منطق نقي قابل للاختبار
- `js/core/grade-logic.js` — تجميع الدرجات، الأقفال، تصنيف المكوّنات، parseStrictGradeInput
- `js/core/pin-logic.js` — فحص قوة PIN (للاختبارات؛ الجلسة الحية تبقى في session.js)

### 2. اختبارات وحدة (31 اختباراً)
تشغيل بدون أي اعتماديات:
```bash
node tests/run-tests.mjs
```
أو لاحقاً مع Vitest: `npm test`

يغطي:
- aggregateAbsentAwareValues (متوسط/مجموع مع «غ»)
- تصنيف امتحان / حضور / أيام غياب
- isGradeEntryLocked (عام، فصل، شهر، فردي)
- parseStrictGradeInput (أرقام، غ، حدود، أرقام هندية)
- validatePinStrength (طول، أنماط ضعيفة)

### 3. باگ حقيقي اكتُشف وأُصلح بالاختبارات
بعد `normalizeArabic` (ة→ه) كان الـ regex يبحث عن «نسبة» فلا يطابق «نسبه».
النتيجة: مكوّن «نسبة الغياب» كان يُصنَّف خطأً كـ «أيام غياب» (مجموع بدل متوسط).
أُصلح في `app.js` و `grade-logic.js`.

## التشغيل
```bash
# الاختبارات
node tests/run-tests.mjs

# التطبيق
python3 -m http.server 5173
# أو افتح index.html
```
