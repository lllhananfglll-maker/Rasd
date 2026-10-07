# Step 6 — Extract stable domain kernels

- Extracted attendance calendar/date/trend primitives into `js/domain/attendance/attendance-calendar.js`.
- Extracted monitor dense-ranking logic into `js/domain/monitor/monitor-ranking.js`.
- Replaced the duplicated local implementations with compatibility references.
- Kept Supabase RLS/backend permissions unchanged.
- Preserved classic script loading and runtime behavior.

## STEP 7 — Feature boundaries
- Added explicit `features/attendance` and `features/monitor` facades.
- Established stable feature APIs under `GSP.features.*` while preserving legacy behavior.
- Added feature-boundary smoke tests.
- Kept legacy shells intact as a compatibility layer; no Supabase RLS changes.
