# STEP 35 — Cloud Sync Architecture

- Added an infrastructure-only Supabase sync adapter.
- Added an application cloud-sync service boundary.
- Added a composition/port boundary between the feature controller and Supabase.
- Replaced direct Supabase calls inside `features/cloud-sync.js` with the service boundary while preserving existing behavior and public compatibility APIs.
- No Supabase schema, RLS, or backend permission changes.

## STEP 35 implementation hardening
- Added persistent `sync-queue` containing record references only, so pending sync work survives browser refresh without duplicating large stage payloads in localStorage.
- Added centralized `sync-status` with persistent last-success/error state, pending count, failure count, and conflict count.
- Added pure `conflict-resolver` helpers for timestamp and field-level conflict decisions.
- Wired `cloud-sync-composition` to expose Queue/Status/Conflict Resolver capabilities through the Cloud Sync Service boundary.
- Updated `features/cloud-sync.js` to enqueue work before push, retry queued work after reconnect/refresh, retain failed items, and clear queue items only after successful Supabase upsert.
- Preserved existing public `GSP.*` APIs and legacy UI integration.
- No Supabase schema, RLS, or backend permission changes.
