/**
 * core/ui-modal.js
 * نافذة حوار موحّدة (Alert / Confirm / Prompt) بدل الحوارات الافتراضية للمتصفح.
 * - showAlert(message, type?) → Promise
 * - showConfirm(message, type?) → Promise<boolean>
 * - showPrompt(message, defaultValue?, type?) → Promise<string|null>
 * - global.alert مُعاد تعريفه (غير حاجب، لا ينتظر)
 * - للاستبدال التدريجي لـ confirm()/prompt() استخدم الدوال async أعلاه.
 */
(function (global) {
  'use strict';

  var _uiModalResolve = null;
  var _uiModalInput = null;

  function _uiModalEnsureNode() {
    var el = document.getElementById('uiModalOverlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'uiModalOverlay';
    el.className = 'mg-modal-overlay';
    el.style.display = 'none';
    el.setAttribute('role', 'presentation');
    el.innerHTML =
      '<div class="mg-modal-box" style="max-width:480px;" role="dialog" aria-modal="true" aria-labelledby="uiModalHeader">' +
      '  <div class="mg-modal-header ui-modal-header" id="uiModalHeader"></div>' +
      '  <div class="mg-modal-body ui-modal-body" id="uiModalBody"></div>' +
      '  <div class="mg-modal-footer" id="uiModalFooter"></div>' +
      '</div>';
    document.body.appendChild(el);

    // إغلاق عند النقر خارج الصندوق (فقط للـ alert، وليس للـ confirm/prompt)
    el.addEventListener('click', function (e) {
      if (e.target === el && el.dataset.allowBackdropClose === '1') {
        _uiModalClose(false);
      }
    });

    // Escape لإغلاق
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.style.display === 'flex') {
        e.preventDefault();
        _uiModalClose(_uiModalInput ? null : false);
      }
    });

    return el;
  }

  function _uiModalClose(result) {
    var el = document.getElementById('uiModalOverlay');
    if (el) {
      el.style.display = 'none';
      el.dataset.allowBackdropClose = '0';
    }
    _uiModalInput = null;
    if (_uiModalResolve) {
      var r = _uiModalResolve;
      _uiModalResolve = null;
      r(result);
    }
  }

  function _uiModalOpen(opts) {
    var el = _uiModalEnsureNode();
    var head = document.getElementById('uiModalHeader');
    head.className = 'mg-modal-header ui-modal-header ui-type-' + (opts.type || 'info');
    head.textContent = opts.title || '';

    var body = document.getElementById('uiModalBody');
    body.innerHTML = '';

    if (opts.html) {
      body.innerHTML = opts.html;
    } else {
      // دعم أسطر متعددة بشكل صحيح
      var msg = opts.message == null ? '' : String(opts.message);
      var parts = msg.split('\n');
      parts.forEach(function (line, i) {
        if (i > 0) body.appendChild(document.createElement('br'));
        body.appendChild(document.createTextNode(line));
      });
    }

    // حقل إدخال للـ prompt
    if (opts.input !== undefined) {
      var inputWrap = document.createElement('div');
      inputWrap.style.marginTop = '12px';
      var input = document.createElement('input');
      input.type = opts.inputType || 'text';
      input.className = 'form-control';
      input.style.width = '100%';
      input.style.boxSizing = 'border-box';
      input.style.padding = '8px 12px';
      input.style.border = '1px solid #cbd5e1';
      input.style.borderRadius = '8px';
      input.style.fontSize = '15px';
      input.style.fontFamily = 'inherit';
      input.value = opts.input == null ? '' : String(opts.input);
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('aria-label', opts.title || 'إدخال');
      if (opts.placeholder) input.placeholder = opts.placeholder;
      inputWrap.appendChild(input);
      body.appendChild(inputWrap);
      _uiModalInput = input;

      // Enter = تأكيد
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          _uiModalClose(input.value);
        }
      });
    }

    var footer = document.getElementById('uiModalFooter');
    footer.innerHTML = '';
    (opts.buttons || []).forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm ' + (b.cls || 'btn-outline');
      btn.textContent = b.label;
      btn.onclick = function () {
        if (_uiModalInput && b.value === true) {
          _uiModalClose(_uiModalInput.value);
        } else {
          _uiModalClose(b.value);
        }
      };
      footer.appendChild(btn);
    });

    el.dataset.allowBackdropClose = opts.allowBackdropClose ? '1' : '0';
    el.style.display = 'flex';

    // تركيز
    setTimeout(function () {
      if (_uiModalInput) {
        _uiModalInput.focus();
        _uiModalInput.select();
      } else {
        var primary = footer.querySelector('.btn-primary, .btn-danger');
        if (primary) primary.focus();
      }
    }, 30);
  }

  var T = {
    info: 'ℹ️ تنبيه',
    warning: '⚠️ تنبيه',
    danger: '⚠️ تأكيد مطلوب',
    success: '✅ تم',
    prompt: '✏️ إدخال'
  };

  function showAlert(message, type) {
    return new Promise(function (resolve) {
      _uiModalResolve = resolve;
      _uiModalOpen({
        title: T[type] || T.info,
        message: message,
        type: type || 'info',
        allowBackdropClose: true,
        buttons: [{ label: 'حسناً', cls: 'btn-primary', value: true }]
      });
    });
  }

  function showConfirm(message, type) {
    return new Promise(function (resolve) {
      _uiModalResolve = resolve;
      _uiModalOpen({
        title: T[type] || T.danger,
        message: message,
        type: type || 'danger',
        allowBackdropClose: false,
        buttons: [
          { label: 'إلغاء', cls: 'btn-outline', value: false },
          { label: 'متابعة', cls: 'btn-danger', value: true }
        ]
      });
    });
  }

  /**
   * @param {string} message
   * @param {string} [defaultValue]
   * @param {string} [type]
   * @returns {Promise<string|null>} القيمة أو null عند الإلغاء
   */
  function showPrompt(message, defaultValue, type) {
    return new Promise(function (resolve) {
      _uiModalResolve = resolve;
      _uiModalOpen({
        title: T[type] || T.prompt,
        message: message,
        type: type || 'info',
        input: defaultValue != null ? defaultValue : '',
        allowBackdropClose: false,
        buttons: [
          { label: 'إلغاء', cls: 'btn-outline', value: null },
          { label: 'موافق', cls: 'btn-primary', value: true }
        ]
      });
    });
  }

  // إعادة تعريف alert (غير حاجب — لا ينتظر النتيجة)
  global.alert = function (message) {
    var msg = String(message == null ? '' : message);
    var type =
      msg.indexOf('✅') === 0
        ? 'success'
        : msg.indexOf('⚠️') === 0 || msg.indexOf('❌') === 0
          ? 'warning'
          : 'info';
    showAlert(msg, type);
  };

  // لا نعيد تعريف confirm/prompt بشكل متزامن لأن الكود الحالي يعتمد على القيمة الفورية.
  // استخدم showConfirm / showPrompt في الدوال async.
  // للتوافق المؤقت: إذا استُدعي confirm من سياق غير async، نُبقي السلوك الأصلي.

  global.addEventListener('unhandledrejection', function (ev) {
    try {
      var reason = ev && ev.reason;
      var msg =
        (reason && (reason.message || reason.error_description || reason.error)) ||
        String(reason || 'خطأ غير معروف');
      console.error('Unhandled async error:', reason);
      showAlert('⚠️ حدث خطأ غير متوقع: ' + msg, 'warning');
    } catch (e) {}
  });

  global.showAlert = showAlert;
  global.showConfirm = showConfirm;
  global.showPrompt = showPrompt;
})(typeof window !== 'undefined' ? window : globalThis);
