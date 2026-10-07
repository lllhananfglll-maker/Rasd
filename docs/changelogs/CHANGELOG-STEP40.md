# STEP 40 — Automated Regression Suite

## Scope
Added a browser-independent automated regression layer for critical user journeys without touching Supabase schema, RLS, or backend permissions.

## Covered scenarios
- Teacher: login → class → subject → grade entry → save → refresh → verify.
- Attendance: open → working day → mark students → save → refresh → verify.
- Offline: disconnect → edit → save → queued sync → reconnect → sync → cloud verification.
- Safety: transaction rollback, error-recovery observability, and audit summary checks when supported by the harness.

## Implementation
- `js/application/testing/regression-suite-service.js`
  - Injected harness boundary; no real school data is touched.
  - Per-step timing and failure capture.
  - Scenario-level pass/fail results.
  - Fail-fast option.
- `tests/regression-step40.test.mjs`
  - Isolated deterministic harness covering refresh persistence and offline sync behavior.
- `tests/run-tests.mjs`
  - Automatically invokes the STEP 40 regression module after the existing regression assertions.
- `index.html`
  - Loads the regression service for development/diagnostic use.

## Safety constraints
- No Supabase schema changes.
- No RLS changes.
- No backend permission changes.
- No production database or user records are used by the automated suite.

## Verification target
- Legacy regression suite remains green.
- STEP 40 scenario suite must report 4/4 scenarios passed.
- JavaScript syntax checks must pass.
- ZIP integrity must pass.
