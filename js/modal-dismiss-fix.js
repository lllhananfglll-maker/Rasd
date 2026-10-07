/**
 * modal-dismiss-fix.js
 * إصلاح طارئ لإغلاق نوافذ التعارض/الدرجات الناقصة عند النقر على أزرارها.
 * يُحمَّل في نهاية السكربتات ويعمل بمرحلة capture حتى لا يفوته أي نقرة.
 */
(function () {
  'use strict';

  function hideOverlay(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.setProperty('display', 'none', 'important');
    el.classList.add('hidden');
  }

  function settleStale(choice) {
    try {
      if (typeof window.__gspStaleCooldownUntil !== 'number' || window.__gspStaleCooldownUntil < Date.now()) {
        window.__gspStaleCooldownUntil = Date.now() + 60000; // دقيقة تهدئة
      }
    } catch (e) {}
    hideOverlay('stalePushModalOverlay');
    try {
      if (typeof GSP !== 'undefined' && typeof GSP.hideStalePushModal === 'function') GSP.hideStalePushModal();
    } catch (e) {}
    // إن وُجدت دالة settle من cloud-sync استخدمها
    try {
      if (typeof _stalePushModalSettle === 'function') _stalePushModalSettle(choice);
    } catch (e) {}
  }

  function settleMissing(proceed) {
    hideOverlay('missingGradesModalOverlay');
    try {
      if (typeof GSP !== 'undefined' && typeof GSP.hideMissingGradesModal === 'function') GSP.hideMissingGradesModal();
    } catch (e) {}
    try {
      if (typeof _missingGradesModalSettle === 'function') _missingGradesModalSettle(proceed);
    } catch (e) {}
  }

  function settleGradeConflict(keepMine) {
    hideOverlay('gradeConflictModalOverlay');
    try {
      if (typeof GSP !== 'undefined' && typeof GSP.hideGradeConflictModal === 'function') GSP.hideGradeConflictModal();
    } catch (e) {}
    try {
      if (typeof _gradeConflictModalSettle === 'function') _gradeConflictModalSettle(keepMine);
    } catch (e) {}
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var btn = t.closest('button, [role="button"], a');
    if (!btn || !btn.id) return;

    switch (btn.id) {
      case 'stalePushModalPullBtn':
        e.preventDefault();
        e.stopPropagation();
        settleStale('pull');
        // حاول سحب السحابة إن توفرت الدالة
        try {
          if (typeof GSP !== 'undefined' && typeof GSP.pullFromCloud === 'function') {
            Promise.resolve(GSP.pullFromCloud(true)).catch(function () {});
          } else if (typeof pullFromCloud === 'function') {
            Promise.resolve(pullFromCloud(true)).catch(function () {});
          }
        } catch (err) {}
        break;

      case 'stalePushModalForceBtn':
        e.preventDefault();
        e.stopPropagation();
        settleStale('force');
        try {
          if (typeof GSP !== 'undefined' && typeof GSP.runCloudPush === 'function') {
            // السماح بالرفع بعد إغلاق النافذة
            setTimeout(function () {
              try { GSP.runCloudPush(); } catch (e2) {}
            }, 300);
          }
        } catch (err) {}
        break;

      case 'missingGradesModalProceedBtn':
        e.preventDefault();
        e.stopPropagation();
        settleMissing(true);
        break;

      case 'missingGradesModalCancelBtn':
        e.preventDefault();
        e.stopPropagation();
        settleMissing(false);
        break;

      case 'gradeConflictModalKeepMineBtn':
        e.preventDefault();
        e.stopPropagation();
        settleGradeConflict(true);
        break;

      case 'gradeConflictModalCancelBtn':
        e.preventDefault();
        e.stopPropagation();
        settleGradeConflict(false);
        break;

      default:
        break;
    }
  }, true); // capture = true → يلتقط النقرة قبل أي مستمع آخر

  // مسار إضافي: إخفاء فوري عند أي نقرة داخل تذييل النوافذ المعروفة
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var footer = t.closest('.mg-modal-footer');
    if (!footer) return;
    var overlay = footer.closest('.mg-modal-overlay');
    if (!overlay) return;
    var id = overlay.id || '';
    if (id === 'stalePushModalOverlay' || id === 'missingGradesModalOverlay' || id === 'gradeConflictModalOverlay') {
      // لا نخفي هنا إلا إذا كان الزر داخل التذييل (تم التعامل أعلاه بالـ id)
      // هذا المسار احتياطي إذا تغيّر id الزر
      if (t.closest('button')) {
        setTimeout(function () {
          if (overlay.style.display !== 'none') {
            overlay.style.setProperty('display', 'none', 'important');
            overlay.classList.add('hidden');
          }
        }, 50);
      }
    }
  }, true);

  console.info('[modal-dismiss-fix] loaded');
})();

// عند النقر على أي تبويب: تأكد من إزالة طبقات النوافذ الحاجبة
document.addEventListener('click', function (e) {
  var t = e.target && e.target.closest && e.target.closest('.tab, [data-tab]');
  if (!t) return;
  ['stalePushModalOverlay','missingGradesModalOverlay','gradeConflictModalOverlay','uiModalOverlay'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.setProperty('display', 'none', 'important');
    el.classList.add('hidden');
    el.style.pointerEvents = 'none';
  });
}, true);
