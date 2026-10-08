# المرحلة C — تنظيف ودمج + واجهة الروزنامة

## دمج الملفات
| قبل | بعد |
|-----|-----|
| grades-ui.part01–04 | `js/features/grades-ui.js` |
| print-sheets.part01–04 | `js/features/print-sheets.js` |
| import-export.part01–04 | `js/features/import-export.js` |
| auth-audit.part01–03 | `js/app/auth-audit.js` |
| student-roster.part01–03 | `js/app/student-roster.js` |

ملفات `*.part0x` ما زالت في المجلد كمرجع؛ المصدر التشغيلي هو الملفات المدمجة.

## واجهة الروزنامة
- بطاقة «الروزنامة المركزية» في تبويب **بيانات المدرسة**
- `js/features/calendar/calendar-ui.js`
- الحفظ يحدّث `schoolInfo.termCalendar` + `recordingPeriods` عبر الجسر

## ما تبقى لاحقاً (C+)
- تحويل باقي onclick الديناميكي إلى data-action
- حذف ملفات part بعد فترة استقرار
- مزيد من اعتماد CSS tokens
