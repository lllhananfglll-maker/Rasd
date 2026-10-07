# STEP 16 — Attendance Grid Actions Boundary

- Extracted bulk attendance grid actions and grid persistence orchestration into `js/application/services/attendance-grid-actions.js`.
- `attendance-system.js` now exposes compatibility wrappers and no longer owns the bulk marking/save implementation.
- Composition root injects legacy capabilities once into the extracted service.
- Preserved attendance record keys, lock checks, subject-day filtering, confirmation dialogs, sync-to-grades behavior, cloud push, and skip-suspect notification.
- No Supabase RLS or backend permission changes.
- Version: 25.5.6

## Validation
- Custom test suite: 48 passed / 0 failed.
- Node syntax check passed for the changed JavaScript files.
- Local script references verified; only the two intentional external CDN scripts are not local files.
