-- STEP 53 — Verification queries
-- Run AFTER step53-bootstrap.sql.

-- A. Tables and RLS
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname='public'
  AND tablename IN ('grade_system_state','profiles','audit_events')
ORDER BY tablename;

-- B. Required policies
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE (schemaname='public' AND tablename IN ('grade_system_state','profiles','audit_events'))
   OR (schemaname='storage' AND tablename='objects' AND policyname LIKE 'workbooks_%')
ORDER BY schemaname, tablename, policyname;

-- C. Required helper functions
SELECT n.nspname AS schema_name, p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('is_superadmin','is_admin_role','can_access_stage_row','storage_path_stage_id','can_access_storage_object')
ORDER BY p.proname;

-- D. Storage bucket must be private
SELECT id, name, public
FROM storage.buckets
WHERE id='workbook-originals';

-- E. Existing profiles summary (safe metadata only)
SELECT role, is_active, count(*)
FROM public.profiles
GROUP BY role, is_active
ORDER BY role, is_active;

-- F. Root rows
SELECT id, updated_at, jsonb_object_length(COALESCE(data,'{}'::jsonb)) AS top_level_keys
FROM public.grade_system_state
WHERE id IN ('root_public','root_secure','root_meta')
ORDER BY id;

-- G. Audit health
SELECT count(*) AS audit_event_count, max(created_at) AS latest_event
FROM public.audit_events;
