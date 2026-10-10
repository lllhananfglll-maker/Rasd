# STEP C — تنظيف الواجهة (المرحلة C من خطة إعادة الهيكلة)

- دمج نهائي وحذف ملفات `.part*` اليتيمة:
  - `grades-ui` · `print-sheets` · `import-export`
  - `auth-audit` · `student-roster`
- الألوان: استبدال القيم الثابتة (`#0b5e42` وغيرها) بـ `var(--rasd-*)` في `css/base.css` وملفات CSS الأخرى ومعظم ملفات JS.
- `onclick` المضمّن في `index.html` كان محوّلاً مسبقاً إلى `data-action` (0 متبقي).
- الإصدار: **26.0.0-dev-stepC** · الاسم الرمزي: `ui-cleanup-tokens-merge`

---

# STEP 56 — خزنة روزنامة دائمة + حماية من سحب سحابة قديمة (RLS)

- السبب الجذري: `42501 RLS` يمنع رفع `grade_system_state`؛ عند الدخول يُستبدل المحلي بنسخة سحابية بلا فترات.
- خزنة `localStorage` + `root.schoolCalendarVault` لا تُمسَح بالسحب.
- استعادة الخزنة بعد كل pull؛ حماية termCalendar المحلي عند استبدال المرحلة.
- تضمين الخزنة في `root_public`.

---

# STEP 55 — إعادة كتابة الروزنامة وفترات الرصد من الصفر

- مصدر وحيد للحقيقة: `schoolInfo.termCalendar[term]`.
- `calendar-bridge.js` و`term-calendar.js` و`calendar-ui.js` أُعيدت كتابتها بالكامل.
- القراءة لا تكتب على التخزين أبداً.
- `ensureCalendarSeeded` يزرع الافتراضي **مرة واحدة فقط** إن لم يوجد محفوظ.
- الحفظ يعمّم الفترات على **كل المراحل** ويشتق `recordingPeriods` / `months` / `week1Dates`.
- مسودات الواجهة تُمسَح عند التحميل لتُقرأ من IndexedDB الفعلي.

---

# STEP 54b — إيقاف حلقة «نسخة أحدث على السحابة»

- بعد اختيار «تحميل الأحدث» كانت النافذة تعود فوراً لأن `persistRootDB` يعيد جدولة الرفع، والطابع الزمني لم يُزامَن بدقة.
- مقارنة الطوابع بهامش ثانيتين (`isCloudTimestampNewer`) لتفادي فروق ساعة الخادم.
- تهدئة 90 ثانية بعد أي اختيار في نافذة التعارض.
- أثناء/بعد السحب: كتم `scheduleCloudPush` ومسح dirty للمرحلة الحالية — لا رفع تلقائي حتى يعدّل المستخدم.
- عند تخطي سحب سحابة فارغة: مزامنة `updatedAt` فقط لكسر الحلقة.

---

# STEP 54 — ثبات فترات الرصد عبر الجلسات والمراحل

- **المشكلة:** ضبط فترات الرصد كان يُقبل في الجلسة ثم يعود للافتراضي بعد تسجيل الخروج لأن `ensureCalendarSeeded` كان يعيد كتابة `recordingPeriods` من الروزنامة الافتراضية عند كل تحميل، و`saveSchoolInfo` كان يعيد اشتقاق الفترات من الروزنامة فيمحو ما أدخله المستخدم.
- **الإصلاح:**
  - `calendar-bridge.js`: لا تُستبدل الفترات المحفوظة عند التحميل؛ إن وُجدت فترات بلا روزنامة تُبنى الروزنامة منها؛ `getRecordingPeriods` يفضّل المحفوظ.
  - دالة جديدة `syncCalendarFromPeriods` لكتابة الروزنامة المركزية من فترات الرصد.
  - `school-info.js`: عند الحفظ تُحدَّث الروزنامة من مسودة الفترات (وليس العكس).
  - `cloud-sync.js`: دمج `recordingPeriods` و`termCalendar` عند السحب الجزئي من السحابة.

---

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
