# STEP 53 — Supabase New Project Bootstrap & Verification

- Added idempotent Supabase bootstrap and verification SQL.
- Standardized `profiles.stage_ids` as JSONB arrays for stage-scoped RLS.
- Added private, stage-aware `workbook-originals` Storage policies.
- Aligned cloud-sync Storage bucket fallback with centralized configuration.
- Improved Supabase connectivity diagnostics.

# Changelog

All notable changes to **Grade System Pro** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to Semantic Versioning.

Detailed step-by-step notes live in `docs/changelogs/`.

---

## [25.6.1] — 2026-09-06 — Plaintext PIN elimination (Step 51)

### Security
- **Stop storing secret numbers (PIN) as plaintext** for teachers, stage admins (مسؤول حاسب), and stage monitors (مدير مرحلة).
- Only `pinHash` is persisted; plaintext PIN lives in memory solely for one-time display and immediate card print.
- On load/save: automatic strip of any legacy `pin` fields (`stripPlaintextPins`).
- Cloud sync (`buildRootSecure`) strips plaintext PINs before upload.
- Creation of stage admin / stage monitor accounts restricted to Control Head (superadmin).
- Self-change of PIN for stage admin / monitor still allowed after verifying the current PIN + strength checks; new PIN shown once only.
- Print-all / print-from-table without a just-generated PIN shows a clear message: regenerate then print immediately.
- Teacher Excel export no longer includes a PIN column.

### Changed
- `formatPinOnceHtml` supports optional extra action HTML (e.g. «طباعة البطاقة الآن»).
- New helpers: `printTeacherCardWithPin`, `printStageAdminCardWithPin`, `printStageMonitorCardWithPin`.

---

## [25.6.0] — 2026-09-06 — Production Cleanup (Step 50)

### Changed
- Unified changelog: created root `CHANGELOG.md` and moved all `CHANGELOG-STEP*.md` files into `docs/changelogs/`.
- Version aligned across `package.json`, `js/core/version.js`, and `README.md` → **25.6.0**.
- README rewritten to reflect current architecture, security posture, and run instructions.
- Added `docs/PRODUCTION-CHECKLIST.md`.

### Security
- Confirmed completion of the critical security roadmap (Steps 46–49):
  - `root_public` / `root_secure` split
  - Stage-scoped RLS
  - Superadmin primary path via Supabase Auth
  - `root_meta` permanently removed
  - Hash no longer synced to the cloud

---

## [25.5.x] — 2026-09-05 — Security Hardening (Steps 46–49)

### Security
- **Step 46**: Critical RLS fix + split of sensitive data into `root_public` / `root_secure`.
- **Step 47**: Stage-scoped RLS (`can_access_stage_row` + `profiles.stage_ids`).
- **Step 48**: Superadmin login primary path via Supabase Auth; stop syncing password hash.
- **Step 49**: Permanent deletion of legacy `root_meta` row.

### Documentation
- `docs/SECURITY.md`, `docs/ROADMAP-SECURITY.md`, and related SQL scripts under `docs/`.

---

## [25.5.x] — Earlier (Steps 1–45)

Incremental engineering baseline, architecture boundaries, offline-first reliability, feature isolation (grades, attendance, monitor, import/export, print), Vite tooling, tests, and UX improvements.

See individual files in `docs/changelogs/` for full history.

---

## Unreleased / Deferred

- Bulk cloud account provisioning (Edge Function or guided flow) — operational, deferred.
- `audit_log` table + policies — optional.
