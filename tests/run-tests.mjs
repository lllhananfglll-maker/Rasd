// Legacy regression runner — يشتغل مباشرة بـ `node tests/run-tests.mjs` بدون Vite/Vitest.
//
// STEP 51-FIX: النسخة القديمة كانت بتستورد كل ملف اختبار بمساره صراحة (hardcoded)، فكانت
// بتنكسر بمجرد ما ملف اختبار يتغيّر اسمه (زي ما حصل فعليًا بين الخطوة 45 والخطوة 51).
// النسخة دي بتكتشف كل ملفات tests/*.test.mjs تلقائيًا وتستوردها بالترتيب الأبجدي، فمفيش
// حاجة تتعدّل هنا لما تضيف/تعيد تسمية ملف اختبار مستقبلًا.
//
// كل ملف اختبار متوقّع إنه ينفّذ الفحوصات بتاعته كـ side effect وقت الاستيراد (زي ما هو
// معمول فعلاً في كل ملفات المشروع الحالية)، ويرمي (throw) لو فيه فشل.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ملفات مكتوبة فعليًا بصيغة vitest الحقيقية (describe/it) لازم تتشغل بـ `npx vitest run`
// مش هنا — بنتجاهلها هنا تلقائيًا بدل ما نسجّلها كفشل. شغّل `npm run test:vitest` ليها.
function isRealVitestFile(fullPath) {
  const head = readFileSync(fullPath, 'utf8').slice(0, 500);
  return /from ['"]vitest['"]/.test(head);
}

const allTestFiles = readdirSync(__dirname)
  .filter(f => f.endsWith('.test.mjs'))
  .sort();

const skippedVitestFiles = allTestFiles.filter(f => isRealVitestFile(path.join(__dirname, f)));
const testFiles = allTestFiles.filter(f => !skippedVitestFiles.includes(f));

if (skippedVitestFiles.length) {
  console.log('ملفات vitest حقيقية (تُشغَّل بـ `npm run test:vitest` بدل هذا السكربت):');
  skippedVitestFiles.forEach(f => console.log(`  - ${f}`));
}

if (testFiles.length === 0) {
  console.error('⚠️  لا توجد ملفات اختبار (tests/*.test.mjs) — تحقق من مسار المجلد.');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const failures = [];

for (const file of testFiles) {
  console.log(`\n=== ${file} ===`);
  try {
    await import(pathToFileURL(path.join(__dirname, file)).href);
    passed++;
  } catch (err) {
    failed++;
    failures.push({ file, err });
    console.error(`✗ ${file} فشل:`, err && err.message ? err.message : err);
  }
}

console.log('\n────────────────────────────────');
console.log(`ملفات الاختبار: ${passed} نجح، ${failed} فشل (من أصل ${testFiles.length})`);
if (failed > 0) {
  console.log('\nتفاصيل الفشل:');
  failures.forEach(({ file, err }) => {
    console.log(`  - ${file}: ${err && err.stack ? err.stack.split('\n')[0] : err}`);
  });
  console.log('\nAll tests passed ✗');
  process.exit(1);
} else {
  console.log('All tests passed ✓');
}
