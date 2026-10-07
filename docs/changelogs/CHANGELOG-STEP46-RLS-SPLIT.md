# CHANGELOG — Step 46: RLS Full Fix — Split root_public / root_secure

## التاريخ
2026-09-05

## المشكلة
صف `root_meta` كان يخلط بيانات عامة (stages, systemClosure) مع بيانات حساسة (superAdminPasswordHash, stageAdmins, stageMonitors). مع `USING (true)` لأي authenticated → أي معلم يقرأ الهاش.

## الحل
### كود
- `js/features/cloud-sync.js`:
  - `buildRootPublic(root)` → stages + systemClosure
  - `buildRootSecure(root)` → hash + stageAdmins + stageMonitors
  - `buildRootMeta(root)` يبقى للتوافق (يدمج الاثنين)
  - `pullFromCloud` / `pullAllStagesFromCloud` يقرآن root_public + root_secure (+ legacy root_meta)
  - `runCloudPush` يرفع صفين منفصلين
  - `scheduleCloudPush` و `collectValidCloudRowIds` محدّثان
- `js/auth/login-ui.js`:
  - `refreshSystemClosureFromCloud` يقرأ من root_public فقط
  - `pushSystemClosureToCloud` يكتب root_public فقط (بدون هاش)

### RLS (`docs/supabase-rls.sql`)
| الصف | SELECT | INSERT/UPDATE |
|------|--------|---------------|
| root_public | أي authenticated | admin roles |
| root_secure | superadmin فقط | superadmin فقط |
| root_meta (قديم) | superadmin فقط | superadmin فقط |
| stage_* | أي authenticated | أي authenticated |
| anon | ممنوع | ممنوع |

### الترحيل
عند أول حفظ من superadmin بعد التحديث تُنشأ الصفوف الجديدة تلقائيًا. الصف القديم root_meta يبقى للقراءة (superadmin) حتى الحذف اليدوي الاختياري.

## التشغيل
```bash
npm install
npm run dev
```
ثم طبّق `docs/supabase-rls.sql` على Supabase.
