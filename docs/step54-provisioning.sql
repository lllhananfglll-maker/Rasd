-- STEP 54 — First Superadmin profile provisioning
-- Run AFTER creating the user in Supabase Authentication → Users.
-- Replace only the UUID and administrator identity values.
-- Never put the password here.

insert into public.profiles (
  id,
  role,
  full_name,
  email,
  is_active,
  stage_ids,
  teacher_id,
  sections
)
values (
  'YOUR-AUTH-USER-UUID'::uuid,
  'superadmin',
  'Super Administrator',
  'admin@your-school-domain.com',
  true,
  '[]'::jsonb,
  null,
  '{}'::jsonb
)
on conflict (id)
do update set
  role = 'superadmin',
  full_name = excluded.full_name,
  email = excluded.email,
  is_active = true,
  stage_ids = excluded.stage_ids,
  teacher_id = excluded.teacher_id,
  sections = excluded.sections,
  updated_at = now();

-- Verify Auth ↔ Profile linkage.
select
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.is_active,
  u.email as auth_email,
  u.email_confirmed_at
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'superadmin';
