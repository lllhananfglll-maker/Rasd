-- ============================================================
-- Step 47: تشديد RLS على صفوف stage_* حسب profiles.stage_ids (JSONB array contract)
-- NOTE: Step 53 is the canonical bootstrap for a new project. This file remains for historical migrations.
-- نفّذ بعد نجاح Step 46 (root_public / root_secure)
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_stage_row(row_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid text;
  allowed boolean := false;
BEGIN
  IF public.is_superadmin() THEN
    RETURN true;
  END IF;

  IF row_id IS NULL OR row_id NOT LIKE 'stage_%' THEN
    RETURN false;
  END IF;

  sid := substr(row_id, 7); -- بعد 'stage_'

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active IS DISTINCT FROM false
      AND jsonb_typeof(p.stage_ids) = 'array'
      AND p.stage_ids ? sid
  ) INTO allowed;

  RETURN COALESCE(allowed, false);
END;
$$;

DROP POLICY IF EXISTS "state_select_stages" ON public.grade_system_state;
CREATE POLICY "state_select_stages" ON public.grade_system_state
  FOR SELECT TO authenticated
  USING (
    id LIKE 'stage_%'
    AND public.can_access_stage_row(id)
  );

DROP POLICY IF EXISTS "state_insert_rows" ON public.grade_system_state;
-- FIX (step51 review): الاسم في docs/supabase-rls.sql كان "state_insert_root_public" وليس
-- "state_insert_rows" - فكانت السياسة القديمة الفضفاضة تفضل شغالة جنب الجديدة بدل ما تتستبدل.
DROP POLICY IF EXISTS "state_insert_root_public" ON public.grade_system_state;
CREATE POLICY "state_insert_rows" ON public.grade_system_state
  FOR INSERT TO authenticated
  WITH CHECK (
    (id = 'root_public' AND public.is_admin_role())
    OR (id = 'root_secure' AND public.is_superadmin())
    OR (id = 'root_meta' AND public.is_superadmin())
    OR (id LIKE 'stage_%' AND public.can_access_stage_row(id))
    OR (
      id NOT IN ('root_public', 'root_secure', 'root_meta')
      AND id NOT LIKE 'stage_%'
      AND public.is_admin_role()
    )
  );

DROP POLICY IF EXISTS "state_update_rows" ON public.grade_system_state;
CREATE POLICY "state_update_rows" ON public.grade_system_state
  FOR UPDATE TO authenticated
  USING (
    (id = 'root_public' AND public.is_admin_role())
    OR (id = 'root_secure' AND public.is_superadmin())
    OR (id = 'root_meta' AND public.is_superadmin())
    OR (id LIKE 'stage_%' AND public.can_access_stage_row(id))
    OR (
      id NOT IN ('root_public', 'root_secure', 'root_meta')
      AND id NOT LIKE 'stage_%'
      AND public.is_admin_role()
    )
  )
  WITH CHECK (
    (id = 'root_public' AND public.is_admin_role())
    OR (id = 'root_secure' AND public.is_superadmin())
    OR (id = 'root_meta' AND public.is_superadmin())
    OR (id LIKE 'stage_%' AND public.can_access_stage_row(id))
    OR (
      id NOT IN ('root_public', 'root_secure', 'root_meta')
      AND id NOT LIKE 'stage_%'
      AND public.is_admin_role()
    )
  );
