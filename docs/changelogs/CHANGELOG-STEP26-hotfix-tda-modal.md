# Hotfix — Teacher Daily modal visible on startup

## المشكلة
نافذة «تسجيل حضور اليوم» تظهر فور فتح النظام بدل شاشة الدخول/اللوحة.

## السبب
`.tda-overlay { display:flex }` في `teacher-daily-attendance.css` يُحمَّل بعد `.hidden { display:none }` في `base.css` وبنفس الخصوصية، فيلغي الإخفاء.

## الإصلاح
- إضافة `.tda-overlay.hidden { display: none !important; }`
- `openTeacherDailyAttendance` يزيل class `hidden`
- `closeTeacherDailyAttendance` يعيد class `hidden`
