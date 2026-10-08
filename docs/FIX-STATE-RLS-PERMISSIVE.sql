-- صلاحيات أوضح لجدول المزامنة (مرة واحدة في SQL Editor)
-- إن استمرت المشكلة بعد is_admin_role، هذا الإصدار يسمح لأي authenticated بالكتابة مؤقتاً للتشخيص

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active IS DISTINCT FROM false
      AND p.role = 'superadmin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_role()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active IS DISTINCT FROM false
      AND p.role IN ('superadmin','stageadmin','monitor')
  );
$$;

-- منح تنفيذ الدوال
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_role() TO authenticated;

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
  FOR DELETE TO authenticated USING (public.is_superadmin());

-- اختبار يدوي (اختياري): يجب أن ينجح وأنت مسجّل دخولاً من التطبيق
-- INSERT INTO public.grade_system_state (id, data) VALUES ('test_ping', '{}'::jsonb)
-- ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now();
