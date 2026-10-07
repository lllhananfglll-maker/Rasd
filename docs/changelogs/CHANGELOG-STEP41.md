# STEP 41 — Role & Permission Matrix

## Implemented
- Added `js/application/services/permission-matrix-service.js` as the single client-side permission policy.
- Defined explicit permissions for `superadmin`, `stageadmin`, `monitor`, and `teacher`.
- Preserved the existing `stageAdminHasPermission(key)` public API while delegating it to the central matrix.
- Added `can`, `canAny`, `canAll`, `require`, role normalization, and matrix inspection helpers.
- Added the permission service to Application Context.
- Added regression coverage for allow/deny behavior and legacy stage-admin permission mapping.
- Enforced the matrix at critical application boundaries for grade writes, attendance writes, and tab navigation while retaining legacy role checks.

## Security boundary
- This step changes application/UI authorization only.
- **No Supabase RLS changes.**
- **No database schema changes.**
- **No backend permission changes.**
- Client-side permissions are not treated as a security boundary; server-side Supabase policies remain authoritative.

## Compatibility
- Existing roles and legacy permission keys remain supported.
- Existing GSP APIs are preserved.

## Verification
- Permission matrix: 17/17 PASS.
- Existing regression suite: 142/142 PASS.
- STEP 37 transaction safety: 149/149 PASS.
- STEP 40 regression scenarios: 11/11 PASS.
- JavaScript syntax checks: PASS.
- ZIP integrity: PASS.
