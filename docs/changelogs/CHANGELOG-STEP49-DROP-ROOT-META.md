# CHANGELOG — Step 49: حذف root_meta القديم

## ما تم على قاعدة البيانات
```sql
DELETE FROM public.grade_system_state WHERE id = 'root_meta';
```

الصفوف المتبقية للجذر:
- `root_public` — stages + systemClosure
- `root_secure` — stageAdmins + stageMonitors (بدون هاش)

## كود
- `collectValidCloudRowIds` لم يعد يعتبر `root_meta` صفًا مطلوبًا في التنظيف.
- منطق القراءة ما زال يتحمل legacy إن ظهر صف قديم بالخطأ (توافق عكسي).

## الحالة الأمنية بعد الخطوات 46–49
| البند | الحالة |
|------|--------|
| فصل public/secure | تم |
| RLS + تنظيف سياسات قديمة | تم |
| تشديد stage_* | تم |
| إيقاف مزامنة هاش رئيس الكنترول | تم |
| حذف root_meta | تم |
| دخول superadmin عبر Auth | المسار الأساسي |
