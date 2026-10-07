/** auth/supabase-config.js — تهيئة عميل Supabase */
'use strict';

var _config = (GSP.application && GSP.application.services && GSP.application.services.configuration) || GSP.configuration || null;
var SUPABASE_URL = _config ? _config.get('supabaseUrl') : 'https://wbanrokgolirwzuzafws.supabase.co';
var SUPABASE_ANON_KEY = _config ? _config.get('supabasePublishableKey') :
  'sb_publishable_Hd7DBk_HmCJrxJaWaIB_Ow_qanrbSpF';
var supabaseClient = null;
try {
  if (GSP.supabase && GSP.supabase.createClient) {
    supabaseClient = GSP.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage }
    });
  }
} catch (e) { console.error('تعذّر تهيئة اتصال Supabase:', e); }
var cloudAvailable = !!supabaseClient;
GSP.GRADE_SYSTEM_SUPABASE = GSP.GRADE_SYSTEM_SUPABASE || {};
GSP.GRADE_SYSTEM_SUPABASE.url = SUPABASE_URL;
GSP.GRADE_SYSTEM_SUPABASE.publishableKey = SUPABASE_ANON_KEY;


GSP.SUPABASE_URL = SUPABASE_URL;
GSP.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
GSP.supabaseClient = supabaseClient;
GSP.cloudAvailable = cloudAvailable;
