# STEP 21 — Feature → Application Boundary Cleanup

Version: **25.5.11**

## What changed

- Added `js/application/services/monitor-service.js` as an explicit application boundary for Monitor analytics.
- Added `js/application/composition/monitor-composition.js` to compose the Monitor service from injected analytics capabilities.
- Updated `js/features/monitor/index.js` to consume the composed application service for analytics while retaining legacy UI entry points for compatibility.
- Updated `js/features/attendance/index.js` to expose the already-composed Attendance application services through an explicit feature boundary.
- Preserved existing legacy controller APIs to minimize behavioral risk.
- No data-model migration and no Supabase RLS/backend permission changes.
