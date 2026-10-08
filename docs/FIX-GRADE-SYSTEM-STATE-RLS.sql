-- صلاحيات grade_system_state للمزامنة (نفّذ في SQL Editor مرة واحدة)
-- يسمح للمستخدم المسجّل (authenticated) بالقراءة والكتابة عند is_admin_role / superadmin

ALTER TABLE public.grade_system_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "state_deny_anon" ON public.grade_system_state;
CREATE POLICY "state_deny_anon" ON public.grade_system_state
  FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "state_select_auth" ON public.grade_system_state;
CREATE POLICY "state_select_auth" ON public.grade_system_state
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "state_insert_auth" ON public.grade_system_state;
CREATE POLICY "state_insert_auth" ON public.grade_system_state
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_role());

DROP POLICY IF EXISTS "state_update_auth" ON public.grade_system_state;
CREATE POLICY "state_update_auth" ON public.grade_system_state
  FOR UPDATE TO authenticated
  USING (public.is_admin_role())
  WITH CHECK (public.is_admin_role());

DROP POLICY IF EXISTS "state_delete_auth" ON public.grade_system_state;
CREATE POLICY "state_delete_auth" ON public.grade_system_state
  FOR DELETE TO authenticated USING (public.is_superadmin());

-- تحقق سريع
SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'grade_system_state';
