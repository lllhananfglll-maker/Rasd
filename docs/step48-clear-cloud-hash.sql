-- Step 48: إزالة هاش رئيس الكنترول من السحابة (بعد اعتماد Supabase Auth)
-- آمن للتكرار

UPDATE public.grade_system_state
SET data = data - 'superAdminPasswordHash',
    updated_at = now()
WHERE id = 'root_secure'
  AND data ? 'superAdminPasswordHash';

UPDATE public.grade_system_state
SET data = data - 'superAdminPasswordHash',
    updated_at = now()
WHERE id = 'root_meta'
  AND data ? 'superAdminPasswordHash';

-- تحقق
SELECT id,
       data ? 'superAdminPasswordHash' AS has_hash,
       data ? 'stageAdmins' AS has_admins
FROM public.grade_system_state
WHERE id IN ('root_secure', 'root_meta', 'root_public')
ORDER BY id;
