/** core/storage.js */
'use strict';
var ROOT_DB_KEY = 'gradeSystemPro_DB';

function emptyStageData() {
  return { students: [], subjects: [], grades: [], classes: [], classGrade: {}, metaByGrade: {}, locks: {}, meta: null, teachers: [], schoolInfo: null, attendance: null };
}

// الكيانات الثمانية الأساسية الثابتة — لا يُسمح بإضافة مراحل من الواجهة
const FIXED_STAGES = [
  { id: 'stage_kg_ar',          name: 'رياض أطفال عربي', section: 'arabic',    stageType: 'kg' },
  { id: 'stage_kg_lang',        name: 'رياض أطفال لغات', section: 'languages', stageType: 'kg' },
  { id: 'stage_primary_ar',     name: 'ابتدائي عربي',    section: 'arabic',    stageType: 'primary' },
  { id: 'stage_primary_lang',   name: 'ابتدائي لغات',    section: 'languages', stageType: 'primary' },
  { id: 'stage_prep_ar',        name: 'إعدادى عربي',     section: 'arabic',    stageType: 'prep' },
  { id: 'stage_prep_lang',      name: 'إعدادى لغات',     section: 'languages', stageType: 'prep' },
  { id: 'stage_secondary_ar',   name: 'ثانوي عربي',      section: 'arabic',    stageType: 'secondary' },
  { id: 'stage_secondary_lang', name: 'ثانوي لغات',      section: 'languages', stageType: 'secondary' }
];
const FIXED_STAGE_IDS = new Set(FIXED_STAGES.map(s => s.id));

function _inferStageTypeFromName(name) {
  const n = (typeof normalizeArabicText === 'function')
    ? normalizeArabicText(name)
    : String(name || '').replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();
  if (/روض|رياض|\bkg\b/.test(n)) return 'kg';
  if (/ابتدائ/.test(n)) return 'primary';
  if (/اعداد|اعدادي|اعدادى/.test(n)) return 'prep';
  if (/ثانوي|ثانوى/.test(n)) return 'secondary';
  return null;
}

function stageDataWeight(st) {
  const d = (st && st.data) || {};
  return ((d.students || []).length * 10)
    + ((d.teachers || []).length * 5)
    + ((d.grades || []).length)
    + ((d.subjects || []).length * 2)
    + (Object.keys(d.metaByGrade || {}).length * 3);
}

function _inferSectionFromName(name) {
  const n = (typeof normalizeArabicText === 'function')
    ? normalizeArabicText(name)
    : String(name || '').replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();
  if (/لغات/.test(n)) return 'languages';
  if (/عربي/.test(n)) return 'arabic';
  return null;
}

function _stageMatchesFixed(s, fs) {
  if (!s || FIXED_STAGE_IDS.has(s.id)) return false;
  const sec = s.section || _inferSectionFromName(s.name) || '';
  if (sec && sec !== fs.section) return false;
  const inferred = s.stageType || _inferStageTypeFromName(s.name);
  return inferred === fs.stageType;
}

// يدمج بيانات مرحلة قديمة داخل مرحلة ثابتة (إن كانت الثابتة فارغة أو أضعف)، ثم يُهمل القديمة.
function _absorbStageData(target, source) {
  if (!source || !source.data) return false;
  if (!target.data) target.data = emptyStageData();
  const tw = stageDataWeight(target);
  const sw = stageDataWeight(source);
  if (sw <= 0) return false;
  if (tw === 0 || sw > tw) {
    target.data = source.data;
    if (source.updatedAt) target.updatedAt = source.updatedAt;
    return true;
  }
  return false;
}

function ensureFixedStages(root) {
  if (!root) return false;
  if (!Array.isArray(root.stages)) root.stages = [];
  let changed = false;
  const consumed = new Set();

  FIXED_STAGES.forEach(fs => {
    let st = root.stages.find(s => s.id === fs.id);
    // كل المرشحين القدامى المطابقين لهذا الكيان (مرتّبين من الأغنى بياناتًا)
    const candidates = root.stages
      .filter(s => s.id !== fs.id && !consumed.has(s.id) && _stageMatchesFixed(s, fs))
      .sort((a, b) => stageDataWeight(b) - stageDataWeight(a));

    if (!st) {
      if (candidates.length) {
        // أعد تسمية أغنى مرشح ليصبح الكيان الثابت
        st = candidates[0];
        consumed.add(st.id);
        const oldId = st.id;
        st.id = fs.id;
        st.name = fs.name;
        st.section = fs.section;
        st.stageType = fs.stageType;
        if (!st.data) st.data = emptyStageData();
        (root.stageAdmins || []).forEach(a => {
          if (Array.isArray(a.stageIds)) a.stageIds = a.stageIds.map(id => id === oldId ? fs.id : id);
        });
        (root.stageMonitors || []).forEach(a => {
          if (Array.isArray(a.stageIds)) a.stageIds = a.stageIds.map(id => id === oldId ? fs.id : id);
        });
        changed = true;
        // ادمج بقية المرشحين إن لزم
        candidates.slice(1).forEach(c => {
          consumed.add(c.id);
          if (_absorbStageData(st, c)) changed = true;
          (root.stageAdmins || []).forEach(a => {
            if (Array.isArray(a.stageIds) && a.stageIds.includes(c.id)) {
              a.stageIds = a.stageIds.filter(id => id !== c.id);
              if (!a.stageIds.includes(fs.id)) a.stageIds.push(fs.id);
            }
          });
          (root.stageMonitors || []).forEach(a => {
            if (Array.isArray(a.stageIds) && a.stageIds.includes(c.id)) {
              a.stageIds = a.stageIds.filter(id => id !== c.id);
              if (!a.stageIds.includes(fs.id)) a.stageIds.push(fs.id);
            }
          });
        });
      } else {
        root.stages.push({ id: fs.id, name: fs.name, section: fs.section, stageType: fs.stageType, data: emptyStageData() });
        changed = true;
      }
      return;
    }

    // المرحلة الثابتة موجودة: حدّث الاسم/القسم، وامتصّ بيانات المرشحين الأغنياء إن كانت هي فارغة/أضعف
    if (st.name !== fs.name) { st.name = fs.name; changed = true; }
    if (st.section !== fs.section) { st.section = fs.section; changed = true; }
    if (st.stageType !== fs.stageType) { st.stageType = fs.stageType; changed = true; }
    if (!st.data) { st.data = emptyStageData(); changed = true; }
    candidates.forEach(c => {
      consumed.add(c.id);
      if (_absorbStageData(st, c)) changed = true;
      (root.stageAdmins || []).forEach(a => {
        if (Array.isArray(a.stageIds) && a.stageIds.includes(c.id)) {
          a.stageIds = a.stageIds.filter(id => id !== c.id);
          if (!a.stageIds.includes(fs.id)) a.stageIds.push(fs.id);
          changed = true;
        }
      });
      (root.stageMonitors || []).forEach(a => {
        if (Array.isArray(a.stageIds) && a.stageIds.includes(c.id)) {
          a.stageIds = a.stageIds.filter(id => id !== c.id);
          if (!a.stageIds.includes(fs.id)) a.stageIds.push(fs.id);
          changed = true;
        }
      });
    });
  });

  // حذف كل المراحل غير الثابتة بعد امتصاص بياناتها (المكررات القديمة)
  const before = root.stages.length;
  const removedIds = root.stages.filter(s => !FIXED_STAGE_IDS.has(s.id)).map(s => s.id);
  if (removedIds.length) {
    root.stages = root.stages.filter(s => FIXED_STAGE_IDS.has(s.id));
    (root.stageAdmins || []).forEach(a => {
      if (Array.isArray(a.stageIds)) {
        a.stageIds = a.stageIds.filter(id => FIXED_STAGE_IDS.has(id));
      }
    });
    root.stageAdmins = (root.stageAdmins || []).filter(a => (a.stageIds || []).length > 0);
    (root.stageMonitors || []).forEach(a => {
      if (Array.isArray(a.stageIds)) {
        a.stageIds = a.stageIds.filter(id => FIXED_STAGE_IDS.has(id));
      }
    });
    if (typeof currentStageId !== 'undefined' && currentStageId && !FIXED_STAGE_IDS.has(currentStageId)) {
      currentStageId = (root.stages[0] && root.stages[0].id) || null;
    }
    changed = true;
  }

  const order = FIXED_STAGES.map(s => s.id);
  root.stages.sort((a, b) => {
    const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return changed;
}

// تنظيف يدوي فوري للمراحل المكررة (لرئيس الكنترول) — يدمج ثم يحذف غير الثابتة
async function cleanupDuplicateStages() {
  if (currentAccountType !== 'superadmin') {
    alert('متاح لرئيس الكنترول فقط.');
    return;
  }
  const root = getRootDB();
  const extras = (root.stages || []).filter(s => !FIXED_STAGE_IDS.has(s.id));
  if (!extras.length) {
    alert('لا توجد مراحل مكررة. القائمة تحتوي على الكيانات الثمانية فقط.');
    return;
  }
  const ok = await showConfirm(
    'سيتم دمج بيانات المراحل القديمة داخل الكيانات الثمانية الثابتة، ثم حذف المكررات (' +
    extras.length + ' مرحلة).\n\n' +
    'المراحل المكررة:\n- ' + extras.map(s => stageDisplayLabel(s)).join('\n- ') +
    '\n\nهل تريد المتابعة؟'
  );
  if (!ok) return;
  if (typeof requireAdminStepUp === 'function' && root.superAdminPasswordHash) {
    const okStep = await requireAdminStepUp(root.superAdminPasswordHash, 'أدخل كلمة سر رئيس الكنترول لتأكيد دمج المراحل:');
    if (!okStep) return;
  }
  const changed = ensureFixedStages(root);
  if (changed) {
    saveRootDB(root);
    if (typeof scheduleCloudPush === 'function') scheduleCloudPush();
    // حذف صفوف السحابة للمراحل القديمة إن أمكن
    if (typeof cloudAvailable !== 'undefined' && cloudAvailable && typeof isOnline !== 'undefined' && isOnline && typeof supabaseClient !== 'undefined') {
      for (const s of extras) {
        try { await supabaseClient.from('grade_system_state').delete().eq('id', 'stage_' + s.id); } catch (e) {}
      }
    }
  }
  loadStagesMgmtUI();
  applyRoleUI();
  alert('✅ تم التنظيف. بقيت المراحل الثمانية الأساسية فقط مع نقل البيانات إليها.');
}
GSP.cleanupDuplicateStages = cleanupDuplicateStages;


// ذاكرة تخزين مؤقت (in-memory) لقاعدة البيانات الجذرية داخل نفس تحميل الصفحة: بدون هذا الكاش كانت
// getRootDB() تُعيد JSON.parse لكامل قاعدة البيانات (وهي تضم نسخ Excel الأصلية Base64 لكل صف في
// كل المراحل) من localStorage في كل استدعاء - وهي كانت تُستدعى عشرات المرات أثناء أي عملية تصدير
// واحدة (مرة لكل زر، مرة لكل إعادة رسم للواجهة...). الكاش يجعل القراءة فورية، ويتم تحديثه (وليس
// إلغاؤه فقط) في كل مرة تُكتب فيها البيانات لـ localStorage حتى يبقى متزامناً دائماً معها.
var _rootDBCache = null;
var _localPersistencePromise = Promise.resolve();
var _localPersistenceHealthy = true;
// ============================================================
//  تخزين نسخ ملفات Excel الأصلية في Supabase Storage (تخزين سحابي حقيقي، وليس محلياً)
//  ------------------------------------------------------------
//  بدلاً من تضمين محتوى الملف بالكامل (Base64) داخل الكائن الرئيسي المخزَّن في localStorage وفي
//  عمود jsonb بجدول grade_system_state (وهو ما كان يسبب امتلاء مساحة المتصفح، ويُثقل حجم كل عملية
//  مزامنة)، يُرفَع الملف الآن كملف ثنائي مستقل إلى Supabase Storage (خدمة تخزين ملفات سحابية حقيقية،
//  منفصلة عن قاعدة البيانات)، ولا يُحفَظ في الكائن الرئيسي سوى "مسار" نصي صغير جداً يشير إلى مكان
//  الملف في التخزين السحابي (انظر WORKBOOK_STORAGE_BUCKET ودوال uploadWorkbookToCloud/
//  downloadWorkbookFromCloud بالأسفل، بعد تهيئة supabaseClient). هذا يحل مشكلة امتلاء المساحة نهائياً
//  (فالملف لم يعد يمر على localStorage إطلاقاً)، ويجعل ميزة "تنزيل نسخة الملف الأصلي المحدَّثة" تعمل
//  من أي جهاز متصل بالإنترنت، وليس فقط من نفس الجهاز/الجلسة التي رُفع منها الملف.
//  ⚠️ متطلب إعداد لمرة واحدة على حساب Supabase: يجب إنشاء Storage bucket باسم القيمة الموجودة في
//  WORKBOOK_STORAGE_BUCKET من لوحة تحكم Supabase (Storage → New bucket)، وضبط صلاحياته للسماح لدور
//  anon بالرفع والتنزيل والحذف - تماماً كما تم ضبط صلاحيات جدول grade_system_state سابقاً.
// ============================================================
const WORKBOOK_STORAGE_BUCKET = 'workbook-originals';

function isQuotaError(e) {
  return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
}

// ============================================================
//  التخزين المحلي: IndexedDB بدلاً من localStorage
//  ------------------------------------------------------------
//  localStorage محدود بسقف صارم يفرضه المتصفح نفسه (عادة 5-10 ميجابايت فقط لكل موقع)، وهو سقف
//  ثابت لا يمكن لأي إعداد داخل التطبيق أو المتصفح توسيعه. IndexedDB في المقابل مساحته أكبر بكثير
//  جداً (عادة مئات الميجابايتات وأحياناً جيجابايتات، بحسب المساحة الحرة على جهاز المستخدم فعلياً)،
//  وهي الحل الوحيد الحقيقي لمشكلة "امتلاء الذاكرة" عند تراكم بيانات مراحل/طلاب/درجات كثيرة.
//  للحفاظ على كل الكود القائم (getRootDB/saveRootDB تُستخدَم في عشرات الأماكن بافتراض قراءة فورية
//  متزامنة) يبقى _rootDBCache هو "مصدر الحقيقة" الفوري في الذاكرة كما كان تماماً؛ فقط طريقة القراءة
//  الأولى عند بدء التطبيق (loadRootDBIntoCache، تُستدعى مرة واحدة قبل init()) وطريقة الحفظ
//  (persistRootDB، تكتب في الخلفية دون انتظار) تغيّرتا لتستخدما IndexedDB بدل localStorage.
//  بيانات المستخدمين الحاليين (المخزَّنة سابقاً في localStorage) تُرحَّل تلقائياً ومرة واحدة فقط عند
//  أول تشغيل بعد هذا التحديث، ثم تُحذف من localStorage فوراً لتحرير مساحته بالكامل.
// ============================================================
const IDB_NAME = 'gradeSystemProDB';
const IDB_STORE = 'kv';
var _idbConnPromise = null;

function getIndexedDBGateway() {
  const infrastructure = (window.GSP && window.GSP.infrastructure) || {};
  const database = infrastructure.database || {};
  if (database.gateway && typeof database.gateway.open === 'function') return database.gateway;
  // Defensive fallback for isolated legacy usage; the application normally loads
  // js/infrastructure/database-gateway.js before this file.
  if (typeof database.createIndexedDBGateway === 'function') {
    database.gateway = database.createIndexedDBGateway({
      indexedDB: window.indexedDB, dbName: IDB_NAME, storeName: IDB_STORE
    });
    return database.gateway;
  }
  throw new Error('IndexedDB gateway is not initialized');
}

function idbOpen() {
  if (_idbConnPromise) return _idbConnPromise;
  _idbConnPromise = getIndexedDBGateway().open();
  return _idbConnPromise;
}

function idbGet(key) {
  return getIndexedDBGateway().get(key);
}

function idbSet(key, value) {
  return getIndexedDBGateway().set(key, value);
}

// بانر تحذير صغير وغير مزعج يظهر أعلى الصفحة فقط إذا فشلت الكتابة في IndexedDB (نادر جداً عملياً
// نظراً لسعتها الكبيرة)، حتى لا يُفقَد أي تعديل للمستخدم دون علمه كما كان يحدث سابقاً مع localStorage.
function showStorageWarning(msg) {
  let el = document.getElementById('storageWarningBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'storageWarningBanner';
    el.style.cssText = 'position:fixed; top:0; right:0; left:0; z-index:9999; background:#b91c1c; color:#fff; padding:10px 16px; text-align:center; font-size:14px; font-weight:600;';
    document.body.prepend(el);
  }
  el.textContent = msg;
}

/**
 * إزالة أي أرقام سرية مخزّنة كنص صريح (pin) مع الإبقاء على pinHash فقط.
 * يُستدعى عند التحميل والحفظ حتى لا تبقى أسرار بصيغة قابلة للقراءة في IndexedDB أو المزامنة.
 */
function stripPlaintextPins(root) {
  if (!root || typeof root !== 'object') return false;
  let changed = false;
  const stripList = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(item => {
      if (item && Object.prototype.hasOwnProperty.call(item, 'pin')) {
        delete item.pin;
        changed = true;
      }
    });
  };
  stripList(root.stageAdmins);
  stripList(root.stageMonitors);
  (root.stages || []).forEach(st => {
    if (st && st.data && Array.isArray(st.data.teachers)) {
      st.data.teachers.forEach(t => {
        if (t && Object.prototype.hasOwnProperty.call(t, 'pin')) {
          delete t.pin;
          changed = true;
        }
      });
    }
  });
  if (Array.isArray(root.teachers)) {
    root.teachers.forEach(t => {
      if (t && Object.prototype.hasOwnProperty.call(t, 'pin')) {
        delete t.pin;
        changed = true;
      }
    });
  }
  return changed;
}
GSP.stripPlaintextPins = stripPlaintextPins;

// تُستدعى مرة واحدة فقط عند بدء التطبيق (قبل init()) لتحميل البيانات إلى الكاش من IndexedDB، أو
// ترحيلها تلقائياً من localStorage إن كانت موجودة هناك من نسخة سابقة من النظام.
async function loadRootDBIntoCache() {
  try {
    const fromIdb = await idbGet(ROOT_DB_KEY);
    if (fromIdb) {
      _rootDBCache = fromIdb;
      if (stripPlaintextPins(_rootDBCache)) {
        try { await idbSet(ROOT_DB_KEY, _rootDBCache); } catch (e) { console.error('تعذّر حفظ تنظيف الأرقام السرية:', e); }
      }
      return;
    }
  } catch (e) { console.error('تعذّرت القراءة من IndexedDB:', e); }

  try {
    const raw = localStorage.getItem(ROOT_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      stripPlaintextPins(parsed);
      _rootDBCache = parsed;
      try { await idbSet(ROOT_DB_KEY, parsed); localStorage.removeItem(ROOT_DB_KEY); }
      catch (e) { console.error('تعذّر ترحيل البيانات القديمة إلى IndexedDB:', e); }
    }
  } catch (e) { console.error('تعذّرت قراءة البيانات القديمة من localStorage:', e); }
}

function persistRootDB(root, protectKeys) {
 try {
  try { stripPlaintextPins(root); } catch (_) {}
  _rootDBCache = root;
  const saveBadge = document.getElementById('autosaveStatus'); if (saveBadge) { saveBadge.textContent='🟠 جاري الحفظ...'; saveBadge.className='autosave-status autosave-saving'; }
  _localPersistenceHealthy = false;
  // STEP 37: serialize durable writes. A second save must never race the first
  // IndexedDB transaction, otherwise an older snapshot can finish after a newer one.
  const previousPersistence = _localPersistencePromise;
  _localPersistencePromise = Promise.resolve(previousPersistence).catch(() => true).then(() => idbSet(ROOT_DB_KEY, root)).then(() => {
    _localPersistenceHealthy = true;
    try {
      const syncStatus = GSP.application && GSP.application.services && GSP.application.services.syncStatus;
      if (syncStatus && typeof syncStatus.setStorageHealth === 'function') syncStatus.setStorageHealth(true);
    } catch (_) {}
    const b=document.getElementById('autosaveStatus'); if(b){b.textContent='🟢 تم الحفظ';b.className='autosave-status autosave-saved';}
    // STEP 36: only release queued cloud work after the local durable write succeeds.
    try { if (typeof scheduleCloudPush === 'function') scheduleCloudPush(); } catch (_) {}
    return true;
  }).catch(e => {
    _localPersistenceHealthy = false;
    console.error('تعذّرت الكتابة في IndexedDB:', e);
    try {
      const syncStatus = GSP.application && GSP.application.services && GSP.application.services.syncStatus;
      if (syncStatus && typeof syncStatus.setStorageHealth === 'function') syncStatus.setStorageHealth(false);
    } catch (_) {}
    showStorageWarning('⚠️ تعذّر حفظ آخر تعديل في مساحة تخزين المتصفح. أعد المحاولة، أو تأكد أن وضع "التصفح الخاص/الخفي" غير مُفعّل، فهو يحدّ من مساحة IndexedDB في بعض المتصفحات.'); const b=document.getElementById('autosaveStatus'); if(b){b.textContent='🔴 فشل الحفظ';b.className='autosave-status autosave-error';}
    return false;
  });
  return _localPersistencePromise;
 } catch (e) {
   _localPersistenceHealthy = false;
   console.error('persistRootDB failed:', e);
   try {
     const syncStatus = GSP.application && GSP.application.services && GSP.application.services.syncStatus;
     if (syncStatus && typeof syncStatus.setStorageHealth === 'function') syncStatus.setStorageHealth(false);
   } catch (_) {}
   alert('⚠️ حدث خطأ أثناء حفظ قاعدة البيانات الرئيسية.\n' + (e && e.message ? e.message : e));
   _localPersistencePromise = Promise.resolve(false);
   return _localPersistencePromise;
 }
}
GSP.whenLocalPersistenceSettled = function () { return _localPersistencePromise; };
GSP.isLocalPersistenceHealthy = function () { return _localPersistenceHealthy; };

// الكائن الجذري: يحتوي قائمة كل المراحل الدراسية (كل مرحلة ببياناتها الخاصة الكاملة والمعزولة)،
// وقائمة حسابات مديري المراحل، وكلمة سر رئيس الكنترول.
function getRootDB() {
 try {
  if (_rootDBCache) return _rootDBCache;
  // يجب ألا يصل التنفيذ هنا فعلياً، لأن loadRootDBIntoCache() تُنتظَر (await) قبل استدعاء init()
  // بالأسفل، فيكون _rootDBCache قد امتلأ دائماً قبل أي استدعاء آخر لـ getRootDB(). هذا فقط شبكة أمان.
  let root = { stages: [], stageAdmins: [], stageMonitors: [], superAdminPasswordHash: null, lastUpdated: null };
  if (!root.stages) root.stages = [];
  if (!root.stageAdmins) root.stageAdmins = [];
  if (!root.stageMonitors) root.stageMonitors = [];
  // ترقية حسابات مديري المراحل القديمة (حقل stageId مفرد) إلى الصيغة الجديدة التي تدعم إسناد
  // أكثر من مرحلة وأكثر من قسم لنفس المدير: stageIds (مصفوفة) و sections (مصفوفة).
  let stageAdminsUpgraded = false;
  root.stageAdmins.forEach(a => {
    if (!Array.isArray(a.stageIds)) { a.stageIds = a.stageId ? [a.stageId] : [];
      delete a.stageId; stageAdminsUpgraded = true; }
    if (!Array.isArray(a.sections) || !a.sections.length) { a.sections = ['arabic', 'languages'];
      stageAdminsUpgraded = true; }
  });
  if (stageAdminsUpgraded) persistRootDB(root);
  if (!Array.isArray(root.stageMonitors)) { root.stageMonitors = []; persistRootDB(root); }
  // ترقية بيانات قديمة (من نسخة قبل دعم تعدد المراحل): كانت كل بيانات المدرسة مخزَّنة مباشرة في
  // الكائن الجذري بدون تقسيم إلى مراحل. يتم هنا تحويلها تلقائياً ومرة واحدة فقط إلى "مرحلة أولى"
  // تحتفظ بكل البيانات كما هي، وتحويل كلمة سر المدير القديمة إلى كلمة سر رئيس الكنترول.
  if (root.students || root.subjects || root.teachers || root.schoolInfo || root.adminPasswordHash) {
    const legacyData = {
      students: root.students || [], subjects: root.subjects || [], grades: root.grades || [],
      classes: root.classes || [], locks: root.locks || {}, meta: root.meta || null,
      teachers: root.teachers || [], schoolInfo: root.schoolInfo || null,
    };
    root.stages.push({
      id: 'stage_' + Date.now(),
      name: (legacyData.schoolInfo && legacyData.schoolInfo.grade) || 'المرحلة الأولى',
      data: legacyData,
    });
    if (root.adminPasswordHash) root.superAdminPasswordHash = root.adminPasswordHash;
    delete root.students; delete root.subjects; delete root.grades; delete root.classes;
    delete root.locks; delete root.meta; delete root.teachers; delete root.schoolInfo; delete root.adminPasswordHash;
    persistRootDB(root);
  }
  if (typeof ensureFixedStages === 'function' && ensureFixedStages(root)) persistRootDB(root);
  _rootDBCache = root;
  return root;

 } catch (e) {
   console.error('getRootDB failed:', e);
   alert('⚠️ حدث خطأ أثناء قراءة قاعدة البيانات الرئيسية.\n' + (e && e.message ? e.message : e));
 }
}

var _cloudDirtyStageIds = Object.create(null);
function markStageCloudDirty(stageId) {
  if (!stageId) return;
  const id = String(stageId);
  _cloudDirtyStageIds[id] = true;
  try {
    if (typeof _rootDBCache !== 'undefined' && _rootDBCache) {
      if (!_rootDBCache._cloudDirtyStageIds || typeof _rootDBCache._cloudDirtyStageIds !== 'object')
        _rootDBCache._cloudDirtyStageIds = {};
      _rootDBCache._cloudDirtyStageIds[id] = true;
    }
  } catch (e) {}
}
function markAllStagesCloudDirty() {
  try { (getRootDB().stages || []).forEach(st => { if (st && st.id) markStageCloudDirty(st.id); }); } catch (e) {}
}
function consumeDirtyStageIds() {
  const ids = Object.keys(_cloudDirtyStageIds);
  _cloudDirtyStageIds = Object.create(null);
  return ids;
}
GSP.markStageCloudDirty = markStageCloudDirty;
GSP.markAllStagesCloudDirty = markAllStagesCloudDirty;
function saveRootDB(root, protectKeys) {
 try {
  if (currentAccountType === 'monitor') return Promise.resolve(false);
  root.lastUpdated = new Date().toISOString();
  if (currentStageId) markStageCloudDirty(currentStageId);
  // STEP 37: persistRootDB is the single durable commit boundary and releases
  // cloud synchronization only after the IndexedDB write succeeds.
  return persistRootDB(root, protectKeys);
 } catch (e) {
   console.error('saveRootDB failed:', e);
   alert('⚠️ حدث خطأ أثناء حفظ قاعدة البيانات الرئيسية.\n' + (e && e.message ? e.message : e));
   return Promise.resolve(false);
 }
}

function replaceCurrentStageDataInMemory(data) {
  if (!currentStageId) return false;
  const root = getRootDB();
  const st = root && (root.stages || []).find(s => s.id === currentStageId);
  if (!st) return false;
  st.data = data;
  if (data && typeof data === 'object') data._gradesIndex = null;
  if (typeof GSP.invalidateCompletionCache === 'function') GSP.invalidateCompletionCache();
  return true;
}
GSP.replaceCurrentStageDataInMemory = replaceCurrentStageDataInMemory;

function getStageRecord(stageId) {
  const root = getRootDB();
  return root.stages.find(s => s.id === stageId) || null;
}

// getDB/saveDB أصبحتا "خاصتين بالمرحلة الحالية" (currentStageId)، وهذا يجعل كل الكود الموجود مسبقاً
// في التطبيق (الذي يستخدم getDB()/saveDB() بافتراض قاعدة بيانات واحدة) يعمل تلقائياً بمعزل تام عن
// باقي المراحل، دون الحاجة لتعديل كل دالة على حدة.
function getDB() {
  if (!currentStageId) return emptyStageData();
  const st = getStageRecord(currentStageId);
  if (!st) return emptyStageData();
  if (!st.data) st.data = emptyStageData();
  return st.data;
}

function canWriteData() {
  return currentAccountType === 'superadmin' || currentAccountType === 'stageadmin' || currentAccountType === 'teacher';
}
GSP.canWriteData = canWriteData;

function saveDB(data, protectKeys) {
  if (currentAccountType === 'monitor') {
    try {
      const t = document.getElementById('autosaveStatus');
      if (t) { t.textContent = '👁️ عرض فقط'; t.className = 'autosave-status autosave-saved'; }
    } catch (e) {}
    return;
  }
  if (!currentStageId) {
    if (currentAccountType) {
      // المستخدم مسجّل الدخول لكن لا توجد مرحلة محددة — أظهر تحذيراً مرئياً
      const existing = document.getElementById('__noStageWarningToast');
      if (!existing) {
        const toast = document.createElement('div');
        toast.id = '__noStageWarningToast';
        toast.style.cssText = 'position:fixed;top:16px;right:50%;transform:translateX(50%);z-index:99999;background:#b91c1c;color:#fff;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,.25);direction:rtl;';
        toast.textContent = '⚠️ لا توجد مرحلة دراسية محددة — لم يتم حفظ البيانات. يرجى اختيار مرحلة أولاً.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
      }
    }
    return;
  }
  const root = getRootDB();
  const st = root.stages.find(s => s.id === currentStageId);
  if (!st) return;
  // إبطال الفهارس والكاش عند أي حفظ حتى لا تُستخدم نتائج قديمة في لوحة التحكم/التحليلات
  if (data && typeof data === 'object') data._gradesIndex = null;
  if (typeof GSP.invalidateCompletionCache === 'function') GSP.invalidateCompletionCache();
  st.data = data;
  st.updatedAt = new Date().toISOString();
  markStageCloudDirty(currentStageId);
  return saveRootDB(root, protectKeys);
}

function loadDB() {
  const db = getDB();
  if (!db.students) db.students = [];
  if (!db.subjects) db.subjects = [];
  if (!db.grades) db.grades = [];
  if (!db.classes) db.classes = [];
  if (!db.teachers) db.teachers = [];
  if (!db.classGrade) db.classGrade = {};
  if (!db.metaByGrade) db.metaByGrade = {};
  // كل خطوة ترقية بيانات قديمة أدناه مُغلَّفة بمحاولة/التقاط: لو كان سجل قديم واحد بصيغة غير
  // متوقعة تسبب توقفاً هنا، فإن ذلك كان يمنع loadDB() بالكامل من إرجاع أي بيانات، وهو ما يكسر كل
  // شاشة تعتمد عليها (الإحصائيات، المعلمين، بيانات المدرسة...) بصمت تام دون أي أثر ظاهر للمستخدم.
  try {
  // ترقية بيانات قديمة (من نسخة كانت تدعم صفاً واحداً فقط لكل مرحلة): إضافة حقل grade لكل طالب،
  // ومعرّف فريد id يجمع بين الصف ورقم الجلوس (لأن رقم الجلوس وحده قد يتكرر بين الصفوف الثلاثة
  // بعد دمجها في نفس المرحلة)، وتحديث studentId في سجلات الدرجات ليطابق المعرّف الجديد.
  let idMigrated = false;
  if ((db.students || []).some(s => !s.id)) {
    const legacyGrade = (db.schoolInfo && db.schoolInfo.grade) || 'الصف';
    db.students.forEach(s => {
      if (!s.grade) s.grade = legacyGrade;
      if (!s.id) s.id = s.grade + '::' + (s.nationalId || ((s.class || 'عام') + '::' + s.seat));
    });
    (db.grades || []).forEach(g => {
      if (typeof g.studentId === 'string' && !g.studentId.includes('::')) g.studentId = legacyGrade + '::' + g.studentId;
    });
    if (!Object.keys(db.classGrade).length) {
      (db.classes || []).forEach(c => { db.classGrade[c] = legacyGrade; });
    }
    if (db.meta && !db.metaByGrade[legacyGrade]) db.metaByGrade[legacyGrade] = db.meta;
    idMigrated = true;
  }
  // ترقية بيانات المعلمين القدامى: كان كل معلم يُخزَّن بمادة واحدة وقائمة فصول واحدة فقط
  // (subjectName/classes/languageType)، والآن يُخزَّن كقائمة "تخصيصات" assignments، كل تخصيص
  // فيه مادة + الفصول الخاصة بها + نوع اللغة إن وُجد. هذا يسمح لنفس المعلم أن يدرّس مادة واحدة
  // لفصل ومادتين لفصل آخر. يتم الترقية تلقائياً مرة واحدة فقط عند أول تحميل بعد التحديث.
  let migrated = false;
  db.teachers.forEach(t => {
    if (!t.assignments) {
      t.assignments = [{
        subjectName: t.subjectName || '',
        classes: t.classes || [],
        languageType: t.languageType || '',
      }];
      delete t.subjectName;
      delete t.classes;
      delete t.languageType;
      migrated = true;
    }
  });
  if (migrated || idMigrated) saveDB(db);

  // ترقية جديدة: إضافة "قسم" (عربي/لغات) لكل طالب وتضمينه في معرّفه الفريد، لضمان الفصل التام
  // بين درجات القسمين حتى لو تشابهت أسماء الصفوف بينهما، ومنع رفع ملف قسم من حذف بيانات القسم
  // الآخر لنفس الصف عن طريق الخطأ. البيانات الموجودة مسبقاً (من قبل هذا التحديث) كانت بالكامل
  // من قسم واحد فعلياً (لم يكن النظام يفصل بينهما بعد)، فنُسنِدها لآخر قسم مختار في بيانات المدرسة.
  let sectionMigrated = false;
  if ((db.students || []).some(s => s.section === undefined)) {
    const legacySection = (db.schoolInfo && db.schoolInfo.classLanguage) || 'arabic';
    db.students.forEach(s => {
      if (s.section === undefined) {
        const oldId = s.id;
        s.section = legacySection;
        const newId = legacySection + '::' + oldId;
        if (oldId !== newId) {
          (db.grades || []).forEach(g => { if (g.studentId === oldId) g.studentId = newId; });
          s.id = newId;
        }
      }
    });
    // ترقية مفاتيح metaByGrade من "اسم الصف فقط" إلى "اسم الصف + القسم" حتى تتوافق مع نفس منطق
    // الفصل الجديد بين الأقسام عند تنزيل نسخة الملف الأصلي المحدَّثة لكل صف.
    const oldMetaByGrade = db.metaByGrade || {};
    const newMetaByGrade = {};
    Object.keys(oldMetaByGrade).forEach(g => {
      const meta = oldMetaByGrade[g];
      const sec = meta.section || legacySection;
      meta.grade = meta.grade || g;
      meta.section = sec;
      newMetaByGrade[g + '§' + sec] = meta;
    });
    db.metaByGrade = newMetaByGrade;

    // ترقية خريطة (فصل ← صف) لتصبح بمفتاح مركّب (اسم الفصل + القسم) بدل اسم الفصل وحده، حتى لا
    // تختلط فصول القسمين لو تشابهت أسماؤها (مثل "١/١" في القسمين معاً).
    const oldClassGrade = db.classGrade || {};
    const newClassGrade = {};
    Object.keys(oldClassGrade).forEach(c => { newClassGrade[classSectionKey(c, legacySection)] = oldClassGrade[c]; });
    db.classGrade = newClassGrade;
    db.classes = [...new Set(Object.keys(db.classGrade))].sort();

    sectionMigrated = true;
  }
  if (sectionMigrated) { db._gradesIndex = null; saveDB(db); }

  // تم إلغاء زرع أي مواد ثابتة مدمجة في النظام: المواد ومكوناتها لم تعد تُحدَّد مسبقاً هنا،
  // بل تُبنى بالكامل وتلقائياً من أول ملف Excel يتم رفعه لكل صف/قسم (عبر buildSubjects عند
  // الاستيراد)، ثم تبقى محفوظة كما هي لتعديلها لاحقاً من تبويب "المواد" فقط. راجع دالة
  // seedCatalogSubjects أدناه إن رغبت مستقبلاً بإعادة تفعيل كتالوج ثابت.
  } catch (e) { console.error('loadDB migration step failed (continuing with unmigrated data):', e); }

  return db;

}

GSP.ROOT_DB_KEY = ROOT_DB_KEY;

// window exports
GSP.emptyStageData = emptyStageData;
GSP._inferStageTypeFromName = _inferStageTypeFromName;
GSP.stageDataWeight = stageDataWeight;
GSP._inferSectionFromName = _inferSectionFromName;
GSP._stageMatchesFixed = _stageMatchesFixed;
GSP._absorbStageData = _absorbStageData;
GSP.ensureFixedStages = ensureFixedStages;
GSP.cleanupDuplicateStages = cleanupDuplicateStages;
GSP.isQuotaError = isQuotaError;
GSP.idbOpen = idbOpen;
GSP.idbGet = idbGet;
GSP.idbSet = idbSet;
GSP.showStorageWarning = showStorageWarning;
GSP.loadRootDBIntoCache = loadRootDBIntoCache;
GSP.persistRootDB = persistRootDB;
GSP.getRootDB = getRootDB;
GSP.markStageCloudDirty = markStageCloudDirty;
GSP.markAllStagesCloudDirty = markAllStagesCloudDirty;
GSP.consumeDirtyStageIds = consumeDirtyStageIds;
GSP.saveRootDB = saveRootDB;
GSP.getStageRecord = getStageRecord;
GSP.getDB = getDB;
GSP.canWriteData = canWriteData;
GSP.saveDB = saveDB;
GSP.loadDB = loadDB;
