# STEP 12 — Attendance application-service boundary

- Added `js/application/services/attendance-service.js`.
- Moved teacher-daily date validation and mark persistence orchestration behind an application service.
- `teacher-daily.js` now delegates validation and writes through `GSP.application.attendance`.
- Preserved the STEP10 school-workday restriction and holiday/month-lock/future/31-day gates.
- Added application-service smoke tests to the legacy Node test runner.
- No Supabase RLS or backend permission changes.
