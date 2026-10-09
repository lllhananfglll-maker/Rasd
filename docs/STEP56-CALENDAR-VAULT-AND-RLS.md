# STEP 56 — خزنة الروزنامة + إصلاح RLS

## التشخيص من Console
```
new row violates row-level security policy for table "grade_system_state"
code: 42501
```
هذا يعني أن **الرفع إلى Supabase مرفوض**. عند تسجيل الدخول يُسحَب من السحابة (نسخة قديمة بدون فتراتك) فيبدو أن الحفظ ضاع.

## الحل الجذري في الكود (تم)
1. **خزنة محلية** `localStorage: gsp_school_calendar_vault_v1` تُكتب عند كل حفظ روزنامة.
2. بعد أي `pullFromCloud` / `pullAllStagesFromCloud` تُعاد الخزنة إلى كل المراحل.
3. عند استبدال بيانات مرحلة من السحابة: إن كانت السحابة بلا `termCalendar` تُبقى النسخة المحلية.
4. `root_public.schoolCalendarVault` لرفع الروزنامة على مستوى الجذر.

## مطلوب منك مرة واحدة في Supabase SQL Editor
نفّذ محتوى الملف:
`docs/FIX-STATE-RLS-PERMISSIVE.sql`

أو الصق:

```sql
ALTER TABLE public.grade_system_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "state_deny_anon" ON public.grade_system_state;
CREATE POLICY "state_deny_anon" ON public.grade_system_state
  FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "state_select_auth" ON public.grade_system_state;
CREATE POLICY "state_select_auth" ON public.grade_system_state
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "state_insert_auth" ON public.grade_system_state;
CREATE POLICY "state_insert_auth" ON public.grade_system_state
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "state_update_auth" ON public.grade_system_state;
CREATE POLICY "state_update_auth" ON public.grade_system_state
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "state_delete_auth" ON public.grade_system_state;
CREATE POLICY "state_delete_auth" ON public.grade_system_state
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin')
  );
```

ثم تأكد أن صفك في `profiles` له `role = 'superadmin'` و`is_active = true`.

## بعد النشر
1. Ctrl+Shift+R
2. نفّذ SQL أعلاه في Supabase
3. احفظ الروزنامة مرة أخرى
4. في Console يجب ألا يظهر 42501
5. خروج → دخول → الفترات كما هي
