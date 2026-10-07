import { defineConfig } from 'vitest/config';

// STEP 51-FIX: معظم ملفات tests/*.test.mjs مكتوبة بأسلوب قديم (تنفيذ فحوصات كـ side effect
// عند الاستيراد، بدون describe/it) وتُشغَّل عبر `npm test` (tests/run-tests.mjs عبر node
// مباشرة)، مش عبر vitest. لو سبنا vitest يحاول يشغّلهم كلهم، هيفشل بـ "No test suite found"
// لكل ملف منهم. القائمة هنا هي الملفات المكتوبة فعليًا بصيغة vitest الحقيقية فقط —
// أضف أي ملف جديد هنا بمجرد ما تحوّله فعليًا لـ describe/it.
export default defineConfig({
  test: {
    include: ['tests/grade-logic.test.mjs']
  }
});
