# CHANGELOG — STEP 37: Transaction Safety

## Goal
Introduce an application-level transaction boundary for critical local mutations so grades, attendance, bulk operations, imports, and related persistence cannot expose a partially-applied in-memory state when durable local storage fails. Preserve the existing Offline-first model, Legacy UI, Supabase schema, RLS, and backend permissions.

## Implemented

### 1. Transaction service
Added `js/application/services/transaction-service.js`.
- deep-cloned draft before mutation
- work/validation failures abort without touching live state
- durable commit result is tracked
- failed durable commits trigger in-memory rollback
- remains compatible with synchronous legacy UI controllers

### 2. Serialized IndexedDB persistence
`core/storage.js` now serializes durable writes through the existing persistence promise. This prevents an older write from completing after a newer write and becoming the durable winner.

### 3. Grades save transaction
`grades-save-service.js` now commits manual grade edits through the transaction boundary.

### 4. Grades bulk transactions
Full-mark fill and bulk grade deletion now operate on isolated drafts and perform one durable commit each.

### 5. Attendance transactions
- single attendance marks use the transaction boundary
- teacher daily bulk marking uses one transaction instead of one save per student
- attendance grid save, including optional grade synchronization, is one transaction

### 6. Import transaction
Main Excel import now transforms an isolated draft. If the final durable commit fails, the in-memory stage is restored and any newly uploaded workbook is cleaned up.

### 7. Compatibility / security
No changes were made to Supabase tables/schema, RLS policies, backend permissions, or the existing Legacy UI contract.

## Verification
- Existing Node regression suite: **142/142 passed**
- STEP 37 transaction assertions: **7/7 passed**
- Total: **149/149 assertions passed**
- JavaScript syntax check for all JS files: **PASS**
- Vite build was not executed because packaged dependencies (`node_modules`) are not present in the ZIP environment.
