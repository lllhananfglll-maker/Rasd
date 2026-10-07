# STEP 18 — Attendance UI State Boundary

## الهدف
فصل حالة واجهة الحضور عن Controllers وDOM handlers قدر الإمكان، مع الحفاظ على السلوك والواجهات الحالية.

## التغييرات
- إضافة `js/application/services/attendance-ui-state.js` كخدمة state صغيرة وخالية من أي اعتماد على DOM.
- إدارة حالة Teacher Daily (`subjectName`, `classKey`, `dateISO`) مركزيًا.
- إدارة حالة Attendance Grid (`term`, `month`, `subjectName`, `classKey`, `weekView`) مركزيًا.
- إدارة حالة فتح/غلق فلاتر Teacher Daily مركزيًا.
- ربط `attendance-system.js` و`teacher-daily.js` بخدمة الحالة مع الإبقاء على DOM كمصدر الإدخال/العرض فقط.
- إضافة الخدمة إلى Composition Root بالترتيب الصحيح قبل `attendance-system.js`.
- إضافة اختبارات مستقلة للحالة والـ transitions.
- تحديث الإصدار إلى `25.5.8`.

## التوافق
- لم يتم تغيير نموذج بيانات الحضور.
- لم يتم تغيير مفاتيح سجلات الحضور.
- لم يتم تغيير Supabase RLS أو صلاحيات Backend.
- تم الحفاظ على GSP compatibility APIs الحالية.

## التحقق
- Tests: 58 passed / 0 failed.
- JavaScript syntax: all files passed.
- Local script references: 66/66 present.
- ZIP integrity: verified after packaging.
