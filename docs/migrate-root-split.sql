-- ============================================================
-- ترحيل فوري: تقسيم root_meta → root_public + root_secure
-- نفّذ في Supabase SQL Editor (بصلاحيات كاملة — يتجاوز RLS)
-- آمن للتكرار (ON CONFLICT / upsert منطقي)
-- ============================================================

-- 1) إنشاء root_public من البيانات العامة فقط
INSERT INTO public.grade_system_state (id, data, updated_at)
SELECT
  'root_public',
  jsonb_build_object(
    'stages', COALESCE(data->'stages', '[]'::jsonb),
    'systemClosure', COALESCE(
      data->'systemClosure',
      '{"enabled":false,"message":"","updatedAt":null}'::jsonb
    ),
    'lastUpdated', data->'lastUpdated'
  ),
  COALESCE(updated_at, now())
FROM public.grade_system_state
WHERE id = 'root_meta'
ON CONFLICT (id) DO UPDATE SET
  data = EXCLUDED.data,
  updated_at = EXCLUDED.updated_at;

-- 2) إنشاء root_secure من البيانات الحساسة فقط
INSERT INTO public.grade_system_state (id, data, updated_at)
SELECT
  'root_secure',
  jsonb_build_object(
    'stageAdmins', COALESCE(data->'stageAdmins', '[]'::jsonb),
    'stageMonitors', COALESCE(data->'stageMonitors', '[]'::jsonb),
    'superAdminPasswordHash', data->'superAdminPasswordHash',
    'lastUpdated', data->'lastUpdated'
  ),
  COALESCE(updated_at, now())
FROM public.grade_system_state
WHERE id = 'root_meta'
ON CONFLICT (id) DO UPDATE SET
  data = EXCLUDED.data,
  updated_at = EXCLUDED.updated_at;

-- 3) تحقق سريع
SELECT id,
       data ? 'superAdminPasswordHash' AS has_hash,
       data ? 'systemClosure' AS has_closure,
       data ? 'stages' AS has_stages,
       data ? 'stageAdmins' AS has_admins
FROM public.grade_system_state
WHERE id IN ('root_public', 'root_secure', 'root_meta')
ORDER BY id;

-- المتوقع:
-- root_public  | has_hash=false | has_closure=true  | has_stages=true  | has_admins=false
-- root_secure  | has_hash=true  | has_closure=false | has_stages=false | has_admins=true
-- root_meta    | has_hash=true  | has_closure=true  | has_stages=true  | has_admins=true
--
-- بعد التأكد من النتائج وبعد تطبيق RLS:
-- DELETE FROM public.grade_system_state WHERE id = 'root_meta';
