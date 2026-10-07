# STEP 54 — Auth & First Superadmin Provisioning

## Purpose

Establish the first production administrator through Supabase Auth + `public.profiles`, while retaining the local password only as an explicit offline fallback.

## Provisioning order

1. Create the first user under **Supabase → Authentication → Users**.
2. Copy that user's **UID** (UUID).
3. Insert/update the matching `public.profiles` row with `role = 'superadmin'` and `is_active = true`.
4. Sign in from the application's **رئيس الكنترول** tab using the Auth email/password.
5. Confirm that the application session is marked as cloud-authenticated and the profile role is `superadmin`.

## Security rules

- Never put a Supabase service-role key, database password, or direct connection string in frontend files.
- The publishable/anon client key may be present in browser code; it is not an administrative secret.
- The Superadmin login surface accepts `superadmin` only. Stageadmin has a separate login surface.
- Restored sessions are trusted only after the matching `profiles` row is found, is active, and has a recognized role.
- The first-run local setup pane no longer blocks cloud login. This is required because a fresh installation may have a cloud Superadmin before a local offline password exists.

## Verification SQL

```sql
select
    p.id,
    p.email,
    p.full_name,
    p.role,
    p.is_active,
    p.stage_ids,
    p.sections,
    u.email as auth_email,
    u.email_confirmed_at
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'superadmin';
```

Expected: one active Superadmin profile whose `profiles.id = auth.users.id`.

## Rollback

No destructive migration is required. STEP 54 changes only frontend Auth flow and adds verification documentation/tests. Existing Supabase users and profiles are not deleted.
