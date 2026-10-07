# STEP 15

- Extracted attendance administration mutations into `js/application/services/attendance-admin-service.js`.
- Attendance UI controller delegates school settings, holidays, and subject-day schedules to the application service.
- Preserved existing storage model and legacy GSP compatibility.
- No Supabase RLS/backend permission changes.
- Version: 25.5.5
