# CHANGELOG — STEP 36: Offline / Online Reliability

## Goal
Strengthen the STEP 35 cloud-sync architecture for unreliable connectivity while preserving the existing Offline-first local data model, Legacy UI, Supabase schema, RLS, and backend permissions.

## Implemented

### 1. Persistent retry metadata
`sync-queue.js` now records, per queued reference:
- attempt count
- failed state
- last error / timestamp
- `nextRetryAt`
- due-for-retry calculation
- failed queue count

The queue remains reference-only; it does not duplicate local database payloads.

### 2. Exponential backoff
Transient sync failures no longer cause a fixed 1-second retry loop.
Retry delay grows exponentially with a bounded maximum and small jitter.

### 3. Offline / online state
`sync-status.js` now tracks:
- online/offline state
- pending operations
- failed operations
- retry state / next retry
- last attempt
- last successful sync
- last error
- local-storage health
- conflict count

State is persisted so useful diagnostics survive browser refresh.

### 4. Offline Sync Reliability service
Added:
`js/application/services/offline-sync-reliability.js`

Responsibilities:
- queue/status coordination
- retry/backoff calculation
- due retry scheduling
- manual retry/reset
- online/offline state coordination

It does not own local data or Supabase access.

### 5. Durable-local-write guard
`core/storage.js` now exposes the state of the latest IndexedDB persistence operation.
Cloud push is held until the local durable write succeeds.
If IndexedDB persistence fails, cloud push is not allowed to proceed using an unconfirmed local write.

### 6. Recovery after browser refresh
Because queue metadata remains in persistent storage, pending/failed sync references survive refresh and can resume when connectivity returns.

### 7. Manual Retry
The existing connection badge now acts as a retry affordance when synchronization has failed or pending work remains.
No new heavy UI was introduced.

### 8. Compatibility
No changes were made to:
- Supabase tables/schema
- Supabase RLS policies
- backend permissions
- existing data model
- existing Legacy UI workflows

## Verification
- STEP 36 reliability tests: **20/20 passed**
- STEP 35 sync architecture tests: **13/13 passed**
- Existing legacy/application suite: **142/142 passed**
- JavaScript syntax check: **PASS**
- Total executed test assertions reported by the suites: **175/175 passed**

`npm test` through Vitest could not be executed in the packaged environment because dependencies were not fully installed; the existing Node-based test suites and syntax checks were executed directly.
