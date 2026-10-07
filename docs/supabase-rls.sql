-- ============================================================
-- سياسات RLS الموصى بها — نظام رصد الدرجات Pro
-- NOTE: For a brand-new Supabase project, use docs/step53-bootstrap.sql as the canonical bootstrap.
-- This file is retained as a historical migration/reference document.
-- نفّذ في: Supabase Dashboard → SQL Editor
-- راجع docs/SECURITY.md قبل التطبيق على إنتاج فيه بيانات.
--
-- CRITICAL FIX (2026-09): فصل root_public عن root_secure
--   root_public  → stages + systemClosure   (أي مصادق يقرأ)
--   root_secure  → hash + stageAdmins + monitors (superadmin فقط)
--   root_meta    → الصيغة القديمة المختلطة (superadmin فقط للقراءة)
-- ============================================================

-- 1) تفعيل RLS على الجداول الأساسية
ALTER TABLE IF EXISTS public.grade_system_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log ENABLE ROW LEVEL SECURITY;

-- 2) profiles: المستخدم يقرأ/يحدّث صفّه فقط
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR auth.uid() = user_id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR auth.uid() = user_id);

-- ملاحظة: عدّل أسماء الأعمدة حسب مخططك الفعلي (id / user_id)

-- ============================================================
-- 3) grade_system_state — السياسات الحرجة
-- ============================================================

-- 3.1) منع أي وصول من anon نهائيًا
DROP POLICY IF EXISTS "state_deny_anon" ON public.grade_system_state;
CREATE POLICY "state_deny_anon" ON public.grade_system_state
  FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

-- 3.2) دوال مساعدة
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE (p.id = auth.uid() OR p.user_id = auth.uid())
      AND p.role = 'superadmin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE (p.id = auth.uid() OR p.user_id = auth.uid())
      AND p.role IN ('superadmin', 'stageadmin', 'monitor')
  );
$$;

-- ------------------------------------------------------------
-- إزالة السياسات القديمة الفضفاضة إن وُجدت
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "state_auth_select" ON public.grade_system_state;
DROP POLICY IF EXISTS "state_auth_upsert" ON public.grade_system_state;
DROP POLICY IF EXISTS "state_auth_update" ON public.grade_system_state;
DROP POLICY IF EXISTS "state_auth_insert" ON public.grade_system_state;
DROP POLICY IF EXISTS "state_auth_delete" ON public.grade_system_state;
DROP POLICY IF EXISTS "state_select_root_meta_superadmin" ON public.grade_system_state;
DROP POLICY IF EXISTS "state_select_stages" ON public.grade_system_state;
DROP POLICY IF EXISTS "state_select_other_admin" ON public.grade_system_state;

-- ------------------------------------------------------------
-- SELECT
-- ------------------------------------------------------------

-- أ) root_public: أي مصادق يقرأ (stages + systemClosure فقط — لا هاش)
DROP POLICY IF EXISTS "state_select_root_public" ON public.grade_system_state;
CREATE POLICY "state_select_root_public" ON public.grade_system_state
  FOR SELECT TO authenticated
  USING (id = 'root_public');

-- ب) root_secure: superadmin فقط (الهاش + stageAdmins + stageMonitors)
DROP POLICY IF EXISTS "state_select_root_secure" ON public.grade_system_state;
CREATE POLICY "state_select_root_secure" ON public.grade_system_state
  FOR SELECT TO authenticated
  USING (id = 'root_secure' AND public.is_superadmin());

-- ج) root_meta (القديم المختلط): superadmin فقط — للترحيل
DROP POLICY IF EXISTS "state_select_root_meta_legacy" ON public.grade_system_state;
CREATE POLICY "state_select_root_meta_legacy" ON public.grade_system_state
  FOR SELECT TO authenticated
  USING (id = 'root_meta' AND public.is_superadmin());

-- د) صفوف المراحل stage_*: أي مصادق
DROP POLICY IF EXISTS "state_select_stages" ON public.grade_system_state;
CREATE POLICY "state_select_stages" ON public.grade_system_state
  FOR SELECT TO authenticated
  USING (id LIKE 'stage_%');

-- هـ) أي صف آخر (مثل main): إداريين فقط
DROP POLICY IF EXISTS "state_select_other_admin" ON public.grade_system_state;
CREATE POLICY "state_select_other_admin" ON public.grade_system_state
  FOR SELECT TO authenticated
  USING (
    id NOT IN ('root_public', 'root_secure', 'root_meta')
    AND id NOT LIKE 'stage_%'
    AND public.is_admin_role()
  );

-- ------------------------------------------------------------
-- INSERT
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "state_insert_root_public" ON public.grade_system_state;
CREATE POLICY "state_insert_root_public" ON public.grade_system_state
  FOR INSERT TO authenticated
  WITH CHECK (
    (id = 'root_public' AND public.is_admin_role())
    OR (id = 'root_secure' AND public.is_superadmin())
    OR (id = 'root_meta' AND public.is_superadmin())
    OR (id LIKE 'stage_%')
    OR (id NOT IN ('root_public', 'root_secure', 'root_meta') AND id NOT LIKE 'stage_%' AND public.is_admin_role())
  );

-- ------------------------------------------------------------
-- UPDATE
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "state_update_rows" ON public.grade_system_state;
CREATE POLICY "state_update_rows" ON public.grade_system_state
  FOR UPDATE TO authenticated
  USING (
    (id = 'root_public' AND public.is_admin_role())
    OR (id = 'root_secure' AND public.is_superadmin())
    OR (id = 'root_meta' AND public.is_superadmin())
    OR (id LIKE 'stage_%')
    OR (id NOT IN ('root_public', 'root_secure', 'root_meta') AND id NOT LIKE 'stage_%' AND public.is_admin_role())
  )
  WITH CHECK (
    (id = 'root_public' AND public.is_admin_role())
    OR (id = 'root_secure' AND public.is_superadmin())
    OR (id = 'root_meta' AND public.is_superadmin())
    OR (id LIKE 'stage_%')
    OR (id NOT IN ('root_public', 'root_secure', 'root_meta') AND id NOT LIKE 'stage_%' AND public.is_admin_role())
  );

-- ------------------------------------------------------------
-- DELETE: إداريين فقط
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "state_delete_admin" ON public.grade_system_state;
CREATE POLICY "state_delete_admin" ON public.grade_system_state
  FOR DELETE TO authenticated
  USING (public.is_admin_role());

-- ============================================================
-- 4) audit_log
-- ============================================================
DROP POLICY IF EXISTS "audit_insert_auth" ON public.audit_log;
CREATE POLICY "audit_insert_auth" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "audit_select_admin" ON public.audit_log;
CREATE POLICY "audit_select_admin" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin_role());

-- ============================================================
-- 5) خطوات ما بعد التطبيق
-- ============================================================
--
-- 1. تأكد أن جدول profiles فيه عمود role بالقيم:
--    'superadmin' | 'stageadmin' | 'monitor' | 'teacher'
-- 2. تأكد أن حساب رئيس الكنترول السحابي له role = 'superadmin'
-- 3. سجّل دخول كـ superadmin من الواجهة الجديدة واعمل أي حفظ —
--    سينشأ صفّا root_public و root_secure تلقائيًا (ترحيل من root_meta إن وُجد)
-- 4. اختبر من حساب معلم:
--      SELECT * FROM grade_system_state WHERE id = 'root_secure';
--    → 0 صفوف
--      SELECT * FROM grade_system_state WHERE id = 'root_public';
--    → صف واحد (بدون هاش)
-- 5. اختبر systemClosure: معلم يرى رسالة الإغلاق إن كانت مفعّلة
-- 6. (اختياري لاحقًا) احذف صف root_meta القديم بعد التأكد من نجاح الترحيل
--
-- ============================================================
-- 6) Storage + Rate Limits (من Dashboard)
-- ============================================================
-- Storage: اضبط سياسات الـ bucket من Dashboard → Storage → Policies
-- Rate limits: Dashboard → Authentication → Rate Limits + Captcha إن أمكن
