# CHANGELOG — STEP 33

## Storage Boundary & Database Architecture

- Added `js/infrastructure/database-gateway.js` as the infrastructure-only IndexedDB boundary.
- Moved browser IndexedDB mechanics behind `createIndexedDBGateway()`.
- Kept the legacy synchronous in-memory storage/cache contract intact; `storage.js` now delegates physical IndexedDB I/O through the gateway.
- Exposed the database gateway through the Application Context for future repository migration.
- Added isolated database gateway tests covering read/write, connection caching, immutability, and unsupported IndexedDB behavior.
- No data schema changes.
- No Supabase RLS or backend permission changes.
- Version bumped to 25.5.23.
