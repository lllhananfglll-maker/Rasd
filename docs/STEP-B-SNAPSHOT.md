# المرحلة B — روزنامة + رصد أسبوعي + غياب يومي + متوسطات حقيقية

## ما أُنجز
1. **calendar-bridge.js** — يربط `domain/calendar` بالتخزين (`schoolInfo.termCalendar`) ويصدّر:
   - `getCentralCalendar` / `getRecordingPeriods` / `getFourWeekDates`
   - `getPeriodWeekStartDates` / `buildMonthDayColumns` / `isWeekExcluded`
   - مزامنة `recordingPeriods` و `week1Dates` للتوافق
2. **attendance-system** — `getMonthCalendarDays` يعتمد على أعمدة الروزنامة بعدد الأسابيع الفعلي + `dateISO`
3. **weekly-period** — عدد أسابيع الفترة من الروزنامة المركزية (حتى 12)
4. **real-averages.js** — متوسط فقط من القيم المدخلة؛ نسبة مواظبة تتجاهل الإجازات
5. اختبارات domain للمتوسطات والروزنامة

## قواعد سارية
انظر `docs/PRODUCT-RULES-REAL-DATA.md`
