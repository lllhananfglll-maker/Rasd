# STEP 13 — Attendance Repository Boundary

## الهدف
فصل Persistence الخاصة بالحضور عن `loadDB/saveDB` داخل مسار Teacher Daily Attendance، مع الإبقاء على نفس نموذج البيانات وآلية التخزين الحالية.

## ما تم
- إضافة `js/infrastructure/repositories/attendance-repository.js`.
- إنشاء Repository للحضور يغلّف `loadDB/saveDB/ensureAttendance` دون تغيير صيغة البيانات.
- تعديل `attendance-service.js` ليعتمد على Repository بدل الاعتماد المباشر على `loadDB/saveDB`.
- إضافة واجهات خدمة `getDatabase` و`saveDatabase` و`getAttendanceState` لتبقى Teacher Daily بعيدة عن Persistence.
- تعديل `teacher-daily.js` لتمرير Repository إلى طبقة الخدمة عند القراءة/الكتابة.
- الحفاظ على API الحالي و`GSP` للتوافق مع بقية النظام.
- لم يتم تعديل Supabase RLS أو صلاحيات Backend.

## التحقق
- `node tests/run-tests.mjs`: يجب أن يمر بالكامل.
- `node --check` لجميع ملفات JavaScript.
- لا تغيير متعمد في نموذج تخزين بيانات الحضور.
