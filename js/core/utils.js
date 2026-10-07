/**
 * core/utils.js — المصدر الوحيد للحقيقة للدوال المشتركة
 * (تطبيع النص العربي، ألوان اللغات، الهروب من HTML، الأرقام الهندية)
 * يُحمَّل قبل app.js و features/* حتى تكون الدوال متاحة على window.
 */
(function (global) {
  'use strict';

  function normalizeArabicText(str) {
    return (str || '').toString().trim()
      .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
      .replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ').toLowerCase();
  }

  function langValuesMatch(a, b) {
    var na = normalizeArabicText(a), nb = normalizeArabicText(b);
    return !!na && !!nb && na === nb;
  }

  function subjectIsSecondLang(subjectName) {
    return /لغه(\s+(ال)?اجنبيه)?\s+(ال)?ثاني/.test(normalizeArabicText(subjectName));
  }

  var LANG_COLOR_PALETTE = [
    { bg: '#dbeafe', fg: '#1e3a8a' }, { bg: '#fce7f3', fg: '#9d174d' },
    { bg: '#dcfce7', fg: '#166534' }, { bg: '#fef3c7', fg: '#92400e' },
    { bg: '#ede9fe', fg: '#5b21b6' }, { bg: '#ffe4e6', fg: '#9f1239' },
    { bg: '#cffafe', fg: '#155e75' }, { bg: '#fee2e2', fg: '#991b1b' },
    { bg: '#e0e7ff', fg: '#3730a3' }, { bg: '#fef9c3', fg: '#854d0e' }
  ];

  function getLangColor(lang) {
    var key = normalizeArabicText(lang);
    if (!key) return { bg: '#f1f5f9', fg: '#64748b' };
    var hash = 0;
    for (var i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return LANG_COLOR_PALETTE[hash % LANG_COLOR_PALETTE.length];
  }

  /** هروب آمن من HTML — المصدر الوحيد في المشروع */
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c];
    });
  }

  function langBadgeHtml(lang) {
    var c = getLangColor(lang);
    var safeLang = escapeHtml(lang || 'غير محدد');
    return '<span class="badge" style="background:' + c.bg + ';color:' + c.fg + ';font-weight:700;">' + safeLang + '</span>';
  }

  function toHindiDigits(value) {
    var map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return String(value == null ? '' : value).replace(/[0-9]/g, function (d) { return map[+d]; });
  }

  // تصدير صريح — لا نعيد التعريف إذا وُجدت نسخة أحدث (حماية من التحميل المزدوج)
  if (typeof global.normalizeArabicText !== 'function') global.normalizeArabicText = normalizeArabicText;
  if (typeof global.langValuesMatch !== 'function') global.langValuesMatch = langValuesMatch;
  if (typeof global.subjectIsSecondLang !== 'function') global.subjectIsSecondLang = subjectIsSecondLang;
  if (typeof global.getLangColor !== 'function') global.getLangColor = getLangColor;
  if (typeof global.langBadgeHtml !== 'function') global.langBadgeHtml = langBadgeHtml;
  if (typeof global.toHindiDigits !== 'function') global.toHindiDigits = toHindiDigits;
  // escapeHtml: نفرض نسخة core دائماً (مصدر وحيد)
  global.escapeHtml = escapeHtml;
})(typeof window !== 'undefined' ? window : globalThis);
