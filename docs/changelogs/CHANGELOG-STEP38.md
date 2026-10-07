# STEP 38 — Audit Trail

## Objective
Introduce one application-level Audit Service while preserving the existing `audit_events` Supabase table contract. No Supabase schema, RLS, or backend permission changes were made.

## Implemented
- Added `js/application/services/audit-service.js`.
- Unified legacy `recordAudit(action, details, level)` through the Audit Service.
- Added structured audit events containing:
  - who / actor
  - what / action
  - when / timestamp
  - where / stage + module + record
  - before / after summaries
  - reason
  - outcome
  - transaction id
- Added persistent local audit queue for offline/failed uploads and refresh recovery.
- Added automatic queue flush on `online` and page visibility recovery.
- Added bounded payload/detail serialization to avoid giant audit rows.
- Added transaction outcome auditing to STEP 37 Transaction Service.
- Improved the existing audit table rendering so structured details remain readable.
- Added public `GSP.recordAuditEvent` and `GSP.recordAuditChange` adapters for future services.

## Compatibility
- Existing `audit_events` columns remain unchanged.
- Existing `recordAudit()` callers remain valid.
- Legacy UI and data-action contracts remain intact.
- Supabase RLS and backend permissions are untouched.

## Verification
- Legacy regression suite: PASS
- STEP 38 audit service tests: PASS
- STEP 38 transaction audit integration: PASS
- JavaScript syntax checks: PASS
