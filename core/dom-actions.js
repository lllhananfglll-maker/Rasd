/**
 * core/dom-actions.js — نظام تفويض أحداث النقر (Event Delegation) موحّد.
 *
 * الهدف: استبدال onclick="..." المضمّنة في HTML بمستمع نقر واحد على document،
 * حتى يمكن مستقبلاً إزالة 'unsafe-inline' من script-src في الـ CSP فعليًا (لا نظريًا فقط)،
 * ولتقليل مزج المنطق بالعرض داخل السلاسل النصية للـ HTML.
 *
 * الاستخدام في HTML (بدل onclick="fn('a', 1)"):
 *   data-action="fn" data-args='["a", 1]'
 *
 * تمرير حدث النقر نفسه كوسيط أخير (بديل onclick="fn('a', event)"):
 *   data-action="fn" data-args='["a"]' data-with-event
 *
 * تمرير العنصر الذي عليه data-action نفسه (بديل onclick="fn(this)"):
 *   data-action="fn" data-args="[]" data-with-element
 *
 * إغلاق نافذة منبثقة عند النقر على الخلفية فقط دون محتواها
 * (بديل النمط الشائع onclick="if(event.target===this)closeX()"):
 *   <div class="modal-backdrop" data-backdrop-close="closeX"> ... </div>
 *
 * ملاحظة: كل الدوال المستهدفة يجب أن تبقى مُصدَّرة على window (كما هي بالفعل في هذا المشروع).
 */
'use strict';

function gspArgs(values) { return JSON.stringify(values); }

function gspResolveEventArg(el, token) {
  if (!token) return undefined;
  if (token === 'value') return el.value;
  if (token === 'checked') return !!el.checked;
  if (token === 'files[0]') return el.files && el.files[0];
  if (token === 'element') return el;
  return undefined;
}

function gspDispatchDataEvent(e, type) {
  const el = e.target.closest('[data-event-action]');
  if (!el) return;
  const configured = el.getAttribute('data-event-type');
  if (configured && configured !== type) return;
  const fnName = el.getAttribute('data-event-action');
  const fn = (typeof GSP !== 'undefined' ? GSP[fnName] : window[fnName]);
  if (typeof fn !== 'function') return console.error('dom-actions: دالة event غير معرّفة:', fnName);
  let args = [];
  const staticArgs = el.getAttribute('data-event-static');
  if (staticArgs) { try { args = JSON.parse(staticArgs); } catch (err) { return console.error('dom-actions: data-event-static غير صالح:', err); } }
  const token = el.getAttribute('data-event-arg');
  if (token) args.push(gspResolveEventArg(el, token));
  if (el.hasAttribute('data-event-with-event')) args.push(e);
  fn.apply(null,args);
}

(function () {
  document.addEventListener('click', function (e) {
    // 1) نمط "أغلق عند النقر على الخلفية فقط"
    const backdrop = e.target.closest('[data-backdrop-close]');
    if (backdrop && e.target === backdrop) {
      const closeFnName = backdrop.getAttribute('data-backdrop-close');
      const closeFn = window[closeFnName];
      if (typeof closeFn === 'function') closeFn();
      else console.error('dom-actions: دالة إغلاق غير معرّفة:', closeFnName);
      return;
    }

    // 2) نمط "نفّذ إجراء" العام
    const el = e.target.closest('[data-action]');
    if (!el) return;

    const fnName = el.getAttribute('data-action');
    const fn = (typeof GSP !== 'undefined' ? GSP[fnName] : window[fnName]);
    if (typeof fn !== 'function') {
      console.error('dom-actions: دالة action غير معرّفة:', fnName, el);
      return;
    }

    let args = [];
    const rawArgs = el.getAttribute('data-args');
    if (rawArgs) {
      try {
        args = JSON.parse(rawArgs);
      } catch (err) {
        console.error('dom-actions: data-args غير صالحة (JSON) على العنصر:', el, err);
        return;
      }
    }
    if (el.hasAttribute('data-with-element')) args.push(el);
    if (el.hasAttribute('data-with-event')) args.push(e);

    fn.apply(null, args);
  });
  document.addEventListener('change', function(e){ gspDispatchDataEvent(e,'change'); });
  document.addEventListener('input', function(e){ gspDispatchDataEvent(e,'input'); });
})();
