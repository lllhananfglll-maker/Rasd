# CHANGELOG — STEP 53 — Supabase New Project Bootstrap & Verification

## Added
- Idempotent bootstrap SQL for the new Supabase project.
- Core tables: `grade_system_state`, `profiles`, `audit_events`.
- RLS policies and security helper functions.
- Private `workbook-originals` Storage bucket with stage-aware object authorization.
- Post-bootstrap verification SQL.
- Operational documentation and acceptance tests checklist.

## Hardened
- `stage_ids` is standardized as JSONB array to match the application's account SQL exporter.
- Storage bucket fallback is aligned with the centralized configuration.
- Supabase status reporting distinguishes unreachable server from HTTP authorization failures.

## Security
- No database password or direct connection string is included in frontend code.
- `root_secure` remains superadmin-only.
- Anonymous access is denied for the application state tables.
