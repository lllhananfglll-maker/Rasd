/** auth/supabase-config.js — تهيئة عميل Supabase */
'use strict';

var _config = (GSP.application && GSP.application.services && GSP.application.services.configuration) || GSP.configuration || null;
var SUPABASE_URL = _config ? _config.get('supabaseUrl') : 'https://wbanrokgolirwzuzafws.supabase.co';
var SUPABASE_ANON_KEY = _config ? _config.get('supabasePublishableKey') : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiYW5yb2tnb2xpcnd6dXphZndzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzODk5NzgsImV4cCI6MjEwNjk2NTk3OH0.jqjilVaSjMGVOJIpM46E4xWFxMuEF0EFAkrkyR-JTMA';
var supabaseClient = null;
try {
  // مكتبة CDN تعرّف supabase عالمياً؛ GSP.supabase قد لا يُعيَّن مسبقاً
  var _sbLib = (GSP.supabase && GSP.supabase.createClient) ? GSP.supabase
    : (typeof supabase !== 'undefined' && supabase && supabase.createClient) ? supabase
    : (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) ? window.supabase
    : null;
  if (_sbLib) {
    GSP.supabase = _sbLib;
    supabaseClient = _sbLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
    });
  } else {
    console.warn('مكتبة Supabase غير محمّلة — الدخول السحابي غير متاح');
  }
} catch (e) {
  console.error('تعذّر تهيئة اتصال Supabase:', e);
}
var cloudAvailable = !!supabaseClient;
GSP.GRADE_SYSTEM_SUPABASE = GSP.GRADE_SYSTEM_SUPABASE || {};
GSP.GRADE_SYSTEM_SUPABASE.url = SUPABASE_URL;
GSP.GRADE_SYSTEM_SUPABASE.publishableKey = SUPABASE_ANON_KEY;
GSP.SUPABASE_URL = SUPABASE_URL;
GSP.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
GSP.supabaseClient = supabaseClient;
GSP.cloudAvailable = cloudAvailable;
