# STEP 44 — Import Validation & Recovery

## Objective
Add a structured, application-layer validation and recovery boundary for Excel import before durable commit, without changing Supabase schema, RLS, or backend permissions.

## Implemented
- Added `js/application/services/import-validation-service.js`.
- `validateParsedResult`: structural checks on parseWorkbookSheet results
  - empty roster, missing fields, duplicate student ids / national ids
  - orphan grades, score range warnings, duplicate seats, catalog warnings
  - soft national-id format and context (grade/section/month) checks
- `validateMergePlan`: ensures grade+section scoped import cannot delete students outside the import scope.
- `preflight`: combines parsed + merge validation into one report.
- `captureSnapshot` / `restoreSnapshot`: recovery helpers with injectable writer.
- `formatReportHtml`: UI-friendly error/warning rendering.
- Integrated into `processMainFile` (import-export.part03):
  - block commit when parse validation fails
  - surface warnings without blocking when only warnings exist
  - block commit + roll back in-memory draft when merge plan fails
- Wired service into Application Context as `importValidation`.
- Added Node-based STEP 44 regression tests.
- Version bump to `25.5.27-step44`.

## Safety boundaries
- No Supabase schema changes.
- No RLS changes.
- No backend permission changes.
- XLSX parsing remains in the feature layer.
- Existing transaction isolation (STEP 37) and backup/restore (STEP 43) remain authoritative for durability.
- Legacy import UI and GSP exports are preserved.

## Verification
- STEP 44 import-validation tests: expected PASS.
- Existing regression suite: expected PASS.
- JavaScript syntax: expected PASS.
- ZIP integrity: expected PASS.
