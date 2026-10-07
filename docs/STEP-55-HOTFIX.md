# STEP 55 — Attendance composition + console cleanup hotfix

## Fixed
- Exported `getFilterState` from the attendance system so the composition root can inject it into `attendance-grid-actions`.
- Added `getActiveDayIndices` and `isColumnStudyDay` to the attendance legacy capability boundary.
- Removed `frame-ancestors` from the HTML CSP meta tag because browsers ignore that directive when delivered via `<meta>`; it requires an HTTP response header.
- Changed the Supabase status probe to avoid an anonymous REST request against an RLS-protected table. It now checks for a real Supabase session first and uses the session access token when one exists.

## Result
The attendance composition can complete, which prevents the follow-on `Teacher Daily Attendance: attendance application is not composed` error.
