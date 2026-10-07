# STEP 43 — Data Migration / Backup / Restore

## Objective
Centralize full-system backup, restore validation, and local data migration behind a dedicated application service, without changing Supabase schema, RLS, or backend permissions.

## Implemented
- Added `js/application/services/data-migration-service.js`.
- Structured backup payload: `format`, `appVersion`, `schemaVersion`, `createdAt`, `checksum`, `meta`, `data`.
- Validation for structured backups and legacy raw-root snapshots.
- Lightweight integrity fingerprint (checksum) with tamper detection on restore.
- Schema migration path (v1 → v2) that normalizes stages and aligns fixed-stage metadata when helpers are available.
- Dry-run restore for inspection without writing storage.
- Injectable `writeRoot` boundary for tests and UI adapters.
- Summary helpers (stage / student / teacher / grade counts).
- Wired service into Application Context as `dataMigration`.
- Updated legacy UI adapters `downloadLocalBackup` / `restoreLocalBackup` to prefer the new service while keeping a safe fallback.
- Added Node-based STEP 43 regression tests.
- Version bump to `25.5.26-step43`.

## Safety boundaries
- No Supabase schema changes.
- No RLS changes.
- No backend permission changes.
- No service-role or secret key handling.
- Restore still requires explicit user confirmation in the UI.
- Existing public legacy globals and HTML data-actions remain available.

## Verification
- STEP 43 data-migration tests: expected PASS.
- Existing regression suite: expected PASS.
- JavaScript syntax: expected PASS.
- ZIP integrity: expected PASS.
