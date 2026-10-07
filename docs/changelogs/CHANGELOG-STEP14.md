# STEP 14 — Attendance Dependency Injection

## الهدف
نقل تكوين طبقة الحضور إلى Composition Root بحيث لا تقوم `Teacher Daily Attendance` أو `Attendance Service` بالبحث عن الاعتماديات داخل `window/GSP` أثناء التشغيل.

## التغييرات
- تحويل Attendance Repository إلى Factory تعتمد على `loadDB/saveDB/ensureAttendance` محقونة مرة واحدة.
- تحويل Attendance Service إلى Factory تعتمد على Repository وWorkday Policy وباقي الخدمات المساعدة المحقونة.
- إضافة `js/application/composition/attendance-composition.js` لتكوين المسار الفعلي:
  `Legacy capabilities → Repository → Attendance Service → Teacher Daily`.
- `teacher-daily.js` أصبح يعتمد على `attendanceService` و`attendanceContext` بدلاً من `dep()` وقراءة `GSP.attendanceRepository` مباشرة.
- الحفاظ على نفس صيغة البيانات ونفس واجهات `GSP` الحالية.
- لا تغيير في Supabase RLS أو صلاحيات Backend.
- الإصدار: `25.5.4`.
