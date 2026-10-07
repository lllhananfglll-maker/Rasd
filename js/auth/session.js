/** auth/session.js — جلسة محلية + PIN + ثروتل فشل الدخول */
'use strict';

async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
//  أمان المصادقة: طول PIN + عرض مرة واحدة + حماية ضد التخمين
// ============================================================
// [تحديث 2026-09-04] رُفع الحد الأدنى من 6 إلى 8 خانات لرفع مساحة التخمين (charset من 33 حرفاً/رقماً):
// 33^6 ≈ 1.29 مليار احتمال → 33^8 ≈ 1.4 تريليون احتمال. هذا التغيير لا يكسر أي حساب قائم بالفعل
// (الحسابات القديمة بأرقام سرية من 6 خانات تستمر في العمل تماماً كما هي عند الدخول، لأن الفحص هنا
// يُطبَّق فقط عند توليد/تغيير رقم سري جديد من الآن فصاعداً وليس عند التحقق من الدخول). لرفع أمان
// الحسابات القديمة فعلياً يجب على المستخدم تغيير رقمه السري يدوياً مرة واحدة عبر الواجهة.
//
// minPinLengthForRole / generateRandomPin / isWeakPin / validatePinStrength — ومعها
// MIN_PIN_LENGTH / DEFAULT_PIN_LENGTH / ADMIN_MIN_PIN_LENGTH كلها من core/pin-logic.js
// (المصدر الوحيد لهذا المنطق، ومغطاة باختبارات tests/grade-logic.test.mjs). كانت هذه الدوال
// معرّفة هنا بنسخة ثانية موازية غير مختبَرة تكتب فوق نسخة core/pin-logic.js — أُزيلت عمداً؛
// core/pin-logic.js يُحمَّل الآن فعلياً قبل هذا الملف في index.html (كان قبل ذلك غير مُحمَّل أصلاً).

/**
 * تحقق إضافي (step-up) قبل عمليات إدارية حساسة.
 * يطلب إعادة إدخال الرقم السري الحالي ويقارنه بـ pinHash المخزّن.
 * @returns {Promise<boolean>}
 */
async function requireAdminStepUp(expectedPinHash, promptMessage) {
  if (!expectedPinHash) {
    alert('⚠️ لا يوجد رقم سري محفوظ لهذا الحساب — تعذّر التحقق الإضافي.');
    return false;
  }
  const msg = promptMessage || 'لتأكيد هويتك قبل هذا الإجراء الحساس، أدخل رقمك السري الحالي:';
  const entered = (typeof showPrompt === 'function')
    ? await showPrompt(msg, '', 'warning')
    : prompt(msg);
  if (entered === null) return false;
  const hash = await sha256Hex(String(entered).trim());
  if (hash !== expectedPinHash) {
    alert('❌ الرقم السري غير صحيح. تم إلغاء الإجراء.');
    return false;
  }
  return true;
}

function copyPinFromButton(button) {
  const pin = button && button.getAttribute('data-pin');
  if (!pin) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(pin).then(() => { button.textContent = '✅ تم النسخ'; }).catch(() => {});
  }
}
window.copyPinFromButton = copyPinFromButton;

function formatPinOnceHtml(pin, personName, extraHtml) {
  const safePin = String(pin || '').replace(/"/g, '&quot;');
  const escName = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])));
  const label = personName ? (' لـ ' + escName(personName)) : '';
  return '✅ تم توليد الرقم السري' + label + ': <strong style="font-size:16px; letter-spacing:3px; background:#f1f5f9; padding:3px 12px; border-radius:6px; color:#0f172a;">' + safePin + '</strong> '
    + '<button type="button" class="btn btn-outline btn-sm" style="margin-right:8px;" data-action="copyPinFromButton" data-with-element data-pin="' + safePin + '">📋 نسخ</button>'
    + (extraHtml || '')
    + '<span style="display:block; margin-top:6px; font-size:12px; color:#64748b;">⚠️ يُعرض هذا الرقم <b>مرة واحدة فقط</b> ولن يُحفظ كنص صريح في النظام. انسخه أو اطبع البطاقة الآن — لإعادة الطباعة لاحقاً يجب توليد رقم جديد.</span>';
}

function maskedPinHtml() {
  return '<span style="font-family:monospace; font-weight:700; letter-spacing:2px; background:#f1f5f9; padding:3px 10px; border-radius:6px; color:#64748b;" title="مخفي لأسباب أمنية — الرقم لا يُخزَّن كنص صريح. استخدم «رقم جديد» ثم اطبع فوراً">••••••</span>';
}

// ⚠️ ملاحظة أمان صادقة: هذا الثروتل من جهة العميل فقط (sessionStorage) — يمكن لأي مستخدم تجاوزه
// بالكامل بمسح sessionStorage أو فتح نافذة تصفح خفي أو تعديل الحالة مباشرة من DevTools. فائدته
// الفعلية الوحيدة هي تجربة استخدام أفضل (تقليل محاولات "غير مقصودة" المتكررة)، وليس حماية حقيقية
// ضد هجمات التخمين (brute force). الحماية الفعلية ضد هذا النوع من الهجمات تأتي من طبقة Supabase Auth
// نفسها من جهة السيرفر (GoTrue تفرض حدود معدل افتراضية على نقطة تسجيل الدخول بغض النظر عن كود
// الواجهة هنا) — لو الهدف تشديد الحماية أكثر، الخيار المتاح فعلياً هو من لوحة تحكم Supabase
// (Auth → Rate Limits) أو إضافة CAPTCHA (hCaptcha) على نموذج الدخول، وليس أي شيء يمكن كتابته هنا
// في كود العميل، لأن أي منطق هنا مكشوف بالكامل ويمكن للمستخدم تجاوزه أو تعطيله.
const AUTH_FAIL_KEY = 'gsp_auth_fail_state';
function readAuthFailState() {
  try { return JSON.parse(sessionStorage.getItem(AUTH_FAIL_KEY) || '{}'); } catch (e) { return {}; }
}
function writeAuthFailState(state) {
  sessionStorage.setItem(AUTH_FAIL_KEY, JSON.stringify(state));
}
function clearAuthFailState(scope) {
  const s = readAuthFailState();
  delete s[scope];
  writeAuthFailState(s);
}
function checkAuthThrottle(scope) {
  const s = readAuthFailState();
  const rec = s[scope] || { attempts: 0, lockedUntil: 0 };
  const now = Date.now();
  if (rec.lockedUntil && now < rec.lockedUntil) {
    return { blocked: true, waitMs: rec.lockedUntil - now, attempts: rec.attempts };
  }
  return { blocked: false, waitMs: 0, attempts: rec.attempts || 0 };
}
function registerAuthFailure(scope) {
  const s = readAuthFailState();
  const rec = s[scope] || { attempts: 0, lockedUntil: 0 };
  rec.attempts = (rec.attempts || 0) + 1;
  const delaySec = Math.min(60, Math.pow(2, Math.min(rec.attempts, 6)));
  rec.lockedUntil = Date.now() + delaySec * 1000;
  s[scope] = rec;
  writeAuthFailState(s);
  return { waitMs: delaySec * 1000, attempts: rec.attempts };
}
function formatWaitMessage(waitMs, attempts) {
  const sec = Math.ceil(waitMs / 1000);
  return '⏳ محاولات فاشلة متكررة (' + attempts + '). انتظر ' + sec + ' ثانية قبل المحاولة مجدداً.';
}

function saveSession(sessionObj) { sessionStorage.setItem('gsp_session', JSON.stringify(sessionObj)); }

function clearSession() { sessionStorage.removeItem('gsp_session'); }

function loadSession() { try { return JSON.parse(sessionStorage.getItem('gsp_session')); } catch (e) { return null; } }


// window exports
// MIN_PIN_LENGTH / ADMIN_MIN_PIN_LENGTH / minPinLengthForRole / generateRandomPin / isWeakPin /
// validatePinStrength مُصدَّرة بالفعل من core/pin-logic.js.
GSP.sha256Hex = sha256Hex;
GSP.requireAdminStepUp = requireAdminStepUp;
GSP.formatPinOnceHtml = formatPinOnceHtml;
GSP.maskedPinHtml = maskedPinHtml;
GSP.readAuthFailState = readAuthFailState;
GSP.writeAuthFailState = writeAuthFailState;
GSP.clearAuthFailState = clearAuthFailState;
GSP.checkAuthThrottle = checkAuthThrottle;
GSP.registerAuthFailure = registerAuthFailure;
GSP.formatWaitMessage = formatWaitMessage;
GSP.saveSession = saveSession;
GSP.clearSession = clearSession;
GSP.loadSession = loadSession;
