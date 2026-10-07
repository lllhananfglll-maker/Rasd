/**
 * js/app/excel-catalog.js — الجزء 4/9 من app.js السابق (بعد التقسيم لتحسين قابلية الصيانة)
 * المحتوى: اكتشاف أعمدة الإكسيل + كتالوج المواد الرسمي المدمج
 * يعتمد على: نفس النطاق المشترك (window/global scope) الذي كان عليه app.js — يجب تحميله
 * بنفس ترتيب الأجزاء كما في index.html، لأن بعض الدوال هنا تُستدعى من دوال معرّفة في أجزاء لاحقة.
 */
'use strict';

    //  EXCEL / COLUMN DETECTION
    // ============================================================
    const COLUMN_PATTERNS = {
      nationalId: ['الرقم القومي', 'الرقم القومى', 'رقم قومي', 'رقم قومى'],
      seat: ['رقم الجلوس', 'رقم جلوس'],
      name: ['اسم الطالب', 'إسم الطالب', 'اسم الطالبة', 'الاسم'],
      class: ['الفصل', 'فصل', 'الصف'],
      gender: ['النوع', 'الجنس', 'نوع الطالب', 'نوع'],
      secondLang: ['اللغة الثانية', 'لغة ثانية', 'لغة ثانيه', 'تحديد لغة ثانية'],
      resultStatus: ['حالة النتيجة'],
      examPeriod: ['نتيجة']
    };

    // يحوّل قيمة خانة "اجتاز/لم يجتز" (نصاً كان أو رقماً) إلى درجة رقمية: الدرجة العظمى عند الاجتياز،
    // صفر عند عدم الاجتياز. يتعرّف على "لم يجتز" أولاً (لاحتوائها أيضاً على جزء يشبه "جتاز") قبل
    // فحص كلمة الاجتياز نفسها، ويدعم أيضاً كتابة الخانة كرقم (0 أو 1) كبديل.
    function parsePassFailScore(raw, maxScore) {
      const norm = normalizeArabic(String(raw || '')).replace(/\s+/g, ' ').trim();
      if (!norm) return null;
      if (/لم\s*يجتز|راسب|غير\s*مجتاز/.test(norm)) return 0;
      if (/جتاز|ناجح|مجتاز/.test(norm)) return maxScore;
      const num = parseFloat(raw);
      if (!isNaN(num)) return num > 0 ? maxScore : 0;
      return null;
    }

    // → features/import-export.js

    const DEFAULT_PASSFAIL_MAX_SCORE = 10;

    // ============================================================
    //  كتالوج المواد الرسمي المدمج في النظام (مستخرج من ملفات أكتوبر لكل صف/قسم)
    //  المفتاح: "اسم الصف|القسم" (القسم: arabic أو languages). لا حاجة لرفع ملف الدرجات الكامل
    //  بعد الآن لتسجيل المواد؛ يتم زرعها تلقائياً في seedCatalogSubjects أدناه بمجرد تحميل قاعدة
    //  بيانات المرحلة، وتُحدَّد المواد المعروضة للمستخدم حسب الصف والقسم المختارين فعلياً.
    // تم حذف الكتالوج الثابت للمواد ومكوناتها من النظام بناءً على طلب عدم تثبيت المواد؛ الكائن
    // أدناه فارغ عمداً، وتبقى seedCatalogSubjects معطّلة (راجع نقطة الاستدعاء في loadDB) - كل مادة
    // ومكوناتها تُبنى الآن حصرياً من أول ملف Excel يُرفع لكل صف/قسم.
    const SUBJECT_CATALOG = {};

    // يضيف مواد كل صف/قسم من الكتالوج أعلاه إلى db.subjects تلقائياً إن لم تكن موجودة بالفعل (من
    // استيراد يدوي سابق أو تعديل إداري)، ويسجّل نطاق كل مادة (appliesTo: قائمة مفاتيح "صف|قسم")
    // حتى يمكن لاحقاً عرض/تصفية المواد بحسب الصف والقسم المختارين بدل عرضها جميعاً مختلطة.
    // إن وُجدت مادة بنفس الاسم مسبقاً (من استيراد قديم)، لا تُستبدَل مكوناتها المحفوظة - فقط يُضاف
    // نطاق الصف/القسم الجديد إلى appliesTo الخاص بها إن لم يكن مضافاً من قبل.
    function seedCatalogSubjects(db) {
      db.subjects = db.subjects || [];
      let changed = false;
      const byName = new Map(db.subjects.map(s => [s.name, s]));
      Object.keys(SUBJECT_CATALOG).forEach(scopeKey => {
        SUBJECT_CATALOG[scopeKey].forEach(catSubj => {
          let subj = byName.get(catSubj.name);
          if (!subj) {
            subj = {
              name: catSubj.name,
              exportName: catSubj.name,
              appliesTo: [],
              components: catSubj.components.map(c => ({
                name: c.name,
                maxScore: c.type === 'passfail' ? DEFAULT_PASSFAIL_MAX_SCORE : c.maxScore,
                type: c.type,
                isMonthlyGrade: isExamComponent(c.name)
              }))
            };
            db.subjects.push(subj);
            byName.set(subj.name, subj);
            changed = true;
          }
          if (!subj.appliesTo) subj.appliesTo = [];
          if (!subj.appliesTo.includes(scopeKey)) { subj.appliesTo.push(scopeKey);
            changed = true; }
        });
      });
      return changed;
    }

    // → features/import-export.js

    function genderFromNationalId(nationalId) {
      const digits = String(nationalId || '').replace(/\D/g, '');
      if (digits.length !== 14) return null;
      const genderDigit = parseInt(digits.charAt(12), 10);
      if (isNaN(genderDigit)) return null;
      return (genderDigit % 2 === 0) ? 'F' : 'M';
    }

    // ملاحظة: normalizeArabic/isExamComponent/isExamLikeComponent/isAttendanceComponent/
    // isAbsenceDaysComponent/isAbsentMark/isAbsentInputText/toWesternDigits/parseStrictGradeInput/
    // aggregateAbsentAwareValues/ABSENT_MARK/EXAM_TERM_SITTINGS أصبحت جميعها تفويضاً مباشراً لنسخة
    // core/grade-logic.js (المصدر الوحيد لهذا المنطق، ومغطاة بالاختبارات في tests/grade-logic.test.mjs).
    // كانت هذه الدوال معرّفة هنا بنسخة ثانية موازية تكتب فوق نسخة core/grade-logic.js على window
    // (تكرار حقيقي أدى لتشغيل نسخة غير مُختبَرة في التطبيق الفعلي) — أُزيلت هنا عمداً.
    const normalizeArabic = GSP.normalizeArabicLocal;
    // نص العرض للدرجة العظمى لمكوّن ما - "بدون حد" للمكونات بلا درجة عظمى (كالحضور/الغياب)
    function compMaxLabel(comp) {
      return (comp.maxScore === null || comp.maxScore === undefined || comp.maxScore === '') ? 'بدون حد' : comp.maxScore;
    }

    function markGradeInputAbsent(input) {
      if (!input) return;
      input.value = (typeof ABSENT_MARK !== 'undefined' ? ABSENT_MARK : 'غ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof validateGradeInput === 'function') validateGradeInput(input);
    }
    GSP.markGradeInputAbsent = markGradeInputAbsent;

    // ============================================================
