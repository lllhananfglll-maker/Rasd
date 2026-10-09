/**
 * core/pin-logic.js — فحص قوة الرقم السري (دوال نقية قابلة للاختبار)
 */
(function (global) {
  'use strict';

  var MIN_PIN_LENGTH = 8;
  var DEFAULT_PIN_LENGTH = 8;
  var ADMIN_MIN_PIN_LENGTH = 10;
  var ADMIN_ROLES = { superadmin: true, stageadmin: true, monitor: true };

  function minPinLengthForRole(role) {
    return ADMIN_ROLES[role] ? ADMIN_MIN_PIN_LENGTH : MIN_PIN_LENGTH;
  }

  function isWeakPin(pin) {
    var p = String(pin || '');
    if (!p) return true;
    if (/^(.)\1+$/.test(p)) return true;
    var asc = true, desc = true;
    for (var i = 1; i < p.length; i++) {
      var d = p.toUpperCase().charCodeAt(i) - p.toUpperCase().charCodeAt(i - 1);
      if (d !== 1) asc = false;
      if (d !== -1) desc = false;
    }
    if (p.length >= 4 && (asc || desc)) return true;
    return false;
  }

  function validatePinStrength(pin, opts) {
    var p = String(pin || '').trim();
    var role = (opts && opts.role) || null;
    var minLen = minPinLengthForRole(role);
    if (!p) return { valid: false, reason: 'لا يمكن ترك الرقم السري فارغاً.' };
    if (p.length < minLen) {
      var adminNote = ADMIN_ROLES[role]
        ? ' (الأدوار الإدارية تتطلب ' + ADMIN_MIN_PIN_LENGTH + ' خانات على الأقل)'
        : '';
      return { valid: false, reason: '⚠️ الرقم السري يجب ألا يقل عن ' + minLen + ' خانات.' + adminNote };
    }
    if (isWeakPin(p)) {
      return {
        valid: false,
        reason: '⚠️ هذا الرقم السري يتبع نمطاً شائعاً يسهل تخمينه (مثل تكرار نفس الرمز أو تسلسل متتابع). اختر رقماً أقل قابلية للتخمين.'
      };
    }
    return { valid: true, reason: '' };
  }

  function generateRandomPin(length, role) {
    var floor = role ? minPinLengthForRole(role) : MIN_PIN_LENGTH;
    var len = Math.max(Number(length) || DEFAULT_PIN_LENGTH, floor);
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  if (typeof global.MIN_PIN_LENGTH === 'undefined') global.MIN_PIN_LENGTH = MIN_PIN_LENGTH;
  if (typeof global.ADMIN_MIN_PIN_LENGTH === 'undefined') global.ADMIN_MIN_PIN_LENGTH = ADMIN_MIN_PIN_LENGTH;
  if (typeof global.DEFAULT_PIN_LENGTH === 'undefined') global.DEFAULT_PIN_LENGTH = DEFAULT_PIN_LENGTH;
  if (typeof global.isWeakPin !== 'function') global.isWeakPin = isWeakPin;
  if (typeof global.validatePinStrength !== 'function') global.validatePinStrength = validatePinStrength;
  if (typeof global.generateRandomPin !== 'function') global.generateRandomPin = generateRandomPin;
  if (typeof global.minPinLengthForRole !== 'function') global.minPinLengthForRole = minPinLengthForRole;

  global.GSPPinLogic = {
    MIN_PIN_LENGTH: MIN_PIN_LENGTH,
    ADMIN_MIN_PIN_LENGTH: ADMIN_MIN_PIN_LENGTH,
    DEFAULT_PIN_LENGTH: DEFAULT_PIN_LENGTH,
    minPinLengthForRole: minPinLengthForRole,
    isWeakPin: isWeakPin,
    validatePinStrength: validatePinStrength,
    generateRandomPin: generateRandomPin
  };
})(typeof window !== 'undefined' ? window : globalThis);
