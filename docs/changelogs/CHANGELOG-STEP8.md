# STEP 8 — Monitor analytics extraction

## Goal
Move reusable Monitor grade/class analytics out of the legacy `monitor-shell.js` monolith into an explicit Feature module without changing the application's data model, Supabase RLS, or backend permissions.

## Changes
- Added `js/features/monitor/analytics.js`.
- Extracted and exposed:
  - `studentSubjectScore`
  - `computeTeacherMetrics`
  - `classMetrics`
- `monitor-shell.js` now consumes these through `GSP.monitorAnalytics`.
- Extended `GSP.features.monitor.analytics` as the public Feature-facing API.
- Preserved classic script loading order and existing global compatibility.

## Validation
- Legacy tests: 35 passed / 0 failed.
- `node --check` passed for every JavaScript file.
- No Supabase RLS or backend permission changes.
- No intentional UI/data behavior changes.

## Note
This is an incremental extraction. Remaining Monitor responsibilities will be moved in subsequent steps only after dependency boundaries are verified, to avoid breaking legacy closure/global assumptions.
