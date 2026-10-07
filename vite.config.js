import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// STEP 51-FIX: المشروع كله عبارة عن سكربتات كلاسيكية (<script src="js/...">) بدون
// نظام وحدات (modules) حقيقي — عدا استثناء واحد صغير (js/domain/grades/grade-rules.js).
// Vite بيبني فقط الملفات اللي بيقدر يحللها كموديولز، وبيتجاهل باقي السكربتات الكلاسيكية
// تمامًا من غير تحذير واضح يوقف العملية — فكان الناتج (dist/) بيطلع فاضي عمليًا (3 ملفات
// بس) بينما index.html بيشاور على أكتر من 100 ملف JS مش موجودين فيه، فيفشل التطبيق بالكامل
// عند النشر. الحل هنا: ننسخ js/ وcss/ زي ما هما بالظبط لجوه dist/، عشان تفضل نفس المسارات
// النسبية اللي في index.html شغالة بعد البناء تمامًا زي وضع التطوير.
//
// ⚠️ هذا إصلاح عملي (يخلي dist/ قابل للنشر فعليًا) وليس إصلاحًا معماريًا — التحويل الحقيقي
// لنظام ES modules الكامل يفضل مطلوبًا كخطوة تنظيف منفصلة لاحقًا (راجع docs/ARCHITECTURE.md).

export default defineConfig({
  build: {
    // نخلي Vite يبني ملف الدخول (index.html) والموديول الحقيقي الوحيد بشكل طبيعي
    rollupOptions: {
      input: 'index.html'
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'js', dest: '.' },
        { src: 'css', dest: '.' }
      ]
    })
  ]
});
