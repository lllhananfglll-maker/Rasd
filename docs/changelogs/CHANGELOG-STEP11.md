# STEP 11 — Teacher Daily Attendance Feature Extraction

## Scope
Extract the teacher-facing daily attendance workflow from `js/attendance-system.js` into a dedicated feature module while preserving the existing GSP API and behavior.

## Changes
- Added `js/features/attendance/teacher-daily.js`.
- Moved teacher daily attendance state, date gating, filters, cards rendering, mark actions, and filter UI behavior into the feature module.
- Kept stable GSP entry points (`GSP.tdaSetStudentMark`, `GSP.tdaMarkAll`, `GSP.tdaToggleFilters`, `GSP.onTdaFilterChange`, etc.).
- Added a read-only `GSP.getCurrentTeacher()` bridge in `js/app/state.js` so the feature does not reach into the state closure directly.
- Exported required attendance helpers through GSP (`collectSchoolHolidaySet`, `recordKey`, `parseISO`, `toISO`).
- Updated `js/features/attendance/index.js` to expose the teacher-daily feature.
- Loaded the new feature after `attendance-system.js` in `index.html`.

## Functional guard preserved
Teacher daily attendance continues to enforce the STEP 10 workday policy. Non-working school days cannot be edited, including Friday and disabled Saturday. Holidays, future dates, the 31-day edit window, and locked months remain gated.

## Compatibility
The existing global/GSP API remains available so existing UI and legacy call sites do not break during the migration.

## Validation
- Custom tests: 40 passed, 0 failed.
- JavaScript syntax checks: passed for changed files.
- Supabase RLS/backend permissions: intentionally unchanged.
