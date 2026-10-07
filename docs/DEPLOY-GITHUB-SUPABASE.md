# نشر رصد — GitHub + Supabase مجاني (المرحلة الحالية)

## 1) مستودع GitHub

```bash
cd grade-sys-pro-v2
git init
git add .
git commit -m "رصد 26.0.0-dev — هوية خضراء وأساس تعدد المدارس"
# أنشئ مستودعاً فارغاً على GitHub ثم:
git remote add origin https://github.com/USER/rasd-pro.git
git branch -M main
git push -u origin main
```

لا ترفع مفاتيح **service_role** أبداً. مفتاح `anon` / `sb_publishable_*` مخصص للواجهة ويمكن وضعه في الكود أو عبر:

```html
<script>
  window.GSP_RUNTIME_CONFIG = {
    supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
    supabasePublishableKey: 'sb_publishable_...'
  };
</script>
```

قبل تحميل سكربتات التطبيق.

## 2) Supabase (الخطة المجانية)

1. افتح [supabase.com](https://supabase.com) → New project.
2. انسخ **Project URL** و **anon / publishable key**.
3. نفّذ سكربتات `docs/step53-bootstrap.sql` وملفات RLS في `docs/` حسب ترتيب التوثيق الأمني.
4. في `js/application/services/configuration-service.js` أو عبر `GSP_RUNTIME_CONFIG` ضع قيم مشروعك.

**حدود الخطة المجانية (تقريبية):** مشروع واحد، قاعدة محدودة، مناسب لتجربة مدرسة أو عدد محدود من المستخدمين المتزامنين — وليس لمئات المدارس الإنتاجية.

## 3) استضافة الواجهة مجاناً

### خيار أ — Vercel (موصى به)
1. اربط مستودع GitHub بمشروع Vercel.
2. Framework: Other / Vite إن استخدمت `npm run build`، أو Static إن نشرت الملفات مباشرة.
3. Build: `npm run build` · Output: `dist` (إن وُجد إعداد Vite).
4. للملفات الثابتة بدون build: ارفع الجذر كما هو مع `index.html`.

### خيار ب — GitHub Pages
- Settings → Pages → Deploy from branch `main` / folder `/` أو `/docs`.
- يتطلب HTTPS (متوفر تلقائياً) لعمل PWA.

## 4) التحقق بعد النشر

- [ ] فتح الموقع على HTTPS
- [ ] تسجيل دخول محلي (PIN) يعمل offline
- [ ] اتصال Supabase (تبويب الحالة إن وُجد)
- [ ] تثبيت PWA من الموبايل (Android Chrome / iOS Safari)

## 5) لاحقاً: تشغيل عدد كبير من المدارس

عندما تحتاج استضافة تجارية:

| الطبقة | خيارات شائعة |
|--------|----------------|
| الواجهة | Vercel Pro / Cloudflare Pages / Netlify |
| قاعدة البيانات | Supabase Pro أو Team · أو Postgres مُدار (Neon, RDS) |
| العزل | `school_id` + RLS (جاهز في الكود عبر tenant-context) |
| النطاق | نطاق لكل مدرسة أو مسار `app.example.com/{school}` |

دليل تفصيلي للشراء والإعداد سيُضاف بعد استقرار 26.0.0 — اطلبه عند الجاهزية.
